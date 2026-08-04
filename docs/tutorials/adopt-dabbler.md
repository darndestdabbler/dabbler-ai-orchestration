# Adopt Dabbler: ship your first module in a real repository

Build a tiny Python module with AI-led sessions, in a repository you keep, behind a real
pull-request gate. You finish with code on `main` that prints one line — and with the habits
the framework is built around.

- **Start here?** No. [Hello World](hello-world.md) is the 15-minute first run, on a local
  sample, with no host and no git commands to type. Do that first; this guide is what comes
  after it, when you
  are putting Dabbler into a repository you actually keep.
- **Audience:** you can commit and push with `git`. Nothing else is assumed.
- **Time:** about an hour and a half — an estimate, not a stopwatch reading — most of it
  watching AI sessions work.
- **Scope: one person, one module.** That is the whole guide, start to finish, and there is
  no team half waiting at the end. Several modules built independently and composed over an
  agreed contract — with teammates, or alone — is the next tutorial up:
  [Three modules, one pipeline](three-module-pipeline.md).

> ## Pick your host before you start: **GitHub** or **Azure DevOps**
>
> This walkthrough works on both. Every **Dabbler** command behaves identically on either —
> what differs is the host's own guardrails (branch policies, required checks, review routing).
>
> Wherever they differ you will see a block like this:
>
> > **▸ Your host — do ONE of these.**
> >
> > - **GitHub:** …
> > - **Azure DevOps:** …
>
> **Read only the line for your host and ignore the other. They are alternatives, never both.**
> Anything *not* inside a `▸ Your host` block is the same on both hosts — just do it.
>
> **On Azure DevOps, Part 4's CI step is the one real divergence.** GitHub Actions workflows
> are ignored by Azure DevOps, so that step gives you a working `azure-pipelines.yml` to use
> instead. Everything else is a setting with a different name.

## Part 1 — Install and verify the tools

1. **Visual Studio Code** 1.85 or newer.
2. The **Dabbler AI Orchestration** extension from the VS Code Marketplace.
3. **Python** 3.10 or newer — check with `python --version`.
4. **GitHub Copilot CLI** (your AI agent for this tutorial; needs an active Copilot seat).
   Install it, then sign in by running `copilot` once and following its prompt:

   ```bash
   winget install GitHub.Copilot
   copilot --version
   copilot -p "Write PI to 10 decimal places" --model claude-sonnet-4.6
   ```

   The last should print π to ten places and exit 0; `No authentication information found`
   means you are not signed in yet. That `winget` install is self-contained — no Node.js
   needed. On macOS or Linux install from npm instead (`npm install -g @github/copilot`),
   which needs **Node.js 22 or newer**.

   **This CLI is where you run the AI sessions.** Wherever this tutorial says *paste it into
   Copilot*, it means: open a terminal inside VS Code (**Terminal > New Terminal**), run
   `copilot`, and paste at its prompt. It is a separate tool from the GitHub Copilot Chat VS
   Code extension, which you do not need.

   > **CLI versions move — the Copilot CLI updates itself.** Dabbler pins the version it probed
   > your seat with, so routed calls fail closed rather than silently change behavior. Expect
   > `copilot --version` to drift past the pin; when it does, re-probe with **`Dabbler: Set Up
   > Copilot Seat`** (available once Part 3 has created the `.venv`).

