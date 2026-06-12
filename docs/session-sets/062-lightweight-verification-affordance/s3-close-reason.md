# Session 3 close-out — Sanctioned A→B on completed sets (blessed writer + wiring)

**Verdict:** VERIFIED (round 2; round 1 ISSUES_FOUND, all three findings
dispositioned — 1 fixed, 2 disproven with recorded adjudications).

## What shipped

1. **Audit-first artifact** (`s3-mode-read-audit.md`, written before any
   code): traced every consumer of the recorded verification mode.
   Established F1 (`read_verification_mode` is the single choke point —
   the Q6 close gate, the 7-state derivation, and the content-aware
   validator all resolve through it), F2 (`start_session --type …` never
   reads the mode, so no typed-session change was needed), F3 (the
   capture-idempotency check had to learn the new record kind or a later
   capture could clobber the transition), F4 (tier read; Explorer reads
   spec only; TS parity helper).
2. **The D4 blessed writer**:
   `dedicated_verification.change_verification_mode(...)` +
   `python -m ai_router.change_verification_mode` (CLI: dir-or-slug
   positional, `--to`, `--json`; exits 0/2/3). Gates fail-loud, in order,
   nothing written on refusal: A→B only (B→A refused always) →
   Lightweight only (fail closed on unconfirmable tier) →
   existing-but-unreadable activity log refused → effective recorded mode
   `out-of-band-or-none` → no typed sessions + nothing in flight
   (plan-less in-progress counts as in flight). Appends a superseding
   `kind: "verification_mode_change"` record (atomic write, attributed to
   the highest completed session, `previousMode` carried).
3. **Read-path precedence**: `read_verification_mode` and
   `has_verification_mode_record` honor both record kinds (last valid
   entry in file order wins) — the transition is honored everywhere a
   mode decision is read, and the once-at-set-start capture stays a
   no-op after a blessed transition (the F3 hazard fix).
4. **Extension wiring**: `setupVerificationEligible` widened to
   `lightweight ∧ (not-started ∨ (complete ∧ Mode A))`; the completed-set
   flow is confirmation → blessed writer (spawn via
   `resolvePythonInterpreter`, `--json` envelope) → **only on success**
   spec-seed alignment + kickoff-prompt copy + the locked toast; gate
   refusals and spawn/router failures inform and change nothing (D3
   no-drift-by-construction). Core extracted as
   `applyCompletedSetTransition(set, pythonPath, deps)` so the full
   branch matrix is unit-tested.
5. **Docs**: normative "Sanctioned Mode A → Mode B transition" section in
   the workflow doc (locked rationale verbatim); pointer updates in the
   authoring guide, spec-md-schema, tier-model, session-state-schema;
   `ai_router/CHANGELOG.md` Unreleased entry.

## Verifier findings and dispositions (round 1, gpt-5-4)

- **S062-S3-V1-001 (Critical, DesignLockDeviation)** — claimed
  `start_session --verification-mode` could append a fresh capture entry
  that supersedes a blessed transition (including B→A).
  **DISPROVEN — not-reproducible.** Executed minimal repro: the capture
  path is immutable once any durable record of either kind exists (the
  unchanged Set 057 Q5 check runs before `cli_choice` is consulted; this
  session's F3 fix extends the check to the change kind). Context gap —
  the immutability code was outside the R1 diff. Pinned permanently by
  `test_explicit_cli_b_to_a_cannot_supersede_change_record`. Adjudication
  recorded (context-gap / reverify-reshaped).
- **S062-S3-V1-002 (Major, Completeness)** — the TS invocation/fallback
  paths required by spec step 5 were untested (only the pure helpers were
  pinned). **ACCEPTED — fixed**: dependency-injected core + 6 branch
  tests asserting per-branch observable side effects.
- **S062-S3-V1-003 (Minor, Completeness)** — wanted the new record kind
  documented in `docs/activity-log-schema.md`. **DISPROVEN — that doc
  does not exist**; record kinds are documented in the workflow doc +
  authoring guide (the `suggestion_disposition` / `verification_mode`
  precedents) and session-state-schema.md — all updated this session.
  Adjudication recorded (context-gap / reverify-reshaped).

Round 2 (same verifier, reshaped context: full capture-path bodies, repro
output, fix diffs): **VERIFIED, zero issues**.

## Test state at close

- Python: 1216 passed, 1 skipped (+31 this session).
- TypeScript: 849 passing (+14 this session) plus the 2 pre-existing
  Set-026 baseline failures; `tsc --noEmit` clean; esbuild clean.

## Cost

Routed this session: $0.4046 (verification $0.3928 across two rounds +
$0.0032 next-orchestrator analysis). Implementation routed $0.
