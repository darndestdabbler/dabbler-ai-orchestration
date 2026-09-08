// A preload for `node --test --import`: outside a walkthrough, spawning git
// is a test failure.
//
// Every git question the framework asks goes through `journal.setGitSource`,
// and a test that is not about git feeds the answer through
// `test/support/answers.ts` instead of building a repository to ask a live
// one. This file is what makes that a rule rather than a habit. In a worker
// whose entry file is not one of the walkthroughs DECLARED below, a spawn
// of `git` -- by the framework's seam, by `test/support/repo.ts`, by
// anything -- throws with the test file and the argv, so the test that
// reached a real git names itself. The walkthroughs keep their real
// repositories, because `walk-git-states` is ABOUT git and mocking it
// would test the mock.
//
// The wrappers are installed on the CommonJS module object and the ESM
// bindings are re-synced, so `import { spawnSync } from "node:child_process"`
// in the framework sees the guarded function and not the original.

import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { constants, setPriority } from "node:os";
import { basename } from "node:path";

/**
 * The test files permitted to build real git repositories. Nothing else may.
 *
 * A LIST and not a pattern, and that is the whole point of it. This was
 * `/^walk-.*\.test\.ts$/` from session 96 to 122, which meant the exemption
 * admitted whatever anyone named correctly: six files when the guard was
 * written, eight by session 121, each one inheriting the licence to spawn
 * git and a full CLI child per job without a soul deciding it should. The
 * suite went from 17 s to 157 s over that stretch while the test count
 * moved only 1137 to 1144, and the operator's machine went with it.
 *
 * So a ninth walkthrough is an edit here, next to the reason the list
 * exists, and `check-suite-cost.ts` fails the lint control while this list
 * and the `walk-*.test.ts` files on disk disagree in either direction. The
 * question to answer before adding one is not "is it named right" but "does
 * this test need a real repository at all" -- `journal.setGitSource` and
 * `test/support/answers.ts` are how the other three hundred files do
 * without.
 */
const WALKTHROUGHS: readonly string[] = [
  "walk-bootstrap.test.ts",
  "walk-checkout.test.ts",
  "walk-git-states.test.ts",
  "walk-impact.test.ts",
  "walk-jobs.test.ts",
  "walk-record.test.ts",
  "walk-session.test.ts",
  "walk-verify.test.ts",
];

const entry = process.argv[1] ?? "";
const walkthrough = WALKTHROUGHS.includes(basename(entry));

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

// --- Yielding to the operator -------------------------------------------------

/**
 * The OS priority a test worker runs at, or `null` to leave it alone.
 *
 * `node --test` runs one worker per CPU -- nineteen on the operator's host --
 * and the walkthroughs spawn git and whole CLI children beneath that. At
 * normal priority the suite competes with the operator's own keyboard, which
 * is the complaint that produced this session; session 67 recorded the trade
 * in the other direction and took it deliberately ("a third more wall clock
 * buys a machine the operator can still type on"). Under CI there is nobody
 * to yield to and the runner owns the box, so nothing is changed there.
 *
 * This policy existed from session 76 and was DELETED as collateral: it lived
 * in a vitest setup file, and session 88 retired vitest and removed
 * `vitest.config.ts` with it. Nothing carried it into the `node --test`
 * rebuild, and no test noticed for twenty-five sessions. It lives in the
 * preload now because the preload is the one file every worker loads, and
 * `check-suite-cost.ts` audits it from the lint control so a second silent
 * lapse is not possible.
 */
export function workerPriority(env: NodeJS.ProcessEnv): number | null {
  const ci = env["CI"];
  if (ci !== undefined && ci !== "" && ci !== "0" && ci !== "false") return null;
  return constants.priority.PRIORITY_BELOW_NORMAL;
}

// Best-effort, and deliberately so: a platform or a container that refuses
// the call has denied a courtesy, not broken a test. The suite must run.
const priority = workerPriority(process.env);
if (priority !== null) {
  try {
    setPriority(priority);
  } catch {
    // Nothing to say and nothing to do: the worker runs at whatever the
    // platform gives it.
  }
}
