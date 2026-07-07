## ISSUES FOUND

- **Issue 1:** `--force` incorrectly skips the backstop instead of preserving both evidence layers
  - **Category:** Correctness
  - **Severity:** Major
  - **Details:**
    - **Violation:** The spec requires: **"`--manual-verify` remains the attested bypass and `--force` still bypasses neither evidence layer."**
    - **Impact:** On a Full-tier close with no valid stamped evidence, `close_session --force` does **not** run the required in-process verification. That is a contract break on a supported close path: the framework fails the close instead of producing the mandated backstop verification, so this would change a reasonable merge decision.
    - **Evidence:** In `ai_router/close_session.py`, the backstop is gated by:
      ```python
      if not args.force and not args.manual_verify and not no_router:
      ```
      so `--force` skips `run_close_backstop(...)` entirely. The new test `test_force_path_never_triggers_the_backstop` in `ai_router/tests/test_close_backstop.py` and the added docs text in `ai_router/docs/close-out.md` explicitly codify that deviation (`"--force triggers no metered call"`), which is the opposite of the quoted requirement.
    - **Correct answer:** `--force` must still run the backstop when stamped evidence is missing; it may bypass bookkeeping gates, but not the backstop/evidence requirements.

- **Issue 2:** The “explicit template version bump” invariant is not actually enforced
  - **Category:** Correctness
  - **Severity:** Major
  - **Details:**
    - **Violation:** Step 1 requires: **"normalized template hash: whitespace-normalized content, versioned id; an operator template change is an explicit version bump, never an accidental pass."**
    - **Impact:** A developer can change `prompt-templates/verification.md` without changing `TEMPLATE_ID`, and newly-produced rows will still validate as `session-verification-v1`. That defeats the stated change-control guarantee for the canonical verification template — a core F3 requirement — and would change a reasonable merge decision.
    - **Evidence:** In `ai_router/verification_stamp.py`:
      - `TEMPLATE_ID` is a single constant: `session-verification-v1`
      - `build_stamp()` stamps:
        ```python
        "template_id": TEMPLATE_ID,
        "template_sha256": template_sha256(template_text),
        ```
        using the **current** template file/hash.
      - `validate_stamped_row()` only checks:
        ```python
        row.get("template_id") == TEMPLATE_ID
        row.get("template_sha256") == template_sha256()
        ```
        also against the **current** template file/hash.
      
      There is no fixed mapping of `template_id -> expected hash`, so a modified template with the same `TEMPLATE_ID` will still pass for newly-created rows.
    - **Correct answer:** Pin each allowed `template_id` to a specific normalized hash (or equivalent immutable id/hash pair) so editing the template without bumping the version fails closed even for new rows.

- **Issue 3:** The required live dogfood close did not actually happen, despite repo claims that it did
  - **Category:** Completeness
  - **Severity:** Major
  - **Details:**
    - **Violation:** The session plan requires: **"Dogfood: this session's own close runs the backstop live ... `close_session` must produce the verification itself and the stamped row must corroborate its own close."** It also says the session **"Ends with: ... this session's own close was verified by the backstop, not by the orchestrator's hand."**
    - **Impact:** A required acceptance criterion is unmet. The highest-risk path was supposed to be proven on this very session, but the repo state does not show a completed backstop-verified close. That is both incomplete and falsely attested in project records, which is merge-blocking for this task.
    - **Evidence:**
      - `docs/session-sets/084-verification-identity-and-close-backstop/session-state.json` still shows session 2 as:
        - `"status": "in-progress"`
        - `"completedAt": null`
      - `docs/session-sets/084-verification-identity-and-close-backstop/session-events.jsonl` has only:
        - `work_started`
        - `closeout_requested`
        for session 2, with **no** `verification_completed` and **no** `closeout_succeeded`
      - `docs/session-sets/084-verification-identity-and-close-backstop/disposition.json` for session 2 does **not** contain a `verification_verdict`
      - `git status --short` still shows:
        - untracked `.close_session.lock`
        - untracked `.lifecycle.lock`
        - untracked next session-set `085-...`
      - Despite that, both `disposition.json` and `activity-log.json` claim the dogfood close succeeded via backstop.
    - **Correct answer:** Complete the live close through `close_session` so the backstop writes the stamped verification evidence and the session records show a finished close, or remove the unsupported claims.