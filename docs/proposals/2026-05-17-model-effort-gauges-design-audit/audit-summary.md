# Audit summary: orchestrator model & effort indicator gauges

**Date:** 2026-05-17
**Reviewers consulted:** GPT-5.4, Gemini Pro
**Status:** Audit complete; all six open questions resolved with locked
verdicts. Five showstoppers identified and resolved with concrete
mitigations. Spec and implementation plan updated accordingly.

> **Post-implementation revisions (2026-05-18, Set 029 Session 2):**
> Two audit-locked decisions were relaxed by the operator after
> on-device review of the rendered gauges. Both phrasings in this doc
> are now superseded; the spec.md sections carry the same revision
> notes pointing at CHANGELOG [0.14.2].
>
> **D3 (height budget): ≤100px → ≤150px.** Original constraint felt
> too small for legibility once gauges + fonts were rendered. Gauge
> SVG dimensions 70×38 → 100×54 (~43% bigger); font sizes bumped
> ~40-50%; responsive wrap (now via `@container`, not `@media`) so
> the second gauge stacks below the first at panel widths <260px.
>
> **D5 (color polarity): red→green → IBM 5-color colorblind-safe
> categorical palette** (`#648FFF` `#785EF0` `#DC267F` `#FE6100`
> `#FFB000`). The red→green encoding implied "Haiku is bad, Opus is
> good" — but Haiku is the right pick for cheap tasks, not a failure
> state. Gauge color is now purely categorical (which level, not
> good/bad). The "current orchestrator doesn't match the
> recommendation" signal moved from gauge color to a separate
> valence-neutral `≠ recommended` badge driven by ai-assignment.md.
>
> See CHANGELOG [0.14.2] §"Post-S2 polish — operator-feedback round 2"
> and memory `gauges-sizing-followup` (which also covers the palette
> shift now) for the full detail.

> **Process note.** The audit was conducted by manual paste-and-collect
> rather than via `ai_router.route()`, per operator preference and
> memory `feedback_ai_router_usage` (router reserved for end-of-session
> verification). GPT-5.4 returned a comprehensive prose review with
> primary-doc citations; Gemini Pro returned freeform commentary
> covering Q5 and two showstopper escalations but did not produce
> structured answers for Q2/Q3/Q4/Q6. Where Gemini was silent on a
> question, GPT-5.4's answer carries it.

---

## Convergence & divergence

The two reviewers converged on the most consequential finding (Q5).
Where one was silent and the other spoke, the speaker's verdict
stands; the table below distinguishes "agreed" from "carried by one
reviewer" rather than overclaiming consensus.

| Topic | GPT-5.4 | Gemini Pro | Outcome |
|---|---|---|---|
| Q5 — Claude Stop hook | Wrong on field-availability (Stop has no `model`) | Wrong on timing (Stop is lagging) | **Strong agreement**: reject Stop, use SessionStart |
| Q1 — Claude effort | Explicit: Medium default; `/think*` as `last-observed`, not current | Did not directly address `/think*` persistence; spoke to the broader anti-lagging-signal concern via `Stop` framing | **GPT-5.4 explicit; Gemini supports broader anti-lagging-signal concern** |
| Q2 — Gemini Code Assist detection | Manual-only for v1 (no documented persisted state) | Silent | **GPT-5.4 carries; no contradiction** |
| Q3 — Codex detection | Read `config.toml` as `configured-default` | Silent | **GPT-5.4 carries; no contradiction** |
| Q4 — GitHub Copilot detection | Manual-only for v1 (deprecated keys, no public replacement) | Silent | **GPT-5.4 carries; no contradiction** |
| Q6 — staleness | 8h default; distinct from no-signal | Silent | **GPT-5.4 carries** |
| Windows atomic-write contention | Not raised | Raised as showstopper (retry loop + backoff required) | **Unique to Gemini, accepted** |
| Schema additions (signalKind, confidence) | Strongly raised | Not raised | **Unique to GPT, accepted** |
| Manual override UX (MRU + hotkeys) | Not raised | Raised as escalation | **Unique to Gemini, accepted** |

There were no substantive contradictions between the reviewers.

