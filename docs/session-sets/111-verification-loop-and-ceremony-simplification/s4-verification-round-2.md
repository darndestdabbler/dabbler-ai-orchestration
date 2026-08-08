ISSUES FOUND

- **Issue 1:** The UAT close gate silently bypasses `requiresUAT: true` when `uatScope` is omitted.
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** A spec author declares `requiresUAT: true` but omits `uatScope` (an existing historical shape in this repo). The close gate treats the missing scope as `none` and returns success with no `disposition.uat`, so the exact “UAT cannot evaporate” failure remains probable for any carried-forward or hand-authored UAT set missing that optional field.
  - **Acceptance criterion:** `JUDGMENT - A full-tier spec with requiresUAT: true and no uatScope cannot pass check_uat_walk_recorded without disposition.uat; only an explicit non-UAT/advisory policy can disarm the gate.`
  - **Details:** Violation: the task requires “A `requiresUAT: true` session closes only with its walk or an operator-attested waiver.” Impact: a set can still close with no walk and no waiver. Evidence: `spec_config.py` defaults omitted `uatScope` to `"none"`, and `gate_checks.py:1701-1703` returns success for `scope == "none"`; a probe with `requiresUAT: true` and no scope returned `(True, '')`.

- **Issue 2:** The freshness gate does not cover the policy’s named Layer 3 trigger surfaces.
  - **Category:** Completeness
  - **Severity:** Major
  - **Failure scenario:** A typical future session changes a state-file writer such as `ai_router/session_state.py` or fixture/walk harness files without touching extension `src/`, `package.json`, or `media/`. `test_run_fresh` reports Playwright as not required, so the session can close without the full Layer 3 run the canonized policy says is non-negotiable.
  - **Acceptance criterion:** `JUDGMENT - The Playwright expensive-suite coverage map requires freshness for the policy’s named surfaces, including state-file writers and fixture/walk harness paths, not only extension src/package/media.`
  - **Details:** Violation: the new guide says “any session touching ... a state-file writer ... or the fixture harness runs the full Layer 3 at its own close.” Impact: the executable gate does not enforce the documented safety rule. Evidence: `DEFAULT_SUITES` covers only `tools/dabbler-ai-orchestration/src/`, `package.json`, and `media/`; probing `evaluate_freshness(..., ["ai_router/session_state.py"], DEFAULT_SUITES)` returns Playwright `required=False`.

- **Issue 3:** The PyPI publish action is annotated as `v1.14.2` but pinned to the moving `release/v1` branch head, not the release tag.
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** Every TestPyPI/PyPI release runs `pypa/gh-action-pypi-publish` at an unversioned branch-head commit while reviewers and Dependabot comments say it is `v1.14.2`. This defeats the stated review/bump path for the sharpest supply-chain surface: the publish action.
  - **Acceptance criterion:** `JUDGMENT - Each pypa/gh-action-pypi-publish pin in release.yml points to the commit for a real version tag, and the trailing comment names that same tag; the guard or review path catches mismatched SHA/comment pairs.`
  - **Details:** Violation: the required form is `owner/action@<40-char-sha>  # vX.Y.Z` with the comment maintained as the version identity. Impact: the release workflow’s most sensitive third-party action is not pinned to the release version it claims. Evidence: `release.yml` uses `dc37677b2e1c63e2034f94d8a5b11f265b73ba33  # v1.14.2`, while upstream `refs/tags/v1.14.2` is `a892a5a61159132606e93a2fa6f4358831b04d26`; `dc37677...` is `refs/heads/release/v1`.