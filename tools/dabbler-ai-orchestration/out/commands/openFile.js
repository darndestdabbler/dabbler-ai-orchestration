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
exports.registerOpenFileCommands = registerOpenFileCommands;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const fileSystem_1 = require("../utils/fileSystem");
function openIfExists(filePath, label) {
    if (!filePath || !fs.existsSync(filePath)) {
        vscode.window.showInformationMessage(`${label} does not exist yet: ${filePath ? path.basename(filePath) : "<unknown>"}`);
        return;
    }
    vscode.commands.executeCommand("vscode.open", vscode.Uri.file(filePath));
}
function findPlaywrightTests(set) {
    const cfg = vscode.workspace.getConfiguration("dabblerSessionSets");
    const testDirRel = cfg.get("e2e.testDirectory", fileSystem_1.PLAYWRIGHT_REL_DEFAULT) || fileSystem_1.PLAYWRIGHT_REL_DEFAULT;
    const playwrightDir = path.join(set.root, testDirRel);
    if (!fs.existsSync(playwrightDir))
        return [];
    const slugTokens = set.name.split("-").filter((s) => s.length >= 3);
    const testRefs = set.uatSummary?.e2eRefs ?? [];
    const candidates = new Set();
    const walk = (dir, depth) => {
        if (depth > 4)
            return;
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const e of entries) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) {
                if (e.name === "bin" || e.name === "obj" || e.name === "node_modules")
                    continue;
                walk(p, depth + 1);
                continue;
            }
            if (!/\.(cs|ts|js)$/.test(e.name))
                continue;
            const lowerName = e.name.toLowerCase();
            if (slugTokens.some((t) => lowerName.includes(t.toLowerCase()))) {
                candidates.add(p);
                continue;
            }
            if (testRefs.length > 0) {
                try {
                    const txt = fs.readFileSync(p, "utf8");
                    for (const ref of testRefs) {
                        const short = String(ref).split(".").pop();
                        if (short && txt.includes(short)) {
                            candidates.add(p);
                            break;
                        }
                    }
                }
                catch { /* ignore */ }
            }
        }
    };
    walk(playwrightDir, 0);
    return Array.from(candidates).sort();
}
function registerOpenFileCommands(context) {
    context.subscriptions.push(vscode.commands.registerCommand("dabblerSessionSets.openSpec", (item) => openIfExists(item?.set?.specPath, "Spec")), vscode.commands.registerCommand("dabblerSessionSets.openActivityLog", (item) => openIfExists(item?.set?.activityPath, "Activity log")), vscode.commands.registerCommand("dabblerSessionSets.openChangeLog", (item) => openIfExists(item?.set?.changeLogPath, "Change log")), vscode.commands.registerCommand("dabblerSessionSets.openAiAssignment", (item) => openIfExists(item?.set?.aiAssignmentPath, "AI assignment")), vscode.commands.registerCommand("dabblerSessionSets.openUatChecklist", (item) => openIfExists(item?.set?.uatChecklistPath, "UAT checklist")), vscode.commands.registerCommand("dabblerSessionSets.openFolder", (item) => {
        if (!item?.set)
            return;
        vscode.commands.executeCommand("revealInExplorer", vscode.Uri.file(item.set.dir));
    }), vscode.commands.registerCommand("dabblerSessionSets.revealPlaywrightTests", async (item) => {
        if (!item?.set)
            return;
        const tests = findPlaywrightTests(item.set);
        if (tests.length === 0) {
            const cfg = vscode.workspace.getConfiguration("dabblerSessionSets");
            const dir = cfg.get("e2e.testDirectory", fileSystem_1.PLAYWRIGHT_REL_DEFAULT);
            vscode.window.showInformationMessage(`No Playwright tests found for "${item.set.name}". Search root: ${dir}`);
            return;
        }
        if (tests.length === 1) {
            vscode.commands.executeCommand("vscode.open", vscode.Uri.file(tests[0]));
            return;
        }
        const picked = await vscode.window.showQuickPick(tests.map((p) => ({
            label: path.basename(p),
            description: path.relative(item.set.root, p),
            absolute: p,
        })), { placeHolder: `Playwright tests matching "${item.set.name}"` });
        if (picked) {
            vscode.commands.executeCommand("vscode.open", vscode.Uri.file(picked.absolute));
        }
    }));
}
//# sourceMappingURL=openFile.js.map