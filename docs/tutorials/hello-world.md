# Hello World: ship your first module with Dabbler

Build a tiny two-module Python program with AI-led sessions, on GitHub, behind a real
pull-request gate. You finish with code on `main` that prints one line — and with the habits
the framework is built around.

- **Audience:** you can commit and push with `git`. Nothing else is assumed.
- **Time:** about two hours, most of it watching AI sessions work.
- **Solo?** Parts 1–4 are a complete one-person walkthrough; Part 4 says where to stop.
- **On camera:** the six parts map 1:1 to the six scenes of the [video walkthrough](video/).

## Part 1 — Install and verify the tools *(scene 1)*

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

5. **GitHub CLI**, so Dabbler can open pull requests without a browser trip: install it from
   [cli.github.com](https://cli.github.com), then run `gh auth login` and `gh auth status`.

> **Variant — direct provider API keys instead of a Copilot seat.** Set
> `DABBLER_ANTHROPIC_API_KEY`, `DABBLER_GEMINI_API_KEY`, and `DABBLER_OPENAI_API_KEY` in your
> environment, skip step 4, and in Part 3 leave **Provider access** on its default. You still
> need an AI agent inside VS Code — Claude Code, Codex, or Gemini Code Assist all work; paste the
> starter lines into that agent's chat instead of the Copilot CLI.

## Part 2 — Create and clone the GitHub repository *(scene 2)*

1. On GitHub, click **New repository**. Name it `hello-modules`, set it **Public**, check
   **Add a README file**, and create it. Public matters: on GitHub Free branch protection
   only works on public repositories, and Parts 3–5 depend on it. On a paid plan, private is fine.
2. In VS Code, open the Command Palette (`Ctrl+Shift+P`), run **`Git: Clone`**, paste your
   repository URL, pick a folder, and open the clone. *(Azure DevOps: create the repo in your
   ADO project and clone `https://dev.azure.com/{org}/{project}/_git/{repo}`.)*

> **On Azure DevOps, this is a GitHub walkthrough with ADO equivalents named.** Every Dabbler
> command behaves identically on both hosts; the guardrails do not, so each one below carries an
> italic ADO note naming the exact policy to set. Those notes assume an ADO admin who can set
> branch policies and whose organization already builds pipelines — this tutorial deliberately
> ships no `azure-pipelines.yml`. Read them as a configuration checklist, not a second walk.

## Part 3 — Set up Dabbler and name your first module *(scene 3)*

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

5. **Protect `main` (stage 1 of 3).** On GitHub: **Settings** > **Branches**, add a rule for
   `main`, turn on **Require a pull request before merging**, and set required approvals to
   **0** — you are alone until Part 5. If you are an admin, also enable the
   do-not-allow-bypass option so the rule binds you too. From here on, every change reaches
   `main` through a pull request. *(Azure DevOps: **Project Settings** > **Repositories** > your
   repo > **Policies** > **Branch Policies** on `main` > **Require a minimum number of
   reviewers**. Its minimum is 1, so tick **Allow requestors to approve their own changes**; on
   each solo PR you then cast your own **Approve** vote to satisfy it. Part 5 unticks that box
   so Sam's approval becomes the one that counts.)*

## Part 4 — Build and ship the first module *(scene 4)*

Every module follows the same lifecycle: a **plan** set writes the module's plan, a
**decomposition** set turns that plan into implementation sets, and each implementation set
writes real code. You run all three now, on work you keep.

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

3. **Open a worktree for it.** Each work set runs on its own branch in its own folder, so an AI
   session never edits your `main` checkout:

   ```text
   .venv\Scripts\python.exe -m ai_router.worktree open 005-greeter-hello
   ```

   A sibling folder `hello-modules-worktrees/005-greeter-hello/` appears, on the branch
   `session-set/005-greeter-hello`. (macOS/Linux: use `.venv/bin/python`.)

4. **Open that folder in a new VS Code window**, left-click the set's row, and paste its starter
   line into `copilot` running in *that* window's terminal. The session implements the module,
   tests it, and commits to the session branch. Watch it work.

5. **Turn on CI, on the same branch.** A module with tests now exists, so open
   `.github/workflows/monorepo-ci.yml` in the worktree and adapt the scaffolded file down to
   exactly one active job: replace the placeholder `run:` block with a real test command, and
   delete any `if: github.event_name == 'push' …` line so it also runs on pull requests.

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
         - name: Test every module
           run: |
             for module in services/*/; do
               python -m pytest -q "$module" || exit 1
             done
   ```

   One job, always running, testing every module. Because each module directory is tested on its
   own, a module shipping **zero** tests fails the build instead of hiding behind another
   module's passing tests. Commit this change on the session branch. (Large repositories can add
   path filtering — but keep one always-running aggregate job as the required check.)

   > **Azure DevOps** ignores GitHub Actions workflows. Instead, **now, before opening the PR**,
   > create a pipeline running the same test command (its YAML belongs to your organization's
   > pipeline standards — this tutorial does not ship one) and add it under **Branch Policies**
   > on `main` > **Build validation**, marked **Required** — without it, step 7 has no check.

6. **Open the pull request.** From the worktree window, run **`Dabbler: Open PR for this set`**.
   A dialog lists the exact `git push` and `gh pr create` commands it will run, and you click to
   approve — every remote-touching Dabbler command works this way: it removes the typing, never
   the decision.

7. Wait for the `test` check to pass and merge the pull request on GitHub. Then, in your **main**
   VS Code window, run **`Dabbler: Finalize merged set`** and confirm — it pulls the merge onto
   your local `main`, removes the worktree folder, deletes the session branch, and prunes stale
   remotes. The set now shows as **Complete**.

8. **Protect `main` (stage 2 of 3).** The workflow has run once, so GitHub knows the check
   exists: reopen the `main` rule, turn on **Require status checks to pass before merging**, and
   select **`test`**. Without this the check runs but blocks nothing. *(Azure DevOps: nothing to
   do here — the Build validation policy you added above already* is *the required check.)*

9. Run it, from the repository root — `python -m services.greeter.greeter` prints
   `Hello, world!`.

**Solo repositories can stop here.** You have a declared module, a plan, a completed AI-led set,
a protected trunk, and a green required check — the whole loop. Part 5 adds a second person and
a second module.

## Part 5 — Add a teammate and a composing module *(scene 5)*

| Person | Module | Code root | Notes |
| --- | --- | --- | --- |
| Priya (you) | `greeter` | `services/greeter/` | done in Part 4 |
| Sam | `app` | `services/app/` | imports `greeter`, adds the time |

1. **Invite Sam.** **Settings** > **Collaborators** > **Add people**, with the **Write** role.
   *(Azure DevOps: add him to the project's **Contributors** group under **Project Settings** >
   **Permissions**.)* He accepts, clones the repo, and does his own one-time setup: **all of
   Part 1**, including signing in to the Copilot CLI, plus **`Dabbler: Install ai-router`** once
   in his clone (the `.venv` is git-ignored, so it exists only on your machine).

2. **Declare the `app` module.** Run **`Dabbler: New Module`** with slug `app` and title `App`.
   As in Part 3 it declares the module, writes a plan stub, and scaffolds `app`'s two lifecycle
   sets — you commit all of it in step 5. Then edit its `docs/modules.yaml` entry to add the code
   root **and** the dependency:

   ```yaml
     - slug: app
       title: "App"
       codeRoots:
         - services/app
       planPath: docs/modules/app/project-plan.md
       touches:
         - greeter
   ```

   `touches:` sanctions `app`'s sessions to read and change `greeter`'s code — and it is why
   CI tests every module, not just the one that changed.

3. **Route reviews by ownership.** Uncomment two lines in `.github/CODEOWNERS`, replacing
   `@priya-gh`/`@sam-gh` with your and Sam's **real GitHub usernames** — GitHub silently declines
   to route reviews to handles that do not exist:

   ```text
   /services/greeter/  @priya-gh
   /services/app/      @sam-gh @priya-gh
   ```

   On a real team repository these rules request the right reviewers automatically; this
   tutorial asks for Priya's review by hand, because rules added in the same pull request are
   not a useful demonstration of routing. *(Azure DevOps: CODEOWNERS is GitHub-only; the
   equivalent is **Automatically included reviewers** — one entry per module with a path
   filter, each marked **Required**.)*

4. **Protect `main` (stage 3 of 3).** Raise required approvals from **0** to **1** — from now on
   somebody else has to say yes. *(Azure DevOps: keep the minimum at 1 and untick **Allow
   requestors to approve their own changes**, so your own vote no longer counts.)*

5. Land everything from steps 2–3 — the manifest edit, the plan stub, `app`'s two lifecycle
   sets, and CODEOWNERS — as one small pull request. `main` is protected now, so it goes on a
   branch:

   ```bash
   git switch -c authoring/app-module
   git add -A
   git commit -m "docs: declare the app module and route reviews"
   ```

   Then run **`Dabbler: Open PR for this set`** — it works from any non-trunk branch — approve
   and merge it, then `git switch main && git pull --ff-only && git branch -d
   authoring/app-module`.

6. **Sam pulls first** (`git pull --ff-only`), or `app` and its sets exist in neither his clone
   nor his Work Explorer. He then runs `app`'s lifecycle exactly as you ran `greeter`'s, in this
   order:
   - **Plan set**, with the scope *`services/app/app.py` imports `greeter`'s `greet()`, appends
     the current time, and prints `Hello, world! It is HH:MM.`; runnable from the repository
     root with `python -m services.app.app`*
   - **Decomposition set**, which writes `app`'s implementation set.
   - **Then**, before running it, open that new set's `spec.md` and declare the dependency:

     ```yaml
     prerequisites:
       - slug: 005-greeter-hello
         condition: complete
     ```

     Its row shows as blocked in the Work Explorer until `greeter`'s set is complete.
   - **Implementation set**, in a worktree, exactly as in Part 4.

## Part 6 — Review, merge, and clean up *(scene 6)*

1. From his worktree window, Sam runs **`Dabbler: Open PR for this set`** and requests
   **Priya's** review. She reads the composition — this is the point of `touches:`: the owner
   of the code being composed sees it before it lands. The `test` check runs both modules.
2. Priya approves, Sam merges, and Sam runs **`Dabbler: Finalize merged set`** from his main
   checkout.
3. Pull and run the composed program from the repository root — `git pull --ff-only`, then
   `python -m services.app.app`. It prints one line of exactly this shape, with the current
   time: `Hello, world! It is 14:32.`

### The five things to check

- [ ] `docs/modules.yaml` declares `greeter` and `app` (with `touches: [greeter]`), and every set's `spec.md` carries the right `module:` stamp.
- [ ] Both implementation sets sit in the **Complete** bucket, under their own modules.
- [ ] `python -m services.app.app` on `main` prints the composed line.
- [ ] The `test` check passed on the pull request, and a direct `git push` to `main` is rejected.
- [ ] `.venv\Scripts\python.exe -m ai_router.worktree list` shows no session worktrees left open.

**Next:** [Release and recovery operations](release-and-recovery.md) — tagging a
release, hotfixing from a tag, and rolling back.
