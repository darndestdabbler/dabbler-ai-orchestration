# Walkthrough: Your First Three-Person Module-Based Project

This tutorial walks a three-person team (Priya, Sam, and Alex) through their first "Hello World" project using the Dabbler AI Orchestration workflow. It covers project setup, defining work modules, running AI-led development sessions in parallel, and merging work back to the `main` branch using a trunk-based development model with small, safe pull requests.

- **Audience:** A team new to this workflow. You should know basic `git` (commit, push, pull); no prior experience with monorepos, trunk-based development, or AI orchestration is required.
- **Time to complete:** About half a day, including time for the AI agent to complete its work sessions.
- **Read this first:** This tutorial teaches the *how*. For the *why* behind this workflow (monorepos, modules, trunk-based development, tags), read the [Module-Organized Projects Primer](../planning/module-organized-projects-primer.md) first. The formal specification is the [Module-Organized Projects Recommendation](../planning/module-organized-projects-recommendation.md).
- **When you finish:** run the companion [module workflow review prompt](./module-team-hello-world-review-prompt.md) against your repo as a graduation check.

The cast, used throughout:

| Person | Module | Owns the code under | Git host handle (example) |
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
6. A **repository on a supported git host** (GitHub, Azure DevOps) the team can push to and administer — either **public**, or on a plan that supports branch protection on private repos (on **GitHub Free, branch protection rules only work on public repositories**; the Part 3 guardrails depend on them).
7. **(Optional) Your host's command-line interface (CLI)**, installed and authenticated. See Part 0.5 — without a host CLI the PR command still works, it just falls back to your browser.

## Part 0.5 — Set up the git-host CLI (one-time, per machine)

The `Dabbler: Open PR for this set` command creates pull requests through your
host's CLI. Without the CLI the command still works — the push is pure git,
and the host's create-a-PR page opens in your browser to finish the job — but
with the CLI installed, PR creation is one confirmed click. Everything else in
this tutorial's automated flow is pure git and needs no host CLI at all.

Host detection is automatic from your repo's `origin` remote URL
(`github.com` → GitHub; `dev.azure.com`, `*.visualstudio.com`,
`ssh.dev.azure.com` → Azure DevOps).

**GitHub / GitHub Enterprise:**

1. Install the GitHub CLI: `winget install GitHub.cli`
2. Sign in: `gh auth login` (for GitHub Enterprise: `gh auth login --hostname <your-ghe-host>`)
3. Confirm it worked: `gh auth status` reports you are logged in to your host.

**Azure DevOps:**

1. Install the Azure CLI: `winget install Microsoft.AzureCLI`
2. Add the DevOps extension: `az extension add --name azure-devops`
3. Sign in: `az login` — or, for PAT-based auth, set the
   `AZURE_DEVOPS_EXT_PAT` environment variable to a Personal Access Token
   with Code Read & Write.
4. Confirm it worked: `az account show` succeeds (or `AZURE_DEVOPS_EXT_PAT`
   is set), and `az extension list` includes `azure-devops`.

**Settings (only when the defaults can't know better):**

- `dabblerSessionSets.gitHost` (`auto` | `github` | `azure-devops`) — set this
  explicitly for a GitHub Enterprise host on a custom domain, which
  auto-detect cannot recognize.
- `dabblerSessionSets.ghCliPath` / `dabblerSessionSets.azCliPath` — point at
  the executable if the CLI is installed somewhere unusual (not on `PATH`).

**What "green" looks like:** run `Dabbler: Open PR for this set` from any
branch other than the trunk — when the CLI is found, the confirm dialog lists
the exact `gh pr create …` (or `az repos pr create …`) line it will run; when
it is not found, the dialog says "(no gh CLI found — the browser create-PR
page will open instead)" (or "az"), and after the push your browser opens the
host's create-a-PR page with the same guidance in a notification. Either way
you can finish the job — the CLI just saves the browser trip.

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

2. On your git host, create a new **empty** repository named `hello-modules` (no README, no license — you already committed one locally).

3. Connect and push (replace `your-org` with your account or organization):

    ```bash
    git remote add origin git@github.com:your-org/hello-modules.git
    git push -u origin main
    ```

    > **Azure DevOps note:** Create the new repo in an Azure DevOps project, then use its clone URL:
    > `git remote add origin https://dev.azure.com/{org}/{project}/_git/{repo}`

4. **Give your teammates access.** A fresh repo belongs to its creator alone — nothing later works (pushes, qualifying approvals, CODEOWNERS review requests) until Sam and Alex can write to it. On the repository page: **Settings** > **Collaborators** (or **Collaborators and teams**) > **Add people** — invite `@sam-gh` and `@alex-gh` with the **Write** role, and have them **accept the email invitations** before Part 4. (On an organization repo, granting an existing team Write access does the same job.)

