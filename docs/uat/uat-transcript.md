# Walking 3.22.0 in survsys: the transcript, the step's files, the committed choice

For the operator, before 3.22.0 is published. It walks the three things the
release carries -- 247's transcript, 249's annotated step instruction and
250's committed Configuration choice -- in `../survsys`, a repository whose
records were written by a different project. Nothing here publishes
anything from this repository; the release is session 254, on your yes.

## What you need

- The local VSIX, packed from the trunk **after session 259 closed** (it
  carries 253's transcript fix in Findings and 259's test counts), never
  from inside a session, installed with `--force`, and
  every VS Code window reloaded. From this repository:

  ```
  npm --prefix tools/dabbler-ai-orchestration run package
  code --install-extension tools/dabbler-ai-orchestration/dabbler-ai-orchestration-3.21.0.vsix --force
  ```

  The version still reads 3.21.0 -- 254 moves it -- which is exactly why
  `--force` is needed: a same-version install over the published 3.21.0
  otherwise leaves the old code in place. Expect, in a new terminal:

  ```
  dabbler transcript --help
  ```

  prints `usage: dabbler transcript ...`. The published 3.21.0 says
  `'transcript' is not a verb`.

- **survsys must have NO session in flight when you install.** The
  extension carries the router, and replacing it under a running session
  swaps the code driving that session mid-run. Check first, in survsys:

  ```
  dabbler status
  ```

  and install only when it names no session in progress. Release session 29
  was rolled back to its start, so today it is planned, not in flight.

## Check 1 -- the transcript, rendered before anything is committed

**You --** in a terminal in survsys, render its completed sessions into a
folder outside both repositories, without `--commit`:

```
dabbler transcript --from 1 --to 23 --out D:/tmp/survsys-transcripts
```

Expect:

- one line per page written, `transcript: session N -> <path>`, and
  `D:/tmp/survsys-transcripts` holds
  `session-001.html` to `session-023.html`;
- `git -C ../survsys status --short` prints nothing new: an `--out` render
  outside the tree writes nothing to survsys.

**You --** open three pages in a browser: `session-010.html` (a release
whose push failed, exit 6), `session-016.html` (three verification rounds:
ISSUES_FOUND, ISSUES_FOUND, VERIFIED) and `session-005.html` (an ordinary
session, verified in one round).

Expect, in each: the session's title and its outcome at the top; its steps
in order; each verification round with its verdict; each job's line saying
`exit 0` in green or a non-zero exit in red -- never `exit ?`; a failed
job's output shown, a passing job's not (unless `--full`); nothing
referencing a file on this machine that the page needs to display -- it is
self-contained.

**You --** now render into survsys itself and commit:

```
dabbler transcript --from 1 --to 23 --commit
```

Expect:

- one new commit in survsys; `git -C ../survsys show --stat HEAD` lists
  only `docs/transcripts/session-NNN.html` files;
- `git -C ../survsys status --short` is clean;
- run the same command again: every page already exists and is left as it
  is, and no second commit is made.

## Check 1a -- the test counts (259)

**You --** in `D:/tmp/survsys-transcripts` (Check 1's render, made by this
build), open any page whose *Test runs* table has a `final-full` row, and
then this repository's own `docs/transcripts/session-258.html`, which was
rendered and committed before 259.

Expect:

- on the new page, the Test runs table's headings read Suite, Stage,
  Outcome, Duration, **Passed, Failed, Skipped**, Command, and every
  `final-full` row has a number in all three -- even where its job's line
  says `output not carried`; a nonzero Failed is red;
- Outcome is still there and still says `passed` or `failed`;
- a row whose log carried no summary the framework knows (a build that
  failed before its tests) has the three cells blank, not `0`;
- on `session-258.html`, no Passed, Failed or Skipped column: a page
  already committed is never re-rendered.

## Check 2 -- the step instruction, read in passing (249)

This is not driven from here. The next session you drive in survsys issues
a `step` instruction, and its `ask` now carries the step's declared files.

