# Guidance Slimming And Preload Ceilings Spec

> **Purpose:** Cut the always-loaded ("preload") guidance corpus from its
> measured ~65,000 tokens to a ≤12,000-token operating core, and make the
> shrink permanent with ratcheting, CI-enforced token ceilings — so the
> orchestrating model spends its attention on task work instead of process
> recitation, and the corpus cannot silently re-bloat. Design was settled
> by an operator-initiated cross-provider consult (2026-07-07): Gemini Pro
> and GPT-5.4, given the same neutral prompt, independently converged on
> (a) the preload cost being first-order — attention dilution plus
> *behavioral shaping* toward procedural defensibility, the observed
> "wheel-spinning"; (b) demoting any prose that duplicates an executable
> gate; (c) an admission test for preload residency; and (d) a target of
> ~8–12k preload tokens. Raw responses and the synthesis are in this
> directory (`consensus-gemini-pro.md`, `consensus-gpt-5-4.md`,
> `consensus-synthesis.md`).
> **Created:** 2026-07-07 (operator-initiated process retrospective)
> **Session Set:** `docs/session-sets/085-guidance-slimming-and-preload-ceilings/`
> **Prerequisite:** `084-verification-identity-and-close-backstop`
> (complete) — 084 S3 edits `docs/ai-led-session-workflow.md`,
> `ai_router/docs/close-out.md`, and the start-here template bundle; this
> set restructures the same surfaces, so it must not run concurrently.
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

---

## Session Set Configuration

```yaml
totalSessions: 3
requiresUAT: false
requiresE2E: false
uatScope: none
pathAwareCritique: required
prerequisites:
  - slug: 084-verification-identity-and-close-backstop
    condition: complete
```

> Rationale: The set ships tooling (`guidance_config` /
> `guidance_report` manifest support, a CI gate) and doc restructuring —
> no UI or browser surface, so no UAT/E2E gates (per the authoring
> guide: router edits, workflow changes, and doc work are the canonical
> `requiresUAT: false` cases). The quality bar is build + tests +
> cross-provider verification, plus a live dogfood in S3 (a real session
> run from the slimmed preload alone). `pathAwareCritique: required`
> because the set rewires cross-cutting instruction surfaces (required-
> reading contract, CLAUDE.md/AGENTS.md/GEMINI.md, templates, CI) where
> a stale-echo defect in any one surface silently misleads every future
> session — exactly the cross-artifact blast radius the gate exists for.

---

## Project Overview

**Measured baseline (2026-07-07).** Required session-start reading
totals ~65k tokens (ceil-chars/4 proxy): `ai-led-session-workflow.md`
~27k, `session-state-schema.md` ~9k, `close-out.md` ~8.5k,
`lessons-learned.md` ~7.5k, `session-set-authoring-guide.md` ~6.5k,
`project-guidance.md` ~3.5k, plus `CLAUDE.md` and `quick-start.md`.
Only two of these carry ceilings today
(`guidance:` block, Set 064); the three largest carry none.

**Scope — four deliverables:**

- **F1 — Preload manifest + ratcheting ceiling gate.** The `guidance:`
  config block gains a declarative `preload:` manifest — a list of
  `{path, ceiling_tokens}` entries plus `total_ceiling_tokens` —
  covering *every* file the workflow requires at session start, not
  just the two Set-064 files. `guidance_report` reports and `--check`
  gates per-file and total; CI runs `--check` so a breach fails the
  build, which makes the ceiling itself the anti-rebloat mechanism: at
  ceiling, adding prose requires removing prose (token-neutral by
  construction). **Ceilings ratchet down only** — raising one is an
  operator-authorized config edit with a stated reason, never an
  in-session accommodation. Back-compat: a repo with no `preload:`
  manifest keeps today's two-file defaults untouched (universal core,
  gated extensions).

