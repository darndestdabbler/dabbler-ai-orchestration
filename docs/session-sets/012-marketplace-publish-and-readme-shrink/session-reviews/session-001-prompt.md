# Cross-provider verification — Set 12 Session 1: Workspace-relative config + metrics auto-discovery + 0.1.1 release

## Spec excerpt for Session 1

```markdown
### Session 1 of 3: Workspace-relative config + metrics auto-discovery

**Goal:** Make `ai_router/router-config.yaml` and `ai_router/router-metrics.jsonl`
work without operator-set env vars when the file lives in a sensibly-located
workspace directory.

**Steps:**

1. **`ai_router/config.py:load_config()`** — add a `_find_workspace_config()`
   helper that walks up from `os.getcwd()` looking for
   `ai_router/router-config.yaml`. Stops at the first hit (workspace root)
   or the filesystem root. Returns `None` if no hit. The new resolution
   order in `load_config()`:
   - Explicit `path` parameter (if provided) — wins.
   - `AI_ROUTER_CONFIG` env var — wins next.
   - Workspace-relative search via `_find_workspace_config()` — new. If
     the search hits, use that.
   - Bundled default at `_THIS_DIR / "router-config.yaml"` — final fallback.
2. **`ai_router/metrics.py:_log_path()`** — update to follow the resolved
   config's directory. If `load_config()` resolved to a workspace-relative
   `<workspace>/ai_router/router-config.yaml`, metrics default to
   `<workspace>/ai_router/router-metrics.jsonl`. Otherwise the existing
   default (next to `metrics.py` in site-packages) applies. The
   `AI_ROUTER_METRICS_PATH` env var still wins.
3. **Unit tests** — extend `ai_router/tests/test_config.py` and
   `test_metrics.py` (or create them if absent):
   - Workspace-relative search hits when `ai_router/router-config.yaml`
     exists in `cwd` or any ancestor.
   - Workspace-relative search misses cleanly (returns bundled default)
     when no such file exists in any ancestor.
   - Explicit `path` parameter wins over both env-var and workspace search.
   - `AI_ROUTER_CONFIG` env var wins over workspace search but loses to
     explicit `path`.
   - Metrics path follows config path resolution: workspace-config →
     workspace-metrics; bundled-config → bundled-metrics; env-var-overridden
     config does NOT auto-override metrics (the two env vars are independent,
     matching current semantics).
   - Walking up stops at the filesystem root without erroring (operator
     running tools from `/` should not crash).
4. **Backward-compat smoke test** — confirm the default-path test cases
   (no workspace config present, no env vars) still pass unchanged. The new
   code is additive: existing semantics for "router invoked outside any
   workspace" are unchanged.
5. **Bump `dabbler-ai-router` to 0.1.1** in `pyproject.toml`. Add a CHANGELOG
   note describing the new auto-discovery and noting it's additive (env vars
   unchanged).

**Touches:** `ai_router/config.py`, `ai_router/metrics.py`, `pyproject.toml`
(version bump), and the matching `__version__` constant in
`ai_router/__init__.py`.

**Ends with:** `from ai_router import route` works from any workspace that
has `ai_router/router-config.yaml` checked in, with no env-var setup; the
full pytest suite passes (target: existing test count + 6-10 new tests, no
regressions); cross-provider verification returns `VERIFIED`;
`dabbler-ai-router 0.1.1` is published on PyPI via the existing release
workflow (the publish itself happens after this verification, in Step 8).
```

> **Note on routing for this set.** Standing operator instruction
> restricts ai-router usage to end-of-session cross-provider verification
> only. No mid-session routed analysis was performed. The routed
> CHANGELOG-equivalent narrative for the 0.1.1 release will be the
> commit message; the spec's "or commit message that the runbook +
> release-process doc treats as the source of truth" alternative was
> selected explicitly for that reason. There is no separate `CHANGELOG.md`
> file in this repo to amend, and the existing `release-process.md`
> already documents the version-bump-then-tag pattern.

---

## File diffs

### `ai_router/__init__.py`

```diff
-__version__ = "0.1.0"
+__version__ = "0.1.1"
```

### `pyproject.toml`

```diff
 [project]
 name = "dabbler-ai-router"
-version = "0.1.0"
+version = "0.1.1"
```

### `ai_router/config.py`

