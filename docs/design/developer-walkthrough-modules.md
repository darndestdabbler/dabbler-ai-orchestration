# The developer's walkthrough: the CSV pipeline from an empty folder, module by module, and what the Solution Explorer does at each step

**Written 2026-09-06** against the design of rounds 6–8
(`consults/round8-synthesis.md`) and the module-checkout POC
(`module-checkout-poc.md`). It imagines the block built; where a step
uses something that exists today the note says so, and where it uses
something the block adds it says that. The solution is the one the
csv-model trial was the first quarter of: a shared model, a CSV
deserializer, an EF Core persister, and a Quartz-timed listener that
composes the three.

The two views are the extension's two trees under one container:
**Solution Explorer** (what the solution is built *from*: modules, their
contracts, packages, consumers, drift, bundles) and **Work Explorer**
(the work of building it: sessions, steps, owed decisions). Today the
Solution Explorer renders components from `solution.yaml` with the
six-step state, and repositories from `solution-dependencies.json`; the
block replaces components with modules from `docs/modules.yaml` and
deletes the six-step state.

---

## 0. An empty folder

**Developer.** Opens VS Code on an empty `csv-pipeline` folder and runs
**Set Up New Project** from the Dabbler view. *(Exists: it runs `git
init` through VS Code's own git, then `dabbler bootstrap`, which writes
the guidance, `dabbler.yaml`, the two setup sessions, and commits them.)*

**Framework.** Writes session 001 as *the solution plan* and session 002
as *challenge and break into sessions* — the block's shape of the two
setup sessions — and the root build files a .NET solution needs
(`global.json`, `Directory.Build.props`, `Directory.Packages.props`,
`nuget.config` with the `packages/` source, an empty `packages/`). *(New:
the setup sessions' content and the root files.)*

**Solution Explorer.** One row, `csv-pipeline`, and a sentence under it:
*no modules yet — session 1 writes the solution plan, and the modules
appear from `docs/modules.yaml`.* No six-step "1/6 Plan" row. *(New.)*

**Work Explorer.** Planned: 001, 002. A **Start Session** button on 001.
*(Exists.)*

## 1. Session 001: the solution plan

**Developer.** Clicks Start Session on 001. The engine asks what the
project is; the developer answers in a paragraph: a CSV file lands in a
folder, its rows end up in SQLite; a shared model, a deserializer, a
persister, a timed listener. *(Exists: session 1 asks; it never guesses
from the folder name.)*

**Framework and engine.** The session writes
`docs/planning/solution-plan.md` — the four modules, what each is
responsible for, the contract each exposes, the dependency direction,
the reason for each cut, the cuts deferred (is the deserializer its own
module or part of the listener? deferred: start separate, merge if it
stays trivial) — and `docs/modules.yaml`:

```yaml
modules:
  - slug: model
    title: CSV model
    kind: shared-types
    roots: [modules/model]
    package: CsvModel
  - slug: deserializer
    roots: [modules/deserializer]
    depends_on: [model]
    package: CsvDeserializer
    contract: abstractions            # CsvDeserializer.Abstractions + .ContractTests
  - slug: persister
    roots: [modules/persister]
    depends_on: [model]
    package: CsvPersister
    contract: abstractions
  - slug: listener
    kind: application
    roots: [modules/listener]
    depends_on: [model, deserializer, persister]
```

At the plan's acceptance the framework places the four module folders
with a `README.md` each and nothing else, the way the plan's
`repositories` member places sibling repositories today. Verification,
the run of record (nothing to run yet; the close says so), the land.

**Solution Explorer.** Four module rows under the solution, drawn from
the manifest, in dependency order: `model` (shared types), then
`deserializer` and `persister`, then `listener` (application). Each row
carries: *package: none yet · contract: none yet · sessions: none*.
Expanding a row shows **depends on** and **used by** — `model` is used by
three, `listener` uses three — derived from `depends_on`, never written
twice. *(New: modules from the manifest. Exists: the depends-on /
used-by derivation, which today runs over components.)*

## 2. Session 002: challenge the cuts, break into sessions

**Developer.** Starts 002 and reads what comes back.

**Engine.** Argues with the plan — should `persister` expose
`IPersister` or the EF `DbContext`? (the interface; the context is an
implementation detail) — records the answers in the plan's rationale,
and appends numbered sessions to `docs/sessions/session-plan.md`, each
naming one module:

| session | module | what |
| --- | --- | --- |
| 003 | model | `Person`; the package; the contract page |
| 004 | deserializer | `ICsvDeserializer`, its contract tests, an implementation |
| 005 | persister | `IPersister`, its contract tests, the EF Core + SQLite implementation |
| 006 | listener | Quartz job, folder watcher, composition root, integration tests |
| 007 | release | versions, the real feed, the bundle |

**Work Explorer.** The five sessions appear **grouped by module** —
`model › 003`, `deserializer › 004`, … — the grouping v1 had and v2
dropped. *(New in v2.)*

**Solution Explorer.** Each module row's *sessions* count moves from
none to one planned. *(New.)*

## 3. Session 003: the model, in its own checkout

**Developer.** Clicks Start Session on `model › 003`.

**Framework.** Runs `dabbler module open model` for them: a
blob-filtered sparse clone `csv-pipeline.model/` beside the full
checkout, on a session branch, with the cone set to `modules/model`, the
root build files and `packages/`; opens a new VS Code window there; the
engine's working directory is that folder (Claude Code also gets the
working-directory read block). The developer sees one module and the
root files, nothing else. *(New; the POC did this by hand in 2 s.)*

