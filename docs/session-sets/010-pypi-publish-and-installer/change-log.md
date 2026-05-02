# Set 010 — PyPI Publish & Extension Installer (Change Log)

**Status:** complete · 3 of 3 sessions verified
**Started:** 2026-05-01 · **Completed:** 2026-05-02
**Orchestrator:** claude-code (Anthropic, claude-opus-4-7, high) — all sessions
**Verifier:** gpt-5-4 (cross-provider, all sessions)

This set reframes `ai_router/` from "files you copy into your project"
to "a Python package you `pip install`," then adds an extension
command that does the install for you (PyPI when available, GitHub
sparse-checkout as fallback). The result: the repo-root README's
adoption section collapses from a 60-line walkthrough to a 5-step
extension-led flow, the platform's framing pivots from "shared infra
you copy" to "a tool you install," and the importlib shim every
adopter previously carried is gone for good.

## Summary of changes

### Session 1 — Rename `ai-router/` → `ai_router/`, add `pyproject.toml`

**Goal:** Make the package directly Python-importable with no shim.

- **`git mv ai-router ai_router`** — directory rename; 40+ entries
  moved with no content loss.
- **Internal references updated** across 36 files (Python sources,
  docstrings, `router-config.yaml`, `schemas/disposition.schema.json`,
  `docs/close-out.md`, `docs/two-cli-workflow.md`, all tests).
  Importlib-shim comments rewritten in disposition / orchestrator /
  verifier roles, conftest, and four test files.
- **`__version__ = "0.1.0"`** added to `ai_router/__init__.py`.
- **Agent files (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`)** — file-map
  bullet, Building & testing block (now `pip install -e .[tests]`
  from repo root), AI router import block replaced with `from
  ai_router import route`.
- **`README.md`** — TOC anchor, file-map heading, every internal link,
  and the Adopting section (Step 1 mentions `ai_router/` +
  `pyproject.toml`; Step 3 → `pip install -e .`; Step 4 → `from
  ai_router import route`). Full collapse of the Adopting section is
  Session 3 work.
- **Workflow doc, planning docs, schema example** — path references
  updated; `docs/ai-led-session-workflow.md` "Importing the Router"
  section rewritten to drop the importlib shim.
- **`scripts/verify_session_*.py`** — 13 files: importlib shim
  replaced with direct `import ai_router` (after `sys.path.insert` of
  repo root). Removed unused `import importlib.util` lines.
- **`tools/dabbler-ai-orchestration/`** — TS sources, webview HTML,
  and README path references updated. `dist/` not rebuilt this
  session — Session 3 packages v0.12.0 with the install command.
- **`pyproject.toml` at repo root** — PEP 621 schema,
  `name = "dabbler-ai-router"`, `version = "0.1.0"`,
  `requires-python = ">=3.10"`, dependencies (`pyyaml`, `httpx`),
  `[project.optional-dependencies]` `tests`, `[project.scripts]` for
  the seven CLI surfaces (`close_session`, `report`, `reconciler`,
  `queue_status`, `heartbeat_status`, `restart_role`,
  `backfill_session_state`),
  `[tool.setuptools.packages.find]` targeting `ai_router*`,
  `[tool.setuptools.package-data]` including the YAML/MD/JSON
  resources.
- **Smoke test:** Fresh `.venv` at repo root via
  `python -m venv .venv --copies`. `pip install -e ".[tests]"` builds
  the editable wheel cleanly. `import ai_router` works without any
  shim; `ai_router.__version__ → "0.1.0"`; `ai_router.__file__`
  resolves to the in-repo path.
- **Test suite:** 676 passed in 49.50s (matches set 009 close
  baseline). Two pre-existing Windows-venv-launcher PID quirks
  unrelated to the rename.
- **Cross-provider verification:** routed to gpt-5-4 across three
  rounds (cost $0.3254 total: $0.0767 + $0.1547 + $0.0941).

### Session 2 — Publish to PyPI via GitHub Actions (OIDC trusted publishing)

**Goal:** First release of `dabbler-ai-router` on PyPI via an
auditable, repeatable workflow that does not require API tokens in
repo secrets.

- **Pre-session check:** `dabbler-ai-router` is available on PyPI
  (`httpx` GET → 404). No fallback name needed.
- **`.github/workflows/release.yml`** — three jobs: `classify`
  (strict regexes — `v[0-9]+\.[0-9]+\.[0-9]+$` for finals,
  `v[0-9]+\.[0-9]+\.[0-9]+-rcN$` for RCs) → `build` (verifies tag
  matches PEP 440 normalized `pyproject` version via
  `packaging.version.Version`) → `publish-testpypi` / `publish-pypi`
  (gated by classify outputs `is_rc` / `is_final`, protected behind
  `pypi` / `testpypi` deployment environments, OIDC `id-token: write`
  only on the publish jobs).
- **`docs/planning/release-process.md`** — one-time PyPI / TestPyPI
  trusted-publisher setup, GitHub deployment-environment setup with
  required-reviewer guidance, RC dry-run section explaining the
  `v0.1.0-rc1` (git tag) vs `0.1.0rc1` (PEP 440 wheel/pyproject)
  asymmetry, per-release checklist, rollback path including PyPI's
  no-re-upload constraint and yank semantics, failure-modes table,
  maintenance section.
- **`README.md` Adopting section** — collapsed from the Session-1
  six-step walkthrough to install command + tuning bullets +
  first-set bullet + editable/source-install fallback (clearly
  marked) + forward-reference to Session 3's `Dabbler: Install
  ai-router` command. Final restructure happens in Session 3.
- **`tools/dabbler-ai-orchestration/README.md` Requirements section**
  — augmented with the v0.1 PyPI install path and forward-reference
  to Session 3's install command.
- **Packaging tightening:** Local `python -m build` smoke test
  surfaced that the wheel was including all 35 `ai_router/tests/`
  files (80 entries vs expected 45). PEP 420 implicit-namespace
  handling. Fix: explicit `exclude = ["ai_router.tests",
  "ai_router.tests.*"]` plus `namespaces = false` in
  `[tool.setuptools.packages.find]`. Post-fix wheel: 45 entries, 0
  test files; package data preserved; `entry_points.txt` lists the
  seven spec-named consoles. Added `MANIFEST.in` for sdist parity.
- **Test suite:** 676 passed in 52.78s (matches Session 1 baseline;
  this session is doc + workflow YAML + packaging metadata only).
- **Cross-provider verification:** routed to gpt-5-4 across two
  rounds (cost $0.2894 total: $0.1615 + $0.1279). Round 1 caught two
  Major workflow bugs (over-permissive `publish-pypi` gate using
  `!contains(github.ref, '-')`, and a tag/version comparison that
  stripped the `-rc*` suffix on the tag side only); both addressed
  in-session by introducing the `classify` job and the PEP 440
  Version comparison. Round 2 returned VERIFIED.
- **Human-driven handoff (resolved before Session 3 started):**
  Operator completed the one-time PyPI/TestPyPI trusted-publisher
  setup, configured `pypi` / `testpypi` GitHub deployment
  environments, pushed `v0.1.0-rc1` (TestPyPI dry-run), then `v0.1.0`
  (production). Confirmed at Session 3 start via
  `https://pypi.org/pypi/dabbler-ai-router/json` (HTTP 200, latest
  `0.1.0`).

