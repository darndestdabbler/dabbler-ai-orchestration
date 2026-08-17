# Project Guidance — dabbler-ai-orchestration

> **Purpose:** The single source of truth for durable strategic commitments
> (Principles) and specific rules and patterns (Conventions) that apply to
> this repo.
>
> **Note for consumer repos:** When bootstrapping a new AI-led-workflow repo
> from this template, the stub sections to fill in are listed in
> [`docs/guidance-lifecycle.md`](../guidance-lifecycle.md) →
> *Bootstrapping a consumer repo's `project-guidance.md`*.

Read this file before every AI-led session. Use it as the first-stop reference
before changing architecture, testing strategy, or workflow assets.

The file has two top-level sections:
- **Principles** — durable strategic commitments (the *why* and *what*). Slow
  to change; every principle should explain the reasoning behind itself.
- **Conventions** — specific rules, patterns, values, and code styles (the
  *how*). Faster to change; often promoted from successful lessons.

---

## Principles

### Documentation authority
<!-- lesson: id="G-001" -->

Shared operational facts that future orchestrators, reviewers, or release
operators may need must live in engine-agnostic docs or canonical package
metadata, not only in `CLAUDE.md`, `AGENTS.md`, or `GEMINI.md`. The root
instruction files are bootstrap entrypoints; if they repeat a shared fact,
the canonical source must still live under `docs/` or in package metadata.
This prevents one engine-specific file from drifting stale while another
continues to be updated.

### Orchestration and verification effort
<!-- lesson: id="G-002" -->

Spend independent-perspective effort (extra reviewers, multiple orchestrators)
where **solution-variance** and **irreversibility** are highest — which is
**front-loaded, at the planning / architecture / decomposition phase** — not
uniformly across every session. Route each check by **falsifiability** (a
deterministic contract/falsifier test settles most defects far cheaper than any
model) and by **solution-variance** (a multi-orchestrator panel earns its cost
only for work that is both oracle-free *and* genuinely divergent — typically the
top-level architecture/decomposition, not per-session execution). When a panel is
warranted, use **generate-diverse → adversarial cross-critique → synthesize →
operator-confirm**, never a consensus vote (consensus is not correctness). Judge
total cost across dollars, latency, *and* human-attention/rework — "cheap per run"
is not "cheap total." The full rationale, the tiered model, and the
when-NOT-to triggers live in
[`docs/planning/orchestration-strategy.md`](orchestration-strategy.md) (a reasoned
framework; the multi-orchestrator-planning part is not yet experimentally
validated — consider it, apply judgment).

### UAT is written for a stranger and pre-verified by automation
<!-- lesson: id="G-003" -->

Human UAT time is the most expensive verification resource in the workflow,
and a confusing walk destroys its evidentiary value: when a step is ambiguous,
the operator cannot tell a product bug from their own misreading, so the
attestation proves nothing. Therefore (operator-set bar, 2026-07-04, after
suspending the Set 077 UAT over instruction quality):

- **Write UAT steps for a reader with zero session context, at a low reading
  level.** Name the exact button labels, menu paths, file paths, and expected
  on-screen text. Never assume the human shares the orchestrator's context or
  can fill gaps ("no shared brain").
- **Any step automation can verify must be verified by automation (Playwright
  / Layer 3) BEFORE the checklist is offered to the human.** The human walk
  should contain only what automation genuinely cannot check. Untested
  instructions are not known to be followable.
- The intended direction is a DSL for human-action steps that compiles to
  Playwright tests (operator prototype: `D:\Projects\dabbler-uat-dsl`); a
  dedicated session set will evaluate it. Until then, apply the two rules
  above manually to every checklist.

### Practicality outranks rule-perfectionism
<!-- lesson: id="G-004" -->

A workflow rule exists to protect an outcome. When following its letter costs
real time or money and protects nothing, the rule has stopped doing its job —
name that and take the practical path (operator ruling, 2026-08-14). The
benchmark is what a highly skilled developer would do manually without
thinking twice about it.

