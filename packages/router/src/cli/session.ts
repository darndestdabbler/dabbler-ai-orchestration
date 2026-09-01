// `dabbler session <subcommand>` -- the lifecycle's command line.
//
// Every subcommand is real. Session 26 landed the three that WRITE the
// record (`start`, `declare`, `decision`); session 31 landed the five
// that judge it -- `close` and its gates, `cancel`, `restore`, `plan` and
// the legacy `migrate`; the driver set added `report`, the engine's one
// answer, and `drive`, the loop that asks -- so nothing here is refused for
// not existing yet.
//
// The argument grammar is deliberately small: argparse's whole grammar is
// not the contract, the flags the lifecycle documents are. An unknown flag
// is a usage error rather than a silent no-op, because a misspelled
// `--not-releasable` that parsed as nothing would publish.

import { shlexSplit } from "../checks.ts";
import { driveSession, sessionNext } from "../drive.ts";
import {
  ENGINE_OUTPUT_MODES,
  type Engine,
  type EngineOutput,
  builtInEngine,
  commandEngine,
} from "../engines.ts";
import { SessionsRootNotFoundError, resolveSessionsDir } from "../evidence.ts";
import { DECIDERS } from "../writers.ts";
import {
  EXIT_BOUNDARY,
  EXIT_USAGE,
  cancel,
  close,
  declare,
  decision,
  interrupt,
  migrate,
  plan,
  planAmend,
  report,
  restore,
  start,
} from "../session.ts";
import { writeErr, writeOut } from "./output.ts";

