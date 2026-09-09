// The framework's long work, started detached and collected later.
//
// One job, walked: started, polled as running, polled as exited with the
// code it ended on, its output kept. Then the two ways a tree is left
// behind -- a job ended from a process that never held it, and a command
// that failed after starting a helper it never waited for.
//
// Real children on real detached processes, and the one walkthrough that
// keeps them. `jobs.setJobStarter` lets a walk run the framework's long work
// in this process instead (`test/support/inProcessJobs.ts`, installed by
// `walk-session`), which is right where a test is about the ORDER of the
// phases. It is wrong here: what this file is about is what happens across
// a process boundary -- a detached runner, a pid that outlives the process
// that started it, a tree that must still be killable, a priority class the
// child inherits -- and none of that is true of a function call. A stubbed
// spawn would test the stub.
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { constants, getPriority, setPriority } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { endJob, pollJob, startJob } from "../src/jobs.ts";
import { tempDir } from "./support/answers.ts";

/** Poll until the job leaves `running`, or give up loudly. */
async function settle(
  repoRoot: string,
  job: Parameters<typeof pollJob>[1],
): Promise<ReturnType<typeof pollJob>> {
  const deadline = Date.now() + 20_000;
  for (;;) {
    const state = pollJob(repoRoot, job);
    if (state.state !== "running") return state;
    if (Date.now() > deadline) throw new Error("the job never left `running`");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** Wait for a process to be gone, or say which one outlived what. */
async function waitGone(pid: number, what: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }
    if (Date.now() > deadline) throw new Error(`${pid} outlived ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/** Wait for a child to report a pid it forked. */
async function reportedPid(path: string): Promise<number> {
  const deadline = Date.now() + 20_000;
  while (!existsSync(path)) {
    if (Date.now() > deadline) throw new Error(`nothing ever reported to ${path}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return Number(readFileSync(path, "utf8"));
}

/** The OS priority a job's own command reports for itself. */
async function reportedPriority(repoRoot: string, sessionNumber: number): Promise<number> {
  const job = startJob(repoRoot, sessionNumber, {
    name: "run of record",
    argv: [
      process.execPath,
      "-e",
      "process.stdout.write(String(require('node:os').getPriority()))",
    ],
    retryAfterSeconds: 30,
  });
  const exited = await settle(repoRoot, job);
  assert.equal(exited.state, "exited");
  return Number(readFileSync(join(repoRoot, job.log), "utf8").trim());
}

describe("the machine a job runs on", () => {
  it("runs the command below normal, and leaves it where it found it under CI", async () => {
    // From the class a spawned child REPORTS, not from the source: the
    // policy being right is worth nothing if the runner stops applying it,
    // and that is the half that went missing for twenty-five sessions one
    // layer down.
    //
    // This worker is already below normal (`no-git.ts`) and a child would
    // inherit that, so the assertion would pass on a job that does nothing.
    // It stands the worker back up at normal for the duration -- which is
    // what a driver run from a terminal is -- and puts it back afterwards.
    const repoRoot = tempDir("jobs-");
    const worker = getPriority();
    const ci = process.env["CI"];
    try {
      setPriority(constants.priority.PRIORITY_NORMAL);
    } catch {
      // Denied the raise: the assertions are relative to what the parent
      // actually is, so they still hold, they just prove less.
    }
    const parent = getPriority();
    try {
      delete process.env["CI"];
      const yielded = await reportedPriority(repoRoot, 64);
      process.env["CI"] = "1";
      const onCi = await reportedPriority(repoRoot, 65);

      // Higher is lower on Node's scale, and the policy is "at least below
      // normal" rather than "lower than the parent": a runner that already
      // hands every process 10 is below normal, and nothing here raises it.
      assert.ok(
        yielded >= Math.max(parent, constants.priority.PRIORITY_BELOW_NORMAL),
        `a job's command reported ${String(yielded)} where a parent at ${String(parent)} ` +
          "should have yielded it to below normal",
      );
      assert.equal(onCi, parent, "a job changed its priority under CI, where nobody is typing");
    } finally {
      if (ci === undefined) delete process.env["CI"];
      else process.env["CI"] = ci;
      try {
        setPriority(worker);
      } catch {
        // The worker runs at whatever the platform gives it.
      }
    }
  });
});

describe("one job, from start to collection", () => {
  it("polls as running, then as exited with its code, and keeps its output", async () => {
    const repoRoot = tempDir("jobs-");
    // The child holds until this file appears, so "running" is a fact
    // rather than a race with the scheduler.
    const gate = join(repoRoot, "gate");

    const job = startJob(repoRoot, 61, {
      name: "verification round 1",
      argv: [
        process.execPath,
        "-e",
        "const fs = require('node:fs');" +
          "process.stdout.write('the round is running\\n');" +
          "process.stdout.write('driven=' + process.env.DABBLER_DRIVEN + '\\n');" +
          "const wait = () => (fs.existsSync(process.argv[1]) ? process.exit(3) : setTimeout(wait, 25));" +
          "wait();",
        gate,
      ],
      retryAfterSeconds: 30,
    });

    assert.ok(job.pid > 0);
    assert.equal(job.retry_after_seconds, 30);
    assert.ok(job.log.startsWith(".dabbler/runs/"));
    assert.deepEqual(pollJob(repoRoot, job), { state: "running" });

    writeFileSync(gate, "", "utf8");
    const exited = await settle(repoRoot, job);
    assert.equal(exited.state, "exited");
    assert.equal(exited.state === "exited" ? exited.exitCode : null, 3);
    // The runner stamps when it wrote the status; the uncollected-job row
    // reads that stamp back.
    assert.match(String(exited.state === "exited" ? exited.endedAt : ""), /^\d{4}-\d{2}-\d{2}T/);

    const logged = readFileSync(join(repoRoot, job.log), "utf8");
    assert.match(logged, /the round is running/);
    // Every job the driver starts is marked, and the mark reaches the verb
    // through the runner: that is how `verify` knows the driver runs the
    // rest.
    assert.match(logged, /driven=1/);
    assert.ok(existsSync(join(repoRoot, job.status)));
  });
});

describe("what a job leaves behind", () => {
  it("ends a running job and everything under it, from a process that never held it", async () => {
    // A job is started by one router process and collected by another, so
    // the record's pid is all the ending process has. The verb the job runs
    // forks -- here a grandchild that reports its pid -- and a job that is
    // abandoned must take that fork with it: the trees found squatting on
    // the operator's machine were never the runner, they were what it ran.
    const repoRoot = tempDir("jobs-");
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
    const grandchild = await reportedPid(pidFile);
    assert.deepEqual(pollJob(repoRoot, job), { state: "running" });

    endJob(job);

    assert.notEqual((await settle(repoRoot, job)).state, "running");
    await waitGone(grandchild, "the job that was ended");
  });

  it("reaps what a failed command left running before it records the result", async () => {
    // The other way a tree is left behind: the command ends badly after
    // starting a helper it never waited for. The status must carry the
    // command's own code -- it said what happened -- and the helper must be
    // gone by the time that status can be read. A command that exited zero
    // is not walked (the walk costs the machine more than a leaked helper
    // does), so the command here fails on purpose.
    //
    // The helper is detached on Windows and not on POSIX, because that is
    // the helper that outlives its parent on each: libuv puts a Windows
    // child in a job object that dies with the parent unless it is
    // detached, and a POSIX child stays in the runner's group unless it is.
    const repoRoot = tempDir("jobs-");
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
    const exited = await settle(repoRoot, job);
    assert.equal(exited.state, "exited");
    assert.equal(exited.state === "exited" ? exited.exitCode : null, 2);
    await waitGone(Number(readFileSync(pidFile, "utf8")), "its collected job");
    assert.match(readFileSync(join(repoRoot, job.log), "utf8"), /ended 1 process\(es\)/);
  });
});
