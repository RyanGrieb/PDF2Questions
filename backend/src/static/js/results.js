class FileData {
  constructor(filename, md5_name, conversion_types, conversion_options) {
    this.filename = filename;
    this.md5_name = md5_name;
    this.conversion_types = conversion_types;
    this.conversion_options = conversion_options; //Dictonary
    this.data = {};
    this.data_lengths = {};
    this.error_msg = undefined;
  }
}

let selected_document = undefined;
let md5_files = [];
let files_data = {};
let progress_bars = {};

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

function inform_limited_data_output(results_output, conversion_type, file_data) {
  const total_data_length = file_data.data_lengths[conversion_type];
  const data_length = file_data.data[conversion_type].length;
  if (data_length < total_data_length) {
    const show_more_region = document.createElement("div");
    show_more_region.classList.add("show-more-region");
    const prompt_text = document.createElement("h2");
    prompt_text.classList.add("center-text");
    const unlock_button = document.createElement("button");

    switch (user_type) {
      case "guest":
        prompt_text.innerHTML = `Guests are limited to view 5 results. <a href='/register'>Register</a> to view more of <b>${total_data_length}</b> results.`;
        break;
      case "free":
        prompt_text.innerHTML = `Free accounts limited to view 10 results. <a href='add-payment'>Upgrade</a> to view all <b>${total_data_length}</b> results.`;
        break;

      case "paid":
        const remaining_items = total_data_length - data_length;
        const cost = parseFloat(single_item_cost * remaining_items).toFixed(2);
        prompt_text.innerHTML = `Unlock ${remaining_items} remaining results for $${cost}.`;

        unlock_button.classList.add("button-1", "unlock-button");
        unlock_button.textContent = "Unlock";
        unlock_button.onclick = () =>
          prompt_unlock_file(results_output, conversion_type, file_data, cost, remaining_items);
        break;
    }

    show_more_region.appendChild(prompt_text);

    show_more_region.appendChild(unlock_button);
    results_output.appendChild(show_more_region);
  }
}

async function prompt_unlock_file(results_output, conversion_type, file_data, cost, remaining_items) {
  const response = await fetch("/prompt");
  const prompt_html = await response.text();
  const prompt_container = document.createElement("div");
  prompt_container.id = "prompt-unlock-file";

  prompt_container.innerHTML = prompt_html;
  document.body.appendChild(prompt_container);

  const prompt_message = document.querySelector(".prompt-message");
  prompt_message.innerHTML = `It will cost <b>$${cost}</b> to view <b>${remaining_items}</b> remaining results. Do you want to continue?`;

  const prompt_confirm_btn = document.querySelector(".prompt-confirm-btn");
  const prompt_cancel_btn = document.querySelector(".prompt-cancel-btn");

  prompt_confirm_btn.onclick = () => {
    unlock_file(results_output, conversion_type, file_data);
  };

  prompt_cancel_btn.onclick = () => {
    document.body.removeChild(prompt_container);
  };
}

async function unlock_file(results_output, conversion_type, file_data) {
  const formData = new FormData();
  formData.append("filename", file_data.filename);
  formData.append("md5_name", file_data.md5_name);
  formData.append("conversion_type", conversion_type);

  // Send a POST request to the server and wait for the response
  const response = await fetch("/unlockfile", {
    method: "POST",
    body: formData,
  });
  console.log(response);

  if (response.ok) {
    const responseData = await response.json();
    console.log(responseData);
    // Just do another GET request by calling get_converted_file or something
    await get_converted_file(file_data, conversion_type);
    await display_file_data(file_data.filename, file_data.md5_name, conversion_type);
    document.body.removeChild(document.getElementById("prompt-unlock-file"));
  }
}

