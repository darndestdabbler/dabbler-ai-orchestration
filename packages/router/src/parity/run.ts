// The parity control's driver.
//
// The port is correct when the TypeScript router, given the same
// repository and the same verb, writes the same bytes the Python router
// writes and exits with the same code. This runs that check and answers
// with an exit code: 0 identical, 1 drift, 2 could not run.
//
// It is not a test. A test of test infrastructure is a banned kind, and
// this proves nothing about either router alone -- it proves only that
// they agree, which is the one thing a port has to be true.
//
// A verb enters the control in the session that ports its module and
// never leaves. `docs/ts-port-parity-control.md` is where the verb table
// and the shapes it runs against are specified; `CASES` below is that
// table as the runner reads it, and it grows one entry at a time as the
// modules land. Nothing is compared before its TypeScript side exists.

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { VERBS } from "../contracts/verbs.ts";
import { isImplemented } from "../cli/registry.ts";
import { compareCopies, type PathDifference } from "./compare.ts";
import { normalize } from "./normalize.ts";
import {
  CorpusError,
  METRICS_FIXTURE_ROWS,
  SHAPES,
  buildShape,
  findShape,
  python,
  runProcess,
  type BuildContext,
  type RunOutcome,
} from "./corpus.ts";

export const EXIT_IDENTICAL = 0;
export const EXIT_DRIFT = 1;
export const EXIT_CANNOT_RUN = 2;

/** One verb run against one shape, both ways. */
export interface ParityCase {
  /** The `dabbler` verb this belongs to; it enters when that verb is implemented. */
  readonly verb: string;
  /** How it is written in a report: `session start`, `verify dispute`. */
  readonly label: string;
  readonly shapes: readonly string[];
  /** Args after `python -m`, given the built repository. */
  readonly pythonArgs: (repo: string, sessionsDir: string) => string[];
  /** Args after `dabbler`, given the built repository. */
  readonly dabblerArgs: (repo: string, sessionsDir: string) => string[];
  /** What a green row means for this case, for the record. */
  readonly proves: string;
}

/**
 * The verb table as the runner reads it. It grows one entry at a time as
 * the modules land, and a verb never leaves.
 *
 * The specification carries the full table with its shapes and its
 * sessions; what is here is only what a run needs to execute, so the two
 * do not restate each other.
 */
