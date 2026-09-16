# Design consult, round 8: the developer's experience of a module — convenience, fewer reads, and a testing surface that does not run the world

You are consulted again on `dabbler-ai-orchestration`, the AI-led
coding-session framework (a TypeScript router `dabbler <verb>` bundled into
a VS Code extension) whose customers are **.NET and Java teams**. Rounds 6
and 7 (you answered both) settled the repository shape and the wall. This
round puts the **developer's experience** first, on the operator's
instruction, and adds a third objective that no round has treated: the
**testing surface**.

You have NO tool access. **Every claim you make about this repository must
cite a path or a number from this brief. Mark any claim you cannot ground
here as ASSUMPTION.** Do not invent paths.

---

## The operator's objective, verbatim

> I want the developer experience to be a good one. Ideally, it would be
> **convenient for the developer** and **reduce the likelihood that AI
> would read more files than necessary**. Also, I would like it to
> **isolate the testing surface so that whole suites do not have to be
> run** when a module/worktree/set of classes is treated like a compiled
> library.

Three objectives, in that order. The governing rules are unchanged: (a)
what skilled human developers would do; (b) the PowerPoint test; (c)
simpler, more reliable, more performant; (d) lower AI cost but human time
outranks AI time; (e) the customer is a .NET or Java team; (f) informed
input, then decide.

---

## Where rounds 6 and 7 left it

**Round 6**: monorepo, `modules/<slug>/`, a solution plan first as a
reviewed hypothesis (`docs/planning/solution-plan.md` +
`docs/modules.yaml`), sibling modules consumed as packages, bundling
recorded not executed. **Round 7** (you converged): the wall is what is on
the disk — a session runs in a **dedicated blob-filtered sparse clone**
holding the module's source and tests, the shared root build files, and
every dependency's contract and package; the AI reads a **generated,
committed contract** per module (`modules/<slug>/contract/`); packages are
committed, small, immutable; the verifier refuses out-of-scope reads; the
measure is **exposure** (sibling implementation bytes in the session
filesystem, target zero), not read counts; cross-module work is
`modules: [a, b]` with a reason; transcript audits are diagnostics only;
containers are a hardened mode.

## What the operator and the orchestrator have said since (verbatim where it matters)

**1. The operator's encrypted-resource variant.** *"We could have work
trees for each module, but light encrypt (e.g., Caesar cipher) the src
folder (in such a way that is diff friendly) within each work tree, except
the src within the current work tree. Then the framework manages the
encoding and decoding of work tree source code. The human operator must
authorize decoding of other src folders. Note that we keep the precompiled
object files so that everything can compile. No artifacts needed. AI can't
easily read the forbidden source code."* The orchestrator objected (a light
cipher is one shell command away and a model decodes it unprompted;
ciphertext in the context costs more tokens than absence; precompiled
`bin/` outputs are artifacts without a version; the object store holds
plaintext; nobody scrambles their own source against their own tools).
The operator answered: *"First, you could package the encrypted code into
a file called forbidden.xxx in a resource folder. Second, you could use a
one-time pad for the encryption, which is less likely to be decoded. Third,
you could instruct AI not to open files other than those in permitted
directories."* The orchestrator conceded all three — one opaque blob per
sibling removes the compile and the accidental-read objections; a one-time
pad is undecodable and the weak point moves to **key custody on one
machine under one user, where the framework's decode verb is reachable by
anything the engine can invoke**; an instruction is a real first layer —
and held one point: if plaintext is committed so review works, keeping B's
tracked files out of A's working tree so the blob can stand in for them
*is* sparse checkout, and the blob is an offline convenience on top; if
ciphertext is committed, humans lose diff, blame and pull-request review.

**2. The sparse clone, as explained to the operator.** `dabbler module
open converter` makes a blob-filtered clone beside the developer's full
one, on a short-lived session branch; sets the sparse cone to the module's
directory, the shared root build files, the committed package folder, and
each dependency's `contract/`; writes the module's `.slnf`; opens VS Code
there with that folder as the engine's working directory (Claude Code also
gets the working-directory read block); at the land regenerates the
package and contract, commits, fast-forwards trunk, pushes. **Dynamic
widening**, taken from the operator's authorization idea: mid-session the
engine asks for module B's source, the framework raises an owed decision,
and on a grant the cone widens with `git sparse-checkout add`, recorded in
the exposure manifest. Offline: the developer's full clone can serve as
the filtered clone's remote. Honest limits: deliberate fetch of excluded
blobs, reads of another checkout by absolute path, decompiling a package.

