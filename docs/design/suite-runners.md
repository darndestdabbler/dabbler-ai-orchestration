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

Every figure below is a run taken in session 153 on the operator's machine on
2026-09-11, and **`tests` is `node --test`'s own `# tests` line** — leaf tests,
not files and not passes, which is the count the two doors can be compared on.
`wall` is the whole command including podman's own start-up, not the reporter's
`# duration_ms`.

| run | wall | `# tests` | pass | fail | cancelled | skipped |
|---|---|---|---|---|---|---|
| **the baseline** — the whole suite on the host, as `dabbler.yaml` declared it before this session | **324 s** | 1,179 | 1,173 | 0 | 0 | 6 |
| the whole suite in the container, manifest emptied so nothing is held back | 39 s † | 1,179 | 1,136 | **0** | **32** | 11 |
| **the container door**, as declared | **24.6 s** | 1,129 | 1,118 | 0 | 0 | 11 |
| **the host door**, as declared | **1.8 s** | 50 | 50 | 0 | 0 | 0 |

† that one wall figure includes an image rebuild; its `# duration_ms` was
21.9 s. The baseline command was
`node --test --test-concurrency=4 --import …/no-git.ts 'packages/router/test/**/*.test.ts'`;
the others are the two `scripts/suite.mjs` commands exactly as `dabbler.yaml`
declares them.

**The two doors account for the baseline exactly.** 1,129 + 50 = 1,179 tests.
1,118 + 50 = 1,168 passes against the baseline's 1,173, and the difference of
five is the five tests that self-skip in the container, named in the next
section — 11 skipped there against 6 on the host. Locally that is **26.4 s
against 324 s**, or a little over twelve times.

The second row is the one to read twice. The same 1,179 tests, `# fail 0`, and
**thirty-two of them cancelled** — `copilot.test.ts` entire, whose 50 tests
came back as 18 passes and 32 cancellations. That row is a green run to any
reader that counts failures, and it is why the guard below exists and why the
declared container door runs 1,129 rather than 1,179.

The figures in the session plan — 360 s and 17.7 s over 1,067 tests — were
taken before this session against a hand-run container and are superseded by
the table above. 1,067 in particular is not reproducible against any
declaration here: no run in this table passes that many, and the count appears
to have been taken from a partial run.

About twenty times either way, and the mechanism is not throughput. A bare `node -e 0` spawn
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

## The seven that skip in the container, and are proved only by CI

A file can be container-owned and still hold a test that will not run there.
Seven do, and — unlike `copilot.test.ts` — every one of them **skips, saying so
in its own words**, which is the well-behaved version of the same fact:

| test | why it skips on Linux |
|---|---|
| *prefers an executable to a shim ahead of it on PATH* | `resolveProgram` and the `.cmd` shim rule are Windows |
| *falls back to the shim when that is all there is* | the same |
| *reaches a shim whose path holds a space* | the same |
| *says when the tree kill could not be run, instead of answering as though it had* | `# SKIP the tree kill is taskkill` |
| *runs the command below normal, and leaves it where it found it under CI* | `# SKIP this worker could not be raised out of below normal (it reports 10)` |
| *round-trips a credential through the real store, and writes no plaintext* | `# SKIP this platform has no credential store` |
| *keeps a real stored value out of every rendering there is* | the same |

The first four are Windows by nature. The fifth is not: it skips because the
container's worker cannot raise its own priority, so a job that applied no
policy would look exactly like one that did — the test refuses to be read
either way, which is right.

The last two are the credential store, which is the platform's own —
PowerShell's DPAPI on Windows, `security` on macOS, `secret-tool` on Linux —
and the image has none of the three. Only a test that must STORE something
needs one: the other nine in that file are arranged from a seeded index and
run everywhere, and one of them, *a platform with no store refuses and names
the environment variable*, is exactly what the container is.
`docs/design/credential-store.md` says what the store is on each platform.

**These are the local loop's residual gap.** Their files stay in the
container because each holds many tests that are not platform-coupled, and
moving a whole file for five tests would take hundreds out of the fast door.
Nothing local proves them, and **CI on `windows-latest` is what does** — which
is the concrete content of the divergence declared below, rather than a
general worry about it.

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

- **CI** runs the entire suite on Windows, including `copilot.test.ts` and the
  five that skip in the container, and is the evidence that the platform still
  works.
- **The local loop** runs 1,129 of the 1,179 in Linux and the other 50 on this
  Windows host, skipping five of the 1,129, and is the run of record for a
  session.

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
