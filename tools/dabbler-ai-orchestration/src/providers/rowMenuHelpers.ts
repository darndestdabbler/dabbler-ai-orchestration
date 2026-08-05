// The L5 left-click dual-action, pure and unit-testable.
//
// Set 110 Session 3: this module used to also hold the two-step QuickPick
// item builders (`buildTopLevelItems` / `buildSubmenuItems`) that the
// webview's hand-drawn right-click menu needed. VS Code renders a real
// hierarchical menu from `contributes.submenus` now, so the item builders
// and their `TopLevelPickItem` / `SubmenuPickItem` types went with it.
//
// What survives is the one decision the platform does NOT make for us: what
// activating a set row should DO. That is shared by the native row command
// so the behaviour cannot drift.

// ----- L5 left-click dual-action decision -----

export interface LeftClickPlan {
  // Always non-null when the row resolved — left-click ALWAYS opens
  // spec.md (preserved S4 default).
  openCommand: { commandId: string; setName: string };
  // Present iff the row's state is non-terminal AND the L5 clipboard
  // shortcut should fire (`Start the next session of \`<slug>\`.`).
  clipboardWrite: { text: string; toast: string } | null;
}

// `state` is typed as the closed `SessionState` union in `types.ts`,
// but we use a positive `in-progress | not-started` check rather
// than a negative `complete | cancelled` check so that any future
// state value (a schema migration introducing e.g. "archived") FAILS
// CLOSED — the unknown state would skip the clipboard shortcut
// rather than fire on a bucket the operator never approved for L5.
export function planLeftClickActivation(
  setName: string,
  state: "in-progress" | "not-started" | "complete" | "cancelled",
): LeftClickPlan {
  const openCommand = { commandId: "dabblerSessionSets.openSpec", setName };
  if (state !== "in-progress" && state !== "not-started") {
    return { openCommand, clipboardWrite: null };
  }
  const sanitized = setName.replace(/`/g, "'");
  return {
    openCommand,
    clipboardWrite: {
      text: `Start the next session of \`${sanitized}\`.`,
      toast: `Copied: Start the next session of ${setName}`,
    },
  };
}
