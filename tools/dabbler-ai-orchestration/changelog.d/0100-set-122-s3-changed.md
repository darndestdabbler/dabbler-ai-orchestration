### Changed

- **(Set 122 S3) Project setup now guarantees the router the module
  commands need — and refuses to half-finish when it cannot.** Session 2
  made every module command shell out to `python -m ai_router.modules`.
  Nothing yet guaranteed that module was present, or new enough, and the
  gap had a known victim: a developer whose `.venv` already held an older
  `dabbler-ai-router` would take the Marketplace update and then fail
  *every* module command with `No module named ai_router.modules`.
  Re-running **Dabbler: Set Up New Project** did not help, because the
  install was a plain `pip install`, which pip reports as
  already-satisfied against an existing installation.

  Three things close it:

  - **A version floor, declared once.** `MINIMUM_ROUTER_VERSION` and the
    pinned requirement derived from it are the single place the minimum is
    stated; the install path and the capability precondition both read it,
    rather than keeping version constants that drift apart. The install
    now requests that floor and passes `--upgrade`, so an existing older
    installation is **upgraded rather than accepted**. (`Dabbler: Update
    ai-router` is unchanged — it additionally force-reinstalls from a cold
    cache to repair a corrupt install.)
  - **A capability probe, not a pip exit code.** After installing, setup
    asks *the same venv interpreter the commands will use* to import
    `ai_router.modules`. Success is that import, never pip's return value.
    A failure is reported as a failed install — with the existing
    "this is an interpreter/installation problem, NOT missing API keys"
    guidance — and no Python-backed module creation is attempted.
  - **A setup you can re-run.** Default-module creation used to be gated
    on whether *that same call* created `docs/modules.yaml`. Since the
    manifest is written before the install runs, a failed install consumed
    the only chance to create the module, and the only recovery was
    deleting a file nobody had told the user about. It is now gated on the
    module being **absent**, so re-running setup after a failed install
    picks up where it left off. Repos that already declare modules, and
    repos with an invalid manifest, are untouched as before.

  Proven from a genuinely empty folder by a new `npm run test:dogfood`
  lane (real `python -m venv`, real network `pip install`, real install
  code — no seams): a clean project finishes setup with the module
  importable; a `.venv` seeded with a real historical
  `dabbler-ai-router==0.34.0` is upgraded past the floor; a failed install
  creates no module and a re-run recovers without deleting anything. It
  runs in CI on Linux and Windows.

- **(Set 122 S2) Every module lifecycle operation now runs
  `python -m ai_router.modules`, and the extension shows you the command.**
  The five module context-menu commands — New / Rename / Delete / Open
  Plan / Assign Sets — keep their ids, their titles, their `when` clauses
  and their prompts; what changed is what happens behind them. Each now
  launches the router CLI through the **resolved workspace-venv
  interpreter** (`resolvePythonInterpreter`, never a bare `python` — a bare
  `python` on `PATH` is the documented cause of the "No module named
  ai_router" mis-diagnosis), and branches on the CLI's published exit
  codes: `3` refused with nothing written, `4` write failure, with
  `rolledBack` deciding between "the workspace is unchanged" and
  "reconcile from git".

  **The command is echoed before it runs** (operator, 2026-08-11:
  *"echoed… so developers know what commands are being executed"*). The
  exact, copy-pasteable line is appended to a shared **"Dabbler Commands"**
  output channel *before* the process starts — so it appears even when it
  is the command itself that could not start — followed by its output. One
  builder produces both the echoed line and the spawned argv, so what a
  developer reads and what actually ran cannot disagree. The interpreter is
  shown as its resolved absolute path, because that is the load-bearing
  part: the whole failure class here is a developer running the same
  command against a *different* interpreter and getting a different answer.

  The TypeScript lifecycle it replaces is **deleted**, not left beside it:
  `utils/moduleAuthoring.ts` drops from 2,601 lines to 608 (readers,
  validation, the module picker and the deletion classifier survive — the
  Explorer renders synchronously and must not spawn a process per row).
  `scaffoldDefaultModuleAndLifecycleSets` in `gitScaffold.ts` is
  Python-backed too, so a fresh project's `default` module comes from the
  same writer as every later one.

  One behaviour genuinely improves: the TypeScript New Module wrote the
  manifest entry and the two lifecycle sets as separate steps, so a
  scaffold failure left a module declared without its sets. The CLI runs
  the whole create in one transaction, so that failure now rolls the
  manifest back too — asserted with an injected failure, not assumed.

