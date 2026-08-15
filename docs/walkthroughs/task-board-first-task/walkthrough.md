# Put a task on the board, finish it, and filter it away

<!-- Generated from scenario.yaml by `python -m ai_router.scenario_render`. Do not edit this document: edit the scenario and re-render. `python -m ai_router.scenario_render --check` fails if they disagree. -->
<!-- portable-digest: sha256:1a571c2065e463f77437cdd1a5f2a10a516f10d88d3f3784d2c42f5b13eaf2f1 -->

> **Do it yourself.** A short look at what a recorded walkthrough is. You drive a deliberately tiny web page -- add two tasks, tick one off, then narrow the list -- and every step says what to do and what you should see when you have done it. The same five steps are what the browser recorder drives when it makes the video, so the video and this document can never describe different things.
>
> No video is needed. If one exists it shows exactly these steps, in this order, and it is an enhancement -- this document is the durable half.

About **44 seconds** of product time, 5 steps.

## Before you start

- A local clone of the `dabbler-ai-orchestration` repository, and Node.js 20 or newer. Every command below is written to be run from `tools/dabbler-ai-orchestration` inside that clone -- the folder that contains `package.json`. Open a terminal there before you start.
- The extension package's dependencies. From `tools/dabbler-ai-orchestration`, run `npm install` once.

## Get to the baseline

One command serves the sample page and prints its address. The page keeps everything in memory and writes nothing anywhere, so there is no state to clean up and no file to delete afterwards. Leave the command running while you walk the steps; press `Ctrl+C` in that terminal when you are finished.

```bash
cd tools/dabbler-ai-orchestration
node scripts/web-fixture-server.js
```

**You are at the baseline when:** The terminal prints a line beginning `[web-fixture] http://127.0.0.1:` followed by a number. Open that address in a browser and you see a page headed `Task Board`, with a text box, an `Add task` button, three buttons reading `All`, `Open` and `Done`, the words `0 open`, and below them `No tasks yet.`

## Where to start

There is no way to jump into the middle of this. The product is stateful, so to reach any step you start from the baseline -- or from the nearest checkpoint before it -- and do the steps in order. That replay is short by design.

| Start here | What it is | Replay from there |
| :--- | :--- | :--- |
| The baseline | The state the setup steps leave you in | Steps 1 onward |
| After step 4 | two tasks on the board, one of them done | Steps 5 onward |

## The steps

### 1. Where you are starting from

<!-- step-id: read-the-empty-board -->

**Do:** Look at the two lines below the `All`, `Open` and `Done` buttons.

**You should see:** One line reads `0 open`, and the line under it reads `No tasks yet.`

**Look at:** the line of text underneath the three filter buttons

### 2. Put something on the board

<!-- step-id: add-a-task -->

**Do:** Click the text box that says `What needs doing?`, type `Draft the release notes`, and click the blue `Add task` button.

**You should see:** A row appears reading `Draft the release notes`, with an empty tick box to its left. The count above now reads `1 open`, and `No tasks yet.` is gone.

**Look at:** the text box and the blue `Add task` button beside it

### 3. Now there are two

<!-- step-id: add-a-second-task -->

**Do:** Type `Book the release call` into the same text box and click `Add task` again.

**You should see:** Two rows are listed, `Draft the release notes` first and `Book the release call` under it. The count reads `2 open`.

**Look at:** the list of task rows

### 4. Tick one off

<!-- step-id: mark-one-done -->

**Do:** Click the tick box to the left of `Draft the release notes`.

**You should see:** That row's text is struck through and greyed, the tick box is now ticked, both rows are still listed, and the count has dropped to `1 open`.

**Look at:** the tick box at the left of the first row

> **Checkpoint -- two tasks on the board, one of them done.** You can stop here and come back to this point by replaying the baseline and steps 1 to 4.

### 5. Show only what is left

<!-- step-id: filter-to-open -->

**Do:** Click the `Open` button.

**You should see:** Only `Book the release call` is listed. `Draft the release notes` is hidden, the `Open` button is now outlined in blue, and the count still reads `1 open`.

**Look at:** the three filter buttons and the list underneath them

## Start over

Reload the page in your browser. The sample page keeps its tasks in memory only, so a reload empties the board and puts you back at the baseline. Nothing is saved and nothing needs undoing.

## If something goes wrong

| What you see | What to do |
| :--- | :--- |
| The command stops with `Cannot find module` or `fixture web app not found`. | You are in the wrong folder. The command runs from `tools/dabbler-ai-orchestration` inside your clone, not from the repository root. |
| The browser says the site cannot be reached. | The server has stopped. Look at the terminal you started it in; if the command has exited, run it again and use the new address it prints -- the number at the end changes every time. |
| You added a task but the list still says `No tasks yet.` | The text box was empty when you pressed the button. The page ignores a blank task on purpose. Type something into the box first. |
