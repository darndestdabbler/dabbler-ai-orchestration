// `Router`, satisfied by spawning `python -m ai_router.<module>`.
//
// This is the only implementation the extension has, and the only file in
// it that knows Python exists. Everything above it — the tree, the
// commands, the projection poll — asks a `Router` for an answer and reads
// a `RouterResult`, which is why session 35 can swap the in-process router
// underneath without any of them changing.
//
// Two things it deliberately does NOT own.
//
// **The verb-to-module mapping is not written here.** It is `VERBS`, in
// the router package, and the whole point of that table is that there is
// one of it. A second list of `"ai_router.session"` strings in this file
// would be the drift the contract exists to end — and it would go stale
// silently, because a spawn of a module that no longer exists fails at
// run time on an operator's machine rather than at compile time here.
//
// **The exit-code contract is not restated here either.** `classify` in
// `routerCli.ts` turns a process into a `RouterCliResult` for the output
// channel; `outcomeForExitCode` turns the same code into the contract's
// vocabulary. This file is where the two meet, and it takes the
// contract's word for what a code means.
//
// ---
//
// **Why some verbs answer with a refusal instead of an argv.**
//
// A verb is built here when its command line was read off the Python
// parser that will receive it. The rest refuse by name. That is not
// caution: writing the remaining argv from the contract's option names
// alone produced three command lines that were wrong on inspection —
// `modules list` and `modules retire` are not subcommands `ai_router.
// modules` has (it has exactly `create`), and `verify dispute` takes
// `--finding`, not `--finding-index`. Nothing in the extension calls any
// of them, so no test would have caught it and no operator would have
// found out until the moment they needed it to work.
//
// A refusal that names the verb is a better answer than a command line
// nobody has run. Each becomes an argv when something calls it and a test
// drives it — or, sooner, when its module is ported and the answer stops
// being a spawn at all.

import {
  EXIT_OK,
  RouterUnavailableError,
  VERBS,
  outcomeForExitCode,
} from "dabbler-ai-router";
import type {
  AffectedOptions,
  ApprovedPlan,
  ApprovedPlanVerbs,
  BootstrapOptions,
  LedgerVerbs,
  ModuleCreateOptions,
  ModuleVerbs,
  ProgressProjection,
  RepositoryTarget,
  Router,
  RouterResult,
  RouterText,
  Rounds,
  SessionCancelOptions,
  SessionCloseOptions,
  SessionDeclareOptions,
  SessionDecisionOptions,
  SessionLogOptions,
  SessionRestoreOptions,
  SessionStartOptions,
  SessionVerbs,
  TestEvidenceVerbs,
  VerifyRoundOptions,
  VerifyVerbs,
  WorkflowVerbs,
} from "dabbler-ai-router";
import {
  RouterCliResult,
  RunRouterCliDeps,
  buildCommandLine,
  runRouterCli,
} from "./routerCli";
import { resolvePythonInterpreter } from "./pythonInterpreter";
import type { RouterCommands, RouterRefusal } from "./host";
import { parseProjectionPayload } from "./projectionPayload";

/**
 * The Python module one verb runs as.
 *
 * A verb the table marks `pythonCli: false` is reached as a library on
 * the Python side and has no command line. Naming a `python -m` for it
 * would produce an argparse failure the operator cannot act on, so the
 * lookup returns null and the caller refuses by saying so.
 */
export function pythonModuleFor(verb: string): string | null {
  const spec = VERBS.find((v) => v.verb === verb);
  if (!spec || spec.pythonCli === false) return null;
  return spec.pythonModule;
}

/**
 * A verb this implementation cannot run, as an answer rather than an
 * exception. Nothing was attempted, so it is not a refusal the router
 * made — the message says which it is.
 */
function unbuilt<T>(verb: string): RouterResult<T> {
  const spec = VERBS.find((v) => v.verb === verb);
  const where =
    spec?.pythonCli === false
      ? `${spec.pythonModule} is reached as a library and has no command line`
      : `no command line for it is built here; run it from the session lifecycle`;
  return {
    ok: false,
    outcome: "failed",
    exitCode: null,
    message:
      `\`${verb}\` is not reachable through the extension: ${where}. ` +
      `It answers directly once session ${spec?.portedInSession ?? "?"} ports it.`,
  };
}

