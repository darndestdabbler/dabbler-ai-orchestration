// A preload for `node --test --import`: outside a walkthrough, spawning git
// is a test failure.
//
// Every git question the framework asks goes through `journal.setGitSource`,
// and a test that is not about git feeds the answer through
// `test/support/answers.ts` instead of building a repository to ask a live
// one. This file is what makes that a rule rather than a habit. In a worker
// whose entry file is not a `walk-*.test.ts`, a spawn of `git` -- by the
// framework's seam, by `test/support/repo.ts`, by anything -- throws with
// the test file and the argv, so the test that reached a real git names
// itself. The five walkthroughs keep their real repositories, because
// `walk-git-states` is ABOUT git and mocking it would test the mock.
//
// The wrappers are installed on the CommonJS module object and the ESM
// bindings are re-synced, so `import { spawnSync } from "node:child_process"`
// in the framework sees the guarded function and not the original.

import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { basename } from "node:path";

const entry = process.argv[1] ?? "";
const walkthrough = /^walk-[^\\/]*\.test\.ts$/.test(basename(entry));

type Spawner = (...args: unknown[]) => unknown;

function isGit(command: unknown): boolean {
  const name = basename(String(command)).toLowerCase();
  return name === "git" || name === "git.exe";
}

function refuse(command: unknown, args: unknown): void {
  if (!isGit(command)) return;
  const argv = Array.isArray(args) ? args.map(String).join(" ") : "";
  throw new Error(
    `git spawned outside a walkthrough by ${entry || "<no entry file>"}: git ${argv}` +
      " -- feed the answer through journal.setGitSource (test/support/answers.ts)" +
      " or move the test into a walk-*.test.ts file",
  );
}

/** The same function, refusing git before it runs. */
function guarded<T>(fn: T): T {
  const wrapped = (...args: unknown[]): unknown => {
    refuse(args[0], args[1]);
    return (fn as unknown as Spawner)(...args);
  };
  return wrapped as unknown as T;
}

/** The string forms take the command line whole; its first word is the program. */
function guardedShell<T>(fn: T): T {
  const wrapped = (...args: unknown[]): unknown => {
    refuse(String(args[0]).trim().split(/\s+/)[0], []);
    return (fn as unknown as Spawner)(...args);
  };
  return wrapped as unknown as T;
}

if (!walkthrough) {
  childProcess.spawnSync = guarded(childProcess.spawnSync);
  childProcess.spawn = guarded(childProcess.spawn);
  childProcess.execFileSync = guarded(childProcess.execFileSync);
  childProcess.execFile = guarded(childProcess.execFile);
  childProcess.execSync = guardedShell(childProcess.execSync);
  childProcess.exec = guardedShell(childProcess.exec);
  syncBuiltinESMExports();
}
