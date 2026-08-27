ISSUES FOUND

- **Issue 1:** Premium routing ignores two of the derived risk flags.
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/plan_review.py:34-71`, `ai_router/approved_plan.py:42-45`, `docs/session-sets/144-the-approved-plan/spec.md:181-198`
  - **Failure scenario:** A plan step touching a top-level router module derives `public-interface`, or a manifest-owned module derives `integration-module`; those are common session shapes in this repo, including this session’s new `ai_router/plan_review.py`. The review then stays on the cheap tier even though the spec promises premium routing for high-risk flags.
  - **Acceptance criterion:** `python -c "exec(\"import importlib.util\\nimport sys\\nspec=importlib.util.spec_from_file_location('ai_router.plan_review','ai_router/plan_review.py')\\nmodule=importlib.util.module_from_spec(spec)\\nsys.modules['ai_router.plan_review']=module\\nspec.loader.exec_module(module)\\nok=module.escalation_triggers({'steps':[{'risk_flags':['public-interface']}]},[])==['high-risk-flag'] and module.escalation_triggers({'steps':[{'risk_flags':['integration-module']}]},[])==['high-risk-flag']\\nraise SystemExit(0 if ok else 1)\")"`
  - **Acceptance expectation:** exit 0
  - **Details:** **Violation** — the spec says “Route to the expensive model only when a step carries a high risk flag,” and the plan’s derived flags are `public-interface`, `integration-module`, `sensitive-path`, and `dependency-change`. **Impact** — two derived risk categories bypass the premium reviewer, changing the merge decision for the risk-triggered review deliverable. **Evidence** — `HIGH_RISK_FLAGS` includes only `sensitive-path` and `dependency-change`; `approved_plan.py` defines and derives all four flags.

- **Issue 2:** Malformed reviewer verdicts can fail open as approval.
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/plan_review.py:392-449`, `docs/session-sets/144-the-approved-plan/spec.md:186-190`
  - **Failure scenario:** The cheap model returns an ambiguous verdict such as `approve/amend` while also naming an objected field. This is plausible because the reviewer is an LLM constrained by prompt text, and format drift is exactly what fail-closed parsing is meant to contain. The parser accepts the leading `approve` token and records approval instead of sending the step to a human.
  - **Acceptance criterion:** `python -c "exec(\"import importlib.util\\nimport sys\\nspec=importlib.util.spec_from_file_location('ai_router.plan_review','ai_router/plan_review.py')\\nmodule=importlib.util.module_from_spec(spec)\\nsys.modules['ai_router.plan_review']=module\\nspec.loader.exec_module(module)\\nverdict=module.parse_review_response('STEP: s\\nVERDICT: approve/amend\\nFIELDS: evidence_contract\\nWHY: ambiguous',['s'])[0]\\nraise SystemExit(0 if verdict.verdict == 'human' else 1)\")"`
  - **Acceptance expectation:** exit 0
  - **Details:** **Violation** — the spec requires the reviewer to answer per step “approve, amend, or send to a human,” not a combined token. **Impact** — an ambiguous or contradictory model response can approve a weak evidence contract, undermining the proof-review gate. **Evidence** — `parse_review_response` splits the verdict at the first non-letter and accepts the first token, so `approve/amend` becomes `approve`.