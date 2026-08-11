ISSUES FOUND

- **Issue 1:** Preflight reports the no-evidence backstop-spend path as a blocking `verification_integrity` refusal.
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/close_preflight.py:430`, `ai_router/close_preflight.py:452`, `ai_router/close_session.py:1820`, `ai_router/close_session.py:2005`, `ai_router/gate_checks.py:1533`
  - **Failure scenario:** A clean, pushed API session with no stamped verification evidence runs preflight before close. `close_session` would run the backstop before gate checks, and a VERIFIED backstop result can close; preflight instead runs `verification_integrity` first and exits non-zero. This is probable because this is the exact expensive case the feature exists to expose.
  - **Acceptance criterion:** `JUDGMENT - A no-stamped-evidence, resolvable backstop case must not list verification_integrity as an unmet blocking row solely because sN-verification*.md is absent before the backstop would run.`
  - **Details:** Violation: the tool claims a would-route backstop is a “cost warning, not a refusal” and should not “refuse something the close allows.” Impact: users get a false “close_session would refuse” result and may do unnecessary remediation instead of understanding the close would spend a routed round. Evidence: `close_session` runs `run_close_backstop` before `_run_gate_checks`, while `close_preflight.evaluate` runs all `GATE_CHECKS` before `_backstop_obligation`.

- **Issue 2:** Preflight misses close_session’s backstop-written bookkeeping ignore path on reruns.
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/close_session.py:1903`, `ai_router/close_session.py:2005`, `ai_router/close_session.py:839`, `ai_router/close_preflight.py:430`, `ai_router/close_backstop.py:453`, `ai_router/tests/test_close_backstop.py:788`
  - **Failure scenario:** A close attempt runs a VERIFIED backstop, writes artifacts/disposition/round ledger, then fails a later gate. On rerun, `close_session` skips the backstop and ignores those exact bookkeeping paths for `working_tree_clean`; preflight will instead report `working_tree_clean` as blocking. This is probable because the repo has a dedicated regression test for this real rerun shape.
  - **Acceptance criterion:** `JUDGMENT - In the rerun-after-backstop-bookkeeping scenario, close_preflight must tolerate the same backstop written_paths for working_tree_clean that close_session passes via extra_clean_ignore.`
  - **Details:** Violation: preflight says it calls predicates “exactly the way close_session._run_gate_checks invokes” them. Impact: the preflight sends users to commit/clean paths that close_session intentionally tolerates, hiding the real later blocker. Evidence: `close_session` carries `backstop.written_paths` into `_run_gate_checks(... extra_clean_ignore=...)`; `close_preflight` never obtains or passes those paths.

- **Issue 3:** `--session-number` only affects the backstop row, not the gate predicates.
  - **Category:** Completeness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/close_preflight.py:227`, `ai_router/close_preflight.py:406`, `ai_router/close_preflight.py:430`, `ai_router/close_preflight.py:717`, `ai_router/gate_checks.py:701`, `ai_router/gate_checks.py:1518`
  - **Failure scenario:** In a multi-session set, a user or script passes `--session-number N` expecting to preflight session N. The report labels/backstops N, but activity, next-orchestrator, change-log, verification, UAT, checklist, and test freshness predicates still resolve the session from `session-state.json`. Multi-session sets are normal in this workflow, so a mislabeled mixed-session report is likely when the override is used.
  - **Acceptance criterion:** `JUDGMENT - Passing an explicit session number must make every session-scoped obligation evaluate that same session, or the CLI must reject/remove the option instead of producing a mixed-session report.`
  - **Details:** Violation: the task required preflight to run “against a session set and session number,” and the CLI help says “Session to preflight.” Impact: the command can falsely pass or fail obligations for the wrong session. Evidence: `evaluate()` resolves the explicit session but passes only `session_set_dir` and `disposition` to `GATE_CHECKS`; those predicates independently read the session in focus from state.

NITS

- **Nit:** Measurement prose is stale/inconsistent: `close_preflight.py` still says `verification_backstop` is “78 of the 212,” while the replay/docs report `79 of 214`.
- **Nit:** The preflight does not report the terminal path-aware critique / contract gate warnings or interactive hard failures that still live after the main gate chain, so “every close-out obligation” is broader than the implemented report.