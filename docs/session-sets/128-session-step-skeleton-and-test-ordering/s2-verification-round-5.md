**VERIFIED** — I checked the current fix hunks for A4.2 routing/bounds, tree-to-tree delta classification, shared remediation-review prompt assembly, phased exclusions, and fix-verdict enforcement. The remediations address the ledgered blockers without introducing a new in-hunk Critical/Major defect.

Fix verdict: L1 A4.2 close backstop now runs a delta-scoped remediation-review for shipped-code post-round deltas -- fix-accepted  
Fix verdict: L2 -- duplicate-of L1  
Fix verdict: L3 unchanged untracked files captured in the anchor are no longer misclassified as post-round shipped-code changes -- fix-accepted  
Fix verdict: L4 A4.2 backstop remediation-review now carries ledger/acceptance context and enforces fix-verdict coverage -- fix-accepted  
Fix verdict: L5 A4.2 backstop now reuses the phased evidence exclusions for the fix-delta bundle -- fix-accepted