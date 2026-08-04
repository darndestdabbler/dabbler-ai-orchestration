// Work Explorer startup-cost harness (Set 110 S1).
//
// Answers one question the whole 110 migration hangs on: the Explorer feels
// sluggish EVEN WHEN THE TREE IS EMPTY, and an empty tree builds no rows — so
// neither the full-teardown re-render nor the build-collapsed-children waste
// can explain it. If the cost is host-side (discovery + scan), a TreeView
// migration will not make startup feel faster, and the set must say so.
//
// Buckets measured here are the HOST-SIDE ones, which is where the hypothesis
// lives and which are measurable in plain Node against the real modules:
//
//   discovery  discoverRootsWithFamilies() — one `git worktree list`
//              SUBPROCESS per workspace folder, spawned synchronously,
//              paid before a single set is read. Scale-independent.
//   scan       readSessionSets(root) — per-set synchronous file reads
//              (spec.md, session-state.json, activity-log.json,
//              session-events.jsonl, UAT checklist, issues envelope).
//   pipeline   readAllSessionSetsWithDiagnostics() — THE PRODUCT ENTRYPOINT
//              and therefore the total. It internally re-runs discovery and
//              the scan, so `discovery` and `scan` above are COMPONENT
//              probes measured separately for attribution. They are NOT
//              summed into the total; doing so double-counts. (The first cut
//              of this harness made exactly that mistake and reported
//              inflated totals.)
//
// resolveWebviewView and webview-cold-start-to-first-paint are NOT measured
// here: they require a real extension host. They are Layer 3's to report.
// This harness deliberately measures only what it can measure honestly.
//
// Run:  npx ts-node --require ./src/test/vscode-stub.js scripts/perf-harness.ts
// Opts: --sizes 0,10,100,500   --reps 5   --json <path>   --real-repo <dir>

import * as cp from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const vscode = require("vscode");

import {
  discoverRootsWithFamilies,
  readAllSessionSetsWithDiagnostics,
  readSessionSets,
} from "../src/utils/fileSystem";

interface Sample {
  label: string;
  sizeSets: number;
  discoveryMs: number[];
  scanMs: number[];
  /** The product entrypoint = the honest total. Not a sum of the above. */
  pipelineMs: number[];
  setsFound: number;
  gitSubprocessMs: number[];
}

function parseArgs(argv: string[]): {
  sizes: number[];
  reps: number;
  jsonOut: string | null;
  realRepo: string | null;
} {
  const get = (flag: string): string | null => {
    const i = argv.indexOf(flag);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
  };
  return {
    sizes: (get("--sizes") ?? "0,10,100,500").split(",").map((s) => parseInt(s.trim(), 10)),
    reps: parseInt(get("--reps") ?? "5", 10),
    jsonOut: get("--json"),
    realRepo: get("--real-repo"),
  };
}

/** Median — reported instead of the mean because a single Windows AV stall
 *  in one rep should not become the headline number. */
function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function ms(fn: () => void): number {
  const t0 = process.hrtime.bigint();
  fn();
  return Number(process.hrtime.bigint() - t0) / 1e6;
}

/** Point the vscode stub's workspace at a folder. */
function setWorkspaceFolder(dir: string | null): void {
  vscode.workspace.workspaceFolders = dir
    ? [{ uri: vscode.Uri.file(dir), name: path.basename(dir), index: 0 }]
    : undefined;
}

// ---------------------------------------------------------------- fixtures

const SPEC = (n: number) => `# Synthetic Set ${n}

> **Purpose:** perf fixture.
> **Session Set:** \`docs/session-sets/${String(n).padStart(3, "0")}-synthetic/\`

## Session Set Configuration

\`\`\`yaml
tier: full
requiresUAT: false
requiresE2E: false
uatStyle: ad-hoc
uatScope: per-set
pathAwareCritique: none
\`\`\`

## Sessions

### Session 1 of 3: Synthetic
**Steps:** 1. Do the thing.
**Creates:** nothing
**Ends with:** nothing
`;

