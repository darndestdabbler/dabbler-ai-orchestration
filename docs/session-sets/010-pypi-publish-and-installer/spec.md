# Package as PyPI module + add installer command to extension

> **Purpose:** Reframe `ai-router/` from "files you copy into your project" to "a Python package you `pip install`," then add an extension command that does the install for you (PyPI when available, GitHub sparse-checkout as fallback). This is the change that lets the repo-root README's adoption section collapse from a 60-line walkthrough to a one-liner, and that lets the platform's framing pivot from "shared infra you copy" to "a tool you install."
> **Created:** 2026-05-01
> **Session Set:** `docs/session-sets/010-pypi-publish-and-installer/`
> **Prerequisite:** None (structurally independent of sets 001–009; depends only on those sets being closed-out, which they are at creation time).
> **Workflow:** Orchestrator → AI Router → Cross-provider verification.

---

## Session Set Configuration

```yaml
totalSessions: 3
requiresUAT: false
requiresE2E: false
effort: normal
outsourceMode: first
```

> Rationale: no UI surface needs human UAT — the new commands are
> CLI-flavored and exercised by TS unit tests against mocked
> `git`/`pip`. Same pattern set 008 used for the cancel/restore
> commands. `outsourceMode: first` because each session is small
> enough that synchronous per-call routing is cheaper than spinning
> up a verifier daemon.

---

## Project Overview

### What the set delivers

Three things, one per session:

1. **Rename the source directory `ai-router/` → `ai_router/`** and add
   a `pyproject.toml` so the package can be installed with
   `pip install -e .` (development) or `pip install dabbler-ai-router`
   (release). Drops the importlib shim every adopter currently has to
   carry.
2. **Publish the package to PyPI** via a GitHub Actions release
   workflow using OIDC trusted publishing (no API tokens in repo
   secrets). First release is `v0.1.0`.
3. **Add `Dabbler: Install ai-router` to the VS Code extension**, with
   two paths: PyPI (default) and GitHub sparse-checkout (fallback for
   offline / pre-release / fork scenarios). Preserves any existing
   `router-config.yaml` in the workspace on re-run.

### Motivation

The repo's current adoption flow (README "Adopting `ai-router` in a
project" section) is six manual steps that include a Python `importlib`
shim required because the source directory is hyphenated and Python
won't import a package named `ai-router`. Every adopter copies the
shim into their orchestrator script. This is operationally noisy, and
it gets in the way of the platform-product framing: a "platform" you
have to manually copy files into and patch with importlib magic
doesn't read like a platform.

The dash-vs-underscore problem is the linchpin. Once the source
directory is `ai_router/` (underscore), Python imports it natively
with `import ai_router` from anywhere on `sys.path`. Once a
`pyproject.toml` exists, `pip install -e .` puts it on `sys.path`
without any path manipulation. Once the package is on PyPI, the
adoption story is `pip install dabbler-ai-router` and the README's
adoption section becomes one line.

### Non-goals

- **No backwards-compat shim for the dashed directory name.** Per the
  project's "no backwards-compatibility hacks" convention
  (CLAUDE.md), the rename is a clean break. Anyone with an in-flight
  fork of the dashed name pulls the rename and updates their imports
  in one step.
- **No semantic versioning of `dabbler-ai-router` beyond 0.x for
  this set.** First release is `v0.1.0` regardless of how mature the
  internals are; the 0.x range explicitly signals "API may change
  between minor versions" while the package finds its shape on PyPI.
- **No automatic uninstall / cleanup command.** If the operator wants
  to remove an installed `ai_router/` from a workspace, they delete
  the venv (or run `pip uninstall dabbler-ai-router`). Mirror-image
  uninstall is unnecessary for v0.1.

---

## Naming decisions (recorded here so future audits don't relitigate)

- **PyPI package name:** `dabbler-ai-router`. Specific to this
  project, not a name-squatter risk on `ai-router` (which is generic
  enough to plausibly be claimed by another project).
