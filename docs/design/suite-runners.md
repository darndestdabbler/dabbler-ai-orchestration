# Two doors into one suite

Written in session 153, from measurements taken on the operator's machine on
2026-09-11. It says where this repository's router tests run, why they run
there, and what is deliberately different between the local loop and CI — so
that the difference is written down rather than found later by somebody
debugging a green run that had stopped proving something.

Only this repository declares any of it. Nothing in the shipped framework
knows about a container, and no default moves: the next repository to adopt
this framework is .NET or Java and would want none of it, and a container
runner in the shipped defaults would be this machine's fact travelling to
every other machine — the mistake the model catalog already taught this
repository once.

## The measurement

| door | wall | tests |
|---|---|---|
| host, `node --test` as `dabbler.yaml` declared it before this session | **360 s** | 1,179 |
| container, CPU-bounded to four cores | **17.7 s** | 1,147 of them |

Twenty times, and the mechanism is not throughput. A bare `node -e 0` spawn
costs **158.8 ms** on this Windows host and **18.9 ms** inside the WSL2
machine — eight and a half times cheaper. The host has twenty cores,
sixty-four gigabytes, Defender real-time protection off, and the suite was
bounded to four concurrent files on both sides. Nothing was saturated.
Session 136 measured that this suite's load is **process creation rather than
saturation**, and `docs/design/suite-cost.md` carries that history; this is
that finding with a remedy attached.

**The cost was never the clock, it was the keyboard.** Six minutes of
relentless spawning on the scheduler the editor shares leaves the operator
typing about one character every two or three seconds. Four cores inside a
virtual machine costs nothing measurable and takes the load off the host
entirely.

## What runs where

`scripts/suite.mjs` is both doors:

    node scripts/suite.mjs container [test paths...]
    node scripts/suite.mjs host      [test paths...]

Both are declared in `dabbler.yaml` as `typescript` and `typescript-windows`,
both are `expensive: true`, and both are therefore the run of record. Both
spawn the same `node --test --test-concurrency=4` with the same `no-git.ts`
preload, so neither door can drift into running the suite differently.

### Which door owns a file

They draw from the same directory, so they declare the same `test_roots`, and
that makes ownership something to get right rather than assume.
`scopeForTest` gives a test file to the **first declared suite** whose root
and glob match it — one owner per file, which is what stops the framework
naming every selected test to every runner and putting a Java test in a
`dotnet test` command.

So `typescript-windows` is declared **first**, and selects by a glob that
names the file (`copilot.test.ts`) rather than a pattern. Declared the other
way round, `typescript` would claim that file, the container runner would
decline it as not its own, and **no targeted command would run it anywhere** —
the one test this split exists to keep proving would be the one test that
stopped being proved. That is not hypothetical: it is what the first cut of
this session's declaration did, and `dabbler affected --path
packages/router/src/transports/copilot.ts` is what showed it, printing one
command where there should have been two.

That leaves the host set stated twice — the glob in `dabbler.yaml` and
`scripts/suite-membership.json`, which carries the reason.
`scripts/check-suite-membership.mjs` holds them to each other, and **refuses a
manifest a single glob cannot express**: a glob matches a basename, so the day
a second file needs the host, the check stops and says to give the host-only
tests a directory of their own and point `test_roots` at it.

The runner filters what it is handed as well, and **names the paths it
declined and the suite they went to**. That is the second line, not the first:
after the declaration is right, it catches a path arriving from somewhere
other than the selector, and a silently dropped test is the failure this whole
split exists to prevent.

The image is built on demand from the `Containerfile` beside `dabbler.yaml`.
Three named volumes — `dabbler-nm-root`, `dabbler-nm-router`,
`dabbler-nm-ext` — hold the Linux `node_modules` and are mounted over the
three directories the bind mount exposes, so the operator's Windows
`node_modules` is never read and never written; the two are different builds
of the same dependencies and sharing one would corrupt both. Volumes with no
install in them are populated with `npm ci --ignore-scripts` (about 5 s, and
it survives between runs) rather than run against, because `node --test` over
a tree with no `node_modules` reports the tests it could load, which is a
suite with nothing in it reading as a suite that passed.

Two details there are each a bug that was found rather than avoided.
`--ignore-scripts` is the first: a plain `npm ci` runs the router's `prepare`,
which builds `packages/router/dist` — and `dist` is on the bind mount, so the
container would overwrite the operator's own build with a Linux one. The
second is what counts as populated. It is **npm's own record of the install**,
`node_modules/.package-lock.json`, and not whether the directories have
anything in them: this is one workspace install across three volumes, and npm
hoists the router's dependencies to the root, so
`packages/router/node_modules` is legitimately empty afterwards. Read as
"empty means unpopulated", that volume asks for a fresh `npm ci` on every
single run, forever — which is what it did until the second run was watched.

Where podman is not reachable the runner **stops and names it**. It never
falls back to the host: a runner that quietly ran somewhere else would be the
same defect as a runner that reads a cancelled test as a pass — the suite
would still be green and would have stopped proving what it says it proves.

## The one file that is on the host, and why

`packages/router/test/copilot.test.ts`.

It does not fail in the container — it **hangs**, which is the trap. Four
seat-timeout tests never settle, the thirty-two tests after them come back
`cancelledByParent` with *Promise resolution is still pending but the event
loop has already resolved*, and the file reports `# fail 0`. A runner reading
the failure count would call that green, having silently stopped proving the
transport this repository is actually operated on. That is the whole reason
the guard in the next section exists.

