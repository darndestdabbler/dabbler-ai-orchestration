# S1 — The walk outline

> **What this is.** The shape of `docs/tutorials/three-module-pipeline.md`: four
> parts, what each proves, where each one stops, and the single happy path. This
> is what Session 2 writes against and Session 4 walks.
>
> The two contracts it depends on are in
> [`s1-service-contracts.md`](s1-service-contracts.md). Everything below assumes
> they are settled.

---

## 1. The rulings this session makes

Each is settled here so Sessions 2–4 do not re-open it. Where a ruling changed
something the spec proposed, that is called out — the spec's *configuration
block* is immutable at runtime, but a factual claim in its prose that turns out
to be false is a defect, not a decision.

### R1 — Module naming: the owner is in the slug, not a version number

| Field | Value | Example |
| --- | --- | --- |
| `slug` | `{owner}-{service}` | `priya-converter` |
| `title` | `{Service} ({Owner})` | `Converter (Priya)` |
| `codeRoots` | `modules/{owner}/{service}` | `modules/priya/converter` |

**This revises the spec's POC recommendation** (slug `converter-v1`, title
`Converter v1 — Priya`), and the reason is a fact the POC did not test.

Slugs must be unique in `docs/modules.yaml` — the product rejects a duplicate.
Version-in-slug stays unique **only if each member draws a distinct version
number**: Priya v1, Sam v2, Chen v3. Nothing enforces that. If three people each
independently declare "v1" — which is what a person alone at their desk on day
one will do — nine declarations collapse to three slugs and six are rejected.
Avoiding that requires a central allocation step ("who is v2?") *before anybody
can start*, which directly contradicts the model's premise that **nobody waits on
anybody**.

Owner-in-slug is unique with no allocation step at all. Both consulted engines
reached the same conclusion independently
([`s1-layout-naming-consensus.json`](s1-layout-naming-consensus.json)); they
differed only on component order and title wording, which is not a material
disagreement, so it was synthesized rather than escalated.

**Why `priya-converter` and not `converter-priya`.** The engines split on this and
neither gave a reason. The deciding one: the slug then reads as its own code root
with the separators swapped — `modules/priya/converter` ⇄ `priya-converter` — so
there is **one rule to teach, not two**, and any surface that ever sorts
alphabetically still groups a member's three modules together. Render order comes
from manifest order, not from the slug (confirmed, below), so this costs nothing.

**Why the title is `Converter (Priya)`.** The title is what the tree renders and
is freely editable; the reader scanning it wants the *service* first, because
that is what the row is, with the owner as the qualifier. Titles can be re-edited
whenever people join or leave. Slugs cannot — they are stamped into every session
set's `spec.md`.

**When a member leaves.** Retitle, reassign the code root's reviewer, and leave
the slug alone. A slug is a durable identity, like a commit hash; renaming it
would orphan every set that stamped it. Both engines independently flagged
name-in-a-durable-identifier as the strongest objection to their own
recommendation, and this is the mitigation: **the name is in the identity, but
the identity is never what a human reads.**

**A solo reader uses their own name.** `alex-converter`, `alex-persistence`,
`alex-watcher`. Not a placeholder like `solo` or `me` — a placeholder has to be
renamed the moment a second person appears, which is exactly the migration a
durable slug must not need.

### R2 — Code roots: one directory per member, and collision is structural

```
modules/
  priya/
    converter/
    persistence/
    watcher/
  sam/
    converter/
    ...
```

Two members cannot write to the same **code** path, because no code path is
shared. This is not a convention people have to remember; it falls out of the
directory tree. The negative test in the spec — *"it fails if two members' work
collided"* — is satisfied structurally rather than by discipline.

> **One path IS shared, and an earlier draft of this ruling wrongly said none
> was:** `docs/modules.yaml`. Every member's modules are declared in that one
> file. Three people each appending three entries to the same YAML list on three
> branches is a merge conflict on day one — on the very first shared artefact,
> in a tutorial whose premise is that nobody waits. **R9 settles it.**

