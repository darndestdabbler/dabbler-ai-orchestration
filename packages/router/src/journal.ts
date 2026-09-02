// The git seam.
//
// The router spawns git here and nowhere else, so anything that must see
// every git call -- instrumentation, a spawn budget, an error policy --
// has one place to sit. `binary` is a mode of the one call rather than a
// second call: a blob's bytes are what a hash is taken over, and the
// newline framing that is noise in porcelain is content there.
//
// Beside it sit the primitives the record is made of: the worktree
// snapshot, the tree diff, the atomic replace, the `.dabbler` predicate
// and the clock. They are here because they are the same slice of the
// Python `journal` module -- the part that survives (D129). The
// append-only run journal, its lock, `heartbeat.json` and
// `run-projection.json` are the run core, which is retired and never
// ported (D88, D130), so nothing below reads or writes them.
//
// Nothing here takes a timestamp or a path from a caller and trusts it:
// the writer stamps its own clock, and `.dabbler/` is identified by one
// predicate rather than by each reader's idea of what the record is.

import { spawnSync } from "node:child_process";
import {
  closeSync,
  mkdirSync,
  realpathSync,
  openSync,
  renameSync,
  rmSync,
  writeFileSync,
  writeSync,
  fsyncSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";

import { dumps } from "./pythonJson.ts";

/** git could not be launched at all. Python answers 127 here and so do we. */
export const EXIT_GIT_MISSING = 127;

export interface GitResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface GitBinaryResult {
  readonly code: number;
  readonly stdout: Buffer;
  readonly stderr: string;
}

export interface RunGitOptions {
  /** Extra environment for the child, merged over this process's own. */
  readonly env?: Record<string, string>;
}

/**
 * What every child this router spawns is given, wherever it is spawned from.
 *
 * One fact, and it belongs in one place. A console child of a parent that
 * has no console of its own -- which is exactly what the VS Code extension
 * host is -- gets a console window, and Windows gives that window the
 * foreground. Every git call, every declared check, every probe therefore
 * flashed a `cmd` window in front of the operator and took the caret out of
 * whatever they were typing. Session 65 fixed the two paths in `checks.ts`;
 * these are the rest, and `journal.ts` holds the answer because `checks.ts`
 * imports this module and not the other way round.
 *
 * `checks.spawnOptionsFor` composes this rather than restating it, so there
 * is one answer to "what does this router do to a child process" and not
 * two that agree until the day they do not.
 */
export function hiddenSpawn<T extends object>(base: T): T & { windowsHide: true } {
  return { ...base, windowsHide: true };
}

function spawnGit(
  repoRoot: string,
  args: readonly string[],
  options: RunGitOptions,
  encoding: "utf8" | "buffer",
): { code: number; stdout: string | Buffer; stderr: string } {
  const result = spawnSync("git", ["-C", String(repoRoot), ...args], hiddenSpawn({
    encoding: encoding === "utf8" ? "utf8" : undefined,
    env: options.env ? { ...process.env, ...options.env } : process.env,
    maxBuffer: 256 * 1024 * 1024,
  }));
  if (result.error) {
    return {
      code: EXIT_GIT_MISSING,
      stdout: encoding === "utf8" ? "" : Buffer.alloc(0),
      stderr: "git not available on PATH",
    };
  }
  const stderr =
    typeof result.stderr === "string"
      ? result.stderr
      : (result.stderr as Buffer | null)?.toString("utf8") ?? "";
  return {
    code: result.status ?? EXIT_GIT_MISSING,
    stdout:
      encoding === "utf8"
        ? ((result.stdout as string | null) ?? "")
        : ((result.stdout as Buffer | null) ?? Buffer.alloc(0)),
    stderr: stderr.trim(),
  };
}

/**
 * One git call. stdout drops only its newline framing -- porcelain status
 * columns are positional, and the first line may legitimately begin with a
 * space, so nothing but `\n` is stripped from either end.
 */
export function runGit(
  repoRoot: string,
  args: readonly string[],
  options: RunGitOptions = {},
): GitResult {
  const result = spawnGit(repoRoot, args, options, "utf8");
  return {
    code: result.code,
    stdout: stripNewlines(result.stdout as string),
    stderr: result.stderr,
  };
}

/** The same call, answering with the exact bytes git wrote. */
export function runGitBinary(
  repoRoot: string,
  args: readonly string[],
  options: RunGitOptions = {},
): GitBinaryResult {
  const result = spawnGit(repoRoot, args, options, "buffer");
  return {
    code: result.code,
    stdout: result.stdout as Buffer,
    stderr: result.stderr,
  };
}

function stripNewlines(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && text[start] === "\n") start += 1;
  while (end > start && text[end - 1] === "\n") end -= 1;
  return text.slice(start, end);
}

