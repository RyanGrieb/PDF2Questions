class UploadedFile {
  constructor(filename, md5_name, page_count) {
    this.filename = filename;
    this.md5_name = md5_name;
    this.page_count = page_count;
  }

  // Save all uploaded_files[]
  static save_all_to_cookie() {
    for (const uploaded_file of uploaded_files) {
      uploaded_file.save_to_cookie();
    }
  }

  save_to_cookie() {
    const conversion_type = document.querySelector('input[name="convert_type"]:checked').value;
    const conversion_options = {};

    if (conversion_type === "test") {
      conversion_options["test"] = [];

      const checkboxes = document.querySelectorAll('.convert-test-options input[type="checkbox"]:checked');
      checkboxes.forEach((checkbox) => {
        conversion_options["test"].push(checkbox.value);
      });
    }

    let existing_cookie = false;
    let files_cookie = Cookies.get("files");
    const cookie_json = files_cookie ? JSON.parse(files_cookie) : undefined;

    if (files_cookie) {
      existing_cookie = cookie_json.some((file_json) => file_json["md5_name"] === this.md5_name);
    }

    console.log(`${conversion_type} - ${conversion_options}`);

    // Create an object to store your data
    const file_json = {
      file_name: this.filename,
      md5_name: this.md5_name,
      conversion_types: [conversion_type],
      conversion_options: conversion_options,
    };

    if (!existing_cookie) {
      add_to_list_cookie("files", file_json);
    } else {
      // Append to existing cookies data
      const index = cookie_json.findIndex((item) => item.md5_name === file_json.md5_name);
      if (index !== -1) {
        const conversion_types = cookie_json[index].conversion_types;
        console.log(cookie_json);
        if (!conversion_types.includes(conversion_type)) {
          conversion_types.push(conversion_type);
        }
        cookie_json[index].conversion_options = {
          ...cookie_json[index].conversion_options,
          ...conversion_options,
        };
        Cookies.set("files", JSON.stringify(cookie_json));
      }
    }
  }
}

/** @type {UploadedFile[]} */
let uploaded_files = [];

function dropHandler(event) {
  event.preventDefault();

  if (event.dataTransfer.items) {
    // Use DataTransferItemList interface to access the file(s)
    [...event.dataTransfer.items].forEach((item, i) => {
      // Ensure dropped items are files
      if (item.kind === "file") {
        const file = item.getAsFile();
        //console.log(`… file[${i}].name = ${file.name}`);
        upload_file(file);
      }
    });
  }
}

function dragOverHandler(event) {
  //console.log("File(s) in drop zone");
  // Prevent default behavior (Prevent file from being opened)
  //FIXME: Modify the HTML css to show "drop here" in the upload div. Or something else..
  event.preventDefault();
}

function get_uploaded_file_count() {
  const fileList = document.querySelector(".convert-region ul");
  let count = 0;
  for (li_element of fileList.querySelectorAll("li")) {
    if (li_element.getAttribute("uploaded") === "true") {
      count++;
    }
  }
  return count;
}