Note this deliberately differs from the reference solution's own layout
(`modules/{service}/src/…`), which has one member and therefore no member tier.
Session 2 must not copy the answer key's paths by reflex; the answer key is one
member's worth of the tree.

### R3 — Manifest order is member-major, and it is the only ordering mechanism

```yaml
modules:
  - slug: priya-converter      # Priya's three, contiguous
  - slug: priya-persistence
  - slug: priya-watcher
  - slug: sam-converter        # then Sam's three
  ...
```

Confirmed against the running product: render order follows manifest order and is
**not** alphabetical. There is no per-member sub-tree in the Work Explorer and
none can be created — nine modules are nine flat siblings. Manifest ordering is
therefore the *entire* mechanism for keeping the tree readable, and it is free.

**Session 2 must not write anything implying a "member → their modules"
expansion tier.** It does not exist.

### R4 — Ownership routing follows the code root

```
# .github/CODEOWNERS
/modules/priya/   @priya-handle
/modules/sam/     @sam-handle
/modules/chen/    @chen-handle
```

One line per member, not per module — because the member tier in the path is what
ownership actually tracks. On Azure DevOps the same thing is a branch policy:
**Project Settings → Repositories → Policies → Automatically included reviewers**,
path filter `/modules/priya/*`, required reviewer Priya.

Both hosts, stated as alternatives. The reader's repository stays host-neutral;
only the answer key is GitHub-specific, and it is linked, never cloned.

> **This procedure MOVES here; it is not duplicated here.** Today it lives in
> `adopt-dabbler.md` **Part 5 step 3** (*"Route reviews by ownership"*), including
> the Azure DevOps equivalent. **Session 3 deletes Part 5.** So the sequencing is
> a hard constraint, not a preference:
>
> - **Session 2 must write the routing procedure in full**, not link to Part 5.
> - **Session 3 must not delete Part 5 until Session 2's replacement exists** —
>   it deletes second, and it verifies the content landed here before removing it.
>
> A routed review of this outline read the pre-trim `adopt-dabbler.md` and
> concluded the opposite — that R4 duplicates Part 5 and should link to it. That
> reading is correct about *today* and wrong about the *end state*: link to Part 5
> and Session 3 breaks the link. Recorded here so the finding is not re-raised and
> acted on in the wrong direction. The spec's ownership table is the authority and
> it assigns **ownership routing across modules** to this tutorial.

### R5 — Port allocation: two bands, no central allocation

| Band | Who | Ports |
| --- | --- | --- |
| `51xx` | **yours** | converter `5101`, persistence `5102`, watcher `5103` |
| `52xx` | **the other version you are testing against** in Part D | converter `5201`, persistence `5202` |

Everyone uses `51xx` for their own services on their own machine, so there is
nothing to allocate and nothing to coordinate. Part D never moves your `watcher`
— it stays on `5103` — it only changes where your `watcher` *looks*.

**Proven live on 2026-08-03:** a second `converter` was started on `5201`
alongside the one on `5101`; both answered `GET /health` at the same time.

### R6 — Part D is one machine, `localhost` throughout, two settings

The two settings, and there are no others:

```json
"Watcher": {
  "Converter":   { "BaseAddress": "http://localhost:5201" },
  "Persistence": { "BaseAddress": "http://localhost:5202" }
}
```

**Proven live, for BOTH services, with a falsifier.** Two runs were made.

**Run 1 — the converter half.**

1. `converter` on `5101`; a second `converter` on `5201`. Both healthy at once.
2. `watcher` repointed at `5201` by configuration only — **no code edited,
   nothing rebuilt**.
3. A CSV processed end to end: `Stored`, rows in SQL Server, file archived.
4. **The `converter` on `5101` killed.** The pipeline kept working.

