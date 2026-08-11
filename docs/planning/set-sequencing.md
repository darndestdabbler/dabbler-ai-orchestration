# Set sequencing plan — as of 2026-08-11

> **Status:** operational plan, not a ruling. Written to survive the
> context of the session that produced it, so the next orchestrator (or
> the operator) can pick up without re-deriving anything.
>
> **Why it exists:** an unusually long working session on 2026-08-10/11
> produced a roadmap, three cross-provider consultations, two measurement
> corrections and four new or amended sets. Most of that reasoning lives
> in one AI context window that will not persist. This file is the index
> and the order.
>
> **The canonical *why* is
> [`docs/proposals/2026-08-10-smaller-framework-target-state.md`](../proposals/2026-08-10-smaller-framework-target-state.md).**
> This file is only the *what next*.

---

## 1. Where things stand

| set | state | note |
| :--- | :--- | :--- |
| 113 narrated-video-walkthroughs | not started (4 sessions) | independent of everything below |
| 115 work-explorer-session-node-ux | not started (4 sessions) | **S1–S3 fine; S4 blocked** — see its `step-ledger-findings.md` |
| 117 bounded-test-parallelism | **cancelled** (S1 complete) | losslessly restorable; S2–S3 pend a Layer 3 sizing decision |
| 118 test-retirement-and-coupling-budget | not started (3 sessions) | **premise A likely a measurement artifact** — see its `measurement-correction.md` |
| 119 close-preflight-and-doc-only-findings | S1–S2 complete, S3 in flight | shipped `evidencePaths`, the doc-only cap, and `close_preflight.py` |
| **120 strict-writer-and-one-projection** | **authored 2026-08-11, not started** | the missing prerequisite — status vocabulary + the single projection |

## 2. The order, and why

**1. Finish 119 S3.** In flight. Deletes ~5,165 LOC of unreachable
modules, fixes the backstop recovery path, and fixes the `cite_lessons`
staleness category.

**2. Set 120 — strict writer and one projection.** Authored and ready.
Small, and it unblocks *two* things: Set 115's step rendering, and the
extension carve's deletion of the duplicated TypeScript derivation.
Its defect is the one the operator sees daily.

**3. Guidance becomes executable** *(not yet authored — see §4)*.
Proposal steps 2+3: encode the five active lessons, collapse
`session-constitution.md` and `project-guidance.md`, adopt the retention
rules, and promote C-001/C-002/C-003 out of
[`guidance-candidates.md`](guidance-candidates.md).
**Unblocked as of 119 S1**, which shipped the doc-only cap that was its
stated prerequisite.

> **This set is the first real test of the doc-only cap.** It is exactly
> the prose-heavy work that cost Set 116 S3 three blocking rounds and
> ~$2.35. If the cap works, this set is dramatically cheaper than it
> would have been — and either way you learn something worth knowing.

**Steps 2 and 3 are interchangeable.** 120 is smaller and fixes a
visible defect; the guidance collapse compounds harder because every
later session then carries less context. Take 120 first only because it
is cheaper and its defect is in your face.

**4. Set 115, Sessions 1–3.** Titles, click-to-plan, the menu. Operator
has confirmed the context menus and click-to-open-spec are in daily use
and valuable. **Independent of everything — could run earlier if you
want a quick win.** Session 4 is re-authored or dropped *after* 120.

**5. The extension carve.** The bus-factor item, and the largest. Depends
on 120's projection for the §6.5 derivation deletion (~1,200–1,500 TS
lines, ~110 tests, plus the parity harness). Should come **last** among
the big items — it buys maintainability, not session speed, and benefits
from a fast loop rather than creating one.

**6. Set 118, re-scoped.** Its coupling premise (47 files / 1,485 tests)
appears to be a regex artifact; its guard-accrual premise (+29 test
functions/day, no set has ever retired a guard) is untouched and is the
stronger half. **Its own Session 1 builds the instrument that settles
this** — run S1, then decide whether S2–S3 survive.

