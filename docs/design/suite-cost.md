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

**A concurrency cap would not fix this.** `node --test` parallelises by
FILE, so the slowest file is the floor: `walk-session.test.ts` alone holds
about 118 seconds, and no worker count takes the suite below it.
`--test-concurrency=4` would make the box usable during the run — which is
worth something — but it would lengthen the run, not shorten it, and
`dabbler.yaml` records session 96's ruling against putting it back.

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
