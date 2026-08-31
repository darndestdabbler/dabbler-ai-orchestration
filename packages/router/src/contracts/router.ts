// The one seam between a caller and the router.
//
// One method per verb, typed by the generated types, and one statement of
// what a non-zero exit means. It is deliberately not a spawn interface:
// the extension once satisfied it by running `python -m ai_router.<module>`
// and reading the pipe, and now satisfies it by calling this package's own
// modules. Neither spelling is visible here, which is the point -- and it
// is why the cutover moved one line in the extension rather than every
// caller.
//
// Where a verb's answer has a schema, the method returns the generated
// type. Where it does not, the method returns `RouterText`: what the verb
// printed, unparsed. An options interface gains fields additively, which
// moves no existing caller.

import type { ApprovedPlan } from "../generated/approved-plan.ts";
import type { ProgressProjection } from "../generated/progress-projection.ts";
import type { Rounds } from "../generated/rounds.ts";

// --- The exit-code contract --------------------------------------------------

/**
 * The router's published exit codes. They are a contract rather than an
 * accident: every verb refuses with 3 and fails a write with 4, so a
 * caller can tell "this was not allowed" from "this did not work" without
 * reading prose.
 */
export const EXIT_OK = 0;
export const EXIT_REFUSED = 3;
export const EXIT_WRITE_FAILED = 4;

/**
 * `refused` -- the verb declined and wrote nothing. `writeFailed` -- it
 * agreed and the write did not land. `failed` -- anything else, including
 * argparse's usage code 2, which is a caller's bug and not a refusal.
 */
export type RouterOutcome = "ok" | "refused" | "writeFailed" | "failed";

/**
 * One exit code as one outcome. A null code is a process that was killed
 * or never ran; it is `failed`, never `ok` -- a signal is not consent.
 */
export function outcomeForExitCode(code: number | null): RouterOutcome {
  if (code === EXIT_OK) return "ok";
  if (code === EXIT_REFUSED) return "refused";
  if (code === EXIT_WRITE_FAILED) return "writeFailed";
  return "failed";
}

/** A verb that answered, whatever the answer was. */
export type RouterResult<T> =
  | { readonly ok: true; readonly outcome: "ok"; readonly value: T }
  | {
      readonly ok: false;
      readonly outcome: Exclude<RouterOutcome, "ok">;
      readonly exitCode: number | null;
      /** What the router said, for a reader. Never composed by the caller. */
      readonly message: string;
    };

/** stdout, for a verb whose answer has no schema yet. */
export interface RouterText {
  readonly stdout: string;
}

/**
 * The router could not be reached at all. Distinct from every
 * `RouterResult`: those are answers, and this is the absence of one.
 *
 * The bundled implementation never throws it, and cannot: it calls
 * functions in this process, so there is no interpreter to be missing and
 * no spawn to fail. It is kept because it is the shape of that answer for
 * an implementation that does have somewhere to reach -- and because a
 * caller's catch is where the distinction has to be made, whichever
 * implementation it is holding. It is not trimmed on the D162 rule that
 * took `modules list` out: that rule is about a verb a caller could
 * ISSUE and be refused, and nobody issues an error type.
 */
export class RouterUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "RouterUnavailableError";
  }
}

// --- What every verb is asked ------------------------------------------------

/**
 * Where the repository is. Both are absolute. `sessionsDir` is derivable
 * from `repoRoot` and is passed anyway: the derivation has one owner on
 * the router's side, and a caller that recomputed it would be a second.
 */
export interface RepositoryTarget {
  readonly repoRoot: string;
  readonly sessionsDir?: string;
  /**
   * How long an in-flight session's record may sit still before the
   * projection says nothing has been written for a while.
   *
   * The caller's, when it has one -- the VS Code setting is where an
   * operator looks for it -- then the repository's own declaration, then a
   * default. One authoritative value with a stated precedence, rather than
   * a setting in one place and the number that decides in another.
   */
  readonly stalledAfterSeconds?: number;
}

// --- The verbs ---------------------------------------------------------------

export interface SessionStartOptions extends RepositoryTarget {
  readonly engine: string;
  readonly provider: string;
  /** Required for a seat whose label does not resolve an identity. */
  readonly model?: string;
  readonly effort?: string;
}

export interface SessionDeclareOptions extends RepositoryTarget {
  readonly taskFile: string;
  readonly releasable: boolean;
}

export interface SessionCloseOptions extends RepositoryTarget {
  readonly dryRun?: boolean;
  readonly force?: boolean;
}

export interface SessionCancelOptions extends RepositoryTarget {
  readonly sessionNumber: number;
  /** The empty string is a reason and is passed through, never omitted. */
  readonly reason: string;
  /** Only for a session that cannot close: in flight and unresolved at the cap. */
  readonly force?: boolean;
}

export interface SessionRestoreOptions extends RepositoryTarget {
  readonly sessionNumber: number;
  readonly reason: string;
}

