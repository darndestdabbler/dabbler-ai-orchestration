# Remediation notes — round 1 (discovery fan-out, 9 findings / 7 distinct)

- **Merged verdict can launder an unknown token to VERIFIED (call 1 #1):**
  the merge now fails CLOSED — VERIFIED only when EVERY completed call's
  token is exactly VERIFIED, anything else merges to ISSUES_FOUND. (Under
  the current parser contract the two are provably equivalent — the parser
  emits only two tokens — but the merge no longer depends silently on that
  invariant.) Test: `test_unknown_call_token_fails_closed_to_issues_found`.
- **Phase bookkeeping contaminates supplementary evidence and the fix
  delta (call 1 #2 / call 2 #7):** phased evidence assembly now excludes
  the set's own loop bookkeeping (the `WORK_DIFF_SET_BOOKKEEPING` globs,
  set-dir-scoped — one definition with the freshness hash), disclosed like
  every other exclusion. The classic path is untouched (compat). Prior
  findings still reach the supplementary verifier via the critic block,
  and settlement notes still reach the review via the auto-ledger — as
  text, not as reviewable file hunks. Tests:
  `test_phased_evidence_excludes_loop_bookkeeping`,
  `test_fix_delta_excludes_loop_bookkeeping`.
- **Per-finding fix verdicts unenforced (call 1 #3 / call 2 #8):** an
  explicit `fix-rejected` is now blocking evidence even without a restated
  Issue block (synthetic Major appended when the round would otherwise be
  non-blocking — anti-laundering); a remediation-review round with ZERO
  parsed fix verdicts warns loudly; a count-level coverage warning fires
  when fewer verdicts parsed than prior blocking findings. Full
  identity-level coverage matching is deliberately NOT attempted (fuzzy
  text matching is worse than the disease); residual recorded in the
  disposition. Tests: `test_fix_rejected_without_issue_block_escalates...`,
  `test_zero_fix_verdicts_warns...`, `test_partial_fix_verdict_coverage_warns`.
- **CLI directs past the 2-cycle bound (call 1 #4):** on a blocking
  remediation-review round that is already cycle >= 2 (counted from prior
  envelopes' `phase` fields), the next-action now SUSPENDS to the operator
  and prints no re-run command. Enforcement stays message-level by design:
  the round-cap override is the operator's authority, and a hard CLI
  refusal would need an engine-facing override affordance (the Set 083
  class of thing this repo forbids). Test:
  `test_second_blocking_review_cycle_suspends_to_operator`.
- **Replay comparison overclaim (call 1 #5 / call 2 #9):** the CHANGELOG
  0.33.0 header and the replay memo's Question header now state explicitly
  that the replay is a loop-shape demonstration on the remediated corpus
  plus its latent findings, NOT a defect-for-defect A/B against the
  original 39-Major workload, pointing at the memo's qualifications
  section (echo sweep, L-065-1).
- **Clean supplementary round settles the session (call 2 #6 — the gate
  hole):** a clean `--phase supplementary` round now patches the SESSION
  disposition `ISSUES_FOUND` (and exits 4) whenever any prior round's
  envelope carries a blocking finding — the round verdict stays what the
  verifier said, but a fresh stamped VERIFIED row from the critic pass can
  no longer settle a close over unremediated Majors (the claim/stamp
  mismatch blocks the close until a clean remediation-review round
  exists). Exit-code docs updated. Tests:
  `test_clean_supplementary_never_settles_prior_blockers`,
  `test_clean_supplementary_with_no_prior_blockers_stays_clean`.

Suite after remediation: 3005 passed / 6 skipped (17 new tests).
