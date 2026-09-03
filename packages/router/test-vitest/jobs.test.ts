// The framework's long work, started detached and collected later. One
// test, because there is one behaviour: a job that is running polls as
// running, a job that is done polls as done with the code it exited on,
// and what it printed is in its log. A real child on a real detached
// process -- the whole point of the module is what happens across process
// boundaries, and a stubbed spawn would test the stub.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, expect, it } from "vitest";

import { endJob, pollJob, startJob } from "../src/jobs.ts";

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

it("ends a running job and everything under it, from a process that never held it", async () => {
  // A job is started by one router process and collected by another, so
  // the record's pid is all the ending process has. The verb the job runs
  // forks -- here a grandchild that reports its pid -- and a job that is
  // abandoned must take that fork with it: the trees found squatting on the
  // operator's machine were never the runner, they were what it ran.
  const repoRoot = makeTempDir();
  const pidFile = join(repoRoot, "grandchild.pid");
  const job = startJob(repoRoot, 62, {
    name: "the complete suite",
    argv: [
      process.execPath,
      "-e",
      "const { spawn } = require('node:child_process');" +
        "const g = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });" +
        "require('node:fs').writeFileSync(process.argv[1], String(g.pid));" +
        "setInterval(() => {}, 1000);",
      pidFile,
    ],
    retryAfterSeconds: 30,
  });
  const deadline = Date.now() + 20_000;
  while (!existsSync(pidFile)) {
    if (Date.now() > deadline) throw new Error("the grandchild never reported");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const grandchild = Number(readFileSync(pidFile, "utf8"));
  expect(pollJob(repoRoot, job)).toEqual({ state: "running" });

  endJob(job);

  expect((await settle(repoRoot, job)).state).not.toBe("running");
  const gone = Date.now() + 10_000;
  for (;;) {
    try {
      process.kill(grandchild, 0);
    } catch {
      break;
    }
    if (Date.now() > gone) throw new Error(`the grandchild ${grandchild} outlived the job`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
});

it("reaps what a failed command left running before it records the result", async () => {
  // The other way a tree is left behind: the command ends badly after
  // starting a helper it never waited for. The status must carry the
  // command's own code -- it said what happened -- and the helper must be
  // gone by the time that status can be read. A command that exited zero is
  // not walked (the walk costs the machine more than a leaked helper does),
  // so the command here fails on purpose.
  //
  // The helper is detached on Windows and not on POSIX, because that is
  // the helper that outlives its parent on each: libuv puts a Windows
  // child in a job object that dies with the parent unless it is
  // detached, and a POSIX child stays in the runner's group unless it is.
  const repoRoot = makeTempDir();
  const pidFile = join(repoRoot, "helper.pid");
  const job = startJob(repoRoot, 63, {
    name: "verification round 2",
    argv: [
      process.execPath,
      "-e",
      "const { spawn } = require('node:child_process');" +
        "const h = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], " +
        "{ stdio: 'ignore', detached: process.platform === 'win32' });" +
        "h.unref();" +
        "require('node:fs').writeFileSync(process.argv[1], String(h.pid));" +
        "process.exit(2);",
      pidFile,
    ],
    retryAfterSeconds: 30,
  });
  expect(await settle(repoRoot, job)).toEqual({ state: "exited", exitCode: 2 });
  const helper = Number(readFileSync(pidFile, "utf8"));
  const gone = Date.now() + 10_000;
  for (;;) {
    try {
      process.kill(helper, 0);
    } catch {
      break;
    }
    if (Date.now() > gone) throw new Error(`the helper ${helper} outlived its collected job`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  expect(readFileSync(join(repoRoot, job.log), "utf8")).toContain("ended 1 process(es)");
});
