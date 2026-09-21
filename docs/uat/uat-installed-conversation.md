# The installed conversation — session 219's acceptance report

Walked on 2026-09-20 on the operator's Windows 11 machine. One VSIX was built
from this session's tree, installed into a disposable VS Code profile, and
driven through a whole session by each interactive engine, with a person's
part played by Playwright and a saboteur's part played once per run.

**The walked candidate is `dabbler-ai-orchestration-3.16.0.vsix`, SHA-256
`b6548e32674ce0c6212d18fa4f78b62e9353a568141764b1361d57900095c2e4`**, kept at
`C:\temp\s219-installed\released\`. It was built from this session's final
tree — every change to the product, its build, its templates, its manifest
and its changelog was made first, the tree was frozen, the package was built
from an empty `dist`, and only then was it walked. Every result in "The
cases" below is from that one file, and the walk itself judged each run and
would have exited non-zero on any unmet case.

**What the operator soaks is the published package, and it is not designated
yet.** The plan says the published artifact is the sole artifact for the four
soaks, and this repository's release is tag-driven: CI checks the tag out,
builds the VSIX itself, and publishes that file. It cannot exist before this
session's verdict, so its checksum cannot be in this report. What stands
between the two is a gate, and it is a gate rather than a hope:

1. Once CI has published `vsix-v3.16.0`, fetch the file it published — the
   workflow run's own artifact, which is what its publish job uploads:
   `gh run download <run id> --repo darndestdabbler/dabbler-ai-orchestration --name vsix`.
2. Compare it, entry by entry, with the walked candidate:
   `node docs/design/messaging-poc/walk-vsix.cjs --compare <published.vsix> <walked.vsix>`.
   It exits non-zero and lists what differs unless both hold the same files
   with the same bytes.
3. Only on `"same": true` is the published package approved for the four
   soaks: record
   its SHA-256 and the comparison's result in `STATUS.md`, and soak it. On
   anything else no soak starts: the published package has not been walked,
   and the difference listed is the next session's work.

That comparison is expected to hold, and the expectation was tested rather
than assumed. The published 3.15.0, fetched the same way, has 67 entries; the
walked candidate has the same 67 names. A file this session did not touch,
the bundled `router-config.yaml`, is byte-identical in both — line endings
are pinned by `.gitattributes`, so a Windows build and CI's do not differ by
them. And two builds of this tree made minutes apart on this machine carry
different checksums and identical contents in every entry: a VSIX is a zip,
and a zip carries its own timestamps, which is the whole of the reason no
local file can share a checksum with the one CI publishes.

Five candidates were walked and this is the fifth. A first build was rejected
by its own contents before any walk; two walked candidates were rejected by a
case; a third passed every case and was set aside because the changelog it
packs was edited after it was walked; a fourth passed every case and was set
aside because it held five files CI's build would not. What rejected each is
in "What the walk found".

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
node docs/design/messaging-poc/walk-vsix.cjs --engine claude  --model sonnet       --vsix <vsix> --scratch <scratch> --run accepted-claude-main    --scenario main
node docs/design/messaging-poc/walk-vsix.cjs --engine copilot --model gpt-5.6-luna --vsix <vsix> --scratch <scratch> --run accepted-copilot-main   --scenario main
node docs/design/messaging-poc/walk-vsix.cjs --engine claude  --model sonnet       --vsix <vsix> --scratch <scratch> --run accepted-claude-cancel  --scenario cancel
node docs/design/messaging-poc/walk-vsix.cjs --engine copilot --model gpt-5.6-luna --vsix <vsix> --scratch <scratch> --run accepted-copilot-cancel --scenario cancel
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

| case | Claude Code — `accepted-claude-main` | Copilot CLI — `accepted-copilot-main` |
| --- | --- | --- |
| started, the real interactive AI visible | Start Session from the Work Explorer row, 04:00:13; the row's menu offers Start Session and Consult with AI, and no Resume | the same, 04:06:24 |
| a bounded three-step change approved and done | the AI planned four steps (the three, and a version bump); all four accepted, once each | three steps, accepted once each |
| one request, then chained answers | `session next` run 1 time; 6 `session report` commands, all 6 with `--next`, all 6 started in the background; `session wait` 0; `--mailbox` 0; sleeps or polls 0; reads of the framework's records 0 | 1; 5 of 5 chained and in the background; 0; 0; 0; 0 |
| every instruction after the first came from the answer before it | plan, 4 steps and `done`: each printed by the chained answer to the one before | plan, 3 steps and `done`, the same |
| a question while the author worked | heard in phase `work`, 04:02:04; *"I'm on step 2 of 4, `shout`: the greeter is done, and I'm adding its tests … before reporting."* | heard in phase `work`, 04:07:58; *"I'm on step `implement-shout`, adding `shout(name)` and its tests while also applying the required leading comment…"* — the comment being the course correction it had just been sent |
| a question while a background exchange waited on a long job | heard during verification, 04:03:33; *"Yes, the `bump-version` report command is still running, since no completion notice has arrived; when it exits, what it prints is my next instruction…"* | heard during verification, 04:10:12; *"Yes, it is still running; when it exits, its output will provide the framework's next instruction, and I'm leaving it running."* |
| nothing injected as a fake human message | the two questions are the only human turns in the engine's transcript after the opening sentence | the same |
| interrupted once with a course correction | `session interrupt --reason`, asking for a one-line comment at the top of the greeter in the next step, while step 1 was worked; the next instruction, step 2, carried it first among its reasons as `sent: …`; no Resume | the same |
| the Dabbler Terminal shows phase and progress, and survives being closed | closed while `run of record: node` ran and reopened as the land began; the AI's tab untouched; the reopened terminal rebuilt the session banner, a phase line and who was waited on | closed and reopened during verification; rebuilt the same |
| every framework line one way | 122 lines read from the reopened terminal and at the end; 0 begin `dabbler [` | 136 lines; 0 |
| one chained exchange killed after its answer was durable, and repeated | killed 04:03:52 while `run of record: node` ran, all four steps already accepted; the AI ran the identical command again 42 s later, as the suite ended | killed 04:11:13; the identical command again 12 s later |
| exactly once | 4 steps once each; 1 review round, 1 reviewer conversation on the seat; one each of the verification, run-of-record, publish and close jobs; 1 package (`published`, tag `session-001`); 1 land commit; the remote's `master` is the checkout's `HEAD` | 3 steps once each; the rest the same |
| git, at the end | `dd1e466 Close session 1 of sessions` over `07e6385 Session 1: Three greetings` | `16cbb46 Close session 1 of sessions` over `88be8ce Session 1: Three greetings` |
| the package | 67 entries; none is a record, a transcript, a run ledger, a scratch or test repository, or a key | the same file |
| nothing left running | 0 router, engine, test, package or git processes naming the run after the editor closed — by a listing that ran, and that found the walk's own process first | 0, the same |
| tool prompts a person answered | 0 beyond the trust prompt | 19, all Copilot's own per-tool dialogs |
A fuller path was walked on an earlier candidate and is kept:
`copilot-final-2` and `copilot-final-3` each met a review round with a
blocking finding, and the rejection, the dispositions, the fix step and the
second round all travelled through chained answers to a VERIFIED close.

### Cancellation — `accepted-claude-cancel`, `accepted-copilot-cancel`

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
| processes left, by a listing that ran and found the walk first | 0 | 0 |

## Time and cost, beside a direct implementation

The `direct` runs gave the same engine the same three-step change in one
prompt, with no framework, and stopped the clock when the build and tests
passed. This is a measurement, not a gate.

| | Claude Code | Copilot CLI |
| --- | --- | --- |
| direct: wall time | 58 s | 46 s |
| direct: cost | 5 model calls, 212,533 input and 2,720 output tokens | 5 model calls, **1.13 AI credits** |
| framework: Start to close | 288 s | 362 s |
| framework: author's cost | 29 model calls, 1,592,460 input and 8,415 output tokens | 30 model calls, **2.83 AI credits** |
| framework: reviewer's cost, through the seat | 4.38 AI credits (one conversation) | 9.21 AI credits (one conversation) |
| ratio, wall time | 5.0× | 7.9× |
| ratio, author's cost | output tokens 3.1×; input tokens 7.5× | 2.5× |
Both wall-time ratios pass three times the baseline, so they were looked
into, and they are explained by work the baseline does not do. Where the
seconds went, from each run's phase record:

| | Claude Code | Copilot CLI |
| --- | --- | --- |
| registration to the first instruction, and the plan | 86 s | 67 s |
| the steps, each with its own check (a build and a test run) | 90 s, four steps | 143 s, three steps |
| cross-provider verification | 30 s | 73 s |
| the run of record — a suite made 40 s long on purpose | 49 s, of which the walk's own kill cost 42 s | 51 s, of which the kill cost 12 s |
| land, package, close | 33 s | 28 s |

Taking out only what the walk added on purpose — the 40-second suite and the
kill — leaves about 206 s and 310 s, 3.6× and 6.7×. The rest is a plan, a
check per step, an independent review, the suite, a commit, a push, a package
and a close, none of which the direct run has. Copilot's steps take longer
than Claude's for a reason of its own: launched as Start launches it, it asks
before every tool — 19 dialogs in this run — and the walk answers one only
when it next looks. Claude's input tokens are 7.5× because a chained session
is 29 turns where the direct one is 5, and every turn re-reads the
conversation from cache; its output tokens, which are what it wrote, are
3.1×, and it chose to plan a fourth step. The reviewer's credits have no
baseline: the direct run is not reviewed. These numbers move from run to run
— the same case on the same candidate took 257 s and 312 s an hour earlier —
and what they measure is an order of magnitude, not a budget.
One thing in these numbers is a finding rather than an explanation, and it is
below: how long Claude Code takes to learn that its command has died.
## What the walk found

**What rejected a candidate, or a set of runs.** Items 1, 2, 3 and 6 are
defects in the product and its build: each was fixed, with its test where it
has one, and both engines were walked again from clean profiles. Items 4, 5
and 7 are defects in how this acceptance was run, found by the session's own
reviewer, and each cost a candidate or a full set of walks too.

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
   change, freeze, build, walk.
5. **The walk could pass for evidence without being any.** It recorded each
   outcome and exited 0 whatever it was: a run that hit its deadline left the
   same files as one that closed. The same reviewer caught that too. The walk
   now judges its own run case by case and exits non-zero unless every case
   holds, and the first time it ran that way it failed a run that deserved it
   (`final-copilot-cancel-attempt1-not-heard`, below).
6. **A candidate that passed was not what CI builds.** The fourth walked
   candidate (`6d8178ff…`) passed every case, and the reviewer held that a
   local file is still not the published one. Fetching what CI had actually
   published for 3.15.0 settled it: 67 entries, where the candidate had 72. The
   five extra were four schemas of features since removed and a lock file a
   router run on this machine had left beside its bundle — the same disease as
   the first finding, which had been treated one file at a time. Nothing in the
   build ever emptied `dist`, so a checkout packed whatever had accumulated
   there and CI, which starts from nothing, never did. The build now empties
   its output first, the candidate has CI's 67 names exactly, and the ignore
   list's exclusion is a second fence now rather than the only one.
7. **"Nothing left running" could pass with nothing looked at.** The process
   listing behind that case swallowed a failed or unparsable query and answered
   with an empty list. The reviewer caught it after the walk had been made to
   fail closed everywhere else. A listing that did not run, or did not answer a
   listing, now fails the case, and the listing has to find the walk's own
   process before it may say nothing else is left;
   `node docs/design/messaging-poc/walk-vsix.cjs --self-test-processes` shows
   all three. The product was untouched, so the candidate stood — and all four
   cases were walked again on it, because the four before had been judged by
   the listing that could not be trusted (`released-*`, kept).

**A finding that is recorded, not fixed.** Claude Code is not told its
background command has died until everything that inherited the command's
output has exited too. The framework's jobs are separate processes that
inherit the chained command's output streams, so when the walk killed the
command during the 40-second suite, Claude repeated it only once the suite
had ended — 40 s after the kill in three runs where the kill came early in
the suite, 12 s where it came late, 42 s in the last accepted run, and in every one
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
accepted runs show no polls and no reads of the framework's records at all.

## The suites

The targeted tests ran with each fix. The whole repository was then run on
the frozen tree the walked candidate was built from — the typecheck and
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
candidate is in `released`; the published 3.15.0 it was measured against is in
`ci-3.15.0`; the fourth walked candidate and the second build it was compared
with are in `final`, and the three before it are in `candidate-rejected`,
named by their checksums. No environment and no
credential is in any of it.

## What this does not prove

One run of each case, on one machine, of a five-minute session: it is an
acceptance, and the four soaks are the test of endurance. A session that
stops for a person was not walked here; the stop's own words — *ask your AI
to run `dabbler session next`* — were seen only by accident. And the package
the Marketplace serves is CI's build of this commit, which nobody can walk
before it exists: what ties it to the file walked here is the comparison of
their contents described at the top. Until that comparison has been run and
has said the two are the same, this report designates nothing for the soaks.
