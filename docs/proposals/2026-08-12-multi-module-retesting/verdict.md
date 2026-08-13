# Verdict — multi-module retesting rules

> **Proposal:** [`proposal.md`](proposal.md), authored by Claude Fable and
> supplied by the operator on 2026-08-12 during Set 128 Session 2.
> **Reviews:** [`consensus-gpt-5.6-sol.md`](consensus-gpt-5.6-sol.md),
> [`consensus-gemini-3.1-pro.md`](consensus-gemini-3.1-pro.md) — commissioned
> because the operator judged the question harder than recent work. Each
> reviewer read the repository itself; neither saw the other's answer.
> **Outcome:** partial adoption, scheduled as **Set 129**.

## 1. What the proposal is

A decision procedure for when a test suite must be rerun in a project with
several modules developed in parallel: per-suite **input sets**, an
**affected set** computed from content hashes, **contract locking** so an
integration module can skip retesting when a leaf module changes,
**provider-side contract verification** to close the mock-drift hole,
**E2E tiering**, and a set of always-in-force rules for the AI agent.

It is a good document. It is also written for an architecture this
framework's consumers have not demonstrated, and two of its load-bearing
claims are false here.

## 2. Where the reviewers agreed

Independently, and in most cases in the same words.

| Point | Sol | Gemini |
| :--- | :--- | :--- |
| Adopt the suite-owned **input set** abstraction — `covers` already almost is one | yes | yes |
| **Reject** contract locking / mock pinning / provider-side cascades as premature | yes | yes |
| **Reject** *"skipping is provably redundant, not a risk trade-off"* | yes | yes |
| The proposal's cadence conflicts with this framework's ordering | yes | yes |
| Existing machinery maps to `surface_digest()`, `session_touched()`, `evaluate_freshness()`, `classify_delta()` | yes | yes |

### 2a. The claim that had to be rejected

Section 5 argues that because a deterministic suite is a pure function of
its inputs, skipping an unaffected suite is *"provably redundant work being
removed"* rather than a risk trade-off.

Both reviewers rejected it, and the reasoning is the same: real pytest,
Electron/mocha and Playwright suites are not pure functions of their
declared inputs. Scheduler interleaving, browser and VS Code runtime,
dependency resolution, environment variables, filesystem timing, service
state, network responses, random seed and resource availability all sit
outside any file digest. And in *this* repo `covers` is a **path prefix
list, not a dependency graph** — undeclared coupling is invisible to it by
construction.

Sol's proposed replacement wording is adopted verbatim as the rule for
Set 129:

> Unchanged declared inputs provide evidence that a rerun is likely
> redundant within a qualified execution environment; they do not prove
> identical outcomes for non-hermetic or flaky suites.

This matters beyond pedantry: the proposal's framing would let a future
orchestrator skip a suite **without** an operator-attested verification
reduction, on the grounds that no verification was being reduced. Under
this repo's carve-out, that is exactly the reasoning that must not be
available.

### 2b. The mock-drift hole, which the proposal does not close

Sol found a concrete failure the proposal's own L4 authorizes. L2 pins a
mock to a contract **hash** — that is *provenance, not conformance*. So:

1. A's contract says results are ordered; A's provider test checks only
   membership.
2. U's mock returns the historical order.
3. A changes its real order. The contract hash is unchanged, provider
   tests pass, U and its mocks are unchanged.
4. L4 authorizes skipping U. The smoke tier does not exercise that path.
5. Integration breaks later.

Closing it needs provider-to-contract **and** mock-to-contract executable
conformance, plus a real boundary test for contract omissions — machinery
well beyond what any consumer here has asked for.

## 3. Where the reviewers split, and how it was settled

**The one substantive disagreement: does module identity drive suite
selection?**

- **Gemini:** yes — add `SuiteSpec.module`, and have `session_touched()`
  intersect the session's module against the suite's, so a session in
  module Y does not owe module X's suite.
- **Sol:** no — *"Test inputs, not organizational labels, should determine
  affected suites."* Keep modules as grouping and ownership metadata.

**Sol's position is adopted**, for three reasons:

1. **It answers A5 without inventing anything.** If a suite declares its
   complete input set, then "which suites does this session owe" is already
   answered by intersection, per module or not.
2. **Gemini's version can only *subtract*.** A session in module Y that
   genuinely touches module X's inputs would stop owing X's suite because
   of a label. That is a verification reduction wearing an organizational
   costume, and it fails open — the direction this repo refuses (L-125-1).
