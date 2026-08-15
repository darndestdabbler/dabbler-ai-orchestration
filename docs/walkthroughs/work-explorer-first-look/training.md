# Read where every session set stands, in one look

<!-- Generated from scenario.yaml by `python -m ai_router.scenario_render`. Do not edit this document: edit the scenario and re-render. `python -m ai_router.scenario_render --check` fails if they disagree. -->
<!-- portable-digest: sha256:68b76fd3a98891c7286d2601b1548623d72e5cbafe9d77a7adefd0c75fa1e874 -->

**Who this is for.** Someone working in a local clone of the `dabbler-ai-orchestration` repository -- a contributor, or a maintainer of a project that uses the framework -- who wants to know what the AI Work Explorer panel is telling them. No prior knowledge of the framework itself is assumed. It is **not** a walkthrough of your own project: it drives a throwaway sample project the repository ships for exactly this purpose, so what you see is the same on every machine.

The AI Work Explorer answers one question without you opening a file: what is being worked on, what is waiting, and what is finished. This walks a throwaway sample project that has one of each, and reads all three off the tree.

Reading it takes a couple of minutes; doing it takes about 46 seconds. **No video is needed.** If you have one, it narrates the same steps in the same order, and it carries no information this page leaves out.

## What you need first

- A local clone of the `dabbler-ai-orchestration` repository. Every command below is written to be run from the **root of that clone** -- the folder that contains `ai_router/` and `tools/`. Open a terminal there before you start. If you have no clone, this walkthrough is not the place to begin; the repository's own README covers getting one.
- Node.js 20 or newer. From the repository root, run `cd tools/dabbler-ai-orchestration && npm install` once, then `cd` back to the root.
- A VS Code the launcher can find. From the repository root, running `cd tools/dabbler-ai-orchestration && npm run test:playwright` once downloads one into `tools/dabbler-ai-orchestration/.vscode-test/`; otherwise set the `VSCODE_BIN` environment variable to the full path of a VS Code executable you already have.

## Where the walkthrough starts

One command does all the staging. It copies a small sample project into a throwaway folder outside the repository, launches a second VS Code window against that copy, and opens the AI Work Explorer for you. The sample project is disposable -- nothing you do in it touches your own work, and re-running the command gives you a clean one. Run these two lines from the **root of your clone**; the first changes into the extension package, and the second is what starts everything.

```bash
cd tools/dabbler-ai-orchestration
npm run walk
```

**You have arrived when:** A second VS Code window is open, its title bar says `Dabbler UAT fixture workspace`, and the AI Work Explorer panel is showing in the sidebar with at least one row in it.

There is no way to jump into the middle of this. The product is stateful, so to reach any step you start from the baseline -- or from the nearest checkpoint before it -- and do the steps in order. That replay is short by design.

## The walkthrough

### 1. The one row you start from

<!-- step-id: read-the-module-row -->

Everything the Explorer shows hangs off a module. This sample project declares none, so all of its work sits under the one the Explorer supplies by default.

**To do it.** Look at the top row of the AI Work Explorer panel in the second window.

**What happens.** A single row reading `Default`, with `4 sets` in smaller grey text just after the name.

### 2. Split the work by where it stands

<!-- step-id: open-the-status-buckets -->

Underneath a module, work is grouped by where it stands rather than by when it was created. The three groups always render, even when one of them is empty, so a group you expected and cannot find is a real answer rather than a missing row.

**To do it.** Click the arrow to the left of the word `Default`.

**What happens.** Three rows appear underneath it, in this order: `In Progress` with `1 set` after it, `Not Started` with `2 sets`, and `Complete` with `1 set`.

This is the **buckets showing** checkpoint -- a sensible place to stop, and the place to resume from.

### 3. What is being worked on right now

<!-- step-id: find-what-is-being-worked-on -->

The row itself carries only the name. How far along it is lives in the hover card, which keeps the row readable at any panel width.

**To do it.** Click the arrow to the left of `In Progress`, then rest the pointer on the row that appears underneath it.

**What happens.** One row named `001-hello-page`, and a hover card that reads `in progress` followed by `1/3 sessions complete`.

### 4. Why something has not started

<!-- step-id: find-out-why-something-is-waiting -->

Not started is not the same as available to start. A set can be waiting on another one, and the hover card names which, so nobody has to open a file to find out.

**To do it.** Click the arrow to the left of `Not Started`, then rest the pointer on the row named `002-style-the-greeting`.

**What happens.** A hover card saying the set is blocked by prerequisites, naming `001-hello-page` and its current state, `in progress`.

### 5. Go straight to the plan

<!-- step-id: open-the-spec-from-the-row -->

Every row is a way in. Clicking the name rather than the arrow opens that set's specification -- the document describing what the work is -- and, for anything not yet finished, puts the sentence that starts its next session on your clipboard so you can paste it straight into a chat.

**To do it.** Click the words `001-hello-page` themselves -- the name, not the arrow beside it.

**What happens.** That set's `spec.md` opens in the editor area beside the panel, and a notification appears in the bottom right reading `Copied: Start the next session of 001-hello-page`.

## Doing it yourself

[`walkthrough.md`](walkthrough.md) is the same scenario written as instructions to follow, with the recovery steps for when something does not look right. It is generated from the same source as this page, so the two cannot disagree.
