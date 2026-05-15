# Feedback disposition + UAT two-options split

> **Purpose:** Reactive curator work in response to upstream
> feedback from `dabbler-platform` (Session 1 of
> `admin-users-cross-links`, 2026-05-11). Two threads in one set:
>
> 1. **Disposition-gate discoverability.** `mark_session_complete()`
>    fails with `CloseoutGateFailure: disposition_present` but
>    `ai-led-session-workflow.md` Step 8 never names
>    `disposition.json`, and the error message links to no schema.
>    Consumers will reach for `force=True`, diluting the audit
>    signal it's supposed to carry. Fix the doc, the schema doc, and
>    the error message.
> 2. **UAT-checklist single-path bias.** The current UAT Checklist
>    Rule + E2E-Coverage-Before-UAT rule tacitly assume Playwright-
>    backed DSL-driven UAT. That works for `dabbler-platform`, but
>    steers `dabbler-homehealthcare-accessdb` (Microsoft Access, no
>    browser) into the wrong shape. Introduce a spec-level
>    `uatStyle: "dsl" | "ad-hoc"` field and split the rule into two
>    paths.
>
> A third issue surfaced by the same feedback file — the `uat_runner`
> auto-injecting `SeededSignInAsync` that conflicts with DSL-driven
> `/login` flows — belongs to `dabbler-uat-dsl`, not this repo.
> Session 2 closes that thread by writing a clean upstream-feedback
> file pointing at the right repo, so the operator has a ready-to-
> file artifact next time they touch that codebase.
>
> **Created:** 2026-05-11
> **Session Set:** `docs/session-sets/019-feedback-disposition-and-uat-two-options/`
> **Prerequisite:** Set 018 closed (lightweight adoption tier; doc-only).
> **Workflow:** Two sessions. Session 1 = disposition gate fixes. Session 2 = UAT two-options split + upstream-feedback handoff for W0 runner.

---

## Session Set Configuration

```yaml
totalSessions: 2
requiresUAT: false
requiresE2E: false
effort: normal
```

> Rationale: doc + small-code-edit work in this repo's `ai_router/`
> + `docs/`. No UI surface, no browser-runnable behavior. Cross-
> provider verification at end-of-set is the canonical quality bar
> for the architectural change in Session 2 (the new `uatStyle`
> field touches a heuristic that ripples into every consumer repo's
> Session Set Configuration block).

---

## Project Overview

### What the set delivers

**Session 1 — Disposition gate discoverability:**
1. Step 8 of `docs/ai-led-session-workflow.md` names
   `disposition.json` explicitly, with field-level guidance.
2. A new `docs/disposition-schema.md` documents the `Disposition`
   dataclass: every field, accepted values, examples, and a
   "minimal viable" template a downstream orchestrator can copy.
3. `ai_router/close_session.py`'s `CloseoutGateFailure` message
   for the `disposition_present` check links to the schema doc and
   inlines the field list. The `force=True` clause stays available
   but is no longer the only path the message names.
4. Optional (defer if non-trivial): a `--write-template` flag on
   `python -m ai_router.close_session` that writes a
   `disposition.json.template` next to the failure when the file
   is missing.

**Session 2 — UAT two-options split:**
1. A new spec-level field `uatStyle: "dsl" | "ad-hoc"`, declared in
   the Session Set Configuration block. **Default: `"ad-hoc"`**
   when `requiresUAT: true` and `uatStyle` is omitted. Rationale:
   universal-core-gated-extensions — the lower-scaffolding path is
   the default; DSL is the gated extension that opt-in repos
   declare.
2. The UAT Checklist Rule in `docs/ai-led-session-workflow.md`
   splits into two named paths:
   - **DSL-driven path** (`uatStyle: "dsl"`). Current rule preserved
     verbatim: checklist JSON must match the
     `uat-checklist-editor` schema; functional items must have
     matching Playwright tests; `uat-coverage-review` is the gate.
   - **Ad-hoc path** (`uatStyle: "ad-hoc"`). Checklist items are
     human-runnable steps without strict DSL. The orchestrator
     still owes programmatic verification proportional to what's
     testable on the platform (unit/component tests, data-layer
     asserts, AI-driven exploratory runs of whatever the platform
     exposes via CLI/API). The mechanical gate degrades from
     "every functional item has a matching Playwright test" to
     "every functional item declares either a programmatic
     verification it satisfies OR a `NoProgrammaticPathReason`
     justifying why human-only is unavoidable."
