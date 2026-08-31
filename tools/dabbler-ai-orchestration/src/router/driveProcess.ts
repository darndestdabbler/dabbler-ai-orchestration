// The driver as a child of the extension host.
//
// Every other verb the extension runs is a function call into the bundled
// router (`host.ts`). `session drive` is not run that way, and the reason
// is the in-process router's own shape: it stands in one directory at a
// time (`standIn` refuses a second caller), runs verbs one after another,
// and collects what a verb writes until the verb returns. A drive is one
// verb that lasts the whole session. In-process it would hold the stand-in
// for an hour, queue Stop's `session interrupt` behind itself -- the one
// verb that could end the invocation it is waiting on -- and show its
// output when it ended. So the driver runs as a process: the same
// `dabbler.cjs` the terminal shim runs, on the editor's own Node, with its
// output read line by line as it comes. Stop and Send still go in-process:
// `session interrupt` writes a file the driver polls, which is how the verb
// was built to reach a driver in another process.

import type { ChildProcess } from "child_process";
import { spawnProgram, terminateTree } from "dabbler-ai-router";

/** What to run: the bundled command, on this Node, in this repository. */
export interface DriveLaunch {
  /** The editor's own Node -- `process.execPath`, which is Electron. */
  readonly execPath: string;
  /** The bundled `dabbler.cjs`, beside the extension. */
  readonly cli: string;
  /** The repository root; the router derives the sessions root from it. */
  readonly cwd: string;
  /** The verb and its arguments, e.g. `session drive --engine claude-code ...`. */
  readonly args: readonly string[];
}

export interface DriveCommand {
  readonly argv: string[];
  readonly env: NodeJS.ProcessEnv;
}

/**
 * Electron runs as Node only when told to. The terminal shim sets the same
 * variable for the same binary; here it is set on the child alone rather
 * than on the extension host.
 */
export function driveCommand(launch: DriveLaunch): DriveCommand {
  return {
    argv: [launch.execPath, launch.cli, ...launch.args],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  };
}

/** A running driver, from the caller's side. */
export interface DriveHandle {
  readonly root: string;
  /** Resolves with the exit code, or null when the process was killed. */
  readonly exited: Promise<number | null>;
  /** End the driver and everything it started; `exited` resolves null. */
  kill(): void;
}

export type SpawnLike = (argv: readonly string[], options: { cwd: string; env: NodeJS.ProcessEnv }) => ChildProcess;

const spawnDefault: SpawnLike = (argv, options) =>
  spawnProgram(argv, { cwd: options.cwd, env: options.env, stdio: ["ignore", "pipe", "pipe"] });

/**
 * Start the driver and hand every line it prints, on either stream, to
 * `onLine` as it arrives. The driver's own lines (`drive [time] event`) and
 * the engine's (`  │ ...` when `driver.engine_output` is `stream`) come
 * through the same sink in the order they were written.
 */
export function launchDriver(
  launch: DriveLaunch,
  onLine: (line: string) => void,
  spawnLike: SpawnLike = spawnDefault,
): DriveHandle {
  const command = driveCommand(launch);
  const child = spawnLike(command.argv, { cwd: launch.cwd, env: command.env });
  let killed = false;
  const pending = { out: "", err: "" };
  const feed = (key: "out" | "err", chunk: Buffer | string): void => {
    pending[key] += chunk.toString();
    let index = pending[key].indexOf("\n");
    while (index !== -1) {
      onLine(pending[key].slice(0, index).replace(/\r$/, ""));
      pending[key] = pending[key].slice(index + 1);
      index = pending[key].indexOf("\n");
    }
  };
  child.stdout?.on("data", (chunk: Buffer) => feed("out", chunk));
  child.stderr?.on("data", (chunk: Buffer) => feed("err", chunk));
  const exited = new Promise<number | null>((resolve) => {
    const finish = (code: number | null): void => {
      for (const key of ["out", "err"] as const) {
        if (pending[key] !== "") {
          onLine(pending[key].replace(/\r$/, ""));
          pending[key] = "";
        }
      }
      resolve(killed ? null : code);
    };
    child.on("error", (error) => {
      onLine(`driver: could not be started: ${error.message}`);
      finish(null);
    });
    child.on("close", (code) => finish(code));
  });
  return {
    root: launch.cwd,
    exited,
    kill: () => {
      killed = true;
      terminateTree(child);
    },
  };
}