> **Expect:** `main` exists on your git host with two files. It is not protected yet — Priya still has two solo setup pushes to make (Parts 2–3); protection goes on at the end of Part 3, before any teammate starts work.

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
    > - two comment-only templates: `.github/CODEOWNERS` and `.github/workflows/monorepo-ci.yml` (deliberately harmless as-is; you adapt them in Part 7);
    > - a **`default` module** in `docs/modules.yaml` with two starter session sets already scaffolded — `001-default-plan` and `002-default-decomposition` (the Visual Studio `Class1` pattern: a working starting point, not a template to study).
    >
    > A **System Status strip** appears above the form **only if something is wrong** (a missing provider key, a missing Python) — no strip means a healthy environment.

    > **The form is now replaced by the tree.** Because Build scaffolded two session sets, the Work Explorer switches from the Getting Started form to the module **tree** (it shows the form only while a repo has *no* session sets). You'll see one module, **Default**, with `001-default-plan` and `002-default-decomposition` under it. This team already knows its three modules, so Part 3 clears that `Class1` starter and declares the real ones — a solo project that *didn't* yet know its structure would instead run those two starter sets to generate its plan and first work sets (see the [quick start](../quick-start.md)), then rename Default. Re-open the form any time with **`Dabbler: Get Started`**.

    > **Good to know:** if the `.venv` setup ever needs repairing later, run **`Dabbler: Install ai-router`** from the Command Palette.

## Part 3 — Run the starter lifecycle flow, then define the real modules

**Where you are:** Priya, looking at the tree Build produced: one **Default** module with `001-default-plan` and `002-default-decomposition` under it. Before declaring the team's real modules, run those two starter sets **once** to see the two-step lifecycle *every* module follows — a **plan set** (creates the module's plan) then a **decomposition set** (turns the plan into session sets). It's a short, hands-on practice run; then this team, which already knows its three modules, resets and declares them.

1. **Run the plan set.** In the tree, left-click the **`001-default-plan`** row.

    > **Expect:** its `spec.md` opens and the starter line — ``Start the next session of `001-default-plan`.`` — is copied to your clipboard (a toast confirms). Open an AI chat in VS Code, paste (Ctrl+V), and send it. The AI-led session registers, **creates `docs/modules/default/project-plan.md`** (a short plan for the toy — greeter greets, clock tells time, integration composes them), verifies, and commits. When it finishes, `001-default-plan` moves to the **Complete** bucket. *That is a `plan` lifecycle set — it authored the module's plan.*

2. **Run the decomposition set.** With the plan set complete, **`002-default-decomposition`** is no longer blocked (it was waiting on its `prerequisites:` — the plan set). Left-click its row, paste the copied ``Start the next session of `002-default-decomposition`.`` line into the AI chat, and send it.

    > **Expect:** the AI-led session reads `docs/modules/default/project-plan.md` and **authors the next batch of session-set specs** under `docs/session-sets/`, then verifies and commits. *That is a `decomposition` lifecycle set — it turned the plan into runnable session sets.* You have now executed the full **Build → plan set → decomposition set** lifecycle that every module uses.

3. **Reset for the real team project.** That was a guided practice run on the `Class1` starter. This team owns **three** modules with per-module CODEOWNERS and CI, so clear the practice output and declare the real modules explicitly (a *solo* project would instead keep going — **rename** Default into its one real module and carry on; see [`docs/module-reorganization.md`](../module-reorganization.md)).
    - Delete the Default module: hover its row → **Delete Module…** (removes the `default` manifest entry).
    - Remove the practice sets + plan it produced (nothing here is pushed yet, so this is a local reset):

      ```bash
      rm -rf docs/session-sets/001-default-plan docs/session-sets/002-default-decomposition
      rm -rf docs/modules/default
      # plus any NNN-default-* specs the decomposition set wrote
      ```

    > With no session sets left, the Work Explorer flips **back** to the Getting Started form. (Re-running two AI sessions only to reset feels wasteful — it is a teaching device so you *see* the lifecycle before committing to a structure.)

4. In Section 2 of the form, titled **Define modules (optional)**, click **Copy AI decomposition prompt**.

    > **Expect:** Two things happen:
    > 1. `docs/modules.yaml` is (re-)populated on save from your AI's edit — the file is already present as an empty `modules: []` list after the delete above; the extension only ever writes it on an explicit action, never just because you opened the repo.
    > 2. A module-decomposition prompt is copied to your clipboard, and a notice tells you to paste it into your AI assistant and **save the file** when it has been filled in.

    > **Good to know:** the **Open modules.yaml** button next to it opens the manifest at any time (also creating it from the template if missing). Both actions are also in the Command Palette as **`Dabbler: Copy Module Decomposition Prompt`** and **`Dabbler: Open modules.yaml`** — handy because, once your first real session set exists (Part 4), the form is replaced by the tree and you reach these from the palette or with **`Dabbler: Get Started`**.

5. Paste the prompt into your AI agent's chat. The agent reads the repository and edits `docs/modules.yaml` in place, preserving the template's header comments. Describe your team when you paste, for example:

    ```text
    <paste the copied prompt>

    Context: three-person team. Priya owns a greeter module (services/greeter),
    Sam owns a clock module (services/clock), and Alex owns a cross-module
    integration module that composes the other two.
    ```

    Notice the shape: **one developer per module**, not one team per
    module. Priya, Sam, and Alex each own a *different* module and can all
    work in parallel with near-zero conflicts; the rule this tutorial
    never breaks is that two of them never touch the *same* module at the
    same time — AI-led changes land fast enough that concurrent
    same-module work would be a constant merge-conflict source (the
    primer's [§1.2](../planning/module-organized-projects-primer.md#12-what-a-merge-conflict-actually-is)
    has the full rationale). A developer can still own more than one
    module; they just don't share one with a teammate concurrently.

