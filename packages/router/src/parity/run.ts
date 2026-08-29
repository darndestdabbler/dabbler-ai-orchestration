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
  SEAT_STORE_PATH,
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
  /**
   * A `python -m` invocation run on BOTH copies before the compared verb.
   *
   * For a verb whose interesting path needs a state no built shape carries
   * -- `restore` needs a cancelled session. It runs through the Python
   * router, which is how every shape is built, so the case still compares
   * exactly one verb; a setup that differed between the copies would be
   * comparing two questions.
   */
  readonly setup?: (repo: string, sessionsDir: string) => string[];
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
/** Prose for the `session plan` case; the render is what is compared. */
const PLAN_BODY =
  "Two sessions: author the plan, then break it into numbered work.";

const CANCEL_REASON = "the parity control cancels it";
const RESTORE_REASON = "and puts it back";

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
  {
    verb: "discovery",
    label: "discovery status",
    // `fresh` is the shape whose seed carries the record; `in-flight` would
    // add nothing, because freshness is a function of the two lock files and
    // not of the ledger.
    shapes: ["fresh"],
    pythonArgs: () => ["ai_router.discovery", "status"],
    dabblerArgs: () => ["discovery", "status"],
    proves:
      "both records dated against their thresholds: the API record read as " +
      "TOML and aged from its OLDEST per-vendor stamp rather than its " +
      "record-level date, the seat catalog resolved relative to the config " +
      "that names it and read for its probe date, and the stale/fresh " +
      "verdict and the refresh command each row names",
  },
  {
    verb: "discovery",
    label: "discovery drift",
    shapes: ["fresh"],
    pythonArgs: () => ["ai_router.discovery", "drift"],
    dabblerArgs: () => ["discovery", "drift"],
    proves:
      "the record-against-roles diff: every role's preference order joined " +
      "against both records, the two sorted directions, the comma-joined " +
      "provenance of each id, the `(none)` branches, and the freshness " +
      "block underneath",
  },
  {
    verb: "discovery",
    label: "discovery enumerate --dry-run",
    shapes: ["fresh"],
    pythonArgs: () => ["ai_router.discovery", "enumerate", "--dry-run"],
    dabblerArgs: () => ["discovery", "enumerate", "--dry-run"],
    proves:
      "the vendor count and the record path the write would take, and that " +
      "a dry run reaches no endpoint and writes nothing",
  },
  {
    verb: "discovery",
    label: "discovery enumerate",
    // The only compared verb that WRITES a lock file, and the reason the
    // corpus scrubs the provider keys: with none set, a vendor fails as
    // `no-api-key` before a socket opens. One vendor keeps a fake key and
    // a closed-port URL, so the same case also reaches a REAL transport
    // failure and both routers have to classify it into the same word.
    shapes: ["fresh"],
    pythonArgs: () => ["ai_router.discovery", "enumerate"],
    dabblerArgs: () => ["discovery", "enumerate"],
    proves:
      "the record write, and the shared failure vocabulary underneath it: " +
      "two vendors refused for want of a credential and one classified from " +
      "a refused connection, where each router's own HTTP library raises a " +
      "different class for the same event; plus the merge that annotates a " +
      "failed vendor instead of emptying it, a vendor gaining a status row " +
      "it did not have, the providers sorted by name, unknown written by " +
      "omission, the writer stamp, and the per-vendor lines the command prints",
  },
  {
    verb: "seat-cost",
    label: "seat-cost (a measurement that is a floor)",
    // The shape is irrelevant: this verb reads a store outside the
    // repository, which the corpus supplies. `fresh` is the cheapest one to
    // build.
    shapes: ["fresh"],
    pythonArgs: (repo) => [
      "ai_router.seat_cost", "conv-a", "conv-b", "conv-nope",
      "--store", join(repo, ...SEAT_STORE_PATH.split("/")),
    ],
    dabblerArgs: (repo) => [
      "seat-cost", "conv-a", "conv-b", "conv-nope",
      "--store", join(repo, ...SEAT_STORE_PATH.split("/")),
    ],
    proves:
      "the whole reading of another program's SQLite store: the nano-AIU sum " +
      "over two events and the credits and dollars derived from it, a " +
      "conversation known with no usage read as a genuine zero rather than " +
      "an absence, the id the store does not know demoting the answer to a " +
      "floor, and the reason line that says which of the three it was",
  },
  {
    verb: "seat-cost",
    label: "seat-cost (nothing to measure)",
    shapes: ["fresh"],
    pythonArgs: (repo) => [
      "ai_router.seat_cost", "conv-nope",
      "--store", join(repo, ...SEAT_STORE_PATH.split("/")),
    ],
    dabblerArgs: (repo) => [
      "seat-cost", "conv-nope",
      "--store", join(repo, ...SEAT_STORE_PATH.split("/")),
    ],
    // The branch worth its own case: an absent measurement is never 0.0, and
    // the exit code is what a caller reads to tell the two apart.
    proves:
      "that neither router invents a number it does not have: no credits " +
      "line at all, the sentence naming why, and the non-zero exit that " +
      "distinguishes an absent measurement from a measured zero",
  },

  {
    verb: "session",
    label: "session plan",
    // `fresh` only: the plan prose is rewritten wholesale, so the second
    // write proves nothing the first does not.
    shapes: ["fresh"],
    pythonArgs: (_repo, sessionsDir) => [
      "ai_router.session", "plan",
      "--sessions-dir", sessionsDir,
      "--body", PLAN_BODY,
    ],
    dabblerArgs: (_repo, sessionsDir) => [
      "session", "plan",
      "--sessions-dir", sessionsDir,
      "--body", PLAN_BODY,
    ],
    proves:
      "the project work plan rendered from the record rather than from the " +
      "prose it was handed: the plan entry appended to the activity log, and " +
      "the numbered session list rebuilt beneath the prose from the ledger",
  },
  {
    verb: "session",
    label: "session close --dry-run",
    // Both shapes, and this is the case the session was told to run first:
    // a gate that differs by one row is the set's worst outcome, and the
    // dry run prints every row with its remediation and writes nothing.
    // `fresh` has no record at all; `in-flight` has a session, a
    // declaration, an edited file and a recorded preverify run, so four of
    // the five gates reach their real predicate rather than their first
    // guard.
    shapes: ["fresh", "in-flight"],
    pythonArgs: (_repo, sessionsDir) => [
      "ai_router.session", "close", "--dry-run",
      "--sessions-dir", sessionsDir,
    ],
    dabblerArgs: (_repo, sessionsDir) => [
      "session", "close", "--dry-run",
      "--sessions-dir", sessionsDir,
    ],
    proves:
      "all five gate rows, in order, padded to one width, each with the " +
      "remediation sentence an operator acts on -- the ledger read, the " +
      "worktree diff against the verified tree, the upstream comparison, " +
      "the freshness verdict per declared suite, and the verdict vocabulary",
  },
  {
    verb: "session",
    label: "session close (refused at the gates)",
    // The other half of the same command: the rows are printed, then the
    // refusal lands on stderr and nothing is written. Only `in-flight`,
    // because `fresh` has no session to close and never reaches the gates.
    shapes: ["in-flight"],
    pythonArgs: (_repo, sessionsDir) => [
      "ai_router.session", "close",
      "--sessions-dir", sessionsDir,
    ],
    dabblerArgs: (_repo, sessionsDir) => [
      "session", "close",
      "--sessions-dir", sessionsDir,
    ],
    proves:
      "that a close over a session with no verification round refuses " +
      "identically and lands nothing: the same gate rows, the same count in " +
      "the refusal, the same exit code, and no state flip, no commit and no " +
      "push on either side",
  },
  {
    verb: "session",
    label: "session cancel --force",
    shapes: ["in-flight"],
    pythonArgs: (_repo, sessionsDir) => [
      "ai_router.session", "cancel", "1",
      "--reason", CANCEL_REASON, "--force",
      "--sessions-dir", sessionsDir,
    ],
    dabblerArgs: (_repo, sessionsDir) => [
      "session", "cancel", "1",
      "--reason", CANCEL_REASON, "--force",
      "--sessions-dir", sessionsDir,
    ],
    proves:
      "a boundary reversal written through the sanctioned writer: the prior " +
      "status kept as preCancelStatus, the reason and the stamp on the " +
      "session record rather than in a marker file, the schema and " +
      "invariants re-checked before the write, and the ledger row it earns",
  },
  {
    verb: "session",
    label: "session restore",
    shapes: ["in-flight"],
    // The only write path `restore` has needs a cancelled session, and no
    // built shape carries one. The setup runs through the PYTHON router on
    // both copies -- the same way every shape is built -- so what the case
    // compares is still one verb, run twice.
    setup: (_repo, sessionsDir) => [
      "ai_router.session", "cancel", "1",
      "--reason", CANCEL_REASON, "--force",
      "--sessions-dir", sessionsDir,
    ],
    pythonArgs: (_repo, sessionsDir) => [
      "ai_router.session", "restore", "1",
      "--reason", RESTORE_REASON,
      "--sessions-dir", sessionsDir,
    ],
    dabblerArgs: (_repo, sessionsDir) => [
      "session", "restore", "1",
      "--reason", RESTORE_REASON,
      "--sessions-dir", sessionsDir,
    ],
    proves:
      "the reversal undone to the status the session actually carried: " +
      "preCancelStatus consumed rather than left behind, the cancellation " +
      "reason and stamp removed, the restore reason recorded, and the same " +
      "one-line JSON naming the status it went back to",
  },
  {
    verb: "progress",
    label: "progress --json",
    // Both shapes, because the projection's SOURCE differs between them:
    // `fresh` has no ledger and renders the sessions its plan declares,
    // `in-flight` renders the ledger. A router that keyed the fall back on
    // the read returning null rather than on the file being absent would
    // agree on one and not the other.
    shapes: ["fresh", "in-flight"],
    pythonArgs: (_repo, sessionsDir) => [
      "ai_router.progress", "--json", "--sessions-dir", sessionsDir,
    ],
    dabblerArgs: (_repo, sessionsDir) => [
      "progress", "--json", "--sessions-dir", sessionsDir,
    ],
    proves:
      "the whole Work Explorer projection: where the sessions came from, " +
      "the display number and healed title per session, the icon key, the " +
      "invariant violation or its absence, and the task and verification " +
      "sub-views with their refusals -- the JSON the extension renders and " +
      "re-implements nothing of",
  },
  {
    verb: "progress",
    label: "progress (no flag)",
    shapes: ["fresh"],
    pythonArgs: (_repo, sessionsDir) => [
      "ai_router.progress", "--sessions-dir", sessionsDir,
    ],
    dabblerArgs: (_repo, sessionsDir) => ["progress", "--sessions-dir", sessionsDir],
    proves:
      "that `--json` is inert on both sides: there is one output mode, and " +
      "a router that made the flag mean something would print a different " +
      "thing here than it does one case above",
  },
  {
    verb: "modules",
    label: "modules create",
    shapes: ["fresh"],
    pythonArgs: (repo) => [
      "ai_router.modules", "create", repo,
      "--slug", "greeter", "--title", "Greeter",
      "--plan-path", "docs/modules/greeter.md",
      "--code-root", "src/greeter", "--code-root", "tests/greeter",
      "--spec-section", "docs/reference.md#greeting",
    ],
    dabblerArgs: (repo) => [
      "modules", "create", repo,
      "--slug", "greeter", "--title", "Greeter",
      "--plan-path", "docs/modules/greeter.md",
      "--code-root", "src/greeter", "--code-root", "tests/greeter",
      "--spec-section", "docs/reference.md#greeting",
    ],
    proves:
      "the manifest as two YAML emitters write it -- the entry appended in " +
      "declaration order with its repeatable lists, sequences at their key's " +
      "indent, and the one-line JSON echo of what was written",
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

  if (parityCase.setup) {
    for (const [repo, sessions] of [
      [pythonRepo, pythonSessions],
      [typescriptRepo, typescriptSessions],
    ] as const) {
      const prepared = python(routers.interpreter, repo, parityCase.setup(repo, sessions));
      if (prepared.code !== 0) {
        throw new CorpusError(
          `${parityCase.label}: the setup for shape '${shape}' exited ` +
            `${prepared.code}: ${(prepared.stderr || prepared.stdout).trim()}`,
        );
      }
    }
  }

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