**3. Interfaces and injection.** The operator: *"We can require explicit
interfaces and dependency injection, but that only solves part of the
problem."* The orchestrator's account of the split — solved: the
compile-time dependency becomes a dependency on shape (`IPersister` in an
abstractions package, the implementation in B, wired at the composition
root; the `.Abstractions` pattern .NET already uses, api/impl in Java),
the contract becomes *designed* rather than generated, and A is testable
with fakes so A's checkout needs only B's abstractions package. Remaining:
**behaviour** (what `Save` does on a duplicate, ordering, nullability,
threading, idempotency — the gap that sends an AI reading B's source, to
be closed by an executable **contract test suite** that ships with the
abstractions as an abstract test class B's own tests inherit, plus doc
comments and a short behavioural page); **shared types** (`Person` and
its kin as their own small, slow-cadence module every consumer reads);
**failures across the seam** (an integration lane, and a two-module
session when it fails); **changing the seam** (explicit, versionable, not
one-module work); and **the engine re-reading its own module**, which
nothing here touches.

---

## What the framework does about tests today, with paths

- A repository declares suites in `dabbler.yaml` `testing.suites[]` with
  `name`, `command` or `argv`, `covers` (path prefixes), `cwd`,
  `expensive`, `small`, `runs_whole`, `test_roots`, `test_glob`
  (`packages/router/src/checks.ts` `SUITE_FIELDS`;
  `packages/router/src/testEvidence.ts` `loadSuitesChecked`).
- **The run of record is every `expensive` suite, run whole**, after
  verification and before the land (`drive.ts` `expensiveSuites()`, used
  in the run-of-record phase around line 2373). This repository has two:
  the router's 1,165 tests in ~100 s and the extension's 209 in ~7 s
  (session 99, `.dabbler/runs/s99/driver/jobs/`). csv-model has one,
  `dotnet test`, `runs_whole: true`, `covers: ["."]`, four seconds.
- **The freshness gate is per suite, over the paths its `covers`
  names**: `enumerateSurface` hashes `git ls-files` plus untracked
  non-ignored files filtered by `matchingPrefixes(rel, covers)`, and
  `test_run_fresh` at the close compares that digest with the recorded
  run (`testEvidence.ts` `enumerateSurface`, `surfaceDigest`,
  `evaluateFreshness`). A suite that is not expensive is never the run of
  record and is skipped by the gate; **a non-expensive suite covering a
  path no expensive suite reaches is refused at load** (`testEvidence.ts`
  ~line 305–311).
- **Selection** maps changed paths to tests: `testing.selection` with
  `repo_wide` (a change there affects every test), `rules[] {when: <path
  prefix>, select: [tests]}` (an empty `select` maps a path to nothing),
  `smoke`; an unmapped path is `selection_unknown` (`checks.ts`
  `selectTests`). `dabbler affected` prints the tests a change set makes
  necessary and the command to run them. **The driven loop's preverify
  phase runs nothing**: the tests that run are the verifier's own inside
  the round and the complete expensive suites as the run of record.
- The verifier is granted `list`/`search`/`read` over a scope (the changed
  files, their first-order imports, the spec directory — `agency.ts`
  `sessionScope`) and may write a test file inside a declared envelope; it
  runs its own tests inside the round.
- Deterministic controls (`testing.controls[]`: `compile`, `typecheck`,
  `lint`, `analyzer`) run per round and their results reach the verifier
  as facts (`checks.ts`; this repository declares three).

**.NET and Java facts (ASSUMPTION where unsure).** `dotnet test <project>`
runs one test project; a solution filter `.slnf` scopes build and test to
listed projects; `Microsoft.NET.Test.Sdk` projects are not packable;
test traits/categories filter within a project. Maven `-pl :module` runs
one module's tests, `-am` also builds what it depends on. A test project
can inherit an abstract test class from a referenced package, which is how
a shared contract suite reaches an implementation's test project.

---

## The questions

### Q1 — The developer's day, moment by moment

From `git clone` to a landed change in one module, name every command and
click a developer makes, and what they see, under three designs: **(i)** a
plain full checkout with instructions and a `.slnf`; **(ii)** the sparse
clone with committed contracts and packages and dynamic widening; **(iii)**
the operator's encrypted-resource variant (one `forbidden.xxx` per
sibling, operator-held key, precompiled outputs, an instruction). Cover:
opening VS Code; IntelliSense and go-to-definition across the seam;
running the module's tests; debugging *into* a sibling; reviewing the
pull request; a second developer's first clone; CI. Say where each design
makes the developer wait, type, or think. Be concrete enough that a team
lead could picture it.

