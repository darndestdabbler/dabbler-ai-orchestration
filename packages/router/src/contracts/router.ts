// The one seam between a caller and the router.
//
// Everything the extension does today it does by spawning
// `python -m ai_router.<module>` and reading what comes back. That is an
// implementation, not a contract: the argv is assembled in one file, the
// exit code is classified in another, and the payload is described by a
// hand-kept TypeScript mirror. This file is the contract those three were
// standing in for. One method per verb, typed by the generated types, and
// one statement of what a non-zero exit means.
//
// It is deliberately not a spawn interface. `PythonSpawnRouter` (session
// 24) satisfies it by spawning; the ported modules satisfy it in-process
// (session 35); neither spelling is visible here, which is the point --
// the extension stops knowing that Python exists.
//
// Where a verb's answer has a schema, the method returns the generated
// type. Where it does not, the method returns `RouterText`: what the CLI
// printed, unparsed. Those sharpen as their modules are ported, and an
// options interface gains fields the same way -- both are additive, and
// neither moves an existing caller.

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
 * The router could not be reached at all -- no interpreter, no binary, a
 * spawn that threw. Distinct from every `RouterResult`: those are answers,
 * and this is the absence of one.
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

export interface SessionLogOptions extends RepositoryTarget {
  readonly sessionNumber?: number;
  readonly step?: string;
  readonly status?: string;
  readonly note?: string;
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

export interface SessionVerbs {
  start(options: SessionStartOptions): Promise<RouterResult<RouterText>>;
  declare(options: SessionDeclareOptions): Promise<RouterResult<RouterText>>;
  close(options: SessionCloseOptions): Promise<RouterResult<RouterText>>;
  cancel(options: SessionCancelOptions): Promise<RouterResult<RouterText>>;
  restore(options: SessionRestoreOptions): Promise<RouterResult<RouterText>>;
  log(options: SessionLogOptions): Promise<RouterResult<RouterText>>;
  decision(options: SessionDecisionOptions): Promise<RouterResult<RouterText>>;
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

export interface ModuleRetireOptions {
  readonly workspaceRoot: string;
  readonly slug: string;
  readonly reason: string;
}

export interface ModuleVerbs {
  list(workspaceRoot: string): Promise<RouterResult<RouterText>>;
  create(options: ModuleCreateOptions): Promise<RouterResult<RouterText>>;
  retire(options: ModuleRetireOptions): Promise<RouterResult<RouterText>>;
}

export interface VerifyRoundOptions extends RepositoryTarget {
  readonly maxRounds?: number;
  readonly transport?: string;
}

export interface VerifyDisputeOptions extends RepositoryTarget {
  readonly round: number;
  readonly findingIndex: number;
  readonly grounds: string;
  /** Repeatable on the CLI; a file-backed rebuttal is what makes it weighable. */
  readonly evidence: readonly string[];
}

export interface VerifyAdjudicateOptions extends RepositoryTarget {
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
}

export interface WorkflowOptions {
  readonly workspaceRoot: string;
  readonly component?: string;
}

export interface WorkflowStepOptions extends WorkflowOptions {
  readonly artifact?: string;
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

export interface LedgerVerbs {
  /** The last round row of one session, or null when it has none. */
  latestRound(
    options: RepositoryTarget & { readonly sessionNumber: number },
  ): Promise<RouterResult<Rounds | null>>;
  /**
   * Every session whose loop stopped without a clean verdict. Text: the
   * unresolved view is a fold over the ledger with no schema of its own,
   * and inventing one here would be a second declaration of a shape the
   * record does not carry.
   */
  unresolved(options: RepositoryTarget): Promise<RouterResult<RouterText>>;
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
  bootstrap(options: BootstrapOptions): Promise<RouterResult<RouterText>>;
  /** The selected tests, why each was selected, and the command to run. */
  affected(options: AffectedOptions): Promise<RouterResult<RouterText>>;
}
