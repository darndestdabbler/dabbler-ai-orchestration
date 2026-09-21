# The installed conversation — session 219's acceptance report

Walked on 2026-09-20 on the operator's Windows 11 machine. One VSIX was built
from this session's tree, installed into a disposable VS Code profile, and
driven through a whole session by each interactive engine, with a person's
part played by Playwright and a saboteur's part played once per run.

**The candidate approved for the operator's four soaks is
`dabbler-ai-orchestration-3.16.0.vsix`, SHA-256
`b60d58f3d37d94751ab20199363170400a938efcf17e8ef71566cdedd452012d`.** Every
result in "The cases" below is from that file. Three candidates were walked
and this is the third: a first build was rejected by its own contents before
any walk, and two walked candidates were rejected by a case. What rejected
each is in "What the walk found".

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
node docs/design/messaging-poc/walk-vsix.cjs --engine claude  --model sonnet       --vsix <vsix> --scratch <scratch> --run approved-claude-main     --scenario main
node docs/design/messaging-poc/walk-vsix.cjs --engine copilot --model gpt-5.6-luna --vsix <vsix> --scratch <scratch> --run approved-copilot-main-b  --scenario main
node docs/design/messaging-poc/walk-vsix.cjs --engine claude  --model sonnet       --vsix <vsix> --scratch <scratch> --run approved-claude-cancel   --scenario cancel
node docs/design/messaging-poc/walk-vsix.cjs --engine copilot --model gpt-5.6-luna --vsix <vsix> --scratch <scratch> --run approved-copilot-cancel  --scenario cancel
node docs/design/messaging-poc/walk-vsix.cjs --engine claude  --model sonnet       --scratch <scratch> --run claude-direct  --scenario direct
node docs/design/messaging-poc/walk-vsix.cjs --engine copilot --model gpt-5.6-luna --scratch <scratch> --run copilot-direct --scenario direct
```

What the walk typed, as a person would: the engine and model picks, each
CLI's folder-trust prompt, its tool-permission prompts, two questions, and one
`dabbler session interrupt`. It typed no instruction, no `answer_command`, no
`session next` and no acknowledgement. Every action is in each run's
`walk.jsonl` with who took it.

## The cases

Both main runs closed **VERIFIED**. Times are UTC.

| case | Claude Code — `approved-claude-main` | Copilot CLI — `approved-copilot-main-b` |
| --- | --- | --- |
| started, the real interactive AI visible | Start Session from the Work Explorer row, 02:11:15; the row's menu offers Start Session and Consult with AI, and no Resume | the same, 02:32:22 |
| a bounded three-step change approved and done | the AI planned four steps (the three, and a version bump); all four accepted, once each | three steps, accepted once each |
| one request, then chained answers | `session next` run 1 time; 6 `session report` commands, all 6 with `--next`, all 6 started in the background; `session wait` 0; `--mailbox` 0; sleeps or polls 0 | 1; 5 of 5 chained and in the background; 0; 0; 0 |
| every instruction after the first came from the answer before it | plan, 4 steps and `done`: each printed by the chained answer to the one before | plan, 3 steps and `done`, the same |
| a question while the author worked | asked in phase `work`; *"Step 2, `shout`, is done and reported…"* | heard 02:33:43, seven seconds before its step-1 answer; *"I'm on step 1, implementing and testing the empty-name behavior for `greet`."* |
| a question while a background exchange waited on a long job | asked in phase `verify`; *"Yes, the `bump-version` report command is still running, since I haven't had a completion notification for it. When it e…"* | heard 02:35:42, during verification; *"Yes—the step-4 answer command is still running, and when it exits I'll follow its printed next instruction…"* |
| nothing injected as a fake human message | the two questions are the only human turns in the engine's transcript after the opening sentence | the same |
| interrupted once with a course correction | `session interrupt --reason`, asking for a one-line comment at the top of the greeter in the next step, while step 1 was worked; the next instruction, step 2, carried it first among its reasons as `sent: …`; no Resume | the same, on its step 2 |
| the Dabbler Terminal shows phase and progress, and survives being closed | closed and reopened while `run of record: node` ran; the AI's tab untouched; the reopened terminal rebuilt the session banner, the phase, the step, the job and *"waiting-on … Run of record"* with its elapsed time | closed during verification; reopened, it read *"phase now=verify … job-started name=verification … waiting-on says=Verification — 0:41 of 29:59"* — the elapsed time from the record, not from zero |
| every framework line one way | 0 lines beginning `dabbler [` in the reopened terminal or at the end | 0 |
| one chained exchange killed after its answer was durable, and repeated | killed 02:14:29 while `run of record: node` ran, all four steps already accepted; the AI ran the identical command again 40 s later | killed 02:36:37; the identical command again 12 s later |
| exactly once | accepted steps 4, each once; 1 review round, 1 reviewer conversation on the seat; 1 verification job, 1 run of record, 1 publish, 1 close; 1 package (`published`, tag `session-001`); 1 land commit; the remote's `master` is the checkout's `HEAD` | 3 steps once each; 1 round, 1 reviewer conversation; the same single jobs; 1 package; 1 land commit; remote is `HEAD` |
| git, at the end | `7d09112 Close session 1 of sessions` over `3a922a2 Session 1: Three greetings` | `83e6936 Close session 1 of sessions` over `7b02d8d Session 1: Three greetings` |
| nothing left running | 0 router, engine, test, package or git processes naming the run after the editor closed | 0 |
| tool prompts a person answered | 0 beyond the trust prompt | 16, all Copilot's own per-tool dialogs |

A fuller path was walked on the previous candidate and is kept:
`copilot-final-2` and `copilot-final-3` each met a review round with a
blocking finding, and the rejection, the dispositions, the fix step and the
second round all travelled through chained answers to a VERIFIED close.

### Cancellation — `approved-claude-cancel`, `approved-copilot-cancel`

With the first step under way, the operator said in the AI's chat: stop, and
cancel this session with `dabbler session cancel 1 --reason "the operator
wants a different approach"`. Both engines ran exactly that, with no
`--force`.

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
| framework: Start to close | 271 s | 327 s |
| framework: author's cost | 29 model calls, 1,579,346 input and 7,949 output tokens | 29 model calls, **2.81 AI credits** |
| framework: reviewer's cost, through the seat | 4.87 AI credits (one conversation) | 8.27 AI credits (one conversation) |
| ratio, wall time | 4.7× | 7.1× |
| ratio, author's cost | output tokens 2.9×; input tokens 7.4× | 2.5× |

Both wall-time ratios pass three times the baseline, so they were looked
into, and they are explained by work the baseline does not do. Where the
seconds went, from each run's phase record:

| | Claude Code | Copilot CLI |
| --- | --- | --- |
| registration to the first instruction, and the plan | 79 s | 63 s |
| the steps, each with its own check (a build and a test run) | 81 s | 130 s |
| cross-provider verification | 30 s | 57 s |
| the run of record — a suite made 40 s long on purpose | 49 s, of which the walk's own kill cost 40 s | 49 s, of which the kill cost 12 s |
| land, package, close | 32 s | 28 s |

Taking out only what the walk added on purpose — the 40-second suite and the
kill — leaves about 190 s and 275 s, 3.3× and 6.0×. The rest is a plan, a
check per step, an independent review, the suite, a commit, a push, a package
and a close, none of which the direct run has. Copilot's steps are slower than
Claude's for a reason of its own: launched as Start launches it, it asks
before every tool, and the walk answers a dialog only when it next looks.
Claude's input tokens are 7.4× because a chained session is 29 turns where
the direct one is 5, and every turn re-reads the conversation from cache; its
output tokens, which are what it wrote, are 2.9×. The reviewer's credits have
no baseline: the direct run is not reviewed.

One thing in these numbers is a finding rather than an explanation, and it is
below: Claude Code learned that its command had died 40 s after it died.

## What the walk found

**Production defects — each rejected a candidate, was fixed with its test,
and both engines were walked again from clean profiles.**

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
   (`dc5ba037…`) was rejected for it, and the approved candidate carries it.

**A finding that is recorded, not fixed.** Claude Code is not told its
background command has died until everything that inherited the command's
output has exited too. The framework's jobs are separate processes that
inherit the chained command's output streams, so when the walk killed the
command during a 40-second suite, Claude learned of it when the suite ended —
40 s, three runs out of three — where Copilot learned at once. Nothing is
lost: the job finishes, the repeat collects it, and the session closes. But a
command killed under a twenty-minute suite would go unnoticed for twenty
minutes. The fix is small and is the router's — a job should not hold its
parent's streams — and it was not made here: no case failed for it, and the
soaks are where its cost in practice will show.

**What the harness got wrong, so nobody re-learns it.** Six runs were void,
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
`approved-copilot-main` and the first `copilot-cancel` — keys typed while
Copilot shows a permission dialog go to the dialog, so a question lost its
beginning, its Enter, or, once, the command in the middle of it; the walk now
pastes a question whole, in the quiet just after it answers a dialog, and
takes Copilot's own record as the word on whether it was heard. One
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

The targeted tests ran with each fix. Before this step was reported the
whole repository was run on the tree the approved candidate was built from:
the typecheck and lint controls, the container suite, the extension suite
and the host suite, all green; the framework ran them again as this
session's run of record.

## Where the evidence is

Outside the product tree, under `C:\temp\s219-installed\`: one folder per run
named above, each with its disposable repository, its bare remote, its VS
Code profile and `results` — `summary.json`, `walk.jsonl`, the engine's own
transcript, the AI terminal's text, the Dabbler Terminal's text before it
was closed, after it was reopened and at the end, screenshots, the run's
records, the ledger, the git log and the remote's refs. The approved
candidate is in `candidate`; the two rejected ones that were walked are in
`candidate-rejected`, named by their checksums. No environment and no
credential is in any of it.

## What this does not prove

One run of each case, on one machine, of a five-minute session: it is an
acceptance, and the four soaks are the test of endurance. A session that
stops for a person was not walked here; the stop's own words — *ask your AI
to run `dabbler session next`* — were seen only by accident. The release the
framework makes from this session is built by CI from the same commit, and
is not byte-for-byte the file walked here: the checksum above is the local
build's. One file of the package differs in content too, and only one: after
the walks the extension's changelog gained the "Fixed" entries that describe
what the walks found. No code, template or manifest changed after the
approved candidate was built.
