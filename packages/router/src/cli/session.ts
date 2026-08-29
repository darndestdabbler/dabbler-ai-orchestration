// `dabbler session <subcommand>` -- the lifecycle's command line.
//
// Four subcommands are real: `start`, `declare`, `log` and `decision` --
// the ones that write the record, which is what session 26 ports. The rest
// are named and refused, with the session that lands them, because "not yet"
// is a different answer from "no such subcommand" and an orchestrator
// reading the first should wait rather than check its spelling.
//
// The refusal is per subcommand rather than per verb on purpose. The verb
// registry's rule is that a verb is available when a handler is registered,
// not when a constant says so; the same rule one level down means this
// handler must say exactly which half of itself exists.

import { SessionsRootNotFoundError, resolveSessionsDir } from "../evidence.ts";
import { DECIDERS, STEP_STATUSES } from "../writers.ts";
import {
  EXIT_BOUNDARY,
  EXIT_USAGE,
  declare,
  decision,
  log,
  start,
} from "../session.ts";
import { EXIT_REFUSED } from "../contracts/router.ts";
import { writeErr, writeOut } from "./output.ts";

/** Subcommands session 30 lands, and what a caller should do until then. */
const NOT_YET: Readonly<Record<string, string>> = {
  close: "run the gates and close the session",
  cancel: "cancel one session",
  restore: "restore a cancelled session",
  plan: "record the plan prose in project-work-plan.md",
  migrate: "fold a legacy session-set directory into the sessions root",
};

const IMPLEMENTED = ["start", "declare", "log", "decision"] as const;

function usage(): string {
  const rows = [
    ...IMPLEMENTED.map((name) => `  ${name.padEnd(8)}  ${SUMMARY[name]}`),
    ...Object.entries(NOT_YET).map(
      ([name, summary]) => `  ${name.padEnd(8)}  ${summary}  (not yet: session 30)`,
    ),
  ];
  return ["usage: dabbler session <subcommand> [options]", "", ...rows, ""].join("\n");
}

const SUMMARY: Record<string, string> = {
  start: "register a session start",
  declare: "declare the session's task list and releasability",
  log: "record a plan step's status in activity-log.json",
  decision: "append a decision to decisions-log.md",
};

/**
 * `--flag value` and `--flag=value` pairs, plus the bare switches these
 * subcommands take.
 *
 * Deliberately small: argparse's whole grammar is not the contract, the
 * flags the lifecycle documents are. An unknown flag is a usage error
 * rather than a silent no-op, because a misspelled `--not-releasable` that
 * parsed as nothing would publish.
 */
interface Parsed {
  readonly values: Map<string, string>;
  readonly switches: Set<string>;
  readonly positional: string[];
}

const SWITCHES = new Set(["--releasable", "--not-releasable", "--dry-run", "--force"]);

function parseArgs(argv: readonly string[]): Parsed | string {
  const values = new Map<string, string>();
  const switches = new Set<string>();
  const positional: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const equals = token.indexOf("=");
    if (equals !== -1) {
      values.set(token.slice(0, equals), token.slice(equals + 1));
      continue;
    }
    if (SWITCHES.has(token)) {
      switches.add(token);
      continue;
    }
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      return `argument ${token}: expected one argument`;
    }
    values.set(token, next);
    index += 1;
  }
  return { values, switches, positional };
}

function integer(raw: string | undefined, flag: string): number | null | string {
  if (raw === undefined) return null;
  if (!/^-?\d+$/.test(raw)) {
    return `argument ${flag}: invalid int value: '${raw}'`;
  }
  return Number.parseInt(raw, 10);
}

