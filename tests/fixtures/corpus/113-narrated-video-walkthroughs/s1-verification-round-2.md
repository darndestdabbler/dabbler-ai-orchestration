ISSUES FOUND

- **Issue 1: The Python validator accepts `reviewers: null` for abstained methods while the JSON schema rejects it**
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/disposition.py`, `ai_router/schemas/disposition.schema.json`
  - **Failure scenario:** A consumer’s serializer emits nullable optional fields and produces a valid-looking abstention such as `{"component":"Work Explorer","method":"none","attestation":"No reviewer available","reviewers":null}`. This is probable for generated models and serializers, particularly during this breaking migration. `validate_disposition()` accepts it because `entry.get("reviewers")` is falsy, while the JSON schema rejects it because `reviewers` must be an array. Router validation and schema-based CI/editor validation therefore give contradictory outcomes for the same disposition.
  - **Acceptance criterion:** `JUDGMENT - Does validate_disposition() reject an abstained UAT component carrying reviewers: null, matching disposition.schema.json, while both paths continue to accept an omitted reviewers field and any intentionally supported empty-list form?`
  - **Details:** **Violation:** the stated parity requirement is that there must not be “a shape the validator accepts that the JSON schema rejects, or vice versa.” **Impact:** consumer repositories using nullable generated fields can pass router validation but fail schema validation, making the documented breaking migration unreliable across supported validation paths and changing the merge decision for a public schema change. **Evidence:** `_validate_uat_component()` only rejects abstained reviewers when `entry.get("reviewers")` is truthy, so `null`, `false`, `0`, and other falsy non-list values pass. The schema’s base `reviewers` property requires `"type": "array"`, so those same values fail. The Python check must be presence- and type-aware rather than truthiness-based.

### NITS

- **Nit:** Relative evidence links containing fragments or queries are checked as literal filesystem names. For example, `walk.md#step-2` fails even when `walk.md` exists because `_missing_evidence()` does not strip the URL fragment. This is recoverable by recording the bare path, but conflicts with the documented support for evidence “links.” Location: `ai_router/gate_checks.py`.
