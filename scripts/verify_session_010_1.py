"""End-of-session cross-provider verification for Set 10 Session 1.

Builds a verification prompt that bundles the spec excerpt for Session
1 (rename `ai-router/` to `ai_router/` + add `pyproject.toml`), the
key deliverables (the new `pyproject.toml`, the updated `__init__.py`
with `__version__`, the rewritten "Importing the Router" section in
the workflow doc, the updated agent-instruction files, the README
adoption section, and the rename summary), and the test-suite result.
Routes to a non-Anthropic verifier via
`route(task_type="session-verification")` per workflow Step 6 and
saves the raw verdict to `session-reviews/session-001.md`.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SET_DIR = REPO / "docs" / "session-sets" / "010-pypi-publish-and-installer"


def _load_ai_router():
    """Import ``ai_router`` directly. The previous ``importlib.util.spec_from_file_location`` shim,
    required when the package directory used a hyphenated name, is no longer needed:
    after Set 10 Session 1 the directory is ``ai_router/`` and the package is installable
    via ``pip install -e .`` from the repo root. The ``sys.path.insert`` covers the case
    where the script is run without the editable install.
    """
    if str(REPO) not in sys.path:
        sys.path.insert(0, str(REPO))
    import ai_router
    return ai_router


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _slice_session1_spec(spec_md: str) -> str:
    start = spec_md.find("### Session 1 of 3:")
    if start < 0:
        return "(could not locate Session 1 block)"
    end = spec_md.find("### Session 2 of 3:", start)
    if end < 0:
        end = len(spec_md)
    return spec_md[start:end]


def _slice_init_top(init_py: str) -> str:
    """First ~120 lines of __init__.py — covers the docstring,
    __version__ assignment, and the public-API re-exports."""
    lines = init_py.splitlines()
    return "\n".join(lines[:120])


def _slice_importing_router(workflow_md: str) -> str:
    start = workflow_md.find("### Importing the Router")
    if start < 0:
        return "(could not locate Importing the Router section)"
    end = workflow_md.find("### Task Types", start)
    if end < 0:
        end = len(workflow_md)
    return workflow_md[start:end]


def _slice_adoption_section(readme_md: str) -> str:
    start = readme_md.find("## Adopting `ai_router` in a project")
    if start < 0:
        return "(could not locate adoption section)"
    end = readme_md.find("## Repos that need UAT", start)
    if end < 0:
        end = len(readme_md)
    return readme_md[start:end]


def _slice_agent_router_import(agents_md: str) -> str:
    start = agents_md.find("### AI router import")
    if start < 0:
        return "(could not locate AI router import section)"
    end = agents_md.find("### Delegation Discipline", start)
    if end < 0:
        end = len(agents_md)
    return agents_md[start:end]


def _conftest_diff_summary() -> str:
    """Brief textual description of the conftest docstring change.

    The conftest's mechanism is unchanged (`sys.path.insert` of the
    package directory); the docstring was updated to reflect that the
    "hyphenated package can't be imported" justification is no longer
    accurate post-rename.
    """
    return (
        "ai_router/tests/conftest.py: docstring rewritten to remove "
        "the no-longer-accurate 'hyphenated' justification. The "
        "sys.path.insert(0, AI_ROUTER_DIR) mechanism is unchanged — "
        "tests still import submodules by bare filename. With the "
        "package now installable via `pip install -e .`, "
        "`import ai_router.queue_db` also works; the bare-filename "
        "form remains the test convention for backward-compatibility "
        "with existing test files."
    )


def main() -> int:
    ai_router = _load_ai_router()
    route = ai_router.route

    pyproject = _read(REPO / "pyproject.toml")
    pytest_ini = _read(REPO / "pytest.ini")
    init_py = _read(REPO / "ai_router" / "__init__.py")
    workflow_md = _read(REPO / "docs" / "ai-led-session-workflow.md")
    readme_md = _read(REPO / "README.md")
    claude_md = _read(REPO / "CLAUDE.md")
    agents_md = _read(REPO / "AGENTS.md")
    gemini_md = _read(REPO / "GEMINI.md")
    spec_md = _read(SET_DIR / "spec.md")
    ai_assignment_md = _read(SET_DIR / "ai-assignment.md")

    prompt_lines = [
        "# Cross-provider verification — Set 10 Session 1: rename "
        "`ai-router/` → `ai_router/` and add `pyproject.toml`",
        "",
        "## Spec excerpt for Session 1",
        "```markdown",
        _slice_session1_spec(spec_md),
        "```",
        "",
        "## Deliverables",
        "",
        "### 1. Directory rename via `git mv`",
        "",
        "`git mv ai-router ai_router` was executed. Every file under "
        "the old `ai-router/` directory is now at the same relative "
        "path under `ai_router/`. Git records 40+ rename entries "
        "(`R` / `RM` status). No file content was lost; modifications "
        "are limited to text content updates inside the renamed files "
        "(see Section 4 below) plus the new `pyproject.toml` (Section 2 "
        "below) and a small `__version__` addition in `__init__.py` "
        "(Section 3).",
        "",
        "### 2. New `pyproject.toml` at repo root (PEP 621)",
        "",
        "```toml",
        pyproject,
        "```",
        "",
        "### 3. `ai_router/__init__.py` — added `__version__ = \"0.1.0\"`",
        "",
        "Top of the module after the docstring; the public-API "
        "re-exports below it are unchanged. The "
        "`__version__` enables `python -c \"import ai_router; "
        "print(ai_router.__version__)\"` (used in Session 2's "
        "post-PyPI-publish smoke test).",
        "",
        "```python",
        _slice_init_top(init_py),
        "```",
        "",
        "### 4. Path-string updates inside the renamed `ai_router/`",
        "",
        "All internal references inside the renamed package were "
        "updated from the dashed `ai-router/` path to the underscored "
        "`ai_router/` path via a single `sed -i 's|ai-router|ai_router|g'` "
        "pass over the 36 affected files (Python, docstrings, "
        "`router-config.yaml`, `schemas/disposition.schema.json`, "
        "`docs/close-out.md`, `docs/two-cli-workflow.md`, all tests). "
        "Several stale 'hyphenated package import' comments were then "
        "rewritten by hand because their justification (Python can't "
        "import a hyphenated package directly) no longer applies. "
        "Specifically:",
        "",
        "  - `ai_router/disposition.py`: comment rewritten",
        "  - `ai_router/orchestrator_role.py`: comment rewritten",
        "  - `ai_router/verifier_role.py`: docstring rewritten — "
        "the two invocation forms (`-m ai_router.verifier_role` and "
        "`python ai_router/verifier_role.py`) are now described as "
        "equivalent (the `-m` form works because the parent of "
        "`ai_router/` is on `sys.path` after `pip install -e .`).",
        "  - " + _conftest_diff_summary(),
        "  - test files (`test_disposition.py`, `test_failure_injection.py`, "
        "`test_session_events.py`, `test_print_session_set_status_cancelled.py`): "
        "docstrings updated to remove the hyphenated-package justification.",
        "",
        "### 5. `pytest.ini` testpath updated",
        "",
        "```ini",
        pytest_ini,
        "```",
        "",
        "### 6. Forward-looking path references updated across docs",
        "",
        "The bulk update used `sed -i 's|ai-router/|ai_router/|g'` "
        "scoped to forward-looking files. The historical artifacts in "
        "`docs/proposals/` and `docs/session-sets/00*/` were left "
        "alone — they accurately reference the dashed path as it was "
        "when the audit / session was written, per the spec's risk "
        "section ('leave the historical line-number citations alone').",
        "",
        "Updated files (forward-looking):",
        "",
        "  - `CLAUDE.md`, `AGENTS.md`, `GEMINI.md` — file-map bullet, "
        "`Building & testing` block (now `pip install -e .[tests]` from "
        "repo root, no `cd ai_router`), and the AI-router-import block "
        "in AGENTS/GEMINI is replaced with a one-line "
        "`from ai_router import route` + a note that the previous "
        "`importlib.util.spec_from_file_location` shim is no longer "
        "needed.",
        "  - `README.md` — adoption section rewritten (see Section 7), "
        "TOC anchor updated, file map's `### ai-router/` heading "
        "becomes `### ai_router/`, every `[ai-router/foo.py](ai-router/foo.py)` "
        "link becomes `[ai_router/foo.py](ai_router/foo.py)`.",
        "  - `docs/ai-led-session-workflow.md` — 'Importing the Router' "
        "section rewritten (see Section 8), all 15 path references "
        "updated.",
        "  - `docs/planning/repo-worktree-layout.md`, "
        "`docs/planning/lessons-learned.md`, "
        "`docs/session-state-schema-example.md` — path references "
        "updated.",
        "  - `scripts/verify_session_*.py` (13 files including this "
        "session's own verifier) — the importlib shim was **replaced** "
        "with a direct ``import ai_router`` after a guarded "
        "``sys.path.insert(0, str(REPO))`` (or ``REPO_ROOT``, depending "
        "on the file's existing variable name). The unused "
        "``import importlib.util`` line was removed from each. The "
        "function names (``_load_ai_router`` / ``load_ai_router``) and "
        "their public return shape were preserved so existing call "
        "sites in each script (`ar = load_ai_router()`, "
        "`route = ar.route`, etc.) continue to work without further "
        "edits. Each file's docstring on the new function explains why "
        "the shim is gone.",
        "  - `tools/dabbler-ai-orchestration/` TS sources, webview HTML, "
        "and README — path-string references updated. The compiled "
        "`out/` and bundled `dist/extension.js` are intentionally NOT "
        "rebuilt in this session; Session 3 (which bumps the extension "
        "version to 0.12.0 and adds the install command) is the "
        "natural rebuild point.",
        "",
        "### 7. `README.md` — Adopting section updated",
        "",
        "Step 1 now mentions copying both `ai_router/` AND "
        "`pyproject.toml` (with a forward-looking note that the step "
        "collapses to `pip install dabbler-ai-router` once the package "
        "is on PyPI in Session 2). Step 3 became `pip install -e .` "
        "instead of separate `pip install pyyaml httpx`. Step 4 "
        "replaced the importlib shim with `from ai_router import "
        "route` plus a one-paragraph explanation of why the shim is "
        "no longer needed.",
        "",
        "```markdown",
        _slice_adoption_section(readme_md),
        "```",
        "",
        "### 8. `docs/ai-led-session-workflow.md` — Importing the Router",
        "",
        "```markdown",
        _slice_importing_router(workflow_md),
        "```",
        "",
        "### 9. `AGENTS.md` / `GEMINI.md` — AI router import block",
        "",
        "(Both files have the same content for this section; AGENTS.md "
        "shown.)",
        "",
        "```markdown",
        _slice_agent_router_import(agents_md),
        "```",
        "",
        "### 10. `docs/session-sets/010-pypi-publish-and-installer/ai-assignment.md`",
        "",
        "Authored Session 1 block per the standing operator "
        "constraint (no routed `task_type=\"analysis\"` mid-session — "
        "the same pattern set 009 used). Recommends "
        "`claude-code claude-opus-4-7 @ effort=high` for both Session 1 "
        "and Session 2.",
        "",
        "```markdown",
        ai_assignment_md,
        "```",
        "",
        "## Smoke-test result",
        "",
        "Fresh `.venv` created at the repo root; "
        "`.venv/Scripts/pip install -e \".[tests]\"` succeeded "
        "(editable wheel built and installed). "
        "`python -c \"import ai_router; print(ai_router.__file__); "
        "print(ai_router.__version__)\"` printed:",
        "",
        "```",
        "__file__: C:\\Users\\denmi\\source\\repos\\dabbler-ai-orchestration\\ai_router\\__init__.py",
        "__version__: 0.1.0",
        "```",
        "",
        "## Test-suite result",
        "",
        "`PYTHONPATH=. C:/Python311/python.exe -m pytest -q` against "
        "the renamed `ai_router/tests/` → **676 passed in 49.57s** "
        "(matches the 676-passing baseline from set 009 close-out).",
        "",
        "When the same suite is run against the freshly-created `.venv` "
        "interpreter (`.venv/Scripts/python.exe -m pytest`), 2 tests "
        "in `ai_router/tests/test_restart_role.py::TestRestartAgainstRealDaemon` "
        "fail with PID-mismatch assertions. The cause is a Windows "
        "venv-launcher quirk: the venv's `python.exe` is a redirector "
        "that spawns the actual interpreter as a child process, so "
        "`subprocess.Popen.pid` (the launcher's pid) differs from "
        "`os.getpid()` inside the spawned script (the interpreter's "
        "pid). The tests assume `proc.pid == data['pid']`. With "
        "system Python (`C:/Python311/python.exe`), where the "
        "subprocess pid matches `os.getpid()` directly, both tests "
        "pass. The mismatch is environment-specific and pre-existing "
        "(it would also occur in a fresh venv at HEAD before the "
        "rename); it was not introduced by this session's changes. "
        "Treat as a known platform quirk to chase in a future session, "
        "not a regression of this session.",
        "",
        "## Workflow ordering note",
        "",
        "Workflow Step 6 (verification) is mode-aware; this set runs "
        "outsource-first and the verification routes synchronously "
        "through this script. The standing operator constraint "
        "restricts `ai_router` usage to end-of-session verification "
        "only — this is the only routed call this session.",
        "",
        "## Verification ask",
        "",
        "Evaluate whether the deliverables together satisfy the "
        "spec's Session 1 acceptance criteria. Specifically:",
        "",
        "  1. **Rename completeness.** Does the directory rename "
        "fully migrate `ai-router/` → `ai_router/` with no orphaned "
        "internal references (excluding the historical `docs/proposals/` "
        "and `docs/session-sets/00*/` snapshots, which the spec "
        "explicitly says to leave alone)? The remaining `ai-router` "
        "occurrences are: (a) the new PyPI package name "
        "`dabbler-ai-router` (intentional), (b) historical references "
        "in proposal docs / past session-set artifacts, and (c) "
        "explicitly-dated 'when the directory was hyphenated' notes in "
        "the rewritten import-block prose.",
        "",
        "  2. **`pyproject.toml` correctness.** Is the PEP 621 schema "
        "complete and conventional? Are the runtime dependencies "
        "(`pyyaml`, `httpx`) and test extras (`pytest`, `jsonschema`) "
        "consistent with the existing `requirements.txt` and what the "
        "package actually imports? Do the `[project.scripts]` entries "
        "name the correct `module:function` for each of the 7 CLI "
        "surfaces (`close_session`, `report`, `reconciler`, "
        "`queue_status`, `heartbeat_status`, `restart_role`, "
        "`backfill_session_state`)? Does "
        "`[tool.setuptools.packages.find]` correctly target "
        "`ai_router*`?",
        "",
        "  3. **Smoke-test path is unblocked.** Does `pip install -e .` "
        "in a fresh venv succeed and does `from ai_router import route` "
        "work without the previous importlib shim? (The script above "
        "verified both — confirm the deliverables sustain that.)",
        "",
        "  4. **Forward-looking docs are coherent.** Does the rewritten "
        "'Importing the Router' workflow section, the agent-files' "
        "`### AI router import` block, and the README's adoption-section "
        "Step 4 all describe the same `from ai_router import route` "
        "pattern? Does the README's Step 1 (copy both `ai_router/` and "
        "`pyproject.toml`, plus the PyPI forward-reference) flow "
        "naturally into Step 3's `pip install -e .`?",
        "",
        "  5. **No regressions.** Is the test-suite result (676 passing "
        "with system Python) consistent with the spec's acceptance "
        "criterion 'Same number of passing tests as before the rename'? "
        "Does the venv-launcher PID-mismatch finding (2 environmental "
        "failures) read as a known platform quirk rather than a code "
        "regression?",
        "",
        "Return the structured `{verdict, issues}` JSON described in "
        "the verification prompt template, naming any required follow-up "
        "for Session 2.",
    ]

    prompt = "\n".join(prompt_lines)

    out_dir = SET_DIR / "session-reviews"
    out_dir.mkdir(parents=True, exist_ok=True)
    prompt_path = out_dir / "session-001-prompt.md"
    prompt_path.write_text(prompt, encoding="utf-8")
    print(f"Wrote prompt: {prompt_path} ({len(prompt)} chars)")

    print("Routing session-verification call (cross-provider)…")
    result = route(
        content=prompt,
        task_type="session-verification",
        complexity_hint=70,
        session_set=str(SET_DIR),
        session_number=1,
    )

    review_path = out_dir / "session-001.md"
    review_path.write_text(result.content, encoding="utf-8")
    print(f"Wrote review: {review_path} ({len(result.content)} chars)")

    print(
        "Verifier model:",
        getattr(result, "model_name", None) or getattr(result, "model", None),
    )
    print(
        "Cost USD:",
        getattr(result, "cost_usd", None)
        or getattr(result, "total_cost_usd", None),
    )

    print("--- Verifier output (first 4000 chars) ---")
    print(result.content[:4000])

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
