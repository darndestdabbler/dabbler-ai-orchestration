**ISSUES FOUND**

**Issue 1:** The new independence-provider requirement is not enforced for `code-review` or `security-review`.
- **Category:** Completeness
- **Severity:** Major
- **Evidence paths:** `ai_router/config.py:590`, `docs/ai-led-session-workflow.md:2812`, `ai_router/router-config.yaml:591`, `ai_router/__init__.py:1235`, `ai_router/models.py:164`
- **Failure scenario:** A Claude/Anthropic orchestrator routes `task_type="code-review"` during a session. Because `route()` only derives and excludes the orchestrator provider for `session-verification`, `pick_model()` honors the shipped `code-review: sonnet` override and selects Anthropic, so the “independent perspective” task is performed by the same effective provider. This is probable because Claude Code is a supported orchestrator and `code-review` is now explicitly in the mandatory independence floor.
- **Acceptance criterion:** `JUDGMENT - Every task type in config.INDEPENDENCE_REQUIRED_TASK_TYPES resolves the session orchestrator effective provider when session context is supplied and excludes it from generator selection, including task-type overrides, tier fallback, escalation, and copilot-cli role selection; coverage proves code-review and security-review cannot select Anthropic for an Anthropic orchestrator.`
- **Details:** Violation: the workflow says independence work “is always routed, and the effective provider must differ from the orchestrator’s” for `session-verification`, `code-review`, and `security-review`. Impact: the shipped policy can claim independent review while actually routing a common review task to the orchestrator’s own provider, defeating the central objective of rule 2 and changing the merge decision. Evidence: `INDEPENDENCE_REQUIRED_TASK_TYPES` includes all three task types, but `route()` applies the dynamic orchestrator exclusion only when `task_type == "session-verification"`, while the shipped config pins `code-review` to Anthropic `sonnet`.

**NITS**

- **Nit:** `delegation.child_budget.max_inferences_per_child` accepts any positive float even though it is an inference count. Low impact because the budget is advisory in this session, but the validator should probably require an integer for that field and leave `warn_at_credits` as the numeric field.