# Up-front conventions block — Set 096 Session 1 (verification machinery set)

NOTE: the consequence-graded severity rubric formerly carried in this block
(Set 095 / L-095-1) now ships IN the verification template itself
(`session-verification-v3`) — this session's own deliverable. Grade with it.

## Suite baseline (all run locally pre-verification; exact counts)

- pytest (Layer 1, full `ai_router/tests`): 2948 passed / 6 skipped
  (Set 095 close baseline was 2922 passed / 6 skipped; the +26 are this
  session's new tests — rubric pins, failureScenario parse, ledger
  assembly, run() wiring).
- Extension unit (Layer 2): 1487 passing — identical to the Set 095 close
  baseline; this session touches no extension source.
- tsc --noEmit: clean.
- Playwright (Layer 3): NOT run this session, per L-064-12's scope — it is
  required for Explorer-rendering / state-writer / fixture-harness changes,
  and this session touches none of those surfaces (ai_router Python + docs +
  session-set artifacts only).

## Release contract

- No version bump this session: Session 2 owns release prep (CHANGELOG
  finalization + `dabbler-ai-router` version bump; publish stays
  operator-gated). This session adds the Set 096 S1 entry under
  `[Unreleased]` in `ai_router/CHANGELOG.md`.
- Extension version stays 0.42.0 (Unreleased, operator-gated tag
  vsix-v0.42.0) — untouched by this session.

## By-design scope and exclusions

- Deliverables under review: the consequence rubric + mandatory
  `Failure scenario:` line in `ai_router/prompt-templates/verification.md`
  (TEMPLATE_ID v3 + pinned hash in `verification_stamp.py`); the tolerant
  `failureScenario` parser field (+ JSON schema + schema doc); the
  auto-assembled cross-round settled-points ledger in `verify_session.py`
  (+ the `sN-remediation-round-<R>.md` sidecar convention and its
  `WORK_DIFF_SET_BOOKKEEPING` entry); tests for all of the above; the
  fan-out experiment (design, runs, memo); the CHANGELOG entry; the
  session-set bookkeeping (ai-assignment.md, activity log, state).
- `s1-fanout-run-{a,b,c,d}.md`, `s1-fanout-findings.json`, and
  `s1-fanout-analysis.md` are IMMUTABLE raw routed experiment records.
  Their "ISSUES FOUND" verdicts and Major findings concern the **Set 095
  replay corpus** (a frozen scratch state of already-shipped 095
  deliverables), NOT this session's work. The 5 latent Majors they surface
  are recorded and deferred to operator disposition in
  `s1-fanout-experiment.md` — deliberate, documented deferral of
  out-of-scope findings, not unremediated defects of this session.
- The fan-out experiment's metrics rows (`session-verification` task type
  with no session context and no stamp) are deliberate: unstamped rows can
  never corroborate a close, and rows without a session_set can never be
  mistaken for this session's round-1 verification.
- Session 2 (authored in the spec, not yet run) owns: the `--phase`
  discovery/supplementary/remediation-review modes, the Step 6/7 policy-doc
  rewrite (`docs/ai-led-session-workflow.md` still describes the
  hand-carried ledger at its Step 6/7 — a known, spec-scheduled S2 rewrite,
  not a defect of this session), the `router-config.yaml` fan-out knobs,
  the 095-corpus convergence replay, and release prep. Their absence now is
  the spec's explicit S1/S2 split.
- Spec flags: `requiresUAT: false`, `requiresE2E: false` (CLI/framework
  surfaces only); `pathAwareCritique: advisory` runs at the SET-terminal
  close (end of Session 2), not this mid-set session.
