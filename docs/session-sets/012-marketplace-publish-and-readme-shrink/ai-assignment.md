# AI Assignment Ledger — 012-marketplace-publish-and-readme-shrink

> **Note on routing for this set.** Standing operator instruction
> (recorded in orchestrator memory, 2026-05-01) restricts ai-router
> usage to end-of-session cross-provider verification only. The
> "always route, never self-opine" rule (workflow Rule 17) is
> deliberately suspended for the duration of this constraint, and the
> per-session `Recommended orchestrator`, `Rationale`, and
> `Next-session orchestrator recommendation` blocks below were
> authored directly by the orchestrator without a routed
> `task_type="analysis"` call. Once the constraint is lifted, future
> sets should resume routed authoring; the deviation is recorded in
> the actuals on each session's block.

---

## Session 1: Workspace-relative config + metrics auto-discovery

### Recommended orchestrator
claude-code claude-opus-4-7 @ effort=high

### Rationale
Small, surgical Python change with a focused unit-test surface. The
hard parts are not size but resolution-order edge cases: filesystem-walk
termination at root, symlink behavior, env-var precedence, and the
metrics-follows-config coupling. Opus at high effort handles the
careful-correctness demand on the resolution-order branches and the
test framing without escalation; Sonnet at medium would suffice for
the mechanical pieces but the precedence reasoning tips the call.

### Estimated routed cost
None this session — only end-of-session verification routes (per the
standing operator constraint).

| Step | Action | Routing Decision |
|------|--------|------------------|
| 1 | Read prerequisites (spec, current `config.py` / `metrics.py` / tests, `pyproject.toml`, `__init__.py` version) | Direct (orchestrator) |
| 2 | Register Session 1 start (write `session-state.json`) | Direct (file-write helper, no API call) |
| 3 | Author this `ai-assignment.md` | Direct (router suspended per operator) |
| 4a | Add `_find_workspace_config()` + new resolution order in `ai_router/config.py:load_config()` | Direct (mechanical edit per spec) |
| 4b | Update `ai_router/metrics.py:_log_path()` to follow the resolved config's directory | Direct (mechanical edit per spec) |
| 4c | Author `ai_router/tests/test_config.py` and `test_metrics.py` covering the new branches | Direct (test authoring per spec) |
| 4d | Bump `dabbler-ai-router` 0.1.0 → 0.1.1 in `pyproject.toml` and `ai_router/__init__.py:__version__` | Direct (mechanical edit) |
| 5 | Run full pytest suite (target: existing count + new tests, no regressions) | Direct (shell command) |
| 6 | End-of-session cross-provider verification | Routed: `route(task_type="session-verification")` — the only API call this session |
| 7 | Handle verification result (fix issues if any; re-verify, max 2 retries) | Mixed: fixes are direct; re-verify is routed |
| 8 | Commit, push, run `close_session.py` and stamp Session 1 closed | Direct (CLI invocation) |

### Actuals (filled after the session)
- Orchestrator used: claude-code claude-opus-4-7 @ effort=high (matches recommendation)
- Total routed cost: $0.1232 — two rounds of `session-verification`
  via gpt-5-4 ($0.0755 round 1 + $0.0477 round 2). No analysis routes
  per the standing operator constraint.
- Deviations from recommendation: none.
- Notes for next-session calibration: round-1 verifier flagged a real
  Major issue — the metrics auto-co-location was implemented too broadly
  (applied to every resolved config path, breaking the spec's
  "env-var-overridden config does NOT auto-redirect metrics" requirement).
  Fix shape: tag the resolution source (`explicit` / `env` / `workspace`
  / `bundled-default`) and gate the metrics-co-location on
  `source == workspace`. Round-1 verifier also caught a non-deterministic
  miss-path test (uuid-relpath fix). Lesson for Session 2: when a spec
  says "X follows Y unless Z", build the source-of-X tracking into the
  resolver itself rather than into a downstream consumer — the
  downstream consumer can't tell the difference between sources after
  the fact. This is a candidate for `lessons-learned.md` if the same
  shape recurs.

**Next-session orchestrator recommendation (Session 2):**
claude-code claude-opus-4-7 @ effort=high
Rationale: Session 2 is workflow-YAML + runbook authoring with a
human-handoff component (Marketplace publisher account + PAT minting).
The runbook completeness bar — every failure mode actionable, every
human-driven step explicit — needs Opus-level prose precision; the
workflow YAML's classify-job regex and environment-protection wiring
need careful correctness. Comparable in shape to Set 010 Session 2
which closed VERIFIED in one round.

> **Note re: Set 012 forward sessions.** The operator surfaced the
> adoption-bootstrap-prompt initiative on 2026-05-04 with a near-term
> need (a new project starting ASAP). Sessions 2 and 3 of this set
> may need amendment, or a parallel new set may insert before Set 011.
> Decision is the operator's at Session 2 start.

---

## Session 2: VS Code Marketplace publishing

### Recommended orchestrator
claude-code claude-opus-4-7 @ effort=high

