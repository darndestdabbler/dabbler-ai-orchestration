# AI Assignment Ledger — 010-pypi-publish-and-installer

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

## Session 1: Rename `ai-router/` → `ai_router/`, add `pyproject.toml`

### Recommended orchestrator
claude-code claude-opus-4-7 @ effort=high

### Rationale
The work is mechanical-but-broad: a directory rename plus
forward-looking path-string updates across ~30–40 forward-facing
tracked files (instruction files, the workflow doc, the README, a
handful of planning docs, the scripts/verify_session_*.py importlib
shim, a few TS sources, the verifier prompt template, the
session-state schema example doc, plus internal Python references
inside the renamed package). Authoring `pyproject.toml` to the modern
PEP 621 schema and wiring `[project.scripts]` for the seven existing
CLI surfaces requires careful attention to entry points but no
architectural reasoning. Opus at high effort handles the
careful-wording demand on the prose updates and the test-suite
re-run cleanly; Sonnet at medium effort would also suffice for the
mechanical surface but the prose-quality bar in the agent-instruction
files and the workflow doc tips the call to Opus.

### Estimated routed cost
None this session — only end-of-session verification routes (per the
standing operator constraint).

| Step | Action | Routing Decision |
|------|--------|------------------|
| 1 | Read prerequisites (spec, current `ai-router/` layout, `pytest.ini`, agent files) | Direct (orchestrator) |
| 2 | Register Session 1 start (write `session-state.json`) | Direct (file-write helper, no API call) |
| 3 | Author this `ai-assignment.md` | Direct (router suspended per operator) |
| 4 | `git mv ai-router ai_router` | Direct (shell command) |
| 5 | Update `pytest.ini` testpaths | Direct (mechanical edit) |
| 6 | Update internal references inside the renamed `ai_router/` (Python files, docs, schemas, config) | Direct (mechanical find-and-replace) |
| 7 | Update `CLAUDE.md`, `AGENTS.md`, `GEMINI.md` path references | Direct (mechanical edit) |
| 8 | Update `README.md` file map + forward-looking path references in adoption section | Direct (mechanical edit; full collapse of adoption section is Session 3 work) |
| 9 | Update `docs/ai-led-session-workflow.md` path references and the importlib-shim block | Direct (mechanical edit) |
| 10 | Update `docs/planning/repo-worktree-layout.md` and `docs/planning/lessons-learned.md` path references | Direct (mechanical edit) |
| 11 | Update `docs/session-state-schema-example.md` path references | Direct (mechanical edit) |
| 12 | Update `scripts/verify_session_*.py` to use `ai_router` (drop importlib shim where possible) | Direct (mechanical edit) |
| 13 | Update `tools/dabbler-ai-orchestration` TypeScript sources + README path references | Direct (mechanical edit) |
| 14 | Author `pyproject.toml` at repo root (PEP 621 schema, `[project.scripts]` for 7 CLIs) | Direct (mechanical authoring against spec) |
| 15 | Smoke test: `pip install -e .` in fresh venv + `python -c "import ai_router"` | Direct (shell command) |
| 16 | Run full pytest suite (target: 676 passing → 676 passing) | Direct (shell command) |
| 17 | End-of-session cross-provider verification | Routed: `route(task_type="session-verification")` — the only API call this session |
| 18 | Commit, push, run `close_session.py` and stamp Session 1 closed | Direct (CLI invocation) |

### Actuals (filled after the session)
- Orchestrator used: claude-code claude-opus-4-7 @ effort=high (matches recommendation)
- Total routed cost: $0.3254 — three rounds of `session-verification`
  via gpt-5-4 ($0.0767 + $0.1547 + $0.0941). No analysis routes per
  the standing operator constraint.
- Deviations from recommendation: none. The session ran on the
  recommended orchestrator at the recommended effort.
- Notes for next-session calibration: the verifier flagged 4 Major
  prose / wiring issues across rounds 1–2 (importlib shim still
  present in verify scripts; `[project.scripts]` keys not matching
  spec literal names; literal old path in forward-looking
  historical-context parens; proposal-doc carveout needing explicit
  Path note). All addressed in-session; round 3 returned VERIFIED.
  For Session 2, the `[project.scripts]` literal-name interpretation
  is now baked into `pyproject.toml`, so the release workflow can
  proceed without re-litigating it.

