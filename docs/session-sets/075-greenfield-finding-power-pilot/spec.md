# Greenfield Finding-Power Pilot — Verification Matrix on Fresh Consumer Work (Set 075)

> **Purpose:** Set 072 built the provider×surface verification-matrix instrument and
> Sets 072–073 ran it on **already-built, already-verified** consumer diffs — which
> measured **cost / noise / false-positive rate** and the provider×surface
> *interaction*, but **not raw finding power** (the defects were already removed
> before the matrix ran). This set stands up a **greenfield finding-power pilot**:
> it authors the canonical **protocol + standard instruction addendum** for running
> the matrix **inside a consumer repo at Step 6, pre-remediation, on fresh
> not-yet-verified work** (defects still present), defines the **adjudication rubric
> + diff-class stratification + telemetry/aggregation contract**, and **enables the
> two source-bearing pilot repos**. The actual matrix runs happen in those repos'
> own sessions; a **future canonical set synthesizes** the accumulated telemetry.
> This set ships **no `ai_router` code and no release** — it is protocol + rollout.
>
> **Design inputs (required reading):** Set 072 `change-log.md` +
> `docs/verification-surface-strategy.md` §8 (the matrix instrument, the
> consumer-handoff model); Set 073 §9 + `cross-target-comparison.md` (the N=2
> Gemini-pull replication and the *finding-yield gap not refuted* — the exact gap
> this pilot exists to measure); this set's `design-consensus-synthesis.md` (the
> cross-provider design consult: GPT-5.4 + Gemini-Pro, the six decisions and the two
> complementary validity threats). Hard constraint: **L-069-2** — never weaken
> framing; both arms stay strong adversarial; the matrix varies *provider*, not
> framing.
> **Created:** 2026-06-20.
> **Session Set:** `docs/session-sets/075-greenfield-finding-power-pilot/`
> **Prerequisite:** Set 072 complete (shipped `ai_router` 0.26.0 — the matrix +
> `verification_only_app`). Set 073 complete (the N=1→N=2 cross-target datapoints
> this pilot builds on).
> **Workflow:** Orchestrator → AI Router → Cross-provider verification (gated: run
> `python -m ai_router.routed_gate` per session).

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: false
requiresE2E: false
uatScope: none
pathAwareCritique: advisory   # protocol-authoring + cross-repo enablement; it does NOT change the shared dual_surface/verification surface, so advisory (warn-on-missing), not required. Escalate to required only if a session ends up changing ai_router code.
contractGate: none
prerequisites:
  - slug: 072-verification-tuning
    condition: complete
  - slug: 073-cross-target-verification-telemetry
    condition: complete
