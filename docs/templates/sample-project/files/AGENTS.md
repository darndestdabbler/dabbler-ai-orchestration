# AGENTS.md — the sample project

You are the AI coding agent working in this small sample project. This file is
the only instruction file here; `CLAUDE.md` and `GEMINI.md` point back at it.

## What this project is

A two-function Python module. One function is missing, so one test fails. Your
job is the task written in `docs/session-sets/001-add-a-shout/spec.md`.

The developer you are working with is **new to this framework**. Do not explain
git, branches, pull requests, or continuous integration. Do not create branches.
Work directly in the folder you are in. This folder already has a git identity
configured for itself, so `git commit` works here without any setup.

## Use this project's own Python

Every command below uses the interpreter inside this folder, never a system one:

- Windows: `.venv\Scripts\python.exe`
- macOS / Linux: `.venv/bin/python`

Below, `PY` means whichever of those two applies, and `SET` means
`docs/session-sets/001-add-a-shout`. **They are placeholders — substitute them,
never type them.** Fully written out, step 1 on Windows is:

```
.venv\Scripts\python.exe -m ai_router.start_session --session-set-dir docs/session-sets/001-add-a-shout --engine <your engine name> --no-router
```

## Run the task, start to finish

1. **Register the session.**

   ```
   PY -m ai_router.start_session --session-set-dir SET --engine <your engine name> --no-router
   ```

2. **Read** `SET/spec.md` and do exactly what it asks. It is a few lines of code
   in one file.

3. **Run the tests** and show the developer the result:

   ```
   PY -m unittest
   ```

   Before your change: 2 tests run, 1 not passing. After: `OK`.

4. **Run the program** and show the developer the output:

   ```
   PY main.py
   ```

   Expected:

   ```
   Hello, world!
   HELLO, WORLD!
   ```

5. **Write two small files.** `SET/disposition.json`, with exactly this content:

   ```json
   {
     "status": "completed",
     "summary": "Added the shout function to hello/greeting.py so both tests pass and main.py prints both lines.",
     "verification_method": "skipped",
     "files_changed": ["hello/greeting.py"],
     "verification_message_ids": [],
     "next_orchestrator": null,
     "blockers": []
   }
   ```

   `"verification_method": "skipped"` is the honest record here, and it must
   stay that way: no second AI reviews this sample, so the completion record
   must not claim one did. Do not change it to a value that implies a review
   happened.

   And `SET/change-log.md`, two or three lines saying what changed.

6. **Commit, then close the session.** Both commands, in this order:

   ```
   git add -A
   git commit -m "Complete the sample task"
   PY -m ai_router.close_session --session-set-dir SET --no-router --accept-suggestions
   ```

   The close prints a warning that no second AI reviewed the work. That is
   expected here and is not an error: this sample is deliberately a one-agent,
   local-only project. The close succeeds and prints `close_session: succeeded`.

7. **Tell the developer they are done**, in one sentence, and say that the
   Dabbler sidebar now shows the task as complete.

## Rules

- Change `hello/greeting.py` only. Do not edit the tests to make them pass.
- Do not add dependencies. The tests are standard-library `unittest` on purpose.
- Run the commands above exactly as written. Every flag on them is load-bearing:
  `--no-router` keeps this project from making any paid AI calls, and
  `--accept-suggestions` keeps the close from stopping to ask a question.
- If a command fails, show the developer the actual error text and stop. Do not
  guess at a workaround.