const STATE = (n: number) =>
  JSON.stringify(
    {
      schemaVersion: 4,
      sessionSetName: `${String(n).padStart(3, "0")}-synthetic`,
      status: n % 3 === 0 ? "complete" : "in-progress",
      sessions: [1, 2, 3].map((i) => ({
        number: i,
        title: `Session ${i}`,
        status: i === 1 ? "complete" : i === 2 && n % 3 !== 0 ? "in-progress" : "not-started",
        startedAt: "2026-08-04T10:00:00-04:00",
        completedAt: i === 1 ? "2026-08-04T11:00:00-04:00" : null,
        orchestrator: { engine: "claude", provider: "anthropic", model: "claude-opus-5", effort: "high" },
        verificationVerdict: i === 1 ? "VERIFIED" : null,
      })),
    },
    null,
    2,
  );

const ACTIVITY = JSON.stringify(
  { steps: Array.from({ length: 20 }, (_, i) => ({ step: i + 1, note: `synthetic step ${i + 1}`, at: "2026-08-04T10:00:00-04:00" })) },
  null,
  2,
);

const EVENTS = Array.from({ length: 6 }, (_, i) =>
  JSON.stringify({ event: i % 2 ? "session_closed" : "session_started", session: Math.floor(i / 2) + 1, at: "2026-08-04T10:00:00-04:00" }),
).join("\n");

/** Build a fixture repo with `count` session sets. Real git repo, because
 *  discovery shells out to `git worktree list` and a non-repo would measure
 *  the failure path instead of the real one. */
function makeFixture(root: string, count: number): void {
  const setsDir = path.join(root, "docs", "session-sets");
  fs.mkdirSync(setsDir, { recursive: true });
  for (let n = 1; n <= count; n++) {
    const dir = path.join(setsDir, `${String(n).padStart(3, "0")}-synthetic`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "spec.md"), SPEC(n), "utf8");
    fs.writeFileSync(path.join(dir, "session-state.json"), STATE(n), "utf8");
    fs.writeFileSync(path.join(dir, "activity-log.json"), ACTIVITY, "utf8");
    fs.writeFileSync(path.join(dir, "session-events.jsonl"), EVENTS, "utf8");
    if (n % 4 === 0) {
      fs.writeFileSync(path.join(dir, "change-log.md"), "# Change log\n\nSynthetic.\n", "utf8");
    }
  }
  cp.execFileSync("git", ["init", "--quiet"], { cwd: root, windowsHide: true });
  cp.execFileSync("git", ["config", "user.email", "perf@example.com"], { cwd: root, windowsHide: true });
  cp.execFileSync("git", ["config", "user.name", "perf"], { cwd: root, windowsHide: true });
}

// ------------------------------------------------------------- measurement

/** Time the bare git subprocess on its own, so discovery's cost can be
 *  attributed to the spawn rather than left as an unexplained lump. */
function timeGitWorktreeList(cwd: string): number {
  return ms(() => {
    try {
      cp.execFileSync("git", ["worktree", "list", "--porcelain"], {
        cwd,
        encoding: "utf8",
        windowsHide: true,
        maxBuffer: 1024 * 1024,
        timeout: 5000,
      });
    } catch {
      /* measured as the failure path, same as the product's catch */
    }
  });
}

function measure(label: string, root: string, sizeSets: number, reps: number): Sample {
  setWorkspaceFolder(root);
  const s: Sample = {
    label,
    sizeSets,
    discoveryMs: [],
    scanMs: [],
    pipelineMs: [],
    setsFound: 0,
    gitSubprocessMs: [],
  };

  // Warm the OS file cache once so rep 1 is not the only cold read; the
  // interesting comparison is steady-state, and a cold-cache outlier would
  // swamp the scale signal.
  try {
    discoverRootsWithFamilies();
    readSessionSets(root);
  } catch {
    /* fixture may legitimately have no sets */
  }

  for (let r = 0; r < reps; r++) {
    s.gitSubprocessMs.push(timeGitWorktreeList(root));

    let roots: ReturnType<typeof discoverRootsWithFamilies> = [];
    s.discoveryMs.push(ms(() => { roots = discoverRootsWithFamilies(); }));

    let scanned = 0;
    s.scanMs.push(ms(() => {
      for (const rt of roots) scanned += readSessionSets(rt.dir).length;
    }));

    let merged = 0;
    s.pipelineMs.push(ms(() => { merged = readAllSessionSetsWithDiagnostics().sets.length; }));

    s.setsFound = merged;
    void scanned;
  }
  return s;
}

