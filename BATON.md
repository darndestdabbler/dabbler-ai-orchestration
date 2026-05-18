# BATON: Set 029 Session 3 in-flight design pivot

**Date:** 2026-05-18
**From:** Claude Opus 4.7 (mid-S2-polish session, context-limited)
**To:** Next Claude Opus 4.7 session on this branch
**Status:** Mid-flight design pivot, audit-first path chosen, no work in progress to commit yet

---

## TL;DR

We're in the middle of Set 029 Session 3 design for the orchestrator
model + effort indicator gauges. S1 closed (audit), S2 closed
(Claude path shipped as v0.14.2 — committed and pushed at
`52aa4eb`). We then iterated the v0.14.2 UI through ~10 rounds of
operator-driven polish (post-S2; uncommitted in the working tree).
**The operator then proposed a major architectural pivot** that
makes most of the just-drafted S3 spec delta obsolete:

> Instead of a dedicated orchestrator-indicator webview, integrate
> the orchestrator info INTO each in-progress session set's row in
> the Session Sets tree. Custom webview-based tree (not native
> TreeView) so we keep full visual fidelity of the gauges.

**The operator's final instruction this session:** proceed with the
pivot via the **audit-first path** — author a design proposal,
route it through GPT-5.4 (manual paste in GitHub Copilot per
established pattern) + Gemini Pro (via the router), synthesize, then
draft the new S3 spec. They want three-way agreement before
non-trivial work begins, per memory
`feedback_audit_then_spec_for_substantial_features`.

**Next session's job:** pick up at the proposal-authoring step.

---

## What was happening when context ran out

The operator asked "is it possible to create our own tree view?"
(i.e., replace VS Code's native TreeView with a webview-based custom
tree so the SVG gauges survive and we have full visual control). I
confirmed yes, laid out the costs (~600-1000 LOC reimplementation),
the gains (full visual fidelity + cleaner architecture: one webview
surface for the whole side bar instead of TreeView + separate
indicator webview), and what's lost (native keyboard nav, context
menus, accessibility heuristics — all reimplementable).

I recommended doing it, with an audit-first pause given how
substantive the pivot is. The operator accepted: do the pivot,
audit-first, but create this BATON because context is running low.

---

## The pivot proposed (what to audit + spec)

**Current architecture (post-S2, v0.14.2):**
- A dedicated webview view `dabblerOrchestratorIndicator` pinned
  above the Session Sets tree (a native VS Code TreeView).
- The webview shows two SVG semi-circle gauges + textual
  "Actual Model" + optional "Suggested" section.
- One indicator per VS Code window, reads a global marker file at
  `~/.dabbler/current-orchestrator.json`.

**Operator's proposed architecture (the pivot):**
- Drop the dedicated indicator webview entirely.
- Convert the Session Sets view from native TreeView to a
  webview-based custom tree (same view ID, same view container).
- In the new custom tree, each in-progress session set row is an
  accordion:
  - Collapsed header: same info as today's TreeItem (set name,
    status, session counts).
  - Expanded body: the orchestrator gauges + textual sections (the
    UI we polished across ~10 rounds in this session).
- Behavior:
  - On SessionStart hook fire: populate the orchestrator info AND
    auto-expand the relevant set's row.
  - On session end: remove the orchestrator info; if there's a
    recommendation for the next session from ai-assignment.md,
    show ONLY that recommendation; otherwise collapse.
  - Parallel session sets each get their own embedded orchestrator
    info — multi-window and multi-assistant problems dissolve
    because identity is now per-session-set, not per-workspace.

