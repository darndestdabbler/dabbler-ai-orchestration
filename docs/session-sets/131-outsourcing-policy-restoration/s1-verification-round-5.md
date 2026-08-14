VERIFIED

- Fix verdict: L1 independence provider enforced for code/security review -- fix-accepted
- Fix verdict: L2 -- duplicate-of L1
- Fix verdict: L3 DIRECT_API degradation scoped to session-verification only -- fix-accepted

I checked the live route/config/model-selection paths and the new regression tests. The remediation now derives the orchestrator-provider exclusion for all three independence-floor task types, keeps the direct-API same-provider degradation limited to `session-verification`, and still lets hard exclusions beat pins and escalation.

NITS

- **Nit:** The no-candidate error wording now says any non-`session-verification` task with an exhausted exclusion “is in the independence floor,” which can be misleading for ordinary caller-supplied exclusions. This is non-blocking because selection still fails closed and the affected behavior is only the recovery text.