import time
import asyncio
import sys
from quart import jsonify
from typing import Dict, List, Callable, Tuple


class TaskStatusCallbacks:
    def __init__(self):
        self.callbacks: List[Tuple[str, Callable]] = []

    def add_callback(self, status: str, callback: Callable):
        self.callbacks.append((status, callback))

    def trigger_callbacks(self, status: str):
        for callback_tuple in self.callbacks:
            status_type = callback_tuple[0]
            callback_function = callback_tuple[1]
            if status_type == status:
                callback_function()

        # Remove all callbacks we triggered, since we only trigger them once. (For now???? Fuck me...)
        self.callbacks = [(status_val, _) for status_val, _ in self.callbacks if status_val != status]


# FIXME: Prevent duplicate tasks based on task type and file hash.
class AsyncTask:
    def __init__(self, task_id):
        self.task_id = task_id
        self.status = None
        self.last_checked = None
        self.progress = 0.0
        self.attributes = {}

    def get_status(self) -> str | None:
        return self.status

    def get_status_json(self):
        """
        Returns the task status, and updates the time it was last checked.
        """
        self.last_checked = time.time()

        return jsonify(
            {
                "status": self.status,
                "progress": self.progress,
                "attributes": self.attributes,
            }
        )


running_checker = False
running_tasks: dict[str, AsyncTask] = {}
task_status_callbacks: Dict[str, TaskStatusCallbacks] = {}

"""Write a function that allows us to await fun() if there is a running task with attribute key x and value y"""


"""
Async function that waits until a task with a specified attribute key & value is completed.
"""


async def await_task(task_id):
    task = running_tasks[task_id]
    while task.status != "completed":
        await asyncio.sleep(1)
        task = running_tasks[task_id]


def get_task_attribute(task_id: str, key: str):
    if task_id not in running_tasks:
        return None

    return running_tasks[task_id].attributes.get(key)


def set_task_attribute(task_id: str, key: str, value: object):
    if task_id not in running_tasks:
        return

    running_tasks[task_id].attributes[key] = value


def set_task_progress(task_id: str, progress: float):
    if task_id not in running_tasks:
        print(
            f"Error: Setting task progress when task not created: {task_id}",
            file=sys.stderr,
        )
        return

    if progress > 1 or progress < 0:
        print(
            f"Error: Setting task progress out of bounds (0-1): {progress}",
            file=sys.stderr,
        )
        return

    print(f"Setting progress of task {task_id} to {progress}", file=sys.stderr)
    running_tasks[task_id].progress = progress


def set_task_status(task_id: str, status: str):
    if not task_id:
        return

    if task_id not in running_tasks:
        running_tasks[task_id] = AsyncTask(task_id)

    running_tasks[task_id].status = status
    running_tasks[task_id].last_checked = time.time()

    if status == "completed":
        running_tasks[task_id].progress = 1

    # Begin the task checker once we have created a task.
    if not running_checker:
        start_task_checker()

    # Trigger callbacks if any are registered for the current status
    if task_id in task_status_callbacks:
        print(f"triggering callback for task: {task_id}", file=sys.stderr)
        task_status_callbacks[task_id].trigger_callbacks(status)


# Clear any unsued, or tasks with errors.
def start_task_checker():
    global running_checker

    async def check():
        while True:
            print(
                f"Checking for stale tasks of current: {len(running_tasks.items())} tasks.",
                file=sys.stderr,
            )
            now = time.time()

            tasks_to_remove = []

            for task_id, task in running_tasks.items():
                if task.status == "error" or now - task.last_checked > 10:
                    tasks_to_remove.append(task_id)

            if len(tasks_to_remove) > 0:
                print(
                    f"Found {len(tasks_to_remove)} stale tasks. Removing...",
                    file=sys.stderr,
                )

            for task_id in tasks_to_remove:
                # Trigger callbacks if any are registered for the current status our of task
                if task_id in task_status_callbacks:
                    task_status_callbacks[task_id].trigger_callbacks(running_tasks[task_id].get_status())

                # Finally, delte the task from running_tasks.
                del running_tasks[task_id]

            await asyncio.sleep(10)

    asyncio.create_task(check())
    running_checker = True


def on_task_status(status: str, task_id: str, callback: Callable):
    """
    Create a callback function that trigges when the task status changes to what you specify.

    Only called once, then the callback function is removed.
    """
    if task_id not in task_status_callbacks:
        task_status_callbacks[task_id] = TaskStatusCallbacks()

    task_status_callbacks[task_id].add_callback(status, callback)
    print(f"Added callback for task: {task_id} for status: {status}", file=sys.stderr)
