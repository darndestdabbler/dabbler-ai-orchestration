# Session 3 conventions and baseline — Set 111

Read this before the work. It states what this session is, the suite
baseline, the release contract, and the by-design exclusions, so the
round spends its findings on real defects rather than on the agreed
starting state.

## What this session is

Set 111 Session 3 of 4: **decision rights and education mode**. One new
`ai_router` module, two new canonical sections in the workflow doc, and
a re-drawing of an existing mechanism:

1. **The decision-rights rubric is canonized** in
   `docs/ai-led-session-workflow.md` → *Decision rights — the rubric*.
   Decisions route by **whose authority they need**, not by how much
   judgment they take. Four classes stay human (external or
   hard-to-reverse consequences, underivable value trade-offs,
   accountability sign-offs, and the hard **verification-reduction**
   carve-out); everything judgment-shaped is AI-decidable under six
   ordered tiebreaks (goal over letter → prefer reversible → simpler
   code / fewer tests → defer to an existing gate → cross-provider
   consensus → human).
2. **`ai_router/decision_journal.py` is the blessed writer** for a
   per-set `decisions.jsonl`: question, decision, `authority`, the
   **rubric line that fired**, the **options considered** (each with its
   consequence and reversibility), overall reversibility, and the
   declared `verification_effect`. UX-preference deferrals carry
   `uat_decide: true` for Session 4's UAT *Decide* section.
3. **The carve-out is enforced.** `record_decision()` refuses to write a
   `verification_effect: "reduces"` record under `authority="ai"`; the
   operator's own record requires a non-empty `operator_attestation`.
4. **Education-mode briefs** are canonized as the required format for
   *any* operator stop (`docs/ai-led-session-workflow.md` →
   *Education-mode briefs*): where the set stands / the question in one
   sentence / options with consequences / recommendation with confidence
   / the default on no answer, batched rather than trickled.
5. **Decision-time consensus is re-drawn as tiebreak 5** of the one
   rubric rather than a parallel mechanism with its own human-only vs
   consensus-eligible split.

The authority is
`docs/proposals/2026-08-04-verification-loop-parallelisation-vs-acceptance-criteria.md`
§11 (the operator-directed decision-rights bullet, which the spec names
as "the spec" for this session), plus the spec's Session 3 plan.

## PLEASE REVIEW: Session 2's owed residual, carried into this round

**This is the first item this session owes, and it is deliberately in
this round's evidence.** Session 2 closed via operator-attested
`--manual-verify` after its close backstop refused six consecutive
close attempts. Two of those fixes landed with executable regression
tests and a green full suite but were **never seen by a routed
cross-provider round**:

1. **Backstop round 9 — stale acceptance evidence.**
   `verify_session.acceptance_evidence_is_stale()` +
   `assemble_acceptance_block()`. An acceptance result is evidence about
   **one** tree (the `fixedTree` the harness ran against); if
   substantive work landed afterwards, rendering it as criteria-closed
   is the exact false closure the harness exists to prevent. Raw sha
   equality was rejected as the test because the harness writes its own
   artifact into the session set after snapshotting, so the comparison
   ignores the same per-set loop bookkeeping the verification stamp
   already ignores (`WORK_DIFF_SET_BOOKKEEPING`) and treats any
   substantive path change as stale. **Fails closed**: unavailable
   snapshot, unusable recorded tree, or unreadable diff all count as
   stale.
2. **Backstop round 10 — wrong pre-fix baseline for non-discovery
   rounds.** `acceptance_harness.run_harness()` resolved the before-tree
   with `find_discovery_baseline_tree()`, which walks back to the most
   recent *discovery-family* round. Criteria raised by a
   remediation-review round were therefore compared against the
   **pre-remediation** tree — often one predating the file the finding
   is about — so fails-before held for an unrelated reason and the test
   collapsed into does-it-pass-now, the vacuous auto-close the guard
   exists to reject. Fix: `baseline_is_own = (baseline_round ==
   round_number)`, and `evaluate_criterion` returns the fail-closed
   outcome `baseline-mismatch` for executable criteria when it is
   `False` — never run, never closed. The artifact records
   `baselineIsOwnRound`.

Both carry end-to-end regression tests
(`test_stale_acceptance_evidence_never_renders_as_closed`,
`test_unavailable_snapshot_is_treated_as_stale`,
`test_criteria_from_a_round_without_its_own_baseline_cannot_close`,
`test_a_discovery_round_still_uses_its_own_baseline`). **Review them on
their merits — a finding here is wanted, not unwelcome.** They are
already committed, so they will not appear in this session's working
diff; read them in `ai_router/verify_session.py` (around
`acceptance_evidence_is_stale`) and `ai_router/acceptance_harness.py`
(around `run_harness` / `evaluate_criterion`).

## Deliberate design decisions — please review these AS DECISIONS

These are choices, not oversights. Challenge them on their merits; do
not report them as omissions. Each was journaled through the new writer
and is readable in `decisions.jsonl` in this folder — that file is this
session dogfooding its own deliverable.

