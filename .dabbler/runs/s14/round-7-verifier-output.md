VERIFIED — The fix excludes canonical machine-state paths from the surface digest while preserving sensitivity to source changes, addressing the self-invalidating run-ledger record. The regression test exercises both invariants; no blocking defect appears in the fix delta.

### NITS

- **Nit:** The prior historical-record edge case remains: rounds without `head_commit` still use the timestamp fallback in `ai_router/verify.py`, allowing an equal- or backdated first remediation commit to be selected as an anchor. This delta does not modify that path.