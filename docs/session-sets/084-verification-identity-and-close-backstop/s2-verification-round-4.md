## ISSUES FOUND

### Issue 1: The gate/backstop never bind the claimed verdict to the stamped evidence, so a hand-edited `disposition.json` can still override the verifier
- **Category:** Correctness
- **Severity:** Major
- **Details:**
  - **Violation:** The plan says the backstop must run verification, patch the disposition, and then “**continue the close on `VERIFIED` / refuse with findings on `ISSUES_FOUND`**,” and step 5 says the stamped row “**must corroborate its own close**.” That requires the close to verify that the claimed verdict matches the actual sanctioned verification result.
  - **Impact:** A blocking verification result can still be laundered into a passing close by hand-editing `disposition.json` after a valid stamped row/artifact already exists. That defeats the core “framework holds the last word” goal and would change a reasonable merge decision.
  - **Evidence:**
    - `ai_router/gate_checks.py`, `check_verification_integrity()` now passes API-mode closes whenever `valid_rows` is non-empty. It does **not** parse the corroborating `sN-verification*.md` artifact or compare its verdict to `disposition.verification_verdict`.
    - `ai_router/close_backstop.py`, `_existing_evidence_settles_the_close()` returns `True` immediately for `claimed == "VERIFIED"` as soon as **any** valid stamped row exists.
    - `ai_router/verification_stamp.py`, `validate_stamped_row()` verifies path/hash/provider/template consistency, but never checks the artifact’s semantic verdict.
    - Result: a valid stamped row from an `ISSUES_FOUND` run can still settle a later hand-flipped `VERIFIED` claim.
  - **Correct answer:** Bind the claimed verdict to the corroborating evidence: either parse the stamped `sN-verification*.md` and require it to match `disposition.verification_verdict` (and, for `ISSUES_FOUND`, its paired issues artifact), or stamp the verdict/round onto the metrics row and validate that exact match.

### Issue 2: The stale-evidence fix is incomplete because the freshness hash ignores substantive tracked files, so later commits can still close on outdated verification
- **Category:** Correctness
- **Severity:** Major
- **Details:**
  - **Violation:** Step 5 requires that the stamped row “**must corroborate its own close**,” and the response itself claims I-084-S2-5 fixed stale evidence so “post-verification work changes make the row stale.” That is not true for all session work.
  - **Impact:** After a valid verification row exists, later committed changes under the session-set directory or `docs/planning/` do **not** invalidate that row. The backstop can stand down and the gate can pass even though the close includes work the verifier never saw. That reopens the exact stale-evidence class the response claims to have fixed.
  - **Evidence:**
    - `ai_router/verification_stamp.py`, `compute_work_diff_sha256()` excludes the **entire** current session-set directory via `set_rel`, and `WORK_DIFF_BASE_EXCLUDES` excludes `docs/planning`.
    - `validate_stamped_row()` recomputes freshness with those same exclusions, so later commits in those areas remain “fresh.”
    - This repo’s own diff includes substantive session work in excluded locations:
      - `docs/planning/lessons-learned.md`
      - `docs/session-sets/084-verification-identity-and-close-backstop/ai-assignment.md`
    - `ai_router/close_backstop.py`, `_existing_evidence_settles_the_close()`, and `ai_router/gate_checks.py`, `check_verification_integrity()` rely on that freshness check to decide whether existing stamped evidence still settles the close.
  - **Correct answer:** Narrow the freshness exclusions to the exact post-verification close bookkeeping files that legitimately change during close-out, rather than excluding the whole session-set tree and all of `docs/planning`. Substantive tracked files in those locations must invalidate prior evidence.

#### NITS

- **Nit:** `ai_router/tests/test_close_backstop.py`’s top-level docstring still says `--force` and `--manual-verify` “neither triggers the backstop,” but the implementation and later tests now intentionally make `--force` run the backstop.
- **Nit:** Several comments/docs still say the stamp has “nine” fields (`ai_router/metrics.py`, `ai_router/verification_stamp.py`), but `STAMP_FIELDS` now contains 11 entries after `evidence_base` and `work_diff_sha256` were added.