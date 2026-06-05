# Set 057 — Session 2 close-out / attestation

**Session:** 2 of 3 (Schema + forced writer). **Date:** 2026-06-05.
**Orchestrator:** claude-code / claude-opus-4-8 @ effort=high
(deviation from the recommended sonnet-4-6 — opus was the operator's
active engine; the locked design made the work mechanical).

## What shipped

Against the locked **S1 Audit Lock** contract:

1. **`session.type`** (`work` | `verification` | `remediation`, default
   `work`; absent ⇒ `work`) — `progress.py` constants, preserved across
   boundary rewrites in `session_state.py`
   (`_build_sessions_array` + `_existing_session_types`), documented in
   `docs/session-state-schema.md`. Only non-`work` values persist, so
   historical / Full-tier ledgers are byte-identical.
2. **`sN-issues.json` schemaVersion 2** — promoted optional finding
   fields (`issueId`, `issueType`, `verificationMethod`,
   `suggestedTestOrCheck`) + enum-enforced `resolution_status` /
   `issueType` *when present*, gated so v1 files stay valid. Schema JSON,
   doc, and example fixture updated.
3. **Blessed writer** — `register_typed_session_start` appends a typed
   `sessions[]` entry and grows the runtime `totalSessions`; the
   `start_session --type verification|remediation` CLI branch wraps it
   and prints a **type-announcement banner** (closing the operator-raised
   gap that typed sessions are not in `spec.md`, so a pasted "Start the
   next session" prompt would otherwise have no step list — the banner
   points the AI at `docs/ai-led-session-workflow.md`).
4. **Content-aware close-time validator** (`dedicated_verification.py`)
   — confirms a *different-engine* verification session completed before
   terminal close; D3 left unchanged (content-blind / inert on
   Lightweight). Wired into `close_session` as a **non-blocking advisory**
   (the Q6 gate strength is S3).
5. **Seven-state derivation** (`derive_workflow_state`) per the Q3 ladder
   + the `verificationMode` record reader/writer + the `sN-issues`
   seeder.
6. **Tests** — `test_dedicated_verification.py`,
   `test_typed_session_writer.py`, extended `test_session_issues_schema.py`.
   Full Python suite green.

## Verification (Step 6/7)

Cross-provider session verification routed to **gpt-5-4** (OpenAI;
cross-provider from the Anthropic orchestrator).

- **Round 1: ISSUES_FOUND** — three Major (Correctness) findings, all
  legitimate: (1) the close-time validator false-positived with an empty
  work-engine baseline; (2) the derivation classified
  `advisory-disagreement` as terminal instead of a human-stop dispute;
  (3) `seed_issues_envelope` accepted a `VERIFIED` verdict. Persisted to
  `s2-issues.json` (a v2 envelope — dogfooding the new schema).
- **Fixes applied in-flight** (Step 7) with regression tests, all in
  `dedicated_verification.py`.
- **Round 2: VERIFIED** — all three resolved, no regressions.

## Cost

- Session verification R1: **$0.2319** + R2: **$0.0522** (both gpt-5-4).
- **Session routed total: $0.2842** / $10 NTE.

## Hand-off to Session 3

S3 (recommended: claude-code / claude-opus-4-8 @ medium) inherits:

- **Workflow + authoring docs** rewrite (per-set verification, bounded
  rounds, `second-opinion` tie-breaker) **plus the generic procedure
  that typed verification/remediation sessions follow** in lieu of a
  `spec.md` step list (S2 added the banner pointer; S3 writes the
  procedure and wires the copy-prompt).
- **Q6 close-out gate strength** (hard-TTY / soft-non-TTY) consuming the
  S2 validator — currently advisory-only.
- **The verification→remediation hand-off close transition.** A
  *non-terminal* verification close (issues found, more rounds to come)
  leaves `sessions[]` all-complete with set status `in-progress`, which
  invariant rule 6 rejects. S3 must design how the close + remediation
  append interleave (e.g. append the remediation session as `not-started`
  so the set rests in a valid between-sessions shape, or a hand-off
  writer). The seven-state derivation already models the resting states
  correctly and independently of this wiring.
- **Operator-choice capture** (`record_verification_mode`) prompt + the
  optional spec-config `verificationMode` default.
- **Held PyPI version bump** if the packaged `ai_router` surface is
  considered shippable after S3 (no release in S2).
