ISSUES FOUND

- **Issue 1: The required four-bucket startup measurement at four scales remains undelivered**
  - **Category:** Completeness
  - **Severity:** Major
  - **Failure scenario:** S2–S3 proceed and delete the existing renderer without the specified baseline. S4 then cannot determine how activation, model assembly, view resolution, and first paint scale across 0/10/100/500 sets without adding unscheduled instrumentation and reconstructing the old implementation. This is probable because the current plan explicitly schedules deletion before S4, while the retained real-host evidence covers only one eight-set aggregate.
  - **Details:**
    - **Violation:** Step 3 requires measurement “in separate buckets: extension activation, host-side scan / model assembly, `resolveWebviewView`, and webview cold start to first paint. Then measure at 10 / 100 / 500 synthetic sets.” The session must end with “measured startup costs at four scales.”
    - **Impact:** The session explicitly exists to measure before committing and determine whether migration is a performance fix. Its central measurement deliverable is still incomplete, so a reasonable reviewer cannot approve the decision document as satisfying the session plan.
    - **Evidence:** `s1-migration-decision.md` §2 admits: “**The spec's step 3 asked for four buckets at four scales in the real host. That is still not delivered.**” `s1-perf-measurements.json` scales only the host pipeline. The activation and resolution figures are stub-based and use only the real repository, while `s1-real-host-baseline.json` contains only aggregate launch/open-to-row timings for an eight-set fixture.
    - **Location:** `s1-migration-decision.md` §2 and §6; `s1-perf-measurements.json`; `s1-activation-measurements.json`; `s1-activation-baseline.json`; `s1-real-host-baseline.json`.
    - **Fix:** Instrument the existing implementation in a real Extension Development Host and retain separate activation, model-assembly, `resolveWebviewView`, and first-meaningful-paint timings at 0/10/100/500 sets. Alternatively, obtain an explicit operator amendment to the active specification before closing.

- **Issue 2: The decision still attributes most of the 5.1-second aggregate to webview work despite explicitly conceding that no such attribution is supported**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** The operator and S2–S3 treat performance as an established secondary justification and proceed believing the migration removes most of a measured five-second delay. This is probable because the unsupported attribution appears in the headline, panel conclusion, and final GO section—the locations downstream readers are most likely to use.
  - **Details:**
    - **Violation:** The task requires the measurements to settle honestly whether migration is a performance fix. The document itself correctly states that the 5.1-second result is aggregate and “**no part of it is attributed here**,” yet authoritative echoes still claim otherwise.
    - **Impact:** The decision sells an unmeasured performance benefit as established, undermining the session’s principal honesty requirement and potentially producing a false implementation or release rationale.
    - **Evidence:** `s1-migration-decision.md` still says:
      - Opening block: “**most of that is webview cost the migration deletes**.”
      - §1: “**most of it webview work the migration deletes outright**.”
      - §6: “**most of it webview cost the migration deletes**.”
      
      These contradict §2, which says the aggregate includes workbench navigation, extension-host behavior, IPC, host scan, renderer work, and polling without decomposition, and that improvement is only a reason to expect—not evidence.
    - **Location:** `s1-migration-decision.md` opening verdict block, §1 “honest counter-argument,” and §6 “Go / no-go.”
    - **Fix:** Remove every “most of it is webview” attribution. Classify performance as unknown until both implementations are compared through the same instrumented, bucketed protocol.

#### NITS

- **Nit:** The visibility-level laziness claim remains contradicted by its trace. `spike-laziness-trace.json` already contains `getChildren(root)` at “after activation, view never opened,” while `s1-migration-decision.md` §3(c), `activity-log.json`, and `disposition.json` claim nothing was requested until visibility. Only nested child-level laziness is demonstrated.
- **Nit:** `s1-migration-decision.md` reports Node 22 for the performance run, while `s1-perf-measurements.json` records `v25.8.1`.
- **Nit:** `s1-migration-decision.md` §2 still says the real-host spec was “left skipped,” but the current `real-host-baseline.spec.ts` is active and produced the retained baseline. This stale pre-success text should be removed.
- **Nit:** The “confirmed mapping table” includes bucket-row `N sets` explicitly marked “proposed, not put to the operator.” Move it outside the confirmed table or obtain confirmation.