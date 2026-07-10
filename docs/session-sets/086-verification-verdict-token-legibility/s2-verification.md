- **Issue → Session is not actually complete; required terminal artifacts/workflow are still missing**  
  **Location →** `docs/session-sets/086-verification-verdict-token-legibility/session-state.json` (`session 2` is still `"status": "in-progress"`), `docs/session-sets/086-verification-verdict-token-legibility/activity-log.json` (`session-002/verification-BLOCKED` says verification/close are pending), `docs/session-sets/086-verification-verdict-token-legibility/session-events.jsonl` (only `work_started` for session 2), and no `change-log.md` is present in the working tree.  
  **Fix →** Do not treat this as a finished Set-086 terminal session until mandatory verification, `close_session`, and `change-log.md` are completed. If the session is intentionally paused, remove/segregate the in-progress session artifacts from the deliverable being reviewed.

- **Issue → Unrelated work is mixed into the changeset**  
  **Location →** Untracked files/directories in `git status`: `docs/planning/module-organized-projects-primer.md`, `docs/planning/module-organized-projects-recommendation.md`, and `docs/session-sets/087-module-organized-projects-foundations/`.  
  **Fix →** Remove, stash, or split these into a separate branch/session before verification/merge. They are unrelated to Set 086 Session 2’s stated scope.

- **Issue → Out-of-scope router model changes were introduced, including placeholder values**  
  **Location →** `ai_router/router-config.yaml` additions for `gemini-3-1-pro` and `gpt-5-5` with placeholder pricing/limits/comments.  
  **Fix →** Revert these model additions from this session, or move them into a dedicated change with validated model IDs/pricing and explicit tests/docs. They are not part of the Set 086 Session 2 contract.

- **Issue → The new diagnostics wiring is not regression-tested at the actual integration points**  
  **Location →** `ai_router/tests/test_transport_diagnostics.py` only exercises the helper module; there are no tests covering the new call sites in `ai_router/__init__.py` (`_copilot_cli_dispatch`, `_route_via_copilot_cli`, verifier-role dispatch path).  
  **Fix →** Add integration-style unit tests that monkeypatch the transport/diagnostics layer and assert:
  - failed dispatches call `emit_diagnostics()` from `_copilot_cli_dispatch`
  - verifier dispatches pass `role="verifier"`
  - raised `CopilotCliRoutingError` includes the redacted `diagnostics_summary()` text

- **Issue → “Best-effort and never masks transport failure” is not fully upheld**  
  **Location →** `ai_router/transport_diagnostics.py`, `emit_diagnostics()`: only `OSError` from `writer(path, line)` is caught. Failures in `build_record()`, `json.dumps(record)`, or non-`OSError` writer failures can still escape and replace the original transport failure.  
  **Fix →** Wrap the entire record-build/serialize/write path in a broad exception handler (or at minimum catch serialization and non-`OSError` write failures too), log a warning to stderr, and return without re-raising.