async function display_file_data(filename, md5_name, conversion_type) {
  const file_data = files_data[md5_name];
  const results_output = document.querySelector(".results-output");

  if (!file_data) {
    return;
  }

  results_output.innerHTML = "";

  const title_elem = document.querySelector(".document-title");

  // Display error message to user if present.
  if (file_data.error_msg != undefined) {
    title_elem.innerHTML = `Error processing ${filename}`;

    const error_elem = document.createElement("p");
    error_elem.innerHTML = file_data.error_msg;
    results_output.appendChild(error_elem);
    return;
  }

  const results_data_div = document.createElement("div");
  results_data_div.classList.add("results-data");

  if (conversion_type == "test") {
    title_elem.innerHTML = `${filename} Test/Quiz Questions:`;

    inform_limited_data_output(results_output, conversion_type, file_data);
    // Construct Test Question/Answer pairs
    for (const [index, test_question_set] of file_data.data[conversion_type].entries()) {
      const p_element = document.createElement("p");
      p_element.className = "output-text";
      const question = test_question_set[1].replaceAll("\n", "<br>");
      const answer = test_question_set[2];
      p_element.innerHTML = `<b>${index + 1}.</b> ${question}<br><br>${answer}`;
      results_data_div.appendChild(p_element);
    }
    results_output.appendChild(results_data_div);
  }

  if (conversion_type == "keywords") {
    title_elem.innerHTML = `${filename} Keyword/Definition Pair:`;

    inform_limited_data_output(results_output, conversion_type, file_data);

    // Construct Keyword/Definition pairs

    for (const keyword_set of file_data.data[conversion_type]) {
      const p_element = document.createElement("p");
      p_element.className = "output-text";
      p_element.innerHTML = `<u>${keyword_set[0]}</u>: ${keyword_set[1]}`;
      results_data_div.appendChild(p_element);
    }
    results_output.appendChild(results_data_div);
  }

  if (conversion_type == "flashcards") {
    title_elem.innerHTML = `${filename} Flashcard Set:`;

    try {
      // Fetch the flashcard HTML
      const response = await fetch("/flashcard"); // Update with the correct endpoint

      if (!response.ok) {
        throw new Error("Network response was not ok");
      }

      const flashcardHTML = await response.text();

      // Append the fetched flashcard HTML to qaSetDiv
      const flashcardDiv = document.createElement("div");
      flashcardDiv.style = "display: flex; justify-content: center;";
      flashcardDiv.innerHTML = flashcardHTML;
      results_output.appendChild(flashcardDiv);
      set_flashcard(file_data, 0, 0);

      // FIXME: Make this a method so we can use it for tests & keyword-definition pairs.
      // Inform user they can increase the amount of flashcards viewed, if applicable:
      inform_limited_data_output(results_output, conversion_type, file_data);

      // Construct Q&A sets
      for (const qa_set of file_data.data["flashcards"]) {
        const p_element = document.createElement("p");
        p_element.className = "output-text";
        p_element.innerHTML = `<b>${qa_set[0]}</b> <br><br> ${qa_set[1]}`;
        results_data_div.appendChild(p_element);
      }

      results_output.appendChild(results_data_div);
    } catch (error) {
      console.error("There was a problem fetching the flashcard HTML:", error);
    }
  }
}

function set_flashcard(file_data, side, page) {
  // Set flashcard title
  const flashcard_text = file_data.data["flashcards"][page][side];
  const total_pages = file_data.data_lengths["flashcards"];
  document.querySelector(".flashcard-text p").innerHTML = flashcard_text;
  // Set flashcard page
  document.querySelector(".flashcard-count p").innerHTML = `${page + 1} / ${total_pages}`;
  // Map buttons to naviagate pages, if not defined already.
  document.querySelector(".flashcard-forward").onclick = () => {
    set_flashcard(file_data, 0, Math.min(page + 1, total_pages - 1));
  };
  document.querySelector(".flashcard-back").onclick = () => {
    set_flashcard(file_data, 0, Math.max(page - 1, 0));
  };
  document.querySelector(".flashcard-flip").onclick = () => {
    set_flashcard(file_data, side == 0 ? 1 : 0, page);
  };
}

function get_logs(md5_name) {
  console.log("Getting logs for " + md5_name);
  window.open(`/logs/${md5_name}`);
}
/*
function add_qa_set_to_page(filename, md5_name, qa_set, final_generation = false) {
  const qaSetDiv = document.querySelector(`#qa-set-${md5_name}`);

  document.querySelector(".status-text").innerHTML = "Generated Q&As:";

  // FIXME: JUST PUT A \n before each Q: element. (except the 1st one)
  qa_set.split("\n").forEach((line, index) => {
    const paragraph = document.createElement("p");

    // Add newline space between each Q&A set
    if (index != 0 && index % 2 == 0) {
      //qaSetDiv.appendChild(document.createElement("br"))
    }

    paragraph.innerHTML = line;
    qaSetDiv.appendChild(paragraph);
  });
}*/

// Updates the HTML from the get request. Returns 'ok' if successful or 'error_type' if error occurs.
async function get_converted_file(file_data, conversion_type) {
  console.log("Fetch generated file set from server:");
  console.log(file_data);

  const params = new URLSearchParams({
    filename: file_data.filename,
    md5_name: file_data.md5_name,
    conversion_type: conversion_type,
  });
  const url = `/convertfile/?${params}`;
  console.log(url);
  const response = await fetch(url, {
    method: "GET",
  });

  if (response.ok) {
    // Print the plaintext string here:
    let json_data = JSON.parse(await response.text());
    console.log(json_data);
    file_data.data[conversion_type] = json_data.data;
    file_data.data_lengths[conversion_type] = json_data.data_length;
    set_file_status(file_data.md5_name, conversion_type, "checkmark-done");

    return "ok";
  } else {
    // Extract error type from JSON response
    let error_data = await response.json();
    console.log(error_data);
    return error_data.error_type;
  }
}

