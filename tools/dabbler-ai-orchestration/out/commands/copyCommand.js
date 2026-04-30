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
exports.registerCopyCommands = registerCopyCommands;
const vscode = __importStar(require("vscode"));
async function copy(text, label) {
    await vscode.env.clipboard.writeText(text);
    vscode.window.setStatusBarMessage(`Copied: ${label}`, 4000);
}
const startCommandPresets = {
    default: (slug) => `Start the next session of \`${slug}\`.`,
    parallel: (slug) => `Start the next parallel session of \`${slug}\`.`,
    maxoutClaude: (slug) => `Start the next session of \`${slug}\`. — maxout Claude`,
};
const presetLabels = {
    default: "start next session",
    parallel: "start next parallel session",
    maxoutClaude: "start next session — maxout Claude",
};
function registerCopyCommands(context) {
    for (const [key, builder] of Object.entries(startCommandPresets)) {
        context.subscriptions.push(vscode.commands.registerCommand(`dabblerSessionSets.copyStartCommand.${key}`, async (item) => {
            if (!item?.set)
                return;
            await copy(builder(item.set.name), presetLabels[key]);
        }));
    }
    context.subscriptions.push(vscode.commands.registerCommand("dabblerSessionSets.copySlug", async (item) => {
        if (!item?.set)
            return;
        await copy(item.set.name, "slug");
    }));
}
//# sourceMappingURL=copyCommand.js.map