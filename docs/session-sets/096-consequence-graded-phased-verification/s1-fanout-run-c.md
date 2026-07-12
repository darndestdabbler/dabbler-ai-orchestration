ISSUES FOUND

- **Issue 1:** The walkthrough’s generated Python artifacts are not constrained to match the fixed CI and launch commands.
  - **Category:** Completeness
  - **Severity:** Major
  - **Details:** **Violation:** The task requires a “copy-pasteable, runnable” end-to-end walkthrough, but Parts 4–5 request only “a unit test” and an integration program without specifying the test framework, test layout, package structure, or entry-point filename. **Impact:** A typical AI may generate pytest-style tests or tests in a non-package `tests/` directory; Part 7 then runs only `unittest.defaultTestLoader.discover(...)` and deliberately fails when it collects zero tests. Because those jobs become required checks, Priya’s or Sam’s implementation PR cannot merge, stalling the walkthrough. Likewise, Part 10 assumes `services/integration/app.py`, although no earlier instruction requires that file, and direct script execution commonly fails for package imports even when integration tests pass. **Evidence:** Parts 4–5 say only “plus a unit test”; Part 7 hard-codes `unittest` discovery and zero-test failure; Part 10 uses `python services/integration/app.py` with “adjust to the entry point,” conceding that the documented command is not deterministic. The walkthrough should require discoverable `unittest.TestCase` files and a fixed package/entry-point contract, or make CI and launch commands detect and run the framework/layout actually generated.

#### NITS

- **Nit:** `run_review.py` reads only `.github/CODEOWNERS`; GitHub also supports `CODEOWNERS` at the repository root and under `docs/`, so a valid repository using either location can receive a false missing-coverage finding.
- **Nit:** The routed review output filename contains only the date, so a second review on the same day silently overwrites the first report.
- **Nit:** The hotfix drill validates the exact tagged commit with only the greeter unit tests, not the integration or all-module suite, despite then deploying that exact snapshot.
- **Nit:** After a failed fetch, the review script still prefers any existing `origin/main` over a potentially newer local `main`, despite describing the selected base as “the freshest main available”; the advisory cap limits the damage.
- **Nit:** Repository files are appended directly to the routed prompt without explicitly instructing the model to treat their contents as untrusted evidence and ignore embedded instructions, leaving a prompt-injection hardening gap.