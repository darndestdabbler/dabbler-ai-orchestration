// `dabbler status` -- where this repository is, from the lifecycle's own
// record.
//
// One output mode, so `--json` is accepted and changes nothing. The
// projection is JSON whoever asks: the extension renders it and
// re-implements none of it, and an operator reading it at a terminal is
// reading the same bytes the Work Explorer draws from. A second, prettier
// mode would be a second answer to "where is this repository".
//
// The verb was called `progress` for as long as the extension spawned it.
// It does not spawn anything now, so there is one name, and it is the one
// D88 and D130 promised the operator when the run core's `status` went
// away.
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

function usage(): string {
  return [
    "usage: dabbler status [-h] [--sessions-dir SESSIONS_DIR] [--json]",
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

export async function statusVerb(argv: string[]): Promise<number> {
  let explicit: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      writeOut(usage());
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
        writeErr("dabbler status: argument --sessions-dir: expected one argument\n");
        return EXIT_USAGE;
      }
      explicit = next;
      index += 1;
      continue;
    }
    writeErr(`dabbler status: unrecognized argument: ${token}\n\n${usage()}`);
    return EXIT_USAGE;
  }

  let sessionsDir: string;
  try {
    sessionsDir = resolveSessionsDir(explicit);
  } catch (error) {
    if (!(error instanceof SessionsRootNotFoundError)) throw error;
    writeErr(`status: ${error.message}\n`);
    return EXIT_USAGE;
  }
  if (!isDirectory(sessionsDir)) {
    writeErr(`status: not a directory: ${sessionsDir}\n`);
    return EXIT_USAGE;
  }
  writeOut(dumps(buildProjection(sessionsDir), { indent: 2 }) + "\n");
  return EXIT_OK;
}
