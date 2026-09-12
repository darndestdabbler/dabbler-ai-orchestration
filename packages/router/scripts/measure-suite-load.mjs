// What a run of record does to the machine it runs on, sampled while it runs.
//
// Wall clock is recorded for every suite of every session; what the operator
// FEELS is not, and three sessions have now legislated against a load nobody
// had measured. This runs a command and, every few seconds until it exits,
// writes one sample: how busy the CPUs are, how deep the disk queue is, how
// much memory is free, how many processes exist, and the tree beneath the
// command WITH EACH PROCESS'S OS PRIORITY CLASS. The last of those is the
// fact in question -- `test/support/no-git.ts` lowers each test WORKER, and
// nothing lowers the runner above them or the extension suite's mocha, which
// loads no preload at all.
//
// Samples go under `.dabbler/scratch/suite-load/`, which is untracked: the
// raw record is evidence for one investigation, and what it says belongs in
// `docs/design/suite-cost.md` instead.
//
//   node packages/router/scripts/measure-suite-load.mjs --label typescript -- node --test ...
//   node packages/router/scripts/measure-suite-load.mjs --self-check
//
// The CPU figure comes from `os.cpus()` deltas and the free memory from
// `os.freemem()`, so neither costs a process. The process tree and the disk
// queue need the OS asked, and on Windows the asking is done down ONE
// PowerShell process held open for the whole measurement -- a fresh
// `powershell` per sample cost 2.2 seconds against the 0.2 the two queries
// take, which would have been the sampler measuring itself.
//
// `sampler_cost_s` in the summary is time spent AWAITING those queries while
// the measured command runs on: the sampler competes with what it measures,
// it does not delay it in series, so a sampled wall clock is a sampled wall
// clock and subtracting that number from it is not a measurement. To compare
// two shapes of a suite, run each with no sampler attached.

import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { cpus, freemem, totalmem } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..");
const SAMPLE_DIR = join(REPO_ROOT, ".dabbler", "scratch", "suite-load");
const WINDOWS = process.platform === "win32";

/**
 * Windows base priorities, which is what `Win32_Process.Priority` reports.
 * Node's own scale is different (`PRIORITY_BELOW_NORMAL` is 10), so a sample
 * carries the number the OS gave and the name it means, and nothing converts
 * silently between the two.
 */
const PRIORITY_NAMES = new Map([
  [4, "idle"],
  [6, "below-normal"],
  [8, "normal"],
  [10, "above-normal"],
  [13, "high"],
  [24, "realtime"],
]);

function priorityName(value) {
  if (typeof value !== "number") return "unknown";
  return PRIORITY_NAMES.get(value) ?? `other(${String(value)})`;
}

// --- the snapshot the OS has to be asked for ----------------------------------

// One line of input asks for one line of JSON back, so the queries are paid
// for once each and the process startup is paid for once in the run. The
// perf class is the PhysicalDisk one: `..._PerfDisk_PerfDisk` does not
// exist on Windows 11 and answered an empty queue depth forever.
const PS_LOOP = [
  "$ErrorActionPreference='SilentlyContinue'",
  "while ($true) {",
  "  $line = [Console]::In.ReadLine()",
  "  if ($null -eq $line -or $line -eq 'quit') { break }",
  "  $d=(Get-CimInstance Win32_PerfFormattedData_PerfDisk_PhysicalDisk -Filter \"Name='_Total'\").CurrentDiskQueueLength",
  "  $p=Get-CimInstance -Query 'SELECT ProcessId,ParentProcessId,Name,Priority,CommandLine,CreationDate FROM Win32_Process'",
  "  [pscustomobject]@{diskQueue=$d;procs=$p} | ConvertTo-Json -Depth 3 -Compress",
  "}",
].join("\n");

