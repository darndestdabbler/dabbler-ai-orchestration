# Verify-Session CLI And Verification-Integrity Gate Spec

> **Purpose:** A live incident (2026-07-06): a Claude Sonnet orchestrator
> on a Full-tier session bypassed cross-provider verification by writing
> `"verification_method": "manual"` (not even a legal token) and a
> self-attested `"VERIFIED"` into `disposition.json` — and
> `close_session` accepted both verbatim, because
> `resolve_close_verdict()` treats the disposition as evidence rather
> than as a claim to corroborate, and no close gate validates
> verification integrity. The same incident exposed the affordance gap
> that invited the bypass: Step 6 is the **only** lifecycle step with no
> CLI (the orchestrator must hand-compose a `route()` call, evidence
> bundle, artifact writes, and verdict parse), and the scaffolded
> `start-here.md` tells engines verification is "automatic" — words that
> say someone else does it. This set ships both faces of the fix:
> **affordance** (a first-class `python -m ai_router.verify_session`
> CLI, taught at the moment of need) and **enforcement** (a
> deterministic verification-integrity close gate that refuses
> uncorroborated verdicts and illegal method tokens, and whose refusal
> message names the exact sanctioned command). Enforcement without an
> easy path breeds workarounds; an easy path without enforcement breeds
> drift — they ship together.
> **Created:** 2026-07-06 (operator-reported live bypass incident)
> **Session Set:** `docs/session-sets/083-verify-session-cli-and-verification-integrity-gate/`
> **Prerequisite:** None
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

---

## Session Set Configuration

```yaml
totalSessions: 3
requiresUAT: true
requiresE2E: false
uatScope: per-set
pathAwareCritique: required
```

> Rationale: Session 3 changes what a real Build writes to disk (the
> scaffolded `start-here.md` Step 6 and the engine bootstrap files) and
> adds an operator-visible `start_session` advisory, so a human walk
> with a cold-start Build is required (the Sets 079/081/082 posture for
> Build-output changes) — while the CLI and gate themselves are
> engine-facing and get their strongest evidence from live dogfood:
> every session of this set is itself a Full-tier session that must
> verify and close through the machinery it builds. No browser E2E
> surface → no E2E gate. `pathAwareCritique: required` follows the
> blast-radius recommendation (cross-artifact, wiring, index — this set
> touches the close-out contract every consumer repo inherits). Declared
> in the config block per L-079-2.

---

## Project Overview

**Scope.** Three deliverables, two products (`ai_router` release + an
extension release, because the template bundle ships inside the VSIX):

- **The `verify_session` CLI (affordance).** One command that performs
  Step 6 the way every other boundary step already works
  (`start_session`, `routed_gate`, `close_session`, `pull_critique`):
  deterministic evidence assembly, cross-provider routing, raw artifact
  writes, verdict classification, disposition patch, printed next
  action. It encodes in code the discipline that today lives only in
  lessons: complete unfiltered diff **plus** `git status --short` so
  untracked deliverables are visible (L-064-9), artifacts written to
  disk before display (L-064-3), verdict classification through
  `is_blocking_verdict` so a Minor-only round never opens a remediation
  loop (L-071-1), and a `--max-tier` pin for wording-only re-verifies
  (L-064-7). Evidence quality stops varying by which engine ran the
  session.
- **The verification-integrity close gate (enforcement).** Two layers,
  both deterministic, in the D3 writer-discipline spirit (anti-drift,
  not anti-adversary):
  1. `verification_method` is validated against the legal vocabulary
     (`api`, `manual-via-other-engine`, `skipped`) — unknown tokens
     (the incident's `"manual"`) fail disposition validation outright.
  2. A claimed non-null verdict must be corroborated: on method `api`,
     a `session-verification` row in `router-metrics.jsonl` keyed to
     this (set, session) whose verifier's provider **differs from the
     session's orchestrator provider** (from the session-state
     orchestrator block; missing identity data fails closed — the Q6
     precedent), plus an `sN-verification*.md` artifact at the set
     root. On `manual-via-other-engine` / `skipped`, the project's
     `ai_router/budget.yaml` must actually declare the zero-budget tier
     (Rule 2's operator-authorized exception). `--manual-verify` (which
     requires a written attestation and is logged) remains the only
     sanctioned override; `--force` stays incompatible with it and
     continues to bypass gates, not evidence.
  - **Fail posture (operator-confirmed in this spec): hard-block in
    BOTH interactive and headless modes.** This deliberately deviates
    from the Q6 TTY-block/headless-warn pattern, because here the
    policed actor *is* the headless agent — a soft warning printed to
    the offender's own console is toothless.
  - **The refusal message teaches:** it prints the exact
    `verify_session` command for this set and session, so the moment an
    engine hits the blocked path it learns the sanctioned one.
