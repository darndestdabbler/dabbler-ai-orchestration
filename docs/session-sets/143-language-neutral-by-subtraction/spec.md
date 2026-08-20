# Language neutrality by subtraction, and the end of the skip path

> **Purpose:** The framework is *written* in Python, which is correct and
> stays. It also *assumes its subject is Python*, which is a defect: the
> selector's two strongest reasons work only for this repository, and quote
> provenance refuses anything that is not a `.py` file. This set removes the
> assumption, and every change in it is a **deletion**. It also settles the
> question set 142 left open by building the machinery and then looking at
> it: the skip path goes, and changed-line coverage goes with it, because
> coverage existed only to police the exemption that skipping created.
> **Session Set:** `docs/session-sets/143-language-neutral-by-subtraction/`
> **Created:** 2026-08-19
> **Workflow:** Full
> **Baseline commit:** `fa3c28c7`, plus set 142.
> **Integration branch:** `experiment/verification-pipeline-v3`; child
> branch `verification-v3/set-143-language-neutral`. **Not** developed on
> `master`.
> **Prerequisite:** set 142 complete. This set runs **before** the approved
> plan, deliberately: set 144 would otherwise write an evidence-contract
> schema around changed-line coverage and then have to unpick a hashed,
> frozen v1, and its derived risk flags — *public interface*, *integration
> module* — are exactly where the next language assumption would enter.

> **Note on rule 6:** operator-authorized exception, as sets 136–142.

---

## Session Set Configuration

```yaml
requiresUAT: false
requiresE2E: false
pathAwareCritique: none
module: default
totalSessions: 3
prerequisites: []
```

---

## What is actually language-specific, and it is only three things

Most of the framework is already neutral, and it is worth being precise
about that before deleting anything. The session lifecycle, the machine
ledger, cross-provider verification, disputes, adjudication, the five close
gates, suite declaration, freshness digests, and the deterministic-control
surface all work on any codebase today: a control is a declared command
judged by its exit code, so `dotnet build`, `mvn -q compile` and
`gradle check` need no code at all.

Three places assume Python, and one of them does not even manage to assume
*Python in general*:

| Where | What it assumes |
| --- | --- |
| `affected.py` | `PACKAGE = "ai_router"`, `ast.parse`, `rglob("*.py")`, `test_*.py` discovery, `tests/test_<module>.py` ownership |
| `evidence.py` | `PARSED_SUFFIXES = (".py",)`, and quote provenance by enclosing AST node chain |
| `facts.py` | a coverage report in coverage.py's JSON shape |

`PACKAGE = "ai_router"` is the sharpest of these. It is not a Python
assumption; it is a *this-repository* assumption. Dependency-edge and
module-ownership selection — the selector's two most specific reasons —
resolve to nothing in any other codebase, Python included, and every
changed path there falls through to `selection_unknown`.

## Why elimination rather than pluggability

A language provider interface is the obvious answer and the wrong one. It
adds a registry, an interface, and one implementation per ecosystem the
framework wants to claim, and it makes the framework larger in exchange for
keeping an inference nobody asked for. Each of the three can instead be
**removed, or replaced by something smaller**:

- The import graph is replaced by the declared rules that already exist.
- AST quote provenance is replaced by the digest-pinned line range that was
  already doing the load-bearing half of the work.
- The coverage reader is deleted outright, with the skip path it served.

The set is measured on that: it must leave the framework smaller.

## The correctness guarantee was never the import graph

The obvious objection to deleting the graph is that a declared mapping goes
stale silently while an inferred one maintains itself. That objection
mistakes what targeted selection is for.

Targeted selection is an **economy**, not a proof. The proof is
`final-full`: one complete suite run against the final verified tree, bound
to its digest, and the only evidence the close accepts. A selection rule
that is out of date costs a late discovery in that run — it cannot ship a
defect, because the complete suite still stands between the work and the
close. The import graph was an optimization on an optimization, bought with
a parser per language.

What the framework owes the reader instead is loudness: a changed path that
maps to nothing records `selection_unknown`, pulls in the declared smoke
tests, and raises a risk for verification to inspect. That already happens
and does not change here.

## The skip path goes, and coverage goes with it

Set 142 built changed-line coverage and set 145 was to make it
load-bearing: a step could skip its model check only if every evidence item
was `deterministic`, every one ran green, **and** the selected tests
executed every changed line. The third condition existed because the first
two are author-declared, and an author who writes weak criteria could buy
an unreviewed change.

Remove skipping and that attack surface does not exist. **Every step gets
its model check.** Nothing needs to police an exemption that is never
granted, so the coverage measurement, its report reader, its configuration
and the `pytest-cov` dependency all leave with it.

Three alternatives were considered and rejected, and the reasons are worth
keeping:

- **Falsifier twins** double the test count for no new behavior. Real
  mutation testing — mutating source and re-running the tests that already
  exist — genuinely proves discrimination, but it needs a mutation engine
  per language and substantial compute, so it fails this set's two
  constraints at once.
- **Execution logging** is coverage, hand-rolled: the same information, more
  overhead, and it requires editing the code under test to obtain it.
- **Verifier-authored tests with stub implementations** fix a real problem —
  an author shaping the test to the code — but assume work always starts
  from nothing. Refactors, configuration changes and documentation are a
  large share of real sessions, and a workflow that fits only greenfield
  gets routed around.