/** The OS, asked for a snapshot: one PowerShell on Windows, `ps` elsewhere. */
function openSampler() {
  if (!WINDOWS) {
    return {
      // POSIX: the nice value is the closest thing to the same courtesy, and
      // the disk queue has no portable counter, so it is reported absent
      // rather than guessed at.
      async snapshot() {
        const run = spawnSync("ps", ["-A", "-o", "pid=,ppid=,ni=,comm="], { encoding: "utf8" });
        if (run.status !== 0) return { diskQueue: null, procs: [] };
        const procs = run.stdout
          .split("\n")
          .map((line) => line.trim().split(/\s+/))
          .filter((parts) => parts.length >= 4)
          .map((parts) => ({
            pid: Number(parts[0]),
            ppid: Number(parts[1]),
            name: parts.slice(3).join(" "),
            priority: Number(parts[2]),
            cmd: "",
          }));
        return { diskQueue: null, procs };
      },
      close() {},
    };
  }

  // `-EncodedCommand` rather than `-Command`: the loop carries quotes of both
  // kinds, and what a shell-less spawn does to them on Windows is not worth
  // finding out twice.
  const encoded = Buffer.from(PS_LOOP, "utf16le").toString("base64");
  const shell = spawn("powershell", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], {
    stdio: ["pipe", "pipe", "ignore"],
    windowsHide: true,
  });
  let buffer = "";
  const waiting = [];
  shell.stdout.setEncoding("utf8");
  shell.stdout.on("data", (chunk) => {
    buffer += chunk;
    for (;;) {
      const end = buffer.indexOf("\n");
      if (end < 0) break;
      const line = buffer.slice(0, end).trim();
      buffer = buffer.slice(end + 1);
      if (line === "") continue;
      const resolve = waiting.shift();
      if (resolve !== undefined) resolve(line);
    }
  });
  shell.on("exit", () => {
    while (waiting.length > 0) waiting.shift()("");
  });

  return {
    async snapshot() {
      const line = await new Promise((resolve) => {
        waiting.push(resolve);
        shell.stdin.write("go\n");
      });
      if (line === "") return { diskQueue: null, procs: [] };
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        return { diskQueue: null, procs: [] };
      }
      const rows = Array.isArray(parsed.procs) ? parsed.procs : [];
      return {
        diskQueue: typeof parsed.diskQueue === "number" ? parsed.diskQueue : null,
        procs: rows.map((row) => ({
          pid: row.ProcessId,
          ppid: row.ParentProcessId,
          name: String(row.Name ?? ""),
          priority: typeof row.Priority === "number" ? row.Priority : null,
          cmd: String(row.CommandLine ?? "").slice(0, 160),
          startedMs: Date.parse(String(row.CreationDate ?? "")),
        })),
      };
    },
    close() {
      try {
        shell.stdin.write("quit\n");
        shell.stdin.end();
      } catch {
        // The sampler is finished with either way.
      }
    },
  };
}

/**
 * The measured command's own descendants, itself included.
 *
 * A process is only a child if it also started AFTER the measurement did:
 * Windows reuses pids, and a long-lived stranger whose parent's pid was
 * later handed to the measured command reads as a descendant of it. The
 * first run of this script put Adobe's sync service inside the test tree.
 */
function descendants(procs, rootPid, startedAt) {
  const children = new Map();
  for (const row of procs) {
    if (Number.isFinite(row.startedMs) && row.startedMs < startedAt - 1000) continue;
    const list = children.get(row.ppid) ?? [];
    list.push(row);
    children.set(row.ppid, list);
  }
  const out = [];
  const seen = new Set();
  const queue = [rootPid];
  while (queue.length > 0) {
    const pid = queue.shift();
    if (seen.has(pid)) continue;
    seen.add(pid);
    const self = procs.find((row) => row.pid === pid);
    if (self !== undefined) out.push(self);
    for (const child of children.get(pid) ?? []) queue.push(child.pid);
  }
  return out;
}

/** Percent busy across all CPUs since the previous reading. */
function cpuBusy(previous) {
  const now = cpus().reduce(
    (acc, cpu) => {
      const times = cpu.times;
      return {
        idle: acc.idle + times.idle,
        total: acc.total + times.user + times.nice + times.sys + times.idle + times.irq,
      };
    },
    { idle: 0, total: 0 },
  );
  if (previous === null) return { reading: now, percent: null };
  const idle = now.idle - previous.idle;
  const total = now.total - previous.total;
  if (total <= 0) return { reading: now, percent: null };
  return { reading: now, percent: Math.round((1 - idle / total) * 1000) / 10 };
}

// --- the measurement ----------------------------------------------------------

