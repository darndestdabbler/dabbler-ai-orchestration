# ISSUES FOUND

## Issue 1: The hotfix is tagged and deployed without running the integrated test suite

- **Category:** Correctness
- **Severity:** Major
- **Location:** `docs/tutorials/module-team-hello-world.md`, Part 10, step 3
- **Details:**
  - **Violation:** The walkthrough says to “validate **before** you tag,” calls the hotfix “CI-validated,” and teaches an all-module guardrail, but validates the exact release commit only with `python -m unittest discover -s services/greeter -v`.
  - **Impact:** A literal follower can tag and deploy `v0.1.1` with broken integration behavior. This is probable in the tutorial’s own example: changing greeting capitalization can invalidate the integration test that exercises the real greeter output. The PR runs only the path-filtered `greeter` job; `integration` is skipped, and `all-modules` runs only after the PR is merged—after the tag has already been pushed and deployed.
  - **Evidence:** The workflow defines `integration` as conditional only on `services/integration/**`, while `all-modules` is restricted to pushes to `main`. The hotfix changes `services/greeter/`, tags before merge, and runs only greeter tests locally.
- **Fix:** Before creating `v0.1.1`, run the same complete per-directory test loop used by `all-modules`, or otherwise execute every module and integration test against the exact hotfix commit. Do not push or deploy the tag unless that full exact-snapshot validation passes.

## Issue 2: `ADVISORY` caps suppress proven failures

- **Category:** Correctness
- **Severity:** Major
- **Location:** `docs/tutorials/module-team-hello-world-review-prompt.md`, Principles 4, 6, and 7
- **Details:**
  - **Violation:** The required review must provide trustworthy per-principle scoring, but the prompt mandates `ADVISORY` whenever one evidence category is unavailable—even when other evidence conclusively proves a violation.
  - **Impact:** Common runs will understate real failures. For example:
    - A branch can prove cross-module work lacks `touches`, yet Principle 4 must be capped at `ADVISORY` when `gh` is unavailable.
    - Lightweight tags or incorrect tag ancestry can be conclusively proven, yet Principle 6 must be capped at `ADVISORY` when production deployment evidence is absent.
    - A missing all-module CI job can be proven, yet Principle 7 must be capped at `ADVISORY` when dated branch evidence is unavailable.
    This changes actionable `FAIL` results into uncertainty and materially weakens the coaching.
  - **Evidence:** Principle 4 says “with no PR review data, cap this principle at `ADVISORY`”; Principle 6 says missing production-target evidence caps the whole principle at `ADVISORY`; Principle 7 similarly caps the whole principle when drift evidence is missing. Each principle also independently defines proven “Bad” conditions.
- **Fix:** Apply missing-evidence caps only to an otherwise passing result: `FAIL` whenever available evidence proves any violation; `ADVISORY` only when no failure is proven but missing evidence prevents a `PASS`.

## Issue 3: The prompt treats `reviewDecision` as proof of branch-protection enforcement

- **Category:** False Positive
- **Severity:** Major
- **Location:** `docs/tutorials/module-team-hello-world-review-prompt.md`, Principle 4, fact 3; routed evidence script
- **Details:**
  - **Violation:** The prompt requires evidence-backed claims and says not to infer enforcement, but states that enforcement is “Proven only by protection/ruleset data or PR `reviewDecision` output.”
  - **Impact:** A typical merged PR with an approving review can have `reviewDecision: APPROVED` even when no branch rule required that approval. The routed script gathers `reviewDecision` but gathers no branch-protection or ruleset configuration, so the model is explicitly licensed to assert enforcement that may not exist. That makes the reusable review untrustworthy on a common path.
  - **Evidence:** The `gh pr list` call requests `reviewDecision`, reviews, and files, but no protection/ruleset data. `reviewDecision` describes the PR’s review state; it does not by itself prove that GitHub blocked merging until approval.
- **Fix:** Treat `reviewDecision` and reviews only as evidence of review state/completed approvals. Prove enforcement with branch-protection or repository-ruleset data, such as authenticated GitHub API output; otherwise report enforcement as unavailable.

## NITS

- **Nit:** Part 10’s deployment commands assume `services/integration/app.py` even though the generated plan never requires that filename; “adjust to the entry point” makes this portion recoverable but not literally copy-pasteable.
- **Nit:** Part 3 calls administrator enforcement optional (“If you want”) but later unconditionally expects Priya’s direct pushes to be rejected; an admin who skips that option can fail the self-check.
- **Nit:** The routed review script overwrites an earlier review when run more than once on the same date because the output filename contains only `date.today()`.
- **Nit:** Current-base CODEOWNERS coverage cannot prove that owners were auto-requested on historical merged PRs; CODEOWNERS may have changed since those PRs, and the script does not gather `reviewRequests` or the historical CODEOWNERS version.