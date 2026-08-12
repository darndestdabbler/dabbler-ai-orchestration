# Session 3 verification conventions — Set 127, Session 3 of 3

Read this before the change set. It states the agreed baseline so a round
spends its findings on real defects rather than on the things already
settled here (L-064-10).

## What this session was asked to do

Spec: `docs/session-sets/127-the-active-step-shows-in-progress/spec.md`,
**Session 3 of 3: The round sequence posts its own checklist**.

Sessions 1 and 2 closed the operator's reported defect on two surfaces:
the CLI checklist and the Work Explorer now derive which step a session
is on, and when it started. Session 3 is scoped by the spec's own
sentence — *"The step checklist and the Explorer are the operator's
window into where a session is"* — and closes the same gap on the third
surface: the step-checklist post at a **verification-round boundary**,
whose signal depended on a human being at a terminal during a sequence
no human watches.

This is the **set-terminal** session, so it also carries `change-log.md`,
`disposition.json`, the Step 9 guidance review, and the router changelog
entry the spec assigns here.

## The problem, precisely

`gate_checks.check_checklist_posted` enforces the cadence positionally:
for transitions t₁ < t₂ < … < tₖ, each tᵢ needs a post in `[tᵢ, tᵢ₊₁)`.
One transition type cannot realistically be met. A blocking discovery
round forces `discovery → supplementary → remediate →
remediation-review` in immediate succession — minutes apart,
machine-driven, with the orchestrator mid-remediation and nobody at the
terminal. Set 126 S2 missed rounds 2 and 3 that way and it was not the
first. A miss cannot be repaired (you cannot post into the past), so the
only exit is an operator-attested waiver: a recurring, structurally
predictable omission landing on the operator's desk as paperwork.

## The decision this session was not allowed to take alone

The spec required the mechanism to be **ratified before the session
started**, because it changes what a close-time gate can catch — the
decision-rights hard carve-out (`verification-reduction`), which
`decision_journal` refuses to let the orchestrator self-authorize.

Journalled at registration, **before** any implementation, with
`authority: "human"`, `rubric_line: "escalate-to-human"`,
`verification_effect: "reduces"`, and both rejected options recorded with
their consequences:

1. **Auto-render inside `verify_session`** — chosen by the operator.
2. Orchestrator discipline only — rejected; the evidence says it decays.
3. Re-arm the gate as blocking — rejected; it would have refused Set 126
   S2's close over paperwork the orchestrator could not have filed.

**A finding that re-opens this choice is out of scope.** A finding that
the *implementation* does not match what was ratified is in scope and
welcome.

## The change set, in one paragraph

`verify_session.post_round_checklist()` renders the step checklist and
records it through `session_checklist.record_post` — the same
render-then-record pair, in the same order, that the CLI uses. It is
called from **exactly one place**: the line immediately after
`record_round_completed()` in `run()`. `gate_checks.py` changes only in
`check_checklist_posted`'s **docstring**. The rest is tests
(`TestRoundBoundaryPostsItsOwnChecklist`, 9 functions) and the cadence
documentation that taught the obligation the tool now discharges.

## Why that call site, and what it buys

Placing the post immediately after the ledger record is what pairs a post
with a ledgered round **and nothing else**. Every path that does not
complete a round has already returned above that line:

| path | returns at | posts? |
|---|---|---|
| refused past its bound | `EXIT_USAGE`, pre-call | no |
| `--dry-run` | `EXIT_OK`, before routing | no |
| first-call route failure | `EXIT_ROUTE_FAILED` | no |
| `verification_unavailable` | `EXIT_VERIFICATION_UNAVAILABLE` | no |
| drifted-template stamp refusal | `EXIT_STATE` | no |
| **close backstop** | never enters `run()` — `close_backstop.py` calls `record_round_completed` directly | no |

The backstop case is deliberate and pre-existing: a backstop round runs
in-process *during* the close, so its "post after this" window opens
after the last moment anyone could post into it, and
`_checklist_transitions` already skips it.

## Suite baseline — the one expensive suite this session owes

- **pytest (full, `-n auto`)**: see `test-runs.jsonl` for the recorded
  run of record, taken after the last code change.
- **Playwright (Layer 3) and mocha (Layer 2) are NOT owed.** `covers` is
  by path: this session touched `ai_router/verify_session.py`,
  `ai_router/gate_checks.py`, `ai_router/tests/`, and docs. None of those
  is an Explorer rendering surface, a listed state-file writer
  (`session_state.py` / `start_session.py` / `close_session.py`), the
  extension manifest, or the fixture harness, so L-064-12's trigger list
  is not hit. Session 2 ran all three layers for the rendering change.

