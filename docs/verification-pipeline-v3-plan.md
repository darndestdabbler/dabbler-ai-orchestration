# Verification Pipeline Operationalization Plan

**Status:** Proposed implementation plan
**Date:** 2026-08-19
**Source:** Multi-Model Code Critique Pipeline proposal v3, Gemini review,
GPT Sol review, and the Codex rollout/testing guidance
**Repository:** `dabbler-ai-orchestration`

## 1. Executive decision

Implement v3 as an additive policy layer over the current verification loop,
not as a replacement and not as a revival of cancelled set 138.

The first production shape is synchronous and CLI-driven:

1. Local deterministic checks and **affected tests only** run first. The full
  suite is explicitly excluded from ordinary pre-verification G0.
2. The router records normalized G0 facts and a deterministic risk decision.
3. In shadow mode, the router creates canonical check IR, executes bounded
   worker checks, validates evidence, and records dispositions without
   affecting close.
4. Lite enforcement is the first policy allowed to become default-on.
5. Standard/deep routing, adaptive calibration, daemon operation, and richer
   exemptions remain off until their evidence gates pass.
6. After the last code change has passed verification, the full suite runs
  once as the test run of record before commit and close.

This sequence deliberately postpones the most ceremonial and failure-prone
parts. The local daemon and five queue directories are not prerequisites for
proving that check IR, evidence contracts, risk routing, and dispositions
produce findings worth their cost.

## 2. Preconditions and repository constraints

### 2.1 Post-set-139 baseline

Set 139 is complete and released. The implementation baseline is the clean,
pushed `master` commit `8be18fb8`, immediately after tag `v1.1.0` at
`3ebda389`.

Facts fixed at this baseline:

- all three set-139 sessions are `VERIFIED`;
- the catalog refresh, writer stamp, and project-local override are live;
- the seat has confirmed Anthropic and OpenAI routing through `copilot-cli`;
- seat calls remain unpriced in the router metrics and must not be treated as
  zero cost;
- the Python suite is **475/480**, leaving only five slots;
- the VS Code extension was unchanged and remains on its separate release
  track.

The five-slot headroom means implementation is blocked by the test-budget
entry criterion below. Branch isolation makes that investigation reversible;
it does not waive the ceiling or justify deleting meaningful coverage.

### 2.2 Branch isolation and merge policy

This work is an experiment with an explicit kill criterion and must not be
developed directly on the released `master` line.

Use this branch topology:

```text
master @ 8be18fb8
  \
  experiment/verification-pipeline-v3       # integration and evidence branch
    \
     verification-v3/set-141-contracts     # short-lived implementation branch
     verification-v3/set-142-g0-risk
     verification-v3/set-143-workers
     verification-v3/set-144-corpus-audit
     verification-v3/set-145-lite-enforcement
```

Rules:

1. Create `experiment/verification-pipeline-v3` from `8be18fb8`, push it, and
  treat it as the only integration target for sets 141-145.
2. Implement each set on its own short-lived child branch. Merge a child into
  the experiment branch only after its scoped tests and cross-provider
  verification pass. Do not merge child branches directly to `master`.
3. Keep all new behavior default-off or shadow-only on the experiment branch.
  No package or extension release is cut from it.
4. Ordinary production fixes continue on `master`. Merge `master` into the
  experiment branch at set boundaries, resolve drift there, and rerun the
  affected checks. Never merge unfinished experiment work into a release fix.
5. Machine-run evidence remains branch-local and gitignored. Durable corpus
  fixtures, schemas, and design decisions are committed; raw `.dabbler/runs/`
  artifacts are never committed or copied between branches as verdicts.
6. The experiment branch may merge to `master` only after set 145, all section
  11 release gates, a final review of the complete branch diff, and an
  operator go/no-go decision. Merge as a deliberate release change, not as a
  sequence of partially enabled sets.
7. If the kill criterion fires or test capacity cannot be reclaimed without
  weakening coverage, archive the measurement outside the repository and
  close/delete the experiment branch. `master` remains the working baseline;
  no revert campaign is required.
8. Record the baseline commit and experiment branch name in every set spec so
  a resumed session cannot accidentally operate on `master`.

Creating or switching these branches is an operator action. This plan defines
the topology but does not itself authorize an agent to create a branch without
an explicit instruction.

### 2.3 Preserve current controls

