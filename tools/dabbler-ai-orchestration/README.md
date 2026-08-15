# Dabbler AI Orchestration

**Your AI work, organized like work.** Instead of a chat log you scroll
back through, this extension gives AI-led development the same shape the
rest of your project has: named units of work, an ordered plan for each
one, a step list that shows where the work actually is, and a record at
the end that survives the conversation. The tree below is not a summary
someone wrote — it is read back from files on disk that the workflow
writes as it goes.

**And the verification is one you can check.** Every session is reviewed
before it closes, as a rule by a model from a *different provider* than
the one that did the work — with one exception that is disclosed below
rather than buried. You do not have to remember to ask for it, the AI
cannot decide its own diff is too small to bother, and the evidence it
ran on is written to disk where you can read it.

![The AI Work Explorer panel in the VS Code sidebar. A Default module holding 131 sets is expanded into status buckets — In Progress (1 set), Not Started (2), Complete (115), Cancelled (13). The one in-progress set, 132-session-length-and-explorer-captions, is expanded into its sessions; the session in flight, "Fix the instrument before trusting it", is expanded again into its seven steps, each finished step carrying a tick and a start time from 14:00 to 14:46, the step being worked carrying the in-progress glyph, and the final Close out step not started](https://raw.githubusercontent.com/darndestdabbler/dabbler-ai-orchestration/master/tools/dabbler-ai-orchestration/media/ai-work-explorer.png)

---

## What the tree is showing you

Four levels, all derived from files rather than remembered:

- **Modules** — a unit of work owned by one developer at a time. Projects
  that do not need them stay under one default group.
- **Status buckets** — In Progress, Not Started, Complete, Cancelled.
- **Session sets** — an ordered sequence of AI-led sessions you and the AI
  co-design *before* code is written, each with a spec on disk.
- **Sessions and their steps** — expand the session in flight and you see
  the step it is on and when each finished step started. Nothing writes
  those times specially; they are derived from records the panel already
  reads, so they light up on sets that closed months ago too.

You direct the work and the workflow carries it. The feeling is less
"hands on the wheel" and more telling a driver where to go next — and
then being able to check the route they took.

---

## Verification you can check

These are properties of the machinery, and each one is something you can
go and confirm rather than take on trust:

- **The verifier is chosen by excluding the orchestrator's own provider**,
  resolved from the model id in the registry — never from a label a model
  reports about itself.
- **Verification is normally cross-provider, and a session never quietly
  passes without it.** Where no different-provider verifier can be
  reached, the usual result is an honest `verification_unavailable`
  state, resolvable only by an operator-attested manual path — never a
  *silent* same-provider pass.

  **The one exception, stated plainly.** A project whose committed verify
  type is `DIRECT_API`, running on a machine where the only usable
  provider key is the orchestrator's own, does **not** stop: session
  verification proceeds same-provider. It is loud rather than silent, and
  you can find it afterwards — the run prints a warning telling you to add
  a second provider's key, and **every record the verdict lands on carries
  `verification_qualification: same-provider`**, so a verdict that was not
  independently corroborated says so in its own machine-readable record.
  The verdict is real; it is weaker, and it is labelled. This exception is
  narrow by operator ruling: it covers **only** session verification (code
  review and security review still fail closed), and **only** the
  `DIRECT_API` path — a Copilot seat keeps the unqualified fail-closed
  contract. Set a second `DABBLER_*_API_KEY` and it does not arise.
- **A close with no cross-provider evidence runs the verification itself.**
  There is no per-session skip to find.
- **A finding closes only when its criterion fails before the fix and
  passes after.** A fix that does not move its own criterion does not
  count as a fix.
- **Rounds are bounded**, and only the operator may authorize another —
  not the AI, and not by rewording a finding it already lost.
- **Full test suites run before commit, before push and before close**,
  and each run is recorded; a close whose recorded runs are stale is
  refused.
- **A routed call cannot write to your workspace.** On the Copilot CLI
  transport routed calls are dispatched with a read-only tool allowlist
  (`view`, `grep`, `glob`); on the direct-API transport they are plain
  completions that never had filesystem reach. A verifier that could edit
  the code it judges could report a pass on its own edit — so it cannot.

**What this extension does not claim.** It does not claim a defect-catch
rate, and it will not tell you it catches bugs before they ship: nobody
here has measured what fraction of real defects this finds, and a number
we have not measured is not one we will print. What is claimed above is
that the checks happen, that they are independent, and that you can audit
them afterwards. Where a criterion is executed for you, it runs in a
disposable checkout with a credential-stripped environment — **that is
containment, not a sandbox**, and the docs say so plainly rather than
implying more.

---

## Giving the router a provider to call

Cross-provider verification needs reach to **at least two provider
families**, or there is nothing to cross to. Two ways to get there:

| | **Direct provider API keys** | **GitHub Copilot CLI seat** |
|---|---|---|
| Setup | Set `DABBLER_ANTHROPIC_API_KEY` / `DABBLER_GEMINI_API_KEY` / `DABBLER_OPENAI_API_KEY` | Install the Copilot CLI and sign in, then run **`Dabbler: Set Up Copilot Seat`** |
| Spend | Metered, capped by your not-to-exceed budget (a 3-session set typically totals $0.15–$2.50) | Covered by your existing Copilot subscription |
| Best for | Anyone with provider accounts | Shops whose staff hold only a Copilot seat and cannot get provider keys |

You do **not** need both, and you do not need all three API keys — one
seat that exposes two provider families is enough, which is the case the
Copilot path exists to serve.

Which one a project uses is answered once per machine by
`python -m ai_router.verify_type --set DIRECT_API` (or `COPILOT_CLI`) and
recorded in `project-verify-type.txt` at the repo root — **gitignored on
purpose**, because what verifies a project is machine/project state: the
same checkout answers `COPILOT_CLI` on a Copilot seat and `DIRECT_API` on
a machine that holds provider keys. The router derives `transport.profile`
from that file, so there is no second place for the fact to be recorded
differently.

> **Upgrading from a version before 2026-08?** A second "Lightweight"
> tier used to let a session set opt out of routed verification
> (`tier: lightweight` in the spec). It is **removed**, and a spec that
> still declares it now fails to load with a one-line migration message.
> The Copilot seat option above covers the same keyless case without
> giving verification up. What to change:
> [the removal notice](https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/cross-repo-lightweight-removal-notice.md).

---

## Also in the box

- **Ongoing visibility into AI work.** Every session leaves a paper trail
  in predictable places — the spec, an activity log of every step,
  per-session state with verification verdicts, a change log at close. The
  Work Explorer reads it all back at a glance: what's in flight, what's
  queued, what's blocked on prerequisites, what's done and verified. You
  can step away and know exactly what happened while you weren't watching.

- **Cost-minded routing.** Reasoning tasks (code review, analysis,
  documentation, end-of-session verification) go through the AI router,
  which picks the cheapest capable model per task and escalates only when
  needed. Every call is written to `ai_router/router-metrics.jsonl`, one
  JSON line each, so the bill is auditable rather than asserted.

- **Confirm-gated git automation — remove keystrokes, not oversight.**
  The mechanical trunk-based loop (push a session branch and open its PR,
  sync-and-clean-up after the merge, cut a release tag, start a hotfix,
  roll back) is one command each — on **GitHub (incl. Enterprise) and
  Azure DevOps** alike, with the host auto-detected from your remote.
  Every command previews the exact git/CLI lines it will run and waits for
  your confirm; PR review/approval, release decisions and rollback
  authorization stay yours (an AI agent can *invoke* the commands, but the
  confirm modal always goes to the human). No host CLI installed? The PR
  command still pushes and opens the host's create-a-PR page in your
  browser.

---

## Get started

Open a project folder and run **`Dabbler: Set Up New Project`** from the
Command Palette. There is no form to fill in - the command is
non-interactive on purpose, and everything it needs it either derives or
asks for in the terminal you are already in.

1. **Build project structure** - the command scaffolds the `.venv` with
   the router package, the AI-agent instruction files, and the
   `docs/session-sets/` home. It checks prerequisites before writing
   anything, so a missing tool fails with a friendly explainer instead of
   a raw error, leaving no partial setup behind.
2. **Say what verifies the project** - two terminal commands, answered
   once per machine:

   ```
   python -m ai_router.verify_type            # prints the guided setup
   python -m ai_router.verify_type --set DIRECT_API
   python -m ai_router.verify_type --set-env  # the second half of setup
   ```

   `DIRECT_API` means provider API keys; `COPILOT_CLI` means a GitHub
   Copilot seat and no `DABBLER_*` keys. The answer is written to
   `project-verify-type.txt` at the repo root and **gitignored** - it is
   machine/project state, not project configuration, so the same checkout
   can honestly answer `COPILOT_CLI` on a Copilot seat and `DIRECT_API` on
   a machine that holds provider keys; committing it would publish one
   seat's answer to everyone. The router's `transport.profile` is derived
   from it rather than configured separately. Setup is finished when BOTH
   that file and `AI_ORCHESTRATION_VERIFY_TYPE` carry the same value, which
   is what `--set-env` does: on Windows it persists the variable at USER
   scope (never Machine), and on macOS/Linux it prints the exact `export`
   line for your shell profile rather than editing it behind your back.
   Either way, already-open terminals keep their old environment until they
   are restarted. If your machine already sets
   `AI_ORCHESTRATION_VERIFY_TYPE`, that value is offered as a suggestion and
   `--confirm` writes it to the project; until then it changes nothing. On
   the Copilot path,
   **`Dabbler: Set Up Copilot Seat`** checks the seat's model catalog and
   enables the seat profile only when the seat confirms two distinct
   provider families - validated so far only on a single personal seat, so
   an enterprise-managed seat may expose one family and fail that check
   honestly rather than leaving a silently broken router.
3. **Define modules (optional)** - for a project split across areas
   of work, declare **modules** in `docs/modules.yaml` so the Work
   Explorer groups your session sets by module. A module is a unit of
   work for one developer at a time - a developer may own several
   modules, but two developers should never work the same module
   concurrently (AI-speed changes make concurrent same-module work a
   constant merge-conflict source). **Open modules.yaml**
   creates the file from a commented template (on this explicit
   action only - the extension never writes it just because you
   opened the repo) and opens it to edit; **Copy AI decomposition
   prompt** hands your AI assistant a ready-made prompt that fills the
   file in for you. Save the file and the tree regroups. Solo or
   single-area projects can skip this - your work stays under one
   default group.

Build hands you a working starting point, not a blank repo. It
declares a `default` module and scaffolds its two starter sets —
`001-default-plan` (create or import your project plan) and
`002-default-decomposition` (turn that plan into your real work sets),
the Visual Studio `Class1` pattern. Those sets appear straight away in
the Work Explorer **tree** (open the step-by-step instructions any time
with **`Dabbler: Get Started`**). Run the plan
set, then the decomposition set, then **rename** the Default module into
your first real module once you know your project's names (rename re-homes
the work sets; **delete** instead only if you have not run them yet).

