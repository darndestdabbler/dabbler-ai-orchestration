**ISSUES FOUND**

- **Issue 1:** Hand-written valid plans can still be approved because the sanctioned-write ledger is optional on read.
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/approved_plan.py:157`, `ai_router/approved_plan.py:250`, `ai_router/approved_plan.py:276`, `ai_router/schemas/approved-plan.schema.json:70`
  - **Failure scenario:** A user or supervisor writes a schema-valid `approved-plan.json` directly with `risk_flags: []` for a step touching `ai_router/session.py`, then calls `approve_plan`. Because `approved-plan-writes.jsonl` is absent, `_last_recorded_write_hash` returns `None`, `read_plan` skips the sanctioned-write check, and `approve_plan` permanently records the caller-declared low-risk plan. This is probable because any hand-created or copied plan naturally has no ledger, and the task explicitly calls out hand-written plans as a case that must fail closed.
  - **Acceptance criterion:** `JUDGMENT - read_plan/approve_plan must refuse any existing approved-plan.json whose current full-content hash is not backed by a sanctioned write record, including absent, unreadable, or empty write ledgers, before approval can proceed.`
  - **Details:** **Violation:** “Hand-written or malformed plans fail closed” and “A supervisor does not declare its own risk.” **Impact:** the machine-owned artifact guarantee and risk-routing guarantee can both be bypassed, which changes the merge decision for this core session deliverable. **Evidence:** `_last_recorded_write_hash` returns `None` on ledger read failure, `read_plan` only checks the full-content hash when a ledger hash is present, and `approve_plan` then approves whatever schema-valid risk flags were already in the file.

- **Issue 2:** Malformed slug-like markers are still treated as no slug unless they match the exact `(slug: ...)` shape.
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/session.py:247`, `ai_router/session.py:265`, `ai_router/writers.py:429`
  - **Failure scenario:** A spec author writes `1. Define schema. (slug plan-schema)` or another trailing slug-like typo. `_SLUG_MARKER_RE` does not match, so `split_slug_marker` returns `(text, None)` and `seed_session_plan` falls back to `plan_step_key`; the intended slug is silently ignored and the activity-log key no longer matches the authored identity. This is probable because marker typos are exactly the malformed-slug case the prior finding described.
  - **Acceptance criterion:** `JUDGMENT - the spec parsing/write path must reject trailing slug-like parentheticals that are not a valid literal (slug: [a-z0-9-]+) marker instead of silently falling back to a generated key.`
  - **Details:** **Violation:** authored slugs must be “refused at write time like every other malformed field.” **Impact:** the one identity promised across `spec.md`, `activity-log.json`, and plan `step_id` is broken by a common typo. **Evidence:** the regex only recognizes `"(slug:"`; anything else beginning with `slug` in the trailing parenthetical is handled as no marker and falls into fallback key generation.