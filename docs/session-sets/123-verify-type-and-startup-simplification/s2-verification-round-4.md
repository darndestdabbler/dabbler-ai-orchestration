VERIFIED

Fix verdict: L1 DIRECT_API config load no longer requires every enabled provider key -- fix-accepted  
Fix verdict: L2 degraded route no longer re-imposes caller-supplied orchestrator exclusion -- fix-accepted  
Fix verdict: L3 same-provider qualification now persists to metrics stamp rows -- fix-accepted  
Fix verdict: L4 same-provider fallback is reachable for the target degraded Direct API path -- fix-accepted  
Fix verdict: L5 disposition JSON Schema now accepts the qualified-verdict field -- fix-accepted  
Fix verdict: L6 keyless providers are removed from model selection, not just provider-marked disabled -- fix-accepted

I checked the changed config-loading, routing-exclusion, model-selection, stamp/metrics, disposition-schema, and producer/consumer qualification paths. The fixes address the ledger failures without introducing a new in-hunk Critical/Major defect.