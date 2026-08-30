# Field trial, session 50 of 50

The acceptance exercise for sessions 37–50, run against the tree at the end of
session 49.

**Its first precondition is not met, and could not be.** The criterion opens
"with the router installed from the public registry", and the router is not
published: session 49 raised the publication decision and stopped, because
publishing is the one act in this framework that cannot be taken back and it
is the operator's. So the exercise below is split into what was reachable and
what was not, rather than reported as if it had all run.

That is the trial working, not the trial failing. A session that had published
in order to test publishing would have made the irreversible choice on the
operator's behalf to avoid writing this paragraph.

## What the exercise found

### Reachable, and passing

| # | Criterion | Result |
|---|---|---|
| 3 | Owed decisions visible with their default and their state | **Partly.** The default renders (`publish (recommended)`). The state does not — see F-50-3. |
| 4 | No gate reports `PASS` for a precondition it cannot see | **Yes.** `test_run_fresh` reports `SKIP` where no suite is declared; the sixth gate carries what the fifth cannot see. |
| 6 | Nothing asked the operator to run a command | **Yes**, for the fourteen sessions. `session start`/`close` run in-process from the Work Explorer, `bootstrap` writes the config, an answered owed decision is *executed* rather than returned as an instruction, and `dabbler release` does the tagging. |
| 7 | A publishing repository has its `packaging` block written for it, credential as a name only | **Yes** by unit test; **never exercised on a real repository**, because no repository in this solution publishes through the packaging verb. See F-50-4. |

### Reachable, and failing

**F-50-1 — a corrected brief never reached the operator. FIXED in this
session.** `raiseOwed` was idempotent on the decision's *id*, so a brief
improved in code did not replace one already on disk. This was live: session
49's round-2 remediation reversed the publication recommendation from
`release-candidate` to `publish` and rewrote the reason, and `dabbler owed
list` went on printing the superseded text — recommending the answer that
leaves the product uninstallable. An operator reading the framework's own
output would have been advised, in writing, against the thing the session
existed to do.

It is now idempotent on the *question*: an open decision whose brief has
changed is superseded and re-raised, both on the record. Answered decisions
are untouched, because rewriting a brief under a decision somebody has made
changes what they are recorded as having agreed to.

**F-50-2 — `dabbler test-evidence --help` documented only `record`. FIXED in
this session.** Session 45 added `test-evidence run` — the framework-timed
run that a repository which has used source mode now *requires* for its run of
record — and left the top-level usage naming one subcommand. The verb a
session cannot finish without was undiscoverable from its own help.

**F-50-3 — an owed row does not show its state.** `dabbler owed list` prints
the id, the class, the question, the options and the recommendation. It does
not print whether the decision is open, answered or superseded. Criterion 3
asks for the state, and a reader looking at a list cannot tell which rows are
still waiting on them.

**F-50-4 — `dabbler status` carries no planned sessions.** Session 38 added
`plannedSessions` and `nextSession` to the projection the extension reads.
`dabbler status` is a different reading of the same repository and has
neither, so the CLI still cannot answer "what comes next" — which is
`csv-model` item 9's actual complaint, closed in the extension and open at the
command line.

### Not reachable

Criteria 1, 2 and 5 need a published router, a fresh clone of `csv-model`, and
two downstream repositories that do not exist yet — `csv-model` is documents
and no code today. They are not deferred by choice: their precondition is the
publication decision, and the decision is the operator's.

## `csv-model` feedback, item by item

| # | Item | Disposition |
|---|---|---|
| 1 | Work Explorer icons render with a line through them | **Closed, session 41.** The eight SVGs declared `width="16mm"`; they declare `width="16"`. |
| 2 | "Set Up New Project" should create the folder and initialise the repo | **Closed, session 41.** `bootstrapProject` creates the folder with no workspace open, runs `git init` through VS Code's git extension, and offers to start session 1. |
| 3 | `dabbler.yaml` should be filled in by the framework at the right moment | **Closed, sessions 39 and 46.** Suites are asked once as an owed decision and *written* on the answer; packaging is detected and written the same way. |
| 4 | The Solution Explorer's purpose is unclear | **Closed, sessions 42 and 47.** The pane is "AI Orchestration"; the view has a welcome that says what it is for; it renders what other repositories build, and it navigates to them. |
| 5 | `npm i -g dabbler-ai-router` fails | **OPEN, and it is the operator's.** Session 49 built the whole path and raised the decision. `dabbler release --verify-install` performs the real clean install and reports the 404 today. |
| 6 | `--help` unusable on subcommands | **Closed, sessions 41 and 50.** F-50-2 above was the last of it. |
| 7 | A gate's error text names the wrong file | **Closed, session 39.** It names `dabbler.yaml`. |
| 8 | No way to record "the selector chose nothing" | **Closed before this block** — `none-selected` is an outcome, and the framework re-runs the selection rather than trusting the claim. |
| 9 | Planned sessions invisible; the project reads as finished | **Closed in the extension, session 38. OPEN at the CLI** — F-50-4. |

Seven closed with the code that closed them named, two open with an owner: 5
is the operator's decision, 9 is F-50-4 and belongs to the remediation session
below.

## What this trial hands forward

The plan is amended with **session 51**, bounded to F-50-3 and F-50-4 and to
nothing else, and with **session 52**, which is the half of this exercise that
needs a published router and can only run after the operator answers. A trial
with no route to fix what it finds is a demonstration; these are the route.
