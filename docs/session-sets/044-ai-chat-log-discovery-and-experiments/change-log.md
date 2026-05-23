# Set 044: AI chat-log discovery and experiments

**Status:** COMPLETE (6 of 6 sessions; closed 2026-05-23)
**Created:** 2026-05-22
**Cost:** routed verification + consensus spend tracked per session in
`activity-log.json` `routedApiCalls`; cumulative through S5 close-out =
$1.7442. S6 (this session) is non-implementing; no router calls.
**Forecast:** $15.00 NTE (per spec); **actual:** $1.7442 (~12% of NTE).
**Outcome:** DOCUMENTS ONLY. The set closes with a cross-provider-
consensus-audited architectural proposal locked, a successor set
(045) stubbed, and four sets (037-041, 042-043) retired or cancelled.
No code shipped, no Marketplace or PyPI release.

---

## Context

Set 044 ran as the empirical spike for a question the previous
roadmap had answered architecturally without empirical evidence:
**how should the Session Set Explorer see AI sessions that aren't
going through the Dabbler writer path?**

The pre-Set-044 answer was a per-provider TypeScript launch-adapter
roadmap (Sets 037-041): wrap every assistant CLI launch in extension
code, capture launch identity at the IDE-launch boundary, and provide
a `LaunchAdapter` per provider (Claude, Copilot, Codex, Gemini).
That roadmap was ~12 sessions of provider-by-provider engineering,
scoped *before* anyone had checked what signals the assistants
already wrote to disk.

Set 044's job was to check. The S1-S5 work harvested the native log
surfaces of Copilot and Claude Code, designed and ran a narration
experiment for the two signals natively absent, and assembled a
proposal that went through two passes of cross-provider consensus.
The empirical answer changed the architecture:
**13 of 15 enumerated harvest objectives are natively reachable**
from the AI CLIs' own log files; the remaining two (reasoning effort
A3, Dabbler set/session boundary marker C3) close via a small Python
launch wrapper paired with session-start narration. The Sets 037-041
launch-adapter approach is retired in favor of Set 045's dual-
primary log-harvest architecture.

---

## Session 1: Copilot log harvest + scope/redaction framing (COMPLETE 2026-05-22)

**Shipped:**
- [`harvest-objectives-and-redaction.md`](harvest-objectives-and-redaction.md)
  — locked the 15 harvest objectives + the synthetic-test-material rule
  + 7 redaction rules for log handling.
- [`discovery-notes-copilot.md`](discovery-notes-copilot.md) — Copilot
  artifact inventory (9 surfaces), OTel JSONL schema, `session-store.db`
  schema-only inspection, `~/.copilot/ide/*.lock` redaction-risk flag.
- [`smoke-probe-results.md`](smoke-probe-results.md) — two-round-trip
  probe ruling out `session-store.db turns` as the marker-bearing
  surface in favor of OTel `gen_ai.output.messages`.

## Session 2: Claude Code log harvest + comparative analysis (COMPLETE 2026-05-22)

**Shipped:**
- [`discovery-notes-claude.md`](discovery-notes-claude.md) — Claude
  `~/.claude/projects/<workspace>/<session-id>.jsonl` is always-on,
  inlines assistant content by default, carries `model` per turn and
  `cwd` per event.
- [`baseline-comparison.md`](baseline-comparison.md) — side-by-side
  signal-availability matrix across the 15 objectives for both
  backends; A3 (effort) and C3 (set boundary) confirmed absent on both.

## Session 3: Narration design + Copilot narration experiment (COMPLETE 2026-05-22)

**Shipped:**
- [`narration-design.md`](narration-design.md) — v1 narration contract
  (session-start + per-turn markers; Branch A/Branch B effort routing;
  parser-skip discipline).
- [`copilot-narration-results.md`](copilot-narration-results.md) —
  Copilot AGENTS.md narration WORKED at session-start. Marker landed
  reliably in OTel `gen_ai.output.messages` with content-capture env
  var enabled.

## Session 4: Claude narration experiment + cross-backend synthesis (COMPLETE 2026-05-22)

**Shipped:**
- [`claude-narration-results.md`](claude-narration-results.md) — v1
  CLAUDE.md narration phrasing triggered Claude's prompt-injection
  classifier; refused. v2 reframe worked at session-start but 0/3
  per-turn markers landed. Per-turn narration is unreliable on Claude
  via the instruction channel.
- [`cross-backend-synthesis.md`](cross-backend-synthesis.md) — the
  v1 contract needs revision; session-start-only on both backends is
  the achievable scope. Per-turn deferred or routed through a
  different channel (hook-based) if ever needed.

## Session 5: Concrete proposal + cross-provider consensus (COMPLETE 2026-05-23)

