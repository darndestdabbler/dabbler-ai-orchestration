ISSUES FOUND

- **Issue 1:** Dependency scope misses common `from package import submodule` imports.
  - **Category:** Completeness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/agency.py:75-123`, `ai_router/verify.py:84`
  - **Failure scenario:** A changed file imports an unchanged sibling module via `from . import ledger` or `from ai_router import ledger`; this is probable because `ai_router/verify.py` does exactly that. The verifier is then briefed with a scope that omits a real declared dependency, so it either does not inspect needed dependency code or its legitimate read is recorded as out-of-scope.
  - **Acceptance criterion:** `python -c "exec('import importlib.util,sys\nspec=importlib.util.spec_from_file_location(\"probe_agency\", \"ai_router/agency.py\")\nagency=importlib.util.module_from_spec(spec)\nsys.modules[spec.name]=agency\nspec.loader.exec_module(agency)\ndeps=agency.declared_dependencies(\".\", [\"ai_router/verify.py\"])\nraise SystemExit(0 if \"ai_router/ledger.py\" in deps else 1)')"`
  - **Acceptance expectation:** exit 0
  - **Details:** **Violation:** the task requires scope to be “the session's changed files and what they import.” **Impact:** the read surface’s core boundary is incomplete for a normal Python import form, which changes whether a verifier can inspect and justify findings about dependency behavior. **Evidence:** `_IMPORT` and `declared_dependencies` only turn the module part before `import` into candidates; for `from . import agency, ledger`, that module part is empty, so `ai_router/ledger.py` is not added even though `verify.py` imports it.