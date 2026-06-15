# Cadence Study + Contract-Test Gate Spec (Set 068)

> **Purpose:** Resolve the one question Set 067 deliberately left open — **is the
> routed per-session verifier worth keeping?** — by building the
> disposable-worktree **`run_test` sandbox** (the write-caged execution cage the
> read-only Set 067 adapter lacks), running **Experiment B** (the cadence /
> staged-snapshot intervention study that Experiment A could not, because A held
> cadence constant), making the routed **keep / demote / retire** decision on
> that evidence, and shipping the **contract-test / CDC gate** that
> Experiment A's ~95%-probeable finding supports. Two items carried forward from
> the Set 067 0.21.1 follow-up ride along: the **symmetric Experiment A re-grade**
> (settle the H1-magnitude / H2 question the 0.21.1 erratum opened) and **full
> ReDoS isolation** for the pull verifier's `grep` (the heuristic shipped in
> 0.21.1 is a stopgap; the subprocess/worktree machinery this set builds is its
> proper home).
> **Created:** 2026-06-15
> **Session Set:** `docs/session-sets/068-cadence-study-and-contract-gate/`
> **Prerequisite:** Set 067 (`067-pull-verifier-adapter-experiment-a`) complete —
> it shipped the read-only `pull_route` adapter + the opt-in path-aware-critique
> producer (`ai_router` 0.21.1) this set extends, and ran Experiment A
> (capability), whose deferred companion (cadence) is this set's core.
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: false
requiresE2E: false
uatScope: none
pathAwareCritique: required   # dogfood continues (Set 066/067 norm); see rationale
prerequisites:
  - slug: 067-pull-verifier-adapter-experiment-a
    condition: complete
