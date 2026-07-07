## ISSUES FOUND

### Issue 1: Backstop-written bookkeeping is only tolerated on the run that wrote it, so a rerun after any later gate failure is not actually idempotent
- **Category:** Correctness
- **Severity:** Major
- **Details:**
  - **Violation:** The task requires the backstop to be **“idempotent under the close lock”** (Session 2 step 3). The new docs make the same promise more concretely: **“a re-run after a backstop-verified close finds the stamped evidence and skips”** and the backstop’s artifacts are **“close-out bookkeeping [that] the working-tree gate tolerates … and the operator commits … in the close-out commit.”**
  - **Impact:** A supported close path breaks: if the backstop succeeds, writes `sN-verification*.md` / `sN-issues*.json` / patched `disposition.json`, and then some *later* deterministic gate fails, the next `close_session` rerun skips the backstop but no longer ignores those already-written bookkeeping files. The rerun then fails `working_tree_clean` unless the operator manually commits the bookkeeping outside the promised close-out flow. That is a real workflow break and contradicts the claimed idempotence.
  - **Evidence:**  
    - In `ai_router/close_session.py`, `backstop_written_paths` is only populated when `backstop.status == STATUS_VERIFIED`, and only for the **current** run:
      - `backstop_written_paths = list(backstop.written_paths)`
      - `_run_gate_checks(... extra_clean_ignore=backstop_written_paths)`
    - On a rerun with existing valid stamped evidence, `ai_router/close_backstop.py` returns `STATUS_SKIPPED_EVIDENCE_PRESENT`, so `backstop_written_paths` stays empty.
    - In `ai_router/gate_checks.py`, `check_working_tree_clean()` ignores backstop files **only** via `extra_ignore_paths`; there is no standing ignore for prior `sN-verification*.md`, `sN-issues*.json`, or patched `disposition.json`.
    - Therefore those files are tolerated on the run that created them, but not on the rerun that the docs claim is idempotent.
  - **Correct answer:** When the backstop skips because valid stamped evidence already exists, rediscover that authoritative evidence’s artifact/issues/disposition paths and keep passing them to `working_tree_clean`, or otherwise make the gate tolerate exactly those corroborating bookkeeping files across reruns. Add a regression test for: backstop `VERIFIED` → later gate fails → rerun reuses existing evidence without tripping `working_tree_clean`.

#### NITS

- **Nit:** `ai_router/tests/test_close_backstop.py::test_backstop_close_is_idempotent_under_rerun` does not exercise the skip path that the new idempotence logic depends on; its second call returns `noop_already_closed`, so it never covers `STATUS_SKIPPED_EVIDENCE_PRESENT`.