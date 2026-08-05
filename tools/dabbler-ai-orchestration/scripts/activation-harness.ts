// Extension activation + view-resolution harness (Set 110 S1, round-4 remedy).
//
// The first cut of S1 measured only the host discovery/scan pipeline and left
// three of the spec's four startup buckets unmeasured. The close backstop was
// right that this defeats "measure before committing": the buckets a webview->
// TreeView migration can actually CHANGE are the ones that were missing.
//
// This closes two of the three. Buckets, and what each honestly covers:
//
//   activate()            the extension's own synchronous activation work —
//                         provider construction, command registration, watcher
//                         creation, context-key setup. This is real, and it is
//                         what the migration alters on the host side.
//   resolveWebviewView()  the host half of showing the view: building the HTML
//                         string, wiring the message channel, setting options.
//                         A TreeDataProvider replaces this entirely.
//   webview payload       the BYTES the renderer must fetch, parse and execute
//                         before first paint. Not a time, deliberately — see
//                         below.
//
// What this CANNOT measure, and why the number is not faked: renderer-side
// cold start (webview process spawn, HTML/CSS parse, script evaluation, first
// paint) happens in a separate Electron renderer that a Node harness has no
// access to. It is Layer 3's to time in S4, against both implementations.
// The payload size is reported instead as an honest proxy for how much work
// that renderer is being asked to do.
//
// Run: npx ts-node --require ./src/test/vscode-stub.js scripts/activation-harness.ts

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const vscode = require("vscode");

import { activate } from "../src/extension";
import { CustomSessionSetsView } from "../src/providers/CustomSessionSetsView";
import { ScanState } from "../src/providers/scanState";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const MEDIA = path.resolve(__dirname, "..", "media");

function ms(fn: () => void): number {
  const t0 = process.hrtime.bigint();
  fn();
  return Number(process.hrtime.bigint() - t0) / 1e6;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Minimal ExtensionContext good enough for activate() and the view provider. */
function makeContext(): any {
  const subscriptions: { dispose: () => void }[] = [];
  return {
    subscriptions,
    extensionUri: vscode.Uri.file(path.resolve(__dirname, "..")),
    extensionPath: path.resolve(__dirname, ".."),
    globalState: {
      get: (_k: string, d?: unknown) => d,
      update: async () => undefined,
      keys: () => [],
    },
    workspaceState: { get: (_k: string, d?: unknown) => d, update: async () => undefined },
    secrets: { get: async () => undefined, store: async () => undefined },
    environmentVariableCollection: { replace: () => {}, append: () => {}, prepend: () => {} },
    asAbsolutePath: (rel: string) => path.join(path.resolve(__dirname, ".."), rel),
  };
}

/** A WebviewView fake that records the HTML the provider assigns. */
function makeWebviewView(): { view: any; htmlBytes: () => number } {
  let html = "";
  const view = {
    webview: {
      options: {},
      get html() { return html; },
      set html(v: string) { html = v; },
      cspSource: "vscode-resource:",
      asWebviewUri: (u: any) => u,
      onDidReceiveMessage: () => ({ dispose: () => {} }),
      postMessage: async () => true,
    },
    onDidDispose: () => ({ dispose: () => {} }),
    onDidChangeVisibility: () => ({ dispose: () => {} }),
    visible: true,
    show: () => {},
    title: "",
    description: "",
    badge: undefined,
  };
  return { view, htmlBytes: () => Buffer.byteLength(html, "utf8") };
}

function main(): void {
  const reps = 5;
  vscode.workspace.workspaceFolders = [
    { uri: vscode.Uri.file(REPO_ROOT), name: "dabbler-ai-orchestration", index: 0 },
  ];

  const activateMs: number[] = [];
  const resolveMs: number[] = [];
  let htmlBytes = 0;

  for (let r = 0; r < reps; r++) {
    const ctx = makeContext();
    activateMs.push(ms(() => activate(ctx as any)));
    for (const d of ctx.subscriptions) { try { d.dispose(); } catch { /* ignore */ } }

    const ctx2 = makeContext();
    const scanState = new ScanState();
    const provider = new CustomSessionSetsView(ctx2 as any, scanState);
    const { view, htmlBytes: bytes } = makeWebviewView();
    resolveMs.push(ms(() => provider.resolveWebviewView(view as any, {} as any, {} as any)));
    htmlBytes = bytes();
    provider.dispose();
    scanState.dispose();
  }

  // The renderer's actual payload: what must be fetched, parsed and executed
  // before anything is painted.
  const assets: Record<string, number> = {};
  let assetTotal = 0;
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|css)$/.test(e.name)) {
        const n = fs.statSync(p).size;
        assets[path.relative(MEDIA, p).split(path.sep).join("/")] = n;
        assetTotal += n;
      }
    }
  };
  walk(path.join(MEDIA, "session-sets-tree"));

  const payload = {
    generatedBy: "scripts/activation-harness.ts (Set 110 S1, round-4 remedy)",
    platform: `${os.platform()} ${os.release()}`,
    node: process.version,
    reps,
    caveat:
      "Measured in-process against the vscode stub. These are the EXTENSION'S OWN " +
      "synchronous costs on the host side — real. They EXCLUDE extension-host " +
      "startup overhead and all renderer-side work (webview process spawn, HTML/CSS " +
      "parse, script evaluation, first paint), which a Node harness cannot reach. " +
      "Layer 3 owns first paint in S4, against both implementations.",
    buckets: {
      activateMs: {
        median: +median(activateMs).toFixed(2),
        raw: activateMs.map((x) => +x.toFixed(2)),
        covers: "extension activate(): provider construction, command registration, watchers, context keys",
      },
      resolveWebviewViewMs: {
        median: +median(resolveMs).toFixed(2),
        raw: resolveMs.map((x) => +x.toFixed(2)),
        covers: "host half of showing the view: HTML assembly, message wiring, options. A TreeDataProvider removes this entirely.",
      },
      webviewPayloadBytes: {
        htmlBytes,
        assetBytes: assetTotal,
        assets,
        covers:
          "what the renderer must fetch/parse/execute before first paint. Reported as BYTES, not ms, " +
          "because timing it needs a renderer. This is the bucket the migration deletes outright.",
      },
    },
  };

  const out = path.join(
    REPO_ROOT,
    "docs/session-sets/110-work-explorer-native-treeview/s1-activation-measurements.json",
  );
  fs.writeFileSync(out, JSON.stringify(payload, null, 2), "utf8");

  process.stdout.write(
    `activate():            ${median(activateMs).toFixed(1)} ms (median of ${reps})\n` +
    `resolveWebviewView():  ${median(resolveMs).toFixed(1)} ms (median of ${reps})\n` +
    `webview HTML:          ${htmlBytes} bytes\n` +
    `webview JS/CSS assets: ${assetTotal} bytes across ${Object.keys(assets).length} file(s)\n` +
    `wrote ${out}\n`,
  );
}

main();
