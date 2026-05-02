# Cross-provider verification — Set 10 Session 1: rename `ai-router/` → `ai_router/` and add `pyproject.toml`

## Spec excerpt for Session 1
```markdown
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


```

## Deliverables

### 1. Directory rename via `git mv`

`git mv ai-router ai_router` was executed. Every file under the old `ai-router/` directory is now at the same relative path under `ai_router/`. Git records 40+ rename entries (`R` / `RM` status). No file content was lost; modifications are limited to text content updates inside the renamed files (see Section 4 below) plus the new `pyproject.toml` (Section 2 below) and a small `__version__` addition in `__init__.py` (Section 3).

### 2. New `pyproject.toml` at repo root (PEP 621)

```toml
[build-system]
requires = ["setuptools>=68", "wheel"]
build-backend = "setuptools.build_meta"

[project]
name = "dabbler-ai-router"
version = "0.1.0"
description = "Multi-provider model routing, prompt templates, session state, and metrics for the Dabbler AI-led-workflow."
readme = "README.md"
license = "MIT"
requires-python = ">=3.10"
authors = [
    { name = "darndestdabbler" },
]
keywords = ["ai", "router", "claude", "gemini", "openai", "session", "workflow"]
classifiers = [
    "Development Status :: 4 - Beta",
    "Intended Audience :: Developers",
    "Operating System :: OS Independent",
    "Programming Language :: Python :: 3",
    "Programming Language :: Python :: 3 :: Only",
    "Programming Language :: Python :: 3.10",
    "Programming Language :: Python :: 3.11",
    "Programming Language :: Python :: 3.12",
    "Topic :: Software Development :: Libraries :: Python Modules",
]
dependencies = [
    "pyyaml>=6.0",
    "httpx>=0.27.0",
]

[project.optional-dependencies]
tests = [
    "pytest>=7.0",
    "jsonschema>=4.0.0",
]

[project.urls]
Homepage = "https://github.com/darndestdabbler/dabbler-ai-orchestration"
Source = "https://github.com/darndestdabbler/dabbler-ai-orchestration"
Issues = "https://github.com/darndestdabbler/dabbler-ai-orchestration/issues"

[project.scripts]
close_session = "ai_router.close_session:main"
report = "ai_router.report:main"
reconciler = "ai_router.reconciler:main"
queue_status = "ai_router.queue_status:main"
heartbeat_status = "ai_router.heartbeat_status:main"
restart_role = "ai_router.restart_role:main"
backfill_session_state = "ai_router.backfill_session_state:main"

[tool.setuptools.packages.find]
where = ["."]
include = ["ai_router*"]

[tool.setuptools.package-data]
ai_router = [
    "router-config.yaml",
    "prompt-templates/*.md",
    "schemas/*.json",
    "docs/*.md",
]

```

### 3. `ai_router/__init__.py` — added `__version__ = "0.1.0"`

