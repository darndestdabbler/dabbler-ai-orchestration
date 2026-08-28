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
}

/**
 * Empty until session 26 lands the first ported writer. The specification
 * carries the full table; duplicating it here before the verbs exist would
 * be a second statement of it, and the two would drift in the direction of
 * whichever was easier to edit.
 */
export const CASES: readonly ParityCase[] = [];

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
  readonly pythonExit: number | null;
  readonly typescriptExit: number | null;
  readonly compared: number;
  readonly differences: readonly PathDifference[];
  readonly stdoutDiffers: boolean;
  readonly stderrDiffers: boolean;
}

export interface ParityReport {
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

/** Every active case, compared. */
export function runParity(packageRoot: string): ParityReport {
  const routers = resolveRouters(packageRoot);
  const activeVerbs = VERBS.filter((spec) => isImplemented(spec.verb)).map(
    (spec) => spec.verb,
  );
  const active = CASES.filter((parityCase) => isImplemented(parityCase.verb));

  if (active.length === 0) {
    const next = Math.min(...VERBS.map((spec) => spec.portedInSession));
    return {
      cases: [],
      activeVerbs,
      exitCode: EXIT_IDENTICAL,
      lines: [
        "parity: no verb has been ported yet, so nothing is compared.",
        `parity: both routers are executable; the first verbs enter in session ${next}.`,
      ],
    };
  }

  const workspace = mkdtempSync(join(tmpdir(), "dabbler-parity-"));
  try {
    const reports: CaseReport[] = [];
    for (const parityCase of active) {
      for (const shape of parityCase.shapes) {
        if (!findShape(shape)) {
          throw new CorpusError(`'${parityCase.label}' names no such shape '${shape}'`);
        }
        reports.push(runCase(parityCase, shape, routers, workspace));
      }
    }
    return summarize(reports, activeVerbs);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

function summarize(
  reports: readonly CaseReport[],
  activeVerbs: readonly string[],
): ParityReport {
  const lines: string[] = [];
  let drift = false;
  let compared = 0;

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
    lines.push(
      `parity: ${reports.length} case(s) over ${compared} compared path(s) are identical.`,
    );
  }
  return {
    cases: reports,
    activeVerbs,
    exitCode: drift ? EXIT_DRIFT : EXIT_IDENTICAL,
    lines,
  };
}