```

> Rationale: this set **authors a protocol and rolls it out**; it builds no new core
> machinery and ships no release, so **no UI/UAT/E2E gate**. **Full tier** — every
> session is cross-provider verified (gated). `pathAwareCritique: advisory` — the
> work is documentation + consumer-repo enablement, not a change to the shared
> `dual_surface_verify` / verification surface; the close-out warns on a missing
> dogfood artifact but does not block. `contractGate: none` — no deterministic
> contract floor to dogfood (no code).

---

## Project Overview

### Background

The verification-surface program now has an instrument
(`ai_router/verification_only_app.py`, 0.26.0) that runs a provider×surface matrix
(`push` = snippet-fed routed review; `pull` = repo-reading path-aware agentic review)
over a diff and emits per-cell telemetry + a consolidated, fixer-facing remediation
report. Two real runs exist:

- **Set 072 (harvester, set-018)** and **Set 073 (platform, CrudSlice commit)** both
  pointed the matrix at an **already-built, already-verified, already-remediated**
  diff. They established: Gemini-on-pull under strong framing is **non-silent
  (replicated, N=2)**, but **lower-yield than GPT-pull** on the one target with real
  pull findings; push is blind to a large elided diff; strong framing did not
  manufacture nit-churn. **What they could not measure: raw finding power** (catch
  rate of real defects) — because an already-remediated target has had its defects
  removed, so the matrix re-reviews thinned work. The strategy doc records this as
  the open greenfield track (§8.2, §9.5).

### The question this set sets up (not answers)

**Which provider×surface cell catches the most *real* defects on fresh, not-yet-
verified work?** That requires running the matrix **while defects are still present**
— i.e. on a session's freshly-built diff at Step 6, **before** remediation. This set
does **not** itself produce the answer (no fresh consumer work has run yet); it
**stands up the pilot** so the answer accumulates as the two source-bearing repos run
their not-started sets, and a **future canonical set synthesizes** it.

### The audit that scoped the pilot (recorded for the operator)

Three candidate consumer repos were audited (full results in S1's reading). Net:

| Repo / not-started set | Work type | Finding-power fit | Router pin |
|---|---|---|---|
| **dabbler-platform** / `access-migration-generator-consumption` (2 sess) | C# generator tooling — **source-dominated** | **LEAD signal** | `>=0.1.0` → bump |
| **dabbler-access-harvester** / `019-...-dotnet-tool-packaging` (2 sess) | `.csproj` / CI / docs — source but **small/packaging diffs** | **supporting (confounded)** | `>=0.15.0` → bump |
| **dabbler-access-migration-orchestrator** / `009` S2 + `010` | docs/planning — **zero source diffs** | **deferred** (pull-only sidecar at most) | `>=0.10.0` → bump |

The doc-only repo starves the push arm; including it in the finding-power aggregate
would poison the push-vs-pull comparison (consult D4). It is **deferred** from the
finding-power pool.

### What this set delivers

1. A canonical **greenfield finding-power protocol** doc — the Step-6 pre-remediation
   timing rule, the exact command template, the **record-then-remediate freeze**
   rule, the **adjudication rubric**, **diff-class stratification**, the
   **telemetry/aggregation contract**, the honest **relative-yield-not-recall**
   framing, and the **seeding-is-fast-follow** note.
2. The **standard instruction addendum** (drafted below) the consumer repos'
   agent-instruction files reference — the concrete "how to produce the verification
   matrix" block the operator asked for.
3. **Enablement** of the two source-bearing pilot repos (router pin → `>=0.26.0`;
   addendum reference wired into their `CLAUDE.md`/`AGENTS.md`/`GEMINI.md`), and a
   recorded **deferral** of migration-orchestrator from the finding-power pool.
4. A **synthesis pointer** in `docs/verification-surface-strategy.md` (a short §10
   recording the pilot is live and what it will measure), `change-log.md`, the routed
   next-set recommendation (the future synthesis set), the advisory dogfood, and
   close. **No release.**

### Scope (in)

- A canonical protocol doc + the standard instruction addendum + the adjudication
  rubric + the telemetry/aggregation contract (committed under this set dir).
- Router-pin bump + addendum wiring for **dabbler-platform** and
  **dabbler-access-harvester** (each committed in its own repo).
- A short §10 in `verification-surface-strategy.md` (pilot is live; what it measures;
  the two validity threats and their mitigations).
- The deferred-repo record (migration-orchestrator: pull-only sidecar, excluded from
  the finding-power aggregate).

### Non-goals (out)

- **Running the matrix on real consumer work in this set.** The runs happen in the
  consumer repos' own sessions, on their schedule. This set makes them *runnable +
  comparable*; it does not execute them.
- **The comparative readout / finding-power verdict.** That is a future canonical
  synthesis set, gated on accumulated telemetry (same pattern as RETIRE).
- **Any `ai_router` code change, version bump, or PyPI/Marketplace release.** A
  finding-power *scoring helper* (adjudicated report → per-cell yield/precision table)
  is a candidate for the future synthesis set, when there is data to score — not now.
- **Defect seeding.** A seeded recall benchmark is a fast-follow; the pilot measures
  relative yield first (consult D2).
- **Changing the live default pull provider or any keep/demote/RETIRE posture.**
  Still held (strategy §5.1 / §9.1).

### Standards (the settled design — from the cross-provider consult)

- **D1 — timing: Step 6, pre-remediation, on the fresh diff.** Run the matrix as an
  extra arm during Step 6's verification phase, **before any issue-driven edits**,
  on `--base <session-start-ref> --head <working-tree>`. Persist the artifacts
  *immediately* as the measurement snapshot, *then* remediate.
- **D2 — ground truth: relative yield, not recall.** Score each cell by TP / FP /
  precision / share-of-adjudicated-union / unique-TPs / cost-per-TP against the
  **adjudicated union** of all findings (all cells + the human/normal verification).
  **Never claim "recall"** (unknown-unknowns are invisible). Seeding is a fast-follow.
- **D3 — record-then-remediate freeze.** The first pre-remediation run's
  `verification-matrix-report.json` + `remediation-report.{json,md}` are the
  **immutable** measurement record; the repo remediates normally from the same
  report (real scrutiny value). A post-fix re-run, if any, is labeled separately and
  **never overwrites** the measurement.
- **D4 — doc-only repo deferred.** migration-orchestrator is excluded from the
  finding-power aggregate; an optional pull-only scrutiny run is tagged
  `targetClass=docs-only`, `excludedFromFindingPower=true`.
- **D5 — aggregation home: committed under canonical.** The consumer session copies
  its frozen `matrix-run/` artifacts to
  `docs/session-sets/075-greenfield-finding-power-pilot/telemetry/<repo>/<session>/`
  (co-located sibling worktrees → a plain copy; no CI/PAT). Each run carries the
  required metadata (below). **Committed**, not gitignored — the pilot's purpose is a
  later synthesis.
- **Threat 1 (GPT-5.4) — selection bias from diff mix.** **Stratify every run by
  diff class** (`source-dominated` / `packaging-small` / `docs-only-excluded`),
  report per-stratum, and treat **platform as the LEAD signal**, harvester 019 as
  **supporting-but-confounded** (small packaging diffs are snippet-fittable → favor
  push for the wrong reason).
- **Threat 2 (Gemini) — adjudication drift.** Adjudicate from the **deduped
  consolidated report** (not provider-branded raw output) against the **fixed
  rubric**, so TP/FP calls stay consistent across sessions and no high-status
  provider biases the call.
- **Matrix roster: keep the established 2-cell matrix for corpus continuity** —
  `push:anthropic × {pull:openai, pull:google}` (includes the load-bearing
  Gemini-pull-under-strong-framing cell). Tunable, but changing it forks the corpus,
  so change deliberately and record why.
- **Code-focused diff ranges (072 lesson).** Choose source-dominated ranges; record
  the range + its diff class in every run.

---

## The standard instruction addendum (DRAFT — finalized in S1)

This is the block each pilot repo's agent-instruction files reference. It is the
concrete answer to "how do the AI agents produce the verification matrix."

````markdown
### Greenfield verification-matrix run (pilot — per substantive build session)

**Applies to:** source-code-bearing build sessions only. Skip for doc/planning/
mechanical sessions (no source diff = no finding-power signal).

**Prerequisite:** `dabbler-ai-router >= 0.26.0` in the repo venv.

**At Step 6 (verification), BEFORE applying any fixes:**

1. Identify the session's fresh diff range: `--base <commit at session start>`
   (`--head` defaults to the working tree, capturing uncommitted work).
2. Run the matrix over the repo itself (`--target .` stamps the repo name):

   ```bash
   python -m ai_router.verification_only_app run \
     --target . \
     --base <session-start-ref> \
     --cell push:anthropic --cell pull:openai --cell pull:google \
     --orchestrator-provider <this-session's-provider> \
     --orchestrator-model <this-session's-model> \
     --out docs/session-sets/<slug>/matrix-run/verification-matrix-report.json
   ```

   (Also writes `matrix-run/remediation-report.{json,md}`.)
3. **Freeze the measurement:** these three files, untouched, ARE the measurement
   record. Do not edit them; do not re-run over the same range to "improve" them.
4. **Adjudicate** every finding in `remediation-report.md` against the rubric
   (TP / FP / duplicate / unclear), working from the **deduped consolidated** report,
   and record the per-finding verdict + which cell(s) caught each TP in
   `matrix-run/adjudication.md`. Note its **diff class**
   (`source-dominated` / `packaging-small`).
5. **Remediate** from the report as normal scrutiny, then run the rest of Step 6.
   Record any real defect the normal verification or end-of-set dogfood caught that
   the **matrix missed** (and vice-versa).
6. **Ship telemetry back:** copy `matrix-run/` to
   `../dabbler-ai-orchestration/docs/session-sets/075-greenfield-finding-power-pilot/telemetry/<repo>/<session>/`
   with a `metadata.json` (target repo, set/session id, base/head refs, matrix
   package version, orchestrator/push/pull provider+model, diff stats, diff class,
   `phase=pre-remediation`, `includedInFindingPower=true|false`).

**Honest framing:** this measures **relative finding yield + precision** against the
adjudicated union — **not recall**. Both arms stay strong adversarial (L-069-2).
````

---

## Sessions

### Session 1 of 2: Protocol + addendum + rubric + aggregation contract

**Steps:**
1. Register; read Set 072 `change-log.md` + strategy §8, Set 073 §9 +
   `cross-target-comparison.md`, and this set's `design-consensus-synthesis.md` (+ the
   two raw consults). Confirm the audit table (the three repos' work types + router
   pins) against the live repos.
2. Author `docs/greenfield-matrix-protocol.md` (canonical): D1 timing, D2 ground
   truth + scoring formulae, D3 freeze rule, D4 doc-only exclusion, D5 telemetry
   layout + required metadata, the two threats + mitigations (diff-class stratification
   with platform-as-lead; the fixed adjudication rubric), the matrix roster + the
   code-focused-range discipline, and the relative-yield-not-recall framing.
3. Finalize the **standard instruction addendum** (the block above) as a reusable
   asset (`ai_router/prompt-templates/` or a doc the consumer instruction files
   reference) and the **adjudication rubric** (TP/FP/dup/unclear definitions + the
   per-cell scoring table shape).
4. Create the telemetry directory skeleton under this set
   (`telemetry/<repo>/` placeholders + a `telemetry/README.md` documenting the
   metadata contract).
5. Cross-provider verification (gated); `disposition.json`; commit + push;
   `close_session`.

**Creates:** `docs/greenfield-matrix-protocol.md`, the instruction-addendum asset,
the adjudication-rubric doc, `telemetry/README.md`.
**Touches:** none in `ai_router` (a doc-authoring session).
**Ends with:** a complete, cross-provider-verified protocol + addendum + rubric +
telemetry contract; session **VERIFIED**.
**Progress keys:** `protocol-authored`, `addendum-finalized`, `rubric-defined`,
`telemetry-contract`, `s1-verified`.

### Session 2 of 2: Consumer enablement + deferred-repo record + close

**Steps:**
1. Register; read S1's protocol + addendum.
2. **Enable the two source-bearing pilot repos** (each committed + pushed in its own
   repo): bump `dabbler-ai-router` to `>=0.26.0` in `requirements.txt`, and wire the
   addendum reference into `CLAUDE.md` / `AGENTS.md` / `GEMINI.md` (pointing at the
   canonical `greenfield-matrix-protocol.md`):
   - `../dabbler-platform` (lead) — set `access-migration-generator-consumption`.
   - `../dabbler-access-harvester` (supporting) — set `019-...-dotnet-tool-packaging`.
   Confirm the matrix CLI is importable + accepts the addendum's args in each repo's
   venv (a non-metered check: `--help` / argument parse, or a tiny throwaway range);
   the first *real* run happens in the consumer session, not here.
3. **Record the deferral** of `dabbler-access-migration-orchestrator` from the
   finding-power pool (doc-only; optional pull-only sidecar tagged
   `excludedFromFindingPower=true`) — in the protocol doc and (optionally) a one-line
   note in that repo's instruction files.
4. Add **§10 to `docs/verification-surface-strategy.md`** — the greenfield pilot is
   live; what it measures (relative finding yield, not recall); the cohort (platform
   lead, harvester supporting, migration-orchestrator deferred); the two validity
   threats + mitigations; the synthesis is a future set. Note all held decisions
   stay held.
5. Author a lesson if warranted; `change-log.md`; route the next-session-set
   recommendation via `route(task_type="analysis")` (candidate: the **greenfield
   finding-power synthesis** set, gated on accumulated telemetry, or a seeded-recall
   calibration lane); cross-provider verification.
6. **Dogfood** (`pathAwareCritique: advisory`) per L-070-1; `disposition.json`;
   commit + push; `close_session`; set closes.

**Creates:** the §10 synthesis pointer, `change-log.md`, the dogfood artifact, a
lesson (if warranted).
**Touches:** `docs/verification-surface-strategy.md`,
`docs/planning/lessons-learned.md` (if a lesson); **cross-repo:**
`../dabbler-platform/requirements.txt` + instruction files,
`../dabbler-access-harvester/requirements.txt` + instruction files (each its own
commit), and optionally `../dabbler-access-migration-orchestrator` instruction files.
**Ends with:** the two pilot repos can run the matrix at Step 6 and ship telemetry
back; the protocol + addendum are live; the deferred repo is recorded; set closed.
**Progress keys:** `platform-enabled`, `harvester-enabled`, `deferral-recorded`,
`strategy-section-10`, `change-log-written`, `s2-verified`.

---

## End-of-set deliverables

- A canonical **greenfield finding-power protocol** (`docs/greenfield-matrix-protocol.md`):
  Step-6 pre-remediation timing, record-then-remediate freeze, adjudication rubric +
  scoring, diff-class stratification (platform lead), telemetry/aggregation contract,
  relative-yield-not-recall framing, seeding-as-fast-follow (S1).
- The **standard instruction addendum** consumer agents follow + the **adjudication
  rubric** + the **telemetry metadata contract** (S1).
- **Enablement** of `dabbler-platform` and `dabbler-access-harvester` (router
  `>=0.26.0` + addendum wiring, each committed in-repo) and the recorded **deferral**
  of `dabbler-access-migration-orchestrator` (S2).
- **§10** in `verification-surface-strategy.md` (pilot live; what it measures; the
  threats + mitigations), `change-log.md`, the advisory dogfood, a lesson if
  warranted, and the routed next-set recommendation (the future synthesis set). **No
  release.**

A standing, comparable pilot that turns the Set 072–073 already-built telemetry into a
**fresh-work finding-power** measurement — run inside the consumer repos at Step 6
pre-remediation, frozen as an immutable measurement, adjudicated by a fixed rubric,
stratified by diff class (platform the lead signal), and pooled in canonical for a
future synthesis — while holding every not-yet-earned decision (the live default pull
provider, RETIRE) exactly where Sets 072–073 left it.