**Run 2 — both services, with nothing on the `51xx` band at all.** A first draft
of this ruling proved only the converter half, which left the persistence
repoint — half of Part D's actual mechanism — asserted rather than shown. So:

1. `converter` on `5201` **and** `persistence` on `5202`. **Nothing started on
   `5101` or `5102`** — both confirmed unreachable before the run.
2. `watcher` repointed at both, by the two configuration values and nothing else.
3. `POST /run-now` →
   `{"fileName":"orders-both-repointed.csv","outcome":"Stored","detail":null,"batchId":"019fc888-1092-7836-8e83-355d31b4d054"}`
4. Read back **through the `5202` persistence**: `GET /batches/019fc888-…`
   returned all three orders. The file was in `archive\`.

Run 2 is the one that matters, and Session 2 should claim only what it supports:
both dependencies were replaced, the originals were provably absent, and the
reader changed two settings.

> **One thing Run 2 does not isolate.** Both `persistence` instances used the
> **same LocalDB database**, because the connection string is the same default.
> That is also what a real reader on one machine gets, so it is the honest
> configuration to teach — but it means the run proves *the watcher reached the
> service on `5202`*, not *that service owned a separate store*. Session 2 should
> not imply per-member databases; nothing in this tutorial sets one up.

**What this does NOT prove.** Both instances were the *same build*. This proves
the **repoint mechanism**, not **cross-implementation conformance**. A reader
whose `watcher` drives a *teammate's* `converter` gets the conformance evidence;
a solo reader running a second copy of their own service gets only the mechanism.
Session 2 must say so plainly rather than letting a solo reader believe they have
demonstrated interchangeability. This is the honest form of the spec's own
sentence — *"a single implementation can never demonstrate it."*

### R7 — Cross-machine is an appendix item, and its firewall step is unverified

`--urls http://0.0.0.0:5101` makes the service listen on all interfaces and
answer on the machine's LAN address. That much is confirmed.

**Traversing Windows Firewall from a genuinely remote machine is NOT verified**
and cannot be, from one machine. The appendix says what to do when it fails
rather than implying it works, and **must not claim to have been tested**. The
default binding stays `localhost`.

### R8a — Where the reader is standing when Part A begins

**The reader does not start from an empty folder.** They start from a repository
that already has Dabbler in it, and they already know how to run one AI session.

Session 2's prerequisite section has **two halves**, and R8b below is only the
second one. The first:

| Already done, before this tutorial opens | Owned by |
| --- | --- |
| One successful local AI session | `hello-world.md` — **link** |
| VS Code + the Dabbler extension + Python + an AI agent | `adopt-dabbler.md` Parts 1–2 — **link** |
| A repository created, cloned, with Dabbler set up and `main` protected | `adopt-dabbler.md` Part 3 — **link** |
| Having shipped **one** module through a pull request | `adopt-dabbler.md` Part 4 — **link** |

**Not re-explained here — linked.** But it must be *stated*, in one short block at
the top, because a reader holding only the .NET SDK and LocalDB would reach
"declare your three modules" with no tooling to declare them with and stall on the
tutorial's first instruction.

This was the routed review's Critical finding, and it was right: the draft
outline mentioned the entry state only in passing in §4, under an ownership
heading, where Session 2 could easily have read it as a note about *documentation
boundaries* rather than as a *prerequisite*.

The **team** case adds one line: one member creates the repository by following
`adopt-dabbler.md`; the others clone it and do the one-time install. A solo
reader creates it and is the only member.

### R8b — The build prerequisites are **Windows**, the .NET 10 SDK **and** SQL Server LocalDB

**This corrects a false claim in the spec's prose** (*"having installed nothing
but the .NET 10 SDK"*). Surfaced by the routed step-3.5 analysis, then checked on
this machine.

