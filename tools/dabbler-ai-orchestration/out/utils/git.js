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
exports.listGitWorktrees = listGitWorktrees;
exports.isGitRepo = isGitRepo;
const cp = __importStar(require("child_process"));
const path = __importStar(require("path"));
function listGitWorktrees(cwd) {
    let out;
    try {
        out = cp.execFileSync("git", ["worktree", "list", "--porcelain"], {
            cwd,
            encoding: "utf8",
            windowsHide: true,
            maxBuffer: 1024 * 1024,
            timeout: 5000,
        });
    }
    catch {
        return [];
    }
    const paths = [];
    for (const line of out.split(/\r?\n/)) {
        if (line.startsWith("worktree ")) {
            const wt = line.slice("worktree ".length).trim();
            if (wt)
                paths.push(path.resolve(wt));
        }
    }
    return paths;
}
function isGitRepo(dir) {
    try {
        cp.execFileSync("git", ["rev-parse", "--git-dir"], {
            cwd: dir,
            encoding: "utf8",
            windowsHide: true,
            timeout: 3000,
        });
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=git.js.map