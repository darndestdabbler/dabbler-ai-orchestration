// Typed action registry for the Set 029 Session 4 custom-tree view.
//
// Set 048 Session 3 reshape (spec §3.3 + L3): the menu structure
// gained two top-level submenus (`Open File ▸`, `Copy Prompt ▸` —
// labelled `Copy Eval ▸` through Set 048, renamed Set 049 S1) plus a
// row of flat actions. Each registry entry now carries a `category`
// discriminator so the runtime can group submenu items without having
// to infer from the command id. The cursor-anchored HTML popup that
// Set 034 introduced is retired in favor of `vscode.window.showQuickPick`
// (two-step pattern); see `CustomSessionSetsView.showContextMenu` for
// the consumer.
//
// L3 (operator-locked addition): `Open AI Assignment` is fully removed
// from the menu schema, the command registration, and the dispatch
// allowlist. The `ai-assignment.md` file on disk continues to exist —
// any future surface that needs to read it should depend on the
// `aiAssignmentPath` field, not on this menu entry.
//
// Set 047 Session 3 split the migration predicate by target version.
// `needsMigrationToV3` covers v1/v2 + broken-v3 (the operator runs
// "Migrate to v3 schema" first); `needsMigrationToV4` covers canonical
// v3 with sessions[] (the new "Migrate to v4 schema" affordance).
// A set has at most one migration target at a time — the two
// predicates are mutually exclusive by construction.

import { SessionSet } from "../types";

export interface ActionSupports {
  uat: boolean;
  e2e: boolean;
}

// Set 048 S3: category discriminator drives the two-step QuickPick
// grouping in `CustomSessionSetsView.showContextMenu`.
//   "openFile" → top-level "Open File ▸" submenu
//   "copyEval" → top-level "Copy Prompt ▸" submenu (internal id stays
//                "copyEval" to avoid a type-system rename; user-visible
//                label rename only)
//   "flat"     → rendered inline on the top-level QuickPick
export type ActionCategory = "openFile" | "copyEval" | "flat";

export interface RowAction {
  id: string;
  label: string;
  group: number;
  category: ActionCategory;
  when: (set: SessionSet, supports: ActionSupports) => boolean;
}

const inFlightLike = (s: SessionSet): boolean =>
  s.state === "in-progress" || s.state === "not-started";

const cancellable = (s: SessionSet): boolean =>
  s.state === "in-progress" || s.state === "not-started" || s.state === "complete";

const isCancelled = (s: SessionSet): boolean => s.state === "cancelled";

const hasCompletedSession = (s: SessionSet): boolean => s.sessionsCompleted > 0;

const isCompleteState = (s: SessionSet): boolean => s.state === "complete";

const needsMigrationToV3 = (s: SessionSet): boolean =>
  s.needsMigration && s.migrationTargetSchemaVersion === 3;
const needsMigrationToV4 = (s: SessionSet): boolean =>
  s.needsMigration && s.migrationTargetSchemaVersion === 4;

// Set 061 S2 (spec D3): surfaced only on rows that actually render the
// blocked marker — non-terminal rows with at least one unsatisfied
// prerequisite. Same suppression rule as `blockedMarker` in
// SessionSetsModel: a closed set's dependency status is not actionable.
const hasUnsatisfiedPrereqs = (s: SessionSet): boolean =>
  inFlightLike(s) && s.unsatisfiedPrereqs.length > 0;

