ISSUES FOUND

- **Issue 1:** `assert files` on a `Path.rglob()` iterator is accepted as a non-empty corpus proof even though iterator truthiness is always true.
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/corpus_scan_guard.py:240`, `ai_router/corpus_scan_guard.py:272`, `ai_router/tests/test_corpus_scan_guard.py:46`
  - **Failure scenario:** A typical future lint uses `files = ROOT.rglob("*.py")`, adds `assert files` to satisfy this new guard, then asserts no offenders. CI passes even if the glob would yield nothing, because the guard treats the iterator object’s truthiness as proof that the corpus is non-empty.
  - **Acceptance criterion:** `python -c "exec('import importlib.util, pathlib, sys, tempfile\nspec = importlib.util.spec_from_file_location(\"guard\", \"ai_router/corpus_scan_guard.py\")\nguard = importlib.util.module_from_spec(spec)\nsys.modules[spec.name] = guard\nspec.loader.exec_module(guard)\nwith tempfile.TemporaryDirectory() as d:\n    path = pathlib.Path(d) / \"test_lazy_iterator_assert.py\"\n    path.write_text(\"from pathlib import Path\\nROOT = Path(__file__).resolve().parent\\ndef test_scan():\\n    files = ROOT.rglob(\\\"*.py\\\")\\n    assert files\\n    offenders = [p for p in files if False]\\n    assert not offenders\\n\", encoding=\"utf-8\")\n    offenders = guard.offenders_in_module(path)\n    raise SystemExit(0 if offenders else 1)')"`
  - **Acceptance expectation:** exit 0
  - **Details:** Violation: the session promised to encode “Assert the INPUT SET is non-empty.” Impact: the shipped gate can certify a vacuous assertion, so the core encoded lesson can still regress on the common iterator form. Evidence: `_corpus_variables()` marks a direct `rglob()` assignment as corpus-derived, and `_asserts_non_empty()` accepts a bare `ast.Name` assertion without proving the name is a materialized collection.

- **Issue 2:** Repo scans rooted in a local `Path(__file__)` assignment are not detected at all.
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/corpus_scan_guard.py:122`, `ai_router/corpus_scan_guard.py:145`, `ai_router/tests/test_corpus_scan_guard.py:153`
  - **Failure scenario:** A maintainer writes the idiomatic local form `root = Path(__file__).resolve().parent` inside a new `test_*` gate and scans `root.rglob(...)` with only `assert not offenders`. The new guard does not mark `root` as a repo path, so the silent corpus scan is invisible and CI stays green.
  - **Acceptance criterion:** `python -c "exec('import importlib.util, pathlib, sys, tempfile\nspec = importlib.util.spec_from_file_location(\"guard\", \"ai_router/corpus_scan_guard.py\")\nguard = importlib.util.module_from_spec(spec)\nsys.modules[spec.name] = guard\nspec.loader.exec_module(guard)\nwith tempfile.TemporaryDirectory() as d:\n    path = pathlib.Path(d) / \"test_local_root.py\"\n    path.write_text(\"from pathlib import Path\\ndef test_scan():\\n    root = Path(__file__).resolve().parent\\n    offenders = [p for p in root.rglob(\\\"*.py\\\") if False]\\n    assert not offenders\\n\", encoding=\"utf-8\")\n    offenders = guard.offenders_in_module(path)\n    raise SystemExit(0 if offenders else 1)')"`
  - **Acceptance expectation:** exit 0
  - **Details:** Violation: the decision journal says corpus scans are recognizable as `rglob/glob/walk over a repo path`. Impact: a common repo-root spelling bypasses the new enforcement entirely. Evidence: `_repo_path_names()` only grows from module constants or provider-function calls; it never treats a local assignment containing `__file__` as a repo root.

- **Issue 3:** Helper detection is not transitive, so a test that calls a scanner helper through one wrapper bypasses the guard.
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/corpus_scan_guard.py:333`, `ai_router/corpus_scan_guard.py:353`, `ai_router/tests/test_no_legacy_field_reads.py:102`
  - **Failure scenario:** A typical lint structure uses `_sources()` for the corpus, `_scan_for_violations()` for filtering, and `test_no_violations()` only calls `_scan_for_violations()`. If the test omits a direct non-empty corpus assertion, the guard sees no scan because only the first helper is self-rooted.
  - **Acceptance criterion:** `python -c "exec('import importlib.util, pathlib, sys, tempfile\nspec = importlib.util.spec_from_file_location(\"guard\", \"ai_router/corpus_scan_guard.py\")\nguard = importlib.util.module_from_spec(spec)\nsys.modules[spec.name] = guard\nspec.loader.exec_module(guard)\nwith tempfile.TemporaryDirectory() as d:\n    path = pathlib.Path(d) / \"test_layered_helper.py\"\n    path.write_text(\"from pathlib import Path\\nROOT = Path(__file__).resolve().parent\\ndef _sources():\\n    return list(ROOT.rglob(\\\"*.py\\\"))\\ndef _violations():\\n    return [p for p in _sources() if False]\\ndef test_scan():\\n    offenders = _violations()\\n    assert not offenders\\n\", encoding=\"utf-8\")\n    offenders = guard.offenders_in_module(path)\n    raise SystemExit(0 if offenders else 1)')"`
  - **Acceptance expectation:** exit 0
  - **Details:** Violation: the new module claims to find scans “directly or through a module helper.” Impact: the canonical helper-wrapper shape can still pass having examined nothing, materially weakening the encoded check. Evidence: `self_rooted` is computed only from helpers that directly walk a tree; wrapper helpers that call those helpers are not promoted before test-call detection.

NITS

- **Nit:** `_asserts_non_empty()` also accepts comparisons such as `len(corpus) >= 0` or `len(corpus) != 999` because it checks only that the comparator is an integer, not that the comparison logically implies non-emptiness.