export const CASES: readonly ParityCase[] = [
  {
    verb: "metrics",
    label: "metrics",
    // Both shapes, because the report is a function of the config the
    // repository resolves as well as of the telemetry: `fresh` and
    // `in-flight` differ in what the record holds, and the config layering
    // must survive both.
    shapes: ["fresh", "in-flight"],
    pythonArgs: () => ["ai_router.metrics"],
    dabblerArgs: () => ["metrics"],
    // No environment override: the corpus's own `local-overrides.yaml` is
    // what points the report at the canned telemetry, so the third config
    // layer is not merely present but LOAD-BEARING. A router that dropped
    // it would read the machine's file beside the bundled config and print
    // a different report, which is the difference this case would catch.
    proves:
      `the whole report over ${METRICS_FIXTURE_ROWS} canned call(s), and the ` +
      "config load beneath it: the bundled default, the tracked dabbler.yaml " +
      "and the machine-local overlay that names the telemetry it read",
  },
  {
    verb: "session",
    label: "session start",
    // `fresh` registers from nothing: the first `sessions.json`, the plan
    // seeding, the first activity-log rows, the first `state-writes.jsonl`
    // row and the rendered work plan. `in-flight` re-registers over a
    // record that already exists, which is the path that has to preserve
    // every earlier session's title, verdict and verification summary --
    // the array rebuild, not the array creation.
    shapes: ["fresh", "in-flight"],
    pythonArgs: (_repo, sessionsDir) => [
      "ai_router.session", "start",
      "--sessions-dir", sessionsDir,
      "--engine", "claude-code",
      "--provider", "anthropic",
    ],
    dabblerArgs: (_repo, sessionsDir) => [
      "session", "start",
      "--sessions-dir", sessionsDir,
      "--engine", "claude-code",
      "--provider", "anthropic",
    ],
    proves:
      "the whole registration: the session array rebuilt against the plan " +
      "with titles healed, the orchestrator block and its derived identity " +
      "provenance, the plan steps seeded under the step keys the engine " +
      "cannot guess, the register step logged by the machine rather than " +
      "reported, the digest ledger row, and the rendered project work plan",
  },
  {
    verb: "session",
    label: "session declare",
    // Only `fresh`: `in-flight` has already declared, and a second
    // declaration is refused -- which is a case worth having, but it is
    // the refusal below rather than this one.
    shapes: ["fresh"],
    pythonArgs: (_repo, sessionsDir) => [
      "ai_router.session", "declare",
      "--sessions-dir", sessionsDir,
      "--task", "Build the widget.",
      "--not-releasable",
    ],
    dabblerArgs: (_repo, sessionsDir) => [
      "session", "declare",
      "--sessions-dir", sessionsDir,
      "--task", "Build the widget.",
      "--not-releasable",
    ],
    proves:
      "the declaration gate and the work plan it renders: the working-tree " +
      "question that decides whether the work has begun, the activity-log " +
      "row, and the table and per-session sections folded out of it",
  },
  {
    verb: "session",
    label: "session declare (refused: already declared)",
    // The refusal is compared because a refusal's wording is what the
    // operator reads, and because it exercises the branch a passing case
    // never reaches. `in-flight` declared during its build, so a second
    // declaration here is refused by both routers -- with the same
    // sentence and the same exit code, or it is drift.
    shapes: ["in-flight"],
    pythonArgs: (_repo, sessionsDir) => [
      "ai_router.session", "declare",
      "--sessions-dir", sessionsDir,
      "--task", "A second declaration.",
      "--releasable",
    ],
    dabblerArgs: (_repo, sessionsDir) => [
      "session", "declare",
      "--sessions-dir", sessionsDir,
      "--task", "A second declaration.",
      "--releasable",
    ],
    proves:
      "that a second declaration is refused identically by both routers, " +
      "with the same sentence and the same exit code, and that neither " +
      "wrote anything -- a declaration made twice is a session choosing in " +
      "hindsight what it may publish",
  },
  {
    verb: "session",
    label: "session log",
    // `in-flight` only: `fresh` has no session started, and logging there
    // is the boundary refusal rather than the write.
    shapes: ["in-flight"],
    pythonArgs: (_repo, sessionsDir) => [
      "ai_router.session", "log",
      "--sessions-dir", sessionsDir,
      "--step", "build-the-widget",
      "--status", "complete",
      "--note", "The widget is real.",
    ],
    dabblerArgs: (_repo, sessionsDir) => [
      "session", "log",
      "--sessions-dir", sessionsDir,
      "--step", "build-the-widget",
      "--status", "complete",
      "--note", "The widget is real.",
    ],
    proves:
      "resolving a step against the rows `start` seeded and appending its " +
      "status row -- including the derived step key, which is the identity " +
      "an orphan row would miss",
  },
  {
    verb: "session",
    label: "session decision",
    // Both shapes: the decision's ordinal is `len(decisions) + 1` over the
    // whole log, and the rendered file emits a session heading where the
    // session changes. `fresh` writes D1 into an empty file; `in-flight`
    // writes into a log that already carries plan rows and a declaration,
    // which is where an off-by-one in the ordinal would show.
    shapes: ["fresh", "in-flight"],
    pythonArgs: (_repo, sessionsDir) => [
      "ai_router.session", "decision",
      "--sessions-dir", sessionsDir,
      "--decider", "orchestrator",
      "--headline", "The widget returns two",
      "--body", "One was a placeholder — this is the measured value.",
    ],
    dabblerArgs: (_repo, sessionsDir) => [
      "session", "decision",
      "--sessions-dir", sessionsDir,
      "--decider", "orchestrator",
      "--headline", "The widget returns two",
      "--body", "One was a placeholder — this is the measured value.",
    ],
    proves:
      "the decision row and the log folded from it: the writer-assigned " +
      "identifier and ordinal, the decider label, and the rendered heading " +
      "order -- plus that a non-ASCII body survives both serializers, which " +
      "is where `ensure_ascii` would differ",
  },
  {
    verb: "affected",
    label: "affected",
    // `in-flight` only: the selector needs a change set, and `fresh` has no
    // session started, so its baseline question has no answer to compare.
    shapes: ["in-flight"],
    pythonArgs: (_repo, sessionsDir) => [
      "ai_router.affected", "--sessions-dir", sessionsDir,
    ],
    dabblerArgs: (_repo, sessionsDir) => ["affected", "--sessions-dir", sessionsDir],
    proves:
      "the whole selection as an operator reads it: the baseline the change " +
      "set was measured against, the configured rule that maps the edited " +
      "source to its test, the unmapped record files that raise " +
      "selection_unknown and buy the smoke test instead of the suite, the " +
      "reason column's width, and the runner each declared suite is handed",
  },
  {
    verb: "test-evidence",
    label: "test-evidence record (preverify-targeted)",
    // The stage whose command is judged rather than trusted. `in-flight`
    // already carries one such row, so this appends a second and the
    // comparison covers the row AND the policy that admitted it.
    shapes: ["in-flight"],
    pythonArgs: (_repo, sessionsDir) => [
      "ai_router.test_evidence", "record",
      "--sessions-dir", sessionsDir,
      "--suite", "unit",
      "--stage", "preverify-targeted",
      "--command", "python -m pytest tests/test_widget.py",
      "--outcome", "passed",
      "--duration-seconds", "1.5",
    ],
    dabblerArgs: (_repo, sessionsDir) => [
      "test-evidence", "record",
      "--sessions-dir", sessionsDir,
      "--suite", "unit",
      "--stage", "preverify-targeted",
      "--command", "python -m pytest tests/test_widget.py",
      "--outcome", "passed",
      "--duration-seconds", "1.5",
    ],
    proves:
      "the covered-surface digest computed byte-identically by both routers " +
      "-- the sorted (path, content-hash) fold, with the session's own " +
      "bookkeeping and the run ledger left out of it -- plus the policy that " +
      "judged the command, the selected tests it names, and the float that " +
      "must be written 1.5 rather than rounded",
  },
  {
    verb: "test-evidence",
    label: "test-evidence record (final-full)",
    // The run of record. It binds to the WHOLE tree rather than the suite's
    // covers, so this compares the second digest as well as the first, and
    // the branch that refuses a caller-supplied command never runs here.
    shapes: ["in-flight"],
    pythonArgs: (_repo, sessionsDir) => [
      "ai_router.test_evidence", "record",
      "--sessions-dir", sessionsDir,
      "--suite", "unit",
      "--stage", "final-full",
      "--outcome", "passed",
      "--duration-seconds", "42",
    ],
    dabblerArgs: (_repo, sessionsDir) => [
      "test-evidence", "record",
      "--sessions-dir", sessionsDir,
      "--suite", "unit",
      "--stage", "final-full",
      "--outcome", "passed",
      "--duration-seconds", "42",
    ],
    proves:
      "the run of record and the tree digest it binds to: the whole-tree fold " +
      "over every tracked and untracked non-ignored path, which is a second " +
      "digest and a different scope from the suite's covers, and the " +
      "`--duration-seconds 42` that both routers must write as the float 42.0",
  },
];