Two worked cases, both from the test-run policy, both rulings:

- **Falling back to serial execution is not a verification reduction.** Serial
  was the default *before* parallelism was introduced, so the fallback is a
  return to baseline, not a compromise: it runs the identical specs with the
  identical assertions. Parallelism is an optimization, never part of the
  contract under test — by the opposite logic, `pytest -n auto` would make the
  Python suite a claim about its own parallelizability, which nobody makes.
- **Re-running what has already passed buys nothing.** When the declared
  command executes every test and one fails, re-running *that one* in
  isolation and finding it green means every test has executed and passed.
  Re-running the other thirty adds no coverage, only wall clock.

**The line this must not cross.** The test is *"did every test execute and
pass"*, not *"did it happen in one invocation"*. This principle licenses a
different **route to the same evidence** — never less evidence. Skipping a
test, dropping an assertion, or accepting a failure nobody re-ran is still a
verification reduction and still needs the operator. Record the route taken in
`decisions.jsonl` so the evidence stays auditable, and state the composition
in the disposition rather than presenting a composite as a single clean run.

### Prefer removal over addition when fixing
<!-- lesson: id="G-005" -->

When considering any fix, first look for something to **remove** — a state, a
branch, a surface — rather than something to add. If addition is unavoidable,
add the simplest thing that works. Banners, warnings, and conditional logic
accrete one plausible fix at a time, and every increment multiplies failure
modes and UAT surface (operator directive, 2026-07-04). Reviews and critiques
should explicitly challenge additive fixes and record why a removal-based
alternative was not possible.

---

## Conventions

### Code Style

<!-- lesson: id="G-006" -->
Encoded: `ai_router/cli_glyph_guard.py` + `tests/test_cli_glyph_guard.py` (Set 121 S3).

<!-- lesson: id="G-007" -->
Encoded: `ai_router/tests/test_contract_gate_schema.py` — parity tests already ship as true falsifiers (Set 121 S3).

<!-- lesson: id="G-008" -->
- **A bug is a bug CLASS — fix every sibling site, not just the reported one.** When a
  fix closes a *class* of defect (a robustness gap shared by several parallel
  readers / validators / handlers that all do the same thing), **grep the whole
  codebase for the pattern** and either fix every reachable sibling in the same pass
  **or** explicitly scope and record which siblings are deferred and why — so a
  residual is a *decision*, not an oversight. A point-fix at the reported site *reads*
  complete while the class stays alive everywhere else, invisible until something
  exercises it — often much later, on an expensive path like close-out. Triage each
  hit by reachability (is it on a never-raising / close-out / gate path?), fix the
  reachable ones, and name the deferred residual in the disposition; where practical
  ship a probe / falsifier that drives the *public entrypoint* with the bad input, so
  the class both reproduces and cannot silently re-open. Promoted from
  `lessons-learned.md` (L-069-1) on 2026-06-19 after application across Sets 068
  (origin: the `contract_gate` `UnicodeError` fix), 069 (a probe-template dogfood
  reproduced the still-latent `path_aware_critique.py` sibling class), and 072 (the
  four deferred sibling readers + `UnicodeError` folded in across both modules).

### Workflow Expectations

<!-- lesson-pointer: archived-set="121" -->
- Six entries here restated [`docs/session-constitution.md`](../session-constitution.md)
  — the preload reading list, raw verification artifacts, step logging,
  session-state SSOT and registration, routing `ai-assignment.md`, and obeying
  the spec's configuration block. The constitution is preload too, so each
  duplicate was paid twice and bought nothing; Set 121 S4 collapsed them into it.
  Full text in `lessons-archive.md`.
<!-- lesson: id="C-003" -->
- **A rejected blocking finding requires independent verifier acceptance,
  deterministic falsifying evidence, or operator adjudication — never the
  orchestrator's own reasoning.**
<!-- lesson: id="C-002" -->
- **Tests give deterministic evidence for exercised behaviour; verification owns
  requirements, *test adequacy*, residual risk and plausible counterexamples.
  Correctness is never out of scope.**
