# Quick start — dabbler-ai-orchestration

This framework structures AI-led software development into **session sets** —
bounded bodies of work where an AI coding agent (Claude, Codex, or Gemini)
executes a predefined plan one session at a time, with independent cross-provider
verification at the end of each session. The full reference lives in
[`docs/ai-led-session-workflow.md`](ai-led-session-workflow.md); this document
gets you oriented in five minutes.

---

## Two adoption paths

**Lightweight** — VS Code Session Set Explorer + `docs/session-sets/*/spec.md`
files only. No Python, no router, no close-out script. Useful for organizing
AI-led work without taking on verification infrastructure.

**Full** — Everything in Lightweight plus the `ai_router` Python package:
cost-tracked routing, cross-provider verification at session end, automated
close-out gates, and metrics. Two active consumer repos use Full:
`dabbler-platform` and `dabbler-access-harvester`.

The [adoption bootstrap](adoption-bootstrap.md) walks you through the setup
interactively. The quick version:

```bash
# Full tier — install the router
pip install dabbler-ai-router          # or: pip install -e . from repo root
```

No install is needed for Lightweight.

---

## Minimal session-set scaffold

Create two files before your first session:

**`docs/session-sets/001-my-first-set/spec.md`** — the session plan:

~~~markdown
# My first feature

> **Purpose:** One-sentence description of what this set delivers.
> **Created:** 2026-05-11
> **Session Set:** `docs/session-sets/001-my-first-set/`
> **Prerequisite:** None
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

---

## Session Set Configuration

```yaml
totalSessions: 1
requiresUAT: false
requiresE2E: false
```

---

## What the set delivers

- Deliverable 1 (e.g., a new API endpoint)
- Deliverable 2 (e.g., unit tests for the endpoint)

---

## Sessions

### Session 1 of 1: Implement and close

**Steps:**
1. Read the spec and register session start.
2. Implement the feature.
3. Run tests.
4. Verify and close out.

**Creates:** list new files here
**Touches:** list modified files here
**Ends with:** tests green; feature shipped; session closed.
~~~

**`docs/session-sets/001-my-first-set/activity-log.json`** — the step log
(the close-out gate checks that this file has at least one entry for the
current session number; the agent writes entries as it works):

```json
{
  "sessionSetName": "001-my-first-set",
  "createdDate": "2026-05-11T10:00:00-04:00",
  "totalSessions": 1,
  "entries": []
}
```

See the [authoring guide](planning/session-set-authoring-guide.md) for the full
`spec.md` structure and common anti-patterns. Two flags you will almost never
need for a simple set: `uatStyle` and `uatScope` — only relevant when
`requiresUAT: true`.

---

## The happy path — Full tier

A developer runs one session by telling their AI agent:

> "Start the next session of `<slug>`."

The agent then:

1. **Reads guidance** — `project-guidance.md`, `lessons-learned.md`,
   `session-set-authoring-guide.md` (Step 0).
2. **Reads the spec** and the activity log to find its current step; registers
   the session start so the VS Code Explorer shows the set as in-progress
   (Step 1–3).
3. **Implements** — writes code, edits files, runs builds and tests. Delegates
   reasoning tasks (code review, architecture, analysis) to
   `route(task_type=...)` which selects the right model and logs the cost
   (Steps 4–5).
4. **Verifies** — routes the session's output to a *different* AI provider for
   independent review via `route(task_type="session-verification")`.
   A `VERIFIED` or `ISSUES_FOUND` verdict comes back. The agent fixes any
   Major/Critical issues and re-verifies (Steps 6–7).
5. **Closes out** — authors `disposition.json` (the per-session outcome
   record), commits and pushes, runs `python -m ai_router.close_session`,
   and fires a completion notification (Step 8).

The human then starts the next session or approves the set as complete.
Sessions on different sets can run in parallel using worktrees — see
[`docs/planning/repo-worktree-layout.md`](planning/repo-worktree-layout.md).

---

## Key files at a glance

