**ISSUES FOUND**

- **Issue 1:** The independence requirement is only enforced as “must route,” not as “must use a different effective provider” for `code-review` and `security-review`.
  - **Category:** Completeness
  - **Severity:** Major
  - **Evidence paths:** `docs/session-sets/131-outsourcing-policy-restoration/spec.md:270`, `docs/ai-led-session-workflow.md:2812`, `ai_router/config.py:652`, `ai_router/__init__.py:1221`, `ai_router/models.py:164`, `ai_router/router-config.yaml:346`, `ai_router/router-config.yaml:591`
  - **Failure scenario:** In an Anthropic-orchestrated session, the orchestrator follows the new policy and routes a mandatory `code-review`. `route()` only derives the session orchestrator provider exclusion when `task_type == "session-verification"`, so the `code-review: sonnet` override survives and selects the Anthropic `sonnet` model. That is a same-provider “independent” review on a normal supported path, not an edge case.
  - **Acceptance criterion:** `JUDGMENT - For every task type in config.INDEPENDENCE_REQUIRED_TASK_TYPES, a session-context route excludes the session orchestrator's effective provider or fails closed when no different-provider candidate exists, with code-review and security-review coverage proving the same-provider path cannot occur.`
  - **Details:** Violation: the plan requires work whose value is independence to “always [be] routed and must use a different effective provider: session-verification, code review, security review,” and the workflow doc repeats that “the effective provider must differ from the orchestrator's.” Impact: this breaks the central safety condition that makes widening delegation acceptable; a reasonable reviewer should not merge a policy restoration that can still self-review under the same provider for two of the three independence-floor tasks. Evidence: `config.py` only unions the task names into `always_route_task_types`; `__init__.py` only auto-adds the orchestrator exclusion for `session-verification`; `models.py` honors task-type overrides when no exclusion bars them; the shipped config pins `code-review` to `sonnet`, whose provider is Anthropic.

**NITS**

- **Nit:** Session 1 says **Creates: nothing new**, but the implementation creates `ai_router/tests/test_config_delegation_policy.py`. It is harmless because the `Touches` glob covers `test_config*.py`, but the plan accounting is imprecise.
- **Nit:** `delegation.child_budget.max_inferences_per_child` accepts any positive number, so fractional inference caps would validate. The field is advisory today, so this is non-blocking.