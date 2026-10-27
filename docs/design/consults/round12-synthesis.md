# Design consult, round 12 — synthesis and recommendation: the wall as a refusal, no hook in it, and the basics first

**Recommended 2026-09-08 by the orchestrator, for the operator's
confirmation**, after `round12-brief.md` was answered by Sol (`gpt-5.6-sol`,
`round12-sol.md`: 3,989 tokens in, 13,257 out, 255 s) and Gemini
(`gemini-3.1-pro-preview`, `round12-gemini.md`: 4,199 in, 1,519 out, 48 s).
The brief was written while session 125 ran; the operator's words in it
were said that morning, watching it run. Both advisors converged on every
question but one, and on that one the tree was read and a fact settled it.

> **Decided instead, the same afternoon.** The operator read this synthesis
> and set the frame that decided it: the wall exists to keep a session's work
> and tokens on its own module, it does not have to be foolproof, stability
> and developer experience come first, and the experience to match is a
> repository per module with one for the integration. Under that frame the
> **folder per module** that sessions 100–120 built is kept — it is a module
> repository made from one history — and simplified: every session is
> **focused** (the module's own folder and window) or **global** (the
> repository itself, no wall), the plan says which under each session's
> heading, three start commands choose, the framework pulls the repository
> forward at the close, the existing grant is the override and one line in
> `sharedFiles` makes it permanent, and there are **no hooks** at all — the
> Stop hook goes too. The report-time refusal, the in-place narrowing this
> synthesis first proposed, the driver-keyed Stop hook and the clone's
> deletion are not built. A deliberately tiny proof of the folder-per-module
> day runs first. The plan is sessions 126–127 in
> `docs/sessions/session-plan.md`; what the advisors said stands below as
> the record.

## The operator's words, which this round answers

> I am mainly concerned about making the code reliable and simple. I think
> that if the first thing that AI does is call a framework command that
> returns the list of permissions for the current session, then I think
> that would be sufficient (in combination with built-in permissions for
> the AI models). If this means that we no longer need hooks that might
> not be reliable anyway, that's fine. As soon as I saw the word "canary"
> — I immediately saw this as overengineering.

> Stability and developer experience is the primary consideration here.
> Allow decomposition into modules in the same repo with session-specific
> permissions as lightly enforced contracts whose main purpose is to
> encourage AI to respect blackboxing. My machine is strongly impacted by
> the testing. This doesn't seem to have been fixed very well.

> But honestly, I just want it to work.

## The design on one slide

1. **The scope is handed over first.** The first `step` of a module session
   carries the allowed list; `dabbler session scope` prints it again.
   Session 125 built this.
2. **One enforcement point: the report.** `judge()` in
   `packages/router/src/drive.ts` (~2090) already diffs the tree against the
   last accepted step before it judges a report. For a session that has a
   policy — a multi-module shape — a diff that touches a sibling's
   `codeRoots` or a protected path refuses the report, in one rejection
   that lists every such path with the module that owns it and the contract
   folder to read instead. It counts as one of the three refusals. Nothing
   is asked of a one-module solution: no policy, no check.
3. **The close keeps its backstop.** `judgeExposure` (`land.ts` 231–249)
   keeps the changed-path clause and loses the sibling-bytes clause, which
   is meaningless in a regular checkout.
4. **Reads are told, not enforced.** The instruction says what to read and
   why the contract is the thing to read. The verifier's existing
   out-of-scope flag in `rounds.jsonl` is the whole of the record. No
   transcript scan, no count, no coverage word.
5. **Nothing runs inside a tool call.** No pre-hook, no canary, no
   self-grant verb, no vendor permission writers, no destructive-command
   list, no shell scripts in two shells. The decision function and the
   hard/soft classes in `policy.ts` go; `ModulePolicy` keeps `allowed`,
   `protected` and `siblings`, which are what item 2 reads.
6. **The Stop hook stays, keyed to its driver.** The one place this
   synthesis differs from both advisors — see below.
7. **The basics come first.** The Work Explorer that had to be refreshed by
   hand, the Dabbler terminal that printed nothing for the step, and the
   suite that takes the machine are fixed before any wall work.

## What both advisors converged on — adopted

- **The report is the wall.** Sol: "the only active framework-owned
  module-write enforcement point"; Gemini: "the only enforcement point the
  framework needs". Both keep the close's changed-path clause as backstop.
- **Drop the vendor permission writers.** Both, independently and firmly:
  Copilot's `write(path)` semantics and file-vs-argv placement are
  unmeasured, Claude Code's deny under `--dangerously-skip-permissions` is
  unmeasured, and a checkout-wide `settings.local.json` recreates the
  repository-scoped interference the Stop hook just demonstrated. Sol adds
  that Copilot's `--deny-tool` on argv would be worth adding later *only*
  if a directory probe passes; neither builds it now.
- **Reads: told, not enforced, and drop read blackboxing from the first
  release.** Both cite the package seam — `PackageReference`, never
  `ProjectReference` — as the thing that already makes coupling impossible.
- **Nothing from rounds 10–11 that this drops was buying something a
  customer would notice in three months** (Sol, with one exception he
  names: a pre-hook would have stopped an accidental sibling edit before
  it happened rather than at the report; he still drops it).
- **Fix the two visible defects before any wall work** — Gemini: "a tool
  that does not visibly report its state fails Priority 2".
- **Delete the clone whole**, Start Session at the repository root.
- **Cancel session 129.** The refusal lives in the framework and is
  engine-agnostic; there is nothing to measure per CLI.

## Where they differed, and the call

- **Which paths the refusal reads.** Sol: the union of `--files` and the
  tree diff. Gemini: the tree diff only, because `--files` is what the
  engine chose to say. **The diff decides.** `judgeReportFiles` already
  refuses a report whose `--files` disagrees with the diff, so the union
  adds nothing the report cannot already fail on.
