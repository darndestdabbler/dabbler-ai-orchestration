ISSUES FOUND

- **Issue 1:** `session_touched()` fails the repo’s own Windows-path test on Ubuntu/macOS.
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** The required `python-tests` matrix runs on `ubuntu-latest` and `macos-latest`; there `os.sep == "/"`, so `files_changed=["src\\nested\\a.ts"]` is not normalized and the new `test_normalises_windows_separators` fails. This is probable because the workflow always runs `python -m pytest -v` on those OSes.
  - **Acceptance criterion:** `JUDGMENT - On a POSIX runner, ai_router.run_of_record.session_touched("", ("src/",), ["src\\nested\\a.ts"]) returns True and the Python matrix no longer fails this test.`
  - **Details:** Violation: the code claims “Paths are normalised to posix separators” so Windows-authored dispositions match POSIX covers. Impact: the PR’s CI goes red on two matrix legs, and the freshness gate can miss Windows-style paths on POSIX. Evidence: `run_of_record.py` normalizes with `.replace(os.sep, "/")`; on POSIX that does not replace backslashes, while `test_run_of_record.py` asserts that exact backslash path should match.

- **Issue 2:** The walk stager’s shared VS Code resolver does not support the macOS `.app` layout that the existing Playwright harness already handles.
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** A macOS operator follows `npm run walk` after the Playwright download has populated `.vscode-test/vscode-darwin-.../Visual Studio Code.app/Contents/MacOS/Electron`. `scripts/vscode-launch.js` only checks `<versionDir>/Contents/MacOS/Electron`, so it throws “No VS Code binary found” and the guided walk never starts. This is probable for supported macOS users because the repo already has macOS CI and the existing harness carries a macOS-specific resolver for this exact layout.
  - **Acceptance criterion:** `JUDGMENT - The walk stager resolver reuses or matches the Playwright resolver for macOS app bundles, with a test covering a vscode-darwin version dir containing Visual Studio Code.app/Contents/MacOS/Electron.`
  - **Details:** Violation: the spec required the walk stager to reuse the Playwright `launchVSCode` machinery. Impact: a required UAT entry point fails for macOS operators. Evidence: `vscode-launch.js` checks only `Code.exe`, `Contents/MacOS/Electron`, and `code`; `electronLaunch.ts` searches child `.app` bundles and documents the prior macOS-only failure.

- **Issue 3:** The walk stager inherits the full parent environment instead of the Playwright harness’s sanitized Electron environment.
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** An operator runs `npm run walk` from VS Code’s integrated terminal, which commonly carries `VSCODE_*` IPC variables and may carry Electron-related variables. `stage-walk.js` passes all of `process.env` into the child Code process, reintroducing the host-pollution failure the Playwright harness explicitly prevents, so the walk can attach to/behave like the wrong VS Code process instead of the isolated Extension Development Host. This is probable because the operator workflow normally happens inside VS Code.
  - **Acceptance criterion:** `JUDGMENT - stage-walk.js builds the child environment from the same allowlist as the Playwright Electron launch, plus DABBLER_WALK, and tests prove VSCODE_* and ELECTRON_RUN_AS_NODE are not inherited.`
  - **Details:** Violation: the walk is supposed to launch the same isolated host configuration the suite exercises. Impact: the self-staging UAT walk can fail or open the wrong host for the most common launch context. Evidence: `stage-walk.js` uses `env: { ...process.env, DABBLER_WALK: "1" }`, while `electronLaunch.ts` documents the IDE-pollution issue and launches with `_electronEnv()`.

NITS

- `session_touched()` also uses `.lstrip("./")`, which strips the leading dot from paths like `.github/workflows/test.yml`; a suite covering `.github/` would not match that changed file.
- `load_suites()` silently skips malformed custom suite entries and can return an empty suite list when `testing.suites` is present but invalid, which can disarm the freshness gate for a config typo.
- The docs advertise `spec_admission --all --check` as CI-friendly, but it exits non-zero on the current repo’s historical specs without a baseline/exception strategy.