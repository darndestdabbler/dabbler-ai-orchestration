# Dabbler AI Orchestration

An AI-led workflow extension for VS Code. Manage structured AI coding sessions, scaffold new projects, track session-set state across git worktrees, and monitor cumulative API costs — all from the activity bar.

![Session Set Explorer in action](media/session-set-explorer-in-action.png)

## Features

### Session Set Explorer
A live tree view of your project's session sets, grouped by state:

- **In Progress** — sessions the AI is currently working or that have started
- **Not Started** — specs ready to run
- **Done** — completed and merged session sets

State is derived from file presence in `docs/session-sets/<slug>/`:

| Files present | State |
|---|---|
| `spec.md` only | Not started |
| `activity-log.json` or `session-state.json` | In progress |
| `change-log.md` | Done |

Right-click a session set to open its spec, activity log, change log, or AI assignment. Copy trigger phrases to start the next AI session.

### Project Wizard (`Dabbler: Get Started`)
An onboarding panel that walks you through the entire workflow: prerequisites, how sessions work, and first steps. Opens automatically in new workspaces.

### New Project Scaffolding (`Dabbler: Set Up New Project`)
Initializes a git repository and creates the standard folder layout (`docs/session-sets/`, `docs/planning/`, `ai-router/`). Optionally sets up git worktrees for parallel session execution.

### Plan Import & Session-Set Generation
- **`Dabbler: Import Project Plan`** — import a Markdown plan file or get a prompt to generate one with AI.
- **`Dabbler: Generate Session-Set Prompt`** — builds and copies an AI prompt that translates your plan into a sequence of session-set specs.

### Cost Dashboard (`Dabbler: Show Cost Dashboard`)
Reads `ai-router/metrics.jsonl` and displays:
- Cumulative project total
- Per-session-set breakdown (sessions run, total cost, last run date)
- 30-day ASCII sparkline chart
- Model mix (% of spend by model)
- CSV export

### Troubleshooting (`Dabbler: Troubleshoot`)
A guided QuickPick that diagnoses common issues: activation, stuck sessions, git worktrees, API key setup, high costs, and folder layout.

## Requirements

- VS Code 1.85 or later
- Git on your PATH
- Python ≥ 3.10 with the `ai-router` module (for running sessions)
- At least one API key: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `GEMINI_API_KEY`

## Cost reality — please read before adopting

This workflow is **not free**, and the costs are worth understanding up front.

The orchestration does try to contain costs. For each session it picks the
least expensive model that's capable of the job, and calibrates the effort
level (low / normal / high) accordingly. But the workflow also routinely
farms work out — including end-of-session verification tasks that may run on
a different (often more expensive) model than the session itself, to give
you cross-provider review.

For a small or short-lived project, the total cost is usually modest. For
**larger projects that span many days or weeks** — multiple session sets,
many sessions per set, plus verification on each — the cumulative spend can
get **significant**. It's not unusual for an active project to run into the
tens or low hundreds of dollars over its lifetime.

The author finds the tradeoff worth it: the workflow ships features faster
and at higher quality than working solo. But this isn't a tradeoff everyone
should make. In particular, **if you're doing volunteer or open-source work
and you're not independently wealthy, please look at the cost dashboard
early and often** — it's easy to underestimate how quickly per-session costs
add up across an active project.

Use `Dabbler: Show Cost Dashboard` after every few sessions until you have
calibrated intuition for what your typical project costs. Set a personal
budget. Stop if you're not comfortable with the rate of spend.

## Extension Settings

| Setting | Default | Description |
|---|---|---|
| `dabblerSessionSets.uatSupport.enabled` | `auto` | Show UAT commands: `auto` (when any spec declares `requiresUAT: true`), `always`, `never` |
| `dabblerSessionSets.e2eSupport.enabled` | `auto` | Show E2E commands: `auto`, `always`, `never` |
| `dabblerSessionSets.e2e.testDirectory` | `tests` | Root directory to search for Playwright test files |

## Git Worktree Support

The extension automatically discovers all worktrees for each workspace folder via `git worktree list`. Session sets from multiple worktrees are merged: when the same slug appears in more than one worktree, the higher-state version wins (done > in-progress > not-started), with ties broken by most-recent `lastTouched` timestamp.

## Cost Metrics Format

Enable `METRICS_ENABLED = True` in `ai-router/config.py`. Each session appends one JSON line to `ai-router/metrics.jsonl`:

```json
{
  "session_set": "my-feature",
  "session_num": 3,
  "model": "claude-sonnet-4-6",
  "effort": "normal",
  "input_tokens": 12400,
  "output_tokens": 3200,
  "cost_usd": 0.34,
  "timestamp": "2026-04-29T14:23:00Z"
}
```

## Session Set Configuration Block

Add this block to `spec.md` to enable UAT/E2E features for that session set:

````markdown
## Session Set Configuration
```yaml
totalSessions: 3
requiresUAT: true
requiresE2E: false
effort: normal
```
````

## Building from Source

```bash
cd tools/dabbler-ai-orchestration
npm install
npm run compile    # one-shot build
npm run watch      # incremental watch build
npm run package    # produces a .vsix for local install
npm test           # compile + run tests
```

## Links

- [darndestdabbler.org](https://darndestdabbler.org)
- [Report an issue](https://github.com/darndestdabbler/dabbler-ai-orchestration/issues)
- [Workflow documentation](../../docs/ai-led-session-workflow.md)