export interface SessionDecisionOptions extends RepositoryTarget {
  readonly sessionNumber?: number;
  readonly decider: string;
  readonly headline: string;
  readonly bodyFile?: string;
  readonly body?: string;
  readonly model?: string;
  readonly provider?: string;
}

/**
 * End the engine's running invocation under a driven session. The driver
 * re-invokes the engine with the reason; the extension's Stop is this verb
 * and nothing else.
 */
export interface SessionInterruptOptions extends RepositoryTarget {
  readonly reason: string;
  readonly sessionNumber?: number;
}

export interface SessionVerbs {
  start(options: SessionStartOptions): Promise<RouterResult<RouterText>>;
  declare(options: SessionDeclareOptions): Promise<RouterResult<RouterText>>;
  close(options: SessionCloseOptions): Promise<RouterResult<RouterText>>;
  cancel(options: SessionCancelOptions): Promise<RouterResult<RouterText>>;
  restore(options: SessionRestoreOptions): Promise<RouterResult<RouterText>>;
  decision(options: SessionDecisionOptions): Promise<RouterResult<RouterText>>;
  interrupt(options: SessionInterruptOptions): Promise<RouterResult<RouterText>>;
}

export interface ModuleCreateOptions {
  readonly workspaceRoot: string;
  readonly slug: string;
  /** Omitted rather than empty when the default (the slug) was accepted. */
  readonly title?: string;
  readonly planPath?: string;
  readonly codeRoot?: string;
  readonly specSection?: string;
}

/**
 * One verb, because the manifest has one writer.
 *
 * `list` and `retire` were declared here before either router grew them,
 * and session 31 -- which ports `modules` -- found that neither exists on
 * either side: `ai_router.modules` has exactly `create`, and the manifest
 * is create-only by design, with rename, delete and reorganization staying
 * manual edits to the file. A contract naming a verb nothing implements is
 * a promise to a caller that would be refused at the moment it was needed,
 * so they are trimmed rather than stubbed (D162/D152). The session that
 * decides retirement should be a verb adds it here and in both routers, in
 * that order.
 */
export interface ModuleVerbs {
  create(options: ModuleCreateOptions): Promise<RouterResult<RouterText>>;
}

export interface VerifyRoundOptions extends RepositoryTarget {
  readonly maxRounds?: number;
  readonly transport?: string;
}

export interface VerifyDisputeOptions extends RepositoryTarget {
  readonly round: number;
  /**
   * `--finding`, and named for the flag rather than for the field it lands
   * in (`finding_index`). D152: an argv built from `findingIndex` reads
   * `--finding-index`, which the parser does not have. Now that `verify` is
   * ported the command line is readable rather than inferable, and this is
   * what it says.
   */
  readonly finding: number;
  readonly grounds: string;
  /** Repeatable on the CLI; a file-backed rebuttal is what makes it weighable. */
  readonly evidence: readonly string[];
}

export interface VerifyAdjudicateOptions extends RepositoryTarget {
  /** The cap the preconditions check against; `--max-rounds`, as a round takes. */
  readonly maxRounds?: number;
  readonly transport?: string;
}

export interface VerifyReanchorOptions extends RepositoryTarget {
  /** Only a commit at or before the round is legal; the router enforces it. */
  readonly commit: string;
  readonly reason: string;
}

export interface VerifyStepOptions extends RepositoryTarget {
  readonly step?: string;
  readonly addFile?: readonly string[];
  readonly reason?: string;
}

/**
 * `verify prepare` and `verify step guard-commit` are deliberately absent.
 * Both exist on the command line; neither is extension-facing -- `prepare`
 * is the critique pipeline's default-off entry point and decides nothing,
 * and `guard-commit` is a pre-commit hook that takes no arguments and is
 * invoked by the hook `bootstrap` writes. This interface is what the
 * extension calls, and every member of it costs a signature the other side
 * must implement (session 24 measured that at +178 lines).
 */
export interface VerifyVerbs {
  /** One round of cross-provider verification. There is no skip. */
  round(options: VerifyRoundOptions): Promise<RouterResult<RouterText>>;
  dispute(options: VerifyDisputeOptions): Promise<RouterResult<RouterText>>;
  adjudicate(options: VerifyAdjudicateOptions): Promise<RouterResult<RouterText>>;
  reanchor(options: VerifyReanchorOptions): Promise<RouterResult<RouterText>>;
  stepOpen(options: VerifyStepOptions): Promise<RouterResult<RouterText>>;
  stepClose(options: VerifyStepOptions): Promise<RouterResult<RouterText>>;
  stepStatus(options: VerifyStepOptions): Promise<RouterResult<RouterText>>;
  stepAmend(options: VerifyStepOptions): Promise<RouterResult<RouterText>>;
}

