// `dabbler seat-cost <id>...` -- what a Copilot seat actually spent.
//
// The one number the seat transport cannot report at dispatch time, read
// afterwards from the CLI's own usage store by conversation id. It writes
// nothing and reaches no network; the exit code distinguishes a measurement
// from the absence of one, because a session that records "0.0" for "could not
// tell" has put a false number in the record.

import {
  STATUS_UNMEASURED,
  measureConversations,
  usd,
} from "../seatCost.ts";
import { writeErr, writeOut } from "./output.ts";

const EXIT_OK = 0;
const EXIT_UNMEASURED = 1;
const EXIT_USAGE = 2;

function usage(): string {
  return [
    "usage: dabbler seat-cost [-h] [--store STORE] ids [ids ...]",
    "",
    "Price Copilot CLI conversation ids against the local seat usage store.",
    "",
    "positional arguments:",
    "  ids            CLI conversation id(s)",
    "",
    "options:",
    "  -h, --help     show this help message and exit",
    "  --store STORE  explicit store path",
    "",
  ].join("\n");
}

export async function seatCostVerb(argv: string[]): Promise<number> {
  const ids: string[] = [];
  let store: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === "-h" || argument === "--help") {
      writeOut(usage());
      return EXIT_OK;
    }
    if (argument === "--store") {
      const value = argv[index + 1];
      if (value === undefined) {
        writeErr(`${usage()}\ndabbler seat-cost: error: argument --store: expected one argument\n`);
        return EXIT_USAGE;
      }
      store = value;
      index += 1;
      continue;
    }
    if (argument.startsWith("--store=")) {
      store = argument.slice("--store=".length);
      continue;
    }
    if (argument.startsWith("-") && argument !== "-") {
      writeErr(`${usage()}\ndabbler seat-cost: error: unrecognized argument: ${argument}\n`);
      return EXIT_USAGE;
    }
    ids.push(argument);
  }

  if (ids.length === 0) {
    writeErr(`${usage()}\ndabbler seat-cost: error: the following arguments are required: ids\n`);
    return EXIT_USAGE;
  }

  const result = measureConversations(ids, { storePath: store });
  if (result.credits === null) {
    writeOut(`status: ${result.status} (${String(result.reason)})\n`);
  } else {
    const qualifier = result.reason ? ` (${result.reason})` : "";
    writeOut(
      `status: ${result.status}${qualifier}\n` +
        `credits: ${result.credits.toFixed(3)}\n` +
        `usd: $${(usd(result) ?? 0).toFixed(4)}\n` +
        `events: ${result.event_count}\n`,
    );
  }
  return result.status === STATUS_UNMEASURED ? EXIT_UNMEASURED : EXIT_OK;
}