> **Post-audit verification (2026-05-18).** A session-verification
> call against this synthesis (gpt-5-4, $0.26) flagged that the
> original "Both reviewers agreed" framing on Q1 and "accepts
> fallback dominance" framing on Q2/Q3/Q4 overstated Gemini's
> participation. The table above is the post-verification rewording.
> A subsequent cross-engine consensus call (gpt-5-4 + gemini-pro,
> $0.085 total) approved the seven design refinements below
> (multi-writer precedence policy, visual-treatment matrix update,
> retry-ceiling bump, etc.) before Session 1 close-out.

---

## Locked resolutions for Q1–Q6

### Q1 — Claude Code effort representation
**LOCKED: option (b)+(c) hybrid.**

For Claude Code sessions, the effort gauge shows **Medium (default)**
unless a `/think*` invocation has been observed within the current
session, in which case the gauge displays the corresponding tier
with `signalKind: "last-observed"` and the time-elapsed in the
sublabel (e.g., "High (last /think 12m ago)"). On `SessionStart`,
the effort tier resets to Medium — provided that `/clear` also
resets effort semantically; otherwise the `last-observed` signal is
preserved across `/clear` (see Session 2 pre-implementation
verification step in `spec.md` and **R7** in the spec's Risks
section).

**Reasoning:** GPT-5.4 explicitly recommended Medium-default with
`/think*` shown only as `last-observed`. Gemini did not address
`/think*` persistence directly but voiced the broader anti-lagging-
signal concern (against treating any post-hoc reading as a current
indicator); the hybrid honors both. The time-elapsed suffix replaces
the bare "(last)" qualifier because the elapsed time visibly ages
on screen — a stronger "this is not live" cue than rim styling alone
at small gauge sizes (per post-audit verifier finding 2026-05-18).

---

### Q2 — Gemini Code Assist Agent detection
**LOCKED: manual-only for v1.**

No documented persisted Effort/Thinking state was found in the
Gemini Code Assist Agent. v1 ships with manual-override only for
Gemini. The empty-state CTA in the webview detects an active
Gemini Code Assist extension and surfaces the manual-override
quickpick command.

**Future:** if Gemini exposes settings or a config file in a later
release, add detection in a follow-on set.

---

### Q3 — Codex detection
**LOCKED: read `~/.codex/config.toml` as `signalKind: "configured-default"`.**

The extension reads Codex's config.toml on activation and on file
change (filesystem watcher). The `model` and `model_reasoning_effort`
fields populate the marker with `signalKind: "configured-default"`
and `confidence: "medium"`. The gauge UI visually distinguishes this
from a `current` signal (see "Visual treatment by signalKind" below).

