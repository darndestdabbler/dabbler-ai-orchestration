# The job tree-kill, and the flake that refused a release

`walk-jobs`'s **"ends a running job and everything under it, from a process
that never held it"** fails intermittently under load. It has fired twice
that we know of, and both firings cost something:

- **On a GitHub runner, on session 146's commit.** The `Test` check went
  red, and because the Marketplace publish requires a green `Test` for the
  tagged commit, the `vsix-v2.1.0` publish job refused. The tag stands on
  origin unpublished to this day; 2.1.1 superseded it.
- **Once in four full-suite runs on the operator's machine**, at the end of
  session 148. That session diagnosed it as "test-side timing, not product
  code", fixed a different flake, and left this one with no written record —
  which is what this page exists to end.

The failure is always the same sentence, from `waitGone` in
`packages/router/test/walk-jobs.test.ts`:

> `<pid> outlived the job that was ended`

## What the test asserts, and how it decides

`endJob` is given a job record and no handle — a job is started by one
router process and collected by another, so a pid is all the ending process
has. On Windows `terminateTree` spawns `taskkill /F /T /PID <pid>`, which
walks the tree: the runner, the command it ran, and the grandchild that
command forked. The test then waits for the grandchild to disappear, and it
decides "disappeared" by polling `process.kill(pid, 0)`.

## The measurement

Two candidates, and the evidence separates them.

**Candidate one, the product side: a tree-kill that fails silently.**
`terminateTree` reads neither the `spawnSync` result nor its error, so a
`taskkill` that could not be started and one that ran and failed are both
indistinguishable from a tree that was ended — and a process-creation storm
is exactly the condition that makes a spawn fail. Session 136 established
that this suite's cost *is* process creation, so the theory fits the
circumstances.

It does not fit the measurements. Fourteen kills of the real job shape were
observed with the result kept, under a load of twenty-four lanes spawning
short-lived processes continuously (1,491 processes in 100 seconds):

| | idle | under load |
| --- | --- | --- |
| taskkill wall time, median | 578 ms | 2,231 ms |
| non-zero exit status | 0 of 4 | 0 of 10 |
| spawn errors | 0 of 4 | 0 of 10 |
| grandchild survived the kill | 0 of 4 | 0 of 10 |

The load stretched the kill fourfold and it still returned `SUCCESS: The
process with PID … (child process of PID …) has been terminated` every
time, with the grandchild gone before `taskkill` returned. **A tree-kill
that silently did nothing would leave a real tree behind**, and no run —
loaded or idle — left one. On this evidence the product-side candidate is
ruled out as the cause of this flake.

**Candidate two, the test side: the pid is not an identity.** Windows
recycles process ids, and it recycles them fast when the machine is busy
making processes. Measured under the same load: **14 of 150 freed pids
(9.3%) read as alive again within forty seconds**, held by entirely
unrelated processes — `node.exe`, `conhost.exe`, `sleep.exe`. A pid that
has been recycled reads as alive through `process.kill(pid, 0)` forever,
because the question that call answers is "is there a process with this
number", not "is the process I meant still running".

That is the whole failure. `waitGone` polls the grandchild's number; if
anything on the machine takes that number between the grandchild's death
and the poll, the wait can never succeed, and ten seconds later the test
says the job outlived the thing that ended it. **The tree was killed
correctly and the test cannot tell.**

## What this rules out about the fix

**The bound is not the fault, and raising it would have helped nothing.**
`waitGone` is given ten seconds where the two waits beside it in the same
file are given twenty, and the asymmetry looks like the answer until the
numbers are read: the case takes 803 ms idle and the kill inside it 2.2
seconds under fourfold load, so the bound has four to twelve times the
headroom it needs. And a recycled pid never stops reading as alive, so a
longer deadline buys nothing but a longer wait for the same red. Had the
bound been twenty seconds on 2026-09-10, the `vsix-v2.1.0` publish would
have refused just the same, ten seconds later.

**The product already refuses to trust this identity, in writing.** `endJob`
in `packages/router/src/jobs.ts` opens with the reason it checks the runner
is alive before killing anything:

> Only a runner that is still there: the OS reuses pids, and a job whose
> runner has already exited names a number that may be somebody else's.

and `pollJob` reads the status file *before* it reads the pid, for the same
reason. The test asserts on the one identity the code beside it documents as
untrustworthy.

## The bound of this evidence

**The flake did not reproduce.** Eighteen consecutive runs of the real test
file under the load above produced eighteen passes. What is measured here is
the *mechanism* — that the kill does not fail, and that a freed pid reads as
alive again at nearly one in ten under load — not the failure itself. A
rarer coincidence than the load generator reproduces is consistent with a
fault that has surfaced twice in a hundred-odd suite runs.

That bound is why the next step does not "fix the timing". It removes the
test's dependence on a number the operating system is entitled to reuse, so
that whichever coincidence produced the two known firings, the assertion
stops being able to see it.

## What the next step changes

`walk-jobs` stops identifying a process by its pid. The behaviour under
assertion is unchanged and is the one that matters — a fork the job started
is taken down with the job — and it is proved by something the OS cannot
recycle: the grandchild reports that it is alive while it lives, and *gone*
becomes the report stopping rather than a number vanishing. A recycled pid
is then invisible to the test, and a grandchild that genuinely survives
still fails it.

`terminateTree` in `packages/router/src/checks.ts` is left alone. It
discards what the kill said, which is a real blind spot and is written down
here so the next session that suspects it can read what was measured — but
nothing has yet failed through it, and a guard with no incident behind it is
the kind this repository has spent sessions removing.
