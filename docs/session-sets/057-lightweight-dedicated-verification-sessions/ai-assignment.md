# ai-assignment.md — Set 057 (lightweight-dedicated-verification-sessions)

Per-session cheapest-capable orchestrator ledger. Recommendations are
authored via `route(task_type="analysis")` (gemini-pro, 2026-06-05), never
self-opined; model names normalized to current router IDs.

---

## Session 1: Audit & design-lock

### Recommended orchestrator
claude-code claude-opus-4-8 @ effort=medium

### Rationale
High-level design synthesis: consolidating two draft proposals,
orchestrating cross-provider consensus on seven coupled trade-offs (Q1–Q7),
and reconciling a defect that touches the S2/S3 plans. Top-tier reasoning
warranted; the routed consensus does the heavy analysis, so medium effort
on the orchestrator suffices.

### Estimated routed cost
Moderate (one cross-provider consensus pair + one analysis call).

| Step | Action | Routing Decision |
|------|--------|------------------|
| Re-verify tree | Read schema docs + source | Direct (file reads) |
| De-dup proposal | Keep cleaner 2nd draft | Direct (mechanical) |
| Consensus Q1–Q7 | gpt-5-4 + gemini-pro | `call_model` direct, cross-provider |
| ai-assignment | Per-session recommendation | `route(task_type="analysis")` → gemini-pro |
| Verdict + lock | Synthesize consensus | Orchestrator judgment (consensus was the routed reasoning) |

### Actuals (filled after the session)
- Orchestrator used: claude-code claude-opus-4-8 @ effort=medium
- Total routed cost: $0.4749 (consensus $0.2709 + ai-assignment $0.0078 +
  session verify R1 $0.1573 + R2 $0.0389)
- Deviations from recommendation: none.
- Notes for next-session calibration: gpt-5-4 high-effort verbose ($0.25 of
  the consensus); gemini-pro terse but aligned ($0.018). Q6 was the only
  material split → surfaced to operator (chose hard-TTY/soft-non-TTY). Both
  engines flagged the same concrete L3 defect (the D3-extension plan).
  Session verifier (gpt-5-4) caught two Major doc-consistency issues in
  round 1 (stale D3 text + an unsupported Q6 bypass detail); both fixed,
  round 2 VERIFIED. Lesson for S2/S3: scrub ALL occurrences when a lock
  supersedes earlier spec language, not just the obvious step.

**Next-session orchestrator recommendation (Session 2):**
claude-code claude-sonnet-4-6 @ effort=high
Rationale: S2 is well-scoped Python (session `type` field, `sN-issues.json`
enum + promoted fields, blessed `start_session --type` writer, the new
content-aware close-time validator, state-derivation helper, and tests) with
the design already locked — a capable, cheaper coding model at high effort
fits.

---

## Session 2: Schema + forced writer

### Recommended orchestrator
claude-code claude-sonnet-4-6 @ effort=high

### Rationale
Well-defined implementation against a locked design: schema additions, the
forced writer, the content-aware validator (replacing the dropped D3
extension), the derivation helper, and tests. Cost-effective coding model at
high effort is sufficient; no fresh architectural reasoning required.

### Estimated routed cost
Low–Medium (test-generation + one cross-provider session verification).

### Actuals (filled after the session)
- Orchestrator used: claude-code claude-opus-4-8 @ effort=high
- Total routed cost: $0.2842 (session-verification R1 $0.2319 gpt-5-4 +
  R2 $0.0522 gpt-5-4). No ai-assignment route this session — S1's routed
  analysis already authored the S3 recommendation below.
- Deviations from recommendation: ran on **opus-4-8** (operator's active
  engine) rather than the recommended sonnet-4-6. The locked design made
  the implementation mechanical; opus was not required but was the live
  engine. Cost impact is on the orchestrator side only (routed verification
  is identical).
- Notes for next-session calibration: the cross-provider verifier (gpt-5-4)
  caught **three Major correctness issues** in round 1 — (1) the close-time
  validator false-positived with an empty work-engine baseline, (2) the
  derivation treated `advisory-disagreement` as terminal instead of a
  human-stop dispute, (3) `seed_issues_envelope` didn't reject a VERIFIED
  verdict. All three were real and fixed in-flight; round 2 VERIFIED. Lesson
  for S3: the derivation's disposition partition and the validator's
  fail-closed edges are subtle — keep adversarial verification on them.
  S3 also inherits an explicit open item: the verification→remediation
  hand-off close transition (a non-terminal verification close leaves an
  all-complete `sessions[]` that invariant rule 6 rejects), plus the
  operator-raised clarification that **typed sessions take their step list
  from the workflow doc, not spec.md** (S2 added the announcement banner;
  S3 must write the generic procedure + wire the copy-prompt).

**Next-session orchestrator recommendation (Session 3):**
claude-code claude-opus-4-8 @ effort=medium
Rationale: S3 is a consistency-critical rewrite of core workflow + authoring
docs plus the operator-choice/gate wiring and held release; stronger
language/reasoning reduces drift risk.

---

## Session 3: Workflow, operator-choice, close-out, ship

### Recommended orchestrator
claude-code claude-opus-4-8 @ effort=medium

### Rationale
The core task is a consistency-critical rewrite of `ai-led-session-workflow.md`
and the authoring guide (per-set verification made consistent everywhere,
bounded rounds, the `second-opinion` tie-breaker), with the gate wiring and
version bump secondary. Strong reasoning/language minimizes documentation
drift across engine-agnostic surfaces.

### Estimated routed cost
Low–Moderate (documentation + one cross-provider session verification).

### Actuals (filled after the session)
- Orchestrator used: <tbd>
- Total routed cost: <tbd>
- Deviations from recommendation: <tbd>
- Notes for next-session calibration: <tbd>

**Next-session orchestrator recommendation (Session N+1):**
N/A — final session of the set.
