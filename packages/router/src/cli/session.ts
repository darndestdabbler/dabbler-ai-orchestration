// `dabbler session <subcommand>` -- the lifecycle's command line.
//
// Every subcommand is real. There is no `declare`: a session's task and
// whether it releases are its accepted plan's to say, and the loop records
// them -- a second door decided releasability by a rule of its own.
//
// The argument grammar is deliberately small: argparse's whole grammar is
// not the contract, the flags the lifecycle documents are. An unknown flag
// is a usage error rather than a silent no-op, because a misspelled flag
// that parsed as nothing would do what nobody asked.

import { shlexSplit } from "../checks.ts";
import { WAIT_IN_CALL_MS, driveSession, reportAndNext, runWholeSession, sessionNext, sessionWait } from "../drive.ts";
import {
  ENGINE_OUTPUT_MODES,
  type Engine,
  type EngineOutput,
  builtInEngine,
  commandEngine,
} from "../engines.ts";
import { SessionsRootNotFoundError, repoRootFromSessionsDir, resolveSessionsDir } from "../evidence.ts";
import { explainEngine } from "../config.ts";
import { readSessionState } from "../progress.ts";
import { DECIDERS } from "../writers.ts";
import {
  EXIT_BOUNDARY,
  EXIT_USAGE,
  cancel,
  close,
  decision,
  holdRelease,
  interrupt,
  rebaseline,
  migrate,
  plan,
  planAmend,
  report,
  restore,
  start,
  personIsPresent,
} from "../session.ts";
import { writeErr, writeOut } from "./output.ts";