3. **The label is not enforced.** There is no Python module-manifest reader
   in `run_of_record.py`, no dependency graph, and no check that a module's
   declared `codeRoots` match real imports —
   `docs/planning/module-organized-projects-recommendation.md` §6.4 says the
   scope check does not exist. Routing test selection through an unenforced
   label is precisely the "declared graph differs from the real import
   graph" failure the proposal's own I5 warns about.

## 4. A5, answered

The three sub-questions from
`docs/planning/session-step-skeleton-and-verification-cost.md`:

1. **Does a module declare its own `covers`?** No. **The suite declares its
   inputs**; modules remain grouping and ownership metadata.
2. **What does a session owe when it touches a shared surface?** Every
   suite whose declared input set contains that surface — module membership
   is irrelevant to the question.
3. **Does A4.2's delta review scope to the module or to the diff?** To the
   **diff**, regardless of module. `post_round_delta.classify_delta()`
   already has the correct scope; nothing changes.

## 5. What Set 129 adopts

One mechanism, no new skip authority:

- **`covers` is redefined as the complete input allowlist** — product
  source, test source, fixtures, contracts, mocks, shared libraries,
  lockfiles, build/test configuration, checked-in toolchain config — rather
  than "the product paths a suite is about".
- **`affected_suites()`** returns which suites a change set affects *and
  which inputs matched*, so the answer is auditable instead of a boolean.
  `evaluate_freshness()` consumes it rather than re-deriving per suite.
- **Suite loading fails closed.** `load_suites()` currently drops malformed
  entries silently, and `check_test_run_fresh()` then passes because no
  expensive suite remains. A configuration error must block, not disarm the
  gate — this is a live fail-open defect in shipped code, found by review
  rather than by use.
- **The corrected safety claim** is written into the authoring guide beside
  A1–A4, together with the deferral table below.

Nothing here reduces verification, so no new operator attestation is owed.

## 6. What Set 129 rejects outright

Not "deferred" — rejected, with the reason recorded so it is not
re-proposed:

1. Unchanged hashes make skipping risk-free or proven.
2. Full-suite retest after every change (Section 5 read literally), which
   would recreate the Set 112 incident — 15 runs, 186 minutes — that A1–A3
   exist to prevent.
3. P1's replacement of session close with the integration event. Merge
   verification is an **additional** boundary, never a substitute:
   discarding branch-local evidence would make an unfinished session depend
   on external merge timing.
4. I1/I2's U-centered star topology as a framework invariant. `domain <-
   application <- API` is equally legitimate.
5. G3's prohibition on correcting tests, mocks or contracts — A4.1 exists
   precisely for legitimate test-only fixes. Privileged review yes;
   prohibition no.
6. G4's prohibition on all cross-module calls. The correct rule is "do not
   create **undeclared** dependencies".
7. E1 as an unconditional core rule. It would override `requiresE2E: false`
   as a permanent valid default and reverse the deliberately selective
   Playwright `covers` list.
8. Module identity as an input to suite selection (§3).

## 7. Deferred, with named triggers

Adapted from Sol's table. Each row is a **trigger condition**, not a
schedule: none of this is authored until its row is true.

| Deferred | Reconsider when |
| :--- | :--- |
| Contract locks (L1–L5) | A named consumer has ≥2 leaf modules, one mock-based integration module, versioned executable behavioural contracts, provider **and mock** conformance tests, and *measured* redundant downstream cost. |
| Mechanical dependency graph + boundary linting | A consumer has ≥2 non-empty `codeRoots` and an actual cross-module or hidden-coupling incident. The graph must be checked against real imports before it may authorize any skip. |
| New test-skipping enforcement | A machine-derived integration baseline exists, shadow selection has been compared against full runs over real merges, falsifiers have demonstrated the failures, and the operator journals the reduction. |
| Smoke/full E2E tiering | A consumer has two independently executable named commands with measured runtimes. Represent them as separate `SuiteSpec` entries first. |
| Repo-wide last-green cache | Repeated unchanged-input reruns across integration events, with saved runtime materially exceeding the evidence complexity. |
| Environment fingerprinting | A suite shows environment-dependent results under unchanged digests — then fingerprint the demonstrated variables only. |

## 8. Sizing

Sol argued for **one session and a stop**, on the grounds that a
three-session set would have Session 2 validating selection against no real
consumer and Session 3 attesting a reduction on synthetic evidence. That is
correct and is why Set 129 is **two** sessions rather than three: one for
the mechanism, one for the doctrine and the record. The three-session
implementation shape Sol sketched (characterize → shadow → attest) is
recorded in §7's first and third rows as the *deferred* work, to be
authored when a consumer exists to validate it.
