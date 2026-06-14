# Consumer-bootstrap template bundle

> **Durable source of truth for everything the extension scaffolds into a
> new consumer repo.** Per the Set 058 design lock (D7/D8), the code paths
> (`gitScaffold`, `sessionGenPrompt`, the Get Started wizard) materialize
> artifacts on every path, but **these template files are the durable
> source.** A shared template writer (Session 2) renders them; CI snapshot
> tests (Session 3) assert that the generated stubs match what these files
> render, so the stale tier model cannot silently reappear.

## What is in this bundle

| Template file | Renders to (in the consumer repo) | Both tiers? |
|---|---|---|
| [`spec.md.template`](spec.md.template) | `docs/session-sets/<NNN-slug>/spec.md` | yes |
| [`session-state.json.template`](session-state.json.template) | `docs/session-sets/<NNN-slug>/session-state.json` (schemaVersion 4, `status: not-started`) | yes |
| [`start-here.md.template`](start-here.md.template) | `docs/dabbler/start-here.md` | yes |
| [`getting-started.md.template`](getting-started.md.template) | `docs/dabbler/getting-started.md` — the static Getting Started teaching doc (Set 060 D8). **Token-free by design** so the bundled copy can be opened in the editor before any scaffold has run. | yes |
| [`engine-file.shared-body.md`](engine-file.shared-body.md) | the shared body of all three engine files | yes |
| [`engine-file.claude-tail.md`](engine-file.claude-tail.md) | the `CLAUDE.md` bootstrap tail | yes |
| [`engine-file.agents-tail.md`](engine-file.agents-tail.md) | the `AGENTS.md` bootstrap tail | yes |
| [`engine-file.gemini-tail.md`](engine-file.gemini-tail.md) | the `GEMINI.md` bootstrap tail | yes |
| [`lessons-learned.md.template`](lessons-learned.md.template) | `docs/planning/lessons-learned.md` — the always-loaded **active** guidance tier with the per-lesson metadata-trailer convention (Set 064 D7) | yes |
| [`project-guidance.md.template`](project-guidance.md.template) | `docs/planning/project-guidance.md` — Principles/Conventions skeleton, ceiling-aware (Set 064 D7) | yes |
| [`lessons-archive.md.template`](lessons-archive.md.template) | `docs/planning/lessons-archive.md` — the never-auto-loaded **archive** tier, seeded empty (Set 064 D7) | yes |

The three `docs/planning/` guidance starters are repo-level structure (not
per-set), so they are written by **both** the full session-set scaffold and the
structure-only "Build project structure" path. The scaffold's skip-existing
guard means an existing repo's accumulated guidance is never clobbered on a
re-run. They consume only `{{REPO_NAME}}` and point at the canonical
[guidance-lifecycle doc](https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/guidance-lifecycle.md)
via a GitHub URL (a fresh consumer repo has no local copy of this repo's `docs/`).

Each engine file in the consumer repo is rendered as
**`<shared body>` + `"\n"` + `<that engine's tail>`** — one shared body, three
short engine-specific tails. There are no inline, hand-maintained per-engine
copies of the shared body; that is the D2 anti-drift rule.

## The only tier divergence the writer applies

Per [the tier model SSoT](../../concepts/tier-model.md), the writer's output
is **identical across tiers except**:

1. **Full** additionally writes `ai_router/router-config.yaml` (and
   `budget.yaml` if a verification budget was set). **Lightweight** writes
   neither.
2. The rendered `spec.md` carries `tier: full` or `tier: lightweight`
   accordingly.

The `.venv`, the `pip install dabbler-ai-router`, all three engine files,
`start-here.md`, and the templated `spec.md` are written on **both** tiers.

## Placeholder tokens

Templates use `{{TOKEN}}` placeholders. The shared template writer substitutes
them; any token left unsubstituted in rendered output is a writer bug (and a
snapshot-test failure). Canonical token set:

| Token | Meaning | Example |
|---|---|---|
| `{{REPO_NAME}}` | the consumer repo's name | `my-app` |
| `{{SET_TITLE}}` | human-readable session-set title | `User authentication` |
| `{{PURPOSE}}` | one-sentence purpose of the set | `Add email + password sign-in.` |
| `{{SLUG}}` | full `NNN-`-prefixed set slug | `001-user-authentication` |
| `{{CREATED}}` | ISO date the set was created | `2026-06-09` |
| `{{TIER}}` | `full` or `lightweight` | `lightweight` |
| `{{VERIFICATION_MODE}}` | Lightweight verification mode | `out-of-band-or-none` |
| `{{TOTAL_SESSIONS}}` | planned session count | `3` |

`{{VERIFICATION_MODE}}` defaults to `out-of-band-or-none` and is inert on
Full tier (the field is written for shape uniformity but the router ignores it
on Full). See [`docs/spec-md-schema.md`](../../spec-md-schema.md).

## Repeated session blocks (how `{{TOTAL_SESSIONS}}` is honored)

Two templates contain a **per-session unit that the writer repeats** once for
each session `1..{{TOTAL_SESSIONS}}` — the files on disk show a representative
sample of the unit, not a fixed count:

- **`spec.md.template`** — the `### Session K of {{TOTAL_SESSIONS}}: …` block
  (Goal / Steps / Creates / Touches / Ends with / Progress keys) is the
  repeated unit. The template shows two such blocks to illustrate the unit and
  the `---` separator; the writer emits exactly `{{TOTAL_SESSIONS}}` of them,
  numbered `1..N`, with progress keys keyed `session-00K/…`.
- **`session-state.json.template`** — the object inside the `sessions` array is
  the repeated unit. The template shows one object; the writer emits one
  object per session (`"number": K`, `"title": "Session K"`, all other fields
  at their not-started defaults), so a 3-session set has three objects.

A faithful render is therefore: substitute the scalar tokens, then expand the
two repeated units to `{{TOTAL_SESSIONS}}` instances. The Session-3 snapshot
test asserts the rendered output for a known `{{TOTAL_SESSIONS}}` matches this
contract, so the templates cannot silently drift from a fixed count.

## Rules for editing these templates

- **Never restate the tier *model* (what the tiers mean).** You may describe
  strictly *local operational deltas* — what this writer concretely does on
  each tier (e.g., "Full writes router config; Lightweight doesn't") — but the
  meaning of the tiers is defined once, in
  [`docs/concepts/tier-model.md`](../../concepts/tier-model.md). Rendered
  consumer artifacts link there too (via a GitHub blob URL, since a fresh
  consumer repo does not have this repo's `docs/` tree checked in).
- **Never emit `schemaVersion: 2`, a bare (un-prefixed) slug, or a spec
  missing `tier` / `verificationMode`.** Those are the exact `sessionGenPrompt`
  drift instances this set removes.
<!-- drift-guard:allow-begin (documents the banned-phrase catalogue; see drift_guard.py) -->
- **Keep the banned Lightweight framing out** (`no Python` / `no venv` /
  `docs-only`). The CI drift guard (Session 3) fails the build if it
  reappears in any doc, these templates included.
<!-- drift-guard:allow-end -->
