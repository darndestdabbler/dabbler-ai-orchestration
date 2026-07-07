# Guidance Slimming Playbook

> **Purpose:** A repo-portable, engine-agnostic recipe for cutting an
> over-grown always-loaded ("preload") guidance corpus down to a small
> operating core — and making the shrink permanent with ratcheting,
> CI-enforced token ceilings.
> **Audience:** Operators and AI orchestrators of any engine (Claude
> Code, Codex, Gemini, Copilot) in any AI-led-workflow repo.
> **Origin:** Set 085 in `dabbler-ai-orchestration`, executing the
> 2026-07-07 cross-provider consult (Gemini Pro + GPT-5.4, independent
> convergence; synthesis in
> `docs/session-sets/085-guidance-slimming-and-preload-ceilings/`).
> **Prerequisite:** `dabbler-ai-router >= 0.30.0` (the preload-manifest
> machinery: `guidance:` `preload:` config + `guidance_report --check`).

## Why slim at all

Preload context is the scarcest resource in the workflow: every token
loaded at session start is paid on **every** session. The measured cost
has two mechanisms, named independently by both consulted providers:

1. **Attention dilution** — lost-in-the-middle salience; the rules that
   matter compete with prose that doesn't.
2. **Behavioral shaping** — the sharper point: a high-volume *process*
   preload teaches the model that procedural defensibility is the
   success criterion, crowding out decisive task work. The signature
   symptom is wheel-spinning: long verification loops, process
   recitation, hedged non-action.

The origin repo's required session-start reading measured ~65k tokens;
the slimmed core is ~10.7k under a 12k ceiling, with every demoted doc
still authoritative for its domain — consulted at the moment of need
instead of taxed on every session.

## The recipe

### 1. Measure

Inventory every file the workflow requires in context at session start
(the *required-reading contract* — whatever your bootstrap and workflow
docs say must be read "before every session"). Measure each with the
router's reporter, which uses the cheap `ceil(chars / 4)` token proxy:

```sh
python -m ai_router.guidance_report
```

Write the list down with per-file sizes and the total. This measured
baseline is your ratchet start (step 5) and your before/after evidence.

### 2. Classify — the preload admission test

A rule or lesson earns preload residency **only if it satisfies all
five** (canonical statement: `docs/guidance-lifecycle.md`):

1. **Recent recurrence** — it has actually come up recently.
2. **High miss cost** — getting it wrong is expensive or hard to unwind.
3. **Weak automated detectability** — no cheap deterministic check
   reliably catches the mistake.
4. **No executable-gate equivalent** — not already enforced by a test,
   validator, linter, or CI check.
5. **Expressible in ≤150 tokens** — the principle fits; the full
   treatment lives on demand.

Run the classification over every preload rule and lesson. In router
repos, `python -m ai_router.guidance_triage` produces an
operator-reviewed proposal (it never edits the target file). Expect to
sharpen its output by hand against the five-part test — the origin
repo's routed triage pass kept ~4x the target size until the
orchestrator applied the test strictly and the operator reviewed the
result. Archival and demotion stay operator-reviewed actions; **never
delete** — archive with a pointer.

### 3. Demote — the prose → gate → archive pipeline

Route everything that fails the admission test:

- **Machine-checkable → make it a gate.** A test, validator, or CI
  check enforces it; the prose archives with an `encoded-in` pointer to
  the automation. The gate costs zero attention until it fires; the
  prose costs attention every session. Prose that *duplicates an
  existing gate* is the highest-value cut — the framework is paying
  twice.
- **Situational → on-demand reference.** Content that matters at a
  specific moment (a state-file schema, a close-failure runbook, a spec
  authoring guide) moves out of the preload path and is opened at its
  trigger moment. It keeps full authority for its domain; only its
  *preload residency* ends.
- **Stale → archive or drop.** Superseded, retired, or long-unused
  content archives under the lifecycle's evidence rules.

### 4. Write the constitution

Replace the process manual's preload residency with a single small
per-session operating doc (the origin repo budgets it at ≤4k tokens:
`docs/session-constitution.md`). Contents:

- the session step sequence (happy path only);
- source-of-truth and conflict-resolution rules;
- state-mutation discipline (blessed writers only);
- the irreversible-action operator-approval list;
- definition of done per tier;
- recovery/escalation rules (when to stop retrying, who adjudicates);
- a **per-step pointer table** naming which on-demand reference to open
  at which trigger moment — this table is what makes demotion safe.

Two disciplines while authoring:

- **Principle-level mention only.** Nothing in the constitution may
  duplicate what an executable gate already enforces — state the
  principle, let the gate carry the rule.