**Reasoning:** GPT-5.4 confirmed config.toml has these fields and
that their machine has `model_reasoning_effort = "high"` configured.
This is a *useful* signal (it tells us the operator's chosen default)
but it is NOT a live signal — runtime `/model` changes in Codex
won't update the file. The signalKind field communicates that
honestly.

---

### Q4 — GitHub Copilot detection
**LOCKED: manual-only for v1.**

GPT-5.4 confirmed the old settings keys
(`github.copilot.chat.anthropic.thinking.effort`,
`github.copilot.chat.responsesApiReasoningEffort`) are deprecated,
and no current public key exposes live Thinking Effort. Per-model
persistence in the model picker is internal to Copilot.

**Future:** if Copilot adds a public settings key, add detection
in a follow-on set.

---

### Q5 — Claude Code hook protocol (REWRITTEN from original proposal)
**LOCKED: use `SessionStart` hook, not `Stop`. Mid-session `/model`
changes are NOT auto-detected in v1; document the limitation and
provide manual override.**

Documented Claude Code hook payload contents (per GPT-5.4's
primary-doc verification):

- **`SessionStart`** receives a `model` field. **This is the hook
  to use.**
- **`Stop`** receives `session_id`, `transcript_path`, `cwd`,
  `stop_hook_active`, `last_assistant_message` — **but NO `model`
  field.** Original proposal was wrong on this.

Implementation plan:

1. Install a `SessionStart` hook in `~/.claude/settings.json` that
   writes the marker file with the starting model + Medium default
   effort.
2. Install a `UserPromptSubmit` (or similar pre-turn) hook that
   detects `/think*` invocations in the user's message and updates
   the marker's `effort` field with `signalKind: "last-observed"`.
   Verify field availability in Session 2 — if `UserPromptSubmit`
   does not expose the message text, fall back to no effort
   tracking for Claude (Medium default only).
3. **Do not** attempt to detect runtime `/model` changes via hooks
   in v1. The empty-state CTA surfaces the manual-override
   quickpick prominently so the operator has a quick recovery
   path when they switch mid-session.

---

### Q6 — Stale-signal recovery UX
**LOCKED: 8h staleness default; distinct visual treatment from "no signal";
always show "last updated" timestamp.**

- `stalenessMaxSec` default: **28800** (8h), configurable.
- Visual states:
  - **Current:** solid color fill on gauges, full opacity.
  - **Stale:** striped (diagonal hatch) fill, ~60% opacity, "last
    updated Xh ago" annotation below the gauges. No install-hook
    CTA.
  - **No signal:** solid grey, "No signal — install hook" CTA below.
- The "last updated" timestamp is always visible (small text, below
  sublabel) regardless of state. Helps the operator calibrate trust.

---

## Resolved showstoppers (5 total) and mitigations

| # | Showstopper | Source | Mitigation |
|---|---|---|---|
| S1 | Claude Stop hook has no `model` field | GPT-5.4 | Switch to `SessionStart` hook (see Q5) |
| S2 | `/think*`-as-effort recreates false-confidence failure | GPT-5.4 | Effort gauge shows Medium default; `/think*` appears with `signalKind: "last-observed"` (see Q1) |
| S3 | `initialSize` is not in VS Code's contributes.views spec | GPT-5.4 | Drop `initialSize` from the proposal. Treat ordering/sizing as best-effort. Add Playwright screenshot assertions in Session 2 (clean-profile only). **Container height cannot be guaranteed**: VS Code persists user-resized view heights across sessions and extension updates; if the operator has previously dragged the view divider, that height is restored. To reset, drag the divider back. The CSS uses `overflow: auto` so content remains scrollable if compressed below 100px. Document this limitation in `CHANGELOG.md` for 0.13.18. |
| S4 | Stop hook timing makes gauge lagging | Gemini | Same fix as S1 (SessionStart fires before turn starts) |
| S5 | Windows atomic-write contention with file watcher → PermissionError | Gemini | Shim script implements retry loop with exponential backoff. **REVISED 2026-05-18** (post-audit verifier finding): 5 total attempts (initial + 4 retries) at 50/200/600/1200ms backoff between attempts, ~2050ms total ceiling. The previous 3-attempt/600ms ceiling was too short for typical Windows file-watcher + antivirus contention. Reused across all four provider writers via shared helper. |

---

## Marker file schema (REVISED — locked)

```json
{
  "schemaVersion": 2,
  "updatedAt": "2026-05-17T14:32:00-04:00",
  "writer": "claude-code-session-start-hook",
  "signalKind": "current",
  "confidence": "high",
  "provider": "anthropic",
  "providerDisplayName": "Claude",
  "model": "claude-opus-4-7",
  "modelDisplayName": "Opus 4.7",
  "tier": "flagship",
  "effort": {
    "normalized": "medium",
    "native": "default",
    "thinking": false,
    "signalKind": "current",
    "confidence": "high"
  },
  "stalenessMaxSec": 28800
}
```

### Changes from the original proposal

- **`schemaVersion`**: bumped to 2 (was 1) — breaking change to
  introduce `signalKind` and `confidence`.
- **`signalKind`** (new, top-level): `"current"` | `"configured-default"` |
  `"last-observed"` | `"manual"`. Top-level `signalKind` describes
  the **model** signal. Drives visual treatment of the model gauge.
- **`confidence`** (new, top-level): `"high"` | `"medium"` | `"low"`.
  Top-level `confidence` describes the **model** signal. Surfaced in
  tooltip copy (see "Visual treatment by signalKind" below);
  doesn't drive gauge color directly. **Concrete producer rule
  (REVISED 2026-05-18 per consensus call):** Session 2's Claude
  hook helper script emits `confidence: "low"` + `model: "unknown"`
  when the SessionStart hook payload's `.model` field is missing,
  null, or unparseable — exercising the field in v1 rather than
  reserving it for future use.
- **`effort.signalKind`** + **`effort.confidence`** (new, nested):
  effort can have a *different* signalKind from the top-level
  (model) signal — e.g., Claude with top-level `signalKind="current"`
  (just session-started) but `effort.signalKind="last-observed"`
  (a `/think*` was issued mid-session).
- **`stalenessMaxSec`**: default raised from 3600 (1h) to 28800 (8h).

### Visual treatment by signalKind (REVISED 2026-05-18)

The previous matrix collided `configured-default` (diagonal stripes)
with the stale-state treatment (also stripes). Diagonal stripes are
now **stale-only** (signal-agnostic, overlaid at 50% opacity on
whatever the underlying signalKind treatment is). `configured-default`
gets a dashed rim plus a small "DEFAULT" pill badge. The
`last-observed` treatment additionally gets a small clock-icon
overlay and a time-elapsed sublabel suffix, because hollow rim alone
proved too easy to misread as live at small gauge sizes.

| signalKind | Gauge fill | Rim | Sublabel suffix | Badge / overlay | Tooltip |
|---|---|---|---|---|---|
| `current` | Solid color | Solid | (none) | (none) | "live signal (high confidence)" |
| `configured-default` | Solid color (~85% opacity) | Dashed | "(default)" | "DEFAULT" pill below model name | "configured default (medium confidence — does not track runtime changes from ~/.codex/config.toml)" |
| `last-observed` | Hollow rim + filled needle | Solid | "(last /think Xm ago)" | small clock-icon overlay (top-right of gauge, ~12×12px) | "last observed Xm ago via /think (high confidence in detection, but may not reflect current message)" |
| `manual` | Solid + small operator-icon overlay | Solid | "(manual)" | (overlay only) | "set manually at HH:MM (high confidence)" |

Stale state (signal-agnostic): diagonal hatch overlay at 50% opacity
over whatever the underlying signalKind treatment is, plus "last
updated Xh ago" annotation. No install-hook CTA. When the underlying
signalKind has its own pattern (e.g., `configured-default`'s dashed
rim), the stripes overlay on top — the two cues are distinguishable
because stale stripes hatch the entire gauge while `configured-default`
only modifies the rim.

If `confidence: "low"` is set (e.g., Claude hook payload missing
the `model` field), the tooltip's confidence parenthetical reflects
that: "live signal (low confidence — hook payload missing model)".

---

## Multi-writer precedence (NEW — locked 2026-05-18)

Marker file `~/.dabbler/current-orchestrator.json` is global and
single-canonical; four providers may write it concurrently. Without
arbitration, a Codex `configured-default` background write could
stomp a fresh Claude `current` signal — exactly the failure mode
this feature exists to prevent.

**Policy.** Marker writers MUST read the current file, compare
`signalKind` precedence, and skip the write if the proposed signal
is weaker than the existing fresh signal.

Precedence (high → low): `current` > `manual` > `last-observed` >
`configured-default`.

Decision tree (run by every writer, including the Codex config.toml
watcher, the Claude SessionStart hook helper, and the manual-override
quickpick):

1. Read existing marker. If missing → write unconditionally.
2. If existing `updatedAt` is older than `stalenessMaxSec` (8h
   default) → write unconditionally; stale signals never block a
   fresh write.
3. **Immediately before the atomic write+rename**, re-read the
   target. If `signalKind` precedence of the proposed write ≥
   precedence of the existing target → proceed with rename. The
   re-read closes the time-of-check / time-of-use race between an
   initial precedence check and the rename.
4. If the rename detects the target was modified mid-flight (e.g.,
   another writer raced ahead between the re-read and the rename),
   retry the read-and-precedence-check up to the same 5-attempt
   ceiling as S5 (50/200/600/1200ms backoff). After exhaustion,
   skip the write.
5. On skipped writes, append a line to
   `~/.dabbler/orchestrator-writer.log` (`{timestamp, writer,
   proposed, existing, reason}`) for operator diagnostics.

**Manual-override escape hatch.** The manual-override quickpick has
explicit "force override" semantics: if it detects a fresher
`current`-precedence signal from another writer, it shows a
"Override existing live signal from <writer>?" confirmation. This
keeps the operator in control when they explicitly want to set the
gauge despite a live signal.

**Implementation surface.** ~30 LOC added to the shared
`write-orchestrator-marker.js` helper (Session 2); the manual-override
command (Session 3) layers the force-override confirmation on top.

---

## Manual-override quickpick UX (NEW REQUIREMENT — locked)

Per Gemini's E4 escalation, the manual-override command must:

1. Open a quickpick whose top section lists the most recently used
   `<provider> + <model> + <effort> + <thinking>` **tuples**
   ("Anthropic Opus 4.7 — High effort, Thinking on"), one tuple per
   row, sorted MRU. Selecting a tuple applies it directly. A
   bottom row "(set new combination…)" enters a multi-step flow
   (provider → model → effort → thinking on/off) for novel
   combinations. Store MRU in `~/.dabbler/orchestrator-mru.json`.
   *Note: the spec.md text describing this UX was previously
   inconsistent — both docs now use this single-picker-with-MRU-plus-
   multi-step-fallback shape.*
2. Support **command palette arguments** so the operator can bind
   common states to hotkeys via VS Code's keybinding system. Example
   binding the operator could add to `keybindings.json`:
   ```jsonc
   {
     "key": "ctrl+shift+alt+o",
     "command": "dabbler.setOrchestrator",
     "args": {
       "provider": "anthropic",
       "model": "claude-opus-4-7",
       "effort": "high",
       "thinking": true
     }
   }
   ```
3. The quickpick has a "**(create new hotkey binding)**" item at the
   bottom that copies the necessary `keybindings.json` snippet to
   the clipboard pre-filled with the current pick.

---

## Action items for Session 2 and beyond

### Session 2 (core webview + Claude path)

- [ ] Use `SessionStart` hook, not `Stop` (per Q5 locked).
- [ ] Pre-implementation verification: check whether `/clear` fires
      `SessionStart` AND whether `/clear` resets effort to Medium
      semantically. Only clobber a fresh `last-observed` signal on
      `/clear` if BOTH are true; otherwise preserve. Document the
      asymmetry in CHANGELOG and as **R7** in spec.md.
- [ ] Implement marker schema v2 with `signalKind` + `confidence`.
      Claude hook helper script emits `confidence: "low"` + `model:
      "unknown"` when payload's `.model` is missing/null/unparseable
      (exercises the confidence field in v1).
- [ ] Helper script uses write-and-rename with retry loop (**5
      attempts: initial + 4 retries, 50/200/600/1200ms backoff,
      ~2050ms total**) per S5 REVISED 2026-05-18.
- [ ] **Multi-writer precedence**: helper script implements the
      read-check-rewrite decision tree with re-read immediately
      before atomic rename. ~30 LOC; reused by Session 3 writers.
- [ ] Effort gauge: Medium default for Claude; `last-observed`
      styling (hollow rim + filled needle + clock-icon overlay +
      time-elapsed sublabel) if a `/think*` is detected via
      `UserPromptSubmit` hook (verify field availability — fall
      back to Medium-only if not).
- [ ] Webview HTML/CSS implements REVISED visual-treatment matrix:
      stripes are stale-only; `configured-default` uses dashed rim
      + "DEFAULT" pill badge; `last-observed` gets clock-icon
      overlay + time-elapsed suffix; `manual` gets operator-icon
      overlay.
- [ ] Drop `initialSize` from package.json view contribution.
      Document in CHANGELOG that container height cannot be
      guaranteed (VS Code persists user-resized heights; reset by
      dragging the divider back).
- [ ] Playwright smoke includes signalKind=current AND signalKind=last-observed
      AND signalKind=configured-default scenarios (clean profile).
- [ ] Last-updated timestamp visible in all states.
- [ ] Tooltip copy embeds confidence-level explicitly (per matrix
      above): "live signal (high confidence)", "configured default
      (medium confidence — does not track runtime changes)", etc.

### Session 3 (non-Claude providers)

- [ ] Gemini: ship manual-only (no hook installer needed; the
      installer command surfaces the manual-override with a Gemini
      preset).
- [ ] Codex: read `~/.codex/config.toml` on extension activation and
      via filesystem watcher. Write marker with `signalKind="configured-default"`.
- [ ] Copilot: ship manual-only (same shape as Gemini).
- [ ] Manual-override quickpick implements MRU + hotkey-friendly args
      per Gemini's E4.
- [ ] Smart empty-state detection: identifies which orchestrator is
      most likely active (by checking installed extensions) and surfaces
      the *right* installer/preset command in the CTA.

### Session 4 (polish + publish)

- [ ] Playwright screenshot assertions for layout (compensates for S3's
      lack of `initialSize` guarantee).
- [ ] Tooltip text per visual-treatment matrix.
- [ ] README screenshot showing all four signalKind visual treatments
      side-by-side (educates the operator on what each fill style means).

### Out-of-set follow-ups (not Session 029 scope)

- [ ] Investigate the `route(task_type="architecture")` 2-min timeout
      GPT-5.4 mentioned (escalation E3). Likely a router-config or
      upstream-provider issue; track separately.

---

## Spec deltas to apply

The following items in `docs/session-sets/029-orchestrator-model-effort-gauges/spec.md`
need updating to reflect the audit:

1. **D2** (layout) — no change.
2. **D3** (height budget) — no change (still ≤100px).
3. **D6** (effort scale) — update Claude column in normalization table:
   "(no native control), Medium default; recent /think* shown as
   last-observed".
4. **D7** (marker file path) — no change; schema version bumped to 2.
5. **D8** (hook installers) — re-scope:
   - Claude: SessionStart hook installer (was Stop).
   - Gemini/Copilot: "installer" is shorthand for "open manual-override
     with provider pre-selected". No actual hook installed.
   - Codex: config.toml watcher (no user-facing installation; happens
     on extension activation).
6. **Q1–Q6 sections**: mark RESOLVED with one-liner pointing here.
7. **Session 2 steps**: rewrite per action items above.
8. **Session 3 steps**: rewrite per action items above.
9. **Risks section**: add R5 (Windows atomic-write contention) and
   R6 (UserPromptSubmit hook may not expose message text).

---

## Cost summary

- **Audit calls (original synthesis, 2026-05-17): $0.00.** Manual
  paste-and-collect — no `ai_router.route()` invocation per memory
  `feedback_ai_router_usage`. The pre-authored `route_audit.py`
  helper from spec step 2 was waived as part of this; operator
  confirmed the waiver 2026-05-18 at Session 1 resume time.
- **Round A verification call (2026-05-18, gpt-5-4): $0.26.**
  Caught overclaimed-agreement wording (Q1, Q2/Q3/Q4 convergence
  rows), schema wording bug, Stop-hook drift in spec R2, routing
  notes drift, the multi-writer arbitration gap (Q7 #1), retry-
  ceiling underspecification, and stale/configured-default visual
  collision. All resolved before close-out.
- **Bucket-2 consensus call (2026-05-18, gpt-5-4 + gemini-pro):
  $0.085** ($0.08 gpt + $0.004 gemini). Both engines accepted the
  proposed direction on all seven Bucket-2 items; gpt-5-4 added
  tightening modifications on five of them (race-window re-read,
  attempt-count math, scrollable-not-horizontally wording,
  confidence-low producer rule, dual-condition `/clear` check).
  All absorbed in this revision.
- **Round B verification call (2026-05-18, gpt-5-4): $0.138.** All
  12 must-fix items from Round A marked ADDRESSED. Surfaced ONE new
  drift item in spec.md "Goal state" section (lines 85–92) — a
  region not in Round A's bundle — still contained pre-audit wording
  (1h stale threshold, install CTA on stale, Stop hook). Fix
  applied verbatim from D8/Q6 locked decisions.
- **Round C verification call (2026-05-18, gpt-5-4): $0.358.** Goal-
  state fix marked ADDRESSED; surfaced two more pre-audit drift
  items in previously-uninspected sections of spec.md (Goal-state
  "per-surface hooks" wording understated D8's hook/shim/manual
  mix; Session 3 "Creates" list still included a Codex installer
  command file contradicting D8's "no user-facing install"). Both
  fixed mechanically from D8 locked text. Per memory
  `feedback_verifier_spiral_recruit_codex`, did NOT chain a Round
  D — pattern was each round exposing different un-bundled sections,
  not new design issues against the same content. Round C's higher
  cost ($0.36 vs. typical $0.13 p50) was driven by gpt-5-4's 22k
  output tokens on a tight prompt; flag for future bundle sizing.
- **Total Session 1 cost: $0.845** ($0.264 Round A + $0.085
  consensus + $0.138 Round B + $0.358 Round C). Well within the
  operator's $5.00 NTE ceiling for the set.
- Forecast for remaining set (S2–S4): $0.30–$0.90 across three
  end-of-session verification calls (range based on memory
  `project_verification_cost_empirical` p50=$0.13, p95=$1.82).
