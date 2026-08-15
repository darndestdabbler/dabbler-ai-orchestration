# Walkthrough scenarios

> **Canonical for the scenario source format and its four renderings.**
> One authored scenario, four generated documents, and a test that fails
> if they ever stop agreeing. Shipped by Set 113 Session 2.

A walkthrough scenario is one micro-workflow of a product, written once,
in words a reader with no prior context can follow. It renders:

| File | What it is for |
| :--- | :--- |
| `walkthrough.md` | A reviewer drives the product themselves: do this, you should see that. This is the UAT artifact. |
| `training.md` | Someone learning the product reads what it does and why the steps are in this order. |
| `captions.vtt` | WebVTT cues, one per step, keyed by stable step id. |
| `chapters.json` | Chapter metadata — id, title, and the window each step occupies. |

**The written documents are the deliverable; a video is an
enhancement.** Both prose files say so in as many words, neither links a
media file, and both are complete with no recording in existence. That
is what makes the format portable: a consumer repo building a .NET, Java,
Python or vanilla-JS web application inherits the whole thing without
inheriting a recorder.

## Where things live

```
docs/walkthroughs/<scenario-id>/
  scenario.yaml     <- the one source, authored by a human
  walkthrough.md    <- generated
  training.md       <- generated
  captions.vtt      <- generated
  chapters.json     <- generated
```

## Authoring one

Write `scenario.yaml`, then render:

```bash
.venv/Scripts/python.exe -m ai_router.scenario_render docs/walkthroughs/<scenario-id>
.venv/Scripts/python.exe -m ai_router.scenario_lint
```

Commit the source **and** the four generated files. `scenario_render
--check` (run over the whole tree by the pytest suite) fails if a
generated file was edited by hand or if the source moved and nothing
re-rendered. It compares the **text**, not the raw bytes: this repo sets
`core.autocrlf=true`, so a Windows clone lands these files with CRLF
while the renderer emits LF, and a byte comparison would report drift
where none exists. One changed character still fails.

A whole-tree `--check` that finds this directory present but empty
**refuses** rather than reporting success — a corpus gate that passes
having examined nothing reads identically to one that passed having
examined everything.

### The shape

```yaml
id: some-scenario            # lowercase kebab-case, stable forever
title: What the reader will be able to do
summary: One paragraph, in the reader's terms.
audience: Who this is written for, and what it assumes they know.

prerequisites:               # optional
  - What must already be installed or configured.

baseline:                    # required — the known starting state
  description: What the setup does and why it is safe.
  setup:                     # optional — commands that stage it
    - cwd: some/directory
      command: npm run walk
  observable: How the reader knows they have arrived.

reset: How to get back to the baseline.            # optional
recovery:                                          # optional
  - symptom: What the reader sees when it goes wrong.
    action: What to do about it.

steps:                       # required, at least one
  - id: stable-step-id       # lowercase kebab-case, unique
    title: A short label — it heads a section and names a chapter
    action: Exactly what to do.
    expect: Exactly what should then be on screen.
    narration: The caption line.        # optional, defaults to `action`
    seconds: 8                          # optional, defaults to 8
    checkpoint: a name                  # optional — a resumable point
    focus: what the reader's eye should be on   # optional, prose only

drivers:                     # optional — see "The quarantine" below
  playwright-web:
    steps:
      stable-step-id:
        selector: '#some-id'
```

Unknown keys are **refused**, not ignored — at the top level and inside
a step. A field nobody validates is how a self-assessed confidence score
or a stray selector arrives without anyone deciding to add it. Adding a
field is a code change, on purpose.

Two more refusals, both aimed at content that would silently disappear:

- **A duplicate key.** YAML's default is last-one-wins with no
  diagnostic, so a second `action:` or a second `steps:` would quietly
  drop everything above it.
- **`-->` in `narration` or `action`.** Both can become a caption, and
  WebVTT reads that sequence as a cue-timing arrow. Write `->` or an em
  dash. (Authored prose that *wraps* is fine — the caption renderer
  flattens it to one line, since a blank line inside a payload would end
  the cue.)

### Write it for a stranger

The bar is the repo's existing one for UAT instructions
(`docs/planning/project-guidance.md` → *UAT is written for a stranger
and pre-verified by automation*): name the exact button labels, menu
paths, file paths and on-screen text. When a step is ambiguous the
reader cannot tell a product bug from their own misreading, and the
walk proves nothing.

