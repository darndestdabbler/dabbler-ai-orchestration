// `dabbler progress` -- the Work Explorer projection for this repository.
//
// One output mode, so `--json` is accepted and changes nothing: the Python
// command it replaces takes the flag for the same reason, and a verb that
// refused a flag its twin accepts would break every caller that passes it.
// The extension renders this JSON and re-implements none of it.
//
// `approvedPlan` is imported for its registration, not for a call: loading it
// fills the `ApprovedPlanReader` seam `progress` declares, which is what turns
// `tasksRefused` back into task rows. Without this import the projection is
// honest and empty, which is exactly the state D198 left session 31 in.

import "../approvedPlan.ts";
import { SessionsRootNotFoundError, resolveSessionsDir } from "../evidence.ts";
import { buildProjection } from "../progress.ts";
import { dumps } from "../pythonJson.ts";
import { writeErr, writeOut } from "./output.ts";
import { statSync } from "node:fs";

const EXIT_OK = 0;
const EXIT_USAGE = 2;

function usage(name: string): string {
  return [
    `usage: dabbler ${name} [-h] [--sessions-dir SESSIONS_DIR] [--json]`,
    "",
    "Emit the Work Explorer projection for this repository.",
    "",
    "options:",
    "  -h, --help            show this help message and exit",
    "  --sessions-dir SESSIONS_DIR",
    "                        the repository's sessions root; derived from the",
    "                        working directory when omitted",
    "  --json                emit the projection JSON (the only output mode)",
    "",
  ].join("\n");
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export async function progressVerb(
  argv: string[],
  name = "progress",
): Promise<number> {
  let explicit: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      writeOut(usage(name));
      return EXIT_OK;
    }
    if (token === "--json") continue;
    if (token.startsWith("--sessions-dir=")) {
      explicit = token.slice("--sessions-dir=".length);
      continue;
    }
    if (token === "--sessions-dir") {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("--")) {
        writeErr("dabbler progress: argument --sessions-dir: expected one argument\n");
        return EXIT_USAGE;
      }
      explicit = next;
      index += 1;
      continue;
    }
    writeErr(`dabbler ${name}: unrecognized argument: ${token}\n\n${usage(name)}`);
    return EXIT_USAGE;
  }

  let sessionsDir: string;
  try {
    sessionsDir = resolveSessionsDir(explicit);
  } catch (error) {
    if (!(error instanceof SessionsRootNotFoundError)) throw error;
    writeErr(`progress: ${error.message}\n`);
    return EXIT_USAGE;
  }
  if (!isDirectory(sessionsDir)) {
    writeErr(`progress: not a directory: ${sessionsDir}\n`);
    return EXIT_USAGE;
  }
  writeOut(dumps(buildProjection(sessionsDir), { indent: 2 }) + "\n");
  return EXIT_OK;
}

/**
 * `dabbler status` -- the same projection, under the name D88 and D130
 * promised an operator.
 *
 * One implementation, two names, and they are not redundant: `progress` is
 * what the extension spawns and has since session 31, and `status` is the
 * command the run core's retirement said would read the lifecycle's record
 * instead of the run projection. Aliasing rather than renaming keeps the
 * extension's spawn site working; delegating rather than copying keeps there
 * from being two answers to "where is this repository".
 *
 * The name is passed through so the usage text and the argument refusal say
 * what the operator typed. The `progress:` prefix on the two resolution
 * errors below is deliberately NOT renamed -- it is the Python module's own
 * name, and `python -m ai_router.progress` is what this verb is compared
 * against.
 */
export function statusVerb(argv: string[]): Promise<number> {
  return progressVerb(argv, "status");
}
