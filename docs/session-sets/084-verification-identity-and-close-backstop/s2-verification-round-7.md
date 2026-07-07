**ISSUES FOUND**

### Issue 1: The stamped `verdict` is still trusted from the metrics row instead of being validated against the artifact bytes it is supposed to be derived from
- **Category:** Correctness
- **Severity:** Major
- **Details:**
  - **Violation:** The task requires the evidence layer to accept only rows with “**internally consistent stamp fields — any missing or inconsistent field fails closed**,” and the round-4 fix claims the stamp now carries “**the VERDICT parsed at record time from the artifact-bound bytes**” so the row “**must corroborate its own close**.” That consistency is not actually enforced on read.
  - **Impact:** A blocking verification can still be laundered into a passing close by editing the metrics row’s `verdict` field (and matching `disposition.verification_verdict`) without changing the artifact. The gate and the backstop will trust the forged favorable verdict, so the “framework holds the last word” guarantee is still breakable in a way that should change a merge decision.
  - **Evidence:**
    - `ai_router/verification_stamp.py` → `validate_stamped_row()`:
      - verifies `artifact_sha256` against the artifact bytes;
      - but for `verdict` it only does:
        ```python
        if row.get("verdict") not in ("VERIFIED", "ISSUES_FOUND"):
        ```
        There is **no** re-parse of the artifact to confirm that `row["verdict"]` matches the artifact content whose hash was just validated.
    - `ai_router/gate_checks.py` → `check_verification_integrity()`:
      - chooses `authoritative = valid_rows[-1]`;
      - then trusts `authoritative.get("verdict")` for the claim match.
    - `ai_router/close_backstop.py` → `_existing_evidence_settles_the_close()`:
      - also trusts `authoritative.get("verdict")` when deciding whether existing evidence settles the close.
    - No code in this diff reparses `sN-verification*.md` during validation/settlement to prove the stamped `verdict` still matches the artifact bytes.
  - **Correct answer:** In validation/settlement, parse the verified artifact bytes and require that parsed verdict to equal the row’s stamped `verdict` (or stop trusting the row field and use the parsed artifact verdict directly). Add a regression test for a tampered metrics-row verdict over an unchanged `ISSUES_FOUND` artifact.

#### NITS
- **Nit:** `docs/session-sets/084-verification-identity-and-close-backstop/activity-log.json` step 3 still says `--force` “triggers no metered call,” which contradicts the code, tests, and later dogfood entries that intentionally make `--force` run the backstop.
- **Nit:** Several comments/self-descriptions still say the stamp has “nine” fields, but `STAMP_FIELDS` now includes 11 entries.