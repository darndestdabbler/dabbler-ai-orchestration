## ISSUES FOUND

- **Issue 1:** The preload manifest/check no longer matches the stated required-reading contract.
  - **Category:** Correctness
  - **Severity:** Major
  - **Details:**
    - **Violation:** The session contract says before-every-session reading is the constitution + `project-guidance.md` + active `lessons-learned.md` + **the engine bootstrap file**. The new lifecycle text goes further and claims: “**The manifest lists exactly the files the workflow requires at session start**”.
    - **Impact:** `guidance_report --check` is now proving the ceiling for only one supported bootstrap path. `AGENTS.md` and `GEMINI.md` can drift or grow without being counted, so the claimed end state — preload ≤12k with `--check` green under the new contract — is not actually established for two supported orchestrators.
    - **Evidence:**  
      - `docs/session-constitution.md` required-reading item 4: “Your engine bootstrap file (`CLAUDE.md` / `AGENTS.md` / `GEMINI.md`).”  
      - `docs/guidance-lifecycle.md`: “**The manifest lists exactly the files** the workflow requires at session start...”  
      - `ai_router/router-config.yaml` `guidance.preload.files` lists only:
        - `docs/session-constitution.md`
        - `docs/planning/project-guidance.md`
        - `docs/planning/lessons-learned.md`
        - `CLAUDE.md`
      - `AGENTS.md` and `GEMINI.md` are not in the manifest.
    - **Location:** `ai_router/router-config.yaml`, `docs/guidance-lifecycle.md`, `docs/session-constitution.md`
    - **Fix:** Either include all supported bootstrap files in the preload manifest/check, or explicitly redefine one canonical bootstrap as the only counted preload and remove the “exactly the files” claim.

- **Issue 2:** The constitution does not satisfy the spec’s required shape; it replaces the missing per-step pointer table with duplicated gate mechanics.
  - **Category:** Completeness
  - **Severity:** Major
  - **Details:**
    - **Violation:** The spec for Session 2 Step 1 required “**a per-step pointer table into the on-demand references**” and said “**Nothing in it may duplicate what an executable gate already enforces — principle-level mention only.**”
    - **Impact:** This is the session’s primary deliverable and the new mandatory preload doc. As written, it is not the lighter, principle-level operating doc requested by the spec; it becomes a second detailed procedure surface that must stay synchronized with the workflow and gate behavior, recreating the drift/stale-echo problem this session was supposed to reduce.
    - **Evidence:**  
      - `docs/session-constitution.md` ends with `## On-demand references — open at the trigger moment` and a generic `Trigger | Reference` table, not a **per-step** pointer table.  
      - The body hardcodes detailed mechanics instead of principle-level pointers, e.g. exact CLI invocations and enforcement details:
        - `python -m ai_router.start_session ...`
        - `python -m ai_router.verify_session ...`
        - `python -m ai_router.close_session ...`
        - “if you arrive unverified, runs the verification itself”
        - `close_session --repair`
        - “at most two automatic rounds”
    - **Location:** `docs/session-constitution.md`
    - **Fix:** Rework the constitution so each happy-path step points to the relevant on-demand references, and trim gate-enforced specifics back to principle-level summaries.

## NITS

- **Nit:** `docs/session-constitution.md` points to `docs/guidance-slimming-playbook.md` in the on-demand table, but that file is not present in this working tree and appears to be a Session 3 deliverable.