```

> Rationale: pure `ai_router` machinery + a controlled experiment + a PyPI
> release; **no UI surface** (surfacing the routed decision or the gate in the
> Session Set Explorer is deferred), so no UAT/E2E gate. **Full tier** because
> each session is cross-provider verified. It ships a **PyPI `ai_router`
> release** carrying the `run_test` sandbox + the contract-test gate + any
> routed-decision wiring; **no Marketplace bump** (no extension change).
>
> **`pathAwareCritique: required` (dogfood).** Continuing the Set 066/067 norm —
> a set building verification + execution machinery is gated by the very
> path-aware review it institutionalizes (the Set 067 dogfood proved its worth:
> the whole-set path-aware critique caught five real defects the per-session
> routed verification passed). The blast-radius predicate scores this set
> `required` (new write-capable tool + `router-config.yaml` wiring + it touches
> the shared adapter and the close-out path). The artifact is produced by the
> **manual** flow or, now that Set 067 validated it, by the **opt-in automated
> producer** (`python -m ai_router.pull_critique`) — the operator confirms the
> level at set start and may override.

---

## Project Overview

### Background

Set 065 framed verification surface strategy as two empirical questions and a
governance choice. Set 067 answered the **capability** question (Experiment A:
path-aware critique catches real cross-file defects routed single-shot misses)
and shipped the first-party `pull_route` adapter + the opt-in
`path-aware-critique.json` producer. It deliberately deferred everything that
needs a **write-capable execution cage** or that turns on **cadence** rather
than capability:

1. **`run_test` sandbox** — the only adapter tool that needs to *execute* (run a
   test command), which needs a disposable, write-caged worktree. Set 067 was
   read-only by construction.
2. **Experiment B (cadence)** — Experiment A held cadence constant by design, so
   it could only *rule out* a capability defense for routed verification, not
   its surviving **cadence** defense ("routed catches defects earlier, during
   construction"). B is the intervention study that tests it.
3. **Routed keep / demote / retire** — the governance decision, explicitly gated
   on Experiment B.
4. **Contract-test / CDC gate** — Experiment A's H4 found ~95% of seeded defects
   are deterministically falsifiable, so a contract-test floor can carry the
   bulk and reserve the (expensive) agent for the non-probeable residual.

Two corrections from the Set 067 0.21.1 follow-up are also in scope:

5. **Experiment A symmetric re-grade.** The 0.21.1 erratum recorded that
   Experiment A's manual audit was *one-directional* (only routed×cross-file
   catches were held to the strict quoted-mechanism standard) and that the
   headline H1 *magnitude* / "H2 resolved" used the audited-union metric, not the
   pre-registered automated primary (under which the Gemini contrast sits inside
   the noise band). H1's *direction* holds on the D5/D9 Critical existence
   proofs; the **magnitude** is open and must be re-graded symmetrically before
   any Set-068 reasoning relies on it.
6. **Full `grep` ReDoS isolation.** Set 067 0.21.1 shipped a portable
   nesting-aware heuristic as a stopgap; the proper defense (an `re2` engine or
   a subprocess/timeout cage) belongs with this set's execution-cage work.

### The architecture (settled by Set 065 + Set 067)

- The **`run_test` tool** is the Set 067 adapter's first **write-capable but
  caged** tool. It runs inside a **disposable git worktree** (the dabbler
  sibling-worktrees layout, `docs/planning/repo-worktree-layout.md`): the cage is
  created from a pinned ref, the command runs write-confined to that worktree
  with wall-clock / output caps, and the worktree is torn down (even on crash).
  No write ever touches the real tree. This is the same deterministic-servant
  discipline as Set 067's read-only tools, extended to execution: the tool
  returns the **raw** command result (exit code + captured output), never a
  model-summarized view.
- **Experiment B** is a staged-snapshot **intervention** study: across ordered
  snapshots of a frozen tree (construction-time → end-of-set), measure whether
  routed per-session verification catches a seeded defect *earlier* than a single
  end-of-set path-aware pass. The `run_test` cage is what lets an arm actually
  build + test a change per snapshot.
- The **contract-test / CDC gate** is a deterministic floor: the project's
  contract / falsifier tests run as the cheap, reproducible check; the
  path-aware agent is reserved for the non-probeable residual (the Experiment A
  D16 class) and for *authoring* the falsifiers.

### Scope (in)

- A production **`run_test`** disposable-worktree execution cage in `ai_router`,
  wired into the Set 067 adapter tool registry, with worktree lifecycle,
  write-confinement, wall-clock / output / cost caps, crash-safe teardown, and
  raw-result instrumentation. Full **`grep` ReDoS isolation** relocated onto the
  same subprocess/cage machinery.
- The **symmetric Experiment A re-grade** (`experiment-a-regrade.md`) settling
  the H1-magnitude / H2 question.
- **Experiment B** (cadence): a pre-registered staged-snapshot intervention
  study, the harness, the K-repeat runs, and a written
  `experiment-b-results.md` with an explicit cadence verdict.
- The routed **keep / demote / retire** decision — routed through cross-provider
  consensus + operator confirmation, with the chosen outcome **implemented**
  (config / docs) and the rationale recorded.
- The **contract-test / CDC gate**: the deterministic-floor mechanism + wiring +
  tests.
- A synthesis doc, focused **tests**, an `ai_router` **PyPI release**, and
  `change-log.md`.

### Non-goals (out)

- **Explorer / extension UI** for the routed decision, the `run_test` tool, or
  the contract-test gate, and any **Marketplace** bump → future / optional.
- A general-purpose CI runner — `run_test` is a bounded verification cage, not a
  build system.
- Re-running Experiment A from scratch — only the **re-grade** of its existing
  committed raw outputs is in scope (the data is already on disk).
- Removing the read-only Set 067 toolset or the manual path-aware flow — this set
  is **additive**; whatever the routed decision is, the path-aware producer and
  the manual flow remain.

### Standards

- **Deterministic servant, extended to execution.** `run_test` returns the raw
  exit code + captured output, never a model-summarized view; the worktree is
  write-confined and the real tree is never mutated. A tool that escapes the
  cage is a hard failure, not a degradation (mirror Set 067's `_safe` discipline
  and the `DeterministicServantViolation` guard).
- **Capped + instrumented + crash-safe.** Every `run_test` enforces wall-clock /
  output / cost caps, emits a trace, and tears the worktree down on every exit
  path including exceptions.
- **Pre-registered, honestly sized experiments.** Experiment B's success
  criteria are fixed before any data; effect-size clarity over p-values; state
  explicitly when an effect is too small to resolve at the chosen n/K
  (`forward-ab-design.md` § Sizing & honesty). The re-grade applies the *same*
  standard to every arm — that is the whole point.
- **The routed decision is routed, not self-opined.** Keep/demote/retire goes
  through cross-provider consensus + operator confirmation (project-guidance
  Decision-time consensus), never the orchestrator's unilateral call.
- **ASCII-only** CLI/terminal output (project-guidance Code Style).
- **Routed verification stays UNCHANGED until Session 4** — only the
  keep/demote/retire session may alter routed's status, and only on the
  Experiment B evidence.

---

## Sessions

### Session 1 of 6: `run_test` disposable-worktree sandbox + tool (+ ReDoS isolation)

**Steps:**
1. Register; read `project-guidance.md`, `lessons-learned.md`,
   `session-set-authoring-guide.md`, `docs/planning/repo-worktree-layout.md`, the
   Set 067 `pull_verifier.py` + tool-contract, and L-067-1.
2. **Finalize the `run_test` contract** (the flagged prerequisite): the
   disposable-worktree lifecycle (create from a pinned ref → run write-confined →
   teardown), the bounded command surface (the project test command, not an
   arbitrary shell), the raw result shape (exit code + captured stdout/stderr,
   capped/elided like Set 067 results), and the caps (wall-clock / output / cost).
3. Implement the cage in `ai_router` (e.g. `ai_router/run_test_sandbox.py`):
   worktree create/teardown (crash-safe via try/finally), write-confinement,
   timeout-kill, output cap, and a raw-result + trace instrument. Register
   `run_test` in the Set 067 adapter tool registry as a **caged write-capable**
   tool (the real tree is never mutated).
4. **Relocate the `grep` ReDoS defense** onto the new subprocess/cage machinery
   (an `re2` engine if available, else a subprocess + hard timeout), replacing
   the 0.21.1 heuristic; keep the heuristic as a cheap pre-filter only.
   (Optional polish: the budget-aware-force hard pre-call reservation noted in
   the 0.21.1 close.)
5. Unit tests (no metered calls): worktree is created and **always** torn down
   (including on exception); a command times out and is killed; output is capped;
   a write cannot escape the worktree; the result is the raw exit+output; a
   pathological regex is bounded by the cage, not hung.
6. Cross-provider verification; `disposition.json`; commit + push; `close_session`.

**Creates:** `ai_router/run_test_sandbox.py` (+ tests), the `run_test` contract note.
**Touches:** `ai_router/pull_verifier.py` (tool registry), `ai_router/router-config.yaml` (caps), `ai_router/__init__.py` (exports).
**Ends with:** `run_test` runs a bounded command in a disposable, write-confined
worktree with crash-safe teardown and a raw-result trace; ReDoS is bounded by
isolation, not a heuristic; session **VERIFIED**.
**Progress keys:** `run-test-contract`, `worktree-cage`, `redos-isolation`, `s1-verified`.

---

### Session 2 of 6: Experiment A symmetric re-grade + Experiment B pre-registration

**Steps:**
1. Register; read `experiment-a-results.md` (incl. its §8 erratum), `audit.json`,
   `grade.py`, `catalogue.json`, the committed `raw/` outputs, and Set 065
   `forward-ab-design.md`.
2. **Symmetric re-grade of Experiment A:** apply the *same* strict
   quoted-mechanism standard to the **path-aware** (B1/B2) cross-file catches that
   the original audit applied only to routed (A1/A2). Recompute B1−A1 / B2−A2 on
   the pre-registered automated primary and report whether the H1 *magnitude* and
   the H2 "resolved" reading survive symmetric grading, or whether only the
   *direction* (D5/D9 existence proofs) holds. Write `experiment-a-regrade.md`.
3. **Pre-register Experiment B** (the flagged prerequisite): the staged-snapshot
   intervention design — the ordered snapshots of a frozen tree, the
   intervention (an arm builds + tests a change per snapshot via `run_test`), the
   arms (routed per-session-cadence vs end-of-set path-aware), the cadence
   metric (does routed catch a seeded defect *earlier*?), K-repeats, the noise
   band, and the decision rule that will read as "cadence defense holds / does
   not hold." Pilot before any paid sweep (L-067-3 / Set 067 methodology).
4. Cross-provider verification of the re-grade inference + the pre-registration;
   `disposition.json`; commit + push; `close_session`.

**Creates:** `experiment-a-regrade.md`, `experiment-b-preregistration.md`, the Experiment B harness skeleton.
**Touches:** test/fixture dirs only (no production-code change this session).
**Ends with:** the H1-magnitude question is settled under symmetric grading, and
Experiment B is pre-registered with a fixed decision rule; session **VERIFIED**.
**Progress keys:** `exp-a-regraded`, `exp-b-preregistered`, `s2-verified`.

---

### Session 3 of 6: Experiment B — the cadence study

**Steps:**
1. Register; read `experiment-b-preregistration.md` and the S1 `run_test`
   contract.
2. Build the staged-snapshot harness on the `run_test` cage; seed the
   construction-time → end-of-set snapshots and the cadence defects.
3. Run the **arms** blind, K-repeats, persisting every raw output to disk first
   (L-064-3). Record per-arm: earliest-catch snapshot, severity-weighted catch
   rate, cost, and latency.
4. Analyze into **`experiment-b-results.md`**: the cadence verdict against the
   pre-registered criteria, with an explicit honesty note where an effect is too
   small to resolve at this n/K.
5. Cross-provider verification **of the analysis**; `disposition.json`; commit +
   push; `close_session`.

**Creates:** the Experiment B harness + raw outputs, `experiment-b-results.md`.
**Touches:** test/fixture dirs only.
**Ends with:** Experiment B run with K-repeats; a written, cross-provider-verified
**cadence** verdict against pre-registered criteria; session **VERIFIED**.
**Progress keys:** `exp-b-arms-run`, `exp-b-verdict`, `s3-verified`.

---

### Session 4 of 6: Routed keep / demote / retire decision

**Steps:**
1. Register; read `experiment-a-regrade.md` and `experiment-b-results.md`.
2. **Route the decision** through cross-provider consensus (project-guidance
   Decision-time consensus): given A (capability ruled out) + B (cadence
   verdict), should routed per-session verification be **kept unchanged**,
   **demoted** (reduced scope/cadence), or **retired** (replaced by the
   path-aware pass + the contract-test gate)? Record the consensus journal; the
   **operator confirms** the final call.
3. **Implement the chosen outcome:** the `router-config.yaml` / workflow-doc /
   close-out change the decision implies (which may be "no code change — keep",
   recorded as such with rationale). Routed verification status is changed **only
   here** and **only** on the B evidence.
4. Cross-provider verification of the implementation; `disposition.json`; commit
   + push; `close_session`.

**Creates:** `routed-fate-decision.md` (the consensus + operator rationale).
**Touches:** `ai_router/router-config.yaml` and/or `docs/ai-led-session-workflow.md` (only as the decision requires).
**Ends with:** the routed keep/demote/retire decision is made on the experimental
evidence, implemented (or recorded as deliberately no-change), and verified;
session **VERIFIED**.
**Progress keys:** `routed-decision-consensus`, `routed-decision-implemented`, `s4-verified`.

---

### Session 5 of 6: Contract-test / CDC gate

**Steps:**
1. Register; read the Experiment A H4 finding (~95% probeable), the re-grade, and
   the Experiment B verdict.
2. Implement the **contract-test / CDC gate**: a deterministic floor that runs
   the project's contract / falsifier tests (the cheap, reproducible check) and
   reserves the path-aware agent for the non-probeable residual. Define how a set
   declares its contract tests and how the gate reports coverage of the seeded /
   known defect classes.
3. Wire the gate (config + the close-out or CI surface, mirroring the Set 066
   path-aware gate's posture model: hard-block TTY / soft-warn headless where
   applicable). Tests for the gate's pass/fail and coverage reporting.
4. Cross-provider verification; `disposition.json`; commit + push; `close_session`.

**Creates:** the contract-test/CDC gate module + tests, its schema/doc.
**Touches:** `ai_router/close_session.py` and/or `router-config.yaml`, the gate docs.
**Ends with:** a deterministic contract-test floor exists and is wired, with the
agent reserved for the non-probeable residual; session **VERIFIED**.
**Progress keys:** `contract-gate-built`, `contract-gate-wired`, `s5-verified`.

---

### Session 6 of 6: Synthesis + docs + release + dogfood + close

**Steps:**
1. Register; read S1–S5 deliverables.
2. Author the **verification-surface synthesis** (tying Experiment A + the
   re-grade + Experiment B + the routed decision + the contract gate into one
   strategy doc, superseding the Set 065 proposal's open questions).
3. Update docs: `ai_router/docs/` (the `run_test` cage + the contract gate),
   `docs/ai-led-session-workflow.md` (any routed-status change from S4), and the
   guidance lifecycle if a lesson is promoted.
4. Finalize tests; bump `ai_router` version; ship the **PyPI release** following
   the publish runbook (green-`Test`-on-the-tagged-SHA prerequisite; operator
   pushes tag `v*`). Record the publish run id post-release.
5. Author `change-log.md`; route the **next-session-set recommendation**;
   cross-provider verification; **dogfood** (`pathAwareCritique: required` —
   produce this set's own `path-aware-critique.json` via the manual flow or the
   Set 067 automated producer); `close_session`; set closes.

**Creates:** the synthesis doc, `change-log.md`, this set's dogfood artifact.
**Touches:** `ai_router` version + CHANGELOG, the relevant docs.
**Ends with:** the `run_test` cage + contract gate are shipped, the routed
decision is recorded and implemented, Experiment B's verdict is written, PyPI
published, the set dogfooded its own gate, and the set is closed.
**Progress keys:** `synthesis-written`, `docs-updated`, `released`, `change-log-written`, `dogfooded`, `s6-verified`.

---

## End-of-set deliverables

- The `run_test` disposable-worktree execution cage (`ai_router/run_test_sandbox.py`)
  wired into the Set 067 adapter, with full `grep` ReDoS isolation (S1).
- `experiment-a-regrade.md` — the symmetric re-grade settling H1 magnitude / H2 (S2).
- `experiment-b-results.md` — the cross-provider-verified **cadence** verdict
  against pre-registered criteria, with the harness + raw outputs (S2–S3).
- `routed-fate-decision.md` — the routed keep/demote/retire decision (consensus +
  operator), implemented (S4).
- The contract-test / CDC gate + wiring + tests (S5).
- The verification-surface synthesis doc, an `ai_router` **PyPI release**, this
  set's dogfood `path-aware-critique.json`, and `change-log.md` (S6).

A shipped write-caged execution sandbox, an answered cadence question, a
decided-and-implemented fate for routed per-session verification, and a
deterministic contract-test gate — completing the verification-surface program
Set 065 framed and Sets 066–067 began.
