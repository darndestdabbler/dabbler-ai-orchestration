ISSUES FOUND

- **Issue 1:** `testing.selection.rules` does not cover `tests/test_critique_contracts.py` for direct `ai_router.evidence` and `ai_router.ledger` dependencies.
  - **Category:** Completeness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/router-config.yaml:594`, `ai_router/router-config.yaml:615`, `tests/test_critique_contracts.py:26`
  - **Failure scenario:** A typical change to `ai_router/evidence.py` or `ai_router/ledger.py` that breaks critique artifact recording/validation will be treated as mapped, but the targeted preverify command will omit `tests/test_critique_contracts.py`, even though that test file directly imports and exercises both modules.
  - **Acceptance criterion:** `python -c "exec(\"from pathlib import Path\\ntext = Path('ai_router/router-config.yaml').read_text(encoding='utf-8')\\ndef block(start_marker, end_marker):\\n    start = text.index(start_marker)\\n    end = text.index(end_marker, start)\\n    return text[start:end]\\nok = all('tests/test_critique_contracts.py' in block(start, end) for start, end in [('      - when: ai_router/evidence.py', '      - when: ai_router/facts.py'), ('      - when: ai_router/ledger.py', '      - when: ai_router/metrics.py')])\\nraise SystemExit(0 if ok else 1)\")"`
  - **Acceptance expectation:** exit 0
  - **Details:** Violation: the task required declaring this repository’s mapping under `testing.selection.rules`, “covering what the graph used to infer.” Impact: the selector’s declared mapping is incomplete for existing direct tests, so affected-test evidence can miss a real suite for common evidence/ledger changes. Evidence: `tests/test_critique_contracts.py` imports `evidence` and `ledger`, while the corresponding config rules omit that test.