// The framework's own long work, started detached and collected later.
//
// A verification round, the complete suite and the close each outlast an
// engine's tool timeout -- `verify_session` outlasted Bash's in v1, and the
// driver spike's foreground poll died the same way -- so nothing here
// awaits a child. A job is started, its record goes on `run.json`, and the
// caller returns; the NEXT call polls it. That is what lets `dabbler
// session next` hand the engine a `wait` instruction rather than a call
// that never comes back.
//
// The pid is not the answer to "is it done". Pids are reused, a detached
// child outlives the process that spawned it, and a killed one leaves
// nothing behind. So the runner writes its exit code to a status file
// through a write-then-rename, and that file -- not the pid -- is what
// says the job finished and how. The pid answers only the other question:
// when there is no status file, is anything still running, or did the
// child vanish?
//
// Vanished is a third answer on purpose. A machine that restarted mid-round
// leaves a job with no process and no status, and a poll that quietly
// re-ran it would spend another round's worth of provider calls on a fact
// nobody recorded. It is a stop, and the operator reads it.

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { terminateTree } from "./checks.ts";
import { driverDir } from "./driver.ts";
import type { DriverRun } from "./generated/index.ts";
import { nowIso } from "./journal.ts";
import { PACKAGE_ROOT } from "./paths.ts";

/** The job record `run.json` carries: `job` is exactly this or null. */
export type Job = NonNullable<DriverRun["job"]>;

/** Where a poll found the job. There is no fourth answer. */
export type JobState =
  | { readonly state: "running" }
  | { readonly state: "exited"; readonly exitCode: number | null }
  | { readonly state: "vanished" };

export interface StartJobOptions {
  /** What the framework is running, in the words the `wait` instruction shows. */
  readonly name: string;
  /** The program and its arguments, spawned with no shell. */
  readonly argv: readonly string[];
  /** How long to leave it alone before polling again. */
  readonly retryAfterSeconds: number;
}

export const JOBS_DIRNAME = "jobs";
export const JOB_RUNNER_FILENAME = "job-runner.cjs";

/**
 * The runner, written beside the job it runs.
 *
 * CommonJS and dependency-free because it is spawned on a bare `node` with
 * no loader and no bundle: it is the one piece of this package that must
 * run from a file on disk in every layout. It appends the child's output to
 * the log, and when the child is done it writes the status file through a
 * temp and a rename, so a reader never sees half of it.
 *
 * What the runner starts, the runner ends -- and what ends the runner ends
 * the tree. `startJob` spawns the runner detached, so on POSIX it leads a
 * process group of its own, and the command it runs is spawned INTO that
 * group rather than detached from it: a kill of the group from outside
 * (`endJob`, from a router process that never held the child) reaches the
 * command and everything it forked, and so does the runner's own exit. On
 * Windows `taskkill /T` walks the parent-child tree, and needs no group.
 *
 * Collection reaps too, when the command did not end well. A command that
 * was killed, timed out or failed may have left a helper -- a server, a
 * watcher, a worker it never waited for -- and before the status is written
 * the runner walks what is still alive under it (Windows keeps a dead
 * parent's pid on its orphans, so the walk from the command's pid finds
 * them; on POSIX the group is the walk) and ends it. A helper that puts
 * itself in a new session on POSIX has declared independence and is out of
 * reach; nothing here follows it.
 *
 * A command that exited zero on its own is NOT walked. The walk on Windows
 * is a PowerShell enumeration of the whole process table, one to three
 * seconds of CPU per job, and on the operator's ruling of 2026-09-03 the
 * machine outranks the tidiness: a clean exit that nevertheless leaked a
 * helper leaves it running, which is what every other tool on the machine
 * does too.
 */
