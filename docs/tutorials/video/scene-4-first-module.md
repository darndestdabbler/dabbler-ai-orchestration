# Scene 4 — Build and ship the first module

Covers [`hello-world.md`](../hello-world.md) **Part 4**. This is the longest scene and the
heart of the video: three AI sessions, a worktree, CI, a pull request, and a merge.

**Finished length:** ~18 minutes. **Recording time: 45–90 minutes** — the AI sessions run in
real time and this script marks every cut.

## Scene goal

`greeter` exists as real code on `main`, written by AI sessions, gated by a required CI check
and a pull request. The viewer has now seen the whole loop once, in full. The scene ends on
the tutorial's own line: **"Solo repositories can stop here."**

## Starting state

- Scene 3 finished. `main` is protected (pull request required, zero approvals).
- Work Explorer shows the module group **Greeter** with **003-greeter-plan** and
  **004-greeter-decomposition** in **Not Started**.
- Local `main` is clean and pushed.
- One VS Code window open. A second window appears at beat 9.
- OBS scenes used: `Editor`, then `Worktree` from beat 9, `Browser` for beats 14–18.

> **The set name in beat 6 is not knowable in advance.** The decomposition session names the
> implementation set itself. This script writes `005-greeter-hello` throughout; whatever your
> session actually names it, say the real name on camera at beat 7 and use it everywhere
> after. Do not re-record earlier beats to match.

---

## Beat 1 — Frame the lifecycle *(Part 4 opening)*

**Do.** Work Explorer visible, showing the two sets.

**Say.** "Every module goes through the same three stages. A plan set writes the module's
plan. A decomposition set turns that plan into implementation sets. And each implementation
set writes real code. We're going to run all three — on work we keep. Nothing in this video
is throwaway."

**See.** The Work Explorer with **003-greeter-plan** and **004-greeter-decomposition**.

---

## Beat 2 — Start an authoring branch *(Part 4, before step 1)*

**Do.** In the terminal:

```bash
git switch -c authoring/greeter-lifecycle
```

**Say.** "`main` is protected as of the last part, so nothing reaches it by direct push any
more — including the documents these first two sessions are about to write. So: a branch."

**See.** The status bar bottom-left changes from `main` to `authoring/greeter-lifecycle`.

---

## Beat 3 — Open the plan set *(Part 4 step 1)*

**Do.** Left-click the row **003-greeter-plan** in the Work Explorer.

**Say.** "Left-click the set. Two things happen: its spec opens, and the line you need is
already on your clipboard."

**See.** `docs/session-sets/003-greeter-plan/spec.md` opens in the editor, and a notification
reads `Copied: Start the next session of 003-greeter-plan`.

---

## Beat 4 — Send the session to Copilot *(Part 4 step 1)*

**Do.** Open a terminal inside VS Code (**Terminal > New Terminal**), run `copilot`, and at
its prompt paste the copied line, then type the scope on the next line, then send the whole
thing as **one message**:

```text
Start the next session of `003-greeter-plan`.
Scope: a greet() function in services/greeter/greeter.py returning "Hello, world!",
a unit test beside it, and a __main__ block that prints it. It must be runnable
from the repository root with: python -m services.greeter.greeter
```

**Say.** "Paste the starter line, and add what I actually want built. This is the only place
in the whole tutorial where I describe the work — everything downstream is derived from it."

**See.** Copilot acknowledges and begins reading the repository. It will read the instruction
files, the spec, and the guidance docs before it writes anything.

**If this fails on camera.** `No authentication information found` means the seat sign-in
from scene 1 has lapsed — run `copilot` on its own, sign in again, and resend. If Copilot
answers as if you asked a general question rather than starting a session, you sent the two
lines as two separate messages; send them as one.

---

## Beat 5 — Let the session run *(Part 4 step 1)* — **WAIT / CUT**

**Do.** Nothing. Let it work.

