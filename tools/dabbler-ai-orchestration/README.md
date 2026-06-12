# Dabbler AI Orchestration

An AI-led coding-session workflow for VS Code. Manage structured AI
sessions, automatic cross-provider verification, cost tracking, and
git-worktree-aware session-set state — all from the activity bar.

![The Session Set Explorer beside a session-set spec: in-progress, not-started (blocked), and complete sets with their session fractions](https://raw.githubusercontent.com/darndestdabbler/dabbler-ai-orchestration/master/tools/dabbler-ai-orchestration/media/session-set-explorer-and-spec.png)

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

1. **Tier choice** — Full or Lightweight. Full uses the AI router
   for cost-minded routing and automatic cross-provider
   verification at session end; Lightweight skips the router
   (no API spend on verification) and uses copyable review
   prompts you paste into a path-aware AI chat for manual review.
   Both tiers share the same session/state-file lifecycle and
   Session Set Explorer surface — only the verification mechanism
   differs.
2. **A budget dialog** — Full tier only — set a not-to-exceed (NTE)
   dollar cap for verification spend. Verification calls typically
   cost $0.05–$0.80 each; entering $0 switches to manual cross-
   provider review at no API cost.
3. **A plan alignment** — the AI proposes a session-set
   decomposition based on what you describe.
4. **A numbered action checklist** — *every* intended write, config,
   and scaffolding step is listed. You batch-approve before anything
   touches disk. No per-write confirmation prompts. You can
   interrupt at any time.

Once your first session set exists, the welcome content disappears
and the standard activity-bar tree takes over.

If you'd rather drive the setup from VS Code's UI directly, run
**`Dabbler: Get Started`** from the command palette
(`Ctrl+Shift+P` / `Cmd+Shift+P`). It focuses the Session Set
Explorer — which renders a three-step **Getting Started form**
(build structure with a Full/Lightweight radio, create or import a
project plan, build session sets) whenever the workspace has no
session sets yet — and opens the step-by-step instructions in the
editor. On the Full tier the form warns under the Build button when
no provider API key is set. (The Set 021 Get Started wizard panel
was retired in extension 0.29.0 in favor of this form.)

![The Getting Started form in the Session Set Explorer: build project structure with a Full/Lightweight tier choice, create or import a project plan, build session sets](https://raw.githubusercontent.com/darndestdabbler/dabbler-ai-orchestration/master/tools/dabbler-ai-orchestration/media/getting-started.png)

---

## What it'll cost

API spend is real and varies by project size and verification
appetite. Honest framing:

- **$0 budget** — verification routes through a *different* AI
  assistant you open manually (e.g. open a second AI chat as the
  verifier), or you skip verification with the decision logged. No
  API spend.
- **Non-zero budget** — the router makes synchronous API calls for
  cross-provider verification, capped at your not-to-exceed (NTE)
  threshold. Verification calls typically run **$0.05–$0.80 each**;
  a 3-session set usually totals **$0.15–$2.50**; a 6-session set
  **$0.30–$5.00**. These are empirical medians — outliers exist.

The router writes one JSON line per call to
`ai_router/router-metrics.jsonl` so you can audit spend at any
time. The **Cost Dashboard** command surfaces cumulative spend
visually — it appears only in workspaces that actually route (it is
absent on Lightweight) and, on open, prompts you to refresh the
per-provider rate estimates if they have gone stale (older than
`metadata.review_frequency_days`, default 30 days). `python -m ai_router.report` produces a full markdown
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

- **Row interactions.** Left-click a session-set row to open its
  `spec.md` in an editor tab; on non-terminal rows (in-progress or
  not-started) the click also copies `Start the next session of
  \`<slug>\`.` to your clipboard with a one-line confirmation toast,
  so you can paste straight into the AI chat and resume work in two
  keystrokes. Right-click opens a native VS Code QuickPick with
  two-step submenus: **Open File ▸** (Spec / Activity Log / Change
  Log / Session State), **Copy Eval ▸** (copyable prompts —
  Evaluate Specification / Most Recent Session / Session Set /
  Start Next Session / Start New Parallel Session / Verification
  Kickoff), and flat actions for Copy Slug, Open Orchestrator
  Writer Log, Open Prerequisite Spec (on blocked rows), Switch
  Tier… (not-started rows), Set Up Dedicated Verification… and
  Open External Verification Note (eligible Lightweight rows),
  Migrate to v4 schema, Cancel set, and Restore set. The
  right-click menu honors light/dark theme natively and dismisses
  on Escape or click-outside.
- **Copyable review prompts.** Four `Dabbler: Copy …` commands
  (also under Copy Eval ▸ in the right-click menu) author review
  prompts that reference your session-set artifacts by path rather
  than embedding their contents, then write to the clipboard. Paste
  into any path-aware AI chat (Claude Code, Codex, Cline, Cursor,
  etc.) and the agent reads the files itself. Optional per-repo
  files at `docs/review-criteria/{spec,session,set}.md` override
  the default review instructions if present.
- **Lightweight tier (no API spend).** Run
  `python -m ai_router.start_session … --no-router`, or set
  `tier: lightweight` in `spec.md`, or `DABBLER_NO_ROUTER=1` in
  your environment. The router stops making LLM calls (no
  credentials needed), `close_session` accepts a manual
  attestation, and the soft gate prompts when an
  `external-verification.md` artifact is missing
  (`Dabbler: Open External Verification Document` creates or opens
  it). Same Session Set Explorer, same `session-state.json`
  lifecycle, same close-out gates — just no API spend on
  verification.
- **Lightweight verification at a glance.** Lightweight rows carry a
  quiet `lw` marker, and sets using dedicated verification sessions
  show an honest `N/M+` fraction (the `+` says the session count can
  still grow). Two verification-posture markers appear at the
  actionable moment: `v?` on a completed out-of-band set the
  Explorer cannot vouch for, and `v+` when the work is done and a
  dedicated verification session is owed. Clicking a marker opens
  the row menu — **Verification Kickoff** copies a paste-ready
  handoff prompt that has a *different* AI engine run the typed
  verification/remediation flow, and **Set Up Dedicated
  Verification…** switches a set's `verificationMode` safely (a
  spec-seed rewrite on not-started sets; a recorded, gated
  transition through the `ai_router` blessed writer on completed
  sets). Verified sets stay quiet — the verdict lives in the
  fraction tooltip, and no positive badge is shown.
- **Schema-v4 migrator + prerequisites.** Set 047 introduced the v4
  `session-state.json` shape where every per-session lifecycle field
  (orchestrator, startedAt, completedAt, verdict) lives in a
  per-session `sessions[]` ledger. The **Migrate to v4 schema**
  right-click action (also `python -m ai_router.migrate_v3_to_v4`)
  upgrades v1/v2/v3 state files with a `.bak.json` rollback
  contract. Lightweight consumers with hand-edited shapes can run
  `python -m ai_router.migrate_lightweight_to_canonical_v4`.
  Specs can declare a `prerequisites:` field listing other session-
  set slugs — see **Prerequisites and the blocked marker** below.
- **Prerequisites and the blocked marker** — declare dependencies in
  a set's `spec.md` to block it until other sets are complete:

  ```yaml
  prerequisites:
    - slug: 047-state-file-schema-v4-audit
      condition: complete
  ```

  The Explorer shows a quiet chain marker (⛓︎) on blocked sets.
  Hover the marker for a tooltip listing each unsatisfied
  prerequisite and its current state ("in progress", "not started",
  or "unknown set — check the slug" for a slug that doesn't match
  any set; typos keep the row blocked rather than silently
  unblocking it). The marker is hidden on complete/cancelled sets.
  A right-click action "Open Prerequisite Spec" jumps straight to
  the blocking dependency's spec — when more than one prerequisite
  is unsatisfied, a QuickPick lists them with their states.
- **Visual config editor** (`Dabbler: Open Dabbler Config Editor`) —
  edit `router-config.yaml`, `budget.yaml`, and the gitignored
  `local-overrides.yaml` through a six-section panel without touching
  YAML directly. Sections cover routing mode, budget threshold,
  provider API-key env vars, significance flagging, Pushover
  notifications, and a local-overrides summary. Includes a
  live-validation drift banner and a "Send a test notification" button.
- **Significance flagging** — `Dabbler: Flag Decision for Cross-Provider
  Review` appends a one-line reason to the active set's review queue.
  `Dabbler: Scan Workspace for @dabbler:outsource-review Annotations`
  walks source files for `# @dabbler:outsource-review("...")` and
  `// @dabbler:outsource-review("...")` annotations and queues new
  findings automatically.
- **Cancel/Restore lifecycle** — cancel a session set mid-stream
  with a recorded reason; restore later if priorities shift. The
  audit trail accumulates across cycles.
- **UAT checklist integration (tri-state).** Specs declare
  `requiresUAT` and `requiresE2E` as `true | false | "suggested"`.
  When the value is `"suggested"` and the session has UX scope, the
  orchestrator asks at session start which review path you want
  (E2E tests, UAT checklist, both, or neither) and records your
  choice once; close-out gates derive from that recorded answer.
  UAT checklists pair with the freely-available
  [UAT checklist editor](https://darndestdabbler.github.io/uat-checklist-editor/).
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