- **Python import name:** `ai_router`. Matches the existing internal
  convention. The PyPI/import name divergence (`pip install
  dabbler-ai-router` → `import ai_router`) is standard practice
  (`pip install pyyaml` → `import yaml`, `pip install
  beautifulsoup4` → `import bs4`); adopters expect it.
- **Source directory name:** `ai_router/` (underscore). Currently
  `ai-router/` (dash); the rename happens in Session 1.
- **Default install pin:** the latest published tag. The
  GitHub-fallback command can take `--branch master` for
  bleeding-edge, but the default never silently floats.

---

## Session Plan

### Session 1 of 3: Rename `ai-router/` → `ai_router/`, add `pyproject.toml`

**Goal:** Make the package directly Python-importable with no shim.
After this session, every internal caller that currently uses
`importlib.util.spec_from_file_location("ai_router",
"ai-router/__init__.py", ...)` should be deletable in favor of
`import ai_router` from a venv that has `pip install -e .` against
this repo's root `pyproject.toml`.

**Steps:**

1. `git mv ai-router ai_router`. The directory rename is mechanical;
   the rest of the session's work is fixing references to the dashed
   name across the codebase.
2. Update `pytest.ini` (`testpaths = ai_router/tests`).
3. Find all internal references to the dashed path and update:
   - `pytest.ini`
   - `CLAUDE.md`, `AGENTS.md`, `GEMINI.md` (repo-root agent files)
   - `README.md` (path references in the adoption section + file
     map; the adoption *narrative* changes more in Session 3)
   - `docs/ai-led-session-workflow.md` (where it cites file paths
     like `ai-router/router-config.yaml`)
   - `docs/proposals/2026-04-29-session-close-out-reliability.md`,
     `2026-04-30-combined-design-alignment-audit.md`,
     `2026-05-01-combined-design-realignment-audit.md` (path
     references in their citations)
   - `tools/dabbler-ai-orchestration/README.md` and any TS source
     that has a path-string reference (e.g., `python -m
     ai_router.queue_status` invocations are already underscored
     and don't need touching, but path strings like
     `"ai-router/..."` would).
   - `scripts/verify_session_*.py` (the importlib shim block can be
     deleted; replace with `import ai_router` after a
     `sys.path.insert` against the repo root, or with editable
     install).
4. Author `pyproject.toml` at the repo root. Use the modern
   `[build-system] / [project]` schema (PEP 621). Required fields:
   - `name = "dabbler-ai-router"`
   - `version = "0.1.0"` (will move to dynamic in Session 2 or
     stay manual; keep static for the rename session)
   - `description`, `authors`, `license = "MIT"`,
     `readme = "README.md"`
   - `requires-python = ">=3.10"`
   - `dependencies`: `pyyaml`, `httpx`. (Cross-check
     `ai_router/requirements.txt` for anything that has crept in.)
   - Optional `[project.optional-dependencies]` with `tests =
     ["pytest"]`.
   - `[project.scripts]` entry points for the existing CLI surfaces:
     `close_session`, `report`, `reconciler`, `queue_status`,
     `heartbeat_status`, `restart_role`, `backfill_session_state`.
     Each maps to its module's `main()`.
5. Add a `[tool.setuptools.packages.find]` (or equivalent for the
   chosen build backend) so `pip install -e .` finds the
   `ai_router/` package without manual `packages =` enumeration.
6. Smoke test: in a fresh venv, `pip install -e .[tests]`, run
   `python -c "import ai_router; print(ai_router.__file__)"` —
   confirm it loads without the importlib shim.
7. Run the full pytest suite (`python -m pytest ai_router/tests/`).
   Must report the same number of passing tests as before the rename
   (676 at set 009 close — Session 1 should not change behavior).
8. End-of-session cross-provider verification (route).
9. Commit, push, run close-out.

