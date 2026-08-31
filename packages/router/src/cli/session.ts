// `dabbler session <subcommand>` -- the lifecycle's command line.
//
// All eight subcommands are real. Session 26 landed the three that WRITE the
// record (`start`, `declare`, `decision`); session 31 lands the five
// that judge it -- `close` and its gates, `cancel`, `restore`, `plan` and
// the legacy `migrate` -- so nothing here is refused for not existing yet.
//
// The argument grammar is deliberately small: argparse's whole grammar is
// not the contract, the flags the lifecycle documents are. An unknown flag
// is a usage error rather than a silent no-op, because a misspelled
// `--not-releasable` that parsed as nothing would publish.

import { SessionsRootNotFoundError, resolveSessionsDir } from "../evidence.ts";
import { DECIDERS } from "../writers.ts";
import {
  EXIT_BOUNDARY,
  EXIT_USAGE,
  cancel,
  close,
  declare,
  decision,
  migrate,
  plan,
  restore,
  start,
} from "../session.ts";
import { writeErr, writeOut } from "./output.ts";

/** Every subcommand, in the order the usage text lists them. */
const SUMMARY: Record<string, string> = {
  start: "register a session start",
  decision: "append a decision to decisions-log.md",
  declare: "declare the session's task list and releasability",
  plan: "record the plan prose in project-work-plan.md",
  close: "run gates and close the session",
  cancel: "cancel one session",
  restore: "restore a cancelled session",
  migrate: "fold a legacy session-set directory into the sessions root",
};

const IMPLEMENTED = Object.keys(SUMMARY);

/**
 * What each subcommand takes, required first.
 *
 * It exists because `--help` did not: the flag was parsed as an option
 * expecting a value, so the only way to discover a subcommand's arguments was
 * to run it bare and read the refusal -- which names what is required and
 * never what is optional. A table beside the parser is the smallest thing that
 * answers the question the operator was actually asking.
 */
const OPTIONS: Record<string, readonly string[]> = {
  start: [
    "  --engine ENGINE          required: claude-code | codex | gemini | copilot",
    "  --provider PROVIDER      required: anthropic | openai | google",
    "  --model MODEL            required for a Copilot seat; identity resolves through",
    "                           the model registry rather than the seat label",
    "  --effort EFFORT          optional reasoning effort, recorded with the identity",
    "  --total-sessions N       optional; the ledger otherwise grows to the plan",
  ],
  decision: [
    "  --decider WHO            required: operator | orchestrator | verifier | framework",
    "  --headline TEXT          required: one line, the decision itself",
    "  --body TEXT              the reasoning; mutually exclusive with --body-file",
    "  --body-file PATH         the reasoning, read from a file",
    "  --model MODEL            who decided, when a model did",
    "  --provider PROVIDER      the provider behind that model",
    "  --decided-on DATE        for a decision recorded after the fact",
    "  --backfill-reason TEXT   why it is being recorded late; required with --decided-on",
  ],
  declare: [
    "  --task TEXT              the task list; mutually exclusive with --task-file",
    "  --task-file PATH         the task list, read from a file",
    "  --releasable             this session may publish",
    "  --not-releasable         it may not; one of the two is required",
  ],
  plan: [
    "  --body TEXT              the plan prose; mutually exclusive with --body-file",
    "  --body-file PATH         the plan prose, read from a file",
  ],
  close: [
    "  --dry-run                print the gate rows and write nothing",
    "  --force                  bypass bookkeeping gates, never evidence ones.",
    "                           It promotes EVERY open session and stamps",
    "                           forceClosed at the repository level -- it is how a",
    "                           whole plan is abandoned, never how one gate is passed",
  ],
  cancel: [
    "  --reason TEXT            required: why the session is being cancelled",
    "  --force                  cancel a session that is in flight",
  ],
  restore: ["  --reason TEXT            required: why it is coming back"],
  migrate: ["  --from PATH              required: the legacy session-set directory"],
};

/** Every subcommand also accepts these. */
const COMMON_OPTIONS: readonly string[] = [
  "  --sessions-dir PATH      the sessions root; derived from the cwd when absent",
  "  --session-number N       act on a session other than the one in flight",
  "  -h, --help               show this message",
];

function subcommandUsage(subcommand: string): string {
  return [
    `usage: dabbler session ${subcommand} [options]`,
    "",
    `  ${SUMMARY[subcommand]}`,
    "",
    "options:",
    ...(OPTIONS[subcommand] ?? []),
    ...COMMON_OPTIONS,
    "",
  ].join("\n");
}

function usage(): string {
  const width = Math.max(...IMPLEMENTED.map((name) => name.length));
  const rows = IMPLEMENTED.map((name) => `  ${name.padEnd(width)}  ${SUMMARY[name]}`);
  return ["usage: dabbler session <subcommand> [options]", "", ...rows, ""].join("\n");
}

/** `--flag value` and `--flag=value` pairs, the bare switches, the rest. */
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

  if (!IMPLEMENTED.includes(subcommand)) {
    writeErr(`dabbler session: '${subcommand}' is not a subcommand\n\n${usage()}`);
    return EXIT_USAGE;
  }

  // Before the option parser, which would otherwise read `--help` as a flag
  // expecting a value -- the refusal csv-model filed, and the reason the only
  // way to discover a subcommand's arguments was to run it bare.
  if (rest.includes("--help") || rest.includes("-h")) {
    writeOut(subcommandUsage(subcommand));
    return 0;
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

  if (subcommand === "plan") {
    const body = values.get("--body");
    const bodyFile = values.get("--body-file");
    if (body !== undefined && bodyFile !== undefined) {
      writeErr(
        "dabbler session plan: argument --body-file: not allowed with argument --body\n",
      );
      return EXIT_USAGE;
    }
    if (body === undefined && bodyFile === undefined) {
      writeErr("dabbler session plan: one of the arguments --body --body-file is required\n");
      return EXIT_USAGE;
    }
    return plan(sessionsDir, { body: body ?? null, bodyFile: bodyFile ?? null });
  }

  if (subcommand === "close") {
    return close(sessionsDir, {
      dryRun: switches.has("--dry-run"),
      forced: switches.has("--force"),
    });
  }

  if (subcommand === "cancel" || subcommand === "restore") {
    const positional = integer(parsed.positional[0], "session_number");
    if (typeof positional === "string") {
      writeErr(`dabbler session ${subcommand}: ${positional}\n`);
      return EXIT_USAGE;
    }
    if (positional === null) {
      writeErr(
        `dabbler session ${subcommand}: the following arguments are required: session_number\n`,
      );
      return EXIT_USAGE;
    }
    if (subcommand === "restore") {
      return restore(sessionsDir, positional, { reason: values.get("--reason") ?? "" });
    }
    const reason = values.get("--reason");
    if (reason === undefined) {
      writeErr("dabbler session cancel: the following arguments are required: --reason\n");
      return EXIT_USAGE;
    }
    return cancel(sessionsDir, positional, { reason, force: switches.has("--force") });
  }

  if (subcommand === "migrate") {
    const legacy = parsed.positional[0];
    if (legacy === undefined) {
      writeErr(
        "dabbler session migrate: the following arguments are required: legacy_set_dir\n",
      );
      return EXIT_USAGE;
    }
    return migrate(legacy, sessionsDir, { dryRun: switches.has("--dry-run") });
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
