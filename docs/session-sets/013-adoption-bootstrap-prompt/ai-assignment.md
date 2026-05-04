# AI Assignment Ledger — 013-adoption-bootstrap-prompt

> **Note on routing for this set.** Standing operator instruction
> (recorded in orchestrator memory, 2026-05-01) restricts ai-router
> usage to end-of-session cross-provider verification only. The
> "always route, never self-opine" rule (workflow Rule 17) is
> deliberately suspended for the duration of this constraint, and the
> per-session `Recommended orchestrator`, `Rationale`, and
> `Next-session orchestrator recommendation` blocks below were
> authored directly by the orchestrator without a routed
> `task_type="analysis"` call. The deviation is recorded in the
> actuals on each session's block.

---

## Session 1: Canonical adoption-bootstrap doc + workflow-doc section

### Recommended orchestrator
claude-code claude-opus-4-7 @ effort=high

### Rationale
Session 1's deliverable is two prose-heavy documents: a 9-step
runtime-instruction-set doc (`docs/adoption-bootstrap.md`) that
orients an arbitrary AI assistant + a new "Cost-budgeted verification
modes" section in `docs/ai-led-session-workflow.md` that documents an
exception to the workflow's Rule 2. Both are user-facing in the sense
that arbitrary AI engines (including Gemini and GPT) read them and
must orient correctly, so the prose-quality bar is high. Opus at
effort=high handles the "no Claude-specific tool names" discipline,
the budget-tier mapping precision, and the Rule 2 exception framing
without escalation. Sonnet at medium effort would suffice for the
mechanical pieces but the cross-engine prose and the Rule 2 framing
tip the call to Opus.

### Estimated routed cost
None this session — only end-of-session verification routes (per the
standing operator constraint).

| Step | Action | Routing Decision |
|------|--------|------------------|
| 1 | Read prerequisites (workflow doc structure, sessionGenPrompt schema) | Direct (orchestrator) |
| 2 | Register Session 1 start (write `session-state.json`) | Direct (file-write helper) |
| 3 | Author this `ai-assignment.md` | Direct (router suspended per operator) |
| 4 | Author `docs/adoption-bootstrap.md` (9-step canonical doc) | Direct (prose authoring per spec) |
| 5 | Update `docs/ai-led-session-workflow.md` (new "Cost-budgeted verification modes" section) | Direct (mechanical edit + prose authoring) |
| 6 | End-of-session cross-provider verification | Routed: `route(task_type="session-verification")` — the only API call this session |
| 7 | Handle verification result (fix issues if any; re-verify, max 2 retries) | Mixed: fixes are direct; re-verify is routed |
| 8 | Commit, push (lands canonical doc on origin/master, makes URL live + lands Set 012 S1 commit), run `close_session.py` | Direct (CLI invocation) |

### Actuals (filled after the session)
- Orchestrator used: claude-code claude-opus-4-7 @ effort=high (matches recommendation)
- Total routed cost: $0.5898 — four rounds of `session-verification`
  via gpt-5-4 ($0.1512 + $0.1995 + $0.1759 + $0.0632). No analysis
  routes per the standing operator constraint.
- Deviations from recommendation: cost ran over the projected
  $0.15–$0.40 upper bound (actual $0.59). Driver: four rounds rather
  than the projected two — the verifier kept finding tier-naming /
  schema-compatibility / arbitrary-path-discipline issues that
  required progressive polish. Final round was clean.
- Notes for next-session calibration: the doc-as-runtime-instruction-
  set verification surface is much denser than I projected — every
  field of the embedded `budget.yaml` schema, every cross-link, every
  Step's flow logic, every edge-case guard becomes a verification
  target. For Session 2 (extension wiring + READMEs + VSIX build),
  the verification surface is much narrower (clipboard-string
  fidelity, command-id consistency, README cross-links, VSIX
  completeness), so the projected $0.05–$0.15 / 1-round shape
  should hold. Lesson: when authoring an embedded schema in prose,
  enumerate every field's missing-field default explicitly upfront
  — the verifier will find every gap, and round-2 fixes that add
  fields tend to surface round-3 "but the new field has its own
  compatibility-rule gap" cascade. Worth a candidate
  `lessons-learned.md` note about doc-as-instruction-set
  verification cost density.

**Next-session orchestrator recommendation (Session 2):**
claude-code claude-opus-4-7 @ effort=high
Rationale: Session 2 is mechanical wiring — TS command file (~25
lines), package.json updates, READMEs, CHANGELOG, VSIX build, and a
sideload smoke test. Verification surface is narrow (clipboard
fidelity, command-id consistency, README cross-links, VSIX
completeness). Sonnet at medium effort would handle this cleanly;
Opus at high effort is overkill for the volume but matches the
operator's typical choice and keeps consistency with Session 1.
Either is defensible.