// --- Preconditions -----------------------------------------------------------

export interface Routers {
  readonly interpreter: string;
  readonly cliEntry: string;
}

function repoRootFrom(packageRoot: string): string {
  return join(packageRoot, "..", "..");
}

/**
 * Both routers, or a refusal. The control refuses -- `unknown`, never
 * `pass` -- when either side cannot be executed: a comparison that ran
 * against one router is not a weaker proof, it is no proof.
 */
export function resolveRouters(packageRoot: string): Routers {
  const repoRoot = repoRootFrom(packageRoot);
  const candidates =
    process.platform === "win32"
      ? [join(repoRoot, ".venv", "Scripts", "python.exe"), "python"]
      : [join(repoRoot, ".venv", "bin", "python"), "python3", "python"];

  let interpreter: string | undefined;
  for (const candidate of candidates) {
    const probe = python(candidate, repoRoot, ["ai_router.progress", "--help"]);
    if (probe.code === 0) {
      interpreter = candidate;
      break;
    }
  }
  if (!interpreter) {
    throw new CorpusError(
      "the Python router could not be executed; the corpus is built by it, " +
        "so there is nothing to compare against",
    );
  }

  // Built here, every time, rather than found. `dist/` is not tracked, so
  // a fresh clone has none -- and a bundle left over from an earlier
  // checkout would be worse than none, because the control would compare
  // a router nobody wrote against the Python one and call it parity.
  const built = runProcess(process.execPath, ["build.mjs"], packageRoot);
  if (built.code !== 0) {
    throw new CorpusError(
      `the TypeScript router could not be built: ${
        (built.stderr || built.stdout).trim() || `exit ${built.code}`
      }`,
    );
  }
  const cliEntry = join(packageRoot, "dist", "dabbler.cjs");
  if (!existsSync(cliEntry)) {
    throw new CorpusError(`the build produced no ${cliEntry}`);
  }

  return { interpreter, cliEntry };
}

