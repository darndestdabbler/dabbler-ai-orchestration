# ISSUES FOUND

## Issue 1: The walkthrough enables branch protection, then instructs Priya to push directly to protected `main`

- **Category:** Correctness
- **Severity:** Major
- **Details:**
  - **Violation:** The walkthrough must be “copy-pasteable, runnable” and exercise small PRs to `main`. Part 1 states that direct pushes are rejected and “every later change lands through a pull request,” but Part 3 runs `git push` directly on `main` and calls it “the last direct push.”
  - **Impact:** If protection applies to Priya, the documented command fails without copy-pasteable recovery instructions. If Priya has administrator bypass—as repository administrators commonly do unless bypass is explicitly disabled—the push succeeds and the walkthrough fails to exercise its stated protected-trunk contract.
  - **Evidence:** Part 1 enables protection before any scaffold or module work and says:
    > “a direct `git push` of a `main` commit is now rejected”
    
    Part 3 later runs:
    ```bash
    git add -A
    git commit -m "chore: scaffold project structure and define modules"
    git push
    ```
    and incorrectly says protection “starts biting once collaborators join.” Branch protection does not activate based on when collaborators join.
- **Location:** `docs/tutorials/module-team-hello-world.md`, Part 1 step 4 and Part 3 step 4.
- **Fix:** Either postpone protection until the scaffold/manifest is merged, or make Part 3 use an explicit branch-and-PR sequence. Enable the GitHub option that prevents administrator bypass if direct pushes by Priya must actually be rejected.

## Issue 2: Alex is still told to generate `003` before the serialization step that is supposed to make `003` possible

- **Category:** Correctness
- **Severity:** Major
- **Details:**
  - **Violation:** The walkthrough requires globally coordinated set generation and explicitly claims to prevent Sam and Alex racing on the next prefix.
  - **Impact:** A reader following the numbered instructions generates Alex’s set from the same `main` snapshot Sam used, before Sam’s `002` lands. Alex can therefore produce another `002-*`, or create local files that conflict with the later instruction to pull and generate `003`. The tutorial then tells Alex to generate the same set a second time.
  - **Evidence:** Part 5 step 1 has Sam generate `002-clock-hello`. Step 2 immediately tells Alex to click **AI Sets**, “producing `docs/session-sets/003-integration-compose/`.” Only afterward does step 3 say Sam must first land `002`, then Alex must pull and generate `003-integration-compose`.
- **Location:** `docs/tutorials/module-team-hello-world.md`, Part 5 steps 1–3.
- **Fix:** End Sam’s step by landing `002`. Then instruct Alex to pull updated `main`, author/import his plan if needed, and generate `003` exactly once. Do not present Alex’s generation before that synchronization point.

## Issue 3: The consumer-bootstrap Getting Started document does not link both required tutorials

- **Category:** Completeness
- **Severity:** Major
- **Details:**
  - **Violation:** Step 5 requires linking “both tutorials from the Getting Started surface / quick-start and the consumer-bootstrap docs.”
  - **Impact:** Newly scaffolded consumer repositories expose the walkthrough but not the reusable review prompt, leaving the required graduation/coaching path undiscoverable from that onboarding surface. The claimed onboarding-link deliverable is incomplete.
  - **Evidence:** `getting-started.md.template` contains a direct URL only to `module-team-hello-world.md`. It contains no link to `module-team-hello-world-review-prompt.md`. The same omission is propagated to both cold-start fixtures and the bundled template.
- **Location:** `docs/templates/consumer-bootstrap/getting-started.md.template`, Section 2; generated full/lightweight fixtures.
- **Fix:** Add a direct companion link to `docs/tutorials/module-team-hello-world-review-prompt.md` alongside the walkthrough link, then regenerate the bundled template and cold-start fixtures.

## Issue 4: Remote-branch scope reviews are diffed against potentially stale local `main`

- **Category:** Correctness
- **Severity:** Major
- **Details:**
  - **Violation:** The reusable routed review must provide reliable evidence for directory discipline on teammates’ remote branches and must not guess when evidence gathering fails.
  - **Impact:** After another teammate advances `origin/main`, `git diff main...origin/session-set/X` can attribute intervening trunk changes to that session branch or otherwise inspect the wrong comparison range. This can produce false scope violations or miss current ones. A failed fetch is silently ignored, so the model may confidently review stale remote refs.
  - **Evidence:** The script runs:
    ```python
    sh("git", "fetch", "--all", "--prune")
    ```
    but discards its output and return status. Every branch is then compared using:
    ```python
    sh("git", "diff", f"main...{branch}", "--name-only")
    ```
    rather than a fetched remote base such as `origin/main`. `sh()` also does not expose the subprocess return code.
- **Location:** `docs/tutorials/module-team-hello-world-review-prompt.md`, routed evidence-gathering script.
- **Fix:** Check and record the fetch exit status. When available, use the fetched default-remote base (`origin/main`) for remote and local session-branch comparisons; otherwise disclose that branch evidence may be stale and cap the affected principles at `ADVISORY`.

## Issue 5: Tag range evidence incorrectly pairs releases from different module tag families

- **Category:** Correctness
- **Severity:** Major
- **Details:**
  - **Violation:** Principle 6 explicitly permits both repository-wide tags and per-module tags such as `<slug>-vX.Y.Z`, while requiring evidence-cited conclusions about what each release added.
  - **Impact:** In a repository with independently tagged modules, the script generates meaningless cross-module ranges—for example, the latest `clock` tag against the first `greeter` tag. A routed model can then report false ancestry or unrelated-feature findings for otherwise valid releases.
  - **Evidence:** The evidence script globally sorts every tag and pairs adjacent entries:
    ```python
    tags = sh("git", "tag", "-l", "--sort=version:refname").split()
    for older, newer in zip(tags, tags[1:]):
        sh("git", "log", "--oneline", f"{older}..{newer}")
    ```
    It does not group `clock-v*`, `greeter-v*`, and repository-wide `v*` into separate release series, despite Principle 6 declaring all of those schemes valid.
- **Location:** `docs/tutorials/module-team-hello-world-review-prompt.md`, routed evidence script and Principle 6.
- **Fix:** Parse semver tag families and compare consecutive versions only within the same family. Also gather an explicit ancestry result such as `git merge-base --is-ancestor <older> <newer>` for every valid pair.

## Issue 6: The branch-protection instructions leave the path-filter job fail-open

- **Category:** Correctness
- **Severity:** Major
- **Details:**
  - **Violation:** The walkthrough claims PRs require green CI and says a failing check will block merging.
  - **Impact:** The module jobs depend on the `changes` filter deciding which module changed. If that filter job fails, dependent conditional module jobs can be skipped, and skipped required jobs satisfy GitHub’s required-check handling. Because the tutorial selects only `greeter`, `clock`, and `integration` as required checks, the failed filter itself need not block the PR.
  - **Evidence:** Part 7 introduces a separate “`changes` filter job and the per-module jobs,” but step 4 instructs users to select only:
    > “the module jobs (`greeter`, `clock`, `integration`)”
    
    It does not require `changes` or a stable aggregate gate, despite claiming “a failing check actually blocks a merge.”
- **Location:** `docs/tutorials/module-team-hello-world.md`, Part 7 steps 2 and 4; self-check checklist.
- **Fix:** Require the `changes` job as well, or preferably add one always-running aggregate PR gate that depends on the filter and all applicable module jobs and fails whenever evidence generation or any selected module test fails. Require that stable aggregate check in branch protection.