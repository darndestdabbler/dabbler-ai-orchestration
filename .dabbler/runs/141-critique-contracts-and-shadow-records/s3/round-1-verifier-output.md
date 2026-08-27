ISSUES FOUND

- **Issue 1:** Python call-site quote provenance is optional, so a string literal can still satisfy a quote-only call-site contract.
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/evidence.py:527-596`, `ai_router/schemas/worker-results.schema.json:41-66`, `tests/fixtures/critique-roundtrip/widget.py:1-16`, `tests/fixtures/critique-roundtrip/checks.json:1-30`
  - **Failure scenario:** The seeded `no-shell-out` check asks whether `os.system` is called, and the fixture deliberately contains `os.system(cmd)` inside `HELP`. A worker can submit a `fail` row with a valid path/span/hash for that string and omit `ast_kind`; the schema allows that, and `verify_quote` only rejects AST mismatches when `ast_kind` is declared. This is probable because the fixture contains exactly that bait and the check’s fail evidence requires only `quote`.
  - **Acceptance criterion:** `JUDGMENT - For a call-site contract such as Call:os.system, a quote from a Python string/docstring is refused before append even when its path/span/hash are valid and the worker omits ast_kind.`
  - **Details:** **Violation:** “Where a supported parser exists, also check the AST kind at that location, so a string literal containing code-like text cannot satisfy a call-site contract.” **Impact:** The framework can record a false fail against the seeded shell-out check, defeating the core provenance guarantee. **Evidence:** `ast_kind` is optional in the stored schema, `verify_quote` only checks `declared_kind is not None`, and the fixture/check pair has a quote-only fail path over a file containing string-literal `os.system(cmd)`.

- **Issue 2:** A prior out-of-reach `blocked` result can still be converted into `pass` on a later attempt.
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/evidence.py:839-856`, `ai_router/ledger.py:606-632`, `tests/test_critique_contracts.py:240-288`
  - **Failure scenario:** A worker records `blocked` for `authorized-pulls-insufficient`, then records `pass` for the same check on attempt 2 with any framework-reexecuted evidence. The implementation explicitly allows this, and the test asserts the ledger becomes `["blocked", "pass"]`; that is the normal helper path, not an adversarial file edit.
  - **Acceptance criterion:** `JUDGMENT - Once a check has an out-of-reach blocked result, the code structurally prevents a later pass from discharging it merely by carrying quote or absence-search evidence; the encoded ladder/adjudication path must be the only exit.`
  - **Details:** **Violation:** “A `blocked` result may never be converted to `pass` because the worker ran out of context or tools — that conversion must be structurally impossible.” **Impact:** A blocked absence claim can be laundered into a pass without manager/human adjudication, changing whether reviewers should trust the result. **Evidence:** `verify_worker_result` refuses only when `stuck and not (quotes or searches)`, and the added test records a later pass with `absence_searches` after `authorized-pulls-insufficient`.