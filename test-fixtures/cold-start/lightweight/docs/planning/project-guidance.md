# Project Guidance — `acme-app`

> **Purpose:** The single source of truth for durable strategic commitments
> (Principles) and specific rules and patterns (Conventions) that apply to
> this repo.
>
> **Note:** Replace every `TODO` section below with repo-specific content.

Read this file before every AI-led session. Use it as the first-stop reference
before changing architecture, testing strategy, or workflow assets.

The file has two top-level sections:
- **Principles** — durable strategic commitments (the *why* and *what*). Slow
  to change; every principle should explain the reasoning behind itself.
- **Conventions** — specific rules, patterns, values, and code styles (the
  *how*). Faster to change; often promoted from successful lessons.

This file is part of the **guidance lifecycle** — it is always loaded at session
start and is capped by `guidance.project_guidance_ceiling_tokens` (default 6,000
tokens) as a backstop. It is smaller and higher-signal than `lessons-learned.md`
by design, so it gets a ceiling but **not** an archive split. Check current
overhead with `python -m ai_router.guidance_report`. The lifecycle reference is
<https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/guidance-lifecycle.md>.

---

## Principles

### Architecture

> **TODO:** Add durable architectural principles for this repo.
> Examples: primary data store, language/runtime, key boundaries between layers.

### Testing

> **TODO:** Add testing strategy principles.
> Examples: hermetic vs. integration, coverage expectations, CI/CD gating.

### Security and Auth

> **TODO:** Add security and auth principles if applicable.

---

## Conventions

### Code Style

> **TODO:** Add code style conventions (naming, formatting, nullable, async
> suffix, file layout, terminal-output encoding rules, etc.).

### Workflow Expectations

- Before every session, read this file and `docs/planning/lessons-learned.md`.
  Do **not** read `docs/planning/lessons-archive.md` — it is the
  never-auto-loaded archive tier, searched on demand with
  `python -m ai_router.guidance_search --archive`, never loaded into context.
  When authoring a spec, consult the canonical
  [session-set authoring guide](https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/planning/session-set-authoring-guide.md)
  (a fresh repo has no local copy of it).
- Save verifier output raw and never edit saved verification artifacts after
  they are written.
- Log every AI-led session step in the active session set.
- **Session-state.json is the single source of truth for in-progress
  detection.** Call `register_session_start()` at Step 1 before the first
  `log_step()`, and `mark_session_complete()` at Step 8.
- **Author `ai-assignment.md` and the next-orchestrator / next-session-set
  recommendations via routed analysis — never self-opine.**
- **Obey the spec's Session Set Configuration block at runtime.** Rules are
  conditional on the spec's `requiresUAT` and `requiresE2E` flags.
- When a failure reveals a reusable strategy, recommend a corresponding update
  to `docs/planning/lessons-learned.md` (with its metadata trailer). When a
  lesson has proven itself across two or more contexts, propose promoting it
  here — promotion is orthogonal to archival.

### Build and Test

> **TODO:** Add build and test commands, gating rules, and CI/CD expectations.
