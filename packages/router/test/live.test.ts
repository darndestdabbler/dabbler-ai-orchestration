// One live call per vendor, through the ported transport.
//
// Everything else in this suite answers a canned response. That proves the
// request this module BUILDS and the reading of a body it was handed, and it
// cannot prove the one thing a transport exists for: that a real vendor
// accepts the request and answers in the shape the reader expects. `fetch`
// replaced `httpx` in this port, so "the shape we send is still accepted" is
// exactly the claim that stopped being inherited.
//
// **Excluded from the default run**, and by an explicit opt-in rather than
// by "are there keys on this machine" -- a developer with keys set must not
// discover that `npm test` spends money. `DABBLER_E2E=1` is the switch; it
// is the vitest twin of pytest's `e2e` marker, which `pytest.ini` declares
// for the same reason.
//
//     DABBLER_E2E=1 npx vitest run test/live.test.ts
//
// The prompts are one sentence and the ceilings are small: this is a
// reachability check, not a capability one.

import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.ts";
import { callModel } from "../src/transports/api.ts";

const LIVE = process.env["DABBLER_E2E"] === "1";

function providerBlock(name: string): Record<string, unknown> {
  const config = loadConfig();
  const providers = config["providers"] as Record<string, unknown>;
  return providers[name] as Record<string, unknown>;
}

/** The bundled registry's id for a vendor, so nothing here pins a model. */
function modelIdFor(provider: string): string {
  const config = loadConfig();
  const models = config["models"] as Record<string, Record<string, unknown>>;
  for (const entry of Object.values(models)) {
    if (entry["provider"] !== provider) continue;
    if (entry["is_enabled"] === false) continue;
    return String(entry["model_id"]);
  }
  throw new Error(`the bundled registry names no enabled model for ${provider}`);
}

describe.runIf(LIVE)("a live call to each vendor", () => {
  for (const provider of ["anthropic", "openai", "google"]) {
    it(`reaches ${provider} and reads its answer`, async () => {
      const result = await callModel(
        provider,
        modelIdFor(provider),
        "Answer in one word.",
        "What is the capital of France?",
        64,
        providerBlock(provider),
        provider === "openai" ? { reasoning_effort: "none" } : {},
      );
      expect(result.content.toLowerCase()).toContain("paris");
      // A vendor that answered but reported nothing is the case the metrics
      // must keep distinguishable, so this asserts the counts exist rather
      // than what they are.
      expect(Number.isFinite(result.input_tokens)).toBe(true);
      expect(Number.isFinite(result.output_tokens)).toBe(true);
      expect(result.stop_reason).not.toBe("");
    }, 120_000);
  }
});
