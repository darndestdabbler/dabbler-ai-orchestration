ISSUES FOUND

## Issue 1: The review prompt applies CODEOWNERS coverage to the wrong paths for legal `touches` work

- **Category:** Correctness
- **Severity:** Major
- **Details:**
  - **Violation:** The walkthrough explicitly states that an integration module may legally use `codeRoots: []` and edit only the modules named by `touches`. Principle 3 likewise treats touched modules’ `codeRoots` as in scope. Principle 4, however, defines coverage by requiring “the integration module’s paths” to resolve to all touched owners instead of evaluating the actual changed paths across the touched modules.
  - **Impact:** A valid integration PR that changes `auth/**` and `billing/**`, with normal rules such as `auth/** @auth-team` and `billing/** @billing-team`, correctly requests both teams when GitHub aggregates ownership across the PR. The prompt can nevertheless report deficient coverage because no integration-owned path resolves to both teams—and for the expressly supported `codeRoots: []` shape, no integration-owned path exists at all. Conversely, co-owning an unrelated integration path does not establish coverage for the touched files actually changed. This can produce incorrect coaching on one of the required seven principles.
  - **Evidence:** `docs/tutorials/module-team-hello-world.md`, Part 3 says an integration module that only edits touched modules may declare `codeRoots: []` and that “either shape is legal.” `docs/tutorials/module-team-hello-world-review-prompt.md`, Principle 3 authorizes changes under touched modules’ `codeRoots`, while Principle 4 fact 1 instead checks whether “the integration module’s paths” include the touched owners. The prompt never instructs the reviewer to resolve each touched changed path and aggregate its effective owners at the PR level.
  - **Correct answer:** For every changed path admitted through `touches`, resolve the final CODEOWNERS rule and verify that the corresponding touched module’s owner is included. Then aggregate those effective owners across the PR. Only require the integration module’s own composition path to list all touched owners when that path is what the PR actually changes.

- **Location:** `docs/tutorials/module-team-hello-world-review-prompt.md`, Principles 3–4; `docs/tutorials/module-team-hello-world.md`, Part 3.
- **Fix:** Rewrite Principle 4’s coverage fact and report instructions around effective ownership of the actual changed paths, explicitly covering both integration modules with their own `codeRoots` and legal `codeRoots: []` modules.