# Change log — Set 104: Copilot CLI large-prompt handoff

**Outcome:** the Copilot-CLI transport's fatal Windows prompt-size ceiling is
fixed with a threshold-gated file handoff (the pull pattern), proven live on a
real >32 KiB dispatch; the **cancel-to-pause** convention is documented; router
**0.34.0** is staged (publish operator-gated). Two sessions, both VERIFIED.

## Session 1 — Implement the threshold-gated file handoff (+ pause-recipe doc)

- Implemented the consult-locked design in `ai_router/cli_transport.py`:
  rendered-argv UTF-16 measurement; handoff branch at ≥ 24,000 units writing a
  per-request UTF-8-no-BOM temp file closed before spawn; POSIX-path bootstrap
  (no nonce in argv); a file-only `secrets.token_hex(16)` EOF nonce ack,
  validated and stripped; the non-retryable `ERROR_CLASS_HANDOFF_INCOMPLETE`;
  `finally` cleanup on every path with retention only under
  `DABBLER_COPILOT_DIAGNOSTICS`; additive `transport_metadata` handoff fields
  incl. `payload_file_modified`.
- +25 fake-spawner tests (58/58 `cli_transport`; full suite 3055 passed / 6
  skipped).
- Docs: staged CHANGELOG 0.34.0; tier-model + 078-spec pointer notes; the
  **cancel-to-pause recipe** in `docs/ai-led-session-workflow.md` (no-`paused`-
  enum decision record, session-boundary guard, D6 review discipline) with Set
  103's `CANCELLED.md` as the worked example + a close-out.md pointer.
- Cross-provider verification VERIFIED (gpt-5-6, 2/2 discovery fan-out, 0
  findings). Commit `b0a4832`, close `82ca1f7`.

## Session 2 — Live >32 KiB smoke probe + release staging

- **Auth-preflight (Step 1) PASSED** — the Copilot seat is now provisioned
  (a change from the prior context): binary + credential + a live probe on
  `claude-sonnet-4.6` authenticated (1 premium request).
- **Live probe (Step 2)** through the installed **Copilot CLI 1.0.69** on
  Windows via `CopilotCliTransport.dispatch`:
  - Handoff: an 81,829-char prompt (rendered inline 81,925 UTF-16 units — far
    past Windows' 32,767 ceiling) took the pull path; three unguessable facts
    at offsets 559 / 41,194 / 81,820 were **all** fused into the single required
    answer line (proving an end-to-end read of the 82,231-byte payload); the
    nonce ack validated and was stripped; `handoff: true`,
    `payload_file_modified: false`.
  - Control: a below-threshold dispatch took the inline path (`handoff: false`).
  - Evidence: `s2-live-probe.md` + `s2-live-probe-raw.json`. The transport
    surfaced **no defects** — the fix loop was a no-op (S1 had baked in the Set
    078 S4 wire-shape fixes).
- **Release staging (Step 4):** `pyproject.toml` + `ai_router/__init__.py`
  `__version__` → 0.34.0; CHANGELOG 0.34.0 finalized.
- **Verification found a real Major and it was resolved:** discovery
  (gpt-5-6, 2/2 fan-out) flagged that the probe ran on CLI **1.0.69** while
  `copilot-catalog.lock` pins **1.0.68** (`cli_version_pin_required = true`) —
  a **runtime-fail-closed** pin (`validate_catalog` in `route()`'s `copilot-cli`
  setup) that blocks Set 103's `copilot-cli`-profile walk, and my evidence
  overclaimed "through the pinned CLI." **Operator-adjudicated (AskUserQuestion):
  ship 0.34.0 now** (transport proven + version-agnostic) **and reconcile the
  pin as part of Set 103 seat prep** (the drift is pre-existing, lock probed
  2026-07-04, and only affects the `copilot-cli` profile — not `api`, not the
  package publish). Overclaims corrected across `s2-live-probe.md` + CHANGELOG;
  drift disclosed as a first-class Known Issue; remediation-review (round 2,
  gpt-5-6) returned **VERIFIED** (1 fix accepted). `s2-remediation-round-1.md`.

## Deliverables

- Threshold-gated file handoff in `ai_router/cli_transport.py` with full
  fake-spawner coverage **and live Windows evidence** (`s2-live-probe.md`).
- The **cancel-to-pause convention** in `docs/ai-led-session-workflow.md`.
- Router **0.34.0 staged** (CHANGELOG + version bump; publish operator-gated).

## Follow-ons carried forward

- **Restore Set 103** (`restore_session_set`) once 0.34.0 is published — the
  release is that set's resume condition.
- **Reconcile the catalog version pin (1.0.68 → the operator's actual CLI)** as
  part of Set 103 seat prep — a blocking precondition for the `copilot-cli`
  walk, bundled with Set 103's ADO org / Copilot seat / parallel-jobs grant.
  The hard version-pin vs. an auto-updating CLI is worth revisiting as a design
  point (drift will recur).
- Routed next-set recommendation (`s2-ai-assignment-analysis.json`,
  anthropic-excluded): the small operator-favored **configurable severity knob**
  (Set 096 follow-on), since restoring 103 is gated on the operator's publish.
