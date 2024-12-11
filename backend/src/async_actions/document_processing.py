import json
from quart import Quart
import sys
import os
import aiohttp
import asyncio
import openai
import logging
import traceback
from werkzeug.datastructures import FileStorage
from pptx import Presentation
import pypdf

from .. import file_utils

from .async_task import (
    set_task_status,
    set_task_progress,
    set_task_attribute,
)

import re
from filelock import FileLock

GPT_MODEL = "gpt-3.5-turbo-1106"
running_unstructured_processes = 0


def get_pdf_pages(file: FileStorage):
    pdf_reader = pypdf.PdfReader(file)
    return len(pdf_reader.pages)


def get_pptx_pages(file: FileStorage) -> int:
    try:
        pptx_file = Presentation(file)
        return len(pptx_file.slides)
    except Exception as e:
        print(f"Error: {e}")
        return 0


async def async_document2json(
    server: Quart,
    filename: str,
    md5_name: str,
    extension_type: str,
    task_id: str,
    ip_address: str,
):
    global running_unstructured_processes

    logger: logging.Logger = get_logger_for_file(server, md5_name)
    process_limit = server.config["CONCURRENT_TEXT_PROCESS_LIMIT"]
    try:
        # Check if the variables are received correctly
        logger.info("Function: async_document2json")
        print(f"Uploader: {ip_address}", file=sys.stderr)
        # logger.debug(f"Uploader: {ip_address}")
        logger.debug(f"Received filename: {filename}")
        logger.debug(f"Received md5_name: {md5_name}")

        document_file_path = f'{server.config["UPLOAD_FOLDER"]}/{md5_name}.{extension_type}'
        json_file_path = f'{server.config["JSON_FOLDER"]}/{md5_name}.json'

        # Check if the pptx file exists, if not return and set the task status to 'error':
        if not os.path.isfile(document_file_path):
            logger.debug(f"Error: file does not exist: {document_file_path}")
            set_task_status(task_id, "error")
            set_task_attribute(
                task_id,
                "error_msg",
                "Error: Unable to find uploaded file. Try uploading the file again.",
            )
            set_task_attribute(task_id, "error_type", "no_file")
            return

        # Check if file already exists, if so, set the task status as completed:
        if os.path.isfile(json_file_path):
            logger.debug(f"JSON already exists for {filename}, returning...")
            set_task_status(task_id, "completed")
            return

        form_data = aiohttp.FormData()
        form_data.add_field("files", open(document_file_path, "rb"))
        form_data.add_field("encoding", "utf_8")
        form_data.add_field("include_page_breaks", "true")  # FIXME: Not needed?
        form_data.add_field("coordinates", "false")
        form_data.add_field("strategy", "fast")
        # form_data.add_field("hi_res_model_name", "detectron2_onnx")

        headers = {"accept": "application/json"}

        # Wait until process_limit goes back down
        while running_unstructured_processes >= process_limit:
            await asyncio.sleep(1)

        running_unstructured_processes += 1

        async with aiohttp.ClientSession() as session:
            async with session.post(server.config["UNSTRUCTUED_API_URL"], headers=headers, data=form_data) as response:
                if response.status == 200:
                    response_text = await response.text()
                    # TODO: Implement a keep-alive loop & cancel these post requests if terminated.
                    # FIXME: Handle any errors thrown by unstructured api.

                    # Create /pdf-json directory if it doesn't exist.
                    if not os.path.exists(server.config["JSON_FOLDER"]):
                        os.makedirs(server.config["JSON_FOLDER"])

                    with open(f'{server.config["JSON_FOLDER"]}/{md5_name}.json', "w") as file:
                        file.write(response_text)
                        set_task_status(task_id, "completed")
                        running_unstructured_processes -= 1
                else:
                    await asyncio.sleep(1)
                    logger.error(response.text)
                    print(response.text, file=sys.stderr)
                    set_task_status(task_id, "error")
                    running_unstructured_processes -= 1

    except Exception as e:
        # Handle exceptions or errors here
        print("Error:", str(e), file=sys.stderr)
        logger.error(str(e))
        logger.error(traceback.format_exc())
        set_task_status(task_id, "error")


