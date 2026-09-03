// Recorded git answers through the `journal.runGit` seam, and a temp
// directory for records that live on disk without a repository.
//
// A test that asks the framework a question whose answer comes from git
// declares what git would have said and asserts the decision made from it:
// no process, no checkout. An unfed question throws with its argv, so a
// missing answer names itself rather than passing for the wrong reason.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { setGitSource, type RunGitOptions } from "../../src/journal.ts";

const ROOT = join(tmpdir(), "dabbler-router-tests");

/** A fresh directory under the suite's one temp root. */
export function tempDir(prefix = "t-"): string {
  mkdirSync(ROOT, { recursive: true });
  return mkdtempSync(join(ROOT, prefix));
}

/** Write files under `root`, creating directories as needed. */
export function seed(root: string, files: Record<string, string>): void {
  for (const [rel, text] of Object.entries(files)) {
    const path = join(root, ...rel.split("/"));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text, "utf8");
  }
}

export type ArgsPattern =
  | readonly string[]
  | ((args: readonly string[], repoRoot: string) => boolean);

export interface Answer {
  readonly code?: number;
  readonly stdout?: string;
  readonly bytes?: Buffer;
  readonly stderr?: string;
}

export type AnswerRow = readonly [ArgsPattern, Answer | ((args: readonly string[], repoRoot: string) => Answer)];

function matches(pattern: ArgsPattern, args: readonly string[], repoRoot: string): boolean {
  if (typeof pattern === "function") return pattern(args, repoRoot);
  return pattern.length <= args.length && pattern.every((token, index) => token === args[index]);
}

/**
 * Install a table of answers; first matching row wins. Returns the function
 * that restores the real git, which a test calls when it is done (or never,
 * for a file that answers the same way throughout).
 */
export function gitAnswers(table: ReadonlyArray<AnswerRow>): () => void {
  return setGitSource(
    (repoRoot: string, args: readonly string[], _options: RunGitOptions, encoding: "utf8" | "buffer") => {
      for (const [pattern, answer] of table) {
        if (!matches(pattern, args, repoRoot)) continue;
        const resolved = typeof answer === "function" ? answer(args, repoRoot) : answer;
        const stdout =
          encoding === "buffer"
            ? (resolved.bytes ?? Buffer.from(resolved.stdout ?? "", "utf8"))
            : (resolved.stdout ?? "");
        return { code: resolved.code ?? 0, stdout, stderr: resolved.stderr ?? "" };
      }
      throw new Error(`no recorded git answer for: git ${args.join(" ")} (in ${repoRoot})`);
    },
  );
}

/** The answers a state directory's writers ask for: the root, and a clean tree. */
export function cleanRepoAnswers(repo: string): () => void {
  return gitAnswers([
    [["rev-parse", "--show-toplevel"], { stdout: repo.split("\\").join("/") }],
    [["status", "--porcelain", "-uall"], { stdout: "" }],
    [["status", "--porcelain"], { stdout: "" }],
    [(args) => args[0] === "cat-file" && args[1] === "-e", { code: 0 }],
    [["commit-tree"], { stdout: "c".repeat(40) }],
    [["update-ref"], { code: 0 }],
  ]);
}