**Shipped:**
- [`copilot-effort-sidebar-results.md`](copilot-effort-sidebar-results.md)
  — last empirical question (Q3/Q4): is `gen_ai.request.reasoning_effort`
  populated on Copilot at any effort level? Answer: UNCONDITIONALLY
  ABSENT at low + medium + high. Branch A (native A3 on Copilot) is
  dead. Both backends now symmetric in lacking native A3. (Q4
  per-session aggregate suggestive at N=1, deferred to Set 045.)
- [`proposal.md`](proposal.md) v0 → v1 — Pass A consensus produced v0
  (wrapper-primary, narration-fallback framing). Pass B devil's-
  advocate steelman exposed framing bias in §8.7. v1 reframes to
  **dual-primary** — wrapper + native-log parsing are co-equal channels,
  not primary-and-fallback. Locks the architectural commitments behind
  the cross-provider audit.
- [`proposal-consensus-journal.md`](proposal-consensus-journal.md) —
  full Pass A + Pass B audit trail. Pass A: 3/3 ENDORSED-WITH-REVISIONS,
  S6 vote 2 GO / 1 NO-GO ($0.80). Pass B: framing-bias finding;
  S6 vote flipped to 2 NO-GO / 1 conditional GO ($0.65).
- Roadmap reshape decisions: Sets 037-041 cancelled, Set 045 stubbed
  ([`045-log-harvest-implementation/spec.md`](../045-log-harvest-implementation/spec.md)).

## Session 6: Conditional implementation + close-out (COMPLETE 2026-05-23)

**Decision:** DEFER (no in-set implementation). Per the §9 flip
conditions in `proposal.md` v1, Pass B's 2/3 NO-GO vote and the
schema-commitment-risk argument (producer-without-consumer
anti-pattern) locked the call. Opus's dissenting Pass B GO position
is preserved in the consensus journal as a minority position and
informed Set 045's Session 1 spike-measurement scope.

**Shipped:**

