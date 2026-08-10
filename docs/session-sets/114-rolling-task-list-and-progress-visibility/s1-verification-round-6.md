ISSUES FOUND

- **Issue 1:** `disposition.json` uses an invalid `next_orchestrator.reason` shape.
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** This is Session 1 of 3, so close-out must validate a non-final-session `next_orchestrator`. The current disposition uses `reason.detail` instead of the schema-required `reason.specifics`, so the registered `next_orchestrator_present` gate rejects it and the session cannot close on the normal path.
  - **Acceptance criterion:** `JUDGMENT - Set 114 Session 1's disposition.json uses next_orchestrator.reason.specifics, not detail, with at least 30 non-whitespace characters, and the next_orchestrator_present gate passes for that disposition.`
  - **Details:** **Violation:** `docs/disposition-schema.md` documents `reason.specifics` as required, and `validate_next_orchestrator` requires it. **Impact:** a non-blocking verification would still be followed by deterministic close failure, changing the merge/close decision. **Evidence:** current `disposition.json` has `"reason": { "code": "...", "detail": "..." }`; probing `check_next_orchestrator_present` returns `False, 'next_orchestrator invalid: reason.specifics must be at least 30 chars (got 0)'`.

NITS

- **Nit:** `docs/session-constitution.md` line 242 merges two pointer-table rows with `||`, corrupting that Markdown row.
- **Nit:** `ai_router/docs/close-out.md` still enumerates deterministic gates without naming the new `checklist_posted` gate.
- **Nit:** `validate_disposition(Disposition(...))` does not validate the new `checklist` field because the dataclass-to-dict path omits it; dict validation does cover it.