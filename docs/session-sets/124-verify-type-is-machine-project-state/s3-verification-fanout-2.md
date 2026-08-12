ISSUES FOUND

**Issue 1:** The extension hides `verify_type`’s successful-with-warning `.gitignore` failure and still reports the file as gitignored.
- **Category:** Correctness
- **Severity:** Major
- **Evidence paths:** `ai_router/verify_type.py:311-323`, `tools/dabbler-ai-orchestration/src/utils/copilotSeatSetup.ts:1004-1033`, `tools/dabbler-ai-orchestration/src/utils/copilotSeatSetup.ts:850-858`
- **Failure scenario:** During the normal `Dabbler: Set Up Copilot Seat` path, if `.gitignore` is read-only/locked/unwritable but the project file itself can still be written, `write_project_verify_type` prints a stderr warning and exits 0. The extension treats exit 0 as unconditional success, discards stderr, and shows “gitignored,” so the operator can commit the machine-local answer with `git add -A`. This is probable for every user who hits the explicitly supported fail-open branch; the branch was important enough to add a falsifier, but the extension path suppresses its only signal.
- **Acceptance criterion:** `JUDGMENT - A successful verify_type subprocess that emits stderr warning text about adding /project-verify-type.txt to .gitignore must surface that warning in the seat-setup outcome/toast instead of reporting an unconditional gitignored success.`
- **Details:** Violation: the change claims the extension “inherits the guarantee through the spawn,” while `write_project_verify_type` explicitly says a `.gitignore` failure “is reported on stderr and does not block the answer itself.” Impact: the merge would reintroduce the exact committable machine-state failure this session is meant to eliminate for the extension’s primary Copilot setup path. Evidence: Python warns and exits successfully; TypeScript ignores stdout/stderr on exit 0 and the success message asserts the file is gitignored.

**NITS**
- **Nit:** `performCopilotSeatSetup` still has a stale duplicate JSDoc saying it writes `transport.profile: copilot-cli` into `ai_router/local-overrides.yaml` (`tools/dabbler-ai-orchestration/src/utils/copilotSeatSetup.ts:1068-1075`).
- **Nit:** `--project-root` can write to a non-git directory but then immediately resolve as setup-required because reads still require an enclosing `.git`; that contradicts the extension comment that `--project-root` protects scaffolded projects that are not yet git repos, but the common scaffold path normally runs `git init` first.