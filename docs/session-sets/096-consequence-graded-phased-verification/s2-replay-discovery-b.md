ISSUES FOUND

- **Issue 1: The hotfix drill tags and deploys without validating the integrated release**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** A typical hotfix changes `services/greeter/`, which is consumed by `services/integration/`. The PR runs only the path-scoped `greeter` job, and the prescribed local validation also runs only greeter tests. A cross-module regression can therefore be tagged and deployed as `v0.1.1`; this is especially probable for the tutorial’s capitalization example because integration tests may assert the composed output.
  - **Details:**
    - **Violation:** Part 10 says to “validate the exact hotfix commit locally, **then** tag and deploy,” and describes the tag as containing a “reviewed, CI-validated fix.” The task requires a correct production-as-a-tag hotfix and rollback flow.
    - **Impact:** Users following the main tutorial path can publish and deploy a release that has never passed the integration or clock tests. The later push-to-`main` `all-modules` run occurs only after the release tag has already been pushed and deployed.
    - **Evidence:** `docs/tutorials/module-team-hello-world.md`, Part 10, validates only:
      ```bash
      python -m unittest discover -s services/greeter -v
      ```
      The tutorial itself notes that PR CI tests GitHub’s preview merge rather than the exact tagged snapshot, while the workflow’s `all-modules` job runs only on pushes to `main`.
    - **Fix:** Before creating `v0.1.1`, run the complete all-module suite against the hotfix commit, including the integration tests and executable smoke test. Tag and deploy only after that exact commit passes.

- **Issue 2: The review prompt incorrectly treats `reviewDecision` as proof of branch-protection enforcement**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** On the normal authenticated-`gh` path, a repository with voluntary approving reviews but no approval requirement can return an approved `reviewDecision`. The prompted reviewer is explicitly permitted to report that review enforcement exists, so the team can receive favorable coaching while PRs remain mergeable without approval. This is probable because the supplied script always requests `reviewDecision` but never gathers branch-protection or ruleset configuration.
  - **Details:**
    - **Violation:** Principle 4 states: “**Enforcement** … [is] proven only by protection/ruleset data **or PR `reviewDecision` output**.” A PR’s review decision describes that PR’s review state; it does not establish that repository rules require approval before merge.
    - **Impact:** The companion prompt can falsely certify a central workflow guardrail and fail to recommend enabling branch protection, undermining its evidence-based review objective.
    - **Evidence:** `docs/tutorials/module-team-hello-world-review-prompt.md` gathers:
      ```bash
      gh pr list ... --json ...reviews,reviewDecision
      ```
      but gathers no branch-protection or ruleset endpoint. An approved review can exist without any rule requiring it.
    - **Fix:** Accept only branch-protection/ruleset configuration as enforcement evidence, such as authenticated GitHub API output for branch protection and repository rulesets. Use `reviews` and `reviewDecision` only for completed-review evidence; otherwise report enforcement as unavailable.

- **Issue 3: CODEOWNERS correctness is scored without gathering an independent ownership source**
  - **Category:** Completeness
  - **Severity:** Major
  - **Failure scenario:** A small team mistypes, swaps, or leaves stale GitHub handles while adapting CODEOWNERS. Every path still has a syntactically matching rule, so the review can report coverage even though reviews go to the wrong people. This configuration error is a normal target of an onboarding or pre-enforcement audit, yet the supplied evidence can never distinguish it from a correct assignment.
  - **Details:**
    - **Violation:** Principle 5 requires checking that each path resolves to “the **intended** effective owners,” and Principle 4 requires proving that touched modules’ owners are represented. The prompt’s evidence inputs must support those judgments.
    - **Impact:** The reusable review cannot substantiate owner correctness and may miss broken review routing, materially weakening two of its seven required principles.
    - **Evidence:** The evidence bundle gathers `docs/modules.yaml` and `.github/CODEOWNERS`, but the demonstrated module schema has no owner field and no ownership roster is requested. CODEOWNERS is the artifact being audited, so treating its own handles as the intended owners is circular.
    - **Fix:** Require an authoritative module-to-owner input, such as an `owners` field in the manifest, a team ownership policy file, or a caller-supplied ownership map. If none is available, explicitly cap owner-identity judgments at `ADVISORY` while still reporting path-match coverage.

#### NITS

- **Nit:** The routed evidence script ignores nonstandard declared `planPath` values. It enumerates only files matching `docs/modules/**/project-plan.md` instead of reading each path declared in `docs/modules.yaml`, so a valid custom plan location can appear unavailable.

- **Nit:** The “freshest main available” selection recognizes only `origin/main`, otherwise falling back to local `main`. After `git fetch --all`, a repository whose primary remote is named `upstream` can still be reviewed against stale local state. Enumerate fetched `*/main` refs or let the caller configure the authoritative remote.