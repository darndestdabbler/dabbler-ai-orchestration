# Dabbler AI Orchestration

An AI-led coding-session workflow for VS Code. Structured AI sessions
with cross-provider verification, automatic cost tracking, git-
worktree-aware session-set state, and a Session Set Explorer in the
activity bar.

![Session Set Explorer in action](tools/dabbler-ai-orchestration/media/session-set-explorer-in-action.png)

---

## What this repo is for

The framework treats AI coding work as a sequence of **sessions** —
bounded slices that run to completion in one orchestrator
conversation, end with a verification + commit, and stop. A
**session set** is an ordered chain of sessions that delivers one
feature, refactor, or aspect of the solution. Each set lives at
`docs/session-sets/<slug>/` with a small predictable shape (`spec.md`,
`session-state.json`, `activity-log.json`, `change-log.md`).

Inside each session, the **orchestrator** (Claude Code, Codex,
GitHub Copilot, or Gemini Code Assist) does mechanics — file edits,
shell, git — and dispatches every reasoning task (code review,
security review, analysis, architecture, documentation, test
generation, end-of-session verification) through `ai_router.route()`.
The router picks the cheapest capable model per task type, escalates
on poor responses, and runs cross-provider verification by a
**different provider** to catch provider-specific blind spots.

Every routed call is appended to `ai_router/router-metrics.jsonl`, so
per-set, per-task, and per-model spend is fully auditable. The
Session Set Explorer extension is the at-a-glance companion: it reads
the same files the router writes and renders three groups in the
activity bar (**In Progress**, **Not Started**, **Done**), with
worktree auto-discovery so parallel sessions surface across sibling
workspaces. Full execution mechanics live at
[docs/ai-led-session-workflow.md](docs/ai-led-session-workflow.md);
deeper feature descriptions live at
[docs/repository-reference.md](docs/repository-reference.md).

---

## Highlights

