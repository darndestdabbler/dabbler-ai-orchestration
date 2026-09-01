// The framework's long work, started detached and collected later. One
// test, because there is one behaviour: a job that is running polls as
// running, a job that is done polls as done with the code it exited on,
// and what it printed is in its log. A real child on a real detached
// process -- the whole point of the module is what happens across process
// boundaries, and a stubbed spawn would test the stub.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, expect, it } from "vitest";

import { pollJob, startJob } from "../src/jobs.ts";

import { makeTempDir, removeTempDirs } from "./support/fixtures.ts";

afterAll(removeTempDirs);

/** Poll until the job leaves `running`, or give up loudly. */
async function settle(repoRoot: string, job: Parameters<typeof pollJob>[1]) {
  const deadline = Date.now() + 20_000;
  for (;;) {
    const state = pollJob(repoRoot, job);
    if (state.state !== "running") return state;
    if (Date.now() > deadline) throw new Error("the job never left `running`");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

it("polls a detached job as running, then as exited with its code, and keeps its output", async () => {
  const repoRoot = makeTempDir();
  // The child holds until this file appears, so "running" is a fact rather
  // than a race with the scheduler.
  const gate = join(repoRoot, "gate");

  const job = startJob(repoRoot, 61, {
    name: "verification round 1",
    argv: [
      process.execPath,
      "-e",
      "const fs = require('node:fs');" +
        "process.stdout.write('the round is running\\n');" +
        "const wait = () => (fs.existsSync(process.argv[1]) ? process.exit(3) : setTimeout(wait, 25));" +
        "wait();",
      gate,
    ],
    retryAfterSeconds: 30,
  });

  expect(job.pid).toBeGreaterThan(0);
  expect(job.retry_after_seconds).toBe(30);
  expect(job.log.startsWith(".dabbler/runs/")).toBe(true);
  expect(pollJob(repoRoot, job)).toEqual({ state: "running" });

  writeFileSync(gate, "");
  expect(await settle(repoRoot, job)).toEqual({ state: "exited", exitCode: 3 });

  expect(readFileSync(join(repoRoot, job.log), "utf8")).toContain("the round is running");
  expect(existsSync(join(repoRoot, job.status))).toBe(true);
});
