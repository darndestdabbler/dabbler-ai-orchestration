# Quick start — dabbler-ai-orchestration

This framework structures AI-led software development into **session sets** —
bounded bodies of work where an AI coding agent (Claude, Codex, or Gemini)
executes a predefined plan one session at a time, with independent cross-provider
verification at the end of each session. The full reference lives in
[`docs/ai-led-session-workflow.md`](ai-led-session-workflow.md); this document
gets you oriented in five minutes.

> **Starting from a clone?** Follow [`docs/clone-setup.md`](clone-setup.md)
> first. It records the local `.venv`, extension dependencies, provider access,
> and the tracked-versus-machine-local boundary.

---

## One tier, one verification story

Every project runs the same way: the AI router routes reasoning tasks
cost-mindedly, and the **mandatory Step 6 cross-provider verification command
runs on every session** before it closes. The verifier is picked by excluding
the orchestrator's own effective provider, so work is never reviewed by the
model that did it.

The router needs a provider to call. There are two ways to give it one:
**direct provider API keys** (`DABBLER_ANTHROPIC_API_KEY` /
`DABBLER_GEMINI_API_KEY` / `DABBLER_OPENAI_API_KEY`), or an authenticated
**GitHub Copilot CLI seat** (`transport.profile: copilot-cli`) for shops that
hold Copilot subscriptions and no provider keys. Either way you need reach to
**at least two provider families**, or verification has nothing to cross to.

> Set 112 removed a second "Lightweight" adoption tier that opted out of
> routed verification entirely. The Copilot seat profile covers the same
> keyless population without giving verification up. History:
> [`docs/concepts/tier-model.md`](concepts/tier-model.md).

Run **`Dabbler: Set Up New Project`** in VS Code to scaffold, then
**`python -m ai_router.verify_type --set DIRECT_API`** (or `COPILOT_CLI`) to
record what verifies the project on this machine, and
**`python -m ai_router.verify_type --set-env`** to finish setup's second
half; **`Dabbler: Get Started`** opens the
step-by-step companion doc. The scaffold also declares
a `default` module with two starter sets already scaffolded —
`001-default-plan` (create or import your project plan) and
`002-default-decomposition` (turn that plan into your real work sets) — the
Visual Studio `Class1` pattern: run the plan set, then the decomposition
set, then **rename** Default into your first real module once you know your
module names (rename re-homes the work sets; delete instead only when you
have not run them yet — see
[`docs/module-reorganization.md`](module-reorganization.md)). The quick
version of the environment setup:

```bash
python -m venv .venv
.venv/Scripts/pip install dabbler-ai-router   # POSIX: .venv/bin/pip install ...
```

The scaffold also writes `ai_router/router-config.yaml`. Hand-author
`ai_router/budget.yaml` per
[`docs/budget-yaml-schema.md`](budget-yaml-schema.md) — the scaffold has no
budget input and writes no budget file.

> **Without VS Code:** the manual path is the two commands above, then
> copy `router-config.yaml` out of the installed `ai_router`
> package into an `ai_router/` folder at your repo root and hand-create
> `ai_router/budget.yaml` per [`docs/budget-yaml-schema.md`](budget-yaml-schema.md).

---

## Configuring your project

After `pip install dabbler-ai-router` and `Dabbler: Set Up New Project` (or the manual setup above), your project has `ai_router/router-config.yaml`. **`ai_router/budget.yaml` you author yourself** — the palette scaffold has no budget input and deliberately writes no file, so a project with no `budget.yaml` has not declared a verification budget yet. **Edit both as YAML** — Set 123 retired the visual config editor along with every other webview in the extension.

| File | What it holds |
|---|---|
| `ai_router/router-config.yaml` | Outsourcing mode, verification settings, providers and their API-key env-var names, significance flagging, Pushover notifications. Committed. |
| `ai_router/budget.yaml` | Spending threshold, scope (project-lifetime / monthly), warn-at percent. Committed. |
| `ai_router/local-overrides.yaml` | Per-machine *preferences* — **gitignored**. Anything that differs between your machine and a teammate's belongs here, except what verifies the project: Set 124 retired `transport.profile` from this file, and a stale one is refused at config load with the replacement command. |
| `project-verify-type.txt` | **What verifies this project**, `DIRECT_API` or `COPILOT_CLI`. **Gitignored** — machine/project state, answered once per machine, at the repo root — and the router *derives* `transport.profile` from it, so it outranks the `transport.profile` shipped in `router-config.yaml`. Write it with `python -m ai_router.verify_type --set <VALUE>`, which adds the ignore rule before it writes; read what a project currently resolves to with the same command and no flags. |

