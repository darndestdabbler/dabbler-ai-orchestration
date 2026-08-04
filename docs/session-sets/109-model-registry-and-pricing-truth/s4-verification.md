# ISSUES FOUND

- **Issue 1:** The provider model drift check remains unwired.
  - **Category:** Completeness
  - **Severity:** Major
  - **Failure scenario:** After a provider retires or renames a model ID—the exact class of failure this set is intended to prevent—CI and the repository’s normal drift gate continue to pass because they never invoke `model_inventory --check`. A stale registry ID can therefore merge and reach routing before anyone manually runs the check.
  - **Details:**
    - **Violation:** The end-of-set deliverables require “a drift gate that fails loud on an id the provider does not offer.”
    - **Impact:** The registry correction is not continuously enforced. The same silent model-ID drift that caused the `gpt-5.6` defect can recur, defeating a central objective of the set and changing the merge decision.
    - **Evidence:** `ai_router/model_inventory.py`, `router-config.yaml`, and the changelog explicitly state that “Nothing calls `--check` automatically” and that arming it in `drift_guard.py` or CI is deferred. The reported `drift_guard.py — OK` therefore does not prove the model inventory gate is active.
    - **Correct answer:** Invoke `python -m ai_router.model_inventory --check` from the repository’s automatic drift/CI gate, with tests proving that a mismatched provider ID fails that gate.

## NITS

- **Nit:** Historical correction disclosures are not date-aware. `historical_correction_notes()` receives only aggregate `by_model` totals and multiplies the entire total by the historical factor, despite claiming that the factor applies only to rows before `corrected_on`. If a future routed `gpt-5-5` or `gemini-3-1-pro` row is correctly priced after 2026-08-04, the report will still multiply it as though it were historical. This is currently low impact because those models have little or no normal routing volume, but the implementation should either aggregate by row date or limit the disclosure to models whose aggregate is known to be historical.

- **Nit:** `route(prefer_model=...)` is not restricted to discovery. Any caller can pass it with `task_type="session-verification"` and override the pinned adjudicating verifier, contrary to the documented “adjudication ... deliberate exception.” The current `verify_session` call path uses it only during discovery, so this is a defense-in-depth/API-contract gap rather than a current-path failure.

- **Nit:** The config comments contradict the reconciliation artifact. `router-config.yaml` says the old `gpt-5-6` entry affected “245 calls and ~$49,” while `s4-cost-reconciliation.md` reports 254 rows and $51.0383. The latter may be the corrected ledger-wide figure, but the stale comment makes the registry’s accounting explanation internally inconsistent.

- **Nit:** `verify_session.run()` always passes the new `prefer_model` positional argument to an injected `route_fn`, even when it is `None`. Third-party or unupdated test seams using the prior callback signature will fail with `TypeError`; passing the new value only when present, or using a compatibility-aware keyword call, would preserve the old injectable contract.