**Say (once, at the start).** "This runs for a few minutes. It writes the plan, then it
routes the result to a second AI on a different provider to verify it, then it commits. I'll
speed this up."

**See.** The session finishes with a summary and a commit. In the Work Explorer,
**003-greeter-plan** moves to the **Complete** bucket.

**WAIT:** typically 3–8 minutes. **CUT** the wait in the edit, and come back on the moment
the row moves to **Complete**.

**If this fails on camera.** If the session stops asking for a decision, answer it on camera —
that is a legitimate part of the workflow, not a defect. If it ends with a verification
failure, do not merge it; say so, and re-run the session.

---

## Beat 6 — Run the decomposition set *(Part 4 step 2)* — **WAIT / CUT**

**Do.** Left-click **004-greeter-decomposition**, then paste its starter line into `copilot`
and send.

**Say.** "The decomposition set was waiting on the plan set. Now it's free. It reads the plan
and writes the implementation sets — for something this small, one."

**See.** `Copied: Start the next session of 004-greeter-decomposition` appears; the session
runs; a new set appears in the Work Explorer under **Greeter**, in **Not Started**.

**WAIT:** typically 3–8 minutes. **CUT.**

---

## Beat 7 — Say the real set name out loud *(Part 4 step 2)*

**Do.** Point at the new row.

**Say.** "It named the implementation set — mine is **005-greeter-hello**. Yours may differ;
write down whatever name you got, because everything from here on refers to it."

**See.** The new set's row, with its actual name legible on screen.

---

## Beat 8 — Land the plan and the new set on `main` *(Part 4 step 3)*

**Do.** In the terminal:

```bash
git status --short
```

**If — and only if — that printed anything**, commit it:

```bash
git add -A
git commit -m "docs: greeter plan and its implementation set"
```

Then Command Palette → **`Dabbler: Open PR for this set`**. In the **PR title** box, replace
the prefilled branch name with `docs: greeter plan and its implementation set` and press
`Enter`. Read the confirmation dialog on camera, then click **Push + create PR**.

**Say.** "Check for anything the sessions left loose — usually nothing, they commit their own
work — then let Dabbler open the pull request. Notice what the dialog does: it shows you the
exact commands it's about to run, and you click to approve. Every remote-touching Dabbler
command works like this. It removes the typing, never the decision."

**See.** A modal headed **Push this branch and open a PR?** whose detail begins `This will
run:` and lists `git push -u origin authoring/greeter-lifecycle` and a `gh pr create` command,
and ends `Target: github (github.com), base branch main.` After clicking **Push + create
PR**, a notification reads `PR created: https://github.com/…/pull/1` and the pull request
opens in the browser.

**If this fails on camera.** If the dialog says no `gh` CLI was found, Dabbler still pushes
the branch and opens the browser create-PR page — finish there and say so; that is the
documented fallback, not a break.

---

## Beat 9 — Merge it and get back on a clean trunk *(Part 4 step 3)*

**Do.** In the browser, merge the pull request. Back in VS Code:

```bash
git switch main
git pull --ff-only
git branch -d authoring/greeter-lifecycle
```

**Say.** "Merge it, come back to `main`, pull, and drop the branch. This matters for the next
step: the worktree we're about to open is cut from `main`, so the set has to be on `main`
first — otherwise the worktree gets a folder that doesn't exist yet."

**See.** The status bar reads `main`; `git pull --ff-only` reports the merge coming down; the
branch deletes without complaint.

---

## Beat 10 — Open a worktree *(Part 4 step 4)*

**Do.** In the terminal:

```text
.venv\Scripts\python.exe -m ai_router.worktree open 005-greeter-hello
```

**Say.** "Implementation sets write code, and they get their own folder as well as their own
branch. So while the AI works, my main checkout stays on `main` and stays usable. The plan
and decomposition sets were documents — short, and fine on a branch in place. Isolation
starts mattering the moment a session is changing code."

