# Omit VerificationMode From Full-Tier Scaffolds Spec

> **Purpose:** A freshly scaffolded **Full**-tier project today carries
> `verificationMode: out-of-band-or-none` in its sample spec's config
> block and a `.dabbler/verification-mode` marker file claiming the same
> — both phantom "choices" no Full surface ever made or reads
> (`verificationMode` is Lightweight-only, Set 057; the mode machinery is
> inert on Full). The inline "inert on Full" comment does not survive
> paraphrase: the operator's GitHub Copilot session read a fresh Full
> scaffold and reported "tier: full, verificationMode:
> out-of-band-or-none" — the exact wrong message, since automatic
> cross-provider verification is the Full tier's defining feature. Per
> the simplicity-first principle (remove before adding; a sentinel like
> "n/a" would teach every mode parser a third enum token), this set makes
> Full-tier scaffolds **omit** the field and the marker entirely.
> Omission is already schema-legal: `docs/spec-md-schema.md` lists
> `verificationMode` as optional with a documented default, and every
> reader applies absence-means-default.
> **Created:** 2026-07-06 (operator-reported after a live Copilot
> misreading of a fresh Full scaffold)
> **Session Set:** `docs/session-sets/082-omit-verification-mode-from-full-tier-scaffolds/`
> **Prerequisite:** None
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

---

## Session Set Configuration

```yaml
totalSessions: 2
requiresUAT: true
requiresE2E: false
uatScope: per-set
pathAwareCritique: required
```

> Rationale: the set changes what a real Build writes to disk (the
> rendered sample spec and the `.dabbler` marker set differ by tier
> afterward), so a human UAT walk with one REAL cold-start Build per
> tier is required — the same posture Sets 079/081 took for Build-outcome
> changes, and the walk reproduces the exact surface that misled the
> operator's Copilot session. No browser E2E surface changes → no E2E
> gate. `pathAwareCritique: required` follows the blast-radius
> recommendation for the planned paths (categories tripped:
> cross-artifact, shared-schema, wiring, index — the consumer-bootstrap
> bundle is inherited by every future scaffolded repo). Declared in the
> config block per L-079-2 — prose does not arm gates.

---

## Project Overview

**Scope.** One removal with two sites, plus the docs that describe them:

- **Template site.** `docs/templates/consumer-bootstrap/spec.md.template`
  renders the `verificationMode:` line unconditionally (line 19), and
  `tokenTable` in `consumerBootstrap.ts` fills the default
  `out-of-band-or-none` whenever no pick exists — which on Full is
  always (the form's verification-mode radios render only on
  Lightweight, and the action layer drops the rider on Full). Fix:
  render the line **only on Lightweight scaffolds**. The `{{TOKEN}}`
  engine has no conditionals, so the whole line (text + trailing
  newline) moves into a token — e.g. `{{VERIFICATION_MODE_LINE}}` —
  that the writer fills with the current line on `lightweight` and the
  empty string on `full` (no blank-line residue in the rendered YAML
  block).
- **Marker site (same defect class — L-069-1).** `scaffoldConsumerRepo`
  in `gitScaffold.ts` writes the `.dabbler/verification-mode` marker
  unconditionally on both tiers (normalizing to the default), so a Full
  repo carries a marker asserting a Lightweight choice nobody made.
  Fix: write the marker **on Lightweight only**. On Full, neither write
  nor delete an existing marker — a prior Lightweight pick survives a
  tier round-trip untouched, mirroring the Set 081 "hiding never
  clears" posture and the marker's documented write-through-cache
  semantics (`.dabbler/tier` stays unconditional; it is tier-agnostic
  by design).
- **Docs.** One-line notes in `docs/spec-md-schema.md` and
  `docs/planning/session-set-authoring-guide.md` that Full-tier
  scaffolds omit the field (grep for echoes of the old claim per
  L-065-1 — `docs/templates/consumer-bootstrap/README.md` line ~71
  documents the token and must describe the new conditional).

**Non-goals.** No change to: the `verificationMode` enum, its
Lightweight semantics, or the Set 057/062 mode machinery; the
Lightweight scaffold output (byte-identical fixtures are the tripwire);
the `sessionGenPrompt` flow (already correct — it reads the marker only
when the resolved tier is Lightweight and `buildSessionGenPrompt`
ignores the field otherwise; S1 confirms and, if unpinned, pins that
with a test); the Getting Started form (no UI change, no screenshot
refresh); `.dabbler/tier`; anything in `ai_router/` (extension-only
release). No sentinel values — the fix is omission, not a third token.

---

## Sessions

### Session 1 of 2: Conditional template line + tier-gated marker

**Steps:**
1. `spec.md.template`: replace the fixed `verificationMode:` line with a
   whole-line token; `consumerBootstrap.ts` renders the full current
   line (including the "Lightweight only … inert on Full" comment) when
   `ctx.tier === "lightweight"` and the empty string on `full`, with no
   blank-line residue. Update the template README's token table.
