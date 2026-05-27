# Set 048 Session 4 — Close-out reason and verification attestation

## Close-out reason

Session 4 ships the four "closing" deliverables of the Lightweight-
tier parity arc per the audit-locked spec at [`spec.md`](spec.md)
§3.7 (per-consumer migrator), §3.8 (external-verification command),
§3.9 (review-criteria templates), and §4 row for S4 (doc revisions +
wizard tier-branch).

### What ships in S4

**Commit A — Lightweight migrator CLI (`5fbfbb9`).**
- New module `ai_router/migrate_lightweight_to_canonical_v4.py`
  (~500 LOC) with three recognized non-canonical-shape normalizers
  (`sessionLog[]` -> `sessions[]` rename per great-psalms-scroll-
  font, top-level + per-session status-alias canonicalization,
  missing-schemaVersion stamping). Routes through the existing
  `progress.normalize_to_v4_shape` shim so the v4 invariants apply
  identically.
- Idempotent (canonical v4 input skips). Refuses pre-v3 input with
  a pointer to the v2 → v3 migrator. Refuses future-schema input.
- Apply mode writes `session-state.lwbak.json` (intentionally
  distinct from `.v3.bak.json` so the operator can tell which
  migrator last ran on a set). One-cycle rollback = one rename.
- 16 unit tests at `ai_router/tests/test_migrate_lightweight_to_canonical_v4.py`.

**Commit B — `dabbler.openExternalVerificationDoc` command
(`53aa8cb`).**
- New module `tools/dabbler-ai-orchestration/src/commands/externalVerification.ts`.
- Command Palette only — opens or creates
  `<set>/external-verification.md` in an editor tab. Free-form per
  §3.8 (no templated header). EEXIST treated as benign race; falls
  through to open.
- Single-set workspaces skip the picker; multi-set workspaces show
  a QuickPick.
- Registered in `extension.ts` via `safeRegister`. New command
  entry in `package.json`. Watcher-inventory pinned line bumped
  149 → 150 to track the new import line.

**Commit C — Review-criteria template files (`1ae5d80`).**
- Three files at `docs/review-criteria/{spec,session,set}.md` with
  comment-headers explaining how to edit and what happens if the
  operator deletes them. Sample bullets reflect repo conventions:
  audit-lock discipline, in-flight Round-A fixes, version-bump
  correctness, cross-repo notices, cumulative budget reporting.
- Picked up automatically by the S3 `copyPromptCommands` default
  `readReviewCriteria` reader (no code change needed).

**Commit D — Wizard tier-branch (`50db03e`).**
- `tools/dabbler-ai-orchestration/webview/wizard.html` gains a
  `<h2>Choose adoption tier</h2>` radio group above
  `<h2>Prerequisites</h2>`. Default selection is Full to preserve
  existing behavior.
- `data-tier="full"` and `data-tier="lightweight"` attributes tag
  every element that's tier-specific (prerequisites, callouts,
  buttons); the `applyTierVisibility(tier)` JS handler toggles
  `.hidden` on every `[data-tier]` element based on the active
  radio. Runs once on script load + on every radio change.
- The existing `pricingLink` click handler is now guarded with
  `if (pricing)` because the link lives inside the cost-reality
  callout which can be hidden on Lightweight.

**Commit E — Doc revisions + cross-repo notice (`fd82944`).**
- `docs/session-state-schema.md` § Tier expectations rewritten to
  describe the actual Set 048 model (router writers DO operate
  under `--no-router`; lazy imports keep credentials out;
  verification short-circuits to manual attestation; soft gate on
  `external-verification.md`; hand-maintained migration path via
  the new CLI).
- `docs/ai-led-session-workflow.md` Step 6 gains a
  `#### Lightweight tier — copyable review prompts replace routed
  verification` subsection documenting the 5-step copy / paste /
  paste-back / soft-gate flow with the path-aware-agent requirement.
- `docs/planning/session-set-authoring-guide.md` Session Set
  Configuration example gains `tier: full` and tri-state comments
  for `requiresUAT` / `requiresE2E`. New field-semantics bullets
  added for `tier: "full"`, `tier: "lightweight"`,
  `requiresUAT: "suggested"`, and `requiresE2E: "suggested"`
  documenting the upfront-positive-confirmation prompt mechanism
  that replaces the audit's originally-proposed triple-redundancy.
  Defaults section updated to include `tier: full` in the implicit-
  default set.
