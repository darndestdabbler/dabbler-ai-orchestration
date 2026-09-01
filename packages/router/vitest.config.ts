import { defineConfig } from "vitest/config";

// Ten of the suite's files fork real `git` and `node` processes, and vitest's
// default pool is one worker per logical core. That pins a twenty-core host
// for the whole run and is a fork storm on a two-core CI runner, so the pool
// is capped here, in the config the suite command already reads; the command
// in `dabbler.yaml` does not change.
//
// Measured on the twenty-core host, whole suite: 20 workers 94 s wall for
// 873 s of test time, 4 workers 106 s for 352 s, 2 workers 138 s for 262 s.
// Twenty is contention, not speed.
//
// Two rather than four, on the operator's call: a four-worker run of record
// during session 66 made the host unusable and had to be killed, which costs
// the whole run rather than the difference between the two numbers. Two is a
// third more wall clock -- 138 s against 106 s -- and that is what a machine
// the operator can still type on costs.
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
  },
});
