# The canonical sample-project bundle

This directory is the **single source of truth** for the sample project that
`Dabbler: Try a sample project` creates. Three things consume it, and they must
never disagree:

1. **The command** — `src/commands/trySampleProject.ts` renders `files/` into the
   developer's chosen folder.
2. **The tutorial** — `docs/tutorials/hello-world.md` quotes this sample's file
   paths, test counts, and program output. (Authored in Set 107 Session 2.)
3. **The smoke test** — `src/test/suite/sampleProjectSmoke.test.ts` renders the
   bundle, runs the Lightweight lifecycle, runs the sample's tests, and asserts
   the program output.

**Do not** point any of them at a cold-start or UAT fixture instead. Those are
test artifacts; this is a user-facing contract (proposal v3 §6).

## Layout

| Path | Meaning |
| --- | --- |
| `bundle.json` | The machine-readable contract: bundle version, the sample set's slug, the expected program output, and the expected test counts before and after the session. Assert against this, never against a hand-copied literal. |
| `files/` | The tree rendered verbatim into the developer's folder. |

## The `dot-` filename rule

A file in `files/` whose **basename** begins with `dot-` is written with a
leading `.` instead: `files/dot-gitignore` renders as `.gitignore`. The rule
exists so a dotfile shipped in the bundle does not take effect inside *this*
repository — a real `.gitignore` sitting in `docs/templates/` would silently
apply to the template tree itself. The rule is basename-only and applies at
every depth.

## The shape of the sample

The bundle ships a two-function Python module where **one function is missing**,
so the test suite starts at 1 passed / 1 failed. The already-authored session set
at `docs/session-sets/001-add-a-shout/` asks the developer's own AI agent to write
that function. When it does, the suite goes green and `main.py` prints the two
lines `bundle.json` names.

That red-to-green transition **is** the first-run experience: the whole point is
that a new developer watches an AI session change real code and prove it worked,
inside 15 minutes, without typing git.

## What is enforced, and what is not yet

Be precise about this: a contract that *claims* to be enforced but is not is
worse than no contract, and the Session 1 verification round said so.

**Enforced today** — every *contract* field of `bundle.json` is read by a
test. (`description` is the one exception: it is prose for humans reading this
bundle, carries no contract, and is deliberately not modelled or asserted.)

| Field | Enforced by |
| --- | --- |
| `sampleSetSlug` | the rendered set path, and `AGENTS.md`'s text |
| `programEntryPoint` | the smoke test runs it; `README.md` / `AGENTS.md` name it |
| `testCommandArgs` | the smoke test runs it; both rendered docs show it |
| `expectedTestCount` | asserted against the real `Ran N tests` output, before **and** after the change |
| `expectedProgramOutput` | asserted against the program's real stdout, and quoted in both rendered docs and the task spec |
| `missingFunction` | asserted absent from `hello/greeting.py`, present in the test, and named in the rendered task spec |
| `bundleVersion` | the resume marker's compatibility check |

**Not yet bound:** `docs/tutorials/hello-world.md`. It is named above as a
consumer, but it does not describe this sample yet — Set 107 **Session 2**
authors it. That session must assert the tutorial's quoted paths, commands and
output against `bundle.json` the same way the two rendered docs already are.
Until it does, the tutorial is the one place this contract can drift silently.

## Changing the sample

If you change the sample's behavior, change `bundle.json` in the same commit —
the tests read their expectations from there, so a drifting sample fails the
build instead of failing a reader. Bump `bundleVersion` when the rendered file
set changes shape (added, removed, or renamed files), so a partially-rendered
older sample is recognised on resume.