**Why the pivot is good:** identity is per-session-set instead of
per-workspace. The cross-window contamination bug (the reason we
spent today's audit budget on per-workspace markers) and the
multi-assistant-per-window problem both dissolve naturally. The UI
is more contextually anchored to the work being done.

**Why custom tree (not extending native TreeView):** VS Code's
TreeView API can't render arbitrary HTML/SVG — TreeItems support
label + description + icon + tooltip only. Our 11-round visual
investment (SVG gauges, IBM palette, inverted bands) doesn't
survive native TreeView rendering. Webview-based custom tree
preserves it.

---

## What's obsolete because of the pivot

The S3 spec delta we drafted today (per-workspace markers) is
**mostly obsolete** if the pivot is approved. The per-workspace
marker work was solving the cross-window contamination bug — which
the pivot solves more naturally via session-set-anchored identity.

The drafted delta lives at
`docs/proposals/2026-05-18-per-workspace-orchestrator-markers/s3-spec-delta.md`
— **do not apply it to spec.md.** It's a reference point for what
was in scope before the pivot. Some pieces survive (non-Claude
detection — Codex auto + Gemini/Copilot manual + manual override
quickpick) but they plug into the new architecture differently.

The cross-provider audit artifacts in the same directory are still
valuable as the empirical record of what Gemini and GPT-5.4 said
about the per-workspace approach. Keep them.

---

## Concrete next steps for the next session

1. **Author the design proposal** for the custom-tree pivot.
   Suggested location:
   `docs/proposals/2026-05-18-custom-tree-pivot/proposal.md`.

   Cover:
   - The architecture (webview replaces TreeView for Session Sets;
     dedicated indicator view retires; orchestrator info attaches
     to each in-progress set's accordion row).
   - The SessionStart hook fires → marker file written → extension
     reacts → tree row auto-expands. Marker becomes per-set
     instead of per-workspace; storage layout TBD by audit.
   - What gets reimplemented (kbd nav, context menus, viewsWelcome,
     view/title actions, ARIA accessibility).
   - What gets retired (dedicated indicator webview, per-workspace
     marker scheme, the just-drafted S3 spec delta).
   - What gets reused (SessionStart hook installer, marker writer
     script, marker schema, mismatch detection, IBM palette + SVG
     gauges, describeMarker/describeRecommendation helpers).
   - Open design questions for reviewers (see "Open questions"
     section below for starter list).
   - Migration plan: v0.14.2 isn't published to Marketplace yet, so
     a clean cutover is possible.

2. **Operator runs the GPT-5.4 audit manually.** Per established
   pattern (from the per-workspace audit), write the prompt to
   `docs/proposals/2026-05-18-custom-tree-pivot/gpt-5-4-prompt-for-manual-paste.md`,
   tell the operator the file path, they paste into GitHub Copilot
   with GPT-5.4 selected, save GPT-5.4's response to
   `consensus-gpt-5-4-manual.md` in the same dir, then tell you
   it's done. Per memory `feedback_split_large_verification_bundles`
   the GPT-5.4 API is currently 429-rate-limited from S2's
   verification rounds — manual paste is the active workaround.

3. **Run Gemini consensus call via the router.** Pattern from
   earlier this session:
   ```python
   import ai_router
   result = ai_router.query(
     model="gemini-pro",
     content=proposal_text,
     task_type="cross-provider-audit",
     session_set=".../docs/session-sets/029-orchestrator-model-effort-gauges",
     session_number=3,
   )
   ```
   Dump result to JSON before reading any field (memory
   `feedback_ai_router_route_result_handling`). Save to
   `consensus-gemini-pro.json`. Expected cost: ~$0.02 (Gemini Pro
   was $0.017 on the per-workspace audit at similar proposal size).

4. **Synthesize both verdicts.** Look for convergence vs.
   divergence. Per memory pattern, GPT-5.4 tends to surface
   architectural gotchas Gemini misses; Gemini tends to be
   thorough on coverage. Where they diverge, present to operator
   for decision.

5. **Draft the new S3 spec** replacing the just-drafted (now
   obsolete) per-workspace-markers delta. Save to
   `docs/proposals/2026-05-18-custom-tree-pivot/s3-spec-delta.md`.
   Wait for operator approval before applying to spec.md.

6. **Decide on disposition of uncommitted S2 polish work** (see
   "Uncommitted working tree" below).

---

## Open questions for the audit prompt

Starter list — refine before sending to reviewers:

- **Marker storage under the pivot.** Per-session-set marker (e.g.,
  `<set-dir>/.dabbler/orchestrator.json`) or per-set-hashed
  (e.g., `~/.dabbler/orchestrators/<set-slug-hash>.json`)? The
  former scopes data to the project repo; the latter is
  user-global. Which fits the operator's workflow better?
- **How does the SessionStart hook know which session set it's
  writing for?** The hook receives `cwd`. Possibilities: walk up
  from `cwd` to find an in-progress session set (`docs/session-sets/<slug>/session-state.json`
  with `status: "in-progress"`); if multiple in-progress sets in
  the workspace, use the most-recently-touched. If no in-progress
  set in the workspace, write to a "global/orphan" marker that's
  shown separately (or not shown at all).
- **What about Claude sessions OUTSIDE any session set?** Some
  exploratory Claude work isn't tied to a set. Three options:
  (a) show as a top-level "Recent activity" pseudo-section above
  the session sets; (b) don't surface at all; (c) attach to a
  global marker rendered in a special "Outside any set" row.
- **VS Code TreeView features being reimplemented — which ones
  matter, which can we punt?** Concrete list: keyboard nav,
  selection styling, context menus (right-click), title-bar
  actions, viewsWelcome empty state, accessibility (ARIA roles
  for screen readers). What's must-have for v1 vs. follow-on?
- **Auto-expand behavior.** Operator wants the relevant set to
  auto-expand when SessionStart fires. Does this auto-expand
  persist across VS Code reloads, or always start collapsed?
  What if the operator manually collapsed mid-session?
- **Multi-window: does each VS Code window have its own custom
  tree, or do they share?** Each window has its own webview
  instance; they all observe the same marker filesystem. If
  Window A starts a Claude session on Set 029 and Window B has
  Set 029 open too, both windows' trees show Set 029's
  orchestrator info populated. Is that desired or confusing?
- **Migration cost vs. ship-and-evolve.** v0.14.2 is committed to
  git but not published to Marketplace. The pivot would mean
  retiring substantial code that was just merged. Worth it?

---

## Uncommitted working tree (decision needed)

After `52aa4eb` (the S2 close-out commit), this session iterated
the v0.14.2 UI through ~10 polish rounds with the operator. The
working tree has substantial unstaged changes:

- `tools/dabbler-ai-orchestration/media/orchestrator-indicator/indicator.css`
  — many revisions: IBM palette, container queries, inverted-band
  headers, theme-aware vars, light/dark band colors, etc.
- `tools/dabbler-ai-orchestration/src/providers/orchestratorIndicatorProvider.ts`
  — gauge angle math fixes, capacity helper, describeMarker,
  describeRecommendation, mismatch logic with tier/effort rank,
  workspace detection, section-stack rendering, etc.
- `tools/dabbler-ai-orchestration/scripts/write-orchestrator-marker.js`
  — `deriveModelDisplayName` drops "Claude" prefix for unknown
  models.
- `tools/dabbler-ai-orchestration/src/test/playwright/orchestrator-indicator.spec.ts`
  — assertions updated for the new model-section-text structure.
- Compiled artifacts in `out/` and `dist/` paths.
- Audit artifacts in
  `docs/proposals/2026-05-18-per-workspace-orchestrator-markers/`
  (proposal, consensus calls, s3-spec-delta — all created this
  session).
- This `BATON.md` file.

**The operator hasn't explicitly decided** what to do with the
polish work. Two options:

- **Commit as "cumulative S2 polish (rounds 3-10)" before the
  pivot work starts.** Clean checkpoint; preserves the iteration
  history if the pivot fails or stalls; doesn't ship anything
  externally since v0.14.2 isn't on Marketplace.
- **Discard or stash.** The polish addresses a UI that the pivot
  retires anyway. Saves cleanup later.

**Recommended:** commit the polish first. Reasons: (1) v0.14.2
the version number is still valid even if rendering changes; the
helpers/CSS/provider have shipped value; (2) the cumulative diff
is large and risky to drop without a checkpoint; (3) the pivot
audit may take a Round B; if it stalls, the polished v0.14.2 is
still ready to ship as-is; (4) cheap insurance.

Next session: ask the operator which they prefer before doing
anything else. If they say commit, the cumulative diff has all
the round-3-through-10 polish I described above plus the audit
artifacts; commit message should summarize the iteration history.

---

## What's already verified vs. open

**Verified during this session's polish rounds:**
- Playwright suite: all 8 scenarios green after every revision
  (re-ran ~6 times during polish).
- esbuild + tsc clean on every change.
- Visual verification via `C:\temp\orchestrator-gauges-preview.html`
  (operator-confirmed appearance in dark + light modes).

**Open / not-yet-verified:**
- The custom-tree pivot itself — needs the audit before any code.
- Per-workspace marker work — drafted but obsolete; do not
  implement.
- S4 (polish + Marketplace publish) — pending S3 completion.

---

## Key files (locations to read first)

- `BATON.md` — this file
- `docs/session-sets/029-orchestrator-model-effort-gauges/spec.md` —
  the canonical Set 029 spec. S3 section starts at line 461. Has
  NOT been modified for the pivot.
- `docs/session-sets/029-orchestrator-model-effort-gauges/change-log.md` —
  cumulative set log; last entry is S2 close-out
- `docs/session-sets/029-orchestrator-model-effort-gauges/session-state.json` —
  state-of-disk for the set. Currently: 2 of 4 sessions complete,
  status: in-progress, lifecycleState: work_in_progress,
  currentSession: null
- `docs/session-sets/029-orchestrator-model-effort-gauges/ai-assignment.md` —
  per-session orchestrator recommendations; S2 actuals filled in
- `docs/proposals/2026-05-17-model-effort-gauges-design-audit/audit-summary.md` —
  the S1 audit; established design fundamentals. D5 (color
  polarity) and D3 (height budget) both superseded by operator
  feedback rounds 1-3 of S2 polish; see CHANGELOG [0.14.2] for
  details.
- `docs/proposals/2026-05-18-per-workspace-orchestrator-markers/` —
  the per-workspace audit work; **OBSOLETE per the pivot**, but
  the audit artifacts (Gemini + GPT-5.4 verdicts) are still
  reference material
- `tools/dabbler-ai-orchestration/CHANGELOG.md` — `[0.14.2]`
  section documents all the polish iterations; comprehensive
  reference for what was shipped vs. what's queued for S3
- `C:\temp\orchestrator-gauges-preview.html` — standalone preview
  HTML that mirrors the extension's current UI. Has been the
  primary operator-feedback surface this session. Will need
  reworking if the pivot ships (or can be retired).

---

## Key memories that matter

Read these via the memory system at
`C:\Users\denmi\.claude\projects\c--Users-denmi-source-repos-dabbler-ai-orchestration\memory\MEMORY.md`:

- `feedback_audit_then_spec_for_substantial_features` — operator
  prefers cross-provider audit before non-trivial implementation
- `feedback_prefer_ai_consensus_over_human_prompt` — design
  judgment calls farm to GPT-5.4 + Gemini Pro before
  AskUserQuestion; in-session consensus is the carve-out from
  `feedback_ai_router_usage`
- `feedback_ai_router_usage` — router restricted to end-of-session
  verification, except for the consensus-call carve-out above
- `feedback_split_large_verification_bundles` — GPT-5.4 API is
  prone to 429 rate limits after sustained reasoning workload;
  manual paste in GitHub Copilot is the established workaround
  (operator did this for the per-workspace audit this session)
- `feedback_routing_surface_choice` — IDE-agent paste path is
  sometimes a stronger signal than the raw API call
- `feedback_user_facing_cost_messaging` — explicit dollar ranges +
  multi-week scale + open-source caveat for any user-facing copy
- `feedback_ai_router_route_result_handling` — dump RouteResult to
  JSON before any attribute access (lost $0.34 across two prior
  sessions to wrapper-crash bugs)
- `feedback_verifier_spiral_recruit_codex` — if routed verifier
  rounds keep raising NEW issues, recruit an external IDE agent
  rather than chaining more rounds
- `feedback_auto_verify_dont_hedge` — at end of session, run the
  verification call without hedging; don't defer the decision
- `feedback_default_not_started_evidence_to_escalate` — default to
  lowest-engagement bucket; require positive evidence to escalate
- `gauges_sizing_followup` (project memory) — record of all the
  D3/D5 supersedings and operator-driven UI revisions through
  S2 round 3
- `project_consumer_repos` — the operator's three active repos
  (the reason cross-window contamination matters)

---

## Cost / budget

- Set 029 NTE: $5.00 (operator-confirmed 2026-05-18 at S1 resume)
- S1 actual: $0.845 (audit + verification rounds)
- S2 actual: $0.578 (verification rounds A + B + C)
- S2 polish rounds 3-10: $0.00 (no router calls during polish)
- Per-workspace audit (this session): $0.017 (Gemini only;
  GPT-5.4 was 429-rate-limited, operator did manual paste at
  $0.00)
- **Cumulative: $1.44 of $5.00 NTE; remaining $3.56**

Estimated remaining budget needs:
- Custom-tree pivot audit: $0.05-$0.15 (Gemini call; GPT-5.4
  manual = $0.00)
- S3 end-of-session verification: $0.10-$0.30
- S4 end-of-session verification: $0.10-$0.30
- Total forecast S3+S4: $0.25-$0.75

Comfortable headroom remains.

---

## The operator's working style (calibration for the next session)

- **Rapid iteration on UI design.** They prefer to see something
  rendered, give feedback, iterate. The preview HTML at
  `C:\temp\orchestrator-gauges-preview.html` was the primary
  feedback surface during S2 polish — keep it as a touchstone
  but be ready for it to be retired if the pivot retires the
  dedicated indicator.
- **Sharp UX instincts.** Many of the round-3-through-10 changes
  came from operator on-device observations (color valence,
  band visibility, table-vs-stack readability, etc.). Take
  their UI suggestions seriously even when they seem to
  contradict earlier locked decisions — they were right every
  time this session.
- **Values cross-provider review before substantive pivots.**
  Don't skip the audit step even if the design seems sound to
  you. Per memory `feedback_audit_then_spec_for_substantial_features`,
  three-way agreement is the contract.
- **Comfortable with ambiguity and exploration.** OK with
  "let me think" / "what are the tradeoffs" framings. Not
  looking for instant decisions; looking for thoughtful
  partnership.
- **Cares about narrow-panel UX.** The Session Sets tree is
  often viewed at narrow widths. Custom-tree rendering must
  handle this gracefully — same container-query principle from
  S2 polish.
- **Three-window workflow** (per memory `project_consumer_repos`):
  parallel sessions across dabbler-ai-orchestration,
  dabbler-platform, dabbler-access-harvester. The pivot's
  multi-set-in-flight handling matters because of this.

---

## Final note

If anything in this BATON is unclear to the next session, the
operator can clarify directly. Don't guess on substantive design
decisions — the operator has demonstrated strong opinions about
the UI that aren't always derivable from first principles.

Good luck.
