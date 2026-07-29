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
   `main`, turn on **Require a pull request before merging**, and leave **Require approvals**
   **unticked** — that is zero approvals, and you need it, because you are alone until Part 5
   and nobody else can approve you. If you are an admin, also enable the
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

   > **Azure DevOps** ignores GitHub Actions workflows. Instead, **now, before opening the PR**,
   > create a pipeline running the same test command (its YAML belongs to your organization's
   > pipeline standards — this tutorial does not ship one) and add it under **Branch Policies**
   > on `main` > **Build validation**, marked **Required** — without it, step 7 has no check.

7. **Open the pull request.** From the worktree window, run **`Dabbler: Open PR for this set`**.
   A dialog lists the exact `git push` and `gh pr create` commands it will run, and you click to
   approve — every remote-touching Dabbler command works this way: it removes the typing, never
   the decision.

8. Wait for the `test` check to pass and merge the pull request on GitHub. Then, in your **main**
   VS Code window, run **`Dabbler: Finalize merged set`** and confirm — it pulls the merge onto
   your local `main`, removes the worktree folder, deletes the session branch, and prunes stale
   remotes. The set now shows as **Complete**.

9. **Protect `main` (stage 2 of 3).** The workflow has run once, so GitHub knows the check
   exists: reopen the `main` rule, turn on **Require status checks to pass before merging**, and
   select **`test`**. Without this the check runs but blocks nothing. *(Azure DevOps: nothing to
   do here — the Build validation policy you added above already* is *the required check.)*

10. Run it, from the repository root — `python -m services.greeter.greeter` prints
    `Hello, world!`.

**Solo repositories can stop here.** You have a declared module, a plan, a completed AI-led set,
a protected trunk, and a green required check — the whole loop. Part 5 adds a second person and
a second module.

## Part 5 — Add a teammate and a composing module *(scene 5)*

| Person | Module | Code root | Notes |
| --- | --- | --- | --- |
| Priya (you) | `greeter` | `services/greeter/` | done in Part 4 |
| Sam | `app` | `services/app/` | imports `greeter`, adds the time |

1. **Invite Sam.** **Settings** > **Collaborators** > **Add people**, and add his handle.
   Accepting the invitation is what gives him push access — a personal repository has no role
   picker; on an organisation repository, choose **Write**. *(Azure DevOps: add him to the
   project's **Contributors** group under **Project Settings** > **Permissions**.)* He then
   clones the repo and does his own one-time setup: **all of Part 1** exactly as you did it —
   including the Copilot CLI sign-in, or the provider API keys if that is the variant you
   chose — plus **`Dabbler: Install ai-router`** once in his clone (the `.venv` is git-ignored,
   so it exists only on your machine).

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

   Once these are on `main`, GitHub requests the right reviewer by itself on any pull request
   touching those paths — which is what happens to Sam in Part 6. Rules only route on pull
   requests opened *after* they land, so this one, which adds them, still needs asking by hand.
   *(Azure DevOps: CODEOWNERS is GitHub-only; the equivalent is **Automatically included
   reviewers** — one entry per module with a path filter, each marked **Required**.)*

4. **Protect `main` (stage 3 of 3).** Tick **Require approvals** on the `main` rule and set the
   count to **1** — from now on somebody else has to say yes, including on the pull request in
   the next step. *(Azure DevOps: keep the minimum at 1 and untick **Allow requestors to approve
   their own changes**, so your own vote no longer counts.)*

5. Land everything from steps 2–3 — the manifest edit, the plan stub, `app`'s two lifecycle
   sets, and CODEOWNERS — as one small pull request. `main` is protected now, so it goes on a
   branch:

   ```bash
   git switch -c authoring/app-module
   git add -A
   git commit -m "docs: declare the app module and route reviews"
   ```

   Then run **`Dabbler: Open PR for this set`** — it works from any non-trunk branch. **Ask Sam
   to approve it**: you raised approvals to 1 a moment ago, and you cannot approve your own pull
   request. Merge it, then `git switch main && git pull --ff-only && git branch -d
   authoring/app-module`.

6. **Sam pulls first** (`git pull --ff-only`), or `app` and its sets exist in neither his clone
   nor his Work Explorer. `main` is protected for him too, so — exactly as in Part 4 — he starts
   on an authoring branch and stays on it until the lifecycle output is landed:

   ```bash
   git switch -c authoring/app-lifecycle
   ```

   He then runs `app`'s lifecycle exactly as you ran `greeter`'s, in this order:
   - **Plan set**, with the scope *`services/app/app.py` imports `greeter`'s `greet()`, appends
     the current time, and prints `Hello, world! It is HH:MM.`; runnable from the repository
     root with `python -m services.app.app`*
   - **Decomposition set**, which writes `app`'s implementation set.
   - **Then**, before landing anything, open that new set's `spec.md` and declare the dependency:

     ```yaml
     prerequisites:
       - slug: 005-greeter-hello
         condition: complete
     ```

     Because `greeter`'s set is already complete, nothing changes on screen. Were it not,
     that row would carry a ⛓︎ marker naming what it is waiting for. **Commit that edit** —
     the decomposition session committed the spec it generated, but this change is yours:
     `git add -A && git commit -m "docs: app's implementation set depends on greeter's"`.
   - **Land all of it on `main`** from that authoring branch with **`Dabbler: Open PR for this
     set`**, exactly as in Part 4 step 3 — it pushes commits and opens the pull request, it does
     not commit for you, which is why the step above ends in a commit. This one is all planning
     files, so no CODEOWNERS rule matches and nobody is requested automatically — Sam asks
     **you** to approve it, then merges, then `git switch main && git pull --ff-only`. The
     prerequisite has to be on `main` before the worktree is cut, or the worktree gets a spec
     without it.
   - **Implementation set**, in a worktree, exactly as in Part 4.

## Part 6 — Review, merge, and clean up *(scene 6)*

1. From his worktree window, Sam runs **`Dabbler: Open PR for this set`**. This one changes
   `services/app/`, so the CODEOWNERS rules you landed in Part 5 request **Priya** for him —
   nobody has to remember. She reads the composition: `touches:` is what let `app` reach into
   `greeter`'s code, and the ownership rule is what puts that change in front of `greeter`'s
   owner before it lands. The `test` check runs both modules.
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
