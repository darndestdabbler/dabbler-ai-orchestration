# Change log — Set 134: ceremony cost, and what to cut

**Set:** `134-ceremony-cost-and-what-to-cut` (3 sessions)
**Ships:** a preload **15.8% smaller** (11,644 → 9,802 tokens read every
session), four ceilings ratcheted down to match, a closed severity vocabulary,
and three measurement documents — two of which refute the numbers this set was
built on.

---

## The set in one line

The operator's standing concern was that every attempt to pare this framework
down ends with it larger. This set tried to measure why. **It refuted its own
premise in Session 1, confirmed a different defect in Session 2, and in Session
3 cut context rather than minutes — then failed its own line-count test.**

All three outcomes are reported as they happened. A reduction set that only
publishes its wins is the thing it is supposed to be fixing.

---

## Session 1 — the 2.3× does not exist

The spec was built on *"work costs what it always did; each ceremony step costs
2.3× what it did."* Re-derived over 255 sessions, that number ranges
**1.01×–2.96×** on six defensible method choices — including **flat** under the
spec's own four named step keys, where it is *work* that rises.

The dated cause was not a behaviour change. **2026-08-07 is the day Set 111
landed `sN-rounds.jsonl` and `test-runs.jsonl`**: the "before" cohort was not
measured worse, it was not measured at all. The set's own instruments created
the discontinuity it was convened to explain.

What survived and funded the rest of the set: verification round marginal cost
**+17.9 min** (R² 0.625), `remediation-review → remediation-review` **2,332 min
across 62 transitions**, suite runtime **18.6 min/session**, and close execution
at **0.2 min** — confirmed *not* a cost.

## Session 2 — severity is a constant, and the gate reads it anyway

The 92%-Major figure was **confirmed, and is worse than published**: 98.9–100%
Major with **zero Minors in the last 49 sets and 698 findings**. The field
carries 0.511 bits; the gate's answer carries 0.194.

The defect is **(b) the gate reads the wrong signal**. *"Only a Critical/Major
finding continues the loop"* is, in this corpus, operationally identical to
*"any reported finding continues the loop"* — because the reviewer template
already made that decision when it decided what was worth reporting. One round's
course has ever been changed by severity, and **106 of 107 loop terminations
came from a round with no findings at all**.

Session 2 proposed **no remedy**, correctly: every remedy that makes the loop
stop earlier is a verification reduction and the operator's decision. It shipped
the closed vocabulary instead — and learned something more transferable than the
vocabulary itself when Round 1 caught the first attempt:

> **A refusal is only cheap where the caller can retry for free.** Set 120's
> `require_step_status` refuses an orchestrator running a CLI — re-run it,
> nothing is lost. The same shape inside a paid, stateful, bounded loop does not
> refuse a value, it **destroys a transaction**. Porting a known-good pattern
> means porting its preconditions too.

## Session 3 — cut context, not minutes

Re-scoped by operator ruling after Session 1: the minutes hypothesis had lost
its number, and the context hypothesis (§4) named things that could be
**deleted** rather than deferred.

### What came out of the preload

| file | before | after | Δ |
| :--- | ---: | ---: | ---: |
| `docs/planning/lessons-learned.md` | 2,269 | **851** | **−1,418 (−62%)** |
| engine files (`GEMINI.md` repr.) | 1,922 | **1,647** | −275 |
| `docs/planning/project-guidance.md` | 3,394 | **3,245** | −149 |
| `docs/session-constitution.md` | 4,059 | 4,059 | 0 |
| **TOTAL read every session** | **11,644** | **9,802** | **−1,842 (−15.8%)** |

**`lessons-learned.md` was 60% a changelog of its own curation.** Five tables
recording *where lessons used to live* cost **1,371 tokens**, against **436
tokens (19%) of live lessons** — three of them. Every rule those tables point at
already lives in `project-guidance.md`, which is *also preload*, so the pointer
was paid twice and bought once. All five moved whole to `lessons-archive.md`.
No id was lost; `guidance_search --archive` still finds every one.

