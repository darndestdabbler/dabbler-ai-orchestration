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
const detectOrchestrators_1 = require("../../providers/detectOrchestrators");
// The stub vscode module is registered in `vscode-stub.js` and
// resolved by `require("vscode")`. Cast to access its mutable
// `__installedExtensions` set.
function getStubExtensions() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const vscode = require("vscode");
    return vscode.extensions.__installedExtensions;
}
function withScenario(opts, fn) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-detect-"));
    const prevHome = process.env.HOME;
    const prevUserprofile = process.env.USERPROFILE;
    process.env.HOME = tmp;
    process.env.USERPROFILE = tmp;
    if (opts.claude)
        fs.mkdirSync(path.join(tmp, ".claude"), { recursive: true });
    if (opts.codex)
        fs.mkdirSync(path.join(tmp, ".codex"), { recursive: true });
    if (opts.mru) {
        fs.mkdirSync(path.join(tmp, ".dabbler"), { recursive: true });
        fs.writeFileSync(path.join(tmp, ".dabbler", "orchestrator-mru.json"), JSON.stringify(opts.mru, null, 2), "utf8");
    }
    const installed = getStubExtensions();
    const previouslyInstalled = new Set(installed);
    installed.clear();
    if (opts.gemini)
        installed.add("Google.geminicodeassist");
    if (opts.copilot)
        installed.add("GitHub.copilot");
    try {
        fn();
    }
    finally {
        installed.clear();
        for (const id of previouslyInstalled)
            installed.add(id);
        if (prevHome === undefined)
            delete process.env.HOME;
        else
            process.env.HOME = prevHome;
        if (prevUserprofile === undefined)
            delete process.env.USERPROFILE;
        else
            process.env.USERPROFILE = prevUserprofile;
        try {
            fs.rmSync(tmp, { recursive: true, force: true });
        }
        catch {
            // best effort
        }
    }
}
suite("detectInstalledOrchestrators", () => {
    test("nothing installed → empty list", () => {
        withScenario({}, () => {
            assert.deepStrictEqual((0, detectOrchestrators_1.detectInstalledOrchestrators)().installed, []);
        });
    });
    test("priority order when no MRU bias: claude, codex, gemini, copilot", () => {
        withScenario({ claude: true, codex: true, gemini: true, copilot: true }, () => {
            assert.deepStrictEqual((0, detectOrchestrators_1.detectInstalledOrchestrators)().installed, [
                "anthropic",
                "openai",
                "google",
                "github",
            ]);
        });
    });
    test("MRU bias surfaces most-recent installed provider first", () => {
        // Operator's most-recent override was Gemini; Gemini should
        // surface ahead of the priority-order default (claude).
        withScenario({
            claude: true,
            gemini: true,
            mru: [
                {
                    provider: "google",
                    model: "gemini-2.5-pro",
                    effort: "high",
                    thinking: false,
                },
                {
                    provider: "anthropic",
                    model: "claude-opus-4-7",
                    effort: "high",
                    thinking: true,
                },
            ],
        }, () => {
            assert.deepStrictEqual((0, detectOrchestrators_1.detectInstalledOrchestrators)().installed, [
                "google",
                "anthropic",
            ]);
        });
    });
    test("MRU entries for uninstalled providers are ignored", () => {
        // Operator's MRU mentions Copilot, but Copilot isn't installed —
        // detection should fall back to priority order over the actually
        // installed Codex.
        withScenario({
            codex: true,
            mru: [
                {
                    provider: "github",
                    model: "gpt-4o",
                    effort: "medium",
                    thinking: false,
                },
            ],
        }, () => {
            assert.deepStrictEqual((0, detectOrchestrators_1.detectInstalledOrchestrators)().installed, [
                "openai",
            ]);
        });
    });
});
suite("pickEmptyStateCta", () => {
    test("returns null when no orchestrators installed (caller falls back to default)", () => {
        withScenario({}, () => {
            assert.strictEqual((0, detectOrchestrators_1.pickEmptyStateCta)(), null);
        });
    });
    test("Claude-installed scenario → Claude Code hook installer CTA", () => {
        withScenario({ claude: true }, () => {
            const cta = (0, detectOrchestrators_1.pickEmptyStateCta)();
            assert.ok(cta);
            assert.strictEqual(cta?.commandId, "dabbler.installOrchestratorHook.claudeCode");
            assert.match(cta?.label ?? "", /Claude/);
        });
    });
    test("Codex-only scenario → Codex preset CTA with prefillProvider arg", () => {
        withScenario({ codex: true }, () => {
            const cta = (0, detectOrchestrators_1.pickEmptyStateCta)();
            assert.ok(cta);
            // Set 033 S3: command id renamed from `dabbler.setOrchestrator`
            // to `dabbler.checkOutOrchestrator` alongside the H1+H3+H4
            // check-out / check-in model.
            assert.strictEqual(cta?.commandId, "dabbler.checkOutOrchestrator");
            assert.deepStrictEqual(cta?.args, [{ prefillProvider: "openai" }]);
        });
    });
    test("Gemini-only scenario → Gemini shim CTA", () => {
        withScenario({ gemini: true }, () => {
            const cta = (0, detectOrchestrators_1.pickEmptyStateCta)();
            assert.ok(cta);
            assert.strictEqual(cta?.commandId, "dabbler.installOrchestratorHook.gemini");
        });
    });
});
//# sourceMappingURL=detectOrchestrators.test.js.map