# ISSUES_FOUND

1. **Confirmed** — the `fileSystem.ts` excerpt shows the runtime mapping from `session-state.json.forceClosed` into `liveSession.forceClosed`.

2. **Confirmed** — the `close-out.md` §2 combination-rules block now names both the `AI_ROUTER_ALLOW_FORCE_CLOSE_OUT=1` env-var gate and the `--reason-file` requirement, and points to §5.

3. **Rejected**  
   **Issue** → the new assertions do **not** fully prove the original invariant “no lock acquired.”  
   **Location** → `ai-router/tests/test_close_session_skeleton.py` (`test_force_rejected_without_env_var`, `test_force_rejected_without_reason_file`)  
   **Fix** → asserting that `.close_session.lock` is absent *after* rejection only proves no lock file remained on disk. It does **not** catch a regression where `acquire_lock()` is called and then released before returning `invalid_invocation`. Add an explicit spy/monkeypatch around `acquire_lock` and assert it was never invoked. Keeping the on-disk absence check as a secondary assertion is fine.

4. **Confirmed** — the unified test does exercise the full operator path (`run(args)` + `mark_session_complete(...)`) and checks the combined artifacts. The two-event expectation is defensible as stated: one event from the CLI path carrying `reason`, one from the snapshot-flip path carrying `failed_checks`.