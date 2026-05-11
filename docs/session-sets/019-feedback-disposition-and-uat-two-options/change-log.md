# Set 019: feedback disposition + UAT two-options split — Change Log

**Sessions:** 2 of 2 completed (2026-05-11)
**Provider/Model (orchestrator):** Anthropic / Claude Opus 4.7 (1M context)
**Provider/Model (verifier):** OpenAI / GPT-5.4 (2 rounds; final verdict VERIFIED)
**Cumulative spend:** $0.2131 metered (2 verification routes); $0 in-session generation.
**Within projection?** Yes — spec budgeted $0.10–$0.25 for end-of-set verification.

---

## What Set 019 delivers

This set responds to `dabbler-platform`'s upstream feedback file
[`upstream-feedback-disposition-gate.md`](../../../../dabbler-platform/docs/session-sets/admin-users-cross-links/upstream-feedback-disposition-gate.md)
(2026-05-11). Two distinct threads landed across two sessions, plus
one hand-off artifact addressed to a sibling repo.

### Thread 1: Disposition gate discoverability (Session 1)

The `mark_session_complete()` / `python -m ai_router.close_session`
gate was failing on consumers because `disposition.json` was
required but undiscoverable: Step 8 of `ai-led-session-workflow.md`
never named the file, and `CloseoutGateFailure` linked to no schema.
Consumers were reaching for `--force` as the only path the error
message named, diluting the audit signal `--force` is supposed to
carry.

**Fixes (committed in `94260a6`):**

- **[`docs/disposition-schema.md`](../../disposition-schema.md) (new, ~265 lines)** —
  the canonical reference for the `Disposition` dataclass: all
  seven fields with types and required-conditions, three
  gate-enforced invariants, copy-paste minimal viable template,
  three variation examples (outsource-last with queue ids, final
  session of a set, switch-due-to-blocker pattern), and an
  explicit "`--force` is not a substitute" section.
- **[`docs/ai-led-session-workflow.md`](../../ai-led-session-workflow.md) Step 8** —
  now names `disposition.json` as a Step 8 author-deliverable
  before `close_session` runs, links to the schema doc, flags
  `next_orchestrator` and `blockers` as the two most-frequently-
  missed fields.
- **[`ai_router/close_session.py`](../../../ai_router/close_session.py) (2 sites)** —
  the `disposition_present` remediation in `run_gate_checks()` and
  the `invalid_invocation` message in `run()` both now parameterize
  the actual `disposition.json` path, list required fields, link to
  `docs/disposition-schema.md`, and preserve the `--force` /
  incident-recovery clause.

### Thread 2: UAT two-options split (Session 2)

The existing UAT Checklist Rule + E2E-Coverage-Before-UAT sections
tacitly assumed DSL-driven Playwright-backed UAT (`dabbler-platform`
via `dabbler-uat-dsl`). Non-web consumers (e.g., the
`dabbler-homehealthcare-accessdb` MS Access app, the
Lightweight-tier candidate identified in Set 018) had no path: they
either declared `requiresE2E: false` and lost the "human UAT is not
the first line of defense" mechanical floor entirely, or tried to
fit Playwright requirements they couldn't satisfy.

**Fixes (this commit):**