- **Session sets and sessions** — Work is organized into bounded
  sessions inside ordered session sets, each with its own folder of
  artifacts the extension reads to render the activity-bar inventory.
  [Deep dive](docs/repository-reference.md#1-work-is-organized-into-session-sets-and-sessions).
- **Cost-minded orchestration** — The router routes each task to the
  cheapest capable tier, escalates on poor responses, and uses a
  per-task-type effort overrides. Real metrics from contrasting
  projects show **73% savings vs Opus-only** on a CLI/library project
  (990 calls) and **32% savings** on a full-stack UI app with UAT/E2E
  gates (370 calls) — see
  [docs/sample-reports/](docs/sample-reports/) for the full reports.
  [Deep dive](docs/repository-reference.md#2-cost-minded-orchestration).
- **Cross-provider verification** — Every session ends with a
  mandatory independent verification by a model from a different
  provider. The verifier returns structured JSON
  (`{"verdict": "VERIFIED" | "ISSUES_FOUND", "issues": [...]}`); the
  orchestrator surfaces disagreements for human adjudication rather
  than self-resolving.
  [Deep dive](docs/repository-reference.md#3-cross-provider-verification).
- **Git integration + parallel session sets** — Every session ends
  with `git add -A && git commit && git push`. Multiple session sets
  can run in parallel via isolated git worktrees on
  `session-set/<slug>` branches, with the last session merging back
  into main cleanly.
  [Deep dive](docs/repository-reference.md#4-git-integration-and-parallel-session-sets).
- **Robust fallbacks** — Tier escalation on empty/truncated/refused
  responses; two-attempt verifier fallback when a provider's HTTPS
  layer fails; documented escalation ladder if both verifier
  attempts fail. The work is preserved in git for human review
  either way.
  [Deep dive](docs/repository-reference.md#5-batching-and-robust-fallbacks).
- **UAT + E2E support (opt-in)** — Repos that flag `requiresUAT: true`
  and/or `requiresE2E: true` get a UAT checklist with E2E pre-
  screening; functional checklist items must have matching Playwright
  coverage before the human is asked to review. No-UI repos default to
  the universal core (build, test, verify, commit) with no UAT/E2E
  surface area.
  [Deep dive](docs/repository-reference.md#uat-and-e2e-support-when-to-opt-in).

---

## Quick start

1. **Install the extension** from the VS Code Marketplace:
   - VS Code → **Extensions** view (`Ctrl+Shift+X`) → search
     `Dabbler AI Orchestration` → **Install**.
   - Or from a terminal: `code --install-extension DarndestDabbler.dabbler-ai-orchestration`.
   - Or directly from the
     [Marketplace listing](https://marketplace.visualstudio.com/items?itemName=DarndestDabbler.dabbler-ai-orchestration).
   - Offline / firewall fallback: the most recent VSIX is committed at
     [`tools/dabbler-ai-orchestration/dabbler-ai-orchestration-0.13.2.vsix`](tools/dabbler-ai-orchestration/dabbler-ai-orchestration-0.13.2.vsix);
     **Extensions → ... → Install from VSIX...** picks it up.
2. **Open your workspace.** Any folder with — or destined for — a
   `docs/session-sets/` directory. The activity-bar **Session Set
   Explorer** icon appears automatically once that path is present.
3. **Run `Dabbler: Install ai-router`** from the command palette
   (`Ctrl+Shift+P`). The command auto-detects (or offers to create)
   a workspace `.venv/`, runs `pip install dabbler-ai-router` inside
   it, and materializes `ai_router/router-config.yaml` for tuning.

Then **set API keys** as environment variables (one-time):
`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY` — the
[Prerequisites](#prerequisites-tools-and-accounts) section below has
the sign-up links and notes which providers are required.

Subsequent updates: **`Dabbler: Update ai-router`** from the command
palette.

> **CLI fallback** — `python -m venv .venv && .venv/Scripts/pip install dabbler-ai-router`,
> then `from ai_router import route` from your orchestrator script.

---

## For new projects: adoption bootstrap

If you're starting a new project — greenfield, an existing local
project that hasn't yet adopted the workflow, or a remote repo you
want to clone in — the recommended starting point is
**`Dabbler: Copy adoption bootstrap prompt`** from the command palette.
The command copies a short engine-agnostic prompt to your clipboard
that you paste into a fresh AI chat (Claude Code, Gemini Code Assist,
or any GPT-based tool). The AI then fetches the canonical online
instructions at
[docs/adoption-bootstrap.md](docs/adoption-bootstrap.md) and runs an
interactive flow: detect your workspace state, run a budget-threshold
dialog, propose a session-set decomposition, present a numbered
checklist of every intended write / config / scaffolding action for
batch approval before executing. No per-write prompts; you can
interrupt at any time. The four-tier budget mapping is documented in
[docs/ai-led-session-workflow.md → Cost-budgeted verification modes](docs/ai-led-session-workflow.md#cost-budgeted-verification-modes).

This entry point sits *before* the
[Quick start](#quick-start) above for greenfield work — the bootstrap
flow installs the router, scaffolds the folders, authors
`docs/planning/project-plan.md` and your first session-set specs, and
saves your budget threshold to `ai_router/budget.yaml` as part of its
action checklist.

---

## Prerequisites: tools and accounts

You need **VS Code**, at least one **orchestrator agent** installed as
a VS Code extension, and **API-key accounts** for all three model
providers (the router calls all three so cross-provider verification
has somewhere to route to).

### VS Code

- **Download:** [code.visualstudio.com](https://code.visualstudio.com/)
- **Getting-started docs:**
  [code.visualstudio.com/docs](https://code.visualstudio.com/docs) —
  the Extensions view (`Ctrl+Shift+X`) is what you'll use to install
  the Session Set Explorer in the [Quick start](#quick-start) above.

### Orchestrator agents (install at least one)

Pick whichever AI agent you want to drive sessions; the framework is
provider-agnostic and you can switch mid-set.

- **Claude Code (Anthropic)** — reads [CLAUDE.md](CLAUDE.md). Install
  via [claude.com/product/claude-code](https://www.claude.com/product/claude-code);
  docs at [docs.claude.com/en/docs/claude-code/overview](https://docs.claude.com/en/docs/claude-code/overview).
- **Codex (OpenAI)** — reads [AGENTS.md](AGENTS.md). See
  [openai.com/codex](https://openai.com/codex/) and the open-source
  CLI repo at [github.com/openai/codex](https://github.com/openai/codex).
- **GitHub Copilot** — reads [AGENTS.md](AGENTS.md). See
  [github.com/features/copilot](https://github.com/features/copilot);
  Marketplace listing at [GitHub.copilot](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot).
- **Gemini Code Assist (Google)** — reads [GEMINI.md](GEMINI.md). See
  [codeassist.google](https://codeassist.google/) (free tier
  available); docs at [cloud.google.com/gemini/docs/codeassist/overview](https://cloud.google.com/gemini/docs/codeassist/overview).

### API keys (all three required)

The router calls all three providers and cross-provider verification
needs at least two providers live to be meaningful. Expect to set up
all three.

- `ANTHROPIC_API_KEY` — [console.anthropic.com](https://console.anthropic.com/)
  (Settings → API Keys, requires billing).
- `GEMINI_API_KEY` — [aistudio.google.com](https://aistudio.google.com/)
  (Get API key in the left rail; free tier is generous).
- `OPENAI_API_KEY` — [platform.openai.com](https://platform.openai.com/)
  (create a project, add a payment method, mint a key).

Set each as a Windows User environment variable; macOS / Linux export
them in your shell profile. Optionally,
[pushover.net](https://pushover.net/)'s `PUSHOVER_API_KEY` and
`PUSHOVER_USER_KEY` enable end-of-session phone notifications — if
unset, the orchestrator skips the notify and prints to console as
usual.

---

## More

For technical reference (deep feature descriptions, the UAT/E2E flag
matrix, a worked end-of-session output example, and the repository
file map), see
[docs/repository-reference.md](docs/repository-reference.md).

For runtime mechanics (trigger phrases, the 10-step procedure, the
authoritative rule list every orchestrator obeys), see
[docs/ai-led-session-workflow.md](docs/ai-led-session-workflow.md).

For sample manager-report output from real projects at scale, see
[docs/sample-reports/](docs/sample-reports/).

---

## License

This repo is released under the **MIT License**. See [LICENSE](LICENSE)
for the full text. Copyright © 2026 darndestdabbler.

> A duplicate `LICENSE` lives at
> [tools/dabbler-ai-orchestration/LICENSE](tools/dabbler-ai-orchestration/LICENSE)
> alongside the extension's `package.json`. The duplication is required:
> `vsce package` expects the file beside the manifest and has no flag
> to point elsewhere. Both files must be kept in sync.
