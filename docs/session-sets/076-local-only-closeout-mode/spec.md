# Local-Only Close-Out Mode

> **Purpose:** Add a first-class "local-only" signal so a repo that
> deliberately has no git remote (and never will) can pass the close-out gate
> cleanly, instead of being forced to bypass every close with `--force`.
> **Created:** 2026-06-23
> **Session Set:** `docs/session-sets/076-local-only-closeout-mode/`
> **Prerequisite:** None
> **Workflow:** Orchestrator -> AI Router -> Cross-provider verification

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: false
requiresE2E: false
pathAwareCritique: none
contractGate: none
```

> Rationale: Internal `ai_router` tooling change (close-out gate behavior, a
> small CLI affordance, and a patch release) with no UI surface, so no UAT or
> E2E gate. Cross-provider verification plus the new unit tests are the quality
> bar. Design background: `docs/proposals/2026-06-23-lightweight-tier-leak-and-local-only-closeout.md` (Defect 2).

---

## Project Overview

`check_pushed_to_remote` (`ai_router/gate_checks.py`) treats a missing upstream
as a configuration error and **fails** the close-out gate. The gate runs on
both tiers — only `--force` skips the gate run entirely
(`ai_router/close_session.py`), not `--no-router`. A repo that is intentionally
remote-less therefore cannot close cleanly: the operator must `--force` every
session, which produces `forceClosed: true` / `[FORCED]` on work that has no
actual problem and conflates steady-state closes with incident recovery.

This set adds a durable, repo-level **local-only** signal. When set, the push
gate becomes a soft *pass-with-note* (the branch is genuinely local by design)
instead of a configuration-error failure — but **only** when no remote is
configured, so the signal can never mask a real "forgot to push to an existing
remote" miss.

**Non-goals:**

- The Getting Started tier-leak defect (Defect 1 in the proposal) — separate
  set.
- Any change to the other gates (`working_tree_clean`, `activity_log_entry`,
  `next_orchestrator_present`, `change_log_fresh`) — they still apply
  unchanged on a local-only repo.
- `--force` is **not** removed or repurposed; it remains the incident-recovery
  bypass.

---

## Feature 1: Local-only signal and gate behavior

### Scope

- A durable, tier-agnostic repo-level marker (`.dabbler/local-only`) is the
  source of truth — it sits beside the existing `.dabbler/install-method`, works
  on Full and Lightweight alike, and survives window reloads (unlike volatile
  webview state).
- `check_pushed_to_remote` consults the marker. Behavior matrix:
  - marker present **and no remote/upstream configured** → **pass**, with a
    `gate_results` note ("local-only repo: push gate waived");
  - marker present **but a remote exists and the branch is unpushed** → **fail**
    (unchanged) — local-only must not mask a real unpushed state;
  - marker absent → **unchanged** behavior in every case.

### Standards

- The marker check is a small pure helper (e.g. `is_local_only(repo_root)`) so
  it is unit-testable without a live git tree; the gate resolves the repo root
  from the session-set dir.
- No new third gate is added — this is a behavior branch inside the existing
  `check_pushed_to_remote`, preserving the `GATE_CHECKS` order and the JSON
  `gate_results` shape consumers pin against.

---

## Feature 2: Operator affordance and release

### Scope

- A blessed, idempotent way to set/clear the marker (a small CLI entry point,
  e.g. `python -m ai_router.local_only --enable | --disable | --status`) so the
  operator never hand-creates the file by guesswork; manual creation still
  works since it is just a marker.
- Documentation: `ai_router/docs/close-out.md` (the local-only close path as a
  sanctioned, non-incident mechanism), the `check_pushed_to_remote` docstring,
  and `docs/ai-led-session-workflow.md` Step 8 close-out pointer.
- A `dabbler-ai-router` patch release through the repo runbook.

### Standards

- Enabling local-only is recorded so the audit trail explains why the push gate
  passed-with-note rather than ran (reuse the existing close-out event/note
  surface; do not invent a parallel ledger).

---

## Sessions

### Session 1 of 2: Local-only signal + gate behavior + tests

**Steps:**
1. Register the session start (`start_session`).
2. Add the `is_local_only(repo_root)` helper and the `.dabbler/local-only`
   marker contract; resolve the repo root from the session-set dir inside the
   gate.
3. Branch `check_pushed_to_remote` per the Feature 1 matrix: pass-with-note when
   local-only and no remote; unchanged otherwise (including the
   remote-exists-but-unpushed guard).
4. Add unit tests in `ai_router/tests/` covering all three matrix rows plus the
   no-marker regression, and confirm the existing gate suite stays green.
5. Close the session with verification artifacts and commit.

**Creates:** the local-only helper + marker contract; new tests under
`ai_router/tests/`; session artifacts under this directory.
**Touches:** `ai_router/gate_checks.py` (and `close_session.py` only if repo-root
plumbing requires it).
**Ends with:** `check_pushed_to_remote` passes-with-note on a marker-set,
remote-less repo and is unchanged otherwise; the new and existing gate tests
pass.
**Progress keys:** `session-001/gate-behavior`, `session-001/tests-green`

---

### Session 2 of 2: Operator affordance, docs, and patch release

**Steps:**
1. Register the session start.
2. Add the `ai_router.local_only` CLI (`--enable` / `--disable` / `--status`),
   idempotent and writing the audit note on enable.
3. Update `ai_router/docs/close-out.md`, the `check_pushed_to_remote` docstring,
   and the `docs/ai-led-session-workflow.md` close-out pointer to document the
   local-only path as a sanctioned (non-incident) close mechanism.
4. Bump `dabbler-ai-router` patch metadata and changelog; run the focused tests
   and packaging/version checks for a patch release.
5. Close the set with `change-log.md`, verification artifacts, commit, and the
   tag-driven PyPI publish once the target commit is green.

**Creates:** the CLI entry point; `change-log.md`; session artifacts.
**Touches:** `ai_router/docs/close-out.md`, `ai_router/gate_checks.py`
docstring, `docs/ai-led-session-workflow.md`, changelog/version metadata.
**Ends with:** an operator can enable/disable local-only via a blessed CLI; the
docs describe the sanctioned local-only close path; the patch release is
prepared/published through the runbook.
**Progress keys:** `session-002/cli-and-docs`, `session-002/release`

---

## End-of-set deliverables

- `check_pushed_to_remote` honors the `.dabbler/local-only` marker (pass-with-note
  when remote-less; never masks a real unpushed-to-existing-remote state).
- A blessed `ai_router.local_only` CLI to enable/disable/inspect the signal.
- Unit tests covering the full behavior matrix.
- Updated close-out / workflow docs describing local-only as a sanctioned,
  non-`--force` close path.
- A `dabbler-ai-router` patch release.
