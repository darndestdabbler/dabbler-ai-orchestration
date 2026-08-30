// Sample Task Board -- Set 113 S3 fixture web app.
//
// In-memory state only: no storage, no network, no build step. A reload is
// a reset, which is what makes the scenario's `reset` instruction honest.
"use strict";

(function () {
  /** @type {{ id: number, title: string, done: boolean }[]} */
  const tasks = [];
  let nextId = 1;
  let filter = "all";

  const list = document.getElementById("task-list");
  const emptyState = document.getElementById("empty-state");
  const summary = document.getElementById("summary");
  const form = document.getElementById("add-form");
  const input = document.getElementById("new-task");

  function visible() {
    if (filter === "open") return tasks.filter((t) => !t.done);
    if (filter === "done") return tasks.filter((t) => t.done);
    return tasks.slice();
  }

  function render() {
    const shown = visible();
    list.replaceChildren();
    for (const task of shown) {
      const item = document.createElement("li");
      item.className = task.done ? "task is-done" : "task";
      item.dataset.taskId = String(task.id);

      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = task.done;
      box.className = "task-toggle";
      box.setAttribute("aria-label", `Mark "${task.title}" done`);
      box.addEventListener("change", () => {
        task.done = box.checked;
        render();
      });

      const title = document.createElement("span");
      title.className = "task-title";
      title.textContent = task.title;

      item.append(box, title);
      list.append(item);
    }

    const open = tasks.filter((t) => !t.done).length;
    summary.textContent = `${open} open`;
    emptyState.hidden = shown.length > 0;
    emptyState.textContent =
      tasks.length === 0 ? "No tasks yet." : "Nothing matches this filter.";
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const title = input.value.trim();
    if (!title) return;
    tasks.push({ id: nextId++, title, done: false });
    input.value = "";
    render();
  });

  for (const id of ["all", "open", "done"]) {
    document.getElementById(`filter-${id}`).addEventListener("click", () => {
      filter = id;
      for (const button of document.querySelectorAll(".filter")) {
        button.classList.toggle("is-selected", button.id === `filter-${id}`);
      }
      render();
    });
  }

  render();
})();
