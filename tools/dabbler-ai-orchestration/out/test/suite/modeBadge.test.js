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
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const fileSystem_1 = require("../../utils/fileSystem");
const SessionSetsProvider_1 = require("../../providers/SessionSetsProvider");
function makeTmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-mode-test-"));
}
function fakeSet(over = {}) {
    return {
        name: "x",
        dir: "/x",
        specPath: "/x/spec.md",
        activityPath: "/x/activity-log.json",
        changeLogPath: "/x/change-log.md",
        statePath: "/x/session-state.json",
        aiAssignmentPath: "/x/ai-assignment.md",
        uatChecklistPath: "/x/x-uat-checklist.json",
        state: "not-started",
        totalSessions: null,
        sessionsCompleted: 0,
        lastTouched: null,
        liveSession: null,
        config: {
            requiresUAT: false,
            requiresE2E: false,
            uatScope: "none",
            outsourceMode: "first",
        },
        uatSummary: null,
        root: "/x",
        ...over,
    };
}
suite("parseSessionSetConfig — outsourceMode", () => {
    test("defaults to 'first' when spec is missing", () => {
        const cfg = (0, fileSystem_1.parseSessionSetConfig)("/nonexistent/spec.md");
        assert.strictEqual(cfg.outsourceMode, "first");
    });
    test("defaults to 'first' when yaml block omits the field", () => {
        const dir = makeTmpDir();
        const specPath = path.join(dir, "spec.md");
        fs.writeFileSync(specPath, "## Session Set Configuration\n```yaml\nrequiresUAT: true\n```");
        const cfg = (0, fileSystem_1.parseSessionSetConfig)(specPath);
        assert.strictEqual(cfg.outsourceMode, "first");
        fs.rmSync(dir, { recursive: true });
    });
    test("parses outsourceMode: last", () => {
        const dir = makeTmpDir();
        const specPath = path.join(dir, "spec.md");
        fs.writeFileSync(specPath, "## Session Set Configuration\n```yaml\noutsourceMode: last\n```");
        const cfg = (0, fileSystem_1.parseSessionSetConfig)(specPath);
        assert.strictEqual(cfg.outsourceMode, "last");
        fs.rmSync(dir, { recursive: true });
    });
    test("parses outsourceMode: first explicitly", () => {
        const dir = makeTmpDir();
        const specPath = path.join(dir, "spec.md");
        fs.writeFileSync(specPath, "## Session Set Configuration\n```yaml\noutsourceMode: first\n```");
        const cfg = (0, fileSystem_1.parseSessionSetConfig)(specPath);
        assert.strictEqual(cfg.outsourceMode, "first");
        fs.rmSync(dir, { recursive: true });
    });
    test("ignores unrecognized values and falls back to 'first'", () => {
        const dir = makeTmpDir();
        const specPath = path.join(dir, "spec.md");
        fs.writeFileSync(specPath, "## Session Set Configuration\n```yaml\noutsourceMode: hybrid\n```");
        const cfg = (0, fileSystem_1.parseSessionSetConfig)(specPath);
        assert.strictEqual(cfg.outsourceMode, "first");
        fs.rmSync(dir, { recursive: true });
    });
});
suite("SessionSetsProvider — modeBadge", () => {
    test("renders [FIRST] for outsource-first sets", () => {
        assert.strictEqual((0, SessionSetsProvider_1.modeBadge)(fakeSet({ config: {
                requiresUAT: false, requiresE2E: false, uatScope: "none", outsourceMode: "first",
            } })), "[FIRST]");
    });
    test("renders [LAST] for outsource-last sets", () => {
        assert.strictEqual((0, SessionSetsProvider_1.modeBadge)(fakeSet({ config: {
                requiresUAT: false, requiresE2E: false, uatScope: "none", outsourceMode: "last",
            } })), "[LAST]");
    });
});
//# sourceMappingURL=modeBadge.test.js.map