def merge_qa_lines(qa_sets: list[str]):
    """
    Sometimes we have newlines after Q: or A: because GPT is fucking stupid. Here we just merge them onto Q: or A: depending on the line.
    Every line should be Q:, then A:, then Q: then A: ect... If not, merge the line into the question or answer.
    """
    merged_list = []

    current_line = None  # FIXME: We assume that our qa_set beings with a question. Could break shit if it's not.
    current_question = None
    current_answer = None

    for line in qa_sets:
        if line.startswith("Q:"):
            current_line = "q"
            current_question = line
            # append the previous answer (A:) to merged_list
            if current_answer:
                merged_list.append(current_answer)
        elif line.startswith("A:"):
            current_line = "a"
            current_answer = line
            # append the previous answer (Q:) to merged_list
            if current_question:
                merged_list.append(current_question)
        else:
            # If we are a separate line, we need to merge into our current_line
            if current_line == "q":
                current_question += f" {line}"
            elif current_line == "a":
                current_answer += f" {line}"

    # Append the last answer to merged_list
    merged_list.append(current_answer)

    return merged_list


def text_has_table_expression(text):
    """
    Check if the text has the pattern: 'Table xx.xx'.
    """
    pattern = r"Table \d+\.\d+"
    return bool(re.search(pattern, text))


def text_has_multiple_choice(text: str) -> bool:
    """
    Check if text has A) B) C) D) options
    """
    open_p_count = 0
    # FIXME: Check letter prefix.
    for i in range(0, len(text)):
        character = text[i]
        if character == "(":
            open_p_count += 1
        if character == ")":
            open_p_count -= 1

    return open_p_count < 0


def get_logger_for_file(server: Quart, md5_name: str) -> logging.Logger:
    if not os.path.exists(server.config["LOG_FOLDER"]):
        os.makedirs(server.config["LOG_FOLDER"])

    formatter = logging.Formatter("%(asctime)s | %(levelname)s | %(message)s")

    logger_file = logging.FileHandler(f'{server.config["LOG_FOLDER"]}/{md5_name}.txt')
    logger_file.setLevel(logging.DEBUG)
    logger_file.setFormatter(formatter)

    logger = logging.getLogger("pdf-logs")
    new_logger = False
    if logger.hasHandlers():
        logger.handlers.clear()
    else:
        new_logger = True

    logger.setLevel(logging.DEBUG)
    logger.addHandler(logger_file)

    if new_logger:
        logger.info("================================= BEGINNING OF LOGGING SESSION =================================")

    return logger


def json2gpt_input(server: Quart, md5_name: str):
    """
    Converts the unformatted unstructured-io JSON to a list of strings to input into chat-gpt. These strings are split by
    pages, and max_input_length if the pages' text is too big.
    """
    min_input_length = 500
    max_input_length = 1096
    text_list = []
    logger: logging.Logger = get_logger_for_file(server, md5_name)
    logger.info("Function: json2gpt_input")

    with open(f'{server.config["JSON_FOLDER"]}/{md5_name}.json', "r") as file:
        json_data = json.load(file)

        for json_element in json_data:
            text = json_element.get("text")

            if not text or len(text) < 1:
                continue

            # Merge the text if it's length is < min_input_length. (But make sure we don't exceed max_input_length either!)
            # Merge the text if its length is < min_input_length, but don't exceed max_input_length
            if len(text) < min_input_length:
                if text_list and len(text_list[-1]) + len(text) <= max_input_length:
                    # Merge with the last item in text_list if it doesn't exceed max_input_length
                    text_list[-1] += f" {text}"
                else:
                    # Add as a separate item if merging would exceed max_input_length
                    text_list.append(text)
            else:
                # Break the text apart into new strings until each new text segment is < max_input_length
                if len(text) > max_input_length:
                    while len(text) > max_input_length:
                        text_list.append(text[:max_input_length])
                        text = text[max_input_length:]
                text_list.append(text)

    return text_list


# Get tokens from pdf elements and merge them onto a single line.
def merge_pdf_json_elements(elements):
    # List of all elements with an expanded bounding box.
    formatted_text = ""
    for element in elements:
        text = element["text"]
        if text[0].isupper():
            formatted_text += f"\n{text}"  # FIXME: Dont add newline if this is our first element on the page!
        else:
            formatted_text += f"{text} "

    return formatted_text.rstrip()