Provider API keys and Pushover credentials are environment variables, not config values; the config files only name the variables to read.

---

## Minimal session-set scaffold (manual / without VS Code)

If you used the extension's **Build**, you already have runnable starter
sets (the `default` module's plan + decomposition sets above) — skip this.
Setting a repo up **by hand** (no VS Code), create two files before your
first session:

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

## The happy path

A developer runs one session by telling their AI agent:

> "Start the next session of `<slug>`."

The agent then:

1. **Reads the preload** — [`session-constitution.md`](session-constitution.md)
   (the per-session operating doc), `project-guidance.md`,
   `lessons-learned.md`, and its own engine bootstrap file
   (`CLAUDE.md` / `AGENTS.md` / `GEMINI.md`) (Step 0). It does **not** read
   `lessons-archive.md` — that is the never-auto-loaded archive tier
   (Set 064), searched on demand via `ai_router.guidance_search --archive` —
   and it opens the workflow doc, schema doc, close-out doc, and
   authoring guide on demand at their trigger moments (Set 085). The
   lifecycle these files follow is documented in
   [`docs/guidance-lifecycle.md`](guidance-lifecycle.md).
2. **Reads the spec** and the activity log to find its current step; registers
   the session start so the Work Explorer shows the set as in-progress
   (Step 1–3).
3. **Implements** — writes code, edits files, runs builds and tests. Delegates
   reasoning tasks (code review, architecture, analysis) to
   `route(task_type=...)` which selects the right model and logs the cost
   (Steps 4–5).
4. **Verifies** — runs `python -m ai_router.verify_session`, which routes the
   session's output to a verifier from a **different provider** (chosen by
   excluding the orchestrator's model-derived effective provider) for
   independent review. A `VERIFIED` or `ISSUES_FOUND` verdict comes back; the
   agent fixes any Major/Critical issues and re-verifies (Steps 6–7). This is
   mandatory on Full — if the agent reaches close-out unverified,
   `close_session` runs the verification itself (the close backstop).
5. **Closes out** — authors `disposition.json` (the per-session outcome
   record), commits and pushes, runs `python -m ai_router.close_session`,
   and fires a completion notification (Step 8).

The human then starts the next session or approves the set as complete.
Sessions on different sets can run in parallel using worktrees — see
[`docs/planning/repo-worktree-layout.md`](planning/repo-worktree-layout.md).
The mechanical git around the loop is one confirm-gated VS Code command
each — `Dabbler: Open PR for this set`, `Dabbler: Finalize merged set`,
`Dabbler: Cut release tag` (plus hotfix/rollback drills) — working on
both GitHub and Azure DevOps; PR review/approval and the release
decision stay human. Setup and the raw commands each action runs:
[`docs/tutorials/release-and-recovery.md`](tutorials/release-and-recovery.md)
("Git under the hood").

---

## Key files at a glance

| File / directory | What it does |
|---|---|
| `docs/session-constitution.md` | The per-session operating doc: happy path, authority rules, on-demand pointer table (Set 085) |
| `docs/ai-led-session-workflow.md` | On-demand execution reference: full procedure (Steps 0–10), rules, config reference |
| `docs/planning/session-set-authoring-guide.md` | How to write a spec; flag semantics; anti-patterns |
| `docs/budget-yaml-schema.md` | Canonical contract for `ai_router/budget.yaml` (hand-authored) |
| `docs/disposition-schema.md` | Schema for `disposition.json` (required at session close) |
| `ai_router/__init__.py` | `route()` — the public routing entry point |
| `ai_router/close_session.py` | Close-out gate: runs deterministic checks, flips state |
| `ai_router/session_state.py` | Lifecycle snapshot (`session-state.json`) + events ledger |
| `ai_router/router-config.yaml` | Model selection, task types, tier mapping |
| `tools/dabbler-ai-orchestration/` | VS Code extension (Work Explorer) |

---

---

## Run your first session (step by step)

**Setup checklist** — before you run any session, confirm:

- [ ] **Project configured** — run `Dabbler: Set Up New Project`, which
  scaffolds `ai_router/router-config.yaml`, then **hand-author
  `ai_router/budget.yaml`** (see
  [`docs/budget-yaml-schema.md`](budget-yaml-schema.md)) — the palette
  scaffold has no budget input and writes no budget file — and record what
  verifies the project with `python -m ai_router.verify_type --set <VALUE>`
  followed by `python -m ai_router.verify_type --set-env` (that file is
  **gitignored** machine/project state — do not commit it; the second
  command is what finishes setup's other half).
  Without VS Code, create both YAML files by hand and run the same
  `verify_type` commands.
- [ ] **Pick your transport, then set only what it needs.** There are two
  supported populations and neither is a degraded version of the other:
  - **Direct APIs** — set `DABBLER_ANTHROPIC_API_KEY`,
    `DABBLER_GEMINI_API_KEY`, and `DABBLER_OPENAI_API_KEY` in your
    environment. These hold the normal provider-issued keys from Anthropic,
    Google, and OpenAI; only the environment variable names are
    Dabbler-prefixed.
  - **Copilot CLI** — a **GitHub Copilot CLI seat** instead of `DABBLER_*`
    keys. Select it with `python -m ai_router.verify_type --set COPILOT_CLI`
    (then `--set-env`) — the router derives `transport.profile: copilot-cli`
    from the gitignored `project-verify-type.txt` that writes; setting the
    key in `ai_router/local-overrides.yaml` was retired by Set 124 and is
    now refused at config load. Then follow
    [`docs/copilot-seat-setup-checklist.md`](copilot-seat-setup-checklist.md)
    once per machine (install + `copilot login` + the auth-preflight). An
    unauthenticated seat is blocked at session start rather than silently
    faking verification. **Provider API keys are not required, and their
    absence is not an error on this path** — nothing warns about them.

  Optional either way: `PUSHOVER_API_KEY` / `PUSHOVER_USER_KEY` for
  completion notifications.
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

1. Reads the preload — `session-constitution.md`, `project-guidance.md`,
   `lessons-learned.md`, and its own engine bootstrap file (Step 0) —
   **not** `lessons-archive.md`
   (the never-auto-loaded archive tier, Set 064) and **not** the
   on-demand references (workflow doc, schema doc, close-out doc,
   authoring guide), which it opens at their trigger moments.
2. Finds the active session set and calls `register_session_start()` — the
   VS Code Explorer will show the set as in-progress (Step 1–3).
3. Implements the session plan from `spec.md` — writes code, edits files,
   runs `dotnet build` / `pytest` or equivalent (Steps 4–5).
4. Runs `python -m ai_router.verify_session` — routes the output to a
   different-provider verifier (the orchestrator's effective provider is
   excluded) and handles any findings (Steps 6–7).
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
- **Your very first run, in 15 minutes:** [Hello World](tutorials/hello-world.md)
  — a local sample project, no git host and no git commands for you to type,
  using whichever AI coding agent you already have open.
- **Your first module (one person, one module):** the hands-on
  [adoption walkthrough](tutorials/adopt-dabbler.md) — GitHub + GitHub Copilot
  CLI worked end to end, with Azure DevOps and direct-provider-API variants
  inline; concepts in the [primer](planning/module-organized-projects-primer.md).
- **Several modules composed over a contract (solo or as a team):**
  [Three modules, one pipeline](tutorials/three-module-pipeline.md) — the
  dependency DAG, testing a module with none of its dependencies running,
  ownership routing across code roots, and swapping in somebody else's
  implementation by configuration alone.
- **Releasing, hotfixing, rolling back:**
  [`docs/tutorials/release-and-recovery.md`](tutorials/release-and-recovery.md).
- **Writing a spec:** [`docs/planning/session-set-authoring-guide.md`](planning/session-set-authoring-guide.md).
- **Setting up a new project:** `Dabbler: Set Up New Project`, then `python -m ai_router.verify_type --set <VALUE>` and `python -m ai_router.verify_type --set-env`; without VS Code, the manual-setup note under [One tier, one verification story](#one-tier-one-verification-story) above.
- **UAT checklists, outsource-last, adjudication, advanced flags:** Reference section of the workflow doc — only read what applies to your set's configuration.
