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

## The decision: the module's folder is kept

`dabbler module open <slug>` on a clone that already exists **keeps it**
(`EXISTING_CLONE = "reset"` in `checkout.ts`): clean, it is fetched, reset
hard to the trunk and re-narrowed, and the build output stays; dirty, it is
refused by the paths it holds; it is never deleted, whatever flag was
passed. The folder is one a developer works in from a VS Code window of
its own, kept between sessions and refreshed from the server -- the
experience a repository per module gives -- and a window holds its folder
open, so a delete under it fails on this host anyway (the proof of
2026-09-08, `option-a-poc.md`). The wall after a grant is restored by the
revoke's narrowing: the fetched blobs may stay in the object store, and the
session reads the tree, not the store. The `--reset` flag is accepted and
changes nothing.

The measurements above still hold and still say a fresh clone is cheap;
what changed is what the folder is for. The case that was made for a
fresh clone, kept for the record:

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

What decided it the other way was none of these numbers: it was that the
folder is somebody's window, and the third point's stale state is what the
reset's fetch, hard reset, re-narrow and clean already remove. The verb
still measures both paths, and a team whose fresh toolchain costs a minute
under real-time antivirus is the team the kept folder was always for.

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
