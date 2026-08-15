# Put a task on the board, finish it, and filter it away

<!-- Generated from scenario.yaml by `python -m ai_router.scenario_render`. Do not edit this document: edit the scenario and re-render. `python -m ai_router.scenario_render --check` fails if they disagree. -->
<!-- portable-digest: sha256:714218e4b40539ab5698d28dff032e72dedfc5d9493fd7bd7df400158fc8d01e -->

**Who this is for.** Someone working in a local clone of the `dabbler-ai-orchestration` repository who wants to see the walkthrough format working end to end on a web page, rather than read about it. **The page is a stand-in, not a product.** It exists so the recorder can be proved against the kind of target this framework is actually used to build -- .NET, Java, Python and plain JavaScript applications, which are all one platform once they reach a browser. Nothing you learn here is about the Dabbler extension; the point is the shape of the walkthrough, and that the shape works somewhere other than this repository's own product.

A short look at what a recorded walkthrough is. You drive a deliberately tiny web page -- add two tasks, tick one off, then narrow the list -- and every step says what to do and what you should see when you have done it. The same five steps are what the browser recorder drives when it makes the video, so the video and this document can never describe different things.

Reading it takes a couple of minutes; doing it takes about 44 seconds. **No video is needed.** If you have one, it narrates the same steps in the same order, and it carries no information this page leaves out.

## What you need first

- A local clone of the `dabbler-ai-orchestration` repository, and Node.js 20 or newer. Every command below is written to be run from `tools/dabbler-ai-orchestration` inside that clone -- the folder that contains `package.json`. Open a terminal there before you start.
- Nothing else. There is no `npm install` step and nothing to build: the command below uses only what Node.js itself ships with, and the page it serves has no dependencies. (Recording this walkthrough as a video does need more, but that is a separate job and this document does not need it.)

## Where the walkthrough starts

One command serves the sample page and prints its address. The page keeps everything in memory and writes nothing anywhere, so there is no state to clean up and no file to delete afterwards. Leave the command running while you walk the steps; press `Ctrl+C` in that terminal when you are finished.

```bash
cd tools/dabbler-ai-orchestration
node scripts/web-fixture-server.js
```

**You have arrived when:** The terminal prints a line beginning `[web-fixture] http://127.0.0.1:` followed by a number. Open that address in a browser and you see a page headed `Task Board`, with a text box, an `Add task` button, three buttons reading `All`, `Open` and `Done`, the words `0 open`, and below them `No tasks yet.`

There is no way to jump into the middle of this. The product is stateful, so to reach any step you start from the baseline -- or from the nearest checkpoint before it -- and do the steps in order. That replay is short by design.

## The walkthrough

### 1. Where you are starting from

<!-- step-id: read-the-empty-board -->

An empty board says so in two places at once -- the count and the list. Both change as you work, and reading them now is what makes the change obvious later.

**To do it.** Look at the two lines below the `All`, `Open` and `Done` buttons.

**What happens.** One line reads `0 open`, and the line under it reads `No tasks yet.`

### 2. Put something on the board

<!-- step-id: add-a-task -->

Adding a task is the whole of the page's job. Watch the count as well as the list: they are the two things that have to agree.

**To do it.** Click the text box that says `What needs doing?`, type `Draft the release notes`, and click the blue `Add task` button.

**What happens.** A row appears reading `Draft the release notes`, with an empty tick box to its left. The count above now reads `1 open`, and `No tasks yet.` is gone.

### 3. Now there are two

<!-- step-id: add-a-second-task -->

A second task is not just more of the same. One task cannot show you that filtering does anything, so the board needs two before the last step can mean anything.

**To do it.** Type `Book the release call` into the same text box and click `Add task` again.

**What happens.** Two rows are listed, `Draft the release notes` first and `Book the release call` under it. The count reads `2 open`.

### 4. Tick one off

<!-- step-id: mark-one-done -->

A finished task stays on the board rather than disappearing. That is deliberate: you can see what you did, and the count tells you what is left.

**To do it.** Click the tick box to the left of `Draft the release notes`.

**What happens.** That row's text is struck through and greyed, the tick box is now ticked, both rows are still listed, and the count has dropped to `1 open`.

This is the **two tasks on the board, one of them done** checkpoint -- a sensible place to stop, and the place to resume from.

### 5. Show only what is left

<!-- step-id: filter-to-open -->

Filtering changes what is shown, never what is stored. Switching back to `All` brings the finished task straight back, which is how you know nothing was thrown away.

**To do it.** Click the `Open` button.

**What happens.** Only `Book the release call` is listed. `Draft the release notes` is hidden, the `Open` button is now outlined in blue, and the count still reads `1 open`.

## Doing it yourself

[`walkthrough.md`](walkthrough.md) is the same scenario written as instructions to follow, with the recovery steps for when something does not look right. It is generated from the same source as this page, so the two cannot disagree.