// Convert the file to flashcards, keyword/definition, test questions, ect.
async function post_convert_file(file_data, conversion_type, conversion_options, completeCallback, errorCallback) {
  console.log("POST: Convert file to:" + conversion_type);

  try {
    // Create a FormData object to send data with the POST request
    const formData = new FormData();
    formData.append("filename", file_data.filename);
    formData.append("md5_name", file_data.md5_name);
    formData.append("conversion_type", conversion_type);
    formData.append("conversion_options", JSON.stringify(conversion_options));

    // Send a POST request to the server and wait for the response
    const response = await fetch("/convertfile", {
      method: "POST",
      body: formData,
    });
    console.log(response);

    if (response.ok) {
      const responseData = await response.json();
      console.log(responseData);
      const task_id = responseData.task_id;

      start_check_task_interval(
        task_id,
        () => completeCallback(task_id),
        (status_data) => {
          // Interval Callback - Called after every n seconds when checking for the task.
          //The status_data can be empty if we reload the server while we do this request. Just reload the page.
          if (Object.keys(status_data).length === 0) {
            location.reload();
            return;
          }

          if (status_data.attributes.convert_type != "text") {
            if (status_data.attributes && status_data.attributes.md5_name && status_data.attributes.convert_type) {
              const value = Math.min(0.2 + status_data.progress, 0.95);
              set_file_progress(status_data.attributes.md5_name, status_data.attributes.convert_type, value);
            }
          }
        },
        () => errorCallback(task_id),
      );
    } else {
      // Handle network or other errors here
      console.error(`Error sending ${file_data.filename} to the server: ${error}`);
    }
  } catch (error) {
    // Handle network or other errors here
    console.error(`Error sending ${file_data.filename} to the server: ${error}`);
  }
}

function set_file_progress(md5_name, conversion_type, value) {
  const key = `${md5_name}-${conversion_type}`;
  if (progress_bars.hasOwnProperty(key)) {
    progress_bars[key].animate(value);
  } else {
    //FIXME: This should never happen but it does?
    console.warn(`Progress bar with key ${key} not found.`);
  }
}

function set_file_status(md5_name, conversion_type, iconName) {
  const list_element = document.getElementById(`li-${md5_name}-${conversion_type}`);

  //Remove existing <i> elements
  const existing_i_elem = list_element.querySelector("i");
  if (existing_i_elem) list_element.removeChild(existing_i_elem);
  if (iconName != "loader") {
    const loader = document.createElement("i");
    loader.className = iconName;
    loader.id = md5_name;
    list_element.appendChild(loader);

    // Remove loader from our row.
    if (`${md5_name}-${conversion_type}` in progress_bars) {
      set_file_progress(md5_name, conversion_type, 1);
      list_element.removeChild(document.getElementById(`progress-${md5_name}-${conversion_type}`));
      delete progress_bars[`${md5_name}-${conversion_type}`];
    }
  } else {
    const list_loader_div = document.createElement("div");
    list_loader_div.style = "width: 42px; height:42px;   margin-left: auto; order: 2;";
    list_loader_div.id = `progress-${md5_name}-${conversion_type}`;
    list_element.appendChild(list_loader_div);
    const progress_bar = new ProgressBar.Circle(list_loader_div, {
      strokeWidth: 14,
      easing: "easeInOut",
      duration: 4000,
      color: "var(--surface-4)",
      trailColor: "#eee",
      trailWidth: 1,
      svgStyle: { width: "100%", height: "100%" },
      text: {
        style: {
          // Text color.
          // Default: same as stroke color (options.color)
          color: "#999",
          position: "absolute",
          right: "0",
          top: "30px",
          padding: 0,
          margin: 0,
          transform: null,
          width: "32px",
        },
        autoStyleContainer: false,
      },
      from: { color: "#aaa3f9" },
      to: { color: "#ED6A5A" },
      step: (state, bar) => {
        //bar.setText(Math.round(bar.value() * 100) + " %");
      },
    });
    progress_bars[`${md5_name}-${conversion_type}`] = progress_bar;
  }
}

