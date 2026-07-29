# Scene 5 — Add a teammate and a composing module

Covers [`hello-world.md`](../hello-world.md) **Part 5**.

**Finished length:** ~12 minutes. **Recording time: 40–75 minutes** — three more AI sessions.

## Scene goal

A second person, Sam, is on the repository. A second module, `app`, is declared — it composes
`greeter` rather than standing alone, which is what makes cross-owner review, `touches:`, and
per-set prerequisites worth showing. `main` now needs somebody else's approval.

## Starting state

- Scene 4 finished. `greeter` is on `main`, the `test` check is required, no worktrees are
  open.
- The main VS Code window is on `main`, clean.
- **Two GitHub accounts available** (see the staging note below).
- OBS scenes used: `Editor`, `Browser`, and `Worktree` at beat 12.

## Staging note — you are playing two people

The tutorial's cast is Priya (you, owner of `greeter`) and Sam (owner of `app`). For the
video, the simplest honest staging is:

- A **second GitHub account** to play Sam, signed in **in a separate browser profile** — not
  a second tab, so neither account's session logs the other out on camera.
- A **second clone** of `hello-modules` in a different folder, opened in its own VS Code
  window, standing in for Sam's machine.

Say this out loud once, at beat 1. Do not pretend there are two humans — a viewer who spots
the same desktop wallpaper on "Sam's machine" stops trusting the rest of the video.

---

## Beat 1 — Introduce the cast *(Part 5 opening)*

**Do.** Show the tutorial's cast table on screen, or just talk to camera.

**Say.** "Two people now. I'm Priya, and I own `greeter` — that's what we built. Sam is
joining, and he owns a second module called `app`, which imports `greeter`'s greeting and adds
the time. I'll be playing both, with a second account and a second clone, and I'll say which
one I am each time I switch."

**See.** No specific on-screen requirement.

---

## Beat 2 — Invite Sam *(Part 5 step 1)*

**Do.** As Priya, in the browser: **Settings** > **Collaborators** > **Add people**. Enter
Sam's handle and confirm.

**Say.** "Invite him. On a personal repository there's no role to pick — accepting the
invitation is what gives him push access. On an organisation repository you'd choose the Write
role, and on Azure DevOps you'd add him to the project's Contributors group under Project
Settings, Permissions."

**See.** Sam appears under **Collaborators** as **Pending invite**. On a personal repository
there is **no role dropdown** in this dialog — do not go looking for one on camera.

---

## Beat 3 — Sam accepts and sets up *(Part 5 step 1)*

**Do.** Switch to Sam's browser profile, accept the invitation, clone the repository into a
second folder, and open it in a second VS Code window. Then in that window, Command Palette →
**`Dabbler: Install ai-router`**.

**Say.** "Sam accepts, clones, and does his own one-time setup — all of part one, exactly the
way I did it, including signing in to the Copilot CLI. Plus one extra command: **Dabbler:
Install ai-router**. The virtual environment is git-ignored, so it only ever existed on my
machine; his clone needs its own."

> **On the direct-API take**, Sam's setup is that take, not this one: his three `DABBLER_*`
> keys set off camera, and Claude Code installed and signed in in his clone. He does **not**
> sign in to the Copilot CLI. `Dabbler: Install ai-router` is unchanged. See
> [`scene-1-alt-direct-api.md`](scene-1-alt-direct-api.md).

**See.** A `.venv/` folder appears in Sam's clone and a notification confirms the router
install completed.

**If this fails on camera.** If the install reports a Python problem, it is the same stop as
scene 1 beat 3 — Sam's machine needs Python 3.10 or newer. Nothing in this scene works
without it.

---

## Beat 4 — Declare the `app` module *(Part 5 step 2)*

**Do.** Back as **Priya**, in the main window. Command Palette → **`Dabbler: New Module`**.
Slug `app`, title `App`.

**Say.** "Back to me. Declare the second module — `app`."