**Two things a stranger cannot infer, and both are on you:**

1. **Who this is written for.** `audience` is a promise. If the steps
   need a repository checkout, developer tooling or an internal
   environment, say so there — an audience line broader than the
   prerequisites makes the document unfollowable for exactly the people
   it invited. (Set 113 S2 verification found this on the first exemplar,
   from two independent lenses.)
2. **Where the commands are run from.** A `baseline.setup` entry's `cwd`
   is relative to *something*, and nothing in the rendered document says
   what. Name the starting directory in `prerequisites` or
   `baseline.description` — "run these from the root of your clone, the
   folder containing `ai_router/` and `tools/`" — and add a `recovery`
   entry for the error a reader sees when they are in the wrong folder.

### Keep it under a minute

The renderer warns above 60 seconds of authored time and never refuses.
It is a design check, not a limit: a scenario that cannot be told in a
minute is usually two scenarios. It also matches the operator's hosting
convention — sub-minute files uploaded by hand to SharePoint or a Teams
channel, product version in the title, regenerated rather than patched
when they go stale.

## The quarantine

Everything above `drivers:` is **portable**: it says what a human does
and what they should then see, and nothing about how a machine finds the
button. Everything under `drivers:` is target-specific — Playwright
selectors, launcher paths, whatever a particular backend needs — and:

- `render_all` hands each renderer a **copy with `drivers` emptied**, so
  no renderer can read it even by mistake;
- the `portable-digest` stamped into all four documents is taken over the
  portable half only.

So **replacing the entire driver block leaves all four generated
documents identical**, which is asserted by
`ai_router/tests/test_scenario_render.py` — including a test that a
renderer is literally handed no drivers at all, so the guarantee is a
property of the call rather than of what today's renderers happen to
read. That is the seam the Set 113 consults named as the one that
matters; a published recorder-plugin contract was rejected as premature
abstraction, and driver blocks are deliberately opaque until a second
real driver exists to disagree about the shape.

`ai_router.scenario_lint` is the second line: it flags selector-shaped
text that leaked into the portable half. It is **advisory** — a pattern
gate over free prose has a false-positive surface, and a renderer that
refused to run over a sentence resembling CSS would be routed around
rather than satisfied. The pytest suite asserts the committed corpus is
clean, which is where the rule bites.

One known false positive, and the fix that improves the prose anyway: a
bare hyphenated dotfile (`.vscode-test`, `.code-workspace`) is shaped
exactly like a CSS class. Write it path-qualified —
`tools/dabbler-ai-orchestration/.vscode-test/` — which also tells the
reader where the folder actually is.

## Reaching a particular step

**There is no seek bar, and the documents never imply one.** The
operator cut the synced-window idea on 2026-08-10 with one condition:
very clear step-by-step instructions to reach any point. Honestly read,
that means replaying a documented prefix from the known baseline, or
from the nearest named `checkpoint` before the step — the product is
stateful, and pretending otherwise would hand a reviewer instructions
that cannot work. Both prose documents say this in the same words, and
`walkthrough.md` renders a *Where to start* table listing each
checkpoint and what remains to replay from it.

Author a `checkpoint` wherever a reader could reasonably stop, and keep
the replay from it short.

## What this is not

- **Not a video pipeline.** Nothing here records, encodes, uploads or
  stores anything. Set 113 Session 3 adds a browser recorder that writes
  into ignored output; Session 4 measures whether Windows OS-level
  capture is viable at all. Both are optional, and their absence costs a
  reader of these documents nothing.
- **Not a driver.** Nothing here makes an application do anything. That
  is the expensive half, and it is deliberately not solved in general —
  Playwright drives browsers, and nothing drives an arbitrary desktop
  application.
- **Not a library of scenarios.** Set 113 authors exactly one exemplar.
  New scenarios arrive when a real product workflow needs one.

## The exemplar

[`work-explorer-first-look/`](work-explorer-first-look/) — reading where
every session set stands, off the AI Work Explorer tree, on the
disposable fixture project that `npm run walk` stages. Five steps, under
a minute.

> The exact running time is not repeated here on purpose. It is derived
> from the source and rendered into all four documents; restating it in
> prose gives it somewhere to drift, which is the defect this whole
> directory exists to prevent. (It drifted 44 → 46 within one session.)
