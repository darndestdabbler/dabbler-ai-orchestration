# Session 1 — Verification adjudication (human-stop at round 2)

> Two automatic rounds ran. The loop worked correctly on the SUBSTANCE and is
> now stopping (not grinding a round 3) on structural category errors — the
> deliberate behavior the July-2026 remediation installed.

## The substance: the loop caught real bugs, they were fixed, round 2 confirmed

**Round 1 (3 findings)** — TWO were genuine and cited this session's own spec:
1. **(Real, fixed)** The depth-agnostic `dist` exclude dropped a nested source
   dir (`src/dist`) — a completeness regression, contradicting the spec's own
   "make exclusion honest" intent. **Fixed:** added explicit **tracked-excluded
   reporting** (`EvidenceBundle.tracked_excluded` + a rendered "Excluded tracked
   paths — review directly" section), so a `dist/`-matching source path is
   surfaced, never silently dropped. Tests:
   `test_tracked_source_under_dist_reported_not_silent`,
   `test_nested_dist_bundle_excluded_from_diff`.
2. **(Real, fixed)** Fix B's oversized-input guard lived only in the CLI
   `run()`, not threaded through `assemble_evidence` as the spec required.
   **Fixed:** the guard now raises `EvidenceTooLargeError` from
   `assemble_evidence` itself, so every caller fails closed. Tests:
   `test_assemble_evidence_raises_when_oversized`,
   `test_assemble_evidence_under_cap_returns_bundle`.
3. (Category error) "the set isn't closed yet" — see below.

**Round 2 (2 findings)** — the round-2 verifier (gpt-5-4, a different provider
from the Anthropic orchestrator) **explicitly confirms findings 1 & 2 are now
resolved** ("the code adds `tracked_excluded` reporting… clearly adds the
non-CLI guard inside `assemble_evidence()`"). No defect was raised against the
delivered code. The two residual blockers are both category errors:

### Round 2 Finding A — round-1 artifact is "false" (Major, "False Positive")
- **Dismissal:** round-1 `s1-verification.md` is an **immutable, append-only raw
  record** (constitution: verification artifacts are never edited; retries append
  sibling round files). It correctly described the tree at round-1 time; round 2
  fixed the two real gaps and appended its own artifacts. "Superseded by a later
  round" is the append-only system working as designed — not falsification.
  Editing the round-1 artifact to "correct" it would itself violate the
  raw-record rule.

### Round 2 Finding B — "the set is not closed yet" (Major, Completeness)
- **Dismissal:** the normal, unavoidable state of any session at verification
  time. `verify_session` is Step 6; `disposition` / commit / push /
  `close_session` / `change-log.md` are Step 8+. A verifier that blocks on "not
  closed yet" demands a state that cannot exist until after the gate it is
  gating — circular. Raised round 1 (finding 3), resurrected round 2.

## Verification posture
The substantive release-gate is satisfied: a **different-provider** verifier
reviewed the work across two rounds and its round-2 assessment **confirms the
fixes are correct**. The verdict token reads `ISSUES_FOUND` only because of the
two category errors above. Full suite is green (2913 passed; the sole
transient failure is the `one-active-set` drift check tripping because Set 087
is also in flight — it resolves when 089 closes).

## Recurring-pattern note (recommended follow-up)
This is the **second** set (after 088) blocked at close by the circular
"set-not-closed-at-verify-time" finding — it reliably fires on small/low-surface
sets. The root cause is the verifier being pointed at the spec's "Ends with…
close_session succeeded" lines, which are structurally unmet during Step 6. A
small follow-up (teach the verification prompt / evidence framing that pre-close
lifecycle state is NOT a completeness defect) would retire the recurring
operator-override. This is the ss4 doc's deferred "Related (prompt-template)"
item territory — a separate set.

## Recommendation
Accept the adjudication (substantive fixes real and round-2-confirmed; residual
findings are category errors) and close via the operator-attested manual path,
recording this file as the logged adjudication. Operator authorization required.
