> ✅ **Validated end-to-end on a live Azure DevOps org + GitHub Copilot seat
> (operator walk, 2026-07-15).** This walkthrough was authored against the
> shipped extension and router code — every machine-checkable claim (command
> titles, dialog text, settings keys) verified against that code, and the
> `azure-pipelines.yml` test logic and toy program run locally — and the full
> flow was then **walked live on a real Azure DevOps organization with a GitHub
> Copilot seat**: the ADO bootstrap (project, repo, membership, branch policies,
> pipeline registration), the pipeline's ADO PR change-detection on a hosted
> agent, the Copilot seat setup, at least one module session driven through
> Copilot, and the automated open-PR → finalize → release-tag loop. (Mind the
> Set-086 auth-preflight in Part 0.6 so a mis-authed seat fails loudly rather
> than faking a verification.) If a step drifts as the tools evolve, please
> report it — we'll fix it fast.

# Walkthrough: Your First Three-Person Module-Based Project (GitHub Copilot + Azure DevOps)

This tutorial walks a three-person team (Priya, Sam, and Alex) through their first "Hello World" project using the Dabbler AI Orchestration workflow — hosted on **Azure DevOps** and driven by **GitHub Copilot** as the sole AI agent. It covers project setup, defining work modules, running AI-led development sessions in parallel, and merging work back to the `main` branch using a trunk-based development model with small, safe pull requests.

