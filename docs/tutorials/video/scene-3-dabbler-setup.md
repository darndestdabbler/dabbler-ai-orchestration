# Scene 3 — Set up Dabbler and name your first module

Covers [`hello-world.md`](../hello-world.md) **Part 3**.

**Finished length:** ~8 minutes.

## Scene goal

The repository is scaffolded, the Copilot seat is wired in, one module called `greeter` is
declared with its code root, the starter `Default` module is gone, and `main` is protected so
nothing reaches it except through a pull request.

## Starting state

- Scene 2 finished: `hello-modules` open in VS Code, one file (`README.md`), branch `main`.
- The Dabbler AI Orchestration extension installed; its Activity Bar icon visible but **not
  yet clicked**.
- Signed in to the Copilot CLI (scene 1) and to GitHub in the browser.
- OBS scenes used: `Editor`, and `Browser` for beats 11–12.

> **This scene uses `New Module` + `Delete Module`, not `Rename Module`.** That is
> deliberate and it is what the tutorial says. `Dabbler: Rename Module` changes a module's
> slug and title and re-stamps its session sets, but by design it does **not** rename the set
> folders or move the plan file — so renaming `Default` would leave a `greeter` module whose
> plan lives under `docs/modules/default/` and whose sets are still called `001-default-plan`.
> On camera that is a question you do not want to answer. Do not "improve" this scene by
> using `Rename Module`.

---

## Beat 1 — Open the Work Explorer *(Part 3 step 1)*

**Do.** Click the **Dabbler AI Orchestration** icon in the Activity Bar.

**Say.** "Open the Dabbler view. There are no session sets in this repository yet, so instead
of the Work Explorer we get the Getting Started form."

**See.** A panel headed **Getting Started**, with the subtitle *Build your project structure,
then start your first session. Defining modules is optional.* Below it, section **1. Build
project structure**.

---

## Beat 2 — Choose the tier *(Part 3 step 1)*

**Do.** In section **1. Build project structure**, confirm the **Full** radio is selected.

**Say.** "Two tiers. Full runs cross-provider verification on every session — a second AI, on
a different provider, reviews the first one's work before the session can close. That's what
we want."

**See.** The **Full** radio is selected and the **Lightweight** radio is not.

---

## Beat 3 — Choose how routed calls run *(Part 3 step 1)*

**Do.** Under **Provider access (how routed calls run)**, select the second option:
**GitHub Copilot CLI seat — calls run through your Copilot subscription's command-line tool;
no provider API keys needed.**

**Say.** "And how those calls actually run. The default uses direct provider API keys. We're
using the Copilot seat we signed into in part one, so no API keys at all."

**See.** The **GitHub Copilot CLI seat** option is selected, and the **Verification budget
(USD, not-to-exceed)** box that was showing under the direct-keys option **disappears** — the
budget only applies to metered provider-API calls.

> **On the direct-API take**, leave this on the first option and type a not-to-exceed number
> into **Verification budget (USD, not-to-exceed)**. See
> [`scene-1-alt-direct-api.md`](scene-1-alt-direct-api.md).

---

## Beat 4 — Build *(Part 3 step 1)* — **WAIT**

**Do.** Click the **Build project structure** button.

**Say.** "Build. This creates a Python virtual environment, installs the router into it,
writes the config and the docs scaffolding, and then probes your Copilot seat to see which
models it can actually reach. Couple of minutes."

**See.** A progress notification titled **Building project structure…**, then a second one
titled **Setting up the Copilot seat — probing the seat's models (about 1–2 minutes)…**

**WAIT** for both to finish — typically two to four minutes in total. Cut here in the edit.

**If this fails on camera.** If you get a warning saying seat setup was skipped because the
ai-router install did not complete, the virtual environment did not build — stop, fix the
Python install, and re-run **Build project structure**. If you get a warning that only one
distinct provider was confirmed, your seat is enterprise-restricted and Full tier will not
dispatch; say so on camera and switch to the direct-API take.

---

## Beat 5 — Read the two toasts *(Part 3 step 1)*

**Do.** Let both notifications render, and read them on camera.

**Say.** "Two things to read. The structure is built — and it scaffolded a starter module
called Default with two session sets. And the seat is confirmed: it found models across
several providers and wrote the Copilot profile into the router config."

**See.** Two notifications, in this order:

1. `Project structure built (full tier): … file(s) written. ai-router installed. Default
   module scaffolded: 001-default-plan (plan) and 002-default-decomposition (decomposition) —
   rename or delete "Default" any time from the Work Explorer.`
2. `Copilot seat set up: …/… models confirmed (providers: anthropic, google, openai).
   transport.profile: copilot-cli written to ai_router/router-config.yaml.`

The exact counts vary with your seat. What must be true: the second notification names **more
than one** provider, and says `transport.profile: copilot-cli written`.

---

## Beat 6 — Look at what you got *(Part 3 step 1)*

**Do.** Switch to the file Explorer and scroll the new tree. Point at `.venv/`, `ai_router/`,
`docs/session-sets/`, `.github/CODEOWNERS`, `.github/workflows/monorepo-ci.yml`, and the
`AGENTS.md` / `CLAUDE.md` / `GEMINI.md` instruction files. Then switch back to the Dabbler
view.

**Say.** "A virtual environment with the router in it. Router config. A session-sets folder.
Instruction files for whichever AI agent you use. And two GitHub templates — CODEOWNERS and a
CI workflow — both comment-only for now; we turn the CI one on in part four."