export async function sessionVerb(argv: string[]): Promise<number> {
  const [subcommand, ...rest] = argv;

  if (subcommand === undefined || subcommand === "--help" || subcommand === "-h") {
    writeOut(usage());
    return subcommand === undefined ? EXIT_USAGE : 0;
  }

  if (subcommand in NOT_YET) {
    writeErr(
      `dabbler session ${subcommand}: refused -- this subcommand is not ported ` +
        "yet. Session 30 of the port plan lands it; until then run " +
        `'python -m ai_router.session ${subcommand}'.\n`,
    );
    return EXIT_REFUSED;
  }
  if (!IMPLEMENTED.includes(subcommand as (typeof IMPLEMENTED)[number])) {
    writeErr(`dabbler session: '${subcommand}' is not a subcommand\n\n${usage()}`);
    return EXIT_USAGE;
  }

  const parsed = parseArgs(rest);
  if (typeof parsed === "string") {
    writeErr(`dabbler session ${subcommand}: ${parsed}\n`);
    return EXIT_USAGE;
  }
  const { values, switches } = parsed;

  let sessionsDir: string;
  try {
    sessionsDir = resolveSessionsDir(values.get("--sessions-dir"));
  } catch (error) {
    if (!(error instanceof SessionsRootNotFoundError)) throw error;
    writeErr(`session: ${error.message}\n`);
    return EXIT_USAGE;
  }

  const sessionNumber = integer(values.get("--session-number"), "--session-number");
  if (typeof sessionNumber === "string") {
    writeErr(`dabbler session ${subcommand}: ${sessionNumber}\n`);
    return EXIT_USAGE;
  }

  if (subcommand === "start") {
    const engine = values.get("--engine");
    if (engine === undefined) {
      writeErr("dabbler session start: the following arguments are required: --engine\n");
      return EXIT_USAGE;
    }
    const totalSessions = integer(values.get("--total-sessions"), "--total-sessions");
    if (typeof totalSessions === "string") {
      writeErr(`dabbler session start: ${totalSessions}\n`);
      return EXIT_USAGE;
    }
    return start(sessionsDir, {
      engine,
      provider: values.get("--provider") ?? null,
      model: values.get("--model") ?? null,
      effort: values.get("--effort") ?? null,
      sessionNumber,
      totalSessions,
    });
  }

  if (subcommand === "log") {
    const step = values.get("--step");
    const status = values.get("--status");
    const missing = [
      step === undefined ? "--step" : null,
      status === undefined ? "--status" : null,
    ].filter((name): name is string => name !== null);
    if (missing.length > 0) {
      writeErr(
        `dabbler session log: the following arguments are required: ${missing.join(", ")}\n`,
      );
      return EXIT_USAGE;
    }
    if (!STEP_STATUSES.includes(status!)) {
      writeErr(
        `dabbler session log: argument --status: invalid choice: '${status}' ` +
          `(choose from ${STEP_STATUSES.map((s) => `'${s}'`).join(", ")})\n`,
      );
      return EXIT_USAGE;
    }
    return log(sessionsDir, {
      step: step!,
      status: status!,
      note: values.get("--note") ?? null,
      sessionNumber,
    });
  }

  if (subcommand === "decision") {
    const decider = values.get("--decider");
    const headline = values.get("--headline");
    const missing = [
      decider === undefined ? "--decider" : null,
      headline === undefined ? "--headline" : null,
    ].filter((name): name is string => name !== null);
    if (missing.length > 0) {
      writeErr(
        `dabbler session decision: the following arguments are required: ${missing.join(", ")}\n`,
      );
      return EXIT_USAGE;
    }
    if (!DECIDERS.includes(decider!)) {
      writeErr(
        `dabbler session decision: argument --decider: invalid choice: ` +
          `'${decider}' (choose from ${DECIDERS.map((d) => `'${d}'`).join(", ")})\n`,
      );
      return EXIT_USAGE;
    }
    const body = values.get("--body");
    const bodyFile = values.get("--body-file");
    if (body !== undefined && bodyFile !== undefined) {
      writeErr(
        "dabbler session decision: argument --body-file: not allowed with argument --body\n",
      );
      return EXIT_USAGE;
    }
    if (body === undefined && bodyFile === undefined) {
      writeErr(
        "dabbler session decision: one of the arguments --body --body-file is required\n",
      );
      return EXIT_USAGE;
    }
    return decision(sessionsDir, {
      decider: decider!,
      headline: headline!,
      body: body ?? null,
      bodyFile: bodyFile ?? null,
      model: values.get("--model") ?? null,
      provider: values.get("--provider") ?? null,
      decidedOn: values.get("--decided-on") ?? null,
      backfillReason: values.get("--backfill-reason") ?? null,
      sessionNumber,
    });
  }

  // declare
  const task = values.get("--task");
  const taskFile = values.get("--task-file");
  if (task !== undefined && taskFile !== undefined) {
    writeErr(
      "dabbler session declare: argument --task-file: not allowed with argument --task\n",
    );
    return EXIT_USAGE;
  }
  if (task === undefined && taskFile === undefined) {
    writeErr("dabbler session declare: one of the arguments --task --task-file is required\n");
    return EXIT_USAGE;
  }
  const releasable = switches.has("--releasable");
  const notReleasable = switches.has("--not-releasable");
  if (releasable && notReleasable) {
    writeErr(
      "dabbler session declare: argument --not-releasable: not allowed with argument --releasable\n",
    );
    return EXIT_USAGE;
  }
  if (!releasable && !notReleasable) {
    writeErr(
      "dabbler session declare: one of the arguments --releasable --not-releasable is required\n",
    );
    return EXIT_USAGE;
  }
  return declare(sessionsDir, {
    task: task ?? null,
    taskFile: taskFile ?? null,
    releasable,
    sessionNumber,
  });
}

export { EXIT_BOUNDARY };
