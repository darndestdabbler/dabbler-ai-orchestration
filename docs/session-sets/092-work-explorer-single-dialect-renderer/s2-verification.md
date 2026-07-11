ISSUES FOUND

- **Issue 1: System Status uses stale form controls on the initial render**
  - **Category:** Correctness
  - **Severity:** Major
  - **Details:**
    - **Violation:** The strip must be “visible ONLY when a fault exists,” and provider/Copilot faults must follow the active tier and transport profile.
    - **Impact:** On first opening a Getting Started workspace, a durable Lightweight workspace can incorrectly show a missing-provider-key fault, while a Full/Copilot workspace can omit a real missing-Copilot-CLI fault. This breaks the central fault-only diagnostics contract and should be fixed before merge.
    - **Evidence:** In `media/session-sets-tree/client.js`, `statusHtml` is rendered from `gsState` before entering the Getting Started branch. Only afterward does that branch apply the host’s durable tier/profile seed to `gsState`, as documented by the immediately following “Applied once per (script load, root)” logic. Because `statusHtml` is already a static string, the form receives the newly seeded controls while the strip reflects the old/default controls. The pure renderer tests always supply already-correct controls and therefore do not exercise this ordering.
    - **Fix:** Apply/reset the snapshot’s durable Getting Started control seed before calling `renderSystemStatus`. Then render both the strip and form from the same finalized `gsState`; retain the host `status.tier`/`status.transportProfile` path for list mode.

#### NITS

- **Nit:** The baseline says `systemStatusHtml.test.ts` contains six tests, but the shown file contains five.
- **Nit:** Walk 6’s `ProgrammaticVerification` says the combined fault test “pins the literal fault strings,” but that test only checks `data-status-code` attributes and does not assert the workspace, Python, or provider text.