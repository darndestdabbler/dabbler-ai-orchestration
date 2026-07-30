ISSUES FOUND

- **Issue 1: The completion steps use Windows-only commands despite explicitly supporting macOS and Linux**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** A macOS or Linux reader follows section 4 literally after the AI finishes. Both `.venv\Scripts\python.exe -m unittest` and `.venv\Scripts\python.exe main.py` fail because that executable path does not exist on POSIX systems. This is probable because those platforms are explicitly supported and section 2 trained readers to expect platform-specific instructions.
  - **Location:** `docs/tutorials/hello-world.md`, section `## 4. See that it worked`
  - **Details:**
    - **Violation:** The success criterion requires “green tests, the program running,” and every command must match the product environment.
    - **Impact:** macOS/Linux readers cannot complete the documented verification steps as written, materially impairing the first-run objective.
    - **Evidence:** Section 2 supplies `.venv/bin/python -m unittest` for macOS/Linux, but section 4 supplies only the Windows paths for both tests and `main.py`.
  - **Fix:** Add `.venv/bin/python -m unittest` and `.venv/bin/python main.py` alternatives in section 4.

- **Issue 2: The anti-drift gate does not enforce the first-run contract it claims to machine-enforce**
  - **Category:** Completeness
  - **Severity:** Major
  - **Failure scenario:** A routine future documentation edit copies configuration material into `hello-world.md` using the document’s established unlabelled-fence style, or adds a raw command such as `git diff`. CI remains green even though forbidden YAML or raw git has returned. This is probable over the document’s lifetime because preventing exactly this regression is the gate’s stated purpose, and every current code/output fence in the tutorial is unlabelled.
  - **Location:** `ai_router/scripts/tutorial_gate.py`, `_GIT_COMMAND_RE`, `_YAML_FENCE_RE`, `check_first_run_constraint`, and `check_bundle_test_count`
  - **Details:**
    - **Violation:** The response claims check 6 “machine-enforces” that `hello-world.md` contains “no git command” and “no YAML,” and claims the gate prevents the two tutorials from drifting.
    - **Impact:** The central regression-prevention deliverable can report success while the cognitive-load constraints it was created to protect are broken.
    - **Evidence:**
      - `_GIT_COMMAND_RE` recognizes only a hand-selected subset. Commands such as `git diff`, `git log`, `git show`, `git clean`, `git reset`, `git rm`, and `git cherry-pick` pass.
      - `_YAML_FENCE_RE` recognizes only fences explicitly labelled `yaml` or `yml`. An unlabelled YAML block—matching the tutorial’s current fence style—passes.
      - Nothing enforces the required closing Full-tier sentence or its uniqueness.
      - `check_bundle_test_count` accepts one `Ran 2 tests` occurrence, despite the response claiming it binds both before/after tallies.
      - The adjudication says the starter line in `hello-world.md` is “pinned … against `bundle.json`,” but the implementation checks only the slug `001-add-a-shout`; changing or deleting `Start the next session of` still passes. `adopt-dabbler.md` receives no corresponding starter-line check.
  - **Fix:** Enforce any raw `git <token>` invocation, detect YAML content independently of fence labels, assert the required closing sentence and placement, require both failing and passing test-result blocks, and bind the complete starter-line literal in both tutorials to a canonical product source.

#### NITS

- **Nit:** The gate deliberately succeeds when required surfaces are missing. `check_command_titles`, the bundle checks, and `check_first_run_constraint` return no violations when `package.json`, `bundle.json`, or `hello-world.md` is absent; `test_missing_surfaces_produce_no_violations` codifies that behavior. Missing required inputs should produce violations rather than silently disabling checks.

- **Nit:** The prerequisites omit Git even though the recorded workflow configures a repository-local identity, commits the session, and requires a clean working tree. Most target developers likely already have Git, so this is non-blocking, but “prerequisites stated honestly” would be better served by listing Git without teaching any Git commands. The related README phrase “no repository” is also inaccurate—the command creates a local repository; “no repository to create or host” would be precise.

- **Nit:** `Ran 2 tests in 0.000s` presents nondeterministic elapsed time as exact output. `unittest` can report another duration on a slower machine. Use `Ran 2 tests in …` or explicitly state that the timing may differ.