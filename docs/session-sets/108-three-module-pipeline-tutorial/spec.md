# Three-Module Pipeline Tutorial Spec

> **Purpose:** Dabbler has a tutorial for one person's first session
> ([`hello-world.md`](../../tutorials/hello-world.md)) and one for a person shipping
> a module in a real repository ([`adopt-dabbler.md`](../../tutorials/adopt-dabbler.md)).
> It has nothing for the shape the product was designed around — **several modules,
> built independently, composed over agreed contracts**. This set writes that
> tutorial. **Every reader builds all three modules**, alone or alongside teammates,
> and then integrates across people by **changing two configuration values**. A
> three-module .NET 10 CSV pipeline was designed, built and proven first (74 passing
> tests) and is published as a public answer key, so the tutorial teaches a result
> rather than an aspiration.
> **Created:** 2026-08-03
> **Prerequisite:** None in this repo. **One operator precondition** — publishing
> the answer key. See *Operator preconditions*; it is a hard blocker for S1.
> **Session Set:** `docs/session-sets/108-three-module-pipeline-tutorial/`
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: true         # The deliverable is a human experience, and a long one. Whether a reader finishes three modules without stalling, and whether two readers' services actually interoperate, are not knowable from a diff. Set 107 proved the walk finds what review does not.
requiresE2E: false        # This set ships documents — a tutorial, an estate trim, a deletion. No extension or router code changes, so there is no Dabbler behaviour for an E2E test to cover and L-064-12 does not arm. The reference solution carries its own 74 tests.
uatStyle: ad-hoc
uatScope: per-set
pathAwareCritique: advisory
```

> **Rationale.** Same posture as Set 107, one flag different: 107 armed
> `requiresE2E` because it shipped a VS Code command whose last step was Explorer
> rendering. This set ships no such surface, so arming E2E would buy a gate with
> nothing behind it.

---

## Project Overview

### The model — everyone builds everything, in one repository, integrated by configuration

**Operator decision, 2026-08-03. Settled; do not re-litigate at runtime.**

**One repository, shared by the team.** The contract is agreed first. Each member
then builds **their own version of all three modules**, in their own code roots.
Any member's `watcher` can then be pointed at any member's `converter` and
`persistence` by changing two configuration values and nothing else.

Several versions of a service living side by side is not an artefact of the
tutorial — it is what a team maintaining a service actually does. In production
those versions are often separate endpoints of one deployment, but nothing requires
that; here they are separate deployables, which is simpler to reason about and
happens to be what makes Part D possible.

| Part | Builds | Finish line |
| --- | --- | --- |
| A | `converter` | 31 tests green |
| B | `persistence` | 24 tests green |
| C | `watcher` — Phase A against stubs, Phase B wired up | 74 green, a CSV's rows in a database |
| **D** | *nothing* — repoint two settings at another version of the two services | **your `watcher` drives someone else's `converter`** |

Everyone gets the benefit of every module; nobody is stuck owning only the easy
one. Everyone still works at the same time, because nobody is waiting on anybody.

**Why this model:**

- **Solo is first-class, not a fallback.** Parts A–C are the whole tutorial for one
  person. Part D is the payoff and is skippable — or done solo against a second
  version the same reader builds later. There is no second path to keep in step.
- **Interchangeability is the proof.** If your `watcher` drives someone else's
  `converter` with no code change, the two implementations genuinely honour the same
  contract. Conformance demonstrated, not asserted — and a single implementation can
  never demonstrate it.
- **Everyone gets every module.** Nobody is stuck owning only the easy one, and
  everyone still works at the same time because nobody is waiting on anybody.
- **One repository keeps the multi-person lessons.** Ownership routing, review by a
  teammate, and a Work Explorer showing everyone's modules in flight all survive —
  they would have been lost had each reader worked in isolation.

**Nobody's work collides, because nobody shares a path.** An earlier draft of this
spec claimed three people building all three modules in one repository was a merge
conflict; that was wrong. It is only true if everyone writes to the same code root,
and nothing requires that. Each member's modules have their own roots and their own
`modules.yaml` entries.

### Proven before committing: the Work Explorer at nine modules

The open risk was that three members × three modules would crowd the Explorer. It
was tested rather than assumed, by driving the **shipping** grouping functions
(`computeVisibleModules`, `bucketSets`) with a nine-module manifest —
`tools/dabbler-ai-orchestration/src/test/poc-nine-modules.ts`, four assertions, all
passing. **The risk is closed.** Four findings, all load-bearing:

1. **Nine modules render cleanly.** All nine come back `declared`, none as a
   `fallback`, none carrying a warning. **Nine top-level rows collapsed**, 51 fully
   expanded — a normal tree, not a wall.
2. **Module grouping is exactly one level deep; it does not nest.** There is no
   "member → their three modules" tier, and none can be conjured: nine modules are
   nine flat siblings. Any writing that implies a per-member sub-tree is wrong.
3. **Manifest order controls the order — it is not alphabetical.** Authoring the
   manifest member-major keeps each person's three modules contiguous. That is the
   whole mechanism for keeping the tree readable, and it is free.
4. **Day one renders.** Nine declared modules with **zero sets** still appear, with
   no warnings — empty is a healthy state. The team's first look is nine named rows
   waiting for work, never an empty tree.

**Naming — recommendation revised by the POC.** Version-scoped alone
(`Converter v1`) reads well but **hides who owns what**, which matters in a shared
repository with ownership routing. The POC shows `slug` and `title` are independent:
the slug is the durable identifier sets stamp, the title is what the tree renders
and can be re-edited freely when people join or leave. So take both:

| Field | Value | Why |
| --- | --- | --- |
| `slug` | `converter-v1` | Durable; stamped into every set; does not age badly |
| `title` | `Converter v1 — Priya` | What the Explorer shows; ownership visible at a glance; freely editable |

S1 confirms this against the running product and may still choose otherwise, but it
starts from evidence rather than taste.

### What this tutorial teaches

1. **Contracts agreed before anyone writes code.** The linchpin. `POST /convert`
   and `POST /batches` are settled first; everything else — parallel work, stubbing,
   Part D — is downstream of that. A tutorial that lets readers start building
   before pinning the contracts is teaching the wrong thing.
2. **Composition over a contract, not a code import.** The three modules talk over
   HTTP and never read each other's source, so **`touches:` is deliberately absent**
   — the contrast with a code-level dependency, where `touches:` is the right
   answer, is a lesson in itself. Modules sharing no code cannot break each other's
   build, which is exactly why Part D can work at all.
3. **A dependency DAG, and tests that do not need the graph running.**
   `converter` and `persistence` depend on nothing. `watcher` depends on both — and
   its decision table is still tested with **nothing running at all**. That is Phase
   A, and it is the habit that makes a service independently buildable.

### Phase A needs re-motivating — do not drop it

In the old three-people-one-module model, C stubbed because their teammates were
not finished. **In this model the reader builds all three themselves, so by the
time they reach `watcher` the other two already exist and that motivation
evaporates.** The lesson survives with a better reason, and the tutorial must give
that reason rather than the stale one:

> Your unit tests must not require other services to be running. `watcher`'s entire
> decision table — when to archive, when to move a file aside for good, when to
> leave it and retry — is proven in **12 tests, 97 ms, with no database, no file
> server and no other module started.**

Phase A is also what makes Part D comprehensible: a reader who has stubbed the two
services already understands that `watcher` only ever knew a contract.

### The tutorial estate — Option B, decided

**Operator decision, 2026-08-03.** `adopt-dabbler.md` is trimmed to a
**single-module** walk. Everything multi-module moves here, where it can be taught
on a real multi-module solution instead of a toy `greeter`. The ladder:

| Tutorial | Scope |
| --- | --- |
| `hello-world.md` | One AI session, one task, one folder |
| `adopt-dabbler.md` | One person, **one** module, in a real repository |
| **this tutorial** | **Three** modules, built independently, composed by contract |

`docs/tutorials/adopt-dabbler-video/` is **retired** — also an operator decision.
It was six scene scripts held *"1:1 with the six parts"* of `adopt-dabbler.md`,
making the trim a double edit. Blast radius measured, not assumed: **exactly one
live inbound link**, `adopt-dabbler.md:15`. The only other references are Set 107's
activity log and change log, which are historical records and **must not be
edited**.

The **no-duplication rule is unconditional**: one owner per procedure, everyone
else links. A second explanation of any row is a defect, and **S2 greps for it**.

| Concept | Owner | Everyone else |
| --- | --- | --- |
| First successful local session | `hello-world.md` | link |
| Installing, guardrails, branch protection, creating the repository | `adopt-dabbler.md` | link |
| Declaring **a** module; the plan/decomposition lifecycle | `adopt-dabbler.md` | link |
| Shipping one module through a pull request | `adopt-dabbler.md` | link |
| **Several modules in one repository; the dependency DAG** | **this tutorial** | link |
| **Agreeing a service contract before building** | **this tutorial** | link |
| **Composing over a contract, without `touches:`** | **this tutorial** | link |
| **Testing a module with none of its dependencies running** | **this tutorial** | link |
| **Several versions of a service maintained side by side** | **this tutorial** | link |
| **Ownership routing across modules** (CODEOWNERS / ADO reviewers) | **this tutorial** | link |
| **Integrating with someone else's version by configuration** | **this tutorial** | link |
| Recovery, raw git, custom hosts, failure states | `release-and-recovery.md` | link |

> **Recovered by the one-repository model.** An earlier draft recorded cross-module
> ownership routing as a casualty, on the assumption that each reader worked in
> isolation. With one shared repository it has a home again, and it is taught here:
> each member's code roots route to that member.

**The team brings one repository.** There is no starter repository to clone. One
member creates it by following `adopt-dabbler.md` — which is exactly why that
document keeps ownership of repository creation — and the others clone it and do the
one-time install. This tutorial picks up at *"agree the contract, then declare your
modules."* A solo reader creates it and is the only member.

### The reference solution — the answer key, not a starting point

`D:\Projects\dabbler-csv-pipeline` (git, `master`), to be published publicly (see
*Operator preconditions*). Built and tested to completion *before* this spec
existed. **Sessions must not redesign it.**

Its two jobs, and neither is "the reader clones it":

- **The tutorial author quotes it.** Every expected output is a literal string from
  a real run — never invented.
- **The reader compares against it.** An AI session is not deterministic. When a
  reader's module lands somewhere different, the answer key is what "done" looks
  like. The tutorial links it and says plainly that arriving somewhere else is
  normal.

| Module | Project | Role |
| --- | --- | --- |
| `converter` | `Dabbler.CsvPipeline.Converter` | `POST /convert` — CSV in, schema-validated JSON out |
| `persistence` | `Dabbler.CsvPipeline.Persistence` | `POST /batches` — JSON in, EF Core 10 → SQL Server |
| `watcher` | `Dabbler.CsvPipeline.Watcher` | Quartz.NET poll, calls 1 then 2, files the CSV away |

Facts established by running it; treat as given, do not re-derive:

- **74 tests pass** (31 / 24 / 19, of which 7 are end-to-end).
- **No container engine is needed.** `dotnet test` runs in **8.9 s** on LocalDB plus
  a drop folder. `DABBLER_PIPELINE_SQL=container` and `DABBLER_PIPELINE_SFTP=container`
  run the identical tests against real SQL Server and real SFTP in **113.7 s**. Both
  were run; both pass.
- All three publish a `web.config` bound to `AspNetCoreModuleV2` in-process.
- A hand walk stored `orders.csv`, rejected `orders-invalid.csv` into `failed\`, and
  the Quartz trigger fired unattended on the minute boundary.
- **`CsvDeliveryProcessorTests` is Phase A's evidence** — 12 tests, 97 ms, no
  servers.
- **Part D needs no code change.** `Watcher:Converter:BaseAddress` and
  `Watcher:Persistence:BaseAddress` are already configuration.
- **Part D works on one machine, and that is the happy path.** Because versions
  coexist in one repository, a second version of `converter` simply runs on another
  port. Everything stays on `localhost`: no binding change, no firewall rule, no
  second machine, and a solo reader gets the full lesson.
- **Cross-machine is the optional extra, and is only partly verified.** With
  `--urls http://0.0.0.0:5101` the service listens on `0.0.0.0` and answers on the
  machine's LAN address — confirmed. **Firewall traversal from a genuinely remote
  machine is NOT verified**; it cannot be tested from one machine. The default
  binding stays `localhost`; opening it up belongs in the appendix, not the walk.