- Keep `.github/workflows/test.yml` lines 21-79 as the baseline CI gate:
  Python pytest plus extension typecheck, lint, unit tests, and bundle compile.
  This merge/release CI run does not justify running the same full suites
  locally before model verification.
- Keep the five existing close gates. G0 is a pre-review execution stage, not
  a sixth close gate.
- Keep current cross-provider verification, round cap, dispute,
  adjudication, waiver, and machine-written ledger semantics.
- Keep the current monolithic evidence path as the fallback until a new path
  has passed corpus and live shadow evaluation.
- Do not restore set 138's generic seven-tier context builder. Check-specific
  authorized pulls are narrower and must be mechanically enforced by the
  execution environment, not merely stated in a prompt.
- Keep TypeScript as a renderer. Python decides policy and emits projection
  fields; TypeScript parses and presents them.
- Add no Python module unless another is deleted. Initial work must fit the
  existing `verify.py`, `ledger.py`, `evidence.py`, `selection.py`,
  `verdict.py`, `metrics.py`, `config.py`, `progress.py`, and schemas.

### 2.4 Test execution policy: targeted before verification, full after

The router must make the economical path the mechanically accepted path.
Prompt wording alone has repeatedly failed to stop orchestrators from running
the full suite before verification.

The required lifecycle is:

```text
edit -> affected tests + cheap deterministic checks -> verification
    -> remediation -> affected tests + invalidated checks -> re-verification
    -> final verified tree -> full suite once -> record -> commit/close
```

Rules:

1. **Pre-verification:** run only tests selected from changed paths, module
  ownership, dependency edges, and configured affected-test rules. Run
  compile/typecheck/lint/static checks only when they are cheaper than the
  full test suite and relevant to the changed surface.
2. **No speculative full suite:** a full-suite command is neither required
  nor accepted as ordinary G0 evidence. The verification command must name
  the selected tests and the deterministic reasons each was selected.
3. **Selection uncertainty is risk, not permission to run everything:** when
  the framework cannot map a changed path to tests, record `selection_unknown`
  and raise routing risk. Run configured smoke/contract tests, then let
  verification inspect the gap.
4. **Repository-wide exception:** a pre-verification full suite is permitted
  only when the deterministic selector proves that every test is affected
  (for example a test runner, shared bootstrap, or global build configuration
  changed), or an operator explicitly supplies `--allow-full-preverify` with
  a non-empty reason. The artifact records which exception applied.
5. **After remediation:** rerun the failed tests plus tests invalidated by the
  fix, not all tests. A changed remediation tree invalidates the prior
  verification but does not automatically widen test scope.
6. **Run of record:** after the final verification succeeds and no code will
  change, run the complete configured suite exactly once, record its tree
  digest, commands, outcome, duration, and coverage where available, then
  commit and close.
7. **Failure after verification:** if the run of record fails, fix the defect,
  rerun affected tests, re-verify the changed tree, and only then rerun the
  full suite. The previous full run is stale evidence, not reusable proof.
8. **CI remains full:** pull-request and release CI continue to run the full
  Python and extension suites independently.

Test evidence records distinguish `preverify-targeted` from `final-full`.
Pre-verification records include selected test IDs or files and selection
reasons; final records include the declared complete suite and verified tree
digest. The existing `test_run_fresh` close gate remains evidence-only: it
checks that required `final-full` records are passing and fresh for the
current surfaces, and never launches a test command itself.

The framework cannot prevent an agent from manually typing an arbitrary test
command in a shell. It can prevent that waste from becoming the prescribed or
accepted workflow: generated instructions name the targeted command; G0 marks
unapproved full-suite evidence `policy_violation`; verification refuses to
start until targeted selection evidence exists; metrics record pre-verification
full-suite duration as avoidable ceremony.

### 2.5 Test-budget entry gate

The post-set-139 repository has 475/480 Python tests. This proposal cannot
honestly fit without reclaiming test slots.

Before implementation, reserve **48 Python test slots** and **8 TypeScript
test slots** for sets 141-145. This requires reclaiming at least 43 Python
slots from the 475-test baseline. Reclaim slots only by deleting superseded
or duplicative tests when behavioral coverage remains explicit. Do not hide
the count with parameterization: collected cases count against the ceiling.
If 43 defensible slots cannot be found, stop and re-scope or kill the
experiment before writing production code.

The implementation allocations below are ceilings, not targets. One test
continues to cover one behavior; there are no source-text assertions,
migration-path tests, or tests of test infrastructure.

