# Cross-provider verification — Set 12 Session 1, ROUND 2

## Round 1 verdict

`ISSUES_FOUND` — see `session-001.md` (round 1, saved verbatim). Two issues:

1. **Major** — Metrics co-location applied unconditionally to every
   resolved config path (`config["_config_path"]`), so an
   `AI_ROUTER_CONFIG` env-var override or an explicit-path
   `load_config(path=...)` silently redirected metrics to the chosen
   config's directory. The spec required co-location ONLY for
   workspace-discovered configs; env-var and explicit-path overrides
   must keep the bundled-default metrics location unless
   `AI_ROUTER_METRICS_PATH` is also set. The two env vars are
   independent — that property was lost.
2. **Minor** — `test_find_workspace_config_returns_none_when_no_ancestor_has_it`
   accepted "any discovered config outside tmp_path" rather than
   deterministically asserting `None`. The miss-path contract was
   under-tested.

## Round 2 fixes

### Major fix — gate metrics co-location on the workspace source

`config.py` now exposes a tagged resolver
`_resolve_config_path_and_source()` that returns
`(path, source)` where `source` is one of:

```python
CONFIG_SOURCE_EXPLICIT          = "explicit"
CONFIG_SOURCE_ENV               = "env"
CONFIG_SOURCE_WORKSPACE         = "workspace"
CONFIG_SOURCE_BUNDLED_DEFAULT   = "bundled-default"
```

`load_config()` consumes the source tag and stashes
`config["_metrics_base_dir"]` ONLY when `source == "workspace"`.
`config["_config_path"]` and `config["_config_source"]` are still
set unconditionally for diagnostics, but `_log_path` no longer reads
`_config_path` — it reads `_metrics_base_dir`, which is gated.

```python
# config.py — load_config() tail
config["_config_path"] = str(config_path.resolve())
config["_config_source"] = config_source
if config_source == CONFIG_SOURCE_WORKSPACE:
    config["_metrics_base_dir"] = str(config_path.resolve().parent)

return config
```

```python
# metrics.py — _log_path()
override = os.environ.get("AI_ROUTER_METRICS_PATH")
if override:
    return Path(override)

base_dir = config.get("_metrics_base_dir")     # ← was config["_config_path"]
if base_dir:
    return Path(base_dir) / filename

return _THIS_DIR / filename
```

The thin wrapper `_resolve_config_path()` is preserved for callers
that don't care about the source tag — same single-string return
shape as in round 1, now implemented as a 1-line wrapper around the
tagged helper.

### Minor fix — deterministic miss-path test

`test_find_workspace_config_returns_none_when_no_ancestor_has_it`
now monkeypatches the relpath constant to a uniquely-named file:

```python
unique_relpath = Path("ai_router") / f"missing-{uuid.uuid4().hex}.yaml"
monkeypatch.setattr(config_mod, "_WORKSPACE_CONFIG_RELPATH", unique_relpath)
leaf = tmp_path / "deep" / "deeper"
leaf.mkdir(parents=True)
found = config_mod._find_workspace_config(start=leaf)
assert found is None
```

The walk now deterministically traverses every ancestor up to the
filesystem root and returns `None` — no real ancestor will have a
file matching the random uuid suffix.

### New integration tests through `load_config()`

`test_metrics.py` now includes four end-to-end tests using a minimal
yaml fixture (`providers: {}`, `models: {}`, `routing.tier_assignments: {}`)
that exercise `load_config()` for each of the four sources and assert
the correct `_metrics_base_dir` behavior + the `_log_path` that
results:

- `test_load_config_sets_metrics_base_dir_only_when_workspace_resolved`
  — workspace branch: `_metrics_base_dir` IS set; `_log_path` →
  workspace dir.
- `test_load_config_does_not_set_metrics_base_dir_for_env_override`
  — env-var branch: workspace fixture exists, env var points
  elsewhere, `_metrics_base_dir` is NOT set, `_log_path` → bundled
  default. **This is the test the round-1 verifier specifically
  asked for.**
- `test_load_config_does_not_set_metrics_base_dir_for_explicit_path`
  — explicit path: `_metrics_base_dir` not set, `_log_path` →
  bundled default.
- `test_load_config_does_not_set_metrics_base_dir_for_bundled_default`
  — bundled default: `_metrics_base_dir` not set, `_log_path` →
  bundled default.

Plus a unit test in `test_metrics.py` that pins the no-spillover
property at the `_log_path` level:

```python
def test_log_path_falls_back_to_bundled_default_without_base_dir(monkeypatch):
    # Even with _config_path on the dict, no _metrics_base_dir → bundled default.
    config = {"_config_path": "/some/non-workspace/config.yaml"}
    expected = metrics_mod._THIS_DIR / "router-metrics.jsonl"
    assert metrics_mod._log_path(config).resolve() == expected.resolve()
```

### Test counts

Round 1: 14 new tests (9 in test_config.py, 5 in test_metrics.py),
all passing.
Round 2: **18 new tests** (10 in test_config.py, 8 in test_metrics.py),
all passing. Net gain: +4 integration tests + 1 thin-wrapper test,
1 stricter miss-path test.

Full pytest: 692 passed, 2 pre-existing daemon-spawn-race failures
(unchanged from round 1; confirmed pre-existing on master).

## Final diff (round 2 vs. round 1)

### `ai_router/config.py`

```diff
+CONFIG_SOURCE_EXPLICIT = "explicit"
+CONFIG_SOURCE_ENV = "env"
+CONFIG_SOURCE_WORKSPACE = "workspace"
+CONFIG_SOURCE_BUNDLED_DEFAULT = "bundled-default"
+
+
+def _resolve_config_path_and_source(
+    path: str | None = None,
+) -> tuple[str, str]:
+    """Return ``(resolved_path, source)`` ..."""
+    if path is not None:
+        return path, CONFIG_SOURCE_EXPLICIT
+    env_override = os.environ.get("AI_ROUTER_CONFIG")
+    if env_override:
+        return env_override, CONFIG_SOURCE_ENV
+    workspace = _find_workspace_config()
+    if workspace is not None:
+        return str(workspace), CONFIG_SOURCE_WORKSPACE
+    return str(_THIS_DIR / "router-config.yaml"), CONFIG_SOURCE_BUNDLED_DEFAULT


 def _resolve_config_path(path: str | None = None) -> str:
-    if path is not None:
-        return path
-    env_override = os.environ.get("AI_ROUTER_CONFIG")
-    if env_override:
-        return env_override
-    workspace = _find_workspace_config()
-    if workspace is not None:
-        return str(workspace)
-    return str(_THIS_DIR / "router-config.yaml")
+    """Backward-compatible thin wrapper returning just the resolved path."""
+    resolved, _ = _resolve_config_path_and_source(path)
+    return resolved


 def load_config(path: str | None = None) -> dict:
-    path = _resolve_config_path(path)
+    path, config_source = _resolve_config_path_and_source(path)
     config_path = Path(path)
     ...
-    config["_config_path"] = str(config_path.resolve())
+    config["_config_path"] = str(config_path.resolve())
+    config["_config_source"] = config_source
+    if config_source == CONFIG_SOURCE_WORKSPACE:
+        config["_metrics_base_dir"] = str(config_path.resolve().parent)

     return config
```

### `ai_router/metrics.py`

```diff
-    config_path = config.get("_config_path")
-    if config_path:
-        return Path(config_path).parent / filename
+    base_dir = config.get("_metrics_base_dir")
+    if base_dir:
+        return Path(base_dir) / filename
```

(Plus the docstring update describing the gating.)

### Test files

`test_config.py` — round 1's 9 tests + 1 new test for the thin
wrapper. Miss-path test now uses a uuid-suffixed relpath constant
to deterministically force `None`. Resolve tests now also assert
the source tag.

`test_metrics.py` — rewritten: 4 direct `_log_path` tests + 4 new
integration tests via real `load_config()` calls with a minimal
yaml fixture.

## Verification request (round 2)

Please re-evaluate against the round 1 issues:

1. **Major (gating).** Is the metrics co-location now correctly
   restricted to workspace-discovery? Specifically: does setting
   `AI_ROUTER_CONFIG` to a non-workspace path produce metrics at
   the bundled default, with `_metrics_base_dir` absent from the
   config dict? (Confirmed in
   `test_load_config_does_not_set_metrics_base_dir_for_env_override`.)
   Does an explicit `load_config(path=...)` produce the same?
   (Confirmed in
   `test_load_config_does_not_set_metrics_base_dir_for_explicit_path`.)

2. **Minor (deterministic miss).** Does the new uuid-relpath approach
   make the miss-path assertion robust? Are there host-environment
   conditions under which the test could still flake?

3. **Regressions.** Did the round-2 diff introduce anything else
   worth flagging? In particular: the `_config_source` key added to
   the returned config dict — is that name future-proof, or should
   it be namespaced (e.g., `_router_config_source`) to avoid
   collisions with operator-supplied yaml keys someday?

4. **Anything else.** Anything else missed in round 1, or new issues
   introduced by the round-2 changes.

Respond with the structured JSON from
`ai_router/prompt-templates/verification.md`.
