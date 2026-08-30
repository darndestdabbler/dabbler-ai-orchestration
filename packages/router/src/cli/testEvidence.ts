// `dabbler test-evidence record` -- the run of record, and the pre-verification
// run that precedes it.
//
// `record` is the only subcommand an orchestrator needs, and it is the only
// one the Python module has. What a run proves depends entirely on when it was
// taken, so `--stage` is required and closed; a pre-verification run is judged
// against the selector here rather than trusted, because the command IS the
// evidence.

import { spawnSync } from "node:child_process";

import { nowIso } from "../journal.ts";
import { loadConfig } from "../config.ts";
import { SessionsRootNotFoundError, repoRootFor, resolveSessionsDir } from "../evidence.ts";
import { loadSelectionConfig, selectTests, targetedCommand } from "../checks.ts";
import {
  OUTCOME_PASSED,
  OUTCOME_FAILED,
  OUTCOMES,
  OUTCOME_NONE_SELECTED,
  POLICY_NONE_SELECTED,
  POLICY_VIOLATION,
  RecordError,
  STAGES,
  STAGE_FINAL_FULL,
  STAGE_PREVERIFY_TARGETED,
  loadSuitesChecked,
  recordRun,
  type SuiteSpec,
} from "../testEvidence.ts";
import {
  classifyPreverifyCommand,
  preverifyBaseline,
  preverifyRecipe,
  workingTreeChanges,
} from "../affected.ts";
import { closeLastStep } from "../session.ts";
import { readSessionState } from "../progress.ts";
import { writeErr, writeOut } from "./output.ts";

/** The session in flight, for the bookend when no `--session-number` is given. */
function currentSessionNumber(sessionsDir: string): number | null {
  const state = readSessionState(sessionsDir);
  const current = state ? state["currentSession"] : null;
  return typeof current === "number" ? current : null;
}

const EXIT_OK = 0;
const EXIT_USAGE = 2;

function usage(): string {
  return [
    "usage: dabbler test-evidence record [-h] [--sessions-dir SESSIONS_DIR]",
    "                                    --suite SUITE",
    `                                    --stage {${STAGES.join(",")}}`,
    `                                    --outcome {${OUTCOMES.join(",")}}`,
    "                                    --duration-seconds DURATION_SECONDS",
    "                                    [--command COMMAND]",
    "                                    [--allow-full-preverify REASON]",
    "                                    [--session-number SESSION_NUMBER]",
    "                                    [--detail DETAIL]",
    "",
  ].join("\n");
}

interface Parsed {
  readonly values: Map<string, string>;
}

const FLAGS = new Set([
  "--sessions-dir", "--suite", "--stage", "--outcome", "--duration-seconds",
  "--command", "--allow-full-preverify", "--session-number", "--detail",
]);

function parseArgs(argv: readonly string[]): Parsed | string {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] as string;
    const equals = token.indexOf("=");
    const name = equals === -1 ? token : token.slice(0, equals);
    if (!FLAGS.has(name)) return `unrecognized arguments: ${token}`;
    if (equals !== -1) {
      values.set(name, token.slice(equals + 1));
      continue;
    }
    const next = argv[index + 1];
    if (next === undefined) return `argument ${name}: expected one argument`;
    values.set(name, next);
    index += 1;
  }
  return { values };
}

/**
 * The policy verdict for a pre-verification run, or the exit code that says
 * the selection could not be computed at all.
 *
 * It lives beside the command rather than in `testEvidence.ts` because the
 * dependency runs one way: `affected` reads that module's vocabulary, and a
 * module that imported back would be a cycle Python breaks with a
 * function-local import.
 */
interface Judged {
  readonly policy: string;
  readonly reason: string;
  readonly selected: ReadonlyArray<readonly [string, string]>;
  readonly sanctioned: string;
}

/**
 * Verify the claim that the selector chose nothing, rather than trust it.
 *
 * The row this produces is the only honest thing to write for a change that
 * affects no test, and the reason it cannot simply be asserted is the same
 * reason no verdict is hand-written anywhere else: an outcome a caller can
 * state without the framework checking is an outcome a caller can be wrong
 * about. Re-running the selection is a file scan, so checking costs less than
 * trusting.
 */