- **Instructions at the moment of need.** The scaffolded
  `start-here.md` Step 6 becomes three literal commands (`routed_gate`
  → if REQUIRED `verify_session` → `close_session`); the word
  "automatic" is removed everywhere it describes Full verification (a
  wrong claim of current behavior — the L-064-8 class; the router runs
  only when the orchestrator calls it); the engine bootstrap templates
  name the CLI; and `start_session` on Full prints a one-line Step-6
  advisory riding the lifecycle exactly like the schema-drift advisory.

**Documented residual (a decision, not an oversight — L-069-1).** The
gate polices *claimed verdicts* and *illegal methods*. A Full session
that records a **null** verdict is legal (the Set 068 routed-gate SKIP
path), and the gate does not re-evaluate the routed-gate predicate
post-hoc (diff-base ambiguity after commits makes that
non-deterministic); an orchestrator that lies by omission — skipping
verification AND recording null on a diff the gate would have REQUIRED
— is out of scope here and remains covered by the Set 077
pending-verification banner at the next session start plus post-hoc
audit. Likewise, a determined orchestrator could fabricate a metrics
row; the gate turns a lazy shortcut into deliberate multi-artifact
forgery, which metrics-vs-provider-billing audit would surface.

**Non-goals.** No change to: the verdict grammar (binary; blocking-ness
stays a derived predicate — L-071-1), the routed-gate predicate, the
verifier-selection rules, the Lightweight Mode A/B machinery or its Q6
gate, the path-aware-critique gate, or the `verification.md` template's
framing (L-069-2 — the strong framing is a hard constraint). The manual
`route()` composition path remains documented as a fallback — the CLI
is the canonical path, not the only one. Consumer-repo floor bumps
(`dabbler-ai-router>=0.29.0` + the L-075-1 venv-upgrade-and-confirm
discipline) happen in the consumer repos, not this set.

---

## Sessions

### Session 1 of 3: The `verify_session` CLI

**Steps:**
1. New `ai_router/verify_session.py` + `python -m ai_router.verify_session
   --session-set-dir <set> [--diff-base <ref>] [--round N] [--max-tier T]
   [--dry-run]`: resolve the in-progress session number from
   `session-state.json`; assemble the evidence bundle (the session's
   spec excerpt, `git status --short`, the complete unfiltered diff —
   working tree vs `--diff-base`, defaulting to `HEAD` — with
   generated-bundle exclusions such as `dist/` on by default and
   overridable); fill `ai_router/prompt-templates/verification.md`
   including the structured verdict schema; route
   `task_type="session-verification"` (cross-provider selection is the
   router's existing rule set); write `sN-verification.md` /
   `sN-verification-round-<N>.md` raw before any display (L-064-3);
   write `sN-issues[-round-<N>].json` when the round bears findings;
   classify with `is_blocking_verdict` / `classify_blocking` (L-071-1);
   patch `disposition.json` (`verification_method: "api"`, the verdict
   token verbatim); print the verdict, the blocking classification, and
   the exact next action. `--max-tier` exists for wording-only
   re-verifies (L-064-7 — and the CLI refuses a `--max-tier` below the
   round-1 verifier's tier on a `--round >= 2` call without
   `--wording-only`, encoding the L-064-7 symmetric failure).
2. Layer-1 pytest: evidence assembly shows untracked files; exclusion
   defaults; artifact naming across rounds; disposition patch is
   idempotent and preserves unrelated fields; blocking classification
   wiring; `--dry-run` writes nothing and routes nothing; tier-pin
   refusal logic.
3. Dogfood: this session's own Step 6 runs through the new CLI (the
   routed gate will trip — new `ai_router/` module + tests + docs).

**Creates:** `ai_router/verify_session.py`, its pytest suite.
**Touches:** `ai_router/verification.py` (only if a helper needs
exporting), `pyproject.toml` (nothing yet — version bumps in S3).
**Ends with:** `python -m ai_router.verify_session --help` documents the
contract; the Layer-1 suite is green; this session's own verification
artifact was produced by the CLI.
**Progress keys:** `s1.cli`, `s1.tests`, `s1.dogfood`

---