LocalDB is a **separate installed product** — the registry here shows
`Microsoft SQL Server 2025 LocalDB` and `Microsoft SQL Server 2019 LocalDB` as
their own MSI entries, alongside but independent of the SDKs `dotnet --list-sdks`
reports. It arrives with Visual Studio or with its own installer; **the .NET SDK
does not bring it.** A developer with VS Code and the SDK alone has no database,
and would discover that partway through Part B — the worst possible moment,
because they would have a green Part A and a failure that looks like their code.

The spec's own risk register already suspected this (*"the walk must confirm what
a machine with only the .NET SDK actually has"*) and assigned it to Session 4.
**Session 4 is too late**: Session 2 writes the prerequisite list, and a reader
who follows a false one has already lost the time.

**And LocalDB is Windows-only**, which makes the happy path Windows-only. The
reference solution's own design notes say so — *"Its limits are honest ones:
Windows only, and awkward to reach from Java."* .NET, VS Code, Python and Dabbler
are all cross-platform, so nothing else in the stack warns a macOS or Linux
reader; they would get through Part A on the advertised path and hit a wall in
Part B. That is the *same* failure R8b exists to prevent, one platform over.

So the honest **build** prerequisite list is **Windows plus two installs**, on
top of everything in R8a:

0. **Windows 10 or 11** — a real requirement of the walk, not a preference.
1. **.NET 10 SDK** — `dotnet --list-sdks` must show a `10.0.x`.
2. **SQL Server LocalDB** — `sqllocaldb info` must print `MSSQLLocalDB`.

**Session 2 states the Windows requirement in the prerequisites, and stops
there.** A reader on macOS or Linux must learn *before Part A* that this
tutorial's walk is Windows-only — that is the whole point of surfacing it — and
they must **not** be handed a substitute path.

A first attempt at this fix did hand them one: *"set
`DABBLER_PIPELINE_SQL=container` and everything else is identical."* That was
wrong twice over. It is **unverified** — every run this session made, including
both Part D runs, used LocalDB, and no container was started at any point — and
it **contradicts the spec's own non-goal**, which puts containers in the
appendix. Promising a supported route that nobody has walked recreates exactly
the mid-course stall this ruling exists to prevent, one platform over.

So the honest wording is a subtraction, not an addition:

> **This walk is written for Windows 10 or 11.** The pipeline itself is
> cross-platform .NET; it is the zero-setup database that is not. If you are on
> macOS or Linux, the appendix's container path runs the same code and the same
> tests — but it is not the walk, and the timings and copy-pasteable commands
> here assume Windows.

`DABBLER_PIPELINE_SQL=container` stays in the appendix, where the spec put it,
described as what it is rather than as an equivalent happy path.

> **Recorded for Session 4 and the operator.** Nobody has walked this tutorial on
> macOS or Linux, and this session did not verify the container path. If the
> team's staff are all on Windows this costs nothing; if they are not, verifying
> a non-Windows walk is a **follow-on set**, not something Session 2 should
> improvise into the prerequisites.

Both alternatives were considered and rejected as out of scope: a container on
the happy path is an explicit non-goal, and swapping to SQLite would redesign the
reference solution, also an explicit non-goal. There is **no winget package for
LocalDB alone** (checked: `winget search Microsoft.SQLServer` returns only full
Express/Developer editions), so Session 2 must give the reader a real download
link and a one-line verification command, not a fabricated one-liner.

> **Flagged for the operator.** This is the one place this session contradicts
> the spec's prose. It is a factual correction, not a scope change, and the
> success criterion in Session 4 should read *"on Windows, having installed the
> .NET 10 SDK and LocalDB"*. Raised again at Step 9.

### R9 — The manifest is declared ONCE, up front, by whoever creates the repository

**All nine entries land in `docs/modules.yaml` in a single commit, before anybody
branches.** The person who created the repository writes them — the same person
`adopt-dabbler.md` already puts in that seat — and pushes. Only then does
everyone start Part A.

