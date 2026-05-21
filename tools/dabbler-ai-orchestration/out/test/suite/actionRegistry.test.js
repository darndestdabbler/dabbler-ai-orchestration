"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const assert = __importStar(require("assert"));
const ActionRegistry_1 = require("../../providers/ActionRegistry");
// Set 029 Session 4 — ActionRegistry covers what `view/item/context`
// rules USED to declaratively gate in package.json before the custom-
// tree pivot. Per audit GPT-5.4 M2: one typed registry drives every
// menu entrypoint — right-click, Shift+F10, Context Menu key, and
// any future inline overflow button. This suite exercises every
// action's applicability across every relevant state combination so
// drift between menu surfaces is impossible.
function fakeSet(state, over = {}) {
    return {
        name: over.name ?? "fixture",
        dir: "/x",
        specPath: "/x/spec.md",
        activityPath: "/x/activity-log.json",
        changeLogPath: "/x/change-log.md",
        statePath: "/x/session-state.json",
        aiAssignmentPath: "/x/ai-assignment.md",
        uatChecklistPath: "/x/x-uat-checklist.json",
        state,
        totalSessions: null,
        sessionsCompleted: 0,
        lastTouched: null,
        liveSession: null,
        config: { requiresUAT: false, requiresE2E: false, uatScope: "none" },
        uatSummary: null,
        root: "/x",
        needsMigration: false,
        ...over,
    };
}
const ALL_SUPPORTED = { uat: true, e2e: true };
const NEITHER_SUPPORTED = { uat: false, e2e: false };
function ids(set, supports) {
    return (0, ActionRegistry_1.applicableActions)(set, supports).map((a) => a.id);
}
suite("ActionRegistry", () => {
    test("ROW_ACTIONS exposes the 14 S3 actions plus the 3 orchestrator actions (S6 relegation + S033 S3 release-check-out)", () => {
        const expected = new Set([
            "dabblerSessionSets.openSpec",
            "dabblerSessionSets.openActivityLog",
            "dabblerSessionSets.openChangeLog",
            "dabblerSessionSets.openAiAssignment",
            "dabblerSessionSets.openUatChecklist",
            "dabblerSessionSets.revealPlaywrightTests",
            "dabblerSessionSets.openSessionState",
            "dabblerSessionSets.openFolder",
            "dabblerSessionSets.copyStartCommand.default",
            "dabblerSessionSets.copyStartCommand.parallel",
            "dabblerSessionSets.copySlug",
            // Set 029 Session 6 — relegated from accordion body to right-click + Command Palette.
            // Set 033 Session 3 renamed `dabbler.setOrchestrator` → `dabbler.checkOutOrchestrator`
            // and added `dabbler.releaseCheckOut` as H3's named release path.
            "dabbler.checkOutOrchestrator",
            "dabbler.releaseCheckOut",
            "dabbler.openOrchestratorWriterLog",
            "dabblerSessionSets.migrate",
            "dabblerSessionSets.cancel",
            "dabblerSessionSets.restore",
        ]);
        const got = new Set(ActionRegistry_1.ROW_ACTIONS.map((a) => a.id));
        assert.deepStrictEqual(got, expected);
        assert.strictEqual(ActionRegistry_1.ROW_ACTIONS.length, 17);
    });
    test("checkOutOrchestrator + releaseCheckOut appear only on in-progress rows; openOrchestratorWriterLog always available", () => {
        for (const st of ["in-progress"]) {
            const got = ids(fakeSet(st), ALL_SUPPORTED);
            assert.ok(got.includes("dabbler.checkOutOrchestrator"), `checkOutOrchestrator missing for ${st}`);
            assert.ok(got.includes("dabbler.releaseCheckOut"), `releaseCheckOut missing for ${st}`);
        }
        for (const st of ["not-started", "complete", "cancelled"]) {
            const got = ids(fakeSet(st), ALL_SUPPORTED);
            assert.ok(!got.includes("dabbler.checkOutOrchestrator"), `checkOutOrchestrator leaked onto ${st}`);
            assert.ok(!got.includes("dabbler.releaseCheckOut"), `releaseCheckOut leaked onto ${st}`);
        }
        for (const st of ["in-progress", "not-started", "complete", "cancelled"]) {
            assert.ok(ids(fakeSet(st), ALL_SUPPORTED).includes("dabbler.openOrchestratorWriterLog"), `openOrchestratorWriterLog missing for ${st}`);
        }
    });
    test("always-available actions appear for any state when supports are full", () => {
        const states = ["in-progress", "not-started", "complete", "cancelled"];
        for (const st of states) {
            const got = ids(fakeSet(st), ALL_SUPPORTED);
            for (const id of [
                "dabblerSessionSets.openSpec",
                "dabblerSessionSets.openActivityLog",
                "dabblerSessionSets.openChangeLog",
                "dabblerSessionSets.openAiAssignment",
                "dabblerSessionSets.openSessionState",
                "dabblerSessionSets.openFolder",
                "dabblerSessionSets.copySlug",
            ]) {
                assert.ok(got.includes(id), `expected ${id} for state=${st}; got ${got.join(",")}`);
            }
        }
    });
    test("UAT entry gated on both supports.uat AND set.config.requiresUAT", () => {
        const uatSet = fakeSet("in-progress", { config: { requiresUAT: true, requiresE2E: false, uatScope: "" } });
        const nonUatSet = fakeSet("in-progress");
        assert.ok(ids(uatSet, ALL_SUPPORTED).includes("dabblerSessionSets.openUatChecklist"));
        assert.ok(!ids(uatSet, NEITHER_SUPPORTED).includes("dabblerSessionSets.openUatChecklist"), "supports.uat=false suppresses the menu entry even when set declares requiresUAT");
        assert.ok(!ids(nonUatSet, ALL_SUPPORTED).includes("dabblerSessionSets.openUatChecklist"), "set without requiresUAT never shows the menu entry");
    });
    test("E2E entry gated on both supports.e2e AND set.config.requiresE2E", () => {
        const e2eSet = fakeSet("in-progress", { config: { requiresUAT: false, requiresE2E: true, uatScope: "none" } });
        assert.ok(ids(e2eSet, ALL_SUPPORTED).includes("dabblerSessionSets.revealPlaywrightTests"));
        assert.ok(!ids(e2eSet, NEITHER_SUPPORTED).includes("dabblerSessionSets.revealPlaywrightTests"));
        assert.ok(!ids(fakeSet("in-progress"), ALL_SUPPORTED).includes("dabblerSessionSets.revealPlaywrightTests"));
    });
    test("copyStartCommand entries appear only on in-progress / not-started rows", () => {
        for (const st of ["in-progress", "not-started"]) {
            const got = ids(fakeSet(st), ALL_SUPPORTED);
            assert.ok(got.includes("dabblerSessionSets.copyStartCommand.default"), `default missing for ${st}`);
            assert.ok(got.includes("dabblerSessionSets.copyStartCommand.parallel"), `parallel missing for ${st}`);
        }
        for (const st of ["complete", "cancelled"]) {
            const got = ids(fakeSet(st), ALL_SUPPORTED);
            assert.ok(!got.includes("dabblerSessionSets.copyStartCommand.default"), `default leaked to ${st}`);
            assert.ok(!got.includes("dabblerSessionSets.copyStartCommand.parallel"), `parallel leaked to ${st}`);
        }
    });
    test("cancel appears for in-progress / not-started / complete, not for cancelled", () => {
        for (const st of ["in-progress", "not-started", "complete"]) {
            assert.ok(ids(fakeSet(st), ALL_SUPPORTED).includes("dabblerSessionSets.cancel"), `cancel missing for ${st}`);
        }
        assert.ok(!ids(fakeSet("cancelled"), ALL_SUPPORTED).includes("dabblerSessionSets.cancel"), "cancel leaked onto a cancelled row");
    });
    test("restore appears only for cancelled rows", () => {
        assert.ok(ids(fakeSet("cancelled"), ALL_SUPPORTED).includes("dabblerSessionSets.restore"));
        for (const st of ["in-progress", "not-started", "complete"]) {
            assert.ok(!ids(fakeSet(st), ALL_SUPPORTED).includes("dabblerSessionSets.restore"), `restore leaked onto ${st}`);
        }
    });
    test("migrate appears only when set.needsMigration is true", () => {
        const needs = fakeSet("complete", { needsMigration: true });
        const ok = fakeSet("complete");
        assert.ok(ids(needs, ALL_SUPPORTED).includes("dabblerSessionSets.migrate"));
        assert.ok(!ids(ok, ALL_SUPPORTED).includes("dabblerSessionSets.migrate"));
    });
    test("result is sorted by group ascending so menu order is deterministic", () => {
        const got = (0, ActionRegistry_1.applicableActions)(fakeSet("in-progress", {
            config: { requiresUAT: true, requiresE2E: true, uatScope: "" },
            needsMigration: true,
        }), ALL_SUPPORTED);
        const groups = got.map((a) => a.group);
        const sorted = [...groups].sort((a, b) => a - b);
        assert.deepStrictEqual(groups, sorted, "applicableActions should pre-sort by group");
    });
});
//# sourceMappingURL=actionRegistry.test.js.map