This is a standalone, linear re-cut of the agent-agnostic, GitHub-worked [three-person Hello World walkthrough](./module-team-hello-world.md) for a team that has exactly one AI agent (GitHub Copilot, no direct provider API keys) and one host (Azure DevOps). The module, trunk, worktree, and session-lifecycle teaching is identical; the host and agent mechanics differ at every concrete step. The [sync-map appendix](#appendix--sync-map) tracks which parts are shared and which are host/agent-specific.

- **Audience:** A team new to this workflow, locked to Azure DevOps and GitHub Copilot. You should know basic `git` (commit, push, pull); no prior experience with monorepos, trunk-based development, or AI orchestration is required.
- **Time to complete:** About half a day, including time for GitHub Copilot to complete its work sessions.
- **Read this first:** This tutorial teaches the *how*. For the *why* behind this workflow (monorepos, modules, trunk-based development, tags), read the [Module-Organized Projects Primer](../planning/module-organized-projects-primer.md) first. The formal specification is the [Module-Organized Projects Recommendation](../planning/module-organized-projects-recommendation.md).
- **When you finish:** run the companion [module workflow review prompt](./module-team-hello-world-review-prompt.md) against your repo as a graduation check.

The cast, used throughout:

| Person | Module | Owns the code under | Azure DevOps identity (example) |
| --- | --- | --- | --- |
| Priya | `greeter` | `services/greeter/` | `priya@your-org` |
| Sam | `clock` | `services/clock/` | `sam@your-org` |
| Alex | `integration` | `services/integration/` (composition code; sanctioned to work across the other two via `touches`) | `alex@your-org` |

On Azure DevOps a reviewer is identified by their Azure DevOps account (the email or display name in your organization), not a `@handle` — use whatever your organization shows for each person.

The finished toy program prints one line, built from two modules: `Hello, world! It is 12:00.`

---

## Part 0 — Prerequisites

Before you begin, every team member needs:

1. **Visual Studio Code** version 1.85 or newer.
2. The **Dabbler AI Orchestration** extension from the VS Code Marketplace.
3. **Python** version 3.10 or newer.
4. **GitHub Copilot** in VS Code — a Copilot subscription with **Copilot Chat** (agent mode), the single AI agent this team uses.
5. A **GitHub Copilot CLI seat** installed and authenticated on each machine — the transport the Full tier runs through instead of `DABBLER_*` provider API keys. Part 0.6 is the one-time per-machine setup; the canonical runbook is [`docs/copilot-seat-setup-checklist.md`](../copilot-seat-setup-checklist.md).
6. An **Azure DevOps organization + project** the team can create repositories in and administer. The Part 3/Part 7 guardrails are **branch policies**, available on all Azure DevOps plans (including the free tier) for both public and private repos — no plan upgrade needed (unlike GitHub Free, where branch protection needs a public repo). One capacity gotcha to clear early: running the Part 7 pipeline on a **Microsoft-hosted agent** needs a **hosted parallel-jobs grant**, and a brand-new organization often starts with **zero**. Check **Organization Settings** > **Pipelines** > **Parallel jobs**; if hosted parallelism is 0, request the free grant now (Microsoft approves it out of band — it can take a couple of business days) or plan to use a self-hosted agent (Part 7 covers the `pool:` change). Do this ahead of time so the pipeline can actually run.
7. **(Optional) The Azure CLI** (`az`) with the `azure-devops` extension, installed and authenticated. See Part 0.5 — without it the PR command still works, it just falls back to your browser.

## Part 0.5 — Set up the git-host CLI: Azure CLI (one-time, per machine)

The `Dabbler: Open PR for this set` command creates pull requests through your host's CLI. Without the CLI the command still works — the push is pure git, and Azure DevOps' create-a-PR page opens in your browser to finish the job — but with the CLI installed, PR creation is one confirmed click. Everything else in this tutorial's automated flow is pure git and needs no host CLI at all.

Host detection is automatic from your repo's `origin` remote URL (`dev.azure.com`, `*.visualstudio.com`, `ssh.dev.azure.com` → Azure DevOps).

1. Install the Azure CLI: `winget install Microsoft.AzureCLI`
2. Add the DevOps extension: `az extension add --name azure-devops`
3. Sign in: `az login` — or, for PAT-based auth, set the `AZURE_DEVOPS_EXT_PAT` environment variable to a Personal Access Token with **Code (Read & Write)**.
4. Confirm it worked: `az account show` succeeds (or `AZURE_DEVOPS_EXT_PAT` is set), and `az extension list` includes `azure-devops`.

**Settings (only when the defaults can't know better):**

- `dabblerSessionSets.gitHost` (`auto` | `github` | `azure-devops`) — leave at `auto`; set it to `azure-devops` explicitly only if auto-detect cannot recognize your host (e.g. an on-prem Azure DevOps Server on a custom domain).
- `dabblerSessionSets.azCliPath` — point at the `az` executable if it is installed somewhere unusual (not on `PATH`).

**What "green" looks like:** the in-product check first becomes runnable in Part 4 (it needs a repository with an `origin` remote and a non-trunk branch to exist). When the CLI is found, the `Dabbler: Open PR for this set` confirm dialog lists the exact `az repos pr create …` line it will run; when it is not found, the dialog says "(no az CLI found — the browser create-PR page will open instead)", and after the push your browser opens the create-a-PR page. Until Part 4, the CLI-level checks above are your confirmation. And for **PAT-based auth**, prove the PAT actually works against your organization with a real read — rather than treating the set environment variable as success:

```bash
az repos list --organization https://dev.azure.com/{org} --project {project} --output table
```

## Part 0.6 — Set up your GitHub Copilot seat (one-time, per machine)

**Where you are:** VS Code, Python, and the Azure CLI are installed. Now set up the Copilot seat the AI router will use. This team runs the Full tier through a **GitHub Copilot CLI seat**, not direct `DABBLER_*` provider keys — so a working, authenticated seat is a hard prerequisite for every session's cross-provider verification. The full runbook (with a troubleshooting table) is [`docs/copilot-seat-setup-checklist.md`](../copilot-seat-setup-checklist.md); the core steps are:

1. **Install the standalone CLI.** Install the agentic `copilot` CLI (GA since Feb 2026 — *not* the retired `gh copilot` suggest/explain extension):

    ```bash
    npm install -g @github/copilot
    ```
    Confirm it resolves: `copilot --version` prints a version, no error.

2. **Log in once, per machine.** The interactive login completes the OAuth device flow and persists the credential + host to `~/.copilot/`, so every later headless call (including the ones the router spawns) authenticates automatically:

    ```bash
    copilot login                          # a github.com Copilot license
    copilot login --host SUBDOMAIN.ghe.com # a GitHub Enterprise Cloud tenant seat
    ```
    Copilot licensing is **per-host**: if your Copilot license lives on a `SUBDOMAIN.ghe.com` tenant, you must log in against that host, not `github.com`. Use the account that holds your Copilot license.

3. **Prove a real, authenticated call works** before you trust the seat with a session (this is a direct CLI call — you can run it before the project's `.venv` exists):

    ```bash
    copilot -p "Write PI to 10 decimal places" --model claude-sonnet-4.6 --output-format json
    ```
    It should return **JSON** (an `assistant.message` event with content), **not** an auth prompt or an error.

> **Expect — what a broken seat looks like, and why that's the point.** A seat that runs sessions with an *unauthenticated* Copilot CLI is the exact failure this framework refuses to let happen silently: handed a verification step it cannot perform, an AI agent will fabricate a plausible-looking result. So the framework ships an **auth-preflight** that runs three staged checks — the `copilot` binary resolves on PATH → a credential directory (`~/.copilot`) exists → a live non-interactive probe actually authenticates — and prints an exact remediation on any failure. **This same preflight runs automatically at session start on a Copilot-seat repo:** `start_session` blocks a mis-authed seat from starting a session it could never honestly verify. Seeing the preflight fail is the guardrail working, not a bug. Once your project's `.venv` exists (after Part 2's Build, or after `Dabbler: Install ai-router`), you can run it yourself as a sanity check:
>
> ```bash
> .venv/Scripts/python.exe -m ai_router.copilot_preflight        # Windows
> .venv/bin/python -m ai_router.copilot_preflight                # macOS/Linux
> ```
> It reports **OK** (CLI present, credential present, a live probe authenticates), or prints the exact fix and exits non-zero. `--no-live-probe` runs only the free binary + credential checks without spending a premium request. (The seat is per machine, so each teammate runs Part 0.6 on their own laptop.)

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

2. Create the Azure DevOps **project and repository**. In your Azure DevOps organization (`https://dev.azure.com/{org}`):
    - **If you don't already have a project to use, create one:** click **New project**, name it (e.g. `hello-modules`), set **Visibility** to **Private**, expand **Advanced** and confirm **Version control** is **Git**, then **Create**. (For the operator walk, this is the "scratch project" precondition — one you can freely create and destroy repos, policies, and pipelines in.)
    - Inside that project, go to **Repos** and create a new **empty** repository named `hello-modules` (**do not** initialize it with a README or `.gitignore` — you already committed those locally). A brand-new project ships with one default repo named after the project; either rename/reuse it or add a second repo named `hello-modules`.

3. Connect and push (replace `{org}`, `{project}`, and `{repo}` with your organization, project, and repository names):

    ```bash
    git remote add origin https://dev.azure.com/{org}/{project}/_git/{repo}
    git push -u origin main
    ```

4. **Give your teammates access.** A fresh repo belongs to its creator alone — nothing later works (pushes, required approvals, auto-included-reviewer requests) until Sam and Alex can write to it. On Azure DevOps this is **project membership**: **Project Settings** > **Permissions** — add Sam and Alex to the project's **Contributors** group (or your project's equivalent write-access group). Members of a project can clone, push branches, and be requested as reviewers. Have them confirm access before Part 4.

> **Expect:** `main` exists in your Azure DevOps repo with two files. It is not protected yet — Priya still has two solo setup pushes to make (Parts 2–3); protection goes on at the end of Part 3, before any teammate starts work.

## Part 2 — Build project structure

**Where you are:** Priya has the `hello-modules` folder open in VS Code. The repo contains only `README.md` and `.gitignore`.

1. Click the **Dabbler AI Orchestration** icon in the Activity Bar. This opens the **Work Explorer** view.

    > **Expect:** Because the repository has no session sets yet, the Work Explorer shows the two-section **Getting Started form**, and a companion instructions page opens in the editor.

2. In Section 1 of the form, titled **Build project structure**:
    - **Tier:** select **Full** (metered API verification; the **Lightweight** tier is the $0-API-spend alternative — copy/paste verification, see the extension README for the tradeoff).
    - **Provider access:** select **GitHub Copilot CLI seat** (calls run through your Copilot seat's command-line tool — no `DABBLER_*` keys). This is the choice that makes the Copilot seat, not provider API keys, the Full-tier transport.

3. Click the **Build project structure** button.

    > **Expect:** The scaffold creates:
    > - `.venv/` — a workspace virtual environment with the `ai_router` package installed (ignored by git per Part 1);
    > - `ai_router/` — router configuration; with the Copilot seat chosen and confirmed, `router-config.yaml` is written with `transport.profile: copilot-cli`;
    > - `docs/session-sets/` — the home for all session sets;
    > - AI-agent instruction files at the repo root (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`); **GitHub Copilot reads `AGENTS.md`**;
    > - two comment-only teaching templates — `.github/CODEOWNERS` and `.github/workflows/monorepo-ci.yml`. **These are GitHub-flavored** (the scaffold is host-agnostic and ships the GitHub examples). On Azure DevOps you do **not** use them: Part 7 authors an `azure-pipelines.yml` and sets **branch policies** instead. Leave the `.github/` templates in place (harmless) or delete them — your choice;
    > - a **`default` module** in `docs/modules.yaml` with two starter session sets already scaffolded — `001-default-plan` and `002-default-decomposition` (the Visual Studio `Class1` pattern: a working starting point, not a template to study).
    >
    > With the Copilot seat chosen, Build finishes by **checking the seat's model catalog** and enables the seat profile only when the seat confirms **two distinct provider families** (verification needs a second provider to route to). A **System Status strip** appears above the form **only if something is wrong** — a missing `copilot` CLI, or a seat that failed the two-provider check — each with guidance. An **enterprise-managed seat may expose only one provider family** and fail that check even though the guided flow ran; the form says so honestly rather than leaving a silently broken router. If that happens, fall back to the **Lightweight tier** (the $0-spend, copy/paste-verification alternative) — no strip means a healthy seat.

    > **The form is now replaced by the tree.** Because Build scaffolded two session sets, the Work Explorer switches from the Getting Started form to the module **tree** (it shows the form only while a repo has *no* session sets). You'll see one module, **Default**, with `001-default-plan` and `002-default-decomposition` under it. Re-open the form any time with **`Dabbler: Get Started`**.

    > **Good to know:** if the `.venv` ever needs repairing later, run **`Dabbler: Install ai-router`**; to re-confirm the Copilot seat later (the form is gone once any session set exists), run **`Dabbler: Set Up Copilot Seat`** — it re-runs the same confirmation-gated probe + config write against the existing `.venv`, no re-scaffold.

## Part 3 — Run the starter lifecycle flow, then define the real modules

**Where you are:** Priya, looking at the tree Build produced: one **Default** module with `001-default-plan` and `002-default-decomposition` under it. Before declaring the team's real modules, run those two starter sets **once** to see the two-step lifecycle *every* module follows — a **plan set** (creates the module's plan) then a **decomposition set** (turns the plan into session sets). It's a short, hands-on practice run; then this team, which already knows its three modules, resets and declares them.

1. **Run the plan set.** In the tree, left-click the **`001-default-plan`** row.

    > **Expect:** its `spec.md` opens and the starter line — ``Start the next session of `001-default-plan`.`` — is copied to your clipboard (a toast confirms). Open **GitHub Copilot Chat** in **agent mode** in VS Code, paste (Ctrl+V), and send it. The AI-led session registers, **creates `docs/modules/default/project-plan.md`** (a short plan for the toy — greeter greets, clock tells time, integration composes them), verifies, and commits. When it finishes, `001-default-plan` moves to the **Complete** bucket. *That is a `plan` lifecycle set.*

2. **Run the decomposition set.** With the plan set complete, **`002-default-decomposition`** is no longer blocked (it was waiting on its `prerequisites:` — the plan set). Left-click its row, paste the copied ``Start the next session of `002-default-decomposition`.`` line into Copilot Chat, and send it.

    > **Expect:** the session reads `docs/modules/default/project-plan.md` and **authors the next batch of session-set specs** under `docs/session-sets/`, then verifies and commits. *That is a `decomposition` lifecycle set.* You have now executed the full **Build → plan set → decomposition set** lifecycle that every module uses.

3. **Reset for the real team project.** That was a guided practice run on the `Class1` starter. This team owns **three** modules with per-module ownership and CI, so clear the practice output and declare the real modules explicitly.
    - Delete the Default module: hover its row → **Delete Module…** (removes the `default` manifest entry).
    - Remove the practice sets + plan it produced (nothing is pushed yet, so this is a local reset):

      ```bash
      rm -rf docs/session-sets/001-default-plan docs/session-sets/002-default-decomposition
      rm -rf docs/modules/default
      # plus any NNN-default-* specs the decomposition set wrote
      ```

    > With no session sets left, the Work Explorer flips **back** to the Getting Started form.

4. In Section 2 of the form, titled **Define modules (optional)**, click **Copy AI decomposition prompt** (the palette equivalent is **`Dabbler: Copy Module Decomposition Prompt`**; **`Dabbler: Open modules.yaml`** opens the manifest at any time).

    > **Expect:** a module-decomposition prompt is copied to your clipboard, and a notice tells you to paste it into Copilot and **save `docs/modules.yaml`** when it has been filled in.

5. Paste the prompt into **Copilot Chat**. Copilot reads the repository and edits `docs/modules.yaml` in place, preserving the template's header comments. Describe your team when you paste, for example:

    ```text
    <paste the copied prompt>

    Context: three-person team. Priya owns a greeter module (services/greeter),
    Sam owns a clock module (services/clock), and Alex owns a cross-module
    integration module that composes the other two.
    ```

    Notice the shape: **one developer per module**, not one team per module. Priya, Sam, and Alex each own a *different* module and can all work in parallel with near-zero conflicts; the rule this tutorial never breaks is that two of them never touch the *same* module at the same time (the primer's [§1.2](../planning/module-organized-projects-primer.md#12-what-a-merge-conflict-actually-is) has the rationale). A developer can own more than one module; they just don't share one with a teammate concurrently.

6. Review Copilot's edit, then **save `docs/modules.yaml`**. Below the preserved header comments, the `modules:` list should read:

    ```yaml
    modules:
      # owners: priya@your-org
      - slug: greeter
        title: "Greeter"
        codeRoots:
          - services/greeter
        planPath: docs/modules/greeter/project-plan.md
      # owners: sam@your-org
      - slug: clock
        title: "Clock"
        codeRoots:
          - services/clock
        planPath: docs/modules/clock/project-plan.md
      # owners: alex@your-org, priya@your-org, sam@your-org
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

    A note on the integration entry: it owns its own composition code (`services/integration/`), and its `touches` list is what sanctions its session sets to *work across* `greeter` and `clock` — and obliges both owners to review that work. The `# owners:` comments above each module are the deliberate part: Azure DevOps' auto-included-reviewers policy (Part 7) routes reviews, but nothing in Azure DevOps checks the reviewers named there are the *right people* — this separate roster is the ground truth the companion review audits the policy against.

7. Commit the scaffold and manifest to `main`:

    ```bash
    git add -A
    git commit -m "chore: scaffold project structure and define modules"
    git push
    ```

8. **Now protect `main`** with Azure DevOps **Branch Policies**, so every later change — from anyone, including you — arrives by a reviewed pull request. On the Azure DevOps repository: **Project Settings** > **Repositories** > (your repo) > **Policies** > **Branch Policies**, and select the `main` branch:
    - Turn on **Require a minimum number of reviewers** and set the minimum to **1**. (Azure DevOps does not count the PR author's own vote toward the minimum — the same reason GitHub never requests a review from a PR's own author.) This is what makes a change to `main` require a PR; you add **Build validation** and **Automatically included reviewers** in Part 7.
    - **Close the two bypass permissions — this is the ADO analogue of GitHub's "include administrators", and it is easy to miss.** Azure DevOps has **two separate** bypass permissions, and a **project administrator or the org/project creator (i.e. Priya) commonly inherits both**, which would let *her own* direct push to `main` succeed even with the policy on:
        - **Bypass policies when pushing** — lets the holder push straight to `main`, skipping the policy entirely. This is the one that breaks the "no direct push" guarantee.
        - **Bypass policies when completing pull requests** — lets the holder complete a PR without satisfying the policies.

      Set **both** to an explicit **Deny** at **Project Settings** > **Repositories** > (your repo) > **Security** — select the Contributors group **and Priya's own account** and set the two "Bypass policies…" entries to **Deny**. Use **Deny**, not "Not set": a project administrator usually *inherits* `Allow` for these from another group, and "Not set" leaves that inherited `Allow` in effect — only an explicit **Deny** overrides it (Deny wins in Azure DevOps ACLs). Until you do, "protected `main`" is only protected for accounts that don't already hold the bypass.

    > **Expect:** with the reviewer policy on **and** both bypass permissions set to **Deny**, a direct `git push` of a `main` commit is rejected for everyone — including Priya — and every later change in this tutorial lands through a pull request. (If your own push still succeeds, your account's effective **Bypass policies when pushing** is still `Allow` — it was left "Not set" over an inherited `Allow` rather than explicitly Denied; set it to **Deny**, or run the check from a plain Contributors account.)

## Part 4 — The first plan and the first session set (Command Palette)

**Where you are:** Priya, in the main `hello-modules` window. Modules are declared, but there are no plans and no session sets, so the Getting Started form is still showing.

**The key sequencing fact:** the Getting Started form shows only while the repo has **no session sets**; the Work Explorer switches to the module **tree** the moment the first set exists. Plan-authoring and set-generation are **Command Palette** actions (module-aware — they ask which module you mean) that work in either view.

1. Author the greeter plan. Ask Copilot Chat, in your own words — for example:

    ```text
    Write a short project plan for the greeter module and save it to
    docs/modules/greeter/project-plan.md. Scope: a greet() function in
    services/greeter/ that returns "Hello, world!", plus a unit test.
    ```

    Save the file if Copilot leaves it open as an edit.

    > **Good to know:** if you already have a plan as a Markdown file, **`Dabbler: Import Project Plan`** does the same job without the AI: it asks which module you are importing for (pick **greeter**), opens a file picker, and copies your chosen `.md` file to that module's `planPath`.

2. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run **`Dabbler: Generate Session-Set Prompt`**.

3. A module picker lists the three declared modules. Pick **greeter**.

    > **Expect:** a notice that the session-set generation prompt was copied to your clipboard.

4. Paste the prompt into Copilot Chat. Copilot reads `docs/modules/greeter/project-plan.md` and writes one session-set folder — expect `docs/session-sets/001-greeter-hello/` containing `spec.md` and `session-state.json`.

5. Review what Copilot wrote before accepting it. Check:
    - the folder name starts with a zero-padded number and includes the module slug (`001-greeter-hello`);
    - `spec.md`'s configuration block contains `module: greeter`;
    - `session-state.json` says `"status": "not-started"`.

    > **Expect:** as soon as the first set exists on disk, the Work Explorer switches from the Getting Started form to the module **tree**. If you don't see it within a few seconds, run **`Dabbler: Refresh Work Explorer`**.

6. Land the plan + set on `main` — the first PR under the new branch policy. The framework automates pushing and opening the PR; creating the branch and committing are local actions you still run yourself (local commits are autonomous; only remote-touching actions are gated). Don't name this branch `session-set/001-greeter-hello`: that name is reserved for the *work* branch the worktree tooling creates in Part 6; this is just the authoring PR.

    ```bash
    git switch -c authoring/001-greeter-hello
    git add docs/modules/greeter/project-plan.md docs/session-sets/001-greeter-hello
    git commit -m "docs: greeter plan + session set 001-greeter-hello"
    ```

7. Open the Command Palette and run **`Dabbler: Open PR for this set`**. Enter a "PR title" when prompted (it defaults to the branch name). Despite the command's name, it works from any branch that isn't the trunk — it pushes the branch you are on and opens the PR for it (a detached HEAD is refused).

    > **Automation in action:** The framework now runs the mechanical git for you. Every command that touches the remote first shows a confirmation dialog listing the exact shell commands it will run. You always have the final say. The raw commands for each automated step are in the "Git under the hood" appendix.

    > **Expect:** A confirm dialog titled **"Push this branch and open a PR?"** whose detail lists, in order:
    > ```text
    > git push -u origin authoring/001-greeter-hello
    > az repos pr create --organization https://dev.azure.com/{org} --project {project} --repository {repo} --source-branch authoring/001-greeter-hello --target-branch main --title "…" --description … --output json
    > ```
    > and the line `Target: azure-devops (dev.azure.com), base branch main.` This modal is your oversight — **the HUMAN DECISION is to click "Push + create PR"**. The PR opens in your browser.
    > (An AI agent can invoke this same command, but the confirm modal still goes to the human — the agent can never push, merge, or tag on its own authority.)

8. In Azure DevOps, have Sam or Alex approve the PR — reviewing happens in the browser, so they don't need a clone yet. Complete (merge) it when approved. **Reviewing and approving a PR is a human decision the framework never makes.**

9. Tidy up your local branch. The `Dabbler: Finalize merged set` command cleans up `session-set/*` branches (you'll use it in Part 8), but authoring and hotfix branches still need manual cleanup.

    ```bash
    git switch main
    git pull --ff-only
    git branch -d authoring/001-greeter-hello
    ```

    > **One rule for every cleanup in this tutorial:** the steps assume your repo's default **merge commit** completion strategy. If your repo completes PRs by **squash** or **rebase** instead, the merged commit gets a new identity, so `git branch -d` will refuse with "not fully merged" at *every* cleanup point from here on — including inside `Dabbler: Finalize merged set`, which uses `-d` (never `-D`) and stops with git's message rather than force-deleting. That is git protecting you. Verify the PR's changes are on your pulled `main`, then delete with `git branch -D`. Deleting merged branches never deletes the audit trail: each completed **PR** permanently keeps the branch name, changed files, and reviews.

    > **Expect:** `origin/main` now contains the greeter plan and `001-greeter-hello`.

## Part 5 — Meet the tree ("the tree is the checklist")

**Where you are:** Priya's plan + first set are merged to `origin/main`. Sam and Alex now clone the repo and open it in VS Code. Everyone sees the same tree.

Two per-machine setup steps first: the `.venv` is ignored by git and exists only on Priya's machine, so **Sam and Alex each run `Dabbler: Install ai-router`** once after opening their clone. And because the Copilot seat is per machine, each of them then confirms their seat is authenticated — the repo already carries `transport.profile: copilot-cli` (Priya committed it in Part 3), so all they need is a logged-in local CLI (Part 0.6) that the preflight confirms:

```bash
.venv/Scripts/python.exe -m ai_router.copilot_preflight   # Windows (.venv/bin/python on macOS/Linux)
```

What the Work Explorer now shows:

- One collapsible group per module, in manifest order: **Greeter**, **Clock**, **Cross-Module Integration**.
- Status buckets (**In Progress** / **Not Started** / **Complete** / **Cancelled**) are direct children of the module row.
- `001-greeter-hello` sits under **Greeter** > **Not Started**.
- Hovering or keyboard-focusing a module row reveals its action strip: **Open Plan**, **Add Module…**, **Rename Module…**, **Delete Module…**.

> **Good to know:** a session set whose `spec.md` has no `module:` stamp never disappears — it shows under a group named **Unassigned**. If you ever see **Unassigned**, someone forgot a stamp.

Now Sam and Alex author their own module's plan and first set. Authoring is the same Command Palette flow Priya used in Part 4. Do these two in order — **Sam first, then Alex** — because the AI picks each new set's number from the sets it can see: two people generating from the same `main` snapshot can both get `002`. (Collisions are fail-loud — the workspace refuses duplicate set names — but serializing keeps the numbering tidy.)

1. **Sam (Clock) — plan, generate, land:**
    - Author the clock plan: ask Copilot Chat to write `docs/modules/clock/project-plan.md` (scope: a `now_text()` function in `services/clock/` returning `HH:MM`, plus a test), or run **`Dabbler: Import Project Plan`** (pick **clock**). Save it.
    - Run **`Dabbler: Generate Session-Set Prompt`** from the Command Palette, pick **clock**, and let Copilot write `docs/session-sets/002-clock-hello/`.
    - Land the plan + set on `main` as a small PR:

      ```bash
      git switch -c authoring/002-clock-hello
      git add docs/modules/clock/project-plan.md docs/session-sets/002-clock-hello
      git commit -m "docs: clock plan + session set 002-clock-hello"
      ```

    - Run **`Dabbler: Open PR for this set`**, get an approval and complete the PR in Azure DevOps, then clean up the authoring branch:

      ```bash
      git switch main
      git pull --ff-only
      git branch -d authoring/002-clock-hello
      ```

2. **Alex (Integration) — after Sam's PR merges:**
    - Pull `main` first (`git pull`) — Alex's Copilot now sees `001` and `002`, so his set becomes `003`.
    - Same two steps for the **integration** module: author its plan (ask Copilot, or **`Dabbler: Import Project Plan`** → **integration** — scope: compose greeter + clock into one program printing `Hello, world! It is HH:MM.`), then **`Dabbler: Generate Session-Set Prompt`** → **integration**, producing `docs/session-sets/003-integration-compose/`.
    - **Declare the dependency.** Tell Copilot when you paste the prompt ("this set depends on 001-greeter-hello and 002-clock-hello being complete"), or add it to `spec.md` by hand:

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

    - Run **`Dabbler: Open PR for this set`**, get it approved, and complete it. Then clean up: `git switch main && git pull --ff-only && git branch -d authoring/003-integration-compose`.

    > **Expect:** running **Generate Session-Set Prompt** for a module whose plan file doesn't exist yet pops a warning naming the missing plan path and offering **Import Plan** — author the plan first. And once the prerequisites are declared, Alex's set renders as blocked in the tree (its row offers **Open Prerequisite Spec**) until both dependencies complete.

## Part 6 — Worktrees and running sessions

**Where you are:** All three modules have a plan and a not-started session set on `main`. Priya and Sam will now work in parallel; Alex's integration set waits for its prerequisites (he joins in Part 9, on a branch cut from the updated `main`).

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

4. In the worktree window's **Copilot Chat** (agent mode), paste that line and send it. The AI-led session takes it from there: it registers the session, implements the module (code + test), runs cross-provider verification **through your Copilot seat**, and commits to the session branch — you watch and review. (This is where the Part 0.6 auth-preflight earns its keep: if the seat were mis-authed, the session would refuse to start rather than fake the verification.) At the end of its session Copilot may itself invoke **`Dabbler: Open PR for this set`** — the confirm dialog you'll meet in Part 8 still comes to *you*.

## Part 7 — Ownership + CI guardrails on Azure DevOps

**Where you are:** The AI sessions are running. Meanwhile, one person — Priya — activates the ownership and CI guardrails in the main checkout. Unlike the base tutorial (GitHub CODEOWNERS + Actions), on Azure DevOps these are **branch policies** and an **Azure Pipeline** — configured once, then they gate every PR identically to the GitHub flow.

The scaffold in Part 2 shipped GitHub-flavored `.github/CODEOWNERS` and `.github/workflows/monorepo-ci.yml` templates. On Azure DevOps you don't use those — the three steps below are the ADO equivalents. (Leave the `.github/` files in place or delete them; they do nothing on Azure DevOps.)

1. **Author the pipeline.** Create a new file `azure-pipelines.yml` at the repo root with the complete, final two-layer pipeline for our three modules. It teaches the same contract as the base tutorial's Actions workflow — **path-scoped module jobs** for fast PR feedback, and an **always-on all-modules job** on every push to `main` (the anti-integration-bomb rule: cross-module breakage surfaces on the merge that caused it).

    ```yaml
    # azure-pipelines.yml — two-layer monorepo CI for the hello-modules project.
    #
    # Layer 1 (fast PR feedback): path-scoped per-module jobs. A `changes` job
    #   detects which module directories the PR touched and each module job runs
    #   only when its own directory changed — the ADO equivalent of GitHub's
    #   dorny/paths-filter. This is what makes per-module scoping work at all.
    # Layer 2 (anti-integration-bomb): an always-on `all_modules` job runs on every
    #   push to `main`, so cross-module breakage surfaces on the merge that caused
    #   it. Both layers FAIL on zero collected tests, so a module can never go green
    #   while testing nothing (unittest discover exits 0 on "Ran 0 tests").
    #
    # Wire this pipeline to `main` as a Build validation branch policy (a red run
    # blocks PR completion) — see step 3 below.

    trigger:
      branches:
        include:
          - main

    pr:
      branches:
        include:
          - main

    pool:
      vmImage: ubuntu-latest

    jobs:
      # ---- change detection: the ADO equivalent of GitHub's paths-filter ----
      - job: changes
        displayName: Detect changed modules
        steps:
          - checkout: self
            fetchDepth: 0 # full history so the base-diff below resolves
            persistCredentials: true # leave the OAuth token so `git fetch` below can auth
          - bash: |
              set -euo pipefail
              if [ "$(Build.Reason)" = "PullRequest" ]; then
                TARGET="$(System.PullRequest.TargetBranchName)"
                # Explicit refspec so refs/remotes/origin/$TARGET is actually created/
                # updated (a bare `git fetch origin main` only writes FETCH_HEAD). The
                # `|| true` keeps a failed merge-base from aborting under `set -e` — an
                # unresolved base then falls through to the run-everything fail-safe.
                git fetch --no-tags origin "+refs/heads/$TARGET:refs/remotes/origin/$TARGET"
                BASE="$(git merge-base HEAD "refs/remotes/origin/$TARGET" || true)"
              elif git rev-parse --verify --quiet HEAD~1 >/dev/null; then
                BASE="HEAD~1"
              else
                BASE="" # first commit — no base to diff against; run everything
              fi
              if [ -n "$BASE" ]; then
                CHANGED="$(git diff --name-only "$BASE" HEAD)"
              else
                CHANGED="services/greeter/ services/clock/ services/integration/"
              fi
              echo "Changed paths vs ${BASE:-<root>}:"
              echo "$CHANGED"
              # Fail SAFE: when no base could be determined, every flag is true, so
              # detection failure runs MORE tests, never fewer (the all-modules job
              # is the backstop, but PR feedback should never be vacuously skipped).
              for m in greeter clock integration; do
                if [ -z "$BASE" ] || echo "$CHANGED" | grep -q "^services/$m/"; then
                  echo "##vso[task.setvariable variable=$m;isOutput=true]true"
                  echo "  -> $m: true"
                else
                  echo "##vso[task.setvariable variable=$m;isOutput=true]false"
                  echo "  -> $m: false"
                fi
              done
            name: filter
            displayName: Compute per-module change flags

      # ---- Layer 1: path-scoped per-module jobs (fast PR feedback) ----
      - job: greeter
        dependsOn: changes
        condition: eq(dependencies.changes.outputs['filter.greeter'], 'true')
        displayName: Test greeter module
        steps:
          - checkout: self
          - bash: |
              set -euo pipefail
              n=$(python -c "import unittest; print(unittest.defaultTestLoader.discover('services/greeter').countTestCases())")
              if [ "$n" -eq 0 ]; then
                echo "ERROR: no tests collected in services/greeter - every module must be tested."
                exit 1
              fi
              python -m unittest discover -s services/greeter -v
            displayName: Test the greeter module (fails on zero tests)

      - job: clock
        dependsOn: changes
        condition: eq(dependencies.changes.outputs['filter.clock'], 'true')
        displayName: Test clock module
        steps:
          - checkout: self
          - bash: |
              set -euo pipefail
              n=$(python -c "import unittest; print(unittest.defaultTestLoader.discover('services/clock').countTestCases())")
              if [ "$n" -eq 0 ]; then
                echo "ERROR: no tests collected in services/clock - every module must be tested."
                exit 1
              fi
              python -m unittest discover -s services/clock -v
            displayName: Test the clock module (fails on zero tests)

      - job: integration
        dependsOn: changes
        condition: eq(dependencies.changes.outputs['filter.integration'], 'true')
        displayName: Test integration module
        steps:
          - checkout: self
          - bash: |
              set -euo pipefail
              n=$(python -c "import unittest; print(unittest.defaultTestLoader.discover('services/integration').countTestCases())")
              if [ "$n" -eq 0 ]; then
                echo "ERROR: no tests collected in services/integration - every module must be tested."
                exit 1
              fi
              python -m unittest discover -s services/integration -v
            displayName: Test the integration module (fails on zero tests)

      # ---- Layer 2: all-modules guardrail, on pushes to main only ----
      - job: all_modules
        displayName: Test ALL modules (never vacuously green)
        condition: >-
          and(eq(variables['Build.SourceBranch'], 'refs/heads/main'),
              ne(variables['Build.Reason'], 'PullRequest'))
        steps:
          - checkout: self
          - bash: |
              set -euo pipefail
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
            displayName: Test every services/* module
    ```

    Three details worth noticing:
    - The `changes` job is the Azure DevOps stand-in for GitHub's `paths-filter`: Azure Pipelines has no per-job path filter, so a small script computes which module directories changed and sets one output variable per module; each module job's `condition` reads `dependencies.changes.outputs['filter.<module>']`. Every module with a `codeRoot` gets its own filter + job.
    - **An existing module can't go green while testing nothing.** `unittest discover` exits 0 on "Ran 0 tests", so a naive command can pass vacuously. Every module job counts collected tests and fails on zero, and the `all_modules` job applies the same guard to every `services/` directory. The change detection **fails safe** — if it can't resolve a base commit it runs every module — so a detection glitch over-tests rather than skipping silently.
    - The `all_modules` job is gated to **pushes to `main`** (`Build.SourceBranch == refs/heads/main` and the reason is not a PR). On the very first merge — the guardrails PR itself, before any module code exists — `services/` is missing, so it passes vacuously exactly once and says so in the log.

2. **Push the pipeline first (order matters).** Azure DevOps registers a pipeline from a YAML file it can *see in the repo* — it cannot select a file that only exists in your local working tree. So commit and push `azure-pipelines.yml` on its own branch and open its PR *before* registering the pipeline:

    ```bash
    git switch -c chore/guardrails
    git add azure-pipelines.yml
    git commit -m "build: activate Azure Pipelines monorepo CI"
    ```
    Run **`Dabbler: Open PR for this set`** and confirm ("Push + create PR") — this pushes `chore/guardrails` (now Azure DevOps can see the YAML on that branch) and opens the PR. Leave the PR open; you complete it in step 5, after its Build validation exists.

3. **Register the pipeline** — and clear the one prerequisite a brand-new organization usually lacks. **Pipelines** > **New pipeline** > **Azure Repos Git** > pick your `hello-modules` repo > **Existing Azure Pipelines YAML file** > set **Branch** to `chore/guardrails` > select `/azure-pipelines.yml` > **Save** (Save, then run once).

    > **Hosted-agent capacity — check this before the first run.** `azure-pipelines.yml` uses `pool: vmImage: ubuntu-latest`, a **Microsoft-hosted** agent. A brand-new Azure DevOps organization often starts with **zero hosted parallel jobs**, so the first run stays queued with a "no hosted parallelism" error. Check **Organization Settings** > **Pipelines** > **Parallel jobs**: if hosted parallelism is 0, request the **free grant** (Microsoft approves it out of band — it can take a couple of business days, so do this well before Session 2's walk). The alternative is a **self-hosted agent pool**: create one, then replace the pipeline's `pool:` block with `pool: name: <your-pool>` (and ensure Python 3 is on that agent). Either way, confirm one run can actually execute before wiring Build validation.

4. **Set the branch policies on `main`.** In **Project Settings** > **Repositories** > (your repo) > **Policies** > **Branch Policies** on `main`:
    - **Automatically included reviewers** (the CODEOWNERS equivalent — it reproduces *both* halves: the review request *and* the requirement) > **+**. Add one entry per module, each marked **Required**, naming the owner(s) and a **path filter**:
        - Priya (greeter) — path filter `/services/greeter/*;/docs/modules/greeter/*`
        - Sam (clock) — path filter `/services/clock/*;/docs/modules/clock/*`
        - Alex, Priya, Sam (integration) — path filter `/services/integration/*;/docs/modules/integration/*` (the touched modules' owners review the composition)
        - A shared entry naming all three, path filter `/docs/modules.yaml;/azure-pipelines.yml` (the conflict-magnet files every owner should see)

      Note the integration rule lists Priya and Sam alongside Alex: the integration module composes *their* code (`touches: [greeter, clock]`), so the owners of every touched module review its PRs. Keep the `# owners:` roster in `docs/modules.yaml` as the ground truth — nothing in Azure DevOps checks that the identities in the policy are the *right people*.
    - **Build validation** (the required check) > **+** > pick the pipeline you registered in step 3 > mark it **Required**. Build validation is Azure DevOps' "required status check": a red pipeline blocks PR completion. Unlike GitHub, there is **no separate check-selection step** — the Build validation policy *is* the required check, configured once.

5. **Complete the guardrails PR.** Build validation was added *after* the PR opened, so its first validation run may need a nudge: on the `chore/guardrails` PR page, **queue** the Build validation run (or push a trivial commit) so the policy evaluates. Once it is green and approved, **Complete** the PR (leave "Delete `chore/guardrails` after merging" checked), then clean up locally: `git switch main && git pull --ff-only && git branch -d chore/guardrails`.

    > **Expect:** the pipeline runs on the PR (per-module jobs skip, since only `azure-pipelines.yml` changed; the `changes` job succeeds) and on the merge to `main` (the `all_modules` job runs and passes vacuously — no `services/` yet — logging that it did so).

## Part 8 — Small PRs to main

**Where you are:** Priya's session finished: the `session-set/001-greeter-hello` branch has the code committed. The guardrails PR is merged. The core habit: **merge a set when it completes.** Small, frequent, boring merges.

1. **Priya:** From inside the worktree window, open the Command Palette and run **`Dabbler: Open PR for this set`**.

    > **Expect:** the confirm dialog from Part 4, now on the session branch — **"Push this branch and open a PR?"**, with the title defaulting to **"Session set 001-greeter-hello"**. After you confirm ("Push + create PR"), the PR triggers the path-scoped **Test greeter module** job (the filter matched `services/greeter/`) — and not clock's. No reviewer is auto-added for Priya's own PR: the only owner of the touched paths is Priya herself, and Azure DevOps won't count the author's own vote toward the reviewer minimum. Branch policy still wants one approval — Sam gives it.

2. Once the PR is approved and CI is green, **Complete** it in Azure DevOps. The completion dialog offers **"Delete `session-set/001-greeter-hello` after merging"** — checked by default; leave it on so merged source branches don't pile up on the remote (Azure DevOps' equivalent of GitHub's auto-delete-head-branches).

3. **Finalize the merge.** From your **main repository window** (not the worktree), run **`Dabbler: Finalize merged set`**.

    > **Expect:** with only one session worktree open, the command goes straight to the confirm dialog (when several are open, a quick pick asks "Which merged set should be finalized?" first). The dialog is titled **"Finalize merged set 'session-set/001-greeter-hello'?"** and lists the exact commands, in order:
    > ```text
    > git pull --ff-only
    > git worktree remove <path-to-worktree>
    > git branch -d session-set/001-greeter-hello
    > git fetch --prune
    > ```
    > Each step is idempotent (an already-done step reports itself and the flow continues). This is your oversight — **the HUMAN DECISION is to click "Finalize"**.
    >
    > After it finishes: the worktree folder is gone (close that worktree's VS Code window), the merge has been pulled onto your local `main`, and the Work Explorer shows `001-greeter-hello` in the **Complete** bucket under **Greeter**. On the host, the merge to `main` also ran the **Test ALL modules** pipeline job.

4. **Sam:** exactly the same flow for `002-clock-hello`: run `Dabbler: Open PR for this set` from the worktree, get Priya's approval, complete the PR, then run `Dabbler: Finalize merged set` from the main checkout.

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
    Left-click the `003-integration-compose` row, paste the starter line into the worktree window's Copilot Chat, and let the session compose the two modules into `services/integration/` (with a test that exercises the real `greeter` and `clock` code now on the branch).

2. From the worktree window, run **`Dabbler: Open PR for this set`** and confirm.

    > **Expect:** because the **Automatically included reviewers** policy for `/services/integration/*` names Alex, Priya, and Sam, Azure DevOps automatically adds **Priya and Sam** as required reviewers (Alex is the author, so his own vote doesn't count toward the minimum). This is the `touches` discipline in practice: the owners of every composed module see the composition before it lands.

3. Priya and Sam approve, CI is green, and Alex completes the PR in Azure DevOps.

4. From the main checkout window, Alex runs **`Dabbler: Finalize merged set`** and confirms, syncing `main` and cleaning up his worktree and branch.

    > **Expect:** the `all_modules` job passes on `main` — the composed program's tests ran together for the first time on the merge that composed them.

## Part 10 — Tag, deploy, hotfix, rollback

**Where you are:** All three sets are **Complete** in the tree, everything is merged, `main` is green. Time to ship — and practice the two drills you will one day be glad you practiced. **What and when to release, and whether to roll back, are human decisions** — the commands below only remove the typing. (These commands are pure git — tags, branches, refs — so they behave identically on Azure DevOps and GitHub.)

1. **Tag the release.** This toy ships as one unit, so use one repo-wide tag. From the main checkout, on an up-to-date trunk (`git switch main && git pull --ff-only` if unsure), run **`Dabbler: Cut release tag`**:
    - **"Release tag name"**: `v0.1.0`
    - **"Commit to tag"**: accept the default (`HEAD`)
    - **"Tag annotation message"**: e.g. `hello-modules 0.1.0`

    > **Expect:** A confirm dialog titled **"Cut and push release tag 'v0.1.0'?"** whose detail lists exactly:
    > ```text
    > git tag -a v0.1.0 <sha> -m "hello-modules 0.1.0"
    > git push origin v0.1.0
    > ```
    > plus the resolved commit (sha + subject) the tag will point at — the tag is pinned to that exact commit, so a branch moving while the dialog is open cannot change what gets tagged. A pushed tag is immutable by convention — review the tag and commit, then **the HUMAN DECISION is to click "Create + push tag"**. (Re-running with the same name refuses: "Tag 'v0.1.0' already exists.")

2. **"Deploy"** means running the tagged snapshot. This is still a manual teaching step:

    ```bash
    git checkout v0.1.0
    python services/integration/app.py
    git switch main
    ```
    > **Good to know:** The `Dabbler: Roll back to tag` command (step 4) automates exactly this checkout when you need it under pressure.

3. **Hotfix drill.** A bug is found in production (say, the greeting's capitalization) while `main` has already moved on. Fix it **from the deployed tag**, never from `main` — `main` may contain unreleased work you do not want to ship. Authorizing a hotfix is a human decision; the framework only cuts the branch.
    - Run **`Dabbler: Start hotfix from tag`**.
    - **"Which release tag is the hotfix based on?"**: pick `v0.1.0`.
    - **"Hotfix branch name"**: accept the default, `hotfix/v0.1.0`.

    > **Expect:** A confirm dialog **"Start hotfix branch 'hotfix/v0.1.0' from 'v0.1.0'?"** listing `git switch -c hotfix/v0.1.0 v0.1.0` and explaining it branches from the deployed snapshot, never the trunk. Click **"Create hotfix branch"**. (The command refuses to start from a dirty tree — the branch must be exactly the tagged snapshot.)

    - Now, on the new branch, make the code change and commit it (local commits are autonomous):
      ```bash
      # ...fix the string in services/greeter/ ...
      git commit -am "fix(greeter): correct the greeting"
      ```
    - Run **`Dabbler: Open PR for this set`** and confirm (the path-scoped `Test greeter module` job runs on the PR — pull requests trigger the pipeline regardless of branch name). Get a teammate's approval and wait for green.
    - **Validate before you tag.** The PR check runs against Azure DevOps' *preview merge* of your branch with `main` — good for compatibility, but not literally the snapshot you are about to tag — and the path-scoped job tested only the changed module, while the tag ships **all** of them. So run the full integrated suite locally on the exact hotfix commit first (Bash / Git Bash):

      ```bash
      ( for d in services/*/; do python -m unittest discover -s "${d%/}" -v || exit 1; done ) &&
      python services/integration/app.py
      ```

      PowerShell equivalent:

      ```powershell
      Get-ChildItem services -Directory | ForEach-Object {
        python -m unittest discover -s $_.FullName -v
        if ($LASTEXITCODE -ne 0) { throw "tests failed in $($_.Name)" }
      }
      python services/integration/app.py
      ```

    - Still on the `hotfix/v0.1.0` branch, run **`Dabbler: Cut release tag`**: tag name `v0.1.1`, "Commit to tag" default (HEAD — the hotfix commit), message e.g. `hello-modules 0.1.1 (hotfix)`. The tag goes **on the hotfix commit itself** — exactly `v0.1.0` plus the reviewed, validated fix. Do *not* merge first and tag `main`: if `main` has unreleased work, a tag placed there would ship it.
    - Deploy `v0.1.1`, then complete the PR in Azure DevOps so the fix is not lost from the trunk.
    - Clean up the hotfix branch manually (it is not a `session-set/*` branch, so `Dabbler: Finalize merged set` does not offer it):
      ```bash
      git switch main
      git pull --ff-only
      git branch -d hotfix/v0.1.0
      git fetch --prune
      ```
      (The tag keeps the release commit reachable forever, so deleting the merged branch loses nothing. Squash/rebase completion: see the Part 4 rule — verify the fix landed on `main`, then use `-D`.)

4. **Rollback drill.** Pretend `v0.1.1` turns out worse. Rolling back is *not* git surgery — it is deploying the previous tag again. Rollback authorization is a human decision; the command runs only after you confirm.
    - Run **`Dabbler: Roll back to tag`**.
    - **"Which release tag do you want to roll back to?"**: pick `v0.1.0`.

    > **Expect:** A confirm dialog **"Roll back to 'v0.1.0'?"** listing `git checkout v0.1.0` and warning you will be on a **DETACHED HEAD**. Click **"Check out tag"**. Prove you are on the old snapshot (`python services/integration/app.py` prints the pre-fix greeting), then return to the trunk with `git switch main`.

## What to observe — self-check checklist

Tick these off; each one is directly verifiable:

- [ ] `docs/modules.yaml` on `main` declares `greeter`, `clock`, and `integration` (with `touches: [greeter, clock]` on integration), and the Work Explorer lists the three module groups in that order.
- [ ] Each module's plan file exists at its `planPath` (e.g. `docs/modules/greeter/project-plan.md`) — the module row's **Open Plan** action opens it.
- [ ] `docs/session-sets/` contains exactly `001-greeter-hello`, `002-clock-hello`, `003-integration-compose` — globally-unique names, each `spec.md` stamped with its `module:`.
- [ ] `003-integration-compose`'s spec declares `prerequisites:` on the other two sets, and its row showed as blocked in the tree until both completed.
- [ ] All three sets sit in the **Complete** bucket under their modules; nothing appears under an **Unassigned** group.
- [ ] `main` is protected by **Branch Policies**: a direct push is rejected; PRs need one approval and green Build validation.
- [ ] The **Automatically included reviewers** policy is active: Alex's integration PR auto-added Priya and Sam as required reviewers.
- [ ] The Azure DevOps **Pipelines** tab shows path-scoped jobs for the changed modules on their PRs (including `Test integration module` on Alex's), and the `Test ALL modules` job on every merge to `main`.
- [ ] The **Build validation** branch policy points at the `azure-pipelines.yml` pipeline and is **Required** — a red run blocks PR completion.
- [ ] The loop ran through the framework: session PRs opened by **`Dabbler: Open PR for this set`**, post-merge sync/cleanup by **`Dabbler: Finalize merged set`**, both tags by **`Dabbler: Cut release tag`** — and every one of those actions previewed its exact commands and waited for your confirm.
- [ ] `git tag -l` lists `v0.1.0` and `v0.1.1`, and `git for-each-ref refs/tags --format="%(refname:short) %(objecttype)"` shows both as `tag` (annotated).
- [ ] Every declared `codeRoot` exists on `main` with code and tests: `services/greeter/`, `services/clock/`, and `services/integration/` all match what `docs/modules.yaml` declares.
- [ ] Checking out `v0.1.1` and running the integration program prints the corrected greeting with the time (`Hello, ... It is HH:MM.`).
- [ ] Worktrees are closed: `.venv/Scripts/python.exe -m ai_router.worktree list` (Windows; `.venv/bin/python` on macOS/Linux) reports no session-set worktrees left open — `Dabbler: Finalize merged set` removed each one.
- [ ] No merged branches linger: `git branch --merged main` lists only `main`, and `git branch -r` shows no leftover authoring/guardrails/session-set/hotfix branches (Azure DevOps' delete-after-merge, `Dabbler: Finalize merged set`, and the manual authoring/hotfix cleanups did their job).
- [ ] The Copilot seat is the transport: `ai_router/router-config.yaml` on `main` reads `transport.profile: copilot-cli`, and `python -m ai_router.copilot_preflight` reports OK on each teammate's machine.

Where to go next: decompose a real project the same way — and run the [module workflow review prompt](./module-team-hello-world-review-prompt.md) on a cadence to keep the habits honest.

---

## Appendix — Git under the hood: what the framework ran for you

The Dabbler commands run the mechanical git for you, but you should still understand the mechanics. The framework's goal is to remove keystrokes, not oversight. Here is the exact command sequence each automated step runs on your behalf.

### `Dabbler: Open PR for this set`
Pushes the current branch to `origin` and opens a pull request. Host detection is automatic from the `origin` remote URL (override: the `dabblerSessionSets.gitHost` setting).
1.  `git push -u origin <current-branch-name>`
2.  Then, on **Azure DevOps** (with the `az` CLI): `az repos pr create --organization https://dev.azure.com/{org} --project {project} --repository {repo} --source-branch <branch> --target-branch main --title "…" --description … --output json` (org/project/repo are parsed from the remote URL — no `az devops configure --defaults` needed).
3.  **No CLI found:** the push still happens (it is pure git), then Azure DevOps' create-a-PR page opens in the browser for you to complete the form.

### `Dabbler: Finalize merged set`
Run from the main checkout *after* the PR has been completed on the host. It syncs the trunk and cleans up the completed set's branch and worktree. Every step is idempotent.
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

- The `Finalize` command is tailored to the `session-set/*` branch lifecycle. Authoring branches (like `authoring/001-greeter-hello`) and hotfix branches don't use worktrees, so their cleanup stays a short manual sequence after their PRs merge (`git switch main && git pull --ff-only && git branch -d <branch> && git fetch --prune`).
- The one-time bootstrap (creating the repo, branch policies, auto-included reviewers, the pipeline) is deliberately not automated — that is policy you should set consciously, not toil.
- Reviewing and completing PRs happens on Azure DevOps, by a human (or a different agent) — the framework never approves, merges, or releases anything on its own authority.

---

## Appendix — Sync Map

This document is a standalone re-cut of the agent-agnostic, GitHub-worked [base tutorial](./module-team-hello-world.md). The **module / trunk / worktree / session-lifecycle spine is shared** and must stay identical between the two documents; the **host (Azure DevOps) and agent (GitHub Copilot) mechanics are specific** to this cut. This map is how a maintainer keeps the pair honest.

| This doc (Copilot + Azure DevOps) | Base tutorial part | Shared spine vs host/agent-specific |
|---|---|---|
| Part 0 — Prerequisites | Part 0 | Host/agent-specific (ADO org, Copilot seat) |
| Part 0.5 — Azure DevOps CLI setup | Part 0.5 | Host-specific (az vs gh) |
| Part 0.6 — GitHub Copilot seat setup | *(new — no base equivalent)* | Agent-specific |
| Part 1 — Init the trunk | Part 1 | Shared spine (git init/trunk); host-specific (remote URL, project membership) |
| Part 2 — Build project structure | Part 2 | Shared spine (scaffold/modules); agent-specific (seat profile choice) |
| Part 3 — Starter lifecycle, then real modules | Part 3 | Shared spine (lifecycle, modules.yaml); host-specific (branch policies) |
| Part 4 — First plan + first session set | Part 4 | Shared spine (authoring flow); host-specific (PR dialog) |
| Part 5 — Meet the tree | Part 5 | Shared spine; agent-specific (per-machine seat preflight) |
| Part 6 — Worktrees and running sessions | Part 6 | Shared spine (agent = Copilot) |
| Part 7 — Ownership + CI guardrails | Part 7 | Host-specific (branch policies, azure-pipelines.yml) |
| Part 8 — Small PRs to main | Part 8 | Shared spine (loop); host-specific (complete dialog) |
| Part 9 — The integration set | Part 9 | Shared spine (touches logic); host-specific (auto-included reviewers) |
| Part 10 — Tag, deploy, hotfix, rollback | Part 10 | Shared spine (pure-git commands, host-agnostic) |
| Self-check checklist | Self-check checklist | Shared spine + host-specific acceptances |
| Appendix — Git under the hood | Appendix — Git under the hood | Shared spine; host-specific (PR-create line) |

**Maintenance note (the every-echo discipline):** an edit to **shared-spine** content must land in **both** [`module-team-hello-world.md`](./module-team-hello-world.md) and `module-team-hello-world-copilot-ado.md` in the **same PR**. Host/agent-specific rows are edited independently. The companion [module workflow review prompt](./module-team-hello-world-review-prompt.md) audits the pair for drift.
