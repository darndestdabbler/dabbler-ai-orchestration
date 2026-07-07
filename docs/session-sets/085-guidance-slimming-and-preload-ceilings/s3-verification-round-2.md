**ISSUES FOUND**

- **Issue 1:** The verifier-scope audit still leaves the required evidence bundle unimplemented, despite recording a “no tool change” outcome.
  - **Category:** Correctness
  - **Severity:** Major
  - **Details:**
    - **Violation:** Step 1 requires: **“The verifier's evidence should be the diff, test output, gate outcomes, the spec, and the constitution — not the full process manual.”** The working tree does not change `ai_router/verify_session.py` or any prompt template, so the assembled evidence still does not match that contract.
    - **Impact:** This is a core Session 3 deliverable. As shipped here, a verifier run can still omit the constitution entirely, and test/gate evidence is still only present when an operator manually supplies the conventions file. That means the session has not actually implemented the stated verifier-scope requirement, which is merge-blocking for F4.
    - **Evidence:**  
      - `git status --short` shows no changes to `ai_router/verify_session.py` or `ai_router/prompt-templates/*`.  
      - `docs/session-sets/085-guidance-slimming-and-preload-ceilings/s3-conventions.md` says the current assembly is the spec excerpt + `git status --short` + full diff + conventions block, and explicitly says **“the constitution — deliberately not fed.”**  
      - The same file says test output/gate outcomes ride in the conventions block and acknowledges the CLI flag is optional.  
      - `docs/session-sets/085-guidance-slimming-and-preload-ceilings/s3-verifier-scope-audit.txt` still calls the current state **“Unscoped.”** and says **“Required Edit: Add `session-constitution.md` to the evidence bundle.”**  
      - `docs/guidance-slimming-playbook.md` propagates the same exclusion: **“not the process manual, and not the constitution either.”**  
      - The “operator-adjudicated” framing is not substantiated by an actual spec change in this diff; `s3-conventions.md` itself also says the matter is still **“recorded in disposition.json for operator adjudication”** and **“pending that adjudication.”**
    - **Correct answer:** Either update `verify_session` / the verification template so the required evidence is always assembled, or change the governing spec first and stop treating the current tool behavior as a valid no-change-needed outcome.

- **Issue 2:** The new set-close summary claims required close artifacts/data already exist when the working tree shows they do not.
  - **Category:** False Positive
  - **Severity:** Major
  - **Details:**
    - **Violation:** The session requirements say Step 3 must **“Record in `disposition.json`: which on-demand docs were actually opened and why, verification rounds, and time-to-first-task-action”** and Step 4 **Creates:** `path-aware-critique.json`. The new summary file presents the set as already delivered/closed.
    - **Impact:** This misstates readiness. A reviewer relying on the summary would believe end-of-set deliverables are complete when the source-of-truth artifacts are still missing, which changes the close/release decision.
    - **Evidence:**  
      - `docs/session-sets/085-guidance-slimming-and-preload-ceilings/change-log.md` is written as a completed summary: **“What this set delivered”**, **“Session 3 (this session)”**, and **“Suite state at set close.”**  
      - That file specifically claims: **“Live dogfood recorded (first A/B datapoint, in `disposition.json`)”**.  
      - But the diff for `docs/session-sets/085-guidance-slimming-and-preload-ceilings/disposition.json` only changes `"verification_verdict": "ISSUES_FOUND"`; it does not add the Session 3 dogfood datapoint fields the task calls for.  
      - `path-aware-critique.json` is absent from `git status --short` and from the diff entirely.  
      - `docs/session-sets/085-guidance-slimming-and-preload-ceilings/session-state.json` still marks Session 3 as **`"status": "in-progress"`**.
    - **Correct answer:** Do not write set-close / “recorded” summary text until the close artifacts actually exist, or mark those items explicitly as pending instead of completed.

#### NITS

- **Nit:** `docs/session-sets/085-guidance-slimming-and-preload-ceilings/change-log.md` says the preload corpus was cut from **“~65k tokens”** and then parenthetically calls the ratchet-start declaration **“92,719”** tokens. Those numbers are not reconciled in the text.
- **Nit:** `docs/session-sets/085-guidance-slimming-and-preload-ceilings/activity-log.json` still contains the earlier “concurs” wording for the split verifier-scope second opinion; later text corrects it, but the raw log remains misleading.