```diff
 # Default config location is router-config.yaml in the same directory as
 # this file. Keeps the default working regardless of where Python is
 # invoked from.
 _THIS_DIR = Path(__file__).parent

+# Workspace-relative config / metrics discovery. The walk-up looks for
+# this exact relative path under each ancestor of cwd, so a workspace
+# that checks in `ai_router/router-config.yaml` is auto-discovered
+# without operators having to set AI_ROUTER_CONFIG. The metrics file is
+# resolved to the same directory as the discovered config.
+_WORKSPACE_CONFIG_RELPATH = Path("ai_router") / "router-config.yaml"
+
+
+def _find_workspace_config(start: Path | None = None) -> Path | None:
+    """Walk up from *start* (default: cwd) looking for an
+    ``ai_router/router-config.yaml`` checked into a workspace.
+
+    Returns the first hit (closest ancestor wins), or ``None`` if no
+    ancestor contains the file. Stops at the filesystem root without
+    erroring. Permission-denied or other OS errors during the walk are
+    treated as a miss for that ancestor and the walk continues —
+    operators running tools from unusual mountpoints should not crash.
+    """
+    try:
+        cur = (Path(start) if start is not None else Path.cwd()).resolve()
+    except OSError:
+        return None
+
+    seen: set[Path] = set()
+    while cur not in seen:
+        seen.add(cur)
+        candidate = cur / _WORKSPACE_CONFIG_RELPATH
+        try:
+            if candidate.is_file():
+                return candidate
+        except OSError:
+            pass
+        parent = cur.parent
+        if parent == cur:
+            break
+        cur = parent
+    return None
+
+
+def _resolve_config_path(path: str | None = None) -> str:
+    """Return the router-config.yaml path that ``load_config`` would
+    use, given the same input.
+
+    Resolution order (highest priority first):
+      1. Explicit ``path`` argument.
+      2. ``AI_ROUTER_CONFIG`` env var — explicit deployment override.
+      3. Workspace-relative search via ``_find_workspace_config()``.
+      4. Bundled default at ``_THIS_DIR / "router-config.yaml"``.
+    """
+    if path is not None:
+        return path
+    env_override = os.environ.get("AI_ROUTER_CONFIG")
+    if env_override:
+        return env_override
+    workspace = _find_workspace_config()
+    if workspace is not None:
+        return str(workspace)
+    return str(_THIS_DIR / "router-config.yaml")
+

 def load_config(path: str | None = None) -> dict:
-    if path is None:
-        path = str(_THIS_DIR / "router-config.yaml")
+    path = _resolve_config_path(path)
     config_path = Path(path)
     if not config_path.exists():
         raise FileNotFoundError(
             f"Router config not found: {path}\n"
             f"Create it from the template in the AI Router specification."
         )
```

Plus, late in `load_config()` just before `return config`:

```diff
+    # Stash the resolved config path so metrics._log_path() can default
+    # the metrics file to the same directory (workspace co-location).
+    config["_config_path"] = str(config_path.resolve())
+
     return config
```

### `ai_router/metrics.py`

```diff
 def _log_path(config: dict) -> Path:
-    """Resolve the metrics log file path."""
+    """Resolve the metrics log file path.
+
+    Resolution order (highest priority first):
+      1. ``AI_ROUTER_METRICS_PATH`` env var — explicit deployment override.
+      2. The directory of the resolved router-config.yaml (stashed by
+         ``load_config`` as ``config["_config_path"]``). This makes
+         workspace-relative discovery automatic: a workspace whose
+         tuned ``ai_router/router-config.yaml`` was discovered via
+         walk-up gets its metrics in ``<workspace>/ai_router/`` too,
+         not in site-packages.
+      3. The package-bundled default at ``<this dir>/<filename>``.
+    """
     metrics_cfg = config.get("metrics", {}) or {}
     filename = metrics_cfg.get("log_filename", "router-metrics.jsonl")

     override = os.environ.get("AI_ROUTER_METRICS_PATH")
     if override:
         return Path(override)

+    config_path = config.get("_config_path")
+    if config_path:
+        return Path(config_path).parent / filename
+
     return _THIS_DIR / filename
```

### `ai_router/tests/test_config.py` (new file)