const JOB_RUNNER = `// Written by packages/router/src/jobs.ts. Do not edit; it is replaced.
const { spawn, spawnSync } = require("node:child_process");
const { createWriteStream, renameSync, writeFileSync } = require("node:fs");

const [, , status, log, cwd, ...argv] = process.argv;
const out = createWriteStream(log, { flags: "a" });
const win = process.platform === "win32";

function finish(exit) {
  out.end(() => {
    const temp = status + ".writing";
    writeFileSync(temp, JSON.stringify({ exit, ended_at: new Date().toISOString() }) + "\\n", "utf8");
    renameSync(temp, status);
    process.exit(0);
  });
}

function kill(pid) {
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    /* already gone */
  }
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error && error.code === "EPERM";
  }
}

// pid -> parent pid (Windows) or pid -> group (POSIX) for every process the
// OS listed, minus the probe that listed them -- it runs in this very group
// and lists itself -- or null when the OS would not say.
function processTable() {
  const probe = win
    ? spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command",
        "Get-CimInstance Win32_Process | ForEach-Object { \\"$($_.ProcessId) $($_.ParentProcessId)\\" }"],
        { encoding: "utf8", windowsHide: true })
    : spawnSync("ps", ["-A", "-o", "pid=,pgid="], { encoding: "utf8" });
  if (probe.error || probe.status !== 0) return null;
  const rows = [];
  for (const line of String(probe.stdout).split("\\n")) {
    const [a, b] = line.trim().split(/\\s+/);
    if (a && b && Number(a) !== probe.pid) rows.push([Number(a), Number(b)]);
  }
  return rows;
}

// Everything still alive under the command, after it has exited. Only what
// is still alive at the moment of asking: a listed pid that has since gone
// is a number the OS may already have given to somebody else.
function survivors(commandPid) {
  const table = processTable();
  if (table === null) return [];
  let found;
  if (!win) {
    // The group is the runner's own; every member but the runner itself.
    found = table.filter(([pid, pgid]) => pgid === process.pid && pid !== process.pid).map(([pid]) => pid);
  } else {
    const seen = new Set();
    let frontier = [commandPid];
    while (frontier.length > 0) {
      const next = [];
      for (const [pid, parent] of table) {
        if (frontier.includes(parent) && !seen.has(pid)) {
          seen.add(pid);
          next.push(pid);
        }
      }
      frontier = next;
    }
    found = [...seen];
  }
  return found.filter(alive);
}

const child = spawn(argv[0], argv.slice(1), { cwd, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
let exited = false;
child.stdout.pipe(out, { end: false });
child.stderr.pipe(out, { end: false });
child.on("error", (error) => {
  out.write("job-runner: " + (error && error.message ? error.message : String(error)) + "\\n");
  finish(null);
});
child.on("exit", (code, signal) => {
  // Before the close, which waits on the output pipes: a helper holding
  // them open is exactly what is reaped here, and its end is what lets the
  // close arrive. Only after an abnormal end; a clean exit is not walked.
  exited = true;
  if (code === 0 && !signal) return;
  const left = child.pid === undefined ? [] : survivors(child.pid);
  if (left.length > 0) out.write("job-runner: ended " + left.length + " process(es) the command left running\\n");
  for (const pid of left) kill(pid);
});
child.on("close", (code, signal) => {
  if (signal) out.write("job-runner: killed by " + signal + "\\n");
  finish(code === null ? null : code);
});

// A signal the runner can observe ends the command; its exit then reaps
// the rest, and the close writes the status as usual, with no code.
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    out.write("job-runner: ended by " + signal + "\\n");
    if (!exited && child.pid !== undefined) {
      if (win) spawnSync("taskkill", ["/F", "/T", "/PID", String(child.pid)], { stdio: "ignore", windowsHide: true });
      else kill(child.pid);
    }
  });
}
// The group goes with the runner: a last sweep of anything the walk above
// could not see, the runner included -- its status is already on disk.
if (!win) {
  process.on("exit", () => {
    try {
      process.kill(-process.pid, "SIGKILL");
    } catch {
      /* nobody left */
    }
  });
}
`;

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "job";
}

/** Repository-relative, forward slashes, as the run schema declares them. */
function repoRelative(repoRoot: string, path: string): string {
  return relative(repoRoot, path).replace(/\\/g, "/");
}

/**
 * The argv that re-enters this router's own CLI.
 *
 * It runs the layout this code is itself running from: the sources through
 * `run-ts.mjs` when this module is a `.ts` file, and the bundle beside it
 * otherwise. A job started under vitest therefore runs the sources the test
 * is testing, and one started from a VSIX runs the bundle that shipped --
 * never whichever `dist/` happened to be lying around.
 */
export function selfArgv(): string[] {
  const here = fileURLToPath(import.meta.url);
  if (here.endsWith(".ts")) {
    return [
      process.execPath,
      join(PACKAGE_ROOT, "scripts", "run-ts.mjs"),
      join(PACKAGE_ROOT, "src", "cli", "dabbler.ts"),
    ];
  }
  return [process.execPath, join(dirname(here), "dabbler.cjs")];
}

export function jobsDir(repoRoot: string, sessionNumber: number): string {
  return join(driverDir(repoRoot, sessionNumber), JOBS_DIRNAME);
}