const refuse = <T,>(verb: string): Promise<RouterResult<T>> =>
  Promise.resolve(unbuilt<T>(verb));

/**
 * How a call names itself in the missing-interpreter message, which reads
 * "<label> needs a Python interpreter, but none was found". Derived from
 * the verb rather than passed in, so a verb cannot arrive without one and
 * no second table has to be kept in step with `VERBS`.
 */
function actionLabelFor(verb: string, args: readonly string[]): string {
  const sub = args[0] && !args[0].startsWith("-") ? ` ${args[0]}` : "";
  return `The "dabbler ${verb}${sub}" command`;
}

/** Push `--flag value` only when the value is present. */
function optional(args: string[], flag: string, value: string | undefined): void {
  if (value !== undefined && value !== "") args.push(flag, value);
}

/**
 * `--sessions-dir` is passed whenever the caller knows it, even though
 * the router derives it from the working directory: the extension stands
 * outside the tree it is asking about, and naming the root it scanned
 * keeps the answer bound to that root rather than to whatever cwd
 * resolution finds.
 */
function targetArgs(target: RepositoryTarget): string[] {
  const args: string[] = [];
  optional(args, "--sessions-dir", target.sessionsDir);
  return args;
}

export class PythonSpawnRouter implements Router, RouterCommands {
  /**
   * `deps` is the spawn seam the unit suite drives: an injected spawn, a
   * captured echo, a stubbed interpreter. Production passes nothing.
   */
  constructor(private readonly deps: RunRouterCliDeps = {}) {}

  /**
   * The line an operator would type to run this verb themselves.
   *
   * It is built from the same module table and the same builder as the
   * spawn, so what the extension pre-types into a terminal and what it
   * runs itself cannot say different things about one verb. The
   * interpreter is its resolved absolute path rather than a friendly
   * `python`: running `python -m ai_router.…` against a DIFFERENT
   * interpreter than the extension used, and getting a different answer,
   * is the whole failure class `pythonInterpreter.ts` exists to prevent.
   */
  public commandLine(
    verb: string,
    args: readonly string[],
    cwd: string,
  ): string | null {
    const module = pythonModuleFor(verb);
    if (module === null) return null;
    const resolve = this.deps.resolveInterpreter ?? resolvePythonInterpreter;
    return buildCommandLine(resolve(cwd), { module, args: [...args] });
  }

  // --- The one spawn ---------------------------------------------------------

  /**
   * Run one verb.
   *
   * `silent` suppresses the output channel. It is set for reads, and only
   * for reads: the command log answers "what has Dabbler been running?",
   * and a 30-second projection poll writing to it would bury every answer
   * the operator opened it for. Nothing that writes is ever silent.
   */
  private async run(
    verb: string,
    args: string[],
    cwd: string,
    silent = false,
  ): Promise<RouterCliResult> {
    const module = pythonModuleFor(verb);
    if (module === null) throw new Error(`${verb} has no Python command line`);
    const result = await runRouterCli(
      {
        module,
        args,
        cwd,
        actionLabel: actionLabelFor(verb, args),
        // A read is polled and nobody is watching it, so it gets a
        // deadline; a write is a command the operator asked for and is
        // watching, so it does not. `silent` picks out exactly the reads.
        ...(silent ? { timeoutMs: READ_TIMEOUT_MS } : {}),
      },
      silent ? { ...this.deps, echo: SILENT_ECHO } : this.deps,
    );
    // `unavailable` is the one outcome with no place in the contract, and
    // that is deliberate: it is not the router's verdict but the absence
    // of one — no interpreter, no router, a spawn that threw. It leaves
    // here as an exception rather than as an answer a caller could
    // mistake for a refusal, and this is the only place it can leave.
    if (result.outcome === "unavailable") {
      throw new RouterUnavailableError(result.message);
    }
    return result;
  }

  /**
   * A finished process that did not exit 0, as the refusal a caller
   * reports. The outcome is `outcomeForExitCode`'s, never this file's
   * opinion; it cannot be `ok`, because a zero exit never reaches here.
   */
  private refusalOf(result: RouterCliResult): RouterRefusal {
    const outcome = outcomeForExitCode(result.exitCode);
    return {
      ok: false,
      outcome: outcome === "ok" ? "failed" : outcome,
      exitCode: result.exitCode,
      message: result.message,
    };
  }

