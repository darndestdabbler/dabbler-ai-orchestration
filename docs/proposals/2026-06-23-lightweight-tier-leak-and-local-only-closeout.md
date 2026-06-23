# Proposal: fix the Lightweight-tier leak and support local-only close-out

**Date:** 2026-06-23
**Status:** Draft — diagnosis from a consumer-repo incident
**Audience:** Dabbler AI orchestration maintainers
**Scope:** the "Dabbler AI Orchestration" VS Code extension (Getting Started
form → session-set decomposition prompt) and `ai_router` close-out gates

---

## Problem

A consumer repo was scaffolded as **Lightweight** but every generated `spec.md`
declared `tier: full`. The orchestrator therefore ran the Full lifecycle, and
because the project is deliberately **local-only** (no git remote, by operator
decision), the Full close-out gate `check_pushed_to_remote` could never pass —
so every session close fell back to `--force` with a standing reason file,
stamping `forceClosed: true` / `[FORCED]` on otherwise-clean work.

Two independent defects combined to produce this:

1. **A tier leak** — the operator's Lightweight selection did not reach
   spec generation, so the specs silently defaulted to Full.
2. **No local-only close path** — a repo that will never have a remote has no
   first-class way to satisfy (or waive) the push gate; the only escape is
   `--force`, which is meant for incident recovery, not steady state.

---

## Evidence (observed)

- The affected repo's install was Lightweight-shaped: **no `ai_router/` folder
  and no `router-config.yaml` in the workspace** (the Lightweight scaffold omits
  the router config; the router is pip-installed into `.venv`). So step 1 (Build
  structure) received `tier: lightweight`.
- Every generated `docs/session-sets/*/spec.md` nonetheless declared
  `tier: full`, each with a fabricated rationale line — *"Full tier per the
  operator's … selection."* → step 3 (Build session sets) generated specs as
  Full.
- `.dabbler/` recorded the install method but **no tier marker**.
- The first session closed via `closeout_force_used` with a standing
  "local-only" reason; `verification_method: "skipped"`, `verificationVerdict:
  null`.

---

## Defect 1 — the tier leak (extension)

### Root cause

The tier choice is **ephemeral**. It lives only in the webview's in-memory
`gsState`, which initializes to `tier: "full"`
(`media/session-sets-tree/client.js`) and is never persisted to a durable
marker. Two steps consume it independently:

- **Build structure** (`buildProjectStructureNoPrompt`) consumes the radio at
  click time and produces a correctly Lightweight-shaped scaffold.
- **Build session sets** (`copySessionSetGenPrompt` → `buildSessionGenPrompt`)
  re-reads only the volatile radio. `buildSessionGenPrompt` falls back to
  `options.tier ?? "full"` (`wizard/sessionGenPrompt.ts`), so when the rider is
  absent it renders the worked exemplar as **Full** and **omits** the
  "author each set with `tier: lightweight`" guidance line entirely.

`gsState` resets to `"full"` on any window reload — and `buildStructure`
reopens the window via `vscode.openFolder` in the folder-picker path — so the
radio reverts to the Full default before step 3 unless the operator re-ticks
Lightweight. **Nothing reconciles the decomposition prompt against the
already-scaffolded tier.** The webview→host plumbing is correct
(`build-session-sets` does post `msg.tier`); the bug is the lack of a durable,
authoritative tier source.

### Proposed fix

1. **Persist the tier at scaffold time** — write a durable marker (e.g.
   `.dabbler/tier`) next to `.dabbler/install-method` from
   `buildProjectStructureNoPrompt`.
2. **Read the persisted tier in `copySessionSetGenPrompt`** (preferring it over
   the volatile radio; fall back to inferring Lightweight from the absence of
   `ai_router/router-config.yaml`). The decomposition prompt should never
   silently default to Full when the repo is demonstrably Lightweight.
3. **Stop the planner confabulating a tier rationale** — the prompt currently
   invites a "per the operator's selection" justification the planner cannot
   actually know; either supply the true tier or instruct it not to assert one.
4. Optionally surface a mismatch (scaffold tier ≠ spec tier) as a tree advisory,
   reusing the existing tier-marker channel.

---

## Defect 2 — local-only close-out (`ai_router`)

> This defect is the subject of session set
> `076-local-only-closeout-mode`.

### Root cause

`check_pushed_to_remote` (`ai_router/gate_checks.py`) treats a missing upstream
as a configuration error and fails. It runs on **both** tiers — only `--force`
skips gates entirely (`close_session.py`), not `--no-router`. There is no
config to waive just this gate, so a deliberately-local repo must `--force`
every close.

### Proposed fix

Add a first-class **local-only** signal that converts the push gate to a soft,
passing skip (with a note in `gate_results`) rather than a failure — e.g. a
`.dabbler/local-only` marker, or a `local_only: true` key the gate reads. This
removes the `[FORCED]` noise from steady-state closes while keeping `--force`
reserved for true incident recovery. Because the gate is tier-independent, this
is **not** fixed by Defect 1 alone — a Lightweight local-only repo still needs
it.

---

## Recommendation

Author session sets implementing both fixes (extension + `ai_router`), each with
a regression fixture. Defect 1 prevents recurrence; Defect 2 makes the
local-only workflow clean for any remote-less repo. Defect 2 is scoped into
`076-local-only-closeout-mode`; Defect 1 (the extension tier leak) remains open
and should follow in its own set.
