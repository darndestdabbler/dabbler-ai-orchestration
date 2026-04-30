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
exports.resolvePythonPath = resolvePythonPath;
exports.runPythonModule = runPythonModule;
const cp = __importStar(require("child_process"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
/**
 * Resolve the configured Python interpreter for a given setting key.
 *
 * The setting holds a string like ``"python"`` or ``".venv/Scripts/python.exe"``.
 * Relative paths resolve against the workspace root so users can point at a
 * checked-in virtualenv without writing a machine-specific absolute path.
 */
function resolvePythonPath(workspaceRoot, settingKey) {
    const dotIndex = settingKey.indexOf(".");
    if (dotIndex < 0)
        return "python";
    const section = settingKey.slice(0, dotIndex);
    const key = settingKey.slice(dotIndex + 1);
    const cfg = vscode.workspace.getConfiguration(section);
    const raw = (cfg.get(key) ?? "python").trim();
    if (!raw)
        return "python";
    if (path.isAbsolute(raw))
        return raw;
    if (raw.includes(path.sep) || raw.includes("/")) {
        return path.resolve(workspaceRoot, raw);
    }
    return raw;
}
/**
 * Spawn ``python -m <module> [args...]`` and resolve once the process exits.
 *
 * Always resolves — non-zero exit codes and timeouts are returned in the
 * result, never thrown — so the tree-view caller can render an error node
 * without try/catch noise around every refresh.
 */
function runPythonModule(opts) {
    const exe = resolvePythonPath(opts.cwd, opts.pythonPathSetting);
    const timeoutMs = opts.timeoutMs ?? 10000;
    return new Promise((resolve) => {
        const child = cp.spawn(exe, ["-m", opts.module, ...opts.args], {
            cwd: opts.cwd,
            env: process.env,
            windowsHide: true,
        });
        let stdout = "";
        let stderr = "";
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill();
        }, timeoutMs);
        child.stdout.on("data", (chunk) => {
            stdout += chunk.toString("utf8");
        });
        child.stderr.on("data", (chunk) => {
            stderr += chunk.toString("utf8");
        });
        child.on("error", (err) => {
            clearTimeout(timer);
            resolve({
                stdout,
                stderr: stderr + (stderr ? "\n" : "") + `spawn error: ${err.message}`,
                exitCode: null,
                signal: null,
                timedOut,
            });
        });
        child.on("close", (code, signal) => {
            clearTimeout(timer);
            resolve({ stdout, stderr, exitCode: code, signal, timedOut });
        });
    });
}
//# sourceMappingURL=pythonRunner.js.map