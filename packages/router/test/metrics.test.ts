import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, afterEach, describe, expect, it } from "vitest";

import {
  METRICS_PATH_ENV_VAR,
  loadMetrics,
  printMetricsReport,
  recordCall,
  type CallRecord,
} from "../src/metrics.ts";
import { makeConfig, makeTempDir, removeTempDirs } from "./support/fixtures.ts";

afterAll(removeTempDirs);

afterEach(() => {
  delete process.env[METRICS_PATH_ENV_VAR];
});

/** A config whose metrics log sits beside a named config file. */
function configAt(directory: string): Record<string, unknown> {
  return makeConfig({ _config_path: join(directory, "router-config.yaml") });
}

function record(
  config: Record<string, unknown>,
  overrides: Partial<CallRecord> = {},
): void {
  recordCall(config, {
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
    ...overrides,
  });
}

function reportOf(config: Record<string, unknown>): string {
  let out = "";
  printMetricsReport(config, (text) => {
    out += text;
  });
  return out;
}

describe("recording a call", () => {
  it("appends one JSON line per call", () => {
    const config = configAt(makeTempDir());
    record(config);
    record(config, { model: "opus", provider: "anthropic" });
    const rows = loadMetrics(config);
    expect(rows).toHaveLength(2);
    expect(rows[0]["model"]).toBe("pro");
    expect(rows[1]["provider"]).toBe("anthropic");
  });

  it("records tokens and no dollar figure", () => {
    const config = configAt(makeTempDir());
    record(config, {
      billedUsageUnavailable: true,
      transport: "copilot-cli",
      transportSessionId: "conv-9",
    });
    const row = loadMetrics(config)[0];
    expect(row).not.toHaveProperty("cost_usd");
    expect([row["input_tokens"], row["output_tokens"]]).toEqual([100, 200]);
    expect(row["billed_usage_unavailable"]).toBe(true);
    expect(row["transport_session_id"]).toBe("conv-9");
  });

  it("leaves the served-model flag tri-state", () => {
    const config = configAt(makeTempDir());
    record(config, { requestedModelId: "a", servedModelId: "b" });
    record(config, { requestedModelId: "a", servedModelId: "a" });
    record(config, { requestedModelId: "a", servedModelId: null });
    expect(loadMetrics(config).map((row) => row["served_model_mismatch"])).toEqual([
      true,
      false,
      null,
    ]);
  });

  it("writes nothing when metrics are disabled", () => {
    const config = configAt(makeTempDir());
    (config["metrics"] as Record<string, unknown>)["enabled"] = false;
    record(config);
    expect(loadMetrics(config)).toEqual([]);
  });

  it("never throws when the write fails", () => {
    // A path under a regular file is unwritable on every platform.
    const blocker = join(makeTempDir(), "not-a-directory");
    writeFileSync(blocker, "", "utf8");
    process.env[METRICS_PATH_ENV_VAR] = join(blocker, "metrics.jsonl");
    expect(() => record(makeConfig())).not.toThrow();
  });

  it("takes the env override over the config's own location", () => {
    const target = join(makeTempDir(), "elsewhere", "m.jsonl");
    process.env[METRICS_PATH_ENV_VAR] = target;
    record(configAt(makeTempDir()));
    expect(existsSync(target)).toBe(true);
  });

  it("writes a line the Python router would have written", () => {
    // Both routers append to one file on one machine, so a reader must not
    // be able to tell which wrote a line: `json.dumps` separators, an
    // integral float that stays a float, and non-ASCII escaped.
    const directory = makeTempDir();
    const config = configAt(directory);
    record(config, { elapsedSeconds: 2, stopReason: "ended — cleanly" });
    const line = readFileSync(join(directory, "router-metrics.jsonl"), "utf8").trim();
    expect(line).toContain('"elapsed_seconds": 2.0');
    expect(line).toContain('"call_type": "route"');
    expect(line).toContain("ended \\u2014 cleanly");
  });

  it("skips a line it cannot parse", () => {
    const directory = makeTempDir();
    const config = configAt(directory);
    record(config);
    const log = join(directory, "router-metrics.jsonl");
    writeFileSync(log, readFileSync(log, "utf8") + "garbage line\n", "utf8");
    expect(loadMetrics(config)).toHaveLength(1);
  });
});

describe("the report", () => {
  it("totals tokens and names no dollars", () => {
    const config = configAt(makeTempDir());
    record(config);
    record(config, { sessionNumber: 42 });
    const out = reportOf(config);
    expect(out).toContain("Total input tokens:   200");
    expect(out).toContain("session 42");
    expect(out).not.toContain("$");
  });

  it("points a seat row at the conversation id that prices it", () => {
    const config = configAt(makeTempDir());
    record(config, {
      billedUsageUnavailable: true,
      transport: "copilot-cli",
      transportSessionId: "conv-9",
      model: "seat-model",
    });
    const out = reportOf(config);
    expect(out).toContain("billed_usage_unavailable");
    expect(out).toContain("ai_router.seat_cost");
  });

  it("reports an empty log cleanly", () => {
    expect(reportOf(configAt(makeTempDir()))).toContain("no metrics recorded yet");
  });
});
