<!-- Routed review of proposal.md. Model: gpt-5.6-sol. Commissioned by the operator during Set 128 Session 2, 2026-08-12. Saved raw: this is paid analysis and is never edited after the fact. -->

[Turn 0]
# Design review: multi-module retesting rules

## Executive decision

**Do not adopt the proposal wholesale.** It contains a useful abstraction—suite-owned input sets—but wraps it in unproven contract/mock machinery, an overly strong safety claim, and lifecycle rules that conflict with this repository’s established verification order.

**Adopt now:** one behavior-preserving session that formalizes `SuiteSpec.covers` as the complete suite input set and makes affected-suite computation explicit and auditable.

**Defer:** every new test-skipping rule, contract lock, mock-conformance system, module dependency graph, and E2E tier policy until a real consumer demonstrates the architecture and cost.

**Confidence: High.**

---

## 1. Fit assessment

### Strong mappings to existing machinery

| Proposal concept | Existing implementation | Assessment |
|---|---|---|
| Per-suite input paths | `ai_router/run_of_record.py::SuiteSpec.covers` | Already nearly the same concept. The missing part is the stronger semantic requirement that `covers` include all result-affecting files, not merely product paths. |
| Test-source subset | `SuiteSpec.tests`; `test_surface_prefixes()`; `classify_changed_paths()` | Already implemented as an allowlist for A4 classification. It must remain a subset/classification of suite inputs, not become a second affected-set authority. |
| Path-based affected set | `session_touched()` and the per-suite loop in `evaluate_freshness()` | Existing affected-set computation, although only boolean and based on declared `disposition.files_changed`. |
| Content hashing | `surface_digest()` | Direct match. It hashes path plus file contents for tracked and untracked, non-ignored files under `covers`. |
| Green run record | `TestRunRecord`, `record_run()`, `read_records()` | Direct match, but this is an attested result, not proof that the command ran. |
| Freshness after later edits | `evaluate_freshness()` | Direct match: the current surface digest must equal the latest recorded digest. |
| Close enforcement | `ai_router/gate_checks.py::check_test_run_fresh()` | Existing blocking close gate through `GATE_CHECKS`; it is not listed in `ADVISORY_CHECKS`. |
| Fail closed on hashing/repository failures | `surface_digest()` returning `None`; `evaluate_freshness()` producing a failing verdict | Good fit with R0. |
| Actual tree-to-tree delta | `ai_router/post_round_delta.py::_changed_paths_since()` and `classify_delta()` | Useful machinery, but it measures from a verification-round snapshot, not from the session or integration baseline needed by this proposal. |
| Shared inputs affecting multiple suites | Multiple `SuiteSpec.covers` lists can contain the same prefix | Already representable. No module resolver is required. |

### Partial mappings with important gaps

#### “Changed since the last known-green state”

This does **not** exist in the proposal’s required form.

`check_test_run_fresh()` passes `disposition.files_changed` into `evaluate_freshness()`. That list is authored by the session; it is not mechanically computed from Git. An omitted covered file can make a suite appear untouched.

`post_round_delta._changed_paths_since()` does use Git, but its baseline is `worktreeTreeAtCompletion` or `discoveryBaselineTree`. That answers A4’s post-verification question, not “what changed since the previous green suite or integration event.”

There is also no repository-wide last-green ledger. `test-runs.jsonl` is stored per session set.

#### Complete input hashes

`surface_digest()` covers declared files only. It does not include:

- the effective command as an input;
- environment-variable values;
- OS, locale, clock, randomness, available resources;
- installed runtime/tool versions unless represented by committed files;
- ignored dependencies or generated/build output;
- external services, registries, browsers, or mutable network data.

`evaluate_freshness()` records `TestRunRecord.command` but does not compare it with the current `SuiteSpec.command`.

#### R0 configuration safety

`load_suites()` is deliberately tolerant:

- malformed suite entries are silently dropped;
- an entry without `expensive: true` becomes non-gating;
- an all-invalid list can yield no suites;
- `testing.suites: []` explicitly disarms all suites.

`check_test_run_fresh()` then passes when no expensive suite remains. That is incompatible with the proposal’s claim that missing or unverifiable selection data forces retesting.

### Existing module machinery is organizational, not verification machinery

The module concept exists primarily in the extension:

- `tools/dabbler-ai-orchestration/src/types.ts::ModuleManifestEntry`
- `SessionSet.module`
- `tools/dabbler-ai-orchestration/src/utils/fileSystem.ts::readModulesManifest()`
- `tools/dabbler-ai-orchestration/src/providers/moduleAssembly.ts::assembleVisibleModules()`

The current repository has no root `docs/modules.yaml`; it exercises the implicit-module fallback.

There is no Python module-manifest reader used by `run_of_record.py`, no dependency graph, and no enforced correspondence between `codeRoots` and actual imports. `docs/planning/module-organized-projects-recommendation.md` §6.4 explicitly says the scope check does not exist.

That is a good reason **not** to connect test selection to module identity.

### Genuinely new machinery

The following would all be new:

1. A machine-readable dependency graph covering modules and hidden shared inputs.
2. Mechanical import/boundary enforcement.
3. A session-start or integration-baseline tree/digest.
4. A repository-wide last-green suite ledger.
5. Per-file skip evidence rather than the current aggregate digest.
6. Contract version and lock storage.
7. Mock-to-contract conformance verification.
8. Provider-side module contract verification linked to the exact run of record.
9. Merge/integration-event union computation.
10. Smoke/full E2E tier representation and scheduling.
11. Flake/environment qualification of a “fresh” run.
12. Operator-attested activation and rollback of new skip rules.

### Existing “contract gate” is not this proposal

`ai_router/contract_gate.py::validate_contract_gate()` verifies a per-session-set deterministic falsifier floor declared in `contract-manifest.json`. It does **not** model:

- module provider/consumer contracts;
- mock versions;
- mock conformance;
- downstream dependency locks;
- module-level test selection.

Its execution/evidence patterns may be reusable later, but it is not an implementation of L1–L5.

---

## 2. Honest disagreements

### 2.1 The proposal’s retest cadence is wrong here

Section 5 says to run the procedure “after a change.” Read literally, every affected full suite runs after each change.

That directly contradicts:

- A1: targeted tests only before verification;
- A2: no full suite before any cross-verification;
- A3: each required full suite runs once, after code-changing stages.

Those rules exist because Set 112 produced 15 runs and 186 minutes of verification work. The proposal would recreate the incident it is being considered to solve.

Affected-set computation should run only at this framework’s already-defined full-run point and at merge/release CI boundaries—not after every edit.

**Confidence: High.**

### 2.2 “Provably redundant, not a risk trade-off” is false

A deterministic pure function with a complete input set would produce the same result. Real pytest, Electron/mocha, and Playwright suites are not such functions.

Same file digest does not guarantee the same:

- scheduler/interleaving;
- browser or VS Code runtime;
- Node/Python dependency resolution;
- environment variables;
- filesystem timing;
- service state;
- network response;
- random seed;
- resource availability.

Skipping can be a justified, measured risk trade-off. It is not a proof of identical outcomes unless the suite is demonstrably hermetic and deterministic and the environment is part of the fingerprint.

The proposal should say:

> Unchanged declared inputs provide evidence that a rerun is likely redundant within a qualified execution environment; they do not prove identical outcomes for non-hermetic or flaky suites.

**Confidence: High.**

### 2.3 L4 overclaims safety and leaves a mock-conformance hole

L4 proves, at best:

- A still passes some tests against a contract;
- U’s unchanged tests still exercise unchanged mocks.

It does **not** prove that U’s mocks implement the contract correctly. L2 merely records a contract hash beside a mock. A hash pin is provenance, not conformance.