### Rationale
Session 2 is workflow-YAML + runbook authoring with a human-handoff
component (Marketplace publisher account + PAT minting). The runbook
completeness bar — every failure mode actionable, every human-driven
step explicit — needs Opus-level prose precision; the workflow YAML's
classify-job regex and environment-protection wiring need careful
correctness. Comparable in shape to Set 010 Session 2 which closed
VERIFIED in one round.

### Estimated routed cost
$0.15–$0.30, single end-of-session verification (no analysis routes
per the standing operator constraint). Round 2 may add $0.10–$0.15
if the verifier flags a gap in the runbook's failure-modes table or
the workflow's dual-publish ordering.

### Notable bundled change
The operator authorized (2026-05-04, in this same session) the
removal of the `Dabbler: Copy: Start next session — maxout Claude`
command and its session-set context-menu entry. The change is folded
into the v0.13.0 bump rather than carved into its own VSIX release —
both are user-visible Marketplace-launch-window changes and shipping
them as one v0.13.0 entry keeps the CHANGELOG narrative clean. The
broader `— maxout <engine>` workflow concept (the typed phrase
suffix) remains documented in `docs/ai-led-session-workflow.md`; only
the one-click affordance is gone.

| Step | Action | Routing Decision |
|------|--------|------------------|
| 1 | Read prerequisites (Set 010 release.yml, release-process.md, current package.json, CHANGELOG) | Direct (orchestrator) |
| 2 | Register Session 2 start (work_started event + session-state currentSession=2) | Direct (helper) |
| 3 | Author Session 2 block in this `ai-assignment.md` | Direct (router suspended per operator) |
| 4 | Bundled: remove maxoutClaude command (copyCommand.ts, package.json, recompile dist/ + out/, CHANGELOG entry) | Direct (mechanical edits) |
| 5 | Author `.github/workflows/publish-vscode.yml` (classify / build / publish-marketplace / publish-openvsx jobs) | Direct (mechanical authoring) |
| 6 | Author `docs/planning/marketplace-release-process.md` (one-time setup → per-release checklist → rollback → failure-modes → maintenance) | Direct (mechanical authoring) |
| 7 | Bump extension `package.json` 0.12.1 → 0.13.0 | Direct (mechanical edit) |
| 8 | Update `tools/dabbler-ai-orchestration/CHANGELOG.md` with `[0.13.0]` section | Direct (mechanical edit) |
| 9 | Recompile (`npm run compile` + `npx tsc --outDir out`) so dist/ and out/ pick up new version | Direct (shell command) |
| 10 | End-of-session cross-provider verification | Routed: `route(task_type="session-verification")` — the only API call this session |
| 11 | Handle verification result (fix issues if any; re-verify, max 2 retries) | Mixed: fixes are direct; re-verify is routed |
| 12 | Build disposition.json + activity-log entries; commit; run `close_session.py` | Direct (CLI invocation) |

### Actuals (filled after the session)
- Orchestrator used: claude-code claude-opus-4-7 @ effort=high (matches recommendation)
- Total routed cost: **$0.1960** — two rounds of `session-verification`
  via gpt-5-4 ($0.157892 round 1 + $0.038090 round 2). No analysis
  routes per the standing operator constraint. Within the spec's
  $0.15–$0.30 single-round projection band; the second round added
  $0.04 — modest because the delta prompt scoped Round 2 to two
  fixes only.
- Deviations from recommendation: **bundled the maxoutClaude removal
  into this session.** Spec did not anticipate it; operator authorized
  it 2026-05-04 alongside the directive to finish Set 012, with the
  rationale that v0.13.0 is the natural release for both
  Marketplace-launch and a small UX cleanup. The `[0.13.0]` CHANGELOG
  entry surfaces both under one release note; the change-log.md
  records the bundling.
- Notes for next-session calibration: round-1 verifier flagged two
  real Major issues — (a) PyPI release.yml's `on.push.tags: ['v*']`
  glob also matches `vsix-v*` tag pushes (would have triggered a
  spurious failing PyPI run on every Marketplace release), fixed by
  adding `'!vsix-v*'` negative pattern; (b) CHANGELOG `[0.13.0]`
  entry over-claimed that Marketplace publication had landed when
  only the publishing infrastructure landed, fixed by reframing as
  "Marketplace-publish-ready". Lesson worth filing if the pattern
  recurs: when authoring CI/CD coexistence, **trace the actual glob
  match** rather than assuming prefixes are sufficient — `v*` glob
  in GitHub Actions is greedy on the leading `v`.

**Next-session orchestrator recommendation (Session 3):**
claude-code claude-opus-4-7 @ effort=high
Rationale: Session 3 is the README shrink + technical-detail spinout
to `docs/repository-reference.md`. Prose-quality verification on the
leaner README + completeness check on the reference doc; the spec
warns that Round 2 is more likely than usual given the prose-tighten
nature of the work. Opus at high effort handles tone calibration and
cross-link integrity audits without escalation.