6. Review the agent's edit, then **save `docs/modules.yaml`**. Below the preserved header comments, the `modules:` list should read:

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

    > **Good to know:** to add a fourth module later, hover any module row and click **Add Module…** (or run **`Dabbler: New Module`**) — it appends the manifest entry, writes a plan stub, and scaffolds that module's own `plan` and `decomposition` starter sets (the same lifecycle pair you ran on Default in steps 1–2). (You add its `codeRoots`/`touches` by editing `docs/modules.yaml` afterward.)

7. Commit the scaffold and manifest to `main`:

    ```bash
    git add -A
    git commit -m "chore: scaffold project structure and define modules"
    git push
    ```

8. **Now protect `main`**, so every later change — from anyone, including you — arrives by reviewed pull request. (If GitHub won't apply the rule, check Part 0's plan/visibility prerequisite: on GitHub Free this needs a **public** repo.) On the GitHub repository page:
    - Go to **Settings** > **Branches** and add a branch protection rule for `main`.
    - Check **Require a pull request before merging** (leave the default of 1 required approval).
    - Check **Require status checks to pass before merging**. There are no checks to select yet — you will come back and select the CI job names in Part 7, after the first workflow run.
    - If you want the rule to bind repository **administrators** too (it should — Priya is an admin), enable the rule's do-not-allow-bypass / include-administrators option; without it, GitHub lets admins push past the rule.
    - While you are in Settings, also enable **Automatically delete head branches** (under **Settings** > **General**). GitHub then deletes each PR's remote branch on merge — merged branches piling up is exactly the clutter trunk hygiene forbids, and this setting handles the remote half for free. (The local half is handled by **`Dabbler: Finalize merged set`** for session branches, and by a one-line `git branch -d` for the authoring and hotfix branches — the tutorial reminds you at each spot.)
    - Save the rule. (GitHub's setting names drift over time; the intent is: no direct pushes to `main` for anyone, one approval, green CI.)

    > **Azure DevOps note:** Set **Branch Policies** on `main`. The key settings are "Require a minimum number of reviewers" (set it to 1) and "Build validation" (you'll add the pipeline here in Part 7).

    > **Expect:** from this point on, a direct `git push` of a `main` commit is rejected — every later change in this tutorial lands through a pull request.

## Part 4 — The first plan and the first session set (Command Palette)

**Where you are:** Priya, in the main `hello-modules` window. Modules are declared, but there are no plans and no session sets, so the Getting Started form is still showing.

**The key sequencing fact:** the Getting Started form shows only while the repo has **no session sets**; the Work Explorer switches to the module **tree** the moment the first set exists. Plan-authoring and set-generation are **Command Palette** actions (module-aware — they ask which module you mean) that work in either view; the tree's module-row strip carries the *module* lifecycle actions (**Open Plan**, **Add Module…**, **Rename Module…**, **Delete Module…**), not plan/set authoring.

1. Author the greeter plan. Ask your AI agent in chat, in your own words — for example:

    ```text
    Write a short project plan for the greeter module and save it to
    docs/modules/greeter/project-plan.md. Scope: a greet() function in
    services/greeter/ that returns "Hello, world!", plus a unit test.
    ```

    Save the file if your agent leaves it open as an edit.

    > **Good to know:** if you already have a plan as a Markdown file, **`Dabbler: Import Project Plan`** does the same job without the AI: it asks which module you are importing for (pick **greeter**), opens a file picker, and copies your chosen `.md` file to that module's `planPath`.

2. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run **`Dabbler: Generate Session-Set Prompt`**.

3. A module picker lists the three declared modules. Pick **greeter**.

    > **Expect:** a notice that the session-set generation prompt was copied to your clipboard.

4. Paste the prompt into the AI agent chat. The agent reads `docs/modules/greeter/project-plan.md` and writes one session-set folder — expect `docs/session-sets/001-greeter-hello/` containing `spec.md` and `session-state.json`.

5. Review what the agent wrote before accepting it. Check:
    - the folder name starts with a zero-padded number and includes the module slug (`001-greeter-hello`);
    - `spec.md`'s configuration block contains `module: greeter`;
    - `session-state.json` says `"status": "not-started"`.

    > **Expect:** as soon as the first set exists on disk, the Work Explorer switches from the Getting Started form to the module **tree**. If you don't see it within a few seconds, run **`Dabbler: Refresh Work Explorer`**.

6. Land the plan + set on `main` — the first PR under the new branch protection. The framework automates pushing and opening the PR; creating the branch and committing are local actions you still run yourself (local commits are autonomous; only remote-touching actions are gated). Don't name this branch `session-set/001-greeter-hello`: that name is reserved for the *work* branch the worktree tooling creates in Part 6; this is just the authoring PR.

    ```bash
    git switch -c authoring/001-greeter-hello
    git add docs/modules/greeter/project-plan.md docs/session-sets/001-greeter-hello
    git commit -m "docs: greeter plan + session set 001-greeter-hello"
    ```

7. Open the Command Palette and run **`Dabbler: Open PR for this set`**. Enter a "PR title" when prompted (it defaults to the branch name). Despite the command's name, it works from any branch that isn't the trunk — it pushes the branch you are on and opens the PR for it (you must be *on* a branch: a detached HEAD is refused); on a `session-set/*` branch the title defaults to "Session set <slug>" instead.

    > **Automation in action:** The framework now runs the mechanical git for you. Every command that touches the remote first shows a confirmation dialog listing the exact shell commands it will run. You always have the final say. The raw commands for each automated step are listed in the "Git under the hood" appendix.

    > **Expect:** A confirm dialog titled "Push this branch and open a PR?" listing the `git push ...` and `gh pr create ...` (or `az repos pr create ...`) lines it will execute. This modal is your oversight — **the HUMAN DECISION is to click "Push + create PR"**. The PR opens in your browser.
    > (An AI agent can invoke these same commands, but the confirm modal still goes to the human — the agent can never push, merge, or tag on its own authority.)

8. On your git host, have Sam or Alex approve the PR — reviewing happens in the browser, so they don't need a clone yet. Merge it when approved. **Reviewing and approving a PR is a human decision the framework never makes.** (The scaffolded CI's placeholder job runs and passes on the PR — the real per-module jobs arrive in Part 7.)

9. Tidy up your local branch. The `Dabbler: Finalize merged set` command cleans up `session-set/*` branches (you'll use it in Part 8), but authoring and hotfix branches still need manual cleanup.

    ```bash
    git switch main
    git pull --ff-only
    git branch -d authoring/001-greeter-hello
    ```

    > **One rule for every cleanup in this tutorial:** the steps assume your host's default **Create a merge commit** strategy. If your repo merges PRs by **squash** or **rebase** instead, the merged commit gets a new identity, so `git branch -d` will refuse with "not fully merged" at *every* cleanup point from here on — including inside `Dabbler: Finalize merged set`, which uses `-d` (never `-D`) and stops with git's message rather than force-deleting. That is git protecting you, not an error in the flow. Verify the PR's changes are on your pulled `main`, then delete with `git branch -D`. Deleting merged branches never deletes the audit trail: each merged **PR** permanently keeps the branch name, changed files, and reviews, and that PR record is exactly what the companion workflow review reads once the branches themselves are gone.

    > **Expect:** `origin/main` now contains the greeter plan and `001-greeter-hello`.

## Part 5 — Meet the tree ("the tree is the checklist")

**Where you are:** Priya's plan + first set are merged to `origin/main`. Sam and Alex now clone the repo and open it in VS Code. Everyone sees the same tree.

One per-machine setup step first: the `.venv` is ignored by git and exists only on Priya's machine, so **Sam and Alex each run `Dabbler: Install ai-router` from the Command Palette once** after opening their clone. The Work Explorer tree needs no setup, but the worktree commands in Parts 6 and 9 do.

What the Work Explorer now shows:

- One collapsible group per module, in manifest order: **Greeter**, **Clock**, **Cross-Module Integration**.
- Status buckets (**In Progress** / **Not Started** / **Complete** / **Cancelled**) are direct children of the module row; a module with no sets yet simply shows empty.
- `001-greeter-hello` sits under **Greeter** > **Not Started**.
- Hovering or keyboard-focusing a module row reveals its action strip: **Open Plan**, **Add Module…**, **Rename Module…**, **Delete Module…**. The same actions are on the row's right-click menu.

> **Good to know:** a session set whose `spec.md` has no `module:` stamp never disappears — it shows under a group named **Unassigned** (or **Default**, when it is the only group in the repo). If you ever see **Unassigned**, someone forgot a stamp.

Now Sam and Alex author their own module's plan and first set. Authoring is the same Command Palette flow Priya used in Part 4. Do these two in order — **Sam first, then Alex** — because the AI picks each new set's number from the sets it can see: two people generating from the same `main` snapshot can both get `002`. (Collisions are fail-loud, not silent — the workspace refuses duplicate set names, and the slug-in-name convention keeps even racing sets from producing the same *name* — but serializing keeps the numbering tidy.)

1. **Sam (Clock) — plan, generate, land:**
    - Author the clock plan: ask the AI in chat to write `docs/modules/clock/project-plan.md` (scope: a `now_text()` function in `services/clock/` returning `HH:MM`, plus a test), or run **`Dabbler: Import Project Plan`** (pick **clock**). Save it.
    - Run **`Dabbler: Generate Session-Set Prompt`** from the Command Palette, pick **clock**, and let the agent write `docs/session-sets/002-clock-hello/`.
    - Land the plan + set on `main` as a small PR:

      ```bash
      git switch -c authoring/002-clock-hello
      git add docs/modules/clock/project-plan.md docs/session-sets/002-clock-hello
      git commit -m "docs: clock plan + session set 002-clock-hello"
      ```

    - Run **`Dabbler: Open PR for this set`**.
    - On your git host, get an approval and merge. Then, on your local machine, clean up the authoring branch:

      ```bash
      git switch main
      git pull --ff-only
      git branch -d authoring/002-clock-hello
      ```

2. **Alex (Integration) — after Sam's PR merges:**
    - Pull `main` first (`git pull`) — Alex's AI now sees `001` and `002`, so his set becomes `003`.
    - Same two steps for the **integration** module: author its plan (ask AI, or **`Dabbler: Import Project Plan`** → **integration** — scope: compose greeter + clock into one program printing `Hello, world! It is HH:MM.`), then **`Dabbler: Generate Session-Set Prompt`** → **integration**, producing `docs/session-sets/003-integration-compose/`.
    - **Declare the dependency.** Tell the AI when you paste the prompt ("this set depends on 001-greeter-hello and 002-clock-hello being complete"), or add it to `spec.md` by hand:

      ```yaml
      prerequisites:
        - slug: 001-greeter-hello
          condition: complete
        - slug: 002-clock-hello
          condition: complete
      ```

    - Land the plan + set on `main` as a small PR:

      ```bash
      git switch -c authoring/003-integration-compose
      git add docs/modules/integration/project-plan.md docs/session-sets/003-integration-compose
      git commit -m "docs: integration plan + session set 003-integration-compose"
      ```

    - Run **`Dabbler: Open PR for this set`**, get it approved, and merge. Then clean up: `git switch main && git pull --ff-only && git branch -d authoring/003-integration-compose`.

    > **Expect:** running **Generate Session-Set Prompt** for a module whose plan file doesn't exist yet pops a warning naming the missing plan path and offering **Import Plan** — author the plan first. And once the prerequisites are declared, Alex's set renders as blocked in the tree (its row offers **Open Prerequisite Spec**) until both dependencies complete.

## Part 6 — Worktrees and running sessions

**Where you are:** All three modules have a plan and a not-started session set on `main`. Priya and Sam will now work in parallel; Alex's integration set waits for its prerequisites (it composes code that does not exist on `main` yet — he joins in Part 9, on a branch cut from the updated `main`).

Each session set runs on its own short-lived branch, checked out in its own **git worktree** — a separate folder sharing the same clone, so nobody has to stash or switch branches.

1. Priya and Sam each open a terminal at the repo root and open the worktree for their own set:

    ```bash
    # Priya — Windows:
    .venv\Scripts\python.exe -m ai_router.worktree open 001-greeter-hello
    # Priya — macOS/Linux:
    .venv/bin/python -m ai_router.worktree open 001-greeter-hello
    ```

    Sam runs the same command with `002-clock-hello`.

    > **Expect:** a sibling folder `hello-modules-worktrees/001-greeter-hello/` appears, containing a checkout on the new branch `session-set/001-greeter-hello`. The main checkout stays on `main`.

2. Open the worktree folder in a **new VS Code window**.

3. In the Work Explorer, left-click your set's row (under **Not Started**).

    > **Expect:** the row's spec opens, and a starter line is copied to your clipboard with a confirmation toast. The line reads exactly:
    >
    > ```text
    > Start the next session of `001-greeter-hello`.
    > ```

4. In the worktree window's AI chat, paste that line and send it. The AI-led session takes it from there: it registers the session, implements the module (code + test), runs verification, and commits to the session branch — you watch and review. The session lifecycle (register → work → verify → document → close) is the standard Dabbler workflow; see the [AI-Led Session Workflow](../ai-led-session-workflow.md) for depth. At the end of its session the agent may itself invoke **`Dabbler: Open PR for this set`** — the confirm dialog you'll meet in Part 8 still comes to *you*.

## Part 7 — CODEOWNERS + monorepo CI

**Where you are:** The AI sessions are running. Meanwhile, one person — Priya — activates the ownership and CI guardrails in the main checkout, as a small PR to `main`.

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

    Also write the module→owner mapping down somewhere **other** than CODEOWNERS itself — the simplest is one `# owners: @priya-gh` comment line per module in `docs/modules.yaml`. CODEOWNERS routes reviews, but nothing in GitHub checks that its handles are the *right people*; a mistyped or stale handle still "covers" every path. The companion workflow review treats that separate roster as the ground truth to audit CODEOWNERS against, and without one it can verify only path coverage, not owner identity.

    > **Azure DevOps note:** CODEOWNERS is a GitHub feature. The Azure DevOps equivalent is a required-reviewers branch policy, which can be set to require individuals or groups to approve changes to specific paths.

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
          contents: read
          pull-requests: read
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

    > **Azure DevOps note:** The conceptual equivalent is an Azure Pipelines YAML file. It would use path filters on its triggers to run jobs conditionally, plus a build-validation branch policy to make it required (Part 3's note).

3. Land both files on `main` as a small PR:

    ```bash
    git switch -c chore/guardrails
    git add .github/CODEOWNERS .github/workflows/monorepo-ci.yml
    git commit -m "build: activate CODEOWNERS and monorepo CI"
    ```
    Run **`Dabbler: Open PR for this set`**, get it approved and merged, then clean up the branch manually: `git switch main && git pull --ff-only && git branch -d chore/guardrails`.

4. **Finish the Part 3 branch-protection setup.** Now that the workflow has run at least once, GitHub can see the check names. Go back to **Settings** > **Branches** > the `main` rule, and under **Require status checks to pass before merging** search for and select the `changes` filter job **and** the module jobs (`greeter`, `clock`, `integration`). Without this step the checks run but are *not required* — a red check would not block a merge.

    > **Honest limitation (fine for this toy, know it for real projects):** GitHub treats a *skipped* required check as satisfied, and the module jobs are conditional on the `changes` filter — that is what makes path-scoping work at all. Requiring `changes` closes the filter-failure hole, but the airtight production pattern is one always-running aggregate gate job (e.g. `ci-ok`) that `needs:` the filter and every module job, fails if any of them failed, and is the single required check. Worth adopting the day this workflow guards something real.

## Part 8 — Small PRs to main

**Where you are:** Priya's session finished: the `session-set/001-greeter-hello` branch has the code committed. The guardrails PR is merged. The core habit: **merge a set when it completes.** Small, frequent, boring merges.

1. **Priya:** From inside the worktree window, open the Command Palette and run **`Dabbler: Open PR for this set`**.

    > **Expect:** the confirm dialog from Part 4, now on the session branch — "Push this branch and open a PR?", with the title defaulting to "Session set 001-greeter-hello". After you confirm, the PR triggers the path-scoped **greeter** CI job (the filter matched `services/greeter/**`) — and not clock's. No reviewer is auto-requested by CODEOWNERS: the only owner of the touched paths is Priya herself, and the host never requests a review from a PR's own author. Branch protection still wants one approval — Sam gives it.

2. Once the PR is approved and CI is green, merge it on your git host.

3. **Finalize the merge.** From your **main repository window** (not the worktree), run **`Dabbler: Finalize merged set`**.

    > **Expect:** with only one session worktree open, the command goes straight to the confirm dialog (when several are open, a quick pick asks "Which merged set should be finalized?" first). The dialog is titled "Finalize merged set 'session-set/001-greeter-hello'?" and lists the exact commands, in order: `git pull --ff-only`, `git worktree remove ...`, `git branch -d session-set/001-greeter-hello`, and `git fetch --prune`. This is your oversight — **the HUMAN DECISION is to click "Finalize"**. Each step is idempotent (an already-done step reports itself and the flow continues), so the command is safely re-runnable.
    >
    > After it finishes: the worktree folder is gone (close that worktree's VS Code window), the merge has been pulled onto your local `main`, and the Work Explorer shows `001-greeter-hello` in the **Complete** bucket under **Greeter** — the tree reads your *local* files, and finalize's `git pull --ff-only` is what made the merge visible. On the host, the merge to `main` also ran the **all-modules** CI job.

4. **Sam:** exactly the same flow for `002-clock-hello`: run `Dabbler: Open PR for this set` from the worktree, get Priya's approval, merge, then run `Dabbler: Finalize merged set` from the main checkout.

## Part 9 — The integration set, reviewed by both owners

**Where you are:** `greeter` and `clock` are merged to `main`. Alex's `003-integration-compose` set just unblocked.

1. **Alex:** pull `main`, then open the worktree and run the session:

    ```bash
    git pull
    # Windows:
    .venv\Scripts\python.exe -m ai_router.worktree open 003-integration-compose
    # macOS/Linux:
    .venv/bin/python -m ai_router.worktree open 003-integration-compose
    ```
    Left-click the `003-integration-compose` row, paste the starter line into the worktree window's AI chat, and let the session compose the two modules into `services/integration/` (with a test that exercises the real `greeter` and `clock` code now on the branch).

2. From the worktree window, run **`Dabbler: Open PR for this set`** and confirm.

    > **Expect:** because the merged CODEOWNERS rule for `services/integration/` names `@alex-gh @priya-gh @sam-gh`, GitHub automatically requests reviews from **Priya and Sam** (Alex is the author, so he is not asked to review himself). This is the `touches` discipline in practice: the owners of every composed module see the composition before it lands. One honest nuance: CODEOWNERS *requests* those reviews; branch protection is what *requires* an approval before merge — the stricter **Require review from Code Owners** option exists too, but with single-owner modules it can deadlock an owner's own PRs, so this tutorial leaves it off. (On Azure DevOps, the required-reviewers branch policy plays both roles.)

3. Priya and Sam approve, CI is green, and Alex merges the PR on the git host.

4. From the main checkout window, Alex runs **`Dabbler: Finalize merged set`** and confirms, syncing `main` and cleaning up his worktree and branch.

    > **Expect:** the all-modules job passes on `main` — the composed program's tests ran together for the first time on the merge that composed them.

## Part 10 — Tag, deploy, hotfix, rollback

**Where you are:** All three sets are **Complete** in the tree, everything is merged, `main` is green. Time to ship — and practice the two drills you will one day be glad you practiced. **What and when to release, and whether to roll back, are human decisions** — the commands below only remove the typing.

1. **Tag the release.** This toy ships as one unit, so use one repo-wide tag (independently-shipping modules would each use per-module tags like `greeter-v0.1.0` — a per-project choice). From the main checkout, on an up-to-date trunk (`git switch main && git pull --ff-only` if unsure), run **`Dabbler: Cut release tag`**:
    - **"Release tag name"**: `v0.1.0`
    - **"Commit to tag"**: accept the default (HEAD)
    - **"Tag annotation message"**: e.g. `hello-modules 0.1.0`

    > **Expect:** A confirm dialog titled "Cut and push release tag 'v0.1.0'?" lists exactly the `git tag -a v0.1.0 <sha> -m "..."` and `git push origin v0.1.0` lines, plus the resolved commit (sha + subject) the tag will point at — the tag is pinned to that exact commit, so a branch moving while the dialog is open cannot change what gets tagged. A pushed tag is immutable by convention — review the tag and commit, then **the HUMAN DECISION is to click "Create + push tag"**. (Re-running with the same name refuses: "Tag 'v0.1.0' already exists.")

2. **"Deploy"** means running the tagged snapshot. This is still a manual teaching step:

    ```bash
    git checkout v0.1.0
    python services/integration/app.py
    git switch main
    ```
    > **Good to know:** The `Dabbler: Roll back to tag` command, which you'll use in step 4, automates exactly this checkout when you need it under pressure.

3. **Hotfix drill.** A bug is found in production (say, the greeting's capitalization) while `main` has already moved on. Fix it **from the deployed tag**, never from `main` — `main` may contain unreleased work you do not want to ship. Authorizing a hotfix is a human decision; the framework only cuts the branch.
    - Run **`Dabbler: Start hotfix from tag`**.
    - **"Which release tag is the hotfix based on?"**: pick `v0.1.0`.
    - **"Hotfix branch name"**: accept the default, `hotfix/v0.1.0`.

    > **Expect:** A confirm dialog "Start hotfix branch 'hotfix/v0.1.0' from 'v0.1.0'?" listing `git switch -c hotfix/v0.1.0 v0.1.0` and explaining it branches from the deployed snapshot, never the trunk. Click "Create hotfix branch". (The command refuses to start from a dirty tree — the branch must be exactly the tagged snapshot.)

    - Now, on the new branch, make the code change and commit it (local commits are autonomous):
      ```bash
      # ...fix the string in services/greeter/ ...
      git commit -am "fix(greeter): correct the greeting"
      ```
    - Run **`Dabbler: Open PR for this set`** and confirm (the path-scoped `greeter` job runs on the PR — pull requests trigger CI regardless of branch name). Get a teammate's approval and wait for green.
    - **Validate before you tag.** One subtlety: the PR check runs against the host's *preview merge* of your branch with `main` — good for compatibility, but not literally the snapshot you are about to tag — and the path-scoped job tested only the changed module, while the tag ships **all** of them. So run the full integrated suite locally on the exact hotfix commit first:

      ```bash
      ( for d in services/*/; do python -m unittest discover -s "${d%/}" -v || exit 1; done ) &&
      python services/integration/app.py
      ```

    - Still on the `hotfix/v0.1.0` branch, run **`Dabbler: Cut release tag`**: tag name `v0.1.1`, "Commit to tag" default (HEAD — the hotfix commit), message e.g. `hello-modules 0.1.1 (hotfix)`. Note where the tag goes: **on the hotfix commit itself** — exactly `v0.1.0` plus the reviewed, validated fix, nothing else. Do *not* merge first and tag `main`: if `main` has unreleased work, a tag placed there would ship it.
    - Deploy `v0.1.1`, then merge the PR on your git host so the fix is not lost from the trunk.
    - Clean up the hotfix branch manually (it is not a `session-set/*` branch, so `Dabbler: Finalize merged set` does not offer it):
      ```bash
      git switch main
      git pull --ff-only
      git branch -d hotfix/v0.1.0
      git fetch --prune
      ```
      (The tag keeps the release commit reachable forever, so deleting the merged branch loses nothing. Squash/rebase merges: see the Part 4 rule — verify the fix landed on `main`, then use `-D`.)

4. **Rollback drill.** Pretend `v0.1.1` turns out worse. Rolling back is *not* git surgery — it is deploying the previous tag again. Rollback authorization is a human decision; the command runs only after you confirm.
    - Run **`Dabbler: Roll back to tag`**.
    - **"Which release tag do you want to roll back to?"**: pick `v0.1.0`.

    > **Expect:** A confirm dialog "Roll back to 'v0.1.0'?" listing `git checkout v0.1.0` and warning you will be on a DETACHED HEAD. Click "Check out tag". Prove you are on the old snapshot (`python services/integration/app.py` prints the pre-fix greeting), then return to the trunk with `git switch main`.

## What to observe — self-check checklist

Tick these off; each one is directly verifiable:

- [ ] `docs/modules.yaml` on `main` declares `greeter`, `clock`, and `integration` (with `touches: [greeter, clock]` on integration), and the Work Explorer lists the three module groups in that order.
- [ ] Each module's plan file exists at its `planPath` (e.g. `docs/modules/greeter/project-plan.md`) — the module row's **Open Plan** action opens it.
- [ ] `docs/session-sets/` contains exactly `001-greeter-hello`, `002-clock-hello`, `003-integration-compose` — globally-unique names, each `spec.md` stamped with its `module:`.
- [ ] `003-integration-compose`'s spec declares `prerequisites:` on the other two sets, and its row showed as blocked in the tree until both completed.
- [ ] All three sets sit in the **Complete** bucket under their modules; nothing appears under an **Unassigned** group.
- [ ] `main` is protected: a direct push is rejected; PRs need one approval and green checks.
- [ ] On GitHub, `.github/CODEOWNERS` is active: Alex's integration PR auto-requested reviews from Priya and Sam. (On Azure DevOps, the required-reviewers branch policy did the same job.)
- [ ] The host's **Actions**/**Pipelines** tab shows path-scoped jobs for all three modules on their PRs (including `integration` on Alex's), and the `all-modules` job on every merge to `main`.
- [ ] The `changes` filter job and the module jobs are selected as **required** status checks in the `main` branch-protection rule (Part 7 step 4) — a failing check blocks the merge (see Part 7's note on the skipped-check limitation and the production-grade aggregate gate).
- [ ] The loop ran through the framework: session PRs opened by **`Dabbler: Open PR for this set`**, post-merge sync/cleanup by **`Dabbler: Finalize merged set`**, both tags by **`Dabbler: Cut release tag`** — and every one of those actions previewed its exact commands and waited for your confirm.
- [ ] `git tag -l` lists `v0.1.0` and `v0.1.1`, and `git for-each-ref refs/tags --format="%(refname:short) %(objecttype)"` shows both as `tag` (annotated).
- [ ] Every declared `codeRoot` exists on `main` with code and tests: `services/greeter/`, `services/clock/`, and `services/integration/` all match what `docs/modules.yaml` declares (a missing directory is the one gap the `all-modules` job cannot see — this check owns it).
- [ ] Checking out `v0.1.1` and running the integration program prints the corrected greeting with the time (`Hello, ... It is HH:MM.`).
- [ ] Worktrees are closed: `.venv/Scripts/python.exe -m ai_router.worktree list` (Windows; `.venv/bin/python` on macOS/Linux) reports no session-set worktrees left open — `Dabbler: Finalize merged set` removed each one.
- [ ] No merged branches linger: `git branch --merged main` lists only `main`, and `git branch -r` shows no leftover authoring/guardrails/session-set/hotfix branches (the host's auto-delete, `Dabbler: Finalize merged set`, and the manual authoring/hotfix cleanups did their job).

Where to go next: decompose a real project the same way — and run the [module workflow review prompt](./module-team-hello-world-review-prompt.md) on a cadence to keep the habits honest.

---

## Appendix — Git under the hood: what the framework ran for you

The Dabbler commands run the mechanical git for you, but you should still understand the mechanics. The framework's goal is to remove keystrokes, not oversight. Here is the exact command sequence each automated step runs on your behalf.

### `Dabbler: Open PR for this set`
Pushes the current branch to `origin` and opens a pull request. Host detection is automatic from the `origin` remote URL (override: the `dabblerSessionSets.gitHost` setting).
1.  `git push -u origin <current-branch-name>`
2.  Then, one of:
    - **GitHub / GitHub Enterprise (with `gh` CLI):** `gh pr create --head <branch> --base main --title "…" --body "…"`
    - **Azure DevOps (with `az` CLI):** `az repos pr create --organization https://dev.azure.com/{org} --project {project} --repository {repo} --source-branch <branch> --target-branch main --title "…" --description … --output json` (org/project/repo are parsed from the remote URL — no `az devops configure --defaults` needed)
    - **No CLI found:** the push still happens (it is pure git), then your host's create-a-PR page opens in the browser for you to complete the form — the same URL you could type by hand.

### `Dabbler: Finalize merged set`
Run from the main checkout *after* the PR has been merged on the host. It syncs the trunk and cleans up the completed set's branch and worktree. Every step is idempotent — re-running skips what is already done.
1.  `git pull --ff-only`
2.  `git worktree remove <path-to-worktree>` (only if a worktree exists for the set)
3.  `git branch -d session-set/<slug>` (`-d`, never `-D` — an unmerged branch refuses rather than losing work)
4.  `git fetch --prune`

### `Dabbler: Cut release tag`
Creates and pushes an annotated release tag. The sha shown in the confirm dialog is exactly what gets tagged, and the confirm is mandatory — this is the release gate.
1.  `git tag -a <tag-name> <commit-sha> -m "<annotation-message>"`
2.  `git push origin <tag-name>`

### `Dabbler: Start hotfix from tag`
Creates a new hotfix branch from a specific release tag — the deployed snapshot — never from the trunk.
1. `git switch -c hotfix/<tag-name> <tag-name>`

### `Dabbler: Roll back to tag`
Checks out a specific release tag into a detached-HEAD state, ready for you to run or redeploy that exact snapshot.
1. `git checkout <tag-name>`

### What the automation does *not* cover

- The `Finalize` command is tailored to the `session-set/*` branch lifecycle. Authoring branches (like `authoring/001-greeter-hello`) and hotfix branches are shorter-lived and don't use worktrees, so their cleanup stays a short manual sequence after their PRs merge:

  ```bash
  git switch main
  git pull --ff-only
  git branch -d <branch-name>
  git fetch --prune
  ```

- The one-time bootstrap (creating the repo, branch protection / branch policies, CODEOWNERS, CI) is deliberately not automated — that is policy you should set consciously, not toil.
- Reviewing and approving PRs happens on your git host, by a human (or a different agent) — the framework never approves, merges, or releases anything on its own authority.