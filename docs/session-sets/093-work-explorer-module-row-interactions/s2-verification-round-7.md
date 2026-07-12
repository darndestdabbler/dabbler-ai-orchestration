ISSUES FOUND

- **Issue 1: Post-write verification can erase a concurrent operator edit**
  - **Category:** Correctness
  - **Severity:** Major
  - **Details:**
    - **Violation:** The format-preserving contract requires that the assignment mutate only the inserted `module:` line and preserve concurrent operator changes. The implementation also claims protection against “a post-write anomaly / concurrent rewrite.”
    - **Impact:** If another editor or tool modifies `spec.md` after `writeFileSync(item.next)` but before verification reads it, the mismatch path blindly writes the old phase-one `original` back. This deletes the concurrent edit, causing operator data loss on the safety path intended to prevent it.
    - **Evidence:** In `src/utils/moduleAuthoring.ts`, any read-back mismatch throws:
      ```ts
      if (readBack !== item.next) {
        throw new Error(
          "on-disk content does not match the intended splice byte-for-byte",
        );
      }
      ```
      The catch then unconditionally invokes:
      ```ts
      const restored = restoreOriginal(item.specAbs, item.original);
      ```
      `restoreOriginal()` writes the stale original without first establishing that the current bytes are still extension-owned:
      ```ts
      io.writeFileSync(specAbs, original);
      ```
      The existing “different position” regression test confirms this behavior by expecting the mismatched file to be overwritten with `SPEC`.
    - **Location:** `tools/dabbler-ai-orchestration/src/utils/moduleAuthoring.ts` → phase-two post-write verification and `restoreOriginal()`
    - **Fix:** Do not restore when read-back contains unknown/mismatched content; report the file as modified and requiring manual recovery while preserving those bytes. A rollback is safe only with a conditional-write/version mechanism proving the file still contains the extension’s known output. Add a regression where read-back represents a concurrent user edit and assert that the edit is not overwritten.

- **Issue 2: Pointer focus breaks the toolbar’s required secondary-tabstop/roving state**
  - **Category:** Correctness
  - **Severity:** Major
  - **Details:**
    - **Violation:** D3 requires the module action strip to be a keyboard-operable `role="toolbar"` secondary tabstop with exactly one internal `tabindex="0"` anchor, and the session requires “full keyboard reachability.”
    - **Impact:** After a user clicks an action in a module other than the currently focused module, keyboard navigation no longer returns to that module correctly. The clicked toolbar’s focused button remains `tabindex="-1"`, while the previous module retains the active anchor/tree tabstop. `Shift+Tab` can therefore jump to the wrong module or leave the expected row/toolbar sequence; using an arrow key can additionally leave `tabindex="0"` anchors in multiple strips.
    - **Evidence:** `syncActionStripTabstop()` arms only the module passed to it, but the `focusin` listener explicitly ignores all action-button focus:
      ```js
      if (ev.target.closest && ev.target.closest(".module-action")) return;
      ```
      Pointer clicks can focus a button even when it has `tabindex="-1"`, and the click handler neither synchronizes its containing module nor clears the previous strip:
      ```js
      btn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        ev.preventDefault();
        invokeModuleAction(btn);
      });
      ```
      `handleToolbarKey().moveTo()` resets only buttons in the current strip, so it cannot clear an anchor left in another strip. The Playwright test exercises only `greeterModule.focus()` followed by Tab; it does not cover pointer focus on another module’s toolbar.
    - **Location:** `tools/dabbler-ai-orchestration/media/session-sets-tree/client.js` → `syncActionStripTabstop()`, the `focusin` listener, button click handling, and `handleToolbarKey()`
    - **Fix:** On focus entering any `.module-action`, clear anchors across all strips, set the focused button as the sole `tabindex="0"` anchor, and update the containing module as the active tree row without stealing focus from the button. Add a Playwright regression that focuses module A, clicks an action in module B, then verifies module B’s focused button is the sole anchor and `Shift+Tab` returns to module B.