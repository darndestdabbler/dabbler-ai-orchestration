"use strict";
// Typed action registry for the Set 029 Session 4 custom-tree view.
// Replaces the lost `package.json` `view/item/context` declarative
// rules per S4 audit GPT-5.4 M2: one source of truth for
// command-applicability that drives right-click QuickPick,
// `Shift+F10` / Context Menu key, and any future inline overflow
// button. Same predicates everywhere — no scatter, no drift.
//
// Each action has:
//   id      — the VS Code command id (registered elsewhere; this
//             module never calls executeCommand directly)
//   label   — operator-facing menu label
//   group   — numeric sort key (matches the @1/@2 numerals from the
//             retired package.json `view/item/context` groups so the
//             menu order survives the pivot)
//   when    — pure predicate: (set, supports) → bool
//
// The 14 actions are the same 14 that S3 had in package.json's
// `view/item/context`. The single difference is mechanism:
// declarative → typed code.
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROW_ACTIONS = void 0;
exports.applicableActions = applicableActions;
const inFlightLike = (s) => s.state === "in-progress" || s.state === "not-started";
const cancellable = (s) => s.state === "in-progress" || s.state === "not-started" || s.state === "complete";
const isCancelled = (s) => s.state === "cancelled";
const needsMigration = (s) => s.needsMigration;
// Ordered list — `group` controls QuickPick / context-menu sort.
// Anything in group 1xx is "open", 2xx is "navigate", 3xx is "copy
// command", 4xx is "copy meta", 5xx is "orchestrator", 8xx is
// "migrate", 9xx is "lifecycle".
exports.ROW_ACTIONS = [
    { id: "dabblerSessionSets.openSpec", label: "Open Spec", group: 101, when: () => true },
    { id: "dabblerSessionSets.openActivityLog", label: "Open Activity Log", group: 102, when: () => true },
    { id: "dabblerSessionSets.openChangeLog", label: "Open Change Log", group: 103, when: () => true },
    { id: "dabblerSessionSets.openAiAssignment", label: "Open AI Assignment", group: 104, when: () => true },
    { id: "dabblerSessionSets.openUatChecklist", label: "Open UAT Checklist", group: 105,
        when: (s, sup) => sup.uat && s.config?.requiresUAT === true },
    { id: "dabblerSessionSets.revealPlaywrightTests", label: "Reveal Playwright Tests for This Set", group: 106,
        when: (s, sup) => sup.e2e && s.config?.requiresE2E === true },
    { id: "dabblerSessionSets.openSessionState", label: "Open Session State", group: 107, when: () => true },
    { id: "dabblerSessionSets.openFolder", label: "Reveal Folder", group: 201, when: () => true },
    { id: "dabblerSessionSets.copyStartCommand.default", label: "Copy: Start next session", group: 301,
        when: (s) => inFlightLike(s) },
    { id: "dabblerSessionSets.copyStartCommand.parallel", label: "Copy: Start next parallel session", group: 302,
        when: (s) => inFlightLike(s) },
    { id: "dabblerSessionSets.copySlug", label: "Copy: Slug only", group: 401, when: () => true },
    // Orchestrator group — relegated from the accordion-body buttons in
    // Set 029 Session 6. Set 033 S3 renamed "Set Orchestrator…" to
    // "Check Out As…" to match the H1+H3+H4 check-out / check-in model,
    // and added "Release Check-Out" as the H3-named release path. Both
    // act on the in-progress set's `orchestrator` block; the writer-log
    // is global diagnostic and always available.
    { id: "dabbler.checkOutOrchestrator", label: "Check Out As…", group: 501,
        when: (s) => s.state === "in-progress" },
    { id: "dabbler.releaseCheckOut", label: "Release Check-Out", group: 502,
        when: (s) => s.state === "in-progress" },
    { id: "dabbler.openOrchestratorWriterLog", label: "Open Orchestrator Writer Log", group: 503, when: () => true },
    { id: "dabblerSessionSets.migrate", label: "Migrate to v3 schema", group: 801, when: needsMigration },
    { id: "dabblerSessionSets.cancel", label: "Cancel Session Set", group: 901,
        when: (s) => cancellable(s) },
    { id: "dabblerSessionSets.restore", label: "Restore Session Set", group: 902,
        when: (s) => isCancelled(s) },
];
// Resolve the applicable subset for a given set + support flags,
// pre-sorted by `group` so the QuickPick / context-menu order is
// deterministic.
function applicableActions(set, supports) {
    return exports.ROW_ACTIONS
        .filter((a) => a.when(set, supports))
        .slice()
        .sort((a, b) => a.group - b.group);
}
//# sourceMappingURL=ActionRegistry.js.map