function on_export_click() {
  console.log(selected_document);
  switch (selected_document.conversion_type) {
    case "flashcards":
      window.location.href = `/export-flashcard?filename=${selected_document.filename}&md5_name=${selected_document.md5_name}`;
      break;
    case "keywords":
      window.location.href = `/export-keyword?filename=${selected_document.filename}&md5_name=${selected_document.md5_name}`;
      break;
    case "test":
      window.location.href = `/export-test?filename=${selected_document.filename}&md5_name=${selected_document.md5_name}`;
      break;
    default:
      console.log("Error: Could not find conversion type for " + selected_document.conversion_type);
      break;
  }
  //window.location.href = `/export-flashcard?filename=${selected_document.filename}&md5_name=${selected_document.md5_name}`;
}

function remove_document() {
  const md5_name = selected_document.md5_name;
  const conversion_type = selected_document.conversion_type;

  // Remove from HTML
  const file_list = document.querySelector(`.results-${conversion_type} ul`);
  const list_item = document.getElementById(`li-${md5_name}-${conversion_type}`);
  file_list.removeChild(list_item);

  // Remove from cookie
  remove_document_cookie(md5_name, conversion_type);

  clear_file_results();
}

function clear_file_results() {
  const results_output = document.querySelector(".results-output");
  results_output.innerHTML = "";
  document.querySelector(".results-options").style.display = "none";
  document.querySelector(".results-select-prompt").style.display = "block";
  selected_document = undefined;
}

window.addEventListener("load", async () => {
  files_cookie = Cookies.get("files");

  if (!files_cookie) {
    return;
  }

  for (const file_json of JSON.parse(files_cookie)) {
    files_data[file_json["md5_name"]] = new FileData(
      file_json["file_name"],
      file_json["md5_name"],
      file_json["conversion_types"],
      file_json["conversion_options"],
    );
    md5_files.push(file_json["md5_name"]);
  }

  // Populate HTML with the associated files
  for (let i = 0; i < md5_files.length; i++) {
    // Iterate through all files string array, send a post request to our server at /pdf-to-text
    // Include the filename & md5_name of the file
    // Iterate through the file names and send a POST request for each file
    const md5_name = md5_files[i];
    const filename = files_data[md5_name].filename;
    for (const conversion_type of files_data[md5_name].conversion_types) {
      const file_list = document.querySelector(`.results-${conversion_type} ul`);

      const file_p = document.createElement("p");
      file_p.innerHTML = filename;

      const list_item = document.createElement("li");
      list_item.id = `li-${md5_name}-${conversion_type}`;
      list_item.appendChild(file_p);

      list_item.onclick = () => {
        display_file_data(filename, md5_name, conversion_type);

        document.querySelectorAll(".results-files li").forEach((item) => {
          //item.style.backgroundColor = "var(--gradient-1)";
        });

        //list_item.style.backgroundColor = "var(--gradient-1)";
        document.querySelector(".results-options").style.display = "flex";
        document.querySelector(".results-select-prompt").style.display = "none";
        selected_document = { filename: filename, md5_name: md5_name, conversion_type: conversion_type };
      };
      file_list.appendChild(list_item);

      set_file_status(md5_name, conversion_type, "loader");
    }
  }

  // Process all of our files, send respective requests to server.
  for (let i = 0; i < md5_files.length; i++) {
    const md5_name = md5_files[i];
    const file_data = files_data[md5_name];

    for (const conversion_type of file_data.conversion_types) {
      const response = await get_converted_file(file_data, conversion_type);

      // Text exists for file, but has not been converted yet given type.
      if (response === "no_conversion") {
        set_file_progress(file_data.md5_name, conversion_type, 0.2);

        post_convert_file(
          file_data,
          conversion_type,
          file_data.conversion_options,
          () => {
            //Completion callback
            console.log("Completed file conversion");
            get_converted_file(file_data, conversion_type);
          },
          () => {
            //Error callback
            console.log("Error occurred when converting file");
          },
        );
      }

      // This file has not been proccessed at all.
      if (response === "no_file") {
        const completeCallback = (task_id) => {
          console.log("pfd2text callback done: " + task_id + " | " + file_data.filename);

          set_file_progress(file_data.md5_name, conversion_type, 0.2);

          post_convert_file(
            file_data,
            conversion_type,
            file_data.conversion_options,
            () => {
              //Completion callback
              console.log("Completed file conversion");
              get_converted_file(file_data, conversion_type);
            },
            () => {
              //Error callback
              console.log("Error occurred when converting file");
            },
          );
        };

        const errorCallback = async (task_id) => {
          console.log("PDF2JSON callback error:");

          // The task was unsuccessful and an error occured! Tell that to the user..
          const status_data = await get_task_status_json(task_id);
          files_data[md5_name].error_msg = status_data["attributes"]["error_msg"];

          for (const conversion_type of file_data.conversion_types) {
            set_file_status(md5_name, conversion_type, "error");
          }
        };

        post_convert_file(file_data, "text", {}, completeCallback, errorCallback);
      }
    }
  }
});
