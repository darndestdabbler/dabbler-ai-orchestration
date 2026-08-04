# Session 4 walk evidence — `three-module-pipeline.md`

> **What this is.** A record of walking
> [`docs/tutorials/three-module-pipeline.md`](../../tutorials/three-module-pipeline.md)
> — Day one and Parts A, B, C and D — on 2026-08-03, in a fresh repository,
> building all three services for real.
>
> **This is a PARTIAL walk, and the word matters.** Every command the tutorial
> prints was run, and all three services were built and driven end to end. But
> **the Dabbler lifecycle the tutorial routes each part through — `Dabbler: New
> Module`, the Work Explorer, and the plan-set → decomposition-set →
> implementation sequence — was NOT executed.** The code was written directly by
> the orchestrator acting as the reader's AI agent. §2.3 says exactly what that
> leaves unverified. An earlier draft of this document called the walk "end to
> end"; a cross-provider verifier was right that this overstated it, and the
> claim is corrected throughout rather than defended.
>
> **Captured against the fixed template S3's close prescribed:**
> `{Part, Step, Action, Expected, Actual, Defect/Stall}`, rather than freeform notes.

---

## 1. Who walked it, and under what rules

The spec's Step 1 requires the walk's staffing to be agreed with the operator.
Three costed options were put; **the operator chose the full A–D walk performed by
the orchestrator**, acting as both the reader and the AI agent the tutorial tells the
reader to hand its contract sections to.

Three rules were bound **before** the walk started, and are recorded in
`ai-assignment.md`, so they could not be relaxed once results started arriving:

| Rule | Why it exists |
| --- | --- |
| **Contract-only construction.** Parts A–C built from the tutorial's contract sections alone; the answer key's source not opened until Part D. | It makes the tutorial's central premise — that the contracts are sufficient to build against — falsifiable. Consulting the reference solution would have destroyed the test. |
| **Strict copy-paste, no silent correction.** Commands run exactly as printed; a failure is a document defect, recorded as one. | Adopted verbatim from the step-3.5 analyst's third risk: an orchestrator that quietly fixes a broken command completes the walk and finds nothing. |
| **Walk as `denmi`.** | The tutorial's examples are `priya` and `alex`. Walking as either would have silently passed any instruction that had hard-coded an example name. |

**Environment:** Windows 11, .NET SDK `10.0.201`, SQL Server LocalDB `MSSQLLocalDB`,
repository at `C:\temp\dabbler-108-walk`, six commits.

---

## 2. What the walk proves, and what it cannot

Stated first, because the limits bound how every result below should be read.

**It proves** that the two contract sections are sufficient to build conforming
services against; that the *engineering* content of all four parts reaches its stated
finish lines; that Part D's acceptance test holds; and — beyond what the tutorial
claims — that two independently written implementations interoperate.

**It cannot prove** four things, each recorded rather than glossed:

1. **The Dabbler lifecycle on the main path was never executed — the largest gap,
   and it is a gap in coverage, not merely in observation.** Each of Parts A, B and C
   opens by telling the reader to *"run its plan set, then its decomposition set, then
   implement"*, and Day one Step 3 tells them to run `Dabbler: New Module` three times.
   **None of that was performed.** The manifest entries were written by hand in the
   exact shape the extension's `renderModuleManifestEntry` emits, and the services were
   then written directly by the orchestrator acting as the reader's agent. So a broken
   command, a misleading Explorer state or a lifecycle stall on the tutorial's main
   path would not have been caught here, and the claim that *every* walk-surfaceable
   defect was found is correspondingly weaker.

   An earlier draft filed this under "VS Code surfaces exercised only as file effects"
   and justified it as *borrowed procedure the tutorial merely links to*. That was
   wrong on the facts: the *mechanics* of the commands live in `adopt-dabbler.md`, but
   the **instruction to run them is in this tutorial**, on its main path, in every
   part. §4 records what was verified mechanically in place of it; that is a partial
   substitute and not an equivalent. **This is the single strongest reason the human
   UAT walk is still required**, and checklist items 1 and 2 are pointed straight at it.
2. **The prerequisites section cannot be falsified here.** This is the machine the
   tutorial was written on; the document literally prints this machine's
   `dotnet --list-sdks` output. Both prerequisite checks passing is a **non-finding**,
   not a pass.
3. **The reading experience is under-tested.** The walker is not a naive reader.
   Stalls caused by ambiguity, intimidation or lost place are exactly what an
   orchestrator walk is worst at detecting, and they are the risk the spec calls
   biggest.
4. **The per-part human timings the spec asks for do not exist.** See §7.

---

## 3. The walk, part by part