/** The git toplevel holding `path`, or null outside a repository. */
export function repoRootFor(path: string): string | null {
  const result = runGit(path, ["rev-parse", "--show-toplevel"]);
  return result.code === 0 && result.stdout ? result.stdout : null;
}

/**
 * One path, spelled the way the operating system spells it.
 *
 * `repoRootFor` above answers with GIT's spelling, and a caller's is
 * whatever they were handed -- and Windows hands out several for one
 * directory: the 8.3 short name (`C:\Users\RUNNER~1\...` for
 * `C:\Users\runneradmin\...`), a junction, a mapped drive, another case.
 * Comparing two of them with `relative()` answers `..\alias\docs\sessions`,
 * which is not a containment failure but a spelling one -- and every rule
 * that decides "is this path inside that one" then decides wrongly. That is
 * what made twelve consecutive CI runs red while the same suite was green
 * on a machine whose temp directory has no short name.
 *
 * A path that does not exist cannot be canonicalised, and `resolve` is the
 * honest answer there rather than a refusal: half the callers name an output
 * before anything has written it.
 */
export function canonicalPath(path: string): string {
  try {
    return realpathSync.native(path);
  } catch {
    return resolve(path);
  }
}

/**
 * `target` as `root` sees it: forward slashes, and both sides canonical.
 *
 * The one rule for every comparison that DECIDES something -- what the
 * bookkeeping exclusion skips, which paths a step's report is measured
 * against, whether a path is inside a plan's envelope, whether a verifier's
 * read is inside the repository at all. Formatting a path for a message can
 * use `relative` directly; deciding with it cannot.
 */
export function repoRelativePath(root: string, target: string): string {
  return relative(canonicalPath(root), canonicalPath(target)).replace(/\\/g, "/");
}

// --- The machine-side directory ---------------------------------------------

/** The router's own directory inside a repository. */
export const MACHINE_DIRNAME = ".dabbler";
export const RUNS_DIRNAME = `${MACHINE_DIRNAME}/runs`;

/**
 * True for anything under the router's own `.dabbler/` directory.
 *
 * The one place that decides what is *the record of* a session rather than
 * *the work of* one. A round is appended after the tree snapshot it
 * describes, so counting the ledger as session content makes every verified
 * session look like it drifted the instant it was verified.
 */
export function isMachineStatePath(path: string): boolean {
  let normalized = String(path).replace(/\\/g, "/");
  if (normalized.startsWith("./")) normalized = normalized.slice(2);
  return (
    normalized === MACHINE_DIRNAME ||
    normalized.startsWith(`${MACHINE_DIRNAME}/`)
  );
}

export function machineDir(root: string): string {
  return join(root, MACHINE_DIRNAME);
}

export function runDir(root: string, runId: string): string {
  return join(root, ...RUNS_DIRNAME.split("/"), runId);
}

// --- Trees ------------------------------------------------------------------

/**
 * A tree object capturing tracked AND untracked non-ignored files, via a
 * throwaway index -- the real index and worktree are untouched. Both ends
 * of a fix-delta diff must be snapshots like this one: a tree-vs-worktree
 * diff reports an untracked file as deleted.
 *
 * The machine-side `.dabbler/` directory is dropped unconditionally, so the
 * ledger cannot appear in a snapshot even in a repository that never got
 * the ignore rule (or that committed the ledger before it did).
 */
export function snapshotWorktreeTree(repoRoot: string): string | null {
  const tempIndex = join(tmpdir(), `dabbler-verify-index-${uniqueSuffix()}`);
  const env = { GIT_INDEX_FILE: tempIndex };
  try {
    if (runGit(repoRoot, ["read-tree", "HEAD"], { env }).code !== 0) {
      if (runGit(repoRoot, ["read-tree", "--empty"], { env }).code !== 0) {
        return null;
      }
    }
    if (runGit(repoRoot, ["add", "-A"], { env }).code !== 0) return null;
    // After the add, so it also clears entries inherited from HEAD. The
    // exit code is ignored: `--ignore-unmatch` makes "nothing to drop"
    // the normal case.
    runGit(
      repoRoot,
      ["rm", "--cached", "-r", "-f", "--ignore-unmatch", "-q", "--", MACHINE_DIRNAME],
      { env },
    );
    const written = runGit(repoRoot, ["write-tree"], { env });
    return written.code === 0 && written.stdout ? written.stdout : null;
  } finally {
    rmSync(tempIndex, { force: true });
  }
}

