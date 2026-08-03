# S3 verification conventions — read this before Round 1

Up-front conventions block per `project-guidance.md` → Workflow Expectations
(L-064-10). Its purpose is to keep Round 1 on real defects rather than burning
findings — and re-verify rounds — on an agreed baseline.

## What this session is

Set 108 Session **3 of 4**: *"Cut the estate to the ladder."* It is a **consistency
pass with a wide blast radius**, kept in its own session so it gets its own
verification.

**This session creates nothing.** Its spec says so verbatim: *"Creates: none — this
session only removes and reconciles; that is the point of separating it."* It
**removes** text and files, and **reconciles** the documents that pointed at them.

The ladder this session is cutting the estate down to:

| Tutorial | Scope |
| --- | --- |
| `hello-world.md` | One AI session, one task, one folder |
| `adopt-dabbler.md` | One person, **one** module, in a real repository |
| `three-module-pipeline.md` (S2) | **Three** modules, built independently, composed by contract |

## The severity rubric (L-095-1) — apply it

Grade by **CONSEQUENCE**: probability the stated failure scenario materialises for a
real reader × impact on the deliverable's objectives. **Low-probability OR low-impact
is Minor even when technically correct. No plausible failure scenario ⇒ Minor by
definition.** A finding must name a specific reader, at a specific step, who stalls
or is misled.

For a deletion pass specifically, the material failure modes are exactly three:

1. **A dead link or dangling reference** — something points at deleted text.
2. **A stale promise** — a document still promises the two-module outcome that was
   removed, so a reader arrives expecting content that is gone.
3. **A lost procedure** — something the ladder still needs was deleted and now lives
   nowhere.

A finding that does not land in one of those three, on this diff, is very likely
Minor.

## The one hard ordering constraint, and how it was discharged

`ai-assignment.md` (S2) put a **blocking precondition** on this session:

> it must confirm the ownership-routing procedure exists in
> `three-module-pipeline.md` **by reading it**, not by a link check, before removing
> Part 5.

**Discharged by reading.** Ownership routing is in the new tutorial at **Step 4 —
Route reviews by ownership**, lines 653–686, carrying **both** host forms: the
GitHub `.github/CODEOWNERS` lines and the Azure DevOps *Automatically included
reviewers* equivalent, with the real-usernames caveat and the
rules-only-route-PRs-opened-after-they-land caveat. This matches S1's ruling **R4**,
which required the procedure be written **in full** in the new tutorial precisely
because a link to Part 5 would be dead by the set's own end. Only then was Part 5
deleted.

## What this session did

| # | Change | Files |
| --- | --- | --- |
| 1 | **Trim** `adopt-dabbler.md` to the single-module walk | `docs/tutorials/adopt-dabbler.md` (459 → 333 lines) |
| 2 | **Retire** the video | `docs/tutorials/adopt-dabbler-video/` — 9 files deleted |
| 3 | **Reconcile** the inbound linkers | 5 documents edited, 1 deliberately not (below) |
| 4 | **Repair** a red CI gate this set turned red | `ai_router/scripts/tutorial_gate.py`, `ai_router/tests/test_tutorial_gate.py` |

### 1 — the trim

Deleted **Part 5** (add a teammate and a composing module) and **Part 6** (review,
merge, clean up) in full — 7,461 characters. Part 6 existed only to review the Part 5
module, so it fell with it; Part 4 already carries open-PR → merge → *Finalize merged
set* for the reader's own module, so **no procedure was lost by deleting Part 6**.

Consequential repairs made in the same pass, because a consistency fix is global and
not point-local (**L-065-1**):

- Intro reframed: *"a tiny two-module Python program"* → one module; the `Solo?` and
  `On camera` bullets replaced by an explicit **Scope: one person, one module** bullet
  that points onward to the new tutorial.
- The *"this guide currently carries the team workflow too"* note removed — it
  described Parts 5–6, which no longer exist.
- Branch protection renumbered **"stage N of 3" → "of 2"**. Stage 3 (raise approvals
  to 1) lived in Part 5. The fact it carried is not dropped: it is restated in one
  three-line note at stage 1, because `adopt-dabbler.md` **owns branch protection**
  per the spec's ownership table and the new tutorial does not cover the approvals
  count.
- `"Parts 3–5 depend on it"` → `"Parts 3–4"`; the two prose forward-references to
  Part 5 inside Parts 2–3 rewritten.
- The closing five-item check rewritten from `greeter` + `app` to `greeter` alone,
  and a **Where to go next** section added pointing at the new tutorial and at
  `release-and-recovery.md`.

**The time estimate was changed from "about two hours" to "about an hour and a
half", and explicitly labelled an estimate, not a stopwatch reading.** Two of six
parts were removed; leaving "two hours" would be a stale inherited claim
(**L-064-8**). Nobody has ever walked this document — that debt is real, pre-existing,
and named below.

### 2 — the video

`docs/tutorials/adopt-dabbler-video/` deleted via `git rm -r`: 9 files
(README + 8 scene scripts). **Operator-sanctioned in the spec**, which names it under
*Deletes* and calls the retirement an operator decision.

Its **single live inbound link** was `adopt-dabbler.md:15`, removed with the
`On camera` bullet. The **7** now-meaningless `*(scene N)*` markers: 4 stripped from
the Part 1–4 headings, 3 removed with their parts (the Parts 5–6 headings and the
`On camera` bullet).

Set 107's `activity-log.json` and `change-log.md` mention the folder historically.
They are **raw records and were not touched** — the spec is explicit, and the
constitution forbids editing saved session artifacts.

### 3 — the linkers

The spec named seven. **Five were edited, one needed no edit, and one is
`adopt-dabbler.md` itself:**

