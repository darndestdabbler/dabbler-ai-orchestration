# Repository reference

> **Audience:** the reader who has installed the extension, run their
> first session, and now wants depth — what the framework actually
> delivers feature-by-feature, how to opt in to UAT/E2E gating, what
> the end-of-session output looks like in practice, and a directory-
> level map of the codebase.
>
> **Companion to:** [README.md](../README.md) (the lean inviting on-ramp)
> and [docs/ai-led-session-workflow.md](docs/ai-led-session-workflow.md)
> (the runtime mechanics — trigger phrases, the 10-step procedure,
> rule list).

This doc is a single flat reference page rather than a hierarchy of
sub-files. The file map, the UAT/E2E flag matrix, the worked end-of-
session output, and the deep feature descriptions all live here so
internal cross-links stop at one anchor jump rather than cascading.
The README links to specific anchors below; if you came looking for
something the README's bullet list mentioned, the matching section
title here is what to scan for.

---

## Pointers (where things live now)

If you came looking for content that used to live in the README:

| Old README section | Now lives at |
|---|---|
| Highlighted features (sections 1–6 + "Other features worth knowing") | [Highlighted features (deep dive)](#highlighted-features-deep-dive) below |
| The Session Set Explorer in action | [Highlighted features (deep dive) → Session sets and sessions](#1-work-is-organized-into-session-sets-and-sessions) below |
| Repos that need UAT and/or E2E support | [UAT and E2E support: when to opt in](#uat-and-e2e-support-when-to-opt-in) below |
| End-of-session output (worked example) | [End-of-session output (worked example)](#end-of-session-output-worked-example) below |
| Repository file map | [Repository file map](#repository-file-map) below |

The README's lean shape leads with installation + the 3-step Quick
Start; the depth above is one click away rather than buried in a
700-line scroll.

---

## Highlighted features (deep dive)

### 1. Work is organized into session sets and sessions

The unit-of-execution is a **session**: one bounded slice of work that
runs to completion in a single orchestrator conversation, ends with a
verification + commit, and stops. Sessions exist because that is how
AI-coding-agent work is naturally bounded — context windows, attention,
and rate limits all push toward "do one thing thoroughly, then stop."

The unit-of-planning is a **session set**: an ordered sequence of
sessions that together deliver one feature, refactor, or aspect of the
solution. Most non-trivial work needs more than one session, so a set
is the artifact a human and AI co-design **out of band** before any
session runs. The set's `spec.md` carries the per-session step lists,
the configuration block (`requiresUAT` / `requiresE2E`), and the
prerequisite chain. Each set lives in its own directory under
`docs/session-sets/<slug>/` and produces a small, predictable set of
artifacts (`spec.md`, `session-state.json`, `activity-log.json`,
`ai-assignment.md`, `session-reviews/`, end-of-set `change-log.md`,
and — when opted in — `<slug>-uat-checklist.json`).

The Session Set Explorer renders the active inventory across all
session sets in the workspace. State is derived from file presence,
mirroring `ai_router.find_active_session_set()`:

| Files present | State |
|---|---|
| `change-log.md` | done |
| `activity-log.json` *or* `session-state.json` | in-progress |
| only `spec.md` | not-started |

`session-state.json` is the **earliest in-progress signal** — written at
Step 1 of every session (before any activity-log entry exists), so a
freshly-started set flips to In Progress immediately.

Authoring rules and slug conventions live in
[docs/planning/session-set-authoring-guide.md](planning/session-set-authoring-guide.md);
runtime mechanics live in
[docs/ai-led-session-workflow.md](ai-led-session-workflow.md).

### 2. Cost-minded orchestration

Inside each session, work is split between an **orchestrator** AI and
the **router**. The orchestrator is a coding-assistant agent running
inside VS Code with bounded read/write/execute access to the file
system; it owns mechanics (file edits, shell, git) and dispatch. Four
orchestrator agents are supported, each reading its own instruction
file at the repo root: Claude Code reads [CLAUDE.md](../CLAUDE.md),
Codex (OpenAI) and GitHub Copilot read [AGENTS.md](../AGENTS.md), and
Gemini Code Assistant reads [GEMINI.md](../GEMINI.md). All three files
describe the same role and rules — only the agent-specific bootstrap
(API key export syntax, etc.) differs. The router (`ai_router/`) owns
reasoning: code review, security review, analysis, architecture,
documentation, test generation, and the mandatory end-of-session
verification all go to `route()`, which estimates complexity, picks the
cheapest capable tier, and applies per-task-type effort overrides from
[ai_router/router-config.yaml](../ai_router/router-config.yaml).

Assignment planning happens at **two cadences**:

- **Whole-set authoring at the start of Session 1** (Step 3.5 in the
  workflow doc). The orchestrator routes a full pass over the spec's
  per-session step lists and writes `ai-assignment.md` — a per-session
  ledger naming the cheapest capable model + effort for each step.
- **Per-session refresh at Step 8** of every non-final session. The
  orchestrator routes a fresh recommendation for the *next* session
  based on this session's actuals, and appends both to
  `ai-assignment.md`.

Both passes use `task_type="analysis"` — the orchestrator never
self-opines on which model is cheaper (Rule #17). A Claude orchestrator
asked freely will recommend Claude; routing the analysis through a
different provider removes that bias.

A model-tier and pricing reference (Gemini Flash → Gemini Pro / Sonnet /
GPT-5.4 Mini → Opus / GPT-5.4) lives in
[docs/ai-led-session-workflow.md → Model Tiers and Pricing](ai-led-session-workflow.md#model-tiers-and-pricing).

**What this looks like at scale** — see
[docs/sample-reports/](sample-reports/) for two real
`python -m ai_router.report` outputs from contrasting projects. A
CLI / library / parser project showed **73% savings vs the
Opus-only baseline** across 990 routed calls; a full-stack UI app
with UAT + E2E gates showed **32% savings** across 370 calls (lower
because UAT-driven verification routes to Opus by default). Both
reports surface auto-generated action items naming task types whose
unreliability suggests a prompt-template tightening — the manager
doesn't have to hunt for "where am I bleeding cost or quality."

### 3. Cross-provider verification

Every session ends with a **mandatory** independent verification by a
model from a **different provider** than the one that did the work
(Step 6). This catches provider-specific blind spots and biases — and
it is non-negotiable: `session-verification` always routes, even under
the `— maxout <engine>` suffix that lifts every other cost cap.

Verifier selection in [ai_router/verification.py](../ai_router/verification.py)
is rule-based: different provider, enabled as a verifier, matches the
generator's tier (or one tier higher), cheapest output price wins. The
verifier returns a structured JSON verdict
(`{"verdict": "VERIFIED" | "ISSUES_FOUND", "issues": [...]}`) so the
result is parseable rather than a free paragraph.

When the orchestrator **disagrees** with a finding, it does not
unilaterally dismiss it and does not poll a second AI for a vote. The
authority model is *verifiers flag, humans adjudicate.* The
orchestrator surfaces the finding, the dismissal reason, the context
that went to the verifier, and a self-assessment of whether relevant
context was missing. The human then picks one of four resolutions:

- (a) accept the finding and fix it,
- (b) accept the dismissal and close it,
- (c) **re-verify with reshaped context** (same verifier, add missing
  files / trim irrelevant ones — resolves the most common case where
  the verifier just wasn't shown enough),
- (d) **second opinion from a different provider** (tiebreaker model
  from outside the original verifier's provider).

Each adjudication is logged via `record_adjudication()` so the
distribution of (a)/(b)/(c)/(d) across sessions becomes visible in the
manager report and informs router-config tuning.

### 4. Git integration and parallel session sets

Every session ends with `git add -A && git commit && git push`. There
is no manual step for the human between verification and the commit
landing on `main`. Session set status is then flipped to `complete` in
`session-state.json` so the Session Set Explorer (and any external
dashboard) updates immediately.

Two or more session sets can run **in parallel** when the human's
out-of-band plan establishes that they don't conflict on the same
files. The trigger phrase
`Start the next parallel session of <slug>.` runs the session in an
isolated git worktree at `../<repo>-<slug>` on a `session-set/<slug>`
branch. The set's last session merges `origin/main` back into the
session-set branch (resolving conflicts), then merges into main and
pushes — so parallel sets converge cleanly without the human shuffling
worktrees by hand. The Session Set Explorer's worktree auto-discovery
surfaces in-progress sessions running in sibling worktrees of the same
repo, so a parallel session shows up in the activity bar even when its
worktree isn't opened as a separate workspace folder.

### 5. Batching and robust fallbacks

Outsourced calls fail. The framework treats failure as expected
behavior, not an exception:

- **Tier escalation.** If a tier-1 response is empty, truncated, or
  refused, the router escalates to the next tier (up to two
  escalations). Detection includes the `detect_truncation()` helper in
  [ai_router/utils.py](../ai_router/utils.py) — a hard-won workaround for
  Gemini Pro returning `stop_reason: "end_turn"` on visibly cut-off
  responses (see [docs/planning/lessons-learned.md](planning/lessons-learned.md)).
- **Two-attempt verifier fallback.** If the first-choice verifier fails
  at the HTTPS layer (provider outage, timeout, garbled response), the
  router excludes that provider and re-picks once. The fallback is
  flagged in metrics with `verifier_fallback: true` so the audit trail
  reflects the verifier that actually ran.
- **Verifier-failure escalation ladder.** If both verifier attempts
  fail, the orchestrator follows a documented ladder:
  retry same provider once → fall back to remaining cross-provider
  verifier → **decompose the prompt into smaller requests** → verify
  against the description-of-work → log a Major issue and proceed to
  commit. The work is preserved in git for human review either way.
- **Cost guard on verification.** When a cheap tier-1 generator pulls
  an expensive tier-3 verifier, the savings collapse. The router skips
  verification (and records `verification_skipped: cost_guard`) when
  verifier cost would exceed `max_cost_multiplier × generator cost`.
  Session-verification is exempt — that one is non-negotiable.

### 6. UAT checklist editor integration with E2E pre-screening

For session sets that opt in with `requiresUAT: true`, the orchestrator
authors `<slug>-uat-checklist.json` during the set, matching the schema
at the [UAT checklist editor repo](https://github.com/darndestdabbler/uat-checklist-editor/blob/main/checklist-schema.json).
The human runs the checklist through the freely-available editor at
[darndestdabbler.github.io/uat-checklist-editor](https://darndestdabbler.github.io/uat-checklist-editor/),
which writes review results back inline into the same JSON file.
Pending human review **blocks downstream sessions** unless the human
explicitly overrides (Rule #9), so review feedback can't get lost in
the gap between sessions.

The crucial layer is what runs **before** the human ever sees the
checklist. When a set declares both `requiresUAT: true` AND
`requiresE2E: true`, every functional checklist item must have matching
Playwright coverage (same action, same parameters, same assertions),
and the `uat-coverage-review` task type returns `VERIFIED` only when
that parity holds. Items whose expectation is purely a judgment call
(layout feel, copy quality, aesthetics) are flagged
`IsJudgmentItem: true` with a one-sentence justification; they're
exempt from matching-test parity but still need a sequence-reachability
test so the human is rendering judgment on a verified-live UI rather
than debugging exceptions. **Human UAT is the second line of defense,
not the first** — most regressions never reach the human because the
E2E gate already caught them.

### Other features worth knowing

- **Append-only metrics log + manager report.** Every routed call,
  verifier call, tiebreaker call, and adjudication writes one JSON line
  to `ai_router/router-metrics.jsonl`, spanning every session set in
  the repo. `python -m ai_router.report` produces a markdown summary
  with total spend, the **Opus-only-baseline savings headline** (what
  the same token volume would have cost if every call had gone to
  Opus), per-task-type unreliability rates, top outliers, and
  auto-generated action items for any task type whose composite
  unreliability exceeds 20%.
- **Pushover end-of-session notifications.** When `PUSHOVER_API_KEY` /
  `PUSHOVER_USER_KEY` are set, the orchestrator sends a phone push at
  Step 8 with the session number, verification verdict, and one-line
  summary. The notify happens *before* the optional Step 9
  reorganization-proposals review so the human is never blocked on
  reviewing proposals to receive the "session complete" signal.
- **Self-improving guidance.** On the **last session** of every set,
  the orchestrator reviews [docs/planning/lessons-learned.md](planning/lessons-learned.md)
  and [docs/planning/project-guidance.md](planning/project-guidance.md)
  and proposes promotions: a lesson applied as the right call in two
  or more contexts can be promoted to a Convention; a Convention whose
  rationale has become strategic can be promoted to a Principle.
  Nothing is ever deleted — items only move, with rationale.
- **Provider-agnostic orchestrator handoff.** The
  `activity-log.json` + `spec.md` + `session-state.json` triple carries
  enough state that any of the four supported orchestrators can pick
  up where another left off. The human can run Session 1 with Claude
  Code, Session 2 with Codex or GitHub Copilot, and Session 3 with
  Gemini Code Assistant — switching mid-set requires no migration step.

For the full feature list of the extension itself (worktree auto-
discovery, UAT badges, Playwright reveal, the various copy-as-trigger-
phrase commands, the `Dabbler: Install ai-router` / `Dabbler: Update
ai-router` commands, the graceful "not configured" tree-item in the
Provider Queues / Heartbeats views, the `dabblerSessionSets.*`
settings), see
[tools/dabbler-ai-orchestration/README.md](../tools/dabbler-ai-orchestration/README.md).

---

## UAT and E2E support: when to opt in

> **Universal core, gated extensions, addendum specifics.** Anything in
> the core works unmodified when `requiresUAT: false` and
> `requiresE2E: false` are permanent defaults. UI/UAT/E2E behavior is
> gated on spec-level flags.

Two flags in each spec's `## Session Set Configuration` YAML block
control opt-in:

```yaml
requiresUAT: false
requiresE2E: false
uatScope: none      # per-session | per-set | none
```

The matrix:

| Repo type | Flags | What runs / what is gated |
|---|---|---|
| **Console / library / CLI / no-UI repo.** Examples: a pure refactor repo, a Python data tool, an internal SDK. | `requiresUAT: false`, `requiresE2E: false` (or block omitted entirely — same effect) | Universal core only: build, test, cross-provider verification, commit, notify. The router never invokes `uat-plan-generation` or `uat-coverage-review`. The Session Set Explorer renders each set as a minimal entry — no UAT badge, no UAT/E2E commands, no Playwright lookup. |
| **Repo with E2E coverage but no human UAT.** Examples: a service whose behavior is fully testable end-to-end without human judgment. | `requiresUAT: false`, `requiresE2E: true` | Behavioral changes must ship with matching Playwright coverage; the orchestrator confirms via test discovery before notifying. No UAT checklist is built. The *Reveal Playwright Tests for This Set* command appears in the extension's right-click menu. |
| **Repo with human UAT but no E2E framework.** Examples: legacy UIs not yet wired to Playwright. | `requiresUAT: true`, `requiresE2E: false` | The orchestrator authors `<slug>-uat-checklist.json` during the set, the human runs it via the [UAT checklist editor](https://darndestdabbler.github.io/uat-checklist-editor/), pending review blocks downstream sessions (Rule #9). The extension shows `[UAT n]` / `[UAT done]` badges. The E2E coverage gate is skipped. |
| **Full-stack UI repo.** Examples: any Blazor / React / Vue UI app. | `requiresUAT: true`, `requiresE2E: true` | Full gating: every functional checklist item must have matching Playwright coverage and pass `uat-coverage-review` before the checklist is committed and the human is notified. Judgment items (`IsJudgmentItem: true` in the checklist JSON) are exempt from matching-test parity but still need a sequence-reachability test. |

### Hard-disabling UAT/E2E surfaces in the extension

For a repo that should **never** see UAT/E2E commands in the palette
even if a stray spec accidentally turns the flag on, set the
extension's two enablement settings to `never`:

```jsonc
// .vscode/settings.json
{
  "dabblerSessionSets.uatSupport.enabled": "never",
  "dabblerSessionSets.e2eSupport.enabled": "never"
}
```

The defaults (`auto` for both) already keep these surfaces hidden until
at least one spec opts in — so most consumer repos need no settings at
all. The third setting, `dabblerSessionSets.e2e.testDirectory`, lets
E2E-bearing repos point the *Reveal Playwright Tests* command at a
specific subdirectory (e.g. `tests/MyApp.Playwright`) instead of
searching all of `tests/`.

### Deciding the flags for a *new* spec

The When-UAT-Is-Required and When-E2E-Is-Required heuristics live in
[docs/planning/session-set-authoring-guide.md](planning/session-set-authoring-guide.md).
Spec authors decide; the orchestrator obeys. If a flag turns out wrong
mid-set, correct the spec and revisit at the Step 9 reorganization
review — never override at runtime.

---

## End-of-session output (worked example)

The stop message at Step 10 is the human-readable summary the
orchestrator prints in the chat after committing and pushing. It rolls
up the verification verdict, deferred issues, the routed cost summary
for this session, the build/test result, what's left in the set, the
**routed** next-orchestrator recommendation, and the commit hash. Below
is a verbatim Step 10 message from a real Session 1 of 4:

> **Session 1 of 4 — `resolver-default-members-and-inference`**
>
> - **Verification verdict:** VERIFIED (Round 2; high confidence,
>   2 minor doc fixes applied)
> - **Deferred issues:** None — all 7 findings across 2 rounds were
>   fixed in-session
> - **Cost summary:** $0.278 routed (4 calls: gemini-pro × 2 = $0.014,
>   gpt-5-4 × 2 = $0.264). Synthesis itself was in-conversation
>   ($0 routed).
> - **Build/test:** dotnet build green; full test suite 995 passed,
>   2 skipped (Windows-only), 0 failed. Resolver tests: 247 passed
>   (+27 new in `DefaultMembers/`).
> - **Sessions remaining:** 3 (Session 2: Type Inference synthesis;
>   Session 3: Cross-Reference Index; Session 4: Cross-cut +
>   mechanical tightening).
> - **Recommended next orchestrator:** `claude-opus-4-7` @ effort=high
>   (routed via gemini-pro analysis — Session 2 has the same
>   architecture-synthesis complexity profile as this one).
> - **Commit:** `784e7d9` pushed to main.
>
> Wait for the human before starting Session 2.

A few things worth noticing in this real example:

- **Two verification rounds.** Round 1 turned up 7 findings; the
  orchestrator fixed each, then Round 2 returned VERIFIED. The
  `Deferred issues: None` line is the human-readable assertion that
  no Major or Critical finding is being carried forward — Rule #6
  forbids committing with unresolved Major/Critical issues.
- **Synthesis was in-conversation.** Most of the session's reasoning
  was done by the orchestrator directly because it met the Delegation
  Discipline criteria for direct work. Routed cost is only the four
  `route()` calls — two `gemini-pro` analysis calls and two `gpt-5-4`
  cross-provider verification calls.
- **Routed next-orchestrator recommendation.** The orchestrator did
  not pick `claude-opus-4-7` itself. It routed the analysis through
  `gemini-pro` (Rule #17) and reported what came back. The rationale
  ("same architecture-synthesis complexity profile") came from that
  routed analysis, not from self-opinion.
- **Commit already pushed.** The session's work is on `main` before
  the stop message renders. There is no manual git step between the
  human seeing this output and the change being shareable.

Three other artifacts are produced alongside this stop message:

- **Console cost-report banner** from `print_cost_report()`
  ([ai_router/__init__.py:767](../ai_router/__init__.py#L767)) — sessions
  completed/remaining, total calls, total cost, per-model breakdown.
- **Pushover notification** (if configured) — title
  `Session complete: <slug>`, body containing the session number,
  verdict, and one-line summary. Sent *before* the optional Step 9
  reorganization review so the human is never blocked on it.
- **Appended block in `ai-assignment.md`** — the actuals for this
  session and the routed next-orchestrator recommendation, persisted
  in the session-set folder for future sessions to read.

On the **last session** of a set, the stop message additionally points
at the new `change-log.md` and includes a routed **next-session-set**
recommendation — and if `requiresUAT: true`, it also names the
checklist path, links the editor URL, and states that work is waiting
on human review.

> Aggregate spend, the Opus-only-baseline savings headline, per-task-type
> unreliability, and outliers live in the **manager report**, not the
> per-session output: run `python -m ai_router.report` against
> `router-metrics.jsonl` to produce a markdown summary covering one or
> many sets.

---

## Repository file map

Auto-generated dependency files (`package.json`, `package-lock.json`,
`requirements.txt`, `.gitignore`, `LICENSE`, the rendered VSIX, and
icon assets) are intentionally omitted — they are either trivial or
covered elsewhere in this doc.

### Root

| Path | Purpose |
|---|---|
| [README.md](../README.md) | The lean inviting on-ramp. Hero, 3-paragraph elevator pitch, 4–6 feature bullets each linking into this reference doc, 3-step Quick Start, prerequisites, license. |
| [docs/repository-reference.md](repository-reference.md) | This file. Deep feature descriptions, UAT/E2E flag matrix, worked end-of-session output, file map. |
| [CLAUDE.md](../CLAUDE.md) | Project instructions **Claude Code** reads automatically. Defines the curator-and-normalizer role this repo plays for downstream consumers, the portability rule, and the extension version baseline. |
| [AGENTS.md](../AGENTS.md) | Same content as `CLAUDE.md`, addressed to **Codex (OpenAI)** and **GitHub Copilot** — the two agents that look for `AGENTS.md` at the repo root. Agent-specific bootstrap (API key export, router import) is included so a session can be started without consulting either of the other two files. |
| [GEMINI.md](../GEMINI.md) | Same content as `CLAUDE.md`, addressed to **Gemini Code Assistant**. Carries the same agent-specific bootstrap. |

### `ai_router/` — multi-provider routing module

| Path | Purpose |
|---|---|
| [ai_router/__init__.py](../ai_router/__init__.py) | Public surface of the router. Exports `route()`, `register_session_start()`, `mark_session_complete()`, `print_cost_report()`, `print_metrics_report()`, `record_adjudication()`, `send_session_complete_notification()`, and the `find_active_session_set()` discovery helper. |
| [ai_router/config.py](../ai_router/config.py) | Loads and validates `router-config.yaml`, parses the prompt-template markdown files, and resolves effective generation parameters for any `(model, task_type)` pair. Walks up from `cwd` to find a workspace-relative `ai_router/router-config.yaml` before falling back to the package-bundled default (Set 012 Session 1 — no env-var setup needed for the common case). |
| [ai_router/models.py](../ai_router/models.py) | Complexity estimation (the 1-100 score) and the per-tier model-selection logic that drives routing decisions. |
| [ai_router/providers.py](../ai_router/providers.py) | HTTP callers for Anthropic, Google, and OpenAI. Accepts a per-call `generation_params` dict so each provider's reasoning knobs (effort, thinking, thinking_budget, thinking_level) can be tuned per task type. |
| [ai_router/prompting.py](../ai_router/prompting.py) | Builds the model-specific user message from `prompt-templates/task-prompts.md` for each routed task type. |
| [ai_router/verification.py](../ai_router/verification.py) | Rule-based cross-provider verifier selection: different provider, enabled as verifier, matches generator's tier (or one tier higher), cheapest output price wins. Also implements the two-attempt verifier fallback when the first-choice provider fails at the HTTPS layer. |
| [ai_router/metrics.py](../ai_router/metrics.py) | Append-only `router-metrics.jsonl` writer. One JSON line per routed call / verifier call / tiebreaker / adjudication, spanning every session set in the repo for cross-project trend analysis. |
| [ai_router/report.py](../ai_router/report.py) | Manager-oriented markdown report generator (`python -m ai_router.report`). Aggregates the metrics log into headline spend, per-task-type unreliability rates, top outliers, and auto-generated action items. |
| [ai_router/session_log.py](../ai_router/session_log.py) | `SessionLog` class — `log_step()`, `save_session_review()`, `save_issue_log()`, `get_next_session_number()`. Manages `activity-log.json` and the `session-reviews/` directory inside each session set. |
| [ai_router/session_state.py](../ai_router/session_state.py) | Reads and writes `session-state.json` (the earliest in-progress signal external tools see). Backs `register_session_start()` / `mark_session_complete()`. |
| [ai_router/close_session.py](../ai_router/close_session.py) | The close-out CLI (`python -m ai_router.close_session`). Sole synchronization barrier between session work and close-out — runs deterministic gate checks, emits `closeout_*` events to `session-events.jsonl`, flips the snapshot to `complete/closed` on success. See [ai_router/docs/close-out.md](../ai_router/docs/close-out.md) for flag matrix and failure modes. |
| [ai_router/notifications.py](../ai_router/notifications.py) | Pushover push-notification helper for end-of-session alerts. Falls back to Windows User/Machine environment if Pushover keys aren't already in the process environment. |
| [ai_router/utils.py](../ai_router/utils.py) | Cross-cutting helpers including `detect_truncation(content, stop_reason)` (catches the Gemini-Pro `end_turn`-but-actually-truncated failure mode — see [docs/planning/lessons-learned.md](planning/lessons-learned.md)). |
| [ai_router/router-config.yaml](../ai_router/router-config.yaml) | Single tuning surface for the router. Defines the model pool, tier mapping, per-task-type parameter overrides, verifier preferences, cost guard, delegation thresholds, metrics on/off, and the `always_route_task_types` list. Edit this file to retune. |
| [ai_router/prompt-templates/system-prompts.md](../ai_router/prompt-templates/system-prompts.md) | One H2 section per provider — the system prompt sent with every routed call to that provider. |
| [ai_router/prompt-templates/task-prompts.md](../ai_router/prompt-templates/task-prompts.md) | One H1 section per task type — the user-message template `prompting.py` applies for that task type. |
| [ai_router/prompt-templates/verification.md](../ai_router/prompt-templates/verification.md) | The independent-verifier prompt template, including the structured JSON response schema (`{verdict, issues}`) that closes the bare-paragraph-misclassified-as-VERIFIED hole. |

### `tools/dabbler-ai-orchestration/` — Session Set Explorer extension (TypeScript)

| Path | Purpose |
|---|---|
| [tools/dabbler-ai-orchestration/src/extension.ts](../tools/dabbler-ai-orchestration/src/extension.ts) | Extension entry point. Wires up the activity-bar tree views (Session Sets, Provider Queues, Provider Heartbeats), the file-watcher refresh, worktree auto-discovery, and registration of every command group below. Compiled to `dist/extension.js` via `npm run package`. |
| [tools/dabbler-ai-orchestration/src/providers/](../tools/dabbler-ai-orchestration/src/providers/) | TreeDataProvider implementations: `SessionSetsProvider` (the activity-bar inventory), `ProviderQueuesProvider`, `ProviderHeartbeatsProvider`. Both queue/heartbeat providers render a graceful "ai_router not installed → click to install" tree-item when `python -m ai_router.queue_status` / `heartbeat_status` exit with `ModuleNotFoundError`. |
| [tools/dabbler-ai-orchestration/src/commands/](../tools/dabbler-ai-orchestration/src/commands/) | Command implementations: `installAiRouterCommands` (`Dabbler: Install ai-router` / `Update ai-router` — pure-logic core in `src/utils/aiRouterInstall.ts`), `cancelLifecycleCommands` (cancel/restore session set), `copyCommand` (the trigger-phrase commands), `copyAdoptionBootstrapPrompt` (Set 013), `gitScaffold`, `openFile`, `queueActions`, `troubleshoot`. |
| [tools/dabbler-ai-orchestration/src/utils/aiRouterInstall.ts](../tools/dabbler-ai-orchestration/src/utils/aiRouterInstall.ts) | Pure-logic install core for the install command. Dependency-injected `ProcessSpawner` / `FileOps` / `InstallPrompts` so the test suite can exercise both PyPI and GitHub-sparse-checkout paths without spawning real subprocesses. Exports `isAiRouterNotInstalled()` (the detector both providers use), `resolveLatestReleaseTag()`, `deriveVenvFromPythonPath()`. |
| [tools/dabbler-ai-orchestration/src/wizard/WizardPanel.ts](../tools/dabbler-ai-orchestration/src/wizard/WizardPanel.ts) | The `Dabbler: Get Started` / `Set Up New Project` / `Generate Session-Set Prompt` / `Import Project Plan` wizard flow. |
| [tools/dabbler-ai-orchestration/src/dashboard/CostDashboard.ts](../tools/dabbler-ai-orchestration/src/dashboard/CostDashboard.ts) | The `Dabbler: Show Cost Dashboard` webview — reads `ai_router/router-metrics.jsonl`, plots cumulative spend, per-set breakdown, 30-day sparkline, model mix, CSV export. |
| [tools/dabbler-ai-orchestration/src/test/suite/](../tools/dabbler-ai-orchestration/src/test/suite/) | Standalone-mocha test suite. ~140 tests covering install paths, router-config preservation, provider tree-item rendering, cancel/restore lifecycle, force-closed badge rendering, fileSystem discovery, etc. |
| [tools/dabbler-ai-orchestration/dabbler-ai-orchestration-0.12.1.vsix](../tools/dabbler-ai-orchestration/dabbler-ai-orchestration-0.12.1.vsix) | Most recent committed VSIX. v0.13.0 will be the first Marketplace-published release; until that publish lands, install via the Extensions-view "..." menu. |
| [tools/dabbler-ai-orchestration/README.md](../tools/dabbler-ai-orchestration/README.md) | Extension-local README. Detailed feature reference: every command + setting + view, state derivation, worktree auto-discovery, the `Install ai-router` flow, the graceful not-installed tree-item, refresh triggers. |
| [tools/dabbler-ai-orchestration/CHANGELOG.md](../tools/dabbler-ai-orchestration/CHANGELOG.md) | Per-version release notes. |
| [tools/dabbler-ai-orchestration/media/](../tools/dabbler-ai-orchestration/media/) | Activity-bar and tree-item icons (`icon.svg`, `done.svg`, `in-progress.svg`, `not-started.svg`, `cancelled.svg`) plus the `session-set-explorer-in-action.png` screenshot embedded in the README. |

### `docs/`

| Path | Purpose |
|---|---|
| [docs/ai-led-session-workflow.md](ai-led-session-workflow.md) | The single source of truth for **execution mechanics**: trigger phrases, the 10-step procedure, cross-provider verification rules, the verifier-disagreement adjudication path, delegation discipline, the metrics log, and the authoritative rule list every orchestrator obeys. |
| [docs/adoption-bootstrap.md](adoption-bootstrap.md) | The runtime instruction set an arbitrary AI reads when a human pastes the `Dabbler: Copy adoption bootstrap prompt` command's clipboard contents into a fresh AI chat (Set 013). Engine-agnostic by construction. |
| [docs/repository-reference.md](repository-reference.md) | This file. |
| [docs/planning/project-guidance.md](planning/project-guidance.md) | Durable Principles + Conventions for this repo. Read before every AI-led session. Items get promoted here from `lessons-learned.md` after proving themselves in two-or-more contexts. |
| [docs/planning/lessons-learned.md](planning/lessons-learned.md) | Append-only list of failure patterns and reusable tactics (truncation detection, the verification cost guard, ASCII-only terminal glyphs, the spec-declared-not-inferred UAT/E2E rule, etc.). Lessons graduate to `project-guidance.md` once they've applied in two-or-more contexts. |
| [docs/planning/session-set-authoring-guide.md](planning/session-set-authoring-guide.md) | The single source of truth for **authoring** specs: slug naming, sizing, the Session Set Configuration block schema, deliverables, anti-patterns, templates, and the When-UAT-Is-Required / When-E2E-Is-Required heuristics. Companion to the workflow doc, not a duplicate. |
| [docs/planning/release-process.md](planning/release-process.md) | PyPI release runbook for `dabbler-ai-router` (Set 010). |
| [docs/planning/marketplace-release-process.md](planning/marketplace-release-process.md) | VS Code Marketplace + Open VSX release runbook for the extension (Set 012 Session 2). |
| [docs/sample-reports/](sample-reports/) | Two real `python -m ai_router.report` outputs from contrasting projects, used as credibility anchors in the README's cost-orchestration feature bullet. |
