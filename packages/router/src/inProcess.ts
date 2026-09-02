// `Router`, satisfied by calling this package's own modules.
//
// It is the implementation the extension holds after the cutover, and it
// replaces one that spawned `python -m ai_router.<module>` and read the
// pipe. Three things follow from there being no process any more.
//
// **The verbs are still reached through their command-line handlers.**
// Not because a command line is wanted -- there is none -- but because a
// handler is where a verb's arguments are checked and its refusals are
// worded, and reaching past it would be a second implementation of both.
// `capture` collects what the handler wrote; `standIn` answers the paths
// it does not name. The exception is the verbs whose answer has a schema:
// those call the module directly, because rendering an object to JSON in
// order to parse it back is a round trip through text nothing needs.
//
// **Two calls cannot be in flight at once.** The captured output buffer
// and the working directory are both process-wide, and neither has a
// correct answer for two verbs standing in two repositories. Calls queue,
// in the order they arrive.
//
// **A verb runs on the caller's thread.** In a VS Code extension host that
// is the UI's thread, so what the extension asks for is a design
// constraint rather than a taste: the projection is a few file reads and
// is polled, and `session cancel` is a click the operator is watching. The
// verbs that buy a model or run a suite -- `verify`, `workflow` -- are
// engine-facing, and belong in the terminal `dabbler` is on, which is
// where the framework's own lifecycle runs them.

import { readPlan } from "./approvedPlan.ts";
import { sessionsDirFor } from "./evidence.ts";
import { latestRound, sessionRunDir } from "./ledger.ts";
import { buildProjection } from "./progress.ts";
import { standIn } from "./workdir.ts";
import { HANDLERS } from "./cli/registry.ts";
import { capture } from "./output.ts";
import {
  EXIT_OK,
  outcomeForExitCode,
  type AffectedOptions,
  type ApprovedPlanVerbs,
  type DepsRepositoryOptions,
  type DepsVerbs,
  type BootstrapOptions,
  type LedgerVerbs,
  type ModuleCreateOptions,
  type ModuleVerbs,
  type OwedAnswerOptions,
  type OwedVerbs,
  type RepositoryTarget,
  type Router,
  type RouterResult,
  type RouterText,
  type SessionCancelOptions,
  type SessionCloseOptions,
  type SessionDeclareOptions,
  type SessionDecisionOptions,
  type SessionInterruptOptions,
  type SessionRestoreOptions,
  type SessionStartOptions,
  type SessionVerbs,
  type TestEvidenceRecordOptions,
  type TestEvidenceVerbs,
  type VerifyAdjudicateOptions,
  type VerifyDisputeOptions,
  type VerifyReanchorOptions,
  type VerifyRoundOptions,
  type VerifyStepOptions,
  type VerifyVerbs,
  type WorkflowOptions,
  type WorkflowStepOptions,
  type WorkflowVerbs,
} from "./contracts/router.ts";
import type { ApprovedPlan } from "./generated/approved-plan.ts";
import type { ProgressProjection } from "./generated/progress-projection.ts";
import type { Rounds } from "./generated/rounds.ts";

/** What one verb did, before it is turned into a `RouterResult`. */
export interface VerbRun {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Where a caller watches what the router is doing.
 *
 * The extension's command log is the reason this exists: the operator's
 * standing requirement is that Dabbler SHOWS what it runs, and a router
 * that answers in-process has no process for them to see. So it reports
 * the line they could have typed themselves, before it runs, and what came
 * back afterwards.
 */
export interface RouterEcho {
  /** The equivalent command line, before the verb runs. */
  running(commandLine: string): void;
  /** Everything the verb wrote, both streams, in the order they came. */
  wrote(output: string): void;
}

export interface InProcessRouterOptions {
  readonly echo?: RouterEcho;
}

/**
 * Quote one argument for DISPLAY.
 *
 * Nothing here is ever fed to a shell -- there is no shell -- so this
 * exists purely so the echoed line is one a developer can paste into their
 * own terminal and have it run the same verb. PowerShell is the target: it
 * escapes with a backtick inside double quotes, and a Windows path ending
 * in a backslash would swallow a POSIX-style escaped quote.
 */
export function quoteForDisplay(arg: string): string {
  if (arg === "") return '""';
  if (!/[\s"'`$&|<>()^;,{}[\]@#]/.test(arg)) return arg;
  return `"${arg.replace(/(["`$])/g, "`$1")}"`;
}

