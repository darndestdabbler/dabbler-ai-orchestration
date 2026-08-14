ISSUES FOUND

Fix verdict: L1 helper-chain transitivity -- fix-accepted  
Fix verdict: L2 lazy `Path.rglob()` truthiness -- fix-rejected  
Fix verdict: L3 local `Path(__file__)` root detection -- fix-accepted  
Fix verdict: L4 -- duplicate-of L1  
Fix verdict: L5 fixture-injected repo corpus detection -- fix-accepted

**Issue 1:** Lazy repo corpuses are still accepted when the lazy walk is returned through a helper.
- **Category:** Correctness
- **Severity:** Major
- **Evidence paths:** `ai_router/corpus_scan_guard.py:232-254`, `ai_router/corpus_scan_guard.py:257-332`, `ai_router/corpus_scan_guard.py:335-381`
- **Failure scenario:** A typical lint factors its corpus into `_sources(): return ROOT.rglob("*.py")`, then the test does `files = _sources(); assert files; offenders = [...] ; assert not offenders`. Helper-returned corpuses are an explicitly supported/common shape in this guard, and `Path.rglob()` is the normal lazy API, so this is probable rather than adversarial. The guard marks `_sources()` as a corpus helper but does not propagate that its return value is lazy, so `assert files` is accepted even though it proves nothing.
- **Acceptance criterion:** `python -c "exec('import importlib.util\nimport pathlib\nimport sys\nimport tempfile\nspec = importlib.util.spec_from_file_location(\"guard\", \"ai_router/corpus_scan_guard.py\")\nguard = importlib.util.module_from_spec(spec)\nsys.modules[spec.name] = guard\nspec.loader.exec_module(guard)\nsource = chr(10).join([\n    \"from pathlib import Path\",\n    \"ROOT = Path(__file__).resolve().parent\",\n    \"def _sources():\",\n    \"    return ROOT.rglob(\\\"*.py\\\")\",\n    \"def test_scan():\",\n    \"    files = _sources()\",\n    \"    assert files\",\n    \"    offenders = [p for p in files if \\\"bad\\\" in p.name]\",\n    \"    assert not offenders\",\n    \"\",\n])\nwith tempfile.TemporaryDirectory() as d:\n    path = pathlib.Path(d) / \"test_lazy_helper.py\"\n    path.write_text(source, encoding=\"utf-8\")\n    raise SystemExit(0 if guard.offenders_in_module(path) else 1)')"`
- **Acceptance expectation:** exit 0
- **Details:** Violation: the fix’s own contract says “Only a materialized corpus can be asserted by bare truthiness,” but `_corpus_variables()` sets `is_lazy = _is_lazy_walk(value)` only on the immediate RHS. `_is_lazy_walk(_sources())` returns false, so the returned `ROOT.rglob()` iterator becomes a “solid” corpus name and `_asserts_non_empty()` accepts bare `assert files`. Impact: this preserves the L2 false negative for the common helper form, so a reasonable reviewer should not merge the remediation as complete. Evidence: helper calls derive corpus names at `ai_router/corpus_scan_guard.py:313-320`, laziness is recognized only for direct path-walk expressions at `ai_router/corpus_scan_guard.py:241-249`, and bare truthiness over non-lazy-marked names is accepted at `ai_router/corpus_scan_guard.py:352-359`.