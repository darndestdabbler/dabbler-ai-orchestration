// Set 110 S1 — cold activation measurement (round-5 remedy).
//
// Round 5 rejected the first activation harness and a third-provider
// adjudication upheld the rejection. It named two concrete defects:
//
//   1. "`activate` and its dependency graph are imported before timing, so
//       module loading is excluded."
//   2. "calls activate() five times in one Node process ... rather than
//       performing five cold activations."
//
// This closes both. Each rep is a FRESH NODE PROCESS that measures
// require() of the real production bundle (module loading INCLUDED) and then
// activate(), separately. Nothing is warm and nothing is shared between reps.
//
// It is still not the real extension host — Electron process spawn, the
// extension-host bootstrap and IPC are excluded, and that limitation is
// recorded rather than papered over. What it does give is a cold, module-load-
// inclusive activation figure for the SHIPPING bundle, which is what the
// adjudication asked for and what the stub harness could not provide.
//
// Usage:
//   node scripts/cold-activation.js --child   (internal: one cold rep)
//   node scripts/cold-activation.js           (driver: spawns N cold reps)

const cp = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const EXT_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(EXT_ROOT, "..", "..");
const BUNDLE = path.join(EXT_ROOT, "dist", "extension.js");
const STUB = path.join(EXT_ROOT, "src", "test", "vscode-stub.js");
const REPS = 5;
const OUT = path.join(
  REPO_ROOT,
  "docs/session-sets/110-work-explorer-native-treeview/s1-activation-baseline.json",
);

function makeContext() {
  const subscriptions = [];
  return {
    subscriptions,
    extensionUri: { fsPath: EXT_ROOT, scheme: "file", path: EXT_ROOT },
    extensionPath: EXT_ROOT,
    globalState: { get: (_k, d) => d, update: async () => undefined, keys: () => [] },
    workspaceState: { get: (_k, d) => d, update: async () => undefined },
    secrets: { get: async () => undefined, store: async () => undefined },
    environmentVariableCollection: { replace() {}, append() {}, prepend() {} },
    asAbsolutePath: (rel) => path.join(EXT_ROOT, rel),
  };
}

function child() {
  // Module loading is INSIDE the measurement — this is defect (1).
  const tRequireStart = process.hrtime.bigint();
  require(STUB); // installs the `vscode` resolver
  const vscode = require("vscode");
  vscode.workspace.workspaceFolders = [
    { uri: vscode.Uri.file(REPO_ROOT), name: path.basename(REPO_ROOT), index: 0 },
  ];
  const mod = require(BUNDLE);
  const tRequireEnd = process.hrtime.bigint();

  const ctx = makeContext();
  const tActStart = process.hrtime.bigint();
  mod.activate(ctx);
  const tActEnd = process.hrtime.bigint();

  const ms = (a, b) => Number(b - a) / 1e6;
  // The extension logs to stdout during activation, so the result cannot just
  // BE stdout. Emit it on its own sentinel-tagged line and parse for that.
  const line =
    "@@COLD_ACTIVATION@@" +
    JSON.stringify({
      moduleLoadMs: +ms(tRequireStart, tRequireEnd).toFixed(2),
      activateMs: +ms(tActStart, tActEnd).toFixed(2),
      coldTotalMs: +ms(tRequireStart, tActEnd).toFixed(2),
    });
  process.stdout.write("\n" + line + "\n");
  // Do not dispose: we are measuring activation, and the process exits anyway.
  process.exit(0);
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function driver() {
  if (!fs.existsSync(BUNDLE)) {
    process.stderr.write(`missing ${BUNDLE} — run \`npm run compile\` first\n`);
    process.exit(2);
  }
  const samples = [];
  for (let rep = 1; rep <= REPS; rep++) {
    const r = cp.spawnSync(process.execPath, [__filename, "--child"], {
      cwd: EXT_ROOT,
      encoding: "utf8",
      timeout: 120000,
      windowsHide: true,
    });
    if (r.status !== 0) {
      process.stderr.write(`rep ${rep} failed: ${r.stderr || r.stdout}\n`);
      continue;
    }
    const TAG = "@@COLD_ACTIVATION@@";
    const hit = (r.stdout || "")
      .split(/\r?\n/)
      .find((l) => l.startsWith(TAG));
    if (!hit) {
      process.stderr.write(`rep ${rep}: no sentinel in output\n`);
      continue;
    }
    try {
      samples.push({ rep, ...JSON.parse(hit.slice(TAG.length)) });
    } catch {
      process.stderr.write(`rep ${rep} unparseable: ${hit.slice(0, 200)}\n`);
    }
  }

  const payload = {
    generatedBy: "scripts/cold-activation.js (Set 110 S1, round-5 remedy)",
    why:
      "Round 5 rejected the in-process stub activation figures and a third-provider " +
      "adjudication (gemini-2.5-pro) upheld the rejection, naming two defects: module " +
      "loading excluded, and five calls in one warm process. Both are closed here — " +
      "each rep is a fresh Node process and module load is inside the measurement.",
    measures: {
      moduleLoadMs: "require() of the real dist/extension.js bundle, cold, per process",
      activateMs: "activate() itself, immediately after that cold require",
      coldTotalMs: "module load + activate, i.e. cold bootstrap of the extension's own work",
    },
    limitation:
      "NOT the real extension host: Electron spawn, the extension-host bootstrap and " +
      "IPC are excluded, and the vscode API is a stub. This is a cold, module-load- " +
      "inclusive figure for the shipping bundle — strictly better than the warm " +
      "in-process number it supersedes, and still not a full host cold start. " +
      "The native tree's equivalent cannot be measured until S2 builds it.",
    supersedes:
      "the activateMs figure in s1-activation-measurements.json (warm, shared process, " +
      "module load excluded)",
    platform: `${os.platform()} ${os.release()}`,
    node: process.version,
    bundleBytes: fs.statSync(BUNDLE).size,
    reps: samples.length,
    medians: samples.length
      ? {
          moduleLoadMs: median(samples.map((s) => s.moduleLoadMs)),
          activateMs: median(samples.map((s) => s.activateMs)),
          coldTotalMs: median(samples.map((s) => s.coldTotalMs)),
        }
      : null,
    samples,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2), "utf8");
  if (payload.medians) {
    process.stdout.write(
      `module load: ${payload.medians.moduleLoadMs} ms\n` +
      `activate():  ${payload.medians.activateMs} ms\n` +
      `cold total:  ${payload.medians.coldTotalMs} ms  (median of ${samples.length} COLD processes)\n`,
    );
  }
  process.stdout.write(`wrote ${OUT}\n`);
}

if (process.argv.includes("--child")) child();
else driver();
