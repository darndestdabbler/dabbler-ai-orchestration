# What the suite costs, and what is not known about it

Written in session 122, from the framework's own records.

The router's suite ran in 17 seconds at session 96 and 157 seconds at
session 121 — nine times the wall clock for seven more tests, 1137 against
1144. The operator could not use their
machine during the second one. This note says where that time goes, which
two protections had lapsed by then, and — the part that matters most — what
is still unexplained, so that the next person to look starts from the
measurement rather than from a fresh guess.

## The measurement

Read from `recorded typescript [final-full]` in each session's
`.dabbler/runs/s<N>/driver/jobs/run-of-record-typescript.log`. The framework
records this for itself, every session, which is why the history is clean
enough to be worth trusting.

| session | wall | tests | note |
|---|---|---|---|
| 92 | 33 s | 1119 | the `node --test` rebuild settles |
| 95 | 37 s | 1139 | |
| **96** | **17 s** | 1137 | the git seam lands; `--test-concurrency` comes off |
| 97 | 35 s | 1148 | |
| 98 | 40 s | 1156 | |
| **99** | **102 s** | 1165 | **2.5× in one session, unexplained** |
| 100 | 107 s | 1076 | the six-step workflow is deleted; the count drops, the time does not |
| 110 | 143 s | 1119 | |
| 120 | 142 s | 1144 | |
| **121** | **157 s** | 1144 | 7 more tests than session 96, 9× the wall clock |
| 125 | 176 s | 1147 | uncapped |
| **126** | **176 s** | 1147 | **`--test-concurrency=4` back (D246)**: the same wall clock as uncapped, measured once by hand as `dabbler.yaml` runs it, before the run of record |
| 136 | 228 s | 1165 | run by hand as `dabbler.yaml` declares it, WITH the sampler below attached. The sampler runs alongside the suite rather than in front of it, so its 40 s of CIM queries is time spent competing for the box and NOT a number to subtract; this row measures a sampled run and nothing else |
| **136** | **216 s → 190 s** | 1166 | **the controlled pair**, both uninstrumented, same tree, same host, minutes apart: 215.6 s with `walk-session` spawning a CLI child per job and 189.9 s with it calling them in process. That is the comparison the change is judged by. Both are well above session 126's 176 s on the same host, which this session did not cause and has not explained |

## Where the time actually goes

From session 121's log, summing each file's top-level suites:

| file | cost |
|---|---|
| `walk-session.test.ts` | ~118 s |
| `walk-impact.test.ts` | ~70 s |
| `walk-verify.test.ts` | ~63 s |
| `walk-git-states.test.ts` | ~56 s |
| `walk-record.test.ts` | ~47 s |
| `walk-checkout.test.ts` | ~28 s |
| `walk-bootstrap.test.ts` | ~24 s |
| `walk-jobs.test.ts` | ~10 s |
| **the eight walkthroughs** | **~416 s** |
| everything else — some 330 files | ~30 s |

Two things follow from that table, and both are easy to get wrong.

**A concurrency cap does not shorten this, and is not for that.** `node
--test` parallelises by FILE, so the slowest file is the floor:
`walk-session.test.ts` alone holds about 118 seconds, and no worker count
takes the suite below it. What the cap does is keep the operator's machine
usable while the run of record runs: without one the runner takes a worker
per CPU — nineteen on the operator's host — and every walkthrough boots
full CLI children under each of them, which is the saturation session 125's
operator sat through twice. The git seam (session 96) made each storm
smaller; it did not make the storms fewer, and the two are different
protections. `--test-concurrency=4` (D246) is back in `dabbler.yaml` from
session 126, measured in the table above: 176 s at four workers against
176 s uncapped the session before, because the floor is the slowest file
and four workers still keep the eight walkthroughs ahead of it. The box is
the operator's during the run and the run is no longer. The number becomes
8 if a session measures more than twice the uncapped wall clock; nothing
audits the flag, because a flag in a command line cannot lapse silently
the way a comment's count did.

**The walkthroughs are expensive for a reason that is not git.** They build
real repositories, which is the visible cost, but they also drive the
framework's own job runner — and `selfArgv` in `packages/router/src/jobs.ts`
spawns a *detached full-CLI child process per job*, running the sources
through `run-ts.mjs`. Each of those is a fresh Node boot loading the whole
CLI module graph. Nineteen workers doing that at once is what saturates the
host.

