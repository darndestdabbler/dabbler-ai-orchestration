ISSUES FOUND

Fix verdict: L1 DIRECT_API config loading with partial provider keys -- fix-accepted  
Fix verdict: L2 degraded route re-imposes orchestrator exclusion -- fix-accepted  
Fix verdict: L3 same-provider qualification dropped from metrics row -- fix-accepted  
Fix verdict: L4 same-provider fallback reachability for single-key DIRECT_API -- fix-accepted  
Fix verdict: L5 disposition schema rejects verification_qualification -- fix-accepted

- **Issue 1:** Keyless providers are marked disabled but remain selectable by model routing.
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/config.py:192-207`, `ai_router/models.py:114-120`, `ai_router/__init__.py:1297-1358`, `ai_router/router-config.yaml:576-602`
  - **Failure scenario:** A DIRECT_API session-verification run from an Anthropic orchestrator has Anthropic and Google keys but no OpenAI key. `validate_provider_api_keys()` disables OpenAI, the DIRECT_API precondition is satisfied because Google is a cross-provider candidate, so the degraded branch does not add unreachable-provider exclusions. The default session-verification pin is OpenAI, and `pick_model()` ignores `providers.<name>.enabled`, so route selects the disabled OpenAI verifier and then fails on the missing OpenAI key instead of using the available Google cross-provider verifier. This is probable for partial-key DIRECT_API users because the remediation explicitly allows partial key sets and the shipped verifier pin is OpenAI.
  - **Acceptance criterion:** `python -c "exec(\"import sys\nsys.path.insert(0, 'ai_router')\nfrom models import pick_model\nconfig = {'providers': {'anthropic': {'enabled': True}, 'openai': {'enabled': False}, 'google': {'enabled': True}}, 'models': {'openai-verifier': {'provider': 'openai', 'tier': 3, 'is_enabled': True}, 'google-verifier': {'provider': 'google', 'tier': 3, 'is_enabled': True}}, 'routing': {'task_type_overrides': {'session-verification': 'openai-verifier'}, 'tier_assignments': {3: 'google-verifier'}, 'tier1_max_complexity': 20, 'tier2_max_complexity': 60}}\nchosen = pick_model(90, 3, 'session-verification', config, exclude_providers=['anthropic'])\nassert chosen == 'google-verifier', chosen\n\")"`
  - **Acceptance expectation:** exit 0
  - **Details:** **Violation:** the fix says a provider with no key is “removed from selection,” but `pick_model()` only checks model `is_enabled` and `exclude_providers`, not provider `enabled`. **Impact:** a satisfied cross-provider DIRECT_API setup can still fail at dispatch on a disabled/keyless pinned provider, changing the merge decision because the precondition no longer reliably routes to an actually reachable verifier. **Evidence:** `config.py` disables keyless providers, `models.py` ignores that disabled state, and `route()` trusts `pick_model()` before calling the selected provider.