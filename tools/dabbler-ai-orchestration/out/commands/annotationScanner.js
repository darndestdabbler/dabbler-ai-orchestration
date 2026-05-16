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
exports.SCAN_EXCLUDE_GLOB = exports.SCAN_GLOB = exports.SCAN_EXTENSIONS = void 0;
exports.toPosixPath = toPosixPath;
exports.scanFilesForAnnotations = scanFilesForAnnotations;
exports.loadHonorAnnotationsToggle = loadHonorAnnotationsToggle;
exports.loadExistingQueueEntries = loadExistingQueueEntries;
/**
 * Pure helpers backing `dabbler.scanAnnotationsForActiveSet`. No vscode
 * import so the scanning/dedup/toggle logic can be unit-tested via
 * plain mocha + ts-node.
 *
 * The vscode wiring lives in `./scanAnnotationsForActiveSet.ts`.
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const annotationParser_1 = require("../configEditor/annotationParser");
const decisionReviewQueue_1 = require("./decisionReviewQueue");
/**
 * File extensions we walk by default. Limited to text-source extensions
 * so a workspace with thousands of binaries doesn't blow up the scan.
 * Comment-marker recognition itself is style-based (#, //) not
 * extension-based, so a `.txt` file with a `#` annotation still works
 * if its extension falls in this set.
 */
exports.SCAN_EXTENSIONS = [
    "ts", "tsx", "js", "jsx", "mjs", "cjs",
    "py", "rb", "go", "rs", "java", "cs", "kt", "swift",
    "c", "cc", "cpp", "h", "hpp",
    "sh", "bash", "zsh", "ps1",
    "yaml", "yml", "toml",
];
/** Glob matching files in `SCAN_EXTENSIONS`. */
exports.SCAN_GLOB = `**/*.{${exports.SCAN_EXTENSIONS.join(",")}}`;
/**
 * Default ignore glob — node_modules, dist/, out/, .venv/, etc. Mirrors
 * the conventions a typical .gitignore enforces so a workspace without
 * an explicit ignore file still skips obvious noise.
 */
exports.SCAN_EXCLUDE_GLOB = "{**/node_modules/**,**/dist/**,**/out/**,**/build/**,**/.venv/**,**/venv/**,**/__pycache__/**,**/.git/**}";
/**
 * Normalize a path to POSIX forward slashes regardless of host OS.
 *
 * `path.sep`-based splits only rewrite the current OS's separator, which
 * means Windows-style backslashes pass through unchanged on Linux/macOS.
 * That breaks dedup when a queue entry written on Windows is read on a
 * POSIX host (or vice versa). Always rewrite `\` to `/` — it's safe
 * because `\` is not a valid path character on POSIX.
 *
 * Defense-in-depth: the annotationParser already POSIX-normalizes the
 * file it puts in each Annotation, but the scanner's dedup seed comes
 * from `loadExistingQueueEntries` which reads externally-written queue
 * lines (could be hand-edited, could be written by older code). Always
 * normalize so the dedup key is canonical regardless of provenance.
 */
function toPosixPath(p) {
    return p.replace(/\\/g, "/");
}
/**
 * Walk `files` (absolute paths), apply `findAnnotations` to each, and
 * return the combined list. Returned annotations carry `file` as a
 * workspace-relative POSIX path; `workspaceRoot` is the prefix that
 * gets stripped.
 *
 * Files that fail to read are skipped silently — the caller's
 * notification surface reports the aggregate, not per-file errors.
 */
function scanFilesForAnnotations(files, workspaceRoot, now = () => new Date().toISOString(), readFile = (p) => fs.readFileSync(p, "utf8")) {
    const out = [];
    for (const abs of files) {
        let text;
        try {
            text = readFile(abs);
        }
        catch {
            continue;
        }
        // Normalize at this layer (belt-and-suspenders against the parser
        // someday changing behavior). path.relative returns host-native
        // separators; toPosixPath rewrites them so the Annotation.file is
        // canonical POSIX before it ever reaches dedup or disk.
        const rel = toPosixPath(path.relative(workspaceRoot, abs));
        const anns = (0, annotationParser_1.findAnnotations)(text, rel, now);
        for (const a of anns)
            out.push(a);
    }
    return out;
}
/**
 * Read the `decision_review.honor_annotations` toggle from
 * `<workspaceRoot>/ai_router/local-overrides.yaml`. Missing file or
 * missing field → defaults to `true` per Set 025 wireframes §4.
 *
 * `readYaml` is the test seam. Production callers pass a YAML reader
 * that returns the parsed object or null on absent / unparseable input.
 */
function loadHonorAnnotationsToggle(workspaceRoot, readYaml) {
    const candidate = path.join(workspaceRoot, "ai_router", "local-overrides.yaml");
    const parsed = readYaml(candidate);
    if (parsed == null)
        return true;
    const dr = parsed["decision_review"];
    if (dr == null || typeof dr !== "object")
        return true;
    const v = dr["honor_annotations"];
    if (typeof v === "boolean")
        return v;
    return true;
}
/**
 * Read the active set's queue file into a deduplication seed.
 * Returns one entry per parseable queue line that carries `file`,
 * `line`, and `reason` — exactly the shape `deduplicateAnnotations`
 * keys on. Malformed lines are skipped; lines from
 * `dabbler.flagDecisionForReview` (with `file: null`) are also skipped
 * (they have nothing to collide with).
 */
function loadExistingQueueEntries(sessionSetDir, readFile = (p) => fs.readFileSync(p, "utf8")) {
    const queuePath = path.join(sessionSetDir, decisionReviewQueue_1.QUEUE_FILENAME);
    if (!fs.existsSync(queuePath))
        return [];
    let text;
    try {
        text = readFile(queuePath);
    }
    catch {
        return [];
    }
    const out = [];
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line)
            continue;
        try {
            const obj = JSON.parse(line);
            if (typeof obj.reason === "string" &&
                typeof obj.file === "string" &&
                typeof obj.line === "number") {
                // Canonicalize the dedup key — a queue entry written on Windows
                // (with backslashes) must collide with the same file scanned on
                // POSIX. Without this, a re-scan on a different host would
                // double-append every annotation.
                out.push({ file: toPosixPath(obj.file), line: obj.line, reason: obj.reason });
            }
        }
        catch {
            // Skip malformed line — same defensive posture as the Python reader.
        }
    }
    return out;
}
//# sourceMappingURL=annotationScanner.js.map