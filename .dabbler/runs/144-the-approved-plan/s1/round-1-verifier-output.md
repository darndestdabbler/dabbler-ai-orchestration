**ISSUES FOUND**

- **Issue 1:** Plan writers accept caller-declared risk flags instead of deriving or enforcing them.
  - **Category:** Completeness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/approved_plan.py:170`, `ai_router/approved_plan.py:290`, `ai_router/schemas/approved-plan.schema.json:70`, `tests/test_approved_plan.py:19`
  - **Failure scenario:** A caller writes a step touching `ai_router/session.py` or `pyproject.toml` with `risk_flags: []`; the writer accepts it, so later review routing can treat high-risk work as low-risk. This is probable because `risk_flags` is a normal required input field and the existing happy-path test already writes `ai_router/session.py` with an empty flag list.
  - **Acceptance criterion:** `JUDGMENT - The sanctioned plan writer derives or rejects every step's risk_flags from file_envelope plus the repository manifest, so caller-supplied mismatches cannot be persisted.`
  - **Details:** **Violation:** “Derive risk flags mechanically from the file envelope and the repository manifest … A supervisor does not declare its own risk.” **Impact:** The core high-risk routing input can be understated by the plan author, changing a reasonable merge decision. **Evidence:** `write_plan` only calls `_validate_schema`; the schema only checks enum membership; `derive_risk_flags` is never applied during persistence.

- **Issue 2:** Approved-plan amendments are not actually append-only or tamper-detected.
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/approved_plan.py:111`, `ai_router/approved_plan.py:124`, `ai_router/approved_plan.py:187`, `ai_router/schemas/approved-plan.schema.json:90`
  - **Failure scenario:** After a plan has an amendment, an out-of-band edit changes or deletes that amendment. `read_plan` still succeeds because the hash excludes the entire `amendments` array. This is probable once amendments become part of the normal workflow, and it defeats the artifact’s integrity guarantee.
  - **Acceptance criterion:** `JUDGMENT - read_plan rejects an approved plan when any existing amendment is edited, deleted, reordered, or inserted except through the sanctioned append operation, while still allowing a true append.`
  - **Details:** **Violation:** “the only legal change is an appended amendment, and any edit that is not an appended amendment is detected on the next read.” **Impact:** Approval history can be silently rewritten, so the machine-owned record is not trustworthy. **Evidence:** `_CORE_FIELDS` omits `amendments`; `compute_plan_hash` hashes only those core fields; `read_plan` validates only schema plus that hash.

- **Issue 3:** Authored step slugs are not refused when malformed or duplicate.
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/session.py:247`, `ai_router/session.py:250`, `ai_router/writers.py:420`
  - **Failure scenario:** A spec author copy-pastes the same `(slug: ...)` onto two steps, or types an invalid slug marker. The writer silently renames the duplicate or falls back to generated text, so the spec slug no longer matches the activity-log step key or plan `step_id`. This is probable because slugs are new hand-authored syntax.
  - **Acceptance criterion:** `JUDGMENT - Seeded plan-row writing refuses declared duplicate or malformed session/step slug markers instead of ignoring them or synthesizing a different key.`
  - **Details:** **Violation:** “one authored slug … `[a-z0-9-]`, unique within its session, short, and refused at write time like every other malformed field.” **Impact:** The promised single identity across `spec.md`, `activity-log.json`, and `approved-plan.json` breaks. **Evidence:** `split_slug_marker` only recognizes valid-looking markers and otherwise returns `None`; `seed_session_plan` changes duplicate keys to `f"{key}-{ordinal}"` instead of refusing.