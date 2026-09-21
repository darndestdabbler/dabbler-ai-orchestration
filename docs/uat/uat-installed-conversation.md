# The installed conversation — session 219's acceptance report

Walked on 2026-09-20 on the operator's Windows 11 machine. One VSIX was built
from this session's tree, installed into a disposable VS Code profile, and
driven through a whole session by each interactive engine, with a person's
part played by Playwright and a saboteur's part played once per run.

**The candidate approved for the operator's four soaks is
`dabbler-ai-orchestration-3.16.0.vsix`, SHA-256
`6d8178ff3cb2b6bd66bc4e73830ffe24ad48a12e15e0d67f07aaaf74a5c000de`**, kept at
`C:\temp\s219-installed\final\`. It was built from this session's final tree:
every change to the product, its templates, its manifest and its changelog was
made first, the tree was frozen, the package was built, and only then was it
walked. Every result in "The cases" below is from that one file, and the walk
itself judged each run and would have exited non-zero on any unmet case.

Four candidates were walked and this is the fourth. A first build was rejected
by its own contents before any walk; two walked candidates were rejected by a
case; a third passed every case and was set aside because the changelog it
packs was edited after it was walked. What rejected each is in "What the walk
found".

**How that file relates to what is published.** This repository's release is
tag-driven: CI checks the tag out and builds the VSIX itself, so the published
file can never carry this checksum — a VSIX is a zip, and a zip carries its own
timestamps. Two builds of this same tree, made minutes apart on this machine,
have different checksums (`6d8178ff…` and `589b6175…`) and **identical
contents in all 72 entries**, by
`node docs/design/messaging-poc/walk-vsix.cjs --compare <a.vsix> <b.vsix>`.
So the claim this report makes is the one that can be checked: the four soaks
use the file named above, installed with `code --install-extension <file>
--force`; the Marketplace's 3.16.0 is CI's build of the same commit; and the
same `--compare`, run on the published package once it exists, says whether
its contents are the walked ones. If they are not, the published package has
not been walked, and the difference it lists is what to look at.

## How it was walked

| | |
| --- | --- |
| extension | `darndestdabbler.dabbler-ai-orchestration-3.16.0`, installed with `code --install-extension` into a fresh user-data folder, extensions folder and AppData per run; no development path |
| router | `dabbler-ai-router 3.16.0`, the one bundled in that VSIX — it ran `bootstrap`, every `session` verb and every framework job |
| engines | Claude Code 2.1.278 (`--model sonnet`); GitHub Copilot CLI 1.0.86 (`--model gpt-5.6-luna`), each launched by Start Session exactly as the extension launches it, with no extra permission flags |
| reviewers | through the Copilot seat (`dabbler.reviewerTransport: copilot-cli`), cross-provider as always |
| editor | VS Code 1.138.0, the extension's test download; Node v25.8.1 |
| harness | `docs/design/messaging-poc/walk-vsix.cjs`, adapted rather than replaced |

Each run stages its own disposable repository under
`C:\temp\s219-installed\<run>`: a small TypeScript package with a real build
and test, a local bare remote, `dabbler bootstrap` through the VSIX's own
router, one releasable session of three steps (`greet`, `shout`, `farewell`
and the exports), a declared suite that takes 40 seconds so the run of record
is a long framework job, and a pack-only `packaging` block, so the session
packages and tags and pushes its artifact nowhere.

The command lines, from this checkout's root, with `<vsix>` the candidate
above and `<scratch>` `C:/temp/s219-installed`:

```
node docs/design/messaging-poc/walk-vsix.cjs --engine claude  --model sonnet       --vsix <vsix> --scratch <scratch> --run final-claude-main      --scenario main
node docs/design/messaging-poc/walk-vsix.cjs --engine copilot --model gpt-5.6-luna --vsix <vsix> --scratch <scratch> --run final-copilot-main     --scenario main
node docs/design/messaging-poc/walk-vsix.cjs --engine claude  --model sonnet       --vsix <vsix> --scratch <scratch> --run final-claude-cancel    --scenario cancel
node docs/design/messaging-poc/walk-vsix.cjs --engine copilot --model gpt-5.6-luna --vsix <vsix> --scratch <scratch> --run final-copilot-cancel-b --scenario cancel
node docs/design/messaging-poc/walk-vsix.cjs --engine claude  --model sonnet       --scratch <scratch> --run claude-direct  --scenario direct
node docs/design/messaging-poc/walk-vsix.cjs --engine copilot --model gpt-5.6-luna --scratch <scratch> --run copilot-direct --scenario direct
```

What the walk typed, as a person would: the engine and model picks, each
CLI's folder-trust prompt, its tool-permission prompts, two questions, and one
`dabbler session interrupt`. It typed no instruction, no `answer_command`, no
`session next` and no acknowledgement. Every action is in each run's
`walk.jsonl` with who took it.

## The cases

Both main runs closed **VERIFIED**, and the walk accepted both: 14 cases of
14, each written with its evidence into the run's `summary.json`. Times are UTC.

| case | Claude Code — `final-claude-main` | Copilot CLI — `final-copilot-main` |
| --- | --- | --- |
| started, the real interactive AI visible | Start Session from the Work Explorer row, 02:49:18; the row's menu offers Start Session and Consult with AI, and no Resume | the same, 02:54:59 |
| a bounded three-step change approved and done | three steps, accepted once each | three steps, accepted once each |
| one request, then chained answers | `session next` run 1 time; 5 `session report` commands, all 5 with `--next`, all 5 started in the background; `session wait` 0; `--mailbox` 0; sleeps or polls 0; reads of the framework's records 0 | the same counts: 1; 5 of 5; 0; 0; 0; 0 |
| every instruction after the first came from the answer before it | plan, 3 steps and `done`: each printed by the chained answer to the one before | the same |
| a question while the author worked | heard in phase `work`, 02:51:03; *"Step 2 (`shout`) is done and reported. `shout` builds on `greet`, and the two new tests cover the named and empty-name cases…"* | heard in phase `work`, 02:56:30; *"I'm on the first implementation step, completing `greet(name)` and its empty-name test; the required check is running now."* |
| a question while a background exchange waited on a long job | heard during verification, 02:52:02; *"Yes, the step 3 answer command (`by13hixb8`) is still running, since no completion notice has arrived, and when it exits it will p…"* | heard during verification, 02:58:34; *"Yes, the answer command is still running; when it exits, it will print the framework's next instruction, which I'll follow…"* |
| nothing injected as a fake human message | the two questions are the only human turns in the engine's transcript after the opening sentence | the same |
| interrupted once with a course correction | `session interrupt --reason`, asking for a one-line comment at the top of the greeter in the next step, while step 1 was worked; the next instruction, step 2, carried it first among its reasons as `sent: …`; no Resume | the same |
| the Dabbler Terminal shows phase and progress, and survives being closed | closed and reopened while `run of record: node` ran; the AI's tab untouched; the reopened terminal rebuilt the session banner, a phase line and who was waited on | closed during verification, reopened as the run of record began; rebuilt the same |
| every framework line one way | 121 lines read from the reopened terminal and at the end; 0 begin `dabbler [` | 137 lines; 0 |
| one chained exchange killed after its answer was durable, and repeated | killed 02:53:01 while `run of record: node` ran, all three steps already accepted; the AI ran the identical command again 12 s later | killed 02:59:26; the identical command again 12 s later |
| exactly once | 3 steps once each; 1 review round, 1 reviewer conversation on the seat; one each of the verification, run-of-record, publish and close jobs; 1 package (`published`, tag `session-001`); 1 land commit; the remote's `master` is the checkout's `HEAD` | the same |
| git, at the end | `78891f6 Close session 1 of sessions` over `7f29074 Session 1: Three greetings` | `f6b258f Close session 1 of sessions` over `947f0ed Session 1: Three greetings` |
| the package | 72 entries; none is a record, a transcript, a run ledger, a scratch or test repository, or a key | the same file |
| nothing left running | 0 router, engine, test, package or git processes naming the run after the editor closed | 0 |
| tool prompts a person answered | 0 beyond the trust prompt | 19, all Copilot's own per-tool dialogs |
A fuller path was walked on an earlier candidate and is kept:
`copilot-final-2` and `copilot-final-3` each met a review round with a
blocking finding, and the rejection, the dispositions, the fix step and the
second round all travelled through chained answers to a VERIFIED close.

### Cancellation — `final-claude-cancel`, `final-copilot-cancel-b`

With the first step under way, the operator said in the AI's chat: stop, and
cancel this session with `dabbler session cancel 1 --reason "the operator
wants a different approach"`. Both engines ran exactly that, with no
`--force`, and the walk accepted both runs: 7 cases of 7.

| | Claude Code | Copilot CLI |
| --- | --- | --- |
| the ledger | `cancelled`, reason *the operator wants a different approach* | the same |
| the author's files | the greeter and its test, both modified and uncommitted before, at and a minute after the cancel | the same |
| commits after it | one, `Cancel session 1 of sessions` — the cancellation's own record; none later | the same |
| the remote | never moved: still at the plan's commit | the same |
| land commits / tags / packaging rows | 0 / 0 / 0 | 0 / 0 / 0 |
| processes left | 0 | 0 |

## Time and cost, beside a direct implementation

The `direct` runs gave the same engine the same three-step change in one
prompt, with no framework, and stopped the clock when the build and tests
passed. This is a measurement, not a gate.

| | Claude Code | Copilot CLI |
| --- | --- | --- |
| direct: wall time | 58 s | 46 s |
| direct: cost | 5 model calls, 212,533 input and 2,720 output tokens | 5 model calls, **1.13 AI credits** |
| framework: Start to close | 265 s | 329 s |
| framework: author's cost | 25 model calls, 1,333,977 input and 7,647 output tokens | 29 model calls, **2.59 AI credits** |
| framework: reviewer's cost, through the seat | 5.45 AI credits (one conversation) | 7.45 AI credits (one conversation) |
| ratio, wall time | 4.6× | 7.2× |
| ratio, author's cost | output tokens 2.8×; input tokens 6.3× | 2.3× |

Both wall-time ratios pass three times the baseline, so they were looked
into, and they are explained by work the baseline does not do. Where the
seconds went, from each run's phase record:

| | Claude Code | Copilot CLI |
| --- | --- | --- |
| registration to the first instruction, and the plan | 82 s | 71 s |
| the steps, each with its own check (a build and a test run) | 66 s | 136 s |
| cross-provider verification | 36 s | 46 s |
| the run of record — a suite made 40 s long on purpose | 50 s, of which the walk's own kill cost 12 s | 49 s, of which the kill cost 12 s |
| land, package, close | 31 s | 27 s |

Taking out only what the walk added on purpose — the 40-second suite and the
kill — leaves about 213 s and 277 s, 3.7× and 6.0×. The rest is a plan, a
check per step, an independent review, the suite, a commit, a push, a package
and a close, none of which the direct run has. Copilot's steps take twice
Claude's for a reason of its own: launched as Start launches it, it asks
before every tool — 19 dialogs in this run — and the walk answers one only
when it next looks. Claude's input tokens are 6.3× because a chained session
is 25 turns where the direct one is 5, and every turn re-reads the
conversation from cache; its output tokens, which are what it wrote, are
2.8×. The reviewer's credits have no baseline: the direct run is not reviewed.

One thing in these numbers is a finding rather than an explanation, and it is
below: how long Claude Code takes to learn that its command has died.
## What the walk found

**What rejected a candidate.** The first three are defects in the product:
each was fixed with its test, and both engines were walked again from clean
profiles. The last two are defects in how this acceptance was run, found by
the session's own reviewer, and they cost a candidate too.

1. **The package carried a record of this machine.** The first build
   (`5e9e5e96…`, never walked) held `router-metrics.jsonl` in its `dist` folder: five rows of
   this machine's own verification calls — model names, token counts, a seat
   conversation id; no credential — which the router writes beside the
   configuration it loads, and which in a checkout is the extension's `dist`.
   `.vscodeignore` re-included all of `dist` with a blanket negation, and
   `vsce` keeps a file that matches any negation whatever else excludes it, so
   an exclusion added beside it did nothing: the negation now lists the kinds
   the bundle needs. 3.13.6's local build carried the same file; a CI build
   starts from an empty `dist` and never did. The walk now lists the package
   on every run and reports anything that is a record, a transcript, a run
   ledger, a scratch or test repository, or a key: 72 entries, none stray.
2. **An engine that was told to repeat a killed command did not.** On the
   first walked candidate (`546a3bb2…`) Claude Code passed every case, and Copilot did
   not: told at once that its answer command had exited 1, it read the output
   — the report's confirmation and the framework's progress lines, and no
   instruction — checked `dabbler status`, and ended its turn: *"The
   reporting command exited after handing control to the framework's
   run-of-record job, which is still in progress; the session remains
   verified and waiting for that job to finish."* Nothing would ever have
   finished that session. The managed instruction was at fault, not the
   engine: it said to repeat a command that *"printed nothing at all"* and
   not to repeat one that *"prints no instruction and says why"*, and a killed
   chained command prints progress and then stops, which is neither. The rule
   now turns on what the output **ends with** — an instruction, a refusal or
   a stop, or anything else, which was cut off and is started again at once,
   because the framework does not finish a session by itself. On the next
   candidate Copilot repeated the command in 12 seconds, every time.
   Evidence: `copilot-main-attempt1-not-repeated`.
3. **A refusal sent an engine the wrong way.** In a cancellation run the
   harness garbled the operator's message (see below), Copilot guessed
   `dabbler session cancel --force`, and the router correctly refused it — in
   words that had been true before session 218 and no longer were: *"Report
   the step blocked and say why; a person cancels…"*. It obeyed, and paused a
   session it had been asked to cancel. The refusal now says the engine's own
   way — *the session you are working is yours to cancel without it:
   `dabbler session cancel <its number> --reason "<why>"`* — and the managed
   instruction's hard rule says the same in its one line. The second walked candidate
   (`dc5ba037…`) was rejected for it.
4. **A candidate that passed was not the tree.** The third walked candidate
   (`b60d58f3…`) passed every case for both engines, and then the changelog —
   which the package carries — was edited to describe what the walks had found.
   A reviewer caught it: the approved checksum was no longer a build of the
   final tree. The order is now the one it should have been — finish every
   change, freeze, build, walk — and the approved candidate is the result.
5. **The walk could pass for evidence without being any.** It recorded each
   outcome and exited 0 whatever it was: a run that hit its deadline left the
   same files as one that closed. The same reviewer caught that too. The walk
   now judges its own run case by case and exits non-zero unless every case
   holds, and the first time it ran that way it failed a run that deserved it
   (`final-copilot-cancel-attempt1-not-heard`, below).

**A finding that is recorded, not fixed.** Claude Code is not told its
background command has died until everything that inherited the command's
output has exited too. The framework's jobs are separate processes that
inherit the chained command's output streams, so when the walk killed the
command during the 40-second suite, Claude repeated it only once the suite
had ended — 40 s after the kill in three runs where the kill came early in
the suite, 12 s in the approved run where it came late, and in all four
within seconds of the job's end and never before it — where Copilot, told at
once, took 12 s every time. Nothing is lost: the job finishes, the repeat
collects it, and the session closes. But a command killed under a
twenty-minute suite would go unnoticed for twenty minutes. The fix is small
and is the router's — a job should not hold its parent's streams — and it was
not made here: no case failed for it, and the soaks are where its cost in
practice will show.
**What the harness got wrong, so nobody re-learns it.** Seven runs were void,
or void in one reading, for the harness's own faults, and are kept beside
the rest:
`claude-main-attempt1` — *View: Close Editor* closed the AI's terminal
instead of the Dabbler Terminal, because the palette hands focus back to
whichever editor had it; the walk now closes the tab by its own gesture and
checks the AI's tab is still there. `claude-main-attempt2` — reading Claude's
screen takes seconds and a small step's instruction came and went inside one
reading, so the course correction was sent after the last step and had no
instruction left to travel with; the records are now read several times a
second, apart from the walk's pace. `copilot-final`, `copilot-final-2`,
`approved-copilot-main`, the first `copilot-cancel` and
`final-copilot-cancel-attempt1-not-heard` — keys typed while
Copilot shows a permission dialog go to the dialog, so a question lost its
beginning, its Enter, or, once, the command in the middle of it; the walk now
pastes a question whole, in the quiet just after it answers a dialog, and
takes Copilot's own record as the word on whether it was heard; the quick
paste key carried every short question and never the long cancel request, so
it alternates with the editor's own paste command. One
unplanned observation came out of the first of these: with the AI's terminal
closed mid-session, the chained command carried on alone, the run of record
finished uncollected, and the Dabbler Terminal said so and said what to do —
*"ask your AI to run `dabbler session next`"*. An author that goes away is
not a framework stop.

One more reading, kept honest: in `claude-main`, six seconds after its
command was killed, Claude ran `dabbler status` and read `run.json` once, to
see why, and then repeated the command. That is a diagnosis, not a wait; the
approved runs show no polls at all.

## The suites

The targeted tests ran with each fix. The whole repository was then run on
the frozen tree the approved candidate was built from — the typecheck and
lint controls, the container suite, the extension suite and the host suite,
all green — and the framework runs them again as this session's run of
record.
## Where the evidence is

Outside the product tree, under `C:\temp\s219-installed\`: one folder per run
named above, each with its disposable repository, its bare remote, its VS
Code profile and `results` — `summary.json`, `walk.jsonl`, the engine's own
transcript, the AI terminal's text, the Dabbler Terminal's text before it
was closed, after it was reopened and at the end, screenshots, the run's
records, the ledger, the git log and the remote's refs. The approved
candidate is in `final`, beside the second build of the same tree it was
compared with; the three walked candidates that were rejected are in
`candidate-rejected`, named by their checksums. No environment and no
credential is in any of it.

## What this does not prove

One run of each case, on one machine, of a five-minute session: it is an
acceptance, and the four soaks are the test of endurance. A session that
stops for a person was not walked here; the stop's own words — *ask your AI
to run `dabbler session next`* — were seen only by accident. And the package
the Marketplace serves is CI's build of this commit, which nobody can walk
before it exists: what ties it to the file walked here is the comparison of
their contents described at the top, and until that has been run the file
this report approves is the one in `final`, and no other.
