# Module-Organized Workflow Review Prompt

This document contains a reusable AI prompt for reviewing how well a team is practicing the Dabbler module-organized workflow. It is intended to be run by an AI assistant with access to a team's code repository to provide evidence-based, coaching-tone feedback on workflow hygiene, not on code quality. This review is a practical application of the concepts introduced in the [module-organized projects primer](../planning/module-organized-projects-primer.md) and is a useful graduation check after completing the [team hello world walkthrough](./module-team-hello-world.md).

## When to run it

*   **After the walkthrough:** Run this review as a final check to ensure the team has mastered the core concepts from the `module-team-hello-world.md` tutorial.
*   **On a cadence:** On a real project, run this monthly or quarterly to spot workflow drift before it becomes a problem.
*   **After onboarding:** Run it a few weeks after a new teammate joins to check their understanding and integration into the team's workflow.
*   **Before enforcement:** Run it as a final advisory check before enabling CI jobs that hard-block PRs for scope violations.

## How to run it

There are two primary ways to execute this review prompt.

### (a) Paste into a path-aware AI agent

If you are using an AI assistant that can read files from your local workspace (e.g., Cursor, Claude Code, Gemini Code Assist, Copilot Workspace), the process is simple:

1.  Open the AI assistant at the root of your repository.
2.  Copy the entire prompt from the fenced code block below.
3.  Paste it into the chat input and send. The agent will read the specified files and run the commands itself.

### (b) Route it through the ai_router

On Full-tier repos you can run the review through the router, which picks the model and logs cost to `ai_router/router-metrics.jsonl`. One important difference from path (a): **a routed API model cannot read your disk**, so the script below first gathers the evidence the prompt names (file contents plus git command output) and appends it to the prompt as an evidence bundle.

1.  Create a Python script (e.g., `run_review.py`) at the repo root.
2.  Paste the following code, replacing the `PROMPT` placeholder with the full text from the block below.
3.  Run it with the workspace venv: `.venv\Scripts\python.exe run_review.py` on Windows, `.venv/bin/python run_review.py` on macOS/Linux.