**Next-session orchestrator recommendation (Session 2):**
claude-code claude-opus-4-7 @ effort=high
Rationale: Authoring a GitHub Actions release workflow with OIDC
trusted-publishing semantics + the release-process documentation is
small in line-count but high-stakes (a wrong matrix or a missing
`id-token: write` permission breaks the publish path). Opus at high
effort matches the careful-wording demand for the workflow YAML and
the per-release runbook prose. Sonnet at medium effort would also be
viable; bias toward Opus until the workflow has shipped at least one
successful release.

---

## Session 2: Publish to PyPI via GitHub Actions (OIDC trusted publishing)

### Recommended orchestrator
claude-code claude-opus-4-7 @ effort=high

### Rationale
Authoring `.github/workflows/release.yml` with OIDC trusted-publishing
semantics + the release-process runbook is small in line-count
(~150 YAML + ~200 markdown) but high-stakes: a wrong permissions
block, missing `id-token: write`, or sloppy environment-protection
config breaks the publish path silently or — worse — leaks an
exploit. Opus at high effort matches the careful-wording demand for
the workflow YAML and the per-release runbook prose. The README
adoption-section collapse and the `tools/dabbler-ai-orchestration/README.md`
PyPI-availability note are mechanical follow-ups inside the same
session.

The standing operator constraint suspends Rule #17 routed authoring
of this block; recorded in the Session 1 disposition.

### Estimated routed cost
None this session — only end-of-session verification routes (per the
standing operator constraint).

### Pre-session check completed during this session
PyPI name availability: `dabbler-ai-router` is **available** (HTTPS
GET against `https://pypi.org/pypi/dabbler-ai-router/json` returned
404 on 2026-05-02). No fallback name needed.

| Step | Action | Routing Decision |
|------|--------|------------------|
| 1 | Read prerequisites (Session 1 deliverables, current `pyproject.toml`, README adoption section, spec Session 2 block) | Direct (orchestrator) |
| 2 | Register Session 2 start (overwrite `session-state.json`) | Direct (file-write helper, no API call) |
| 3 | Append Session 1 actuals + Session 2 block to `ai-assignment.md` | Direct (router suspended per operator) |
| 4 | Check PyPI name availability for `dabbler-ai-router` | Direct (one-shot HTTPS GET, no API key) |
| 5 | Author `.github/workflows/release.yml` (OIDC trusted publishing, sdist+wheel build, TestPyPI for `-rc*` tags, PyPI for `vX.Y.Z` tags, environment-protected) | Direct (mechanical authoring against spec) |
| 6 | Author `docs/planning/release-process.md` (one-time PyPI/OIDC setup, per-release checklist, rollback section) | Direct (mechanical authoring against spec) |
| 7 | Collapse README adoption section to ~10-line PyPI flow (`pip install dabbler-ai-router` + tuning + first session set), keeping the editable-install fallback for adopters who prefer the source path | Direct (mechanical edit) |
| 8 | Add v0.1+ PyPI-availability note to `tools/dabbler-ai-orchestration/README.md` foreshadowing Session 3's install command | Direct (mechanical edit) |
| 9 | Run full pytest suite (target: still 676 passing — Session 2 changes are doc + workflow only; no Python source touched) | Direct (shell command) |
| 10 | End-of-session cross-provider verification | Routed: `route(task_type="session-verification")` — the only API call this session |
| 11 | Author disposition + activity log; commit, push, run `close_session.py`; send notification | Direct (CLI invocation) |

### Actuals (filled after the session)
- Orchestrator used: <filled at close-out>
- Total routed cost: <filled at close-out>
- Deviations from recommendation: <filled at close-out>
- Notes for next-session calibration: <filled at close-out>

**Next-session orchestrator recommendation (Session 3):**
claude-code claude-opus-4-7 @ effort=high
Rationale: Session 3 is the largest single-session estimate in the
set ($0.20–$0.35) — TS command authoring with venv detection,
QuickPick-driven PyPI vs GitHub-sparse-checkout flow,
`router-config.yaml` preservation logic, the graceful "not
configured" tree-item refactor in the Provider Queues / Heartbeats
views, ~12–18 standalone-mocha tests, README updates, and the VSIX
rebuild. The breadth of TS + Python coupling (the install command
must mesh with the views' error-handling refactor) plus the
careful-wording demand on the README's screenshot-led collapse
favor Opus at high effort. Hold this recommendation until the
release workflow has shipped at least one successful publish; if the
human has not yet exercised the release path by the time Session 3
starts, note that in the actuals.