- **Two sessions or three.** Gemini: two. Sol: three, because two would
  put the visible defects, the report gate, the deletions, the extension
  changes and the walk into one pair of sessions and "recreate the
  reliability problem the operator is prioritising". **Three**, with the
  machine-load fix added to the first — it is the third basic the operator
  named and it fits beside the other two.
- **Open Module.** Gemini: keep and re-point at the root. Sol: drop.
  **Drop**: Start Session with a module pick at the root is the same
  button with a truer name, and a second one is a second thing to explain.
- **The Stop hook.** Both: remove it (Sol's option c; Gemini: "attempting
  to fix it introduces process-ID tracking which is flaky"). Both marked
  as an ASSUMPTION that the framework cannot learn the driver's session id
  without a `sessionStart` hook. **It can, and the tree says so:** every
  tool call a Claude Code chat makes runs with `CLAUDE_CODE_SESSION_ID` in
  its environment (measured in this repository, 2026-09-08, from the chat
  writing this: the value matched the chat's own transcript id), so
  `session start` — which the driver runs from exactly such a tool call —
  can record it on the run record, and `hook-stop`, which receives
  `session_id` on its stdin from the CLI, can stay quiet for any other
  session. Honouring `stop_hook_active` on the same read ends the loop
  the observer chat sat in this morning. That is a recorded string and a
  comparison, not process tracking. What the hook protects is real: a
  chat that ends its turn with a step or a due wait outstanding is the
  three-hour idle of session 91, which is why the gate exists. **Keep
  it, keyed to its driver.** A run with no recorded id — a Copilot seat, a
  start typed outside a chat — keeps today's behaviour.

## What was verified against the tree, where the advisors could only assume

- **The report judge has the diff.** `judge()` calls `changedPathsBetween`
  against `run.baseline_tree` before it judges `--files`; the scope check
  is a few lines after it, not a new mechanism.
- **The terminal never prints the step.** `dabblerTerminal.ts` prints the
  phase when it changes (~1124), the stop and the resume (~1187–1202), job
  starts and collections, verify and test rows, and the silence watcher
  keyed to `seq` (~1247). An instruction being issued is watched, not
  said. The fix is one `line("step", …)` when `run.seq` moves and the
  instruction is a `step` or a `rejection`.
- **The Work Explorer watches the right file.** `extension.ts` ~176 binds a
  watcher to `*/driver/run.json` and calls `treeProvider.refresh()` on
  every event; the last step's issue rewrote that file at 09:07:11 and the
  operator still had to refresh by hand. So the defect is downstream of
  the watcher — a cache keyed without something that moved, a throttled
  refresh, or a watcher event the atomic rename does not raise on Windows
  — and session 126 must reproduce it before fixing it, which session 110
  did not do the first time.
- **The suite runs one worker per core with no cap.** `dabbler.yaml` ~100
  runs `node --test` with the priority preload and no `--test-concurrency`;
  the operator's machine has 20 cores, so a full run is 19 Node workers,
  eight of them building git repositories, at below-normal priority.
  Priority yields the CPU; it does not yield memory, disk or the fans, and
  the operator says the machine is still taken. The run of record today
  took 179 s, and a session runs the suite at least twice (each
  verification round's own run, then the run of record) plus once per
  fix. `--test-concurrency=4` is D246's number and was removed in session
  96 when the seam made the suite 17 s; it is 157–179 s now. The cap
  returns; `check-suite-cost.ts` audits its presence; the wall clock at 4
  is measured and written into `docs/design/suite-cost.md` beside the
  numbers already there.
- **Session 125's run of record failed once**, on the preload's own rule:
  the new `policy.test.ts` reached `loadConfig`, which spawned git outside
  a walkthrough. The driver fixed it in a `fix-run-of-record` step. That
  is a test-infrastructure trap, not a product flake, and it is the
  second time this session's records show the suite's own protections
  costing a session time.

## The sessions

| session | title | steps |
| --- | --- | --- |
| 126 | It just works — the step you can see, the terminal that says it, the suite that leaves the machine alone | repaint on an issued step, reproduced then fixed · the step line in the terminal · `--test-concurrency=4` back, audited, measured |
| 127 | The wall as a refusal — the report that names the owner, and the Stop hook that knows its driver | the scope refusal in `judge()`, `policy.ts` trimmed, the sibling-bytes clause gone · the Stop hook keyed to the driver's recorded session id, `stop_hook_active` honoured · the wall said in one sentence on the first instruction and in the managed body |
| 128 | The clone deleted, Start Session at the root, and the Copilot day | the deletions · Start Session's module pick, opening at the repository root · the two-module .NET walk on the seat, one deliberate sibling edit to see the refusal |
| 129 | cancelled — folded into 127 | |
| 130 | unchanged: the UAT walk in three registers, after 128 | |

Nine tests across the three, one per behaviour. Nothing is releasable
until 128 has walked.

## What the framework claims, and never claims

It claims: a module session cannot *land* a change outside its scope, and
is told so at the first report that tries. It claims the engine was told
what to read. It never claims a sibling's implementation was not read,
never claims isolation, and never prints a coverage word, because it
observes nothing that would justify one.

## Which rules decided it

(1) Never an impasse: a refused report is the ordinary rejection loop, one
move to revert, and a plan that genuinely needs a sibling changed is a
wrong plan stopped early rather than a permission widened. (2) Never a
burden: no decision reaches a person; the developer sees a step line and
a refusal reason. (3) Simple: one check in a function that already had the
diff, one recorded id in a hook that already existed, and eleven things
dropped. (4) Blackboxing within those: the contract is what the engine is
handed, and the sibling's source is what it cannot land a change to.