async def gpt_generate_test_questions(server, md5_name, data, conversion_options: dict):
    logger: logging.Logger = get_logger_for_file(server, md5_name)
    logger.info("Function: gpt_generate_test_questions")

    # print(f"*********************** Generate Test Questions from text chunk:\n{data}")
    logger.debug(f"*********************** Generate Test Questions from text chunk:\n{data}")

    prompt_values = {
        "test_multiple_choice": "Multiple Choice (Include letter options in questions or DEATH happens!!!). Multiple Choice Strict Format Example:\nWhich of the following is not a primary color? A) Red B) Yellow C) Green D) Purple -- Answer: D) Purple",
        "test_true_false": "True/False Questions",
        "test_free_response": "Free Response",
    }

    prompt_options = ""
    for index, conversion_option in enumerate(conversion_options["test"]):
        prompt_options += f"{prompt_values[conversion_option]}\n"

    prompt = f"Create a very large amount test/quiz questions from data using the following question type(s):\n{prompt_options}\nYour responses should strictly follow this format:\n** [question_type] -- Question: [question] -- Answer: [answer]\nThe provided data is as follows:\n{data}"

    response = await openai.ChatCompletion.acreate(
        model=GPT_MODEL,
        messages=[
            # {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": prompt},
        ],
        temperature=0,
    )
    response_data: str = response["choices"][0]["message"]["content"]
    # print(response_data, file=sys.stderr)

    test_questions = response_data.split("\n")
    # Remove empty lines
    test_questions = [test_question for test_question in test_questions if test_question != ""]

    new_test_questions = []
    existing_questions = []
    existing_answers = []

    # FIXME: Respones can be in like respeonse-scenario-a.txt, account for that before splitting our questions here.#
    # Solution: Correct the formatting such that the code below works as intended.
    # question = split_question[1].strip() throws an out of bound error in this scenario.

    for test_question in test_questions:
        # print(f"TEST QUESTION: {test_question}", file=sys.stderr)
        split_question = test_question.split("--")
        question_type = split_question[0].split("**", 1)[1].strip()
        question = split_question[1].strip()
        answer = split_question[2].strip()

        # Edgecase: Remove trailing ** if it exists. It's an artifact from GPT.
        if answer.endswith("**"):
            answer = answer.rstrip("*")

        if question_type.endswith("**"):
            question_type = question_type.rstrip("*")

        if question in existing_questions or answer in existing_answers:
            continue

        # Edgecase: Remove example Q&A if present, it somtimes gets generated by the GPT prompt.
        if "a primary color" in question:
            continue

        # Edgecase: If the question references a table (e.g. Table 4.12), remove it since we cant see it.
        # FIXME: Somehow get a screenshot of the table in the future?
        if text_has_table_expression(question):
            continue

        # Edgecase: Correct question_type if answer is of true false, yet question_type is multiple choice.
        if (answer == "Answer: False" or answer == "Answer: True") and "Multiple Choice" in question_type:
            if not text_has_multiple_choice(question):
                question_type = "True/False"

        # Edgecase: Include letter options for True/False if not present.
        if "True/False" in question_type and "A) True" not in question:
            question += "\nA) True\nB) False"
            if "True" in answer:
                answer = "Answer: A) True"
            elif "False" in answer:
                answer = "Answer: B) False"

        # Edgecase: Add newline fomatting for multiple choice questions after each letter option
        if "Multiple Choice" in question_type:
            string_list = list(question)
            string_list_copy = list(string_list)
            opened_p_count = 0
            added_characters = 0
            for i in range(0, len(string_list_copy)):
                character = string_list_copy[i]

                if character == "(":
                    opened_p_count += 1

                if character == ")" and opened_p_count <= 0:
                    string_list.insert(i - 1 + added_characters, "\n")
                    added_characters += 1
                elif character == ")" and opened_p_count > 0:
                    opened_p_count -= 1

            question = "".join(string_list)

        # Edgecase: Remove 'Question:' 'Answer:' substrings - They can be implemented clientside.
        question = question.replace("Question: ", "", 1)
        answer = answer.replace("Answer: ", "", 1)

        new_test_questions.append([question_type, question, answer])
        existing_questions.append(question)
        existing_answers.append(answer)

    return new_test_questions


