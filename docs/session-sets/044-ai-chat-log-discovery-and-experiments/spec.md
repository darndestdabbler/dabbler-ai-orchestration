# AI Chat-Assistant Log Discovery and Experiments

> **Purpose:** characterize what Claude Code and Copilot CLI log files
> actually contain, experiment with narration discipline to enrich those
> logs with orchestrator-state signals, then produce a concrete proposal
> for a log-harvesting observability layer that supplements (not replaces)
> the writer-based ownership model.
> **Created:** 2026-05-22
> **Session Set:** `docs/session-sets/044-ai-chat-log-discovery-and-experiments/`
> **Prerequisites:**
> - None for harvest sessions (S1-S2).
> - Operator approval of the S5 proposal before any S6 implementation.
> **Workflow:** Orchestrator -> AI Router -> Cross-provider verification
> **Relationship to other sets:**
> - **Set 044 runs first**, before Set 036 (operator decision
>   2026-05-22). Rationale: 044's findings may reshape what Set
>   036's UI audit (S6) needs to display, and may reshape Sets
>   037-041 entirely.
> - Set 036 may need a small spec addendum once Set 044 closes
>   if the proposal in S5 changes assumptions about what the
>   Session Set Explorer renders.
> - Does not touch the chat-interface question (Sets 042-043).

---

## Session Set Configuration

```yaml
totalSessions: 6
requiresUAT: true
requiresE2E: true
uatScope: per-set
uatStyle: ad-hoc
effort: medium
```

> **Rationale:** investigation-heavy across S1-S5 (no operator-visible
> change), with operator-visible Explorer changes shipping in S6 only
> if S5 decides to implement within this set. UAT and E2E apply to S6
> if implementation happens; otherwise the checklist degrades to a
> close-out summary. Effort is medium rather than high because the
> per-session work is characterization plus comparison rather than
> extension-surface engineering, but the set spans two backends and
> includes routed-consensus and narration experiments, so it isn't
> low either.

---

## Project Overview

- **Scope:** Claude Code and Copilot CLI only. Codex and Gemini are
  out of scope for this set and may be addressed in a follow-on if the
  Claude/Copilot evidence justifies it.
- **Goal:** decide whether a log-harvesting observability layer can
  give the Session Set Explorer enough honest signal about orchestrator
  state to replace, complement, or reshape the launch-adapter approach
  proposed in Sets 037-041.
- **Method:** harvest existing logs first (S1-S2); add narration
  instructions to the assistants and re-harvest (S3-S4); synthesize
  into a proposal (S5); implement the smallest viable proof (S6) only
  if the proposal is small enough to justify in-set implementation.
- **Non-goals:**
  - Replacing the writer-based prevention model from Set 036. Logs
    give observation, not enforcement.
  - Codex and Gemini coverage.
  - A full chat-replay UI (separate product question, deferred).
  - Committing harvested data that may contain sensitive prompts,
    file contents, or credentials.

---

## Sessions

### Session 1 of 6: Copilot log harvest + scope/redaction framing

**Steps:**
1. Lock the harvest objectives: which signals are we trying to
   extract (e.g., orchestrator model per turn, effort level,
   conversation ID, tool calls touching session-set files,
   timestamps for cross-agent conflict correlation, any
   narrator-style boundary markers if present).
