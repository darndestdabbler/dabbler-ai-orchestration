# Explorer UX Polish (extension 0.30.0)

> **Purpose:** Three small, related Session Set Explorer improvements that came
> out of the Set 060 operator-UAT discussion (2026-06-11): (1) make Lightweight
> sets legible at a glance — a `N/M+` fraction that warns when runtime
> verification/remediation sessions will grow the denominator, plus a quiet
> per-row tier indicator; (2) make `[BLOCKED BY PREREQS]` quieter and
> self-explanatory — an unobtrusive marker whose tooltip names each
> unsatisfied prerequisite and its current state; (3) a `Switch tier…`
> right-click action on not-started sets.
> **Created:** 2026-06-11
> **Session Set:** `docs/session-sets/061-explorer-ux-polish/`
> **Prerequisite:** `060-getting-started-redesign` (complete — this set builds
> on the 0.29.0 Explorer surfaces and ships the next Marketplace release).
> **Workflow:** Orchestrator → AI Router → Cross-provider verification
> **Design input:** operator feedback + Q&A recorded in Set 060's UAT
> checklist (`060-getting-started-redesign-uat-checklist.json` "Other" rows)
> and the 2026-06-11 in-session discussion; the operator approved the
> recommended approaches below by directing this set's authoring.

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: true
requiresE2E: false
uatScope: per-set
uatStyle: ad-hoc
totalSessions: 4
prerequisites:
  - slug: 060-getting-started-redesign
    condition: complete
