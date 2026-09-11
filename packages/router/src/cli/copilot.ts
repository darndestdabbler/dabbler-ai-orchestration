// `dabbler copilot refresh` -- read what the seat lists and record it.
//
// **There is one scope, because there is one reading.** This verb used to
// open a conversation to get the list and then spend a turn per model to
// confirm what the list had already said, so it needed named scopes, a
// projected cost, a confirmation threshold and a flag to authorize the
// spend -- and every engine that read the file concluded that finding out
// which models exist was expensive. Reading the list is the whole of it now,
// and it is free, so `--list-only` is gone with the scopes it was one of.
//
// Nothing here decides anything: the reading, the fold and the catalog write
// live in `../transports/copilot.ts`, because the same rules have to hold
// when the extension or a future verb reaches them. What is here is the
// argument parsing and the two things the command line resolves from
// configuration -- which lockfile, and which binary.

import { loadConfig } from "../config.ts";
import { enumerateSeatModels, runRefresh } from "../transports/copilot.ts";
import { writeErr, writeOut } from "./output.ts";

const EXIT_USAGE = 2;
/** argparse's own code for a bad invocation, and what a refusal returns. */
const EXIT_ERROR = 2;

function usage(): string {
  return [
    "usage: dabbler copilot [-h] {refresh} ...",
    "",
    "seat catalog lockfile maintenance",
    "",
    "positional arguments:",
    "  {refresh}",
    "    refresh   read the seat's model list and record it",
    "",
    "options:",
    "  -h, --help  show this help message and exit",
    "",
  ].join("\n");
}

function refreshUsage(): string {
  return [
    "usage: dabbler copilot refresh [-h] [--dry-run] [--binary BINARY]",
    "",
    "Read the seat's own model list and record it in this machine's model",
    "catalog. Free: the reply to opening a conversation carries every model the",
    "seat can dispatch, so no prompt is sent and no credit is billed. A model the",
    "seat has stopped listing moves to the catalog's retired list, as an id and a",
    "date, rather than being deleted.",
    "",
    "options:",
    "  -h, --help            show this help message and exit",
    "  --dry-run             print what the seat lists; write nothing",
    "  --binary BINARY       Copilot CLI binary (default: the one router-",
    "                        config.yaml names)",
    "",
  ].join("\n");
}

interface RefreshArgs {
  dryRun: boolean;
  binary: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function copilotVerb(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (command === undefined || command === "-h" || command === "--help") {
    if (command === undefined) {
      writeErr(`${usage()}\ndabbler copilot: error: the following arguments are required: command\n`);
      return EXIT_USAGE;
    }
    writeOut(usage());
    return 0;
  }
  if (command !== "refresh") {
    writeErr(
      `${usage()}\ndabbler copilot: error: argument command: ` +
        `invalid choice: '${command}' (choose from 'refresh')\n`,
    );
    return EXIT_USAGE;
  }

  const args: RefreshArgs = { dryRun: false, binary: null };
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index]!;
    const value = (): string | undefined => rest[++index];
    if (argument === "-h" || argument === "--help") {
      writeOut(refreshUsage());
      return 0;
    } else if (argument === "--dry-run") args.dryRun = true;
    else if (argument === "--binary") {
      const binary = value();
      if (binary === undefined) return missing(argument);
      args.binary = binary;
    } else {
      writeErr(
        `${refreshUsage()}\ndabbler copilot refresh: error: ` +
          `unrecognized arguments: ${argument}\n`,
      );
      return EXIT_USAGE;
    }
  }

  try {
    const config = loadConfig();
    const transports = isRecord(config["transports"]) ? config["transports"] : {};
    const cliConfig = isRecord(transports["copilot-cli"]) ? transports["copilot-cli"] : {};
    const binary = args.binary ?? String(cliConfig["binary"] ?? "copilot");
    return await runRefresh({
      enumerate: () => enumerateSeatModels({ binary }),
      dryRun: args.dryRun,
      out: (text: string) => writeOut(text + "\n"),
    });
  } catch (error: unknown) {
    writeErr(`refresh: ${error instanceof Error ? error.message : String(error)}\n`);
    return EXIT_ERROR;
  }
}

function missing(flag: string): number {
  writeErr(
    `${refreshUsage()}\ndabbler copilot refresh: error: argument ${flag}: ` +
      "expected one argument\n",
  );
  return EXIT_USAGE;
}
