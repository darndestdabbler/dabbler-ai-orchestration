## ISSUES FOUND

- **Issue 1: A shipped instruction surface still teaches the retired routed-gate flow**
  - **Category:** Correctness
  - **Severity:** Major
  - **Details:**
    - **Violation:** The governing addendum says: **“Per-session cross-provider verification is mandatory on every Full-tier session … `python -m ai_router.routed_gate` survives for pre-083 scaffolds but always answers REQUIRED (exit 0).”** This round explicitly covers **“instruction surfaces (templates, fixtures, dist bundle, advisories, canonical docs)”** and the operator decision was to **remove the skip**.
    - **Impact:** This is not cosmetic. A user following the published docs for the extension is still told that the routed gate decides whether verification is required. That reinstates the exact optional/skip mental model the operator ordered removed after the live UAT failure. Because this session’s purpose is to correct instruction surfaces around mandatory verification, a reviewer should block merge until all shipped docs stop teaching the retired gated flow.
    - **Evidence:** `tools/dabbler-ai-orchestration/README.md` still states the old behavior in multiple places:
      - Verification table: **“Routed-gate driven — when review is required, `verify_session` picks a model…”**
      - Feature text: **“On the Full tier, the routed gate decides when review is required…”**
      - The repo root README banner also still says **“gated cross-provider verification”** (`README.md` first paragraph), which is at best misleading and at worst reinforces the same obsolete model.
    - **Correct answer:** These surfaces should say that on **every Full-tier session** the engine must run `python -m ai_router.verify_session` before `close_session`; `routed_gate` is retained only for back-compat/informational output and no longer authorizes a skip.