| Linker | Action |
| --- | --- |
| `README.md` | Dropped *"solo-first, with a second module and a teammate added at the end"* — now false. Added the new tutorial as the next rung. |
| `docs/quick-start.md` | *"Your first module (solo or as a small team)"* → *"(one person, one module)"*; new list entry for the three-module tutorial. |
| `docs/module-reorganization.md` | *"for a hands-on team setup"* pointed at `adopt-dabbler.md`; repointed at the new tutorial, which is where team setup now lives. |
| `docs/tutorials/module-team-hello-world.md` | Tombstone; now routes the **team** half onward instead of only at `adopt-dabbler.md`. |
| `docs/tutorials/release-and-recovery.md` | *"Reference for after the adoption walkthrough"* now names both upstream tutorials. |
| `docs/tutorials/adopt-dabbler.md` | The trim itself. |
| `docs/tutorials/hello-world.md` | **Deliberately NOT edited — see below.** |

**Why `hello-world.md` was not edited, and why that is the correct reconciliation.**
It makes **no two-module promise**: its one line is *"Use Dabbler on code you
actually keep: **Adopt Dabbler**"*, which is still exactly true. Adding the
three-module tutorial to it would **turn CI red**: `tutorial_gate.py`'s
`_BANNED_TERMS` forbids `pipeline`, `repository` and `teammate` in the first-run
document, and the new tutorial is titled *"Three modules, one **pipeline**"*. The
ladder still reads correctly as a **chain** — `hello-world` → `adopt-dabbler` →
`three-module-pipeline` — with each rung naming the next. **A finding that
`hello-world.md` should also link the new tutorial is answered here: it would
violate an executable gate that exists specifically to keep the first run free of
downstream vocabulary.**

### 4 — the red CI gate (the one thing outside the spec's Touches list)

**This is the finding most worth your attention, and it is disclosed rather than
buried.**

`ai_router/scripts/tutorial_gate.py` runs in CI on every push
(`.github/workflows/test.yml:42`). **It was already failing on `master` when this
session started**, at commit `be4d3b8` — S2's close, two commits back:

```
[tutorial-gate] FAILED - 1 violation(s):
- command-titles (1):
  docs/tutorials/three-module-pipeline.md: 'Dabbler: Open modules' is not a
  contributed command title in the extension's package.json
```

**The tutorial text was correct and the gate was wrong.** `Open modules.yaml` **is** a
real contributed command title in the extension's `package.json`. The gate's regex —
`r"Dabbler: ([A-Z][A-Za-z0-9 \-]*[A-Za-z0-9])"` — has no `.` in its character class,
so it captured `Dabbler: Open modules` and then correctly reported *that* truncated
string as non-existent. S2's tutorial is the first document in the repo to name that
command, which is why the latent defect surfaced then.

Fixed by allowing a dot **only when a letter or digit follows it**, so a title
containing one is captured whole while a sentence-final period stays outside the
match:

```python
r"Dabbler: ([A-Z](?:[A-Za-z0-9 \-]|\.(?=[A-Za-z0-9]))*[A-Za-z0-9])"
```

Two regression tests were added (**L-069-1**: ship a falsifier so the class cannot
silently re-open) — one asserting the dotted title is captured whole, one asserting a
sentence-final period is still not swallowed.

**On scope.** The spec's S3 *Touches* list does not include this file, and the set
has a non-goal reading *"No new extension or router code."* That non-goal is aimed at
**product gaps the walk reveals** (S4), not at a CI gate **this set itself turned red
two commits ago**. The alternative — rewording correct tutorial prose to satisfy a
buggy gate — would have damaged the deliverable to protect the defect. **This is
disclosed for adjudication; if the operator prefers it reverted and re-homed to a
follow-on set, the trim stands on its own without it.**

## Baseline — what was already true before this session

| Surface | State |
| --- | --- |
| `tutorial_gate.py` on `master` at session start | **RED** (exit 1), 1 violation — see above. Not caused by this session. |
| `tutorial_gate.py` after this session | **GREEN** (exit 0). |
| `ai_router/tests/test_tutorial_gate.py` | **85 passed** (83 before; this session adds 2). |
| Extension unit / Layer 2 / Layer 3 | **Not run, not armed.** No TypeScript, no Explorer-rendering surface, no state-file writer, no fixture touched. `requiresE2E: false`. |

**Layer 2 electron (`npm test`) is a known-broken harness on this machine** —
`@vscode/test-electron` fails to launch on VS Code 1.128.0 (`bad option:
--no-sandbox`). **A finding that it was not run is a known residual, not a defect of
this session.**

## Scope — what this session deliberately did NOT do

1. **No walk, no UAT checklist, no timings.** `requiresUAT: true` points at
   **Session 4**, which walks the tutorial *before* authoring the checklist. **A
   finding that the trimmed `adopt-dabbler.md` has not been walked is a known,
   pre-existing debt** — that document has *never* been walked — **and is out of
   scope here.** It is recorded as an owed follow-on.
2. **No edits to `three-module-pipeline.md`.** S2's deliverable closed VERIFIED. **A
   finding about the new tutorial's content is out of scope** unless the trim broke a
   reference into it.
3. **No `change-log.md` and no Step 9 review.** Both are set-terminal, in S4.
4. **No new prose teaching anything.** This session removes and reconciles. The only
   additions are the forward links the ladder requires and the one branch-protection
   note that replaces deleted stage 3.
5. **No release.** Nothing bumped, nothing published.
6. **Set 107's raw records were not touched**, deliberately.

## Verification evidence completeness (L-064-9)

Nine files were **deleted** and several edited. `git diff` alone would misrepresent
this change set, so the evidence bundle must carry `git status --short` alongside the
diff — deletions and the staged `git rm` are otherwise invisible. All work is staged
before evidence generation.
