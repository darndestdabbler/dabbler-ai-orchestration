import { describe, expect, it } from "vitest";

import { WORKERS_CI, WORKERS_LOCAL, workerCap } from "../vitest.config.ts";

describe("the suite's worker pool", () => {
  it("is one worker in CI and a small fixed pool anywhere else", () => {
    // A runner with two cores cannot absorb a fork per core; a developer's
    // host must stay usable while the run of record is taken.
    expect(workerCap({ CI: "true" })).toBe(WORKERS_CI);
    expect(WORKERS_CI).toBe(1);
    expect(workerCap({})).toBe(WORKERS_LOCAL);
    // Pinned rather than bounded: the value is the operator's call, made
    // after a four-worker run of record took the host with it.
    expect(WORKERS_LOCAL).toBe(2);
  });
});
