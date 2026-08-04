ISSUES FOUND

Fix verdict: L1 provider model drift check was unwired -- fix-accepted  
Fix verdict: L2 `--fetch` returned success for unmatched configured models -- fix-accepted  
Fix verdict: L3 historical correction factors included post-correction rows -- fix-accepted  
Fix verdict: L4 Luna was pinned without required quality evidence -- fix-accepted

- **Issue 1: The L4 remediation withdraws an explicit end-of-set deliverable instead of completing it**
  - **Category:** Completeness
  - **Severity:** Major
  - **Location:** `ai_router/router-config.yaml`, `verification.discovery.model`; `ai_router/tests/test_discovery_model_preference.py`
  - **Failure scenario:** Every normal verification run continues using `gpt-5-6-sol` for both discovery calls because `verification.discovery.model` is unset. Consequently, the cheap Luna variant never serves the discovery fan-out, and operators continue paying Sol’s substantially higher rate on every run. This is certain on the shipped configuration, not hypothetical.
  - **Details:**
    - **Violation:** The plan explicitly requires **“Put the cheap variant where it pays”**, ends with **“the discovery fan-out runs on the cheap variant,”** and lists **“Luna on the discovery fan-out”** as an end-of-set deliverable. The risk control requires evidence before moving the pin; it does not authorize replacing the deliverable with an inert mechanism.
    - **Impact:** The session cannot legitimately close as complete: one of its principal cost-reduction objectives is absent from production configuration. The L4 withdrawal resolves the unsafe evidence-free switch, but it introduces a material completeness failure that changes the merge/close decision.
    - **Evidence:** The remediation comments out `model: gpt-5-6-luna`, and the revised live-config test explicitly asserts `load_discovery_model(config) is None` and that Sol remains the `session-verification` override. This directly contradicts the required final state.
  - **Fix:** Produce the required empirical quality evidence and arm the Luna discovery pin if it meets a predeclared acceptance threshold. Otherwise obtain an explicit scope/spec modification before closing the session; shipping only the inert mechanism is not equivalent to the promised deliverable.