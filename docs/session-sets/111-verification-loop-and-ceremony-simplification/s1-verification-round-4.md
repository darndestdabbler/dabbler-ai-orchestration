VERIFIED — I checked the ledger-based bound enforcement, the transport disclosure/changelog fix, and the focused `TestEnforcedBounds` coverage; the remediations resolve the blocking findings without a new Critical/Major defect.

Fix verdict: L1 transport-timeout scope/release disclosure -- fix-accepted  
Fix verdict: L2 -- duplicate-of L1  
Fix verdict: L3 clean supplementary pass consumes discovery bound -- accepted-with-modification

#### NITS

- **Nit:** `s1-conventions.md:20` still names `sN-round-authorizations.jsonl`, while the implemented/documented ledger is now `sN-rounds.jsonl`. Non-blocking because the code, CLI help, workflow docs, changelog, and remediation note consistently use the new ledger path.