- `docs/adoption-bootstrap.md` Lightweight closing pointers
  rewritten to describe Set 048's actual deliverables (copyable
  prompts via the four `dabbler.copy*Prompt` commands, external-
  verification.md paste-back via the new command, optional
  review-criteria files, hand-maintained state files via the
  migrator, upgrade-to-Full path).
- `docs/cross-repo-lightweight-notice.md` NEW file following the
  established `cross-repo-checkout-notice.md` / `cross-repo-
  harvest-notice.md` pattern. One-time copy source for consumer-
  repo CLAUDE.md authors covering activation, copy-prompt + paste-
  back flow, agent-capability requirement, review-criteria files,
  one-time migrator recipe, and the Get Started tier-branch.

**Commit F — Round-A verification + in-flight fix (`9383fa3`).**
See § Verification below.

### What was NOT touched

- Set 047's HELD Marketplace 0.22.0 publish — still queued.
  Operator directive: handle in S5 alongside the Set 048 version
  bumps + publishes.
- `ai_router/__init__.py` `verify()` function — no changes; the
  S4 verify-of-verify step skipped cleanly when no different-
  provider verifier was configured for the gpt-5-4 route model.
- Orchestrator block reshape / check-out-check-in rip-out — Set
  049's territory.

---

## Verification (Round A only — single-pass cross-provider)

Routed via `ai_router.route(task_type="session-verification",
complexity_hint=70)` against gpt-5-4 (tier 3, $0.175). The
verify-of-verify step skipped — no cross-provider verifier
configured for the route model, so the route response IS the
Round-A verdict.

**Verdict:** `needs-attention` (one Medium finding, all others
pass / partial-pass).

### Findings

**Medium #1 — Apply-mode backup re-read race (ADDRESSED IN-FLIGHT).**
The original `_atomic_copy_json` helper re-read `session-state.json`
via `json.load(f)` during the backup step. A concurrent edit
between the initial parse and the backup re-read would have raised
`JSONDecodeError` out of `migrate_one_set`, breaking the
"never raises on normal failure cases" contract.

**Fix:** `migrate_one_set` apply path now writes the
already-parsed `state` dict directly via `_atomic_write_json(
backup_path, state)`. No re-read, no race.

**Regression test:** new
`test_backup_uses_parsed_state_not_reread_from_disk` monkey-patches
the writer to stomp on the source file with garbage after the
parse, and confirms the backup content reflects the parsed dict —
not the on-disk garbage.

### Checks

| # | Name | Status |
|---|---|---|
| 1 | Migrator normalization correctness | pass |
| 2 | Refusal correctness | partial → pass (after Medium #1 fix) |
| 3 | Backup atomicity | pass |
| 4 | External-verification UX | pass |
| 5 | Review-criteria templates | pass |
| 6 | Wizard tier-branch | pass |
| 7 | Doc consistency | pass |
| 8 | Spec compliance across §3.7/§3.8/§3.9/§4 | partial → pass (after Medium #1 fix) |

### Cost ledger

- Route (gpt-5-4, tier 3): $0.175
- Verify-of-verify: skipped (no cross-provider verifier configured)
- S4 total: $0.175
- Cumulative Set 048: $0.586 of $10 NTE (~5.86%)

(Note: an earlier first-pass route in this session crashed on a
`RouteResult` attribute access bug in the script before recording
the response; both routes ran end-to-end on gpt-5-4. The cumulative
charge across both attempts is ~$0.34, bringing the true running
spend to ~$0.76 / $10 NTE = ~7.6%. The crash itself was a script
bug, not a verification cost — but the work was paid for and is
reflected in the router metrics. Recorded as a lesson:
`feedback_ai_router_route_result_handling` was already in memory;
the dump-fields-first discipline still wasn't applied. S5 will
honor it strictly.)

---

## Test counts at close

- Python: 1010 passed + 1 pre-existing skip (+17 new in S4, was
  1009 + 16-new). 0 regressions.
- TypeScript (unit): 665 passed + 2 pre-existing failures unchanged
  from S2/S3 (`configEditor-foundation` + `notificationsSection`).
  0 regressions, 0 new TS tests.

---

## What's next

- **Session 5 — UAT + change-log + version bumps + publish.**
  End-to-end Lightweight UAT via `--no-router` + copyable-prompt
  + tier-branch wizard. Change-log entry covering S1-S5. Version
  bumps to `dabbler-ai-router 0.10.0` + Marketplace `0.23.0`.
  Single PyPI + single Marketplace publish, bundled with Set
  047's HELD publishes per the audit verdict §4.2.
