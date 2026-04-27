# Project Guidance — dabbler-ai-orchestration

> **Purpose:** The single source of truth for durable strategic commitments
> (Principles) and specific rules and patterns (Conventions) that apply to
> this repo.
>
> **Note for consumer repos:** When bootstrapping a new AI-led-workflow repo
> from this template, replace all `TODO` sections with repo-specific content.

Read this file before every AI-led session. Use it as the first-stop reference
before changing architecture, testing strategy, or workflow assets.

The file has two top-level sections:
- **Principles** — durable strategic commitments (the *why* and *what*). Slow
  to change; every principle should explain the reasoning behind itself.
- **Conventions** — specific rules, patterns, values, and code styles (the
  *how*). Faster to change; often promoted from successful lessons.

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
> suffix, file layout, etc.).

### Workflow Expectations

- Before every session, read this file, `docs/planning/lessons-learned.md`,
  and `docs/planning/session-set-authoring-guide.md`. The authoring guide
  is the source of truth for *spec* authoring (slug naming, sizing, the
  Session Set Configuration block); `docs/ai-led-session-workflow.md`
  remains the source of truth for *execution* mechanics.
- Save verifier output raw and never edit session-review files after they are
  written.
- Log every AI-led session step in the active session set.
- AI instruction documents (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`) reference
  this file and `docs/ai-led-session-workflow.md` so future agent runs inherit
  the same durable expectations.
- **Session-state.json is the single source of truth for in-progress
  detection.** Call `register_session_start()` at Step 1 before the first
  `log_step()`, and `mark_session_complete()` at Step 8.
- **Author `ai-assignment.md` and the next-orchestrator / next-session-set
  recommendations via routed analysis — never self-opine.**
- **Obey the spec's Session Set Configuration block at runtime.** Rules are
  conditional on the spec's `requiresUAT` and `requiresE2E` flags. Do not
  re-litigate those flags during a session — if a flag is wrong, surface it
  at the Step 9 reorganization review.
- When the human gives a session instruction or decision that appears durable
  enough to guide future sessions, ask whether it should be incorporated here.
- When a failure reveals a reusable strategy, recommend a corresponding update
  to `docs/planning/lessons-learned.md`.

### Build and Test

> **TODO:** Add build and test commands, gating rules, and CI/CD expectations.
> Example (harvester): `dotnet build && dotnet test` (sequential, not parallel,
> to avoid file-lock contention on Windows).