**7. Set 113.** UAT legibility. Fully independent; priority is a value
call about whether UAT matters to you now.

**8. Set 117 S2–S3.** Only if Layer 3 stays large. If the webview
deletions land (35 → 26 scenarios) and model-level tests migrate to
Layer 2 (~8–12), bounded Playwright parallelism is worth much less than
when the set was authored.

**Unscheduled builds**, adopted but owned by no set:
the **sealed audit plan** and **random blind mutation / recall
measurement** (proposal §8a).

## 3. Standing cautions

**Author each set immediately before running it.** Tonight produced
direct evidence: Set 118's coupling premise is likely an artifact, and
Set 115 Session 4 rests on a 57-minute mean inflated by operator-away
time. **Both were authored ahead of time and their premises went stale
before they ran.** Take the measurements when you author, not months
earlier.

**Use medians, never means, for anything wall-clock.** Spans include
operator-away time — two sessions on record exceed 23 hours and neither
is effort. Set 116's spec had already ruled this: *"the median is the
honest signal and the maxima are not effort."*

**Fix the class, not the instance.** Three defects this week were patched
at the instance: the freshness exclusion list grows one entry per
incident; `EvidenceTooLargeError` got a catch at 1 of 5 sites; step
status had no allowlist at all. `L-069-1` ("fix every sibling site") is
already in preload and did not prevent any of them.

**Scope every `git commit` to explicit paths.** `git commit -- <paths>`,
never bare `git commit`, and never `git add -A`. A bare commit writes the
*whole index*, including another agent's staged work — this happened
twice on 2026-08-10 and swept 1,167 lines of an in-flight session into an
unrelated commit.

## 4. What is authored and what is not

**Authored and ready:** Set 120.

**Not authored, deliberately:** the guidance-executable set (§2 item 3)
and the extension carve (item 5). Both should be authored from
measurements taken at the time, per §3.

## 5. Artifact index

Produced 2026-08-10/11; this is where the reasoning lives.

| document | what it holds |
| :--- | :--- |
| [`proposals/2026-08-10-smaller-framework-target-state.md`](../proposals/2026-08-10-smaller-framework-target-state.md) | the canonical roadmap: requirements, gates, guidance model, Work Explorer, what is guaranteed to improve vs not, sequencing, estimate |
| [`proposals/2026-08-10-verifying-prose-is-where-the-time-went.md`](../proposals/2026-08-10-verifying-prose-is-where-the-time-went.md) | Set 116 S3's own instrumentation: where the loop's money went |
| [`proposals/2026-08-10-concurrent-monitoring-as-a-gate/`](../proposals/2026-08-10-concurrent-monitoring-as-a-gate/) | a rejected design, two provider reviews, and the three ideas worth keeping |
| [`session-sets/115-.../step-ledger-findings.md`](../session-sets/115-work-explorer-session-node-ux/step-ledger-findings.md) | the step-ledger root cause, the tree-vs-chat resolution, Session 4's contradiction |
| [`session-sets/118-.../measurement-correction.md`](../session-sets/118-test-retirement-and-coupling-budget/measurement-correction.md) | why that set's coupling number is probably an artifact |
| [`planning/guidance-candidates.md`](guidance-candidates.md) | guidance decided but not admissible while preload is at ceiling — C-001, C-002, C-003 |
| [`planning/terminology-sanctioned-writer.md`](terminology-sanctioned-writer.md) | the remaining "blessed" → "sanctioned" sweep across historical files |

## 6. The single open item with no owner

Everything above has a home except one thing, and it is worth stating
plainly so it does not get lost again:

> **Where does the *historical* status-token migration land if Set 120
> Session 2's operator ruling is (a) or (c)?** It rewrites ~281 entries
> across roughly a hundred session-set directories. Set 120 S2 executes
> it, but the ruling itself is the operator's and has not been made.
