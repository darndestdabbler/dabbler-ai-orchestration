ISSUES FOUND

- **Issue 1:** The synthetic web pointer disappears behind native top-layer UI
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `tools/dabbler-ai-orchestration/scripts/pointer.js`, `tools/dabbler-ai-orchestration/scripts/record-web-walkthrough.js`
  - **Failure scenario:** A walkthrough targets a control inside a native `<dialog>` or top-layer popover. These are common web UI mechanisms, and the browser renders the top layer above every ordinary document stacking context regardless of `z-index`. The pointer remains a normal `document.body` child, so it is hidden while the action still executes. Viewers therefore see modal controls operating themselves, materially violating the tutorial’s pointer requirement.
  - **Acceptance criterion:** JUDGMENT - A recorded web walkthrough targeting controls inside both an open native `<dialog>` and an open top-layer popover must visibly show the synthetic pointer at each target, with the corresponding feature-off recording failing the same artifact check.
  - **Details:** **Violation:** The required outcome is that the web path must “draw a synthetic pointer into the page” and the session must end with “every recording this framework makes show[ing] a pointer that moves.” **Impact:** The implementation fails deterministically for a common class of web interactions, so the broad pointer-visible claim is not mergeable based only on the simple task-board fixture. **Evidence:** `ensureSyntheticPointer()` always appends an ordinary fixed-position `div` to `document.body` and relies solely on `z-index:2147483647`. CSS top-layer elements are painted above that node regardless of its z-index. `approachTarget()` and `performAction()` still locate and operate targets inside such UI, but nothing relocates the pointer into the active top layer or otherwise gives it a top-layer rendering surface. The correct implementation must render the pointer in or above the active top-layer surface and prove that behavior in recorded frames.

## NITS

- **Nit:** `docs/walkthroughs/publication-safety-checklist.md` requires enabling Focus Assist before recording but lacks an explicit post-recording checkbox for notification toasts, despite the session specification naming notification toasts as a per-video review item.