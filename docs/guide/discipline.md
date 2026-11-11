# The rules an AI works inside

An AI engine that writes code in a Dabbler session follows rules, and none
of those rules depends on the engine choosing to follow them. Each one is
enforced by the framework, which is ordinary deterministic code: it runs
the checks itself, reads the working tree itself and keeps the record
itself. This page lists the rules, says what enforces each, and names the
command or file where you can see it happen.

It is written for someone deciding whether to trust the product, not for
someone driving a session. The full account is
[Driving a session](../driving-a-session.md).

## One instruction at a time

The engine does not follow a written procedure. It asks the framework for
an instruction, does what that one instruction asks, and answers it:

```
dabbler session next --sessions-dir docs/sessions
```

prints one instruction as JSON and exits. Its `ask` says what to do and its
`answer_command` is the command that reports the work. Running that
command is the answer, and when the framework has finished everything the
answer caused it prints the next instruction. The instruction in hand is
the whole of what is asked: the engine does not decide what comes next,
and there is no step it can skip ahead to.

An answer is judged before it is accepted. A refused answer comes back as a
`rejection` with its reasons, and three refusals of one step stop the
session for a person to look at.

*See it:* `dabbler status` names the instruction that is owed and for how
long. Every instruction and answer is a line in
`.dabbler/runs/s<N>/driver/events.jsonl`.

## Files and checks are declared before the work

The first instruction of every session asks for a work plan and nothing
else: the engine is told to change nothing yet. The plan names each step,
the files the step will create or change, and the checks that prove it.
A check is a program and its arguments, which the framework starts itself
with no shell; exit code 0 is the proof. The plan must also name what the
session will *not* do, and the reviewer later holds the work to that list.

Once a step is accepted, its files can be changed by nobody, and its checks
only by a person. A step not yet reached can be amended with
`dabbler session plan amend --step <id> --reason "<why>"`, and the amendment
is written to the record with its reason.

*See it:* the accepted plan is `.dabbler/runs/s<N>/driver/plan.json`;
amendments are `.dabbler/runs/s<N>/driver/amendments.jsonl`.

## The framework measures the work, not the report

When the engine reports a step done, the framework does not take its word
for any of it:

- **What changed.** It snapshots the working tree as git would commit it,
  every tracked and new file except the framework's own records, and diffs
  that against the tree at the last accepted step. A report that names a
  file the tree did not change, or leaves out a file the tree did change,
  is refused. With no list given, the framework takes the list from the
  diff.
- **The checks.** It runs the step's declared checks itself, with a time
  limit, in a built environment that holds no credentials, and records the
  exit code.
- **The tree did not move.** It snapshots the tree again after the checks.
  If a check changed the tree it was measuring, the check fails whatever
  its exit code said, because it did not measure what is about to be
  committed. For the same reason, nothing may edit the tree between a
  report and the next instruction.
- **The tests named after what changed.** A source file's tests are the
  test file named after it. Once the step's own checks pass, the framework
  runs the tests named after the changed files, for every suite that
  declares how to run a selection, and a red run refuses the report the
  way a failed check does. A suite that does not is run at the end.

*See it:* `check-passed` and `report-accepted` lines in
`.dabbler/runs/s<N>/driver/events.jsonl`, and the same lines in the Dabbler
Terminal as they happen.

## The run of record is held to the tree it ran against

After review, the framework runs the repository's declared test suites
itself. The result is recorded with a digest of the code it ran against:
SHA-256 over the path and the SHA-256 of the content of every file the
suite covers, tracked or new, sorted by path, so
that only bytes move it and never a timestamp. If the code changes after
that run, the digest no longer matches and the run is stale; the close
refuses it and the suites must run again. A repository that builds code but
declares no suite is refused too: nothing would measure the work.

*See it:* `dabbler session close --dry-run` prints each close gate's row
without writing anything.

## The gates at the close

A session closes only when every gate passes. Each one reads the record or
the repository, never the engine's account of them:

| Gate | What it reads |
| --- | --- |
| `verification_clean` | The review ledger: the latest round is not blocking, the tree has not changed since that round, and the session state was written only by the framework. |
| `working_tree_clean` | `git status`: nothing is left uncommitted. |
| `pushed_to_remote` | git: the branch has an upstream and is not ahead of it. |
| `test_run_fresh` | The run of record: every required suite passed, against the digest of the tree as it now stands. |
| `published_when_releasable` | The packaging record: a session that declared itself releasable has a publish recorded. |
| `verdict_vocabulary` | Every stored review verdict: each one is exactly a word from a closed list. |

The framework commits, pushes and closes. The engine runs none of those
steps and is not asked to.

## The verbs that are a person's

Some decisions are not the engine's to make, and the framework refuses them
to an engine. It recognises an engine by the environment its terminal
carries: the terminal the extension opens for the engine is marked, and so
is each vendor's own CLI. A refused engine is told to report the step
blocked and to name the verb a person would use.

- `dabbler session cancel`: cancel the session in flight.
- `dabbler session rollback`: return the repository to where a session
  started, undoing it and every session after it.
- `dabbler session close --force`: close every open session of the plan,
  which is how a whole plan is abandoned.
- `dabbler session hold-release`: hold a session's release.
- `dabbler session waive`: take the session past the stop it stands at,
  once, for a person's reason. It changes no verdict; what it leaves
  on the record is described in [The record](the-record.md).
- `dabbler session plan amend --checks-file` on a step already accepted.

## What the framework does so that no AI has to be trusted to

Every deterministic job in a session is the framework's:

- registering the session and keeping its state;
- tracking progress, phase by phase, and saying who owes what;
- running each step's checks and the tests named after what it changed;
- sending the work to a reviewer from a different provider, round after
  round, and recording each verdict (see [Verification](verification.md));
- running the test suites as the run of record;
- the commit, the push and the close;
- rendering the transcript page that is committed after the close.

What is left to the AI is the work that is not deterministic: reading the
code, writing the plan, writing the change, and answering a reviewer's
findings.
