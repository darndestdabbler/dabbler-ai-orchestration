ISSUES FOUND

The disputed premium-routing finding is **withdrawn**: the spec does not define all four derived risk flags as “high,” and the implementation’s narrow `HIGH_RISK_FLAGS` subset is a defensible reading rather than a proven defect.

- **Issue 1:** Malformed reviewer blocks can still fail open as approval when `VERDICT: approve` contradicts non-empty objected fields.
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/plan_review.py:317-328`, `ai_router/plan_review.py:425-450`, `tests/test_plan_review.py:161-170`
  - **Failure scenario:** A cheap reviewer returns `VERDICT: approve` but also lists `FIELDS: evidence_contract` and explains an evidence weakness. That is a likely LLM structured-output drift mode because the prompt always asks for a `FIELDS:` line, and stale/contradictory field content is common in fixed-form model responses. The parser discards those objected fields for approvals, so a weak plan can be recorded as approved.
  - **Acceptance criterion:** `JUDGMENT - A block with VERDICT: approve and any objectable FIELDS value must not produce an approved StepVerdict; it must fail closed to human or another non-approval outcome.`
  - **Details:** **Violation:** the prompt contract says, “VERDICT approve means the evidence would genuinely prove the step; leave FIELDS empty,” while the session requires the reviewer answer per step “approve, amend, or send to a human.” **Impact:** this changes the merge decision because the plan-review gate can approve a plan even when the model’s own structured fields identify a required correction. **Evidence:** `parse_review_response` normalizes the verdict token, parses objectable fields, then forces `objected_fields=[] if token == VERDICT_APPROVE`, silently throwing away contradictory objections instead of failing closed.