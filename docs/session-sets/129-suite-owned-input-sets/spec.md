# Suite-Owned Input Sets Spec

> **Purpose:** A5 — *how "the required portion" resolves per module* — is
> the one question Set 128 declared out of scope and left with an owner
> rather than an answer. This set answers it, and the answer is smaller
> than the question looked: **the suite declares its inputs; modules are
> grouping metadata.** A session owes every suite whose declared input
> set its change touches, module membership being irrelevant to the
> question. Two reviewers reached that independently from an operator-
> supplied proposal, and rejecting the proposal's larger apparatus is as
> much of this set's deliverable as adopting its core.
> **Created:** 2026-08-12
> **Session Set:** `docs/session-sets/129-suite-owned-input-sets/`
> **Prerequisite:** Set 128 complete — A1–A4 are the rules this set
> refines, `run_of_record.SuiteSpec` is the structure it edits, and Set
> 128 Session 3 is what names this set as A5's owner. Starting first
> would put two sets on one surface.
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

**Source of record:**
[`docs/proposals/2026-08-12-multi-module-retesting/`](../../proposals/2026-08-12-multi-module-retesting/)
— the operator-supplied proposal, two independent routed reviews
(`gpt-5.6-sol`, `gemini-3.1-pro`), and
[`verdict.md`](../../proposals/2026-08-12-multi-module-retesting/verdict.md),
which records what is adopted, what is **rejected outright** with
reasons, and what is deferred behind named triggers. **Read the verdict
before the proposal.** The proposal is a good document written for an
architecture no consumer here has demonstrated; two of its load-bearing
claims are false in this repo, and a reader who meets it first will
implement the wrong set.

---

## Session Set Configuration

```yaml
requiresUAT: false        # No UI surface. The deliverable is which suites a change set affects, which does not render.
requiresE2E: false        # Layer 3 is untouched. Suite DECLARATIONS change; no suite's contents do.
uatStyle: ad-hoc
uatScope: none
prerequisites:
  - slug: 128-session-step-skeleton-and-test-ordering
    condition: complete
```

> Rationale: `pathAwareCritique` is deliberately **absent** (the guide's
> default is `none` — *"a set that declares nothing pays nothing"*). Set
> 118's flag and Set 128's were armed because those sets **reduced**
> verification. This set reduces none: it makes the existing obligation
> explicit and auditable, adds a fail-closed path where one is missing,
> and authorizes no new skip. The end-of-set critique earns its cost when
> a set spends verification, and this one does not.

---

## Project Overview

### The question, and why the answer is small

`run_of_record`'s `covers` is a flat list of repo-relative path prefixes.
A5 asked whether, in a repo with a declared module tier
(`docs/modules.yaml`; Sets 087, 093, 100, 122), a session's obligation
should resolve to *its module's* surfaces instead.

The answer is **no**, and the reasoning is what makes the set small:

1. **A suite that declares its complete input set already answers the
   question.** "Which suites does this session owe" is an intersection.
   Adding a module axis answers nothing the input set does not.
2. **A module axis can only SUBTRACT.** A session in module Y that
   genuinely touches module X's inputs would stop owing X's suite because
   of a *label*. That is a verification reduction wearing an
   organizational costume, and it fails open — the direction this repo
   refuses (L-125-1).
3. **The label is not enforced.** There is no Python module-manifest
   reader in `run_of_record.py`, no dependency graph, and no check that a
   module's declared `codeRoots` match real imports
   (`module-organized-projects-recommendation.md` §6.4 says the scope
   check does not exist). Routing test selection through an unenforced
   label is exactly the "declared graph differs from the real import
   graph" failure the proposal's own I5 warns about.

So A5 resolves to: **the suite declares; the intersection decides; the
module groups.**

### The live defect this set fixes

Found by review, not by use, and it is the reason this set is worth a
session rather than a paragraph.

