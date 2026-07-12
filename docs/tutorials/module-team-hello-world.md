# Walkthrough: Your First Three-Person Module-Based Project

This tutorial walks a three-person team (Priya, Sam, and Alex) through their first "Hello World" project using the Dabbler AI Orchestration workflow. It covers project setup, defining work modules, running AI-led development sessions in parallel, and merging work back to the `main` branch using a trunk-based development model with small, safe pull requests.

- **Audience:** A team new to this workflow. You should know basic `git` (commit, push, pull); no prior experience with monorepos, trunk-based development, or AI orchestration is required.
- **Time to complete:** About half a day, including time for the AI agent to complete its work sessions.
- **Read this first:** This tutorial teaches the *how*. For the *why* behind this workflow (monorepos, modules, trunk-based development, tags), read the [Module-Organized Projects Primer](../planning/module-organized-projects-primer.md) first. The formal specification is the [Module-Organized Projects Recommendation](../planning/module-organized-projects-recommendation.md).
- **When you finish:** run the companion [module workflow review prompt](./module-team-hello-world-review-prompt.md) against your repo as a graduation check.

The cast, used throughout:

| Person | Module | Owns the code under | GitHub handle (example) |
| --- | --- | --- | --- |
| Priya | `greeter` | `services/greeter/` | `@priya-gh` |
| Sam | `clock` | `services/clock/` | `@sam-gh` |
| Alex | `integration` | `services/integration/` (composition code; sanctioned to work across the other two via `touches`) | `@alex-gh` |

The finished toy program prints one line, built from two modules: `Hello, world! It is 12:00.`

---

## Part 0 — Prerequisites

Before you begin, every team member needs:

1. **Visual Studio Code** version 1.85 or newer.
2. The **Dabbler AI Orchestration** extension from the VS Code Marketplace.
3. **Python** version 3.10 or newer.
4. An **orchestrator AI agent** installed as a VS Code extension (Claude Code, Codex/GitHub Copilot, or Gemini Code Assist — the workflow is agent-agnostic). The agent must be able to read and write files in your workspace; all three named agents can.
5. **API keys** for the Full tier, set as environment variables: `DABBLER_ANTHROPIC_API_KEY`, `DABBLER_GEMINI_API_KEY`, and `DABBLER_OPENAI_API_KEY`. All three are required so cross-provider verification always has a second provider to route to.
6. A **GitHub repository** the team can push to and administer — either **public**, or on a plan that supports branch protection on private repos (on **GitHub Free, branch protection rules only work on public repositories**; the Part 3 guardrails depend on them).

## Part 1 — Init the trunk

**Where you are:** An empty folder on Priya's machine. Priya drives Parts 1–4; Sam and Alex clone the repository in Part 5.

1. Create the project folder, initialize Git with `main` as the default branch, ignore the virtual environment the extension will create, and make the first commit:

    ```bash
    mkdir hello-modules
    cd hello-modules
    git init -b main
    echo "# hello-modules" > README.md
    echo ".venv/" > .gitignore
    git add README.md .gitignore
    git commit -m "chore: init trunk"
    ```

2. On GitHub, create a new **empty** repository named `hello-modules` (no README, no license — you already committed one locally).

3. Connect and push (replace `your-org` with your account or organization):

    ```bash
    git remote add origin git@github.com:your-org/hello-modules.git
    git push -u origin main
    ```

4. **Give your teammates access.** A fresh repo belongs to its creator alone — nothing later works (pushes, qualifying approvals, CODEOWNERS review requests) until Sam and Alex can write to it. On the repository page: **Settings** > **Collaborators** (or **Collaborators and teams**) > **Add people** — invite `@sam-gh` and `@alex-gh` with the **Write** role, and have them **accept the email invitations** before Part 4. (On an organization repo, granting an existing team Write access does the same job.)

> **Expect:** `main` exists on GitHub with two files. It is not protected yet — Priya still has two solo setup pushes to make (Parts 2–3); protection goes on at the end of Part 3, before any teammate starts work.

## Part 2 — Build project structure

**Where you are:** Priya has the `hello-modules` folder open in VS Code. The repo contains only `README.md` and `.gitignore`.

1. Click the **Dabbler AI Orchestration** icon in the Activity Bar. This opens the **Work Explorer** view.

    > **Expect:** Because the repository has no session sets yet, the Work Explorer shows the two-section **Getting Started form**, and a companion instructions page opens in the editor.