async function measure({ label, intervalMs, argv, cwd }) {
  mkdirSync(SAMPLE_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const samplePath = join(SAMPLE_DIR, `${label}-${stamp}.jsonl`);
  const logPath = join(SAMPLE_DIR, `${label}-${stamp}.log`);
  const samples = createWriteStream(samplePath, { flags: "a" });
  const childLog = createWriteStream(logPath, { flags: "a" });

  const startedAt = Date.now();
  const child = spawn(argv[0], argv.slice(1), { cwd, windowsHide: true });
  child.stdout.pipe(childLog);
  child.stderr.pipe(childLog);

  const rows = [];
  let reading = cpuBusy(null).reading;
  let snapshotCost = 0;
  const sampler = openSampler();

  const exited = new Promise((done) => {
    child.on("exit", (code) => done(code ?? null));
  });

  let running = true;
  void exited.then(() => {
    running = false;
  });

  while (running) {
    await new Promise((wake) => setTimeout(wake, intervalMs));
    if (!running) break;
    const busy = cpuBusy(reading);
    reading = busy.reading;
    const before = Date.now();
    const seen = await sampler.snapshot();
    snapshotCost += Date.now() - before;
    const tree = descendants(seen.procs, child.pid, startedAt).map((row) => ({
      pid: row.pid,
      ppid: row.ppid,
      name: row.name,
      priority: row.priority,
      priority_name: priorityName(row.priority),
      cmd: row.cmd,
    }));
    const row = {
      at: new Date().toISOString(),
      elapsed_s: Math.round((Date.now() - startedAt) / 100) / 10,
      cpu_pct: busy.percent,
      disk_queue: seen.diskQueue,
      free_mb: Math.round(freemem() / (1024 * 1024)),
      process_count: seen.procs.length,
      tree_size: tree.length,
      tree,
    };
    rows.push(row);
    samples.write(`${JSON.stringify(row)}\n`);
  }

  const exitCode = await exited;
  const elapsed = Math.round((Date.now() - startedAt) / 100) / 10;
  sampler.close();
  samples.end();
  childLog.end();
  return { label, samplePath, logPath, exitCode, elapsed, rows, snapshotCost };
}

function summarise(result) {
  const { rows } = result;
  const cpu = rows.map((row) => row.cpu_pct).filter((value) => typeof value === "number");
  const queue = rows.map((row) => row.disk_queue).filter((value) => typeof value === "number");
  const free = rows.map((row) => row.free_mb);
  const counts = rows.map((row) => row.process_count);
  const trees = rows.map((row) => row.tree_size);

  // Every distinct process the tree held, by name and priority, so a class
  // that is normal where it should not be is named rather than averaged away.
  const classes = new Map();
  for (const row of rows) {
    for (const proc of row.tree) {
      const key = `${proc.name} ${proc.priority_name}`;
      const seen = classes.get(key) ?? { key, pids: new Set(), cmd: proc.cmd };
      seen.pids.add(proc.pid);
      classes.set(key, seen);
    }
  }

  const max = (values) => (values.length === 0 ? null : Math.max(...values));
  const min = (values) => (values.length === 0 ? null : Math.min(...values));
  const mean = (values) =>
    values.length === 0 ? null : Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;

  return {
    label: result.label,
    exit: result.exitCode,
    elapsed_s: result.elapsed,
    samples: rows.length,
    sampler_cost_s: Math.round(result.snapshotCost / 100) / 10,
    cpu_pct: { mean: mean(cpu), max: max(cpu) },
    disk_queue: { mean: mean(queue), max: max(queue) },
    free_mb: { min: min(free), total_mb: Math.round(totalmem() / (1024 * 1024)) },
    process_count: { max: max(counts) },
    tree_size: { max: max(trees) },
    classes: [...classes.values()]
      .map((row) => ({ what: row.key, processes: row.pids.size, cmd: row.cmd }))
      .sort((a, b) => b.processes - a.processes),
    sample_file: result.samplePath,
  };
}

// --- entry --------------------------------------------------------------------

function parseArgs(argv) {
  const options = { label: "run", intervalMs: 3000, selfCheck: false, command: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--self-check") options.selfCheck = true;
    else if (arg === "--label") options.label = String(argv[(index += 1)]);
    else if (arg === "--interval") options.intervalMs = Number(argv[(index += 1)]) * 1000;
    else if (arg === "--") {
      options.command = argv.slice(index + 1);
      break;
    } else if (options.command.length === 0) options.command = argv.slice(index);
  }
  return options;
}

async function selfCheck() {
  // Eight seconds of a child that itself has a child, sampled every second:
  // enough to prove the sampler collects, finds the tree, and reports a
  // priority class -- without running a suite to find out. Long enough that
  // a busy box, where one snapshot can take a second or two, still leaves
  // room for the two samples asserted below.
  const script =
    "const {spawnSync}=require('node:child_process');" +
    "spawnSync(process.execPath,['-e','const t=Date.now();while(Date.now()-t<7000){}']);";
  const result = await measure({
    label: "self-check",
    intervalMs: 1000,
    argv: [process.execPath, "-e", script],
    cwd: REPO_ROOT,
  });
  const summary = summarise(result);
  const problems = [];
  if (summary.exit !== 0) problems.push(`the measured child exited ${String(summary.exit)}`);
  if (summary.samples < 2) problems.push(`only ${String(summary.samples)} sample(s) were collected`);
  if (summary.tree_size.max === null || summary.tree_size.max < 2) {
    problems.push("the process tree beneath the child was never seen");
  }
  const named = summary.classes.filter((row) => !row.what.endsWith("unknown"));
  if (named.length === 0) problems.push("no process in the tree carried a priority class");
  if (summary.cpu_pct.max === null) problems.push("no CPU reading was taken");
  if (summary.free_mb.min === null) problems.push("no memory reading was taken");

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (problems.length > 0) {
    process.stderr.write(`measure-suite-load: ${problems.join("; ")}\n`);
    return 1;
  }
  process.stdout.write("measure-suite-load: the sampler collects, sees the tree and reads its priorities.\n");
  return 0;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.selfCheck) return selfCheck();
  if (options.command.length === 0) {
    process.stderr.write(
      "usage: node packages/router/scripts/measure-suite-load.mjs [--label NAME] [--interval SECONDS] -- <command> [args...]\n" +
        "       node packages/router/scripts/measure-suite-load.mjs --self-check\n",
    );
    return 2;
  }
  const result = await measure({
    label: options.label,
    intervalMs: options.intervalMs,
    argv: options.command,
    cwd: REPO_ROOT,
  });
  process.stdout.write(`${JSON.stringify(summarise(result), null, 2)}\n`);
  return result.exitCode === 0 ? 0 : 1;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    process.stderr.write(`measure-suite-load: ${error?.message ?? String(error)}\n`);
    process.exitCode = 1;
  },
);