async def gpt_generate_definitions(server, md5_name, data, conversion_options: dict):
    logger: logging.Logger = get_logger_for_file(server, md5_name)
    logger.info("Function: gpt_generate_definitions")

    # print(f"*********************** Generate Definitions from text chunk:\n{data}")
    logger.debug(f"*********************** Generate Definitions from text chunk:\n{data}")

    prompt = f"Please analyze the data and provide 'keyword: definition' pairs relevant for study. Your responses should strictly follow this format without numbering:\nKeyword: Definition\nDo NOT include the words 'Keyword' or 'Definition' in the output. The provided data is as follows:\n{data}"

    response = await openai.ChatCompletion.acreate(
        model=GPT_MODEL,
        messages=[
            # {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": prompt},
        ],
        temperature=0,
    )
    response_data: str = response["choices"][0]["message"]["content"]
    definition_pairs = response_data.split("\n")
    definition_pairs = [definition for definition in definition_pairs if definition != ""]

    new_definition_pairs = []
    existing_definitions = []
    existing_keywords = []

    for definition_pair in definition_pairs:
        if ":" not in definition_pair:
            continue
        keyword = definition_pair.split(":", 1)[0].strip()
        definition = definition_pair.split(":", 1)[1].strip()

        if keyword in existing_keywords or definition in existing_definitions:
            continue

        # Edgecase: If definition references a table (e.g. Table 4.12), remove it since we can't see it.
        if text_has_table_expression(definition):
            continue

        existing_definitions.append(definition)
        existing_keywords.append(keyword)
        new_definition_pairs.append([keyword, definition])
        # print(f"Keyword: '{keyword}' - Definition: '{definition}'", file=sys.stderr)

    definition_pairs = new_definition_pairs

    return definition_pairs


async def gpt_generate_qa(server, md5_name, data, conversion_options: dict):
    async def reprocess_response(response_data):
        prompt = f"Fill any empty answer (A:) with a correct answer to the question (Q:) above. Your output is *REQUIRED!!!!* include the QUESTION (Q:) AND ANSWER (A:) or everyone dies. Here is the data to process: {response_data}"

        response = await openai.ChatCompletion.acreate(
            model=GPT_MODEL,
            messages=[
                # {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": prompt},
            ],
            temperature=0,
        )
        response_data: str = response["choices"][0]["message"]["content"]
        logger.debug("***************!!!! REPROCESSING: ")
        logger.debug(response_data)
        # Edgecase: Sometimes GPT returns Q&A set with [NEWLINE] instead of '\n'. Handle it accordingly.
        response_data = response_data.replace("[NEWLINE]", "\n")
        return response_data

    logger: logging.Logger = get_logger_for_file(server, md5_name)
    logger.info("Function: gpt_generate_qa")

    # print(f"*********************** Generate Q&A from text chunk:\n{data}")
    logger.debug(f"*********************** Generate Q&A from text chunk:\n{data}")

    prompt = f"Generate brief, 'brain-friendly' Q&A flashcards from the provided data.\nYou are required to respond with: 'Q: ... [NEWLINE] A: ...'\nHere is the provided data:\n{data}"

    response = await openai.ChatCompletion.acreate(
        model=GPT_MODEL,
        messages=[
            # {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": prompt},
        ],
        temperature=0,
    )
    response_data: str = response["choices"][0]["message"]["content"]

    # Edgecase: Sometimes GPT returns Q&A set with [NEWLINE] instead of '\n'. Handle it accordingly.
    response_data = response_data.replace("[NEWLINE]", "\n")

    # print("*********************** GPT Q&A RESPONSE DATA:")
    logger.debug("*********************** GPT Q&A RESPONSE DATA:")

    # print(response_data)
    logger.debug(response_data)

    # response_data = await reprocess_response(response_data)

    # Edgecase: ??? Forgot. my bad.
    if "Q2A: None" in response_data:
        return None

    print(response_data, file=sys.stderr)
    # Create out q&a sets by splitting newlines
    qa_sets = response_data.split("\n")

    # Remove any empty lines & strip whitespace.
    qa_sets = [qa_set.strip() for qa_set in qa_sets if qa_set.strip() != ""]

    # Edgecase: Some question/answer responses may have newlines, merge them into the same line
    qa_sets = merge_qa_lines(qa_sets)

    if len(qa_sets) <= 0 or qa_sets[0] is None:
        return []

    print(qa_sets, file=sys.stderr)

    if len(qa_sets) % 2 != 0:
        print(
            "!!! WARNING: UNEVEN Q&A RESPONSE (mssing q or a, or additional output.)!!!",
            file=sys.stderr,
        )
        logger.warn("UNEVEN Q&A RESPONSE (mssing q or a)!!")
        logger.info("QA-SETS: ")
        logger.info(qa_sets)

    # Remove any lines not containing Q: or A:.
    qa_sets = [line for line in qa_sets if "Q:" in line or "A:" in line]

    # Remove duplicate Q&A in list (Q & A Must both be the same between duplicate pairs)
    new_qa_sets = []
    existing_questions = []
    existing_answers = []

    for i in range(0, len(qa_sets), 2):
        question = qa_sets[i]
        answer = qa_sets[i + 1]

        # We have a duplicate, remove it! (By not appending anything!)
        if question in existing_questions and answer in existing_answers:
            continue

        # Edgecase: If the question references a table (e.g. Table 4.12), remove it since we cant see it.
        # FIXME: Somehow get a screenshot of the table in the future?
        if text_has_table_expression(question):
            continue

        # Edgecase: Remove any 'Q: ' 'A: ' substrings. We want to append these client-side.
        question = question.replace("Q: ", "")
        answer = answer.replace("A: ", "")

        new_qa_sets.append([question, answer])
        existing_questions.append(question)
        existing_answers.append(answer)

    qa_sets = new_qa_sets

    # Return a list with a nested list of two elements (Q/A)
    return qa_sets


