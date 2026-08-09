**ISSUES FOUND**

- **Issue 1:** The VS Code extension’s public README still teaches the removed two-tier workflow and removed commands.
  - **Category:** Completeness
  - **Severity:** Major
  - **Failure scenario:** A typical user installing or evaluating the extension from the Marketplace reads `tools/dabbler-ai-orchestration/README.md` and is told to choose Full vs Lightweight, use **Switch Tier…**, **Set Up Dedicated Verification…**, **Verification Kickoff**, and `external-verification.md`. Those commands/artifacts were removed in this session, so the documented onboarding path fails and the “one story everywhere” deliverable is not met.
  - **Acceptance criterion:** `JUDGMENT - The extension Marketplace README no longer teaches Full/Lightweight tiers or names Set 112-removed commands/artifacts, and instead describes the one-tier provider-access setup plus current advisory Evaluate prompts.`
  - **Details:** The task says Session 2 ends with “one story everywhere” and “the form asks no tier question.” But `tools/dabbler-ai-orchestration/README.md:6`, `:12-30`, `:95-113`, and `:234-298` still describe two tiers, a tier radio, Lightweight verification modes, `external-verification.md`, `Switch Tier…`, `Set Up Dedicated Verification…`, and `Verification Kickoff`. The diff shows those commands were removed from `package.json` and `ActionRegistry`, so this is not just stale wording; it points users at dead extension surfaces.

**NITS**

- **Nit:** `docs/budget-yaml-schema.md` still frames `budget.yaml` as “Full-adoption” / “Full tier only” and says no `ai_router` runtime code parses it, while the current close gates now read zero-budget declarations. That is a live-doc accuracy issue, but lower impact than the public extension README.
- **Nit:** `docs/path-aware-critique-schema.md` and `docs/contract-gate.md` still compare current policy capture to the removed `verificationMode` attribute. The behavior is not broken, but the teaching docs retain deleted vocabulary.
- **Nit:** `tools/dabbler-ai-orchestration/src/utils/sampleProject.ts` still says the sample removes the seeded `ai_router/router-config.yaml`; after adding bundled `ai_router/budget.yaml`, the current guard no longer removes the directory. Either the comment is now false or the cleanup needs to remove only `router-config.yaml` while preserving `budget.yaml`.