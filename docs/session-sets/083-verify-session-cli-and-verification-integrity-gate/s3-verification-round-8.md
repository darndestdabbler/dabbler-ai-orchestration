## ISSUES FOUND

- **Issue 1: The shared `start-here` surface now ships a per-session `verify_session` step in the lightweight scaffold, contradicting the lightweight tier contract**
  - **Category:** Correctness
  - **Severity:** Major
  - **Details:**
    - **Violation** — The same instruction surface says two incompatible things. In `docs/templates/consumer-bootstrap/start-here.md.template`, Step 2 says:
      > `tier: lightweight` → the session makes **zero metered API calls**; verification is **per-set** per `verificationMode`
      
      But the same shared template is also an ordered runbook:
      > Follow these links in order; each step hands you the input for the next:
      
      and its summary + body now instruct:
      > Do the session's work, then verify and close (`verify_session` — mandatory on Full tier — then `close_session`).
      
      plus a literal Step 5 command:
      > `.venv/... -m ai_router.verify_session --session-set-dir docs/session-sets/<active-slug>`
      
      That template is rendered into **both** tiers, including `test-fixtures/cold-start/lightweight/docs/dabbler/start-here.md` and the shipped dist template.
    - **Impact** — A fresh **lightweight** scaffold now includes a router-backed, per-session verification command on a tier whose contract is zero-metered and per-set verification. In this project the scaffold is the execution surface for humans/engines; shipping a wrong lifecycle step in the lightweight fixture is exactly the kind of instruction-surface defect this session was supposed to fix, and it would change a reasonable merge decision.
    - **Evidence** — The contradiction is visible in:
      - `docs/templates/consumer-bootstrap/start-here.md.template`
      - `tools/dabbler-ai-orchestration/dist/templates/consumer-bootstrap/start-here.md.template`
      - `test-fixtures/cold-start/lightweight/docs/dabbler/start-here.md`
      
      All three contain the lightweight per-set statement in Step 2 **and** the ordered `verify_session` Step 5/Step 6 summary text.
    - **Correct answer** — Make the `start-here` summary and Step 5 branch on tier, or explicitly tell lightweight users to skip `verify_session` and follow the set’s per-set `verificationMode` path instead.

#### NITS

- **Nit:** `docs/templates/consumer-bootstrap/getting-started.md.template` (and its dist/cold-start copies) still says “the **Step 6** verification command” even though verification moved to **Step 5** in `start-here.md`.
- **Nit:** `docs/session-sets/083-verify-session-cli-and-verification-integrity-gate/activity-log.json` still contains the earlier `s3.surfaces` entry claiming the template teaches `routed_gate -> verify_session -> close_session`; the later operator-revision entry corrects it, so this is audit-trail noise rather than a blocking defect.