```yaml
modules:
  - slug: priya-converter
    title: Converter (Priya)
    codeRoots: [modules/priya/converter]
    planPath: docs/modules/priya-converter/project-plan.md
  - slug: priya-persistence
    title: Persistence (Priya)
    codeRoots: [modules/priya/persistence]
    planPath: docs/modules/priya-persistence/project-plan.md
  # ... priya-watcher, then Sam's three, then Chen's three
```

Every entry carries a **unique `planPath`**, derived from the slug. No entry
carries `touches:`.

**Why up front rather than each member declaring their own.** The alternative —
each member adds their own three entries when they start — is a guaranteed
three-way conflict on a single YAML list, and it is the *first* thing the team
does together. Losing an afternoon to that would teach the opposite of the
lesson.

This costs the model almost nothing, and the reason is a fact the POC already
established: **nine declared modules with zero session sets render cleanly, with
no warnings.** The manifest is a *declaration of intent*, not a record of work
done. Writing all nine on day one produces exactly the tree the POC's fourth
finding shows — nine named rows waiting for work — which is a better first
impression than an empty tree that fills in raggedly.

**"Nobody waits on anybody" is now precise, and Session 2 should state it
precisely:** one short bootstrap step is shared and sequential — agree the
contracts, declare all nine modules, push. **Everything after that is parallel
and nobody waits.** A tutorial that claims zero coordination and then hands the
reader a shared file is not teaching teamwork, it is mis-selling it.

**A solo reader does the same thing** and it takes a minute: three entries, one
commit, no conflict possible.

---

## 2. The four parts

Each part has **its own finish line**, and a reader must be able to stop there,
close the laptop, and come back days later. This is a hard requirement on Session
2, not a nicety: *this is a course, not a sitting*, and a reader who cannot stop
cleanly after Part A will not start Part B.

> ### Finish lines are BEHAVIOURAL. Test counts are not acceptance criteria.
>
> An earlier draft of this outline made *"31 tests green"* Part A's finish line.
> That is wrong, and wrong in a way that would have damaged the tutorial's whole
> premise: **the reader's AI session does not produce the answer key's code**, so
> it does not produce the answer key's test decomposition either. A reader with
> 28 passing tests and a fully conforming `POST /convert` would have been told
> they had not finished.
>
> So, for every part:
>
> - **The finish line is:** every test *your* implementation has is green, **and**
>   the named observable behaviour happens.
> - **The answer key's counts (31 / 24 / 74, and 12 tests in 97 ms) are
>   observations, never targets.** Session 2 may quote them as *"for reference,
>   the answer key has 31 here"* — and must never phrase them as a bar to clear.
> - A reader whose count differs is not behind. **A reader whose count matches
>   exactly should wonder whether they copied.**
>
> This applies wherever a number appears in this document.
>
> **Flagged for the operator — the spec's own table has the same defect.**
> `spec.md`'s Parts table gives the finish lines as `31 tests green` /
> `24 tests green` / `74 green`. That is where this draft inherited them, and it
> is the same class of error as R8b: a factual claim in the spec's prose that
> does not survive contact with the model the spec itself describes. This ruling
> supersedes it for Sessions 2–4. Raised again at Step 9.

### Part A — `converter`

| | |
| --- | --- |
| **Builds** | `converter` |
| **Proves** | a module with no dependencies is buildable, testable and finishable on its own |
| **Finish line** | your converter's tests are green, **and** `POST /convert` answers a real CSV upload with a schema-valid batch and a bad file with a `400` naming the line *(answer key: 31 tests)* |
| **Depends on** | nothing but the prerequisites |
| **Stop here?** | Yes. Nothing later reaches back into Part A. |

Opens with the contract, not with code. The reader declares
`{owner}-converter`, sets its code root, and runs the plan → decomposition →
implementation lifecycle — which `adopt-dabbler.md` owns and this tutorial
**links**.

The teaching beat: the reader's AI session will not produce the answer key's
code, and that is fine. The answer key is what "done" looks like, not what
"correct" looks like.

