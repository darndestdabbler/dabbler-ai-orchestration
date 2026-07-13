# Dabbler AI Orchestration

An AI-led coding-session workflow for VS Code. Manage structured AI
sessions, mandatory cross-provider verification, cost tracking, and
git-worktree-aware session-set state — all from the activity bar, in
two tiers that let you trade API spend against your own attention.

![The Work Explorer groups work by module: the Auth Service module is expanded, showing an in-progress session set, a not-started set, and two complete sets; the Billing, Notifications, and Platform Core modules are collapsed below](https://raw.githubusercontent.com/darndestdabbler/dabbler-ai-orchestration/master/tools/dabbler-ai-orchestration/media/work-explorer-modules.png)

---

## Two tiers — pay with dollars or pay with attention

Both tiers run the **same workflow**: the same session lifecycle, the
same Work Explorer, the same state files and close-out gates.
They differ in how much of the workflow is automated — and therefore
in what each one costs you:

|  | **Full tier** | **Lightweight tier** |
|---|---|---|
| Verification | Mandatory on every session — `verify_session` picks a model from a *different provider* and runs the review for you before each close | Copyable review prompts — you paste them into a second AI chat and record the verdict yourself |
| API spend | Metered, capped by your not-to-exceed budget (a 3-session set typically totals $0.15–$2.50) | **$0** — the router makes no API calls |
| Your attention | Mostly at session boundaries. Run **several projects at once** while you sit in meetings, answer email, or do other work — the workflow carries itself between check-ins | More hands-on: you drive each verification, so multitasking is more constrained. More than one project at a time still works — each just needs more of you |
| Best for | Parallel project streams; "start it, check in later" operation | Cost-sensitive work; learning the workflow; environments where API spend isn't an option |

The tier is declared **per session set** (`tier:` in the spec), not
per repo — mix them freely in one workspace, and switch a not-started
set's tier from the Explorer (**Switch Tier…**). A common path: start
Lightweight, then go Full when the attention cost outweighs the API
cost.

---

## What you get

- **A standardized, largely automated workflow — not just better
  chat hygiene.** Most developers already split AI work into
  sessions; the hard part is everything around them. This extension
  operationalizes a high-level plan into **session sets** — ordered
  sequences of AI-led work sessions that you and the AI co-design
  before any code is written — and then runs every session through
  the same structured lifecycle: register, work, verify, document,
  commit, close. You direct the work; the workflow carries it. The
  feeling is less "hands on the wheel" and more "telling your
  chauffeur where to go next."

- **Ongoing visibility into AI work.** Every session leaves an
  AI-generated paper trail in predictable places — the spec, an
  activity log of every step, per-session state with verification
  verdicts, a change log at close. The Work Explorer reads it
  all back at a glance: what's in flight, what's queued, what's
  blocked on prerequisites, what's done and verified. You can step
  away and know exactly what happened while you weren't watching.

- **Cost-minded routing (Full tier).** On the Full tier, reasoning
  tasks (code review, analysis, documentation, end-of-session
  verification) go through the AI router, which picks the cheapest
  capable model per task and escalates only when needed. Real
  projects we tested measured **73% savings vs Opus-only** on a
  CLI/library project (990 routed calls) and **32% savings** on a UI
  app with UAT/E2E gates (370 calls). Two sample reports ship in the
  [GitHub repo](https://github.com/darndestdabbler/dabbler-ai-orchestration/tree/master/docs/sample-reports).
  The Lightweight tier skips the router entirely — that's the $0
  column in the table above.

- **Cross-provider verification at session close.** On the
  Full tier, every session is reviewed before it closes — no skip: a model
  from a *different provider* than the one that did the work reviews the session and returns a
  structured verdict, and the close gate refuses an unverified close;
  disagreements surface for human adjudication
  rather than being silently merged or dismissed. On the Lightweight
  tier the same step is a copyable review prompt you paste into a
  second AI chat and a verdict you record yourself.

---

## Get started

Open a project folder with no session sets yet and the Work Explorer
renders the staged **Getting Started form** (two sections), with
companion step-by-step instructions in the editor:

![The two-section Getting Started form in the Work Explorer: Build project structure with a Full/Lightweight tier choice, then Define modules (optional)](https://raw.githubusercontent.com/darndestdabbler/dabbler-ai-orchestration/master/tools/dabbler-ai-orchestration/media/getting-started.png)

1. **Build project structure** — pick your tier (Full or
   Lightweight, the cost/attention tradeoff described above). Choosing
   Full surfaces a second choice for **provider access**: **direct
   provider API keys** (the default) or a **GitHub Copilot CLI seat**
   (calls run through your Copilot subscription's command-line tool —
   no `DABBLER_*` keys needed). Choosing Lightweight surfaces a second
   choice: **separate verification sessions** (a dedicated session on
   a different AI engine or provider reviews the work before the set
   can close) or **manual review** (paste a review prompt into a
   second AI assistant yourself and record what it says — the
   default). All choices persist through a window reload, so
   revisiting the form never silently reverts them. The form
   scaffolds everything: the `.venv` with the router package, the
   AI-agent instruction files, and the `docs/session-sets/` home. On
   the Full tier the form also asks for your verification **budget /
   NTE cap** (saved to `ai_router/budget.yaml`; a `$0` budget asks
   you to pick manual-via-other-engine or skipped verification
   explicitly). Environment faults render in a persistent **System
   Status strip** above the form (the same strip that sits above the
   Work Explorer tree), visible only when a fault exists: a missing
   provider API key (the direct-API option needs one), a missing
   Python interpreter, or — with the Copilot seat option selected —
   a missing `copilot` CLI, each with install guidance; the Build
   action checks prerequisites before writing
   anything, so a missing tool fails with a friendly explainer
   instead of a raw error, leaving no partial setup behind. With the
   Copilot seat option, Build finishes by checking the seat's model
   catalog and enables the seat profile only when the seat confirms
   two distinct provider families — a check validated so far only on
   a single personal seat (the same seat Set 078 validated on);
   multi-seat and enterprise-seat model availability are not yet
   validated, and an enterprise-managed seat may expose only one
   provider family and fail the two-provider check even though the
   guided flow itself ran — the form says so honestly rather than
   leaving a silently broken router.
2. **Define modules (optional)** — for a project split across areas
   of work, declare **modules** in `docs/modules.yaml` so the Work
   Explorer groups your session sets by module. A module is a unit of
   work for one developer at a time — a developer may own several
   modules, but two developers should never work the same module
   concurrently (AI-speed changes make concurrent same-module work a
   constant merge-conflict source). **Open modules.yaml**
   creates the file from a commented template (on this explicit
   action only — the extension never writes it just because you
   opened the repo) and opens it to edit; **Copy AI decomposition
   prompt** hands your AI assistant a ready-made prompt that fills the
   file in for you. Save the file and the tree regroups. Solo or
   single-area projects can skip this — your work stays under one
   default group.

Project-plan authoring and decomposition-into-session-sets — the old
steps 2 and 3 — left the form. The Getting Started form shows only
while the repo has **no session sets yet**; it is replaced by the Work
Explorer **tree** as soon as the **first session set exists**. So the
first plan and the first session set are created from the **Command
Palette**, which works while the form is still up:

1. **`Dabbler: Import Project Plan`** — import an existing
   `docs/planning/project-plan.md`, or draft one with your AI agent.
2. **`Dabbler: Generate Session-Set Prompt`** — copy a
   decomposition prompt (module-aware when `docs/modules.yaml` declares
   modules); your AI agent turns the plan into ordered session sets,
   which you review and **save** under `docs/session-sets/`.

Saving that first set flips the Explorer from the form to the tree.
From then on the **same actions are one click on each module's row**
(the row action strip: *AI Plan*, *Import Plan*, *Open Plan*,
*AI Sets*) — that's how you add *more* sets to a module — and you tell
your AI agent **"start the next session"** to work through them. (You
can re-focus the form anytime with **`Dabbler: Get Started`** from the
command palette.)

Working as a small team? The hands-on
[three-person Hello World walkthrough](https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/tutorials/module-team-hello-world.md)
drives this whole flow end to end (modules, worktrees, CODEOWNERS +
monorepo CI, tags), and its companion
[module workflow review prompt](https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/tutorials/module-team-hello-world-review-prompt.md)
gives your team evidence-cited coaching on the workflow afterward.

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
  - `DABBLER_ANTHROPIC_API_KEY` (Claude Sonnet, Opus)
  - `DABBLER_GEMINI_API_KEY` (Gemini Flash, Pro)
  - `DABBLER_OPENAI_API_KEY` (GPT-5.4, GPT-5.4 Mini)
  - All three are required so cross-provider verification has
    somewhere to route to.
  - These variables hold the normal provider-issued keys from Anthropic,
    Google, and OpenAI; Dabbler only prefixes the environment variable names.
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
- **Copyable review prompts that complete themselves.** Four
  `Dabbler: Copy …` commands (also under Copy Eval ▸ in the
  right-click menu) author review prompts that reference your
  session-set artifacts by path rather than embedding their contents,
  then write to the clipboard. Paste into any path-aware AI chat
  (Claude Code, Codex, Cline, Cursor, etc.) on a *different* provider
  than the one that did the work — the prompt points it at the
  canonical `docs/dabbler/cross-provider-verification.md` instructions
  (ensure-written into every workspace automatically) and its one
  non-negotiable closing instruction: the reviewing engine itself
  writes its verdict into `external-verification.md`, so a verdict
  that only exists in the chat doesn't count. Optional per-repo files
  at `docs/review-criteria/{spec,session,set}.md` override the
  default review instructions if present.
- **Lightweight tier (no API spend).** Run
  `python -m ai_router.start_session … --no-router`, or set
  `tier: lightweight` in `spec.md`, or `DABBLER_NO_ROUTER=1` in
  your environment. The router stops making LLM calls (no
  credentials needed), `close_session` accepts a manual
  attestation, and the soft gate prompts when an
  `external-verification.md` artifact is missing
  (`Dabbler: Open External Verification Document` creates or opens
  it). Same Work Explorer, same `session-state.json`
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
  fraction tooltip, and no positive badge is shown. A row that owes
  verification or remediation says so in words in its description,
  and its **Start Next Session** copy action auto-routes to the
  right prompt (verification kickoff or remediation handoff) instead
  of a work-session prompt that would just be refused. Separately,
  `start_session` itself prints a loud, non-blocking banner naming
  any owed verification the moment you start your next session, on
  both tiers — so an owed set is never silently forgotten between
  sessions.
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
