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
export const WORKERS_LOCAL = 2;
export const WORKERS_CI = 1;

/** The worker cap for the environment the suite runs in. */
export function workerCap(env: NodeJS.ProcessEnv = process.env): number {
  return env["CI"] ? WORKERS_CI : WORKERS_LOCAL;
}

const workers = workerCap();

export default defineConfig({
  test: {
    // Both bounds. vitest defaults the minimum to the core count, and a
    // minimum above the maximum is not a smaller pool.
    minWorkers: workers,
    maxWorkers: workers,
    // Every worker, and so everything a worker forks, runs below normal
    // priority: the operator's keyboard comes first, and the count above
    // can be raised because it does.
    setupFiles: ["./test/support/priority.ts"],
  },
});
