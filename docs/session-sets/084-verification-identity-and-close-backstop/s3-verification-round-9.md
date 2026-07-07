**ISSUES FOUND**

The provided evidence shows a complete failure to deliver any of the work specified in the task. The working tree contains none of the required changes to documentation, configuration files, or source code.

### Issue 1: Required Work Is Not Present

-   **Category:** Completeness
-   **Severity:** Critical
-   **Details:**
    -   **Violation:** The task requires the delivery of a substantial set of changes: "Instruction-surface updates for effective-provider identity...", "The per-set UAT checklist...", "Release PREP: `pyproject.toml` -> `0.29.0`...", and "A **Windows drive-letter case-sensitivity fix**...".
    -   **Impact:** The entire purpose of the session's work is missing. The release cannot be prepared, critical documentation is not updated, the UAT checklist does not exist, and a known bug remains unfixed. This completely blocks the merge and the associated releases.
    -   **Evidence:** The provided `git diff` shows only changes to session-tracking metadata files (`disposition.json` and `session-events.jsonl`). It contains **none** of the changes to the files listed as deliverables in the task description, such as `docs/templates/consumer-bootstrap/*`, `084-...-uat-checklist.json`, `pyproject.toml`, `ai_router/CHANGELOG.md`, or any of the Python files in `ai_router/` related to the Windows path fix. The work was either not done or not included in the provided evidence.