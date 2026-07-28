ISSUES FOUND

- **Issue 1: The release guide still uses the broken direct-script invocation**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** A reader completes the tutorial with `services/app/app.py` importing `services.greeter`, then follows the release guide to deploy or validate a hotfix. Running `python services/app/app.py` places `services/app` rather than the repository root at `sys.path[0]`, so the sibling-module import likely fails with `ModuleNotFoundError`. This is probable because the tutorial explicitly designs and tests the application for module execution with `python -m services.app.app`.
  - **Details:**
    - **Violation:** The task requires the release/recovery document’s commands to be verified and performable. The tutorial’s established execution contract is `python -m services.app.app`.
    - **Impact:** The documented deployment and exact-hotfix validation steps can fail even after the tutorial’s tests and main-path execution succeed, materially breaking a primary deliverable.
    - **Evidence:** `docs/tutorials/release-and-recovery.md` uses `python services/app/app.py` under both **What "deploy" means here** and **Validate before you tag**, while `docs/tutorials/hello-world.md` consistently requires `python -m services.app.app`.
    - **Location:** `docs/tutorials/release-and-recovery.md`, lines 36 and 69.
    - **Fix:** Replace both invocations with `python -m services.app.app`.

#### NITS

- **Nit:** `docs/tutorials/hello-world.md` is 314 lines despite the explicit session end condition of `≤ ~260 lines`. The reduction remains substantial, but this is still an acknowledged specification deviation.
- **Nit:** The final worktree checklist uses only `.venv\Scripts\python.exe`; the tutorial otherwise supports macOS/Linux, where the equivalent is `.venv/bin/python`.