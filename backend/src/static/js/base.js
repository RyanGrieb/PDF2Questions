async function get_task_status_json(task_id) {
  try {
    const statusResponse = await fetch(`/task_status/${task_id}`, {
      method: "GET",
    });

    if (statusResponse.ok) {
      return await statusResponse.json();
    } else {
      return undefined;
    }
  } catch (error) {
    console.log(error);
    //location.reload();
  }
}

async function start_check_task_interval(task_id, completedCallback, intervalCallback, errorCallback) {
  const interval = setInterval(async () => {
    // Send a GET request to check the task status using the task_id
    const status_data = await get_task_status_json(task_id);

    if (!status_data) {
      clearInterval(interval); // Stop checking on error
      console.error(`Error checking task status for task ID ${task_id}`);
      errorCallback();
      return;
    }

    intervalCallback(status_data);

    // Check if the task is complete
    if (status_data.status === "completed") {
      clearInterval(interval); // Stop checking once it's complete
      console.log(`Task with ID ${task_id} is complete.`);
      completedCallback();
    } else if (status_data.status === "processing") {
      console.log(`Task with ID ${task_id} is still processing.`);
    } else if (status_data.status === "error") {
      clearInterval(interval); // Stop checking on error
      console.log(`Task with ID ${task_id} threw error, stopping.`);
      errorCallback();
    } else {
      clearInterval(interval); // Stop checking on error
      console.error(`Unknown status for task with ID ${task_id}: ${status_data.status}`);
      errorCallback();
    }
  }, 2000); // Check every 2 seconds (adjust this as needed)
}

// Make the current page bold in the navbar
function highlight_navbar() {
  const navbarUL = document.querySelector("#base-navbar ul");
  const page = document.URL.substring(document.URL.lastIndexOf("/"));

  for (const liElem of navbarUL.getElementsByTagName("li")) {
    aElem = liElem.getElementsByTagName("a")[0];

    if (aElem.getAttribute("href") === page) {
      aElem.innerHTML = `<b>${aElem.innerHTML}</b>`;
    }
  }
}

function add_to_list_cookie(cookie_name, list_object) {
  const files_cookie = Cookies.get(cookie_name);
  if (files_cookie === undefined) {
    Cookies.set(cookie_name, JSON.stringify([list_object]));
  } else {
    // get list from 'files' cookie, and append to it.
    const files = JSON.parse(files_cookie);
    files.push(list_object);
    Cookies.set(cookie_name, JSON.stringify(files));
    console.log("NEW COOKIES:");
    console.log(Cookies.get("files"));
  }
}

// Removes document based on md5 & conversion type from cookie list "files"
function remove_document_cookie(md5_name, conversion_type) {
  const files_cookie = Cookies.get("files");

  if (files_cookie === undefined) {
    return;
  }

  const files = JSON.parse(files_cookie);
  // find the index of the list_object in the array
  console.log(files);
  const index_to_remove = files.findIndex((item) => item.md5_name === md5_name);
  console.log(index_to_remove);

  // remove the element if found
  if (index_to_remove !== -1) {
    const file = files[index_to_remove];
    const updated_conversion_types = file.conversion_types.filter((type) => type !== conversion_type);

    // Remove the file entirely if the conversion_types list becomes empty
    if (updated_conversion_types.length === 0) {
      files.splice(index_to_remove, 1);
    } else {
      // Update the conversion_types list
      file.conversion_types = updated_conversion_types;
    }

    Cookies.set("files", JSON.stringify(files));
    console.log("NEW COOKIES:");
    console.log(Cookies.get("files"));
  }
}

window.addEventListener("load", () => {
  highlight_navbar();
});