From the tree, each **module's row** carries a one-click action strip —
*Open Plan*, *Add Module…*, *Rename Module…*, *Delete Module…* — and
you tell your AI agent **"start the next session"** to work through the
sets under it. Reorganizing modules later (rename, delete, split,
merge, or adopting modules in an older repo) is covered in the
[module reorganization guide](https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/module-reorganization.md).

New here? The hands-on
[Hello World walkthrough](https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/tutorials/hello-world.md)
drives this whole flow end to end (modules, worktrees, CI, a reviewed pull
request) on GitHub with the **GitHub Copilot CLI**, adding a teammate and a
second module at the end — **Azure DevOps** and direct-provider-API variants
are inline callouts, not separate walkthroughs. Tagging, hotfixing, and rolling
back are covered in
[Release and recovery operations](https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/tutorials/release-and-recovery.md).

---

## What it'll cost

API spend is real and varies by project size and verification appetite.
Honest framing:

- **Verification is not optional, so it is not free.** The router makes
  synchronous API calls for cross-provider verification, capped at your
  not-to-exceed (NTE) threshold. Verification calls typically run
  **$0.05–$0.80 each**; a 3-session set usually totals **$0.15–$2.50**; a
  6-session set **$0.30–$5.00**. These are empirical medians — outliers
  exist.
