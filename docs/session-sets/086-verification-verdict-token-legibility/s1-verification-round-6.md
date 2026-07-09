ISSUES FOUND

The response correctly implements the core safety nets for auth preflight, verdict validation, and ledger-presence checks. The implementation has also been hardened against several fail-open conditions identified in prior internal reviews. However, a significant correctness defect exists in the integration between `start_session` and the new preflight module that would block valid users.

- **Issue 1:** The `start_session` preflight check incorrectly blocks a correctly authenticated Copilot seat if the operator omits the optional `--model` flag.
  - **Category:** Correctness
  - **Severity:** Major
  - **Details:**
    - **Violation:** The task requires wiring the auth preflight into `start_session` to "block a mis-authed copilot-cli seat". The current implementation blocks a correctly authed seat under normal usage.
    - **Impact:** An operator running a standard command like `python -m ai_router.start_session --engine copilot` (without `--model`) will have their session blocked by a preflight failure. The preflight module has a sensible default model for its probe, but the `start_session` wiring prevents that default from ever being used, instead forcing a probe against an invalid empty-string model (`model=""`). This makes the feature unusable in its default configuration and will create user confusion, as the seat is fine but the preflight reports an error. A reasonable reviewer would require this to be fixed before merge.
    - **Evidence:** The call site in `ai_router/start_session.py` is:
      ```python
      result = run_preflight(
          model=getattr(args, "model", None) or "",
          run_live_probe=run_live_probe,
      )
      ```
      If the `--model` flag is not provided to `start_session`, `getattr(args, "model", None)` is `None`, and the expression evaluates to `""`. This forces the preflight to run with `model=""`. The preflight module's own default (`DEFAULT_PROBE_MODEL`) is ignored. The CLI transport will then fail when dispatching to `copilot ... --model "" ...`, causing the preflight to fail and block a valid session.
      The fix is to allow the preflight module's default to be used, for instance by not passing the `model` argument at all when it's not specified on the command line.

#### NITS (optional, non-blocking)

- **Nit:** Session artifacts and code comments are stale regarding the preflight's live-probe behavior. The final code correctly probes on every `start_session` invocation, including re-entry (fixing a major bug found in Round 2). However, multiple artifacts still carry the old description. For example, `activity-log.json` claims it "skips the billed live probe on idempotent re-entry", and a comment in `copilot_preflight.py` has a message with "(live probe skipped on re-entry)". While the code is correct and safer, the documentation of its behavior is inconsistent.