`load_suites()` is deliberately tolerant: a malformed entry is silently
dropped, and a `suites:` key that yields zero usable entries returns an
empty tuple. `check_test_run_fresh()` then reads *"no expensive
suites"* and **passes**. A typo in a consumer's `testing.suites` block
therefore disarms the close gate that governs every expensive suite, and
nothing says so. Tolerance is right for a *reader*; it is wrong for the
input to a gate. R0 in the proposal states the principle this repo
already holds: if the information a skip needs is missing or
unverifiable, do not skip.

### What "input set" has to mean

Today `covers` is documented as the paths a suite is *about*. The
adopted definition is stronger — the **complete allowlist of prefixes
that can affect the suite's result**: product source, test source,
fixtures, contracts, mocks, shared libraries, lockfiles, build and test
configuration, and checked-in toolchain configuration.

That is a documentation change with teeth: under the old reading, a
lockfile or a CI config outside `covers` was simply out of scope; under
the new one it is a **declaration bug**, and Session 1 re-derives this
repo's own three suites against the stronger definition rather than
assuming they already satisfy it.

### The claim that must not be re-proposed

The proposal argues that skipping an unaffected suite is *"provably
redundant work being removed"* rather than a risk trade-off. Both
reviewers rejected it. Suites here are not pure functions of their
declared inputs — scheduler interleaving, browser and VS Code runtime,
dependency resolution, environment variables, filesystem timing, service
state, network responses and random seed all sit outside any file digest
— and `covers` is a path prefix list, not a dependency graph.

The replacement wording is adopted verbatim and is a **deliverable of
this set**, because the framing has consequences: under the proposal's
version, a future orchestrator could skip a suite *without* an
operator-attested verification reduction, on the grounds that nothing was
being reduced. That reasoning must not be available.

> Unchanged declared inputs provide evidence that a rerun is likely
> redundant within a qualified execution environment; they do not prove
> identical outcomes for non-hermetic or flaky suites.

### Non-goals

- **No contract locks, mock pinning, or provider-side conformance
  cascades.** No consumer has that architecture, and the proposal's L4
  does not close the hole it claims: a mock pinned to a contract *hash*
  has provenance, not conformance (`verdict.md` §2b carries the worked
  failure).
- **No module field on `SuiteSpec`,** for the three reasons above.
- **No new skip authority.** This set makes the existing obligation
  explicit; it does not authorize skipping anything that is owed today,
  which is why it needs no operator attestation.
- **No dependency graph or boundary linting**, and no E2E tiering. Both
  are deferred behind named triggers in `verdict.md` §7.
- **No change to A4.2's scope.** It scopes to the diff, regardless of
  module; `post_round_delta.classify_delta()` is already correct.

---

## Sessions

### Session 1 of 2: The suite declares its inputs

**Steps:**

1. Register.
2. **Re-derive this repo's three suites against the stronger definition
   of `covers`,** and fix what it exposes. Every prefix that can change a
   suite's result must be declared — including the ones the old reading
   let sit outside, such as build and test configuration and lockfiles.
   Report what moved and what deliberately did not; a declaration this
   set does not change is a *finding*, not a silence.
3. **Ship `affected_suites()` and make suite loading fail closed.**
   `affected_suites(files_changed, suites)` returns which suites a change
   set affects **and which inputs matched**, and `evaluate_freshness()`
   consumes it rather than re-deriving per suite (one definition —
   L-069-1). `load_suites()` gains a checked result carrying its errors,
   and `check_test_run_fresh()` **blocks** on a suite-configuration error
   instead of reading it as "no expensive suites".
4. **Falsify in both directions** (`L-112-1`), by planting the
   declaration rather than reading the code. FIRES: one shared input
   affects several suites; an input changed after a run stales it; a
   malformed `testing.suites` block **blocks the close** rather than
   disarming the gate; an empty declaration cannot pass as "nothing
   owed". DOES NOT FIRE: an input touched by no suite owes nothing; a
   repo with no `docs/modules.yaml` behaves exactly as it does today.
   STRUCTURAL: the reported `changed_inputs` for a real change set equals
   the intersection an independent walk computes.
5. **Cross-provider verification.**
6. **Required portion of the full test suite.**
7. **Close-out.**