**The cause is not the seat.** Nothing in that file spawns a process: its
spawner seam is filled with a real in-process stream. The cause is that
`sleep()` in `packages/router/src/transports/copilot.ts` unrefs its deadline
timer. When the spawner never settles — which is exactly what
*classifies a spawn that never returns as a spawn timeout* arranges — there is
nothing left holding the event loop open, so the deadline that would classify
the timeout never fires. Windows keeps the loop alive here and Linux does not.

**That is a finding about the transport, not about the image, and it is owed
to a later session.** On this host those tests pass by luck rather than by
design, and a deadline that only fires when something else happens to be
keeping the loop alive is a deadline that can fail to fire in production too.
Session 153 did not fix it: the session's own declaration is that nothing in
the shipped framework changes, and a product fix made in passing would have
ridden in on a session that was measuring, not reviewing. The tests stay on
the host because that is where they are true today.

## What was NOT moved to the host, and why that matters

Three other files failed in the container on the first pass, and declaring
them Windows-only would have been the easy reading:

| file | what actually failed |
|---|---|
| `checks.test.ts` | *ends every child it started that is still running, tree and all* |
| `engines.test.ts` | *ends a command engine's whole tree, the tool it was running included* |
| `walk-jobs.test.ts` | *reaps what a failed command left running before it records the result* |

None of them proves anything about Windows. The first two fail because an
orphan whose parent has died is reparented to PID 1, and a PID 1 that does not
reap leaves it a **zombie** — which `process.kill(pid, 0)` answers for exactly
as it answers for a live process, so the test reads a reaped tree as a tree
that survived. `--init` gives the container a PID 1 that reaps, and both pass.
The third fails because `node:22-slim` carries no `ps`, so the POSIX branch of
`survivors()` in `jobs.js` finds no process table, reaps nothing, and says
nothing about it; `procps` in the image, and it passes.

Writing those three down as proofs about Windows would have been three false
sentences in this document and a container that had quietly stopped proving
the job runner's leak reaping. **The seam is measured, not assumed**, and this
section is here so that the next file that fails in the container is asked
which of the two it is.

## The guard: a cancelled test is not a pass

`node --test` reports a cancelled test outside `# fail`. `scripts/suite.mjs`
reads the TAP it streams through — unchanged, because that output is the run
of record — and exits non-zero when any test was cancelled, **naming each one
and the file it came from**. It applies to both doors: the host suite can lose
the seat the same way the container loses it, and a guard that only watched
one of them would be a guard on the failure that has already been found.

Which is why the runner asks for `--test-reporter=tap` rather than taking the
one it is given. `node --test` picks its reporter from whether stdout is a
terminal, and the two doors run different Node versions: the host answered
`spec` even through a pipe, and `spec` carries no `failureType`, so on the
host door the guard was reading a format that cannot say a test was
cancelled — seeing nothing, and reporting green, which is precisely the
defect. Pinning the reporter is also what makes the two doors' records
comparable.

Proved end to end as well as in the check: with the manifest temporarily
emptied so the container claimed `copilot.test.ts`, the run came back
`# pass 18`, `# fail 0`, `# cancelled 32` — and the runner exited **1**,
listing all thirty-two by name and file.

`scripts/check-cancelled-guard.mjs` proves it, by feeding the scanner a TAP
stream carrying a `cancelledByParent` test beside a clean pass and requiring
both a failing verdict and the cancelled test's name in what it prints. A
guard that failed silently would be the defect it exists to catch.

## CI is not moved, and that is the divergence

Both jobs in `.github/workflows/` run on `windows-latest`, and **that is what
proves the platform**. The container is the local loop's speed, not a
substitute for Windows evidence: it runs Linux, and this repository ships a
router whose spawn path, argv quoting and tree kill are Windows code.

So the two doors are deliberately unequal, and here is the whole of it:

- **CI** runs the entire suite on Windows, including `copilot.test.ts`, and is
  the evidence that the platform still works.
- **The local loop** runs 1,147 of the 1,179 in Linux and the rest on this
  Windows host, and is the run of record for a session.

A test that passes locally and fails in CI is therefore a real possibility and
not a mystery — it means the test depends on the platform, and the answer is
to find out which way and record it here. Session 154 is where the two doors
into each suite are held together; this section is the input to it.

## Repeating the measurement

    node scripts/suite.mjs container    # the container door, whole
    node scripts/suite.mjs host         # the host door, whole
    node scripts/check-suite-membership.mjs

The last one fails when this document, `scripts/suite-membership.json` and the
test tree stop agreeing — a host-only entry that names a file that is not
there, an entry with no reason, or a file this document does not mention. The
split cannot drift from what is written down about it without the check
saying so.