3. `docs/planning/session-set-authoring-guide.md`'s
   *When UAT is required* heuristic gains a *Choosing `uatStyle`*
   subsection: web/browser-visible surfaces → `"dsl"`; everything
   else → `"ad-hoc"`.
4. `dabbler-platform`'s existing UAT-enabled specs need to add
   `uatStyle: "dsl"` to keep their current behavior. This set
   produces a **migration note** in `change-log.md` calling out
   the consumer-side change required; the platform updates its own
   specs in a separate session set.
5. The `<slug>-uat-checklist.json` schema referenced from the
   editor at `darndestdabbler/uat-checklist-editor` gains an
   optional `NoProgrammaticPathReason: string` field on items —
   coordinated as a forward-compatible addition (editor ignores
   the field if absent). No editor-side work in this set; the
   coordination is noted in `change-log.md`.
6. An upstream-feedback file
   `docs/upstream-feedback/2026-05-11-w0-runner-pre-signin-conflict.md`
   addressed to `dabbler-uat-dsl`, restating the two-issue feedback
   from the platform side with the suggested fixes (auto-detect,
   CLI flag, opt-in checklist field). Ready to copy into a GitHub
   issue at `darndestdabbler/dabbler-uat-dsl` when the operator
   next touches that repo.

### Non-goals

- **No editor-side schema work.** The optional
  `NoProgrammaticPathReason` field is forward-compatible; the
  `uat-checklist-editor` repo gets touched in a separate effort if
  the operator wants explicit editor support.
- **No migration of `dabbler-platform`'s existing UAT specs.** This
  set documents the required consumer-side change in `change-log.md`
  and stops there. The platform updates its own specs as part of
  its next planned UAT-touching session set, on its schedule.
- **No `uat_runner` code changes.** The W0 runner lives in
  `dabbler-uat-dsl`. This set produces only the upstream-feedback
  artifact for that repo.
- **No re-litigation of `requiresUAT` semantics.** This set adds a
  *sub-axis* (style) to an already-true `requiresUAT`. The
  authoring-time heuristic for *whether* a set declares
  `requiresUAT: true` is unchanged.

---

## Sessions
### Session 1 of 2: Disposition gate discoverability

**Goal:** Land the three disposition-gate fixes (Step 8 doc, schema
doc, error message) so downstream consumers — starting with
`dabbler-platform` — stop hitting the gate cold.

**Steps:**
1. **Register Session 1 start.**
2. **Read prerequisites:** the feedback file at
   `../../dabbler-platform/docs/session-sets/admin-users-cross-links/upstream-feedback-disposition-gate.md`,
   the current Step 8 of `docs/ai-led-session-workflow.md`, the
   `Disposition` dataclass in `ai_router/close_session.py`, and any
   existing schema docs in `docs/`.
3. **Author `docs/disposition-schema.md`** documenting every field
   on `Disposition` (`status`, `summary`, `verification_method`,
   `files_changed`, `next_orchestrator`, `blockers`, and any others
   the dataclass actually carries) with accepted values, examples,
   and a copy-paste template. Note the non-obvious semantics of
   `verification_method`, `next_orchestrator`, `blockers`
   explicitly — these were called out as the hardest-to-guess
   fields in the feedback.
4. **Edit Step 8 of `docs/ai-led-session-workflow.md`** to name
   `disposition.json` as a Step 8 deliverable, with a pointer to
   `docs/disposition-schema.md`. Update both the prose and any
   adjacent rules lists / step summaries that enumerate Step 8
   outputs.
5. **Edit `CloseoutGateFailure` message in `ai_router/close_session.py`**
   for the `disposition_present` check. Include: the file path,
   the field list (one line), a link to
   `docs/disposition-schema.md`, and the existing `force=True`
   clause. Tests around the message string get updated to match.
