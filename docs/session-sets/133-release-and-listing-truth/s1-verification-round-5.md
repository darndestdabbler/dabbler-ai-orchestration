ISSUES FOUND

Fix verdict: L1 Marketplace surfaces still overstate provider independence -- fix-rejected  
Fix verdict: L2 -- duplicate-of L1

- **Issue 1:** The claimed Marketplace and changelog correction is absent from the fix delta
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `tools/dabbler-ai-orchestration/package.json`, `ai_router/CHANGELOG.md`
  - **Failure scenario:** Every Marketplace visitor encounters the package description before the README. A user adopting the expressly supported single-provider `DIRECT_API` configuration can therefore rely on the unchanged unconditional-independence claim, yet deterministically receive same-provider verification. This is probable because the misleading description is universal while the fallback is an intentional supported path, and truthful release messaging is the session’s primary objective.
  - **Acceptance criterion:** JUDGMENT - The current Marketplace description, Marketplace README, and 1.0.0 changelog consistently disclose that verification is normally cross-provider but a qualified `DIRECT_API` same-provider fallback can substitute when no different-provider verifier is available.
  - **Details:** **Violation:** The prior criterion requires that “the Marketplace README and package description accurately disclose the qualified `DIRECT_API` same-provider fallback” and that all release surfaces state one consistent contract. **Impact:** Publishing the listing would preserve a materially false assurance about the independence of every close, defeating the release-and-listing-truth objective and changing a reasonable reviewer’s merge decision. **Evidence:** The supplied bundle identifies itself as the complete tree-to-tree fix delta from discovery baseline `9e4871a6a318` to current tree `98f0436390b8`, with explicit exclusions that do not include either named path. It contains no hunk for `tools/dabbler-ai-orchestration/package.json` or `ai_router/CHANGELOG.md`, although those are precisely the surfaces L2 found defective. Thus the remediation note’s claim that both were changed is contradicted by the presented ground truth. The package description must qualify cross-provider verification, and the changelog must plainly state that same-provider verification substitutes on the degraded path.

## NITS

- **Nit:** `docs/session-sets/133-release-and-listing-truth/test-runs.jsonl` records both pytest commands as `-n auto`, while their details state that the commands actually used `-n 8`. The disclosure prevents material loss of evidence, but the structured `command` field is inaccurate.