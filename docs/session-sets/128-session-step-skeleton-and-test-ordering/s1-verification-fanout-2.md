ISSUES FOUND

- **Issue 1:** Full-suite intent misses common “all tests” wording, so a compressed full-suite + verification instruction can pass.
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/spec_admission.py:186`, `ai_router/spec_admission.py:312`, `ai_router/tests/test_spec_admission_shape.py:108`, `docs/session-sets/128-session-step-skeleton-and-test-ordering/spec.md:149`
  - **Failure scenario:** A future unstarted spec writes the verification tail step as “Run all tests, then verify with a different provider,” followed by the normal full-suite and close-out tail steps. “All tests” is probable AI/operator prose for the full-suite obligation, but `_INTENT_RE[FULL_SUITE]` does not recognize it, so `check_step_shape()` sees only verification and emits no compression finding.
  - **Acceptance criterion:** `python -c "exec('import importlib.util\nimport sys\nspec = importlib.util.spec_from_file_location(\"sa\", \"ai_router/spec_admission.py\")\nsa = importlib.util.module_from_spec(spec)\nsys.modules[\"sa\"] = sa\nspec.loader.exec_module(sa)\nplan = sa.SessionPlan(1, \"x\", 5, (\"Register.\", \"Work.\", \"Run all tests, then verify with a different provider.\", \"Required portion of the full test suite.\", \"Close-out.\"))\nraise SystemExit(0 if sa.check_step_shape(plan) else 1)')"`
  - **Acceptance expectation:** exit 0
  - **Details:** Violation: the spec says “A spec must never again be able to declare a step that compresses verification and the full suite into one instruction, in any order.” Impact: this recreates the stale expensive-suite failure the set exists to prevent, with a false all-clear from the checker. Evidence: the full-suite regex covers “full … suite,” “full pytest/playwright/test,” “required portion,” and “runs of record,” but not “all tests”; the compression logic only fires when both intents are recognized.

- **Issue 2:** `resolve_set_status()` ignores the repo’s canonical status aliases and can block already-started/complete sets as “unstarted.”
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/spec_admission.py:341`, `ai_router/spec_admission.py:385`, `ai_router/progress.py:92`, `docs/session-state-schema.md:76`
  - **Failure scenario:** A historical or consumer-repo set has `session-state.json` with top-level `status: "completed"` or `"done"`—aliases the repo explicitly canonicalizes on read because this drift has happened before. The new checker returns that raw string, `set_started` is false, and an old non-skeleton spec becomes `REQUIRES RESTRUCTURING` instead of the ratified informational note.
  - **Acceptance criterion:** `python -c "exec('import importlib.util\nimport json\nimport pathlib\nimport sys\nimport tempfile\nspec = importlib.util.spec_from_file_location(\"sa\", \"ai_router/spec_admission.py\")\nsa = importlib.util.module_from_spec(spec)\nsys.modules[\"sa\"] = sa\nspec.loader.exec_module(sa)\nwith tempfile.TemporaryDirectory() as d:\n    root = pathlib.Path(d)\n    (root / \"spec.md\").write_text(\"# X\\n\\n## Sessions\\n\\n### Session 1 of 1: X\\n\\n1. Register.\\n2. Do work.\\n3. Close-out.\\n\", encoding=\"utf-8\")\n    (root / \"session-state.json\").write_text(json.dumps({\"schemaVersion\": 4, \"status\": \"completed\"}), encoding=\"utf-8\")\n    result = sa.check_spec(str(root / \"spec.md\"), max_steps=7)\n    raise SystemExit(0 if result.set_started and result.passed else 1)')"`
  - **Acceptance expectation:** exit 0
  - **Details:** Violation: the ratified behavior is “an informational note for every set already started, complete, or cancelled,” while the reader contract canonicalizes `completed`/`done` to `complete`. Impact: a corpus sweep can produce blocking restructuring findings against already-finished sets, overturning the operator’s ruling. Evidence: `resolve_set_status()` returns any string verbatim, while `set_started` accepts only exact canonical tokens.

**NITS**

- **Nit:** `--check` help still says it exits non-zero only for over-cap sessions, but it now gates shape too (`ai_router/spec_admission.py:686`).
- **Nit:** `_completion_of()`’s comment still says bookkeeping records render as rows and break the start-time chain, contradicting the Set 128 behavior that removes them from rendered rows (`ai_router/session_checklist.py:471`).