## 3. Compatibility decisions

### 3.1 Do not overload `change-log.md`

The proposal's per-change `change-log.md` conflicts with the repository's
existing end-of-session-set `change-log.md`, which is written by lifecycle
code and already participates in close behavior.

Use canonical `review-claims.json` instead. A `verify prepare` operation
validates author-supplied claims and writes the canonical copy under the
machine-owned run directory. A Markdown rendering may be generated for
humans, but it is never canonical and is never parsed.

### 3.2 Additive run artifacts

Store critique artifacts under:

```text
.dabbler/runs/<set>/s<N>/critique/<change-id>/
  review-run.json
  g0-summary.json
  review-claims.json
  checks.json
  worker-results.jsonl
  dispositions.jsonl
  audits.jsonl
```

`change-id` is derived from the reviewed tree/diff digest, not chosen by a
model. A remediation creates a linked attempt; it does not rewrite prior
evidence. Only router commands write these files, using validation before an
atomic replace or append. Hand-written records never count.

Do not create `verify-inbox/`, `instructions-outbox/`, `worker-results/`,
`escalations/`, and `candidates/` as independent queues in the synchronous
implementation. Introduce queue transport only with the deferred daemon.

### 3.3 Preserve the verdict vocabulary

Keep the existing `critical | major | minor` severity vocabulary so the new
pipeline does not fork `rounds.schema.json`, `verdict.py`, gates, and the
extension. Default CPCF weights are:

| Severity | Weight |
| --- | ---: |
| critical | 16 |
| major | 4 |
| minor | 1 |

Use no more than six defect classes:

1. `safety-data-loss`
2. `boundary-auth`
3. `contract-compatibility`
4. `logic-state`
5. `reliability-performance`
6. `maintainability-test`

Safety/data-loss, boundary/auth, and exposed contract findings are designated
classes and require human approval when accepted rather than fixed.

## 4. Check IR v1 decision

The IR describes bounded work for a model; it is not a general programming
language. Freeze a versioned v1 schema after a corpus spike.

Minimum fields:

- identity: `schema_version`, `check_id`, `source`, `executor`;
- objective: one imperative semantic question;
- selector: one closed source among changed files/hunks, claims, G0 facts,
  or manifest-declared paths;
- condition operators: `for_each`, `all`, `any`, `not`, `if`, `exists`,
  `equals`, and `count`;
- scope: explicit paths/globs plus whether only changed content is eligible;
- branch: named outcomes with nesting depth at most 2;
- evidence contract: complete `pass`, `fail`, and `blocked` shapes;
- authorized pulls: the only paths the worker process may read;
- resource bounds: file count, bytes, and execution timeout.

The following do not belong in model IR:

- recursive or unbounded traversal;
- whole-program data flow;
- temporal/state-machine execution;
- dynamic dispatch resolution;
- compilation, tests, lint, schema validation, or exact AST queries;
- arithmetic or aggregation better performed deterministically;
- architecture decisions or disputed spec meaning.

Those cases compile to code, run as G0 executables, or go to adjudication.
An IR check that repeatedly needs a new operator is evidence that it belongs
in code.

## 5. Evidence contract decision

### 5.1 Positive evidence

Every quote carries path, byte or line span, content hash, and expected AST
kind where a supported parser exists. The framework verifies the quote
against the reviewed tree and checks the AST node at that location. A string
literal containing code-like text cannot satisfy a call-site contract.

### 5.2 Negative evidence

An enumerated-scope search proof is adequate only for a syntactic absence
claim over a closed, readable scope. The framework, not the worker, reruns
the declared literal/regex/AST queries and records scope, query, tool version,
and result.

Cheaply unprovable absence claims include runtime registration, reflection,
dynamic imports, generated code, alias-heavy call graphs, environment-driven
behavior, and semantic claims such as "no path can leak this field." Their
fallback is, in order:

1. deterministic test or analyzer;
2. a narrower positive counterexample check;
3. `blocked` plus manager adjudication;
4. human review for a designated class.

No such claim may be converted from `blocked` to `pass` because the worker
ran out of context or tools.

### 5.3 Refute short-circuit

A newly passing test auto-closes a finding only with red-green proof: it must
fail against the pre-fix reviewed tree and pass against the remediation tree,
while targeting the cited behavior. A merely new passing test is not enough.
When replay is impossible or ambiguous, route the refute to semantic
adjudication.

