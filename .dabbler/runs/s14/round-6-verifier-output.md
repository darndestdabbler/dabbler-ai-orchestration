VERIFIED — The retired-set lifecycle collision is resolved by filtering `legacy_set` events in the shared `organization_states()` path. Recording and validating `head_commit` topologically also prevents backdated remediation commits from becoming anchors for newly recorded rounds.

## NITS

- **Nit:** Historical round rows without `head_commit` still use the timestamp fallback in `ai_router/verify.py`, so the prior equal/backdated first-remediation-commit edge case persists when re-anchoring old records. This remains non-blocking because it requires clock skew or timestamp manipulation.