- **The solution file is `.slnx`**, the XML format .NET 10's `dotnet new sln` now
  emits by default. `dotnet build` / `dotnet test` and VS Code are unaffected, and it
  is far more readable than the classic format — the three-module layout is legible
  at a glance, which is a small teaching bonus. But **Visual Studio needs 17.14 or
  newer to open it**, and staff on an older VS 2022 cannot. S2 states the requirement
  in the prerequisites rather than letting a reader discover it by double-clicking.
- `docs/design.md` there records the decisions, including the two that cost real
  time (`InvariantGlobalization` breaks `Microsoft.Data.SqlClient`; a cold SQL
  Server container needs 3–5 minutes before it accepts a login).

### The success criterion

> A team shares one repository. Each member **agrees the two contracts before
> building**, declares their own three modules, and builds all three — `watcher`
> first against stubs, then wired up — finishing with **74 passing tests** and a CSV
> whose rows are in a database, having installed nothing but the .NET 10 SDK. They
> then change **two configuration values** and watch their `watcher` drive another
> member's `converter`. A solo reader does the same and is the only member.

Negative tests the walk must also satisfy:

- It fails if Part D required editing any code.
- It fails if `watcher`'s unit tests needed another module running.
- It fails if a reader could not stop cleanly at the end of Part A or Part B.
- It fails if two members' work collided — different code roots means it should not
  be possible, and if it happened the layout is wrong.