```python
import glob
import io
import os
import re
import subprocess
from datetime import date

from ai_router import route

# Copy the full prompt from the '~~~' block below into this string.
PROMPT = """
<PASTE THE ENTIRE PROMPT TEXT HERE>
"""


def sh(*args):
    try:
        p = subprocess.run(args, capture_output=True, text=True)
        return p.stdout or p.stderr
    except OSError as err:
        return f"(command unavailable: {err})"


# Gather the evidence the prompt names (a routed model cannot read files).
paths = (
    ["docs/modules.yaml", ".github/CODEOWNERS"]
    + sorted(glob.glob("docs/session-sets/*/spec.md"))
    + sorted(glob.glob("docs/modules/*/project-plan.md"))
    + sorted(glob.glob(".github/workflows/*.yml"))
    + sorted(glob.glob(".github/workflows/*.yaml"))
)
evidence = []
for p in paths:
    try:
        evidence.append(f"--- {p} ---\n" + io.open(p, encoding="utf-8").read())
    except OSError as err:
        evidence.append(f"--- {p} --- (unreadable: {err})")
# Fetch first, and RECORD the outcome — a silent fetch failure would let
# the review confidently score stale remote refs.
fetch = subprocess.run(["git", "fetch", "--all", "--prune"],
                       capture_output=True, text=True)
evidence.append("--- git fetch --all --prune (freshness; nonzero = STALE remote evidence) ---\n"
                + f"exit={fetch.returncode}\n" + (fetch.stdout + fetch.stderr or "(ok)"))
evidence.append("--- git log --oneline --graph --decorate --all -50 ---\n"
                + sh("git", "log", "--oneline", "--graph", "--decorate",
                     "--all", "-50"))
evidence.append("--- git branch -a ---\n" + sh("git", "branch", "-a"))
# Dated branch tips: Principles 1 and 7 score branch AGE (stale/drifted
# branches), which names and an undated graph cannot show.
evidence.append("--- branch tips: name, sha, committer date ---\n"
                + sh("git", "for-each-ref", "refs/heads", "refs/remotes",
                     "--format=%(refname:short) %(objectname:short) %(committerdate:iso-strict)"))
evidence.append("--- tags: name, type, peeled target ---\n"
                + sh("git", "for-each-ref", "refs/tags",
                     "--format=%(refname:short) %(objecttype) %(*objectname:short)"))
# Compare consecutive releases WITHIN a tag family only (repo-wide `v1.2.3`
# and per-module `clock-v1.2.3` are separate series — pairing across
# families would fabricate meaningless ranges).
tags = sh("git", "tag", "-l", "--sort=version:refname").split()
families = {}
for t in tags:
    m = re.match(r"^(.*?)v\d", t)
    families.setdefault(m.group(1) if m else "", []).append(t)
for fam_tags in families.values():
    for older, newer in zip(fam_tags, fam_tags[1:]):
        evidence.append(f"--- git log --oneline {older}..{newer} (what {newer} adds) ---\n"
                        + sh("git", "log", "--oneline", f"{older}..{newer}"))
        rev = sh("git", "rev-list", f"{newer}..{older}")
        evidence.append(f"--- ancestry {older} -> {newer} ---\n"
                        + (f"NOT an ancestor; commits only in {older}:\n{rev}"
                           if rev.strip() else f"{older} is an ancestor of {newer}"))
# Diff every session branch against the FRESHEST main we have. Enumerate
# LOCAL AND REMOTE branches — a teammate's pushed branch is exactly where
# a scope violation hides. Skip main, origin/HEAD, and remote duplicates
# of local branches.
base = "origin/main" if sh("git", "rev-parse", "--verify", "-q",
                           "origin/main").strip() else "main"
evidence.append(f"--- scope-diff base: {base} ---\n(diffs below use {base})")
locals_ = set(sh("git", "for-each-ref", "refs/heads",
                 "--format=%(refname:short)").split())
remotes = [b for b in sh("git", "for-each-ref", "refs/remotes",
                         "--format=%(refname:short)").split()
           if not b.endswith("/HEAD")]
branches = sorted(locals_ - {"main"}) + sorted(
    b for b in remotes
    if b.split("/", 1)[-1] not in locals_ and b.split("/", 1)[-1] != "main")
for branch in branches:
    evidence.append(f"--- git diff {base}...{branch} --name-only ---\n"
                    + sh("git", "diff", f"{base}...{branch}", "--name-only"))
    evidence.append(f"--- divergence {base}...{branch} (behind / ahead) ---\n"
                    + sh("git", "rev-list", "--left-right", "--count",
                         f"{base}...{branch}"))
# PR review data, best-effort: needs the gh CLI, a GitHub remote, and auth.
# A failure here just means "review evidence unavailable" — the prompt
# scores the owner-review principle ADVISORY in that case, never guesses.
evidence.append("--- gh pr list (best-effort PR review data) ---\n"
                + sh("gh", "pr", "list", "--state", "merged", "--limit", "30",
                     "--json", "number,title,author,files,reviews,reviewDecision"))

content = (PROMPT
           + "\n\n# EVIDENCE BUNDLE (gathered by the caller)\n\n"
           + "\n\n".join(evidence))

result = route(content=content, task_type="analysis")

# Persist the output with encoding="utf-8" BEFORE printing anything.
output_path = f"docs/reviews/module-workflow-review-{date.today()}.md"
os.makedirs(os.path.dirname(output_path), exist_ok=True)
with open(output_path, "w", encoding="utf-8") as f:
    f.write(result.content)

print(f"Review saved to {output_path} "
      f"(model={result.model_name}, cost=${result.total_cost_usd:.2f})")
```

## The prompt
~~~
You are an expert software engineering coach specializing in monorepo module workflows and trunk-based team practice. Your task is to review the current state of this repository against the seven principles of the module-organized workflow.

Your tone must be that of a helpful coach, not a scolding linter. Your feedback must be specific, evidence-based, and actionable. You are reviewing the *workflow practice*, not the quality of the production code.

**Process:**

First, gather evidence by reading the specified files and running the git commands from the repository root. If an "EVIDENCE BUNDLE" section is appended below this prompt, treat it as the gathered evidence and work from it instead of reading files yourself. Do not hallucinate or guess file contents. If a file or command output is unavailable, state that.

