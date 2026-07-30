ISSUES FOUND

### Issue 1: The completion steps are not executable as written on macOS or Linux

- **Category:** Completeness
- **Severity:** Major
- **Location:** `docs/tutorials/hello-world.md` → `## 4. See that it worked`
- **Failure scenario:** A macOS or Linux reader follows the tutorial literally. Step 2 correctly gives them `.venv/bin/python`, but Step 4 supplies only Windows commands using `.venv\Scripts\python.exe`. That path does not exist on their system, so they cannot obtain the required green-test result or run the program without independently translating the commands. This is probable because the tutorial explicitly supports macOS/Linux and these platforms represent a substantial part of the intended audience.
- **Details:**
  - **Violation:** The success criterion requires “green tests, the program running,” with commands and paths matching the product.
  - **Impact:** A supported-platform reader encounters a command failure on the main path at the final proof of success. That materially impairs the first-run objective and should block merging the tutorial.
  - **Evidence:** Step 2 provides separate Windows and macOS/Linux commands. Step 4 instead shows only:
    - `.venv\Scripts\python.exe -m unittest`
    - `.venv\Scripts\python.exe main.py`
  - **Fix:** Add `.venv/bin/python -m unittest` and `.venv/bin/python main.py` alternatives in Step 4, matching Step 2’s platform treatment.

### Issue 2: The tutorial gate does not enforce the literal and negative constraints it claims to protect

- **Category:** Completeness
- **Severity:** Major
- **Location:** `ai_router/scripts/tutorial_gate.py` → `check_first_run_constraint`, checks 2–4, and `check_command_titles`; `ai_router/tests/test_tutorial_gate.py`
- **Failure scenario:** During routine maintenance, a contributor adds a common forbidden instruction such as `git diff`, generic branch instructions, an unlabelled YAML block, or updates a dialog/button/notification string in `sampleProject.ts`. The required CI gate remains green, allowing the first-run tutorial to regain prohibited complexity or present stale product literals. This is probable over the document’s lifetime—the session explicitly introduced the gate because such drift is expected.
- **Details:**
  - **Violation:** The task requires a successor literal gate “to cover the new document set, so the two tutorials cannot drift apart silently,” while the conventions claim check 6 “machine-enforces” the absence of git, YAML, branch, host, and governance content.
  - **Impact:** The principal regression-prevention deliverable is materially incomplete. CI can approve exactly the cognitive-load and literal-drift regressions the session was created to prevent.
  - **Evidence:**
    - `_GIT_COMMAND_RE` omits common commands including `git diff`, `git log`, `git show`, `git reset`, `git clean`, and `git worktree`.
    - Branch detection only covers `branch protection` and `branch polic...`; ordinary branch instructions pass.
    - YAML detection only recognizes fences explicitly tagged `yaml` or `yml`; untagged YAML passes.
    - The gate never reads `sampleProject.ts`, so the tutorial’s dialog title, button labels, notifications, clipboard confirmation, and other UI messages are not bound to their product constants.
    - Shell commands are not validated.
    - Required inputs fail open: missing `package.json`, bundle data, or `hello-world.md` generally produce no violations, and `test_missing_surfaces_produce_no_violations` codifies that behavior.
    - The dot-file test only inspects `rendered_bundle_paths`; it does not prove that quoting `.gitignore` is accepted by `check_bundle_literals`, whose path regex does not match that filename.
  - **Fix:** Bind all quoted product UI literals to exported/source constants, validate the documented shell commands, enforce required input presence, expand the prohibited-content checks to the full stated contract, and add falsification tests for omitted git commands, generic branch content, untagged YAML, source-string drift, and missing required surfaces.

#### NITS

- **Nit:** `docs/tutorials/hello-world.md` omits Git from the prerequisites, while `s2-desk-check.md` confirms the sample relies on repository-local Git configuration, commits, and a clean-working-tree gate. Git-less users will fail; add Git as an installed prerequisite without teaching any Git commands.
- **Nit:** `README.md`, `getting-started.md.template`, and `adopt-dabbler.md` describe the sample as needing “no git” or “no repository,” although it creates and uses a local Git repository. “No Git commands or remote host required” would be accurate.
- **Nit:** The tutorial presents `Ran 2 tests in 0.000s` as literal output, but elapsed time is machine-dependent. Use `Ran 2 tests in ...s` or explain that the timing value may differ.
- **Nit:** The required Full-tier closing sentence does not itself link to `adopt-dabbler.md`; the link is in the preceding bullet. The destination remains discoverable, so the reader impact is small, but combining the link and Full-tier note into the final sentence would satisfy the stated contract directly.