**You --** when that step arrives, read its `ask` in the AI's chat (or in
`.dabbler/runs/s<N>/driver/` in survsys, the outstanding instruction).

Expect a line of this shape, after the non-goals:

```
This step's declared files: <path> (exists); <path> (new). A file marked
exists is already in the tree: read it before you write it, and change it
rather than replace it.
```

- each of the step's declared files named once;
- each marked **exists** or **new**;
- the marks agree with the disk at the moment the step was issued:
  `Test-Path ../survsys/<file>` is `True` for one marked exists and `False`
  for one marked new.

**Keep the instruction** if the author then writes a file marked exists
from scratch, discarding what was in it: that is the finding worth having.

## Check 3 -- 250's fix, on the release that found it

survsys's release session 29 stopped at publish over the untracked
`.vscode/settings.json` the Configuration pane wrote. It has been rolled
back to its start, which discarded that file.

**You --** with the new VSIX installed and no session in flight, in
survsys's Solution Explorer open *Configuration* and run **Set the
Authoring Model** on its Model row. Pick the model the release should run
with.

Expect:

- one new commit, `Configure dabbler.authoringModel`, with that one file:

  ```
  git -C ../survsys show --stat HEAD
  ```

  lists `.vscode/settings.json` and nothing else;
- it is pushed: `git -C ../survsys status -sb` shows no `ahead`;
- `git -C ../survsys status --short` is clean.

**You --** in survsys's Work Explorer, run **Start Session** on release
session 29.

Expect: the session runs to its close, and its publish lands in
`D:/handoff/survsys` without a refused gate.

**If it stops at publish again, keep its `run.json`** --
`../survsys/.dabbler/runs/s29/driver/run.json` -- before rolling anything
back: its `stop` is the finding worth having.

## Findings

Walked by session 253 on 2026-10-16, against survsys's records as they
stood at `bdbaec4` (28 sessions closed, release 29 rolled back to its
start). Check 1's uncommitted render was done here, into
`D:/tmp/survsys-transcripts-253`, for sessions 1-28; survsys's tree did not
move. Checks 2 and 3, and Check 1's commit, are the operator's.

**Check 1 -- FIXED in this session: every job read `exit ?`.** The renderer
read `exitCode` from `jobs/<name>.status.json`; the job runner writes that
file with `exit`. So every job on every page was an unknown exit, toned red,
and carried its whole output -- a page for a green session looked like a
page of failures, and the default "failed jobs only" carried everything.
The tests passed because their fixtures wrote the same wrong key. The
renderer now reads `exit`, and the fixtures write what the runner writes.
Re-rendered with the fix: session 16's three jobs read `exit 0` in green
with their output not carried; sessions 8 and 10 read `exit 1` in red with
their output shown. The installed VSIX predates the fix -- repack it after
253 closes, as *What you need* says.

**Check 1 -- recorded, not fixed: survsys sessions 1-14 and some later
ones say `Engine cli`.** Those sessions' `run.json` names the engine `cli`,
from before the engine was recorded by name; 15 onward say `claude-code`.
The page reports what the record holds, which is right; it reads oddly.

**Check 1 -- recorded, not fixed: a release stop opens mid-script.**
Session 10's *Where it stopped* begins `the packaging run did not
publish: }` followed by the tail of the pack script, with the push's `exit
6` after it. The page quotes the stop as the framework wrote it; the stop's
own text is what clips the script. Worth a line if it misleads a person
reading a failed release.

**Check 1 -- as expected.** All 28 pages self-contained (no `src=` or
`href=` to anything outside the page); the feed credential appears as
`{secret}`; sessions with no verification round or no recorded test run say
so under *This session left no*.

**Check 2 -- seen in this repository first.** Session 253's own second step
arrived with `This step's declared files: docs/uat/uat-transcript.md
(exists).`, and the mark agreed with the disk. The mark is **exists** or
**new**, read from the disk when the step is issued, not from git.
