import * as assert from "assert";
import { summarizeMetrics, buildSparkline, exportToCsv } from "../../utils/metrics";
import { MetricsEntry } from "../../types";

const SAMPLE: MetricsEntry[] = [
  {
    session_set: "user-auth",
    session_num: 1,
    model: "claude-sonnet-4-6",
    effort: "normal",
    input_tokens: 10000,
    output_tokens: 2000,
    cost_usd: 0.25,
    timestamp: "2026-04-20T10:00:00Z",
  },
  {
    session_set: "user-auth",
    session_num: 2,
    model: "claude-sonnet-4-6",
    effort: "normal",
    input_tokens: 8000,
    output_tokens: 1500,
    cost_usd: 0.18,
    timestamp: "2026-04-21T11:00:00Z",
  },
  {
    session_set: "product-catalog",
    session_num: 1,
    model: "claude-opus-4-7",
    effort: "high",
    input_tokens: 20000,
    output_tokens: 5000,
    cost_usd: 1.20,
    timestamp: "2026-04-22T09:00:00Z",
  },
];

suite("metrics", () => {
  test("summarizeMetrics totals cost correctly", () => {
    const summary = summarizeMetrics(SAMPLE);
    assert.ok(Math.abs(summary.totalCost - 1.63) < 0.001);
  });

  test("summarizeMetrics groups by session set", () => {
    const summary = summarizeMetrics(SAMPLE);
    assert.strictEqual(summary.bySessionSet["user-auth"].sessions, 2);
    assert.strictEqual(summary.bySessionSet["product-catalog"].sessions, 1);
    assert.ok(Math.abs(summary.bySessionSet["user-auth"].cost - 0.43) < 0.001);
  });

  test("summarizeMetrics groups by model", () => {
    const summary = summarizeMetrics(SAMPLE);
    assert.ok("claude-sonnet-4-6" in summary.byModel);
    assert.ok("claude-opus-4-7" in summary.byModel);
  });

  test("summarizeMetrics produces 30 daily entries", () => {
    const summary = summarizeMetrics(SAMPLE);
    assert.strictEqual(summary.dailyCosts.length, 30);
  });

  test("buildSparkline returns 30-char string of block chars", () => {
    const summary = summarizeMetrics(SAMPLE);
    const sparkline = buildSparkline(summary.dailyCosts);
    assert.strictEqual(sparkline.length, 30);
    assert.match(sparkline, /^[▁▂▃▄▅▆▇█]+$/);
  });

  test("buildSparkline handles all-zero input", () => {
    const zeros = Array.from({ length: 30 }, (_, i) => ({
      date: `2026-04-${String(i + 1).padStart(2, "0")}`,
      cost: 0,
    }));
    const sparkline = buildSparkline(zeros);
    assert.strictEqual(sparkline.length, 30);
    // All zeros → all lowest block
    assert.match(sparkline, /^▁+$/);
  });

  test("exportToCsv includes header and all rows", () => {
    const csv = exportToCsv(SAMPLE);
    const lines = csv.split("\n");
    assert.strictEqual(lines[0], "session_set,session_num,model,effort,input_tokens,output_tokens,cost_usd,timestamp");
    assert.strictEqual(lines.length, 4); // header + 3 rows
    assert.ok(lines[1].startsWith("user-auth,1,"));
  });
});