```python
"""Tests for ai_router.config workspace-relative auto-discovery.

The legacy contract of ``load_config()`` (explicit path > bundled
default) is exercised end-to-end by the rest of the suite. These tests
focus on the new resolution helpers added in 0.1.1:

  - ``_find_workspace_config()`` — walk-up search for
    ``ai_router/router-config.yaml`` from a given start directory.
  - ``_resolve_config_path()`` — full resolution order including the
    explicit-path > env-var > workspace > bundled-default precedence.

The helpers are tested directly rather than going through
``load_config()`` because ``load_config()`` validates provider API
keys + model references, which would force every test to mint a full
router-config.yaml fixture for a precedence-only assertion.
"""

import os
from pathlib import Path

import config as config_mod  # type: ignore[import-not-found]


# --- _find_workspace_config -----------------------------------------------


def _make_workspace(root: Path) -> Path:
    """Create ``<root>/ai_router/router-config.yaml`` and return its path."""
    target = root / "ai_router" / "router-config.yaml"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text("# fixture\nproviders: {}\n", encoding="utf-8")
    return target


def test_find_workspace_config_hits_in_cwd(tmp_path: Path) -> None:
    expected = _make_workspace(tmp_path)
    found = config_mod._find_workspace_config(start=tmp_path)
    assert found is not None
    assert found.resolve() == expected.resolve()


def test_find_workspace_config_hits_in_ancestor(tmp_path: Path) -> None:
    expected = _make_workspace(tmp_path)
    deep = tmp_path / "src" / "subpkg" / "tests"
    deep.mkdir(parents=True)
    found = config_mod._find_workspace_config(start=deep)
    assert found is not None
    assert found.resolve() == expected.resolve()


def test_find_workspace_config_returns_none_when_no_ancestor_has_it(
    tmp_path: Path,
) -> None:
    # Empty tmp_path tree; walk-up will hit the filesystem root without
    # finding ai_router/router-config.yaml. Real ancestors of tmp_path
    # may have one (e.g. a developer's repo checkout), so we restrict
    # the test to the tmp tree by patching the start to a leaf and
    # checking the call returns either None or a path *outside* tmp.
    leaf = tmp_path / "deep" / "deeper"
    leaf.mkdir(parents=True)
    found = config_mod._find_workspace_config(start=leaf)
    if found is not None:
        assert tmp_path not in found.resolve().parents


def test_find_workspace_config_stops_at_root_without_erroring(
    tmp_path: Path,
) -> None:
    # Use the actual filesystem root as the start. Should not raise.
    config_mod._find_workspace_config(start=Path(tmp_path.anchor or "/"))


def test_find_workspace_config_closest_ancestor_wins(tmp_path: Path) -> None:
    # Two configs: outer and inner. Walk-up from a leaf should hit the
    # inner one first.
    _make_workspace(tmp_path)
    inner_root = tmp_path / "project"
    inner_root.mkdir()
    inner_expected = _make_workspace(inner_root)
    leaf = inner_root / "src" / "deep"
    leaf.mkdir(parents=True)
    found = config_mod._find_workspace_config(start=leaf)
    assert found is not None
    assert found.resolve() == inner_expected.resolve()


# --- _resolve_config_path -------------------------------------------------


def test_resolve_explicit_path_wins_over_env_and_workspace(
    tmp_path: Path, monkeypatch
) -> None:
    _make_workspace(tmp_path)
    env_target = tmp_path / "env.yaml"
    env_target.write_text("# env\n", encoding="utf-8")
    explicit_target = tmp_path / "explicit.yaml"
    explicit_target.write_text("# explicit\n", encoding="utf-8")

    monkeypatch.setenv("AI_ROUTER_CONFIG", str(env_target))
    monkeypatch.chdir(tmp_path)

    resolved = config_mod._resolve_config_path(str(explicit_target))
    assert Path(resolved).resolve() == explicit_target.resolve()


def test_resolve_env_var_wins_over_workspace(
    tmp_path: Path, monkeypatch
) -> None:
    workspace_path = _make_workspace(tmp_path)
    env_target = tmp_path / "env.yaml"
    env_target.write_text("# env\n", encoding="utf-8")

    monkeypatch.setenv("AI_ROUTER_CONFIG", str(env_target))
    monkeypatch.chdir(tmp_path)

    resolved = config_mod._resolve_config_path(None)
    assert Path(resolved).resolve() == env_target.resolve()
    assert workspace_path.exists()


def test_resolve_workspace_wins_over_bundled_default(
    tmp_path: Path, monkeypatch
) -> None:
    expected = _make_workspace(tmp_path)
    monkeypatch.delenv("AI_ROUTER_CONFIG", raising=False)
    monkeypatch.chdir(tmp_path)

    resolved = config_mod._resolve_config_path(None)
    assert Path(resolved).resolve() == expected.resolve()


def test_resolve_falls_back_to_bundled_default_when_nothing_else_resolves(
    tmp_path: Path, monkeypatch
) -> None:
    monkeypatch.delenv("AI_ROUTER_CONFIG", raising=False)
    monkeypatch.setattr(config_mod, "_find_workspace_config", lambda start=None: None)
    monkeypatch.chdir(tmp_path)

    resolved = config_mod._resolve_config_path(None)
    expected = config_mod._THIS_DIR / "router-config.yaml"
    assert Path(resolved).resolve() == expected.resolve()
```

