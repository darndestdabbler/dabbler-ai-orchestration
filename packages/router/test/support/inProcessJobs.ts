// The framework's own long work, run in this process instead of a child.
//
// A driver job re-enters the router (`selfArgv`), so every verification
// round, every suite of the run of record and every close costs a node boot
// and a full CLI module graph -- about a second and a half, and two
// processes -- to reach code this worker has already loaded. Session 96 made
// the same move one layer down with `journal.setGitSource`: the walkthroughs
// that are not ABOUT spawning a child stopped paying for one.
//
// What is NOT changed is the shape of a job. The record `run.json` carries,
// the log, the status file and the moment each appears are what
// `spawnDetachedJob` writes, so the driver still starts a job, polls it,
// issues a `wait`, and collects an exit code from a file. A walkthrough
// that stopped waiting would have stopped testing the wait.
//
// The work runs from `settleJobs`, which the walkthrough calls where it
// would otherwise sleep, and NEVER on its own: one process has one output
// buffer (`capture` refuses to nest) and one working directory
// (`standIn` refuses to nest), so a job running while the driver runs would
// interleave two verbs' output into one instruction. The walkthrough's loop
// is `next` -> settle -> `next`, and nothing is ever in flight twice.
//
// `test/walk-jobs.test.ts` does not install this: it is the test ABOUT the
// child boundary -- a detached runner, a pid that outlives its parent, a
// tree that must be killable -- and none of that is true of a function call.

import { renameSync, writeFileSync } from "node:fs";

import { run } from "../../src/cli/run.ts";
import {
  DRIVEN_MARKER,
  type Job,
  type StartJobOptions,
  beginJobRecord,
  jobRecord,
  selfArgv,
  setJobStarter,
  spawnDetachedJob,
} from "../../src/jobs.ts";
import { capture } from "../../src/output.ts";
import { standIn } from "../../src/workdir.ts";

interface Pending {
  readonly repoRoot: string;
  readonly name: string;
  readonly verb: readonly string[];
  readonly log: string;
  readonly status: string;
}

let pending: Pending | null = null;

/**
 * The verb an argv re-enters the router with, or null when it is anything
 * else.
 *
 * The driver spawns two kinds of thing: its own CLI, and a bare `node -e`
 * script (the candidate gate polls git in one). Only the first is a call
 * this process can make instead; the second still spawns, unchanged.
 */
function selfVerb(argv: readonly string[]): readonly string[] | null {
  const self = selfArgv();
  if (argv.length <= self.length) return null;
  for (let index = 0; index < self.length; index += 1) {
    if (argv[index] !== self[index]) return null;
  }
  return argv.slice(self.length);
}

function startInProcess(
  repoRoot: string,
  sessionNumber: number,
  options: StartJobOptions,
): Job {
  const verb = selfVerb(options.argv);
  if (verb === null) return spawnDetachedJob(repoRoot, sessionNumber, options);
  if (pending !== null) {
    throw new Error(
      `the job '${pending.name}' has not been settled: the driver runs one job at a ` +
        "time, and a walkthrough settles each before it asks for the next",
    );
  }
  const { log, status } = beginJobRecord(repoRoot, sessionNumber, options.name);
  pending = { repoRoot, name: options.name, verb, log, status };
  // This process is the job's process: the poll asks whether the pid is
  // alive, and it must be until the status file says otherwise. Nothing in a
  // walkthrough ENDS a job -- `endJob` on this pid would end the test run --
  // and a test that needs to is a test about the child, which keeps one.
  return jobRecord(repoRoot, sessionNumber, options, process.pid);
}

/** Install the in-process starter; the returned function restores the spawn. */
export function useInProcessJobs(): () => void {
  const restore = setJobStarter(startInProcess);
  return () => {
    pending = null;
    restore();
  };
}

/**
 * Run the job the driver started, exactly as the runner would have.
 *
 * Called where a walkthrough would sleep between polls. With no job
 * outstanding it sleeps instead, so the loop it replaces is the loop it was.
 */
export async function settleJobs(idleMs = 100): Promise<void> {
  const job = pending;
  if (job === null) {
    await new Promise((wake) => setTimeout(wake, idleMs));
    return;
  }
  pending = null;

  const marked = process.env[DRIVEN_MARKER];
  process.env[DRIVEN_MARKER] = "1";
  let exit: number;
  let said: string;
  try {
    const collected = await capture(() => standIn(job.repoRoot, () => run(job.verb)));
    exit = collected.value;
    said = collected.stdout + collected.stderr;
  } catch (error) {
    // The runner reports a command that would not run as a job that ended
    // without a code, and the driver stops on it. A verb that threw is the
    // same fact, and its message is the log.
    exit = 1;
    said = `dabbler: ${error instanceof Error ? error.message : String(error)}\n`;
  } finally {
    if (marked === undefined) delete process.env[DRIVEN_MARKER];
    else process.env[DRIVEN_MARKER] = marked;
  }

  writeFileSync(job.log, said, "utf8");
  // Renamed into place, as the runner does: a poll that read half a status
  // file would read a job with no exit code, which is a stop.
  const writing = `${job.status}.writing`;
  writeFileSync(writing, `${JSON.stringify({ exit, ended_at: new Date().toISOString() })}\n`, "utf8");
  renameSync(writing, job.status);
}
