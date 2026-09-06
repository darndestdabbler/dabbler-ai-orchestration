// Cross-vendor review of a step's output.
//
// This is the half of the six-step driver that calls something. `workflow/`
// records where work is; this decides whether a step's output survives two
// readers who did not write it.
//
// **Two reviewers, and the second may not share a vendor with the first.**
// The exclusion is passed to `route()`, and checked again here against the
// providers that actually answered. Both halves are needed: the offline
// transport builds its one candidate without consulting the exclusion, so a
// scripted run would otherwise record two reviewers that were one queue.
//
// **A scripted review is marked as one.** Nothing served by the offline
// transport is allowed to read as a cross-vendor result, because a record
// that cannot be told apart from the real thing is worse than no record.
//
// Verdicts are parsed and blocking is decided by `verdict.ts`, the same code
// the session verifier uses. There is one implementation of "does this
// finding block", and this module is not it.
//
// Every finding is kept, whatever its severity. Severity describes; it does
// not select what gets written down.

import { createHash } from "node:crypto";
import { statSync } from "node:fs";

import { NoCandidateError, route } from "./route.ts";
import { ROLE_VERIFIER } from "./selection.ts";
import { STEP_DELIVERABLES, STEP_TITLES } from "./solution.ts";
import { readText } from "./textfile.ts";
import {
  classifyBlocking,
  type Finding,
  parseVerificationResponse,
} from "./verdict.ts";

/**
 * How many readers a step needs before it may move on. Two, from different
 * vendors: one model checking a sibling's work agrees with it too often.
 */
export const REVIEWERS_REQUIRED = 2;

export const MAX_ARTIFACT_CHARS = 40_000;

/**
 * The review could not be run. Never a verdict -- an absent review and a
 * clean review are different facts and must stay distinguishable.
 */
export class StepReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StepReviewError";
  }
}

export interface ReviewerOutcome {
  readonly provider: string;
  readonly model: string;
  readonly verdict: string;
  readonly findings: readonly Finding[];
  readonly blocking: boolean;
  readonly blockingReason: string;
  /** Served by a script rather than a vendor. Never inferred downstream. */
  readonly simulated: boolean;
}

export function reviewerRow(outcome: ReviewerOutcome): Record<string, unknown> {
  return {
    provider: outcome.provider,
    model: outcome.model,
    verdict: outcome.verdict,
    blocking: outcome.blocking,
    blockingReason: outcome.blockingReason,
    simulated: outcome.simulated,
    findings: [...outcome.findings],
  };
}

export interface StepReview {
  readonly target: string;
  readonly step: string;
  readonly reviewers: readonly ReviewerOutcome[];
  readonly artifacts: readonly string[];
  /**
   * What each artifact contained when it was sent, keyed by path. A later
   * round decides whether a finding was answered by comparing against this,
   * so it must be the digest of the text that actually went to the reviewers
   * rather than of whatever the file says afterwards.
   */
  readonly artifactDigests: Readonly<Record<string, string>>;
}

/**
 * Either reviewer blocking blocks. Agreement is not required to stop; it is
 * required to proceed.
 */
export function reviewBlocked(review: StepReview): boolean {
  return review.reviewers.some((r) => r.blocking);
}

export function reviewVerdict(review: StepReview): string {
  return reviewBlocked(review) ? "blocked" : "clear";
}

/**
 * True if any reader was scripted. One scripted reviewer is enough to stop
 * the round being a cross-vendor result.
 */
export function reviewSimulated(review: StepReview): boolean {
  return review.reviewers.some((r) => r.simulated);
}

/**
 * True if any reader was a vendor rather than a script.
 *
 * This is what the round cap counts. A round that reached no vendor spent
 * nothing and bounding it would bound the wrong thing; a round that reached
 * one did spend, whatever the other reader was.
 */
export function reviewLive(review: StepReview): boolean {
  return review.reviewers.some((r) => !r.simulated);
}

export function reviewFindings(review: StepReview): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const r of review.reviewers) {
    for (const f of r.findings) {
      out.push({ ...f, reviewer: `${r.model}/${r.provider}` });
    }
  }
  return out;
}

export function digestText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Each artifact as `[path, text]`. A named file that is not there is refused,
 * because a review of nothing returns clean.
 */
export function readArtifacts(
  paths: readonly string[],
): Array<readonly [string, string]> {
  const out: Array<readonly [string, string]> = [];
  for (const raw of paths) {
    let isFile = false;
    try {
      isFile = statSync(raw).isFile();
    } catch {
      isFile = false;
    }
    if (!isFile) {
      throw new StepReviewError(
        `no artifact at ${raw}. A step is reviewed by reading what it ` +
          "produced; a missing file would be reviewed as though the step " +
          "delivered nothing wrong.",
      );
    }
    const text = readText(raw);
    if (text.length > MAX_ARTIFACT_CHARS) {
      throw new StepReviewError(
        `${raw} is ${text.length} characters, over the ${MAX_ARTIFACT_CHARS} ` +
          "limit. Truncating it would hand the reviewer a partial document " +
          "and record the verdict as though it read the whole.",
      );
    }
    out.push([raw, text] as const);
  }
  return out;
}

/**
 * What the reviewer is asked. The step's obligations come from
 * `STEP_DELIVERABLES`, so the prompt and the tree cannot describe the same
 * step differently.
 */