// --- The run -----------------------------------------------------------------

export interface CaseReport {
  readonly label: string;
  readonly shape: string;
  /** What a green row for this case means; see `ParityCase.proves`. */
  readonly proves: string;
  readonly pythonExit: number | null;
  readonly typescriptExit: number | null;
  readonly compared: number;
  readonly differences: readonly PathDifference[];
  readonly stdoutDiffers: boolean;
  readonly stderrDiffers: boolean;
}

export interface DeterminismReport {
  readonly shape: string;
  readonly compared: number;
  readonly differences: readonly PathDifference[];
}

export interface ParityReport {
  readonly determinism: readonly DeterminismReport[];
  readonly cases: readonly CaseReport[];
  readonly activeVerbs: readonly string[];
  readonly exitCode: number;
  readonly lines: readonly string[];
}

function runCase(
  parityCase: ParityCase,
  shape: string,
  routers: Routers,
  workspace: string,
): CaseReport {
  const context: BuildContext = { interpreter: routers.interpreter };
  const pythonRepo = buildShape(shape, join(workspace, `${shape}-python`), context);
  const typescriptRepo = buildShape(
    shape,
    join(workspace, `${shape}-typescript`),
    context,
  );

  const pythonSessions = join(pythonRepo, "docs", "sessions");
  const typescriptSessions = join(typescriptRepo, "docs", "sessions");

  const left = python(
    routers.interpreter,
    pythonRepo,
    parityCase.pythonArgs(pythonRepo, pythonSessions),
  );
  const right = runCli(
    routers,
    typescriptRepo,
    parityCase.dabblerArgs(typescriptRepo, typescriptSessions),
  );

  // BOTH streams, on EVERY verb. The design named read-only verbs' stdout
  // and selected refusals' stderr; a verifier pointed out in session 22
  // that "everything a verb emits" is both simpler and stricter than a
  // list, and a list is a thing to forget to add to (D137).
  const roots = [pythonRepo, typescriptRepo];
  const differs = (a: string, b: string): boolean =>
    normalize(a, roots) !== normalize(b, roots);

  const comparison = compareCopies(pythonRepo, typescriptRepo);
  return {
    label: parityCase.label,
    shape,
    proves: parityCase.proves,
    pythonExit: left.code,
    typescriptExit: right.code,
    compared: comparison.compared,
    differences: comparison.differences,
    stdoutDiffers: differs(left.stdout, right.stdout),
    stderrDiffers: differs(left.stderr, right.stderr),
  };
}

/** The TypeScript router, as a caller on a PATH would reach it. */
function runCli(routers: Routers, cwd: string, args: string[]): RunOutcome {
  return runProcess(process.execPath, [routers.cliEntry, ...args], cwd);
}

/**
 * One shape, built twice, compared to itself.
 *
 * This is the half of parity that does not need two routers, and it is a
 * precondition for the other half: two runs of one builder differ only in
 * their root and their timestamps, which is exactly what the two
 * normalizations erase. A record write that is not deterministic -- a set
 * iterated in hash order, a float formatted by locale, a digest over a
 * timestamp -- fails here, and would otherwise fail later as a router
 * difference that is not one.
 *
 * It exercises the whole comparison engine on real router output: the
 * corpus builder, both normalizations, the walk, the allow-list and the
 * diff. It found the digest-ledger defect the first time it was run.
 */
export function checkShapeDeterminism(
  shape: string,
  routers: Routers,
  workspace: string,
): DeterminismReport {
  const context: BuildContext = { interpreter: routers.interpreter };
  const left = buildShape(shape, join(workspace, `${shape}-a`), context);
  const right = buildShape(shape, join(workspace, `${shape}-b`), context);
  const result = compareCopies(left, right);
  return {
    shape,
    compared: result.compared,
    differences: result.differences,
  };
}

