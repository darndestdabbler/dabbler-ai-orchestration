# Session 2 close reason — the verification-integrity close gate

**Outcome:** completed, VERIFIED (round 4 of 4, gpt-5-4 across all rounds,
every round driven by the S1 `verify_session` CLI — the live dogfood the
spec required).

## What shipped

- **Layer 1 — vocabulary.** `disposition.VERIFICATION_METHODS` is now
  `(api, manual-via-other-engine, skipped)`, aligned with `budget.yaml`'s
  vocabulary. The incident's bare `"manual"` and the Set 026 `"queue"`
  are rejected with naming messages (`RETIRED_VERIFICATION_METHODS`), in
  `validate_disposition`, in the JSON schema (both-directions parity,
  L-066-1), and at close time via the standalone
  `check_verification_method_vocabulary` sub-check that runs on **every**
  close path — including `--manual-verify` and `--force`.
- **Layer 2 — evidence.** `check_verification_integrity` joined
  `GATE_CHECKS` as the sixth gate. A claimed non-null verdict (explicit
  field or the api-status-derived fallback the close would persist) must
  be corroborated: on `api`, a `session-verification` metrics row for
  this (set, session) whose verifier provider — resolved via the model
  registry ONLY; row provider strings are untrusted and unresolvable
  identity fails closed — differs from the session-state orchestrator
  provider, plus an `sN-verification*.md` artifact; on
  `manual-via-other-engine` / `skipped`, the project's
  `ai_router/budget.yaml` must declare `threshold_usd: 0` with a matching
  method. A **null**-verdict close stays legal (the Set 068 routed-gate
  SKIP path, Set 080 S1 exemplar) — the documented residual, not a hole.
- **Posture.** Hard-block in BOTH interactive and headless modes (the
  operator-confirmed deviation from the Q6 split — the policed actor IS
  the headless agent). Every refusal prints the exact venv
  `verify_session` invocation for this set. `--manual-verify` bypasses
  the evidence layer only (attested, logged, recorded as a
  passed-with-note gate row); `--force` bypasses the bookkeeping gates
  but runs this check, and now records the disposition's legal method
  honestly instead of hard-coding `"skipped"`.
- **Tests.** `test_verification_integrity_gate.py` (47 tests) including
  the live incident's exact disposition as an end-to-end regression
  fixture (`gate_failed`, exit 1, headless), `--force`-does-not-bypass,
  the attested-bypass split, and a 13-row
  `_claimed_close_verdict` ↔ `resolve_close_verdict` parity matrix. Nine
  existing fixture files that closed with uncorroborated api claims were
  seeded with real evidence rather than the gate being weakened. Full
  Layer-1 suite: **2571 passed, 5 baseline skips** (S1 baseline 2524 + 47
  new).

## Verification narrative (the dogfood earning its keep)

Rounds 1–3 each surfaced one **new, real Major**, all accepted and fixed
with regression tests before the next round:

1. **R1 — registry resolution.** `_row_provider` trusted the metrics
   row's `provider` string; the spec mandates model-registry resolution
   with fail-closed identity. Fixed to registry-only. (R1 also caught the
   new test file untracked in the evidence diff — the L-064-9 class —
   fixed with `git add`; its third finding, "the session is not closed",
   is unsatisfiable inside a verification round by construction: Step 6
   precedes Step 8.)
2. **R2 — attested laundering.** `--manual-verify` blanket-skipped the
   whole check, so the incident token could still close under
   attestation. The vocabulary sub-check was split out and now runs on
   every path.
3. **R3 — audit honesty under force.** The `--force` path hard-coded
   `verification.method = "skipped"` even when the close carried
   corroborated api evidence. Force now records the disposition's legal
   method verbatim.

Round 4: VERIFIED, zero findings. Verification spend: $1.29 across four
rounds. The bounded-round discipline was honored in spirit and ledger:
no finding was ever unresolved or resurrected — each round's Major was a
distinct new defect, fixed before re-verify, and the cross-round ledger
(carried in the conventions block) marked every prior item RESOLVED.

## Decisions and residuals

- **`"queue"` decision (spec step 1):** no live artifact in this repo
  carries the token (only historical prompt text); rejected outright with
  a retirement naming message.
- **Historical `"manual"` artifacts at rest** (Sets 027/028/046/059) are
  unaffected — validation runs at close time on the active set.
- **Two vocabularies, deliberately:** the close-out events/JSON
  `verification.method` keeps `"manual"` for the `--manual-verify` /
  `--no-router` attestation paths (different surface, existing
  consumers); `"manual-via-other-engine"` flows through verbatim when the
  disposition declares it. Documented in close_session.py's module
  docstring.
- **`mark_session_complete(force=True)`** stays a trusted function-level
  entry (close-out.md Section 5 contract); the CLI is the operator
  surface where no-bypass is enforced.
- **Canonical doc updates** (workflow Step 6, close-out.md gate section,
  template bundle) are Session 3 scope per the spec;
  `docs/disposition-schema.md` was updated here because it documents the
  exact validator this session changed.

## Dogfood note (spec step 5)

This session's own close ran through the new gate live immediately after
this file was authored: the `verification_integrity` gate row passed on
real evidence — four `s2-verification*.md` artifacts on disk and four
`session-verification` metrics rows (gpt-5-4 → openai, registry-resolved)
against the session's anthropic orchestrator block. See
`session-events.jsonl` (`closeout_requested` / `closeout_succeeded` for
session 2) and the close-out `gate_results` for the recorded proof.