export function buildPrompt(
  target: string,
  step: string,
  artifacts: ReadonlyArray<readonly [string, string]>,
): string {
  const body: string[] = [
    "You are reviewing one step of a solution being built in six steps.",
    "A different AI produced the work below. You did not write it and owe " +
      "it nothing. Assume it is flawed and try to prove it; a rubber stamp " +
      "is a failed review, and so is a finding manufactured to avoid one.",
    "",
    `## The step: ${STEP_TITLES[step]}`,
    "",
    `**Under review:** \`${target}\``,
    "",
    "**What this step owes:**",
    "",
    STEP_DELIVERABLES[step],
    "",
    "## What it produced",
    "",
  ];
  for (const [path, text] of artifacts) {
    body.push(`### \`${path}\``, "", "````", text.trimEnd(), "````", "");
  }

  body.push(
    "## How to answer",
    "",
    "Begin your reply with exactly one of these two words on its own line:",
    "",
    "- **VERIFIED** — you tried to break it and could not. Say in one or " +
      "two sentences what you actually checked.",
    "- **ISSUES FOUND** — there are defects that must be fixed first.",
    "",
    "Only Critical or Major findings justify ISSUES FOUND. A finding is " +
      "Major only if you can state the concrete failure scenario and say " +
      "why it is probable rather than merely possible. Anything whose " +
      "probability is low or whose impact is small is Minor, however " +
      "correct the observation — put those under a **NITS** heading.",
    "",
    "Write every finding in exactly this shape, one block each. The " +
      "record is read mechanically: a finding in any other shape is filed " +
      "whole, without its severity, and cannot be counted or sorted.",
    "",
    "```",
    "- **Issue 1:** one-line statement of the defect",
    "  - **Category:** Correctness / Completeness / Ambiguity",
    "  - **Severity:** Critical / Major",
    "  - **Failure scenario:** the concrete scenario in which this bites " +
      "a real user, and why it is probable rather than merely possible",
    "  - **Evidence paths:** the artifact path(s) above this finding is " +
      "about, exactly as they are headed",
    "```",
    "",
    "Number them upward: `Issue 1:`, `Issue 2:`, and so on. Minor " +
      "findings go under a `NITS` heading as ordinary bullets, and keep " +
      "their `Severity:` label there.",
    "",
    "**Cite an evidence path on every blocking finding.** A later round " +
      "decides whether a finding was answered by checking whether what it " +
      "cited changed; a finding that cites nothing names no site to check " +
      "and can never be shown to have been fixed.",
  );
  return body.join("\n");
}

async function reviewOnce(
  prompt: string,
  exclude: readonly string[],
  transport: string | null,
): Promise<readonly [ReviewerOutcome, string]> {
  let result;
  try {
    result = await route(prompt, {
      taskType: "verification",
      role: ROLE_VERIFIER,
      excludeProviders: [...exclude],
      transport,
    });
  } catch (error) {
    if (error instanceof NoCandidateError) {
      throw new StepReviewError(
        `${error.message}. Cross-vendor review needs ${REVIEWERS_REQUIRED} ` +
          "providers that are not the author's; configure another or the " +
          "step cannot be reviewed.",
      );
    }
    throw error;
  }
  const [parsed, findings] = parseVerificationResponse(result.content);
  const blocking = classifyBlocking(parsed, findings);
  return [
    {
      provider: result.provider,
      model: result.served_model_id || result.model_name,
      verdict: parsed,
      findings,
      blocking: blocking.blocking,
      blockingReason: blocking.reason,
      simulated: Boolean(result.metadata?.simulated),
    },
    result.content,
  ] as const;
}

/**
 * Run the step past two providers, neither of them the author's.
 *
 * Returns `[StepReview, [raw response, ...]]` -- the raw text is returned so
 * the caller can file it verbatim. A summary is not a record.
 */
export async function review(options: {
  target: string;
  step: string;
  artifactPaths: readonly string[];
  authorProvider?: string | null;
  transport?: string | null;
}): Promise<readonly [StepReview, string[]]> {
  const { target, step } = options;
  if (!(step in STEP_TITLES)) {
    throw new StepReviewError(`unknown step '${step}'`);
  }
  const artifacts = readArtifacts(options.artifactPaths);
  if (artifacts.length === 0) {
    throw new StepReviewError(
      "name at least one artifact. A step with nothing to show has not " +
        "finished, and reviewing nothing returns clean.",
    );
  }

  const prompt = buildPrompt(target, step, artifacts);
  const exclude: string[] = options.authorProvider ? [options.authorProvider] : [];

  const outcomes: ReviewerOutcome[] = [];
  const raws: string[] = [];
  for (let i = 0; i < REVIEWERS_REQUIRED; i += 1) {
    const [outcome, raw] = await reviewOnce(
      prompt,
      [...exclude],
      options.transport ?? null,
    );
    if (!outcome.simulated && exclude.includes(outcome.provider)) {
      throw new StepReviewError(
        `${outcome.provider} answered despite being excluded, so this would ` +
          "be recorded as a cross-vendor review by one vendor. Refusing to " +
          "write it.",
      );
    }
    outcomes.push(outcome);
    raws.push(raw);
    // The next reviewer may not be this one's vendor. route() enforces it on
    // the live transports; the check above enforces it here, because the
    // offline transport builds its candidate without the exclusion.
    exclude.push(outcome.provider);
  }

  const artifactDigests: Record<string, string> = {};
  for (const [path, text] of artifacts) artifactDigests[path] = digestText(text);

  return [
    {
      target,
      step,
      reviewers: outcomes,
      artifacts: artifacts.map(([p]) => p),
      artifactDigests,
    },
    raws,
  ] as const;
}
