import { defineConfig } from "vitest/config";

// Ten of the suite's files fork real `git` and `node` processes, and vitest's
// default pool is one worker per logical core. That pins a twenty-core host
// for the whole run and is a fork storm on a two-core CI runner, so the pool
// is capped here, in the config the suite command already reads; the command
// in `dabbler.yaml` does not change.
//
// Measured 2026-09-02 on the twenty-core host, whole suite, every worker at
// below-normal priority (`test/support/priority.ts`), one run per count, a
// normal-priority probe spawning a trivial `node` every two seconds beside
// each run as the keyboard's proxy (idle: p50 76 ms, p95 128 ms):
//
//   workers   wall     test time   probe p50 / p95
//      2      702 s     1384 s      134 / 232 ms
//      4      705 s     2256 s      206 / 306 ms
//      8      717 s     3500 s      292 / 453 ms
//
// More workers buy nothing. The wall clock is one file's critical path --
// the longest files run for minutes each, forking `git` throughout -- and
// every worker added past two only contends for the same disk and process
// table: test time balloons while the wall clock stands still, and the
// probe says the keyboard pays for it. The earlier claim here (138 s at two
// workers) was stale by a factor of five; the recorded runs of record were
// already 590-698 s. Two stays, on the numbers rather than on the
// session-66 incident alone: D256 amends session 76's plan item from "raise
// to the highest usable count" to the highest count the measurement
// supports. The operator's own feel of the machine was not sampled in that
// session -- the probe stood in for it -- and their confirmation of the
// count is owed; session 77 attacks the critical path itself.
//
// Session 77's attack, measured 2026-09-02: the `journal.runGit` seam plus
// recorded answers (`test/support/gitAnswers.ts`) and a 15-test contract
// band (`test/gitContract.test.ts`). Repo-builder call sites 240 -> 124;
// every survivor is the contract band, a kept-real file whose head comment
// says why, or outside the six files converted. Whole suite: 763 s wall
// the session before (run of record, loaded machine) -> 649 s wall /
// 1267 s test time after, same two workers. The residue is CONCENTRATED,
// not smeared: drive.test.ts holds 647 s of the 1267 -- half the suite in
// one file, driving whole sessions with real engine and job children --
// then gates (150 s) and packaging (96 s). Those are process-real by
// design; making them cheap is boundary work (the sealed-library sessions),
// not fixture work, and no worker count changes a critical path this
// shape.
//
// 2026-09-03, the operator's ruling: the cost that matters is not the wall
// clock but the machine. A run at two workers left the keyboard unusable for
// fifteen minutes -- not CPU, which never passed half, but thousands of
// short-lived `git`, `node` and `powershell` processes, each paying creation
// and antivirus inspection. So the suite is now two tiers. This config, the
// default `vitest run` and the command `dabbler.yaml` names as the ordinary
// suite, runs every file that spawns nothing. `vitest.integration.config.ts`
// runs the files listed below -- the ones that build repositories, spawn
// processes or drive sessions -- and is the expensive suite CI runs on every
// push and the framework runs at close. A developer who wants the whole
// thing runs both, on purpose, when the keyboard is not needed.
export const WORKERS_LOCAL = 2;
export const WORKERS_CI = 1;

/**
 * The integration tier: every file that spawns a process. Membership is by
 * what the file does, not how long it takes -- a file that builds one
 * repository belongs here even when it is quick, because the rule the
 * default tier keeps is "nothing forks", and a rule with a threshold is a
 * rule that drifts.
 */
export const INTEGRATION_FILES: readonly string[] = [
  "bootstrap.test.ts",
  "checks.test.ts",
  "config.test.ts",
  "detectPackaging.test.ts",
  "drive.test.ts",
  "driver.test.ts",
  "engines.test.ts",
  "inProcess.test.ts",
  "jobs.test.ts",
  "lifecycle.test.ts",
  "lifecycleCli.test.ts",
  "packaging.test.ts",
  "release.test.ts",
  "solutionDeps.test.ts",
  "testphase.test.ts",
  "workflow.test.ts",
];

/** The worker cap for the environment the suite runs in. */
export function workerCap(env: NodeJS.ProcessEnv = process.env): number {
  return env["CI"] ? WORKERS_CI : WORKERS_LOCAL;
}

/** The pool both tiers share: bounded workers, every one below normal priority. */
export function poolFor(env: NodeJS.ProcessEnv = process.env): {
  minWorkers: number;
  maxWorkers: number;
  setupFiles: string[];
} {
  const workers = workerCap(env);
  return {
    // Both bounds. vitest defaults the minimum to the core count, and a
    // minimum above the maximum is not a smaller pool.
    minWorkers: workers,
    maxWorkers: workers,
    // Every worker, and so everything a worker forks, runs below normal
    // priority: the operator's keyboard comes first.
    setupFiles: ["./test-vitest/support/priority.ts"],
  };
}

// From session 83 the vitest files live under `test-vitest/`, and `test/` is
// Node's own runner (`node --test`): the two never see each other's files.
// Every session of the rebuild rewrites one area into `test/` and deletes
// what it replaced here; session 88 deletes this config with the last of it.
export const VITEST_DIR = "test-vitest";

export default defineConfig({
  test: {
    ...poolFor(),
    include: [`${VITEST_DIR}/**/*.test.ts`],
    exclude: ["**/node_modules/**", ...INTEGRATION_FILES.map((name) => `${VITEST_DIR}/${name}`)],
    // A targeted run naming only integration files (`dabbler affected`
    // narrows the suite command to changed test files) finds nothing in
    // this tier, and that is not a red run: the integration suite runs the
    // same files under its own config.
    passWithNoTests: true,
  },
});
