# Field trial: the acceptance exercise, and what it cost to reach it

The acceptance exercise the plan reserved for "when the operator decides to
publish", written by session 70 and corrected by 74, when npm was retired.
It is written **before** the trial is run, which is the point: an acceptance run whose answers are decided while looking at the screen
is a demonstration. Every criterion below states its expected answer first.

## What session 70 found before it started, and what came of it

**The plan's precondition was not met.** It reads: *the operator has answered
`publication` with `publish`, CI has published the tagged versions, and
`dabbler release --verify-install` passes.* On 2026-09-01, none of the three
was true:

- `registry.npmjs.org` returns **404** for `dabbler-ai-router`. It has never
  been published under that name; the `v1.0.x` tags in this repository are
  from the PyPI era, before the TypeScript port. **Session 74 answered that
  by retiring npm rather than satisfying it:** the extension bundles the
  router, so there was never a second artifact to publish.
- There is no `v2.*` tag and no `vsix-v2.*` tag, so extension 2.7.0 was never
  released either.
- `dabbler owed list` reports nothing waiting: the `publication` brief had not
  been raised.

**And the publication cannot happen inside this session.** `dabbler release`
refuses to tag when the working tree is **not clean** — "a tag here would name
a commit that is not what was verified" — and a driven session's tree carries
its own uncommitted steps until the land phase, which is after verification.
So the session that CHANGES the version can never be the session that tags it.

That is the framework's own model rather than a defect. `dabbler.yaml` says it
in as many words: *a session prepares a release; a tag push makes it, and that
is the operator's.* What was wrong was the plan's assumption that the
publication had already happened by the time session 70 ran.

## What runs when

| Order | Who | What |
|---|---|---|
| First | Session 70 | One version, stamped from `version.json` into both manifests, the router dependency and the lock. This document, the feedback audit below, and the plan amendment. |
| Then | Sessions 71-73 | **Green CI**, which nothing could be published without: `Test` had failed on every push since session 66. One family of causes -- a path spelled two ways, a fixture borrowing the machine's git identity, and a `~` that was not in a path-token class. |
| Then | Session 74 | **npm retired, and the number set to 2.0.0.** The extension bundles the router, so there was never a second thing to publish; and the Marketplace serves 1.0.4, so 2.8.0 would have claimed seven releases that never happened. |
| Then | The operator | `dabbler release` raises the brief; answering it pushes `vsix-v2.0.0`. CI builds and publishes the VSIX once the `marketplace` environment's reviewer approves. |
| Last | Session 75 | `dabbler release --verify-install` as a step **check** -- it asks the Marketplace what it actually serves -- then criteria 1 and 2 below, performed from a clean profile against the published extension. |

**2.0.0, not 2.8.0.** The Marketplace serves 1.0.4 from 2026-08-18 with
twenty installs, and nothing 2.x has ever been published anywhere. The
numbers 2.0.0 through 2.8.0 were bookkeeping between two people; publishing
2.8.0 would have told a reader that seven minor releases happened since
1.0.4. 2.0.0 is greater than 1.0.4, which is all the Marketplace requires,
and it says the one true thing: a rewrite (D255).

## The criteria, with their expected answers written down first

### Criterion 1 — the Solution Explorer renders the csv pipeline

From a clean VS Code profile, with the extension installed from the
Marketplace and a fresh clone of `csv-model` open.

Steps: open the AI Orchestration container; expand **Solution Explorer**;
expand *From other repositories*; expand *Solution repositories*.

**Expected:** every repository the declarations reach appears — the ones the
edges name and the ones that only declare their own membership. Each external
row shows the producing repository and, where the pins disagree with what is
published, a drift line (`⚠ <version> is out`, `⚠ two versions in this
solution`, or `⚠ feed not configured`). A repository that is not on this
machine is one of two states, never one: *not cloned here* when a remote is
declared, *location undeclared* (or *declared at X, which is not there*) when
none is. The row's context menu offers only what its state can do — open /
reveal when it is here, clone when a remote is known, point-at-a-folder or
create when it is not.

**Answered by looking at:** the tree itself, and nothing else. No terminal.

### Criterion 2 — the Work Explorer shows the sessions and the tasks moving