Concrete failure:

1. A’s contract says results are ordered, but the provider test checks only membership.
2. U’s mock returns the historical order.
3. A changes its real order.
4. Contract hash is unchanged; provider tests pass; U and its mocks are unchanged.
5. L4 authorizes skipping U.
6. The E2E smoke tier does not exercise that path.
7. Integration breaks later.

Even complete provider verification would not establish that a mock conforms. L4 would need **both** provider-to-contract and mock-to-contract executable conformance, plus a real boundary test for contract omissions.

There is also a conceptual problem: if U’s suite uses only unchanged mocks, rerunning it after A changes cannot reveal anything about A. Skipping U may be operationally reasonable, but the contract lock does not make the integration safe. Only a real integration/E2E surface can do that.

**Confidence: High.**

### 2.4 Contract locking is premature

No demonstrated consumer currently has:

- several leaf modules;
- a dedicated integration module;
- versioned behavioral contracts;
- mocks pinned to those contracts;
- provider and mock conformance tests;
- mechanically enforced dependency boundaries.

Building a generic lock protocol now would be designing against a diagram, not a system. It would increase the PyPI API, configuration schema, gate paths, documentation, and test matrix without evidence that any consumer needs it.

That conflicts with `docs/planning/project-guidance.md::Prefer removal over addition when fixing`.

**Confidence: High.**

### 2.5 The proposed architecture is not universal

I1 and I2 prescribe a star topology in which leaf modules cannot depend on one another and all interaction goes through U. That is one architecture, not a framework invariant.

Legitimate consumers may have layered dependencies such as:

```text
domain <- application <- API
```

The framework should model the graph a project actually has, not require an integration hub.

### 2.6 P1 is wrong for the session-set lifecycle

An integration event must not “replace end of session.”

The session close proves the branch/worktree’s own state and records its evidence. Merge-result verification is an **additional** boundary because two green branches can fail together. This is already recognized in:

- `docs/proposals/2026-08-11-multi-module-architecture/verdict.md` §5–§6;
- `docs/planning/module-organized-projects-recommendation.md`, which requires all-module tests on merge to `main`.

Replacing session close with merge verification would discard branch-local evidence and leave unfinished sessions dependent on external merge timing.

### 2.7 E1 is too broad for the universal core

“Any real-module change triggers E2E” conflicts with:

- `requiresE2E: false` as a permanent valid default;
- the portability rule;
- the intentionally selective Playwright `covers` list in `DEFAULT_SUITES`.

`run_of_record.py` explicitly avoids making every `ai_router/` change pay for Playwright. E1 would reverse that measured policy without consumer evidence or operator attestation.

Smoke and full E2E commands can already be represented as separate `SuiteSpec` entries when a consumer actually has them. No universal E2E-tier engine is justified.

### 2.8 Several AI rules are too absolute

- **G3 is wrong:** tests, mocks, and contracts sometimes are defective and must be changed. A4.1 exists specifically for legitimate test-only fixes. Privileged review is sensible; prohibition is not.
- **G4 is wrong as a universal rule:** sanctioned integration work necessarily crosses boundaries. The correct rule is “do not create undeclared dependencies.”
- **G1 hides the key judgment:** selecting the input set is itself a judgment. A perfect hash over an incomplete allowlist gives a confidently wrong answer.
- **G6 is not currently supportable:** the framework records an aggregate digest, not the individual hashes allegedly verified for a skip.

---

## 3. Minimal viable subset: one session

### Recommendation

Adopt **suite-owned input sets and explicit affected-set computation only**. Do not add module fields to `SuiteSpec`, and do not authorize any new skip behavior.

### Specific `run_of_record.py` API change

Keep the public/configuration field name `SuiteSpec.covers` for compatibility, but define it canonically as:

> The complete repo-relative allowlist of file prefixes that can affect the suite result: product source, test source, fixtures, contracts, mocks, shared libraries, lockfiles, build/test configuration, and checked-in toolchain configuration.

