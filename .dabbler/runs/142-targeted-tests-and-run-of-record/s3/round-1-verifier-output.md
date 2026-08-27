ISSUES FOUND

- **Issue 1:** Changed-line coverage is not actually computed on the documented verification path.
  - **Category:** Completeness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/facts.py:673-679`, `ai_router/router-config.yaml:519-560`, `AGENTS.md:118-132`, `pyproject.toml:19-23`
  - **Failure scenario:** A normal session follows `AGENTS.md`: run the printed `python -m pytest ...` command, record it, then verify. Because no coverage report is configured or produced by that path, `collect_facts` records `changedLineCoverage` as `unknown` instead of the touched/covered/uncovered line facts. This is probable because it is the repository’s documented main path and current config.
  - **Acceptance criterion:** `JUDGMENT - A reviewer must see that the documented preverify-targeted path produces a deterministic-facts record with measured changed-line coverage, including changed, covered, and uncovered lines, without relying on an undocumented pre-existing coverage report.`
  - **Details:** **Violation** — the spec requires “Changed-line coverage is computed and recorded” and “which lines the change touched, which of those the selected tests actually executed, and which are uncovered.” **Impact** — set 144 cannot rely on this fact to prevent review-skipping because ordinary verification records no execution-line fact. **Evidence** — `collect_facts` only reads `testing.coverage.report`; the config and documented test command do not declare or produce one.

- **Issue 2:** The deterministic fact record does not record the selected test command after a successful preverify gate.
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/affected.py:608-708`, `ai_router/facts.py:652-672`, `docs/session-sets/142-targeted-tests-and-run-of-record/spec.md:184-187`
  - **Failure scenario:** Any ordinary successful `verify` run with valid `preverify-targeted` evidence reaches `preverify_gate`’s final success path, which returns `PreverifyGate(True)` with an empty `command`. `collect_facts` then writes a passing `tests` fact without the command the selected tests ran. This is not edge-case behavior; it is the normal success path.
  - **Acceptance criterion:** `JUDGMENT - A reviewer must see that a successful verify run records the accepted preverify-targeted test command in deterministic-facts.jsonl rather than an empty passing tests row.`
  - **Details:** **Violation** — the spec requires normalizing deterministic outputs “alongside the selected test command into one deterministic fact record.” **Impact** — the fact record cannot prove which selected command was accepted, so later review/gating cannot audit that the targeted run was the one claimed. **Evidence** — `preverify_gate` returns default-empty success objects, and `collect_facts` blindly uses `gate.command`.