function report(samples: Sample[]): string {
  const rows = samples.map((s) => {
    const pipeline = median(s.pipelineMs);
    const discovery = median(s.discoveryMs);
    return {
      scenario: s.label,
      sets: s.setsFound,
      git_spawn_ms: +median(s.gitSubprocessMs).toFixed(1),
      discovery_ms: +discovery.toFixed(1),
      scan_ms: +median(s.scanMs).toFixed(1),
      pipeline_ms: +pipeline.toFixed(1),
      discovery_pct: pipeline > 0 ? Math.round((discovery / pipeline) * 100) : 0,
    };
  });
  const head =
    "scenario                 sets   git_spawn  discovery      scan   PIPELINE  discovery%";
  const lines = rows.map(
    (r) =>
      `${r.scenario.padEnd(24)} ${String(r.sets).padStart(4)}   ` +
      `${r.git_spawn_ms.toFixed(1).padStart(9)}  ${r.discovery_ms.toFixed(1).padStart(9)}  ` +
      `${r.scan_ms.toFixed(1).padStart(8)}  ${r.pipeline_ms.toFixed(1).padStart(9)}  ` +
      `${String(r.discovery_pct).padStart(9)}%`,
  );
  return [
    head,
    "-".repeat(head.length),
    ...lines,
    "",
    "PIPELINE = readAllSessionSetsWithDiagnostics(), the real product call, and the",
    "honest total. discovery/scan are component probes measured separately for",
    "attribution and are ALREADY INSIDE pipeline — do not add the columns.",
    "",
    "A discovery% at or above 100 is not a bug: at small set counts BOTH numbers are",
    "one `git worktree list` spawn and nothing else, so they differ only by run-to-run",
    "noise. Read it as 'discovery is the entire cost', which is the finding.",
  ].join("\n");
}

function main(): void {
  const { sizes, reps, jsonOut, realRepo } = parseArgs(process.argv.slice(2));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-perf-"));
  const samples: Sample[] = [];

  try {
    for (const n of sizes) {
      const root = path.join(tmp, `fixture-${n}`);
      makeFixture(root, n);
      samples.push(measure(`synthetic ${n} sets`, root, n, reps));
    }
    if (realRepo && fs.existsSync(realRepo)) {
      samples.push(measure("REAL repo", realRepo, -1, reps));
    }

    const text = report(samples);
    // L-079-1: persist before printing — a mid-print encoding crash must not
    // lose measurements that cost minutes to gather.
    const payload = {
      generatedBy: "scripts/perf-harness.ts (Set 110 S1)",
      platform: `${os.platform()} ${os.release()}`,
      cpus: os.cpus().length,
      node: process.version,
      reps,
      note:
        "Host-side buckets only. resolveWebviewView and webview cold-start-to-first-paint " +
        "require a real extension host and are not measured here.",
      attribution:
        "pipelineMs is readAllSessionSetsWithDiagnostics(), the product entrypoint and the " +
        "honest total. discoveryMs and scanMs are component probes run separately and are " +
        "ALREADY CONTAINED IN pipelineMs — summing them double-counts.",
      samples: samples.map((s) => ({
        scenario: s.label,
        setsFound: s.setsFound,
        medians: {
          gitSubprocessMs: +median(s.gitSubprocessMs).toFixed(2),
          discoveryMs: +median(s.discoveryMs).toFixed(2),
          scanMs: +median(s.scanMs).toFixed(2),
          pipelineMs: +median(s.pipelineMs).toFixed(2),
          discoveryShareOfPipeline:
            median(s.pipelineMs) > 0
              ? +(median(s.discoveryMs) / median(s.pipelineMs)).toFixed(3)
              : null,
        },
        raw: {
          gitSubprocessMs: s.gitSubprocessMs,
          discoveryMs: s.discoveryMs,
          scanMs: s.scanMs,
          pipelineMs: s.pipelineMs,
        },
      })),
      table: text,
    };
    if (jsonOut) {
      fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
      fs.writeFileSync(jsonOut, JSON.stringify(payload, null, 2), "utf8");
    }
    process.stdout.write(text + "\n");
    if (jsonOut) process.stdout.write(`\nwrote ${jsonOut}\n`);
  } finally {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
}

main();