Targeted pre-verification run: 408 passed across
`test_verify_session_phases.py`, `test_verify_session.py`,
`test_gate_checks.py`, `test_gate_checks_local_only.py`,
`test_close_backstop.py`, `test_close_preflight.py`,
`test_session_checklist.py`.

## Falsifiers were proven to bite, not merely observed green

Seven defects were planted against the finished suite and **every one was
caught** (L-112-1 — only a planted violation separates a gate that finds
nothing from one that checks nothing):

| planted defect | failures |
|---|---|
| the round-boundary call is deleted | 4 |
| it posts before the round exists (so `--dry-run` and a failed route post too) | 4 |
| the LEDGER WRITER posts, so a close-backstop round posts too | 3 |
| the gate EXCUSES round transitions instead of the tool posting | 1 |
| the positional window is widened to "any later post covers it" | 1 |
| the render happens but is never recorded | 3 |
| the fail-open skip is SILENT (L-079-1) | 1 |

The harness patched one file at a time, ran the new falsifiers, and
reverted; it lived outside the repo and `git status` is clean of it.

## By-design decisions this session made — please DO scrutinise these

1. **The post is placed after `record_round_completed`, not at the very
   end of the report.** Ordering the two writes together is what makes
   "a ledgered round always has a post after it" a property of one
   adjacency rather than of everything in between. The round summary and
   the "Next action" block still print last, so the operator reads
   *what happened → where the session is → what to do next*.
2. **Both failure modes fail OPEN and are NAMED on stderr** (L-079-1):
   an unimportable/unrenderable checklist, and a refused ledger append.
   Bookkeeping appended after a metered call must never turn a round the
   operator has already paid for into a failure — and a silent skip would
   be the invisible omission this whole mechanism exists to end.
3. **`check_checklist_posted` itself is untouched in behaviour.** The
   change could have been implemented inside the gate (excuse the round
   transition) and was not: excusing it would also excuse a round the
   tool failed to post for. The gate still derives round transitions from
   `sN-rounds.jsonl` and still applies the windows to them; the two
   mutations that implement it the other way are both caught above.
4. **The reduction is stated in the docs, not hidden.** The authoring
   guide and the gate docstring both say plainly that this transition can
   no longer be missed and therefore can no longer be reported, and both
   cite the journalled operator decision.
5. **The constitution's Step 4 got SHORTER, not longer.** It is at its
   4,000-token preload ceiling and ceilings ratchet down only
   (`guidance_report --check` verified after the edit), so the removed
   obligation paid for the sentence that replaced it.

## By-design exclusions — please do not report these as defects

1. **The gate's positional windows, the waiver path, and every other
   transition type are unchanged.** That is a spec non-goal, and it is
   asserted directly: `test_the_other_transition_types_still_bind` and
   `test_the_windows_still_bind_against_a_hand_built_ledger`.
2. **No synthetic post records.** Every post is produced by an actual
   render through the existing writer.
3. **No new writer and no `session-state.json` change.** Set-wide
   non-goals.
4. **`check_checklist_posted` stays advisory.** Re-arming it as blocking
   was option 3 and the operator rejected it; the Set 116 S3 demotion
   stands.
5. **The five legacy prose-in-`status` activity-log entries are NOT
   backfilled.** A set-wide non-goal, now recorded as a deliberate
   decision in `docs/planning/work-explorer-in-progress-step-icon.md`.
6. **No version bump and nothing published.** The router changelog entry
   lands under the existing `[Unreleased]` structure; publishing is
   operator-only.
7. **`ai_router/CHANGELOG.md`'s Set 127 entry covers S1 and S3 together.**
   S2's extension-side work is in the extension changelog, which S2 wrote.

## Severity rubric for this round

Grade by **consequence**: probability the stated failure scenario reaches
a real user × impact (L-095-1 / project-guidance). Low probability **or**
low impact is Minor. A finding with no nameable failure scenario is a
nit.

The thing that must not regress here is **the narrowness of the
reduction**: a post recorded for a round that did not happen, a post the
operator was never shown, or any *other* transition type quietly ceasing
to bind would each replace a reportable omission with a false all-clear —
strictly worse than the paperwork it replaced, because the operator would
then have a reason to believe it. Findings in those directions are
Critical/Major by construction.