Add:

```text
AffectedSuite
- suite: str
- changed_inputs: tuple[str, ...]

affected_suites(files_changed, suites) -> tuple[AffectedSuite, ...]
```

Then:

- make `evaluate_freshness()` consume `affected_suites()` rather than independently calling `session_touched()` per suite;
- add `changed_inputs` to `FreshnessVerdict` for auditable CLI/gate explanations;
- retain `surface_digest()` over the same `covers` set;
- do not add `module`, `leaf`, `integration`, `contract`, or `lock` fields.

Also add a checked loading result, rather than silently losing malformed declarations:

```text
SuiteLoadResult
- suites: tuple[SuiteSpec, ...]
- errors: tuple[str, ...]
```

`check_test_run_fresh()` should block on suite-configuration errors rather than interpret an all-invalid declaration as “no expensive suites.”

### Direct answers to A5

1. **Who declares coverage?** The suite does. Modules remain grouping/ownership metadata.
2. **What happens on a shared change?** Every suite whose `covers` includes that shared path is affected. A separately declared shared suite may also be affected.
3. **How is A4.2 scoped?** To the actual diff, regardless of module. `post_round_delta.classify_delta()` already has the right scope.

### Three work steps

1. **Make suite inputs explicit.** Add `AffectedSuite`/`affected_suites()`, define `covers` as the complete input allowlist, and preserve all existing defaults and single-module behavior.
2. **Fail closed and report reasons.** Add checked suite loading, route `evaluate_freshness()` and `check_test_run_fresh()` through it, and report matched changed inputs per suite.
3. **Ship falsifiers and documentation.** Plant cases proving:
   - one shared input affects multiple suites;
   - one leaf-only input does not affect an unrelated suite;
   - a malformed/empty gating declaration cannot silently disable the gate;
   - an input changed after a run makes it stale;
   - absent `docs/modules.yaml` preserves today’s behavior.

This subset answers A5 without inventing module test routing. It makes no verification reduction, so it does not require a new operator attestation.

**Confidence: High.**

---

## 4. What must not be adopted

### Reject, not merely defer

1. The claim that unchanged hashes make skipping risk-free or mathematically proved.
2. Section 5’s apparent full-suite retest after every change.
3. P1’s replacement of session close with integration events.
4. I1/I2’s U-centered topology as a universal framework invariant.
5. G3’s prohibition on correcting tests, mocks, or contracts.
6. G4’s prohibition on all cross-module calls rather than undeclared calls.
7. E1 as an unconditional core rule overriding `requiresE2E` and suite declarations.
8. Module identity as an input to suite selection. Test inputs, not organizational labels, should determine affected suites.

### Explicit deferrals and triggers

| Deferred feature | Trigger for reconsideration |
|---|---|
| Contract locks and L4/L5 | A named consumer has at least two leaf modules, one mock-based integration module, versioned executable behavioral contracts, provider **and mock** conformance tests, and measured redundant downstream-suite cost. |
| Mechanical dependency graph | A consumer has at least two non-empty `codeRoots` and an actual cross-module dependency or hidden-coupling incident. The graph must be checked against imports/build dependencies before it may authorize skips. |
| New test-skipping enforcement | A machine-derived session/integration baseline exists, shadow selection has been compared with full runs over real merges, falsifiers have demonstrated failures, and the operator journals the verification reduction. |
| Smoke/full E2E policy | A consumer already has two independently executable named commands with measured runtimes and documented coverage boundaries. Represent them first as separate `SuiteSpec` entries. |
| Repository-wide last-green cache | A consumer demonstrates repeated unchanged-input reruns across integration events and the saved runtime materially exceeds the cache/evidence complexity. |
| Automated integration-event union | A real multi-developer consumer adopts a merge queue or serialized merge process and can identify the prospective merge commit mechanically. |
| Environment fingerprinting | A suite shows environment-dependent or flaky results under unchanged source digests; then fingerprint only the demonstrated variables rather than inventing a universal environment schema. |

