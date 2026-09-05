// The call log: the row one routed call becomes, the report read back off
// it, and where the file lives.
//
// The row and the report are decided from facts -- a call, and a list of rows
// -- so both are asserted without a file. The append itself is what the two
// remaining tests cover, because "one JSON line the other router would also
// have written" is a claim about bytes.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import {
  METRICS_PATH_ENV_VAR,
  loadMetrics,
  metricsRow,
  recordCall,
  renderMetricsReport,
  roundHalfEven,
  type CallRecord,
} from "../src/metrics.ts";
import { makeConfig, tempDir } from "./support/answers.ts";

const CALL: CallRecord = {
  callType: "route",
  taskType: "general",
  model: "pro",
  provider: "google",
  generationParams: {},
  inputTokens: 100,
  outputTokens: 200,
  elapsedSeconds: 1.5,
  escalated: false,
  stopReason: "end_turn",
};

function row(overrides: Partial<CallRecord> = {}): Record<string, unknown> {
  return metricsRow({ ...CALL, ...overrides });
}

/** A config whose log sits beside a named config file. */
function configAt(directory: string): Record<string, unknown> {
  return makeConfig({ _config_path: join(directory, "router-config.yaml") });
}

function append(
  config: Record<string, unknown>,
  overrides: Partial<CallRecord> = {},
): void {
  recordCall(config, { ...CALL, ...overrides });
}

afterEach(() => {
  delete process.env[METRICS_PATH_ENV_VAR];
});

describe("the row a call becomes", () => {
  it("records tokens and names no dollar figure", () => {
    // No transport reports one, so a cost column could only ever be zero and
    // would read as an assurance nothing measures.
    const written = row({ transport: "copilot-cli", billedUsageUnavailable: true });
    assert.ok(!Object.hasOwn(written, "cost_usd"));
    assert.deepEqual(
      [written["input_tokens"], written["output_tokens"]],
      [100, 200],
    );
    assert.equal(written["billed_usage_unavailable"], true);
  });

  it("leaves the served-model flag tri-state", () => {
    // An absent id does not establish that the provider served what was
    // asked for, so the third state is not false.
    assert.equal(row({ requestedModelId: "a", servedModelId: "b" })["served_model_mismatch"], true);
    assert.equal(row({ requestedModelId: "a", servedModelId: "a" })["served_model_mismatch"], false);
    assert.equal(row({ requestedModelId: "a", servedModelId: null })["served_model_mismatch"], null);
  });

  it("reads each provider's own spelling of effort and thinking", () => {
    // Three vendors, three names for the same two facts. A reader of the log
    // must not have to know which vendor spells it which way.
    const anthropic = row({
      provider: "anthropic",
      generationParams: { effort: "high", thinking: { enabled: true } },
    });
    const google = row({
      provider: "google",
      generationParams: { thinking_level: "low", thinking_budget: 0 },
    });
    const openai = row({
      provider: "openai",
      generationParams: { reasoning_effort: "minimal" },
    });
    assert.deepEqual(
      [anthropic["effort"], anthropic["thinking_on"]],
      ["high", true],
    );
    assert.deepEqual([google["effort"], google["thinking_on"]], ["low", true]);
    // `minimal` is the vendor's word for off, and off is what it means.
    assert.deepEqual([openai["effort"], openai["thinking_on"]], ["minimal", false]);
  });

  it("truncates token counts and rounds elapsed seconds Python's way", () => {
    const written = row({ inputTokens: 10.9, outputTokens: 20.4, elapsedSeconds: 1.0005 });
    assert.deepEqual([written["input_tokens"], written["output_tokens"]], [10, 20]);
    // Half-way values go to the even neighbour, as `round(x, 3)` does.
    assert.equal(roundHalfEven(1.0005, 3), 1);
    assert.equal(roundHalfEven(1.0015, 3), 1.002);
  });

  it("stamps the time it is handed", () => {
    // Python's isoformat carries microseconds; JavaScript's carries three
    // digits, and one file holds lines from both routers.
    assert.equal(
      metricsRow(CALL, new Date("2026-09-03T12:00:00.250Z"))["timestamp"],
      "2026-09-03T12:00:00.250000+00:00",
    );
  });
});

describe("appending a call", () => {
  it("writes a line the other router would have written", () => {
    // `json.dumps` separators, an integral float that stays a float, and
    // non-ASCII escaped: a reader must not be able to tell which wrote it.
    const directory = tempDir("metrics-");
    append(configAt(directory), { elapsedSeconds: 2, stopReason: "ended — cleanly" });
    const line = readFileSync(join(directory, "router-metrics.jsonl"), "utf8").trim();
    assert.match(line, /"elapsed_seconds": 2\.0/);
    assert.match(line, /"call_type": "route"/);
    assert.match(line, /ended \\u2014 cleanly/);
  });

  it("appends one line per call and skips a line it cannot parse", () => {
    const directory = tempDir("metrics-");
    const config = configAt(directory);
    append(config);
    append(config, { model: "opus", provider: "anthropic" });
    const log = join(directory, "router-metrics.jsonl");
    writeFileSync(log, readFileSync(log, "utf8") + "garbage line\n", "utf8");
    const rows = loadMetrics(config);
    assert.equal(rows.length, 2);
    assert.deepEqual([rows[0]["model"], rows[1]["provider"]], ["pro", "anthropic"]);
  });

  it("writes nothing when metrics are disabled", () => {
    const config = configAt(tempDir("metrics-"));
    (config["metrics"] as Record<string, unknown>)["enabled"] = false;
    append(config);
    assert.deepEqual(loadMetrics(config), []);
  });

  it("takes the env override over the config's own location", () => {
    const target = join(tempDir("metrics-"), "elsewhere", "m.jsonl");
    process.env[METRICS_PATH_ENV_VAR] = target;
    append(configAt(tempDir("metrics-")));
    assert.equal(loadMetrics(makeConfig()).length, 1);
  });

  it("never throws when the write fails", () => {
    // A path under a regular file is unwritable on every platform. A routed
    // call must not break because the log could not be appended to.
    const blocker = join(tempDir("metrics-"), "not-a-directory");
    writeFileSync(blocker, "", "utf8");
    process.env[METRICS_PATH_ENV_VAR] = join(blocker, "metrics.jsonl");
    assert.doesNotThrow(() => append(makeConfig()));
  });
});

describe("the report", () => {
  it("totals tokens, names no dollars, and groups by session", () => {
    const out = renderMetricsReport([row(), row({ sessionNumber: 42 })]);
    assert.match(out, /Total input tokens:\s+200/);
    assert.match(out, /session 42/);
    assert.doesNotMatch(out, /\$/);
  });

  it("points a seat row at the conversation id that prices it", () => {
    // The spend is real and is not attributable here; the report says where
    // it can be.
    const out = renderMetricsReport([
      row({
        billedUsageUnavailable: true,
        transport: "copilot-cli",
        transportSessionId: "conv-9",
        model: "seat-model",
      }),
    ]);
    assert.match(out, /billed_usage_unavailable/);
    assert.match(out, /dabbler seat-cost/);
  });

  it("reports an empty log cleanly", () => {
    assert.match(renderMetricsReport([]), /no metrics recorded yet/);
  });
});