/** Every subcommand, in the order the usage text lists them. */
const SUMMARY: Record<string, string> = {
  start: "register a session start",
  decision: "append a decision to decisions-log.md",
  declare: "declare the session's task list and releasability",
  next: "advance the session one move and print the instruction to answer",
  drive: "run the next session end to end: the framework drives, the engine answers",
  interrupt: "end the engine's running invocation under a driven session, with a reason",
  report: "answer the driver's outstanding instruction",
  plan: "record the plan prose in project-work-plan.md; `plan amend` changes a driven step",
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
  next: [
    "  --engine ENGINE          claude-code | codex | gemini | copilot -- required only to",
    "                           REGISTER a session; omit it once one is in flight",
    "  --provider PROVIDER      anthropic | openai | google; required with --engine",
    "  --model MODEL            required for a Copilot seat",
    "  --effort EFFORT          optional reasoning effort, recorded with the identity",
    "  --max-rounds N           the verification round cap, as `dabbler verify` takes it",
    "  --transport T            the verification transport, as `dabbler verify` takes it",
    "",
    "  Stdout carries one thing: the instruction, as driver-instruction JSON. Do what",
    "  its `ask` says, run its `answer_command`, then call this again -- until it says",
    "  `done`. A `wait` means the framework is running something long: leave it",
    "  `retry_after_seconds`, read its `log` if you like, and call this again.",
  ],
  drive: [
    "  --engine ENGINE          required: claude-code | codex | gemini | copilot -- who",
    "                           is registered as the session's orchestrator",
    "  --provider PROVIDER      anthropic | openai | google; required for a fresh registration",
    "  --model MODEL            required for a Copilot seat",
    "  --effort EFFORT          optional reasoning effort, recorded with the identity",
    '  --engine-argv "PROG A B" the command invoked once per instruction instead of the',
    "                           engine's own CLI; {instruction} in any element is the",
    "                           instruction's path, and DABBLER_DRIVER_INSTRUCTION carries",
    "                           it too. Required for an engine with no built-in command",
    "                           (claude-code, copilot and codex have one)",
    "  --show-engine MODE       stream | quiet: show the engine's output as it runs, or",
    "                           only record it; overrides driver.engine_output",
    "  --max-invocations N      overrides driver.max_invocations for this run; a re-run",
    "                           past a budget stop passes a larger one",
    "  --max-rounds N           the verification round cap, as `dabbler verify` takes it",
    "  --transport T            the verification transport, as `dabbler verify` takes it",
  ],
  interrupt: [
    "  --reason TEXT            required: what the engine reads next -- the driver ends the",
    "                           running invocation and re-invokes with it",
    "  --stop                   halt the loop instead of re-invoking: `interrupted` lands on",
    "                           run.json with the reason, the session stays in flight, and",
    "                           `session drive` re-runs from the phase it reached",
  ],
  report: [
    "  --seq N                  required: the seq of the instruction being answered",
    "  a step report, when the instruction asked for one:",
    "  --step ID                the step id the instruction named",
    "  --status STATUS          done | blocked",
    "  --files A,B,...          every file created or changed, repo-relative; an empty",
    "                           string when none",
    "  --notes TEXT             one line for the log",
    "  --tests COMMAND          the test command run, when one was",
    "  a work plan or a disposition, when the instruction asked for one:",
    "  --answer-file PATH       the JSON you wrote, outside the driver's ledger; the",
    "                           framework validates it and stamps its own members",
  ],
  plan: [
    "  --body TEXT              the plan prose; mutually exclusive with --body-file",
    "  --body-file PATH         the plan prose, read from a file",
    "",
    "  `dabbler session plan amend` instead amends ONE not-yet-accepted step of the",
    "  driven work plan -- what the next instruction for it is measured against:",
    "  --step ID                required: the step to amend",
    "  --files A,B              the step's files as they should now read, whole",
    "  --checks-file PATH       the step's checks, whole, as JSON: [{\"argv\": [...]}]",
    "  --reason TEXT            required: why this is the minimal change",
    "  --approver WHO           required: who is answerable for it",
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

const SWITCHES = new Set(["--releasable", "--not-releasable", "--dry-run", "--force", "--stop"]);

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

  if (subcommand === "plan" && parsed.positional[0] === "amend") {
    const stepId = values.get("--step");
    const reason = values.get("--reason");
    const approver = values.get("--approver");
    const missing = [
      stepId === undefined ? "--step" : null,
      reason === undefined ? "--reason" : null,
      approver === undefined ? "--approver" : null,
    ].filter((flag): flag is string => flag !== null);
    if (missing.length > 0) {
      // An amendment nobody signed, for no stated reason, is a bar moved by
      // nobody -- so none of the three is optional.
      writeErr(
        `dabbler session plan amend: the following arguments are required: ${missing.join(", ")}
`,
      );
      return EXIT_USAGE;
    }
    const files = values.get("--files");
    return planAmend(sessionsDir, {
      stepId: stepId as string,
      files:
        files === undefined
          ? null
          : files.split(",").map((entry) => entry.trim()).filter((entry) => entry !== ""),
      checksFile: values.get("--checks-file") ?? null,
      reason: reason as string,
      approver: approver as string,
      sessionNumber,
    });
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

  if (subcommand === "next") {
    const maxRounds = integer(values.get("--max-rounds"), "--max-rounds");
    if (typeof maxRounds === "string") {
      writeErr(`dabbler session next: ${maxRounds}\n`);
      return EXIT_USAGE;
    }
    return sessionNext(sessionsDir, {
      engine: values.get("--engine") ?? null,
      provider: values.get("--provider") ?? null,
      model: values.get("--model") ?? null,
      effort: values.get("--effort") ?? null,
      maxRounds,
      transport: values.get("--transport") ?? null,
    });
  }

  if (subcommand === "drive") {
    const engine = values.get("--engine");
    if (engine === undefined) {
      writeErr("dabbler session drive: the following arguments are required: --engine\n");
      return EXIT_USAGE;
    }
    const maxInvocations = integer(values.get("--max-invocations"), "--max-invocations");
    if (typeof maxInvocations === "string") {
      writeErr(`dabbler session drive: ${maxInvocations}\n`);
      return EXIT_USAGE;
    }
    const maxRounds = integer(values.get("--max-rounds"), "--max-rounds");
    if (typeof maxRounds === "string") {
      writeErr(`dabbler session drive: ${maxRounds}\n`);
      return EXIT_USAGE;
    }
    const showEngine = values.get("--show-engine");
    if (showEngine !== undefined && !(ENGINE_OUTPUT_MODES as readonly string[]).includes(showEngine)) {
      writeErr(
        `dabbler session drive: argument --show-engine: invalid choice: '${showEngine}' ` +
          `(choose from ${ENGINE_OUTPUT_MODES.join(", ")})\n`,
      );
      return EXIT_USAGE;
    }
    const model = values.get("--model") ?? null;
    const engineArgv = values.get("--engine-argv");
    let adapter: Engine;
    if (engineArgv !== undefined) {
      try {
        adapter = commandEngine(shlexSplit(engineArgv));
      } catch (error) {
        writeErr(
          `dabbler session drive: --engine-argv: ${error instanceof Error ? error.message : String(error)}\n`,
        );
        return EXIT_USAGE;
      }
    } else {
      const built = builtInEngine(engine, model);
      if (typeof built === "string") {
        writeErr(`dabbler session drive: ${built}\n`);
        return EXIT_USAGE;
      }
      adapter = built;
    }
    return driveSession(sessionsDir, {
      engine,
      provider: values.get("--provider") ?? null,
      model,
      effort: values.get("--effort") ?? null,
      adapter,
      engineOutput: (showEngine as EngineOutput | undefined) ?? null,
      maxInvocations,
      maxRounds,
      transport: values.get("--transport") ?? null,
    });
  }

  if (subcommand === "interrupt") {
    const reason = values.get("--reason");
    if (reason === undefined) {
      writeErr("dabbler session interrupt: the following arguments are required: --reason\n");
      return EXIT_USAGE;
    }
    return interrupt(sessionsDir, { reason, sessionNumber, stop: switches.has("--stop") });
  }

  if (subcommand === "report") {
    const answerFile = values.get("--answer-file");
    const required =
      answerFile === undefined
        ? ["--seq", "--step", "--status", "--files", "--notes"]
        : ["--seq"];
    const missing = required.filter((flag) => !values.has(flag));
    if (missing.length > 0) {
      writeErr(
        `dabbler session report: the following arguments are required: ${missing.join(", ")}` +
          (answerFile === undefined ? " (or --answer-file, for a plan or a disposition)" : "") +
          "\n",
      );
      return EXIT_USAGE;
    }
    const seq = integer(values.get("--seq"), "--seq");
    if (typeof seq === "string") {
      writeErr(`dabbler session report: ${seq}\n`);
      return EXIT_USAGE;
    }
    if (answerFile !== undefined) {
      const stepFlags = ["--step", "--status", "--files", "--notes", "--tests"].filter((flag) =>
        values.has(flag),
      );
      if (stepFlags.length > 0) {
        writeErr(
          `dabbler session report: argument --answer-file: not allowed with ${stepFlags.join(", ")}\n`,
        );
        return EXIT_USAGE;
      }
      return report(sessionsDir, { seq: seq!, answerFile, sessionNumber });
    }
    return report(sessionsDir, {
      seq: seq!,
      stepId: values.get("--step")!,
      status: values.get("--status")!,
      files: values.get("--files")!.split(","),
      testsRun: values.get("--tests") ?? null,
      notes: values.get("--notes")!,
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
