// The Transport seam `route` dispatches through.
//
// Both transports answer with an `APIResult`. The direct-API transport
// fills token counts from the provider's own usage block; the Copilot CLI
// transport reports what the CLI exposes (no input tokens, no
// billing-authoritative usage) and carries its diagnostics in `metadata`.

export interface APIResult {
  readonly content: string;
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly stop_reason: string;
  /**
   * The model id the PROVIDER says it served, read from the response body
   * (Anthropic/OpenAI expose it as `model`, Google as `modelVersion`, the
   * Copilot CLI echoes it back). It is not always the id asked for --
   * OpenAI has resolved a bare id to a differently-priced variant with
   * nothing else able to see it. `null` (never `""`) means the provider did
   * not tell us, which is a different fact from "served something unnamed"
   * and must stay distinguishable in the metrics.
   */
  readonly served_model_id?: string | null;
  /**
   * Transport diagnostics: `error_class` (absent or null on success),
   * `session_id`, `exit_code`. Open record -- values off the wire are
   * shape-checked by readers, never trusted.
   */
  readonly metadata: Record<string, unknown>;
}

/** Python's `APIResult.ok`: no `error_class` means the call landed. */
export function isOk(result: APIResult): boolean {
  const errorClass = result.metadata["error_class"];
  return errorClass === undefined || errorClass === null;
}

/**
 * A transport, as `route` reaches one.
 *
 * Async where Python is synchronous: the direct-API transport is `fetch`,
 * and the seat transport is a child process read event by event. Neither
 * has a blocking form under Node, and a transport that pretended to have
 * one would block the only thread there is.
 */
export interface DispatchRequest {
  readonly model_id: string;
  readonly system_prompt: string;
  readonly user_message: string;
  readonly max_tokens?: number;
  readonly generation_params?: Record<string, unknown> | null;
}

export interface Transport {
  dispatch(request: DispatchRequest): Promise<APIResult>;
}