/**
 * Where a job by that name writes, whether or not one is running.
 *
 * The name decides the path, so a job's output can be re-read after the
 * record has let go of it -- which is the only way to read the REASON a
 * finished verb refused with. Without it a caller has the exit code and
 * nothing else, and two unlike refusals sharing a code are one refusal.
 */
export function jobLogPath(repoRoot: string, sessionNumber: number, name: string): string {
  return join(jobsDir(repoRoot, sessionNumber), `${slug(name)}.log`);
}

/**
 * The last `lines` lines a job wrote, trimmed; empty when there is no log.
 *
 * A tail rather than the whole thing: a verb's refusal is the last thing it
 * says, and a suite's log is megabytes of somebody else's output.
 */
export function jobLogTail(repoRoot: string, sessionNumber: number, name: string, lines = 12): string {
  let text: string;
  try {
    text = readFileSync(jobLogPath(repoRoot, sessionNumber, name), "utf8");
  } catch {
    return "";
  }
  return text
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line !== "")
    .slice(-lines)
    .join("\n")
    .trim();
}

/**
 * Start `argv` detached and return the record that finds it again.
 *
 * The caller does not wait: the child is unrefd and its stdio ignored, so
 * this process may exit the moment it returns and the work carries on.
 */
export function startJob(
  repoRoot: string,
  sessionNumber: number,
  options: StartJobOptions,
): Job {
  const directory = jobsDir(repoRoot, sessionNumber);
  mkdirSync(directory, { recursive: true });
  const runner = join(directory, JOB_RUNNER_FILENAME);
  writeFileSync(runner, JOB_RUNNER, "utf8");

  const stem = slug(options.name);
  const log = join(directory, `${stem}.log`);
  const status = join(directory, `${stem}.status.json`);
  // A re-run of the same job must not read the last round's answer, and
  // its log is the log of THIS run.
  for (const stale of [status, `${status}.writing`]) {
    if (existsSync(stale)) unlinkSync(stale);
  }
  writeFileSync(log, "");

  // The work runs in the repository; the RUNNER deliberately does not. On
  // Windows a process's working directory cannot be removed, and the runner
  // outlives its child by the moment it takes to write the status file --
  // long enough to pin the very tree the job was working on.
  const child = spawn(process.execPath, [runner, status, log, repoRoot, ...options.argv], {
    cwd: tmpdir(),
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
  if (child.pid === undefined) {
    throw new Error(`the job '${options.name}' could not be started`);
  }
  return {
    name: options.name,
    argv: [...options.argv],
    pid: child.pid,
    log: repoRelative(repoRoot, log),
    status: repoRelative(repoRoot, status),
    started_at: nowIso(),
    retry_after_seconds: options.retryAfterSeconds,
  };
}

/**
 * End a job and everything under it.
 *
 * The runner is what the record holds a pid for, and it is the root of the
 * tree: a `taskkill /T` of it, or a kill of the group `detached` gave it,
 * takes the verb it ran and whatever that verb forked. The runner gets no
 * chance to write a status, so the job polls as `vanished` afterwards --
 * which is the truth, and the caller that ends a job is a caller that is
 * abandoning the run it belonged to and clears the record itself.
 */
export function endJob(job: Job): void {
  // Only a runner that is still there: the OS reuses pids, and a job whose
  // runner has already exited names a number that may be somebody else's.
  if (!alive(job.pid)) return;
  terminateTree(job.pid);
}

/** Where the job is: running, exited with its code, or vanished. */
export function pollJob(repoRoot: string, job: Job): JobState {
  const status = join(repoRoot, job.status);
  const exited = readStatus(status);
  if (exited !== null) return exited;
  if (alive(job.pid)) return { state: "running" };
  // The runner renames the status file BEFORE it exits, so a dead process
  // with no status is a vanished one -- but only after a second look, which
  // closes the window between the two checks above.
  return readStatus(status) ?? { state: "vanished" };
}

function readStatus(path: string): { state: "exited"; exitCode: number | null } | null {
  if (!existsSync(path)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    // Half a file cannot happen -- the runner renames -- so unparseable
    // here means something else wrote it, and "no code" is the honest read.
    return { state: "exited", exitCode: null };
  }
  const code = (parsed as { exit?: unknown })?.exit;
  return { state: "exited", exitCode: typeof code === "number" ? code : null };
}

/**
 * Whether the pid still names a live process. Signal 0 checks without
 * delivering; EPERM means it exists and belongs to somebody else, which is
 * still alive.
 */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException)?.code === "EPERM";
  }
}
