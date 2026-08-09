# Consumer-bootstrap template bundle

> **Durable source of truth for everything the extension scaffolds into a
> new consumer repo.** Per the Set 058 design lock (D7/D8), the code paths
> (`gitScaffold`, `sessionGenPrompt`, the Get Started wizard) materialize
> artifacts on every path, but **these template files are the durable
> source.** A shared template writer (Session 2) renders them; CI snapshot
> tests (Session 3) assert that the generated stubs match what these files
> render, so a stale generated stub cannot silently reappear.

## What is in this bundle

| Template file | Renders to (in the consumer repo) |
|---|---|
| [`spec.md.template`](spec.md.template) | `docs/session-sets/<NNN-slug>/spec.md` |
| [`session-state.json.template`](session-state.json.template) | `docs/session-sets/<NNN-slug>/session-state.json` (schemaVersion 4, `status: not-started`) |
| [`start-here.md.template`](start-here.md.template) | `docs/dabbler/start-here.md` |
| [`getting-started.md.template`](getting-started.md.template) | `docs/dabbler/getting-started.md` — the static Getting Started teaching doc (Set 060 D8). **Token-free by design** so the bundled copy can be opened in the editor before any scaffold has run. |
| [`engine-file.shared-body.md`](engine-file.shared-body.md) | the shared body of all three engine files |
| [`engine-file.claude-tail.md`](engine-file.claude-tail.md) | the `CLAUDE.md` bootstrap tail |
| [`engine-file.agents-tail.md`](engine-file.agents-tail.md) | the `AGENTS.md` bootstrap tail |
| [`engine-file.gemini-tail.md`](engine-file.gemini-tail.md) | the `GEMINI.md` bootstrap tail |
| [`lessons-learned.md.template`](lessons-learned.md.template) | `docs/planning/lessons-learned.md` — the always-loaded **active** guidance tier with the per-lesson metadata-trailer convention (Set 064 D7) |
| [`project-guidance.md.template`](project-guidance.md.template) | `docs/planning/project-guidance.md` — Principles/Conventions skeleton, ceiling-aware (Set 064 D7) |
| [`lessons-archive.md.template`](lessons-archive.md.template) | `docs/planning/lessons-archive.md` — the never-auto-loaded **archive** tier, seeded empty (Set 064 D7) |
| [`cross-provider-verification.md.template`](cross-provider-verification.md.template) | `docs/dabbler/cross-provider-verification.md` — the engine-facing advisory-review instructions (Set 077 S4); also ensure-written idempotently before any Evaluate pointer prompt |
| [`CODEOWNERS.template`](CODEOWNERS.template) | `.github/CODEOWNERS` — the module-ownership teaching template: worked three-person example + the integration `touches` review rule (Set 087 S3). **Token-free and comment-only** — inert until adapted to `docs/modules.yaml` |
| [`monorepo-ci.yml.template`](monorepo-ci.yml.template) | `.github/workflows/monorepo-ci.yml` — monorepo CI teaching template: commented path-scoped per-module jobs + the ACTIVE all-module guardrail job on every merge to `main` (its placeholder step succeeds, so the unadapted file never breaks a build) (Set 087 S3). **Token-free** |
| [`module-plan-set.spec.md.template`](module-plan-set.spec.md.template) | a `kind: plan` module-lifecycle set's `spec.md` (Set 098 S2) — the single source of truth, rendered directly (via `resolveModuleLifecycleTemplatesDir` + `{{TOKEN}}` substitution, no `BootstrapContext`/`TemplateBundle` coupling) by `renderModulePlanSetSpec` in `scaffoldModuleLifecycleSets` (`src/utils/moduleAuthoring.ts`) |
| [`module-decomposition-set.spec.md.template`](module-decomposition-set.spec.md.template) | a `kind: decomposition` module-lifecycle set's `spec.md` (Set 098 S2), `prerequisites:`-linked to its sibling plan set — same resolver, rendered by `renderModuleDecompositionSetSpec` |

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
| `{{MODULE_LINE}}` | the whole `module:` config line (module-targeted sets only, Set 087 S3) | `module: greeter  # grouping only — …` + newline |
| `{{TOTAL_SESSIONS}}` | planned session count | `3` |

`{{MODULE_LINE}}` is a **whole-line** token (Set 087 S3): when the
context carries a module slug (a module-targeted decomposition) the writer
fills the full `module: <slug>` line + newline; otherwise the empty string,
so a repo with no module manifest renders byte-identical pre-087 output (the
token sits flush against the next template line, leaving no blank-line
residue). `module` is a grouping attribute only — session-set names stay
globally unique across all modules. See
[`docs/spec-md-schema.md`](../../spec-md-schema.md).

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

- **Never restate a concept these templates only *use*.** Canonical
  definitions live once, in this repo's `docs/`; rendered consumer artifacts
  link there via a GitHub blob URL (a fresh consumer repo does not have this
  repo's `docs/` tree checked in).
- **Never emit `schemaVersion: 2` or a bare (un-prefixed) slug.** Those are
  the exact `sessionGenPrompt` drift instances Set 058 removed.
- **Never re-introduce a `tier:` or `verificationMode:` field.** Set 112
  deleted the Lightweight tier; a spec declaring `tier: lightweight` is
  refused by the router's loader, and a template that re-seeds either field
  would hand every new consumer repo a spec that cannot run.