Second, for each of the seven principles below, evaluate the evidence you gathered.

Third, generate a single Markdown report with the exact structure specified at the end. Every claim you make MUST be backed by a citation from the evidence (e.g., a file path, branch name, tag name, or command output snippet).

**1. Evidence Gathering**

Read the following files and run these shell commands from the repository root:

*   **File:** `docs/modules.yaml`
    *   **Extract:** The list of all declared modules, including their `slug`, `title`, `codeRoots`, `planPath`, and any `touches` lists.

*   **File Pattern:** `docs/session-sets/*/spec.md`
    *   **Extract:** For every session set, its directory name (which is the `sessionSetName`) and its `module:` stamp value. Note any `spec.md` files that are missing the `module:` stamp.

*   **File Pattern:** `docs/modules/<slug>/project-plan.md`
    *   **Extract:** Confirm that a plan file exists and is non-empty for each module slug found in `modules.yaml`.

*   **File:** `.github/CODEOWNERS`
    *   **Extract:** The ordered list of all active (uncommented) ownership rules. ORDER MATTERS: GitHub applies the LAST matching pattern for a path, and later rules REPLACE (not add to) earlier owners. When scoring coverage, resolve each path of interest against the rules bottom-up and record the final matching pattern and its effective owner set.

*   **File Pattern:** `.github/workflows/*.yml` or `.github/workflows/*.yaml`
    *   **Extract:** The structure of CI jobs. Specifically look for (a) jobs that are scoped to run only on changes to specific module `codeRoots` and (b) an unconditional, all-modules integration job that runs on every push to the `main` branch.

*   **Git Commands:**
    ```shell
    # Recent history and branch structure — DECORATED, so you can see which
    # commits the tags and branches actually point at
    git fetch --all --prune
    git log --oneline --graph --decorate --all -50
    git branch -a

    # DATED branch tips + per-branch divergence — branch AGE and drift are
    # what Principles 1 and 7 score, and names alone cannot show them:
    git for-each-ref refs/heads refs/remotes --format="%(refname:short) %(objectname:short) %(committerdate:iso-strict)"
    git rev-list --left-right --count origin/main...<branch>

    # Tags: names, types (annotated vs. lightweight), and the commit each
    # annotated tag peels to
    git tag -l
    git for-each-ref refs/tags --format="%(refname:short) %(objecttype) %(*objectname:short)"

    # Tag ancestry: compare consecutive release tags WITHIN the same tag
    # family only (repo-wide `vX.Y.Z` and per-module `<slug>-vX.Y.Z` are
    # separate series — never pair across families). For each in-family
    # pair, list what the newer tag adds and prove ancestry (empty
    # rev-list = older is an ancestor of newer):
    git log --oneline vX.Y.Z..vX.Y.Z+1
    git rev-list vX.Y.Z+1..vX.Y.Z

    # Per-branch diffs to check for scope bleed, against the FRESHEST main
    # available (origin/main after a successful fetch; if the fetch failed,
    # say so and treat branch evidence as possibly stale — ADVISORY).
    # Enumerate BOTH local and remote session-set branches (skip
    # origin/HEAD and remote duplicates of local branches) — a teammate's
    # pushed branch is exactly where a violation hides:
    git for-each-ref refs/heads refs/remotes --format="%(refname:short)"
    # For each branch that is not main/origin/main:
    git diff origin/main...<branch> --name-only
    ```

*   **PR review data (best-effort):** if the `gh` CLI is available, the repo has
    a GitHub remote, and you are authenticated, run:
    ```shell
    gh pr list --state merged --limit 30 --json number,title,author,files,reviews,reviewDecision
    ```
    If this fails for any reason, treat completed-review evidence as
    UNAVAILABLE. Local git artifacts (CODEOWNERS contents, merge-commit
    messages) are never proof that a review happened.

**2. Principles for Review**

Evaluate the gathered evidence against these seven principles.