### Part B — `persistence`

| | |
| --- | --- |
| **Builds** | `persistence` |
| **Proves** | a second independent module; two modules that share no code cannot break each other's build |
| **Finish line** | your persistence tests are green, **and** a posted batch's rows read back out of SQL Server, **and** re-posting the same `sourceFile` returns the original `batchId` with `duplicate: true` *(answer key: 24 tests)* |
| **Depends on** | nothing — **not** on Part A |
| **Stop here?** | Yes. |

The beat that earns its place: **`persistence` re-validates what `converter`
already validated.** A reader who has just written the same date check twice
needs telling *why* — it is reachable on its own, so it does not get to assume
who called it. This is where a service boundary stops being a diagram and starts
costing something.

Also where **the duplicate rule** lands: same `sourceFile` twice returns the
original `batchId` with `duplicate: true`. It looks like an edge case and is the
mechanism that makes the whole pipeline safe to retry.

### Part C — `watcher`, in two phases

| | |
| --- | --- |
| **Builds** | `watcher` |
| **Proves** | a module that *composes* two others without importing either; and a decision table tested with nothing running |
| **Stop here?** | Yes, and this is the natural end for most readers. |

**The two phases have different dependencies, and conflating them is a defect.**
An earlier draft of this outline said Part C *"depends on both contracts — not on
Parts A and B being finished"* while also requiring a real CSV's rows in a
database. Both cannot be true. The claim was inherited from the retired
three-people-one-module model, where a `watcher` author genuinely had no
teammates' services to run; in **this** model the reader built those services
themselves, in Parts A and B.

| | Phase A | Phase B |
| --- | --- | --- |
| **Depends on** | **the two contracts only** — nothing running, nothing built but `watcher` | **runnable `converter` and `persistence`** |
| **Finish line** | your decision-table tests green, covering all four outcomes *(answer key: 12 tests, 97 ms)* | your full suite green **and** a real CSV's rows in a database, the file in `archive\`, a bad file in `failed\` *(answer key: 74 tests overall)* |

**Phase A — the decision table, against stubs.** All four outcomes, no database,
no file server, no other module started. `converter` and `persistence` exist by
now, which is exactly why the motivation must be the correct one:

> Your unit tests must not require other services to be running.

Never the stale reason (*a teammate has not finished*), which this model makes
plainly false.

**Phase A is genuinely reachable without A and B**, and Session 2 may say so —
that is what makes it a real demonstration rather than a ritual. A reader who
skipped ahead, or who is following along while a teammate builds, can complete
Phase A and stop.

**Phase B — wire it up.** Both services started, a CSV dropped in a folder,
`POST /run-now`, and the rows appear. This is where the reader first sees all
three modules alive at once.

**Phase B requires runnable services, and Session 2 must say where they come
from.** For the ordinary reader they are Parts A and B, already built. For a
reader whose own services are not working, the honest fallback is a teammate's —
which is Part D's mechanism arriving early, and is worth naming as such rather
than leaving them stuck.

**`touches:` stays absent from every manifest entry in this tutorial, and Session
2 says why.** The three modules talk over HTTP and never read each other's
source, so there is no code-level dependency to declare. The contrast with a
module that *does* share code — where `touches:` is the right answer — is a
lesson in itself, and it is the same fact that makes Part D possible at all.

### Part D — the payoff, and nothing is built

| | |
| --- | --- |
| **Builds** | *nothing* |
| **Proves** | your `watcher` only ever knew a contract |
| **Finish line** | your `watcher` drives **someone else's** `converter` and `persistence` |
| **Changes** | **two configuration values.** No code, no rebuild. |
| **Stop here?** | It is the end. |

Because every member's modules live in the **same repository**, another member's
`converter` is already on the reader's disk. Start it on `5201`, start their
`persistence` on `5202`, change two settings, run.

Everything stays on `localhost`. No binding change, no firewall rule, no second
machine.