The engine files gave up five sections that were **pure pointers the
constitution already carries inside the same preload** — quick-start, the state
schema, close-out, the worktree layout doc, and a decision-rights section whose
own text said *"are in `docs/session-constitution.md` (preload)"*. Cut in
lockstep across all three files; `GEMINI.md` is still the largest, so the
manifest entry did not move.

`project-guidance.md` gave up five `TODO` stubs — consumer-repo scaffolding that
**134 sets paid for and no session ever filled in**. The stub list moved to the
uncapped `guidance-lifecycle.md`, so the template value survives at zero
recurring cost.

**Ceilings were ratcheted to measurement, not to measurement-plus-slack.** The
win is banked as 1,842 fewer tokens read *every session*, not as headroom. That
choice preserves the property the manifest exists for — at ceiling, adding prose
requires removing prose — and it was tested on this very session: adding the
artifact-cap line to the constitution put it **2 tokens over**, and 11
characters had to come out of the same edit to pay for it.

### The per-session artifacts: three capped, two exempt, nothing built

| artifact | measured | ruling |
| :--- | ---: | :--- |
| `activity-log.json` description | 3,130 entries, 218,391 w, **69.8 w/entry** | cap **40 w** |
| `ai-assignment.md` prose per block | 284 blocks, **332 w/block** | cap **250 w** |
| `decisions.jsonl` per decision | 211 decisions, **361 w** | cap **400 w** |
| `sN-conventions.md` | 81 files, 1,078 w/file | **exempt** |
| `disposition.json` | 120 files, 702 w/file | **exempt** |

Against the corpus as it stands the three caps are worth **164,674 words** —
52.7% of all step descriptions, 43.1% of all assignment prose.

The two exemptions matter more than the caps. **`sN-conventions.md` was not
capped because capping it would be a verification reduction** — it is G-010, and
it is what stops Round 1 burning findings on an agreed baseline. Trimming what a
paid reviewer reads to make this set's headline number larger would have spent
the one currency the set was barred from spending. `disposition.json` is
schema-shaped and machine-gated; its size is owed to a reader, not to
discretion.

Every cap is a **documented convention in the authoring guide**, enforced by
nothing. A word-count validator on `log_step` was considered and refused: it is
the framework's self-diagnosed characteristic failure — a new governor over the
old mechanism — and Session 2 had just established why a refusing writer inside
a stateful loop is dangerous.

---

## The failure, stated as one

**On the metric the spec named — lines removed minus lines added — this set
fails.**

| | lines |
| :--- | ---: |
| preload files (the target) | **−206** |
| `lessons-archive.md` (text *moved*, not written) | +104 |
| authoring guide + lifecycle doc (new convention) | +63 |
| `router-config.yaml` (ceiling provenance) | +6 |
| this set's own session bookkeeping (log, assignment, ledgers) | +159 |
| **this change log** | **+195** |
| **Session 3's verification ceremony** (conventions block, remediation sidecar, raw round artifacts, acceptance results) | **+325** |
| **NET** | **+646** |

The spec anticipated exactly this and forbade explaining it away, so: **the
preload target succeeded and the line-count target failed — by 3.1× the size of
the cut.** They are different measurements, and only one of them is paid every
session.

Three numbers are worth sitting with:

- **−206 lines came out of the always-read tier; +852 went into files
  describing, verifying and recording the removal.**
- **The verification round-trip alone (+325) cost more lines than the entire
  preload cut removed (−206).** One conventions block, one remediation sidecar
  for one accepted finding, and four raw round artifacts.
- **This change log alone (+195) is nearly the size of the cut it reports.**

None of that is waste in the ordinary sense — the verification found a real
defect (below), and the raw artifacts are un-editable evidence by design. It is
the honest shape of the thing: **the framework cannot record a reduction
without writing several times more than it removed.** That is the operator's
standing concern, reproduced under measurement by the set convened to explain
it.

**The sharpest instance is this set's own log.** Set 134 ran at **250.6 words
per activity-log entry — the highest of all 126 sets with a log**, against a
corpus mean of 69.8. Session 1 emitted 1,666 words of step descriptions nothing
asked for, and *named that as its own worst offender* in the same document.
A set convened to cut ceremony wrote 3.6× the corpus average of the one
artifact it was measuring, while measuring it.

