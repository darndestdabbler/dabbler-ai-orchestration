ISSUES FOUND

- **Issue 1:** Node detection still emits `npm test` for npm’s standard intentionally failing placeholder script.
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/bootstrap.py, tests/test_bootstrap.py`
  - **Failure scenario:** A repository initialized with the common npm default `"test": "echo \"Error: no test specified\" && exit 1"` is bootstrapped. `_detect_node` accepts every nonblank string, generates an `npm test` suite, and creates a standing failure that blocks verification. This is probable because that placeholder is a standard `npm init` artifact and is common in starter or partially configured repositories.
  - **Acceptance criterion:** JUDGMENT - For a root `package.json` containing npm’s standard intentionally failing test placeholder, Node ecosystem detection must omit the suite, with a regression test demonstrating that no `npm test` command is scaffolded.
  - **Details:** **Violation:** The remediation itself states, “A generated suite whose command exits non-zero on the first run is worse than no suite,” while the prior finding specifically covered a `package.json` “without a working `test` script.” **Impact:** Such repositories receive a known-broken generated suite, materially defeating bootstrap’s objective and blocking the lifecycle until an operator repairs generated configuration; this should prevent merge of the remediation. **Evidence:** `_detect_node` checks only that `scripts.test` is a nonblank string, so the canonical `echo ... && exit 1` placeholder passes. `tests/test_bootstrap.py` covers only an absent test script and does not exercise the standard failing placeholder. The detector must reject known placeholder scripts rather than treating them as runnable tests.

**Resolved prior finding:** `ai_router/progress.py` now reports an invariant violation when the ledger exists but cannot be parsed, and `tests/test_progress.py` verifies that the fault is surfaced.

## NITS

- **Nit:** `_detect_node` assumes every truthy `scripts` value is a mapping. A syntactically valid but schema-invalid manifest such as `"scripts": []` or `"scripts": "test"` raises `AttributeError` and aborts bootstrap instead of yielding no detected Node suite.