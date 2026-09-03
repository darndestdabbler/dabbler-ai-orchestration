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
import {
  CopilotCliTransport,
  HANDOFF_THRESHOLD_UTF16_UNITS,
  getCliVersion,
} from "../src/transports/copilot.ts";
import { isOk } from "../src/transports/base.ts";

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

// --- The seat, and the one branch a canned process cannot prove -------------
//
// Every other seat test drives a fake spawner, which proves the state machine
// and nothing about the CLI. The handoff is the branch that most needs the
// real thing: it depends on two facts about the CLI that are not ours -- that
// it has a file-read tool, and that the system temp directory is auto-allowed
// -- and on a model actually reading a file to EOF. A canned process can be
// told to emit the ack; a real one has to earn it.
//
// The prompt clears the threshold and plants a fact at the HEAD, the MIDDLE
// and the TAIL of the payload. Head-only would pass on a model that read the
// first chunk and stopped, which is exactly the under-read the ack exists to
// catch; the tail fact and the ack line together are what make "read it
// through" checkable.
//
// One billed turn, on the cheapest confirmed entry the seat catalog records.

const SEAT_MODEL = process.env["DABBLER_SEAT_MODEL"] ?? "gpt-5.5";
const HEAD_FACT = "PAYLOAD-HEAD-MARKER-7413";
const MIDDLE_FACT = "PAYLOAD-MIDDLE-MARKER-2856";
const TAIL_FACT = "PAYLOAD-TAIL-MARKER-9092";

/** Filler that cannot be summarised away, sized to clear the threshold. */
function planted(): string {
  const filler = (label: string, count: number): string =>
    Array.from(
      { length: count },
      (_unused, index) => `line ${index} of the ${label} block, which carries no fact.`,
    ).join("\n");
  return [
    `The first fact is ${HEAD_FACT}.`,
    filler("first", 300),
    `The second fact is ${MIDDLE_FACT}.`,
    filler("second", 300),
    `The third fact is ${TAIL_FACT}.`,
    "Report all three facts, each on its own line, and nothing else.",
  ].join("\n");
}

describe.runIf(LIVE)("a live handoff through the seat", () => {
  it("reads the payload through and earns its acknowledgement", async () => {
    const version = getCliVersion();
    expect(version, "the Copilot CLI must be on PATH for this test").not.toBeNull();

    const prompt = planted();
    const transport = new CopilotCliTransport({ maxInvocations: 1 });
    const result = await transport.dispatch({
      model_id: SEAT_MODEL,
      system_prompt: "You are answering a transport reachability probe.",
      user_message: prompt,
    });

    // Assert the CALL took the branch under test before asserting anything
    // about the answer: a prompt that fell under the ceiling would pass every
    // content check below while proving nothing about the handoff.
    expect(result.metadata["handoff"], JSON.stringify(result.metadata)).toBe(true);
    expect(Number(result.metadata["payload_bytes"])).toBeGreaterThan(
      HANDOFF_THRESHOLD_UTF16_UNITS,
    );
    // The whole metadata, not just the stderr: a seat that refuses for quota
    // and a payload the model under-read are different failures, and the run
    // that has to be read later is the one that failed.
    expect(isOk(result), JSON.stringify(result.metadata, null, 2)).toBe(true);
    expect(result.metadata["handoff_ack"]).toBe("validated");
    expect(result.metadata["payload_file_modified"]).toBe(false);

    for (const fact of [HEAD_FACT, MIDDLE_FACT, TAIL_FACT]) {
      expect(result.content).toContain(fact);
    }
    // Stripped, not merely present: the ack is transport control and must
    // never reach a caller as part of the model's answer.
    expect(result.content).not.toContain("HANDOFF-ACK");
    // The conversation id is the only handle on what this call cost, and
    // `seat-cost` is what prices it.
    expect(String(result.metadata["session_id"])).not.toBe("");

    process.stderr.write(
      `[live seat probe] model=${SEAT_MODEL} cli=${String(version)} ` +
        `conversation=${String(result.metadata["session_id"])} ` +
        `payload_bytes=${String(result.metadata["payload_bytes"])}\n`,
    );
  }, 600_000);
});