**Part D fails the tutorial if the reader had to edit any code.** That is the
acceptance test, and Session 4 confirms it.

**The solo reader is told the truth here** (R6): with one implementation, Part D
demonstrates the mechanism, not conformance. They can either skip it, or build a
second version later and come back.

---

## 3. The single happy path

One path through, and only one, so a stall has one cause:

| Choice | The happy path | Where the alternative lives |
| --- | --- | --- |
| Platform | **Windows 10/11** *(R8b — not a preference; LocalDB is Windows-only)* | appendix, unverified |
| Database | **LocalDB** | appendix — container, or any SQL Server |
| File source | **a drop folder** | appendix — real SFTP via Rebex |
| Hosting | **`dotnet run`, three terminals** | appendix — IIS |
| Machines | **one** | appendix — cross-machine, firewall step unverified |
| Container engine | **none** | appendix |

`dotnet test` runs the whole suite in **8.9 s** on the happy path. The container
path runs the *identical* tests in **113.7 s**; both were run and both pass. That
comparison is worth one sentence and no more — a reader who is offered two paths
on the walk will spend their attention choosing instead of building.

**The appendix is last, is one section, and everything optional is in it:**
containers (`DABBLER_PIPELINE_SQL` / `DABBLER_PIPELINE_SFTP`), real SFTP, IIS
publishing, and cross-machine Part D.

**Rebex Tiny SFTP Server is linked, never vendored** — its licence forbids
redistribution — and Session 2 must state that it is **GUI-only** so nobody tries
to script it into an automated run.

---

## 4. Ownership — what this tutorial must NOT explain

The no-duplication rule is unconditional: one owner per procedure, everyone else
links. Session 2 greps for violations.

| Concept | Owner | Here |
| --- | --- | --- |
| First successful local session | `hello-world.md` | link |
| Installing Dabbler, guardrails, branch protection | `adopt-dabbler.md` | link |
| Creating and cloning the repository | `adopt-dabbler.md` | link |
| Declaring **a** module; the plan/decomposition lifecycle | `adopt-dabbler.md` | link |
| Shipping one module through a pull request | `adopt-dabbler.md` | link |
| Recovery, raw git, custom hosts, failure states | `release-and-recovery.md` | link |
| **Several modules in one repository; the dependency DAG** | **here** | — |
| **Agreeing a service contract before building** | **here** | — |
| **Composing over a contract, without `touches:`** | **here** | — |
| **Testing a module with none of its dependencies running** | **here** | — |
| **Several versions of a service maintained side by side** | **here** | — |
| **Ownership routing across modules** | **here** | — |
| **Integrating with someone else's version by configuration** | **here** | — |

**The team brings its own repository.** There is no starter repository to clone.
One member creates it by following `adopt-dabbler.md` — which is precisely why
that document keeps ownership of repository creation — and the others clone it
and do the one-time install. This tutorial picks up at *"agree the contract, then
declare your modules."*

**Session 3's trim depends on this table**, so a change here is a change to
Session 3's scope.

---

## 5. Handover — what Sessions 2, 3 and 4 inherit

**Session 2 must:**

- Use R1–R9 as settled. Do not re-derive the naming scheme or re-litigate ports.
- **Never turn a number into a bar.** Finish lines are behavioural; the answer
  key's counts are observations. See the box at the top of §2.
- **Write the day-one bootstrap step** (R9): agree the contracts, declare all
  nine modules in one commit, push — *then* everyone starts. Say plainly that
  this one step is shared and sequential and that everything after it is not.
- Quote only literals from [`s1-service-contracts.md`](s1-service-contracts.md).
  Every one is from a real run; **none may be paraphrased**, and none may be
  invented to fill a gap.
- Write **both halves** of the prerequisite section: the entry state the reader
  arrives in, linked not re-explained (R8a), and the **Windows + two-install**
  build list (R8b) — never the spec's one-install claim. State the Windows
  requirement plainly and **do not offer a substitute path**; the container route
  stays in the appendix and is not claimed to be equivalent.