### Non-goals

- **No Java track.** Separate set, after this one is walked.
- **No starter repository.** The team creates its own; nothing to clone.
- **No versioning machinery.** Versions here are separate modules with separate
  code roots. No API version negotiation, no `/v2/` route prefixes, no
  side-by-side-deployment tooling — those are real topics and none of them is this
  tutorial's.
- **No new extension or router code.** A product gap the walk reveals is recorded
  as a finding and a follow-on set, not fixed here.
- **No containers on the happy path.** Containers, real SFTP via Rebex Tiny SFTP
  Server, and IIS deployment live in one appendix.
- **No procedure explained in two places.**
- **No estate changes beyond Option B and the video retirement.**
- **No redesign of the reference solution.**

---

## Operator preconditions — SATISFIED 2026-08-03

The answer key is published. **S1 is unblocked.**

> **https://github.com/darndestdabbler/dabbler-ai-orchestration-multimodule-demo**
> — public, MIT licensed, default branch `main`, 63 files, 5 commits.

This is the URL the tutorial links. **There is no placeholder to inherit**; a
session that writes one has introduced a defect, not preserved an option.

Recorded so it is not repeated blind — the pre-publication scan found **no
credentials and no machine-specific absolute paths** in tracked files. The only
credential-shaped strings are a documentation placeholder (`password=secret`) and a
container-local test password (`pipeline-secret`), neither sensitive. No build
output, no file over 1 MB.

