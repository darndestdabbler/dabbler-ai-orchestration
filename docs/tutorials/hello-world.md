# Hello World: your first AI session, in 15 minutes

You will create a small sample project, ask the AI agent you already use to
finish it, and watch a failing test turn green. Everything happens in one folder
on your own machine.

## Before you start

1. **Visual Studio Code.**
2. **Python 3.10 or newer.**
3. **Git**, installed but not configured — you will not type a single Git
   command. The sample keeps a history of your changes for you, and that is what
   needs it. If you do not have it, get it from
   [git-scm.com/downloads](https://git-scm.com/downloads).
4. The **Dabbler AI Orchestration** extension, from the VS Code Marketplace.
5. **An AI coding agent you already use and are already signed in to**, running
   inside VS Code — Copilot, Claude Code, Codex and Gemini Code Assist all work.
   Dabbler does not provide the AI; it organises the work you give yours. You
   need no Dabbler keys and you will not be charged anything by Dabbler.

Beyond that agent, you do not need any additional account, a server, or
anything hosted online.
Creating the project downloads one Python package, so you need working internet
access for that minute.

## 1. Create the sample project

Open the Command Palette — **Ctrl+Shift+P**, or **Cmd+Shift+P** on a Mac — and
run:

```
Dabbler: Try a sample project
```

A dialog titled **Select an Empty Folder for the Sample Project** opens. Make or
pick a folder with nothing in it, and click **Create Sample Project**.

A notification reading **Creating your sample project...** counts through a few
stages. It takes about a minute, almost all of it installing that one package.

VS Code then opens your new folder, and this notification appears:

> Your sample project is ready. To start the first AI task, copy the starter
> prompt and paste it into your AI chat.

Click **Copy Starter Prompt**. The status bar confirms:

```
Copied to clipboard. Paste it into your AI chat to begin.
```

If you miss the notification, you can get the same line at any time: click the
**Dabbler** icon in the Activity Bar to open the Work Explorer, and click the
**001-add-a-shout** row.

## 2. See the failing test

The project is a two-function Python program with one function missing on
purpose. `hello/greeting.py` has `greet` and does not have `shout` yet, and
`test_greeting.py` tests both — so one of the two tests fails right now.

The project brings its own Python, so use that one. Open a terminal in VS Code
(**Terminal > New Terminal**) and run:

```
.venv\Scripts\python.exe -m unittest
```

On macOS or Linux:

```
.venv/bin/python -m unittest
```

It ends with:

```
Ran 2 tests in 0.000s

FAILED (errors=1)
```

That failure is the job.

## 3. Let your AI agent do the work

Open your AI agent's chat inside VS Code and paste the line you copied:

```
Start the next session of `001-add-a-shout`.
```

Send it, and watch. Your agent finds its instructions in the project's
`AGENTS.md`, writes the missing function, runs the tests, runs the program, and
records that it is done. You do not have to steer it.

Two things you will see near the end, both expected:

- A **warning that no second AI reviewed the work.** That is correct here — one
  agent, one machine, nothing to review against. It is not an error.
- The last line, which means the task is properly recorded:

  ```
  close_session: succeeded
  ```

## 4. See that it worked

Run the tests again, in the same terminal:

```
.venv\Scripts\python.exe -m unittest
```

On macOS or Linux:

```
.venv/bin/python -m unittest
```

They now pass:

```
Ran 2 tests in 0.000s

OK
```

Then run the program:

```
.venv\Scripts\python.exe main.py
```

On macOS or Linux:

```
.venv/bin/python main.py
```

```
Hello, world!
HELLO, WORLD!
```

The second line is the one your AI agent made possible. In the Work Explorer,
**001-add-a-shout** now sits under **Complete**.

That is the whole loop: a task that was written down, an AI session that did it,
and a test that proves it.

### If the project did not finish creating

The one step that fails in the real world is the package install, usually behind
a company network or VPN. Dabbler tells you exactly what to run if that happens,
and nothing you have done is lost — run **Dabbler: Try a sample project** again
and pick the *same* folder, and it picks up where it stopped.

## What next

- Use Dabbler on code you actually keep: **[Adopt Dabbler](adopt-dabbler.md)**.
- This sample deliberately skipped review; a real project adds independent
  cross-provider verification — a second AI, from a different provider,
  reviewing the work — and configuring it is not part of a first run.
