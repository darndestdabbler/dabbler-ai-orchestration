# Walking the Configuration: every choice is this repository's

For the operator, before 3.18.0 is published. It checks the six rules of
2026-09-21 in a locally built VSIX, by hand, in about ten minutes. Nothing
here starts a session that does real work, and nothing is billed: a model
list is read from this machine's catalog, and the one Start in check 5 is
cancelled at its first question or closed straight after it opens.

## What you need

- The local VSIX installed, and the window reloaded: `dabbler version` in a
  new terminal says `3.18.0`.
- Two repositories that each have a sessions plan, open in **two VS Code
  windows** side by side. Below they are **A** and **B**. csv-parser and this
  repository do.
- One more folder that has never been configured, for check 6. An empty
  folder with `git init` run in it is enough.

Before you start, in a terminal in A, note what the machine holds today:

```
dabbler configuration explain
```

Each choice prints the layer that decided it, and under it the layers it
shadows. `preferences.json` lines are the machine's defaults.

## Check 1 — a change is saved to the repository (rule 2)

**You —** in A's Solution Explorer, open *Configuration*, then the *Primary
Reviewer*, and run **Set the Primary Reviewer's Model** on its Model row.
Pick a model that is not the one shown.

Expect:

- the Model row now reads `<the model> · this repository`;
- A's own settings hold it:

  ```
  git -C <path to A> diff -- .vscode/settings.json
  ```

  shows `"dabbler.reviewerModel": "<the model>"` added or changed;
- `dabbler configuration explain`, run in A, prints
  `decides: .vscode\settings.json (dabbler.reviewerModel) = <the model>`.

## Check 2 — the other window is not changed (rule 6)

**You —** look at B's *Primary Reviewer* Model row. Do not click anything.

Expect: it shows what it showed before check 1. If B has never had a reviewer
of its own it reads `<B's model> · machine default`; if it has, `· this
repository`. Either way it is **not** the model you picked in A.

Then change B's reviewer the same way, to a third model, and look back at A:
A still shows the model from check 1.

## Check 3 — the machine's default is only a default (rules 1 and 2)

**You —** in a terminal in B, run `dabbler configuration explain` and read
the *Primary Reviewer model* lines.

Expect: `decides:` is B's `.vscode\settings.json`, and beneath it a
`shadowed: preferences.json (selected.reviewer) = ...` line carrying whatever
the machine held **before** this walk. Neither check 1 nor check 2 changed
it: a machine that already has a default keeps it.

## Check 4 — Keep as Machine Default (rule 4)

**You —** in A, right-click the *Primary Reviewer* Model row and run **Keep
as Machine Default**. Read the confirmation, then confirm.

Expect:

- the confirmation says it reaches every repository here that names no
  choice of its own, and that it is not committed;
- A's row is unchanged (`· this repository`), and A's `.vscode/settings.json`
  is unchanged by this click;
- `dabbler configuration explain` in B now shows A's model on B's
  `shadowed: preferences.json` line — and B's own row and choice are
  unchanged.

The same command is on the *Authoring AI*'s Vehicle and Model rows, the
reviewing Vehicle row and the *Auxiliary Reviewer*'s Model row.

## Check 5 — Start asks nothing (rule 3)

**You —** in A's Work Explorer, run **Start Session** on the next session's
row.

Expect: no list of engines and no list of models. The AI's terminal opens on
the engine and model A's Configuration shows. Close that terminal and, in the
Work Explorer, cancel the session it registered — this walk is not doing its
work.

**You —** run **Start Session with Different Models...** on the same row.

Expect four questions, in this order: the engine, its model, the *Primary
Reviewer*, the *Auxiliary Reviewer*. Press Escape at the first one: nothing
starts and nothing is written — `git -C <path to A> status --short` shows no
change from it.

Then walk the case this command exists for. Run it again and pick an engine
**from the same vendor as A's saved Primary Reviewer** — if A reviews with a
Claude model, pick Claude Code. Expect:

- the *Primary Reviewer* list does **not** offer A's saved reviewer, or any
  model of that vendor: a reviewer is never from the author's vendor;
- the *Auxiliary Reviewer* list offers nothing from the author's vendor or
  from the vendor of the primary you just picked, and shows A's own
  auxiliary first where it may still serve;
- the session starts. Afterwards A's Configuration and
  `.vscode/settings.json` are exactly as they were — the three choices were
  this session's only, and `dabbler configuration explain` in A still shows
  A's saved reviewer.

Close the AI's terminal and cancel the session it registered, as above.

If A's Configuration names no engine — or a Copilot seat and no model — Start
starts nothing: it says which row is missing a choice and brings the Solution
Explorer, where the Configuration is, to the front. Choose there (it is saved
to A) and press Start again. It offers no list of its own, by design: a
choice made at Start would be written nowhere, and you would meet the same
message at the next one.

## Check 6 — a fresh repository starts from the machine's defaults (rule 1)

**You —** open the never-configured folder in a third window and open its
*Configuration*.

Expect: the *Primary Reviewer* Model row shows the model you kept in check 4,
as `· machine default`, and the folder has no `.vscode/settings.json` of its
own yet. Choosing a model on that row writes one, and the row turns to
`· this repository`.

## Check 7 — a reload changes nothing (rule 5)

**You —** in A, run *Developer: Reload Window*, then open *Configuration*
again. Do the same after quitting VS Code entirely and opening A again.

Expect: every row reads exactly as it did before, with the same `· this
repository` or `· machine default` beside it. Every value on that pane is
read from two files — A's `.vscode/settings.json` and the machine's
`preferences.json` — so there is nothing in the window to lose.

## Putting it back

The walk changed A's and B's `.vscode/settings.json` and one machine default.
To undo the repositories: `git -C <path> checkout -- .vscode/settings.json`.
To put the machine's default back, set the reviewer you want on any row and
run **Keep as Machine Default** on it.

## If a check does not hold

Say which check, which window, and what the row and `dabbler configuration
explain` each said. `explain` reads the same two files the pane does and
names the layer that decided, so where the two disagree is where the defect
is.
