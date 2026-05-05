# Dabbler AI Orchestration

An AI-led coding-session workflow for VS Code. Manage structured AI
sessions, automatic cross-provider verification, cost tracking, and
git-worktree-aware session-set state — all from the activity bar.

![Session Set Explorer in action](https://raw.githubusercontent.com/darndestdabbler/dabbler-ai-orchestration/master/tools/dabbler-ai-orchestration/media/session-set-explorer-in-action.png)

---

## What you get

- **Sessions, not infinite chats.** Bounded slices of work — one
  session, one orchestrator conversation, one verification, one
  commit. Sessions live inside ordered **session sets** that you and
  the AI co-design before any code is written. The activity-bar tree
  shows what's in flight, what's queued, and what's done.

- **Cost-minded routing.** Every reasoning task (code review,
  analysis, documentation, end-of-session verification) goes through
  the AI router, which picks the cheapest capable model per task and
  escalates only when needed. Real projects we tested measured
  **73% savings vs Opus-only** on a CLI/library project (990 routed
  calls) and **32% savings** on a UI app with UAT/E2E gates (370
  calls). Two sample reports ship in the
  [GitHub repo](https://github.com/darndestdabbler/dabbler-ai-orchestration/tree/master/docs/sample-reports).

- **Cross-provider verification, every session.** Each session ends
  with an independent verification by a model from a *different*
  provider than the one that did the work. The verifier returns
  structured JSON; disagreements surface for human adjudication
  rather than being silently merged or dismissed.

---

## Get started

After install, the Session Set Explorer shows a **Get Started**
welcome the first time you open a workspace with no
`docs/session-sets/` folder. Click **Copy adoption bootstrap prompt**
and paste it into a fresh AI chat (Claude Code, Gemini Code Assist,
or any GPT-based tool). The AI fetches the canonical setup
instructions and walks you through:

1. **A budget-threshold dialog** — pick a tier (zero, under ~$20,
   $20–$99, or $100+) that maps to a verification mode you can
   afford.
2. **A plan alignment** — the AI proposes a session-set
   decomposition based on what you describe.
3. **A numbered action checklist** — *every* intended write, config,
   and scaffolding step is listed. You batch-approve before anything
   touches disk. No per-write confirmation prompts. You can
   interrupt at any time.

Once your first session set exists, the welcome content disappears
and the standard activity-bar tree takes over.

If you'd rather drive the setup from VS Code's UI directly, run
**`Dabbler: Get Started`** from the command palette
(`Ctrl+Shift+P` / `Cmd+Shift+P`) for the wizard alternative.

---

## What it'll cost

API spend is real and varies by project size and verification
appetite. Honest framing:

- **Zero-budget mode** is genuinely free — verification routes
  through a *different* AI assistant you open manually (e.g.
  open a second AI chat as the verifier), or you skip verification
  with the decision logged in the session's `change-log.md`.
- **Low-budget mode** (under ~$20 over multi-week project life)
  uses subscription-based AI assistants for the heavy lifting,
  with API verification only at session end.
- **High-budget mode** ($20+ over project life) uses synchronous
  API calls throughout, with full automation.

The router writes one JSON line per call to
`ai_router/router-metrics.jsonl` so you can audit spend at any
time. The **Cost Dashboard** command surfaces cumulative spend
visually; `python -m ai_router.report` produces a full markdown
manager-report with the Opus-baseline savings headline,
per-task-type unreliability rates, and auto-generated action
items. The framework is open-source (MIT) — your costs are entirely
your provider's API spend; nothing in this extension is paywalled.

---

## Requirements

- **VS Code** 1.85+
- **Python 3.10+** with a workspace `.venv/` (the
  **`Dabbler: Install ai-router`** command auto-detects or creates
  it for you)
- **API keys** as environment variables:
  - `ANTHROPIC_API_KEY` (Claude Sonnet, Opus)
  - `GEMINI_API_KEY` (Gemini Flash, Pro)
  - `OPENAI_API_KEY` (GPT-5.4, GPT-5.4 Mini)
  - All three are required so cross-provider verification has
    somewhere to route to.
- **One orchestrator AI agent** installed as a VS Code extension
  (Claude Code, Codex/GitHub Copilot, or Gemini Code Assist — the
  framework is agent-agnostic and supports switching mid-set).

Optional: `PUSHOVER_API_KEY` + `PUSHOVER_USER_KEY` for
end-of-session phone notifications.

Sign-up links and a full prerequisites checklist live in the
[GitHub repo's README](https://github.com/darndestdabbler/dabbler-ai-orchestration#prerequisites-tools-and-accounts).

---

## Other features

- **Activity-bar views** for Provider Queues and Provider Heartbeats
  — observe outsource-last work in flight and per-provider activity
  at a glance.
- **Cancel/Restore lifecycle** — cancel a session set mid-stream
  with a recorded reason; restore later if priorities shift. The
  audit trail accumulates across cycles.
- **UAT checklist editor integration** — for sets that opt in with
  `requiresUAT: true`, the orchestrator authors a checklist that
  pairs with the freely-available
  [UAT checklist editor](https://darndestdabbler.github.io/uat-checklist-editor/).
  Pending review blocks downstream sessions unless explicitly
  overridden.
- **Worktree auto-discovery** — parallel session sets running in
  sibling git worktrees show up in the activity-bar tree even when
  the worktree isn't open as a separate workspace folder.

---

## Learn more

- **GitHub:** [darndestdabbler/dabbler-ai-orchestration](https://github.com/darndestdabbler/dabbler-ai-orchestration)
- **Workflow mechanics:** [docs/ai-led-session-workflow.md](https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/ai-led-session-workflow.md)
  (trigger phrases, the 10-step procedure, the rule list every
  orchestrator obeys).
- **Repository reference:** [docs/repository-reference.md](https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/repository-reference.md)
  (deep feature descriptions, UAT/E2E flag matrix, worked
  end-of-session output, file map).
- **Sample reports:** [docs/sample-reports/](https://github.com/darndestdabbler/dabbler-ai-orchestration/tree/master/docs/sample-reports)
  (real `python -m ai_router.report` outputs from contrasting
  projects).

---

## License

MIT. Copyright © 2026 darndestdabbler.
