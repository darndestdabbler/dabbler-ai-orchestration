# Dabbler-Prefixed Provider API Key Environment Variables

> **Purpose:** Move built-in provider API key defaults to `DABBLER_`-prefixed
> environment variables so Dabbler routing does not collide with provider-owned
> VS Code extensions that auto-detect generic API key names.
> **Created:** 2026-06-20
> **Session Set:** `docs/session-sets/074-dabbler-provider-env-vars/`
> **Prerequisite:** None
> **Workflow:** Orchestrator -> AI Router -> Cross-provider verification

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: false
requiresE2E: false
pathAwareCritique: none
contractGate: none
```

---

## What the set delivers

- Rename Dabbler's built-in provider API key defaults:
  - `ANTHROPIC_API_KEY` -> `DABBLER_ANTHROPIC_API_KEY`
  - `GEMINI_API_KEY` -> `DABBLER_GEMINI_API_KEY`
  - `OPENAI_API_KEY` -> `DABBLER_OPENAI_API_KEY`
- Update live runtime code, extension detection/warnings, current user docs,
  READMEs, bootstrap templates, tests, and CI dummy variables to the new names.
- Bump and publish `dabbler-ai-router` as a PyPI patch release.

---

## Sessions

### Session 1 of 1: Rename provider env vars and release

**Steps:**
1. Register session start and inventory every live reference to the old provider key names.
2. Update runtime defaults, helpers, extension detection/warnings, current docs/READMEs/templates, fixtures, tests, and CI dummy envs.
3. Bump `dabbler-ai-router` patch metadata and changelog.
4. Run focused Python and TypeScript tests, plus packaging/version checks appropriate for a patch release.
5. Close the set with verification artifacts, commit, push, and trigger the tag-driven PyPI publish (`v0.26.1`) once the target commit is green.

**Creates:** session artifacts under this directory.
**Touches:** provider-env defaults and references across live code/docs/tests.
**Ends with:** old generic provider env-var defaults removed from live surfaces; patch release prepared/published through the repo runbook.