**Creates:** `pyproject.toml`.

**Touches:** `ai-router/` → `ai_router/` (rename, all files inside);
`pytest.ini`, `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `README.md`,
`docs/ai-led-session-workflow.md`, the three proposals in
`docs/proposals/`, `scripts/verify_session_*.py`,
`tools/dabbler-ai-orchestration/README.md`.

**Ends with:** `pip install -e .` succeeds in a clean venv;
`import ai_router` works without an importlib shim; full pytest
suite passes (no regressions); cross-provider verification
returned `VERIFIED`.

**Progress keys:** `pyproject.toml` exists at repo root; the string
`ai-router/` (with dash) does not appear in any tracked source file
except commit messages and the `docs/proposals/` historical
references that explicitly cite "the old hyphenated path" with a
date and superseded-by note.

---

### Session 2 of 3: Publish to PyPI via GitHub Actions

**Goal:** First release of `dabbler-ai-router` on PyPI, via an
auditable, repeatable release workflow that does not require API
tokens in repo secrets.

**Recommended path: OIDC trusted publishing.** PyPI supports
GitHub-OIDC-based trusted publishing as of 2023 — the GitHub Actions
runner authenticates to PyPI via short-lived tokens minted on each
run, scoped to a specific repo + workflow + environment. No API
token sits in `secrets.PYPI_TOKEN` to leak. The PyPI project is
configured once in its settings page to trust
`darndestdabbler/dabbler-ai-orchestration` + the release workflow
file path.

**Steps:**

1. Author `.github/workflows/release.yml`:
   - Trigger: `on: push: tags: ['v*']`.
   - Permissions: `id-token: write` for OIDC, `contents: read`.
   - Job 1: build `sdist` + `wheel` via `python -m build`. Upload
     as workflow artifacts.
   - Job 2 (depends on Job 1): publish to TestPyPI first via
     `pypa/gh-action-pypi-publish@release/v1` for sanity-check.
     Only runs on tags that match `v*-rc*` (release candidates). For
     final tags (matching `v[0-9]+.[0-9]+.[0-9]+` exactly) this job
     is skipped.
   - Job 3 (depends on Job 1): publish to PyPI proper for final
     tags. Uses the same action + OIDC flow.
   - Environment: protect both publish jobs behind a deployment
     environment (`pypi` / `testpypi`) so the human-approval flow on
     each tag is configurable from the GitHub UI.
2. Author `docs/planning/release-process.md` (new file) covering:
   - One-time PyPI account setup (project namespace claim, OIDC
     trusted publisher config — link to the PyPI docs page rather
     than duplicating their content).
   - Per-release checklist: bump `pyproject.toml` `version`, write
     change-notes, `git tag vX.Y.Z`, `git push --tags`, watch the
     workflow run, verify on PyPI.
   - Rollback: PyPI does not allow re-uploading a deleted version;
     the rollback path is `vX.Y.(Z+1)` with a hotfix.
3. Tag and release `v0.1.0` (or `v0.1.0-rc1` first to exercise the
   TestPyPI path; recommend RC first the first time the workflow
   runs).
   - This is a **human-driven step**: the orchestrator authors the
     workflow file and the release process doc, but the human
     pushes the tag, watches the GitHub Actions run, and confirms
     the package appears on PyPI. The session's close-out summary
     surfaces this handoff explicitly.
4. Verify in a clean venv (post-release): `pip install
   dabbler-ai-router==0.1.0` → `python -c "import ai_router;
   print(ai_router.__version__)"`. If this works, the publish path
   is proven.