### Day one

| Step | Action | Expected | Actual | Defect / stall |
| --- | --- | --- | --- | --- |
| Before you start | `dotnet --list-sdks`, `sqllocaldb info` | a `10.0.` line; `MSSQLLocalDB` | both present | **Non-finding** — authoring machine, see §2.1 |
| Baseline | Stage the repo as `adopt-dabbler.md` leaves it: `greeter` declared at `services/greeter` | — | done, committed | — |
| 1 | Agree the contracts | read together | read | — |
| 2 | Agree names, roots, ports, databases | slug `{owner}-{service}`, root `modules/{owner}/{service}` | applied as `denmi-converter` → `modules/denmi/converter` | — |
| 3 | `Dabbler: New Module` ×3, member-major, then hand-add code roots | four entries, order preserved | done | **D2** — the YAML block drops `greeter` |
| 4 | Route reviews by ownership | solo readers skip | skipped as instructed | — |

### Part A — `converter`

| Step | Action | Expected | Actual | Defect / stall |
| --- | --- | --- | --- | --- |
| Build | `dotnet new web` | a .NET 10 project | **`net11.0`** | **D1** — SDK not pinned |
| Finish line 1 | its test suite | green | **29 passed, 1 s** | — |
| Finish line 2 | `dotnet run --project modules/denmi/converter …` | service on 5101 | **failed — no project there** | Documented and remedied by the tutorial itself; see below |
| — | `Get-ChildItem -Recurse -Filter *.csproj …` | names the folder | printed a clear `Directory:` header | — |
| Finish line 2 | `curl … samples/orders.csv` | the documented `200` | **byte-identical**, 379 chars | — |
| Finish line 3 | `curl … samples/orders-invalid.csv` | the documented `400` | **byte-identical**, 421 chars | — |
| Contract | `schema=invoices` | the documented unknown-schema `400` | **byte-identical** | — |

