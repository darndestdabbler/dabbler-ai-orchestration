ISSUES FOUND

Fix verdict: L1 canonical-servant one-time drift classification -- fix-accepted  
Fix verdict: L2 paid failed-arm metrics recording -- fix-accepted  
Fix verdict: L3 -- duplicate-of L1  
Fix verdict: L4 credential-bearing URL redaction -- fix-accepted  
Fix verdict: L5 critique model provenance -- fix-rejected

- **Issue 1:** Failed-arm metrics still fabricate or lose the model sent to the provider
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/pull_critique.py`, `ai_router/pull_verifier.py`, `ai_router/tests/test_pull_critique.py`
  - **Failure scenario:** A normal unpinned critique arm resolves its configured model, receives one or more billable responses, and then raises a `DeterministicServantViolation`, verdict error, or later-turn `BindingHTTPError`. These are the probable failures L2 was specifically introduced to record. Those exceptions do not inherently carry `pull_model`, so `_record_failed_arm` records `"(unresolved)"` as both `model` and `requested_model_id`. For an alias-pinned arm, it instead records the caller’s alias as `requested_model_id`, not the resolved identifier sent on the wire. The spend row therefore cannot reliably attribute paid usage to the actual model.
  - **Acceptance criterion:** JUDGMENT - For paid failed arms using both an unpinned configured model and a caller-supplied alias, the emitted metrics row must retain the caller-facing model value separately from the resolved model actually sent, without relying on the raised exception to provide an optional `pull_model` attribute, and must leave `served_model_id` null unless observed.
  - **Details:**
    - **Violation:** The remediation states that “`requested_model_id` is the resolved id actually put on the wire,” but `_record_failed_arm` constructs `_FailedArm.model` as `getattr(exc, "pull_model", None) or model or "(unresolved)"`. `_record_critique_call` then writes that value to `requested_model_id`. Guard-generated violations and the directly constructed `BindingHTTPError` do not inherently contain the resolved model attribute.
    - **Impact:** The newly recovered spend rows are materially unreliable for per-model cost and drift audits—the exact purpose of the provenance fields. This leaves L5 unresolved on the same paid-failure path addressed by L2 and should block merge.
    - **Evidence:** Successful arms obtain the resolved identity from `PullResult.model`; failed arms discard that result and have no equivalent reliable channel. The failed-arm tests verify tokens and cost but never assert the resolved model provenance.
    - **Correct answer:** Publish the resolved model alongside the trace before provider execution, or otherwise propagate it through a guaranteed failure context, and use that value for failed-arm `requested_model_id`.

## NITS

- **Nit:** `test_a_runner_with_no_sink_support_does_not_break_the_producer` does not test its stated condition: its runner accepts `**kw`, so it does support the new `trace_sink` keyword. An injected callable with an exact legacy signature now raises `TypeError` when `produce_path_aware_critique` unconditionally passes `trace_sink`. This is a low-probability compatibility issue for custom/test injection rather than a blocker.