/** Every subcommand, in the order the usage text lists them. */
const SUMMARY: Record<string, string> = {
  start: "register a session start",
  decision: "append a decision to decisions-log.md",
  next: "advance the session one move and print the instruction to answer",
  run: "drive the in-flight session to done in one command, identity from the record",
  wait: "wait for the instruction owed an answer, print it and exit (run it in the background)",
  drive: "run the next session end to end: the framework drives, the engine answers",
  interrupt: "end the engine's running invocation under a driven session, with a reason",
  rebaseline: "record a repair made while the run was stopped, and move the baseline",
  report: "answer the driver's outstanding instruction",
  plan: "record the plan prose in project-work-plan.md; `plan amend` changes a driven step",
  "hold-release": "hold this session's release, for a person's reason; it closes as held",
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
    "  --engine ENGINE          claude-code | copilot | codex. Required unless this",
    "                           machine has chosen one with `dabbler configure",
    "                           --engine`, which a terminal reads and an editor",
    "                           setting could not; the flag wins over the choice",
    "  --provider PROVIDER      required: anthropic | openai | google",
    "  --model MODEL            required for a Copilot seat; identity resolves through",
    "                           the model registry rather than the seat label",
    "  --effort EFFORT          optional reasoning effort, recorded with the identity",
    "  --reviewer-model MODEL   the Primary Reviewer for THIS session only: recorded on",
    "                           the session and written nowhere else, so this",
    "                           checkout's reviewer and the machine's default are as",
    "                           they were. Never from the author's vendor",
    "  --auxiliary-model MODEL  the Auxiliary Reviewer for this session only, kept the",
    "                           same way. Never from the author's vendor or the",
    "                           Primary Reviewer's",
    "  --total-sessions N       optional; the ledger otherwise grows to the plan",
    "  --merge-origin           merge origin's branch when it shares no history with",
    "                           this one and holds more than a README (a README-only",
    "                           initial commit is merged without it)",
    "  --commit-changes         commit the uncommitted changes a start refuses over,",
    "                           push them where the branch has an upstream, and start",
    "  --undo-changes           copy those changes outside the repository, undo them",
    "                           in the tree, and start",
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
  next: [
    "  --transport T            the verification transport, as `dabbler verify` takes it;",
    "                           kept on the run, so naming it again changes it",
    "",
    "  `session start --engine ... --provider ...` registers a session; `next` never",
    "  does. It advances the one in flight, carrying no identity -- the record holds",
    "  it -- and a `next` that names an engine with nothing in flight is refused",
    "  rather than starting work nobody asked for. With nothing in flight it says",
    "  `done`.",
    "",
    "  Stdout carries one thing: the instruction, as driver-instruction JSON. Do what",
    "  its `ask` says and start its `answer_command` as a background command: it",
    "  carries `--next`, so it stays open while the framework works and what it prints",
    "  is the next instruction -- until one says `done`. This is called once. Called",
    "  again while the framework runs something long it answers `wait`: leave it",
    "  `retry_after_seconds`, read its `log` if you like, and call it again.",
  ],
  run: [
    "  --mailbox                the older loop, kept as a fallback a person starts by",
    "                           hand. The AI answers from its own CLI: a background",
    "                           `dabbler session wait` prints each instruction, and this",
    "                           loop waits for its report and runs everything between",
    "  --show-engine MODE       stream | quiet, for a registered built-in engine",
    "  --max-invocations N      the paid-invocation budget for this run",
    "",
    "  With --mailbox the AI keeps `dabbler session wait` running in the background;",
    "  this loop never issues `wait` and never needs `next` called.",
    "",
    "  Identity comes from the record: the registered orchestrator is invoked per",
    "  instruction when its engine has a built-in command; any other engine degrades",
    "  to watcher-only -- the loop waits, and the clock readings say what is owed.",
  ],
  drive: [
    "  --engine ENGINE          required: claude-code | copilot | codex -- who",
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
    "  --transport T            the verification transport, as `dabbler verify` takes it",
  ],
  interrupt: [
    "  --reason TEXT            required: what the engine reads next -- the driver ends the",
    "                           running invocation and re-invokes with it",
    "  --stop                   halt the loop instead of re-invoking: `interrupted` lands on",
    "                           run.json with the reason, the session stays in flight, and",
    "                           `session drive` re-runs from the phase it reached",
  ],
  rebaseline: [
    "  --reason TEXT            required: what was repaired while the loop was halted",
    "  --by WHO                 who made it; defaults to the operator",
  ],
  report: [
    "  --seq N                  required: the seq of the instruction being answered",
    "  --next                   then stay open while the framework works, and print the",
    "                           next instruction as JSON on stdout: run it as a background",
    "                           command. Repeated after its process died, it answers",
    "                           nothing twice and prints what is owed",
    "  a step report, when the instruction asked for one:",
    "  --step ID                the step id the instruction named",
    "  --status STATUS          done | blocked",
    "  --files A,B,...          every file created or changed, repo-relative; leave it",
    "                           out and the framework takes them from the diff",
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
    "  --step ID                the step to amend; required unless --max-rounds or",
    "                           --drop-non-goal is given",
    "  --files A,B              the step's files as they should now read, whole",
    "  --checks-file PATH       the step's checks, whole, as JSON: [{\"argv\": [...]}]",
    "  --max-rounds N           instead of a step: the verification round cap this RUN",
    "                           verifies under. It is not typeable on `next` or `drive`;",
    "                           here the change carries a reason and the rounds already",
    "                           run, and no gate reads it",
    "  --drop-non-goal TEXT     instead of a step: drop ONE declared non-goal the work",
    "                           has falsified, word for word as it was declared. Nothing",
    "                           adds a non-goal -- that would put reviewed work out of",
    "                           scope afterwards. Every round from here is shown the",
    "                           drop with its reason, and judges the reason",
    "  --reason TEXT            required: why this is the minimal change. Who was working",
    "                           is on the record from `session start` and is written",
    "                           into the row; there is no flag for it",
  ],
  "hold-release": [
    "  --reason TEXT            required: why this session publishes nothing",
    "",
    "  A person's verb, for the session in flight: a release that cannot or should",
    "  not happen is held, and the session closes as held instead of stopping at the",
    "  publish. One way only -- nothing releases a hold -- and refused once the",
    "  session has published. Whether a session releases at all is its accepted",
    "  plan's to say, under this checkout's `dabbler.release`.",
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
    "  --force                  a person's form, refused to an engine; the session in",
    "                           flight is cancelled by its number and a reason without it",
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

/**
 * Flags a session no longer takes, refused with the rule that replaced them.
 * Refused rather than read as `--flag value`: a dropped flag that parsed as
 * nothing would publish, and a misspelled one is a usage error already.
 */
const RETIRED_FLAGS: ReadonlyMap<string, string> = new Map([
  ...["--releasable", "--not-releasable"].map(
    (flag) =>
      [
        flag,
        `argument ${flag}: gone -- whether a session releases is its accepted plan's to say, under this ` +
          "checkout's `dabbler.release`; a person holds one in flight with `dabbler session hold-release`",
      ] as const,
  ),
  ["--module", "argument --module: gone -- a session works in the whole solution, and its plan's steps name every file it changes"],
]);

const SWITCHES = new Set([
  "--commit-changes",
  "--dry-run",
  "--force",
  "--mailbox",
  "--merge-origin",
  "--next",
  "--stop",
  "--undo-changes",
]);

/** The flag three verbs once required, and the sentence that says why they no longer take it. */
export const APPROVER_FLAG = "--approver";
export const APPROVER_GONE =
  `${APPROVER_FLAG} is gone: the record already knows who is working, from ` +
  "`dabbler session start`, and writes it into the row -- give --reason and nothing about who";

/**
 * Why a driving call refuses `--max-rounds` instead of accepting it.
 *
 * Refused and not ignored: the parser above takes any `--flag value` pair,
 * so a removed flag would be dropped in silence, and a cap the operator
 * believes they set is worse than one they were told they cannot.
 */
const CAP_NOT_TYPEABLE =
  "the verification round cap is not typeable here. It is " +
  "`verification.settings.max_rounds` in the configuration, and it moves for one run " +
  'through `dabbler session plan amend --max-rounds <N> --reason "<why>"` -- which ' +
  "records the reason, the rounds already run and who was working. Typed " +
  "on a driving call it always won over the persisted value and recorded nothing, in " +
  "either direction: a cap at or below the rounds already run ends verification.";

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
    const retired = RETIRED_FLAGS.get(equals === -1 ? token : token.slice(0, equals));
    if (retired !== undefined) return retired;
    if (equals !== -1) {
      const flag = token.slice(0, equals);
      values.set(flag, token.slice(equals + 1));
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

  if (values.has(APPROVER_FLAG)) {
    writeErr(`dabbler session ${subcommand}: ${APPROVER_GONE}\n`);
    return EXIT_USAGE;
  }

  if (subcommand === "plan" && parsed.positional[0] === "amend") {
    const stepId = values.get("--step");
    const reason = values.get("--reason");
    const maxRounds = integer(values.get("--max-rounds"), "--max-rounds");
    if (typeof maxRounds === "string") {
      writeErr(`dabbler session plan amend: ${maxRounds}\n`);
      return EXIT_USAGE;
    }
    const droppedNonGoal = values.get("--drop-non-goal");
    // Three amendments, one per call. The cap belongs to the run, not to a
    // step; a dropped non-goal belongs to the declaration. One moves what a
    // step is measured against, one how many reviews the tree may still
    // have, one what the work is held to -- and each carries its own reason.
    if (maxRounds !== null && stepId !== undefined) {
      writeErr(
        "dabbler session plan amend: argument --max-rounds: not allowed with argument --step\n",
      );
      return EXIT_USAGE;
    }
    if (droppedNonGoal !== undefined && stepId !== undefined) {
      writeErr(
        "dabbler session plan amend: argument --drop-non-goal: not allowed with argument --step\n",
      );
      return EXIT_USAGE;
    }
    if (droppedNonGoal !== undefined && maxRounds !== null) {
      writeErr(
        "dabbler session plan amend: argument --drop-non-goal: not allowed with " +
          "argument --max-rounds\n",
      );
      return EXIT_USAGE;
    }
    const missing = [
      stepId === undefined && maxRounds === null && droppedNonGoal === undefined
        ? "--step"
        : null,
      reason === undefined ? "--reason" : null,
    ].filter((flag): flag is string => flag !== null);
    if (missing.length > 0) {
      // An amendment for no stated reason is a bar moved for nothing -- so
      // neither is optional.
      writeErr(
        `dabbler session plan amend: the following arguments are required: ${missing.join(", ")}
`,
      );
      return EXIT_USAGE;
    }
    const files = values.get("--files");
    return planAmend(sessionsDir, {
      stepId: stepId ?? null,
      files:
        files === undefined
          ? null
          : files.split(",").map((entry) => entry.trim()).filter((entry) => entry !== ""),
      checksFile: values.get("--checks-file") ?? null,
      maxRounds,
      dropNonGoal: droppedNonGoal ?? null,
      reason: reason as string,
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
      engine: !personIsPresent(),
    });
  }

  if (subcommand === "hold-release") {
    const reason = values.get("--reason");
    if (reason === undefined) {
      writeErr("dabbler session hold-release: the following arguments are required: --reason\n");
      return EXIT_USAGE;
    }
    return holdRelease(sessionsDir, { reason, engine: !personIsPresent() });
  }

  if (subcommand === "cancel" || subcommand === "restore") {
    const positional = integer(parsed.positional[0], "session_number");
    if (typeof positional === "string") {
      writeErr(`dabbler session ${subcommand}: ${positional}\n`);
      return EXIT_USAGE;
    }
    // A cancel that names no session is the one in flight's: a stop is about
    // one session, and the command it prints needs nothing typed into it but
    // the reason. A restore names its session, because nothing in flight is one.
    const inFlight = subcommand === "cancel" ? readSessionState(sessionsDir)?.["currentSession"] : null;
    const target = positional ?? sessionNumber ?? (typeof inFlight === "number" ? inFlight : null);
    if (target === null) {
      writeErr(
        `dabbler session ${subcommand}: the following arguments are required: session_number\n`,
      );
      return EXIT_USAGE;
    }
    if (subcommand === "restore") {
      return restore(sessionsDir, target, { reason: values.get("--reason") ?? "" });
    }
    const reason = values.get("--reason");
    if (reason === undefined) {
      writeErr("dabbler session cancel: the following arguments are required: --reason\n");
      return EXIT_USAGE;
    }
    return cancel(sessionsDir, target, { reason, force: switches.has("--force"), engine: !personIsPresent() });
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
    // The flag, then this checkout's choice, then this machine's default --
    // the layers every choice is read through, from files this router reads
    // for itself, so a start typed at a shell sees what the editor's pane set.
    // The flag still wins, because a person who typed one meant it.
    const engine =
      explainEngine(values.get("--engine") ?? null, repoRootFromSessionsDir(sessionsDir)).transport || undefined;
    if (engine === undefined) {
      writeErr(
        "dabbler session start: the following arguments are required: --engine\n" +
          "  Neither this checkout nor this machine has chosen an engine. Set one\n" +
          "  once, and every start here uses it:\n" +
          "    dabbler configure --engine <claude-code|copilot|codex>\n",
      );
      return EXIT_USAGE;
    }
    const totalSessions = integer(values.get("--total-sessions"), "--total-sessions");
    if (typeof totalSessions === "string") {
      writeErr(`dabbler session start: ${totalSessions}\n`);
      return EXIT_USAGE;
    }
    return await start(sessionsDir, {
      engine,
      provider: values.get("--provider") ?? null,
      model: values.get("--model") ?? null,
      effort: values.get("--effort") ?? null,
      reviewerModel: values.get("--reviewer-model") ?? null,
      auxiliaryModel: values.get("--auxiliary-model") ?? null,
      sessionNumber,
      totalSessions,
      mergeOrigin: switches.has("--merge-origin"),
      commitChanges: switches.has("--commit-changes"),
      undoChanges: switches.has("--undo-changes"),
    });
  }

  if (subcommand === "next") {
    if (values.has("--max-rounds")) {
      writeErr(`dabbler session next: ${CAP_NOT_TYPEABLE}\n`);
      return EXIT_USAGE;
    }
    return sessionNext(sessionsDir, {
      engine: values.get("--engine") ?? null,
      provider: values.get("--provider") ?? null,
      model: values.get("--model") ?? null,
      effort: values.get("--effort") ?? null,
      transport: values.get("--transport") ?? null,
      waitInCallMs: WAIT_IN_CALL_MS,
    });
  }

  if (subcommand === "wait") {
    // The AI's side of the mailbox: run in the background, so the chat stays
    // free, and re-armed after each answer. It reads and never writes.
    return sessionWait(sessionsDir);
  }

  if (subcommand === "run") {
    // One command, the whole session: the developer's vocabulary is start,
    // interact, cancel -- `run` is the start that stays. Identity comes
    // from the record (the registered orchestrator), never from a flag: a
    // person should not have to remember what the ledger already knows.
    return runWholeSession(sessionsDir, {
      maxInvocations: (() => {
        const parsed = integer(values.get("--max-invocations"), "--max-invocations");
        return typeof parsed === "string" ? null : parsed;
      })(),
      showEngine: values.get("--show-engine") ?? null,
      mailbox: switches.has("--mailbox"),
    });
  }

  if (subcommand === "drive") {
    // Before anything else this call requires: a flag that no longer works
    // is what the person needs told, whatever else they left out.
    if (values.has("--max-rounds")) {
      writeErr(`dabbler session drive: ${CAP_NOT_TYPEABLE}\n`);
      return EXIT_USAGE;
    }
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

  if (subcommand === "rebaseline") {
    const reason = values.get("--reason");
    if (reason === undefined) {
      writeErr(
        "dabbler session rebaseline: the following arguments are required: --reason\n",
      );
      return EXIT_USAGE;
    }
    return rebaseline(sessionsDir, { reason, by: values.get("--by") ?? null, sessionNumber });
  }

  if (subcommand === "report") {
    const answerFile = values.get("--answer-file");
    const required =
      answerFile === undefined
        ? ["--seq", "--step", "--status", "--notes"]
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
    // Chained, the answer is also the request for what follows it.
    const answer = switches.has("--next") ? reportAndNext : report;
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
      return answer(sessionsDir, { seq: seq!, answerFile, sessionNumber });
    }
    return answer(sessionsDir, {
      seq: seq!,
      stepId: values.get("--step")!,
      status: values.get("--status")!,
      // Absent: the framework takes the step's files from the diff it computes.
      files: values.has("--files") ? values.get("--files")!.split(",") : null,
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

  // Every subcommand in SUMMARY has returned by here.
  writeErr(`dabbler session: '${subcommand}' is not a subcommand\n\n${usage()}`);
  return EXIT_USAGE;
}

export { EXIT_BOUNDARY };