/** `dabbler session start --engine claude-code`, for a person to read. */
export function commandLineFor(verb: string, args: readonly string[]): string {
  return ["dabbler", verb, ...args.map(quoteForDisplay)].join(" ");
}

/** Push `--flag value` only when the value is present. */
function optional(args: string[], flag: string, value: string | undefined): void {
  if (value !== undefined && value !== "") args.push(flag, value);
}

/**
 * `--sessions-dir` is passed whenever the caller knows it, even though the
 * router derives it from where it is standing: the extension is outside
 * the tree it is asking about, and naming the root it scanned keeps the
 * answer bound to that root.
 */
function targetArgs(target: RepositoryTarget): string[] {
  const args: string[] = [];
  optional(args, "--sessions-dir", target.sessionsDir);
  return args;
}

export class InProcessRouter implements Router {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly options: InProcessRouterOptions = {}) {}

  /**
   * The next call waits for the one in flight, whichever way that one
   * ended. A rejection must not leave the chain unsettled, or one failed
   * verb would wedge every call after it.
   */
  private serialize<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work, work);
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  /**
   * One verb, in this process, with everything it writes collected.
   *
   * `silent` keeps a read out of the command log. It is set for reads and
   * only for reads: the log answers "what has Dabbler been running?", and
   * a projection poll every thirty seconds would bury every answer the
   * operator opened it for.
   */
  public runVerb(
    verb: string,
    args: readonly string[],
    cwd: string,
    silent = false,
  ): Promise<VerbRun> {
    const handler = HANDLERS[verb];
    if (!handler) {
      // Unreachable from the methods below -- every one of them names a
      // registered verb -- so this guards the table, and is not a path.
      return Promise.reject(new Error(`dabbler has no verb '${verb}'`));
    }
    const echo = silent ? undefined : this.options.echo;
    return this.serialize(async () => {
      echo?.running(commandLineFor(verb, args));
      const captured = await capture(() => standIn(cwd, () => handler([...args])));
      echo?.wrote(captured.stdout + captured.stderr);
      return {
        exitCode: captured.value,
        stdout: captured.stdout,
        stderr: captured.stderr,
      };
    });
  }

  /**
   * A read whose answer is a value rather than text.
   *
   * A throw becomes a refusal rather than a rejected promise. Every one of
   * these reads a machine-owned file and every one of them fails the same
   * way -- a ledger line that will not parse, a plan whose bytes no
   * sanctioned write accounts for, a sessions root that is not there -- and
   * each of those is something the caller has to SHOW, not something that
   * should reach it as an exception. The text verbs already answer this
   * shape, because their handler turns the same conditions into an exit
   * code.
   */
  private read<T>(cwd: string, work: () => T): Promise<RouterResult<T>> {
    return this.serialize(async () => {
      try {
        return { ok: true as const, outcome: "ok" as const, value: await standIn(cwd, async () => work()) };
      } catch (error) {
        return {
          ok: false as const,
          outcome: "failed" as const,
          exitCode: null,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    });
  }

  /**
   * A verb that did not exit 0, as the refusal a caller reports. The
   * outcome is `outcomeForExitCode`'s, never this file's opinion; it
   * cannot be `ok`, because a zero exit never reaches here.
   */
  private refusalOf(run: VerbRun): Extract<RouterResult<never>, { ok: false }> {
    const outcome = outcomeForExitCode(run.exitCode);
    return {
      ok: false,
      outcome: outcome === "ok" ? "failed" : outcome,
      exitCode: run.exitCode,
      message: run.stderr.trim() || run.stdout.trim() || `exit ${run.exitCode}`,
    };
  }

  /** The common case: a verb whose answer is what it printed. */
  private async text(
    verb: string,
    args: string[],
    cwd: string,
  ): Promise<RouterResult<RouterText>> {
    const run = await this.runVerb(verb, args, cwd);
    return run.exitCode === EXIT_OK
      ? { ok: true, outcome: "ok", value: { stdout: run.stdout } }
      : this.refusalOf(run);
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
    // The empty string is a valid reason and is passed through rather than
    // omitted: operators dismiss the reason prompt routinely, and the verb
    // writes the blank line so the history file's timestamp pattern stays
    // intact.
    //
    // `--force` is added only when the caller says the session cannot
    // close -- in flight and unresolved at the cap. The verb refuses an
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
    decision: (o: SessionDecisionOptions) => {
      const args = ["decision", "--decider", o.decider, "--headline", o.headline];
      // The verb takes exactly one of the two, so the file wins when both
      // are present rather than both being sent and refused.
      if (o.bodyFile) args.push("--body-file", o.bodyFile);
      else optional(args, "--body", o.body);
      optional(args, "--model", o.model);
      optional(args, "--provider", o.provider);
      optional(args, "--session-number", o.sessionNumber?.toString());
      return this.text("session", [...args, ...targetArgs(o)], o.repoRoot);
    },
    interrupt: (o: SessionInterruptOptions) => {
      const args = ["interrupt", "--reason", o.reason];
      if (o.stop === true) args.push("--stop");
      optional(args, "--session-number", o.sessionNumber?.toString());
      return this.text("session", [...args, ...targetArgs(o)], o.repoRoot);
    },
  };

  // --- modules ---------------------------------------------------------------

  public readonly modules: ModuleVerbs = {
    /**
     * The workspace root is passed as the verb's positional argument as
     * well as being where the router stands: standing somewhere is an
     * ambient value a refactor can change without anyone noticing the
     * module manifest moved with it.
     *
     * `--title` is REQUIRED by `modules create`, so the contract's
     * "omitted when the default (the slug) was accepted" is satisfied here
     * by sending the slug. Omitting the flag sent a usage error instead of
     * taking a default the verb does not have -- which is what the
     * extension did whenever an operator pressed Enter past the title
     * prompt.
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
    /** One round. `dabbler verify` with no subcommand IS the round. */
    round: (o: VerifyRoundOptions) => {
      const args = targetArgs(o);
      optional(args, "--max-rounds", o.maxRounds?.toString());
      optional(args, "--transport", o.transport);
      return this.text("verify", args, o.repoRoot);
    },
    dispute: (o: VerifyDisputeOptions) => {
      const args = [
        "dispute",
        "--round",
        String(o.round),
        "--finding",
        String(o.finding),
        "--grounds",
        o.grounds,
        ...targetArgs(o),
      ];
      // Repeatable on the command line, and a file-backed rebuttal is what
      // makes a dispute weighable, so every path is sent.
      for (const path of o.evidence) args.push("--evidence", path);
      return this.text("verify", args, o.repoRoot);
    },
    adjudicate: (o: VerifyAdjudicateOptions) => {
      const args = ["adjudicate", ...targetArgs(o)];
      optional(args, "--max-rounds", o.maxRounds?.toString());
      optional(args, "--transport", o.transport);
      return this.text("verify", args, o.repoRoot);
    },
    reanchor: (o: VerifyReanchorOptions) =>
      this.text(
        "verify",
        ["reanchor", "--commit", o.commit, "--reason", o.reason, ...targetArgs(o)],
        o.repoRoot,
      ),
    stepOpen: (o: VerifyStepOptions) => this.step("open", o),
    stepClose: (o: VerifyStepOptions) => this.step("close", o),
    stepStatus: (o: VerifyStepOptions) => this.step("status", o),
    stepAmend: (o: VerifyStepOptions) => this.step("amend", o),
  };

  /**
   * `verify step <verb>`. Each step verb declares a different set of flags
   * and refuses one it does not, so the options are filtered by verb here
   * rather than sent whole: `--step` belongs to `open`, `--add-file` and
   * `--reason` to `amend`, and neither belongs to `close` or `status`.
   */
  private step(
    verb: string,
    o: VerifyStepOptions,
  ): Promise<RouterResult<RouterText>> {
    const args = ["step", verb, ...targetArgs(o)];
    if (verb === "open") optional(args, "--step", o.step);
    if (verb === "amend") {
      for (const path of o.addFile ?? []) args.push("--add-file", path);
      optional(args, "--reason", o.reason);
    }
    return this.text("verify", args, o.repoRoot);
  }

  // --- the six-step workflow --------------------------------------------------

  public readonly workflow: WorkflowVerbs = {
    enter: (o: WorkflowStepOptions) => this.workflowStep("enter", o),
    review: (o: WorkflowStepOptions) => this.workflowStep("review", o),
    approve: (o: WorkflowStepOptions) => this.workflowStep("approve", o),
    authorTests: (o: WorkflowStepOptions) => this.workflowStep("author-tests", o),
    test: (o: WorkflowStepOptions) => this.workflowStep("test", o),
    suite: (o: WorkflowStepOptions) => this.workflowStep("suite", o),
    fix: (o: WorkflowStepOptions) => this.workflowStep("fix", o),
    sendBack: (o: WorkflowOptions & { readonly to: string; readonly reason: string }) => {
      const args = ["send-back", "--workspace-root", o.workspaceRoot];
      optional(args, "--component", o.component);
      args.push("--to", o.to, "--reason", o.reason);
      return this.text("workflow", args, o.workspaceRoot);
    },
    status: (o: WorkflowOptions) => {
      const args = ["status", "--workspace-root", o.workspaceRoot];
      optional(args, "--component", o.component);
      return this.text("workflow", args, o.workspaceRoot);
    },
  };

  private workflowStep(
    cmd: string,
    o: WorkflowStepOptions,
  ): Promise<RouterResult<RouterText>> {
    const args = [cmd];
    // `enter` takes the step id positionally and every other subcommand
    // reads it from the log, so it is sent to the one that asks for it.
    if (cmd === "enter" && o.step) args.push(o.step);
    args.push("--workspace-root", o.workspaceRoot);
    optional(args, "--component", o.component);
    optional(args, "--author-provider", o.authorProvider);
    optional(args, "--transport", o.transport);
    for (const path of o.artifact ?? []) args.push("--artifact", path);
    return this.text("workflow", args, o.workspaceRoot);
  }

  // --- what is owed a person ---------------------------------------------------

  /**
   * The answer goes through `dabbler owed answer` and not through
   * `answerOwed`, because that verb is more than the row it writes: for
   * some questions it does the thing the answer authorises FIRST -- writes
   * the suite block, the packaging block, attaches the remote -- and
   * records only if that worked. A caller that appended the row itself
   * would settle questions whose act never happened.
   */
  public readonly owed: OwedVerbs = {
    answer: (o: OwedAnswerOptions) => {
      const args = ["answer", "--id", o.id, "--choice", o.choice, ...targetArgs(o)];
      optional(args, "--note", o.note);
      optional(args, "--value", o.value);
      return this.text("owed", args, o.repoRoot);
    },
  };

  // --- the record, read as values ---------------------------------------------

  public readonly ledger: LedgerVerbs = {
    /**
     * `ledger` has no command line -- it is a library on both routers --
     * so this is the module, called. Every row it returns has been through
     * `validateRound` against `rounds.schema.json`, which is the schema
     * `Rounds` is generated from, so the assertion is the validator's
     * verdict rather than this file's hope.
     */
    latestRound: (o: RepositoryTarget & { readonly sessionNumber: number }) =>
      this.read(o.repoRoot, () =>
        (latestRound(o.repoRoot, o.sessionNumber) ?? null) as Rounds | null,
      ),
  };

  public readonly approvedPlan: ApprovedPlanVerbs = {
    /**
     * Also a library. `readPlan` validates against the schema
     * `ApprovedPlan` is generated from AND refuses a plan whose content is
     * not backed by a sanctioned write; both arrive here as the refusal
     * `read` turns a throw into.
     */
    read: (o: RepositoryTarget & { readonly sessionNumber: number }) =>
      this.read(
        o.repoRoot,
        () => readPlan(sessionRunDir(o.repoRoot, o.sessionNumber)) as ApprovedPlan,
      ),
  };

  // --- pre-verification --------------------------------------------------------

  public readonly testEvidence: TestEvidenceVerbs = {
    record: (o: TestEvidenceRecordOptions) => {
      const args = [
        "record",
        "--suite",
        o.suite,
        "--stage",
        o.stage,
        "--outcome",
        o.outcome,
        "--duration-seconds",
        String(o.durationSeconds),
        ...targetArgs(o),
      ];
      optional(args, "--command", o.command);
      optional(args, "--session-number", o.sessionNumber?.toString());
      optional(args, "--detail", o.detail);
      optional(args, "--allow-full-preverify", o.allowFullPreverify);
      return this.text("test-evidence", args, o.repoRoot);
    },
  };

  // --- the solution's other repositories ---------------------------------------

  /**
   * The three `deps` verbs that WRITE, and the reason they are verbs at all.
   *
   * An Explorer row that says "not on this machine" and offers nothing is
   * where this journey used to end. The alternative to these was the
   * extension editing `solution-dependencies.json` itself -- a second writer
   * for a tracked declaration, and the one that could not be schema-checked
   * on the way out.
   */
  public readonly deps: DepsVerbs = {
    locate: (o: DepsRepositoryOptions) => {
      const args = ["locate", "--repository", o.repository, ...targetArgs(o)];
      optional(args, "--path", o.path);
      optional(args, "--remote", o.remote);
      return this.text("deps", args, o.repoRoot);
    },
    clone: (o: DepsRepositoryOptions) => {
      const args = ["clone", "--repository", o.repository, ...targetArgs(o)];
      optional(args, "--path", o.path);
      return this.text("deps", args, o.repoRoot);
    },
    scaffold: (o: DepsRepositoryOptions) => {
      const args = ["scaffold", "--repository", o.repository, ...targetArgs(o)];
      optional(args, "--path", o.path);
      return this.text("deps", args, o.repoRoot);
    },
  };

  public affected(o: AffectedOptions): Promise<RouterResult<RouterText>> {
    const args = targetArgs(o);
    if (o.json) args.push("--json");
    return this.text("affected", args, o.repoRoot);
  }

  // --- the reads and writes the extension makes --------------------------------

  /**
   * The Work Explorer's whole view of one repository.
   *
   * Silent, and a direct call. The spawn this replaces narrowed a
   * subprocess's stdout because a truncated pipe had to read as "no
   * answer" rather than as a session list with holes in it; there is no
   * pipe now, and the value is the one `progress` built in this process.
   */
  public progress(o: RepositoryTarget): Promise<RouterResult<ProgressProjection>> {
    return this.read(
      o.repoRoot,
      () =>
        buildProjection(o.sessionsDir ?? sessionsDirFor(o.repoRoot), {
          stalledAfterSeconds: o.stalledAfterSeconds,
        }) as unknown as ProgressProjection,
    );
  }

  /**
   * Write a VS Code workspace over every repository in this solution.
   *
   * Extension-facing because the operator should never author it: it is
   * derived from the graph, it carries paths only this machine has, and it
   * lives under `.dabbler/` where it cannot be committed by accident.
   */
  public workspace(o: RepositoryTarget): Promise<RouterResult<RouterText>> {
    return this.text("workspace", targetArgs(o), o.repoRoot);
  }

  public bootstrap(o: BootstrapOptions): Promise<RouterResult<RouterText>> {
    const args = ["--project-dir", o.projectDir];
    optional(args, "--repo-name", o.repoName);
    if (o.noTransportDetect === true) args.push("--no-transport-detect");
    return this.text("bootstrap", args, o.projectDir);
  }
}

/** The router a production caller talks to. */
export function createInProcessRouter(
  options: InProcessRouterOptions = {},
): Router {
  return new InProcessRouter(options);
}