**See.** Three lines:

```text
Worktree opened: …\hello-modules-worktrees\005-greeter-hello
Branch: session-set/005-greeter-hello (from main)
Next: cd …\hello-modules-worktrees\005-greeter-hello
```

**Say (over the result).** "On macOS or Linux that's `.venv/bin/python` instead."

---

## Beat 11 — Open the worktree in a second window *(Part 4 step 5)*

**Do.** **File > Open Folder…**, choose `hello-modules-worktrees/005-greeter-hello`, and open
it in a **new window**. Switch OBS to the `Worktree` scene.

**Say.** "Open that folder in its own VS Code window. Two windows from here on — this one is
where the AI works, and the original stays on `main`."

**See.** A second VS Code window whose status bar reads `session-set/005-greeter-hello`, with
the full repository tree.

---

## Beat 12 — Run the implementation session *(Part 4 step 5)* — **WAIT / CUT**

**Do.** In the **worktree window**: click the Dabbler icon, left-click the **005-greeter-hello**
row, open a terminal in *this* window, run `copilot`, paste the starter line, send.

**Say.** "Same move as before, in the new window. This one writes actual code — the greet
function, a test beside it, and a main block. Watch it work."

**See.** `Copied: Start the next session of 005-greeter-hello`; the session creates
`services/greeter/greeter.py` and a test file, runs the tests, verifies, and commits to the
branch `session-set/005-greeter-hello`.

**WAIT:** typically 5–15 minutes. **CUT**, and come back on the finished file tree.

**If this fails on camera.** If the session's own tests fail and it cannot fix them, that is
a genuine finding — say so on camera and let it try again rather than editing the code
yourself. The point of the video is the loop, not the code.

---

## Beat 13 — Turn on CI *(Part 4 step 6)*

**Do.** Still in the **worktree window**, open `.github/workflows/monorepo-ci.yml` and edit
the `jobs:` block until it reads exactly:

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

Then commit it on the session branch:

```bash
git add .github/workflows/monorepo-ci.yml
git commit -m "ci: test every module on every pull request"
```

**Say.** "There's a module with tests now, so let's turn CI on. The scaffolded workflow is
already the right shape — one job called `test`, already running on pull requests and on
pushes to `main`. I add two steps to install Python and pytest, and I replace the placeholder
with a real command. Nothing else changes."

**Say (over the loop).** "One job, always running, testing every module. And because it tests
each module directory on its own, a module that ships **zero** tests fails the build instead
of hiding behind another module's passing tests. The `echo` is there so you can see that in
the log — one line per module. Large repositories can add path filtering on top, but keep one
always-running aggregate job as the required check."

**See.** The diff shows two added steps and a replaced `run:` block; the job name `test` and
the `on:` block are untouched. The commit succeeds.

---

## Beat 14 — Name the Azure DevOps equivalent *(Part 4 step 6, ADO callout)*

**Do.** No action.

**Say.** "Azure DevOps ignores GitHub Actions workflows entirely. If that's you, right now —
before opening the pull request — create a pipeline that runs the same test command, and add
it under Branch Policies on `main`, Build validation, marked Required. Without it, the next
step has nothing to wait for."

**See.** No change on screen — narration-only beat.

---

## Beat 15 — Open the pull request *(Part 4 step 7)*

**Do.** In the **worktree window**, Command Palette → **`Dabbler: Open PR for this set`**.
Accept the prefilled **PR title** (`Session set 005-greeter-hello`), read the dialog, click
**Push + create PR**.

**Say.** "Open the pull request from the worktree window. Same dialog, same approval."

**See.** The modal lists `git push -u origin session-set/005-greeter-hello` and a `gh pr
create` command; after approval, `PR created: …` and the pull request opens in the browser.

---

## Beat 16 — Wait for the check *(Part 4 step 8)* — **WAIT**

**Do.** Switch to the `Browser` OBS scene, on the pull request page.

