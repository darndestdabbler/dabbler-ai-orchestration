import { constants, getPriority } from "node:os";

import { describe, expect, it } from "vitest";

import { WORKERS_CI, WORKERS_LOCAL, workerCap } from "../vitest.config.ts";

describe("the suite's worker pool", () => {
  it("is one worker in CI and a bounded pool anywhere else", () => {
    // A runner with two cores cannot absorb a fork per core; a developer's
    // host must stay usable while the run of record is taken.
    expect(workerCap({ CI: "true" })).toBe(WORKERS_CI);
    expect(WORKERS_CI).toBe(1);
    expect(workerCap({})).toBe(WORKERS_LOCAL);
    expect(WORKERS_LOCAL).toBeGreaterThan(WORKERS_CI);
  });

  it("runs every worker below the operator's priority", () => {
    // This test IS a worker: the setup file lowered this process before the
    // file was collected, and the class is inherited by every `git` and
    // `node` the suite forks. The behaviour, not the config's text -- the
    // count can rise only because the pool yields.
    expect(getPriority()).toBeGreaterThanOrEqual(constants.priority.PRIORITY_BELOW_NORMAL);
  });
});
