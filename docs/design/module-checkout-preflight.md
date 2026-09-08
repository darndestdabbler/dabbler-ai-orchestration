# Module-checkout preflight: what the focused checkout costs on Windows, and the decision it supports

**Measured 2026-09-06** by `dabbler module preflight persister` (session 104,
step 3), run by `.dabbler/scratch/preflight-104.mjs` against a copy of the
module-checkout POC repository (`module-checkout-poc.md`) given the
two-module manifest and a bare origin with `uploadpack.allowFilter` on, as
GitHub and Azure DevOps have it. The router ran from source; the script
writes its raw JSON to `.dabbler/scratch/preflight-104.json` (the file holds
whichever run was last), and the run this record is built on is reproduced
below verbatim. The verb exists so that any other machine -- in
particular one whose antivirus is on -- can answer the same question for
itself: `dabbler module preflight <slug>` in a multi-module repository.

## The machine

| | |
| --- | --- |
| platform | Windows 11 Pro, x64, 20 logical CPUs |
| git | 2.51.0.windows.2 |
| .NET SDK | 10.0.201 (pinned by the POC's `global.json`) |
| Defender real-time protection | **off** at measurement time (`Get-MpComputerStatus`) |

**The antivirus was not exercised.** The plan asked for the numbers "with
Defender's real-time scan as it is", and as it is on this machine is off.
The figures below are therefore a floor, not the cost a locked-down
corporate laptop pays: every file a clone writes and every assembly a build
produces is a file real-time protection would inspect. The verb is the
remedy -- it is cheap to run and prints the flag -- and a team on such
machines should run it before taking the decision below as their own.

## The numbers

Seconds of wall clock. The clone is blob-filtered, sparse and unchecked-out,
then narrowed to the persister's cone (`docs`, `modules/model/contract`,
`modules/persister`, `packages`) and checked out on the trunk; the
convenience file is `persister.slnx`, since the POC has no solution file at
its root.

| | clone / open | restore | build | test | toolchain | total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| fresh clone, cold toolchain | 1.37 | 1.26 | 3.56 | 3.52 | 8.34 | 9.71 |
| `--reset` of that clone, warm toolchain | 1.47 | 0.79 | 0.94 | 1.99 | 3.72 | 5.19 |

Five further fresh clones in sequence, each removed after: 1.34, 1.36,
1.55, 1.45, 1.44 s. No warm-up effect and no drift: a clone is a second and
a half every time.

The restore hit NuGet's global package cache for the xunit packages, as any
developer machine that has restored once does; the committed `CsvModel`
package came from the clone's own `packages/` folder by the relative path in
`nuget.config`, as the POC showed.

## The decision: a fresh clone per session

`dabbler module open <slug>` on a clone that already exists **discards it
and clones again** (`EXISTING_CLONE = "fresh"` in `checkout.ts`), refusing
when the clone holds uncommitted changes. `--reset` remains the persistent
path -- fetch, reset hard to the trunk, re-narrow, keep the build output --
for whoever wants it, and session 105's `session start` gets the fresh
clone.

Why fresh, when reset is faster:

1. **The saving is small against the thing it saves.** A reset clone saves
   about 4.5 seconds per session start -- 1.4 s of clone that a reset does
   not avoid anyway, plus 4.6 s of cold restore and build. A session runs
   for minutes to hours and buys several model calls; the framework's own
   verification round costs more than this many times over.
2. **Only a fresh clone restores the wall.** The POC's fourth finding: a
   grant widens the cone by fetching the sibling's blobs, and a revoke
   narrows the working tree but the blobs stay in the clone's object store.
   The exposure metric session 105 records is honest for a fresh clone by
   construction and only approximately so for a reset one. A design whose
   boundary depends on nobody having asked for a grant last week is a
   design that is checked rather than guaranteed.
3. **Reset has failure modes fresh does not.** A reset clone can hold a
   stale `.slnx`, a half-written overlay from a debugging grant, build
   output from a project that no longer exists, or a branch nobody
   remembers; each is a question at session start that a fresh clone never
   asks. Disposable state is the simpler thing to reason about, and
   simplicity was the operator's second rule.

What would change the decision: a machine where the fresh path costs
minutes rather than seconds. That is exactly what real-time antivirus does
to a build, and exactly what the verb measures; a team that finds the fresh
toolchain at sixty seconds should set `--reset` as its habit and the
framework should then offer `modules.checkout.existing: reset` as
configuration. It is not offered until somebody measures the need.

## The run, verbatim

```json
{
  "slug": "persister",
  "convenienceFile": "persister.slnx",
  "fresh": {
    "cloneSeconds": 1.366,
    "restoreSeconds": 1.256,
    "buildSeconds": 3.56,
    "testSeconds": 3.517
  },
  "reset": {
    "openSeconds": 1.467,
    "restoreSeconds": 0.786,
    "buildSeconds": 0.939,
    "testSeconds": 1.986
  },
  "cloneSeconds": [
    1.342,
    1.358,
    1.546,
    1.446,
    1.436
  ],
  "git": "git version 2.51.0.windows.2",
  "dotnet": "10.0.201",
  "cpus": 20,
  "platform": "win32 x64",
  "defenderRealTime": false,
  "measuredAt": "2026-09-07T01:43:56.108Z"
}
```