One consequence follows, and it is smaller than it first appears. Removing
the skip does not make review cost a function of step count: the diff is
partitioned, not duplicated, so a session costs about the same to review in
seven step-sized pieces as in one bundle. Step count adds only per-call
overhead — checklist, evidence contract, output tokens — against which a
narrow context is cheaper to reason over and admits a cheaper model. What
the removal actually costs is the reviews of the steps that would have
skipped: the all-deterministic, all-green ones, bounded by how many of those
there are rather than by how many steps exist.

The real consequence is that nothing mechanical judges test quality once
coverage is gone, so the step reviewer must judge the evidence as well as
the code: a line in a fixed checklist, not a subsystem. Set 145 owns that
checklist and carries the question.

## What this set does NOT do (do not reopen)

- **No change to the cross-provider verification mandate.** It stays
  mandatory with no skip. It reviews the whole session and therefore sees
  interaction *between* steps, which per-step review structurally cannot.
- **No language provider registry, no plugin interface, no new dependency.**
- **No change to `testing.suites`, `covers`, freshness digests, or the two
  evidence stages.** Those are already language-neutral and set 142 proved
  them.
- **No retreat on loudness.** Deleting the import graph must not turn an
  unmappable path into a silent pass; `selection_unknown` and its risk stay
  exactly as they are.

---

## Sessions

### Session 1 of 3: Selection without a parser

1. Register.
2. Delete the inferred import graph and everything that serves it:
   `PACKAGE`, `module_name_for`, `_imports_in`, `build_import_graph`,
   `_closure`, `build_test_dependencies`, and the `dependency-edge` and
   `module-ownership` reasons. The reasons that remain — `changed-test`,
   `configured-rule`, `repo_wide`, and smoke on `selection_unknown` — carry
   no language knowledge.
3. Replace `test_*.py` discovery with declared test roots and a declared
   test-file glob, so a repository states where its tests live and what they
   are called instead of the framework guessing a pytest convention.
4. Declare this repository's own mapping under `testing.selection.rules`,
   covering what the graph used to infer. Rules are the honest form of a
   mapping that was always a guess; where a module genuinely affects many
   suites, say so.
5. Affected tests, recorded as the `preverify-targeted` evidence.
6. Cross-provider verification; then the full suite once, against the
   final verified tree.
7. Close-out.

**Removes:** the AST import graph and both inferred reasons.
Est. **−5** Python tests net.

### Session 2 of 3: Provenance without a parser

1. Register.
2. Replace AST-chain quote provenance with digest-pinned line-range
   provenance: the reviewed tree's digest, the exact line range, and a
   byte-exact match of the quoted text. That triple is what makes a quote
   checkable; the enclosing node chain was a refinement available in one
   language.
3. Delete `PARSED_SUFFIXES` and the `ast.parse` call sites over reviewed
   source, so a quote from a `.cs`, `.java`, `.ts` or `.sql` file is checked
   exactly as rigorously as one from a `.py` file. Today it is refused.
4. State the residual honestly in the check vocabulary: line-range
   provenance proves *where a quote came from*, not *what kind of construct
   it is*. A check that needs the difference is a check for a deterministic
   analyzer, which the control surface already routes.
5. Affected tests, recorded as the `preverify-targeted` evidence.
6. Cross-provider verification; then the full suite once, against the
   final verified tree.
7. Close-out.

**Removes:** Python-only quote provenance. Est. **−4** Python tests net.

### Session 3 of 3: Delete the coverage path, and prove the envelope shrank

1. Register.
2. Delete changed-line coverage: the report reader, the measurement, the
   `CoverageFact` surface, `testing.coverage`, the `--cov` flags on the
   declared suite command, and the `pytest-cov` dependency. The changed-line
   *extraction* from git stays — it is language-neutral and useful as review
   context — but nothing gates on it.
3. Record the set's own arithmetic: LOC, module count and test count before
   and after, and the line count of every module this set touched. A set
   whose thesis is subtraction has to publish the subtraction.
4. Affected tests, recorded as the `preverify-targeted` evidence.
5. Cross-provider verification; then the full suite once, against the
   final verified tree.
6. Close-out, and the end-of-set `change-log.md`.

**Removes:** the coverage path, and with it the skip path sets 144 and 145
now never build. Est. **−2** Python tests net.

---

## Acceptance criterion for the set

No module of `ai_router` names a language, a file extension of the code
under review, or this repository. `PACKAGE`, `ast.parse` over reviewed
source, `PARSED_SUFFIXES` and `test_*.py` discovery are gone, and `grep`
proves it.

A quote from a non-Python file is verifiable. Today it is refused.

Selection still refuses to widen: an unmappable path records
`selection_unknown`, runs the declared smoke tests, and raises a risk. A
stale rule costs a late discovery in `final-full` and cannot ship a defect.

No step can skip its model check, because there is no skip. Changed-line
coverage is gone from the code, the configuration and the dependencies.

**The framework is smaller than it was at the start of the set** on all
three counts — LOC, modules and tests — and session 3 publishes the numbers.

## Test budget

This set spends nothing and **returns** an estimated **11** tests
(−5, −4, −2). Entering at **477** after set 142, it leaves the count near
**466** of the 605 envelope. A set that deletes a feature and leaves the
test count flat has not deleted the feature.