- **F2 — The slimming.** A new ~≤4k-token
  `docs/session-constitution.md` becomes the per-session operating
  doc: the step sequence, source-of-truth and conflict-resolution
  rules, state-mutation discipline (blessed writers only), the
  irreversible-action approval list, definition of done, and
  recovery/escalation rules — each step pointing at its on-demand
  reference. The demotions (content is *moved out of the preload
  path*, not deleted — every demoted doc remains authoritative for its
  domain, consulted at the moment of need):
  - `ai-led-session-workflow.md` → on-demand execution reference,
    consulted per-step for rare branches; the constitution carries the
    happy path.
  - `session-state-schema.md` → consulted when a state question
    actually arises; the blessed writers own the shape at runtime.
  - `close-out.md` → consulted on close failure; `close_session
    --help` already echoes its Section 2.
  - `session-set-authoring-guide.md` → read when *authoring a spec*,
    not before every session.
  - `lessons-learned.md` → triaged against the admission test (below)
    to a ~2k active set.

- **F3 — Admission test + prose→gate→archive pipeline.** Documented in
  `docs/guidance-lifecycle.md` as the new residency rule: a lesson or
  rule earns preload space only if it has (recent recurrence) AND
  (high miss cost) AND (weak automated detectability) AND (no
  executable-gate equivalent) AND (expressible in ≤150 tokens).
  Anything machine-checkable becomes a gate (test, validator, CI
  check) and the prose archives; anything situational becomes
  on-demand reference (`guidance_search`); anything stale is archived
  or dropped. `guidance_triage` proposals remain operator-reviewed —
  the tool never edits the target file directly.

- **F4 — Portability.** `docs/guidance-slimming-playbook.md`: an
  engine-agnostic, repo-portable recipe (measure with
  `guidance_report`, classify with the admission test, demote
  gate-duplicating prose, write the constitution, declare the
  manifest, ratchet). The operator has other repos whose guidance has
  bloated; they apply the playbook in their own sessions once the
  router release ships the manifest machinery.

**Operator decisions encoded (do not re-litigate in-session):**

- The no-skip verification mandate (Set 083) is untouched. This set
  slims *preload prose only* — never gates, never verification, never
  the adversarial template's framing (L-069-2). Scoping the verifier's
  evidence to the diff/tests/gate outcomes is sharpening, not
  weakening; any change that reads as a skip affordance is out of
  scope.
- "Allow cheap mistakes" applies only where a gate detects the mistake
  mechanically and repair is local. The consensus limits are hard:
  irreversible/external actions, security and data integrity, silently
  corrupting errors, expensive-to-unwind cascades all stay prevented
  up front.
- Preload target: ≤12k total, per-file ceilings per the manifest.
  Ceilings never rise without explicit operator sign-off.

**Non-goals.** No wholesale deletion of the workflow doc, schema doc,
or close-out doc (they stay authoritative, on demand). No change to the
verdict grammar, blocking predicate, tier machinery, or close gates. No
consumer-repo edits (their own sessions apply the playbook). No new
close-out gate for ceilings — CI is the single enforcement point
(prefer-removal-over-addition: the simplest reliable gate, not a second
one).

---

## Sessions

### Session 1 of 3: Preload manifest, ceiling gate, CI wiring (F1)

**Steps:**
1. **Manifest config.** Extend `guidance_config.py`: the `guidance:`
   block accepts `preload:` (list of `{path, ceiling_tokens}`,
   repo-root-relative) and `total_ceiling_tokens`. Absent manifest →
   exactly today's behavior (the two Set-064 ceilings; legacy keys keep
   working). Schema-validator parity in both directions where the
   config is schema-checked (L-066-1).
2. **Reporter + gate.** `guidance_report` reports every manifest entry
   (per-file and total, against ceilings); `--check` exits non-zero on
   any per-file or total breach with a remediation line naming the file
   and overage. `--write-headers` stamps only files that opt in
   (`stamp: true` per entry, default false — CLAUDE.md and canonical
   docs are not auto-edited).