### Session 3 — Extension `Install ai-router` command (PyPI + GitHub fallback) + graceful "not configured" handler

**Goal:** A one-click install path from inside VS Code, plus a
neutral "Click here to install" tree-item in the Provider Queues /
Heartbeats views when `python -m ai_router.queue_status` fails with
`ModuleNotFoundError`.

- **New `tools/dabbler-ai-orchestration/src/utils/aiRouterInstall.ts`**
  — pure-logic install core. Dependency-injected `ProcessSpawner`,
  `FileOps`, `InstallPrompts` so the test suite can exercise both
  paths without spawning real subprocesses or touching the real
  filesystem (matches set 008's `cancelLifecycle` pattern). Exports
  `installAiRouter`, `updateAiRouter`,
  `isAiRouterNotInstalled`, `deriveVenvFromPythonPath`,
  `resolveLatestReleaseTag`, `venvPython`, `PYPI_PACKAGE_NAME`,
  `REPO_URL`, `ROUTER_CONFIG_REL`, `INSTALL_METHOD_REL`,
  `GITHUB_CHECKOUT_REL`.
- **PyPI install path:**
  - Detects `.venv/` or `venv/`, or honors a configured pythonPath
    that points inside an existing venv (pyvenv.cfg marker
    required), or offers to create `.venv` at the workspace root.
  - When creating a venv, bootstraps with bare `"python"` if the
    configured pythonPath has venv shape but doesn't exist yet (the
    ENOENT case: configured `.venv/Scripts/python.exe` before
    `.venv` exists). Existing absolute interpreters are honored.
  - Runs `<venv-python> -m pip install dabbler-ai-router` (or `-U`
    for update).
  - **Materializes `ai_router/router-config.yaml` into the workspace**
    when missing, by shelling out to the venv's Python with
    `from importlib.resources import files; ...; print(files('ai_router').joinpath('router-config.yaml').read_text())`
    and writing the output. Existing local files are left untouched
    so operator tuning survives.