/**
 * The control.
 *
 * Two comparisons, and it is red if either finds drift:
 *
 * 1. **Determinism** -- every corpus shape whose builder exists, built
 *    twice through the Python router and compared. Runs from session 23,
 *    because it needs one router rather than two.
 * 2. **Router parity** -- every ported verb run through both routers
 *    against two copies of the same shape. Grows one case at a time from
 *    session 26; before that the list is empty, and the control's answer
 *    rests on (1) alone rather than on nothing.
 */
export function runParity(packageRoot: string): ParityReport {
  const routers = resolveRouters(packageRoot);
  const activeVerbs = VERBS.filter((spec) => isImplemented(spec.verb)).map(
    (spec) => spec.verb,
  );
  const active = CASES.filter((parityCase) => isImplemented(parityCase.verb));
  const buildable = SHAPES.filter((shape) => shape.build);

  if (buildable.length === 0) {
    throw new CorpusError(
      "no corpus shape has a builder, so the control can compare nothing",
    );
  }

  const workspace = mkdtempSync(join(tmpdir(), "dabbler-parity-"));
  try {
    const determinism = buildable.map((shape) =>
      checkShapeDeterminism(shape.name, routers, workspace),
    );
    const reports: CaseReport[] = [];
    for (const parityCase of active) {
      for (const shape of parityCase.shapes) {
        if (!findShape(shape)) {
          throw new CorpusError(`'${parityCase.label}' names no such shape '${shape}'`);
        }
        reports.push(runCase(parityCase, shape, routers, workspace));
      }
    }
    return summarize(determinism, reports, activeVerbs);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

function summarize(
  determinism: readonly DeterminismReport[],
  reports: readonly CaseReport[],
  activeVerbs: readonly string[],
): ParityReport {
  const lines: string[] = [];
  let drift = false;
  let compared = 0;

  for (const report of determinism) {
    compared += report.compared;
    for (const difference of report.differences) {
      drift = true;
      lines.push(
        difference.kind === "content"
          ? `${report.shape} is not deterministic: ${difference.path}\n${difference.diff}`
          : `${report.shape} is not deterministic: ${difference.path} (${difference.kind})`,
      );
    }
  }

  for (const report of reports) {
    compared += report.compared;
    const where = `${report.label} on ${report.shape}`;
    if (report.pythonExit !== report.typescriptExit) {
      drift = true;
      lines.push(
        `${where}: exit ${report.pythonExit} (python) vs ${report.typescriptExit} (typescript)`,
      );
    }
    if (report.stdoutDiffers) {
      drift = true;
      lines.push(`${where}: stdout differs`);
    }
    if (report.stderrDiffers) {
      drift = true;
      lines.push(`${where}: stderr differs`);
    }
    for (const difference of report.differences) {
      drift = true;
      lines.push(
        difference.kind === "content"
          ? `${where}: ${difference.path}\n${difference.diff}`
          : `${where}: ${difference.path} (${difference.kind})`,
      );
    }
  }

  if (!drift) {
    // A green control has to say what it compared. "analyzer: pass" over an
    // empty case list and over a real two-router comparison are the same row
    // otherwise, and a reader cannot tell a proof from a vacuum (D161).
    const shapes = determinism.map((report) => report.shape).join(", ");
    lines.push(
      `parity: ${determinism.length} shape(s) build identically twice ` +
        `(${shapes}); ${reports.length} verb case(s) compared through both ` +
        `routers; ${compared} path(s) in all.`,
    );
    for (const report of reports) {
      lines.push(
        `parity: ${report.label} on ${report.shape} -- same exit code, ` +
          `stdout, stderr and tree; proves ${report.proves}.`,
      );
    }
    if (reports.length === 0) {
      lines.push(
        "parity: no verb is ported yet, so the router comparison is empty; " +
          "the determinism comparison above is what this run proves.",
      );
    }
  }
  return {
    determinism,
    cases: reports,
    activeVerbs,
    exitCode: drift ? EXIT_DRIFT : EXIT_IDENTICAL,
    lines,
  };
}
