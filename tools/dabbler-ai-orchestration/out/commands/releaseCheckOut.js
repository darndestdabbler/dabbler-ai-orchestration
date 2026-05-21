"use strict";
// "Release Check-Out" — one of H3's two named release paths (the other
// is `start_session --force` on the CLI).
//
// Set 033 Session 3 (H3 release affordance).
//
// Operator UX: confirm the release of the current check-out, then
// hand off to the "Check Out As…" quickpick (with `targetSet`
// pre-populated and force-override implied) so a new holder can be
// chosen in the same flow. The actual writer-side effect is
// `python -m ai_router.start_session --force` (audit trail goes to
// `~/.dabbler/orchestrator-writer.log` via the writer's own
// logging path).
//
// The "release" framing is the operator-facing handle for unsticking
// a check-out that's blocking another would-be holder. The
// implementation reuses the rename/refactor surface of
// `dabbler.checkOutOrchestrator` so there's a single force-override
// code path in the extension.
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
exports.describeHolder = describeHolder;
exports.registerReleaseCheckOut = registerReleaseCheckOut;
const vscode = __importStar(require("vscode"));
const checkOutOrchestrator_1 = require("./checkOutOrchestrator");
// Exported for unit testing. Renders the H4 (engine + provider)
// composite plus the model when present, into the human string used
// in the confirmation modal.
function describeHolder(set) {
    const o = set.state.orchestrator;
    if (!o)
        return "no current holder";
    const engine = o.engine ?? "?";
    const provider = o.provider ?? "?";
    const model = o.model ? ` (${o.model})` : "";
    return `${engine} + ${provider}${model}`;
}
function registerReleaseCheckOut(context) {
    context.subscriptions.push(vscode.commands.registerCommand("dabbler.releaseCheckOut", async () => {
        const workspaceCwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
        const set = await (0, checkOutOrchestrator_1.pickTargetInProgressSet)(workspaceCwd, "Release Check-Out — Session Set");
        if (!set)
            return;
        // No-op short-circuit: nothing to release when the slot is
        // already unclaimed. Surface a hint and exit.
        if (!set.state.orchestrator) {
            vscode.window.showInformationMessage(`"${set.slug}" has no current orchestrator check-out. Nothing to release.`);
            return;
        }
        const holder = describeHolder(set);
        const confirmed = await vscode.window.showWarningMessage(`Release the orchestrator check-out on "${set.slug}" currently held by ${holder}?\n\nYou will be prompted to pick the new holder. Forced override is logged to ~/.dabbler/orchestrator-writer.log.`, { modal: true }, "Release");
        if (confirmed !== "Release")
            return;
        // Hand off to the Check Out As… quickpick with the target
        // pre-selected. The quickpick's own force-override prompt
        // will fire when the picked tuple's (engine + provider) does
        // not match the existing holder — which is the expected case
        // for a Release. The operator's "Release" confirmation here
        // already established intent; the second modal is a sanity
        // check on the actual identity handoff.
        await vscode.commands.executeCommand("dabbler.checkOutOrchestrator", { targetSet: set });
    }));
}
//# sourceMappingURL=releaseCheckOut.js.map