function judgeNoneSelected(
  config: unknown,
  suite: SuiteSpec,
  sessionsDir: string,
  command: string | undefined,
): Judged | number {
  if (command !== undefined) {
    writeErr(
      `test_evidence: --command does not apply to ${OUTCOME_NONE_SELECTED}; ` +
        "nothing ran, which is what the outcome records.\n",
    );
    return EXIT_USAGE;
  }
  const root = repoRootFor(sessionsDir);
  if (root === null) {
    writeErr(`test_evidence: no git repository found above ${sessionsDir}\n`);
    return EXIT_USAGE;
  }
  const loaded = loadSelectionConfig(config);
  if (!loaded.ok) {
    writeErr(
      "test_evidence: testing.selection is malformed: " + loaded.errors.join("; ") + "\n",
    );
    return EXIT_USAGE;
  }
  const changed = workingTreeChanges(root, preverifyBaseline(root, sessionsDir));
  if (changed === null) {
    writeErr(
      "test_evidence: could not determine the change set, so " +
        `${OUTCOME_NONE_SELECTED} cannot be proved against it.\n`,
    );
    return EXIT_USAGE;
  }
  const mine = selectTests(root, changed, loaded.config).forSuite(suite.name);
  if (mine.allTestsAffected || mine.testPaths.length > 0) {
    const count = mine.allTestsAffected ? "every" : String(mine.testPaths.length);
    writeErr(
      `test_evidence: the selector chose ${count} test(s) of ${suite.name}, so ` +
        `${OUTCOME_NONE_SELECTED} is not what happened. Run them and record ` +
        "the run.\n",
    );
    return EXIT_USAGE;
  }
  return {
    policy: POLICY_NONE_SELECTED,
    reason: `the selector ran and named no test of ${suite.name}`,
    selected: [],
    sanctioned: "",
  };
}

function judgePreverifyCommand(
  config: unknown,
  suite: SuiteSpec,
  sessionsDir: string,
  command: string | undefined,
  overrideReason: string | undefined,
): Judged | number {
  if (String(command ?? "").trim() === "") {
    writeErr(
      "test_evidence: --command is required for a preverify-targeted record; " +
        "the command that ran is what the policy judges.\n",
    );
    return EXIT_USAGE;
  }
  const root = repoRootFor(sessionsDir);
  if (root === null) {
    writeErr(`test_evidence: no git repository found above ${sessionsDir}\n`);
    return EXIT_USAGE;
  }
  const loaded = loadSelectionConfig(config);
  if (!loaded.ok) {
    writeErr(
      "test_evidence: testing.selection is malformed: " + loaded.errors.join("; ") + "\n",
    );
    return EXIT_USAGE;
  }
  const changed = workingTreeChanges(root, preverifyBaseline(root, sessionsDir));
  if (changed === null) {
    writeErr(
      "test_evidence: could not determine the change set; a targeted run " +
        "cannot be proved targeted against an unknown one.\n",
    );
    return EXIT_USAGE;
  }
  // Narrowed to what this suite owns: a repository with two runners has two
  // selections, and judging one runner's command against the other's tests
  // would refuse every honest run in a two-ecosystem repository.
  const mine = selectTests(root, changed, loaded.config).forSuite(suite.name);
  const verdict = classifyPreverifyCommand(command, mine, {
    overrideReason: overrideReason ?? null,
    runsWhole: suite.runsWhole,
    declaredCommand: suite.command,
  });
  return {
    policy: verdict.policy,
    reason: verdict.reason,
    selected: mine.selected.map((entry) => [entry.path, entry.reason] as const),
    sanctioned: targetedCommand(suite.command, mine, { runsWhole: suite.runsWhole }),
  };
}

/**
 * Run a declared suite here, and record it with a start this framework saw.
 *
 * The reason it exists is provenance, not convenience. A caller that runs the
 * suite and then reports how long it took has described a window rather than
 * evidenced one -- restore a reference, read the output, record a minute
 * later, and the inferred start lands after the restore for a run that
 * happened before it. Spawning the command here makes the start a fact, which
 * is the only thing that lets a run of record be accepted in a repository
 * that has used source mode at all.
 *
 * It also removes a step the operator should never have been doing by hand:
 * the command is the one the repository declares, so there is nothing to
 * mistype.
 */
