**ISSUES FOUND**

- **Issue 1:** Stale stamped evidence can settle a later close after new commits
  - **Category:** Correctness
  - **Severity:** Major
  - **Details:**
    - **Violation:** The plan requires that the backstop/evidence *cover the close being performed* — step 5 says `close_session` must produce the verification itself and “the stamped row must corroborate its own close,” and step 3 only stands the backstop down when the session already has valid stamped evidence for that close. A row generated before later commits does not satisfy that.
    - **Impact:** A session can be verified at commit A, then changed again and committed as B, and still close successfully on A’s stale evidence. That means final session work can ship without any verification of the actual state being closed, which is exactly merge-blocking for this feature.
    - **Evidence / Location:**
      - `ai_router/close_backstop.py`, `_existing_evidence_settles_the_close()`:
        - returns `True` immediately for `claimed == "VERIFIED"` as soon as any valid stamped row exists.
      - `ai_router/gate_checks.py`, `check_verification_integrity()`:
        - returns success whenever `valid_rows` is non-empty; it does not compare the corroborating row to current `HEAD`, latest commit, latest close request, or latest verification round.
      - `ai_router/verification_stamp.py`:
        - the stamp has no commit/base-head identity at all (`source`, evidence hash, template id/hash, verifier model, orchestrator provider, artifact path/hash, package version only), so the gate has nothing it can use to prove “this row is for the repo state now being closed.”
    - **Fix:** Bind stamped evidence to the repo state under close (e.g. stamp `HEAD` or the verified base/head pair and validate it), or otherwise require the corroborating row/artifact to be fresher than the latest committed session work and rerun the backstop when it is not.

- **Issue 2:** The fresh-repo / no-pre-session-commit fallback breaks the promised evidence base
  - **Category:** Correctness
  - **Severity:** Major
  - **Details:**
    - **Violation:** Step 3 requires the backstop to assemble evidence from “the last commit before the session’s `startedAt`” so “the verifier reviews the session’s actual work.” The implementation does not preserve that contract when no such commit exists.
    - **Impact:** On the first session in a fresh repo, or any case with no pre-session commit, the backstop can verify a close without the committed session diff it is supposed to review. Because the close contract says the caller commits before `close_session`, falling back to `HEAD` can reduce the evidence to an empty/thin bundle instead of the session’s real changes. That is merge-relevant.
    - **Evidence / Location:**
      - `ai_router/close_backstop.py`, `resolve_backstop_diff_base()`:
        - when no `startedAt` exists or `git rev-list --before=<startedAt> HEAD` returns nothing, it returns `"HEAD"`.
      - The same file’s docstring/comment explicitly acknowledges the problem:
        - “a plain `HEAD` diff at close time is empty”
        - the fallback is just “a thin bundle.”
      - `run_close_backstop()` then passes that `diff_base` into `_vs.assemble_evidence(...)`, so this degraded base is what the verifier sees.
    - **Fix:** For the no-pre-session-commit case, diff against the empty tree/root-commit parent instead of `HEAD`, or fail closed rather than silently verifying on a thin bundle.

#### NITS

- **Nit:** `docs/session-sets/084-verification-identity-and-close-backstop/activity-log.json` says `test_close_backstop.py` has “20 tests,” but the file in this diff contains 22 `test_` functions. Non-blocking, but the session ledger count is inaccurate.