6. **Decide on the `--write-template` flag.** If trivial (under
   30 lines + 2 tests), implement. Otherwise defer to a follow-up
   issue and note the decision in `change-log.md`. Operator can
   weigh in at the action-checklist step.
7. **Run tests.** `python -m pytest ai_router/tests/` green.
8. **Smoke test:** deliberately omit a `disposition.json` against
   a scratch session, confirm the new error message renders with
   the schema link.
9. **Operator approval gate** for the action checklist (doc edits
   + error-message edit + test updates + optional flag).
10. **Author session close-out artifacts.**
11. **Commit and snapshot. Do not close the set** — Session 2
    continues.

**Creates:**
- `docs/disposition-schema.md`
- `docs/session-sets/019-feedback-disposition-and-uat-two-options/spec.md` (this file)
- `docs/session-sets/019-feedback-disposition-and-uat-two-options/ai-assignment.md`
- `docs/session-sets/019-feedback-disposition-and-uat-two-options/session-reviews/session-001-prompt.md`
- Possibly: `--write-template` flag implementation in `ai_router/close_session.py` + matching test (if approved)

**Touches:**
- `docs/ai-led-session-workflow.md` (Step 8 section + adjacent rules summaries)
- `ai_router/close_session.py` (`CloseoutGateFailure` message for `disposition_present`)
- `ai_router/tests/test_close_session.py` (or wherever the message is asserted) — update string matchers
- `docs/session-sets/019-feedback-disposition-and-uat-two-options/session-state.json` (snapshot updates)
- `docs/session-sets/019-feedback-disposition-and-uat-two-options/session-events.jsonl` (lifecycle events)

**Ends with:** Doc + error-message changes merged; tests green; a
fresh attempt to close a session without a `disposition.json`
produces an error message that names the file path, the field
list, and a schema link. Session 1 snapshot closed; set still open
for Session 2.

---

### Session 2 of 2: UAT two-options split + upstream feedback handoff

**Goal:** Introduce `uatStyle`, split the UAT rules, document the
ad-hoc programmatic-verification floor, and write the upstream-
feedback file for `dabbler-uat-dsl`.

**Steps:**
1. **Register Session 2 start.**
2. **Read prerequisites:** Session 1's `change-log.md`, current
   *UAT Checklist Rule* + *E2E Coverage Before UAT* sections of
   `docs/ai-led-session-workflow.md`, *When UAT is required* in
   `docs/planning/session-set-authoring-guide.md`, and the
   feedback file's second-half W0-runner issue.
3. **Author `docs/planning/uat-style-decision.md`** (or fold into
   the authoring guide — decide during the session) explaining the
   DSL-driven vs ad-hoc choice, the default-ad-hoc rationale, and
   when each is appropriate. This is the load-bearing piece of
   *guidance* the new field references.
4. **Edit `docs/ai-led-session-workflow.md`**:
   - Add `uatStyle: "dsl" | "ad-hoc"` to the configuration-block
     description.
   - Split the *UAT Checklist Rule* into a shared preamble +
     two named subsections (DSL-driven, Ad-hoc).
   - Rework *E2E Coverage Before UAT* so the Playwright-coverage
     gate is conditional on `uatStyle: "dsl"`. For
     `uatStyle: "ad-hoc"`, the analogous gate is
     "every functional item declares programmatic verification OR
     a `NoProgrammaticPathReason`."
   - Add a one-line note that the checklist-editor schema accepts
     an optional `NoProgrammaticPathReason` field; existing
     checklists without it remain valid.
5. **Edit `docs/planning/session-set-authoring-guide.md`**:
   - Document the new `uatStyle` field in the configuration block,
     with default semantics.
   - Add *Choosing `uatStyle`* heuristic subsection.
   - Note the consumer-side migration requirement for
     `dabbler-platform` (add `uatStyle: "dsl"` to existing
     UAT-enabled specs to preserve current behavior).