- **GitHub sparse-checkout install path:**
  - Resolves the latest released tag via `git ls-remote --tags
    --refs <repo>` filtered to `vX.Y.Z` (no pre-release suffix);
    operator can override with an explicit ref.
  - Sparse-clones the repo into a tmpdir, then copies the checkout
    into a **persistent** location at
    `<workspace>/.dabbler/ai-router-src/`. Editable install points at
    that stable path so the `.egg-link` doesn't dangle when the
    tmpdir is cleaned up.
  - **Stash / restore protocol** for `ai_router/router-config.yaml`:
    in-memory stash before the copy; named `restoreStash()` helper
    that retries on failure (does not mark itself done on a write
    error); outer `finally` retry; `finalize()` wrapper at every
    return site downgrades `ok: true` outcomes to `ok: false` with
    an explicit "config restore failed" message if the operator's
    config ultimately stayed unrestored. **Stale workspace
    `ai_router/` files are wiped before the copy** so files dropped
    upstream don't linger as ghosts after an upgrade.
  - Configurable repo URL (`dabblerSessionSets.aiRouterRepoUrl`)
    plumbed through both `ls-remote` and `clone` so fork-trackers
    can point the fallback at their fork.
- **`.dabbler/install-method` marker** — written on every successful
  install (`pypi` or `github`); read by `Dabbler: Update ai-router` to
  default the QuickPick to the prior install source.
