# Read where every session set stands, in one look

<!-- Generated from scenario.yaml by `python -m ai_router.scenario_render`. Do not edit this document: edit the scenario and re-render. `python -m ai_router.scenario_render --check` fails if they disagree. -->
<!-- portable-digest: sha256:68b76fd3a98891c7286d2601b1548623d72e5cbafe9d77a7adefd0c75fa1e874 -->

> **Do it yourself.** The AI Work Explorer answers one question without you opening a file: what is being worked on, what is waiting, and what is finished. This walks a throwaway sample project that has one of each, and reads all three off the tree.
>
> No video is needed. If one exists it shows exactly these steps, in this order, and it is an enhancement -- this document is the durable half.

About **46 seconds** of product time, 5 steps.

## Before you start

- A local clone of the `dabbler-ai-orchestration` repository. Every command below is written to be run from the **root of that clone** -- the folder that contains `ai_router/` and `tools/`. Open a terminal there before you start. If you have no clone, this walkthrough is not the place to begin; the repository's own README covers getting one.
- Node.js 20 or newer. From the repository root, run `cd tools/dabbler-ai-orchestration && npm install` once, then `cd` back to the root.
- A VS Code the launcher can find. From the repository root, running `cd tools/dabbler-ai-orchestration && npm run test:playwright` once downloads one into `tools/dabbler-ai-orchestration/.vscode-test/`; otherwise set the `VSCODE_BIN` environment variable to the full path of a VS Code executable you already have.

## Get to the baseline

One command does all the staging. It copies a small sample project into a throwaway folder outside the repository, launches a second VS Code window against that copy, and opens the AI Work Explorer for you. The sample project is disposable -- nothing you do in it touches your own work, and re-running the command gives you a clean one. Run these two lines from the **root of your clone**; the first changes into the extension package, and the second is what starts everything.

```bash
cd tools/dabbler-ai-orchestration
npm run walk
```

**You are at the baseline when:** A second VS Code window is open, its title bar says `Dabbler UAT fixture workspace`, and the AI Work Explorer panel is showing in the sidebar with at least one row in it.

## Where to start

There is no way to jump into the middle of this. The product is stateful, so to reach any step you start from the baseline -- or from the nearest checkpoint before it -- and do the steps in order. That replay is short by design.

| Start here | What it is | Replay from there |
| :--- | :--- | :--- |
| The baseline | The state the setup steps leave you in | Steps 1 onward |
| After step 2 | buckets showing | Steps 3 onward |

## The steps

### 1. The one row you start from

<!-- step-id: read-the-module-row -->

**Do:** Look at the top row of the AI Work Explorer panel in the second window.

**You should see:** A single row reading `Default`, with `4 sets` in smaller grey text just after the name.

**Look at:** the single top row of the AI Work Explorer panel

### 2. Split the work by where it stands

<!-- step-id: open-the-status-buckets -->

**Do:** Click the arrow to the left of the word `Default`.

**You should see:** Three rows appear underneath it, in this order: `In Progress` with `1 set` after it, `Not Started` with `2 sets`, and `Complete` with `1 set`.

**Look at:** the three rows that appear underneath `Default`

> **Checkpoint -- buckets showing.** You can stop here and come back to this point by replaying the baseline and steps 1 to 2.

### 3. What is being worked on right now

<!-- step-id: find-what-is-being-worked-on -->

**Do:** Click the arrow to the left of `In Progress`, then rest the pointer on the row that appears underneath it.

**You should see:** One row named `001-hello-page`, and a hover card that reads `in progress` followed by `1/3 sessions complete`.

**Look at:** the hover card over the set row under `In Progress`

### 4. Why something has not started

<!-- step-id: find-out-why-something-is-waiting -->

**Do:** Click the arrow to the left of `Not Started`, then rest the pointer on the row named `002-style-the-greeting`.

**You should see:** A hover card saying the set is blocked by prerequisites, naming `001-hello-page` and its current state, `in progress`.

**Look at:** the hover card over `002-style-the-greeting`

### 5. Go straight to the plan

<!-- step-id: open-the-spec-from-the-row -->

**Do:** Click the words `001-hello-page` themselves -- the name, not the arrow beside it.

**You should see:** That set's `spec.md` opens in the editor area beside the panel, and a notification appears in the bottom right reading `Copied: Start the next session of 001-hello-page`.

**Look at:** the editor area to the right of the panel

## Start over

Close the second VS Code window and run `npm run walk` again. It stages a brand-new copy of the sample project every time, so there is no state to clean up and nothing to undo.

## If something goes wrong

| What you see | What to do |
| :--- | :--- |
| The command stops with `npm error Missing script: "walk"`. | You are in the wrong folder. The command runs from `tools/dabbler-ai-orchestration` inside your clone, not from the repository root and not from anywhere else. |
| The command stops with `No VS Code binary found`. | Run `npm run test:playwright` once from `tools/dabbler-ai-orchestration` to download a VS Code, or set the `VSCODE_BIN` environment variable to the full path of a VS Code executable you already have. Then run `npm run walk` again. |
| The second window opened but you cannot see the AI Work Explorer. | Click the AI Work Explorer icon in the Activity Bar down the far left edge of that window to show the panel. |
| The panel is showing but has no rows in it. | Open the Command Palette with `Ctrl+Shift+P` and run `Dabbler: Refresh Work Explorer`. |
