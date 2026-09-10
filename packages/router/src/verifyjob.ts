// Task-level auto-verification: the one-shot cross-provider review `route`
// may add to an ordinary routed call when `verification.auto_verify_task_types`
// names its task type.
//
// This is the half of `ai_router.verifyjob` that survives the cutover. The
// other half -- `cmd_verify`, `build_request`, `build_evidence`, `dispatch`,
// `interrupted_result` and the cap handling -- is the run core's
// verified-policy job, it imports `runcli` and `runcore`, and D129 retires it
// with them. It is not ported here for the same reason `checks.plan` was taken
// back out in session 27 (D178): the inventory says port the module, not the
// half whose only consumer is being deleted. Measured, not assumed --
// `verifyjob.build_prompt`'s only caller in the whole package is `cmd_verify`,
// and the only names `verify` and `route` import are the two below.
//
// Response parsing is not reimplemented here. `verdict.parseVerificationResponse`
// and `classifyBlocking` decide what a verdict means and which findings block,
// exactly as they do for the session loop.

import type { RouterConfig } from "./config.ts";
import { recordCall } from "./metrics.ts";
import { classifyBlocking, parseVerificationResponse } from "./verdict.ts";

/**
 * The verifier's prompt: the configured template with its three placeholders
 * filled, or the built-in template when the config carries none.
 *
 * Python's `str.replace` substitutes EVERY occurrence and treats the
 * replacement as literal text. JavaScript's `replace` does neither: it takes
 * the first occurrence only, and a string replacement carrying `$&` or
 * `` $` `` is expanded against the match. Both differences are reachable from
 * a routed response -- the text under review is substituted verbatim, and a
 * response discussing shell or regex syntax carries those sequences -- so the
 * substitution is `replaceAll` with a FUNCTION replacement, which is the one
 * form that is literal.
 */
function fillPlaceholder(text: string, name: string, value: string): string {
  return text.replaceAll(name, () => value);
}

export function buildVerificationPrompt(
  template: string,
  originalTask: string,
  taskType: string,
  originalResponse: string,
): string {
  const body =
    template ||
    "Verify the following work adversarially. Start your response " +
      "with VERIFIED or ISSUES FOUND.\n\n### Original Task\n" +
      "{original_task}\n\n### Task Type\n{task_type}\n\n" +
      "### Response Under Review\n{original_response}\n";
  const withTask = fillPlaceholder(
    body,
    "{original_task}",
    originalTask || "(not provided)",
  );
  const withType = fillPlaceholder(withTask, "{task_type}", taskType);
  return fillPlaceholder(withType, "{original_response}", originalResponse);
}

/** What `autoVerify` puts on `route`'s `metadata.verification`. */
export interface AutoVerification {
  readonly verdict: string;
  readonly blocking: boolean;
  readonly issue_count: number;
  readonly verifier_model: string;
  readonly verifier_provider: string;
}

/** The half of `RouteResult` this job reads, so a caller need not build one. */
export interface VerifiableResult {
  readonly content: string;
  readonly model_name: string;
  readonly provider: string;
}

/**
 * Verify a routed response with a different-provider verifier; returns the
 * verification block, or null when no verifier survives.
 *
 * Best-effort by contract: the routed call already succeeded and was paid for,
 * so a verifier that cannot be reached loses the review rather than the
 * answer. The exclusion is not best-effort -- it is the working provider, and
 * `route` refuses rather than picking it.
 *
 * `route` is reached through a dynamic import because it is this module's own
 * caller. Python defers the same edge with a function-scope import; deferring
 * it here keeps the cycle out of the module graph rather than relying on a
 * bundler to resolve one.
 */
export async function autoVerify(
  routeResult: VerifiableResult,
  content: string,
  taskType: string,
  config: RouterConfig,
): Promise<AutoVerification | null> {
  const { RouterError, route } = await import("./route.ts");
  const { ROLE_VERIFIER } = await import("./selection.ts");

  const template = config["_verification_template"];
  const prompt = buildVerificationPrompt(
    typeof template === "string" ? template : "",
    content,
    taskType,
    routeResult.content,
  );
  let result;
  try {
    result = await route(prompt, {
      taskType: "verification",
      role: ROLE_VERIFIER,
      excludeProviders: [routeResult.provider],
    });
  } catch (error) {
    if (error instanceof RouterError) return null;
    throw error;
  }
  const [verdict, issues] = parseVerificationResponse(result.content);
  const classification = classifyBlocking(verdict, issues);
  recordCall(config, {
    callType: "verify",
    taskType,
    model: result.model_name,
    provider: result.provider,
    generationParams: {},
    inputTokens: result.input_tokens,
    outputTokens: result.output_tokens,
    elapsedSeconds: result.elapsed_seconds,
    escalated: result.escalated,
    stopReason: "",
    transport: result.transport,
    verifierOf: routeResult.model_name,
    verdict,
    issueCount: issues.length,
  });
  return {
    verdict,
    blocking: classification.blocking,
    issue_count: issues.length,
    verifier_model: result.model_name,
    verifier_provider: result.provider,
  };
}
