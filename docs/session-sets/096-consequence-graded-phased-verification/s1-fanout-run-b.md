# ISSUES FOUND

### Issue 1: Owner identity and owner-approval claims are not supportable from the gathered evidence

- **Category:** Completeness
- **Severity:** Major
- **Location:** `docs/tutorials/module-team-hello-world-review-prompt.md` — evidence-gathering script and Principles 4–5
- **Details:** **Violation:** The task requires “trustworthy, evidence-cited coaching” about “integration `touches` + owner review” and “CODEOWNERS coverage.” The prompt requires checking the “intended” module owners and whether touched owners approved, but its inputs contain no authoritative module-to-owner mapping. `docs/modules.yaml` supplies only `slug`, `title`, `codeRoots`, `planPath`, and `touches`; `.github/CODEOWNERS` is the mapping being audited and therefore cannot independently prove that its listed owners are the intended owners. The script also gathers reviewer logins but not membership of CODEOWNERS teams such as `@org/greeter-team`. **Impact:** A typical repository can assign `services/greeter/**` to the wrong person or team consistently, and the review can report PASS because it has no independent expected-owner roster. It can likewise claim that a team owner approved without evidence that the approving user belongs to that team. These are false-confidence failures in the central review deliverable and would change a merge decision. **Evidence:** The evidence script reads `docs/modules.yaml`, CODEOWNERS, plans, specs, workflows, and `gh pr list`; it never asks for an ownership roster or resolves GitHub team membership. Principle 5 nevertheless asks whether effective owners are “the intended one,” and Principle 4 asks whether “the touched modules’ owners” approved.
- **Fix:** Require an explicit owner mapping as an input, or add a supported owner field to the module manifest. For team CODEOWNERS entries, resolve membership through authenticated GitHub API evidence; otherwise mark team-member approval as unavailable. Without an independent owner source, limit the score to syntactic coverage and state that owner correctness is unverified.

### Issue 2: `reviewDecision` is incorrectly treated as proof that approvals were enforced

- **Category:** Correctness
- **Severity:** Major
- **Location:** `docs/tutorials/module-team-hello-world-review-prompt.md` — Principle 4, fact 3
- **Details:** **Violation:** The prompt states: “Enforcement — branch protection actually requires approvals … Proven only by protection/ruleset data or PR `reviewDecision` output.” A PR’s `reviewDecision` reports review disposition; an `APPROVED` result can arise from an optional approval and does not prove that branch protection or a ruleset required it. **Impact:** Repositories with voluntary reviews but no approval enforcement are common. The shipped prompt can therefore report that approvals were required when merges were actually unrestricted, producing untrustworthy coaching about a core guardrail. **Evidence:** The runner gathers `reviewDecision` through `gh pr list` but gathers no branch-protection or repository-ruleset configuration. The prompt explicitly authorizes treating the former as enforcement proof.
- **Fix:** Treat `reviewDecision` and `reviews` only as evidence of review state and completed approvals. Gather branch protection/rulesets through the GitHub API to establish enforcement; otherwise report enforcement as unavailable and cap Principle 4 at `ADVISORY`.

### Issue 3: The walkthrough does not establish the test framework required by its CI, so generated module PRs can be blocked on the main path

- **Category:** Completeness
- **Severity:** Major
- **Location:** `docs/tutorials/module-team-hello-world.md` — Parts 4–7
- **Details:** **Violation:** The walkthrough is required to be “copy-pasteable, runnable,” but the greeter and clock plans request only “a unit test,” while the supplied CI exclusively discovers `unittest` tests and deliberately fails when `unittest` finds zero cases. Priya and Sam start their sessions before the CI workflow is merged, so their agents cannot infer this hidden framework contract from the repository. **Impact:** AI agents commonly generate pytest-style tests. A literal follower can therefore reach the greeter or clock PR with real tests present, yet receive `ERROR: no tests found`; the required check blocks merging, the prerequisite sets never complete, and Alex’s integration set remains blocked. This materially interrupts the advertised end-to-end walkthrough for its novice audience. **Evidence:** Parts 4 and 5 say only “plus a unit test”; Part 6 starts both implementation sessions; Part 7 later installs commands based on `unittest.defaultTestLoader.discover(...)` and fails when its count is zero.
- **Fix:** Before session generation, explicitly require standard-library `unittest.TestCase` tests in discoverable `test*.py` files, including concrete expected paths. Alternatively, make the workflow run the test framework selected by the generated project and commit that test configuration before opening the implementation worktrees.

#### NITS

- **Nit:** The route script always selects `origin/main` when that ref exists; it does not prove it is the freshest main among multiple remotes despite claiming to review the “freshest main.”
- **Nit:** The tag evidence format omits `%(objectname:short)`, so lightweight tags have no target SHA in the dedicated tag evidence even though the prompt asks for tag targets.
- **Nit:** Principle 2 does not explicitly compare same-named session sets added independently on different local or remote branches, despite the runner collecting branch-specific specs and global uniqueness being the rule most exposed to concurrent authoring.
- **Nit:** The routed review ignores uncommitted and staged changes, so an active dirty branch’s current scope violations are absent without an explicit warning that only committed ref state is reviewed.
- **Nit:** Repository-controlled file contents are appended directly to the model prompt without an explicit instruction to treat embedded instructions as untrusted data, leaving the review vulnerable to prompt injection from specs, plans, or workflows.
- **Nit:** Part 10 uses `python services/integration/app.py` with “adjust to the entry point your integration session produced”; because no earlier step requires `app.py`, this command is not literally copy-pasteable, though the correction is readily recoverable.
- **Nit:** The final self-check verifies that Priya and Sam were auto-requested but does not explicitly verify that both actually approved Alex’s integration PR, despite that being a named walkthrough objective.