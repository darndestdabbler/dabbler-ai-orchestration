// One call per (transport, model): ask for a named model and record what
// answered. The measurement session 144's plan asked for, bounded to the
// four calls that plan names.
//
// It exists because the archival record cannot settle one half of the
// question. A verification round's `served_model` on the direct-API path is
// the provider's own statement and settles it; a Copilot seat's is the CLI's
// echo of the request, which a seat that ignored `--model` would print
// identically. This probe does not change that -- an echo is an echo however
// freshly it is fetched -- and it is run anyway, on the transport where the
// answer IS decisive, for models the rounds do not cover.
//
// Four calls: two models on the direct-API path, and two on a Copilot seat
// when `DABBLER_COPILOT_BINARY` names one. The seat half is opt-in by that
// variable because it spends premium requests and most machines running this
// have no seat; without it those two rows report that they were not made
// rather than failing.
//
// Not a test and not part of any suite: it spends real calls. Run it by hand,
// read the table, and put what it says into `docs/model-fidelity.md`. The
// credential-gated version that runs in CI-shaped conditions is in
// `live.test.ts`, behind `DABBLER_E2E=1` like every other live test.

import { loadConfig } from "../src/config.ts";
import { DirectApiTransport } from "../src/transports/api.ts";
import { CopilotCliTransport } from "../src/transports/copilot.ts";
import { isOk, type APIResult } from "../src/transports/base.ts";

/** The prompt is irrelevant: what is read is the envelope, not the answer. */
const PROMPT = "Reply with the single word: ok";

/** Two per transport, which is what the plan bought and what it costs. */
const API_MODELS: ReadonlyArray<readonly [string, string]> = [
  ["anthropic", "claude-haiku-4-5-20251001"],
  ["openai", "gpt-5.4-mini"],
];

/** Two of the seat's cheapest, from two vendors. */
const SEAT_MODELS: readonly string[] = ["gpt-5-mini", "claude-haiku-4.5"];

interface Observed {
  readonly transport: string;
  readonly requested: string;
  readonly served: string | null;
  readonly note: string;
}

async function probeApi(): Promise<Observed[]> {
  const config = loadConfig();
  const providers = (config["providers"] ?? {}) as Record<string, Record<string, unknown>>;
  const out: Observed[] = [];
  for (const [provider, modelId] of API_MODELS) {
    const settings = providers[provider];
    if (settings === undefined) {
      out.push({ transport: "api", requested: modelId, served: null, note: `no ${provider} provider configured` });
      continue;
    }
    let result: APIResult;
    try {
      result = await new DirectApiTransport(provider, settings).dispatch({
        model_id: modelId,
        system_prompt: "",
        user_message: PROMPT,
        max_tokens: 16,
      });
    } catch (error) {
      out.push({
        transport: "api",
        requested: modelId,
        served: null,
        note: `call failed: ${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }
    out.push({
      transport: "api",
      requested: modelId,
      served: result.served_model_id ?? null,
      note: isOk(result) ? "the provider's own statement" : "call did not succeed",
    });
  }
  return out;
}

/**
 * The seat half. Its answer is an ECHO whichever way it comes out, so what it
 * can prove is bounded before it runs: a seat naming a DIFFERENT model has
 * testified against itself and is believed, and a seat naming the model it
 * was asked for has said the one thing it would say either way.
 *
 * `dabbler copilot refresh --models a,b` is the same probe wired into the
 * catalog, and is the right way to run it when the answer should be KEPT.
 * This is here so the two transports are measured by one command.
 */
async function probeSeat(binary: string | null): Promise<Observed[]> {
  const out: Observed[] = [];
  if (binary === null) {
    for (const modelId of SEAT_MODELS) {
      out.push({ transport: "copilot-cli", requested: modelId, served: null, note: "no seat CLI on PATH" });
    }
    return out;
  }
  const transport = new CopilotCliTransport({ binary });
  for (const modelId of SEAT_MODELS) {
    let result: APIResult;
    try {
      result = await transport.dispatch({
        model_id: modelId,
        system_prompt: "",
        user_message: PROMPT,
      });
    } catch (error) {
      out.push({
        transport: "copilot-cli",
        requested: modelId,
        served: null,
        note: `call failed: ${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }
    out.push({
      transport: "copilot-cli",
      requested: modelId,
      served: result.served_model_id ?? null,
      note: isOk(result) ? "the seat's echo -- a label, not the provider's word" : "call did not succeed",
    });
  }
  return out;
}

async function main(): Promise<void> {
  // The seat half is opt-in by binary: it costs premium requests, and a
  // machine with no seat should report that rather than fail.
  const seatBinary = process.env["DABBLER_COPILOT_BINARY"] ?? null;
  const observed = [...(await probeApi()), ...(await probeSeat(seatBinary))];
  for (const row of observed) {
    const verdict =
      row.served === null
        ? "no served id"
        : row.served === row.requested
          ? "EXACT"
          : `DIFFERENT (${row.served})`;
    process.stdout.write(
      `${row.transport}\t${row.requested}\t${verdict}\t${row.note}\n`,
    );
  }
}

await main();