/**
 * Repository-relative paths differing between two trees, or null on a git
 * failure -- callers fail closed.
 */
export function changedPathsBetween(
  repoRoot: string,
  treeA: string,
  treeB: string,
): string[] | null {
  const result = runGit(repoRoot, [
    "diff", "--name-only", "-z", "--no-ext-diff", treeA, treeB,
  ]);
  if (result.code !== 0) return null;
  return result.stdout.split("\0").filter((path) => path !== "");
}

// --- Time -------------------------------------------------------------------

function offsetSuffix(date: Date): string {
  const minutes = -date.getTimezoneOffset();
  const sign = minutes < 0 ? "-" : "+";
  const absolute = Math.abs(minutes);
  const hh = String(Math.floor(absolute / 60)).padStart(2, "0");
  const mm = String(absolute % 60).padStart(2, "0");
  return `${sign}${hh}:${mm}`;
}

function localParts(date: Date): string {
  const pad = (value: number, width = 2): string =>
    String(value).padStart(width, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

/**
 * `datetime.now().astimezone().isoformat(...)` -- local time with an
 * explicit offset. Written only here: an event's clock belongs to the
 * writer, never to its caller.
 *
 * `precision` is the `timespec` the Python twin passes. `milliseconds` is
 * always three digits; `microseconds` is Python's default, which prints six
 * -- and omits the fraction entirely when it is zero, which is what
 * `isoformat()` does and what a naive six-zero pad would get wrong.
 */
export function nowIso(
  precision: "milliseconds" | "microseconds" | "seconds" = "milliseconds",
  date: Date = new Date(),
): string {
  const base = localParts(date);
  const suffix = offsetSuffix(date);
  if (precision === "seconds") return `${base}${suffix}`;
  const millis = date.getMilliseconds();
  if (precision === "milliseconds") {
    return `${base}.${String(millis).padStart(3, "0")}${suffix}`;
  }
  // JavaScript's clock has millisecond resolution, so the microsecond
  // places Python would print are zeros -- and a whole-millisecond value
  // whose microseconds are zero prints no fraction at all in Python.
  if (millis === 0) return `${base}${suffix}`;
  return `${base}.${String(millis).padStart(3, "0")}000${suffix}`;
}

// --- Atomic replace ---------------------------------------------------------

let sequence = 0;

/** Unique within this process, and unique between two of them. */
function uniqueSuffix(): string {
  sequence += 1;
  return `${process.pid}-${sequence}`;
}

/**
 * Temp file plus rename, so a reader sees the old document or the new one
 * and never a half-written middle.
 *
 * The temp name is the target's plus `.tmp-<pid>`, as the Python twin's is:
 * it lands in the same directory, so the rename is on one filesystem and is
 * therefore atomic.
 */
export function atomicWriteJson(path: string, data: unknown): void {
  writeAtomically(path, dumps(data, { indent: 2, ensureAscii: false }) + "\n");
}

export function atomicWriteText(path: string, text: string): void {
  writeAtomically(path, text);
}

/**
 * The bytes, then fsync, then rename.
 *
 * LF endings on every platform: the Python twin opens with `newline="\n"`,
 * so the file it writes on Windows holds LF and this one must too.
 */
function writeAtomically(path: string, body: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp-${process.pid}`;
  const handle = openSync(temp, "w");
  try {
    writeSync(handle, body, null, "utf8");
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
  renameSync(temp, path);
}

/** A whole file, replaced without the fsync -- for text nothing fsyncs today. */
export function writeTextLf(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, { encoding: "utf8" });
}

// --- Line endings -------------------------------------------------------------

/**
 * What Python's TEXT mode does on the way out.
 *
 * `open(path, "w")` with no `newline=` argument translates every `\n` to
 * `os.linesep`, so on Windows the Python router writes CRLF into
 * `sessions.json`, the activity log and every `.dabbler/runs/` JSONL --
 * while the files it opens with `newline="\n"` or `newline=""` keep LF.
 * Node writes the bytes it is given either way.
 *
 * So the translation lives here, once, and every writer whose Python twin
 * takes the default goes through it. The rule is not "the record is CRLF":
 * it is per-file, and getting it wrong in either direction is drift the
 * parity control finds -- as it found this one, on the first run, in the
 * one row of `state-writes.jsonl` the case had just appended.
 */
export function platformNewlines(text: string): string {
  return process.platform === "win32" ? text.replace(/\r?\n/g, "\r\n") : text;
}