## 6. G0 and risk decisions

### 6.1 G0 execution

G0 normalizes outputs from configured repository executables. It does not
reimplement each language's compiler, linter, coverage engine, or security
analyzer in Python.

Initial normalized facts:

- compile/typecheck/lint/static-analysis outcomes;
- affected-test selection, selection reasons, command fingerprint, outcome,
  duration, reviewed tree digest, and freshness;
- `selection_unknown`, `all_tests_affected`, and an operator-approved
  full-preverification exception as distinct states;
- manifest boundary violations;
- exposed API diff when a language-native emitter exists;
- changed-line coverage and uncovered changed lines when coverage data exists;
- test deletion or assertion weakening signals;
- complexity delta from a configured analyzer;
- sensitive-path and concurrency-rule outcomes only where an executable rule
  is configured for that language/module.

Unsupported checks report `not_applicable` or `unknown`, never `pass`.
Unknown high-value controls raise routing risk rather than creating false
assurance. A red required G0 result returns to the author before model spend.
An unapproved full-suite command in pre-verification G0 is a
`policy_violation`: it does not satisfy the affected-test requirement and the
router refuses to dispatch verification until valid targeted evidence exists.

### 6.2 Risk scoring

Implement the v3 table as a pure deterministic function in `selection.py`.
Each contribution is recorded by name, value, and source fact. Correlated
signals remain visible so later calibration can group them.

The initial score runs in shadow mode. It may recommend `lite`, `standard`,
or `deep`, but current verification behavior remains authoritative until the
enablement gates in section 10 pass.

Only **docs-only** changes may be considered exempt initially. Comment-only,
generated, lockfile, and format-only exemptions are deferred until measured
false-positive savings exceed observed miss risk.

## 7. Disposition and escalation decisions

Worker results are exactly `pass | fail | blocked`, validated against the
check's per-outcome contract. Every report includes an engagement canary;
canary failure invalidates the whole report rather than becoming a finding.

For each failed check the author records exactly one disposition:

- `fix`: link the patch/remediation tree, rerun affected tests and cheap G0
  checks, then rerun only failed or invalidated model checks;
- `refute`: red-green test proof auto-closes, otherwise cited grounds route to
  the manager;
- `accept`: severity, defect class, and ticket are mandatory; independent
  triage is required before the finding enters CPCF;
- `escalate`: invoke the manager path explicitly.

Reuse the current dispute/adjudication machinery for unresolved blocking
findings. Do not create a second final-verdict channel. Manager check
adjudication can resolve worker semantics, but only the existing verified,
adjudicated, or human-waived ledger path may unblock close.

Deep routing must preflight role feasibility against the refreshed catalog.
It must never silently collapse two required vendor families into one. In a
two-manager deep review, each manager may adjudicate the other's authored
checks; neither adjudicates its own contested check. If provider diversity is
unavailable, report `blocked` or require a human rather than weakening the
constraint.

## 8. Probation and compile-down decision

A prose playbook may enter probation only when all of these are true:

1. It came from a confirmed finding in the candidate stream.
2. Independent triage confirms the finding and defect class.
3. A replay fixture demonstrates that current G0 and standing playbooks miss
   it and the candidate check finds it.
4. `why_not_executable`, owner, expiry date, carrying cost, and expected reuse
   are recorded.
5. Fewer than three probationary playbooks are active; otherwise admission is
   one-in/one-out by marginal CPCF.

Probation lasts one audit cycle or 30 days, whichever is longer, with a hard
60-day maximum. Permanent admission requires positive marginal recall and
competitive marginal CPCF on corpus or live audited samples. Expiry without
that evidence deletes the playbook. It is not archived as active guidance.

Begin with the proposal's three standing playbooks. Expansion from 3 to 6
requires corpus evidence. Twelve remains the hard ceiling. Every quarterly
review tries deterministic compilation first; an executable replacement
deletes or shrinks the prose in the same change.

## 9. Sequential audit and sparse calibration decisions

### 9.1 Audit policy

Use routing-signature buckets, not individual modules, as primary strata;
module-specific strata are created only after a miss. This avoids fragmenting
already sparse evidence.

- Start premium audit at 20% for lite and silent standard outcomes.
- Sample at least one eligible item per active stratum per week.
- After at least 30 clean audited items in a stratum and a one-sided 95%
  upper confidence bound below a 10% miss rate, reduce to 10%.