- **New spec-level field `uatStyle: "dsl" | "ad-hoc"`** —
  meaningful only when `requiresUAT: true`. Default `"ad-hoc"` when
  omitted, per the universal-core / gated-extensions philosophy
  (CLAUDE.md: "UI/UAT/E2E-specific behavior must be gated on
  spec-level flags"). DSL is the gated extension opt-in repos
  declare.
- **§"UAT Checklist Rule" restructured** in `docs/ai-led-session-workflow.md` —
  shared preamble + DSL-driven subsection + Ad-hoc subsection. The
  former §"E2E Coverage Before UAT" content moved into the DSL
  subsection. The Ad-hoc subsection introduces per-item
  `ProgrammaticVerification` references or `NoProgrammaticPathReason`
  justifications, validated locally by the orchestrator before
  notification.
- **§"Choosing uatStyle" heuristic** added to both
  `docs/planning/session-set-authoring-guide.md` (authoritative —
  spec authors decide) and `docs/ai-led-session-workflow.md` (mirror
  for orchestrator reference).
- **Rule 11 split** into 11a (DSL path: Playwright parity,
  `uat-coverage-review` gate) and 11b (Ad-hoc path: per-item
  `ProgrammaticVerification` or `NoProgrammaticPathReason`), using
  sub-numbering to preserve existing references in instruction files.
- **Invalid combination defined** (added per Round 1 verifier
  feedback): `uatStyle: "dsl"` with `requiresE2E: false` is
  rejected at authoring time / Step 2 rather than silently
  downgrading to ad-hoc. Authors must either set `requiresE2E: true`
  or switch to `uatStyle: "ad-hoc"`. Mirrored in both docs.
- **Mixed-surfaces guidance tightened** (added per Round 1 verifier
  feedback): mixed web/non-web sets must use `uatStyle: "ad-hoc"`
  (the DSL path does not permit per-item exceptions). The earlier
  "use the other mode's tooling for the remainder" escape hatch
  was incoherent on the DSL path and has been replaced with
  unambiguous direction.
- **[`tools/dabbler-ai-orchestration/src/wizard/sessionGenPrompt.ts`](../../../tools/dabbler-ai-orchestration/src/wizard/sessionGenPrompt.ts)** —
  `uatStyle` added to the generated spec template + a guideline
  bullet for spec authors. No VSIX rebuild needed; the prompt is
  read at clipboard-copy time.
- **[`ai_router/docs/close-out.md`](../../../ai_router/docs/close-out.md)** —
  one-line back-link added: Section 1's disposition reference now
  points at `docs/disposition-schema.md` (the new Session 1 doc).

### Hand-off artifact (Session 2)

**[`docs/upstream-feedback/2026-05-11-w0-runner-pre-signin-conflict.md`](../../upstream-feedback/2026-05-11-w0-runner-pre-signin-conflict.md) (new)** —
GitHub-issue-ready feedback addressed to
`darndestdabbler/dabbler-uat-dsl`. Reports the W0 runner's
auto-injected `SeededSignInAsync` colliding with DSL-driven
`/login` checklists. Three concrete suggestions (auto-detect,
`--no-pre-sign-in` CLI flag, `PreSignIn: false` checklist field).
Hand-off lifecycle: copy into a fresh issue next time the operator
touches `dabbler-uat-dsl`, then archive.

---

## Migration burden for consumers

### `dabbler-platform`: must declare `uatStyle: "dsl"` on existing UAT-enabled specs

The default-when-omitted is `"ad-hoc"`. `dabbler-platform`'s
existing UAT-enabled specs were written for the DSL path; without
an explicit `uatStyle: "dsl"` declaration, the next UAT-enabled
session would apply the ad-hoc gate (functional items must declare
`ProgrammaticVerification` or `NoProgrammaticPathReason`) to work
the platform expects to be Playwright-gated.

**Action for `dabbler-platform`:** at the next UAT-touching session
set, add `uatStyle: "dsl"` to each UAT-enabled spec's Session Set
Configuration block. Verify `requiresE2E: true` is also declared
(it should already be). Set 019 documents the requirement here and
in the authoring guide; the platform performs the migration on its
own schedule.

**No transition heuristic.** A possible alternative — auto-infer
`uatStyle: "dsl"` when a spec references Playwright artifacts —
was considered and rejected: heuristics that infer load-bearing
behavior age badly, and a one-off explicit migration is cheaper
than carrying an implicit-mode-detection rule forever. If
`dabbler-platform` forgets to migrate, the orchestrator's next
UAT-enabled session there will fail the new ad-hoc gate
(missing `ProgrammaticVerification`/`NoProgrammaticPathReason`)
with a clear error message that points at the fix.

### `dabbler-homehealthcare-accessdb`: no migration needed

Already a Lightweight-tier candidate per Set 018. Whenever that repo
adopts the orchestration framework, it declares
`uatStyle: "ad-hoc"` (or omits it and gets the default), and the
gate works correctly out of the box.

### Other consumers: no migration needed

Any consumer that doesn't set `requiresUAT: true` is unaffected —
the field is only meaningful when UAT is required.

---

## Deferred items / follow-ups

- **`--write-template` flag for `python -m ai_router.close_session`** —
  considered in Session 1; deferred per operator decision to keep
  Session 1's scope tight. Adds ~25 lines + 1–2 tests; would write
  a `disposition.json.template` next to the failure when the file
  is missing. Doc + error-message changes carry most of the
  discoverability win; the flag is a polish on top. Re-evaluate in
  a follow-up set if consumer feedback continues to land on this.
- **`uat-checklist-editor` schema explicit support for
  `ProgrammaticVerification` / `NoProgrammaticPathReason` fields** —
  forward-compatible JSON additions in this set (the editor ignores
  unknown fields). Explicit editor-side UI / validation support is
  a separate effort in the `uat-checklist-editor` repo if/when
  ad-hoc UAT volume justifies it.
- **W0 runner upstream feedback file** lives at
  `docs/upstream-feedback/2026-05-11-w0-runner-pre-signin-conflict.md`.
  Copy into a `darndestdabbler/dabbler-uat-dsl` issue next time
  that repo is touched; then archive the file.

---

## Verification trail

Two rounds of cross-provider verification routed through `ai_router`
to GPT-5.4 (cross-provider per the rule that verification cannot
share provider with orchestrator):

- **Round 1 (`verification/gpt-5-4-round1.md`):** ISSUES_FOUND, 2
  issues (1 Major + 1 Minor). Both addressed in-session:
  - Major: `uatStyle: "dsl"` + `requiresE2E: false` not flagged as
    invalid. **Closed** by new "Invalid combination" paragraphs in
    both `ai-led-session-workflow.md` and the authoring guide.
  - Minor: mixed-surfaces escape hatch incoherent for DSL mode.
    **Closed** by rewriting the mixed-surfaces paragraph in both
    docs to require `uatStyle: "ad-hoc"` for any combined set.
- **Round 2 (`verification/gpt-5-4-round2.md`):** VERIFIED. No new
  issues introduced by the fixes. Cleared for close-out.

Cumulative metered cost: $0.2131 (round 1: $0.1033, round 2: $0.1098).

---

## Session 1 (commit `94260a6`) — file list

- `docs/disposition-schema.md` (new)
- `docs/ai-led-session-workflow.md` (Step 8 edit)
- `ai_router/close_session.py` (2 error-message edits)
- `docs/session-sets/019-feedback-disposition-and-uat-two-options/spec.md` (new)
- `docs/session-sets/019-feedback-disposition-and-uat-two-options/ai-assignment.md` (new, Session 1 portion)
- `docs/session-sets/019-feedback-disposition-and-uat-two-options/session-state.json` (new)

## Session 2 — file list

- `docs/ai-led-session-workflow.md` (config-block prose; UAT Checklist Rule restructure; Choosing uatStyle; Rule 11 split; invalid-combination rule; mixed-surfaces rewrite)
- `docs/planning/session-set-authoring-guide.md` (config-block reference; Choosing uatStyle heuristic; invalid-combination rule; mixed-surfaces rewrite; migration note)
- `tools/dabbler-ai-orchestration/src/wizard/sessionGenPrompt.ts` (spec template + guideline bullet)
- `ai_router/docs/close-out.md` (disposition-schema back-link)
- `docs/upstream-feedback/2026-05-11-w0-runner-pre-signin-conflict.md` (new)
- `docs/session-sets/019-feedback-disposition-and-uat-two-options/ai-assignment.md` (Session 2 plan appended)
- `docs/session-sets/019-feedback-disposition-and-uat-two-options/verification/gpt-5-4-round1.md` (new)
- `docs/session-sets/019-feedback-disposition-and-uat-two-options/verification/gpt-5-4-round2.md` (new)
- `docs/session-sets/019-feedback-disposition-and-uat-two-options/change-log.md` (this file)
- `docs/session-sets/019-feedback-disposition-and-uat-two-options/disposition.json` (new)
- `docs/session-sets/019-feedback-disposition-and-uat-two-options/activity-log.json` (new)
- `docs/session-sets/019-feedback-disposition-and-uat-two-options/session-state.json` (flipped to closed)

---

## Acceptance criteria — all met

Spec acceptance criteria (Set 019):

- [x] `docs/disposition-schema.md` exists with all seven fields, three invariants, minimal template, three variations.
- [x] Step 8 of workflow doc names `disposition.json` + links to schema doc.
- [x] Both `CloseoutGateFailure` / `invalid_invocation` messages link to schema and list required fields.
- [x] `uatStyle: "dsl" | "ad-hoc"` documented in authoring guide config-block reference; default `"ad-hoc"` documented.
- [x] UAT Checklist Rule restructured into shared preamble + DSL-driven + Ad-hoc subsections.
- [x] E2E Coverage Before UAT folded into DSL-driven subsection; conditional on `uatStyle: "dsl"`.
- [x] `change-log.md` includes migration note for `dabbler-platform`.
- [x] `docs/upstream-feedback/2026-05-11-w0-runner-pre-signin-conflict.md` exists, GitHub-issue-ready.
- [x] Cross-provider verification routed (GPT-5.4, two rounds); final verdict VERIFIED.
- [x] All five close-out gates pass (pending `close_session` invocation).

Round 1 verifier-flagged additions (now closed):

- [x] Invalid combination (`uatStyle: "dsl"` + `requiresE2E: false`) explicitly rejected in both docs.
- [x] Mixed-surfaces guidance rewritten to require `uatStyle: "ad-hoc"` for combined sets.
