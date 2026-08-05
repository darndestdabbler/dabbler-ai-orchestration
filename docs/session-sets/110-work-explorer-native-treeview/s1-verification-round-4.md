ISSUES FOUND

- **Issue 1: Three of the four required startup buckets were not measured**
  - **Category:** Completeness
  - **Severity:** Major
  - **Failure scenario:** The migration proceeds and deletes the old renderer before discovering that extension activation, view resolution, or first paint materially affects perceived startup. This is probable because those are precisely the migration-specific costs—the replaced webview loads HTML, CSS, and roughly 1,100 lines of script—while the harness measures only host discovery/model work.
  - **Details:**
    - **Violation:** Step 3 requires separate measurement of “**extension activation, host-side scan / model assembly, `resolveWebviewView`, and webview cold start to first paint**,” followed by measurements at 10/100/500 synthetic sets. The session explicitly reports activation, `resolveWebviewView`, and first paint as unmeasured and defers them to S4.
    - **Impact:** This defeats the session’s “measure before committing” purpose. The GO decision has no measurement of the costs that replacing the webview can actually change, and S4 occurs after implementation and planned deletion of the old path. A reasonable reviewer cannot accept the promised performance deliverable as complete.
    - **Evidence:** `s1-migration-decision.md` §2 says, “`resolveWebviewView`, extension activation, and webview cold-start-to-first-paint … are not measurable from Node” and assigns them to S4. `s1-perf-measurements.json` likewise states “Host-side buckets only.” Yet the session already used a real Extension Development Host for the API spikes, so requiring extension-host instrumentation was not an unavailable execution environment.
    - **Location:** `s1-migration-decision.md` §2; `s1-perf-measurements.json`; `scripts/perf-harness.ts`.
    - **Fix:** Instrument the existing extension in an Extension Development Host and record all four requested buckets at 0/10/100/500 sets before finalizing S1’s decision. Retain raw timings and the measurement method.

- **Issue 2: The supposedly remediated startup overclaim remains in multiple authoritative echoes**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** S4 follows the explicit plan-adjustment directive and reports startup as unchanged regardless of its measurements. This is probable because the document uses mandatory language and repeatedly presents “performance is false” as settled, while another section says the result is unknown.
  - **Details:**
    - **Violation:** The corrected conclusion is supposed to be that the discovery floor is measured but the migration’s total startup effect is **unknown**. Instead, the document still says:
      - “The migration does **not** fix the symptom that motivated it.”
      - “The performance case is false.”
      - “S4’s re-measurement **must report empty-startup as unchanged**.”
    - **Impact:** These instructions can force a false S4 conclusion and misstate the migration’s outcome to the operator or in release documentation. This is the same substantive defect round 1 identified, not merely stale verification history.
    - **Evidence:** `s1-migration-decision.md` §2 also says activation/view creation and total perceived startup are “UNKNOWN,” and that S4 must “report whichever way they fall.” The mandatory §5 instruction directly contradicts that correction. The top-level summary and §2 heading preserve the same unsupported conclusion.
    - **Location:** `s1-migration-decision.md` opening verdict block, §1 agreement list, §2 heading, and §5 “S4” paragraph.
    - **Fix:** Replace every categorical total-startup claim with the supported conclusion: the approximately 102 ms host-discovery cost remains unless separately changed, while activation, view creation, first paint, and total perceived startup remain unmeasured. Remove the directive that S4 must report “unchanged.”

- **Issue 3: The final density mapping was neither shown in the required before/after nor operator-confirmed**
  - **Category:** Completeness
  - **Severity:** Major
  - **Failure scenario:** S2 implements a density design the operator never approved, and the operator later rejects it after the old renderer is scheduled for deletion. This is probable because every panel identified density as the principal subjective no-go gate, while the final precedence mapping and two-action cap were introduced only after the recorded operator decision.
  - **Details:**
    - **Violation:** Step 5 requires putting the trade to the operator “**with a rendered before/after of a real row carrying several markers**,” and the session must end with an “**operator-confirmed density mapping**.”
    - **Impact:** The session’s principal go/no-go condition is not established against the final design. The operator decision predates material changes to what the row displays and how actions are exposed.
    - **Evidence:** The retained screenshots show only the throwaway native spike; no current-renderer “before” image is present. `extension.js` constructs `WORST_CASE` from hardcoded synthetic marker data rather than rendering a production row from the real model. The activity log records the operator decision at step 9, while step 12 says remediation later added the severity-precedence mapping and reversed the four-action result to a two-action cap. No post-remediation operator confirmation is recorded.
    - **Location:** `s1-spike-evidence/`; `spike-extension/extension.js`; `activity-log.json` steps 9 and 12; `s1-migration-decision.md` §§3–4.
    - **Fix:** Retain a side-by-side rendering of an actual current row and the final native proposal, including the severity icon precedence and two-action cap, then obtain and record operator confirmation of that final mapping before closing S1.

#### NITS

- **Nit:** The visibility-level laziness claim contradicts its trace. `spike-laziness-trace.json` already contains `getChildren(root)` at “after activation, view never opened,” while the decision and disposition claim nothing was requested until the view became visible. Nested-level laziness remains demonstrated.
- **Nit:** `s1-migration-decision.md` reports Node 22, while `s1-perf-measurements.json` records Node `v25.8.1`.
- **Nit:** `ai-assignment.md` says `$0.1514` includes verification, but that amount equals only the analysis and two panel calls. The activity log separately records approximately `$1.0276` in verification calls.
