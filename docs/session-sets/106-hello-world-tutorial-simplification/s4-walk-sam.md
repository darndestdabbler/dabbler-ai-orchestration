# Your card — you are **Sam**

You are helping test a tutorial. Someone wrote a walkthrough for building a small two-module
program with AI-led sessions, and **nobody has ever performed it end to end**. That is what we
are doing. You play **Sam**, who owns a module called `app`; your teammate plays **Priya**, who
owns `greeter`. `app` imports `greeter`'s greeting and adds the time.

**The tutorial:**
[docs/tutorials/hello-world.md](https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/tutorials/hello-world.md)

**This is the only document you need.** Read Parts 5 and 6 — Parts 1–4 are Priya's, and she
will have done them before you start. Ignore the scene scripts and the checklist; those are
hers.

> ## The single most important thing
>
> **We are testing the instructions, not you.** If a step does not work, or the screen does
> not show what the tutorial says it will, that is a **defect in the document** — which is
> exactly what we are looking for. Tell Priya what you saw, in the words you would use
> naturally. Do not quietly work around it and carry on; a step you fixed for yourself is a
> step that stays broken for the next reader.
>
> There are no stupid questions here. If a sentence is ambiguous, saying so **is** the useful
> result.

---

## Before we start — set your machine up

You already have the **Dabbler AI Orchestration** extension, so you need to **update** it:
Extensions view (`Ctrl+Shift+X`) → find it → **Update** if offered, then check the version on
its page. It must read **0.46.0 or newer**. Tell Priya the number you see — if it is older,
we both stop, because we would be testing the wrong thing.

Then the rest of the tutorial's **Part 1**, on your machine:

- **VS Code** 1.85+ and **Python** 3.10+ — check both in a VS Code terminal
  (**Terminal > New Terminal**):
  ```bash
  code --version
  python --version
  ```
- **GitHub Copilot CLI** — install it, then run `copilot` once and complete the sign-in, using
  the account your Copilot seat is on.
  ```bash
  winget install GitHub.Copilot
  copilot -p "Write PI to 10 decimal places" --model claude-sonnet-4.6
  ```
  **Send Priya whatever that last line prints, before the walk day** — it should be π to ten
  decimal places. *Having* a seat and having a **working** seat on *this* machine are
  different things, and two minutes now beats finding out an hour into a two-hour session.
- **GitHub CLI** — install from [cli.github.com](https://cli.github.com), then:
  ```bash
  gh auth login
  gh auth status
  ```
  Sign in as **yourself**. Do not use Priya's account.

Nothing else. You do not need to clone anything yet — Priya invites you first.

## Your part of the walk

Four moments. Between them, you are waiting on Priya.

### 1. She invites you → you set up

Accept the invitation, clone the repo she names, open it in VS Code, then run
Command Palette (`Ctrl+Shift+P`) → **`Dabbler: Install ai-router`**. It builds a Python
environment inside your clone; that takes a minute or two.

Tell her when it finishes. *(If that command is not in the palette, the extension is not
installed in this window — that is worth telling her either way.)*

### 2. She asks you to approve a pull request

Open it on GitHub, click **Review changes** → **Approve** → **Submit review**. You are not
expected to review it properly — she cannot approve her own, so you are the second pair of
eyes the rule requires. Tell her it is done.

### 3. You build `app` — the long part

Follow **Part 5 step 6** of the tutorial. In short: pull, make a branch, and run three AI
sessions from the Dabbler panel — a plan set, a decomposition set, then the implementation
set in its own folder. Each one takes several minutes; that is normal, let them work.

The scope to give the plan set is in the tutorial, and it is this:

```text
Scope: services/app/app.py imports greeter's greet(), appends the current time,
and prints "Hello, world! It is HH:MM."; runnable from the repository root with:
python -m services.app.app
```

Two things in that step are easy to miss, so they are worth naming here:

- After the decomposition set writes the new implementation set, you add a `prerequisites:`
  block to its `spec.md` **by hand** — and then you must **commit** that edit. Opening a pull
  request pushes commits; it does not make one for you.
- **Ping Priya to approve that pull request too.** It is all planning files, so nobody is
  requested automatically. Then merge it and pull before you open the worktree.

### 4. The real review

When the implementation session is done, open the pull request with
**`Dabbler: Open PR for this set`**. **Priya should be requested automatically** — you should
not have to add her. If she is not, say so; that is one of the things we are checking.

She reviews and approves, you merge, and then you run
**`Dabbler: Finalize merged set`** from your **main** window — not from the worktree folder;
it refuses to delete the folder it is running in, which is correct.

## What to write down

**Use [`s4-walk-sam-notes.md`](s4-walk-sam-notes.md)** — copy it, fill it in as you go, send
it to Priya. It is four lines per note and there is deliberately no pass/fail column: you are
reporting what happened, not grading it. She turns it into the formal record.

Send notes **as you go**, not at the end. Two hours compresses badly in memory, and the
detail that gets lost is always the one worth having.

Thank you. Genuinely — the only way to know whether instructions are followable is to watch
someone follow them.