The *reader's* repository stays host-neutral — staff are on Azure DevOps today and
the tutorial must work on either host. **Only the answer key is GitHub-specific**,
and it is referenced by URL, never cloned as a starting point.

Note the name mismatch, which is deliberate and harmless: the working directory is
`dabbler-csv-pipeline`; the published repository is
`dabbler-ai-orchestration-multimodule-demo`. Sessions cite the published name.

---

## Sessions

### Session 1 of 4: Contracts, and the shape of the walk

Settle everything the four parts depend on, before any prose exists.

**Steps:**

1. Register (`start_session`), read the spec, confirm the operator precondition. If
   the public URL is not available, record that and continue with a marked
   placeholder.
2. **Write down the two service contracts** as the tutorial will present them:
   `POST /convert` and `POST /batches`, request and response shapes, and the
   status-code split that drives `watcher`'s decision table (`4xx` the file's fault
   → move it aside; `5xx` the service's fault → leave it and retry). Extract from
   the reference solution rather than inventing. This is what makes Phase A
   buildable and Part D meaningful.
3. **Settle Part D's mechanics concretely.** The happy path is **one machine**: a
   second version of the two services on different ports, `localhost` throughout,
   two settings changed. Fix the port allocation so versions never collide. The
   cross-machine variant (`--urls http://0.0.0.0:…` plus a firewall rule) is an
   appendix item; record that its firewall step is unverified rather than implying
   otherwise.
4. **Settle the repository layout and module naming**, starting from the POC's
   recommendation: slug `converter-v1`, title `Converter v1 — Priya`. Fix the
   code-root convention so two members can never write to the same path, the
   member-major manifest order that keeps each person's modules contiguous, and the
   CODEOWNERS shape that follows. Route through decision-time consensus before
   falling back to `AskUserQuestion`.
5. Establish what the Dabbler work actually looks like — declaring modules, a plan
   and session set per module, ownership routing across code roots. **Confirm the
   POC's four findings against the running product**, not just the model functions:
   nine rows, one grouping level, manifest ordering, and a day-one tree of nine
   empty modules. Re-run
   `src/test/poc-nine-modules.ts` if the model changes underneath.
6. Route an analysis (`route(task_type="analysis")`) of the draft outline against
   the ownership table and against `adopt-dabbler.md`, to catch duplicated procedure
   before it is written.
