ISSUES FOUND

- **Issue 1:** Valid indentationless YAML sequences are parsed as an empty inventory, allowing declared components to close with no records.
  - **Category:** Correctness
  - **Severity:** Critical
  - **Evidence paths:** `ai_router/spec_config.py`, `ai_router/gate_checks.py`, `ai_router/tests/test_set113_uat_accounting.py`
  - **Failure scenario:** A consumer or YAML formatter writes the valid YAML form `uatComponents:\n- Work Explorer\n- Static index`. `_parse_uat_components()` stops because each item’s indentation is equal to the key’s indentation and returns `()`. The gate then treats the inventory as explicitly empty, and the documented empty `disposition.uat.components` accounting passes. Indentationless sequences are common output from YAML tooling, so this is a probable real authoring shape, not an adversarial edge case.
  - **Acceptance criterion:** `python -c "exec(\"import runpy\\nm = runpy.run_path('ai_router/spec_config.py')\\nassert m['_parse_uat_components']('uatComponents:\\n- Work Explorer\\n- Static index\\n') == ('Work Explorer', 'Static index')\")"`
  - **Acceptance expectation:** exit 0
  - **Details:** **Violation:** “Every declared in-scope component must carry a record” and “a session cannot close having silently ignored a component.” **Impact:** The central inventory boundary fails open: two declared components become an empty inventory and can close with no component records, directly defeating the session objective. **Evidence:** `_parse_uat_components()` breaks when item indentation is `<= key_indent`; `check_uat_walk_recorded()` explicitly accepts an empty inventory paired with an empty accounting. The parser must recognize YAML’s legal indentationless sequence form or explicitly reject it rather than converting it to `()`.

- **Issue 2:** The documented `uatComponents` example is misparsed because trailing YAML comments become part of component names.
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/spec_config.py`, `ai_router/gate_checks.py`, `docs/planning/session-set-authoring-guide.md`
  - **Failure scenario:** An author copies the guide’s configuration, including `- Work Explorer tree   # in-scope components...`, then records component `"Work Explorer tree"` as shown by the prose. `_LIST_ITEM_RE` retains the comment in the inventory value, so the gate reports the clean component as missing/extra and blocks close. This is probable because the repository’s canonical authoring example itself uses trailing comments.
  - **Acceptance criterion:** `python -c "exec(\"import runpy\\nm = runpy.run_path('ai_router/spec_config.py')\\nassert m['_parse_uat_components']('uatComponents:\\n  - Work Explorer tree # human-observable surface\\n') == ('Work Explorer tree',)\")"`
  - **Acceptance expectation:** exit 0
  - **Details:** **Violation:** The parser claims to support a hand-written YAML block inventory, while the authoring guide presents trailing comments as valid usage. **Impact:** Following the official migration guidance produces an unsatisfiable or misleading inventory and blocks a typical consumer at close. **Evidence:** `_LIST_ITEM_RE` captures the complete remainder of the list-item line and `_strip_quotes()` does not remove YAML comments, while the guide places comments directly after both example values. Comments must be stripped outside quoted scalars, or the guide must use syntax the parser actually supports.

- **Issue 3:** The Python validator accepts unknown top-level `uat` fields that the JSON schema rejects.
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/disposition.py`, `ai_router/schemas/disposition.schema.json`, `docs/disposition-schema.md`
  - **Failure scenario:** A consumer migrating from Set 111 leaves `walkArtifact` at the `uat` top level after adding the new component accounting, or adds a session-wide `confidence` field. `validate_disposition()` accepts the block, while `disposition.schema.json` rejects it under `additionalProperties: false`. Stale `walkArtifact` is a probable migration residue for this explicitly breaking release, so users of the router validator and users of the published schema receive contradictory answers.
  - **Acceptance criterion:** `python -c "exec(\"import runpy\\nm = runpy.run_path('ai_router/disposition.py')\\nerrors = m['_validate_uat_block']({'attestation': 'a', 'components': [], 'confidence': 0.8})\\nassert errors\")"`
  - **Acceptance expectation:** exit 0
  - **Details:** **Violation:** The work promises a facts-only record and validator/schema parity; the schema closes the top-level object to `attestation` and `components`. **Impact:** Forbidden metadata can pass the router’s Python validation while failing schema-based tooling, and a confidence score can still be recorded one level above the closed component object. **Evidence:** `_validate_uat_block()` special-cases `status` but never checks the remaining top-level key set, whereas the schema sets `additionalProperties: false`. The Python validator must reject every unknown top-level `uat` key, retaining the tailored migration message for `status`.

## NITS

- **Nit:** `ai_router/disposition.py` accepts falsey malformed `reviewers` values such as `null`, `""`, `{}`, or `0` for `none`/`not-applicable` because it only checks `if entry.get("reviewers")`; `ai_router/schemas/disposition.schema.json` rejects them as non-arrays. Validate the field’s type whenever it is present.

- **Nit:** The schema accepts whitespace-only `uat.attestation`, component names, and abstention attestations through `minLength: 1`, while `validate_disposition()` strips and rejects them. This is another validator/schema parity mismatch, though it primarily affects malformed input.

- **Nit:** Duplicate component names are rejected by `validate_disposition()` but accepted by the JSON schema. If this remains validator-only because JSON Schema cannot express uniqueness by one property, document that asymmetry as is already done for analogous cost validation.

- **Nit:** `ai_router/gate_checks.py` skips existence checks for every evidence path containing whitespace. A missing local path such as `walk files/demo.mp4` therefore passes despite the documentation’s claim that path-shaped evidence is checked.

- **Nit:** The flow-sequence parser in `ai_router/spec_config.py` splits blindly on commas and treats `#` as a comment without respecting quotes. Valid YAML such as `uatComponents: ["Search, filters"]` or a quoted component containing `#` is misread and causes close refusals.

- **Nit:** The mid-set edit to `spec.md` directly conflicts with the quoted constitutional rule that “the spec’s configuration block, as captured at set start, is immutable at runtime.” The amendment is visible and precedes the affected sessions, limiting immediate impact, but the AI-authored reinterpretation that immutability protects only arming flags is not supported by the quoted rule and weakens the premise that inventory is independent of close-time records.

- **Nit:** `decisions.jsonl` asserts that “the AI-authority attempt above was refused,” but no durable refusal evidence or corresponding test is included in the presented work. The successful human-authority journal entry exists, but the separate plan obligation to confirm AI-authority refusal is supported only by assertion.

- **Nit:** `s1-conventions.md` claims the changelog contains worked “before/after JSON,” but the fragment contains only the new JSON shape plus prose describing the former shape; it has no explicit old-shape JSON example.