- **On a Copilot seat that spend is your existing subscription**, not a
  second bill. That is the whole reason the seat path exists.
- **Tiered routing is cheaper than sending everything to a frontier
  model** — how much cheaper is a number you can compute rather than one
  you have to believe. `python -m ai_router.report` reads the metrics log
  and prints the ratio of what you actually spent to a **hypothetical
  Opus-only baseline** (every call repriced at Opus rates). On two sample
  projects that ratio came out at 73% and 32% below baseline; both reports
  ship in the [GitHub
  repo](https://github.com/darndestdabbler/dabbler-ai-orchestration/tree/master/docs/sample-reports)
  so you can check the arithmetic. Read it for what it is — a
  counterfactual against list prices, not a measurement of two projects
  run twice — and note that at *matched context size* the per-call gap
  between model tiers is far narrower than headline rates suggest.

The framework is open-source (MIT) — your costs are entirely your
provider's API spend or your Copilot seat; nothing in this extension is
paywalled.

---

## Requirements

- **VS Code** 1.85+
- **Python 3.10+** with a workspace `.venv/` (the
  **`Dabbler: Install ai-router`** command auto-detects or creates
  it for you)
- **A provider for the router to call** — *either* an authenticated
  GitHub Copilot CLI seat exposing two provider families, *or* provider
  API keys as environment variables:
  - `DABBLER_ANTHROPIC_API_KEY` (Claude)
  - `DABBLER_GEMINI_API_KEY` (Gemini)
  - `DABBLER_OPENAI_API_KEY` (GPT)
  - Two of the three is the working minimum — cross-provider
    verification needs somewhere different to route to. Set all three
    and the router has more to choose from.
  - These variables hold the normal provider-issued keys from Anthropic,
    Google and OpenAI; Dabbler only prefixes the environment variable
    names.
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
  keystrokes. Right-click opens a native VS Code context menu with
  two-step submenus — **Open File ▸** (Spec / Activity Log / Change
  Log / Session State) and **Copy Prompt ▸** (Start Next Session) —
  plus flat actions for Copy Slug, Open Prerequisite Spec (on blocked
  rows), Migrate to v3 / v4 schema, Cancel set, and Restore set. The
  menu honors light/dark theme natively and dismisses on Escape or
  click-outside.
- **Session rows are clickable too.** Left-click a session under a set
  and the same `spec.md` opens **positioned at that session's own
  `### Session N of M:` block**, so you land on the plan you asked for
  with the surrounding context still a scroll away. Right-click offers
  **Copy Run Prompt** — on the one session the trigger phrase actually
  runs, so a prompt copied from a row always starts that row's session.
- **The in-flight session shows which step it is ON, and since when.**
  Expand it and the step being worked carries the in-progress glyph and
  a grey start time (`12:06-`) at the end of the row; finished steps are
  ticks with their own start times, and steps that have not started show
  nothing. Both facts are *derived* from records the panel already reads
  — no writer produces them and nothing has to be remembered — so they
  also light up on sets that closed months ago. Exactly one step is ever
  marked, and only while the session really is in flight: the moment a
  step is logged `in-progress`, `blocked` or `failed`, the record answers
  and the derivation stands down.
- **The in-flight session shows what still stands between it and close.**
  Expand it and, under its steps, a **Close-out readiness** row summarises the
  obligations `close_session` will check (`1 blocking, 3 advisory`, or
  `nothing outstanding`) and expands to one row each, with the
  predicate's own remediation on hover. The panel reads a file rather
  than computing anything: run
  `python -m ai_router.close_preflight --session-set-dir <set> --write`
  and the row follows. It says how old its answer is — `stale`, or
  `as of HH:MM` on the rows that read git — and stays blank until
  someone computes one, since an undated row is the absence of an answer
  rather than an all-clear. It only ever reads as done when the recorded
  verdict says the close would proceed.
- **Copyable prompts for a second opinion.** The clipboard prompts above
  reference your session-set artifacts by path rather than embedding
  their contents. Paste into any path-aware AI chat
  (Claude Code, Codex, Cline, Cursor, etc.) on a *different* provider
  than the one that did the work — the workspace's
  `docs/dabbler/cross-provider-verification.md` (ensure-written
  automatically at bootstrap) fixes the review stance and the verdict
  grammar. These are **advisory**: a
  second opinion you read, separate from the routed verification round
  the close-out gate corroborates.
- **`--no-router` for CI and hermetic tests.** Run
  `python -m ai_router.start_session … --no-router`, or set
  `DABBLER_NO_ROUTER=1` in your environment, and the router makes no
  LLM calls (no credentials needed). It means exactly that and nothing
  more: it buys **no** relief from the close-out gates, so a hermetic
  run cannot quietly become an unverified close. A project that
  genuinely cannot verify declares it on disk instead, with
  `threshold_usd: 0` and a matching `verification_method` in
  `ai_router/budget.yaml` — an operator declaration, not an engine's
  choice.
- **Owed verification is said out loud.** `start_session` prints a
  loud, non-blocking banner naming any owed verification the moment
  you start your next session — so an owed set is never silently
  forgotten between sessions.
- **Schema-v4 migrator + prerequisites.** Set 047 introduced the v4
  `session-state.json` shape where every per-session lifecycle field
  (orchestrator, startedAt, completedAt, verdict) lives in a
  per-session `sessions[]` ledger. The **Migrate to v4 schema**
  right-click action (also `python -m ai_router.migrate_v3_to_v4`)
  upgrades v1/v2/v3 state files with a `.bak.json` rollback
  contract.
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
- **Git workflow commands (dual-host: GitHub incl. Enterprise, Azure
  DevOps).** Five confirm-gated Command Palette actions wrap the
  trunk-based loop's mechanical git: `Dabbler: Open PR for this set`
  (push + create the PR via `gh` or `az repos`, auto-detecting the
  host from the `origin` remote; falls back to pushing and opening
  the host's create-a-PR web page when no CLI is installed),
  `Dabbler: Finalize merged set` (post-merge `git pull --ff-only` +
  worktree removal + `git branch -d` + `git fetch --prune`,
  idempotent and safely re-runnable), `Dabbler: Cut release tag`
  (annotated tag + push, sha-pinned, mandatory confirm — the release
  gate), `Dabbler: Start hotfix from tag`, and `Dabbler: Roll back
  to tag`. Settings: `dabblerSessionSets.gitHost` (`auto` | `github`
  | `azure-devops`) plus `ghCliPath` / `azCliPath` executable
  overrides. Setup and the raw commands each action runs are
  documented in the hello-world tutorial's per-host setup section
  and "Git under the hood" appendix.

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