### Q2 — Reads, ranked by inconvenience

Rank by *reduction in the likelihood of an unnecessary read* per *unit of
developer inconvenience*: absence (sparse clone); the encrypted resource
with an operator-held one-time pad; an instruction alone; Claude Code's
working-directory block; abstractions plus contract tests (removing the
need); the dynamic grant. Place the one-time-pad variant honestly against
key custody on one machine, and say what it would take to hold the key
where the engine cannot reach it, and whether a .NET team would do that.

### Q3 — The testing surface (the new objective)

When module A is treated like a compiled library, which tests must run for
a session in A, and at which moment: A's unit tests; A's contract suite
against its own abstractions; **each consumer's contract suite against A's
new package** (A's change may break them); the solution's integration
lane; everything? Assign each to a moment — a step's check, the verifier's
round, the run of record, the land, CI on trunk, a release session — and
say which are *evidence for the close* and which are *information*. Then
design the declaration concretely against what exists: per-module suites
with `covers: [modules/a]` and per-suite freshness already exist; what is
missing is a run of record that runs **only the expensive suites a change
set reaches** plus whatever contract suites A's consumers own. Write the
`dabbler.yaml` for a three-module solution (model, persister, listener)
and say what `dabbler affected`, the run of record and `test_run_fresh`
do for a session that changes `modules/persister` only. Does a change to
the shared-types module run everything, and should it?

### Q4 — Interfaces, injection, contract tests

Should the framework **require** an abstractions project per module, or
support one and generate a surface where none exists? Is an abstract
contract test class that implementations inherit what skilled .NET and
Java teams actually do (cite the practice you know), and what does it cost
for a 3–10 module solution? Where does the shared-types module sit, and
what cadence and review does it get? Where do contract tests live so that
both the consumer's engine can read them as examples and the
implementer's suite must pass them — in the abstractions package, in
`modules/<slug>/contract/`, or both?

### Q5 — Debugging across the seam

A developer in A needs to step into B. With B's source absent (or
encrypted), what is the experience: symbols and Source Link from the
committed package (which fetches source from the host — an engine could
too); a reversible `PackageReference` → `ProjectReference` swap (which
needs B's source, hence the dynamic grant); a grant that widens the
checkout for the debugging session and narrows at its end? What would a
.NET developer tolerate, and what would make them keep a full checkout
open instead and defeat the design?

### Q6 — The encrypted resource, taken seriously as a hardened mode

With plaintext committed, what does an encrypted sibling blob buy over
absence beyond offline decoding? Where can a one-time pad or an AES key
live so the framework decodes on a grant and the engine cannot — an OS
keystore under a different user, an operator-entered passphrase per
grant, a service — and what does each cost a developer per grant? Is
there a customer who needs source hidden from a *machine* rather than
from a *model*, and is that this product's customer?

### Q7 — Windows, VS Code, teams

The operator runs Windows 11 with PowerShell; the customer likely does
too. Any Windows-specific cost of sparse checkout, partial clone, or a
clone-per-module (path length, antivirus on many clones, Git for Windows
partial-clone performance)? VS Code: one window per module clone, or a
multi-root workspace? A team of one versus four: does the sparse clone
per module change anything about branches, review, or who owns a module
at a time?

---

## What to answer

For Q1–Q7: **Soundness** (with a cited path or number per claim), **Risk**
(the failure you would bet on), **Recommendation** (one, concrete, small
enough to build). Then, once:

8. **The developer experience as a storyboard**: five moments — clone and
   open; work; test; land; review — each in two or three sentences a .NET
   team lead would recognise, for the design you recommend.

9. **The change to round 7's session list** (1 solution plan + manifest;
   2 module config + exception schema; 3 contracts; 4 committed packages;
   5 focused checkout; 6 module-scoped sessions + hard verifier scope +
   exposure manifest; 7 the atomic land with drift, ceiling, bundles;
   8 Maven parity + secondary mode), especially where the testing
   surface and the contract tests go, and which orderings are real
   dependencies.

10. **The disagreement.** Where round 7's synthesis was wrong, where the
    operator's encrypted-resource variant is right in a way the
    orchestrator missed, and where you expect the other reviewer to be
    wrong.

Be direct. The operator has asked for review, not endorsement.