**So the deeper fix, which nobody has done, is a seam for the job spawn** —
the same move session 96 made one layer down, where `journal.setGitSource`
deleted about 46 files' worth of git spawns instead of throttling them. A
walkthrough that runs its jobs in-process would delete the spawns rather
than schedule them. That is a session's work and is not this one.

## What the machine looks like during a run

Measured in session 136, 2026-09-09, on the operator's 20-thread host, with
`packages/router/scripts/measure-suite-load.mjs`: it runs a command and every
three seconds records the CPU busy percentage, the physical disk queue
length, free memory, the process count, and the tree beneath the command with
**every process's OS priority class**. The samples are JSON lines under
`.dabbler/scratch/suite-load/`, which is untracked — the raw record is
evidence for one investigation and what it says belongs here.

Both halves of the run of record were measured, each run by hand exactly as
`dabbler.yaml` declares it.

| | typescript | extension |
|---|---|---|
| wall, sampled | 228.3 s (1165 tests) | 11.4 s |
| CPU busy | 29.1% mean, 48.7% peak | 20% mean |
| disk queue | 0.1 mean, 1 peak | 0 |
| free memory | never below 28.4 GB of 63.8 | unchanged |
| processes observed beneath it | 363 | 4 |
| the runner's own priority | **normal, in all 61 samples** | **normal, whole tree** |

**Nothing is saturated, and that is the finding.** A third of the CPU, a disk
queue that is almost always zero and 28 GB free is not a machine that should
be unusable, and the operator was crippled through session 135's run of
record all the same. What the run does instead is CREATE PROCESSES: 363
distinct ones were SEEN beneath it — 146 `git`, 124 `conhost`, 66 node
workers and CLI children, 17 `sh` running a `pre-commit` hook, 8
`git-receive-pack`, 3 `cmd` — across 61 snapshots in 228 seconds. It is a
floor and not a count: a snapshot every three seconds cannot see a `git`
that started and exited between two of them, so the real churn is higher
than 1.6 a second. That is the load the note above names, measured.

**The courtesy stops at the test worker.** `test/support/no-git.ts` calls
`setPriority` in each worker and a Windows child inherits its parent's class,
so the git and CLI children beneath a worker are below normal — 361 of the
363 were seen there. Two things are not:

- **The runner.** `node --test`, the parent of every worker, was at normal
  priority in all 61 samples. It is the process that schedules the workers
  and parses their output for four minutes.
- **The extension suite, whole.** Mocha loads no preload, so its tree — the
  runner, its node children and a `git` child — is at normal from end to end.
  It is only 11 seconds, which is why it has never been the complaint, but it
  is the exception nobody declared.

A worker is also at normal for the moment between its spawn and the preload's
call: 10 of the 363 processes were only ever caught there and 2 were seen at
both classes, which is about 4% of worker observations and is consistent with
a node boot.

Where the time goes has not moved since session 121, remeasured in the same
run: `walk-session` 128.5 s, `walk-impact` 79.6, `walk-verify` 75.6,
`walk-bootstrap` 56.3, `walk-git-states` 54.9, `walk-checkout` 48.6,
`walk-record` 46.8, `walk-jobs` 11.2 — 501 s of the 530 s of suite work the
run holds, against 28 s for the other 320-odd files.

### What session 136 did about it

**The courtesy moved to the job.** `jobs.jobPriority` decides the class —
below normal, and nothing at all under CI, which is the worker preload's rule
and its reason — and the runner applies it to itself before it spawns the
command, so the command and everything it forks inherit it. That is the whole
of the run of record: both suites are spawned beneath a driver job, and the
extension's mocha stops being the exception nobody declared. The proof is a
spawned child's reported class in `test/walk-jobs.test.ts`, taken from a
parent that has been stood back up at normal — a test that only inherited the
worker's own class would have passed against a job that did nothing.

**The jobs `walk-session` spawned became function calls.**
`jobs.setJobStarter` is the seam, in the shape of `journal.setGitSource`, and
`test/support/inProcessJobs.ts` runs the verb the driver asked for with the
same log, the same status file and the same moment each appears — so the
driver still starts a job, issues a `wait` and collects an exit code, and the
walk still proves the order it was written to prove. `walk-jobs` keeps the
real spawn, and says so at the top of the file: it is the one that is ABOUT
the boundary.

