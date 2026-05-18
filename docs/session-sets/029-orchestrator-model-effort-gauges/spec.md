# Orchestrator Model & Effort Indicator Gauges

> **Purpose:** Add an always-on, ≤100px-tall webview pinned above the
> Session Set Explorer that shows the current orchestrator's **model**
> and **effort level** as two side-by-side CSS gauges (semi-circle
> style per the dev.to gauge reference), so the operator never
> accidentally runs a fresh session on a lower-tier model after
> temporarily switching down for a cheap task. v1 supports four
> orchestrator surfaces: Claude Code, Gemini Code Assist Agent,
> Codex, and GitHub Copilot.
>
> **Session Set:** `docs/session-sets/029-orchestrator-model-effort-gauges/`
> **Created:** 2026-05-17
> **Workflow:** Full
> **Prerequisite:** None — operator-initiated UX feature.

---

## Session Set Configuration

```yaml
requiresUAT: false
requiresE2E: true
uatScope: none
uatStyle: ad-hoc
effort: high
totalSessions: 4
```

> **Rationale on `effort: high`:** the hard part isn't the gauge; it's
> the cross-provider detection (Claude has hooks, others don't), and
> verifying the design holds up across four orchestrator surfaces
> before committing the implementation. The audit session (S1) plus
> the multi-provider detection session (S3) are both Opus-class work.
>
> **Rationale on `requiresE2E: true`:** the visual gauge is a Layer 3
> Playwright Electron concern (rendered-text invariant: needle position
> + provider/model label + effort tier). The existing Playwright
> scaffolding at `tools/dabbler-ai-orchestration/tests/playwright/` is
> the right place to add the smoke. No new UAT (no operator-driven
> acceptance checklist needed for a status indicator).

---

## Problem statement

The operator routinely flips the orchestrator model down for cheap
tasks (e.g., Claude Haiku 4.5 for a quick file rename) and forgets
to flip it back to Opus 4.7 before starting substantive work. The
failure mode is silent: a new session opens on Haiku, the operator
doesn't notice until 15 minutes in when the output quality is wrong,
and the session has to be aborted or salvaged.

The cost of the failure is two-sided:

1. **Quality loss** — substantive work on a lower-tier model produces
   weaker output that often needs to be redone.
2. **Cost waste** — even a "cheap" model burns budget on work it
   can't complete well, plus the redo cost.

The fix is a passive, always-visible signal. The operator should be
able to glance at the activity bar and see, at a glance, "I'm on
Opus 4.7, effort=high, thinking=on" or "I'm on Haiku 4.5, effort=low,
thinking=off" — without having to ask the orchestrator, check the
model picker, or run a command.

## Goal state

When this set ships, the **Dabbler AI Orchestration** view container
has a new webview view, pinned above `dabblerSessionSets`, named
"Orchestrator". The view:

- Is ≤100px tall (operator's hard constraint)
- Renders two side-by-side semi-circle CSS gauges:
  - **Left gauge: Model.** Needle position encodes tier-within-provider:
    bottom-left zone = low-tier (Haiku / Flash / 4o-mini), middle zone =
    mid-tier (Sonnet / Flash 2.5 / 4o), top-right zone = flagship
    (Opus / Pro / o1 / Claude 5.x). Color polarity: red (low) → yellow
    (mid) → green (flagship). Sublabel under the gauge shows
    `<Provider> <Model>` text (e.g., "Claude Opus 4.7").
  - **Right gauge: Effort.** Five normalized levels (Low / Medium / High
    / Extra-High / Max) plus a binary "Thinking" indicator (LED dot
    next to the gauge). Color polarity: identical to the model gauge
    (red=low, green=max).
- Updates within ≤500ms of an orchestrator model/effort change
  (via filesystem watch on a marker file written by per-surface
  hooks, config-watcher shims, and the manual-override quickpick —
  only Claude actually installs a hook per audit-locked D8)
- Shows a graceful **"No signal — install hook"** CTA when the marker
  file is **missing** (per audit-locked Q6).
- Shows a **distinct stale state** when the marker exists but
  `updatedAt` is older than `stalenessMaxSec` (**default 8h** per
  audit-locked Q6 — was 1h pre-audit): diagonal-stripe overlay at
  50% opacity over the underlying signalKind treatment, plus
  "last updated Xh ago" annotation. **No install-hook CTA on
  stale** — only on missing.
- Exposes per-orchestrator-surface installer commands (per
  audit-locked D8):
  - **Claude Code:** `SessionStart` hook in `~/.claude/settings.json`
    (NOT `Stop` — Stop has no `model` field per audit S1).
  - **Codex:** auto-detected via `~/.codex/config.toml` filesystem
    watcher; no user-facing installer (signal is `configured-default`).
  - **Gemini Code Assist + GitHub Copilot:** "installer" command
    opens the manual-override quickpick with provider pre-selected
    (manual-only in v1 — no documented persisted state).
  - **Universal manual-override quickpick** (`Dabbler: Set Orchestrator
    Model & Effort`) as the always-available fallback.

---

## Decisions locked from operator dialogue (do not re-litigate)

| # | Decision | Locked value |
|---|---|---|
| D1 | Provider scope | **All four orchestrator surfaces**: Claude Code, Gemini Code Assist Agent, Codex, GitHub Copilot. v1 ships best-effort detection for each plus manual override as universal fallback. |
| D2 | Layout | **Two side-by-side semi-circle gauges** plus a binary "Thinking" LED beside the effort gauge. Three-gauge variants rejected; binary thinking-on/off doesn't warrant a third gauge. |
| D3 | Height budget | **≤150px total visible content** (revised 2026-05-18 during Set 029 Session 2 mid-S2 after on-device legibility feedback — was ≤100px in the original audit-locked text; the operator IS the one who set the original constraint AND the one who relaxed it). VS Code's standard view header (~22px) sits above this. Semi-circle gauges at ~100×54 fit comfortably; full-circle gauges do not. See CHANGELOG [0.14.2] §"Mid-S2 sizing + responsive-wrap revision" for the full revision detail. |
| D4 | Location | **New webview view (`dabblerOrchestratorIndicator`) pinned above `dabblerSessionSets` in the existing `dabblerSessionSetsContainer`.** Not a status-bar item (operator's framing was "panel at the top of Session Set Explorer"). |
| D5 | Color polarity | **SUPERSEDED 2026-05-18 round 2.** Original audit-locked value: "Red = low-tier / low-effort (warning state), green = flagship / max-effort (preferred state)." Revised after on-device operator review: gauge color is now **valence-neutral, drawn from the IBM 5-color colorblind-safe categorical palette** (`#648FFF` blue, `#785EF0` purple, `#DC267F` magenta, `#FE6100` orange, `#FFB000` yellow). Encoding is categorical (which level) not semantic (good/bad) — because Haiku is the right pick for cheap tasks, not a failure state. The "current orchestrator doesn't match recommendation" semantic moved from gauge color to a separate `≠ recommended` badge driven by ai-assignment.md. See CHANGELOG [0.14.2] §"Post-S2 polish — operator-feedback round 2". |
| D6 | Effort scale | **Five normalized levels** (Low / Medium / High / Extra-High / Max), mapping from provider-native scales as follows. Thinking on/off is a separate binary LED. |
| D7 | Marker file | **`~/.dabbler/current-orchestrator.json`** (global, user-home, single canonical file). Multi-writer: each provider's hook/shim writes the same file. Schema in Session 1 audit deliverable. |
| D8 | Hook installer | **Per-provider commands, but only Claude installs an actual hook** (per audit Q2/Q4/Q5): Claude = `SessionStart` hook in `~/.claude/settings.json` (NOT `Stop` — Stop has no `model` field per audit S1). Codex = `~/.codex/config.toml` watcher (no user-facing install; auto-activates). Gemini/Copilot = "installer" command opens the manual-override quickpick with provider preset (manual-only in v1). Universal manual-override (`Dabbler: Set Orchestrator Model & Effort`) supports MRU ordering + hotkey-bindable command args per audit E4. |
| D9 | Set structure | **Single set, audit-then-implement.** 4 sessions: S1 design audit, S2 core webview + Claude path, S3 non-Claude detection, S4 polish + release. |
| D10 | Backwards compatibility | **No legacy behavior to preserve.** This is a net-new view. Empty/missing marker file = "No signal" empty state with install CTA. |

### Effort-level normalization table (locked)

| Normalized | Claude Code | Gemini Code Assist | Codex | GitHub Copilot |
|---|---|---|---|---|
| Low (0-25) | (no native control)\* | Low | Low (Intelligence) | Low (Thinking Effort) |
| Medium (26-50) | **default** | Medium | Medium | Medium |
| High (51-75) | `/think` (last-observed only) | High | High | High |
| Extra-High (76-90) | `/megathink` (last-observed only) | Extra-High | Extra-High | Extra-High |
| Max (91-100) | `/ultrathink` (last-observed only) | Max | (not exposed) | (not exposed) |

\* **REVISED per audit Q1/S2 (2026-05-17, refined 2026-05-18):**
Claude Code has no per-message effort slider; treating the most
recent `/think*` invocation as "current effort" would recreate the
false-confidence failure mode this feature is designed to prevent.
GPT-5.4 was explicit on this; Gemini Pro supported the broader
anti-lagging-signal concern. Locked design: effort gauge shows
**Medium (default)** for Claude sessions. If a `/think*` invocation
is observed during the session, the gauge displays the corresponding
tier with `signalKind: "last-observed"`, a time-elapsed sublabel
("(last /think Xm ago)"), a small clock-icon overlay on the gauge,
and hollow-rim + filled-needle visual treatment — three independent
"this is not live" cues, because hollow-rim alone proved too easy
to misread at small gauge sizes (per post-audit verifier finding
2026-05-18). Resets to Medium on `SessionStart` ONLY when both
conditions are verified in Session 2: (a) `/clear` fires
`SessionStart`, AND (b) `/clear` resets effort to Medium
semantically. Otherwise `last-observed` is preserved across
`/clear`; see **R7**.

### Thinking on/off (binary LED beside effort gauge)

| Provider | Source |
|---|---|
| Claude Code | "On" whenever any `/think*` was used in current session; else "Off". |
| Gemini Code Assist | "Thinking" toggle in the IDE panel. Direct read. |
| Codex | (no native concept) — LED hidden, only the Intelligence gauge shows. |
| GitHub Copilot | (no native concept) — LED hidden, only the Thinking Effort gauge shows. |

---

## Resolved design questions (from cross-provider audit 2026-05-17)

Cross-provider audit conducted 2026-05-17 with GPT-5.4 and Gemini Pro.
Full audit at
`docs/proposals/2026-05-17-model-effort-gauges-design-audit/audit-summary.md`.
Question numbering aligns with the audit proposal — the original spec
Q1 ("marker file schema") was rolled into D7's marker-schema
deliverable and is now captured in the audit-summary's "Marker file
schema (REVISED — locked)" section.

- **Q1 — Claude Code effort representation.** Locked: Medium default;
  recent `/think*` invocations shown as `signalKind: "last-observed"`
  with "(last /think Xm ago)" sublabel + clock-icon overlay (per
  refined 2026-05-18 visual treatment). Reset to Medium on
  `SessionStart` only when both `/clear`-fires-SessionStart and
  `/clear`-resets-effort are true (Session 2 verification step).
  → `audit-summary.md` §Q1.
- **Q2 — Gemini Code Assist detection.** Locked: manual-only for v1.
  No documented persisted state. → `audit-summary.md` §Q2.
- **Q3 — Codex detection.** Locked: read `~/.codex/config.toml` on
  activation + filesystem watcher. `signalKind: "configured-default"`.
  NOT a live signal. → `audit-summary.md` §Q3.
- **Q4 — GitHub Copilot detection.** Locked: manual-only for v1. Old
  settings keys deprecated, no current public key. →
  `audit-summary.md` §Q4.
- **Q5 — Claude Code hook protocol.** Locked: use `SessionStart`
  (NOT `Stop` — Stop has no `model` field). Mid-session `/model`
  changes NOT auto-detected in v1; manual override is the recovery
  path. → `audit-summary.md` §Q5.
- **Q6 — Stale-signal recovery UX.** Locked: 8h default
  (`stalenessMaxSec: 28800`); visually distinct stripe pattern for
  stale; always show "last updated" timestamp. →
  `audit-summary.md` §Q6.

### Showstoppers identified and mitigated

The audit surfaced five showstoppers, all resolved with concrete
mitigations now folded into the locked design:

- **S1**: Claude Stop hook has no `model` field → switched to
  `SessionStart` (Q5).
- **S2**: `/think*`-as-current-effort recreates the failure mode →
  Medium default + last-observed treatment (Q1).
- **S3**: `initialSize` is not a real VS Code contributes.views
  property → dropped; ordering/sizing best-effort + Playwright
  screenshot assertions in Session 2.
- **S4**: Stop hook timing makes gauge lagging → same fix as S1.
- **S5**: Windows atomic-write contention with file watcher →
  retry loop (**REVISED 2026-05-18**: 5 attempts = initial + 4
  retries at 50/200/600/1200ms backoff between attempts, ~2050ms
  total ceiling) in all marker writers (Session 2 / Session 3
  implementation). Shared helper also implements multi-writer
  precedence read-check-rewrite (see audit-summary §"Multi-writer
  precedence").

### Marker schema bumped to v2

The audit introduced two new schema fields (`signalKind` and
`confidence`) with breaking semantics; canonical schema lives in
`audit-summary.md` "Marker file schema (REVISED — locked)" section.

---

## Sessions

### Session 1 of 4: Cross-provider design audit

**Goal:** Lock the six open design questions (Q1–Q6) via a
cross-provider verification call against the design proposal. Produce
an `audit-summary.md` whose verdicts feed Session 2's implementation.

**Steps:**

1. Author the design proposal as a single markdown doc at
   `docs/proposals/2026-05-17-model-effort-gauges-design-audit/proposal.md`,
   incorporating all 10 locked decisions and the 6 open questions.
   Include ASCII wireframes of the gauge layout (mirroring the spec's
   "Goal state" section).
2. **WAIVED 2026-05-18 (operator-confirmed):** the originally-planned
   `route_audit.py` helper was waived in favor of manual paste-and-
   collect against GPT-5.4 + Gemini Pro (per memory
   `feedback_ai_router_usage` — router is reserved for end-of-session
   verification). The raw reviewer responses are preserved at
   `gpt-5-4-result.json` and `gemini-pro-result.json`. There is no
   `route_audit.py` file; future maintainers should not expect one.
3. Capture each verifier's verdict as `gpt-5-4-result.json` and
   `gemini-pro-result.json`.
4. Synthesize verdicts into `audit-summary.md`, locking each of Q1–Q6
   with a concrete answer. Where the two verifiers disagree, flag
   the disagreement and pick a tiebreaker; document the tiebreaker
   rationale.
5. Update this spec.md's "Open design questions" section to mark each
   Q resolved with a one-line summary pointing at `audit-summary.md`.
   The full resolution lives in the summary doc — don't duplicate.
6. Verify Session 1 itself via a `task_type='session-verification'`
   call (gpt-5-4) before close-out. **REVISED 2026-05-18:** the
   verifier returned a punch list of must-fix items spanning
   doc-accuracy drift (Bucket 1) and design refinements (Bucket 2).
   Bucket 2 was routed through a cross-engine consensus call
   (`route_consensus.py`, gpt-5-4 + gemini-pro) per the new memory
   `feedback_prefer_ai_consensus_over_human_prompt`; both engines
   accepted the proposed direction with gpt-5-4 adding five
   tightening modifications. Fixes applied to `audit-summary.md`
   and this spec; **Round B verification** confirms the fixes before
   close-out.

**Creates:**
- `docs/proposals/2026-05-17-model-effort-gauges-design-audit/proposal.md`
- `docs/proposals/2026-05-17-model-effort-gauges-design-audit/gpt-5-4-result.json`
- `docs/proposals/2026-05-17-model-effort-gauges-design-audit/gemini-pro-result.json`
- `docs/proposals/2026-05-17-model-effort-gauges-design-audit/audit-summary.md`
- `docs/session-sets/029-orchestrator-model-effort-gauges/session-reviews/session-001/`
  (prompt.md + prompt.rendered.md + route_verify.py + verify-result.json
  + route_consensus.py + consensus-gpt-5-4.json + consensus-gemini-pro.json
  + route_verify_round_b.py + verify-result-round-b.json
  + session-001-review.md)

**Touches:**
- `docs/session-sets/029-orchestrator-model-effort-gauges/spec.md`
  (mark Q1–Q6 resolved, point at `audit-summary.md`)

**Ends with:** All six open design questions resolved, audit-summary
checked in, spec.md updated, session verification VERIFIED.

**Progress keys:** `session-001/proposal-drafted`, `session-001/audit-routed`,
`session-001/audit-summary-locked`, `session-001/spec-updated`,
`session-001/session-verified`

**Estimated cost:** $0.30–$0.80 (two audit calls + one verification
call; range based on `project_verification_cost_empirical` p50=$0.13,
p95=$1.82).

---

### Session 2 of 4: Core webview + Claude detection + hook installer

**Goal:** Ship the gauge UI end-to-end for the Claude Code surface.
The webview renders, the marker-file watcher fires, the Claude Code
`SessionStart` hook can be installed in one click, and the gauges
update on session start (and on `/think*` invocations if hook payload
exposes message text). Other surfaces show "No signal — install hook"
placeholder.

**Steps (REVISED per audit 2026-05-17):**

1. **Webview view registration.** Add `dabblerOrchestratorIndicator`
   to `package.json` `contributes.views.dabblerSessionSetsContainer`
   with `type: "webview"`. Order it **first** in the array. **Do NOT
   use `initialSize`** (per audit S3 — not a real VS Code contributes.views
   property). Ordering and sizing are best-effort; Playwright screenshot
   assertions in step 7 below catch regressions.
2. **Webview provider.** Implement
   `tools/dabbler-ai-orchestration/src/providers/orchestratorIndicatorProvider.ts`
   as a `WebviewViewProvider`. HTML+CSS based on the dev.to gauge
   reference (https://dev.to/madsstoumann/how-to-create-gauges-in-css-3581)
   adapted to semi-circle form factor. Two gauges + thinking LED +
   provider/model label. Visual-treatment matrix for the four
   `signalKind` values (per audit-summary §"Visual treatment by
   signalKind" REVISED 2026-05-18 — stripes are stale-only):
   - `current`: solid fill, solid rim, no badge
   - `configured-default`: solid fill at ~85% opacity, **dashed
     rim**, **"DEFAULT" pill badge** below model name
   - `last-observed`: hollow rim + filled needle + **clock-icon
     overlay** (top-right ~12×12px) + "(last /think Xm ago)" suffix
   - `manual`: solid fill + small operator-icon overlay
   Tooltip copy embeds confidence explicitly per the matrix
   ("live signal (high confidence)", "configured default (medium
   confidence — does not track runtime changes)", etc.).
   Last-updated timestamp always visible (small text below sublabel).
3. **Marker-file reader and watcher.** Use `vscode.workspace.createFileSystemWatcher`
   with absolute path `~/.dabbler/current-orchestrator.json`. Marker
   schema v2 (with `signalKind` + `confidence` per audit). Stale state
   (>`stalenessMaxSec`, default 28800s = 8h): **diagonal-stripe
   overlay at ~50% opacity** over whatever the underlying signalKind
   treatment is (signal-agnostic) + "last updated Xh ago"
   annotation, no install-hook CTA. Stripes are stale-only —
   `configured-default` no longer uses stripes (it uses a dashed
   rim + DEFAULT pill instead) so the two states are now
   distinguishable at small gauge sizes.
4. **Empty state.** When marker file is missing, render solid grey
   gauges + "No signal — install hook" CTA. CTA fires the
   `Dabbler: Install Orchestrator Hook (Claude Code)` command.
5. **Claude Code SessionStart hook installer.** New command
   `dabbler.installOrchestratorHook.claudeCode`. Reads
   `~/.claude/settings.json` (or creates if missing), idempotently
   appends a `SessionStart` hook entry (**NOT `Stop`** — per audit S1
   Stop has no `model` field) that pipes the hook payload to a helper
   script which extracts `.model` and writes
   `~/.dabbler/current-orchestrator.json` with `signalKind: "current"`,
   `confidence: "high"`, `effort.normalized: "medium"`, `effort.signalKind: "current"`.
   **Confidence-low producer rule (REVISED 2026-05-18):** if the hook
   payload's `.model` is missing/null/unparseable, the helper writes
   `confidence: "low"` + `model: "unknown"` + `modelDisplayName:
   "Claude (model unknown)"`. The tooltip reflects this: "live signal
   (low confidence — hook payload missing model)".
   Helper script ships at
   `tools/dabbler-ai-orchestration/scripts/write-orchestrator-marker.js`.
   **Marker writer implements retry loop** (REVISED 2026-05-18:
   **5 attempts = initial + 4 retries at 50/200/600/1200ms** backoff
   between attempts, ~2050ms total ceiling) per audit S5 REVISED to
   handle Windows file-lock contention with the VS Code file watcher.
   **Marker writer also implements multi-writer precedence** (per
   audit-summary §"Multi-writer precedence"): read existing target →
   compare `signalKind` precedence (`current` > `manual` >
   `last-observed` > `configured-default`) → re-read immediately
   before atomic rename → skip write if proposed signal is weaker
   than fresh existing signal; log skipped writes to
   `~/.dabbler/orchestrator-writer.log`. ~30 LOC shared helper;
   reused by Session 3 writers.
   **Pre-implementation verification (NEW 2026-05-18):** verify
   whether Claude `/clear` (a) fires the `SessionStart` hook AND
   (b) resets effort to Medium semantically. The `SessionStart` hook
   only clobbers a fresh `last-observed` effort signal when BOTH
   are true. If either is false, preserve `last-observed` across
   `/clear`; document the asymmetry in CHANGELOG and as **R7**.
6. **Effort tracking (best-effort).** Also install a `UserPromptSubmit`
   hook that detects `/think*` invocations in user messages and updates
   the marker's `effort.normalized` with `effort.signalKind: "last-observed"`,
   `effort.native: "/think"` (or megathink/ultrathink), and
   `effort.observedAt: <ISO timestamp>` (used by the webview to
   render the time-elapsed suffix "(last /think Xm ago)"). **If
   `UserPromptSubmit` does not expose message text in its payload,
   fall back to Medium-only effort for Claude** and document the
   limitation in CHANGELOG. Verify field availability as the first
   step of implementation.
7. **Layer 3 Playwright smoke + screenshot assertions** (clean
   profile — container-height cannot be guaranteed against
   user-resized profiles per audit-summary §S3). Scenarios at
   `tools/dabbler-ai-orchestration/tests/playwright/orchestrator-indicator.spec.ts`:
   - seed marker with Claude Opus + `signalKind: "current"`, assert
     solid-fill gauge needle in flagship zone
   - rewrite with Haiku + `signalKind: "current"`, assert needle moves
     to low zone
   - rewrite with `signalKind: "current"` + `confidence: "low"` +
     `model: "unknown"`, assert tooltip shows "live signal (low
     confidence — hook payload missing model)"
   - rewrite with `effort.signalKind: "last-observed"`, assert
     hollow-rim + clock-icon overlay + time-elapsed suffix on
     effort gauge
   - rewrite with `signalKind: "configured-default"`, assert dashed
     rim + DEFAULT pill badge (NOT stripes — stripes are stale-only)
   - rewrite `updatedAt` to 9h ago, assert stale state (diagonal-
     stripe overlay at 50% opacity over the underlying treatment +
     "last updated 9h ago" annotation)
   - **Screenshot assertion** verifies the view container ordering
     (orchestrator indicator above session sets tree) in a clean
     profile.
   - Multi-writer precedence smoke: write `configured-default`
     marker, then write `current` (should replace), then write
     `configured-default` again (should be skipped — log
     line written to `orchestrator-writer.log`).
8. **Version bump:** `package.json` 0.13.17 → 0.13.18.
9. **CHANGELOG:** new entry under 0.13.18 noting Claude-only v1
   preview with explicit limitations:
   - starting model only (no runtime `/model` detection in v1)
   - effort best-effort (Medium default plus last-observed `/think*`
     if `UserPromptSubmit` hook supports message text)
   - manual-override quickpick available for any state the hook
     misses
   - **container height cannot be guaranteed** (per audit-summary §S3):
     content is sized to fit within 100px, but VS Code persists
     user-resized view heights; if the operator has previously
     dragged the divider, that height is restored. To reset, drag
     the divider back. Content remains scrollable if compressed.
   - **/clear-vs-SessionStart asymmetry** (if applicable per the
     pre-implementation verification): if `/clear` does not fire
     SessionStart or does not reset effort, `last-observed`
     `/think*` signals persist across `/clear`.
   Mark non-Claude paths as "coming in 0.14.0".

**Creates:**
- `tools/dabbler-ai-orchestration/src/providers/orchestratorIndicatorProvider.ts`
- `tools/dabbler-ai-orchestration/src/commands/installOrchestratorHookClaudeCode.ts`
- `tools/dabbler-ai-orchestration/scripts/write-orchestrator-marker.js`
- `tools/dabbler-ai-orchestration/tests/playwright/orchestrator-indicator.spec.ts`
- `tools/dabbler-ai-orchestration/media/orchestrator-indicator/` (CSS, optional fonts/icons)

**Touches:**
- `tools/dabbler-ai-orchestration/package.json` (view registration, command, version)
- `tools/dabbler-ai-orchestration/src/extension.ts` (register provider + command)
- `tools/dabbler-ai-orchestration/CHANGELOG.md`
- `CLAUDE.md` (brief note under "VS Code extension" pointing at the new view)

**Ends with:** Claude Code path live; Playwright smoke passing locally;
0.13.18 packaged but not yet published (publish in S4).

**Progress keys:** `session-002/webview-registered`, `session-002/provider-implemented`,
`session-002/marker-watcher-wired`, `session-002/claude-hook-installer-shipped`,
`session-002/playwright-smoke-green`, `session-002/version-bumped`

**Estimated cost:** $0.10–$0.30 (single end-of-session verification;
implementation work is all local Claude tokens).

---

### Session 3 of 4: Non-Claude provider detection + manual override

**Goal:** Add detection paths per the Session 1 audit's locked
resolutions: Codex auto-detect via `~/.codex/config.toml` watcher
(configured-default signal); Gemini Code Assist and GitHub Copilot
manual-only in v1 (no documented persisted state). Universal
manual-override quickpick with MRU + hotkey-bindable args.

**Steps (REVISED per audit 2026-05-17):**

1. **Codex detection (auto).** Read `~/.codex/config.toml` on extension
   activation and via filesystem watcher. Parse `model` and
   `model_reasoning_effort` fields. Write marker with
   `signalKind: "configured-default"`, `confidence: "medium"`,
   `effort.signalKind: "configured-default"`. **Document honestly**
   in the hover tooltip: "configured default (medium confidence —
   does not track runtime changes from `~/.codex/config.toml`)".
   Marker writer reuses the retry-loop helper from Session 2
   (5 attempts, 50/200/600/1200ms backoff) AND the multi-writer
   precedence read-check-rewrite helper — a `configured-default`
   write will be skipped if a fresh `current`/`manual`/`last-observed`
   signal exists, preventing the failure mode where a Codex
   config-watcher fire stomps a live Claude session signal.
2. **Gemini Code Assist: manual-only.** Per audit Q2 — no documented
   persisted state. The `Dabbler: Install Orchestrator Hook (Gemini Code Assist)`
   command opens the manual-override quickpick with `provider: "google"`
   pre-selected. No actual hook is installed.
3. **GitHub Copilot: manual-only.** Per audit Q4 — old settings keys
   deprecated, no current public key. The `… (GitHub Copilot)` command
   opens the manual-override quickpick with `provider: "github"`
   pre-selected. No actual hook installed.
4. **Manual-override quickpick** (`dabbler.setOrchestrator`)
   (REVISED 2026-05-18 — single-picker-with-MRU-plus-multi-step-
   fallback shape, aligned with audit-summary §"Manual-override
   quickpick UX"):
   - **Top section: MRU tuples**, one row per recent
     `<provider> + <model> + <effort> + <thinking>` combination
     ("Anthropic Opus 4.7 — High effort, Thinking on"), sorted
     most-recent first. Selecting a tuple applies it directly.
     Stored in `~/.dabbler/orchestrator-mru.json`.
   - **Bottom row: "(set new combination…)"** — enters a multi-step
     flow (provider → model → effort → thinking on/off) for novel
     combinations.
   - Both paths write the marker with `signalKind: "manual"`,
     `confidence: "high"` via the shared helper (retry loop +
     multi-writer precedence). **Force-override semantics:** if the
     helper detects a fresher `current`-precedence signal from
     another writer, the quickpick shows a "Override existing live
     signal from <writer>?" confirmation before proceeding.
   - **Accepts command palette args** for hotkey-bindable presets per
     audit E4. Example: operator binds `Ctrl+Shift+Alt+O` to
     `dabbler.setOrchestrator` with args `{"provider":"anthropic","model":"claude-opus-4-7","effort":"high","thinking":true}`
     for one-keystroke "back to Opus full power". Hotkey-bindable
     calls also pass through the force-override confirmation when
     applicable.
   - "(create new hotkey binding)" item below the multi-step entry:
     copies the `keybindings.json` snippet to clipboard pre-filled
     with the current selection.
5. **Smart empty-state CTA.** Webview detects which orchestrator
   extensions/CLIs are installed (presence of Claude Code, Gemini Code
   Assist extension, Codex CLI on PATH, GitHub Copilot extension) and
   surfaces the *right* installer/preset command in the "No signal"
   CTA — not a generic "install hook" link. If multiple are detected,
   show the most-recently-used per MRU.
6. **Playwright smoke expansion.** Add scenarios:
   - `signalKind: "configured-default"` for Codex — verify dashed
     rim + DEFAULT pill badge visual treatment on both gauges (NOT
     stripes — REVISED 2026-05-18)
   - `signalKind: "manual"` for Gemini and Copilot — verify
     operator-icon overlay visual treatment
   - MRU quickpick reordering (write 3 manual overrides, reopen
     quickpick, assert MRU order)
   - Force-override prompt: seed `current` Claude marker, invoke
     manual-override, assert the "Override existing live signal
     from <writer>?" confirmation appears.
   - Multi-writer precedence skip: write `current` then write
     `configured-default`, assert the `configured-default` write
     is skipped and a line is appended to `orchestrator-writer.log`.
7. **Version bump:** 0.13.18 → 0.14.0 (minor — multi-provider
   feature-complete).

**Creates:**
- `tools/dabbler-ai-orchestration/src/commands/installOrchestratorHookGemini.ts`
  (opens manual-override quickpick with `provider: "google"`
  pre-selected — no actual hook installed)
- `tools/dabbler-ai-orchestration/src/commands/installOrchestratorHookCopilot.ts`
  (opens manual-override quickpick with `provider: "github"`
  pre-selected — no actual hook installed)
- `tools/dabbler-ai-orchestration/src/commands/setOrchestratorManual.ts`
  (universal manual-override quickpick)
- `tools/dabbler-ai-orchestration/src/codex/configWatcher.ts`
  (REVISED 2026-05-18 per audit Q3 / D8 / Round-C verifier finding:
  Codex auto-detect is a config-watcher shim, NOT an installer
  command. Activated automatically on extension start; no
  user-facing installer command file)
- (possibly) provider-specific shim scripts under
  `tools/dabbler-ai-orchestration/scripts/`

**Touches:**
- `tools/dabbler-ai-orchestration/src/providers/orchestratorIndicatorProvider.ts`
  (smarter empty-state CTA)
- `tools/dabbler-ai-orchestration/package.json` (**3 new commands**
  — installer-Gemini, installer-Copilot, setOrchestratorManual;
  Codex auto-detection has no command, just a watcher activated
  at extension start; REVISED 2026-05-18)
- `tools/dabbler-ai-orchestration/src/extension.ts`
- `tools/dabbler-ai-orchestration/tests/playwright/orchestrator-indicator.spec.ts`
- `tools/dabbler-ai-orchestration/CHANGELOG.md`

**Ends with:** All four orchestrator surfaces are supported (auto
where viable, manual override where not). Layer 3 smoke green for
all four. 0.14.0 packaged but not published.

**Progress keys:** `session-003/gemini-detection`, `session-003/codex-detection`,
`session-003/copilot-detection`, `session-003/manual-override-shipped`,
`session-003/smart-empty-state`, `session-003/playwright-smoke-all-four`

**Estimated cost:** $0.10–$0.30.

---

### Session 4 of 4: Polish, README, marketplace publish

**Goal:** Final polish, README update with screenshot, version bump to
0.14.1 if anything moves, publish to Marketplace.

**Steps:**

1. **README screenshot + section.** Add a "Orchestrator Indicator"
   section to the extension README (and the repo-root README if it
   has a screenshot reel). PNG screenshot at
   `tools/dabbler-ai-orchestration/media/screenshots/orchestrator-indicator.png`.
2. **CHANGELOG consolidation.** Merge 0.13.18 + 0.14.0 + 0.14.1
   entries into a coherent feature note. Cross-link to the audit
   doc.
3. **CLAUDE.md update.** Expand the brief note from S2 into a proper
   subsection under "VS Code extension" naming the view, the marker
   file, the hook installers, and the manual override.
4. **Marketplace publish.** `cd tools/dabbler-ai-orchestration &&
   npx vsce publish --pat $env:AZURE_VSCODE_MARKETPLACE_TOKEN`
   (per memory `reference_vsce_pat`). Operator-confirms before
   publishing.
5. **Cross-repo notification.** Drop a brief note in each consumer
   repo's CLAUDE.md or equivalent pointing at the new view (only
   where it materially changes the workflow — likely just a
   one-liner in each).

**Creates:**
- `tools/dabbler-ai-orchestration/media/screenshots/orchestrator-indicator.png`

**Touches:**
- `tools/dabbler-ai-orchestration/README.md`
- `README.md` (repo root, if it has a feature reel)
- `tools/dabbler-ai-orchestration/CHANGELOG.md`
- `CLAUDE.md`
- `tools/dabbler-ai-orchestration/package.json` (version, if 0.14.1 needed)
- Consumer-repo CLAUDE.md files (one-liner pointers)

**Ends with:** Marketplace 0.14.0 (or 0.14.1) live; README and CLAUDE.md
reflect the new feature; consumer repos pointed at it.

**Progress keys:** `session-004/readme-updated`, `session-004/changelog-merged`,
`session-004/claudemd-expanded`, `session-004/marketplace-published`,
`session-004/consumer-repos-notified`

**Estimated cost:** $0.05–$0.15.

---

## Risks

- **R1 — Detection viability.** The audit may discover that
  Gemini/Codex/Copilot expose no programmatic way to read current
  effort/model. Mitigation: manual-override command is the universal
  fallback; v1 ships honestly with "manual only" for any surface
  that can't be auto-detected.
- **R2 — Hook payload format drift.** Claude Code's `SessionStart` /
  `UserPromptSubmit` hook payload schemas may change between
  extension versions (REVISED 2026-05-18: was previously worded
  against `Stop` hook, which the audit rejected — see audit-summary
  §Q5). Mitigation: the helper script (`write-orchestrator-marker.js`)
  parses defensively and emits `signalKind: "current"` +
  `confidence: "low"` + `model: "unknown"` on schema miss (per
  Session 2 step 5 confidence-low producer rule). No crash; the
  tooltip surfaces the low-confidence reason explicitly.
- **R3 — 100px is tight.** If audit reviewers prefer larger gauges
  for legibility, we may need to compromise: ≤100px content area
  (excluding VS Code's view header). Audit reviews this explicitly.
- **R4 — Marker-file race conditions.** Multiple orchestrator
  surfaces writing the same marker file could race. Mitigation:
  atomic writes (write + rename) plus **multi-writer precedence**
  (REVISED 2026-05-18 per audit-summary §"Multi-writer precedence"):
  every writer reads the existing target, compares `signalKind`
  precedence (`current` > `manual` > `last-observed` >
  `configured-default`), re-reads immediately before the atomic
  rename to close the TOCTOU race window, and skips the write if
  the proposed signal is weaker than a fresh existing signal.
  Skipped writes are logged to `~/.dabbler/orchestrator-writer.log`.
- **R5 — Windows atomic-write contention** (added per audit S5;
  REVISED 2026-05-18). Atomic write-and-rename on Windows 11
  intermittently throws `PermissionError` when the VS Code file
  watcher is active on the target. Mitigation: all marker writers
  (Claude SessionStart hook script, Codex config.toml watcher,
  manual-override quickpick) implement retry loop with exponential
  backoff: **5 attempts = initial + 4 retries, 50/200/600/1200ms
  backoff between attempts, ~2050ms total ceiling**. (Was 3
  attempts at 50/150/400ms = 600ms before the 2026-05-18 verifier
  finding flagged the ceiling as too short for typical Windows
  AV-plus-file-watcher contention.) Helper shared across all four
  writer paths.
- **R6 — `UserPromptSubmit` hook may not expose message text**
  (added per audit). Required to detect `/think*` invocations for
  Claude effort tracking. Mitigation: Session 2 step 6 verifies field
  availability first; if not available, falls back to Medium-only
  effort for Claude (already the audit-locked default) and documents
  the limitation in CHANGELOG. No code crash either way.
- **R7 — `/clear`-vs-`SessionStart` asymmetry** (added 2026-05-18
  per post-audit verifier finding Q7 #3). The Q1 design says effort
  resets to Medium on `SessionStart`. If Claude `/clear` does not
  fire `SessionStart`, or fires it but does not reset effort
  semantically, a stale `last-observed` `/think*` signal will
  persist across `/clear` and the gauge may display effort from
  before the clear. Mitigation: Session 2 step 5
  pre-implementation verification checks both conditions; clobber
  on `/clear` is gated on BOTH being true. If either is false,
  `last-observed` is preserved across `/clear` and the asymmetry
  is documented in CHANGELOG. Operator has manual-override
  quickpick as universal reset.

## Routing notes (REVISED 2026-05-18)

- **Audit calls (S1): WAIVED.** The originally-planned
  `route_audit.py` call was waived per memory `feedback_ai_router_usage`
  (router reserved for end-of-session verification). The audit was
  conducted by manual paste-and-collect against GPT-5.4 + Gemini
  Pro; raw responses preserved at
  `docs/proposals/2026-05-17-model-effort-gauges-design-audit/{gpt-5-4,gemini-pro}-result.json`.
  Cost: **$0.00**.
- **Session-end verification (S1, S2, S3, S4):**
  `task_type='session-verification'`, single verifier (gpt-5-4)
  via `ai_router.query(...)`. S1 actually used three routed calls
  (Round A verification + cross-engine consensus on must-fix items +
  Round B confirmation), per the new memory
  `feedback_prefer_ai_consensus_over_human_prompt` carve-out.
- **In-session consensus calls (NEW class, 2026-05-18):** when a
  verifier returns a punch list of design refinements, the
  must-fix items are routed through GPT-5.4 + Gemini Pro for
  consensus before applying. This supersedes
  `feedback_ai_router_usage` for design-question consensus only;
  implementation work in S2/S3/S4 still uses pure Claude tokens.
- **Implementation work (S2, S3, S4):** pure Claude tokens, no
  router invocation.

## Total estimated cost (REVISED 2026-05-18, actuals through S1)

- **Session 1 actual: ~$0.85** — Round A verification $0.264 +
  cross-engine consensus (gpt-5-4 + gemini-pro) $0.085 + Round B
  $0.138 + Round C $0.358. Round C cost was higher than typical
  ($0.36 vs. p50 $0.13) because gpt-5-4 emitted 22k output tokens
  on a tight prompt — note for future verifier-bundle sizing.
  Three routed verification rounds were needed because each
  successive bundle exposed previously-uninspected sections of
  spec.md with pre-audit drift (Round B caught Goal-state region;
  Round C caught Session 3 "Creates" leftover). All converged
  cleanly — no verifier spiral per memory
  `feedback_verifier_spiral_recruit_codex`.
- **Sessions 2–4 forecast: $0.30 – $0.90** (three session-end
  verifications; range based on memory `project_verification_cost_empirical`
  p50=$0.13, p95=$1.82).
- **Total forecast: $1.15 – $1.75**, against the operator's
  **$5.00 NTE ceiling** for the set (confirmed 2026-05-18 at S1
  resume time).