**See.** A plan stub opens at `docs/modules/app/project-plan.md`, and a notification reads
`Module "app" appended to docs/modules.yaml. … Next steps scaffolded: 006-app-plan and
007-app-decomposition.` (Your numbers follow whatever `greeter` used.) The Work Explorer now
shows two module groups: **Greeter** and **App**.

---

## Beat 5 — Add the code root and the dependency *(Part 5 step 2)*

**Do.** Open `docs/modules.yaml` and edit the `app` entry until it reads exactly:

```yaml
  - slug: app
    title: "App"
    codeRoots:
      - services/app
    planPath: docs/modules/app/project-plan.md
    touches:
      - greeter
```

Save.

**Say.** "Same hand edit as before for the code root — and one new line. `touches: greeter`.
That sanctions `app`'s sessions to read and change `greeter`'s code. And it's the reason CI
tests every module rather than only the one that changed: if `app` can reach into `greeter`,
then a change in either can break the other."

**See.** The file saves cleanly, and both module groups stay in the Work Explorer.

---

## Beat 6 — Route reviews by ownership *(Part 5 step 3)*

**Do.** Open `.github/CODEOWNERS`, scroll to the worked example, and uncomment the two rule
lines — replacing the placeholder handles with **your and Sam's real GitHub usernames**:

```text
/services/greeter/  @priya-gh
/services/app/      @sam-gh @priya-gh
```

**Say.** "CODEOWNERS. Two lines. I own `greeter`. Sam owns `app` — and because `app` composes
`greeter`, I'm named on it too, so I see his change before it lands. Use real usernames:
GitHub silently declines to route reviews to handles that don't exist, so a typo here looks
exactly like everything working."

**Say (over the result).** "Once these are on `main`, GitHub requests the right reviewer by
itself on any pull request that touches those paths — and you'll see that happen to Sam in the
last scene. Rules only route on pull requests opened *after* they land, so the one that adds
them still needs asking by hand. And on Azure DevOps, CODEOWNERS is GitHub-only; the equivalent
is 'Automatically included reviewers', one entry per module with a path filter, each marked
Required."

**See.** The two lines have no leading `#`, and the handles are real.

---

## Beat 7 — Protect `main`, stage 3 of 3 *(Part 5 step 4)*

**Do.** In the browser: **Settings** > **Branches** > the `main` rule. **Tick Require
approvals** and set the count to **1**. Save.

**Say.** "And the last turn of the screw. Tick 'Require approvals', set it to one. From here
on, somebody else has to say yes — including on the pull request I'm about to open."

**See.** The `main` rule shows **Require approvals** ticked with a required count of **1**.

**Say (aside).** "On Azure DevOps you keep the minimum at one and untick 'Allow requestors to
approve their own changes' — so your own vote stops counting."

---

## Beat 8 — Land the declaration as one pull request *(Part 5 step 5)*

**Do.** In the terminal:

```bash
git switch -c authoring/app-module
git add -A
git commit -m "docs: declare the app module and route reviews"
```

Then Command Palette → **`Dabbler: Open PR for this set`**, set a real title, approve the
dialog. **Switch to Sam's browser profile and have him approve it** — you cannot approve your
own pull request, and you set required approvals to 1 one beat ago. Back as Priya, merge it.
Then:

```bash
git switch main
git pull --ff-only
git branch -d authoring/app-module
```

**Say.** "All of that — the manifest edit, the plan stub, `app`'s two lifecycle sets, and
CODEOWNERS — goes up as one small pull request. `main` is protected, so it has to. And notice
Open PR works from this branch too: it works from any branch that isn't the trunk."

**Say (as Sam approves).** "And here's the rule I just turned on, working on me first. I can't
approve my own pull request, so Sam does it. This is the first time in the whole video that
somebody else's decision is load-bearing."

**See.** Before Sam's approval, the **Merge pull request** button is disabled with a message
that the branch requires an approving review. After it, the button enables, the `test` check
passes, the PR merges, and local `main` comes back clean.

---

## Beat 9 — Sam pulls first *(Part 5 step 6)*

**Do.** Switch to **Sam's** window. In its terminal:

```bash
git pull --ff-only
git switch -c authoring/app-lifecycle
```

**Say.** "Now Sam. He pulls first — otherwise `app` and its sets exist in neither his clone
nor his Work Explorer. And `main` is protected for him too, so exactly as before: an authoring
branch, and he stays on it until the lifecycle output is landed."

**See.** Sam's Work Explorer now shows both **Greeter** and **App**, with **006-app-plan** and
**007-app-decomposition** under **App** in **Not Started**.

---

## Beat 10 — Sam runs the plan and decomposition sets *(Part 5 step 6)* — **WAIT / CUT**

**Do.** In Sam's window, run the plan set exactly as in scene 4 beats 3–5, with this scope on
the second line of the message:

```text
Scope: services/app/app.py imports greeter's greet(), appends the current time,
and prints "Hello, world! It is HH:MM."; runnable from the repository root with:
python -m services.app.app
```

Then run the decomposition set the same way.

**Say.** "Same lifecycle, same three stages, different module. Plan, then decomposition."

**See.** Both sets reach **Complete**, and a new implementation set appears under **App** in
**Not Started**.

**WAIT:** 6–16 minutes across the two. **CUT** both waits.

---

## Beat 11 — Declare the prerequisite *(Part 5 step 6)*

**Do.** Before landing anything, open the new implementation set's `spec.md` and add, in its
configuration block:

```yaml
prerequisites:
  - slug: 005-greeter-hello
    condition: complete
```

**Say.** "One thing before he lands it. `app` composes `greeter`, so `app`'s implementation
set genuinely depends on `greeter`'s being finished. Declare that."

**See.** **Nothing changes on screen** — `greeter`'s set is already complete, so the
prerequisite is satisfied the moment it is written and the row renders exactly as before.

**Say (over the unchanged row).** "And nothing happens — which is the right answer. `greeter`
is already done, so there's nothing to wait for. If it weren't, that row would carry a
chain-link marker naming exactly what it was waiting on, and you'd know not to start it."

> **Do not stage a fake block for the camera** by declaring a prerequisite on an unfinished
> set. If you want to *show* the marker, do it as a five-second aside on a set that is
> genuinely not started — and say that is what you are doing.

---

## Beat 12 — Sam lands it, then works in a worktree *(Part 5 step 6)* — **WAIT / CUT**

**Do.** In Sam's window: **`Dabbler: Open PR for this set`** from the authoring branch. Then,
as **Priya**, open that pull request and **Approve** it — this one is all planning files, so no
CODEOWNERS rule matches and nobody was requested automatically; Sam has to ask. Back as Sam:
merge it, then:

```bash
git switch main
git pull --ff-only
```

Then open a worktree for `app`'s implementation set and run its session in a new window,
exactly as in scene 4 beats 10–12.

**Say.** "He lands the plan and the new set on `main` first — the prerequisite has to be on
`main` before the worktree is cut, or the worktree gets a spec without it. This pull request is
all planning files, so no ownership rule matches it and he has to ask me directly. Then a
worktree, a new window, and the session writes the code."

**See.** The pull request shows **no** automatically requested reviewer; after Priya's
approval it merges. The implementation session then creates `services/app/app.py` and its test,
and commits to `session-set/<app-set-name>`.

**WAIT:** 5–15 minutes. **CUT.**

---

## Beat 13 — Close the scene *(Part 5, framing)* — **CUT**

**Say.** "Two modules, two owners, one of them composing the other, and a trunk that now needs
someone else's yes. All that's left is the part that makes it real — the review."

**See.** Sam's worktree window with `services/app/app.py` open.

---

## Traceability

| Beat | Tutorial step |
| --- | --- |
| 1 | Part 5's cast table |
| 2–3 | Part 5 step 1 |
| 4–5 | Part 5 step 2 |
| 6 | Part 5 step 3, including the ADO equivalent |
| 7 | Part 5 step 4, including the ADO equivalent |
| 8 | Part 5 step 5 |
| 9–12 | Part 5 step 6 |
| 13 | Part 5 close |