// Ordered list. `group` controls QuickPick sort within a category;
// `category` controls which top-level item or submenu the entry lands
// under. The numeric bands:
//   1xx — Open File submenu
//   3xx — Copy Prompt submenu
//   5xx — flat actions (orchestrator-related quick-access)
//   8xx — flat migrate actions
//   9xx — flat lifecycle actions (cancel / restore)
export const ROW_ACTIONS: RowAction[] = [
  // Open File ▸ submenu. L2 locks the four entries to: Spec, Activity
  // Log, Change Log, Session State. "Open AI Assignment" removed per
  // L3. Open UAT Checklist / Reveal Playwright Tests / Reveal Folder
  // remain registered as Command-Palette-only commands — they are not
  // surfaced on the right-click menu under L2.
  { id: "dabblerSessionSets.openSpec",          label: "Spec",                    group: 101, category: "openFile", when: () => true },
  { id: "dabblerSessionSets.openActivityLog",   label: "Activity Log",            group: 102, category: "openFile", when: () => true },
  { id: "dabblerSessionSets.openChangeLog",     label: "Change Log",              group: 103, category: "openFile", when: () => true },
  { id: "dabblerSessionSets.openSessionState",  label: "Session State",           group: 104, category: "openFile", when: () => true },

  // Copy Prompt ▸ submenu — L2 labels match the spec §3.3 table (the
  // submenu was renamed Set 049 S1 to better reflect its contents,
  // which include action prompts like "Start Next Session" not just
  // evaluation prompts).
  { id: "dabbler.copySpecReviewPrompt",         label: "Evaluate Specification",       group: 301, category: "copyEval", when: () => true },
  { id: "dabbler.copySessionAccomplishmentsPrompt", label: "Evaluate Most Recent Session", group: 302, category: "copyEval",
    when: (s) => hasCompletedSession(s) },
  { id: "dabbler.copySetAccomplishmentsPrompt", label: "Evaluate Session Set",         group: 303, category: "copyEval",
    when: (s) => isCompleteState(s) },
  { id: "dabbler.copyStartNextSessionPrompt",   label: "Start Next Session",           group: 304, category: "copyEval",
    when: (s) => inFlightLike(s) },
  // Set 049 S1 hygiene: surface the parallel-session command in the
  // submenu. Gated identically to "Start Next Session" — the parallel
  // pattern is only meaningful on non-terminal rows.
  { id: "dabbler.copyStartNextParallelSessionPrompt", label: "Start New Parallel Session", group: 305, category: "copyEval",
    when: (s) => inFlightLike(s) },

  // Flat actions — appear at the top level of the QuickPick. The
  // spec §3.3 table lists v4 only because v4 is the canonical target;
  // the v3 entry is kept here for legacy v1/v2 sets (mutually exclusive
  // with v4 — at most one of the two ever appears per row).
  //
  // Set 049 S4 (rip-out): `dabbler.checkOutOrchestrator` ("Set
  // Orchestrator…") retired alongside the check-out / check-in
  // coordination layer. The writer-log opener stays as a diagnostic
  // surface (the log itself is preserved provisionally per T5).
  { id: "dabblerSessionSets.copySlug",          label: "Copy Slug",                    group: 501, category: "flat", when: () => true },
  { id: "dabbler.openOrchestratorWriterLog",    label: "Open Orchestrator Writer Log", group: 502, category: "flat", when: () => true },
  // Set 061 S2 (spec D3): companion to the blocked marker — jumps to
  // the spec of whichever unsatisfied prerequisite is blocking this
  // row (QuickPick when more than one). Reuses the openSpec plumbing
  // in commands/openFile.ts.
  { id: "dabblerSessionSets.openPrerequisiteSpec", label: "Open Prerequisite Spec",    group: 503, category: "flat", when: hasUnsatisfiedPrereqs },
  { id: "dabblerSessionSets.migrate",           label: "Migrate to v3 schema",         group: 801, category: "flat", when: needsMigrationToV3 },
  { id: "dabblerSessionSets.migrateToV4",       label: "Migrate to v4 schema",         group: 802, category: "flat", when: needsMigrationToV4 },
  { id: "dabblerSessionSets.cancel",            label: "Cancel Session Set",           group: 901, category: "flat",
    when: (s) => cancellable(s) },
  { id: "dabblerSessionSets.restore",           label: "Restore Session Set",          group: 902, category: "flat",
    when: (s) => isCancelled(s) },
];

// Resolve the applicable subset for a given set + support flags,
// pre-sorted by `group` so the QuickPick / context-menu order is
// deterministic. `.filter()` already returns a fresh array, so no
// defensive copy is needed before `.sort()`.
export function applicableActions(set: SessionSet, supports: ActionSupports): RowAction[] {
  return ROW_ACTIONS
    .filter((a) => a.when(set, supports))
    .sort((a, b) => a.group - b.group);
}

// Set 048 S3: split applicable actions into the three menu categories.
// The consumer presents `flat` inline on the top-level QuickPick and
// uses `openFile` / `copyEval` to populate the second-level pickers.
export interface CategorizedActions {
  openFile: RowAction[];
  copyEval: RowAction[];
  flat: RowAction[];
}

export function categorizedActions(
  set: SessionSet,
  supports: ActionSupports,
): CategorizedActions {
  const applicable = applicableActions(set, supports);
  return {
    openFile: applicable.filter((a) => a.category === "openFile"),
    copyEval: applicable.filter((a) => a.category === "copyEval"),
    flat: applicable.filter((a) => a.category === "flat"),
  };
}