**Say.** "And there's the check running — the first time that workflow has ever executed."

**See.** A check named **test** appears on the pull request, running, then green.

**WAIT:** typically 1–3 minutes. **CUT** if it runs long.

**If this fails on camera.** A red `test` check is a real result — read the log on camera and
fix it rather than cutting it out. A viewer who never sees CI catch anything has no reason to
believe it would.

---

## Beat 17 — Merge *(Part 4 step 8)*

**Do.** Click **Merge pull request**, then **Confirm merge**.

**Say.** "Green. Merge it."

**See.** The pull request shows **Merged**.

---

## Beat 18 — Finalize *(Part 4 step 8)*

**Do.** Switch to the **main** VS Code window (OBS scene `Editor`). Command Palette →
**`Dabbler: Finalize merged set`**. Read the dialog, then click **Finalize**.

**Say.** "Back in the main window — finalize. Read what it's going to do: pull the merge onto
local `main`, remove the worktree folder, delete the session branch, and prune the stale
remote references. Four bits of tidying you'd otherwise type by hand every single time."

**See.** A modal headed `Finalize merged set 'session-set/005-greeter-hello'?` whose detail
lists, in order, `git pull --ff-only`, `git worktree remove …`, `git branch -d
session-set/005-greeter-hello`, and `git fetch --prune`. After confirming, a notification
reads `Merged set finalized.` followed by one line per step, and the second VS Code window's
folder is gone. In the Work Explorer, **005-greeter-hello** is now in the **Complete** bucket.

**If this fails on camera.** If it refuses because the main checkout is not on the trunk,
`git switch main` and re-run. If it refuses because the tree is dirty, commit or stash first.
Both refusals are by design — it will not clean up around uncommitted work.

---

## Beat 19 — Protect `main`, stage 2 of 3 *(Part 4 step 9)*

**Do.** In the browser: **Settings** > **Branches** > the `main` rule. Turn on **Require
status checks to pass before merging** and select **`test`**. Save.

**Say.** "One more turn of the screw. The workflow has run once now, so GitHub knows the
check exists and will let me require it. Until you do this, the check runs and blocks
nothing — it's information, not a gate."

**See.** The `main` rule now lists **test** under required status checks.

**Say (aside).** "On Azure DevOps there's nothing to do here — the Build validation policy
you added a moment ago already *is* the required check."

---

## Beat 20 — Run it *(Part 4 step 10)*

**Do.** In the main window's terminal:

```bash
git pull --ff-only
python -m services.greeter.greeter
```

**Say.** "And there it is."

**See.** The terminal prints `Hello, world!`.

---

## Beat 21 — The solo cutoff *(Part 4 close)* — **CUT**

**Do.** Nothing. Deliver this to camera.

**Say.** "**If you're working alone, you can stop here.** You have a declared module, a plan
written by an AI session, a completed implementation set, a protected trunk, and a green
required check. That's the whole loop, and it doesn't get more elaborate — it just gets more
people. Which is what the next part adds."

**See.** VS Code with `Hello, world!` in the terminal and the Work Explorer showing all three
sets under **Greeter** in **Complete**.

> **If you are publishing a solo-only video, this is the end.** Cut here.

---

## Traceability

| Beat | Tutorial step |
| --- | --- |
| 1 | Part 4 opening |
| 2 | Part 4's authoring-branch step |
| 3–5 | Part 4 step 1 |
| 6–7 | Part 4 step 2 |
| 8–9 | Part 4 step 3 |
| 10 | Part 4 step 4 |
| 11–12 | Part 4 step 5 |
| 13 | Part 4 step 6 |
| 14 | Part 4 step 6's Azure DevOps callout |
| 15 | Part 4 step 7 |
| 16–18 | Part 4 step 8 |
| 19 | Part 4 step 9 |
| 20 | Part 4 step 10 |
| 21 | Part 4's "Solo repositories can stop here." |