2. In Section 1 of the form, titled **Build project structure**:
    - **Tier:** select **Full** (metered API verification; the **Lightweight** tier is the $0-API-spend alternative — see the extension README for the tradeoff).
    - **Provider access:** leave the default, **direct provider API keys**.
    - **Budget:** enter a not-to-exceed (NTE) cap for verification spend when the form asks. It is saved to `ai_router/budget.yaml`.

3. Click the **Build project structure** button.

    > **Expect:** The scaffold creates:
    > - `.venv/` — a workspace virtual environment with the `ai_router` package installed (ignored by git per Part 1);
    > - `ai_router/` — router configuration, including your `budget.yaml`;
    > - `docs/session-sets/` — the home for all session sets;
    > - AI-agent instruction files at the repo root (e.g. `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`);
    > - two comment-only templates: `.github/CODEOWNERS` and `.github/workflows/monorepo-ci.yml` (deliberately harmless as-is; you adapt them in Part 7).
    >
    > A **System Status strip** appears above the form **only if something is wrong** (a missing provider key, a missing Python) — no strip means a healthy environment.

    > **Good to know:** if the `.venv` setup ever needs repairing later, run **`Dabbler: Install ai-router`** from the Command Palette.

## Part 3 — Define modules with the AI decomposition prompt

**Where you are:** Still Priya, still the Getting Started form. The project structure exists but no modules are declared yet.

1. In Section 2 of the form, titled **Define modules (optional)**, click **Copy AI decomposition prompt**.

    > **Expect:** Two things happen:
    > 1. `docs/modules.yaml` is created from a commented template (the extension only ever writes this file on an explicit action like this click — never just because you opened the repo).
    > 2. A module-decomposition prompt is copied to your clipboard, and a notice tells you to paste it into your AI assistant and **save the file** when it has been filled in.

    > **Good to know:** the **Open modules.yaml** button next to it opens the manifest at any time (also creating it from the template if missing). Both actions are also in the Command Palette as **`Dabbler: Copy Module Decomposition Prompt`** and **`Dabbler: Open modules.yaml`**.

2. Paste the prompt into your AI agent's chat. The agent reads the repository and edits `docs/modules.yaml` in place, preserving the template's header comments. Describe your team when you paste, for example:

    ```text
    <paste the copied prompt>

    Context: three-person team. Priya owns a greeter module (services/greeter),
    Sam owns a clock module (services/clock), and Alex owns a cross-module
    integration module that composes the other two.
    ```