5. **Your host's command-line tool**, so Dabbler can open pull requests without a browser trip.
   This is the tool **`Dabbler: Open PR for this set`** drives for you in Part 4.

   > **▸ Your host — do ONE of these.**
   >
   > - **GitHub:** install **GitHub CLI** from [cli.github.com](https://cli.github.com), then
   >   run `gh auth login` and `gh auth status`.
   > - **Azure DevOps:** install the **Azure CLI** from
   >   [aka.ms/installazurecli](https://aka.ms/installazurecli), add the DevOps extension with
   >   `az extension add --name azure-devops`, then run `az login`.

> **Variant — direct provider API keys instead of a Copilot seat.** Set
> `DABBLER_ANTHROPIC_API_KEY`, `DABBLER_GEMINI_API_KEY`, and `DABBLER_OPENAI_API_KEY` in your
> environment, skip step 4, and in Part 3 leave **Provider access** on its default. You still
> need an AI agent inside VS Code — Claude Code, Codex, or Gemini Code Assist all work; paste the
> starter lines into that agent's chat instead of the Copilot CLI.

## Part 2 — Create and clone the repository

1. **Create an empty repository named `hello-modules`.**

   > **▸ Your host — do ONE of these.**
   >
   > - **GitHub:** click **New repository**, name it `hello-modules`, set it **Public**, tick
   >   **Add a README file**, create it. Public matters: on GitHub Free, branch protection only
   >   works on public repositories, and Parts 3–4 depend on it. On a paid plan, private is fine.
   > - **Azure DevOps:** create a project, then a Git repository named `hello-modules`, and add
   >   a README so there is something to clone. Visibility does not matter — ADO branch policies
   >   work on private projects, so the GitHub-Free caveat does not apply to you.

2. **Clone it into VS Code.** Command Palette (`Ctrl+Shift+P`) → **`Git: Clone`** → paste your
   repository URL → pick a folder → open the clone. This step is identical on both hosts; only
   the URL differs (`https://github.com/{you}/hello-modules.git` versus
   `https://dev.azure.com/{org}/{project}/_git/hello-modules`).

## Part 3 — Set up Dabbler and name your first module

1. Click the **Dabbler AI Orchestration** icon in the Activity Bar. The repo has no session
   sets yet, so the **Getting Started** form opens. In **Build project structure**, set
   **Tier** to **Full**, set **Provider access (how routed calls run)** to **GitHub Copilot
   CLI seat**, and click **Build project structure**. (On the direct-API variant, leave
   provider access on its default and enter a not-to-exceed budget when asked.)

   You get a `.venv/` with `ai_router` installed, an `ai_router/` config folder,
   `docs/session-sets/`, AI-agent instruction files, comment-only `.github/CODEOWNERS` and
   `monorepo-ci.yml` templates, and a starter module **Default** carrying `001-default-plan` and
   `002-default-decomposition`. The form gives way to the tree.

2. **Make the starter module yours** — your first module is `greeter`:
   - Run **`Dabbler: New Module`**. At *New module (1/2): slug* enter `greeter`; at *New
     module (2/2): display title* enter `Greeter`. This declares the module, writes a plan
     stub, and scaffolds its two lifecycle sets, `003-greeter-plan` and
     `004-greeter-decomposition`.
   - Run **`Dabbler: Delete Module`**, pick **Default**, confirm with **Delete Module**.
     Its two untouched starter sets go with it.
   - Delete the leftover `docs/modules/default/` folder — Delete Module removes the manifest
     entry and the sets, never a plan file. Numbering starts at `003` because `001`/`002` were
     Default's; session-set names are permanent identities and are never renumbered.

3. **Set the code root by hand** — no command does this for you. Edit the entry in
   `docs/modules.yaml` until it reads:

   ```yaml
   modules:
     - slug: greeter
       title: "Greeter"
       codeRoots:
         - services/greeter
       planPath: docs/modules/greeter/project-plan.md
   ```

4. Commit and push the setup: `git add -A`, then `git commit -m "chore: scaffold Dabbler
   and declare the greeter module"`, then `git push`.

5. **Protect `main` (stage 1 of 2).** From here on, every change reaches `main` through a pull
   request — including your own.

   > **▸ Your host — do ONE of these.**
   >
   > - **GitHub:** **Settings** > **Branches**, add a rule for `main`, turn on **Require a pull
   >   request before merging**, and leave **Require approvals** **unticked** — that is zero
   >   approvals, and you need it, because you are working alone here and nobody else can
   >   approve you. If you are an admin, also enable the do-not-allow-bypass option so the rule
   >   binds you too.
   > - **Azure DevOps:** **Project Settings** > **Repositories** > your repo > **Policies** >
   >   **Branch Policies** on `main` > **Require a minimum number of reviewers**. Its minimum is
   >   1, not 0, so also tick **Allow requestors to approve their own changes** and cast your own
   >   **Approve** vote on each solo pull request.

   > **When somebody joins you**, this is the setting that changes: raise **Require approvals**
   > to 1 on GitHub, or untick **Allow requestors to approve their own changes** on Azure
   > DevOps, so a second person's vote is the one that counts.

## Part 4 — Build and ship the first module

Every module follows the same lifecycle: a **plan** set writes the module's plan, a
**decomposition** set turns that plan into implementation sets, and each implementation set
writes real code. You run all three now, on work you keep.

`main` is protected as of Part 3, so nothing reaches it by direct push any more — including the
docs these first two sets write. Start an authoring branch and stay on it for steps 1–2:

```bash
git switch -c authoring/greeter-lifecycle
```

1. **Run the plan set.** Left-click **`003-greeter-plan`** in the Work Explorer. Its spec opens
   and this line is copied to your clipboard:

   ```text
   Start the next session of `003-greeter-plan`.
   ```

   Run `copilot` in the VS Code terminal, paste that line at its prompt, add the scope on the
   next line, and send the whole thing as one message:

   ```text
   Scope: a greet() function in services/greeter/greeter.py returning "Hello, world!",
   a unit test beside it, and a __main__ block that prints it. It must be runnable
   from the repository root with: python -m services.greeter.greeter
   ```

   The session writes `docs/modules/greeter/project-plan.md`, verifies, and commits; the set
   moves to **Complete**.

2. **Run the decomposition set.** `004-greeter-decomposition` was blocked on the plan set and
   is now free. Left-click it, paste its starter line, send. It reads the plan and writes one
   implementation set — expect `005-greeter-hello` or similar. **Write down the name it actually
   gave you**: everywhere below that says `005-greeter-hello`, type your set's real name.

3. **Land the plan and the new set on `main`.** Both sessions commit their own work, so
   `git status --short` is usually empty here — if it is not, commit the remainder
   (`git add -A && git commit -m "docs: greeter plan and its implementation set"`). Then run
   **`Dabbler: Open PR for this set`**, merge it, and get back onto an up-to-date trunk:

   ```bash
   git switch main && git pull --ff-only && git branch -d authoring/greeter-lifecycle
   ```

   This matters for the next step: the worktree is cut from `main`, so the set has to be on
   `main` before you open one.

4. **Open a worktree for it.** Implementation sets write code, and they get their own folder as
   well as their own branch — so your main checkout stays on `main`, usable, while the AI works.
   (The doc-only plan and decomposition sets above are short and were fine on a branch in place;
   the isolation matters once a session is changing code.)

   ```text
   .venv\Scripts\python.exe -m ai_router.worktree open 005-greeter-hello
   ```

   A sibling folder `hello-modules-worktrees/005-greeter-hello/` appears, on the branch
   `session-set/005-greeter-hello`. (macOS/Linux: use `.venv/bin/python`.)

5. **Open that folder in a new VS Code window**, left-click the set's row, and paste its starter
   line into `copilot` running in *that* window's terminal. The session implements the module,
   tests it, and commits to the session branch. Watch it work.

6. **Turn on CI, on the same branch.** A module with tests now exists, so open
   `.github/workflows/monorepo-ci.yml` in the worktree and make the scaffolded job real: add
   two steps that install Python and pytest, then replace the placeholder step's `run:` block
   with a command that tests every module. Nothing else changes — the job is already named
   `test`, and it already runs on pull requests as well as on pushes to `main`.

   ```yaml
   jobs:
     test:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-python@v5
           with:
             python-version: "3.12"
         - run: python -m pip install pytest
         - name: Build and test every module
           run: |
             for module in services/*/; do
               echo "== $module"
               python -m pytest -q "$module" || exit 1
             done
   ```

   One job, always running, testing every module. Because each module directory is tested on its
   own, a module shipping **zero** tests fails the build instead of hiding behind another
   module's passing tests — and the `echo` puts one `== services/<module>/` line per module in
   the job log, so you can see that happening. Commit this change on the session branch. (Large
   repositories can add path filtering — but keep one always-running aggregate job as the
   required check.)

   > **▸ Your host — do ONE of these.** This is the one step where the two hosts genuinely
   > diverge, rather than just naming a different setting.
   >
   > - **GitHub:** the YAML above is all of it. Commit it on the session branch.
   > - **Azure DevOps:** GitHub Actions workflows are ignored entirely. Delete
   >   `.github/workflows/monorepo-ci.yml`, and create `azure-pipelines.yml` at the repository
   >   root instead — it does exactly the same job:
   >
   >   ```yaml
   >   trigger:
   >     branches:
   >       include: [main]
   >   pr:
   >     branches:
   >       include: [main]
   >
   >   pool:
   >     vmImage: ubuntu-latest
   >
   >   steps:
   >     - task: UsePythonVersion@0
   >       inputs:
   >         versionSpec: "3.12"
   >     - script: python -m pip install pytest
   >       displayName: Install pytest
   >     - script: |
   >         for module in services/*/; do
   >           echo "== $module"
   >           python -m pytest -q "$module" || exit 1
   >         done
   >       displayName: Build and test every module
   >   ```
   >
   >   Commit it on the session branch. Then **Pipelines** > **New pipeline** > **Azure Repos
   >   Git** > your repo > **Existing Azure Pipelines YAML file** > `/azure-pipelines.yml` >
   >   **Save**. Finally — **before** opening the pull request — add it under **Branch Policies**
   >   on `main` > **Build validation**, marked **Required**; without that, step 7 has nothing to
   >   wait on.
   >
   >   *If your organisation has its own pipeline standards, use them — this is a working
   >   starting point, not a mandate.*

7. **Open the pull request.** From the worktree window, run **`Dabbler: Open PR for this set`**.
   A dialog lists the exact commands it will run — `git push`, then `gh pr create` on GitHub or
   `az repos pr create` on Azure DevOps — and you click to approve. Every remote-touching
   Dabbler command works this way: it removes the typing, never the decision.

8. Wait for the `test` check to pass, then merge the pull request on your host — **Merge pull
   request** on GitHub, **Complete** on Azure DevOps. Then, in your **main**
   VS Code window, run **`Dabbler: Finalize merged set`** and confirm — it pulls the merge onto
   your local `main`, removes the worktree folder, deletes the session branch, and prunes stale
   remotes. The set now shows as **Complete**.

9. **Protect `main` (stage 2 of 2).** A check that runs but blocks nothing is information, not
   a gate — make it required.

   > **▸ Your host — do ONE of these.**
   >
   > - **GitHub:** the workflow has run once, so GitHub now knows the check exists. Reopen the
   >   `main` rule, turn on **Require status checks to pass before merging**, and select
   >   **`test`**.
   > - **Azure DevOps:** **nothing to do here.** The Build validation policy you added in step 6
   >   already *is* the required check.

10. Run it, from the repository root — `python -m services.greeter.greeter` prints
    `Hello, world!`.

**That is the whole loop.** You have a declared module, a plan, a completed AI-led set, a
protected trunk, and a green required check — on code you keep, in a repository you own.

### The five things to check

- [ ] `docs/modules.yaml` declares `greeter` with its code root, and every set's `spec.md` carries the right `module:` stamp.
- [ ] `greeter`'s implementation set sits in the **Complete** bucket, under its own module.
- [ ] `python -m services.greeter.greeter` on `main` prints `Hello, world!`.
- [ ] The `test` check passed on the pull request, and a direct `git push` to `main` is rejected.
- [ ] `.venv\Scripts\python.exe -m ai_router.worktree list` shows no session worktrees left open.

## Where to go next

- **Several modules, built independently and composed over an agreed contract** — the
  dependency DAG, testing a module with none of its dependencies running, ownership routing
  across code roots, and integrating with somebody else's implementation by changing
  configuration: [Three modules, one pipeline](three-module-pipeline.md). It picks up exactly
  where this guide stops, in the repository you just built.
- **Tagging a release, hotfixing from a tag, rolling back, and raw git:**
  [Release and recovery operations](release-and-recovery.md).