7. Write `s1-walk-outline.md`: the four parts, what each proves, each part's
   independent finish line, and the single happy path (LocalDB + drop folder).
8. Verify, close.

**Creates:** `.../s1-service-contracts.md`, `.../s1-walk-outline.md`
**Touches:** nothing outside this set directory
**Ends with:** Both contracts written down, Part D's mechanics settled, the repository layout and naming convention fixed, and an outline reviewed against the ownership table.
**Progress keys:** `serviceContracts`, `partDMechanics`, `repoLayoutAndNaming`, `walkOutline`

---

### Session 2 of 4: Write the tutorial

**Steps:**

1. Register, read S1's contracts and outline.
2. Write `docs/tutorials/three-module-pipeline.md` against the outline, as **four
   parts each with its own finish line**. A reader must be able to stop after any
   part, come back days later, and resume — this is a course, not a sitting, and
   pretending otherwise is how it goes unfinished.
3. Give Phase A the **correct motivation** (unit tests that need nothing running),
   never the stale one (a teammate who has not finished).
4. Write Part D as the payoff: **two configuration values, no code change, one
   machine.** A second version of the services on other ports, `localhost`
   throughout. The cross-machine variant goes in the appendix with its firewall step
   marked as the thing most likely to fail in a real office — never in the walk.
5. Every command copy-pasteable; every expected output a literal string from a real
   run, never invented. Link the answer key and say plainly that an AI session
   landing somewhere different is normal.
6. Appendix, last section: containers (`DABBLER_PIPELINE_SQL` /
   `DABBLER_PIPELINE_SFTP`), real SFTP via Rebex Tiny SFTP Server, and publishing to
   IIS. **Rebex is linked, not vendored** — its licence forbids redistribution — and
   its GUI-only nature stated so nobody tries to script it.
7. Grep the draft against the ownership table; anything another document owns is cut
   and replaced with a link.
8. Route a documentation review (`route(task_type="documentation")`), plus a pass
   for host-neutrality of the reader's repository (Azure DevOps and GitHub both
   reachable, neither assumed).
9. Verify, close.

**Creates:** `docs/tutorials/three-module-pipeline.md`
**Touches:** nothing else — the estate edits are S3's, deliberately separated
**Ends with:** A complete four-part tutorial: no placeholder URLs, no duplicated procedure, every quoted output traceable to a real run, and each part independently stoppable.
**Progress keys:** `tutorialDrafted`, `partsIndependentlyStoppable`, `ownershipGrepClean`

---

### Session 3 of 4: Cut the estate to the ladder

A consistency pass with a wide blast radius, kept in its own session so it gets its
own verification.

**Steps:**

1. Register. Read the finished tutorial, so the trim removes exactly what moved and
   no more.
2. **Trim `adopt-dabbler.md` to the single-module walk.** Remove Part 5 (the
   teammate and the composing module) and whatever of Part 6 depended on it,
   replacing them with a forward link.
3. **Retire the video.** Delete `docs/tutorials/adopt-dabbler-video/` — nine files —
   remove the single inbound link at `adopt-dabbler.md:15`, and strip the **7**
   now-meaningless `*(scene N)*` markers from its part headings. Set 107's activity
   log and change log mention the folder historically; they are raw records and
   **must not be touched**.
4. **Reconcile all seven inbound linkers** to `adopt-dabbler.md` in this one pass —
   `README.md`, `docs/quick-start.md`, `docs/tutorials/hello-world.md`,
   `docs/module-reorganization.md`, `docs/tutorials/module-team-hello-world.md`,
   `docs/tutorials/release-and-recovery.md`, and `adopt-dabbler.md` itself. Any that
   promise a two-module outcome now promise a one-module one and point onward.
5. Add the new tutorial to every surface listing the others; check the ladder reads
   correctly from each entry point.
6. Grep the repo for dead links to the deleted folder and to any renumbered part.
   Zero is the only acceptable result.
7. Verify, close.

**Creates:** none — this session only removes and reconciles; that is the point of separating it
**Touches:** `docs/tutorials/adopt-dabbler.md`, `README.md`, `docs/quick-start.md`, `docs/tutorials/hello-world.md`, `docs/module-reorganization.md`, `docs/tutorials/module-team-hello-world.md`, `docs/tutorials/release-and-recovery.md`
**Deletes:** `docs/tutorials/adopt-dabbler-video/` (nine files, operator-sanctioned)
**Ends with:** The ladder is one task → one module → three modules; no dead links; no procedure owned twice.
**Progress keys:** `estateTrimApplied`, `videoRetired`, `linkersReconciled`, `deadLinkGrepClean`

