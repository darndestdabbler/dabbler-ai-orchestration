ISSUES FOUND

- **Issue 1:** The extension targets `session-plan.md`, while the active sessions plan is `docs/sessions/project-work-plan.md`.
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `tools/dabbler-ai-orchestration/src/utils/fileSystem.ts`, `tools/dabbler-ai-orchestration/src/utils/projection.ts`, `tools/dabbler-ai-orchestration/src/extension.ts`, `tools/dabbler-ai-orchestration/src/commands/openFile.ts`, `tools/dabbler-ai-orchestration/src/test/playwright/electronLaunch.ts`, `tests/test_progress.py`, `docs/sessions/project-work-plan.md`
  - **Failure scenario:** In this repository—and likely in projects scaffolded with the same canonical sessions artifacts—the repository and session-row open actions resolve `<root>/docs/sessions/session-plan.md`. The actual active plan is `project-work-plan.md`, so a typical operator clicking a session row either gets “Session plan not found” or opens a different/stale file if both names exist. Plan edits also do not invalidate the projection cache or trigger the watcher because both monitor the wrong filename. This directly breaks the main sessions-view workflow.
  - **Acceptance criterion:** `JUDGMENT - The repository/session open action, projection cache inputs, filesystem watcher, title-healing fixtures, and Playwright fixtures must all resolve the canonical docs/sessions/project-work-plan.md artifact through one shared filename definition.`
  - **Details:**
    - **Violation:** The plan requires preserving the row action that opens the plan and rendering titles from “the plan’s `### Session N:` headings.”
    - **Impact:** Opening session rows and refreshing titles after plan edits fail on the primary path, which materially impairs the collapsed sessions view.
    - **Evidence:** `PLAN_FILENAME` is hardcoded as `"session-plan.md"` in `fileSystem.ts`; `projection.ts`, `extension.ts`, and the new fixtures repeat that filename. The active plan and stated framework bookkeeping use `docs/sessions/project-work-plan.md`.
    - **Fix:** Use the canonical project-work-plan filename everywhere, preferably through a single shared TypeScript constant, and update fixtures to exercise the real artifact name.

- **Issue 2:** The required single session-number formatter does not cover Python CLI human output.
  - **Category:** Completeness
  - **Severity:** Major
  - **Evidence paths:** `tools/dabbler-ai-orchestration/src/providers/sessionsModel.ts`, `tools/dabbler-ai-orchestration/src/providers/workExplorerTreeModel.ts`, `ai_router/progress.py`, `ai_router/writers.py`, `tests/test_session.py`, `tools/dabbler-ai-orchestration/src/test/suite/sessionsModel.test.ts`
  - **Failure scenario:** Operators routinely move between the tree and `ai_router.session` commands. The tree and repository status text now format numbers through the TypeScript-only `padSessionNumber`, but no Python CLI human-output path was changed to consume a canonical formatted session name. Consequently the CLI can continue presenting plain numbers while the tree presents `001`, `002`, etc.; future formatting changes can also diverge because the TypeScript formatter cannot govern Python output.
  - **Acceptance criterion:** `JUDGMENT - Tree labels, extension status text, and real Python CLI human output must obtain three-digit session names from one canonical formatting contract, with tests proving session 1 is displayed as 001 while sessions.json values and CLI arguments remain integers.`
  - **Details:**
    - **Violation:** The explicit requirement says, “One formatter owns the padding so the tree, the CLI’s human output and any status line cannot disagree.”
    - **Impact:** A central presentation requirement remains incomplete on a normal operator path, defeating the stated purpose of restoring the staff-readable session-number shape consistently.
    - **Evidence:** The only introduced formatter is `padSessionNumber` in the extension’s `sessionsModel.ts`. It is used by tree and repository display code, while the Python changes concern title healing and ledger growth; there is no corresponding CLI human-output integration or CLI-output test.
    - **Fix:** Establish one canonical session display-name contract available to both projection/tree rendering and Python CLI output, then test the actual CLI output rather than only the TypeScript helper.