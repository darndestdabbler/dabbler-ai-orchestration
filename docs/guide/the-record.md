# What is written down, and where

Every session leaves a record, and the framework writes nearly all of it.
Some of the record is committed with the code, so anyone who clones the
repository can read it. The rest stays on the machine that ran the
session, under `.dabbler/`, which is never committed. This page says what
each file holds and who writes it. The full account is in
[Driving a session](../driving-a-session.md), under *Where the record is*.

## Under the sessions root: committed with the code

The sessions root is `docs/sessions/` by default.

| File | What it holds | Who writes it |
| --- | --- | --- |
| `session-plan.md` | The plan: every session, with its scope, why, steps, non-goals and tests. | A person, or a planning session the person approves. The framework never rewrites it. |
| `sessions.json` | Each session's state: in flight, complete or cancelled, and its verdict. | The framework only, through writers that validate it. |
| `activity-log.json` | The history: each session's declaration, decisions and amendments, appended in order. | The framework only. It is append-only. |
| `decisions-log.md` | Every decision, with who made it and why. | Rendered by the framework from `activity-log.json`. A hand edit is overwritten. |
| `project-work-plan.md` | The plan prose recorded for the project. | Rendered by the framework from `activity-log.json`. |
| `change-log.md` | One block per session's review: the verdict, the reviewer and the provider it excluded, the rounds, and any work that landed unreviewed. | Appended by the framework. |
| `mechanic-log.md` | What the Mechanic found and fixed when it was called in on a stop. | The Mechanic, in the same change as its fix. |

A decision's content comes from whoever made it: the person, the authoring
AI, a reviewer, or the framework. The decisions log records which.

## Under `.dabbler/runs/s<N>/`: on the machine that ran it

| File | What it holds |
| --- | --- |
| `driver/plan.json` | The work plan the engine declared and the framework accepted. |
| `driver/amendments.jsonl` | Each change to that plan, with its reason and who asked. |
| `driver/events.jsonl` | Every line the framework printed: each instruction, check, test run, phase, commit and push. |
| `driver/run.json` | Where the session stands, and the stop if it stopped. |
| `driver/jobs/` | The output and exit code of each long job: the review, the suites, the publish. |
| `rounds.jsonl` | One row per review round: its verdict and findings. |
| `round-<n>-verifier-output.md` | The reviewer's raw output, byte for byte, written before anything parsed it. |
| `exceptions.jsonl` | Each `session waive`: what it went past, and why. |

None of this is ever edited by hand, and no command accepts a hand-written
verdict (see [Verification](verification.md)).

## The transcript: one page per session, committed

After a session closes, the framework renders its record into one
self-contained HTML page, with no script and no network, under
`docs/transcripts/`, and commits and pushes it on its own. That page is how
somebody who did not run the session sees how it ran: its section of the
plan, the work plan the engine declared, every line the framework printed,
each review round with its findings, the test runs, and the jobs. For
example:
[session 317's transcript](../transcripts/session-317.html).

What a page carries is set by `dabbler.transcript` in the repository's
`.vscode/settings.json`: `off`, `outline` (the default) or `full`.

`dabbler transcript --from N --to M` renders pages for earlier sessions
from records already on disk. Nothing is sent to a model and nothing is
billed, and a page that already exists is left as it is.

## Where things stand now

`dabbler status` prints, as JSON, what the Work Explorer shows: each
session, the one in flight, its phase, and which instruction is owed and
for how long.

## What `session waive` leaves

`dabbler session waive --reason "<why>"` is a person's verb; the framework
refuses it to an engine. It takes the session past the one stop it stands
at, and it leaves three things behind:

- a row in `exceptions.jsonl` holding the stop exactly as the framework
  recorded it, the reason, who gave it, and the commit and tree it was
  given against;
- an amendment beside it;
- at the close, the gate `session waive` went past, marked with who gave
  the reason.

It changes no verdict and writes none. What was unmet stays written as
unmet, and the exception stands only while the tree is unchanged.

## Picking the work up

The record has one shape so that the work does not belong to the
conversation that produced it.

Every session is planned, run and recorded the same way, whichever engine
and model wrote it. Each one leaves the same files: its section of the
plan, its rows in the activity log and the change log, its decisions, and
its transcript. An ordinary session goes through the same phases in the
same order: plan, work, review, the run of record, the commit and push, the
close, and the transcript. A session that changed nothing, and a release,
skip the phases that have nothing to do.

Every engine reads the same instructions, from `AGENTS.md`; Claude Code's
`CLAUDE.md` imports that file rather than repeating it. A session starts in
a fresh conversation, and the framework hands it its instruction, so
nothing the session needs is in an earlier chat or in one model's memory.

A person, or a model new to the repository, reads in this order:

1. `docs/sessions/session-plan.md`, for what is next;
2. `dabbler status`, for where things stand;
3. the last session's page under `docs/transcripts/`, for what was done
   and what the reviewer said;
4. `docs/sessions/decisions-log.md`, for why.

The record needs no particular model to read it. The repository's own
choice of models still applies: a seat that does not list the model this
repository selected is refused at `session start`, which names the file and
the command that changes the choice.
