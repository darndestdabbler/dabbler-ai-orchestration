# S4 verification conventions — read this before Round 1

Up-front conventions block per `project-guidance.md` → Workflow Expectations
(L-064-10). Its purpose is to keep Round 1 on real defects rather than burning
findings — and re-verify rounds — on an agreed baseline.

## What this session is

Set 108 Session **4 of 4**, set-terminal: *"Walk it, then cut the checklist."*
The walk comes **before** the checklist, on Set 107's evidence that a checklist
written from a document rather than from a walk documents intent, not reality.

**Its deliverables are a record, a set of fixes, and a checklist** — not a
feature. The set ships **documents only**: no extension code, no router feature
code, and therefore **no release and no version bump**. That is by design in the
spec (`requiresE2E: false`, with the stated rationale that there is no Dabbler
behaviour for an E2E test to cover).

## The severity rubric (L-095-1) — apply it

Grade by **CONSEQUENCE**: probability the stated failure scenario materialises
for a real reader × impact on the deliverable's objectives. **Low-probability OR
low-impact is Minor even when technically correct. No plausible failure scenario
⇒ Minor by definition.** A finding must name a specific reader, at a specific
step, who stalls or is misled.

## What was actually done

1. **The tutorial was walked — Day one and Parts A–D** — by building all three
   .NET 10 services for real, in a fresh repository at `C:\temp\dabbler-108-walk`
   (six commits, 84 tests). **The walk is PARTIAL and says so:** the Dabbler
   lifecycle each part routes through (`Dabbler: New Module`, the Work Explorer,
   plan set → decomposition set → implement) was **not executed**; the code was
   written directly. `s4-walk-evidence.md` §2.1 is the full statement.
2. **Five defects were found and all five fixed** in
   `docs/tutorials/three-module-pipeline.md` (+51/−9 lines).
3. **A 4-item UAT checklist** was cut from the walk.
4. `s4-walk-evidence.md`, `change-log.md`, the Step 9 review, and the advisory
   path-aware critique.

## Three things that are *deliberate*, not oversights

These are the most likely sources of a wasted Round 1 finding.

**1. The walk was performed by the orchestrator, not a human — and the operator
chose that.** The spec's Step 1 requires the walk's staffing to be agreed with
the operator; three costed options were put and the full A–D orchestrator walk
was chosen. This is recorded in `ai-assignment.md`. A finding that the walk
"should have been done by a human" is re-litigating a settled operator decision.

**2. The walk's limits are declared, not hidden, and they are extensive.**
`s4-walk-evidence.md` §2 and §7 state plainly that: the prerequisites section
cannot be falsified on the authoring machine; the reading experience is
under-tested; no human has seen the Work Explorer; and **the per-part human
timings the spec asks for do not exist and cannot be produced by this walk**.
Pointing at any of these is agreeing with the document, not finding a defect —
*unless* you can show a limit that is claimed to be handled and is not.

**3. `verification.md` was not added, and the UAT checklist is unfilled.**
`Passes: false` throughout means **not yet walked by a human**, not "failed", as
its own preamble states. The human walk is the *next* step, which is what the
checklist exists to drive.

## The evidence that does exist, and how to read it

The walk's strong claims are all machine-checkable, and each was checked rather
than asserted:

| Claim | How it was established |
| --- | --- |
| The contract sections are sufficient to build against | Three response bodies came back **byte-identical** to the tutorial's printed strings (379, 421 and the unknown-schema envelope), compared programmatically against the literal document lines. Contract 2's `400` likewise. |
| Part D changes no code | Against a **pinned Part C baseline**, with `git add -A` first so untracked source cannot hide and `bin/`+`obj/` excluded: **0 files**. The whole source diff for the Part D range is one `appsettings.json`. The check was confirmed to be a real falsifier by planting a line and watching it appear. (Round 4 correctly rejected the first version of this check; §5 records why.) |
| `watcher`'s tests need nothing running | Both services stopped and **confirmed `DOWN` by curl**; 26 tests then passed in 54 ms. |
| No part leaves state behind that a later part needs | With all five services down, each suite runs alone: 29 / 29 / 26 = **84 green**; then both boundaries re-entered from cold — Part A's finish line again byte-identical, Part B's stored batch and duplicate rule intact. Whether a *person* can resume from the document is explicitly **unverified**. |
| Two independent implementations interoperate | The walk's `watcher` drove the **published answer key's** services; batch stored, read back from their database, `404` on the walker's own. |

**Contract-only construction is what makes the byte-identity meaningful.** The
answer key's source was not opened until Part D. If it had been, the result
would prove only that the walker could copy.

## Baselines — agreed, not findings

- **Repo suite:** `pytest -m "not e2e"` — the invocation `pytest.ini` names as
  the pre-commit one. Result recorded in the disposition. The suite is **slow on
  Windows (~50 min)**, which is git-subprocess spawn overhead across ~3,000
  tests, not a hang.
- **`tutorial_gate.py`: exit 0** after the five fixes.
- **No version bump, no changelog entry in the packages.** Documents only.
- **The walk repository at `C:\temp\dabbler-108-walk` is not committed to this
  repo** and is not meant to be. It is scratch evidence; the record of it is
  `s4-walk-evidence.md`.
- **The temporary mocha harness** used to drive the day-one manifest through the
  shipping Explorer functions was **deleted** after use and is deliberately not
  part of the diff.

## Where a real Major would be, if there is one

Aim here rather than at the baseline:

1. **A fix that is wrong or that broke something.** Five edits landed in a
   1,480-line tutorial. Do the `global.json` snippet, the `dotnet-ef` command
   and the widened race callout say true things, in the right place, without
   contradicting text elsewhere in the document?
2. **A defect the walk should have caught and did not**, on a path the walk
   claims to have covered.
3. **A checklist item that cannot be followed** — a command that will not run as
   printed, an Expectation that is not a literal string, or an item that asks
   the human to re-verify what the walk already proved (the checklist explicitly
   sets out not to).
4. **An overclaim.** Anywhere the evidence is narrower than the sentence
   describing it — in `change-log.md`, `s4-walk-evidence.md`, or the disposition.
   This is the highest-value place to look, and the walk deliberately wrote
   §2 and §7 to make it checkable.
