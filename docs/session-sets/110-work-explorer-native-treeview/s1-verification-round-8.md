ISSUES FOUND

- **Issue 1: The required bucketed startup measurement remains incomplete, and the aggregate real-host timing does not support the claimed webview attribution**
  - **Category:** Completeness / Correctness
  - **Severity:** Major
  - **Failure scenario:** S2–S3 implement the native tree and delete the current renderer believing that most of the reported 5.1-second delay is webview work the migration removes. S4 then has only an eight-set aggregate baseline—not separate activation, model assembly, `resolveWebviewView`, and first-paint measurements at the required scales—so it cannot make the promised comparison without reconstructing the old implementation. This is probable because deletion is explicitly scheduled before S4 and the retained real-host harness records only aggregate first-row timings.
  - **Details:**
    - **Violation:** Step 3 requires measurements “in separate buckets: extension activation, host-side scan / model assembly, `resolveWebviewView`, and webview cold start to first paint. Then measure at 10 / 100 / 500 synthetic sets.” The current work provides host-pipeline scaling at 0/10/100/500, stub-only activation and resolution figures for the real repository, and one real-host aggregate measurement using eight sets. It never measures all four real-host buckets at the four required scales.
    - **Impact:** The session still has not delivered its central “measure before committing” result, and its performance classification is unsupported. A reasonable reviewer cannot accept the claim that performance is now a “real secondary justification” when the only real-host result does not identify which portion the migration removes.
    - **Evidence:** `s1-real-host-baseline.json` contains only `launchToFirstRowMs` and `viewOpenToFirstRowMs` for an “8 session sets x 4 sessions” fixture. In `real-host-baseline.spec.ts`, `tOpen` is captured before `openSessionSetsView()` and the next timestamp is after a row becomes visible; there are no activation-completion, `resolveWebviewView`, or renderer-first-paint timestamps. The decision nevertheless states that “most of that is webview cost the migration deletes.” The measured ~124 ms host pipeline does not prove that the remainder is webview-specific; it also includes workbench navigation, helper execution, extension-host behavior, IPC, and polling.
    - **Correct answer:** Measure the current implementation in a real host at 0/10/100/500 sets with separate instrumentation for activation, host model assembly, `resolveWebviewView`, and renderer first meaningful paint. Until then, describe 5.1 seconds only as an aggregate view-open-to-row observation and do not attribute most of it to deletable webview work or classify performance as established.

- **Issue 2: The decision document gives S4 mutually exclusive measurement instructions**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** S4 follows the later instruction to include a forced refresh, while S1’s baseline was captured without one. The resulting before/after delta measures different workflows and cannot establish whether the native tree improved startup. This is probable because both instructions are mandatory and appear in the authoritative migration decision that S4 is told to follow.
  - **Details:**
    - **Violation:** `s1-migration-decision.md` §2 says S4 must use the same harness with “**no forced refresh — or the comparison is invalid**.” Its §6 “How the stub figures misled” instead says S4 must measure both implementations “**including the refresh command — or the comparison is invalid**.”
    - **Impact:** Following either instruction violates the other, making the release-gate performance comparison unreliable. The stale section also falsely says the real-host spec is skipped and that “No number in this session came from a real extension host,” despite the successful real-host result now presented as central evidence.
    - **Evidence:** `real-host-baseline.spec.ts` is active and explicitly omits `triggerRefresh`; `s1-real-host-baseline.json` likewise declares that no refresh was issued. The contradictory pre-success instructions remain in the current decision document.
    - **Correct answer:** Remove or explicitly supersede the failed-attempt instructions. State one binding S4 protocol consistent with the successful baseline: same fixture and harness, natural paint, no forced refresh.

#### NITS

- **Nit:** The visibility-level laziness claim remains contradicted by `spike-laziness-trace.json`: the “after activation, view never opened” stage already contains `getChildren(root)`. Nested child-level laziness is demonstrated; “nothing is requested until the view is visible” is not.
- **Nit:** `s1-migration-decision.md` reports Node 22 for the performance run, while `s1-perf-measurements.json` records Node `v25.8.1`.
- **Nit:** `ai-assignment.md` says the `$0.1514` total includes verification, but that amount equals only the analysis and two routed panel calls; the activity log records substantial additional verification spend.