5. Update repo-root `README.md` adoption section: the "Adopting
   `ai-router` in a project" section can collapse from its current
   60-line walkthrough to roughly:
   ```
   python -m venv .venv
   .venv/Scripts/pip install dabbler-ai-router
   ```
   Plus a few lines on `router-config.yaml` tuning and where to put
   API keys. The full importlib-shim block goes away (along with the
   "consumer repo" framing — by this point in the spec, that
   framing is already softened in Session 1's README touch-ups).
6. End-of-session cross-provider verification.
7. Commit, push, run close-out.

**Creates:** `.github/workflows/release.yml`,
`docs/planning/release-process.md`.

**Touches:** `pyproject.toml` (version bump if needed);
`README.md` (adoption section collapse);
`tools/dabbler-ai-orchestration/README.md` (add a note that v0.1+ is
on PyPI and the install command in Session 3 will use it).

**Ends with:** the release workflow file is committed; the release
process doc is published; either (a) v0.1.0 is on PyPI and
`pip install dabbler-ai-router` works, OR (b) the orchestrator's
close-out summary states explicitly that the human-driven
tag-push step is pending and Session 3 should wait for confirmation
before assuming PyPI is live.

**Progress keys:** `.github/workflows/release.yml` exists;
`docs/planning/release-process.md` exists; the README adoption
section length has dropped substantially (signal that the collapse
landed).

---

### Session 3 of 3: Extension `Install ai-router` command (PyPI + GitHub fallback)

**Goal:** A one-click install path from inside VS Code, so the
adoption flow becomes "open the workspace, run the command,
done." The command supports both PyPI (default, post-Session-2)
and GitHub sparse-checkout (fallback for offline use, pre-release
testing, or forks).

**Steps:**

1. Add new command module
   `tools/dabbler-ai-orchestration/src/commands/installAiRouterCommands.ts`:
   - Command 1: `dabblerSessionSets.installAiRouter` — the
     primary entry point. Flow:
     1. Detect workspace venv at `.venv/` or `venv/` (configurable
        via existing `dabblerSessionSets.pythonPath` setting).
        Offer to create one if missing
        (`<pythonPath> -m venv .venv`).
     2. QuickPick: "Install from PyPI (recommended)" vs "Install
        from GitHub (fallback)". Default = PyPI.
     3. PyPI path: run `<venv>/pip install dabbler-ai-router` via
        `child_process.spawn` with progress reporting in the VS
        Code status bar.
     4. GitHub path: `git clone --depth 1 --filter=blob:none
        --sparse <repo-url> <tmp>` at the latest tag (or the
        user-specified tag/branch via input box), then
        `git -C <tmp> sparse-checkout set ai_router pyproject.toml`,
        then copy `<tmp>/ai_router/` into the workspace
        (preserving any pre-existing `ai_router/router-config.yaml`
        — see step 2). Optionally `pip install -e .` the
        sparse-checked-out tree.
     5. On success, open `ai_router/router-config.yaml` in an
        editor and surface a "tune for your project" toast.
   - Command 2: `dabblerSessionSets.updateAiRouter` — re-runs
     install but pre-fills "PyPI upgrade" via `pip install -U
     dabbler-ai-router`, OR re-pulls from GitHub if the
     workspace's last install was the GitHub path (detect via a
     `.dabbler/install-method` marker file written by Command 1).
   - Both commands share helper functions for venv detection,
     `router-config.yaml` preservation, and progress reporting.
