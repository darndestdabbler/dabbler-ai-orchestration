ISSUES FOUND

- **Issue 1: The adjudication prompt does not carry each finding verbatim**
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/verify.py, tests/test_verify.py`
  - **Failure scenario:** A normal blocking finding contains verifier-side evidence, locations, acceptance criteria, or other recorded fields beyond severity, description, and failure scenario. During adjudication those fields are discarded, while the disputing party’s grounds and evidence are included. The adjudicator therefore receives a materially one-sided record and may overrule a valid finding, causing the verification gate to pass incorrectly. This is probable because structured verifier findings ordinarily contain fields beyond the three selected here, and the omission occurs on every such adjudication.
  - **Acceptance criterion:** JUDGMENT - For every disputed finding, the adjudication prompt must include all recorded finding fields and values without omission, including verifier-side evidence and any acceptance/details fields.
  - **Details:** **Violation:** The task requires “per disputed finding — the finding verbatim.” **Impact:** Omitting substantive parts of the verifier’s finding undermines the core adjudication decision and can incorrectly clear a blocked session, changing the merge decision. **Evidence:** `_adjudication_prompt()` reconstructs findings solely from `severity`, `description`, and optional `failureScenario`; it never serializes or otherwise includes the complete finding record. The prompt test checks only the description substring and therefore does not enforce the verbatim requirement. The correct implementation must present the complete stored finding, not a selected projection.

## NITS

- **Nit:** `parse_adjudication_response()` accepts `Dispute 1: OVERRULE` with an empty reason and can consequently produce a VERIFIED row, despite the requirement that judgments include reasons. `reasons` is also optional in `rounds.schema.json`; malformed or terse model output is therefore not fully fail-closed.
- **Nit:** The public `--max-rounds` override allows callers to adjudicate before the configured cap by supplying a smaller value. This weakens the stated machine-checked cap precondition, although it requires deliberate use of the override.