- After at least 59 clean audited items and the same bound below a 5% miss
  rate, reduce to 5%.
- Do not drop below 5% during this plan.
- Any audit miss resets that stratum to 20%, promotes the matching signature
  or module, and adds a replayable corpus case.
- A critical miss immediately forces deep or human review for the matching
  signature until recovery evidence exists.

Audit-discovered misses count double in recall reporting as proposed, but the
raw numerator and denominator must also be shown.

### 9.2 Calibration under sparsity

Do not fit free per-signal weights to a small finding set. Initial weights and
tier boundaries remain frozen through the first complete sequential-audit
cycle.

After that cycle:

- promotion is immediate after a critical miss and conservative after a major
  miss;
- demotion requires at least 50 audited exposures, no critical miss, and the
  relevant one-sided confidence bound below the target for two cycles;
- change any weight by at most 1 per monthly review;
- change correlated signals as a documented group rather than crediting each
  independently;
- evaluate proposed changes against a held-out corpus partition before live
  use;
- keep calibration advisory until one further stable audit cycle.

There is no CPCF-driven automatic routing until priced and unpriced spend has
been reconciled and these criteria pass.

## 10. Rollout sets

Set numbers are provisional. Scaffold them only after set 139 merges.

### Set 141: Contracts and synchronous shadow records

**Purpose:** Prove canonical artifacts and validators without changing close
or routing behavior.

Session 1:

- Reconcile post-139 state and reclaim/reserve the 48 Python test slots.
- Freeze schema v1 for review run, claims, check IR, worker results, and
  dispositions.
- Add feature configuration with default `off` and explicit `shadow`.

Session 2:

- Add machine-only paths/readers/writers in `ledger.py`.
- Add `verify prepare` in `verify.py`; derive immutable `change-id` and ingest
  validated author claims.
- Generate human-readable Markdown twins without parsing them.

Session 3:

- Implement evidence provenance, AST-kind checks for supported parsers, and
  framework-executed absence searches in `evidence.py`.
- Round-trip one seeded fixture from prepare through validated empty results.

**Python test allocation:** at most 11.

**Exit:** Old ledgers remain readable; hand-edited or malformed new artifacts
fail closed; current `verify` and close behavior are unchanged.

### Set 142: G0 facts, claims, and risk shadow

**Purpose:** Build economical deterministic inputs before paying models and
make accidental pre-verification full-suite runs invalid evidence.

Session 1:

- Implement deterministic affected-test selection from changed paths, module
  ownership, dependency edges, and configured repository rules.
- Extend `test_evidence.py` records with the closed stages
  `preverify-targeted` and `final-full`; make freshness evaluation accept only
  the latter as the close run of record.
- Normalize selected test commands and configured compile, lint, coverage,
  boundary, API, and analyzer outputs into `g0-summary.json`.
- Detect full-suite command fingerprints. Reject them before verification
  unless the selector proves all tests are affected or the operator records
  the explicit override and reason.
- Update the managed orchestrator instructions and verification refusal text
  to print the affected-test command before verification and the full-suite
  command only after the final verified tree. Remove any generic
  pre-verification wording that an agent can interpret as "run all tests."
- Return red required facts before model spend.

Session 2:

- Validate `review-claims.json` against G0 uncovered lines and mechanical
  facts.
- Pre-register the four-week-or-statistical-power deletion bet for claims.

Session 3:

- Implement auditable risk scoring in `selection.py`.
- Run tier and docs-only exemption classification in shadow; record both the
  recommendation and current actual route.

**Python test allocation:** at most 10.

**Exit:** Every risk point traces to a deterministic fact; unsupported G0
controls are visible; no exemption or route changes production behavior. A
normal change cannot satisfy pre-verification G0 with a full-suite run.

### Set 143: Workers, managers, and dispositions

**Purpose:** Execute useful checks synchronously while preserving the current
final-verdict path.

Session 1:

- Parameterize one standing playbook into IR.
- Execute one worker in a process/tool sandbox that enforces authorized pulls.
- Validate canary, positive evidence, negative evidence, and `blocked`.

Session 2:

- Add standard manager authoring and IR validation bounce-once behavior.
- Add opt-in deep two-manager authoring with preflight provider feasibility.
- Route framework-executable manager output to a candidate executable record,
  not a worker.

Session 3:

- Add `fix`, `refute`, `accept`, and `escalate` disposition writers.
- Implement red-green test short-circuit and independent ticket triage.
- Bridge unresolved blocking findings to current dispute/adjudication.

**Python test allocation:** at most 13.

**Exit:** A seeded fail can be fixed, refuted, accepted, or escalated with an
honest immutable record. Shadow mode still cannot block close.

### Set 144: Corpus, metrics, and sequential audit

**Purpose:** Determine whether the pipeline earns enforcement.

Session 1:

- Build a versioned seeded corpus of at least 30 defects across severity and
  defect classes, plus replayable historical defects.
- Extend `scripts/corpus_acceptance.py` for new required fields while keeping
  legacy sets additive/tolerant.
- Preserve a holdout partition for calibration decisions.

Session 2:

- Add CPCF, stratified recall with denominators/confidence intervals, blocked
  rate, canary failure, escalation, ceremony share, latency, manager yield,
  and triage backlog metrics.
- Join seat-transport conversation IDs to measured credit cost before CPCF;
  report unknown CPCF when spend remains unpriced.
- Record the 10% premium spot-check baseline on the same corpus/provider mix.

Session 3:

- Implement the 20% sequential audit sampler and confidence-bound decay in
  shadow.
- Run one seeded end-to-end set: G0 -> claims -> risk -> IR -> worker ->
  disposition -> current final verification ledger.
- Assert the order on that seeded set: targeted tests precede verification;
  the full suite occurs only after the final verified tree and is bound to
  that exact tree digest.

**Python test allocation:** at most 8.

**Exit:** Corpus recall and cost reports are reproducible; the round trip is
green; no policy is default-on.

### Set 145: Lite enforcement, ratchet, and minimal projection

**Purpose:** Enable only the portion supported by measured evidence.

Session 1:

- Evaluate the enablement criteria below.
- If they pass, allow explicit `lite` enforcement, then default-on lite in a
  later release. If they fail, keep shadow mode and remediate or invoke the
  kill criterion.

Session 2:

- Implement the candidate stream, probation admission, expiry, and
  compile-down record.
- Admit no new playbook merely to demonstrate the mechanism.

Session 3:

- Add additive Python projection fields for tier, state, blocked count, and
  unresolved dispositions.
- Add TypeScript parser and tree-descriptor tests only.
- Do not add manager-role UI or policy controls.

**Test allocation:** at most 6 Python and 8 TypeScript.

**Exit:** Lite policy is enforced only if evidence supports it; the extension
renders Python truth; probation cannot become an unbounded archive.

## 11. Enablement and release gates

### 11.1 Required before any enforcement

- Full existing Python and extension CI is green.
- The affected-test selector demonstrates that ordinary changes cannot pass
  pre-verification G0 using full-suite evidence, while the two explicit
  repository-wide exceptions remain auditable.
- A seeded remediation proves targeted reruns occur before re-verification
  and the complete suite runs only on the final verified tree.
- Schema and corpus acceptance checks are green.
- The seeded end-to-end round trip is green.
- Malformed artifact acceptance, unauthorized pull, and queue corruption
  counts are zero.
- Corpus point recall is at least 0.70 overall and 0.90 for critical cases,
  with denominators and confidence intervals reported. If the denominator is
  too small to support the claim, enforcement remains off.
- CPCF is no worse than the 10% premium spot-check baseline on comparable,
  priced observations.
- Ceremony is at most 15% and median lite latency is at most 10 minutes.
- Blocked checks and canary failures are within pre-registered bounds.

### 11.2 Explicit evidence-based deferrals

- **Deep routing default-on:** defer until corpus recall, provider-role
  feasibility, cost, and one full sequential-audit cycle are stable. Deep may
  exist only as an explicit experiment before then.
- **Daemon default-on:** defer until soak runs show zero lost/duplicated work,
  queue corruption, protocol incompatibility, and orphan leakage.
- **Adaptive calibration and CPCF auto-routing:** defer until at least one full
  stable sequential-audit cycle, reconciled cost data, and holdout evaluation.
- **Richer exemptions:** defer every class beyond docs-only until measured
  false-positive reduction outweighs audited miss risk.
- **Manager-role UI:** defer until disposition semantics are stable in CLI and
  ledger artifacts.
- **Language-generic sensitive/concurrency analysis:** defer unless backed by
  a real executable for that language. Do not substitute model judgment for a
  missing perimeter control.