  /** The common case: a verb whose answer is what it printed. */
  private async text(
    verb: string,
    args: string[],
    cwd: string,
  ): Promise<RouterResult<RouterText>> {
    const result = await this.run(verb, args, cwd);
    return result.exitCode === EXIT_OK
      ? { ok: true, outcome: "ok", value: { stdout: result.raw.stdout } }
      : this.refusalOf(result);
  }

  // --- session ---------------------------------------------------------------

  public readonly session: SessionVerbs = {
    start: (o: SessionStartOptions) => {
      const args = ["start", "--engine", o.engine, "--provider", o.provider];
      optional(args, "--model", o.model);
      optional(args, "--effort", o.effort);
      return this.text("session", [...args, ...targetArgs(o)], o.repoRoot);
    },
    declare: (o: SessionDeclareOptions) =>
      this.text(
        "session",
        [
          "declare",
          "--task-file",
          o.taskFile,
          o.releasable ? "--releasable" : "--not-releasable",
          ...targetArgs(o),
        ],
        o.repoRoot,
      ),
    close: (o: SessionCloseOptions) => {
      const args = ["close", ...targetArgs(o)];
      if (o.dryRun) args.push("--dry-run");
      if (o.force) args.push("--force");
      return this.text("session", args, o.repoRoot);
    },
    // The empty string is a valid reason and is passed through rather
    // than omitted: operators dismiss the reason prompt routinely, and
    // the CLI writes the blank line so the history file's timestamp
    // pattern stays intact.
    //
    // `--force` is added only when the caller says the session cannot
    // close — in flight and unresolved at the cap. The CLI refuses an
    // in-flight cancel without it, and that refusal still protects
    // everything it did, because the flag is never a default.
    cancel: (o: SessionCancelOptions) => {
      const args = [
        "cancel",
        String(o.sessionNumber),
        "--reason",
        o.reason,
        ...targetArgs(o),
      ];
      if (o.force) args.push("--force");
      return this.text("session", args, o.repoRoot);
    },
    restore: (o: SessionRestoreOptions) =>
      this.text(
        "session",
        ["restore", String(o.sessionNumber), "--reason", o.reason, ...targetArgs(o)],
        o.repoRoot,
      ),
    // `--step` and `--status` are required by the CLI and optional in the
    // contract, so an options object without them produces a usage error
    // rather than a silent half-log. That is the right failure: the
    // router says which argument is missing, and this file does not
    // second-guess a parser it can quote.
    log: (o: SessionLogOptions) => {
      const args = ["log", ...targetArgs(o)];
      optional(args, "--step", o.step);
      optional(args, "--status", o.status);
      optional(args, "--note", o.note);
      optional(args, "--session-number", o.sessionNumber?.toString());
      return this.text("session", args, o.repoRoot);
    },
    decision: (o: SessionDecisionOptions) => {
      const args = ["decision", "--decider", o.decider, "--headline", o.headline];
      // The CLI takes exactly one of the two, so the file wins when both
      // are present rather than both being sent and refused.
      if (o.bodyFile) args.push("--body-file", o.bodyFile);
      else optional(args, "--body", o.body);
      optional(args, "--model", o.model);
      optional(args, "--provider", o.provider);
      optional(args, "--session-number", o.sessionNumber?.toString());
      return this.text("session", [...args, ...targetArgs(o)], o.repoRoot);
    },
  };

  // --- modules ---------------------------------------------------------------