**Principle 1: Trunk Hygiene**
*   **Check:** The `main` branch should be the only long-lived branch. All other branches should be short-lived feature or session-set branches that are created, merged to `main`, and then deleted. Look for stale, unmerged branches or parallel long-lived branches like `develop`, `staging`, or `release/*`. Judge "stale" from the DATED branch-tip evidence (committer dates and divergence counts), not from names.
*   **Good:** `git branch -a` shows `main` and a small number of active session-set branches whose tip dates are recent. `git log` shows frequent, small merges into `main`.
*   **Bad:** `git branch -a` shows branches like `develop`, `release-v1.2`, or user-named branches (`jane-feature-x`) whose tip dates are weeks old.
*   **Evidence rule:** without dated branch-tip evidence, you cannot score branch age — cap this principle at `ADVISORY` and name the missing command.

**Principle 2: Name Uniqueness & `module:` Correctness**
*   **Check:** Every session-set directory name under `docs/session-sets/` must be globally unique. Every `spec.md` file should contain a `module:` stamp, and its value must be a valid module `slug` from `docs/modules.yaml`.
*   **Good:** All session sets are stamped with a valid module slug.
*   **Bad:** Session sets are missing the `module:` stamp (they are "unstamped") or use a slug not declared in the manifest. Unstamped sets are a smell of forgotten intent.

**Principle 3: Directory Discipline vs `codeRoots`**
*   **Check:** For each session-set branch (LOCAL AND REMOTE — see the evidence section), analyze the changed files (`git diff`). A changed path is IN SCOPE when it falls under any of:
    1.  the owning module's `codeRoots` (per the set's `module:` stamp);
    2.  the set's own `docs/session-sets/<set-name>/` directory (and the module's own `docs/modules/<slug>/` folder);
    3.  **the `touches` exception:** the `codeRoots` of modules explicitly named in the owning module's `touches:` list — that is precisely what `touches` sanctions. (Whether the touched owners then actually reviewed the work is Principle 4's question, not this one's.)
*   **Good:** A branch for a set stamped `module: auth` only touches files within the `auth` module's `codeRoots`; or a branch owned by a `touches: [auth, billing]` integration module edits `auth` and `billing` code — sanctioned by rule 3.
*   **Bad:** A branch for a set stamped `module: auth` also modifies files in the `billing` module's `codeRoots`, and `auth` declares no `touches: [billing]`. This is the scope violation this workflow prevents. Cite the session-set name and the out-of-bounds file paths.