3. Review the agent's edit, then **save `docs/modules.yaml`**. Below the preserved header comments, the `modules:` list should read:

    ```yaml
    modules:
      - slug: greeter
        title: "Greeter"
        codeRoots:
          - services/greeter
        planPath: docs/modules/greeter/project-plan.md
      - slug: clock
        title: "Clock"
        codeRoots:
          - services/clock
        planPath: docs/modules/clock/project-plan.md
      - slug: integration
        title: "Cross-Module Integration"
        codeRoots:
          - services/integration
        planPath: docs/modules/integration/project-plan.md
        touches:
          - greeter
          - clock
    ```

    Two invariants the manifest's header also teaches — they matter for everything that follows:
    - **Session-set names stay globally unique across ALL modules.** `module` is a grouping attribute, never part of a set's identity.
    - **The Work Explorer displays modules in this file's order.**

    A note on the integration entry: it owns its own composition code
    (`services/integration/`), and its `touches` list is what sanctions its
    session sets to *work across* `greeter` and `clock` — and obliges both
    owners to review that work. An integration module that writes no code of
    its own (it only edits the touched modules' code) would instead declare
    `codeRoots: []`; either shape is legal — the discipline is that every
    path a set edits is either in its module's `codeRoots` or sanctioned by
    `touches`.

    > **Good to know:** to add a fourth module later, run **`Dabbler: New Module`** — it appends the manifest entry and writes a plan stub.

4. Commit the scaffold and manifest to `main`:

    ```bash
    git add -A
    git commit -m "chore: scaffold project structure and define modules"
    git push
    ```

5. **Now protect `main`**, so every later change — from anyone, including you — arrives by reviewed pull request. (If GitHub won't apply the rule, check Part 0's plan/visibility prerequisite: on GitHub Free this needs a **public** repo.) On the GitHub repository page:
    - Go to **Settings** > **Branches** and add a branch protection rule for `main`.
    - Check **Require a pull request before merging** (leave the default of 1 required approval).
    - Check **Require status checks to pass before merging**. There are no checks to select yet — GitHub can only list checks it has already seen run, so you will come back and select the CI job names in Part 7, after the first workflow run.
    - If you want the rule to bind repository **administrators** too (it should — Priya is an admin), enable the rule's do-not-allow-bypass / include-administrators option; without it, GitHub lets admins push past the rule.
    - While you are in Settings, also enable **Automatically delete head branches** (under **Settings** > **General**). GitHub then deletes each PR's remote branch on merge — merged branches piling up is exactly the clutter trunk hygiene forbids, and this setting handles the remote half for free. (The local half is one `git branch -d` after each merge; the tutorial reminds you at each spot.)
    - Save the rule. (GitHub's setting names drift over time; the intent is: no direct pushes to `main` for anyone, one approval, green CI.)

    > **Expect:** from this point on, a direct `git push` of a `main` commit is rejected — every later change in this tutorial lands through a pull request.

## Part 4 — The first plan and the first session set (Command Palette)

**Where you are:** Priya, in the main `hello-modules` window. Modules are declared, but there are no plans and no session sets, so the Getting Started form is still showing.

**The key sequencing fact:** the Getting Started form shows only while the repo has **no session sets**; the Work Explorer switches to the module **tree** the moment the first set exists. So the *first* plan and *first* session set are created from the **Command Palette**, which works while the form is still up. From the second module onward you will use the tree's one-click row actions instead (Part 5).

1. Author the greeter plan. Ask your AI agent in chat, in your own words — for example:

    ```text
    Write a short project plan for the greeter module and save it to
    docs/modules/greeter/project-plan.md. Scope: a greet() function in
    services/greeter/ that returns "Hello, world!", plus a unit test.
    ```

    Save the file if your agent leaves it open as an edit.

    > **Good to know:** if you already have a plan as a Markdown file, **`Dabbler: Import Project Plan`** does the same job without the AI: it asks which module you are importing for (pick **greeter**), opens a file picker, and copies your chosen `.md` file to that module's `planPath` (`docs/modules/greeter/project-plan.md`).

2. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run **`Dabbler: Generate Session-Set Prompt`**.

3. A module picker lists the three declared modules. Pick **greeter**.

    > **Expect:** a notice that the session-set generation prompt was copied to your clipboard.

4. Paste the prompt into the AI agent chat. The agent reads `docs/modules/greeter/project-plan.md` and writes one session-set folder — expect `docs/session-sets/001-greeter-hello/` containing `spec.md` and `session-state.json`. For this toy project, one set with one session is plenty.

5. Review what the agent wrote before accepting it. Check:
    - the folder name starts with a zero-padded number and includes the module slug (the recommended naming convention, e.g. `001-greeter-hello`);
    - `spec.md`'s configuration block contains `module: greeter` (the prompt hard-requires it);
    - `session-state.json` says `"status": "not-started"`.

    > **Expect:** as soon as the first set exists on disk, the Work Explorer switches from the Getting Started form to the module **tree**. If you don't see it within a few seconds, run **`Dabbler: Refresh Work Explorer`**.

6. Land the plan + set on `main` — the first PR under the new branch protection. (Don't name this branch `session-set/001-greeter-hello`: that name is reserved for the *work* branch the worktree tooling creates in Part 6; this is just the authoring PR.)

    ```bash
    git switch -c authoring/001-greeter-hello
    git add docs/modules/greeter/project-plan.md docs/session-sets/001-greeter-hello
    git commit -m "docs: greeter plan + session set 001-greeter-hello"
    git push -u origin authoring/001-greeter-hello
    git switch main
    ```

    Open the PR on GitHub and have Sam or Alex approve it — reviewing happens in the browser, so they don't need a clone yet. Merge (GitHub deletes the remote branch automatically per the Part 3 setting), then tidy up locally on `main`:

    ```bash
    git pull
    git branch -d authoring/001-greeter-hello
    ```

    > **One rule for every cleanup in this tutorial:** the steps assume GitHub's default **Create a merge commit** strategy. If your repo merges PRs by **squash** or **rebase** instead, the merged commit gets a new identity, so `git branch -d` will refuse with "not fully merged" at *every* cleanup point from here on — that is git protecting you, not an error in the flow. Verify the PR's changes are on your pulled `main`, then delete with `git branch -D`.

    > **Expect:** `origin/main` now contains the greeter plan and `001-greeter-hello`. (The scaffolded CI's placeholder job runs and passes on the PR — the real per-module jobs arrive in Part 7.)

## Part 5 — Meet the tree ("the tree is the checklist")

**Where you are:** Priya's plan + first set are merged to `origin/main` (Part 4 step 6). Sam and Alex now clone the repo and open it in VS Code. Everyone sees the same tree.

One per-machine setup step first: the `.venv` is ignored by git (Part 1) and exists only on Priya's machine, so **Sam and Alex each run `Dabbler: Install ai-router` from the Command Palette once** after opening their clone — it detects or creates the local `.venv` with the router package. The Work Explorer tree needs no setup, but the worktree commands in Parts 6 and 9 do.

What the Work Explorer now shows, top to bottom:

- One collapsible group per module, in manifest order: **Greeter**, **Clock**, **Cross-Module Integration**.
- Under **every** module, two permanent child nodes:
    - **Plan** — shows whether that module's plan file is present or missing;
    - **Session sets** — shows *blocked until plan* / *empty* / or, once sets exist, the four status buckets nested under it: **In Progress**, **Not Started**, **Complete**, **Cancelled**.
- Priya's `001-greeter-hello` sits under **Greeter** > **Session sets** > **Not Started**. Clock's and Integration's **Plan** nodes still say missing.
- Hovering or keyboard-focusing a module row reveals its action strip: **AI Plan**, **Import Plan…**, **Open Plan**, **AI Sets**. The same actions are on the row's right-click menu.

> **Good to know:** a session set whose `spec.md` has no `module:` stamp never disappears — it shows under a group named **Unassigned** (or **Default**, when it is the only group in the repo). If you ever see **Unassigned**, someone forgot a stamp.

Now Sam and Alex self-serve from their own rows:

Do these two in order — **Sam first, then Alex** — because the AI picks each new set's number from the sets it can see: two people generating from the same `main` snapshot can both get `002`. (Collisions are fail-loud, not silent — the workspace refuses duplicate set names, and the slug-in-name convention keeps even racing sets from producing the same *name* — but serializing keeps the numbering tidy.)

1. **Sam (Clock) — plan, generate, land:**
    - Hover the **Clock** row and click **AI Plan**.

        > **Expect:** a notice that the plan-authoring prompt was copied to the clipboard.

    - Paste it into the AI chat; the agent writes `docs/modules/clock/project-plan.md` (scope: a `now_text()` function in `services/clock/` returning the time as `HH:MM`, plus a test). Save it.
    - Click **AI Sets** on the **Clock** row, paste the copied prompt, and let the agent write `docs/session-sets/002-clock-hello/`.
    - Land the plan + set on `main` as a small PR, exactly like Priya did in Part 4:

      ```bash
      git switch -c authoring/002-clock-hello
      git add docs/modules/clock/project-plan.md docs/session-sets/002-clock-hello
      git commit -m "docs: clock plan + session set 002-clock-hello"
      git push -u origin authoring/002-clock-hello
      git switch main
      ```

      Open the PR, have a teammate approve, merge — then sync and clean up (a browser merge updates only `origin/main`):

      ```bash
      git pull --ff-only
      git branch -d authoring/002-clock-hello
      ```

2. **Alex (Integration) — after Sam's PR merges:**
    - Pull `main` first (`git pull`) — Alex's AI now sees `001` and `002`, so his set becomes `003`.
    - Same two clicks on the **Cross-Module Integration** row: **AI Plan** (scope: compose greeter + clock into one program printing `Hello, world! It is HH:MM.`), then **AI Sets** producing `docs/session-sets/003-integration-compose/`.
    - **Declare the dependency.** Integration work needs the other two modules' code to exist on `main` first, and the framework has a first-class way to say so: `prerequisites:` in the set's configuration block. Tell the AI when you paste the **AI Sets** prompt ("this set depends on 001-greeter-hello and 002-clock-hello being complete"), or add it to the generated `spec.md` by hand:

      ```yaml
      prerequisites:
        - slug: 001-greeter-hello
          condition: complete
        - slug: 002-clock-hello
          condition: complete
      ```

    - Land the plan + set on `main` as a small PR, same shape as Sam's:

      ```bash
      git switch -c authoring/003-integration-compose
      git add docs/modules/integration/project-plan.md docs/session-sets/003-integration-compose
      git commit -m "docs: integration plan + session set 003-integration-compose"
      git push -u origin authoring/003-integration-compose
      git switch main
      ```

      PR, approval, merge, then `git pull --ff-only && git branch -d authoring/003-integration-compose`.

    > **Expect:** clicking **AI Sets** on a module whose **Plan** node still says missing pops a warning naming the missing plan path and offering **Import Plan** — author the plan first. And once the prerequisites are declared, Alex's set renders as blocked in the tree (its row offers **Open Prerequisite Spec**) until both dependencies complete.

## Part 6 — Worktrees and running sessions

**Where you are:** All three modules have a plan and a not-started session set on `main`. Time to do the work — Priya and Sam in parallel, without stepping on each other; Alex's integration set waits for its prerequisites (it composes code that does not exist on `main` yet — he joins in Part 9, on a branch cut from the updated `main`).

Each session set runs on its own short-lived branch, checked out in its own **git worktree** — a separate folder sharing the same clone, so nobody has to stash or switch branches.

1. Priya and Sam each open a terminal at the repo root and open the worktree for their own set:

    ```bash
    # Priya — Windows:
    .venv\Scripts\python.exe -m ai_router.worktree open 001-greeter-hello
    # Priya — macOS/Linux:
    .venv/bin/python -m ai_router.worktree open 001-greeter-hello
    ```

    Sam runs the same command with `002-clock-hello`.

    > **Expect:** a sibling folder appears next to the repo — `hello-modules-worktrees/001-greeter-hello/` — containing a checkout on the new branch `session-set/001-greeter-hello`. The main checkout stays on `main` and never moves.

2. Open the worktree folder in a **new VS Code window**.

3. In the Work Explorer, left-click your set's row (under **Not Started**).

    > **Expect:** the row's spec opens, and a starter line is copied to your clipboard with a confirmation toast. The line reads exactly:
    >
    > ```text
    > Start the next session of `001-greeter-hello`.
    > ```

4. In the worktree window's AI chat, paste that line and send it. The AI-led session takes it from there: it registers the session, implements the module (code + test), runs verification, and commits to the session branch — you watch and review. The session lifecycle (register → work → verify → document → close) is the standard Dabbler workflow; see the [AI-Led Session Workflow](../ai-led-session-workflow.md) for depth.

## Part 7 — CODEOWNERS + monorepo CI

**Where you are:** The AI sessions are running (or done) in their worktrees. Meanwhile, one person — Priya — activates the ownership and CI guardrails in the main checkout, as a small PR to `main`.

1. Open `.github/CODEOWNERS`. The scaffolded template's worked example **is this tutorial's cast** — uncomment and adapt it so the active rules read:

    ```text
    services/greeter/          @priya-gh
    docs/modules/greeter/      @priya-gh

    services/clock/            @sam-gh
    docs/modules/clock/        @sam-gh

    services/integration/      @alex-gh @priya-gh @sam-gh
    docs/modules/integration/  @alex-gh @priya-gh @sam-gh

    # Shared conflict-magnets — every module owner reviews:
    docs/modules.yaml          @priya-gh @sam-gh @alex-gh
    .github/                   @priya-gh @sam-gh @alex-gh
    ```

    Note the integration rule: Alex owns the folder, but Priya and Sam are listed too — the integration module composes *their* code (`touches: [greeter, clock]`), so the owners of every touched module review its PRs.

2. Open `.github/workflows/monorepo-ci.yml`. The scaffolded template teaches a two-layer contract — **path-scoped module jobs** for fast PR feedback, and the **`all-modules` guardrail** on every push to `main` (the anti-integration-bomb rule: cross-module breakage surfaces on the merge that caused it). Rather than hand-assembling it from the template's two commented examples, replace the whole file with this complete, final workflow for our three modules:

    ```yaml
    name: Monorepo CI

    on:
      push:
        branches: [main]
      pull_request:

    jobs:
      changes:
        runs-on: ubuntu-latest
        permissions:
          contents: read        # declaring ANY permission zeroes the rest;
          pull-requests: read   # checkout needs contents, the filter needs PRs
        outputs:
          greeter: ${{ steps.filter.outputs.greeter }}
          clock: ${{ steps.filter.outputs.clock }}
          integration: ${{ steps.filter.outputs.integration }}
        steps:
          - uses: actions/checkout@v4
          - uses: dorny/paths-filter@v3
            id: filter
            with:
              filters: |
                greeter:
                  - 'services/greeter/**'
                clock:
                  - 'services/clock/**'
                integration:
                  - 'services/integration/**'

      greeter:
        needs: changes
        if: needs.changes.outputs.greeter == 'true'
        runs-on: ubuntu-latest
        steps:
          - uses: actions/checkout@v4
          - name: Test the greeter module (fails on zero tests)
            run: >
              python -c "import sys,unittest;
              s=unittest.defaultTestLoader.discover('services/greeter');
              sys.exit('ERROR: no tests found in services/greeter') if s.countTestCases()==0
              else sys.exit(0 if unittest.TextTestRunner(verbosity=2).run(s).wasSuccessful() else 1)"

      clock:
        needs: changes
        if: needs.changes.outputs.clock == 'true'
        runs-on: ubuntu-latest
        steps:
          - uses: actions/checkout@v4
          - name: Test the clock module (fails on zero tests)
            run: >
              python -c "import sys,unittest;
              s=unittest.defaultTestLoader.discover('services/clock');
              sys.exit('ERROR: no tests found in services/clock') if s.countTestCases()==0
              else sys.exit(0 if unittest.TextTestRunner(verbosity=2).run(s).wasSuccessful() else 1)"

      integration:
        needs: changes
        if: needs.changes.outputs.integration == 'true'
        runs-on: ubuntu-latest
        steps:
          - uses: actions/checkout@v4
          - name: Test the integration module (fails on zero tests)
            run: >
              python -c "import sys,unittest;
              s=unittest.defaultTestLoader.discover('services/integration');
              sys.exit('ERROR: no tests found in services/integration') if s.countTestCases()==0
              else sys.exit(0 if unittest.TextTestRunner(verbosity=2).run(s).wasSuccessful() else 1)"

      all-modules:
        # Runs on every merge to main, NEVER path-filtered.
        if: github.event_name == 'push' && github.ref == 'refs/heads/main'
        runs-on: ubuntu-latest
        steps:
          - uses: actions/checkout@v4
          - name: Test ALL modules (never vacuously green)
            run: |
              if [ ! -d services ]; then
                echo "No services/ on main yet - guardrail passes vacuously."
                exit 0
              fi
              shopt -s nullglob
              dirs=(services/*/)
              if [ ${#dirs[@]} -eq 0 ]; then
                echo "ERROR: services/ exists but has no module directories."
                exit 1
              fi
              for d in "${dirs[@]}"; do
                n=$(python -c "import unittest,sys; sys.stdout.write(str(unittest.defaultTestLoader.discover('${d%/}').countTestCases()))")
                if [ "$n" -eq 0 ]; then
                  echo "ERROR: no tests collected in ${d%/} - every module must be tested."
                  exit 1
                fi
                python -m unittest discover -s "${d%/}" -v
              done
    ```

    Three details worth noticing:
    - Every module with a `codeRoot` gets its own filter + job (the filters mirror `docs/modules.yaml`), so the integration PR in Part 9 is tested before merge too — and the job names (`greeter`, `clock`, `integration`) are exactly what you select as required checks in step 4.
    - **An existing module can't go green while testing nothing.** `unittest discover` exits 0 on "Ran 0 tests" (and top-level discovery does not descend into plain, non-package subfolders), so a naive command can pass vacuously — for example when a PR forgot its promised test. Every module job therefore counts collected tests and fails on zero, and the `all-modules` job applies the same count guard to every `services/` directory that exists. One honest boundary: a module whose directory is *entirely missing* is invisible to this job — that gap is owned by the module's own PR review and by the final self-check item that asserts all three declared `codeRoots` exist on `main`.
    - This guardrails PR merges **before** any module code exists on `main` (the implementation PRs land in Part 8), so the missing-`services/` branch passes vacuously exactly once, at rollout — and says so in the log.

3. Land both files on `main` as a small PR:

    ```bash
    git switch -c chore/guardrails
    git add .github/CODEOWNERS .github/workflows/monorepo-ci.yml
    git commit -m "build: activate CODEOWNERS and monorepo CI"
    git push -u origin chore/guardrails
    ```

    Open the PR on GitHub, have a teammate approve, and merge — then `git switch main && git pull --ff-only && git branch -d chore/guardrails`. From this merge on, the ownership rules and CI jobs are live on `main`.

4. **Finish the Part 3 branch-protection setup.** Now that the workflow has run at least once, GitHub can see the check names. Go back to **Settings** > **Branches** > the `main` rule, and under **Require status checks to pass before merging** search for and select the `changes` filter job **and** the module jobs (`greeter`, `clock`, `integration`). Without this step the checks run but are *not required* — a red check would not block a merge.

    > **Honest limitation (fine for this toy, know it for real projects):** GitHub treats a *skipped* required check as satisfied, and the module jobs are conditional on the `changes` filter — that is what makes path-scoping work at all. Requiring `changes` closes the filter-failure hole, but the airtight production pattern is one always-running aggregate gate job (e.g. `ci-ok`) that `needs:` the filter and every module job, fails if any of them failed, and is the single required check. Worth adopting the day this workflow guards something real.

## Part 8 — Small PRs to main

**Where you are:** Priya's session finished: the `session-set/001-greeter-hello` branch has the greeter code, test, and session artifacts committed. The guardrails PR from Part 7 is merged.

The core habit: **merge a set when it completes.** Small, frequent, boring merges — never a batch.

1. **Priya:** push the session branch and open a PR:

    ```bash
    # from inside the worktree folder
    git push -u origin session-set/001-greeter-hello
    ```

    > **Expect:** the PR triggers the path-scoped **greeter** CI job (the filter matched `services/greeter/**`) — and not clock's. No reviewer is auto-requested by CODEOWNERS: the only owner of the touched paths is Priya herself, and GitHub never requests a review from a PR's own author. Branch protection still wants one approval — Sam gives it.

2. Merge when green, then sync the main checkout (the browser merge only moved `origin/main`) and close the worktree:

    ```bash
    # from the main repository root:
    git switch main
    git pull --ff-only
    # Windows:
    .venv\Scripts\python.exe -m ai_router.worktree close 001-greeter-hello
    # macOS/Linux:
    .venv/bin/python -m ai_router.worktree close 001-greeter-hello
    # worktree close leaves the branch for you to delete once merged:
    git branch -d session-set/001-greeter-hello
    git fetch --prune
    ```

    > **Expect:** the merge to `main` runs the **all-modules** job. After the pull, the Work Explorer in the main checkout shows `001-greeter-hello` in the **Complete** bucket under **Greeter** (the tree reads your *local* files — it can't see a merge you haven't pulled).

3. **Sam:** exactly the same flow for `002-clock-hello`: push, PR (clock's job runs; Priya approves), merge, pull `main`, close the worktree.

## Part 9 — The integration set, reviewed by both owners

**Where you are:** `greeter` and `clock` are merged to `main`. Alex's `003-integration-compose` set just unblocked (its prerequisites are complete) — and only now does he start, so his branch is cut from a `main` that already contains both dependencies.

1. **Alex:** pull `main`, then open the worktree and run the session:

    ```bash
    git pull
    # Windows:
    .venv\Scripts\python.exe -m ai_router.worktree open 003-integration-compose
    # macOS/Linux:
    .venv/bin/python -m ai_router.worktree open 003-integration-compose
    ```

    Left-click the `003-integration-compose` row, paste the starter line into the worktree window's AI chat, and let the session compose the two modules into `services/integration/` (with a test that exercises the real `greeter` and `clock` code now on the branch).

2. Push `session-set/003-integration-compose` and open the PR.

    > **Expect:** because the merged CODEOWNERS rule for `services/integration/` names `@alex-gh @priya-gh @sam-gh`, GitHub automatically requests reviews from **Priya and Sam** (Alex is the author, so he is not asked to review himself). This is the `touches` discipline in practice: the owners of every composed module see the composition before it lands. One honest nuance: CODEOWNERS *requests* those reviews; branch protection is what *requires* an approval before merge (the one-approval rule from Part 1 — the stricter **Require review from Code Owners** option exists too, but with single-owner modules it can deadlock an owner's own PRs, so this tutorial leaves it off).

3. Priya and Sam approve; CI is green; Alex merges, pulls `main` (`git switch main && git pull --ff-only`), closes his worktree (same `worktree close` command with his slug), and deletes the merged branch (`git branch -d session-set/003-integration-compose && git fetch --prune`).

    > **Expect:** the all-modules job passes on `main` — the composed program's tests ran together for the first time on the merge that composed them.

## Part 10 — Tag, deploy, hotfix, rollback

**Where you are:** All three sets are **Complete** in the tree, everything is merged, `main` is green. Time to ship — and practice the two drills you will one day be glad you practiced.

1. **Tag the release.** This toy ships as one unit, so use one repo-wide tag (independently-shipping modules would each use per-module tags like `greeter-v0.1.0` — a per-project choice):

    ```bash
    git switch main && git pull
    git tag -a v0.1.0 -m "hello-modules 0.1.0"
    git push origin v0.1.0
    ```

2. **"Deploy"** means: run the tagged snapshot, not whatever `main` looks like today.

    ```bash
    git checkout v0.1.0
    python services/integration/app.py   # adjust to the entry point your integration session produced
    git switch main
    ```

3. **Hotfix drill.** A bug is found in production (say, the greeting's capitalization) while `main` has already moved on. Fix it **from the deployed tag**, never from `main` — `main` may contain unreleased work you do not want to ship. And validate **before** you tag: a pushed annotated tag is immutable-by-convention, so it goes on only after review and green CI.

    ```bash
    git switch -c hotfix/greeting-typo v0.1.0
    # ...fix the string in services/greeter/ ...
    git commit -am "fix(greeter): correct the greeting"
    git push -u origin hotfix/greeting-typo
    ```

    Open the PR (the path-scoped `greeter` job runs on it — pull requests trigger CI regardless of branch name), get a teammate's approval, and wait for green. One subtlety: the PR check runs against GitHub's *preview merge* of your branch with `main` — good for compatibility, but not literally the snapshot you are about to tag. So validate the exact hotfix commit locally, **then** tag and deploy — and only merge after:

    ```bash
    git switch hotfix/greeting-typo
    python -m unittest discover -s services/greeter -v   # the exact snapshot v0.1.1 will point at
    git tag -a v0.1.1 -m "hello-modules 0.1.1 (hotfix)"
    git push origin v0.1.1
    ```

    Note where the tag went: **`v0.1.1` is on the hotfix commit itself** — exactly `v0.1.0` plus the reviewed, CI-validated fix, nothing else. Do *not* merge first and tag `main`: if `main` has unreleased work, a tag placed there would ship it. Deploy `v0.1.1`, then merge the PR so the fix is not lost from the trunk. After the browser merge, sync and clean up like every other merge:

    ```bash
    git switch main
    git pull --ff-only
    git branch -d hotfix/greeting-typo
    git fetch --prune
    ```

    (The tag keeps the release commit reachable forever, so deleting the merged branch loses nothing. If your repo merges PRs by squash or rebase instead of a merge commit, `-d` will refuse — that's git protecting you; verify the fix landed on `main`, then use `-D`.)

4. **Rollback drill.** Pretend `v0.1.1` turns out worse. Rolling back is *not* git surgery — it is deploying the previous tag again:

    ```bash
    git checkout v0.1.0
    python services/integration/app.py
    git switch main
    ```

## What to observe — self-check checklist

Tick these off; each one is directly verifiable:

- [ ] `docs/modules.yaml` on `main` declares `greeter`, `clock`, and `integration` (with `touches: [greeter, clock]` on integration), and the Work Explorer lists the three module groups in that order.
- [ ] Each module's **Plan** node shows present, and the plan files exist at their `planPath`s (e.g. `docs/modules/greeter/project-plan.md`).
- [ ] `docs/session-sets/` contains exactly `001-greeter-hello`, `002-clock-hello`, `003-integration-compose` — globally-unique names, each `spec.md` stamped with its `module:`.
- [ ] `003-integration-compose`'s spec declares `prerequisites:` on the other two sets, and its row showed as blocked in the tree until both completed.
- [ ] All three sets sit in the **Complete** bucket under their modules; nothing appears under an **Unassigned** group.
- [ ] `main` is protected: a direct push is rejected; PRs need one approval and green checks.
- [ ] `.github/CODEOWNERS` is active: Alex's integration PR auto-requested reviews from Priya and Sam.
- [ ] The GitHub **Actions** tab shows path-scoped jobs for all three modules on their PRs (including `integration` on Alex's), and the `all-modules` job on every merge to `main`.
- [ ] The `changes` filter job and the module jobs are selected as **required** status checks in the `main` branch-protection rule (Part 7 step 4) — a failing check blocks the merge (see Part 7's note on the skipped-check limitation and the production-grade aggregate gate).
- [ ] `git tag -l` lists `v0.1.0` and `v0.1.1`, and `git for-each-ref refs/tags --format="%(refname:short) %(objecttype)"` shows both as `tag` (annotated).
- [ ] Every declared `codeRoot` exists on `main` with code and tests: `services/greeter/`, `services/clock/`, and `services/integration/` all match what `docs/modules.yaml` declares (a missing directory is the one gap the `all-modules` job cannot see — this check owns it).
- [ ] Checking out `v0.1.1` and running the integration program prints the greeting with the time (`Hello, ... It is HH:MM.`).
- [ ] Worktrees are closed: `.venv/Scripts/python.exe -m ai_router.worktree list` (Windows; `.venv/bin/python` on macOS/Linux) reports no session-set worktrees left open.
- [ ] No merged branches linger: `git branch --merged main` lists only `main`, and `git branch -r` shows no leftover authoring/guardrails/session-set/hotfix branches (GitHub's auto-delete plus the per-merge `git branch -d` cleanups did their job).

Where to go next: decompose a real project the same way — and run the [module workflow review prompt](./module-team-hello-world-review-prompt.md) on a cadence to keep the habits honest.