**See.** The Getting Started form has been replaced by the Work Explorer, showing a module
group **Default** containing **001-default-plan** and **002-default-decomposition** in the
**Not Started** bucket.

---

## Beat 7 — Declare the `greeter` module *(Part 3 step 2)*

**Do.** Command Palette (`Ctrl+Shift+P`) → **`Dabbler: New Module`**. At the prompt titled
**New module (1/2): slug** type `greeter` and press `Enter`. At **New module (2/2): display
title** type `Greeter` and press `Enter`.

**Say.** "Our first real module is `greeter`. The slug is its machine identity — session sets
declare `module: greeter` and the Explorer groups them under it. The title is just what you
see."

**See.** A plan stub opens in the editor at `docs/modules/greeter/project-plan.md`, and a
notification reads: `Module "greeter" appended to docs/modules.yaml. Plan stub created at
docs/modules/greeter/project-plan.md — fill it in, then decompose it into session sets. Next
steps scaffolded: 003-greeter-plan and 004-greeter-decomposition.`

---

## Beat 8 — Delete the starter module *(Part 3 step 2)*

**Do.** Command Palette → **`Dabbler: Delete Module`**. At the prompt **Which module do you
want to delete?** pick **Default**. Read the confirmation dialog on camera, then click
**Delete Module**.

Then, in the file Explorer, delete the leftover folder `docs/modules/default/`.

**Say.** "And the starter module goes. Read the dialog — it tells you exactly what it's about
to do: it removes the manifest entry and it removes the two starter sets outright, because
neither has been started. It doesn't touch plan files, so I delete that folder by hand."

**See.** A modal headed `Delete module "default"?` whose detail includes
`Removed outright (2): 001-default-plan, 002-default-decomposition`. After confirming, a
notification reads `Deleted module "default" — 0 set(s) cancelled, 2 scaffold(s) removed, 0
left untouched.`, and the Work Explorer now shows one module group, **Greeter**, holding
**003-greeter-plan** and **004-greeter-decomposition**.

**Say (over the result).** "Numbering starts at 003 because 001 and 002 were Default's.
Session-set names are permanent identities — nothing ever renumbers them."

---

## Beat 9 — Set the code root by hand *(Part 3 step 3)*

**Do.** Open `docs/modules.yaml` and edit the `greeter` entry until it reads exactly:

```yaml
modules:
  - slug: greeter
    title: "Greeter"
    codeRoots:
      - services/greeter
    planPath: docs/modules/greeter/project-plan.md
```

Save the file.

**Say.** "One hand edit. `New Module` doesn't ask which code the module owns, so you say it
here — `services/greeter`. This is what lets Dabbler and CI reason about the module later."

**See.** The file saves with no error, and the Work Explorer keeps showing the **Greeter**
group — it re-reads the manifest on save.

---

## Beat 10 — Commit and push the setup *(Part 3 step 4)*

**Do.** In the terminal:

```bash
git add -A
git commit -m "chore: scaffold Dabbler and declare the greeter module"
git push
```

**Say.** "Commit the setup and push it, while `main` is still open. That's the last time I
push straight to `main` in this whole video."

**See.** `git push` reports the branch updated on `origin`. The `.venv/` folder is **not**
in the commit — it is git-ignored.

---

## Beat 11 — Protect `main`, stage 1 of 3 *(Part 3 step 5)*

**Do.** Switch to the browser, on the `hello-modules` repository. Go to **Settings** >
**Branches**, add a rule for `main`, and turn on **Require a pull request before merging**.
Leave the **Require approvals** checkbox that appears underneath it **unticked**. If you are an
admin, also enable the option that stops administrators bypassing the rule. Save.

**Say.** "Now protect the trunk. Require a pull request — but leave 'Require approvals'
unticked, which is zero approvals. I need that: right now I'm the only person here, and nobody
else exists to approve me. We tick it when a second person arrives in part five. If you're an
admin, tick the do-not-bypass option too, otherwise the rule doesn't bind you and the whole
thing is theatre."

**See.** The `main` rule is listed on the **Branches** settings page with **Require a pull
request before merging** enabled and **Require approvals** unticked underneath it.

**If this fails on camera.** If the branch-protection controls are greyed out or absent, the
repository is private on a free plan. Make it public in **Settings > General > Danger Zone >
Change repository visibility** — this is exactly why beat 1 of scene 2 chose Public.

---

## Beat 12 — Name the Azure DevOps equivalent *(Part 3 step 5, ADO callout)*

**Do.** No action; stay on the settings page.

**Say.** "On Azure DevOps this is Project Settings, Repositories, your repo, Policies, Branch
Policies on `main`, 'Require a minimum number of reviewers'. Its minimum is one, not zero, so
tick 'Allow requestors to approve their own changes' and approve your own pull requests until
part five — where we untick it, so somebody else's approval is the one that counts."

**See.** No change on screen — narration-only beat.

---

## Beat 13 — Close the scene *(Part 3, framing)* — **CUT**

**Say.** "A declared module, a protected trunk, and two session sets waiting. Time to let the
AI actually build something."

**See.** VS Code with the Work Explorer showing **Greeter** > **Not Started** >
**003-greeter-plan**, **004-greeter-decomposition**.

---

## Traceability

| Beat | Tutorial step |
| --- | --- |
| 1–6 | Part 3 step 1 |
| 7–8 | Part 3 step 2 |
| 9 | Part 3 step 3 |
| 10 | Part 3 step 4 |
| 11 | Part 3 step 5 |
| 12 | Part 3 step 5's Azure DevOps callout |
| 13 | Part 3 close |
