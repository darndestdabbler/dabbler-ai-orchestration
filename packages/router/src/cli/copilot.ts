// `dabbler copilot refresh` -- re-probe the seat and rewrite its catalog.
//
// The verb whose absence was the incident. A lockfile whose only writer is a
// 39-request universe probe is a lockfile nobody refreshes, and two people
// hand-edited this one instead; so every scope is named, the cheap one is the
// default, and the expensive one has to be asked for by name.
//
// Nothing here decides anything: scope selection, pricing, the confirmation
// threshold and the merge all live in `../transports/copilot.ts`, because the
// same rules have to hold when the extension or a future verb reaches them.
// What is here is the argument parsing and the two things the command line
// resolves from configuration -- which lockfile, and which binary.

import { loadConfig } from "../config.ts";
import {
  CONFIRM_THRESHOLD_PREMIUM_REQUESTS,
  CopilotCliTransport,
  SCOPE_ALL,
  SCOPE_MODELS,
  SCOPE_QUORUM,
  SCOPE_STALE,
  enumerateSeatModels,
  getCliVersion,
  resolveLockfilePath,
  resolveTransportTimeouts,
  runRefresh,
} from "../transports/copilot.ts";
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
    "    refresh   re-probe the seat and rewrite the catalog lockfile",
    "",
    "options:",
    "  -h, --help  show this help message and exit",
    "",
  ].join("\n");
}

function refreshUsage(): string {
  return [
    "usage: dabbler copilot refresh [-h]",
    "                               [--quorum | --stale | --all | --models a,b,c]",
    "                               [--list-only] [--dry-run] [--yes]",
    "                               [--confirm-threshold CONFIRM_THRESHOLD]",
    "                               [--lockfile LOCKFILE] [--binary BINARY]",
    "",
    "Read the seat's own model list -- free, no prompt, no credit -- then probe a",
    "named scope of it for entitlement and fold the answers into the lockfile.",
    "Merge, never clobber: an entry this run did not probe survives byte for byte,",
    "provenance included, and a model the seat has stopped listing is marked",
    "retired rather than deleted.",
    "",
    "options:",
    "  -h, --help            show this help message and exit",
    "  --quorum              (default) the cheapest confirmed model of each",
    "                        provider -- enough to re-establish the >=2-provider",
    "                        invariant and re-date the CLI version",
    "  --stale               entries confirmed on a CLI version other than the live",
    "                        one, cheapest first",
    "  --all                 every model the seat lists; costs what it costs, which",
    "                        is why it must be asked for by name",
    "  --models a,b,c        probe these ids only, comma-separated",
    "  --list-only           read the seat's own model list, record it, and probe",
    "                        nothing -- free, and the only scope that spends no",
    "                        turn at all",
    "  --dry-run             print the plan and its projected cost; probe nothing",
    "  --yes                 authorize a plan that would otherwise ask first",
    "  --confirm-threshold CONFIRM_THRESHOLD",
    "                        projected premium requests above which the run asks",
    `                        first (default ${CONFIRM_THRESHOLD_PREMIUM_REQUESTS})`,
    "  --lockfile LOCKFILE   lockfile to refresh (default: the one router-",
    "                        config.yaml names)",
    "  --binary BINARY       Copilot CLI binary (default: the one router-",
    "                        config.yaml names)",
    "",
  ].join("\n");
}

interface RefreshArgs {
  scope: string;
  enumerateOnly: boolean;
  models: string[] | null;
  dryRun: boolean;
  assumeYes: boolean;
  threshold: number;
  lockfile: string | null;
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

  const args: RefreshArgs = {
    scope: SCOPE_QUORUM,
    enumerateOnly: false,
    models: null,
    dryRun: false,
    assumeYes: false,
    threshold: CONFIRM_THRESHOLD_PREMIUM_REQUESTS,
    lockfile: null,
    binary: null,
  };
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index]!;
    const value = (): string | undefined => rest[++index];
    if (argument === "-h" || argument === "--help") {
      writeOut(refreshUsage());
      return 0;
    } else if (argument === "--quorum") args.scope = SCOPE_QUORUM;
    else if (argument === "--stale") args.scope = SCOPE_STALE;
    else if (argument === "--all") args.scope = SCOPE_ALL;
    else if (argument === "--list-only") args.enumerateOnly = true;
    else if (argument === "--dry-run") args.dryRun = true;
    else if (argument === "--yes") args.assumeYes = true;
    else if (argument === "--models") {
      const models = value();
      if (models === undefined) return missing(argument);
      args.models = [models];
      args.scope = SCOPE_MODELS;
    } else if (argument === "--confirm-threshold") {
      const threshold = value();
      if (threshold === undefined) return missing(argument);
      const parsed = Number(threshold);
      if (!Number.isInteger(parsed)) {
        writeErr(
          `${refreshUsage()}\ndabbler copilot refresh: error: argument ` +
            `--confirm-threshold: invalid int value: '${threshold}'\n`,
        );
        return EXIT_USAGE;
      }
      args.threshold = parsed;
    } else if (argument === "--lockfile") {
      const lockfile = value();
      if (lockfile === undefined) return missing(argument);
      args.lockfile = lockfile;
    } else if (argument === "--binary") {
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
    const maxInvocations = cliConfig["max_invocations_per_session"];
    return await runRefresh({
      catalogPath: args.lockfile ?? resolveLockfilePath(config),
      transport: new CopilotCliTransport({
        binary,
        timeouts: resolveTransportTimeouts(cliConfig),
        maxInvocations: typeof maxInvocations === "number" ? maxInvocations : null,
      }),
      // Free, and first: what the seat has is read from the seat before any
      // probe is priced, let alone spent.
      enumerate: () => enumerateSeatModels({ binary }),
      liveCliVersion: getCliVersion({ binary }),
      enumerateOnly: args.enumerateOnly,
      scope: args.scope,
      models: args.models,
      dryRun: args.dryRun,
      assumeYes: args.assumeYes,
      threshold: args.threshold,
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