3. **Declare this repo's manifest at current sizes (ratchet start).**
   Every required-reading file enters the manifest with its ceiling set
   at its measured current size, so the gate is green from this commit
   and growth is blocked immediately; S2 lowers the ceilings as content
   shrinks. Document the ratchet-down-only rule and the admission test
   (F3) in `docs/guidance-lifecycle.md`.
4. **CI.** Add `guidance_report --check` to the test workflow and the
   documented pre-commit pass (`CONTRIBUTING.md`).
5. **Layer-1 pytest matrix:** manifest parsing (missing block, partial
   block, legacy-keys-only, bad types), per-file and total breach exit
   codes, ratchet-start fixture (all green at declared sizes), a
   one-token-over fixture (fails with the named file).

**Creates:** pytest suite for the manifest/gate.
**Touches:** `ai_router/guidance_config.py`,
`ai_router/guidance_report.py`, `ai_router/router-config.yaml`,
`docs/guidance-lifecycle.md`, `.github/workflows/test.yml`,
`CONTRIBUTING.md`.
**Ends with:** `guidance_report --check` runs green in CI with every
required-reading file under a declared ceiling; a deliberate one-token
overage fails the suite in a test fixture.
**Progress keys:** `s1.manifest`, `s1.gate`, `s1.ci`

---

### Session 2 of 3: The constitution and the demotions (F2 + F3)

**Steps:**
1. **Author `docs/session-constitution.md` (≤4k tokens).** Contents:
   the session step sequence (happy path), source-of-truth /
   conflict-resolution rules, state-mutation discipline (blessed
   writers only — never freehand state edits), the irreversible-action
   approval list, definition of done per tier, recovery/escalation
   rules (gate failure, verifier disagreement, when to stop retrying),
   and a per-step pointer table into the on-demand references. Nothing
   in it may duplicate what an executable gate already enforces —
   principle-level mention only.
2. **Rewrite the required-reading contract.** Before-every-session
   reading becomes: constitution + `project-guidance.md` + active
   `lessons-learned.md` (+ the engine bootstrap file). Demote the
   workflow doc, schema doc, close-out doc, and authoring guide to
   their moment-of-need triggers (F2 list). Update every surface that
   states the old contract: `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`,
   `docs/planning/project-guidance.md` (Workflow Expectations),
   `docs/quick-start.md`, `docs/ai-led-session-workflow.md` (its own
   Step 0/required-reading text), start-here templates in
   `docs/templates/consumer-bootstrap/`, and cold-start fixtures.
   Grep for stale echoes of the old list across the repo (L-065-1) —
   a bug is a bug class (L-069-1).
3. **Lessons triage sweep.** Run `guidance_triage` against the F3
   admission test; for each active lesson propose
   keep-active / gate-and-archive / archive / merge / drop. Lessons
   that become gates get their executable check named in the proposal
   (many are already enforced — e.g. schema-parity and ASCII-output
   conventions have tests; their prose then archives with a pointer).
   Operator reviews and applies the proposal; target active set ~2k
   tokens.
4. **Lower the manifest ceilings to targets.** Constitution ≤4k
   replaces the workflow doc's preload entry; schema doc, close-out
   doc, and authoring guide leave the manifest (on-demand docs are
   uncapped, like the archive — their size is no longer a recurring
   tax); lessons ceiling drops to match the triaged set; total ceiling
   set to 12k.
5. **Suite + `guidance_report --check` green at the new ceilings.**

**Creates:** `docs/session-constitution.md`, the triage proposal
artifact.
**Touches:** `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`,
`docs/planning/project-guidance.md`, `docs/planning/lessons-learned.md`,
`docs/planning/lessons-archive.md`, `docs/quick-start.md`,
`docs/ai-led-session-workflow.md`, `docs/guidance-lifecycle.md`,
`docs/templates/consumer-bootstrap/*`, `test-fixtures/cold-start/**`,
`ai_router/router-config.yaml`.
**Ends with:** total preload ≤12k tokens with `--check` green; no
surface in the repo still states the old required-reading list; the
operator has reviewed and applied the lessons triage.
**Progress keys:** `s2.constitution`, `s2.demotions`, `s2.triage`