---

### Session 4 of 4: Walk it, then cut the checklist

The walk comes **before** the checklist. Set 107's evidence is that a checklist
written from the document rather than from a walk documents intent, not reality.

**Steps:**

1. Register. Agree the walk's staffing with the operator. **All four parts are
   walkable solo on one machine** — Part D against a second version on another port
   — so a single walker is sufficient and is the expected case. A multi-person walk
   is better evidence if staff are available; the cross-machine appendix path needs
   a second machine and, if nobody walks it, is recorded as unwalked rather than
   assumed to work.
2. **Walk the tutorial.** Record where it stalls, what it assumes, and elapsed time
   per part — labelled an estimate unless a stopwatch was really held. Per-part
   timing matters more than a total here, because the tutorial's viability rests on
   each part being finishable in a sitting.
3. Confirm the negative tests: Part D changed no code; `watcher`'s unit tests needed
   nothing running; a reader could stop cleanly after Parts A and B.
4. Fix what the walk broke. A stall is a defect in the tutorial, not in the reader.
5. Author `108-three-module-pipeline-tutorial-uat-checklist.json` **from the walk**.
   Derive items from the acceptance criterion, not the feature list. **Volume is a
   quality bar:** aim at ~4 items, not 9; state the quality expectation once in the
   preamble rather than interrogating it per item; literal copy-pasteable
   `HumanAction`, literal-string `Expectation`. Set 078 is the exemplar.
6. Record product gaps as follow-on recommendations — including the Java track —
   without fixing them here.
7. Verify, close. Author `change-log.md`, run the Step 9 reorganization review, and
   run the advisory path-aware critique.

**Creates:** `.../108-three-module-pipeline-tutorial-uat-checklist.json`, `.../s4-walk-evidence.md`, `.../change-log.md`
**Touches:** `docs/tutorials/three-module-pipeline.md`
**Ends with:** A walked tutorial with per-part timings, a checklist derived from that walk, and every walk-surfaced defect either fixed or recorded as a follow-on.
**Progress keys:** `walkComplete`, `partDWalked`, `walkDefectsFixed`, `uatChecklist`, `stepNineReview`

---

## End-of-set deliverables

- `docs/tutorials/three-module-pipeline.md` — walked, four independently stoppable parts, with a container/SFTP/IIS appendix.
- `adopt-dabbler.md` trimmed to a single-module walk, its seven inbound linkers reconciled.
- `docs/tutorials/adopt-dabbler-video/` retired, no dead links left behind.
- `108-three-module-pipeline-tutorial-uat-checklist.json` — ~4 items, derived from the walk.
- `change-log.md`, the Step 9 review, and the advisory path-aware critique.
- Follow-on recommendations: the Java track, and any product gap the walk found.

---

## Risks this set should expect

- **This is a course, not a sitting, and that is the biggest risk to it being
  used.** Each reader now builds three modules — roughly three times the old
  per-person load. The mitigation is structural and is a hard requirement on S2:
  four parts, each with its own finish line, each resumable. A reader who cannot
  stop cleanly after Part A will not start Part B. S4 measures per-part time, not
  just a total.
- **The cross-machine appendix is unverified.** Binding to `0.0.0.0` is confirmed
  working; a genuinely remote machine reaching it through Windows Firewall is not,
  because that cannot be tested from one machine. This is no longer on the walk —
  keeping Part D on one machine took it off — but the appendix must say what to do
  when it fails rather than assuming success, and must not claim to have been
  tested.
- ~~**Nine modules may crowd the Work Explorer.**~~ **Closed before the set
  started** by a POC against the shipping grouping code — nine flat rows, manifest
  ordered, day-one-empty renders. See *Proven before committing* above. Retained
  here so the closure is visible rather than the risk merely disappearing.
- **The reader's AI session may not produce a working module.** The answer key
  exists precisely because sessions are not deterministic.
- **SQL Server is the one real prerequisite.** LocalDB removes the container but is
  Windows-only and ships with Visual Studio, not the bare SDK. The walk must confirm
  what a machine with *only* the .NET SDK actually has.
- **`adopt-dabbler.md` has seven inbound linkers.** A trim changing its part
  numbering or its promise must be reconciled across all seven in one pass — a
  consistency fix is global, not point-local.
- **Publishing the answer key is irreversible.** A public repository can be made
  private again, but anything cloned or indexed is out.