- **Set 042 cancellation** —
  [`../042-rudimentary-chat-interface-foundations/CANCELLED.md`](../042-rudimentary-chat-interface-foundations/CANCELLED.md)
  + state-file flip. Set 042 was originally scoped as a fallback path
  in case opening the vendor TUI was insufficient. Set 044's empirical
  findings remove that pressure (the visibility/coordination problem
  Set 042 hedged against is solved by Set 045's harvester). Cross-
  provider consensus did not endorse the chat-interface investment.
  The proposal §8 table called 042 "unaffected, wrapper architecturally
  compatible" — that was preserve-the-option, not endorse-the-investment.
  Operator call confirmed the fallback is no longer needed.

- **Set 043 cancellation** —
  [`../043-multi-provider-chat-interface-followup/CANCELLED.md`](../043-multi-provider-chat-interface-followup/CANCELLED.md)
  + state-file flip. Set 043 was the multi-provider follow-on to 042;
  with 042 cancelled it has no foundation. Its declared prerequisites
  (Sets 038/040/041 launch adapters) were already cancelled in S5.

- **Root [`coding-assistant-adapter-spec.md`](../../../coding-assistant-adapter-spec.md)
  superseded banner** — the Draft v2 launch-adapter design that
  predated Set 044's empirical pivot now carries a top-of-file
  SUPERSEDED banner pointing at this proposal and Set 045's spec.
  Retained as audit history; not implementable as-written.

- **Set 046 stub** —
  [`../046-explorer-enrichment-from-harvest-records/spec.md`](../046-explorer-enrichment-from-harvest-records/spec.md)
  + session-state.json. Captures the upside use case the cancelled
  042-043 were reaching for: enrich the existing Session Set Explorer
  with the rich information surface Set 045 produces, rather than
  building a parallel chat UI. Stubbed with six candidate leverage
  points (audit-pending): second-line orchestrator badge, live cost
  surfacing, writer-bypass warning, multi-AI-on-same-set warning,
  time-since-last-activity, tool-touch / scope-creep indicator.
  Session count and per-session scope deferred to the audit pass.

- **This change-log.**

---

## Roadmap reshape summary

| Set | Pre-044 status | Post-044 status | Citation |
|---|---|---|---|
| 036 | Specced (post-Set-035 audit verdicts) | UNAFFECTED — runs next per 2026-05-22 sequencing | proposal §0 |
| 037 | 4 sessions, not-started (launch-adapter foundations) | CANCELLED 2026-05-23 — `LaunchAdapter` contract no longer needed | proposal §8 |
| 038 | 4 sessions, not-started (Claude adapter) | CANCELLED 2026-05-23 — Claude JSONL is always-on, adapter buys nothing | proposal §8 |
| 039 | 4 sessions, not-started (Copilot adapter) | CANCELLED 2026-05-23 — Copilot OTel covers it | proposal §8 |
| 040 | 4 sessions, not-started (Codex adapter) | CANCELLED 2026-05-23 — out of scope; parser shim added in follow-on if needed | proposal §8 |
| 041 | 4 sessions, not-started (Gemini adapter) | CANCELLED 2026-05-23 — same as 040 | proposal §8 |
| 042 | 4 sessions, not-started (chat-interface foundations) | CANCELLED 2026-05-23 — fallback no longer needed; superseded by Set 046 for upside use case | this change-log |
| 043 | 4 sessions, not-started (multi-provider chat follow-on) | CANCELLED 2026-05-23 — foundation removed by 042 cancellation | this change-log |
| 044 | This set | CLOSED 2026-05-23 | this change-log |
| **045** | — | **NEW — log-harvest implementation; not-started** (6 sessions stubbed) | proposal §8; spec stub committed S5 |
| **046** | — | **NEW — Explorer enrichment from Harvest Records; not-started, audit-pending** (session count TBD) | this change-log |

**Net change:** -5 sets (037-041) + -2 sets (042-043) + 2 new sets
(045-046) = roadmap shrinks by 5 sets while preserving (and
materially improving) the operator-visibility upside that all 7
retired sets were collectively reaching for.

---

## Open empirical questions carried to Set 045

Per `proposal.md` v1 §6. These are explicitly the focus of Set 045
Session 1's spike work; they should be resolved before the joiner
is designed.

1. **Bypass rate** — what fraction of real-world AI sessions are
   Dabbler-launched vs free-running? Determines the wrapper /
   native-parser channel coverage split. Self-observation period;
   target 1-2 weeks of operator activity.
2. **Deterministic wrapper-to-native-log correlation** — prove a
   1:1 binding strategy exists via `(workspace_cwd, time_window,
   conv_id)` before any wrapper code ships.
3. **Claude phrasing-trigger ablation** — isolate the specific
   phrasing element that triggers Claude's injection classifier so
   the v1.1 canonical CLAUDE.md template can be written defensively.
4. **Joiner location** — Python (sibling to `ai_router`) or
   TypeScript (inside extension)? Pass A 2-1 favored Python; Set 045
   first session prototypes both.

---

## Parking-lot items (not committed to any set)

- **"Blocked-on-prereqs" lifecycle-state question.** Surfaced during
  S6 close-out review: should the canonical state-file `status` gain
  a "deferred" or "blocked" value distinct from "not-started" and
  "cancelled" for sets whose prerequisites are unmet? Or is that
  better modeled as a derived Explorer property over machine-readable
  prerequisite declarations on existing "not-started" specs?
  Question parked in [`../046-explorer-enrichment-from-harvest-records/spec.md`](../046-explorer-enrichment-from-harvest-records/spec.md)
  "Open architectural questions" section for the next audit pass to
  decide whether to absorb, spin into its own set, or defer
  indefinitely. The immediate use case (042/043 prereqs becoming
  invalid) was resolved by outright cancellation rather than by
  introducing a new state.

- **`workflow.md` recommendation: devil's-advocate two-pass should be
  default for roadmap reshapes.** Set 044's Pass A → Pass B
  materially shifted both framing (wrapper-primary → dual-primary)
  and S6 vote (2 GO/1 NO-GO → 2 NO-GO/1 conditional). The bias-cautions
  preamble alone was insufficient. Recorded as a finding in
  `proposal.md` §10 final paragraph; the actual edit to
  `docs/ai-led-session-workflow.md` to promote two-pass from "Yes if
  budget allows" to "Yes, always" was committed during S5 close-out.

---

## What this set deliberately did NOT ship

- Any code touching `ai_router/`, `tools/dabbler-ai-orchestration/`,
  or the Session Set Explorer surface.
- Any PyPI release of `dabbler-ai-router`.
- Any VS Code Marketplace release.
- A canonical Harvest Record schema commitment — the proposal §4.1
  shape is provisional; Set 045 Session 2 derives the final schema
  from the joiner's needs, not from this set's drafting.
- Any Claude phrasing-trigger ablation — only confirmed v1 fails
  and v2 partially-works; the specific trigger element is unknown.
- Any wrapper prototype — `dabbler-launch` is named in §4.2 but is
  Set 045's deliverable.

The Pass B 2/3 NO-GO argument that locked the DEFER decision was
precisely: shipping a wrapper without its consumer (the joiner)
hardens a record schema before the conflict-detection semantics
that validate it are known. Set 044 holds that line.

---

## Cumulative routed spend (through close-out)

- S1-S4 harvest + narration experiments: $0.2900 (consumer-tier
  detail in per-session `routedApiCalls`).
- S5 Copilot effort sidebar: $0.0017.
- S5 proposal v0 + Pass A consensus: $0.8010 (3 providers × max effort).
- S5 Pass B devil's-advocate consensus: $0.6515 (3 providers × max effort).
- **Total**: $1.7442 of $15.00 NTE (~12%).

Well under budget. The two-pass consensus pattern paid for itself
many times over relative to the cost of shipping a wrong
architecture for 12 sessions.