---

## 5. Decomposition

A three-session implementation set is **not justified now**. Session 2 would have no real multi-module consumer against which to validate selection, and Session 3 would be asked to authorize a reduction based on synthetic evidence.

The right immediate shape is the one session above, followed by a stop.

When the named consumer trigger exists, use this separate three-session set:

### Session 1 — Characterize the real consumer

1. Inventory actual suite inputs, module dependencies, mocks, contracts, shared configuration, and environmental dependencies.
2. Establish mechanical boundary checks and a machine-derived integration baseline.
3. Plant shared-input, undeclared-dependency, and contract-drift falsifiers.

### Session 2 — Run affected selection in shadow mode

1. Compute the proposed affected set but continue running the full existing matrix.
2. Compare predictions with failures and flake behavior across real merges.
3. Add provider/mock conformance only where the consumer’s actual architecture requires it.

### Session 3 — Attest and activate

1. Present measured savings, false-negative evidence, known residual risk, and rollback procedure to the operator.
2. Journal the verification reduction and activate the selector only if attested.
3. Keep full prospective-merge/release verification as the independent backstop.

---

## 6. Ranked risks and failure modes

| Rank | Risk | Concrete failure scenario | Confidence |
|---:|---|---|---|
| 1 | **Incomplete inputs produce false skips** | `shared/schema.json` affects A and U but is absent from U’s `covers`; A changes it; U is declared unaffected and closes green. Hashing cannot detect an omitted dependency. | High |
| 2 | **Run evidence is only an attestation** | An agent runs a filtered pytest command, then calls `record_run(... outcome="passed")` for the full suite. L4 later treats the provider verification as established. `record_run()` never executes or corroborates the command. | High |
| 3 | **Provider pass does not prove mock conformance** | A and U are each green against different interpretations of an unchanged behavioral contract; U is skipped; integration fails. | High |
| 4 | **Environment/non-determinism invalidates the proof claim** | The same Playwright digest runs against a different VS Code/browser runtime or scheduler state and fails despite no covered-file change. | High |
| 5 | **Self-declared changed paths omit an obligation** | A covered file is missing from `disposition.files_changed`; `session_touched()` returns false, so `check_test_run_fresh()` never asks for the suite. | High |
| 6 | **Malformed configuration disables the gate** | Every item in `testing.suites` is malformed or omits `expensive: true`; `load_suites()` yields no expensive suites and the close passes. | High |
| 7 | **Individually green branches fail together** | Branch A changes a producer default; branch B changes a consumer assumption. Each digest and suite is green alone; the prospective merge is broken. | High |
| 8 | **E2E smoke creates false reassurance** | L4 authorizes a U skip, immediate smoke does not cover the affected boundary, and full E2E is deferred until an integration event after the branch has already been treated as safe. | High |
| 9 | **Literal adoption recreates verification waste** | Every remediation change triggers affected full suites before cross-verification, reproducing the 15-run/186-minute failure pattern A1–A3 were created to prevent. | High |
| 10 | **Universal-core complexity grows without a user** | Python gains graph, lock, contract, and module parsers while the only current repository remains single-module; future changes must preserve several unused schemas and fail-open paths. | High |
| 11 | **Digest excludes meaningful generated or ignored state** | A generated client or installed package changes under an ignored directory while all committed inputs remain unchanged; the recorded digest still matches. | Medium-high |
| 12 | **Overlapping large inputs make selection itself expensive** | Several suites each hash the same repository-wide toolchain/shared prefixes at record and close, replacing test cost with repeated full-tree hashing. | Medium |

## Final recommendation

**Approve only the one-session affected-set foundation. Reject the proposal’s safety proof and universal policies. Defer all contract/mock/lock machinery until a real consumer supplies both the architecture and measured evidence necessary to justify a human-attested verification reduction.**
