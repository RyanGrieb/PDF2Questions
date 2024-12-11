import os, sys, inspect
from quart import Quart
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.rl_config import defaultPageSize
from reportlab.lib.units import inch
from reportlab.pdfgen.canvas import Canvas
from .async_task import set_task_status
import json

PAGE_HEIGHT = defaultPageSize[1]
PAGE_WIDTH = defaultPageSize[0]
FLASHCARD_SETS_EACH_PAGE = 9
styles = getSampleStyleSheet()


"""
class ExportArgs(NamedTuple):
    server: Quart
    task_id: str
    file_id: str
    md5_name: str
    export_type: str
"""


def myLaterPages(canvas, doc):
    canvas.saveState()
    canvas.setFont("Times-Roman", 9)
    canvas.drawString(inch, 0.75 * inch, "Page %d %s" % (doc.page, "- PDF2Flashcards.com"))
    canvas.restoreState()


def main():
    with open(
        "C:\\Users\\Ryan\\Documents\\Coding\\PDF2Questions\\backend\\data\\pdf-qa\\9aa583f663f566ac9401e0507368987d.txt",
        mode="r",
        encoding="utf-8",
    ) as file:
        qa_sets = []
        curret_qa_set = []
        lines = file.read().splitlines()
        for index, line in enumerate(lines):
            if (line.startswith("Q:") and len(curret_qa_set) > 0) or index >= len(lines) - 1:
                # If were the last element, append it to the current_qa_set before we add the lest set.
                if index >= len(lines) - 1:
                    curret_qa_set.append(line)

                qa_sets.append(list(curret_qa_set))
                curret_qa_set.clear()

            curret_qa_set.append(line)

        print(qa_sets)
    # filename = f"f850a63bfc307a9a2f44293a497052b4.pdf"
    canvas = Canvas("./backend/data/exports/doc.pdf")
    styleSheet = getSampleStyleSheet()
    style = styleSheet["BodyText"]

    availableWidth = PAGE_WIDTH - 40
    availableHeight = PAGE_HEIGHT - 20
    # y_axis = availableHeight
    last_answer_y = 0

    for set in qa_sets:
        question = set[0]
        answers = set[1:]

        question_paragraph = Paragraph(question, style)

        width, question_height = question_paragraph.wrap(availableWidth, availableHeight)

        if availableHeight - question_height <= 40:
            canvas.showPage()
            availableHeight = PAGE_HEIGHT - 20

        # print(f"w: {width}, h: {question_height}")

        canvas.line(0, availableHeight, PAGE_WIDTH, availableHeight)
        availableHeight -= question_height
        question_paragraph.drawOn(canvas, 20, availableHeight)

        for answer in answers:
            answer_paragraph = Paragraph(answer, style)
            width, answer_height = answer_paragraph.wrap(availableWidth, availableHeight)
            answer_paragraph.drawOn(canvas, 20, availableHeight - (answer_height))
            last_answer_y = availableHeight - (answer_height) - 10
            availableHeight -= answer_height + 20
        # index += 1
        # if index > 2:
        #    break

    canvas.save()


if __name__ == "__main__":
    main()


def pdf_draw_flashcard_lines(canvas: Canvas):
    # Draw vertical line down the page.
    canvas.line(PAGE_WIDTH / 2, 0, PAGE_WIDTH / 2, PAGE_HEIGHT)
    # Based on how many question/answer sets we want, draw our respective lines
    for i in range(0, FLASHCARD_SETS_EACH_PAGE):
        y_offset = i * (PAGE_HEIGHT / (FLASHCARD_SETS_EACH_PAGE - 1))
        # Draw horizontal lines across the page
        canvas.setDash(3, 3)  # Ensure these horizontal lines are dashed
        canvas.line(0, y_offset, PAGE_WIDTH, y_offset)


def export_flashcard_as_pdf(server: Quart, file_id: str, md5_name: str, flashcard_sets):
    """
    Generates a pdf file of all Q&A sets from the provided files.
    """
    canvas = Canvas(f"./data/exports/{file_id}.pdf")
    styleSheet = getSampleStyleSheet()
    style = styleSheet["BodyText"]

    qa_sets = get_flashcard_sets(server, md5_name, flashcard_sets)

    pdf_draw_flashcard_lines(canvas)

    section_height = PAGE_HEIGHT / (FLASHCARD_SETS_EACH_PAGE - 1)

    i = 0
    for set in qa_sets:
        y_offset = PAGE_HEIGHT - i * section_height

        if y_offset <= 0:
            # print("new page", file=sys.stderr)
            canvas.showPage()
            pdf_draw_flashcard_lines(canvas)
            i = 0
            y_offset = PAGE_HEIGHT - i * section_height

        # print(f"y offset: {y_offset}", file=sys.stderr)
        print(f"export set {set}", file=sys.stderr)
        question = set[0]
        answers = set[1:]

        # Draw question text
        question_paragraph = Paragraph(question, style)
        _, question_height = question_paragraph.wrap(PAGE_WIDTH / 2 - 20, PAGE_HEIGHT)
        question_paragraph.drawOn(canvas, 10, y_offset - section_height / 2 - question_height / 2)

        # print(f"{question} at y: {y_offset - section_height / 2 - question_height / 2}", file=sys.stderr)

        # Draw answer text
        for answer in answers:
            answer_paragraph = Paragraph(answer, style)
            _, answer_height = answer_paragraph.wrap(PAGE_WIDTH / 2 - 20, PAGE_HEIGHT)
            answer_paragraph.drawOn(canvas, PAGE_WIDTH / 2 + 10, y_offset - section_height / 2 - answer_height / 2)

        # Increment y section.
        i += 1

    canvas.save()
    return True


def export_flashcard_as_anki(server, file_id, md5_name, flashcard_sets):
    None


def export_flashcard(server: Quart, task_id, file_id, md5_name, export_type, flashcard_sets):
    """
    Chooses & runs export_flashcard_as_??? function based on export_type
    """
    if len(flashcard_sets) <= 0:
        set_task_status(task_id, "error")
        return

    # FIXME: Check if export_type doesn't exist, and return false if so

    # Create the export folder if needed
    if not os.path.exists(server.config["EXPORT_FOLDER"]):
        os.makedirs(server.config["EXPORT_FOLDER"])

    function_dict = {"anki": export_flashcard_as_anki, "pdf": export_flashcard_as_pdf}

    if function_dict[export_type](server, file_id, md5_name, flashcard_sets):
        set_task_status(task_id, "completed")
    else:
        set_task_status(task_id, "error")


def get_flashcard_sets(server: Quart, md5_name: str, flashcard_sets: list[int]) -> list[str]:
    """
    Loads the Q&A sets from a file and returns it as a variable.
    """
    qa_sets = []
    with open(f'{server.config["PROCESSED_FOLDER"]}/{md5_name}.json', "r") as file:
        flashcard_sets_json = json.load(file)["flashcards"]["data"]
        qa_sets = [
            flashcard_set_json
            for index, flashcard_set_json in enumerate(flashcard_sets_json)
            if index in flashcard_sets
        ]
    return qa_sets
