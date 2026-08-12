# Set 127 Session 2 — remediation of round 1

**Round 1 verdict:** ISSUES_FOUND — 1 Major, 0 Minor (discovery, fan-out 2:
spec-conformance + failure-scenario lenses, both gpt-5.5).
**Supplementary pass (round 2):** VERIFIED, nothing new. The Major below is
the whole remediation subject.

---

## The finding, and why it was accepted

> **Major / Correctness — the Explorer can derive active/start-time fields
> from an INFERRED state when `session-state.json` is absent.**
> A legacy or consumer set with `spec.md` plus a non-empty
> `activity-log.json` and no state file is a path the extension already
> supports. `readSessionSets` infers an in-progress snapshot in memory;
> that inferred object reached `sessionFlightFacts`, so the tree could mark
> a step active and assign start times where Python's `build_rows` — which
> reads the real, missing file — derives neither.

**Accepted in full, and confirmed against the code before remediating
rather than taken on the verifier's word:**

- `tools/.../utils/fileSystem.ts` — when `statePath` does not exist,
  `rawSd` becomes `inferredState ?? inferStateInMemory(dir)`.
- `tools/.../utils/sessionState.ts:276-287` — that inference sets
  `status: "in-progress"`, `sessions[0].status = "in-progress"`, and
  `sessions[0].startedAt = <earliest activity-log dateTime>`.
- `ai_router/session_checklist.py:331` — `session_flight_facts` reads
  `read_session_state`, which returns `None` for an absent file, so Python
  answers `(False, None)`.

**It is broader than the finding states, in one direction worth recording.**
The active-step half needs seeded plan rows to be observable, but the
**start-time half does not**: with no plan rows at all, every logged row
still has `hasStarted = isStep`, so the chain would begin at the inferred
`startedAt` and date rows the CLI leaves blank. The inferred value is also
a *different quantity* — the earliest entry in the log, not a session's
start — so the divergence is not merely presence/absence but a wrong
number.

This is precisely the class this session's own conventions block declared
**Critical/Major by construction**: *"the two languages agree row-for-row …
a derivation that TypeScript computes differently from Python replaces 'no
signal' with 'a wrong signal'."* The severity is right and the finding is
this session's own defect — `normalizedState` was introduced by this
session, and it was wired to `sd` unconditionally.

## What was changed

| site | change |
| :--- | :--- |
| `tools/.../utils/fileSystem.ts` | `const stateFileOnDisk = fs.existsSync(statePath)` is captured where `rawSd` is resolved (replacing an inline `existsSync`, so there is no second stat and no new TOCTOU window), and `normalizedState = stateFileOnDisk ? sd : null`. A comment records the divergence, the two quantities, and that the inference still drives bucketing. |
| `tools/.../test/suite/fileSystem.test.ts` | `a set with NO state file arms no derivation, whatever the log says` — stages the existing in-flight fixture, deletes `session-state.json`, and asserts the set still buckets `in-progress` and still renders rows, but `flight` is `{ inFlight: false, startedAt: null }` and every row has `isActive === false` / `startedAt === null`. |

**One line of behaviour changed.** The inference is untouched: a state-less
set still buckets as in progress, still lists its session rows, and still
renders its step rows. Only the flight facts are withheld — which is the
acceptance criterion's own split.

**Nothing in Python changed**, and nothing needed to: Python was already
correct here. The corpus case `no-state-file-means-no-derivation-at-all`
already pinned the intended answer for both languages; what was missing was
that the extension never actually reached that path, because `readSessionSets`
substituted a synthesized state before the model could see the absence.

## Acceptance criterion (JUDGMENT), and how it is met

> *For a session set with `spec.md` + nonempty `activity-log.json` and no
> `session-state.json`, `readSessionSets` may still use in-memory inference
> for set/session bucketing, but the step ledger flight facts must be
> `NOT_IN_FLIGHT` (`{ inFlight: false, startedAt: null }`) and the Explorer
> rows must match Python `build_rows` with `isActive=false` and
> `startedAt=null`.*

Met on both halves, and **the criterion discriminates**: with the fix
reverted (`normalizedState = sd`) the new test fails with exactly the
divergence the finding describes —

```
+   inFlight: true,
-   inFlight: false,
```

— and passes with the fix in place. That pre-fix/post-fix pair is the whole
point of the criterion, so it was run rather than asserted.

**Tests:** targeted run of `fileSystem.test.ts`, `sessionStepModel.test.ts`,
`workExplorerTreeModel.test.ts`, `uatMatrixFixtures.test.ts` — **248
passing, 1 pending, 0 failing**. `tsc --noEmit` clean.

## Run-of-record consequence, recorded honestly

This session ran its **full** pytest (752 s) and Playwright (350 s) suites
*before* verification, which is the wrong order — the constitution's Steps
5/6/8 put full suites after verification and remediation, precisely so a
remediation like this one does not stale them. It did. Both runs predate
this fix and are no longer valid evidence for the tree as it now stands.

The ordering error, its cause (this session's spec compressed
"full suites; verify; close" into one step, in the wrong internal order) and
the proposed structural fix are recorded in
`docs/planning/session-step-skeleton-and-verification-cost.md`. The runs
will be re-taken after remediation-review, before close.
