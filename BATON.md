# BATON: the framework is built, the walkthrough runs, the operator has not walked it yet

**Date:** 2026-08-25
**From:** Claude Opus 5 (1M context)
**To:** the next session
**Status:** Clean and pushed on `design/solution-decomposition`. Nothing in flight.

---

## Read this first

**Work happens on `design/solution-decomposition`, not on
`experiment/verification-pipeline-v3`.** `AGENTS.md` still names the old branch
and still carries the LOC and module ceilings; `docs/operator-decisions.md`
governs and has set those aside for the rebuild. **A reviewer reading only
`AGENTS.md` has already reported this work as violating rules that were lifted.**

**The next thing that happens is the operator walking through
`examples/csv-walkthrough/` himself.** He said today or tomorrow morning.
Everything below is context for whatever he finds.

## What is built

**The six-step framework is real and has been run end to end.**

| Module | Does |
| --- | --- |
| `solution.py` | Declares components, kinds, contracts, dependency edges. `usedBy` is derived, never declared. |
| `contractdoc.py` | Renders a contract as tables plus a generated mermaid diagram. |
| `workflow.py` | Folds state from an append-only event log. A send-back is an ordinary event. |
| `stepreview.py` | Sends a step's output to two vendors that did not write it, and files each reply verbatim. |
| `scripts/skimcheck.py` | Redacts a document to what a skimmer sees; audits paragraphs for a point sentence. |
| `scripts/uat_follow.py` | Drives a weak model through a document as if it were the reader. |

**759 Python tests, 179 TypeScript, lint clean.**

## The two things most likely to bite you

**There is no round cap on `workflow review`.** It calls vendors until told to
stop. The developer-approval gate lets work move past a reviewer that will not
clear it, but nothing limits the spend.

**`.dabbler/` is git-ignored.** Everything the status command and the Explorer
show is local to the machine that did the work. A fresh clone has no history at
all, and a team cannot see each other's progress. This is the largest gap
between what the walkthrough demonstrates and what staff could actually use.

## What was learned that is not in the code

**A prose document has no bottom.** Five real cross-vendor rounds on one plan
returned four Major findings every time — each round's findings genuinely new
and genuinely correct. "No Major findings" is not a state anyone reaches, which
is why steps 1 and 2 end with a person rather than a clean review.

**Instructions are now tested by driving weak models through them.** Three
models from three vendors — Luna, Gemini Flash, Haiku — get through the
walkthrough under skim redaction. The first attempt never finished at all.

**The method lies in two ways, and both look like real findings.** A harness bug
gets scored against the document, and a weak model confabulates. Four harness
bugs and one hallucinated contract clause so far. **Reproduce every finding by
hand before acting on it.** This is the rule that matters most in this file.

**Structure carries meaning, because prose is not read.** The rules are in
`docs/skim-resilient-writing.md` and they are the operator's own. The cheapest
check needs no model: extract a document's bold sentences and read them as a
column. If they do not instruct, the document does not instruct — that found a
defect three rewrites and a passing full-text run had missed.

## Still unproven, and must not be claimed

**That decomposition pays.** The HL7 study ran on one component and never varied
decomposition. `docs/decomposition-experiment-design.md` is designed and unrun.

**That a consumer can write a good contract.** The contract kit proves a provider
matches its scenarios, not that the scenarios match what a consumer needs. The
`pilot/` exercise in the eval repo exists to test exactly this and has not been
run.

**Anything the Solution Explorer looks like in a real VS Code.** A drawing of the
intended tree exists, built from the operator's own glyph files. Nothing has been
rendered by the product.

## Two things a next session must not undo

**The contract deliberately omits `PID-6 mothersMaidenName`.** The reference
de-identifier masks it and its unit tests require it — that is the answer key,
and the experiment uses that field to test whether contract discipline produces
such coverage. Do not fill the gap.

**Findings are never erased.** An approval over live objections records how many
it overrode. Nothing in `.dabbler/runs/` is hand-edited.

## Environment

Ubuntu laptop. Node 18 and the venv both work; `.venv/bin/python` is an editable
install, so `python -m ai_router...` works from anywhere once the venv is active.
Provider keys are in `DABBLER_*_API_KEY` env vars — **they were printed into a
session transcript on 2026-08-25 and should be rotated.**
