function toggle_all_checkboxes() {
  const top_checkbox = document.getElementById("top-checkbox");
  const checkboxes = document.querySelectorAll('input[name="qa-checkbox"]');

  checkboxes.forEach((checkbox) => {
    checkbox.checked = top_checkbox.checked;
  });
}

// returns an array of selected sets 0-n.
function get_selected_flashcard_sets() {
  const selectedSlides = [];
  const checkboxes = document.querySelectorAll('input[name="qa-checkbox"]');
  checkboxes.forEach((checkbox, index) => {
    if (checkbox.checked) {
      selectedSlides.push(index);
    }
  });
  return selectedSlides;
}

async function export_as_pdf() {
  const form_data = new FormData();
  form_data.append("filename", filename);
  form_data.append("md5_name", md5_name);
  form_data.append("conversion_type", "flashcards"); // What conversion we did (flashcard, test, keyword)
  form_data.append("export_type", "pdf");
  form_data.append("flashcard_sets", get_selected_flashcard_sets());

  // Send a POST request to the server and wait for the response
  const response = await fetch("/export", {
    method: "POST",
    body: form_data,
  });

  if (response.ok) {
    const response_data = await response.json();
    console.log(response_data);
    const task_id = response_data.task_id;
    const file_id = response_data.file_id;

    start_check_task_interval(
      task_id,
      async () => {
        // The task is completed, do a GET request for the PDF file.
        const file_response = await fetch(`/export/${file_id}.pdf`);
        if (file_response.ok) {
          window.open(file_response.url);
        } else {
          console.error("Failed to fetch file:", file_response.status);
        }
      },
      (status_data) => {
        console.log("Still exporting...");
        console.log(status_data);
      },
      () => {
        console.log("Error:");
        console.error(response_data);
      },
    );
    // Get PDF file from backend
  }
}

window.addEventListener("load", async () => {
  // Get data list from flashcard.

  const params = new URLSearchParams({
    filename: filename,
    md5_name: md5_name,
    conversion_type: "flashcards",
  });

  const url = `/convertfile/?${params}`;
  console.log(url);
  const response = await fetch(url, {
    method: "GET",
  });

  if (response.ok) {
    const json_data = JSON.parse(await response.text());
    console.log(json_data);
    // Take json_list and display it to the user.
    const export_data_list = document.querySelector(".export-data-list");
    document.createEle;
    // Generate HTML for the list with checkboxes
    const ul_element = document.createElement("ul");
    json_data["data"].forEach((qa_pair, index) => {
      // Create list item
      const li_element = document.createElement("li");

      // Create checkbox
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = `checkbox-${index}`;
      checkbox.name = "qa-checkbox";
      checkbox.checked = true;
      checkbox.value = index;

      // Create div where text is stored
      const text_div = document.createElement("div");
      text_div.classList.add("data-text");

      // Create label for the checkbox
      const question_label = document.createElement("label");
      question_label.htmlFor = `checkbox-${index}`;
      question_label.innerHTML = `<u><b>Question:</b></u> ${qa_pair[0]}`;

      // Create paragraph for the answer
      const answer_label = document.createElement("label");
      answer_label.innerHTML = `<u><b>Answer:</b></u> ${qa_pair[1]}`;

      // Append checkbox, label, and answer paragraph to the list item
      li_element.appendChild(checkbox);
      text_div.appendChild(question_label);
      text_div.appendChild(answer_label);
      li_element.appendChild(text_div);

      // Append list item to the unordered list
      ul_element.appendChild(li_element);
    });

    export_data_list.appendChild(ul_element);
  } else {
    // Extract error type from JSON response
    const error_data = await response.json();
    console.log(error_data);
  }
});