2. **`router-config.yaml` preservation logic** (the most important
   non-obvious behavior):
   - Before any copy, check if the destination `ai_router/router-config.yaml`
     already exists in the workspace.
   - If it does: stash it, do the install, then restore the
     stashed file in-place. Do NOT diff — assume the local copy is
     authoritative because the README explicitly describes
     `router-config.yaml` as the per-project tuning surface.
   - If a future release changes the *schema* of `router-config.yaml`
     in a non-backward-compatible way, the upgrade path will need
     a 3-way merge prompt — but that is out of scope for v0.1 (file
     a follow-up if the release notes ever say "schema breaking
     change").
3. Register the commands in
   `tools/dabbler-ai-orchestration/src/extension.ts` `activate()`.
4. Update `tools/dabbler-ai-orchestration/package.json`:
   - Add `dabblerSessionSets.installAiRouter` and
     `dabblerSessionSets.updateAiRouter` to `contributes.commands`.
   - Bump extension version `0.8.0` → `0.9.0` (minor bump per
     SemVer — new feature, no breaking changes).
5. Update repo-root `README.md` "Adopting" section to lead with
   the extension command:
   ```
   1. Install the extension VSIX (see "Installing the VS Code
      extension" above).
   2. Open your project as a workspace.
   3. Run "Dabbler: Install ai-router" from the command palette.
   4. Tune `ai_router/router-config.yaml` for your project.
   5. Author your first session set.
   ```
   The pip install instructions stay below as a fallback for users
   who prefer the CLI route.
6. Update `tools/dabbler-ai-orchestration/README.md` Features
   section with the new command.
7. Tests:
   - New test file
     `tools/dabbler-ai-orchestration/src/test/suite/installAiRouter.test.ts`
     using the same standalone-mocha pattern as set 008's
     cancelLifecycle tests.
   - Coverage: PyPI path happy path (mocked `child_process`),
     GitHub path happy path (mocked git + fs), router-config.yaml
     preservation (file exists before / restored after),
     venv-missing-handled (creation prompt fires), each command's
     contextValue routing.
   - Aim for ~10–15 tests; pattern is established from prior sets.
8. Build the new VSIX:
   `cd tools/dabbler-ai-orchestration && npx vsce package`. The
   resulting `dabbler-session-sets-0.9.0.vsix` is the artifact.
9. End-of-session cross-provider verification.
10. Commit, push, run close-out (this is the final session — write
    `change-log.md` summarizing the whole set).

**Creates:**
`tools/dabbler-ai-orchestration/src/commands/installAiRouterCommands.ts`,
`tools/dabbler-ai-orchestration/src/test/suite/installAiRouter.test.ts`,
`tools/dabbler-ai-orchestration/dabbler-session-sets-0.9.0.vsix`.

**Touches:**
`tools/dabbler-ai-orchestration/src/extension.ts`,
`tools/dabbler-ai-orchestration/package.json`,
`tools/dabbler-ai-orchestration/README.md`,
`README.md` (adoption section).

**Ends with:** the new install command is exercised end-to-end in a
test-mode workspace; both the PyPI and GitHub paths complete
successfully (mocked); router-config.yaml preservation is
asserted; the new VSIX is built and committed; cross-provider
verification returns `VERIFIED`; `change-log.md` is written.

**Progress keys:** the new command appears in the command palette
when the extension is loaded; the test file passes in CI; the
README adoption section is screenshot-led-plus-one-command (matches
the user's stated preference for the existing preamble).

---

## Acceptance criteria for the set

- [ ] Source directory is `ai_router/` (underscore); no tracked
      file references the dashed `ai-router/` path other than
      historical commit messages and explicitly-dated
      "superseded-by" notes in the proposals.
- [ ] `pip install -e .` against the repo root succeeds in a clean
      venv; `import ai_router` works without an importlib shim.
- [ ] Full ai-router test suite continues to pass (676 → 676,
      modulo any incidental new tests added in Sessions 2–3).
- [ ] `dabbler-ai-router` v0.1.0 is published on PyPI via the
      release workflow (or, if the human declines to push the tag
      during Session 2, the workflow is in place and the path is
      explicitly handed off in the close-out summary).
- [ ] Extension v0.9.0 ships `Dabbler: Install ai-router` and
      `Dabbler: Update ai-router` commands. Both paths (PyPI and
      GitHub sparse-checkout) work end-to-end against mocked
      transports in the test suite.
- [ ] Repo-root README adoption section is screenshot-led + one
      command + ~10 lines of follow-up — not the current 60-line
      walkthrough.
- [ ] `change-log.md` summarizes the rename, the publish, and the
      installer command in the now-standard set close-out format.

---

## Risks

- **The rename touches a lot of files.** Most touches are
  mechanical (path string find-and-replace), but the historical
  proposals in `docs/proposals/` cite line numbers and symbols at
  paths that move. Resolve by leaving the historical line-number
  citations alone (they accurately reference the dashed path *as
  it was when the audit was written*) and only updating
  forward-looking citations and the file-map sections of the
  README. The proposals themselves stamp "as of 2026-04-30" /
  "as of 2026-05-01" so the dashed-path references in their bodies
  are correct for that historical snapshot.
- **PyPI name squatting.** If `dabbler-ai-router` is already
  claimed on PyPI, fall back to `dabbler-airouter` (no internal
  hyphen) or `dabbler-router`. Resolution: check before Session 2
  starts; document the chosen name in
  `docs/planning/release-process.md`.
- **OIDC trusted publishing setup is human-driven.** The
  orchestrator can author the workflow file but cannot click the
  "Add trusted publisher" button in the PyPI project settings. The
  spec acknowledges this in Session 2's "ends with" — partial
  acceptance if the human handoff is pending is acceptable.
- **Test mocking for `child_process.spawn`.** Set 008's tests
  proved the standalone-mocha pattern works for VS Code commands
  that don't require a live electron host, but mocking
  `child_process.spawn` (for the pip / git invocations) is more
  involved than mocking `fs`. Pattern: inject a
  `processSpawner` dependency into the command's helper functions
  (matching the existing `cancelLifecycleCommands.ts` dependency-
  injection style), and the tests pass a stub.
- **Breaking change for current adopters.** Anyone with a fork of
  the dashed `ai-router/` directory needs a one-time migration:
  rename their copy to `ai_router/` and replace the importlib shim
  with `import ai_router`. This is a small change but needs a
  loud release note. Captured in the v0.1.0 release notes
  (Session 2 deliverable).

---

## References

- This repo's `CLAUDE.md` — the curator-and-normalizer role and the
  portability rule (universal core, gated extensions).
- `docs/ai-led-session-workflow.md` — the canonical 10-step
  workflow each session follows.
- `docs/planning/lessons-learned.md` — the importlib-shim entry
  (added when the dashed-path adoption pain first surfaced) is
  promotable to a Convention once this set lands. Suggest the
  Session 3 close-out's Step 9 reorganization review propose
  promoting "Use underscore-named Python packages so adopters can
  `import` them natively" from a lesson to a Convention.
- PyPI trusted-publishing reference (link from
  `docs/planning/release-process.md`):
  https://docs.pypi.org/trusted-publishers/
- Set 008 (`docs/session-sets/008-cancelled-session-set-status/`) —
  template for a multi-session feature set with TS commands +
  standalone-mocha tests + extension version bump.
- The 2026-05-01 realignment audit
  (`docs/proposals/2026-05-01-combined-design-realignment-audit.md`)
  notes the cross-provider verification cost pattern this set
  inherits ($0.15–$0.25 per end-of-session route).

---

## Cost projection

Per-session estimates (single end-of-session cross-provider route
each, no analysis routes per the standing operator cost-containment
rule):

| Session | Estimated cost | Notes |
|---|---|---|
| 1 — Rename + pyproject.toml | $0.10–$0.20 | Mechanical-but-broad change; the verifier's prompt will be larger because the trace covers many files. |
| 2 — PyPI publish | $0.05–$0.15 | Smaller surface (one workflow file + one doc). |
| 3 — Extension install command | $0.15–$0.30 | TS + Python paths; test suite assertions; README updates. Largest single-session estimate. |
| **Set total** | **$0.30–$0.65** | Lower bound assumes single-round verification; upper bound assumes one Round-2 retry per session. |

This is a small set by recent standards (set 009 cost $0.78 across 5
sessions). The work is large in lines-changed but the verification
prompts stay tight per session.