**Creates:** `affected_suites()`, the checked suite-loading result, and their falsifiers
**Touches:** `ai_router/run_of_record.py`, `ai_router/gate_checks.py`, `ai_router/tests/test_run_of_record*.py`, `ai_router/tests/test_gate_checks*.py`, `ai_router/router-config.yaml`
**Ends with:** a session can be told **which** suites its change affects
and **which declared inputs** made each one affected — and a typo in a
consumer's suite declaration blocks the close instead of quietly
disarming it.
**Progress keys:** `coversReDerived`, `affectedSuitesLands`, `loadingFailsClosed`, `plantedDeclarationsCaught`

> **Irony budget: 10 new test functions.** Weighted to the fail-closed
> direction: the malformed-declaration case is the one that is invisible
> today, and a gate that cannot be disarmed by a typo is the only part of
> this set that changes what can go wrong.

---

### Session 2 of 2: A5 answered, and the apparatus refused

**Steps:**

1. Register.
2. **Write A5's answer and the corrected safety claim into the authoring
   guide,** beside A1–A4 where an author already looks: the suite
   declares its inputs, the intersection decides the obligation, modules
   group. Carry the replacement wording for the "provably redundant"
   claim verbatim, and say plainly why the stronger version is refused —
   it would let a skip happen without the operator attestation that a
   verification reduction requires.
3. **Record the refusals so they are not re-proposed,** and retire the
   question. Eight rejections with their reasons and six deferrals with
   their **trigger conditions** (`verdict.md` §6–§7) land where a future
   author will meet them, not only in a proposal folder. Then close A5 in
   `docs/planning/session-step-skeleton-and-verification-cost.md` — it is
   the last open item in that note — and author `change-log.md`.
4. **Cross-provider verification.**
5. **Required portion of the full test suite.**
6. **Close-out**, including the Step 9 reorganization review of
   `project-guidance.md` / `lessons-learned.md`.

**Creates:** `change-log.md`
**Touches:** `docs/planning/session-set-authoring-guide.md`, `docs/planning/session-step-skeleton-and-verification-cost.md`, `docs/planning/module-organized-projects-recommendation.md`, `docs/planning/project-guidance.md`, `docs/planning/lessons-learned.md`
**Ends with:** an author asking "which suites does my change owe?" gets a
mechanical answer from the guide, and an author proposing contract locks
or module-scoped test selection finds the recorded reason it was refused
and the condition under which it may return.
**Progress keys:** `a5Answered`, `claimCorrected`, `refusalsRecorded`, `noteClosed`

> **Irony budget: 2 new test functions.** The deliverable is
> documentation; Session 1 owns the executable half.

---

## Why two sessions and not three

`gpt-5.6-sol` argued for one session and a stop, and the argument is
sound: a three-session set would have a middle session validating
selection against **no real consumer** and a final session attesting a
reduction on **synthetic evidence**. Both are ways of appearing to have
evidence.

`gemini-3.1-pro` proposed three (module scoping, module-scoped
remediation, E2E tiering); all three were rejected on the merits in
`verdict.md` §3 and §6.

Two sessions is the honest size: one for the mechanism, one for the
doctrine and the record — because the refusals are a deliverable, and a
rejection nobody wrote down gets re-proposed by the next reader of a
persuasive document. The implementation shape Sol sketched
(characterize → shadow → attest) is recorded as **deferred** work, to be
authored when a consumer exists to validate it.

---

## End-of-set deliverables

- `covers` redefined as the complete input allowlist, with this repo's
  three suites re-derived against it and the differences reported.
- `affected_suites()`, reporting **which** inputs made a suite affected,
  consumed by `evaluate_freshness()`.
- A malformed suite declaration blocks the close instead of disarming the
  gate, with a planted falsifier proving it.
- A5 answered in the authoring guide: the suite declares, the
  intersection decides, the module groups.
- The corrected safety claim, and eight refusals plus six trigger-gated
  deferrals recorded where an author will meet them.
- `docs/planning/session-step-skeleton-and-verification-cost.md` fully
  closed — no open items left.
- `change-log.md`, `disposition.json`, and the Step 9 guidance review.