**Engine.** Scaffolds `modules/model/src/CsvModel` with `Person`, the
xunit project, the `.slnf`. Its checks build and test the one project.

**Framework, at the land.** Generates the **candidate**: packs
`CsvModel.0.1.0-dev.20260906.a1b2c3.nupkg` into `packages/`, writes
`modules/model/contract/` (the public surface with its doc comments and
the notes page), adds the pin to `Directory.Packages.props`; runs the run
of record — `model-unit`, and nothing else, because no consumer exists
yet; commits the tested bytes; fast-forwards trunk and pushes (a team
would push the session branch to the candidate gate instead). The full
checkout pulls. *(New: candidate before the run of record, the selected
run of record, the package and contract generation.)*

**Solution Explorer.** The `model` row now reads *package: CsvModel
0.1.0-dev.… · contract ✓ · run of record: green · consumers: none pinned
yet*. Under it, a **contract** node opens `modules/model/contract/`.
*(New rows; the contract node exists today for components.)*

## 4. Session 004: the deserializer

**Developer.** Starts `deserializer › 004`.

**Framework.** `module open deserializer`: the cone is
`modules/deserializer`, the root files, `packages/` (which now holds
CsvModel), and `modules/model/contract/`. No `modules/model/src` on disk
or in the object store.

**Engine.** Reads the model's contract page — never `Person.cs` — and
writes three projects: `CsvDeserializer.Abstractions` (`ICsvDeserializer`,
the `CsvRow` types), `CsvDeserializer.ContractTests` (an abstract xunit
class: an empty stream yields nothing, a header-only stream yields
nothing, a malformed row is reported not thrown), and `CsvDeserializer`
(the implementation, whose test project inherits the contract tests).
The seam reference is `<PackageReference Include="CsvModel" />`; inside
the module, project references. Its checks build and test the module.

**Framework, at the land.** Candidate: three packages
(`.Abstractions`, `.ContractTests`, the implementation), the contract
page, the pins. Run of record: `deserializer-unit` and
`deserializer-provider-contract`. Not `model-unit`: the model did not
change. Exposure manifest: sibling implementation bytes present, 0.

**Solution Explorer.** `deserializer` row: *packages: 3 · contract ✓
(designed) · provider contract: green*. The `model` row's **used by**
now shows `deserializer — pinned 0.1.0-dev.…`. *(New.)*

## 5. Session 005: the persister, and a grant

**Developer.** Starts `persister › 005`. Same shape: `IPersister`,
`CsvPersister.ContractTests` (saving the same person twice keeps one;
`Find` of an unknown name is null), the EF Core + SQLite implementation.

**The grant.** The engine wants to know whether `Person` overrides
equality before it decides how to key a dictionary. The contract page
says it does not, but the engine asks anyway. The framework raises an
**owed decision**; the developer sees a toast and a row in the Work
Explorer: *session 005 asks to read `modules/model/src` — reason:
"confirm Person has no equality override" — Grant / Deny*. *(Exists: the
owed-decision mechanism and the Answer Owed Decision command. New: the
grant as its subject.)* The developer clicks Deny and adds "the contract
page says so"; the engine proceeds from the page. Had they granted, the
cone would have widened by `modules/model/src`, the read would be
recorded in the exposure manifest, and the session clone would be
discarded at the close as always.

**Framework, at the land.** Run of record: `persister-unit`,
`persister-provider-contract`. Consumer contracts against the model's
package: none, because the persister is a consumer of the model, not the
other way round.

**Solution Explorer.** `persister` row lit like the deserializer's; the
session's row in the Work Explorer carries *1 decision (denied)*.

## 6. Session 006: the listener, the application

