# Change Log — Set 061: Explorer UX polish

**Status:** COMPLETE (4 of 4 sessions) — 2026-06-11. **Cut short by operator
direction:** Session 4's operator UAT and the 0.30.0 Marketplace release are
**deferred to Set 062** (`062-lightweight-verification-affordance`); Session 4
closes by recording that deferral (this set is `complete`, not cancelled).
**Release:** none from this set. The extension changes shipped here ride the
**combined Marketplace 0.30.0** that Set 062 ships (the Set 059→060 fold
precedent). No PyPI change — `ai_router`'s packaged surface is untouched.

## Why this set existed

Set 060's operator-UAT discussion produced four Explorer legibility gaps:
Lightweight `dedicated-sessions` sets under-report their session count
(typed verification/remediation sessions append at runtime), per-row tier is
invisible, the all-caps `[BLOCKED BY PREREQS]` badge is louder than its
information value, and switching a not-started set's tier requires hand-editing
spec.md.

## What shipped

### Session 1 — Lightweight legibility: `N/M+` fraction + tier marker (VERIFIED, 2 rounds)

- `shouldRenderPlusFraction` predicate + fraction suffix: Lightweight
  `dedicated-sessions` sets render `N/M+` while more typed sessions may still
  append, with an explanatory tooltip.
- Quiet `lw` tier marker in the row marker strip (de-emphasized, help cursor,
  tooltip names the tier and what it means); Full rows stay unmarked.

### Session 2 — Prerequisite UX: quiet marker + explanatory tooltip (VERIFIED, 2 rounds)

- The all-caps `[BLOCKED BY PREREQS]` description badge retired in favor of an
  unobtrusive chain marker (U+26D3 U+FE0E) whose tooltip names each
  unsatisfied prerequisite and its current state (`unknown` for unresolvable
  slugs); suppressed on terminal-state rows.
- `unsatisfiedPrereqs` carried on the in-memory record alongside the
  compatibility boolean `blockedByPrereqs` — both derived, never persisted.
- `Open Prerequisite Spec` row action for blocked rows.

### Session 3 — `Switch Tier…` action on not-started sets (VERIFIED, 2 rounds)

- `src/utils/tierRewrite.ts`: pure, byte-preserving config-block-scoped tier
  rewrite (quote style / trailing comments / CRLF preserved; absent-key
  insertion; commented lines immune; malformed scalars repaired) +
  `switchToFullWarnings` inform-only guardrails (missing provider key /
  missing `router-config.yaml` → points at `Dabbler: Install ai-router`).
- `dabblerSessionSets.switchTier` QuickPick command, not-started rows only,
  both directions legal. Menu label is Title-Case `Switch Tier…`.

### Session 4 — UAT checklist + local build, then cut short (deferral close)

- Authored `061-explorer-ux-polish-uat-checklist.json` (25 rows, 6 judgment)
  covering D1 `N/M+` before/after + tooltip, D2 `lw` marker, D3 blocked
  marker/tooltip/badge-absence/terminal suppression/Open Prerequisite Spec,
  D4 Switch Tier directions + guardrails, and a Set 060 Getting Started
  no-regression sweep.
- Built the local UAT `.vsix` (`dabbler-ai-orchestration-0.29.0.vsix`);
  pre-build TS suite 752 passing + 2 pre-existing Set-026 failures.
- **Operator direction (2026-06-11): set cut short.** The D1/D2 surfaces
  cannot be adequately UAT'd without Set 062's verification affordance and
  its hello-world UAT fixture workspace. The remaining steps (operator UAT,
  0.30.0 bump, release) are superseded; recorded in the spec's Session 4
  scope-change note (commit `ba32b33`).

## Deferred to Set 062 (`062-lightweight-verification-affordance`)

- **Operator UAT** of all Set 061 surfaces, walked against 062's fixture
  workspace. The authored checklist carries forward: 062's combined checklist
  subsumes its rows.
- **The Marketplace 0.30.0 release**, shipped once from 062 carrying both
  sets' changes (no standalone 061 release).

## Verification & cost

Cross-provider verification every code session: S1 2 rounds (VERIFIED), S2
2 rounds (VERIFIED), S3 gpt-5-4 R1 2 Major (1 disproven empirically, 1
half-fixed/half-disproven) → R2 VERIFIED; S4's deferral close verified
cross-provider (see `s4-verification.md`). Routed spend: S1 $0.0197,
S2 $0.0117, S3 $0.1385, S4 $0.0641 (checklist draft) + verification —
set total ≈ $0.24. Suites green at close: TS 752 passing (+2 pre-existing
Set-026 failures), Python 1185 passing / 1 skip.