- **The carve-out's primary control is a mandatory declared field, not a
  text classifier.** `verification_effect` has **no default**, so a
  caller must consciously assert one; that assertion is the auditable
  act. The phrase screen behind it **can only escalate** — it refuses a
  careless `none`, and it never permits a write. Its incompleteness
  therefore cannot weaken the guard, only fail to add to it. This is a
  direct application of Session 2's most expensive lesson: an
  open-ended classifier used as a *primary* control acquires one new
  spelling per round forever. For the same reason the screen is **one
  verb-near-noun proximity rule**, not a phrase list.
- **Nothing here can stop a lying declaration**, and the module
  docstring says so. An orchestrator that declares `none` about a real
  reduction has made a **recorded false statement in a git-tracked
  ledger** rather than a silent omission. That is the honest claim; a
  stronger one would be the L-064-8 defect class in a security
  sentence, which is exactly what S2's round-2 finding caught in the
  acceptance template.
- **`decisions.jsonl` is freshness-exempt but STAYS IN the evidence.**
  It is in `verification_stamp.WORK_DIFF_SET_BOOKKEEPING` because the
  rubric makes waiver adjudications AI-decidable and those happen
  **after** a round by definition; without that, the sanctioned flow
  would stale its own stamp and send the close backstop into a fresh,
  unbounded metered round. It is **not** in
  `PHASED_EVIDENCE_SET_EXCLUDES`, so a `--phase` verifier reads every
  journaled decision. This session's own supplementary round (round 2)
  caught the first draft conflating the two — suppressing the decision
  record from review is a verification reduction, and the author had
  self-authorized it. The fix separates the two consumers; the round-2
  finding and its remediation are in `s3-remediation-round-1.md`.
- **Consensus is folded into the rubric as tiebreak 5, not left as a
  second authority split.** Two surfaces stating who decides is the
  stale-echo class the constitution's one-canonical-doc-per-domain rule
  exists to stop, and it left a laundering path: two engines agreeing
  appeared to create authority neither has. The category list is now
  labelled a **cost** control on tiebreak 5 in both the doc and
  `router-config.yaml`.
- **Two journals, deliberately.** `consensus-decisions.jsonl` records
  the *consult* (engines, responses, cost); the per-set
  `decisions.jsonl` records the *decision* (rubric line, options,
  choice). A consensus-resolved decision writes both. This is not
  duplication — they answer different questions and have different
  retention (one is gitignored full payloads plus a summary line, the
  other is entirely git-tracked).
- **`AGENTS.md` prose was cut, not its ceiling raised.** Adding the
  pointer put it 113 tokens over. Ceilings ratchet down only and a
  raise is operator-authorized, so the pointer was shrunk to a true
  pointer — the constitution is *also* preload and already carries the
  summary, so the long form was duplication between two always-loaded
  files.
- **No new console-script entry point.** The module follows
  `acceptance_harness`'s precedent (`python -m ai_router.…`), so
  `test_entry_points.py` has nothing new to guard.

## Suite baseline (measured this session, on this machine)

- **Targeted:** `test_decision_journal.py` → **56 passed, 0 failed**
  (the new suite).
- **Full run of record** — `python -m pytest ai_router/tests`, after the
  last code change, **nothing deselected and nothing excused**: see the
  disposition's `notes` for the exact counts. Session 2 root-fixed both
  classes of previously-excused failures, so a clean full run is the
  standing expectation on this seat, not an achievement to re-argue.

## Release contract

- `ai_router/CHANGELOG.md` gains an `[Unreleased]` entry for the
  decision journal. **No version bump and no publish** — publishing is
  operator-gated and happens at a release boundary, not in a session. A
  finding that "the version was not bumped" is out of scope.
- The extension (`tools/dabbler-ai-orchestration/`) is **untouched**.
  This session ships no UI surface, which is why the set declares
  `requiresE2E: false`. `requiresUAT: true` is a **set-level** flag that
  Session 4 dogfoods on the new guided-look format; S3 owes no walk.

## By-design exclusions (not defects)

- **Close-out state does not exist yet.** This is a pre-close review: no
  `close_session`, no `change-log.md`, no final disposition verdict.
  Their absence is never a finding.
- **This review's own machinery** (`s3-verification*.md`,
  `s3-issues*.json`, `s3-rounds.jsonl`) is an immutable raw record, not
  a deliverable under review.
- **Session 4 owns the ceremony pass**: artifact-necessity review,
  session-size cap, test-run policy, guided-look UAT, walk stager,
  guidance streamlining, CI hygiene. Work deferred to it is deferred
  **by the spec**, not by omission. In particular, whether
  `ai-assignment.md` and `sN-conventions.md` survive at all is an S4
  question the operator answers.
- **The rubric's content is not re-litigable here.** Proposal §11 is an
  operator-directed decision record and the spec's *Decisions already
  made* forbids reopening it. Findings about how faithfully it was
  canonized are in scope; findings that a different rubric would be
  better are not.
- **`operator-notes.md`** in this folder is operator input, a record of
  what the operator said — not a deliverable of this session.