Session 3 held to its own cap (**25.7 w/entry** across its logged steps, against
the 40 it wrote), which demonstrates the cap is livable — and that the cost is
invisible from the inside. It is written one conscientious sentence at a time.

### What verification caught, and why it belongs here

Round 1 (`gpt-5.5`, fan-out 2) returned **two blocking Majors — the same defect
from both lenses independently**: a 16-line scratch Python helper
(`.tmp_s3_log.py`) still sitting in the repo root, in a session whose governing
rule is **no new module** and whose own conventions block asserted *"No Python
module was added, changed, or deleted."*

Accepted without argument and fixed by removal. But the shape of it is the
point: **the scope claim was true of the intended diff and false of the actual
tree**, and nothing on this side checked the two against each other. A
different provider did, immediately, twice. That is L-064-8's failure mode — a
document inheriting a claim it did not re-verify — one surface over, and it is
cheap to prevent: a conventions block asserts something about the tree, so read
`git status --short` before routing it.

The supplementary completeness pass and the remediation review both returned
**VERIFIED**, and no by-design exclusion was challenged — including the two most
likely to draw fire: ratcheting ceilings to zero headroom, and shipping caps
with no enforcing validator.

---

## Residuals, with owners

| residual | owner | why it is open |
| :--- | :--- | :--- |
| **The loop gate reads a constant** | **operator** | Every remedy shortens the loop = verification reduction, hard carve-out. Session 2 named a measured, non-constant candidate signal: `duplicate-of` is 22.8% of fix verdicts and **rises** with round depth (20.6% → 23.0% → 25.2%). Evidence, not a proposal. |
| **No committed instrument for routed-call latency** | operator | The only one that measures it is gitignored and unreproducible from a fresh checkout. Any latency claim is currently unverifiable; Session 1 quarantined its own figure rather than use it. |
| **1,427 distinct `stepKey` values** | orchestrator, next set | Returns zero minutes, so it stayed off the minutes list — but it is why Session 1's by-step-key breakdown **could not be produced at all**. Costed at ~40 lines in `session_log.py`, which already hosts the pattern. |
| **29 call sites still `text=True` with no `encoding=`** | standing (L-079-1) | Pre-existing; untouched here. |
| **`vsix-first-run-walkthrough.spec.ts` times out under full-suite load** | orchestrator, next set | Now cost **two sessions** of this set the same way: fails at the 300s timeout in the full Playwright invocation, passes alone in ~46s, with a TypeScript-free diff both times. Recorded as a composite pass under G-004 in both sessions. Two independent reproductions make it a flake worth fixing, not a curiosity. |
| **Set 134 has no `ai_router/changelog.d` fragment** | **the next set (a release)** | Session 2 added public API — `CANONICAL_SEVERITIES`, `is_valid_severity`, `suggest_severity`, `validate_severity`, `require_severity`, `InvalidSeverityError`, `canonical_severity_for_write` — and closed the `submit_verdict` severity enum. None of it has a changelog entry. A fragment was drafted in Session 3 and **withdrawn**: `changelog.d` lives under `ai_router/`, which all three suites declare as `covers`, so adding one Markdown file staled every run of record and the verification stamp — ~20 minutes of re-runs plus a paid round, for a file no assertion can reach. Nothing ships in this set, so nothing is yet untrue; the release set must assemble the changelog anyway. Journaled in `decisions.jsonl`. **Write changelog fragments early, before the suites run.** |

## What should come next

Routed at Session 3's Step 3.5, and the analyst rejected both
framework-introspection candidates unprompted: **do product work next.** The two
open framework residuals are *"a gitignored script that needs committing and an
operator decision that needs making. Neither requires a session set."*

> *"The extension carve has been deferred for at least three sets; it is still
> correctly scheduled last — but 'correctly scheduled last' should eventually
> mean 'doing it now.'"*

Three sets of introspection have confirmed the operator's concern, named the
defects, and costed the residuals. The recommendation is to stop measuring the
instrument that measures the instruments.