### 11.3 Kill and rollback

- If severity-weighted CPCF is worse than the 10% premium baseline for four
  consecutive comparable weeks, disable the policy and return to the
  baseline.
- Any critical silent miss immediately disables exemption for the matching
  shape and promotes it to deep/human review.
- A schema/ledger integrity failure disables new-policy enforcement; current
  verification remains available.
- Rollback is a configuration change from enforcement to shadow/off. It must
  not require deleting or rewriting machine evidence.

## 12. Deferred daemon boundary

The daemon is the v3 addition most likely to cost more ceremony than it
returns. Build it only after synchronous operation demonstrates durable work
that must survive editor/process lifetime.

When justified:

- **Extension owns:** commands, status rendering, explicit start/stop request,
  and user-visible diagnostics. It never decides routing or validates review
  evidence.
- **Daemon owns:** queue polling, atomic state transitions, schema/evidence
  validation, vendor adapters, batching, leases, retries, and metrics.
- **Python CLI owns:** protocol-compatible one-shot operations and recovery,
  so the daemon is not the only way to inspect or repair a run.

Required controls:

- protocol-version handshake and executable/package version match;
- one daemon lease per repository, PID plus heartbeat, and stale-lease
  recovery;
- write-temp, fsync where supported, then atomic rename;
- idempotency key per change/check/attempt;
- append-only transition journal and deterministic crash recovery;
- quarantine for invalid records, never best-effort skipping;
- bounded retry with visible terminal failure;
- no secrets in queues or logs.

Soak acceptance is zero lost, duplicated, or misattributed work; zero version
skew accepted; zero unreaped orphan daemons; and recovery after forced editor,
daemon, and machine termination. Until then, synchronous CLI mode remains the
default and reference implementation.

## 13. File ownership map

| Concern | Existing owner | Expected tests |
| --- | --- | --- |
| CLI orchestration, prepare, execution | `ai_router/verify.py` | `tests/test_verify.py` |
| Machine artifact paths/read/write | `ai_router/ledger.py` | `tests/test_ledger.py` |
| Provenance, AST kind, tree/diff identity | `ai_router/evidence.py` | existing evidence protocol tests |
| Affected-test selection and run-of-record policy | `ai_router/test_evidence.py`, `ai_router/verify.py` | `tests/test_evidence_protocol.py`, `tests/test_verify.py` |
| Generated orchestrator test instructions | `ai_router/bootstrap.py`, managed prompt text | `tests/test_bootstrap.py` |
| Risk score and role feasibility | `ai_router/selection.py` | `tests/test_selection.py` |
| Result/disposition vocabulary | `ai_router/verdict.py` | `tests/test_verdict.py` |
| Spend and CPCF inputs | `ai_router/metrics.py`, `ai_router/seat_cost.py` | `tests/test_metrics.py`, `tests/test_seat_cost.py` |
| Feature flags and thresholds | `ai_router/config.py`, config schema | `tests/test_config.py` |
| UI projection truth | `ai_router/progress.py` | `tests/test_progress.py` |
| TS parsing/render descriptors | extension `types.ts`, `projection.ts`, tree model | existing TS unit suites |
| Legacy/new corpus regression | `scripts/corpus_acceptance.py` | script execution in CI |

`gates.py` should remain unchanged unless a concrete failure proves that the
existing `verification_clean` gate cannot consume the final ledger truth. A
new gate is not part of this plan.

## 14. Definition of done

The plan is complete when:

1. Existing verification and close behavior remain backward compatible.
2. Ordinary pre-verification G0 accepts affected-test evidence and rejects an
  unapproved full-suite run; the complete suite is recorded only against the
  final verified tree.
3. G0 prevents deterministic failures from spending model budget.
4. Every model check is versioned IR with mechanically enforced scope and a
   complete evidence contract.
5. Every fail has one disposition and every accepted ticket is independently
   triaged before it affects CPCF.
6. Corpus and live audit reports expose denominators, confidence intervals,
   priced/unpriced spend, and ceremony.
7. Lite enforcement has passed its release gates or remains honestly off.
8. Deep routing, daemon mode, calibration, richer exemptions, and manager UI
   remain deferred unless their own evidence gates pass.
9. The total suite stays within 480 Python and 215 TypeScript tests.
10. No new Python module was added without deleting one, and no rule is
   implemented in both Python and TypeScript.