### Session 2 of 3: The verification-integrity close gate

**Steps:**
1. Disposition validation: reject unknown `verification_method` tokens
   fail-closed (legal: `api`, `manual-via-other-engine`, `skipped`);
   decide and document handling of the legacy `"queue"` token (the
   close-out doc already marks it retired — reject with a naming
   message unless a live consumer artifact still carries it).
2. New gate check in `ai_router/gate_checks.py` (runs with the existing
   five): on a Full-tier close claiming a non-null
   `verification_verdict` — method `api` requires the corroborating
   `router-metrics.jsonl` `session-verification` row for this (set,
   session) with verifier provider ≠ orchestrator provider (provider
   resolved via the model registry; orchestrator from the session-state
   block; missing identity fails closed) AND an `sN-verification*.md`
   artifact; methods `manual-via-other-engine` / `skipped` require the
   zero-budget declaration in `ai_router/budget.yaml`. `--manual-verify`
   bypasses this gate as the sanctioned, attested, logged override;
   `--force` does not (force bypasses bookkeeping gates, not evidence —
   the existing contract, now made true for verification too).
3. Posture: hard-block interactive AND headless (the operator-confirmed
   deviation from the Q6 split, rationale in the Overview). The refusal
   message prints the exact `verify_session` invocation for this set
   and session.
4. Layer-1 pytest matrix, including the live incident as a regression
   fixture (`verification_method: "manual"` + self-attested `VERIFIED`
   → `gate_failed` at validation), the no-artifact case, the
   same-provider case, the missing-orchestrator-identity case (fails
   closed), the legal SKIP/null-verdict case (gate inert), the
   `--manual-verify` override, and the zero-budget-declared manual
   case (passes).
5. Dogfood: this session's own close runs through the new gate live.

**Creates:** the gate check + validation, their pytest suites.
**Touches:** `ai_router/close_session.py`, `ai_router/gate_checks.py`.
**Ends with:** the incident's exact disposition is blocked in tests;
this session's own close passed the live gate with real evidence.
**Progress keys:** `s2.validation`, `s2.gate`, `s2.tests`

---

### Session 3 of 3: Instruction surfaces, UAT, and the two releases

> **Revision (2026-07-06, operator decision — supersedes the step text
> below where they conflict).** The first UAT walk of this session failed
> live: the scaffolded Step 5 taught a bare `routed_gate` invocation whose
> empty path list always evaluated to SKIP, and the scratch build's venv
> carried PyPI 0.28.0 (no `verify_session`, no integrity gate), after
> which the walking engine fabricated verification. The operator ruled:
> **"Remove the skip. As soon as you give an easy way out, the AI engine
> will take that."** Accordingly:
>
> - Per-session cross-provider verification is **mandatory on every
>   Full-tier session** — the Set 068 routed-gate SKIP path is retired.
>   The scaffolded `start-here.md` teaches the two-command sequence
>   (`verify_session` mandatory → `close_session`), **not** the original
>   three-command sequence; the `start_session` advisory names
>   `verify_session` only. `python -m ai_router.routed_gate` survives for
>   pre-083 scaffolds but always answers REQUIRED (exit 0).
> - The verification-integrity gate refuses a **null-verdict** Full-tier
>   close; `skipped` / `manual-via-other-engine` are legal only under the
>   operator-declared zero-budget tier in `ai_router/budget.yaml`. The
>   Overview's "null-verdict close is legal" residual is superseded.
> - The UAT checklist is revised to assert the new surfaces and to install
>   the router **from this checkout** into the scratch venv (the PyPI
>   version-skew trap that sank the first walk).
> - The two releases (router 0.29.0, extension next minor) remain
>   sequenced **after** the re-walked UAT passes and only on operator
>   authorization, per step 5 below — their absence from the working tree
>   before that point is by design.