```

> Rationale: every feature is a Session Set Explorer **webview rendering /
> action** change — the layer the mechanical test stack (`vscode-stub`)
> cannot fully exercise and where the 0.28.0 defects shipped. `requiresUAT:
> true` (ad-hoc, per-set) with operator UAT on a **local build before any
> publish** (the standing Set 058/059/060 lesson). `requiresE2E: false` —
> Explorer webview interactions are non-deterministic under Playwright
> (Set 052 precedent); deterministic unit tests on the pure models + the
> ad-hoc UAT are the gates. Ships Marketplace **0.30.0**.

---

## Project Overview

### Motivation

Set 060's operator UAT surfaced three Explorer legibility gaps:

1. **Lightweight `dedicated-sessions` sets grow their denominator at
   runtime.** Typed verification/remediation sessions are appended by the
   blessed writer (Set 057), so a set the operator believes is "3/3 done"
   becomes "3/4" without warning. There is also no at-a-glance way to tell
   which sets are Lightweight at all.
2. **`[BLOCKED BY PREREQS]` is loud and unexplained.** The derivation knows
   exactly which prerequisites are unsatisfied but discards everything except
   a boolean, so the badge cannot say what it is waiting on, and the
   all-caps text reads as in-your-face. The repo already solved this exact
   problem once — Set 050 replaced "(needs migration)" with an unobtrusive
   asterisk + tooltip.
3. **Choosing a tier is a one-shot at scaffold time.** Tier is per-set in
   the data model, but there is no UI affordance to set a different tier on
   a set that hasn't started yet.

### Design decisions (operator-endorsed 2026-06-11)

- **D1 — `N/M+` fraction, narrowly scoped.** The `+` suffix renders ONLY
  when the set is `tier: lightweight` AND `verificationMode:
  dedicated-sessions` AND no `type: verification` session exists yet in the
  `sessions[]` ledger. Once the typed session is appended the denominator is
  honest and the `+` drops. Mode A (`out-of-band-or-none`, the default)
  never shows `+` — it appends no sessions. The fraction tooltip explains
  the `+` ("verification/remediation sessions are appended when the work
  sessions complete").
- **D2 — quiet per-row tier indicator.** Every Lightweight row gets an
  unobtrusive "lw" marker next to the name (the Set 050 asterisk pattern —
  de-emphasized foreground, help cursor) with a tooltip ("Lightweight tier —
  router-off; verification per the set's verificationMode"). Full rows get
  no marker (Full is the default and the majority; marking the exception
  keeps rows quiet). This — not the `+` — is the "which sets are
  Lightweight at a glance" answer, since `+` only covers Mode B.
- **D3 — prereq marker + tooltip replace the badge.** The
  `[BLOCKED BY PREREQS]` description badge is retired. Blocked rows render
  an unobtrusive marker (⛓ or equivalent theme-safe glyph) next to the name
  whose tooltip names EACH unsatisfied prerequisite with its current state,
  e.g. "Blocked by prerequisites: 045-log-harvest (in progress),
  047-state-file-schema-v4-audit (not started) — all must complete first."
  The derivation carries the unsatisfied list (slug + state) onto the
  in-memory record and the row payload instead of collapsing to a boolean.
  Unknown-slug prereqs (typos) remain blocking and the tooltip says so
  ("unknown set — check the slug"). Suppression on terminal-state rows is
  unchanged. A right-click `Open prerequisite spec` action is included when
  cheap (it reuses the existing openSpec plumbing); a short user-facing
  docs section explains the feature.
- **D4 — `Switch tier…` on not-started sets only.** A right-click action,
  offered ONLY when the set's state is `not-started`, that rewrites the
  `tier:` value in the set's spec.md Session Set Configuration block (and
  seeds/clears nothing else). Switching to Full warns when no provider key
  is visible and when `ai_router/router-config.yaml` is absent (pointing at
  `Dabbler: Install ai-router`). Mid-set switching is deliberately
  unsupported — the Set 057 `verificationMode` capture is immutable after
  first record and per-session verification semantics differ between
  tiers; `--no-router` remains the per-session operational escape hatch.
- **D5 — release.** Ships Marketplace **0.30.0** after a passing operator
  UAT on a local build (the pre-publish gate). No PyPI release is expected
  (extension-only scope); if a session unexpectedly touches `ai_router`'s
  packaged surface, flag it at that session's close rather than silently
  bumping.

### Non-goals

- **No mid-set tier switching** and no per-session tier UI (D4 rationale).
- **No change to the typed-session machinery** (Set 057's writers, states,
  and gates stay as-is — D1 only *renders* what the ledger already says).
- **No prerequisite-schema changes** (the `prerequisites:` field and its
  parser semantics are untouched; D3 only carries existing derivation
  detail to the UI).
- **No new persisted fields** in `session-state.json` — every new signal is
  derived in-memory from existing artifacts (spec config + ledger).

---

## Sessions

### Session 1 of 4: Lightweight legibility — `N/M+` fraction + tier marker

**Goal:** Make Lightweight sets legible at a glance per D1/D2.
**Steps:**
1. Extend the Explorer's spec-config parsing to read `tier` and
   `verificationMode` from the Session Set Configuration block (same
   lightweight regex approach as `parsePrerequisites` — no YAML lib),
   exposed on the in-memory `SessionSet` record. Absent fields default
   `full` / `out-of-band-or-none`.
2. Implement the D1 predicate as a pure, unit-tested function: given
   (tier, verificationMode, sessions ledger) return whether the fraction
   renders `+`. Wire it into `fractionFor` / the row payload; add the
   fraction tooltip copy.
3. Implement the D2 tier marker: an unobtrusive "lw" marker + tooltip on
   Lightweight rows (reuse the Set 050 migration-marker rendering pattern
   in `SessionSetsModel` / `client.js` / `tree.css`).
4. Tests: config parsing (present/absent/invalid values), the D1 predicate
   matrix (Full / LW Mode A / LW Mode B before-and-after a typed session
   appears), marker rendering; full suite; cross-provider verification.
**Creates:** the pure tier/mode parsing + `+`-predicate module and tests.
**Touches:** `src/utils/fileSystem.ts` (or the spec-config reader),
`src/providers/SessionSetsModel.ts`, `src/providers/CustomSessionSetsView.ts`,
`src/types/sessionSetsWebviewProtocol.ts`, `media/session-sets-tree/client.js`,
`media/session-sets-tree/tree.css`, tests.
**Ends with:** Lightweight Mode-B in-flight sets render `N/M+` (dropping the
`+` once a typed verification session exists) and all Lightweight rows carry
the quiet "lw" marker; suite green.
**Progress keys:** `session-001/spec-config-parsing`,
`session-001/plus-fraction`, `session-001/tier-marker`,
`session-001/verified`.

### Session 2 of 4: Prerequisite UX — quiet marker + explanatory tooltip

**Goal:** Replace the `[BLOCKED BY PREREQS]` badge per D3.
**Steps:**
1. Extend `deriveBlockedByPrereqs` to carry the unsatisfied list — for each
   unsatisfied prerequisite: slug, required condition, and the target's
   current state (or "unknown set"). Keep the boolean for compatibility.
2. Ship the list on `RowPayload`; render the unobtrusive blocked marker +
   tooltip in `client.js` (Set 050 asterisk pattern); retire the
   description badge text; keep terminal-state suppression.
3. Add the `Open prerequisite spec` right-click action when it falls out of
   the existing ActionRegistry/openSpec plumbing cheaply; otherwise record
   the decision to defer it in the session close notes.
4. Documentation: a short "Prerequisites and the blocked marker" section in
   the extension README (and a pointer from the schema doc's Prerequisites
   section).
5. Tests: derivation list contents (satisfied / unsatisfied / unknown-slug /
   cross-root), payload carriage, marker + tooltip rendering, badge-retired
   assertion; full suite; cross-provider verification.
**Creates:** derivation + rendering tests; README docs section.
**Touches:** `src/utils/fileSystem.ts` (derivation), `src/types/*`,
`src/providers/SessionSetsModel.ts` / `CustomSessionSetsView.ts`,
`src/providers/ActionRegistry.ts` (optional action),
`media/session-sets-tree/client.js`, `tree.css`, `README.md`, schema doc
pointer, tests.
**Ends with:** blocked rows show the quiet marker; hovering names each
unsatisfied prerequisite and its state; the all-caps badge is gone; suite
green.
**Progress keys:** `session-002/unsatisfied-list`,
`session-002/marker-tooltip`, `session-002/docs`, `session-002/verified`.

### Session 3 of 4: `Switch tier…` action on not-started sets

**Goal:** The D4 tier-switch affordance, scoped to not-started sets.
**Steps:**
1. A pure spec-rewrite helper: given spec.md text and a target tier, rewrite
   the `tier:` value in the Session Set Configuration block (preserving all
   other content byte-for-byte); unit-test against present / absent /
   commented variants and assert non-config `tier` strings elsewhere in the
   spec are untouched.
2. Register `dabblerSessionSets.switchTier` and surface it via the row
   context QuickPick ONLY for `not-started` rows (ActionRegistry predicate).
   The action shows a two-option tier QuickPick (reusing the Getting Started
   promptTier copy), applies the rewrite, and refreshes the view.
3. Full-tier guardrails on switch-to-full (D4): warn when no provider key is
   visible (reuse `providerKeyPresent`) and when `ai_router/router-config.yaml`
   is missing, pointing at `Dabbler: Install ai-router`. Warnings inform —
   they do not block the switch.
4. Tests: rewrite helper matrix, ActionRegistry applicability (not-started
   only — never in-progress/complete/cancelled), guardrail predicates; full
   suite; cross-provider verification.
**Creates:** the spec-rewrite helper + `switchTier` command + tests.
**Touches:** `src/commands/` (new command file), `src/providers/ActionRegistry.ts`,
`src/providers/CustomSessionSetsView.ts` (QuickPick wiring), `package.json`
(command contribution), tests.
**Ends with:** right-clicking a not-started set offers `Switch tier…`; the
spec's `tier:` flips with guardrail warnings; in-progress sets never see the
action; suite green.
**Progress keys:** `session-003/rewrite-helper`, `session-003/action-wiring`,
`session-003/guardrails`, `session-003/verified`.

### Session 4 of 4: Operator UAT on a local build, then 0.30.0 release

> **Scope change (operator-directed, 2026-06-11): Set 061 is cut short.**
> The operator UAT and the 0.30.0 release are **deferred to Set 062**
> (`062-lightweight-verification-affordance`): the D1/D2
> Lightweight-legibility surfaces cannot be adequately UAT'd without 062's
> verification affordance and its hello-world UAT fixture workspace, and one
> combined Marketplace **0.30.0** now ships from Set 062 carrying this set's
> changes (the Set 059→060 fold precedent). Session 4 was already in flight
> when this was decided — step 1 (the UAT checklist) and the local `.vsix`
> build are done; the remaining steps (operator UAT, version bump, release)
> are **superseded**. Session 4 closes by recording this deferral, writing
> the set's `change-log.md`, and running the normal close-out gates. The
> authored checklist carries forward: Set 062's combined checklist subsumes
> its rows.

**Goal:** Gate the release on a passing local UAT, then ship.
**Steps:**
1. Author the set's ad-hoc UAT checklist (`061-explorer-ux-polish-uat-checklist.json`,
   uat-checklist-editor schema): the `N/M+` fraction on a Mode-B Lightweight
   fixture (before and after a typed session is appended), the "lw" marker +
   tooltip, the blocked marker + tooltip (including an unknown-slug prereq),
   the badge's absence, `Switch tier…` applicability + both switch directions
   + the switch-to-full warnings, and no regressions on the Set 060 Getting
   Started surfaces. Each non-judgment item declares its
   `ProgrammaticVerification` reference or a `NoProgrammaticPathReason`.
2. Build a local `.vsix`; **operator UAT is the pre-publish gate.** Fold any
   feedback in and re-walk affected rows before closing the gate (the Set
   060 S4 pattern).
3. On pass: bump 0.29.0 → **0.30.0** (`package.json` + lock + `CHANGELOG.md`);
   update `docs/repository-reference.md` release status — **in pre-push
   wording until the publish workflow actually completes** (the Set 060
   S4-V1-001 lesson), with the run id recorded in a post-publish follow-up
   commit.
4. Cross-provider verification; close-out (final session → `change-log.md`).
5. Release: push `vsix-v0.30.0` only with explicit operator authorization
   (in-session or by the operator's own tag push); watch the publish run to
   completion before recording "published."
**Touches:** version files, `CHANGELOG.md`, `docs/repository-reference.md`,
the set's UAT checklist.
**Ends with:** a locally-UAT'd, operator-authorized 0.30.0 on the
Marketplace (or held for the operator's tag push if authorization is not
given in-session).
**Progress keys:** `session-004/uat-checklist`,
`session-004/operator-uat-passed`, `session-004/version-bumped`,
`session-004/verified`, `session-004/change-log-written`.

---

## End-of-set deliverables

- `N/M+` fraction on Lightweight `dedicated-sessions` sets while a typed
  verification session is still pending, with an explanatory tooltip (D1).
- A quiet "lw" tier marker + tooltip on every Lightweight row (D2).
- The `[BLOCKED BY PREREQS]` badge replaced by an unobtrusive marker whose
  tooltip names each unsatisfied prerequisite and its current state, plus a
  user-facing docs section (and the optional `Open prerequisite spec`
  action) (D3).
- A `Switch tier…` right-click action on not-started sets with
  switch-to-full guardrail warnings (D4).
- An operator-UAT'd extension **0.30.0** released to the Marketplace under
  the held/authorized-tag-push contract (D5).