What that is worth, measured both ways on this host, minutes apart and with
no sampler attached:

| | child per job | in process |
|---|---|---|
| `walk-session` alone | 105.9 s | 80.2 s |
| the whole typescript suite | 215.6 s | 189.9 s |

The suite is 26 s faster and about 60 processes lighter, which is the same
25 s the file saves on its own: the walkthroughs are the floor, so what comes
off the slowest file comes off the run. **The plan asked for a green run that
was also slower to be visible if it happened, and this is the pair that would
have shown it.**

Neither of those is a third protection of the shape the last three sessions
reached for. The first is the same protection applied where the measurement
says it belongs; the second deletes load instead of scheduling it.

## The two protections that had lapsed

Both had the same shape: a protection with no auditor, so its lapse was
invisible until somebody measured. `packages/router/scripts/check-suite-cost.ts`
is the auditor now, and it runs in the lint control every session.

**One — the worker priority, deleted as collateral.** Session 76 put every
test worker at below-normal OS priority so its `git` and `node`
grandchildren inherited it; session 67 had recorded the trade in so many
words, taking a third more wall clock to buy "a machine the operator can
still type on". It lived in a vitest setup file. Session 88 retired vitest
and deleted `vitest.config.ts`, and nothing carried the policy into the
`node --test` rebuild. `setPriority` appeared nowhere under
`packages/router/` for twenty-five sessions. It lives in
`test/support/no-git.ts` now, which is the one file every worker loads.

**Two — the walkthrough exemption, widening on its own.** Session 96's guard
refuses a git spawn outside a walkthrough, and that constraint is what
allowed the concurrency cap to come off. But it recognised a walkthrough by
the filename pattern `walk-*.test.ts` — a naming convention, not a budget.
There were six such files when the guard was written; `walk-checkout`
arrived 2026-09-06 and `walk-impact` 2026-09-07, each inheriting the licence
to spawn git and a CLI child per job by virtue of being named correctly.
`no-git.ts` names the permitted files one by one now.

## What is NOT explained

**And a second one, from session 136's own control: 176 s at session 126
against 215.6 s for the unchanged shape today**, same host, same command,
ten sessions apart and 19 tests heavier. It is recorded here rather than
attributed, for the reason the section below gives: the sessions between
them changed a great deal and none of it has been measured against this.

**The jump from 40 s at session 98 to 102 s at session 99.** Every
walkthrough suite roughly doubled across that boundary — 20.8→33.1,
14.0→32.0, 17.6→27.1, 12.6→19.4, 9.0→11.9, 7.2→11.7 — which is the profile
of a per-operation cost rising underneath all of them, not of a test being
added. Session 99 added nine tests.

Session 99's diff was read looking for it, and **it is not there**:

- The atomic write's rename retry (`journal.ts`, `renameOnceMore`) pauses
  100 ms only on an `EPERM`/`EBUSY` failure, not on the succeeding path.
- `suiteRetrySeconds` (`drive.ts`) *lowered* a wait, from a flat 60 s to as
  little as 10 s — and in any case the walkthroughs never sleep it: they
  poll their own loop at a fixed 100 ms.
- The remaining changes are a selector predicate, a packaging detector, help
  text and prose.

**Do not write a cause into this document without evidence for it.** The
control fails if this section stops saying the jump is unexplained, which is
deliberate: a later session that finds the answer should record it and
remove that check in the same change, and one that merely wants the document
to read as finished should not be able to. A plausible-sounding cause here
would cost the next investigator the measurement above.

### Ruled out

- **Windows Defender.** Real-time protection is off on the operator's host,
  so on-access scanning of the thousands of small files a walkthrough
  creates is not the variable. (A Defender-*on* preflight is still owed
  separately — it is a real question, just not this answer.)
- **Accumulated test temp directories.** `dabbler-router-tests` held 756
  leftover directories when this was written, totalling 2 MB across 3386
  files. Untidy; not a cost.

### Not yet measured

- Whether the doubling is in process startup, in git, or in the disk. Timing
  a single walkthrough on a session-98 checkout against a session-99 one
  would settle which, and nobody has run it.
- What the suite costs on a machine that is not this 20-thread host. Every
  number here is from one box.