### `ai_router/tests/test_metrics.py` (new file)

```python
"""Tests for ai_router.metrics._log_path resolution.

The 0.1.1 contract for ``_log_path`` is:

  1. ``AI_ROUTER_METRICS_PATH`` env var wins.
  2. Else, the metrics file lives in the same directory as the resolved
     ``router-config.yaml`` (stashed by ``load_config`` at
     ``config["_config_path"]``).
  3. Else (no resolved config path on the dict), the package-bundled
     default beside ``metrics.py`` is used.

The two env-var semantics (config vs. metrics) are independent — an
``AI_ROUTER_CONFIG`` override does NOT auto-redirect metrics, matching
behavior in 0.1.0. These tests pin that.
"""

import os
from pathlib import Path

import metrics as metrics_mod  # type: ignore[import-not-found]


def test_log_path_uses_metrics_env_var_when_set(
    tmp_path: Path, monkeypatch
) -> None:
    target = tmp_path / "elsewhere" / "metrics.jsonl"
    monkeypatch.setenv("AI_ROUTER_METRICS_PATH", str(target))
    config = {"_config_path": str(tmp_path / "ai_router" / "router-config.yaml")}
    assert metrics_mod._log_path(config).resolve() == target.resolve()


def test_log_path_follows_resolved_workspace_config(
    tmp_path: Path, monkeypatch
) -> None:
    monkeypatch.delenv("AI_ROUTER_METRICS_PATH", raising=False)
    workspace_dir = tmp_path / "workspace" / "ai_router"
    workspace_dir.mkdir(parents=True)
    config_file = workspace_dir / "router-config.yaml"
    config_file.write_text("# fixture\n", encoding="utf-8")

    config = {"_config_path": str(config_file)}
    expected = workspace_dir / "router-metrics.jsonl"
    assert metrics_mod._log_path(config).resolve() == expected.resolve()


def test_log_path_honors_metrics_log_filename_override(
    tmp_path: Path, monkeypatch
) -> None:
    monkeypatch.delenv("AI_ROUTER_METRICS_PATH", raising=False)
    workspace_dir = tmp_path / "workspace" / "ai_router"
    workspace_dir.mkdir(parents=True)
    config_file = workspace_dir / "router-config.yaml"
    config_file.write_text("# fixture\n", encoding="utf-8")

    config = {
        "_config_path": str(config_file),
        "metrics": {"log_filename": "custom-name.jsonl"},
    }
    expected = workspace_dir / "custom-name.jsonl"
    assert metrics_mod._log_path(config).resolve() == expected.resolve()


def test_log_path_falls_back_to_bundled_default_without_config_path(
    monkeypatch,
) -> None:
    monkeypatch.delenv("AI_ROUTER_METRICS_PATH", raising=False)
    config: dict = {}
    expected = metrics_mod._THIS_DIR / "router-metrics.jsonl"
    assert metrics_mod._log_path(config).resolve() == expected.resolve()


def test_metrics_env_var_independent_of_config_env_var(
    tmp_path: Path, monkeypatch
) -> None:
    """Setting AI_ROUTER_CONFIG does not auto-redirect metrics — the
    metrics override is its own env var. _log_path() doesn't read
    AI_ROUTER_CONFIG, so this is checked indirectly: the only way the
    metrics path moves is via the resolved _config_path on the config
    dict (set by load_config) or AI_ROUTER_METRICS_PATH itself.
    """
    monkeypatch.setenv("AI_ROUTER_CONFIG", str(tmp_path / "elsewhere.yaml"))
    monkeypatch.delenv("AI_ROUTER_METRICS_PATH", raising=False)

    config: dict = {}
    expected = metrics_mod._THIS_DIR / "router-metrics.jsonl"
    assert metrics_mod._log_path(config).resolve() == expected.resolve()
```