- **New `tools/dabbler-ai-orchestration/src/commands/installAiRouterCommands.ts`**
  — VS Code wiring. Registers `dabblerSessionSets.installAiRouter`
  and `dabblerSessionSets.updateAiRouter`; builds the real
  `child_process.spawn` adapter (with kill-on-timeout); the production
  `fs` adapter mkdirps parent dirs on every write (so the stash
  restore can write into a directory that the in-flight copy may
  have momentarily wiped); QuickPick for source pick; modal confirm
  for venv creation; input box for the GitHub ref; `withProgress`
  notification for the operation; opens `router-config.yaml` and
  surfaces a separate "tune for your project" toast on success. Reads
  `dabblerSessionSets.pythonPath` first, falls back to
  `dabblerProviderQueues.pythonPath` only when the operator has
  explicitly set the latter (via `Configuration.inspect()` so the
  contributed default doesn't mask the fallback).
- **Provider Queues + Heartbeats — graceful "not configured" path.**
  `parseFetchResult()` detects the `ModuleNotFoundError: No module
  named 'ai_router'` stderr signature (and the `Error while finding
  module specification for 'ai_router.<x>'` belt-and-braces fallback)
  and returns `reason: "module_not_installed"`. The provider stores
  that on a new `_lastErrorReason` field, **clears its
  payload cache on any failure** (so a previously-successful fetch
  doesn't mask the new state), and renders a `kind: 'notInstalled'`
  tree-item with one child `kind: 'notInstalledAction'` whose
  `command.command` fires `dabblerSessionSets.installAiRouter`. Both
  use neutral `info` icons (not the red-error icon); the existing
  red-error path is preserved for other failures (timeouts, malformed
  JSON, non-import non-zero exits).
- **`extension.ts`** — single import + single
  `registerInstallAiRouterCommands(context)` call next to the
  existing `registerCancelLifecycleCommands(...)`.
- **`package.json`** — version 0.11.0 → 0.12.0; new commands
  `dabblerSessionSets.installAiRouter` (cloud-download icon) and
  `dabblerSessionSets.updateAiRouter` (sync icon); two new settings
  (`dabblerSessionSets.pythonPath`, `dabblerSessionSets.aiRouterRepoUrl`).
- **`README.md` adoption section** — restructured to lead with the
  extension command (5-step flow: install VSIX → open workspace →
  run `Dabbler: Install ai-router` → tune router-config → author
  first set), with the CLI install (`pip install dabbler-ai-router`)
  and the editable / source-install dropping below as clearly-marked
  fallbacks. Forward-references `Dabbler: Update ai-router` for
  later upgrades.
- **`tools/dabbler-ai-orchestration/README.md`** — new `### Install
  ai-router` block in the Features section (between Provider Queues
  and Provider Heartbeats); the Requirements section's previous
  v0.1 forward-reference is now a v0.12 statement.
- **Tests:** new `installAiRouter.test.ts` with 47 tests covering the
  detector, `deriveVenvFromPythonPath` (4 cases), `resolveLatestReleaseTag`
  (3 cases), PyPI install (8 cases incl. router-config.yaml
  materialization, venv creation, venv-from-pythonPath, ENOENT-
  bootstrap fallback, existing-interpreter no-overcorrection,
  malformed-marker handling), GitHub install (8 cases incl. latest-
  tag resolution, persistent checkout, fork-URL plumbing, stale-files
  removal, copyDir-failure stash safety, install-fail stash safety),
  early aborts, install-method marker round-trip, parseFetchResult
  for both providers, and tree-item rendering for both providers
  (notInstalled root + notInstalledAction child + cache invalidation
  on failure). All 47 pass. Full unit suite: 140 passing, 3 failing
  (the 3 failures pre-exist on master and are unrelated to this
  session — confirmed by stashing the Session 3 changes and
  re-running).
- **VSIX:** `dabbler-ai-orchestration-0.12.0.vsix` (329 KB, 18
  files), built with `npm run package`.
- **Test suite:** 676 Python tests passed in 52.89s (no Python source
  touched this session).
- **Cross-provider verification:** routed to gpt-5-4 across **seven
  rounds** (cost $1.7822 total: $0.1942 + $0.2456 + $0.2172 + $0.2622
  + $0.2331 + $0.2641 + $0.3653). The retry budget greatly exceeded
  the workflow's "max 2 retries" rule because each round caught
  real (non-cosmetic) issues — a couple of which were regressions I
  introduced while fixing earlier ones. Round 7 returned VERIFIED
  with two `Info`-severity follow-ups (see Residual notes below).

## Residual notes

Two `Info`-severity follow-ups returned by the round-7 verifier,
recorded here for any future cleanup pass:

- **Install-method marker I/O is not outcome-wrapped.** A read or
  write failure on `.dabbler/install-method` would bubble as a thrown
  command failure rather than a structured `InstallOutcome`. In
  practice the marker file is small and lives next to other config,
  so write failures should be rare; if they do happen, the install
  itself has already succeeded (the marker is the last write) and the
  worst outcome is that the next `Update ai-router` defaults to
  PyPI. Not promoted to a fix this session.
- **GitHub re-installs intentionally wipe workspace `ai_router/` and
  preserve only `router-config.yaml`.** Adopters who edit *other*
  files inside `ai_router/` (rare, and not the supported usage
  pattern) may be surprised on update. The wipe-and-preserve
  semantics are intentional — copyDir-only would otherwise leave
  ghost files from older releases — but fork-trackers should know
  that `router-config.yaml` is the only preserved local file across
  GitHub-path updates. Documented here and in the README adoption
  section's GitHub-fallback note.

## Acceptance criteria

- [x] Source directory is `ai_router/` (underscore); no tracked file
      references the dashed `ai-router/` path other than historical
      commit messages and explicitly-dated "superseded-by" notes in
      the proposals.
- [x] `pip install -e .` against the repo root succeeds in a clean
      venv; `import ai_router` works without an importlib shim.
- [x] Full ai-router test suite continues to pass (676 → 676 across
      all three sessions).
- [x] `dabbler-ai-router` v0.1.0 published on PyPI via the release
      workflow on 2026-05-02. Confirmed live at
      `https://pypi.org/pypi/dabbler-ai-router/json` (HTTP 200,
      releases `["0.1.0"]`).
- [x] Extension v0.12.0 ships `Dabbler: Install ai-router` and
      `Dabbler: Update ai-router` commands. Both paths (PyPI and
      GitHub sparse-checkout) work end-to-end against mocked
      transports in the test suite.
- [x] Repo-root README adoption section is extension-led + 5-step
      flow + ~10 lines of CLI / source-install fallbacks — not the
      original 60-line walkthrough.
- [x] `change-log.md` summarizes the rename, the publish, and the
      installer command.

## Cost summary

| Session | Routed cost | Notes |
|---------|-------------|-------|
| 1 — Rename + pyproject.toml | $0.3254 | Three verification rounds (all real prose / wiring issues addressed in-session). |
| 2 — PyPI publish workflow | $0.2894 | Two verification rounds (workflow bugs caught and addressed in-session). |
| 3 — Extension install command | $1.7822 | Seven verification rounds — exceeded the workflow's max-2-retries budget. Each round caught real issues; the cumulative cost reflects the breadth of the TS/Python/UX coupling and one regression I introduced while fixing an earlier round. |
| **Set total** | **$2.3970** | Spec projected $0.35–$0.70; the actual cost is ~3.5× the projected upper bound, driven entirely by Session 3's iteration. |

The set's projected $0.35–$0.70 cost was derived from "single
end-of-session route, Round-2 retry at the upper bound." The
actuals reflect the operator constraint that all reasoning routes
go through verification only — combined with a feature surface
(install command + provider refactor + UX copy) that the verifier
exercised hard enough to find seven rounds' worth of real issues.
Future single-session features of comparable breadth should budget
higher up front, or break into two sessions if the iteration cost
dominates.

## References

- Spec: [`spec.md`](spec.md)
- Per-session AI assignment ledger: [`ai-assignment.md`](ai-assignment.md)
- Verifier reviews: [`session-reviews/`](session-reviews/)
- Activity log: [`activity-log.json`](activity-log.json)
