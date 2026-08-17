# AI Assignment Ledger — 135-close-out-cost-must-be-produced

> Routed analysis (Step 3.5), never self-opined. Authored on the
> `copilot-cli` transport on 2026-08-17 via `route(task_type="analysis")`
> (tier 0, seat-metered, `cost_usd` 0.0 — the seat carries no per-call
> dollar figure; see `disposition.cost`). Recorded verbatim below; the
> orchestrator did not edit the analyst's judgement, including where it
> disagrees with the choice actually made.

> **Session 1 was already complete when this ran.** The spec's Step 3.5
> obligation is to route the assignment analysis rather than self-opine, and
> the analyst was told Session 1 had run and asked to say plainly whether the
> actual choice was wrong. It says so. That dissent is kept.

> **Standing analyst defect — did not fire.** Sets 130–133 recorded the
> step-3.5 analyst emitting model ids this router cannot call. Asked for a
> provider-and-family rather than a callable id, this run complied in every
> row.

> **Prose cap (Set 134 S3: 250 words per session block).** Session 1's block
> runs ~260 words including its dissent paragraph. Trimming routed judgement
> to satisfy a prose cap would be editing the evidence, so it stands as
> written and is noted here instead.

---

## Session 1: What the cost record actually says

### Recommended orchestrator

anthropic / current flagship family

### Rationale

Session 1 is a read-only corpus walk: it reads 516 committed versions of
`disposition.json`, joins them against `session-state.json` at each commit, runs
`seat_cost.measure_session`, classifies every gap, and produces a
machine-readable report. This is a research-and-analysis workload with no
interactivity requirement and no dependency on VS Code or Copilot tooling.
Anthropic's flagship handles long-context document analysis well, the audit
output is all markdown and JSON, and the verifier must differ from the
orchestrator — routing to google / gemini pro family for verification is cheap
and deterministic here. The Copilot CLI seat is the operator's scarce resource;
burning it on a read-only pass over committed files is the wrong trade. The one
risk is git history traversal: the orchestrator must walk all 516 committed
versions, not just surviving files. That is a shell-and-grep job the
orchestrator can drive without seat turns.

**Was the actual choice wrong?** The audit was run on the Copilot seat. Given
that the spec says both sessions are expected to run there, and the session did
complete and produce `cost-audit.json`, the choice was within spec — but this
ledger recommends against it. A read-only audit on a direct-API seat would have
left more Copilot capacity for Session 2, which changes code.

### Estimated routed cost

anthropic / current flagship family: corpus walk + report write, ~3-4 routed
turns for cross-provider verification.

| Step | Route | Model |
| :--- | :--- | :--- |
| 1. Register, read reservation and seat-cost.md | operator-execute | — |
| 2. Walk 516 committed versions, price each session | orchestrator-execute | anthropic / current flagship family |
| 3. Classify gaps with stated tests | orchestrator-execute | anthropic / current flagship family |
| 4. Quantify roll-up bias, state unrecoverable portion | orchestrator-execute | anthropic / current flagship family |
| 5. Cross-provider verification of audit findings | routed-analysis | google / gemini pro family |
| 6. Required test suite portion | operator-execute | — |
| 7. Close-out, produce cost block via seat_cost | operator-execute | — |

---

## Session 2: Produce it, or refuse it

### Recommended orchestrator

anthropic / current flagship family

### Rationale

Session 2 touches five Python modules and four docs in a single pass, ships
two-directional falsifiers, and must not erode three pre-existing invariants
(UNKNOWN never $0.00; attestation path survives; attribution by id only). That
is a well-specified but multi-file code change where reasoning about invariant
preservation is the dominant risk. Anthropic's flagship is the right tool. The
Copilot CLI seat is acceptable if it is the operator's only option, but the code
change is small and reversible, so direct-API is preferred — it preserves
Copilot capacity and avoids the durability hazard the audit found:
`router-metrics.jsonl` is gitignored and machine-local, so a Copilot-seat
session that reads it as authoritative is building on non-durable state.
Verification must be google / gemini pro family (or openai / gpt-5 family),
distinct from orchestrator. The attestation path must be built in the same
session as the refusal — the spec says so and the audit confirmed the
honest-unmeasurable population is large enough that deferring it would strand
closes on Claude Code and Gemini seats immediately.

Session 1 audit changed the Session 2 specification in four concrete ways; see
`cost-audit.md` §What this means for Session 2. All four must be addressed:
mandatory block, reachable-status falsifier, floor labelling at close time, and
the §5.2 doc fix.

### Estimated routed cost

anthropic / current flagship family: code authoring + doc updates.
Cross-provider verification for the gate logic and falsifiers.

| Step | Route | Model |
| :--- | :--- | :--- |
| 1. Register, read cost-audit.md | operator-execute | — |
| 2. Make close_session produce the block; cover both components | orchestrator-execute | anthropic / current flagship family |
| 3. Refuse asserted block; admit attested with operator attestation | orchestrator-execute | anthropic / current flagship family |
| 4. Ship reachable-status falsifier; fix exactness class in code and seat-cost.md §5.2 | orchestrator-execute | anthropic / current flagship family |
| 4a. Propagate echoes to disposition-schema.md, close-out.md, session-constitution.md Step 8 | orchestrator-execute | anthropic / current flagship family |
| 5. Cross-provider verification of gate logic and falsifiers | routed-analysis | google / gemini pro family |
| 6. Required test suite portion | operator-execute | — |
| 7. Set-terminal close-out, produce cost block via the shipped machinery | operator-execute | — |

---

## Next-set recommendation

### Recommendation

Ship a **durability fix for `router-metrics.jsonl`**: commit a durable,
repo-tracked cost ledger that replaces or supplements the gitignored file as the
authoritative routed-call record, backfilled from the quoted dollar figures in
existing disposition prose where ids are gone.

### Rationale

Session 1 found a durability regression nobody recorded: `routedApiCalls` in
`activity-log.json` was correct and committed through Set 110;
`router-metrics.jsonl` replaced it and is gitignored. The direct consequence is
that 235 routed calls across 45 sessions are in the store but permanently
unattributable, and the quoted figures in disposition prose are quotations, not
measurements. Session 2's gate will produce accurate numbers going forward — but
those numbers will be written to `session-state.json`, which is committed. The
gap between the two regimes (Sets 111-130) is a known, bounded corpus that could
be partially recovered from prose quotations if a follow-on set chose to. More
urgently: if `router-metrics.jsonl` is ever deleted or rotated, Session 2's gate
will silently under-count `routed_seat` with no error and no warning. A
committed, append-only ledger removes that failure mode entirely. That is higher
value than any remaining cost-history archaeology, and it is the structural fix
this set's audit identified but did not scope.

---

## Actuals — Session 1

```yaml
sessionID: fae81086-544e-41a3-bcff-b3554b158028
orchestrator: github-copilot / claude-opus-5 @ effort=high
transport: copilot-cli (project-verify-type.txt = COPILOT_CLI)
routedCalls:
  - step: "3.5 assignment analysis"
    taskType: analysis
    tier: 0
    costUsd: 0.0        # seat-metered; priced in credits via seat_cost
deviationFromRecommendation: >
  Ran on the Copilot seat rather than a direct-API seat, as the spec
  anticipated. The analyst's dissent is recorded above rather than
  suppressed. No provider API keys exist on this machine by design, so the
  recommended alternative was not available to this session.
```