- **Write the ownership-routing procedure in full** (R4). Do not link to
  `adopt-dabbler.md` Part 5; Session 3 deletes it.
- Give Phase A the correct motivation.
- Mark Part D's solo limitation and the appendix's unverified firewall step.
- Link `https://github.com/darndestdabbler/dabbler-ai-orchestration-multimodule-demo`
  as the answer key. **There is no placeholder to inherit** — the repository is
  published and reachable (confirmed this session). A session that writes a
  placeholder has introduced a defect.

**Session 3 inherits** the ownership table in §4 as the definition of what moves
out of `adopt-dabbler.md` — **and one hard ordering constraint from R4**: before
deleting Part 5, confirm the ownership-routing procedure (`CODEOWNERS` plus the
Azure DevOps *Automatically included reviewers* equivalent) actually exists in
`three-module-pipeline.md`. Deleting Part 5 while the replacement is missing
destroys the only copy of that procedure in the estate. This is a *content*
check, not a link check — a dead-link grep would pass either way.

**Session 4 inherits** the four finish lines in §2 as the things to time
separately, and the negative tests: Part D changed no code; `watcher`'s unit
tests needed nothing running; the reader could stop cleanly after Parts A and B.

---

## 6. Evidence produced this session

| Claim | How it was established |
| --- | --- |
| Both contracts, every literal | Live capture against running services |
| All four decision-table rows | Forced live, including killing services |
| Part D repoints **both** services | Live: converter on `5201` **and** persistence on `5202`, with `5101`/`5102` confirmed unreachable; batch stored and read back through `5202` |
| The repoint is not an assumption | Falsifier — the original service killed, pipeline kept working |
| Two versions coexist on one machine | Live, `5101` and `5201` healthy together |
| Nine modules render as nine flat rows | **`poc-nine-modules-dom.ts` — asserted on RENDERED DOM**: headless Chromium running the shipping `media/session-sets-tree/client.js`, fed the real snapshot over the real `postMessage` protocol; 9 × `role="treeitem" aria-level="1"` |
| Grouping is one level deep | Same — the rendered tree has exactly `aria-level` 1/2/3 and **no level-1 row contains another level-1 row** |
| Manifest order beats alphabetical | Same — rendered document order, with a guard asserting the fixture actually distinguishes the two |
| Day-one empty tree renders clean | Same — nine module rows, zero set rows, zero warning glyphs |
| The payload behind all four | `poc-nine-modules-ondisk.ts` — the product's own manifest parser, set discovery and grouping, from a real on-disk workspace |
| Version-in-slug collides without allocation | `poc-nine-modules-ondisk.ts`, pinned as an assertion |
| Answer key is public | `git ls-remote` resolved `HEAD` |
| LocalDB is not part of the SDK | Installed-products registry on this machine |
| No winget package for LocalDB alone | `winget search Microsoft.SQLServer` |
| The outline does not duplicate procedure | Routed analysis against `adopt-dabbler.md` + `hello-world.md` — [`s1-outline-ownership-review.json`](s1-outline-ownership-review.json) |

**Both of that review's findings were acted on**, one as given and one against
its recommendation:

| Finding | Severity | Disposition |
| --- | --- | --- |
| The prerequisite list omits the reader's entry state — they would stall on instruction one | Critical | **Accepted.** R8a added; R8 split into R8a (entry state, linked) and R8b (build installs). |
| R4 duplicates `adopt-dabbler.md` Part 5's routing procedure; link instead | Major | **Accepted as a real hazard, rejected as a fix.** Session 3 deletes Part 5, so linking to it is a dead link by the set's own end. R4 now records the *transfer* and the S2-before-S3 ordering constraint. The reviewer read the pre-trim document; the spec's ownership table assigns this concept here. |
