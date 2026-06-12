# Change Log — Set 062: Lightweight verification affordance

**Status:** COMPLETE (5 of 5 sessions) — 2026-06-12.
**Release:** extension **0.30.0** (combined — carries Set 061's deferred
Explorer changes plus this set's; the Set 059→060 fold precedent) and
**`dabbler-ai-router` 0.17.0**. Both version-bumped and operator-UAT'd
2026-06-12; **tag pushes (`vsix-v0.30.0`, `v0.17.0`) held for explicit
operator authorization** per the release contract. Run ids recorded in a
post-publish follow-up commit.

## Why this set existed

The operator's design brief: a completed Mode-A (`out-of-band-or-none`)
Lightweight set is silent — nothing distinguishes "verified out-of-band"
from "nobody verified it" — and a Mode-B set at `N/M+` is a dead end unless
the user already knows the typed-session CLI. `verificationMode` was
hand-edit-only, and the Set 057 capture is a one-way *silent* gate, so a
naive UI rewrite on a started set would create silent spec-vs-record drift.
Operator UAT of Explorer features also had no cheap fixture story — the
direct trigger for cutting Set 061 short. Design locked by the three-engine
synthesis in Set 061's `verification-affordance-synthesis.md`.

## What shipped

### Session 1 — `v?` / `v+` verification marker (VERIFIED, R1 0 issues)

- Derived inputs in `fileSystem.ts` (`externalVerificationNoteExists`,
  completed-verification verdict/number), pure predicates in
  `tierLegibility.ts` (`verificationMarkerFor`, `allWorkSessionsComplete`,
  `completedVerificationInfo`), `lw`-pattern rendering, marker click posts
  the EXISTING row-context-menu message, verdict enrichment on the fraction
  tooltip. No marker on Full/cancelled/note-bearing/verified rows — quiet is
  success; copy never says "unverified".

### Session 2 — kickoff prompt + not-started toggle (VERIFIED, 2 rounds)

- `verificationModeRewrite.ts` (byte-preserving seed rewriter, `tierRewrite`
  sibling), `dabbler.copyVerificationKickoffPrompt` (pointer-style Mode-B
  handoff: typed sessions via `start_session --type verification` on a
  *different* engine), `dabblerSessionSets.setupVerification` on not-started
  Mode-A rows (both directions, confirmation with `N/M+` consequence copy,
  refused once ANY activity-log history exists — fail-loud on unreadable
  logs, the R1 Major fix), `openExternalVerificationDoc` reused on `v?` rows.

### Session 3 — blessed writer + completed-set toggle (VERIFIED, 2 rounds)

- `python -m ai_router.change_verification_mode <dir-or-slug>`: appends a
  superseding `kind: verification_mode_change` record under fail-loud gates
  (A→B only; Lightweight only; refuses typed sessions, in-flight work,
  unreadable logs). `read_verification_mode` honors the latest record of
  either kind — with both-kinds idempotency closing the audit-found
  stale-seed re-capture hazard. Extension: `setupVerificationEligible`
  widened to complete Mode-A; `applyCompletedSetTransition` invokes the
  writer and only on success aligns the seed + copies the kickoff prompt.

### Session 4 — hello-world UAT fixture workspace (VERIFIED, 2 rounds)

- Committed matrix `tools/dabbler-ai-orchestration/test-fixtures/uat-matrix/`
  (two hello-world projects covering every Set 061+062 marker/action state),
  `npm run make-uat-workspace` disposable-copy generator, 14-test pinning
  suite through the real `readSessionSets` scan, CONTRIBUTING section.

### Session 5 — combined operator UAT + releases (VERIFIED, R1 0 issues)

- Combined 23-row UAT checklist subsuming Set 061's
  (`062-lightweight-verification-affordance-uat-checklist.json`): 11 rows
  AI-pre-verified against named deterministic checks; 12 operator rows walked
  as one ~15-minute pass against the generated fixture workspace. **Operator
  UAT PASSED 2026-06-12, all rows.**
- Generator now pins `dabblerSessionSets.pythonPath` to the checkout `.venv`
  in the *generated* workspace only (zero-setup writer/migrator row actions;
  pinning test added).
- **Defect found & fixed during UAT prep:** migrator CLIs +
  `check_migrations` printed Unicode arrows/em-dashes that crash Windows
  cp1252 consoles (the extension spawn-pipe encoding) — the Migrate-to-v4
  row action exited 1 *after* the in-place write had succeeded. ASCII-only
  now per the repo CLI convention.
- Marketplace README refreshed (operator request): new
  `session-set-explorer-and-spec.png` hero + `getting-started.png`; feature
  list updated for the 061/062 surfaces. Old hero PNG retained until 0.30.0
  publishes (the live 0.29.0 page hotlinks raw@master); remove in the
  post-publish commit.
- Version bumps: extension 0.29.0→0.30.0 (package.json + both lock nodes;
  CHANGELOG entry names Sets 061+062), ai_router 0.16.0→0.17.0
  (pyproject.toml + `__version__`; CHANGELOG 0.17.0 entry).
  `repository-reference.md` release status in pre-push wording.

## Suites & verification

- Python 1216 passed / 1 skipped; TS unit 864 passing + the 2 tracked
  pre-existing Set-026 baseline failures; drift guards clean; `vsce package`
  clean (33 files).
- Cross-provider verification (router pick gpt-5-4 every session):
  S1 VERIFIED R1; S2/S3/S4 ISSUES_FOUND→fixed/adjudicated→VERIFIED R2;
  S5 VERIFIED R1 0 issues — the first R1-clean round of the set, attributed
  to stating the suite-baseline convention and gate-adjacent context up
  front in the R1 prompt (the S3/S4 calibration lesson applied).
- Routed spend (set total): ≈ $1.12 of the $10 NTE
  (S1 ≈ $0.039 incl. estimated direct-call fallback; S2 $0.3083;
  S3 $0.4046; S4 $0.1920; S5 $0.1720).

## Deviations from spec (all flagged at close)

1. **Generator pythonPath pinning (S5)** — not in the spec step list; serves
   spec step 2 (the operator-UAT gate) under the operator's
   minimize-UAT-time directive. Test-covered; committed fixture stays
   machine-agnostic. Verifier: VERIFIED.
2. **Migrator ASCII fix (S5)** — unplanned defect fix under the
   project-guidance ASCII-only CLI convention; empirical before/after repro.
   Verifier: VERIFIED.
3. **README feature-list refresh (S5)** — beyond the operator's screenshot
   request, so the 0.30.0 Marketplace page matches shipped behavior.

## Follow-ups (post-publish)

- Push `vsix-v0.30.0` + `v0.17.0` **only with operator authorization**; watch
  both publish runs to completion; record run ids in
  `docs/repository-reference.md` + this file in a follow-up commit.
- Remove the superseded `media/session-set-explorer-in-action.png` in that
  same follow-up (the live 0.29.0 Marketplace page hotlinks it until 0.30.0
  replaces the listing).