**Developer.** Starts `listener › 006`.

**Framework.** The cone: `modules/listener`, the root files, `packages/`
(nine packages now), and three `contract/` folders. Three seams, no
sibling source.

**Engine.** The Quartz job, the folder watcher, the composition root that
registers `CsvDeserializer` for `ICsvDeserializer` and `CsvPersister` for
`IPersister`, unit tests with fakes of both interfaces, and an
integration test project that runs the real three against a temp folder
and an in-memory SQLite. The listener also writes its **consumer
contract** suites: what it assumes of `ICsvDeserializer` and
`IPersister` beyond their provider contracts (an empty file produces no
batch; a rejected row does not stop the batch).

**Framework, at the land.** Run of record: `listener-unit`, and the
listener's consumer-contract suites against the deserializer's and the
persister's current packages. The integration suite is declared
`required_for_close: false`: it runs, its result is information on this
close and evidence on trunk CI and in the release session.

**Solution Explorer.** `listener` row: *application · packages: 1 ·
consumer contracts: 2 green · integration: green (information)*. The
`deserializer` and `persister` rows' **used by** show the listener and
its pins. *(New.)*

## 7. A change to the model, and what runs

**Developer.** A month later, starts a session on `model`: add `Email`
to `Person`.

**Framework, at the land.** The impact plan: `modules/model` changed →
`model-unit`, and every transitive consumer's contract suite against the
model's **candidate** package — the deserializer's, the persister's, the
listener's — with their pins bumped to the candidate in the same tree.
Four suites, not the world. Suppose the persister's model-consumer
contract fails: its column mapping assumed three properties. The land
**refuses**; the stop names the suite and the finding.

**Work Explorer.** The session stops with the finding; the engine's fix
needs the persister's source, so the next session is declared
`modules: [model, persister]`, reason `contract-change`. Its clone holds
both sources and is reported as a two-module session.

**Solution Explorer.** Until that session lands, the `persister` row
reads *consumer contract vs CsvModel candidate: red*, and the `model`
row's **used by** marks the persister as *blocking*. After it lands,
green again, pins moved. *(New: the impact plan and the per-consumer
status. Exists: drift rows of the `behind`/`ahead`/`split`/`feed` kinds,
which this generalises.)*

## 8. Session 007: the release

**Developer.** Starts `release › 007`, declared releasable.

**Framework.** Bumps the four modules from dev versions to release
versions, publishes each through its own `packaging` block under
`modules:` in `dabbler.yaml` to the real feed, records
`release/csv-pipeline/bundle.yaml` — the listener and the exact versions
and digests of the three packages it ships with, the source commit —
and refuses the close if any input came from local bytes. *(New:
module-keyed packaging and the bundle record. Exists: the packaging
block, the folder-feed rule, the releasable declaration, the
`published_when_releasable` gate.)*

**Solution Explorer.** A **bundles** node: `csv-pipeline 1.0.0 —
listener 1.0.0 with CsvModel 1.0.0, CsvDeserializer 1.0.0, CsvPersister
1.0.0 — locked 2026-10-07`, and each module row's *shipped in* derived
from it. *(New.)*

## 9. A second developer, and CI

**Developer two.** Clones once, opens VS Code, sees the same two trees,
clicks Start Session on `persister › 009`. Their focused clone builds
offline against the committed packages in six seconds, as the POC
measured. They never type a git command.

**CI.** On a pushed session branch, the same impact plan runs the same
selected suites; the candidate gate fast-forwards trunk on green. On
trunk, nightly, the integration lane runs whole.

---

## What the Solution Explorer does, in one table

| moment | the Solution Explorer shows | exists today |
| --- | --- | --- |
| empty folder | the solution, and that session 1 defines the modules | the solution row; the hint is new |
| after 001 | module rows from the manifest; depends on / used by | derivation exists over components |
| after 002 | sessions per module (Work Explorer grouping) | new in v2 |
| after each module lands | package + version, contract, run-of-record status, who pins it | new rows; contract node exists |
| a grant | the decision on the session; a badge on the module | owed decisions exist |
| a consumer contract fails | the consumer row red, the producer's used-by marked blocking | generalises the drift rows |
| a release | the bundle and each module's *shipped in* | new |
| a second developer | the same trees from a fresh clone; Open in New Window on a module opens its focused clone | open/clone commands exist over repositories |

The commands the tree gains: **Open Module** (the focused clone and
window), **Grant / Deny** on a session's request, **Widen for
debugging** and **End grant** on a module row, and **Show impact** on a
module (the suites a change there would run). The commands it loses: the
six-step workflow's enter/review/approve, with the state they advanced.