6. **Update `tools/dabbler-ai-orchestration` extension if needed.**
   Check whether the wizard's session-gen prompt or any other
   extension surface enumerates the configuration-block fields. If
   yes, add `uatStyle` mentions. (Probably wizard-only; runtime
   surfaces in the extension don't enforce these flags.)
7. **Author `docs/upstream-feedback/2026-05-11-w0-runner-pre-signin-conflict.md`**
   restating the W0-runner issue from the feedback file as a
   ready-to-file GitHub issue for `darndestdabbler/dabbler-uat-dsl`.
   Include: what happens, why a consumer can't work around it,
   the three concrete suggestions (auto-detect, `--no-pre-sign-in`
   flag, `PreSignIn: false` checklist field). Cross-reference
   `dabbler-platform/admin-users-cross-links/Session 1` as the
   surfacing context.
8. **Run tests** (mostly unaffected, but the authoring guide may
   ship with a sample-spec snippet that should round-trip if
   parsed anywhere).
9. **Operator approval gate** for the action checklist.
10. **Cross-provider verification.** Route the final
    `docs/ai-led-session-workflow.md` + `session-set-authoring-guide.md`
    diff plus a one-paragraph design summary to a single verifier
    via `outsource-first` (per the configuration block). The
    question to the verifier: *Does the new `uatStyle` split
    preserve the universal-core / gated-extensions philosophy? Are
    the defaults right?* Save the response under
    `verification/` for the close-out audit trail.
11. **Author end-of-set artifacts** (`change-log.md`,
    `disposition.json`, `activity-log.json`) summarizing both
    sessions' deliverables and explicitly calling out the
    `dabbler-platform` migration note.
12. **Commit, push, run close-out.**

**Creates:**
- `docs/planning/uat-style-decision.md` (or merged into the authoring guide; decide in-session)
- `docs/upstream-feedback/2026-05-11-w0-runner-pre-signin-conflict.md`
- `docs/session-sets/019-feedback-disposition-and-uat-two-options/session-reviews/session-002-prompt.md`
- `docs/session-sets/019-feedback-disposition-and-uat-two-options/change-log.md`
- `docs/session-sets/019-feedback-disposition-and-uat-two-options/disposition.json`
- `docs/session-sets/019-feedback-disposition-and-uat-two-options/activity-log.json`
- `docs/session-sets/019-feedback-disposition-and-uat-two-options/verification/<provider>.md`

**Touches:**
- `docs/ai-led-session-workflow.md` (UAT Checklist Rule + E2E Coverage Before UAT sections + config-block reference)
- `docs/planning/session-set-authoring-guide.md` (config-block field reference + new *Choosing uatStyle* heuristic)
- `tools/dabbler-ai-orchestration/src/wizard/sessionGenPrompt.ts` (if it enumerates config-block fields; check first)
- `docs/session-sets/019-feedback-disposition-and-uat-two-options/session-state.json` (snapshot updates)
- `docs/session-sets/019-feedback-disposition-and-uat-two-options/session-events.jsonl` (lifecycle events)

**Ends with:** `uatStyle` field documented and consumed by the
rule split; ad-hoc programmatic-verification floor explicit;
upstream-feedback file for `dabbler-uat-dsl` ready to file;
cross-provider verification routed and recorded; set closed.

---

## Acceptance criteria for the set

- [ ] `docs/disposition-schema.md` exists and documents every field of the `Disposition` dataclass with examples + a minimal template.
- [ ] Step 8 of `docs/ai-led-session-workflow.md` names `disposition.json` and links to the schema doc.
- [ ] `CloseoutGateFailure` for the `disposition_present` check links to the schema doc and names the field list.
- [ ] Existing tests for `close_session.py` pass; new string matchers cover the updated message.
- [ ] `uatStyle: "dsl" | "ad-hoc"` documented in `docs/planning/session-set-authoring-guide.md`'s configuration-block section with `"ad-hoc"` as the documented default-when-omitted.
- [ ] *UAT Checklist Rule* in `docs/ai-led-session-workflow.md` reads as two named paths (DSL-driven, Ad-hoc) sharing a preamble.
- [ ] *E2E Coverage Before UAT* gate is conditional on `uatStyle: "dsl"`; the ad-hoc analogue is documented.
- [ ] `change-log.md` includes a migration note for `dabbler-platform`'s existing UAT-enabled specs.
- [ ] `docs/upstream-feedback/2026-05-11-w0-runner-pre-signin-conflict.md` exists and is GitHub-issue-ready.
- [ ] Cross-provider verification routed; response saved under `verification/`; no blocking divergence on the universal-core / gated-extensions check.
- [ ] All five close-out gates pass.

---

## Risks

- **Default-ad-hoc silently downgrades existing UAT-enabled specs.**
  If `dabbler-platform`'s existing UAT specs don't add
  `uatStyle: "dsl"` before their next session, the orchestrator
  applies the ad-hoc gate (lower bar) to work that should have
  Playwright coverage. *Mitigation:* `change-log.md` explicitly
  documents the consumer-side change; `dabbler-platform` adopts it
  before running another UAT-enabled session. We could also add
  a transition heuristic ("if the spec references a `*-uat-dsl`
  artifact OR includes `playwright` anywhere, infer
  `uatStyle: "dsl"` and warn"). Decide in-session whether the
  transition heuristic is worth the complexity.
- **`uatStyle` adds vocabulary to an already-overloaded
  configuration block.** Three flags (`requiresUAT`,
  `requiresE2E`, `uatScope`) plus a fourth in the same paragraph
  is approaching the limit of what's readable inline.
  *Mitigation:* group the UAT-related fields in the docs as a
  unit, and surface the `uatStyle` choice prominently in the
  authoring guide's *When UAT is required* section so a spec
  author meets the field at the same time they're making the UAT
  decision.
- **Conflict with Set 020's complexity critical-review.** Set 020
  may recommend collapsing some of this configuration surface.
  *Mitigation:* the `uatStyle` split is genuinely load-bearing for
  non-web consumers (healthcare-accessdb is the live counter-
  example), so it's unlikely to be a Set 020 cut target. If it
  is, the change is small and reversible.
- **Upstream-feedback file accumulates in `docs/upstream-feedback/`
  with no clear lifecycle.** *Mitigation:* the close-out includes
  a one-line note pointing the operator at this file the next
  time `dabbler-uat-dsl` is touched. The file is a hand-off, not
  a permanent doc; it gets archived once filed.

---

## References

- [`dabbler-platform/docs/session-sets/admin-users-cross-links/upstream-feedback-disposition-gate.md`](../../../../dabbler-platform/docs/session-sets/admin-users-cross-links/upstream-feedback-disposition-gate.md) — the source feedback file (two issues).
- [`docs/ai-led-session-workflow.md`](../../ai-led-session-workflow.md) §UAT Checklist Rule, §E2E Coverage Before UAT, §Step 8 — the doc surfaces this set edits.
- [`docs/planning/session-set-authoring-guide.md`](../../planning/session-set-authoring-guide.md) §Session Set Configuration block, §When UAT is required — the authoring-guide surfaces this set edits.
- [`ai_router/close_session.py`](../../../ai_router/close_session.py) — the `Disposition` dataclass and `CloseoutGateFailure` message.
- Memory: `project_uat_dsl.md` (DSL as single source for checklist + E2E in dabbler-platform), `project_consumer_repos.md` (healthcare-accessdb as the non-DSL consumer), `feedback_routing_surface_choice.md` (IDE-agent routing preference for state-dependent verification).
- Set 020 (forthcoming) — `complexity-critical-review`. Sibling set; intentionally not bundled.

---

## Cost projection

| Phase | Estimated cost | Notes |
|---|---|---|
| Session 1 — disposition doc + error message + tests | $0 | Pure in-session edits; tests are the verification surface |
| Session 2 — UAT split design + doc edits | $0 in-session | Same |
| Session 2 — cross-provider verification at close | $0.10–$0.25 metered | Single-verifier `outsource-first` route on the diff + design summary |
| **Set total (metered)** | **$0.10–$0.25** | Within the standing per-session-set ceiling; no operator re-approval needed unless this is wrong |

Cumulative spend through Sets 016–018 has stayed under $0.20.
Adding this set keeps the running total under $0.50 — well inside
the limited-tier envelope.