---

## Session 2: Extension command + READMEs + 0.12.1 VSIX build + smoke test

### Recommended orchestrator
claude-code claude-opus-4-7 @ effort=high

### Rationale
Session 2's deliverables are mechanical: a ~25-line TypeScript
command file that copies a constant string to the clipboard, three
small package.json updates (version + keywords + description +
commands list), a CHANGELOG entry, two README pointer updates
(extension + repo-root), a VSIX build, and a sideload smoke test.
Verification surface is narrow: clipboard-string byte-fidelity vs.
the spec sketch, command-id / title consistency between
`package.json` and `extension.ts`, README cross-link correctness,
and VSIX completeness. Sonnet at medium effort would handle every
piece cleanly. Opus at high effort is overkill for the volume but
matches Session 1's choice for handoff consistency and matches the
operator's typical preference. The cost differential against Sonnet
is small enough on this short session that the consistency wins.

### Estimated routed cost
$0.05–$0.15 — single end-of-session `session-verification` route
(typically Round 1 passes for this category of mechanical work).
No analysis routes per the standing operator constraint.

| Step | Action | Routing Decision |
|------|--------|------------------|
| 1 | Read prerequisites (curl URL, package.json, extension.ts, READMEs) | Direct (orchestrator) |
| 2 | Register Session 2 start (write `session-state.json`) | Direct (file-write helper) |
| 3 | Author this Session 2 block (above) + backfill Session 1 actuals (above) | Direct (router suspended per operator) |
| 4 | Author `copyAdoptionBootstrapPrompt.ts` + register in `extension.ts` + add command id to `package.json` | Direct (mechanical authoring) |
| 5 | Bump `package.json` version 0.12.0 → 0.12.1 + extend keywords + update description | Direct (mechanical edits) |
| 6 | Add v0.12.1 entry to `CHANGELOG.md` | Direct (mechanical edit) |
| 7 | Update extension README + repo-root README with adoption-bootstrap pointers | Direct (prose authoring) |
| 8 | Build VSIX (`npm install && npx vsce package`) | Direct (CLI invocation) |
| 9 | Smoke test (manifest inspection + clipboard-string round-trip + curl) | Direct (CLI / process inspection) |
| 10 | End-of-session cross-provider verification | Routed: `route(task_type="session-verification")` |
| 11 | Handle verification result (fix issues if any; re-verify, max 2 retries) | Mixed: fixes are direct; re-verify is routed |
| 12 | Commit, push, run `close_session.py` (writes `change-log.md` for the set) | Direct (CLI invocation) |

### Actuals (filled after the session)
- Orchestrator used: claude-code claude-opus-4-7 @ effort=high (matches recommendation)
- Total routed cost: $0.1296 — two `session-verification` calls via
  gpt-5-4 ($0.0898 + $0.0398). The first call returned a verdict but
  the orchestrator's Python wrapper crashed reading the wrong
  RouteResult attribute (`.model` vs the actual `.model_name`) before
  the verdict was captured to a file; the re-run on the corrected
  attribute name returned `VERIFIED` with no issues. Both calls were
  logged to metrics.jsonl per the append-only contract — the cost is
  real spend, not a duplicate write. No analysis routes per the
  standing operator constraint.
- Deviations from recommendation: routed cost ran slightly under the
  projected $0.05–$0.15 upper bound on the *verdict-returning* call
  alone ($0.0398), but the inadvertent first-call crash pushed the
  full session spend to $0.1296 — at the top of the projected range
  rather than below it. Single-round verification was correctly
  predicted; the only unplanned spend was orchestrator-side
  brittleness in the Python ai_router invocation, not anything from
  the verifier.
- Notes for next-set calibration: when invoking `ai_router.route()`
  inline from Python, prefer reading the result by `model_name` /
  `model_id` (the actual RouteResult dataclass fields) rather than
  guessing `.model`. A small wrapper that prints the result to a file
  before any field access would prevent the read-then-crash double-
  spend pattern. This is a candidate `lessons-learned.md` note about
  guarding routed-call result reads. Session 2's verification surface
  was correctly modeled as narrow (mechanical wiring, byte-level
  comparison of a single string, manifest field checks) and Round 1
  passed cleanly — the spec's "Round 1 typically passes for this
  category" projection held.
