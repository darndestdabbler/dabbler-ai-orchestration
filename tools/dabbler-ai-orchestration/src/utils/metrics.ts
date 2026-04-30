import * as fs from "fs";
import * as path from "path";
import { MetricsEntry, CostSummary } from "../types";

export const METRICS_FILE = path.join("ai-router", "metrics.jsonl");

export function readMetrics(workspaceRoot: string): MetricsEntry[] {
  const metricsPath = path.join(workspaceRoot, METRICS_FILE);
  if (!fs.existsSync(metricsPath)) return [];
  try {
    const lines = fs.readFileSync(metricsPath, "utf8").split(/\r?\n/).filter(Boolean);
    return lines
      .map((line) => {
        try { return JSON.parse(line) as MetricsEntry; }
        catch { return null; }
      })
      .filter((e): e is MetricsEntry => e !== null);
  } catch {
    return [];
  }
}

export function summarizeMetrics(entries: MetricsEntry[]): CostSummary {
  const bySessionSet: CostSummary["bySessionSet"] = {};
  const byModel: Record<string, number> = {};
  const dailyMap: Record<string, number> = {};

  for (const e of entries) {
    // Per session-set
    if (!bySessionSet[e.session_set]) {
      bySessionSet[e.session_set] = { sessions: 0, cost: 0, lastRun: "" };
    }
    bySessionSet[e.session_set].sessions++;
    bySessionSet[e.session_set].cost += e.cost_usd;
    if (e.timestamp > bySessionSet[e.session_set].lastRun) {
      bySessionSet[e.session_set].lastRun = e.timestamp;
    }

    // Per model
    byModel[e.model] = (byModel[e.model] ?? 0) + e.cost_usd;

    // Daily
    const day = e.timestamp.slice(0, 10);
    dailyMap[day] = (dailyMap[day] ?? 0) + e.cost_usd;
  }

  const today = new Date();
  const dailyCosts = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (29 - i));
    const dateStr = d.toISOString().slice(0, 10);
    return { date: dateStr, cost: dailyMap[dateStr] ?? 0 };
  });

  return {
    totalCost: entries.reduce((s, e) => s + e.cost_usd, 0),
    bySessionSet,
    byModel,
    dailyCosts,
  };
}

export function buildSparkline(dailyCosts: Array<{ date: string; cost: number }>): string {
  const BLOCKS = "▁▂▃▄▅▆▇█";
  const values = dailyCosts.map((d) => d.cost);
  const max = Math.max(...values, 0.0001);
  return values
    .map((v) => BLOCKS[Math.min(7, Math.floor((v / max) * 7.99))])
    .join("");
}

export function exportToCsv(entries: MetricsEntry[]): string {
  const header = "session_set,session_num,model,effort,input_tokens,output_tokens,cost_usd,timestamp";
  const rows = entries.map((e) =>
    [
      e.session_set,
      e.session_num,
      e.model,
      e.effort,
      e.input_tokens,
      e.output_tokens,
      e.cost_usd.toFixed(4),
      e.timestamp,
    ].join(",")
  );
  return [header, ...rows].join("\n");
}
