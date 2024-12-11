# Exam Generator

An AI web-app that scans PDFs and other documents and generates exams/quizzes.

## Features

TBA

## Developer Software Requirements

1. Docker
2. Python3
3. Visual Studio Code

## Build Instructions

1. Install Docker, VSCode, Git, and Python3
2. Clone the repository using `git clone https://github.com/RyanGrieb/ExamGenerator.git` in the terminal
3. `cd` into the cloned repository.
4. `cd` into the `./backend` file, and run `pip install -r requirements.txt` (You might need to restart VSCode for the imports to load properly)
5. Go back to the parent directory, `cd ..`
6. Create the docker containers: `docker compose up -d` (Check if these docker images exist already)
7. Find `./data/api-keys/open_ai.txt` and enter your API key there.
8. Re-build the containers with `docker compose up -d --build`
9. To navigate to the webpage at `localhost:8000`

To re-build the all the containers after you make changes, run `docker compose up -d --build`.

**Note:** You don't need to rebuild any containers if you just modified the python files inside the `backend` directory. It's updated for you automatically.