The failed `dotnet run` is recorded as a **pass, not a stall**: the tutorial predicts
exactly this stumble, explains why it happens ("your AI session decided where that
is"), and supplies a fallback that worked first time.

### Part B — `persistence`

| Step | Action | Expected | Actual | Defect / stall |
| --- | --- | --- | --- | --- |
| Build | EF Core model + migration | database created on start-up | worked | **D3** — needs `dotnet ef`, undocumented |
| Finish line 1 | its test suite | green | **29 passed, 2 s** | — |
| Finish line 3 | post the same batch twice | same `batchId`, `duplicate` false→true | exactly that | — |
| Finish line 2 | `GET /batches/{id}` | rows back, keys as `orderId` | exactly that; `amount` kept `250.00` | — |
| Contract | a well-formed invalid batch | the documented `400` | **byte-identical** | — |
| Contract | the `201`'s `Location` | relative, naming the batch | `/batches/019fc9f4-e655-…` | — |

### Part C — `watcher`

| Step | Action | Expected | Actual | Defect / stall |
| --- | --- | --- | --- | --- |
| Phase A | decision-table suite | all four outcomes, nothing running | **26 passed, 54 ms, both services confirmed `DOWN`** | — |
| Phase A | first run of that suite | — | **25 passed, 1 FAILED** — a real bug | Not a document defect; see below |
| Phase B 1–3 | `mkdir`, settings, three terminals | all three up | all three up | — |
| Phase B 4 | drop a CSV, `/run-now` | `Stored`, rows in the database | exactly that; `$result[0]` indexing works | — |
| Phase B 5 | drop a bad CSV | `Rejected` → `failed\`, `detail` carries the `400` | exactly that, verbatim body | — |
| Phase B 5 | stop `converter`, drop a good CSV | `Deferred`, **file left in place** | exactly that | **D4** — predicts a port in `detail`; mine has none |
| Phase B 5 | restart, run once | left-behind file picked up | `AlreadyStored` + `Stored`, matching the documented transcript's structure | — |
| Extra | drop a file and **do not** call `/run-now` | the cron tick collects it | dropped 19:35:49, archived by 19:36:02 | — |

**Phase A earned its keep in its first 112 ms.** The initial run failed one test:
`RunOnceAsync` enumerated the incoming list while archiving mutated it. That is a real
defect in this build, caught with no database, no file server and no other module
started — which is precisely the argument the tutorial makes for writing the suite
that way. The bug was this walk's, not the document's; its *detection* is evidence
for the document.

### Part D — twice

| Step | Action | Expected | Actual | Defect / stall |
| --- | --- | --- | --- | --- |
| Solo 1–2 | second copies on `5201`/`5202`, own database via `ConnectionStrings__Orders` | both up | both up, no file in either code root edited | — |
| Solo 3 | change two values | two values | **`git diff` on `*.cs`/`*.csproj`: 0 files; whole diff is 2 lines** | — |
| Solo 4–5 | drop, run, read back from `5202` | `Stored`, rows out of *their* store | exactly that | — |
| Solo — extra | same id against `5102` | should not be there | **`200` on 5202, `404` on 5102** | — |
| **Bonus** | run the **published answer key's** two services on `5201`/`5202` instead | — | **`Stored`; rows read back from their database; `404` on mine** | — |
| **Bonus** | a bad file through their `converter` | `Rejected` | `Rejected`, and its `400` body **matched this build's, message for message** | — |

The bonus is the strongest result in the walk. The tutorial is careful that a solo
Part D "cannot prove conformance, because a single implementation always agrees with
itself." Substituting the answer key — written months earlier, by other hands, never
seen by this `watcher` — removes that caveat: **two independent implementations
honoured the same contract, and their `4xx` bodies agreed on every field the contract
pins.**

---

## 4. The Work Explorer, verified mechanically

Since no human looked at the tree, the day-one manifest was driven through the
**shipping** reader and grouping functions (`readModulesManifest`,
`classifyModulesManifest`, `computeVisibleModules`) via a temporary harness, since
removed:

- classification `present`, four entries, **in manifest order** —
  `greeter`, `denmi-converter`, `denmi-persistence`, `denmi-watcher`;
- all four `declared`, **zero fallbacks, zero warnings**, `0` sets each.

That confirms the tutorial's day-one output *renders* rather than merely looking
plausible, and independently re-confirms the spec's POC finding that a tree of empty
declared modules is a healthy first morning.

---

## 5. The three negative tests

The first two are discharged by measurement. The third is **split**, because only
half of it is measurable at all — see below.

| Negative test | Result | Evidence |
| --- | --- | --- |
| **It fails if Part D required editing any code.** | **PASS**, re-established with a sound check | See *The Part D falsifier* below. |
| **It fails if `watcher`'s unit tests needed another module running.** | **PASS** | Both services stopped and confirmed `DOWN` by `curl`; 26 tests then passed in 54 ms. |
| **It fails if a reader could not stop cleanly after Part A or Part B.** | **PASS on the machine half; UNVERIFIED on the human half** | See immediately below. |

### The Part D falsifier, rebuilt after a verifier caught it being unsound

The original check was `git diff --name-only -- '*.cs' '*.csproj'` against the working
tree. A cross-provider verifier pointed out that this **is not a falsifier at all**:
it misses code that was staged or committed, misses untracked new source files, and
has no baseline, so it can pass a coupled implementation and fail a conforming one.
That objection was tested rather than argued with — and it is worse than stated in
theory, because run over this very repository the naive command matched **two `.cs`
files that are generated build artifacts** (`obj/.../AssemblyInfo.cs`), not source.

The sound check pins a baseline at the end of Part C, stages everything so untracked
files cannot hide, and excludes build output:

```
git add -A
git diff --cached --name-only <part-C-commit> -- "*.cs" "*.csproj" \
    ":(exclude)*/bin/*" ":(exclude)*/obj/*"
```

**Result on the walk repository: 0 files.** The complete source diff across the whole
Part D range is a single file, `watcher/appsettings.json`, and `git ls-files --others
--exclude-standard` confirms **no untracked source**. Its three changed lines are the
two `BaseAddress` repoints plus the `ScheduleEnabled` flip, the last of which was made
*after* the two-line measurement and is disclosed as a deliberate extra in §3.

**And it was confirmed to be a real falsifier**, not merely a check that happens to
return zero: planting one line in `DecisionTable.cs` and re-running it made the file
appear immediately. The planted line was then reverted.

**UAT checklist item 4 now carries this version**, not the original.

### The clean-stop test, split honestly

An earlier draft of this document marked this test a flat **PASS** on the grounds
that "with all five services down, each suite runs alone." **That was an
over-claim, and a cross-provider verifier was right to call it one:** independent
unit tests prove the suites do not need a network, not that a reader can stop,
lose their context, and pick the tutorial up again. The claim is therefore split
into the part that was actually exercised and the part that was not.

**The machine half — PASS, and now exercised at both boundaries rather than
inferred.** After the walk finished, every service was stopped and confirmed
`DOWN`, and each boundary was then re-entered from cold:

- **The Part A boundary.** `converter` cold-started, and Part A's finish-line
  `curl` re-run: the response was again **byte-identical** to the tutorial's
  printed `200`. Nothing from the original session was needed.
- **The Part B boundary.** `persistence` cold-started, and a batch stored during
  Part B (`019fc9f4-72b6-7b0a-829a-fe955b9dee29`) **read back intact**. Re-posting
  the same file still returned that **original** `batchId` with
  `"duplicate":true` — so the duplicate rule survived the stop too, which is the
  one piece of Part B state a later part actually depends on.
- **Part C Phase B was in fact entered from a fully stopped machine** during the
  walk itself: all three services were started fresh, from nothing.

That establishes the falsifiable claim: **no part leaves behind running processes
or in-memory state that a later part needs.** Everything durable is in the
database and the repository, and both survive being closed.

**The human half — UNVERIFIED, and only a person can settle it.** Whether a
reader who stops for a week can resume from the document alone — whether each
part's "Coming back to this?" preamble is sufficient for someone who has
forgotten what they were doing — is not something this walk can test, because the
walker never forgot anything. **UAT checklist item 3 now requires exactly that
stop-and-return at the Part B boundary**, with Part B timed separately from
Part C.

The fourth negative test — "it fails if two members' work collided" — is **not
walkable solo** and is recorded as such. The layout makes collision structurally
impossible (no shared code path), and the nine-module POC covers the manifest side,
but no second person wrote to this repository.

---

## 6. Defects found

| id | Severity | What | Fixed here? |
| --- | --- | --- | --- |
| **D1** | **Major** | The SDK is never pinned. `dotnet new web` produced `net11.0` on a machine whose SDK list the tutorial itself prints. | **Yes** |
| **D2** | **Major** | Day one's `modules.yaml` block opens at the `modules:` root key and omits `greeter`, so a reader who copies it loses the module the same document told them to leave alone. | **Yes** |
| **D3** | **Minor** | `dotnet ef` is an undocumented third prerequisite for the migration path. | **Yes** |
| **D4** | **Minor** | The Deferred transcript promises the reader's `detail` "will name `5101`". `detail` is not contractual and this build's carries no port. | **Yes** |
| **D5** | **Minor** | The `/run-now` race is described as returning "an empty array", but it can equally hand the reader a `500`. | **Yes** |

**D1 and D3 are independently corroborated by the answer key**, once opening it was
permitted: it carries a `global.json` pinning `10.0.201` and a `dotnet-tools.json`
declaring `dotnet-ef 10.0.10`. Both are things the reference solution needed and the
tutorial never passes on — which moves them from "one build's experience" to a real
gap.

**Not treated as a defect:** the tutorial's *unstated* error envelopes — for a missing
or extra header column, a violated `min`/`maxLength`, a non-integer `OrderId`, or a
row whose field count disagrees with the header. Two implementations would differ
there. It is recorded as a **follow-on**, not fixed, because none of those paths is on
the walk and pinning them would enlarge the contract sections a reader must absorb
before writing any code — which is the document's scarcest resource.

---

## 7. Timing — what exists and what does not

**The per-part human timings the spec asks for were not produced, and cannot be by
this walk.** The spec requires per-part elapsed time "labelled an estimate unless a
stopwatch was really held." What a stopwatch would have measured here is an AI agent
writing three .NET services, which says nothing about a human reader whose time is
dominated by reading, deciding, prompting their own agent and waiting on it.

What can be recorded honestly, from commit timestamps, is **orchestrator wall-clock**:

| Part | Elapsed |
| --- | --- |
| Day one | ~3 min |
| Part A | ~7 min |
| Part B | ~7 min |
| Part C | ~7 min |
| Part D (both versions) | ~6 min |
| **Total** | **~30 min** |

**These are measurements of the wrong thing for the spec's purpose** and must not be
quoted as how long the tutorial takes. The tutorial's own claim — "this is a course,
not a sitting" — is **neither confirmed nor refuted here**, and it is worth being
exact about which half of it a walk can reach. What §5 establishes is the *mechanical*
precondition: no part leaves running processes or in-memory state behind, so stopping
costs a reader nothing they cannot get back by starting a service. Whether a person
can *resume* — pick the document up cold after a week and know where they were — is
untested, and so is how long any of it takes them. Those two together are the
strongest remaining reason to want a human walk, and both are what the UAT checklist
is pointed at.

---

## 8. Artefacts

- Walk repository: `C:\temp\dabbler-108-walk`, six commits, 84 tests.
- Modules built: `denmi-converter` (29), `denmi-persistence` (29), `denmi-watcher` (26).
- Answer key used for the conformance bonus:
  https://github.com/darndestdabbler/dabbler-ai-orchestration-multimodule-demo
  (run from its working directory, `D:\Projects\dabbler-csv-pipeline`).