---

### Session 3 of 3: Verifier evidence scope, playbook, live dogfood, release (F4)

**Steps:**
1. **Verifier context audit.** Review what `verify_session` and the
   canonical adversarial template actually assemble as verifier
   context. The verifier's evidence should be the diff, test output,
   gate outcomes, the spec, and the constitution — not the full
   process manual (a manual-fed verifier produces process-heavy
   critiques and inflates round counts). The template's adversarial
   framing is untouched (L-069-2); if the current assembly is already
   scoped, record no-change-needed in the disposition rather than
   inventing an edit (prefer removal over addition).
2. **Author `docs/guidance-slimming-playbook.md`** (repo-portable,
   engine-agnostic): measure → classify (admission test) → demote
   gate-duplicating prose → write the constitution → declare the
   manifest → ratchet. Includes the consensus limits on "allow cheap
   mistakes" verbatim, and names the A/B signals a repo should watch
   after slimming (verification rounds per session,
   time-to-first-task-action, gate failures per session).
3. **Live dogfood.** This session itself runs from the slimmed preload
   only (constitution + project-guidance + active lessons + engine
   bootstrap), opening on-demand docs only at their trigger moments.
   Record in `disposition.json`: which on-demand docs were actually
   opened and why, verification rounds, and time-to-first-task-action
   — the first A/B datapoint against the Set 083/084 baseline.
4. **Required end-of-set path-aware critique**; then, on operator
   authorization, release: `dabbler-ai-router` next minor (manifest
   machinery, so consumer repos can adopt the playbook) — pyproject,
   CHANGELOG, tag — and, only if the consumer-bootstrap template
   bundle changed in S2 (it does), the extension's next minor
   (package.json, CHANGELOG, repository-reference, vsix). Rollback
   text names only registry-live versions (L-078-1).

**Creates:** `docs/guidance-slimming-playbook.md`,
`path-aware-critique.json`, both releases.
**Touches:** `ai_router/verify_session.py` and/or
`ai_router/prompt-templates/*` (only if the audit finds unscoped
assembly), `pyproject.toml`, `ai_router/CHANGELOG.md`,
`tools/dabbler-ai-orchestration/package.json`,
`tools/dabbler-ai-orchestration/CHANGELOG.md`,
`docs/repository-reference.md`.
**Ends with:** dogfood evidence in the disposition (session ran from
the slimmed preload; on-demand opens listed), critique artifact valid,
releases published on operator authorization.
**Progress keys:** `s3.verifier-scope`, `s3.playbook`, `s3.dogfood`,
`s3.release`

---

## End-of-set deliverables

- Preload manifest + ratcheting `--check` gate in CI (F1), green at a
  ≤12k total ceiling.
- `docs/session-constitution.md` as the per-session operating doc; the
  four demoted docs authoritative-on-demand (F2).
- Admission test + prose→gate→archive pipeline documented in
  `docs/guidance-lifecycle.md`; lessons triaged to ~2k active (F3).
- `docs/guidance-slimming-playbook.md` for consumer repos (F4).
- One live dogfood datapoint (rounds, time-to-first-action, on-demand
  opens) recorded for the ongoing A/B.
- Router minor + extension minor released on operator authorization.

---

## Anti-patterns avoided

- **Prevention prose duplicating executable gates** — the disease this
  set treats; the constitution states principles, the gates enforce
  rules.
- **Deleting instead of demoting** — every demoted doc keeps its
  authority for its domain; only its *preload residency* ends.
- **Skip affordances in slimming's clothing** — verification, close
  gates, and the adversarial template framing are explicitly out of
  scope (operator mandate, Set 083; L-069-2).
- **A second enforcement surface** — ceilings gate in CI only; no new
  close-out gate (prefer removal over addition).
- **Silent re-bloat** — ceilings ratchet down only; raising one is an
  operator-authorized config edit with a stated reason.
- **Stale-echo drift** — the old required-reading list is grepped out
  of every surface in the same pass (L-065-1, L-069-1).