2. Lock redaction discipline: what may be committed to the repo
   versus what stays in a gitignored scratch location (e.g.,
   `c:\tmp\dabbler-log-harvest\`), how prompts / file contents /
   credentials are scrubbed before any inclusion in discovery notes.
3. Inventory the locally-installed Copilot CLI 1.0.51 log surface:
   `COPILOT_HOME/logs/`, `session-store.db`, OTel JSONL exporter
   output when `COPILOT_OTEL_FILE_EXPORTER_PATH` is set,
   `--output-format=json` payload from prompt-mode invocations.
4. Run a small set of representative interactive and prompt-mode
   sessions against a synthetic session set, then harvest the
   resulting logs and characterize what's actually in them.
5. Document signal availability per harvest objective in a
   discovery note. Be explicit about what the logs *don't* contain.

**Creates:**
- `docs/session-sets/044-ai-chat-log-discovery-and-experiments/harvest-objectives-and-redaction.md`
- `docs/session-sets/044-ai-chat-log-discovery-and-experiments/discovery-notes-copilot.md`

**Touches:**
- `.gitignore` if a local scratch dir needs to be ignored

**Ends with:** a characterization of what Copilot logs natively
contain, what they don't, and which harvest objectives they satisfy
without further intervention.

**Progress keys:**
- session-001/scope-locked
- session-001/redaction-policy-locked
- session-001/copilot-logs-inventoried
- session-001/copilot-baseline-harvested
- session-001/round-a-verification

---

### Session 2 of 6: Claude Code log harvest + comparative analysis

**Steps:**
1. Inventory the Claude Code log surface: per-project JSONL
   transcripts in `~/.claude/projects/<slug>/`, hook event payloads,
   tool-call records, model-name metadata.
2. Run a small set of representative Claude Code sessions against
   the same synthetic session set used in S1, then harvest the
   transcripts and characterize their signal density.
3. Compare side-by-side with the S1 Copilot characterization. Which
   backend's logs give us more per harvest objective? Where are the
   gaps consistent across both backends?
4. Identify which signals are available natively from both backends
   versus which would require narration to surface.
5. Update the redaction policy if Claude-specific risks appear
   (e.g., user prompts captured in transcripts).

**Creates:**
- `docs/session-sets/044-ai-chat-log-discovery-and-experiments/discovery-notes-claude.md`
- `docs/session-sets/044-ai-chat-log-discovery-and-experiments/baseline-comparison.md`

**Touches:**
- `docs/session-sets/044-ai-chat-log-discovery-and-experiments/harvest-objectives-and-redaction.md` (refinements)

**Ends with:** a cross-backend comparison of native log signal,
identifying which harvest objectives can be met from baseline logs
versus which need narration.

**Progress keys:**
- session-002/claude-logs-inventoried
- session-002/claude-baseline-harvested
- session-002/baseline-comparison-written
- session-002/narration-gaps-identified
- session-002/round-a-verification

---

### Session 3 of 6: Narration design + Copilot narration experiment

> **As-shipped (2026-05-22):** S3 ships **design + pre-lock smoke
> probe only**. The previously-deferred S1+S2 live runs PLUS the
> Copilot narrated experiment PLUS the cross-backend baseline
> comparison are all consolidated into S4. This is the third
> consecutive deferral of live runs (S1→S2→S3→S4); the spec
> pattern now is "investigation, design, and contract lock in
> S1-S3; all live runs + narrated experiments in S4." Rationale
> for THIS deferral: smoke probe surfaced a substantive design
> implication (OTel JSONL is the Copilot harvester surface, not
> session-store.db); folding the live runs into the same session
> as the design lock would have risked the experiment running
> against an unstable contract. With v1 now LOCKED, S4 can run
> against a frozen target.

**Steps:**
1. Design narration discipline before applying it: what should
   orchestrators say at which boundaries (e.g., "starting Set 042
   Session 3", "calling start_session", "reading
   session-state.json"), in what format (free-form text, structured
   prefix marker, JSON-line), and where in the conversation
   (pre-tool-call, post-tool-call, both). Lock this design before
   running the experiment so S3 and S4 are comparable.
2. Optionally route the narration design through cross-provider
   consensus before applying. This is a candidate site for piloting
   the bias-cautions preamble discussed 2026-05-22.
3. Apply the narration discipline to Copilot via configuration /
   system prompt / settings (kept in the local scratch workspace;
   not committed).
4. Re-run the same representative sessions from S1 with narration
   enabled, harvest the resulting logs, and measure how much
   additional signal narration provides per harvest objective.
5. Compare to the S1 baseline; document delta.

**Creates:**
- `docs/session-sets/044-ai-chat-log-discovery-and-experiments/narration-design.md`
- `docs/session-sets/044-ai-chat-log-discovery-and-experiments/copilot-narration-results.md`

**Touches:**
- Copilot configuration files in the local scratch workspace (not
  committed)

**Ends with:** a locked narration design and empirical evidence of
how much it improves Copilot log signal.

**Progress keys:**
- session-003/narration-design-locked
- session-003/copilot-narration-applied
- session-003/copilot-narration-harvested
- session-003/delta-quantified
- session-003/round-a-verification

---

### Session 4 of 6: Claude narration experiment + cross-backend synthesis

> **Scope expansion (2026-05-22):** absorbs the previously-
> deferred S1 Copilot live runs, S2 Claude live runs, and S3
> Copilot narrated experiment. The cross-backend synthesis
> (the original S4 deliverable) still anchors the session, but
> now S4 also executes the four live-run packets (Copilot
> baseline, Claude baseline, Copilot narrated, Claude narrated)
> against the synthetic-set at `c:\tmp\dabbler-log-harvest\
> synthetic-set\`.
>
> **Split into S4a / S4b is the DEFAULT plan** (per Round A
> verifier guidance 2026-05-22 — five distinct work packets
> in one session is bloated). Suggested boundary:
> - S4a: Copilot baseline + Claude baseline + Copilot narrated
>   + Copilot delta in `copilot-narration-results.md`.
> - S4b: Claude narrated + Claude delta in
>   `claude-narration-results.md` + cross-backend synthesis in
>   `cross-backend-synthesis.md`.
> S4a closes when the Copilot side is fully measured; S4b is a
> separate orchestrator check-out the next session. If the
> operator decides at S4 start that the work IS scoped tightly
> enough for one session, the split can be skipped.

**Steps:**
1. Apply the S3 narration design to Claude Code via CLAUDE.md
   instructions in the local scratch workspace.
2. Re-run the representative Claude sessions with narration
   enabled, harvest, and quantify delta versus the S2 baseline.
3. Cross-backend synthesis: does narration close the same gaps in
   both backends? Does it surface the timestamp-plus-set-id-plus-
   agent-id triple that conflict detection actually requires?
4. Identify residual gaps that even narration cannot close, and
   call out whether those are showstoppers for the S5 proposal.

**Creates:**
- `docs/session-sets/044-ai-chat-log-discovery-and-experiments/claude-narration-results.md`
- `docs/session-sets/044-ai-chat-log-discovery-and-experiments/cross-backend-synthesis.md`

**Touches:**
- CLAUDE.md in the local scratch workspace (not committed)

**Ends with:** a quantified picture of what log harvest plus narration
can deliver per backend, and what it cannot.

**Progress keys:**
- session-004/claude-narration-applied
- session-004/claude-narration-harvested
- session-004/cross-backend-synthesis-written
- session-004/residual-gaps-documented
- session-004/round-a-verification

---

### Session 5 of 6: Concrete proposal + cross-provider consensus

**Steps:**
1. Synthesize S1-S4 findings into a concrete proposal: what would
   get built, in what order, with what trade-offs against the
   existing launch-adapter roadmap (Sets 037-041). Be specific
   about: which existing sets become unnecessary, which shrink,
   which remain.
2. Route the proposal through cross-provider consensus (GPT 5.4,
   Gemini Pro, Opus 4.6 max-effort). Budget envelope for S5
   routed calls: **$15.00 NTE** (operator-set 2026-05-22 given
   the importance of the decision). Pilot the bias-cautions
   preamble. Pilot the devil's-advocate two-pass pattern if the
   first-pass verdicts diverge enough to warrant it.
3. Decide based on consensus and proposal complexity:
   - If the proposal is small (e.g., a single backend's watcher
     plus minimal Explorer surface), S6 implements within this set.
   - If the proposal is substantial (e.g., per-backend parser
     registry, real-time conflict detection, new UI surfaces),
     close Set 044 here and let a Set 045 own implementation.
4. Record the decision explicitly so S6's scope is unambiguous.

**Creates:**
- `docs/session-sets/044-ai-chat-log-discovery-and-experiments/proposal.md`
- `docs/session-sets/044-ai-chat-log-discovery-and-experiments/proposal-consensus-journal.md`

**Touches:**
- roadmap pointers in `docs/proposals/` if the proposal reshapes
  the launch-adapter roadmap

**Ends with:** an audited proposal and an explicit go/no-go for
in-set implementation versus a follow-on set.

**Progress keys:**
- session-005/proposal-drafted
- session-005/consensus-routed
- session-005/scope-decision-recorded

---

### Session 6 of 6: Conditional implementation + close-out

**Steps:**
1. If S5 decided "implement here": ship the smallest viable
   log-harvesting proof. The default expectation is one backend
   (Copilot first, per Set 039 precedent) surfacing orchestrator
   model/effort and any conflict signals into the Session Set
   Explorer.
2. If implementing: add Layer-2 / Layer-3 coverage scoped to the
   new surface, and produce an ad-hoc UAT checklist for the
   operator-visible Explorer change.
3. If S5 decided "defer implementation": skip steps 1-2 and
   produce a close-out change-log summarizing findings and pointing
   to the follow-on set (e.g., Set 045).
4. Write `change-log.md` and update roadmap docs to reflect what
   044 actually shipped versus what is now deferred.

**Creates:**
- `docs/session-sets/044-ai-chat-log-discovery-and-experiments/change-log.md`
- `docs/session-sets/044-ai-chat-log-discovery-and-experiments/044-ai-chat-log-discovery-and-experiments-uat-checklist.json`
  (conditional on S5 deciding "implement here")

**Touches:**
- Session Set Explorer surfaces (conditional)
- roadmap docs reflecting any reshape of Sets 037-041 (if
  applicable)

**Ends with:** either a shipped minimal observability proof, or a
clean handoff to a follow-on implementation set.

**Progress keys:**
- session-006/implementation-shipped-or-deferred
- session-006/coverage-added (conditional)
- session-006/uat-checklist-written (conditional)
- session-006/change-log-written
- session-006/roadmap-updated
