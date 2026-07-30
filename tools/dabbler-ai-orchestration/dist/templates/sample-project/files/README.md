# The Dabbler sample project

A small Python program with one function missing. Your AI coding agent writes the
missing function; you watch the tests go from red to green and then run the
program.

## What is here

| File | What it is |
| --- | --- |
| `hello/greeting.py` | The module you are changing. `greet` exists; `shout` does not yet. |
| `test_greeting.py` | Two tests. The second one fails until `shout` exists. |
| `main.py` | The program. Prints both greetings. |
| `docs/session-sets/001-add-a-shout/spec.md` | The task, already written for you. |
| `AGENTS.md` | The instructions your AI agent reads. |

## The one thing to do

In the Dabbler sidebar, click **001-add-a-shout** to copy the starter line, then
paste it into your AI coding agent's chat. Your agent takes it from there.

## Running things yourself

Use this project's own Python, not a system one:

```
.venv\Scripts\python.exe -m unittest      # Windows
.venv/bin/python -m unittest              # macOS / Linux
```

Right now that reports 2 tests with 1 not passing. That is on purpose. When your
agent is done it reports `OK`, and:

```
.venv\Scripts\python.exe main.py
```

prints:

```
Hello, world!
HELLO, WORLD!
```

## This project is local only

There is no server, no account, and no remote repository. It exists only in this
folder, and deleting the folder deletes it. That is what the `.dabbler/local-only`
file records.