| File / directory | What it does |
|---|---|
| `docs/ai-led-session-workflow.md` | Full session procedure (Steps 0–10), rules, config reference |
| `docs/planning/session-set-authoring-guide.md` | How to write a spec; flag semantics; anti-patterns |
| `docs/adoption-bootstrap.md` | Interactive onboarding script for new projects |
| `docs/disposition-schema.md` | Schema for `disposition.json` (required at session close) |
| `ai_router/__init__.py` | `route()` — the public routing entry point |
| `ai_router/close_session.py` | Close-out gate: runs deterministic checks, flips state |
| `ai_router/session_state.py` | Lifecycle snapshot (`session-state.json`) + events ledger |
| `ai_router/router-config.yaml` | Model selection, task types, tier mapping |
| `tools/dabbler-ai-orchestration/` | VS Code extension (Session Set Explorer, Cost Dashboard) |

---

---

## Run your first session (step by step)

**Full-tier setup checklist** — before you run any session, confirm:

- [ ] **Adoption bootstrap completed** — run the [adoption bootstrap](adoption-bootstrap.md)
  or manually create `ai_router/router-config.yaml` and `ai_router/budget.yaml`.
  The bootstrap is the recommended path; it sets budget, outsource mode, and
  provider keys interactively.
- [ ] **Provider API keys set** — `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, and
  `OPENAI_API_KEY` must be in your environment for the cross-provider
  verification step (`route(task_type="session-verification")`) to work.
  Optional: `PUSHOVER_API_KEY` / `PUSHOVER_USER_KEY` for completion notifications.
- [ ] **Instruction file present** — your repo needs a provider-specific
  instruction file (`CLAUDE.md` for Claude Code, `AGENTS.md` for Codex,
  `GEMINI.md` for Gemini Code Assist) at the repo root. This repo's own
  instruction files are the reference — adapt them for your project.

Prerequisites — before starting a session your repo needs:

- A session set folder: `docs/session-sets/<slug>/`
- A `spec.md` in that folder with the Session Set Configuration block
- An `activity-log.json` with the session-set name and an empty `entries: []`
- `ai_router` installed: `pip install -e .` from the repo root

**Human action:** open your AI agent (Claude Code, Codex, Gemini Code Assist)
and say:

> "Start the next session of `<slug>`."

**What the agent does (you watch, approve, or redirect):**

1. Reads `project-guidance.md`, `lessons-learned.md`, and
   `session-set-authoring-guide.md` (Step 0).
2. Finds the active session set and calls `register_session_start()` — the
   VS Code Explorer will show the set as in-progress (Step 1–3).
3. Implements the session plan from `spec.md` — writes code, edits files,
   runs `dotnet build` / `pytest` or equivalent (Steps 4–5).
4. Routes the output to a cross-provider verifier via
   `route(task_type="session-verification")` and handles any findings
   (Steps 6–7).
5. Authors `docs/session-sets/<slug>/disposition.json` ([schema](disposition-schema.md)),
   commits and pushes, then runs:
   ```bash
   python -m ai_router.close_session --session-set-dir docs/session-sets/<slug>
   ```
   (Step 8). On success the set's `session-state.json` flips to `closed`.

**How to tell it worked:**

- `session-state.json` has `"status": "complete"` and `"lifecycleState": "closed"`.
- `session-events.jsonl` ends with a `closeout_succeeded` event.
- `activity-log.json` has at least one entry for the session number.
- A commit exists on the remote branch.

**Common first-time failures:**

| Symptom | Fix |
|---|---|
| `CloseoutGateFailure: disposition_present` | The agent forgot to write `disposition.json` — see [`docs/disposition-schema.md`](disposition-schema.md). |
| `gate activity_log_entry failed` | `activity-log.json` needs an `entries: []` top-level list — see Set 018 as an example. |
| Verifier returns `ISSUES_FOUND` | The agent will fix Major/Critical findings and re-verify. If it can't resolve, it surfaces the issue for your decision. |

---

## Where to go next

- **Session procedure in full:** [`docs/ai-led-session-workflow.md`](ai-led-session-workflow.md) — Steps 0–10, rules, config flags. Use the quick-nav at the top to jump past the UAT reference material for simple sessions.
- **Writing a spec:** [`docs/planning/session-set-authoring-guide.md`](planning/session-set-authoring-guide.md).
- **Setting up a new project:** [`docs/adoption-bootstrap.md`](adoption-bootstrap.md) (or paste the extension's "Copy adoption bootstrap prompt" into any AI chat).
- **UAT checklists, outsource-last, adjudication, advanced flags:** Reference section of the workflow doc — only read what applies to your set's configuration.