async def async_json2convert_type(
    server: Quart, convert_type: str, conversion_options: dict, filename: str, md5_name: str, task_id: str
):
    gpt_generate_functions = {
        "flashcards": gpt_generate_qa,
        "keywords": gpt_generate_definitions,
        "test": gpt_generate_test_questions,
    }
    logger: logging.Logger = get_logger_for_file(server, md5_name)
    logger.info(f"Function: async_json2convert_type ({convert_type})")

    # Create directory if it doesn't exist.
    os.makedirs(server.config["PROCESSED_FOLDER"], exist_ok=True)
    processed_file = f'{server.config["PROCESSED_FOLDER"]}/{md5_name}.json'

    with FileLock(f"{processed_file}.lock"):
        # Check if file already exists and q&a for it was generated, if so, set the task status as completed
        if os.path.isfile(processed_file):
            with open(processed_file, "r") as file:
                if convert_type in json.load(file):
                    logger.debug(f"{convert_type} already exists for {filename}, returning...")
                    set_task_status(task_id, "completed")
                    return

    text_list = json2gpt_input(server, md5_name)

    logger.debug("JSON text (converted from JSON): ")
    logger.debug(text_list)

    generated_sets = []
    for index, text_chunk in enumerate(text_list):
        set = await gpt_generate_functions[convert_type](server, md5_name, text_chunk, conversion_options)
        if set is None:
            continue
        generated_sets = generated_sets + set
        set_task_progress(task_id, float(index + 1) / float(len(text_list)))

    append_json_value_to_file(
        processed_file,
        convert_type,
        {"data": generated_sets},
    )

    # Update the file's metadata & specify our generated data_length
    metadata_file_path = os.path.join(server.config["METADATA_FOLDER"], f"{md5_name}.json")
    file_utils.append_file_json_value(metadata_file_path, "data_lengths", {convert_type: len(generated_sets)})

    set_task_status(task_id, "completed")
    logger.debug(f"{convert_type} Generation Successful.")


def append_json_value_to_file(filename: str, key: str, value: object):
    processed_json = {}

    with FileLock(f"{filename}.lock"):
        if os.path.isfile(filename):
            with open(filename, "r") as file:
                processed_json = json.load(file)

        processed_json[key] = value

        # Save Q&A set to filesystem
        with open(filename, "w") as file:
            json.dump(processed_json, file)