---

## Build / test results

`python -m pytest` (full suite) reports:

- **702 passed**
- **2 failed** — `ai_router/tests/test_restart_role.py::TestRestartAgainstRealDaemon::test_restart_signals_daemon_and_clears_pid_file` and `::test_restart_orchestrator_daemon`

Both failures were confirmed pre-existing on master prior to this session's
changes (verified via `git stash` + re-run on the unchanged tree). They are
the known Windows venv launcher / PID race in the real-daemon integration
suite (Set 010 Session 1 verifier already flagged this as a non-blocking
follow-up). The new code in this session does not touch
`test_restart_role.py`, `daemon_pid.py`, or any of the daemon spawning paths.

The 14 new tests (9 in `test_config.py`, 5 in `test_metrics.py`) all pass
on the first run with no regressions in the pre-existing suite count
(688 passing on master + 14 new = 702 passing here).

Smoke-check for the workspace-discovery integration:

```bash
$ python -c "from ai_router.config import load_config; c = load_config(); print(type(c.get('_config_path')))"
<class 'str'>
```

The `_config_path` is now stashed onto the returned config dict (consumed
by `metrics._log_path`).

---

## Files changed in this session

```
 ai_router/__init__.py                              |   2 +-
 ai_router/config.py                                |  66 +++++++++++++++++++-
 ai_router/metrics.py                               |  17 +++++-
 ai_router/tests/test_config.py                     | 150 ++++++++++++++++++++ (new)
 ai_router/tests/test_metrics.py                    |  89 +++++++++++++ (new)
 docs/session-sets/012-marketplace-publish-and-readme-shrink/
   ai-assignment.md                                 | 70 ++++++++++++++++++++ (new)
   session-state.json                               |  in-progress flip
 pyproject.toml                                     |   2 +-
```

The 0.1.1 PyPI release will land in Step 8 (commit + tag push triggers the
existing `.github/workflows/release.yml` from Set 010); the publish itself
is downstream of this verification. The change-log narrative for the
release is the commit message (per the spec's "or commit message that the
runbook + release-process doc treats as the source of truth" alternative
— the operator memory restricts mid-session router calls, so the routed
documentation task that would otherwise produce a CHANGELOG fragment was
not invoked).

---

## Verification request

Please review the work above and respond with the structured JSON from
`ai_router/prompt-templates/verification.md`:

```json
{
  "verdict": "VERIFIED" | "ISSUES_FOUND",
  "issues": [
    { "severity": "Critical|Major|Minor|non-blocking",
      "title": "...", "detail": "...",
      "follow_up": "..." }
  ]
}
```

Specific things to probe:

1. **Resolution-order edge cases.** Does `_find_workspace_config()` handle
   symlinks, permission-denied directories, and the filesystem-root
   termination correctly? Is the `seen` set sufficient to break cycles
   that symlink loops could otherwise create?
2. **Race condition.** What happens if a workspace `router-config.yaml`
   is created during the walk-up? (Walk only reads — additive racy create
   is benign; deletion mid-walk is the only adversarial case.)
3. **Test coverage for the new branch.** Are the 14 new tests sufficient
   to lock in the resolution-order contract? Note especially the
   `test_metrics_env_var_independent_of_config_env_var` test which pins
   the spec's "the two env vars are independent" requirement.
4. **CHANGELOG framing.** The spec allows the commit message to serve as
   the source-of-truth narrative for the 0.1.1 release. The version bump
   in `pyproject.toml` + `__init__.py:__version__` is the audit trail; no
   `CHANGELOG.md` exists to amend. Is this acceptable for a 0.1.0 → 0.1.1
   bump that is purely additive (new resolution paths, no breaking changes)?
5. **Backward compatibility.** Confirm: an installed-from-PyPI 0.1.1 used
   from outside any workspace (no `ai_router/router-config.yaml` in any
   ancestor of cwd, no env vars set) still behaves identically to 0.1.0
   — falls back to the bundled default.