2. `gitScaffold.ts`: gate `writeVerificationModeMarker` to
   `ctx.tier === "lightweight"`; on Full the marker is neither written
   nor deleted (document the preserve-across-round-trip choice in the
   code comment); adjust the `written` list accordingly.
3. Sibling audit (L-069-1): confirm `buildSessionGenPrompt` emits no
   `verificationMode` on Full-resolved prompts (pin with a Layer-2 test
   if not already pinned); grep the remaining bundle templates
   (`start-here.md.template`, engine files, README) for any
   unconditional `verificationMode` rendering — Lightweight-scoped
   prose stays.
4. Regenerate `test-fixtures/cold-start/full` (no `verificationMode:`
   line in the sample spec; no `.dabbler/verification-mode` in the
   fixture's marker set) and confirm `test-fixtures/cold-start/lightweight`
   is byte-identical to before (the scope tripwire). Update/extend the
   Layer-2 suites: `consumerBootstrap.test.ts` (per-tier line
   presence/absence, no unsubstituted-token regression, no blank-line
   residue), `coldStartSnapshot.test.ts`, `gitScaffoldCore.test.ts`
   (marker write matrix: lightweight writes, full skips, full preserves
   a pre-existing marker).
5. Docs: the one-line omission notes in `spec-md-schema.md` and the
   authoring guide. Full Layer-2 suite + `tsc` green (Layer-3 only if
   an Explorer-rendering surface turns out to be touched — none is
   expected).

**Creates:** conditional template token + writer logic, marker gating,
new/updated Layer-2 assertions.
**Touches:** `docs/templates/consumer-bootstrap/spec.md.template`,
`docs/templates/consumer-bootstrap/README.md`,
`tools/dabbler-ai-orchestration/src/utils/consumerBootstrap.ts`,
`tools/dabbler-ai-orchestration/src/commands/gitScaffold.ts`,
`test-fixtures/cold-start/full/**`,
`tools/dabbler-ai-orchestration/src/test/suite/consumerBootstrap.test.ts`,
`tools/dabbler-ai-orchestration/src/test/suite/coldStartSnapshot.test.ts`,
`tools/dabbler-ai-orchestration/src/test/suite/gitScaffoldCore.test.ts`,
`docs/spec-md-schema.md`, `docs/planning/session-set-authoring-guide.md`.
**Ends with:** on the vscode-stub, a Full-context render carries no
`verificationMode:` line and skips the marker write (preserving any
pre-existing marker), a Lightweight-context render is byte-identical to
today's output, and the full Layer-2 suite + `tsc` are green.
**Progress keys:** `s1.template`, `s1.marker`, `s1.tests`

---

### Session 2 of 2: Cold-start UAT and release

**Steps:**
1. Author the per-set UAT checklist to the Set 078–081 bar (literal
   copy-pasteable actions, source-re-grounded strings, fresh suite
   counts quoted per walk): one REAL cold-start Build per tier in fresh
   empty folders (L-079-3). Full walk: the rendered
   `docs/session-sets/001-sample-feature/spec.md` config block contains
   no `verificationMode:` line, and `.dabbler/` contains `tier` but no
   `verification-mode` file — the assertion is scoped to the config
   block and the marker (the scaffolded `start-here.md` legitimately
   mentions `out-of-band-or-none` in Lightweight-scoped prose; a naive
   repo-wide grep is the wrong check and the checklist must say so).
   Lightweight walk: the line (with its comment) and the marker are
   both present, byte-identical to 0.37.0 output.
2. Operator walk; remediate any findings.
3. Run the required end-of-set path-aware critique stage; then version
   bump (extension only), CHANGELOG, repository-reference, commit,
   push, green Test, operator-authorized tag push.

**Creates:**
`082-omit-verification-mode-from-full-tier-scaffolds-uat-checklist.json`,
`path-aware-critique.json`, release.
**Touches:** `tools/dabbler-ai-orchestration/CHANGELOG.md`,
`tools/dabbler-ai-orchestration/package.json`,
`docs/repository-reference.md`.
**Ends with:** UAT attested, required critique artifact saved and valid,
release published on operator authorization.
**Progress keys:** `s2.uat`, `s2.release`

---

## Anti-patterns avoided

- **Additive fix where removal works** — no "n/a"/"full-tier" sentinel
  (a third enum token every parser must learn); the field and marker
  are simply absent on Full, where absence already means the default.
- **Point-fix leaving the class alive** — both sibling sites (template
  line AND marker write) land in the same pass; `sessionGenPrompt` is
  audited and pinned rather than assumed (L-069-1).
- **Prose-vs-config gate mismatch** — `pathAwareCritique: required` is
  declared in the config block (L-079-2), seeded from the blast-radius
  recommendation.
- **Pre-seeded dogfood** — both UAT Builds start from fresh empty
  folders (L-079-3).
- **Scope creep** — any byte-level change to the Lightweight scaffold
  output means the conditional leaked past the Full path, and the
  session stops.