- **A replacement doc inherits the retired doc's claims at its peril.**
  Grep the new text for claims of *current* behavior (reads, writes,
  enforcement, defaults) and re-verify each against the code before
  shipping.

Then rewrite the required-reading contract everywhere it is stated —
bootstrap files (`CLAUDE.md` / `AGENTS.md` / `GEMINI.md`), guidance
files, quick-start, templates, fixtures — and grep the repo for stale
echoes of the old list. A consistency fix is global: every echo, one
pass.

### 5. Declare the manifest

Declare the surviving preload in the router config's `guidance:` block,
with per-file ceilings **at the measured current sizes** (so the gate is
green from the first commit and growth is blocked immediately):

```yaml
guidance:
  preload:
    total_ceiling_tokens: 12000        # the operating-core budget
    files:
      - path: docs/session-constitution.md
        ceiling_tokens: 4000
      - path: docs/planning/project-guidance.md
        ceiling_tokens: 3499
      - path: docs/planning/lessons-learned.md
        ceiling_tokens: 2385
      - path: AGENTS.md                # largest engine bootstrap file
        ceiling_tokens: 2031
```

Rules that keep the manifest honest:

- **One engine file, the largest.** A session reads exactly one
  bootstrap file; the manifest (a sum-based gate) lists the largest as
  the representative entry. Keep siblings in lockstep; an edit that
  makes an uncounted sibling the largest must repoint the entry in the
  same change.
- **Demoted docs stay uncapped.** On-demand references and the archive
  impose no per-session tax; capping them only invites ceiling-editing
  churn.
- **A listed-but-missing file is a hard failure** — it catches a
  required-reading doc moved or renamed without updating the manifest.
- Wire `python -m ai_router.guidance_report --check` into CI and the
  documented pre-commit pass. CI is the single enforcement point — do
  not add a second gate surface for the same invariant.

Target sizing (from the consult): **8–12k tokens total**; the origin
repo adopted ≤12k, ratcheting down.

### 6. Ratchet

**Ceilings ratchet DOWN only.** Lowering one as content shrinks is
routine. Raising any ceiling — or the total — is an operator-authorized
config edit with a stated reason, never an in-session accommodation. An
orchestrator at ceiling removes prose; it does not edit the number. At
ceiling, adding prose requires removing prose — token-neutral by
construction, which is the whole anti-rebloat mechanism.

## The limits on "allow cheap mistakes"

Slimming rests on letting gates catch mistakes instead of preventing
them with prose. The consult adopted that default **with these limits,
verbatim — all four stay prevented up front**:

- irreversible/externally-visible actions,
- security/data integrity,
- silently-corrupting errors (wrong but validates),
- expensive-to-unwind cascades.

And the adopted refinement: the principle is **"use the cheapest
reliable control at the latest safe point"** — not "let the model make
mistakes." Verification mandates, close gates, and adversarial reviewer
framing are not preload prose; a slimming pass must never weaken them,
and any change that reads as a skip affordance is out of scope.

## Scope the verifier's evidence too

The same dilution applies to a routed verifier: a manual-fed verifier
produces process-heavy critiques and inflates round counts. Its evidence
should be the diff (plus `git status --short`, so untracked deliverables
are visible), the session's spec excerpt, and an up-front conventions
block carrying the suite baseline and gate outcomes — the origin
consult's adopted scope list — not the process manual, and not the
constitution either: any process doc in the bundle re-invites the
process-heavy-critique failure mode. (If your repo's operator mandates
feeding the constitution, that is an operator call — record it
explicitly rather than drifting into it.) The adversarial framing of
the verification template is untouched by slimming.

## Watch the A/B signals

Slimming is an intervention with a measurable hypothesis. After
cutover, watch per session, against your pre-slimming baseline:

- **verification rounds per session** (the wheel-spinning signal);
- **time-to-first-task-action** (session start → first action on the
  actual task, excluding preload/registration overhead);
- **gate failures per session** (did removing prevention prose actually
  cost correctness? The bet is no — the gates were the real control).

If gate failures rise on a class the prose used to prevent, that class
is a candidate to *re-admit* — through the admission test, inside the
ceiling, by removing something else.

## Anti-patterns

- **Deleting instead of demoting** — every demoted doc keeps its
  authority; only its preload residency ends.
- **Prevention prose duplicating an executable gate** — the disease
  this playbook treats.
- **Skip affordances in slimming's clothing** — gates and verification
  are out of scope, always.
- **A second enforcement surface** — the CI `--check` is the gate;
  don't add another.
- **Silent re-bloat** — ceilings ratchet down only.
- **Stale-echo drift** — the old required-reading list must be grepped
  out of every surface in the same pass.