<!-- lesson: id="G-010" -->
- **Open every session-verification prompt with an up-front conventions
  block.** Before the work to be reviewed, state the suite baseline (exact
  pass/fail/skip counts and which failures are tracked), the release
  contract (what is bumped, what is deliberately pending), and any
  by-design exclusions (e.g. a research/proposal set ships no production
  code). This keeps Round 1 focused on real defects instead of burning
  findings — and re-verify rounds — on the agreed baseline. (L-064-10)
<!-- lesson: id="G-012" -->
- **Propagate a consistency fix to every echo before re-verifying.** The same
  claim echoes in summary tables, prose, per-row cells and quoting artifacts;
  grep the *old* phrasing and fix every echo in one pass. (L-065-1)
<!-- lesson: id="G-013" -->
- **Grade verification severity by CONSEQUENCE.** Probability the stated failure
  scenario hits a real user × impact. Low probability **or** low impact is
  Minor; no nameable failure scenario is a nit. Carry the rubric in each round's
  conventions block until it ships in the verification template. (L-095-1)
<!-- lesson: id="G-015" -->
- AI instruction documents (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`) reference
  this file and `docs/ai-led-session-workflow.md` so future runs inherit the
  same durable expectations.
<!-- lesson: id="G-018" -->
- **When a set's `pathAwareCritique` is `advisory` or `required`, run the
  end-of-set Path-Aware Critique stage before the set-terminal close.** A
  multi-provider (`>= 2` distinct providers), path-aware review — each critic
  reads the repo itself, not a pasted snippet — driven by
  `ai_router/prompt-templates/path-aware-critique.md` and saved raw as
  `path-aware-critique.json`. On `required` the close-out gate enforces a valid
  artifact (Set 066). Orthogonal to per-session routed verification. Mechanics:
  `docs/ai-led-session-workflow.md` → *The end-of-set Path-Aware Critique stage*.
<!-- lesson: id="G-019" -->
- **An iterative end-of-set dogfood keeps its own gate artifact "pre-fix" —
  frame it as evidence, not a clean snapshot.** Do not chase a pristine post-fix
  re-run; the next round re-stales it. Commit the **final round** as the gate
  artifact, record lineage + per-finding adjudication (fixed / false-positive /
  deferred-residual) in `disposition.json`, and let cross-provider session
  verification own the authoritative verdict. Converge when a round drives **no
  new code change**, not when it returns a clean one. (L-070-1; full text and
  the Sets 070–072 evidence in `lessons-archive.md`)
<!-- lesson: id="G-020" -->
- **Any set shipping provisioning must dogfood the true cold start.** A walk
  starting from a partially-provisioned fixture validates the steady state, not
  the first run, and provisioning is exactly where silent fail-open paths hide.
  For any set shipping provisioning (scaffold, install, seed, migrate-from-
  empty), at least one dogfood/UAT walk must begin from a fresh empty folder
  with no pre-seeded config, assert the provisioned artifacts exist (or are
  correctly absent), and be named in the spec's "Ends with" line. (L-079-3; full
  text and the Sets 079–082 evidence in `lessons-archive.md`)
<!-- lesson: id="G-022" -->
- When the human gives a session instruction or decision that appears durable
  enough to guide future sessions, ask whether it should be incorporated here.
<!-- lesson: id="G-023" -->
- When a failure reveals a reusable strategy, recommend a corresponding update
  to `docs/planning/lessons-learned.md`.

### Build and Test

<!-- lesson: id="G-024" -->
- **Any session touching Explorer-rendering surfaces, state-file writers, the
  extension MANIFEST, or the fixture harness runs the full
  `npm run test:playwright` locally before close — after its last code change.**
  Never start an expensive run you are about to invalidate, **and** run it once
  after the final edit; targeted re-runs are not a substitute. `package.json`
  counts as product. When CI is red, CANCELLED jobs are unknown coverage, not
  passing coverage. (L-064-12)
