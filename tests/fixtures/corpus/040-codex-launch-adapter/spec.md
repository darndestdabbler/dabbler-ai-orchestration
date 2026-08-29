# Codex Launch Adapter

> **Purpose:** onboard Codex to the shared launch-adapter contract after
> the watcher-retirement work, replacing any lingering config-based
> inference expectations with an explicit `CodexLaunchAdapter` that owns
> launch, attach, and model/effort mapping.
> **Created:** 2026-05-22
> **Session Set:** `docs/session-sets/040-codex-launch-adapter/`
> **Prerequisites:**
> - Set 037 (`037-launch-adapter-foundations`) CLOSED.
> **Workflow:** Orchestrator -> AI Router -> Cross-provider verification

---

## Session Set Configuration

```yaml
totalSessions: 4
requiresUAT: true
requiresE2E: true
uatScope: per-set
uatStyle: ad-hoc
effort: high
```

> **Rationale:** Codex launch behavior is operator-visible and must not
> regress into config-file watcher inference. The set needs IDE-level
> coverage and manual validation of the real CLI launch path.

---

## Project Overview

- Session 1 discovers the current Codex CLI launch surface: interactive
  versus prompt mode, model/effort flags, profiles, sandbox/approval,
  and native resume behavior.
- Sessions 2-3 implement `CodexLaunchAdapter`, attach handling, and
  actual-model reporting without reviving config watchers.
- Non-goals:
  - reintroducing `config.toml` watcher inference;
  - a Codex-owned substitute for Dabbler's lifecycle writer;
  - the in-extension chat transcript UI.

---

## Sessions

### Session 1 of 4: Discovery and local characterization for Codex CLI

**Steps:**
1. Read current Codex docs and locally characterize the CLI flags for
   model, effort, profile, mode, sandbox/approval, and resume.
2. Decide which Codex capabilities fit directly into the shared launch
   contract and which need adapter-specific notes.
3. Record any version-sensitive surfaces and confirm that Set 036's
   watcher-retirement rules remain intact.

**Creates:**
- `docs/session-sets/040-codex-launch-adapter/discovery-notes.md`

**Touches:**
- Codex planning notes as needed

**Ends with:** a pinned Codex capability map for launch/attach work.

**Progress keys:**
- `session-001/codex-docs-read`
- `session-001/local-cli-characterized`
- `session-001/watcher-retirement-reconfirmed`
- `session-001/round-a-verification`

---

### Session 2 of 4: Implement `CodexLaunchAdapter.buildLaunchPlan()`

**Steps:**
1. Implement interactive and prompt-mode launch-plan generation for
   Codex, including model, effort, profile, and mode mapping.
2. Decide how isolation/home semantics should work for Codex in the
   shared launcher without relying on watcher-driven config reads.
3. Wire the adapter into the shared registry and add focused argv/env
   tests.
4. Preserve a clear separation between Dabbler `chatSessionId` and any
   Codex-native resume token.

**Creates:**
- Codex adapter implementation and focused tests

**Touches:**
- shared launch registry and command surfaces as needed

**Ends with:** Codex has a working launch-plan generator and adapter
registration backed by unit tests.

**Progress keys:**
- `session-002/codex-adapter-added`
- `session-002/profile-mapping-wired`
- `session-002/isolation-policy-wired`
- `session-002/unit-tests-green`

---

### Session 3 of 4: Attach/resume, actual-model reporting, and IDE wiring

**Steps:**
1. Implement the attach path when Codex exposes a stable native resume
   surface; otherwise capture the limitation in capability metadata.
2. Add actual-model reporting from the best stable Codex output source.
3. Add Layer-2 and Layer-3 coverage for launch, attach, and refusal UX.
4. Confirm the operator flow no longer implies background watcher-based
   detection.

**Creates:**
- Codex launch/attach integration tests

**Touches:**
- Codex-facing command surfaces and any UI badges/tooltips

**Ends with:** Codex launch and attach behavior is fully explicit and
tested.

**Progress keys:**
- `session-003/attach-path-added`
- `session-003/model-reporting-wired`
- `session-003/layer3-tests-green`
- `session-003/no-watcher-regression`

---

### Session 4 of 4: Regression, UAT, docs, and change-log

**Steps:**
1. Run focused regression coverage for the Codex adapter and command
   flows.
2. Produce the ad-hoc UAT checklist for Codex launch, attach, and error
   handling.
3. Update docs and operator guidance.
4. Write `change-log.md` and close the set.

**Creates:**
- `docs/session-sets/040-codex-launch-adapter/change-log.md`
- `docs/session-sets/040-codex-launch-adapter/040-codex-launch-adapter-uat-checklist.json`

**Touches:**
- Codex-specific docs and shared launch docs as needed

**Ends with:** Codex is onboarded to the shared launch-adapter path and
documented for downstream chat work.

**Progress keys:**
- `session-004/regression-green`
- `session-004/uat-checklist-written`
- `session-004/docs-updated`
- `session-004/change-log-written`