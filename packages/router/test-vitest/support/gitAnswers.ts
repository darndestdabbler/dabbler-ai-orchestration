// Recorded git answers, fed through the `journal.runGit` seam.
//
// A test declares the answers git would have given and asserts the decision
// the router makes from them: input and output, no processes. The contract
// band (`test/gitContract.test.ts`) is where the real binary's behavior is
// pinned; here that behavior is quoted back. An unfed question is a loud
// failure -- a table that silently answered something it never declared
// would prove nothing about the caller.

import { afterEach } from "vitest";

import { setGitSource, type RunGitOptions } from "../../src/journal.ts";

/** A prefix of the argv after `git -C <root>`, or a predicate over it. */
export type ArgsPattern =
  | readonly string[]
  | ((args: readonly string[], repoRoot: string) => boolean);

export interface RecordedAnswer {
  readonly code?: number;
  readonly stdout?: string;
  /** For `runGitBinary` callers; wins over `stdout` when both are given. */
  readonly bytes?: Buffer;
  readonly stderr?: string;
}

export type AnswerRow = readonly [
  ArgsPattern,
  RecordedAnswer | ((args: readonly string[], repoRoot: string) => RecordedAnswer),
];

function matches(pattern: ArgsPattern, args: readonly string[], repoRoot: string): boolean {
  if (typeof pattern === "function") return pattern(args, repoRoot);
  if (pattern.length > args.length) return false;
  return pattern.every((token, index) => token === args[index]);
}

let restore: (() => void) | null = null;
let calls: Array<{ repoRoot: string; args: readonly string[] }> = [];

// One registration at import time: whatever table a test installed is gone
// before the next test asks anything.
afterEach(() => {
  if (restore) restore();
  restore = null;
  calls = [];
});

/**
 * Install a table of recorded answers. First matching row wins; a call no
 * row matches throws with the argv, so the missing answer names itself.
 * Repeated calls replace the table; the seam restores after each test.
 */
export function gitAnswers(table: ReadonlyArray<AnswerRow>): void {
  if (restore) restore();
  calls = [];
  restore = setGitSource(
    (
      repoRoot: string,
      args: readonly string[],
      _options: RunGitOptions,
      encoding: "utf8" | "buffer",
    ) => {
      calls.push({ repoRoot, args });
      for (const [pattern, answer] of table) {
        if (!matches(pattern, args, repoRoot)) continue;
        const resolved = typeof answer === "function" ? answer(args, repoRoot) : answer;
        const stdout =
          encoding === "buffer"
            ? resolved.bytes ?? Buffer.from(resolved.stdout ?? "", "utf8")
            : resolved.stdout ?? "";
        return {
          code: resolved.code ?? 0,
          stdout,
          stderr: resolved.stderr ?? "",
        };
      }
      throw new Error(
        `no recorded git answer for: git -C ${repoRoot} ${args.join(" ")} -- ` +
          "add the row this test's subject needs, or use the contract band if " +
          "the real binary's behavior is the subject.",
      );
    },
  );
}

/** The questions asked so far under the installed table, oldest first. */
export function gitQuestions(): ReadonlyArray<{ repoRoot: string; args: readonly string[] }> {
  return calls;
}