function runSuite(argv: readonly string[]): number {
  if (argv.includes("--help") || argv.includes("-h")) {
    writeOut(runUsage());
    return EXIT_OK;
  }
  const parsed = parseArgs(argv);
  if (typeof parsed === "string") {
    writeErr(`dabbler test-evidence run: ${parsed}\n`);
    return EXIT_USAGE;
  }
  const { values } = parsed;
  const missing = ["--suite", "--stage"].filter((flag) => !values.has(flag));
  if (missing.length > 0) {
    writeErr(
      "dabbler test-evidence run: the following arguments are required: " +
        `${missing.join(", ")}\n`,
    );
    return EXIT_USAGE;
  }
  const stage = values.get("--stage") as string;
  if (!STAGES.includes(stage)) {
    writeErr(
      "dabbler test-evidence run: argument --stage: invalid choice: " +
        `'${stage}' (choose from ${STAGES.map((entry) => `'${entry}'`).join(", ")})\n`,
    );
    return EXIT_USAGE;
  }

  let sessionsDir: string;
  try {
    sessionsDir = resolveSessionsDir(values.get("--sessions-dir"));
  } catch (error) {
    if (!(error instanceof SessionsRootNotFoundError)) throw error;
    writeErr(`test_evidence: ${error.message}\n`);
    return EXIT_USAGE;
  }
  const loaded = loadSuitesChecked(loadConfig());
  if (loaded.errors.length > 0) {
    writeErr(`test_evidence: testing.suites is malformed: ${loaded.errors.join("; ")}\n`);
    return EXIT_USAGE;
  }
  const suiteName = values.get("--suite") as string;
  const suite = loaded.suites.find((entry) => entry.name === suiteName);
  if (suite === undefined) {
    writeErr(
      `test_evidence: unknown suite '${suiteName}'; declared: ` +
        `${loaded.suites.map((entry) => `'${entry.name}'`).join(", ") || "(none)"}\n`,
    );
    return EXIT_USAGE;
  }
  const root = repoRootFor(sessionsDir);
  if (root === null) {
    writeErr(`test_evidence: no git repository found above ${sessionsDir}\n`);
    return EXIT_USAGE;
  }

  // The declared command, and the caller's only when they named one -- a
  // targeted pre-verification run is a subset of the suite, and refusing to
  // run it here would send the operator back to typing it by hand.
  const command = values.get("--command") ?? suite.command;
  // The same policy judgement `record` makes, from the same inputs. A run
  // that spawns the suite here does not get a different vocabulary from one
  // the operator ran -- that would be two rules for one question.
  const overrideReason = values.get("--allow-full-preverify");
  let policy = "";
  let policyReason = "";
  let selected: ReadonlyArray<readonly [string, string]> = [];
  if (stage === STAGE_PREVERIFY_TARGETED) {
    const judged = judgePreverifyCommand(
      loadConfig(),
      suite,
      sessionsDir,
      command,
      overrideReason,
    );
    if (typeof judged === "number") return judged;
    ({ policy, reason: policyReason, selected } = judged);
  }
  const observedStart = nowIso("microseconds");
  writeOut(`running ${suiteName}: ${command}\n`);
  const started = Date.now();
  const proc = spawnSync(command, {
    cwd: root,
    shell: true,
    stdio: "inherit",
    encoding: "utf8",
  });
  const durationSeconds = Math.max(1, Math.round((Date.now() - started) / 1000));
  const outcome = proc.status === 0 ? OUTCOME_PASSED : OUTCOME_FAILED;

  try {
    const record = recordRun(sessionsDir, suite, outcome, {
      stage,
      durationSeconds,
      command: stage === STAGE_PREVERIFY_TARGETED ? command : null,
      policy,
      policyReason,
      selectedTests: selected,
      sessionNumber: currentSessionNumber(sessionsDir),
      observedStart,
      repoRoot: root,
    });
    writeOut(
      `recorded ${record.suite} [${record.stage}]: ${record.outcome} ` +
        `in ${durationSeconds}s (timed here)\n`,
    );
  } catch (error) {
    if (!(error instanceof RecordError)) throw error;
    writeErr(`test_evidence: ${error.message}\n`);
    return EXIT_USAGE;
  }
  return outcome === OUTCOME_PASSED ? EXIT_OK : 1;
}