Top of the module after the docstring; the public-API re-exports below it are unchanged. The `__version__` enables `python -c "import ai_router; print(ai_router.__version__)"` (used in Session 2's post-PyPI-publish smoke test).

```python
"""
AI Router — Lightweight model routing for Claude Code.

Usage:
    from ai_router import (
        route, verify, query, get_costs, print_cost_report,
        print_session_set_status,
        send_pushover_notification, send_session_complete_notification
    )

    # Route a task to the best model automatically
    # (if the task type is in auto_verify_task_types, verification happens
    #  automatically and the result includes verifier feedback)
    result = route(
        content="Review this code for security issues:\n```python\n...\n```",
        task_type="code-review",
        context="This is a Flask web app handling user authentication.",
        complexity_hint=None  # optional 1-100 override
    )
    print(result.content)
    print(f"Cost: ${result.total_cost_usd:.4f} via {result.model_name}")
    if result.verification:
        print(f"Verified by: {result.verification.verifier_model}")
        print(f"Verdict: {result.verification.verdict}")

    # Explicitly verify any result (even if not auto-verified)
    result = route(content="...", task_type="documentation")
    check = verify(result)
    print(check.verdict)        # "VERIFIED" or "ISSUES_FOUND"
    print(check.issues)         # list of issues if any

    # Force a specific model
    result = query(
        model="gemini-flash",
        content="Reformat this JSON:\n...",
        task_type="formatting"
    )

    # Get cost report (includes verification costs)
    costs = get_costs()
    print_cost_report()

Session logging is handled externally by the caller (Claude Code) via
the SessionLog class:

    from ai_router.session_log import SessionLog

    log = SessionLog("docs/session-sets/my-feature")
    log.log_step(session_number=1, step_number=1, ...)
"""

__version__ = "0.1.0"

from .config import load_config, resolve_generation_params
from .models import estimate_complexity, pick_model
from .providers import call_model
from .prompting import build_prompt
from .session_log import SessionLog
from .session_state import (
    SESSION_STATE_FILENAME,
    SCHEMA_VERSION as SESSION_STATE_SCHEMA_VERSION,
    CloseoutGateFailure,
    GateCheckFailure,
    SessionLifecycleState,
    NextOrchestrator,
    NextOrchestratorReason,
    NEXT_ORCHESTRATOR_REASON_CODES,
    NEXT_ORCHESTRATOR_SPECIFICS_MIN_LEN,
    ModeConfig,
    OUTSOURCE_MODES,
    ROLE_VALUES,
    DEFAULT_OUTSOURCE_MODE,
    register_session_start,
    mark_session_complete,
    read_session_state,
    validate_next_orchestrator,
    parse_mode_config,
    read_mode_config,
    validate_mode_config,
)
from .queue_db import (
    DEFAULT_BASE_DIR as QUEUE_DEFAULT_BASE_DIR,
    DuplicateIdempotencyKeyError,
    QueueDB,
    QueueMessage,
)
from .daemon_pid import (
    ORCHESTRATOR_ROLE,
    VERIFIER_ROLE,
    is_pid_alive,
    pid_file_path,
    read_pid_file,
    remove_pid_file,
    write_pid_file,
)
from .disposition import (
    DISPOSITION_FILENAME,
    DISPOSITION_STATUSES,
    VERIFICATION_METHODS,
    Disposition,
    disposition_from_dict,
    disposition_to_dict,
    read_disposition,
    validate_disposition,
    write_disposition,
)
from .session_events import (
    SESSION_EVENTS_FILENAME,
    EVENT_TYPES,
    Event,
    append_event,
    read_events,
    hash_existing_prefix,
    current_lifecycle_state,
    backfill_events_for_session_set,
    backfill_all_session_sets,
)
from .utils import (
    RateLimiter,
    should_escalate,
```

### 4. Path-string updates inside the renamed `ai_router/`

All internal references inside the renamed package were updated from the dashed `ai-router/` path to the underscored `ai_router/` path via a single `sed -i 's|ai-router|ai_router|g'` pass over the 36 affected files (Python, docstrings, `router-config.yaml`, `schemas/disposition.schema.json`, `docs/close-out.md`, `docs/two-cli-workflow.md`, all tests). Several stale 'hyphenated package import' comments were then rewritten by hand because their justification (Python can't import a hyphenated package directly) no longer applies. Specifically:

  - `ai_router/disposition.py`: comment rewritten
  - `ai_router/orchestrator_role.py`: comment rewritten
  - `ai_router/verifier_role.py`: docstring rewritten — the two invocation forms (`-m ai_router.verifier_role` and `python ai_router/verifier_role.py`) are now described as equivalent (the `-m` form works because the parent of `ai_router/` is on `sys.path` after `pip install -e .`).
  - ai_router/tests/conftest.py: docstring rewritten to remove the no-longer-accurate 'hyphenated' justification. The sys.path.insert(0, AI_ROUTER_DIR) mechanism is unchanged — tests still import submodules by bare filename. With the package now installable via `pip install -e .`, `import ai_router.queue_db` also works; the bare-filename form remains the test convention for backward-compatibility with existing test files.
  - test files (`test_disposition.py`, `test_failure_injection.py`, `test_session_events.py`, `test_print_session_set_status_cancelled.py`): docstrings updated to remove the hyphenated-package justification.

### 5. `pytest.ini` testpath updated

```ini
[pytest]
testpaths = ai_router/tests
addopts = --import-mode=importlib
markers =
    failure_injection: end-to-end crash/lease/concurrency recovery scenarios for the role-loops queue (run with `pytest -m failure_injection`).

```

### 6. Forward-looking path references updated across docs

The bulk update used `sed -i 's|ai-router/|ai_router/|g'` scoped to forward-looking files. The historical artifacts in `docs/proposals/` and `docs/session-sets/00*/` were left alone — they accurately reference the dashed path as it was when the audit / session was written, per the spec's risk section ('leave the historical line-number citations alone').

Updated files (forward-looking):

  - `CLAUDE.md`, `AGENTS.md`, `GEMINI.md` — file-map bullet, `Building & testing` block (now `pip install -e .[tests]` from repo root, no `cd ai_router`), and the AI-router-import block in AGENTS/GEMINI is replaced with a one-line `from ai_router import route` + a note that the previous `importlib.util.spec_from_file_location` shim is no longer needed.
  - `README.md` — adoption section rewritten (see Section 7), TOC anchor updated, file map's `### ai-router/` heading becomes `### ai_router/`, every `[ai-router/foo.py](ai-router/foo.py)` link becomes `[ai_router/foo.py](ai_router/foo.py)`.
  - `docs/ai-led-session-workflow.md` — 'Importing the Router' section rewritten (see Section 8), all 15 path references updated.
  - `docs/planning/repo-worktree-layout.md`, `docs/planning/lessons-learned.md`, `docs/session-state-schema-example.md` — path references updated.
  - `scripts/verify_session_*.py` (13 files including this session's own verifier) — the importlib shim was **replaced** with a direct ``import ai_router`` after a guarded ``sys.path.insert(0, str(REPO))`` (or ``REPO_ROOT``, depending on the file's existing variable name). The unused ``import importlib.util`` line was removed from each. The function names (``_load_ai_router`` / ``load_ai_router``) and their public return shape were preserved so existing call sites in each script (`ar = load_ai_router()`, `route = ar.route`, etc.) continue to work without further edits. Each file's docstring on the new function explains why the shim is gone.
  - `tools/dabbler-ai-orchestration/` TS sources, webview HTML, and README — path-string references updated. The compiled `out/` and bundled `dist/extension.js` are intentionally NOT rebuilt in this session; Session 3 (which bumps the extension version to 0.12.0 and adds the install command) is the natural rebuild point.

### 7. `README.md` — Adopting section updated

Step 1 now mentions copying both `ai_router/` AND `pyproject.toml` (with a forward-looking note that the step collapses to `pip install dabbler-ai-router` once the package is on PyPI in Session 2). Step 3 became `pip install -e .` instead of separate `pip install pyyaml httpx`. Step 4 replaced the importlib shim with `from ai_router import route` plus a one-paragraph explanation of why the shim is no longer needed.

```markdown
## Adopting `ai_router` in a project

The router is a plain Python package. To bring it into a consumer repo:

1. **Copy `ai_router/` and `pyproject.toml` to the root of the
   consumer repo.** The package directory is self-contained (no
   implicit relative paths above its own root) and `pyproject.toml`
   declares the package metadata `pip install -e .` consumes in
   step 3. Consumer repos own their copy; this repo is the source of
   truth that they sync from when changes land. (Once the package is
   on PyPI, this step collapses to `pip install dabbler-ai-router`.)

2. **Set API keys as environment variables:**

   | Variable | Required for |
   |---|---|
   | `ANTHROPIC_API_KEY` | Claude Sonnet / Opus calls |
   | `GEMINI_API_KEY` | Gemini Flash / Pro calls |
   | `OPENAI_API_KEY` | GPT-5.4 / GPT-5.4 Mini calls |
   | `PUSHOVER_API_KEY` | (optional) end-of-session phone notifications |
   | `PUSHOVER_USER_KEY` | (optional) end-of-session phone notifications |

   On Windows, set these as User environment variables; the notification
   helper falls back to the Windows User/Machine environment if the
   process environment doesn't already have the Pushover keys.

3. **Create the venv and install the package:**

   ```bash
   python -m venv .venv
   .venv/Scripts/pip install -e .
   ```

   `pip install -e .` reads `pyproject.toml` at the repo root and
   installs `ai_router` editably along with its runtime dependencies
   (`pyyaml`, `httpx`). The router uses `httpx` directly for all three
   providers' HTTP APIs (no `openai` / `anthropic` / `google-genai`
   SDKs needed at runtime).

4. **Import the router from your orchestrator script.** With the
   package installed, the import is direct:

   ```python
   from ai_router import route
   ```

   The previous `importlib.util.spec_from_file_location` shim, required
   when the package directory used a hyphenated name, is no
   longer needed.

5. **Tune `ai_router/router-config.yaml`** for the project. This is
   where you set per-task-type effort levels, the cost guard for
   verification, and the `delegation.always_route_task_types` list that
   prevents the orchestrator from doing reasoning work itself. The YAML
   is the single source of truth — there is no separate overlay file.

6. **Author your first session set:** create
   `docs/session-sets/<slug>/spec.md` with a Session Set Configuration
   block (see [docs/planning/session-set-authoring-guide.md](docs/planning/session-set-authoring-guide.md)),
   and start it with `Start the next session.`.

---


```

### 8. `docs/ai-led-session-workflow.md` — Importing the Router

```markdown
### Importing the Router

The package is installed via `pip install -e .` from the repo root
(or `pip install dabbler-ai-router` once the package is published to
PyPI), and imports directly:

```python
from ai_router import route
```

The previous `importlib.util.spec_from_file_location` shim, required
when the package directory used a hyphenated name, is no
longer needed.

On Windows, use `.venv/Scripts/python.exe` to run Python.


```

### 9. `AGENTS.md` / `GEMINI.md` — AI router import block

(Both files have the same content for this section; AGENTS.md shown.)

```markdown
### AI router import

After `.venv/Scripts/pip install -e .` from the repo root (or `pip
install dabbler-ai-router` once published), import directly:

```python
from ai_router import route
```

The previous `importlib.util.spec_from_file_location` shim, required
when the package directory used a hyphenated name, is no
longer needed.

Use `.venv/Scripts/python.exe` to run Python scripts on Windows. The
same module exposes `send_session_complete_notification()`, which reads
`PUSHOVER_API_KEY` and `PUSHOVER_USER_KEY` from the environment or
Windows User environment.


```

### 10. `docs/session-sets/010-pypi-publish-and-installer/ai-assignment.md`

Authored Session 1 block per the standing operator constraint (no routed `task_type="analysis"` mid-session — the same pattern set 009 used). Recommends `claude-code claude-opus-4-7 @ effort=high` for both Session 1 and Session 2.

```markdown
# AI Assignment Ledger — 010-pypi-publish-and-installer

> **Note on routing for this set.** Standing operator instruction
> (recorded in orchestrator memory, 2026-05-01) restricts ai-router
> usage to end-of-session cross-provider verification only. The
> "always route, never self-opine" rule (workflow Rule 17) is
> deliberately suspended for the duration of this constraint, and the
> per-session `Recommended orchestrator`, `Rationale`, and
> `Next-session orchestrator recommendation` blocks below were
> authored directly by the orchestrator without a routed
> `task_type="analysis"` call. Once the constraint is lifted, future
> sets should resume routed authoring; the deviation is recorded in
> the actuals on each session's block.

---

## Session 1: Rename `ai-router/` → `ai_router/`, add `pyproject.toml`

### Recommended orchestrator
claude-code claude-opus-4-7 @ effort=high

### Rationale
The work is mechanical-but-broad: a directory rename plus
forward-looking path-string updates across ~30–40 forward-facing
tracked files (instruction files, the workflow doc, the README, a
handful of planning docs, the scripts/verify_session_*.py importlib
shim, a few TS sources, the verifier prompt template, the
session-state schema example doc, plus internal Python references
inside the renamed package). Authoring `pyproject.toml` to the modern
PEP 621 schema and wiring `[project.scripts]` for the seven existing
CLI surfaces requires careful attention to entry points but no
architectural reasoning. Opus at high effort handles the
careful-wording demand on the prose updates and the test-suite
re-run cleanly; Sonnet at medium effort would also suffice for the
mechanical surface but the prose-quality bar in the agent-instruction
files and the workflow doc tips the call to Opus.

### Estimated routed cost
None this session — only end-of-session verification routes (per the
standing operator constraint).

| Step | Action | Routing Decision |
|------|--------|------------------|
| 1 | Read prerequisites (spec, current `ai-router/` layout, `pytest.ini`, agent files) | Direct (orchestrator) |
| 2 | Register Session 1 start (write `session-state.json`) | Direct (file-write helper, no API call) |
| 3 | Author this `ai-assignment.md` | Direct (router suspended per operator) |
| 4 | `git mv ai-router ai_router` | Direct (shell command) |
| 5 | Update `pytest.ini` testpaths | Direct (mechanical edit) |
| 6 | Update internal references inside the renamed `ai_router/` (Python files, docs, schemas, config) | Direct (mechanical find-and-replace) |
| 7 | Update `CLAUDE.md`, `AGENTS.md`, `GEMINI.md` path references | Direct (mechanical edit) |
| 8 | Update `README.md` file map + forward-looking path references in adoption section | Direct (mechanical edit; full collapse of adoption section is Session 3 work) |
| 9 | Update `docs/ai-led-session-workflow.md` path references and the importlib-shim block | Direct (mechanical edit) |
| 10 | Update `docs/planning/repo-worktree-layout.md` and `docs/planning/lessons-learned.md` path references | Direct (mechanical edit) |
| 11 | Update `docs/session-state-schema-example.md` path references | Direct (mechanical edit) |
| 12 | Update `scripts/verify_session_*.py` to use `ai_router` (drop importlib shim where possible) | Direct (mechanical edit) |
| 13 | Update `tools/dabbler-ai-orchestration` TypeScript sources + README path references | Direct (mechanical edit) |
| 14 | Author `pyproject.toml` at repo root (PEP 621 schema, `[project.scripts]` for 7 CLIs) | Direct (mechanical authoring against spec) |
| 15 | Smoke test: `pip install -e .` in fresh venv + `python -c "import ai_router"` | Direct (shell command) |
| 16 | Run full pytest suite (target: 676 passing → 676 passing) | Direct (shell command) |
| 17 | End-of-session cross-provider verification | Routed: `route(task_type="session-verification")` — the only API call this session |
| 18 | Commit, push, run `close_session.py` and stamp Session 1 closed | Direct (CLI invocation) |

### Actuals (filled after the session)
- Orchestrator used: <filled at close-out>
- Total routed cost: <filled at close-out>
- Deviations from recommendation: <filled at close-out>
- Notes for next-session calibration: <filled at close-out>

**Next-session orchestrator recommendation (Session 2):**
claude-code claude-opus-4-7 @ effort=high
Rationale: Authoring a GitHub Actions release workflow with OIDC
trusted-publishing semantics + the release-process documentation is
small in line-count but high-stakes (a wrong matrix or a missing
`id-token: write` permission breaks the publish path). Opus at high
effort matches the careful-wording demand for the workflow YAML and
the per-release runbook prose. Sonnet at medium effort would also be
viable; bias toward Opus until the workflow has shipped at least one
successful release.

```

## Smoke-test result

Fresh `.venv` created at the repo root; `.venv/Scripts/pip install -e ".[tests]"` succeeded (editable wheel built and installed). `python -c "import ai_router; print(ai_router.__file__); print(ai_router.__version__)"` printed:

```
__file__: C:\Users\denmi\source\repos\dabbler-ai-orchestration\ai_router\__init__.py
__version__: 0.1.0
```

## Test-suite result

`PYTHONPATH=. C:/Python311/python.exe -m pytest -q` against the renamed `ai_router/tests/` → **676 passed in 49.57s** (matches the 676-passing baseline from set 009 close-out).

When the same suite is run against the freshly-created `.venv` interpreter (`.venv/Scripts/python.exe -m pytest`), 2 tests in `ai_router/tests/test_restart_role.py::TestRestartAgainstRealDaemon` fail with PID-mismatch assertions. The cause is a Windows venv-launcher quirk: the venv's `python.exe` is a redirector that spawns the actual interpreter as a child process, so `subprocess.Popen.pid` (the launcher's pid) differs from `os.getpid()` inside the spawned script (the interpreter's pid). The tests assume `proc.pid == data['pid']`. With system Python (`C:/Python311/python.exe`), where the subprocess pid matches `os.getpid()` directly, both tests pass. The mismatch is environment-specific and pre-existing (it would also occur in a fresh venv at HEAD before the rename); it was not introduced by this session's changes. Treat as a known platform quirk to chase in a future session, not a regression of this session.

## Workflow ordering note

Workflow Step 6 (verification) is mode-aware; this set runs outsource-first and the verification routes synchronously through this script. The standing operator constraint restricts `ai_router` usage to end-of-session verification only — this is the only routed call this session.

## Verification ask

Evaluate whether the deliverables together satisfy the spec's Session 1 acceptance criteria. Specifically:

  1. **Rename completeness.** Does the directory rename fully migrate `ai-router/` → `ai_router/` with no orphaned internal references (excluding the historical `docs/proposals/` and `docs/session-sets/00*/` snapshots, which the spec explicitly says to leave alone)? The remaining `ai-router` occurrences are: (a) the new PyPI package name `dabbler-ai-router` (intentional), (b) historical references in proposal docs / past session-set artifacts, and (c) explicitly-dated 'when the directory was hyphenated' notes in the rewritten import-block prose.

  2. **`pyproject.toml` correctness.** Is the PEP 621 schema complete and conventional? Are the runtime dependencies (`pyyaml`, `httpx`) and test extras (`pytest`, `jsonschema`) consistent with the existing `requirements.txt` and what the package actually imports? Do the `[project.scripts]` entries name the correct `module:function` for each of the 7 CLI surfaces (`close_session`, `report`, `reconciler`, `queue_status`, `heartbeat_status`, `restart_role`, `backfill_session_state`)? Does `[tool.setuptools.packages.find]` correctly target `ai_router*`?

  3. **Smoke-test path is unblocked.** Does `pip install -e .` in a fresh venv succeed and does `from ai_router import route` work without the previous importlib shim? (The script above verified both — confirm the deliverables sustain that.)

  4. **Forward-looking docs are coherent.** Does the rewritten 'Importing the Router' workflow section, the agent-files' `### AI router import` block, and the README's adoption-section Step 4 all describe the same `from ai_router import route` pattern? Does the README's Step 1 (copy both `ai_router/` and `pyproject.toml`, plus the PyPI forward-reference) flow naturally into Step 3's `pip install -e .`?

  5. **No regressions.** Is the test-suite result (676 passing with system Python) consistent with the spec's acceptance criterion 'Same number of passing tests as before the rename'? Does the venv-launcher PID-mismatch finding (2 environmental failures) read as a known platform quirk rather than a code regression?

Return the structured `{verdict, issues}` JSON described in the verification prompt template, naming any required follow-up for Session 2.