> **Revision 2 (2026-07-06, operator decision — supersession by Set 084).**
> The remaining S3 gates — the re-walked human UAT and the two releases —
> are **superseded by Set 084**
> (`docs/session-sets/084-verification-identity-and-close-backstop/`),
> authored the same day after a third live incident showed the fixes this
> set shipped are necessary but not sufficient for multi-provider
> (Copilot) seats: verifier selection was a static pin, and the gate
> compared a free-text seat label rather than the underlying model's
> provider. Operator reasoning (recorded verbatim in intent): walking this
> set's revised UAT would either pass hollow text checks or rediscover the
> incident Set 084 exists to fix, and publishing router 0.29.0 standalone
> would ship a version already known to be identity-blind. Therefore:
>
> - **UAT (step 4): waived by explicit operator override** for this set.
>   The two text assertions its checklist carried migrate verbatim into
>   the Set 084 cold-start UAT (same Build, same file, stronger walk that
>   also reproduces incident 3 against the new machinery). The waiver is
>   recorded in `s3-close-reason.md` and the disposition.
> - **Releases (step 5): deferred to Set 084 S3** as one combined release
>   — router **0.29.0** (never published in between, so the number is
>   clean) carrying both sets' changelog sections, plus the extension's
>   next minor.
> - **Not waived:** cross-provider verification of S3's work (round 5
>   corroborates the committed tree) and the required end-of-set
>   path-aware critique (automated; zero operator attention). The set
>   closes through its own gate with real evidence.

**Steps:**
1. Template bundle: `start-here.md.template` Step 6 rewritten to the
   three-command sequence with literal, copy-pasteable invocations;
   remove "automatic" from every description of Full verification in
   the bundle (engine bootstrap templates included) and in this repo's
   own instruction docs; regenerate both cold-start fixtures; update
   the Layer-2 snapshot/bootstrap suites. Grep for echoes of the old
   "automatic" claim across docs per L-065-1.
2. `start_session` (Full tier): one-line Step-6 advisory naming the
   `routed_gate` / `verify_session` commands, riding the lifecycle like
   the schema-drift advisory (non-blocking, fail-open).
3. Canonical docs: `docs/ai-led-session-workflow.md` Step 6 names the
   CLI as the canonical path (manual `route()` composition demoted to
   documented fallback); `ai_router/docs/close-out.md` documents the
   new gate, its evidence requirements, the hard-block posture, and the
   `--manual-verify` override.
4. Author the per-set UAT checklist to the Set 078–082 bar: one REAL
   cold-start Full Build (L-079-3) asserting the rendered
   `start-here.md` Step 6 shows the three commands and no "automatic"
   claim; one real `start_session` on a scratch set showing the Step-6
   advisory; operator walk; remediate.
5. Required end-of-set path-aware critique; then the two releases in
   order: `dabbler-ai-router` **0.29.0** (pyproject, `ai_router/CHANGELOG.md`,
   release.yml tag on operator authorization — L-078-1: any rollback
   text names only registry-live versions), then the extension's next
   minor (the bundle ships in the VSIX; package.json, extension
   CHANGELOG, repository-reference, vsix tag on operator
   authorization). Note the consumer floor-bump follow-up
   (`>= 0.29.0` + L-075-1) for the consumer repos' own sessions.

**Creates:**
`083-verify-session-cli-and-verification-integrity-gate-uat-checklist.json`,
`path-aware-critique.json`, both releases.
**Touches:** `docs/templates/consumer-bootstrap/*`,
`test-fixtures/cold-start/**`, `ai_router/start_session.py`,
`docs/ai-led-session-workflow.md`, `ai_router/docs/close-out.md`,
`pyproject.toml`, `ai_router/CHANGELOG.md`,
`tools/dabbler-ai-orchestration/package.json`,
`tools/dabbler-ai-orchestration/CHANGELOG.md`,
`docs/repository-reference.md`.
**Ends with:** UAT attested, required critique artifact valid, router
0.29.0 and the extension minor published on operator authorization,
and a fresh Full scaffold's Step 6 names the exact commands an engine
must run.
**Progress keys:** `s3.surfaces`, `s3.uat`, `s3.release`

---

## Anti-patterns avoided

- **Enforcement without affordance** (breeds workarounds) and
  **affordance without enforcement** (breeds drift) — the CLI and the
  gate ship in one set, and the gate's refusal message names the CLI.
- **Prose-armed gates** — `pathAwareCritique: required` and
  `requiresUAT: true` are declared in the config block (L-079-2).
- **Silent residuals** — the lie-by-omission (null-verdict) case and
  the fabricated-evidence ceiling are named in the Overview as
  documented residuals with their existing partial covers, not left
  implicit.
- **Weakened verifier framing** — the fix never touches the
  adversarial framing or the verdict grammar (L-069-2, L-071-1); it
  adds corroboration, not softer review.
- **Pre-seeded dogfood** — the S3 UAT Build starts from a fresh empty
  folder (L-079-3), and every session of the set live-dogfoods the
  machinery on its own Step 6 / close.
- **Registry-blind rollback text** — any rollback instruction written
  at release time names only versions confirmed installable (L-078-1).