**Principle 4: Integration `touches` & Owner Review**
*   **Check:** Work that intentionally spans multiple modules must belong to a module whose declaration in `docs/modules.yaml` includes a `touches:` list naming the other modules — and the touched modules' owners must actually review that work. Keep four different facts separate, and say which ones you have evidence for:
    1.  **Coverage** — the integration module's paths resolve (last-match-wins — see Principle 5) to an effective owner set that includes the touched modules' owners. Proven by `.github/CODEOWNERS` contents alone, but only via that ordered resolution — the mere existence of a listing rule is not coverage if a later rule overrides it.
    2.  **Auto-request** — GitHub requests those owners on a PR (never the PR's own author). Follows from coverage, but only for hosted PRs.
    3.  **Enforcement** — branch protection actually requires approvals (or code-owner reviews) before merge. Proven only by protection/ruleset data or PR `reviewDecision` output.
    4.  **Completed approvals** — the touched owners approved specific PRs. Proven only by PR review data (the `gh pr list` output above).
*   **Good:** A set in the `reporting` module, which has `touches: [auth, billing]`, changes `auth` and `billing` code; CODEOWNERS composes `@auth-team` and `@billing-team` on the relevant paths (coverage), and the gathered PR data shows both teams' approving reviews on that PR (completed approvals).
*   **Bad:** Cross-module changes without a `touches` declaration; CODEOWNERS not composing the touched owners; or — an evidence failure, not a workflow failure — claiming owner review happened based on CODEOWNERS contents or a merge-commit message alone.
*   **Evidence rule:** with no PR review data, cap this principle at `ADVISORY`: report coverage (fact 1) from CODEOWNERS, state that request/enforcement/approval evidence is unavailable, and name what would settle it (an authenticated `gh` run, or a screenshot of the PR's review panel). Never infer completed reviews from local git artifacts.

**Principle 5: CODEOWNERS Coverage**
*   **Check:** For every `codeRoot` declared in `docs/modules.yaml`, every module documentation folder (`docs/modules/<slug>/`), and the critical shared files (`docs/modules.yaml`, `.github/` workflow files): resolve the path against the CODEOWNERS rules using **last-match-wins** (GitHub applies the last matching pattern; later rules replace earlier owners entirely) and check that the EFFECTIVE owner set is the intended one. A module rule that a later, broader rule overrides is a covered-looking blind spot.
*   **Good:** Every path of interest resolves to the intended effective owners; the report cites the final matching pattern for each.
*   **Bad:** A module's `codeRoot` has no matching rule — or has one that a later rule overrides, so the module owner is not in the effective owner set. For example, with `services/greeter/ @greeter-team` followed by `services/ @platform-team`, greeter's effective owner is only `@platform-team`.
*   **Scope rule:** this principle scores COVERAGE of the mapping file only. Never claim here that CODEOWNERS "ensures" or "blocks" anything — whether reviews are requested, required, or actually happened is Principle 4's four-fact question, and enforcement claims need protection/ruleset or PR evidence.

**Principle 6: Tag Correctness / Production-as-a-Tag**
*   **Check:** Releases must be marked with ANNOTATED git tags (`objecttype` is `tag`), not lightweight tags (`objecttype` is `commit`). The tags should follow a consistent semver scheme (e.g., `vX.Y.Z` for the whole repo or `<slug>-vX.Y.Z` per-module). Hotfixes should branch from a tag, not from `main`, carry the new tag ON the fixed commit (so the new release is exactly the old release plus the fix), and be merged back to `main` after release.
*   **Tag ancestry — check it, don't assume it:** use the decorated graph log and the per-tag range logs from the evidence section to verify WHERE each tag points. A patch tag (`vX.Y.Z+1`) whose range log over the previous tag (`git log vX.Y.Z..vX.Y.Z+1 --oneline`) contains anything beyond the fix commits — e.g. unrelated feature work that was sitting on `main` — is the exact failure this principle exists to catch.
*   **Good:** `git for-each-ref` shows annotated tags with a clear scheme, and the range log between consecutive tags shows only the intended commits.
*   **Bad:** Lightweight tags, inconsistent schemes, long-lived `release/*` branches, or a patch tag placed on post-merge `main` that sweeps in unreleased work.
*   **Evidence rule:** if the evidence at hand does not show tag targets and ancestry (no decorated log, no range logs), cap this principle at `ADVISORY` and say which command would settle it. Never write "presumably" — an unverifiable claim is unavailable evidence.

**Principle 7: Integration-Bomb Symptoms**
*   **Check:** This is a meta-principle looking for signs of deferred integration pain. Look for multiple completed but unmerged session-set branches piling up. Check for a disabled or missing all-modules integration job in CI for the `main` branch. Scan for branches that have drifted from `main` for more than a week or two — judge drift from the dated branch tips and the per-branch divergence counts (behind/ahead), not from names or an undated graph.
*   **Good:** The `main` branch is actively updated, session-set branches are merged quickly (recent tip dates, small divergence counts), and a CI job validates the entire integrated codebase on every push to `main`.
*   **Bad:** A "merge convoy" of multiple branches waiting to be merged, indicating fear of integration. A disabled CI job is a major red flag. Prioritize recent evidence over ancient history.
*   **Evidence rule:** without dated branch-tip and divergence evidence, the drift half of this principle is unscoreable — cap at `ADVISORY` and name the missing command.

**3. Output Format**

Produce a single Markdown document. Do not include any text before the first heading. Your output must follow this structure EXACTLY:

```markdown
# Module-Organized Workflow Review

[A one-paragraph overall summary of the team's workflow health. Start with encouragement and highlight one or two key strengths before identifying the main areas for improvement. Maintain a coaching tone.]

### 1. Trunk Hygiene — <PASS | ADVISORY | FAIL>
*   **Evidence:** [Cite specific branch names from `git branch -a`, and snippets from `git log` showing merge frequency. If no issues, state that `main` is the sole long-lived branch.]
*   **Coaching:** [2-4 sentences of specific, actionable advice. If PASS, commend the team. If FAIL, suggest what to do next, e.g., "Aim to merge or close the stale branches 'X' and 'Y' this week."]

### 2. Name Uniqueness & `module:` Correctness — <PASS | ADVISORY | FAIL>
*   **Evidence:** [Cite the path to any `spec.md` files with missing or invalid `module:` stamps. If all are correct, state so.]
*   **Coaching:** [If issues exist, explain why stamping is important and suggest a next action, e.g., "Review the two unstamped session sets and assign them to the correct module to ensure their work is tracked properly."]

### 3. Directory Discipline vs `codeRoots` — <PASS | ADVISORY | FAIL>
*   **Evidence:** [This is critical. If a violation is found, cite the branch name, the session-set name, the owning module, and the exact file paths that were modified outside the module's declared `codeRoots`.]
*   **Coaching:** [Explain the risk of scope creep. Advise on how to fix it, e.g., "The set 'add-user-avatar' in the 'profile' module modified files in the 'notifications' module. This work should be moved to a dedicated integration set owned by a module with a `touches: [notifications]` declaration."]

### 4. Integration `touches` & Owner Review — <PASS | ADVISORY | FAIL>
*   **Evidence:** [Cite the `touches` declarations and the CODEOWNERS coverage of the integration paths. Cite completed approvals ONLY from gathered PR review data; if that data is unavailable, say so, score ADVISORY, and name what would settle it. Never cite a merge-commit message as proof of review.]
*   **Coaching:** [Reinforce the importance of making dependencies explicit and of the touched owners actually approving. If there's a gap, recommend updating `modules.yaml` / `CODEOWNERS`, or tightening branch protection.]

### 5. CODEOWNERS Coverage — <PASS | ADVISORY | FAIL>
*   **Evidence:** [For each `codeRoot` / `docs/modules/<slug>/` / shared path: cite the FINAL matching CODEOWNERS pattern (last-match-wins) and its effective owners. Flag any path with no match — or whose effective owners lost the module owner to a later, broader rule.]
*   **Coaching:** [Explain that missing or overridden ownership leads to missed reviews. Suggest the specific rule to add — or to move above/below the overriding rule.]

### 6. Tag Correctness / Production-as-a-Tag — <PASS | ADVISORY | FAIL>
*   **Evidence:** [Cite `git for-each-ref` for tag types AND the decorated log / per-tag range logs for where tags point and what each release added. A PASS requires ancestry evidence; without it, score ADVISORY and name the missing command. No "presumably".]
*   **Coaching:** [Explain why annotated tags on the right commits are crucial for releases. Recommend a consistent scheme and process for tagging.]

### 7. Integration-Bomb Symptoms — <PASS | ADVISORY | FAIL>
*   **Evidence:** [Cite long-lived, unmerged branches. Mention the status of the all-modules CI job on the `main` branch (present and active, or missing/disabled).]
*   **Coaching:** [Warn about the risks of delayed integration. Suggest concrete actions like establishing a "merge-by-Friday" team norm or prioritizing the fix of a broken integration CI job.]

---

### Top 3 Next Actions

1.  **[Highest impact action]**: Example: "For all new session sets, validate that changes are confined to the owning module's `codeRoots` during code review."
2.  **[Second highest impact action]**: Example: "Add `CODEOWNERS` rules for the two new modules to ensure all PRs get a proper review."
3.  **[Third highest impact action]**: Example: "Review and merge or close the three branches that have been inactive for over two weeks."

```

**Final Rule:** If you cannot find evidence for a principle (e.g., the project is too new to have tags, or you cannot access PR history to confirm reviews), score it as `ADVISORY` and state what evidence would be needed to make a `PASS` or `FAIL` judgment. Do not guess or invent violations. If the repository is small and new, it's acceptable to state that some principles are not yet exercised.
~~~

## Reading the results

The AI's output is designed to be a conversation starter for the team, not a definitive grade. A `FAIL` score with a specific, cited piece of evidence is more valuable than a hollow `PASS`. Focus on the "Coaching" and "Top 3 Next Actions" sections for concrete improvement steps. Recurring low scores on the same principle across multiple reviews usually indicate a workflow or tooling gap (like a missing CI guardrail or an incomplete `CODEOWNERS` file), not a persistent people problem. The entire purpose of this review is to prevent the silent accumulation of risk that leads to an "integration bomb," as described in the [module-organized projects primer](../planning/module-organized-projects-primer.md).