Steps: expand **Work Explorer** on the same repository; start a session from
the row action; watch the step rows while it runs.

**Expected:** the repository row carries its sessions in ledger order with
their status glyphs — completed, current, planned — and the in-flight
session's own step rows move through Not Started → In Progress → Done as the
framework issues and accepts them. Closed sessions show their close date;
only In Progress is expanded by default; a session that stopped at the cap
reads its verification first and its tasks after.

**Answered by looking at:** the tree. The framework writes every row; nothing
in it is ticked by hand.

### Criterion 5 — the nine `csv-model` feedback items

**Expected:** every one of the nine carries a linked test, a recorded release
verification, or a dated deferred issue with an owner. The plan says in as
many words that **prose classification does not satisfy this**, and the table
in `field-trial-50.md` is prose — it names the sessions that closed each item,
which is history rather than a control. The audit below replaces it.

## Feedback audit

Written by session 70. Item 5 closed on 2026-09-02, when npm was retired:
it turned out to be a wrong instruction rather than a defect, which is why
the audit asks for a control per item and not a status per item.

| # | Item | Held by |
|---|---|---|
| 1 | Work Explorer icons render with a line through them | `tools/dabbler-ai-orchestration/src/test/suite/sessionsModel.test.ts` — *every status icon is sixteen PIXELS*: all eight media SVGs declare a unitless `width`/`height` of 16 over a `0 0 16 16` viewBox. The defect was Inkscape's `16mm`, and nothing downstream can notice a unit. |
| 2 | "Set Up New Project" should create the folder and initialise the repo | `tools/dabbler-ai-orchestration/src/test/suite/commandFlows.test.ts` — *creates the project when VS Code has no folder open at all*, *opens a folder it created before offering anything about it*, and *initialises a repository when bootstrap refuses for want of one*. |
| 3 | `dabbler.yaml` should be filled in by the framework at the right moment | `packages/router/test/owedDecisions.test.ts` — the suites question is asked once and *written* on the answer (*appends to a suites list that already exists*, *inserts into a testing mapping that carries no suites*); packaging is detected and written the same way in `packages/router/test/detectPackaging.test.ts`. |
| 4 | The Solution Explorer's purpose is unclear | `tools/dabbler-ai-orchestration/src/test/suite/actionRegistry.test.ts` — *the Solution Explorer says what it is for, and offers a way in*: the view contributes a welcome that names what it shows and carries a command, so an empty tree is not a dead end. |
| 5 | `npm i -g dabbler-ai-router` fails | **Closed 2026-09-02 as a wrong instruction, not a defect.** There is no package to install: the extension bundles the router and ships `dist/dabbler.cjs`, and the shim puts `dabbler` on the PATH of a VS Code terminal — which is how every session since the port has been driven, including the one that wrote this. npm was retired the same day (D256), so what the item asked for cannot fail because it no longer exists; what replaces it is held by `packages/router/test/release.test.ts` — *tags one artifact, because there is one* — and by the trial's own check, which asks the Marketplace what it serves. |
| 6 | `--help` unusable on subcommands | `packages/router/test/lifecycleCli.test.ts` — *answers --help on a SUBCOMMAND with that subcommand's own arguments*, for `start`, `declare` and `plan`, and never with "expected one argument". |
| 7 | A gate's error text names the wrong file | `packages/router/test/gates.test.ts` — *names the file the operator edits, and never the packaged layer beneath it*: the freshness gate's remediation cites `dabbler.yaml` and never `router-config.yaml`. |
| 8 | No way to record "the selector chose nothing" | `packages/router/test/preverify.test.ts` — `none-selected` is an outcome the record carries, and the framework re-runs the selection rather than trusting a claim that nothing was needed. |
| 9 | Planned sessions invisible; the project reads as finished | `packages/router/test/projection.test.ts` — *projects as 'planned', which the ledger's own vocabulary does not contain*, and `plannedSessions` is counted for the same reader the Work Explorer and `dabbler status` both use. |

All nine are now held by something that fails if the behaviour comes back.
Eight by a test; the ninth by the fact that the thing it complained about no
longer exists, with the tag rule that replaced it under test.

## What the trial found

*Filled in by session 73, against the published pair.*
