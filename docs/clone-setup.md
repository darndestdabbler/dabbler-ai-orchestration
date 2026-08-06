# Clone Setup

This is the canonical setup note for a fresh clone of
`dabbler-ai-orchestration` and for a Dabbler-governed repository that keeps a
local checkout of the router source.

## What a clone contains

Git contains the source, schemas, templates, session-set records, shared
router configuration, and the extension source. A clone does not contain a
working Python environment, Node dependencies, provider credentials, or a
seat-specific Copilot catalog. Those are machine or account state and must be
recreated locally.

A governed consumer repository normally installs the published
`dabbler-ai-router` package and the Marketplace extension. It should not copy
`ai_router/` files from this repository. This document covers this canonical
checkout and the equivalent local development checkout used when a consumer
needs an editable router install.

## Prerequisites

Install these before starting:

- Git.
- Python 3.10 or newer.
- Node.js and npm when building or testing the VS Code extension, or when
  using the standalone Copilot CLI.
- VS Code plus one supported orchestrating agent for interactive sessions.
- Either direct provider API access or an authenticated GitHub Copilot CLI
  seat, depending on the project's router profile.

## First clone bootstrap

From the repository root, create the standard local environment and install
the package with its test dependencies.

### Windows PowerShell

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install --upgrade pip
.venv\Scripts\python.exe -m pip install -e ".[tests]"
```

### POSIX shell

```bash
python3 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -e '.[tests]'
```

The editable install is intentional: Python commands use the checkout's
`ai_router` source while tests exercise the same files. The dependencies are
declared in `pyproject.toml`. The older `ai_router/requirements.txt` contains
`fastmcp`, but the current package does not import it; do not install that
extra file unless a future feature explicitly requires it.

Confirm the environment:

```powershell
.venv\Scripts\python.exe -c "import ai_router, yaml, httpx; print(ai_router.__version__)"
.venv\Scripts\python.exe -m ai_router.start_session --help
.venv\Scripts\python.exe -m ai_router.verify_session --help
.venv\Scripts\python.exe -m pytest -q
```

Use `.venv\Scripts\python.exe` for every router command on Windows and
`.venv/bin/python` on POSIX. A bare `python` can resolve to a different system
interpreter.

## Extension checkout setup

Only needed when changing or testing the VS Code extension:

```powershell
Push-Location tools\dabbler-ai-orchestration
npm ci
npm run compile
Pop-Location
```

Use the focused commands from `CONTRIBUTING.md` for Layer 2 and Layer 3. The
extension's `package-lock.json` is tracked; `node_modules/`, test output, and
compiler output are not.

## Provider access

### Direct provider APIs

The direct profile reads these environment variables and never stores their
values in Git:

- `DABBLER_ANTHROPIC_API_KEY`
- `DABBLER_GEMINI_API_KEY`
- `DABBLER_OPENAI_API_KEY`

Optional completion notifications use `PUSHOVER_API_KEY` and
`PUSHOVER_USER_KEY`. Keep all credentials in the OS or shell environment, a
secret manager, or the provider's supported credential store.

### GitHub Copilot CLI seat

For a Copilot-only Full-tier setup, follow
[`copilot-seat-setup-checklist.md`](copilot-seat-setup-checklist.md):

1. Install `@github/copilot` and authenticate with the correct tenant.
2. Run a real headless model probe.
3. Run `copilot_preflight` through this clone's `.venv`.
4. Refresh the seat-local catalog.
5. Select the seat transport **in `ai_router/local-overrides.yaml`**, which is
   ignored:

   ```yaml
   transport:
     profile: copilot-cli
   ```

**Do not put `transport.profile: copilot-cli` in
`ai_router/router-config.yaml`.** That file is package data — `pyproject.toml`
ships it in the wheel — so a seat-local profile committed there makes the router
fail to load for every API-key-only consumer: it skips the API-key validation
they need and then tries to read a `copilot-catalog.lock` that is deliberately
never tracked. Set 110 S4 committed exactly that and the close-out backstop
caught it; `transport.profile` became a supported local override in the same
change, and `test_local_overrides_merge.py` now pins the shipped file to `api`.

The catalog at `ai_router/copilot-catalog.lock` is deliberately ignored. It
is probed per seat and must not be committed or shared as project truth. The
Copilot credential state lives outside the repository under the user's
profile.

## Tracked versus local

| Item | Git status | Reason |
| --- | --- | --- |
| `pyproject.toml`, `pytest.ini` | Track | Reproducible Python metadata and test configuration |
| `ai_router/router-config.yaml` | Track | Shared project routing policy — and package data, so it must stay on the `api` transport profile |
| `ai_router/budget.yaml` | Track when the project uses it | Shared budget policy |
| `ai_router/model-inventory.lock` | Track | Shared provider-model availability evidence |
| `.venv/` | Ignore | Machine-specific interpreter and installed packages |
| `node_modules/` | Ignore | Recreated from the tracked `package-lock.json` |
| `ai_router/local-overrides.yaml` | Ignore | Per-machine settings and credentials configuration |
| `router-metrics.jsonl` | Ignore | Local run history and usage data |
| `ai_router/copilot-catalog.lock` | Ignore | Seat-specific, empirically probed catalog |
| `~/.copilot/` | Outside Git | Copilot credential and session state |
| `dist/`, `out/`, `build/`, test output | Ignore or generated | Rebuilt artifacts and temporary results |

Do not add `.venv` to the repository. The existing root `.gitignore`
already ignores it, and a virtualenv contains platform-specific binaries,
absolute paths, and a complete copy of installed dependencies. The portable
inputs are the Python version requirement, `pyproject.toml`, lock/config
files that are intentionally shared, and these setup commands.

## After bootstrap

Before starting a session:

1. Confirm the active set's `session-state.json` and read its spec.
2. Confirm the router profile and provider access path.
3. Run the router and guidance checks from the clone's `.venv`.
4. Start the session through `ai_router.start_session`; never hand-edit
   session state.
5. Run `ai_router.verify_session` before close on Full-tier work.

The per-session preload and lifecycle rules remain canonical in
[`session-constitution.md`](session-constitution.md). This note answers the
clone question; it does not replace the session workflow.
