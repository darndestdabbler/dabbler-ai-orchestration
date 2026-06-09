# Tier-Model Clarity and Consumer-Repo Bootstrap Reconciliation

> **Purpose:** Reconcile the consumer-repo setup and documentation layer to
> the code-verified tier model — "Lightweight = router-off, not Python-off;
> `tier:` is the single switch" — so a fresh human operator **and** a cold AI
> orchestrator can stand up and run a Full- or Lightweight-tier repo with zero
> "what do I do next?" gaps, including engine files, a `.venv`, a templated
> `spec.md`, and a deterministic "start the next session" cold-start chain.
> **Session Set:** `docs/session-sets/058-tier-model-clarity-and-consumer-bootstrap/`
> **Created:** 2026-06-09
> **Workflow:** Full
> **Prerequisite:** none (design already locked — see Design Lock below).
> **Design input:** `docs/proposals/2026-06-09-tier-model-and-consumer-bootstrap/verdict.md`
> (cross-provider consensus gpt-5.4 + gemini-2.5-pro; fresh-Opus tiebreaker on
> the cold-start fork; consult $0.1854).

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: true
requiresE2E: false
uatScope: per-set
uatStyle: ad-hoc
totalSessions: 3
```

> Rationale: this set **builds** consumer-bootstrap machinery for both tiers,
> but is itself a full-tier docs + extension-code effort verified by
> cross-provider review. `requiresUAT: true` because the deliverable is "a
> human can set up a project and a cold orchestrator can run it with no
> confusion" — an end-to-end Get Started → *start the next session* flow that
> only a human can attest (ad-hoc, non-web; no Playwright surface, hence
> `requiresE2E: false`). Extension code changes → a **VS Code Marketplace**
> release (held for operator tag-push); a **PyPI** bump only if the packaged
> `ai_router` surface changes.

---

## Project Overview

### Motivation

A human scaffolded a new **Lightweight** consumer repo and was left stuck: no
`AGENTS.md` / `CLAUDE.md`, no `.venv`, generated specs missing the `tier:`
field, and no clear next step. The root cause is **one architectural drift**:
four setup surfaces still encode a stale, pre-Set-048 tier model
("Lightweight = no Python / no venv / no close-out / copyable-prompt
verification") that contradicts the actual code (`ai_router/runtime_mode.py`),
Set 057, and operator intent.

The code-verified truth: the **only** tier differentiator is the AI router
(external API calls). `tier: lightweight` in `spec.md` flips `--no-router`
(zero API calls); `start_session`, `close_session`, the blessed writer, state
derivation, and the close-out gate **all still run**. **Lightweight is
router-off, not Python-off.** Cross-provider verification on Lightweight is
the Set 057 dedicated verification/remediation sessions (operator-run on a
different engine), or opt out.

The operator's goal: **maximal Full↔Lightweight uniformity** in lifecycle
management, with `tier:` the single declarative switch and **no hand-editing
of any artifact except a templated `spec.md`**.

### What this set delivers

1. **One single source of truth** for the tier model
   (`docs/concepts/tier-model.md`), with README, `adoption-bootstrap.md`, the
   Get Started wizard, and the engine files reduced to **pointers** into it.
2. **Uniform consumer-repo scaffolding** for both tiers: `.venv` +
   `pip install dabbler-ai-router` + three engine files + a local
   `docs/dabbler/start-here.md` + a templated `spec.md`; the only divergence
   is Full writes router config while Lightweight sets `tier: lightweight`.
3. **A canonical `spec.md` template** (schemaVersion 4, required `tier` +
   `verificationMode`, `NNN-` slug) emitted by **one shared template writer**
   used by the fast path, the wizard, and the scaffolder — replacing the
   stale, ad-hoc, `schemaVersion: 2`/bare-slug/no-`tier` generator.
4. **A deterministic cold-start chain** (engine file → `start-here.md` →
   active `spec.md` → `tier`/`verificationMode` → `start_session`) so a fresh
   orchestrator told only "start the next session" self-orients in either
   tier, plus **CI drift guards** so the stale model cannot reappear.

### Non-goals

- **No change to the Set 048 `--no-router` runtime or the Set 057
  verification/remediation state machine.** This set wires *setup and docs* to
  the existing runtime; it does not re-open tier semantics.
- **No new persisted tier state.** `tier` lives in `spec.md` (read by
  `runtime_mode`); nothing new is persisted.
- **No router config for Lightweight.** `tier: lightweight` is the switch; no
  `router-config.yaml` / `budget.yaml` is written on that path.
- **No retroactive renaming** of existing bare-slug consumer sets (forward-
  only per the authoring guide). Backfilling existing consumer repos with
  engine files / `start-here.md` is noted but operator-scoped, not in this
  set's automated scope.

---

## Design Lock (LOCKED 2026-06-09)

> Locked from the consensus + tiebreaker verdict at
> [`docs/proposals/2026-06-09-tier-model-and-consumer-bootstrap/verdict.md`](../../proposals/2026-06-09-tier-model-and-consumer-bootstrap/verdict.md).
> D1–D4, D7, D8 converged across gpt-5.4 + gemini-2.5-pro (high confidence);
> D5 was the lone split, broken by the fresh-Opus tiebreaker (Option A); D6 is
> the tiebreaker's refinement. Orchestrator excluded from the consensus vote.

- **D1 — Tier-model SSoT.** `docs/concepts/tier-model.md` is the single
  canonical explanation. All other surfaces point to it; none restate the
  model.
- **D2 — Engine files: all three, every consumer repo, both tiers, thin
  pointers** (`AGENTS.md` + `CLAUDE.md` + `GEMINI.md`; shared body + engine
  bootstrap tail).
- **D3 — Setup uniformity.** Both tiers scaffold `.venv` + `pip install
  dabbler-ai-router`; only divergence is Full router config vs Lightweight
  `tier: lightweight`.
- **D4 — Canonical `spec.md` template** (schemaVersion 4; required `tier` +
  `verificationMode`, default `out-of-band-or-none`; `NNN-` slug) via one
  shared template writer; never emit `schemaVersion: 2`.
- **D5 — Cold-start = Option A.** engine file → `docs/dabbler/start-here.md`
  (generated, never hand-edited, snapshot-tested) → active `spec.md` →
  `tier`/`verificationMode` → `start_session` (routed | `--no-router`) → close
  via shared gate. Procedure lives once in `start-here.md`, not duplicated
  into each `spec.md` nor behind a network-only URL.
- **D6 — Deterministic active-set resolution.** `start-here.md` states one
  machine-checkable rule for selecting *the* active `spec.md`; CI enforces
  "exactly one active set."
- **D7 — Fix in BOTH code and docs** (extension materializes artifacts on
  every path; docs/templates are the durable source). Ships a Marketplace
  release.
- **D8 — Drift prevention.** Generated stubs + `start-here.md` rendered from
  one template bundle (snapshot-tested); a CI guard forbids the stale
  "Lightweight = no Python / no venv" framing in any doc.

---

## Sessions

### Session 1 of 3: Canonical contract + documentation single-source-of-truth

**Goal:** Establish the tier-model SSoT and every template, and reduce all
human-facing docs to thin pointers — docs/templates only, no extension code,
no release.
**Steps:**
1. Write `docs/concepts/tier-model.md` (D1): the definitive Full vs
   Lightweight explanation grounded in `runtime_mode.py` (router-off not
   Python-off; `tier:` the switch; shared lifecycle; Set 057 verification on
   Lightweight).
2. Author the canonical `spec.md` template (D4) and **document the `tier` and
   `verificationMode` fields in `docs/spec-md-schema.md`** (currently absent —
   itself a drift instance this set fixes).
3. Author the consumer-repo engine-file templates (D2) — shared thin body +
   per-engine bootstrap tails — and the `docs/dabbler/start-here.md` template
   (D5/D6), with the active-set-resolution rule stated verbatim.
4. Rewrite `README.md`, `docs/adoption-bootstrap.md` (fix the stale
   Lightweight definition), and the Get Started wizard copy as pointers to the
   SSoT (D1). Scrub "Lightweight = no Python / no venv / copyable-prompt-only"
   everywhere.
5. Cross-provider verification (full tier) of the SSoT + templates for
   internal consistency.
**Creates:** `docs/concepts/tier-model.md`; the spec / engine-file /
`start-here.md` templates (under a templates dir).
**Touches:** `README.md`, `docs/adoption-bootstrap.md`,
`docs/spec-md-schema.md`, `tools/dabbler-ai-orchestration/webview/wizard.html`
(copy only).
**Ends with:** one SSoT; all human docs pointing to it; the stale framing gone
from every doc; templates ready for the code paths to consume.
**Progress keys:** `session-001/ssot-written`, `session-001/templates-authored`,
`session-001/spec-schema-tier-documented`, `session-001/docs-pointerized`,
`session-001/verified`.

---

### Session 2 of 3: Extension code — shared template writer, scaffolder, generator, wizard

**Goal:** Make every repo-creation path emit correct, uniform, tier-aware
scaffolding from the Session-1 templates.
**Steps:**
1. Implement one **shared template writer** module (TS) that renders the
   canonical `spec.md` (schemaVersion 4, `NNN-` slug, `tier`,
   `verificationMode`), the three engine files, and `start-here.md` from the
   template bundle (D4/D8).
2. Fix `gitScaffold.ts` (`dabbler.setupNewProject`): scaffold `.venv` +
   `pip install dabbler-ai-router`, write the three engine files +
   `docs/dabbler/start-here.md`, and a templated `spec.md`; write router
   config **only** for Full and `tier: lightweight` for Lightweight (D3).
3. Fix `sessionGenPrompt.ts` to route through the shared template writer —
   `NNN-` prefix, schemaVersion 4, `tier`, `verificationMode`; never the old
   `schemaVersion: 2`/bare-slug shape (D4).
4. Wire the Get Started wizard (`WizardPanel.ts` / `wizard.html`) tier branch:
   correct prerequisites (Python for **both** tiers), and an explicit
   "you're ready — tell your orchestrator *start the next session*" closure
   (D7).
5. TS tests for the template writer, both fixed commands, and the wizard
   branch; cross-provider verification of the diff.
**Creates:** shared template-writer module + tests.
**Touches:** `tools/dabbler-ai-orchestration/src/commands/gitScaffold.ts`,
`.../src/wizard/sessionGenPrompt.ts`, `.../src/wizard/WizardPanel.ts`,
`.../webview/wizard.html`, `package.json`.
**Ends with:** the fast path, the wizard, and the scaffolder all produce
identical, correct, tier-aware repos; specs carry `tier` + `verificationMode`.
**Progress keys:** `session-002/template-writer-landed`,
`session-002/scaffolder-fixed`, `session-002/generator-fixed`,
`session-002/wizard-wired`, `session-002/tests-green`, `session-002/verified`.

---

### Session 3 of 3: Cold-start acceptance, drift CI, UAT, ship

**Goal:** Prove the cold-start acceptance test in both tiers, guard against
re-drift, capture operator UAT, and bump + hold the release.
**Steps:**
1. Author **cold-start acceptance fixtures** (D5): on a throwaway repo of each
   tier, assert the chain engine file → `start-here.md` → active `spec.md` →
   `tier` resolved → correct `start_session` mode (routed for Full,
   `--no-router` for Lightweight) → close via the shared gate.
2. Add **CI drift checks** (D8): a guard forbidding the stale framing
   (`Lightweight = no Python` / "no venv") in any doc; a snapshot check that
   generated stubs + `start-here.md` match the rendered template bundle; and
   the "exactly one active set" check (D6).
3. Author the **operator UAT checklist** (ad-hoc, per-set): the end-to-end Get
   Started → set up a new project → *start the next session* flow, run by the
   operator for **both** tiers.
4. Version bump + **held** release notes — extension (Marketplace tag
   `vsix-v<X.Y.Z>`) and `ai_router` (PyPI tag `v<X.Y.Z>`) only if its packaged
   surface changed; CLAUDE.md version walk / `repository-reference.md` updated.
5. Cross-provider verification; close-out (final session → `change-log.md`
   required).
**Creates:** cold-start acceptance fixtures; CI drift-check additions;
`058-...-uat-checklist.json`; held release notes.
**Touches:** `.github/workflows/*`, version files (`package.json`,
`pyproject.toml` if touched, `CHANGELOG.md`s, CLAUDE.md walk,
`docs/repository-reference.md`).
**Ends with:** a verified, drift-guarded, uniformly-bootstrapped two-tier setup
that passes the cold-start acceptance test in both tiers; release held for
operator tag-push.
**Progress keys:** `session-003/coldstart-acceptance-green`,
`session-003/drift-ci-added`, `session-003/uat-checklist-authored`,
`session-003/version-bumped`, `session-003/verified`,
`session-003/change-log-written`.

---

## End-of-set deliverables

- `docs/concepts/tier-model.md` — the SSoT for the tier model; README,
  `adoption-bootstrap.md`, the Get Started wizard, and the engine files all
  point to it.
- A canonical `spec.md` template (schemaVersion 4; required `tier` +
  `verificationMode`; `NNN-` slug) documented in `docs/spec-md-schema.md`, plus
  consumer engine-file templates and the `docs/dabbler/start-here.md` template.
- A shared template writer used by `gitScaffold`, `sessionGenPrompt`, and the
  wizard, so every creation path emits uniform, tier-aware scaffolding
  (`.venv` + package + three engine files + `start-here.md` + templated spec;
  router config Full-only).
- A deterministic cold-start chain with acceptance fixtures for both tiers, and
  CI drift guards (stale-framing guard + template snapshot + one-active-set).
- An updated Get Started wizard with correct both-tier prerequisites and a
  "start the next session" closure.
- An operator UAT checklist for the end-to-end setup flow, both tiers.
- Held release notes (Marketplace; PyPI only if the `ai_router` surface
  changed).