export interface BootstrapOptions {
  readonly projectDir: string;
  readonly repoName?: string;
  /**
   * Leave the machine's transport preference exactly as it is.
   *
   * `bootstrap` otherwise detects a transport and persists
   * `DABBLER_TRANSPORT` at USER scope -- which is right for a person running
   * it deliberately at a terminal, and wrong for a click that sets up one
   * project: a per-project action does not get to change how every other
   * project on the machine routes.
   */
  readonly noTransportDetect?: boolean;
}

export interface WorkflowOptions {
  readonly workspaceRoot: string;
  readonly component?: string;
}

export interface WorkflowStepOptions extends WorkflowOptions {
  /**
   * The step id. Only `enter` takes one -- it is that subcommand's
   * positional argument -- and every other step reads it back from the
   * event log, which is why it is optional here rather than on `enter`
   * alone: one options type per subcommand would be nine.
   */
  readonly step?: string;
  /** Repeatable; a step's outputs, as the review and the tests read them. */
  readonly artifact?: readonly string[];
  readonly authorProvider?: string;
  readonly transport?: string;
}

export interface WorkflowVerbs {
  enter(options: WorkflowStepOptions): Promise<RouterResult<RouterText>>;
  review(options: WorkflowStepOptions): Promise<RouterResult<RouterText>>;
  approve(options: WorkflowStepOptions): Promise<RouterResult<RouterText>>;
  authorTests(options: WorkflowStepOptions): Promise<RouterResult<RouterText>>;
  test(options: WorkflowStepOptions): Promise<RouterResult<RouterText>>;
  suite(options: WorkflowStepOptions): Promise<RouterResult<RouterText>>;
  fix(options: WorkflowStepOptions): Promise<RouterResult<RouterText>>;
  sendBack(
    options: WorkflowOptions & { readonly to: string; readonly reason: string },
  ): Promise<RouterResult<RouterText>>;
  status(options: WorkflowOptions): Promise<RouterResult<RouterText>>;
}

/**
 * `unresolved` -- every session whose loop stopped without a clean verdict
 * -- was declared here before either router grew it, and the cutover found
 * that neither ever did: no `ai_router.ledger` function computes it and no
 * caller asks for it. The projection already answers the question a reader
 * has, per session, from the same rows. A contract naming a verb nothing
 * implements is a promise that would be refused at the moment it was
 * needed, so it is trimmed rather than stubbed -- D162/D152, the same
 * ruling that took `modules list` and `modules retire` out.
 */
export interface LedgerVerbs {
  /** The last round row of one session, or null when it has none. */
  latestRound(
    options: RepositoryTarget & { readonly sessionNumber: number },
  ): Promise<RouterResult<Rounds | null>>;
}

export interface TestEvidenceRecordOptions extends RepositoryTarget {
  readonly suite: string;
  readonly stage: string;
  readonly outcome: string;
  readonly durationSeconds: number;
  readonly command?: string;
  readonly sessionNumber?: number;
  readonly detail?: string;
  /** Mandatory reason for a full run before verification; never a bare flag. */
  readonly allowFullPreverify?: string;
}

export interface TestEvidenceVerbs {
  record(options: TestEvidenceRecordOptions): Promise<RouterResult<RouterText>>;
}

export interface ApprovedPlanVerbs {
  /** The session's approved plan, as `approved-plan.json` carries it. */
  read(
    options: RepositoryTarget & { readonly sessionNumber: number },
  ): Promise<RouterResult<ApprovedPlan>>;
}

export interface AffectedOptions extends RepositoryTarget {
  readonly json?: boolean;
}

/**
 * Everything a caller may ask the router to do.
 *
 * A verb whose answer has a schema returns that schema's generated type,
 * so a schema change becomes a compile error at this boundary rather than
 * a cast inside a caller: `progress`, `approvedPlan.read` and
 * `ledger.latestRound` are those. The rest return `RouterText` because
 * their answer is prose for a person to read and no schema describes it;
 * each sharpens if and when one does.
 */
export interface Router {
  readonly session: SessionVerbs;
  readonly modules: ModuleVerbs;
  readonly verify: VerifyVerbs;
  readonly workflow: WorkflowVerbs;
  readonly ledger: LedgerVerbs;
  readonly testEvidence: TestEvidenceVerbs;
  readonly approvedPlan: ApprovedPlanVerbs;
  /** The Work Explorer's whole view of one repository, computed fresh. */
  progress(options: RepositoryTarget): Promise<RouterResult<ProgressProjection>>;
  /**
   * A VS Code workspace over every repository in this solution.
   *
   * Derived local state: it carries the sibling paths this machine has, and
   * it is written under `.dabbler/` where nothing tracks it. A shared copy
   * would point at folders somebody else does not have.
   */
  workspace(options: RepositoryTarget): Promise<RouterResult<RouterText>>;

  bootstrap(options: BootstrapOptions): Promise<RouterResult<RouterText>>;
  /** The selected tests, why each was selected, and the command to run. */
  affected(options: AffectedOptions): Promise<RouterResult<RouterText>>;
}