function runUsage(): string {
  return [
    "usage: dabbler test-evidence run [-h] [--sessions-dir SESSIONS_DIR]",
    "                                 --suite SUITE",
    `                                 --stage {${STAGES.join(",")}}`,
    "                                 [--command COMMAND]",
    "                                 [--allow-full-preverify REASON]",
    "",
    "  Runs the suite here and records it with a start this framework saw.",
    "  A run of record in a repository that has used source mode needs that:",
    "  a duration reported after the fact cannot show when the run happened.",
    "",
  ].join("\n");
}

export async function testEvidenceVerb(argv: string[]): Promise<number> {
  const [subcommand, ...rest] = argv;
  if (subcommand === undefined || subcommand === "--help" || subcommand === "-h") {
    writeOut(usage());
    return subcommand === undefined ? EXIT_USAGE : EXIT_OK;
  }
  if (subcommand !== "record" && subcommand !== "run") {
    writeErr(
      `dabbler test-evidence: argument command: invalid choice: '${subcommand}' ` +
        "(choose from 'record', 'run')\n",
    );
    return EXIT_USAGE;
  }
  if (subcommand === "run") return runSuite(rest);

  // Before the option parser, for the reason `session` needs the same guard:
  // `--help` otherwise reaches a parser that reads it as an unrecognized
  // argument, so the flag that documents the command refuses it instead.
  if (rest.includes("--help") || rest.includes("-h")) {
    writeOut(usage());
    return EXIT_OK;
  }

  const parsed = parseArgs(rest);
  if (typeof parsed === "string") {
    writeErr(`dabbler test-evidence record: ${parsed}\n`);
    return EXIT_USAGE;
  }
  const { values } = parsed;

  const missing = ["--suite", "--stage", "--outcome", "--duration-seconds"].filter(
    (flag) => !values.has(flag),
  );
  if (missing.length > 0) {
    writeErr(
      `dabbler test-evidence record: the following arguments are required: ` +
        `${missing.join(", ")}\n`,
    );
    return EXIT_USAGE;
  }
  const stage = values.get("--stage") as string;
  if (!STAGES.includes(stage)) {
    writeErr(
      `dabbler test-evidence record: argument --stage: invalid choice: ` +
        `'${stage}' (choose from ${STAGES.map((s) => `'${s}'`).join(", ")})\n`,
    );
    return EXIT_USAGE;
  }
  const outcome = values.get("--outcome") as string;
  if (!OUTCOMES.includes(outcome)) {
    writeErr(
      `dabbler test-evidence record: argument --outcome: invalid choice: ` +
        `'${outcome}' (choose from ${OUTCOMES.map((o) => `'${o}'`).join(", ")})\n`,
    );
    return EXIT_USAGE;
  }
  const rawDuration = values.get("--duration-seconds") as string;
  const durationSeconds = Number(rawDuration);
  if (rawDuration.trim() === "" || !Number.isFinite(durationSeconds)) {
    writeErr(
      `dabbler test-evidence record: argument --duration-seconds: invalid ` +
        `float value: '${rawDuration}'\n`,
    );
    return EXIT_USAGE;
  }
  const rawSession = values.get("--session-number");
  let sessionNumber: number | null = null;
  if (rawSession !== undefined) {
    if (!/^-?\d+$/.test(rawSession)) {
      writeErr(
        `dabbler test-evidence record: argument --session-number: invalid int ` +
          `value: '${rawSession}'\n`,
      );
      return EXIT_USAGE;
    }
    sessionNumber = Number.parseInt(rawSession, 10);
  }

  let sessionsDir: string;
  try {
    sessionsDir = resolveSessionsDir(values.get("--sessions-dir"));
  } catch (error) {
    if (!(error instanceof SessionsRootNotFoundError)) throw error;
    writeErr(`test_evidence: ${error.message}\n`);
    return EXIT_USAGE;
  }

  const config = loadConfig();
  const loaded = loadSuitesChecked(config);
  if (loaded.errors.length > 0) {
    writeErr(
      "test_evidence: testing.suites is malformed: " + loaded.errors.join("; ") + "\n",
    );
    return EXIT_USAGE;
  }
  const suiteName = values.get("--suite") as string;
  const suite = loaded.suites.find((entry) => entry.name === suiteName);
  if (suite === undefined) {
    const declared = loaded.suites.map((entry) => `'${entry.name}'`);
    writeErr(
      `test_evidence: unknown suite '${suiteName}'; declared: ` +
        `${declared.length > 0 ? `[${declared.join(", ")}]` : "(none)"}\n`,
    );
    return EXIT_USAGE;
  }

  const command = values.get("--command");
  const overrideReason = values.get("--allow-full-preverify");
  let policy = "";
  let policyReason = "";
  let sanctioned = "";
  let selected: ReadonlyArray<readonly [string, string]> = [];
  if (stage === STAGE_PREVERIFY_TARGETED && outcome === OUTCOME_NONE_SELECTED) {
    const judged = judgeNoneSelected(config, suite, sessionsDir, command);
    if (typeof judged === "number") return judged;
    ({ policy, reason: policyReason, selected, sanctioned } = judged);
  } else if (stage === STAGE_PREVERIFY_TARGETED) {
    const judged = judgePreverifyCommand(
      config,
      suite,
      sessionsDir,
      command,
      overrideReason,
    );
    if (typeof judged === "number") return judged;
    ({ policy, reason: policyReason, selected, sanctioned } = judged);
    // Truthiness on the command, as the Python branch has it: an empty
    // `--command` falls through to the write boundary, which refuses it in
    // the record's own words rather than in the parser's.
  } else if (Boolean(command) || overrideReason !== undefined) {
    writeErr(
      "test_evidence: --command and --allow-full-preverify describe a " +
        "pre-verification run; a final-full run is the declared suite command " +
        `(${suite.command}) against the final verified tree.\n`,
    );
    return EXIT_USAGE;
  }

  let record;
  try {
    record = recordRun(sessionsDir, suite, outcome, {
      stage,
      durationSeconds,
      command: command ?? null,
      policy,
      policyReason,
      selectedTests: selected,
      sessionNumber,
      detail: values.get("--detail") ?? "",
    });
  } catch (error) {
    if (!(error instanceof RecordError)) throw error;
    writeErr(`test_evidence: ${error.message}\n`);
    return EXIT_USAGE;
  }

  if (record.policy === POLICY_VIOLATION) {
    // Written, then refused: the wasted run is the evidence, and a refusal
    // that suppressed its own record would hide the ceremony it exists to
    // price.
    const remedy = sanctioned
      ? preverifyRecipe(sessionsDir, suite.name, sanctioned)
      : "Nothing needed to run here; record nothing and go straight to " +
        "verification.";
    writeErr(
      `test_evidence: recorded and REFUSED as ${POLICY_VIOLATION} -- ` +
        `${record.policyReason}\n${remedy}\n`,
    );
    return EXIT_USAGE;
  }

  writeOut(
    `recorded ${record.suite} [${record.stage}]: ${record.outcome} ` +
      `(digest ${record.surfaceDigest.slice(0, 12)})` +
      (record.policy ? ` policy ${record.policy}` : "") +
      "\n",
  );
  if (record.outcome === OUTCOME_PASSED) {
    if (record.stage === STAGE_PREVERIFY_TARGETED) {
      writeOut(`Next: dabbler verify --sessions-dir ${sessionsDir}\n`);
    } else if (record.stage === STAGE_FINAL_FULL) {
      writeOut(
        "Next: git commit, then git push -- once -- then\n" +
          `  dabbler session close --sessions-dir ${sessionsDir}\n`,
      );
    }
  }

  // The second bookend, and deliberately AFTER the policy refusal above: a
  // run recorded and then refused is not an accepted run of record, and
  // marking the last task done on the strength of one would say the session
  // finished something it did not.
  if (
    record.stage === STAGE_FINAL_FULL &&
    record.outcome === OUTCOME_PASSED &&
    record.policy !== POLICY_VIOLATION
  ) {
    const number =
      typeof sessionNumber === "number"
        ? sessionNumber
        : currentSessionNumber(sessionsDir);
    if (number !== null) {
      const { error } = closeLastStep(sessionsDir, number);
      if (error) {
        writeErr(`test_evidence: the last task row could not be moved -- ${error}\n`);
      }
    }
  }
  return EXIT_OK;
}
