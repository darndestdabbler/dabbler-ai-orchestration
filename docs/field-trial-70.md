# Field trial, session 70 — the half that needs a published router

The acceptance exercise the plan reserved for "when the operator decides to
publish". This document is written **before** the trial is run, which is the
point: an acceptance run whose answers are decided while looking at the screen
is a demonstration. Every criterion below states its expected answer first.

## What this session found before it started

**The plan's precondition was not met.** It reads: *the operator has answered
`publication` with `publish`, CI has published the tagged versions, and
`dabbler release --verify-install` passes.* On 2026-09-01, none of the three
was true:

- `registry.npmjs.org` returns **404** for `dabbler-ai-router`. It has never
  been published under that name; the `v1.0.x` tags in this repository are
  from the PyPI era, before the TypeScript port.
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
| First | Session 70 | One version — 2.8.0, declared in `version.json` and **stamped** into both manifests, the extension's dependency on the router and the lock file by `npm run stamp:version`, with `dabbler release` refusing a stale one. This document, the feedback audit below, and the plan amendment. Lands and closes. |
| Then | The CI fix session | **Green CI.** `Test` has failed on every push since session 66, and both release workflows are gated on a green run for the tagged commit, so nothing can be published until it passes. The cause is a short-path/long-path mismatch on the Windows runner: `os.tmpdir()` gives the 8.3 short form (`RUNNER~1`) while git answers with the long one (`runneradmin`), so the sessions-relative path is nonsense and the bookkeeping exclusion never matches. |
| Then | The operator | On the landed, green tree: `dabbler release` raises the brief; `dabbler owed answer --id publication --choice publish` settles it. The answer is the operator's alone — publishing cannot be recalled. |
| Then | The framework | Tags `v2.8.0`, waits for npm to serve the router, then tags `vsix-v2.8.0`. CI publishes over OIDC. |
| Last | The trial session | `dabbler release --verify-install` as a step **check**, so the install is the record rather than a claim about it; then criteria 1 and 2 below, performed against the published extension from a clean profile; then this document's findings and item 5 of the audit. |

**2.8.0 and not 2.7.0.** Sessions 65 through 69 landed after 2.7.0 was set —
the watcher, the logic-tree repairs, `session rebaseline`, the round-cap
amendment and the multi-repository Solution Explorer. Nothing was ever
published as 2.7.0, so no number is skipped in public.

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

Written by session 70; item 5 closes in the trial session on the recorded
verification, and is a dated deferred issue until it does.

| # | Item | Held by |
|---|---|---|
| 1 | Work Explorer icons render with a line through them | `tools/dabbler-ai-orchestration/src/test/suite/sessionsModel.test.ts` — *every status icon is sixteen PIXELS*: all eight media SVGs declare a unitless `width`/`height` of 16 over a `0 0 16 16` viewBox. The defect was Inkscape's `16mm`, and nothing downstream can notice a unit. |
| 2 | "Set Up New Project" should create the folder and initialise the repo | `tools/dabbler-ai-orchestration/src/test/suite/commandFlows.test.ts` — *creates the project when VS Code has no folder open at all*, *opens a folder it created before offering anything about it*, and *initialises a repository when bootstrap refuses for want of one*. |
| 3 | `dabbler.yaml` should be filled in by the framework at the right moment | `packages/router/test/owedDecisions.test.ts` — the suites question is asked once and *written* on the answer (*appends to a suites list that already exists*, *inserts into a testing mapping that carries no suites*); packaging is detected and written the same way in `packages/router/test/detectPackaging.test.ts`. |
| 4 | The Solution Explorer's purpose is unclear | `tools/dabbler-ai-orchestration/src/test/suite/actionRegistry.test.ts` — *the Solution Explorer says what it is for, and offers a way in*: the view contributes a welcome that names what it shows and carries a command, so an empty tree is not a dead end. |
| 5 | `npm i -g dabbler-ai-router` fails | **Deferred, 2026-09-01, owner: the operator.** It closes on a recorded release verification and on nothing else: `dabbler release --verify-install` performs the real clean install from the public registry, and the trial session runs it as a step check once the tags are pushed. Today the registry returns 404, so any other disposition would be a claim. |
| 6 | `--help` unusable on subcommands | `packages/router/test/lifecycleCli.test.ts` — *answers --help on a SUBCOMMAND with that subcommand's own arguments*, for `start`, `declare` and `plan`, and never with "expected one argument". |
| 7 | A gate's error text names the wrong file | `packages/router/test/gates.test.ts` — *names the file the operator edits, and never the packaged layer beneath it*: the freshness gate's remediation cites `dabbler.yaml` and never `router-config.yaml`. |
| 8 | No way to record "the selector chose nothing" | `packages/router/test/preverify.test.ts` — `none-selected` is an outcome the record carries, and the framework re-runs the selection rather than trusting a claim that nothing was needed. |
| 9 | Planned sessions invisible; the project reads as finished | `packages/router/test/projection.test.ts` — *projects as 'planned', which the ledger's own vocabulary does not contain*, and `plannedSessions` is counted for the same reader the Work Explorer and `dabbler status` both use. |

Eight are held by a test that would fail if the behaviour came back. The
ninth is held by a verification that has not been possible to run, and it says
so with a date and an owner rather than borrowing a session number as
evidence.

## What the trial found

*Filled in by the trial session, against the published pair.*
