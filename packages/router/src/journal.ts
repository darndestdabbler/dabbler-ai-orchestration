// The git seam.
//
// The router spawns git here and nowhere else, so anything that must see
// every git call -- instrumentation, a spawn budget, an error policy --
// has one place to sit. `binary` is a mode of the one call rather than a
// second call: a blob's bytes are what a hash is taken over, and the
// newline framing that is noise in porcelain is content there.
//
// Session 26 ports the rest of this module: the append-only run journal,
// the lock, the worktree snapshots. What is here is the slice `config`
// needs to find the repository it belongs to, ported at its seam rather
// than copied into `config` -- a second `git rev-parse` in this package
// is exactly the drift the port exists to remove.

import { spawnSync } from "node:child_process";

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

function spawnGit(
  repoRoot: string,
  args: readonly string[],
  options: RunGitOptions,
  encoding: "utf8" | "buffer",
): { code: number; stdout: string | Buffer; stderr: string } {
  const result = spawnSync("git", ["-C", String(repoRoot), ...args], {
    encoding: encoding === "utf8" ? "utf8" : undefined,
    env: options.env ? { ...process.env, ...options.env } : process.env,
    maxBuffer: 256 * 1024 * 1024,
  });
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