// Format our filename such that it's able to be put inside HTML tags.
function get_formatted_file_name(fileName) {
  return fileName.replace(/[/\\?%*:|"<>]/g, "-").replaceAll(" ", "-");
}

function remove_file_extension(file_name) {
  const dot_index = file_name.lastIndexOf(".");
  if (dot_index === -1) {
    return file_name; // No file extension found
  }
  return file_name.substring(0, dot_index);
}

function upload_file(file) {
  const fileList = document.querySelector(".convert-region ul");
  const formatted_file_name = get_formatted_file_name(file.name);

  // Check if file already exists, if so skip over it.
  if (file_already_exists(formatted_file_name, fileList)) {
    return;
  }

  // Hide the convert button if there are files being uploaded
  show_convert_button(false);

  // Create and append li element for the file
  create_li_element(formatted_file_name, file, fileList);

  // Create progress bar
  const progress_bar = create_progress_bar(formatted_file_name);

  // Create and send XMLHttpRequest
  create_upload_request(file, progress_bar);
}

function file_already_exists(formatted_file_name, fileList) {
  for (const liElem of fileList.getElementsByTagName("li")) {
    if (liElem.textContent.includes(formatted_file_name)) {
      return true;
    }
  }
  return false;
}

function show_convert_button(value) {
  const convertButton = document.querySelector(".file-convert-btn");

  if (!value) {
    convertButton.classList.add("hidden");
  } else {
    convertButton.classList.remove("hidden");
  }
}

function create_li_element(formatted_file_name, file, fileList) {
  const fileNameLi = document.createElement("li");
  fileNameLi.id = `upload-li-${formatted_file_name}`;
  fileNameLi.setAttribute("uploaded", "false");

  const liDiv = document.createElement("div");
  const removeButton = create_remove_file_button(formatted_file_name);
  const fileNameP = document.createElement("p");
  fileNameP.innerHTML = `${file.name} - 0%`;

  liDiv.appendChild(removeButton);
  liDiv.appendChild(fileNameP);
  fileNameLi.appendChild(liDiv);
  fileList.appendChild(fileNameLi);
}

function create_remove_file_button(formatted_file_name) {
  const removeButton = document.createElement("button");
  removeButton.innerHTML = `<i class="fa fa-close"></i>`;
  removeButton.onclick = () => {
    remove_file(formatted_file_name);
  };
  return removeButton;
}

function remove_file(formatted_file_name) {
  const fileNameLi = document.getElementById(`upload-li-${formatted_file_name}`);

  // NOTE: We do this since backend doesn't return the file-extension in it's name
  formatted_file_name = remove_file_extension(formatted_file_name);

  uploaded_files = uploaded_files.filter(
    (uploaded_file) => get_formatted_file_name(uploaded_file.filename) != formatted_file_name,
  );

  fileNameLi.remove();
  if (get_uploaded_file_count() <= 0) {
    show_convert_button(false);
  } else {
    show_convert_button(true);
  }
}

function create_progress_bar(formatted_file_name) {
  const liDiv = document.getElementById(`upload-li-${formatted_file_name}`).querySelector("div");
  const progressBar = new ProgressBar.Line(liDiv, {
    strokeWidth: 4,
    easing: "easeInOut",
    duration: 100,
    color: "var(--surface-4)",
    trailColor: "#eee",
    trailWidth: 1,
    svgStyle: { width: "100%", height: "100%" },
    text: {
      style: {
        color: "#999",
        position: "absolute",
        right: "0",
        top: "30px",
        padding: 0,
        margin: 0,
        transform: null,
      },
      autoStyleContainer: false,
    },
    from: { color: "#aaa3f9" },
    to: { color: "#ED6A5A" },
    step: (state, bar) => {
      //bar.setText(Math.round(bar.value() * 100) + " %");
    },
  });

  return progressBar;
}

function create_upload_request(file, progress_bar) {
  const formatted_file_name = get_formatted_file_name(file.name);

  const request = new XMLHttpRequest();
  request.responseType = "json";
  const formdata = new FormData();
  const fileNameLi = document.getElementById(`upload-li-${formatted_file_name}`);
  const fileNameP = fileNameLi.querySelector("p");
  formdata.append("file", file);

  request.upload.addEventListener("progress", (event) => {
    if (event.loaded <= file.size) {
      const percent = Math.round((event.loaded / file.size) * 100);
      progress_bar.animate(percent / 100);
      fileNameP.innerHTML = `${formatted_file_name} - ${percent}%`;
    }

    if (event.loaded == event.total) {
      progress_bar.animate(0.9);
      fileNameP.innerHTML = `${formatted_file_name} - 99%`;
    }
  });

  request.addEventListener("readystatechange", () => {
    if (request.readyState === XMLHttpRequest.DONE) {
      handle_upload_response(request, file, progress_bar);
    }
  });

  request.open("post", "/");
  request.timeout = 45000;
  request.send(formdata);
}

function handle_upload_response(request, file, progress_bar) {
  const success = request.response["success"];
  const formatted_file_name = get_formatted_file_name(file.name);

  if (!success) {
    handle_upload_error(request, formatted_file_name);
    return;
  }

  handle_upload_success(request, file, formatted_file_name, progress_bar);
}

function handle_upload_error(request, formatted_file_name) {
  const error_type = request.response["error_type"];
  console.log(request.response);
  console.log(error_type);
  switch (error_type) {
    case "page_limit":
      display_error_msg("File exceeds page limit: " + formatted_file_name);
      break;
    case "file_denied":
      display_error_msg("Filetype not supported");
      break;
    default:
      display_error_msg("Unknown error occured");
      break;
  }

  remove_file(formatted_file_name);
}

function display_error_msg(message) {
  const error_text_elem = document.querySelector(".error-text");

  if (message.length < 1) {
    error_text_elem.innerHTML = "";
    return;
  }

  error_text_elem.innerHTML = `Error - ${message}`;
}

function handle_upload_success(request, file, formatted_file_name, progress_bar) {
  console.log(request.response);
  const response_file_name = request.response["metadata"]["file_name"];
  const response_md5_name = request.response["metadata"]["md5_name"];
  const response_page_count = request.response["metadata"]["page_count"];
  const file_li = document.getElementById(`upload-li-${formatted_file_name}`);
  const fileNameP = file_li.querySelector("p");
  const fileList = document.querySelector(".convert-region ul");

  file_li.setAttribute("uploaded", "true");
  fileNameP.innerHTML = `${file.name} - 100%`;
  progress_bar.animate(1);

  if (!uploaded_files.some((file) => file.md5_name === response_md5_name)) {
    uploaded_files.push(new UploadedFile(response_file_name, response_md5_name, response_page_count));
  }

  // Make the convert button visible, once all files are loaded.
  if (get_uploaded_file_count() >= fileList.getElementsByTagName("li").length) {
    show_convert_button(true);
  }
}

function upload_files() {
  const fileInput = document.getElementById("file-upload");
  const convertButton = document.querySelector(".file-convert-btn");

  console.log("Uploading file...");
  display_error_msg("");

  // Iterate through all selected files and append them to FormData
  for (let i = 0; i < fileInput.files.length; i++) {
    const file = fileInput.files[i];
    upload_file(file);
  }
}

async function convert_files() {
  UploadedFile.save_all_to_cookie();
  window.location.href = "/results";
}

window.addEventListener("load", () => {
  // Get all radio elements and the convert-test-options div
  const radioButtons = document.querySelectorAll('input[name="convert_type"]');
  const convertTestOptions = document.querySelector(".convert-test-options");

  // Add event listeners to all radio buttons
  radioButtons.forEach((radioButton) => {
    radioButton.addEventListener("change", function () {
      if (this.id === "radio-test") {
        // Display convert-test-options for radio-test
        convertTestOptions.style.display = this.checked ? "block" : "none";
      } else {
        // Hide convert-test-options for other radio buttons
        convertTestOptions.style.display = "none";
      }
    });
  });
});