  public readonly modules: ModuleVerbs = {
    // `ai_router.modules` has one subcommand, `create`. The other two are
    // the contract describing a surface the Python side never grew.
    list: () => refuse<RouterText>("modules"),
    retire: () => refuse<RouterText>("modules"),
    /**
     * The workspace root is passed as the CLI's positional argument as
     * well as being the spawn cwd: a cwd is an ambient value a refactor
     * can change without anyone noticing the module manifest moved with
     * it.
     *
     * `--title` is REQUIRED by `ai_router.modules create`, so the
     * contract's "omitted when the default (the slug) was accepted" is
     * satisfied here by sending the slug. Omitting the flag sent an
     * argparse usage error instead of taking a default the CLI does not
     * have — which is what the extension did whenever an operator pressed
     * Enter past the title prompt.
     */
    create: (o: ModuleCreateOptions) => {
      const title = (o.title ?? "").trim() || o.slug;
      const args = ["create", o.workspaceRoot, "--slug", o.slug, "--title", title];
      optional(args, "--plan-path", o.planPath);
      optional(args, "--code-root", o.codeRoot);
      optional(args, "--spec-section", o.specSection);
      return this.text("modules", args, o.workspaceRoot);
    },
  };

  // --- verify ----------------------------------------------------------------

  public readonly verify: VerifyVerbs = {
    /** One round. `ai_router.verify` with no subcommand IS the round. */
    round: (o: VerifyRoundOptions) => {
      const args = targetArgs(o);
      optional(args, "--max-rounds", o.maxRounds?.toString());
      optional(args, "--transport", o.transport);
      return this.text("verify", args, o.repoRoot);
    },
    dispute: () => refuse<RouterText>("verify"),
    adjudicate: () => refuse<RouterText>("verify"),
    reanchor: () => refuse<RouterText>("verify"),
    stepOpen: () => refuse<RouterText>("verify"),
    stepClose: () => refuse<RouterText>("verify"),
    stepStatus: () => refuse<RouterText>("verify"),
    stepAmend: () => refuse<RouterText>("verify"),
  };

  // --- the verbs an orchestrator runs, not the extension ---------------------

  public readonly workflow: WorkflowVerbs = {
    enter: () => refuse<RouterText>("workflow"),
    review: () => refuse<RouterText>("workflow"),
    approve: () => refuse<RouterText>("workflow"),
    authorTests: () => refuse<RouterText>("workflow"),
    test: () => refuse<RouterText>("workflow"),
    suite: () => refuse<RouterText>("workflow"),
    fix: () => refuse<RouterText>("workflow"),
    sendBack: () => refuse<RouterText>("workflow"),
    status: () => refuse<RouterText>("workflow"),
  };

  public readonly ledger: LedgerVerbs = {
    latestRound: () => refuse<Rounds | null>("ledger"),
    unresolved: () => refuse<RouterText>("ledger"),
  };

  public readonly approvedPlan: ApprovedPlanVerbs = {
    read: () => refuse<ApprovedPlan>("approved-plan"),
  };

  public readonly testEvidence: TestEvidenceVerbs = {
    record: () => refuse<RouterText>("test-evidence"),
  };

  public affected(_o: AffectedOptions): Promise<RouterResult<RouterText>> {
    return refuse<RouterText>("affected");
  }

  // --- the reads and writes the extension actually makes ---------------------

  /**
   * The Work Explorer's whole view of one repository.
   *
   * Silent, and narrowed rather than trusted: this is a subprocess's
   * stdout, and a partial write must read as "no answer" rather than as
   * a session list with holes in it.
   */
  public async progress(o: RepositoryTarget): Promise<RouterResult<ProgressProjection>> {
    const result = await this.run("progress", ["--json", ...targetArgs(o)], o.repoRoot, true);
    if (result.exitCode !== EXIT_OK) return this.refusalOf(result);
    const payload = parseProjectionPayload(result.raw.stdout);
    if (!payload) {
      return {
        ok: false,
        outcome: "failed",
        exitCode: result.exitCode,
        message: "projection emitted unreadable JSON",
      };
    }
    return { ok: true, outcome: "ok", value: payload };
  }

  public bootstrap(o: BootstrapOptions): Promise<RouterResult<RouterText>> {
    const args = ["--project-dir", o.projectDir];
    optional(args, "--repo-name", o.repoName);
    return this.text("bootstrap", args, o.projectDir);
  }
}

/** Reads do not write to the command log. See `PythonSpawnRouter.run`. */
const SILENT_ECHO = { append: (): void => {}, reveal: (): void => {} };

/**
 * How long a polled read may take before it is stopped. Thirty seconds is
 * what the projection has always allowed; a tree that awaits it must not
 * be able to wait forever on one wedged interpreter.
 */
const READ_TIMEOUT_MS = 30_000;
