// Append-only metrics ledger for the router.
//
// One JSON object per line in `router-metrics.jsonl` -- no wrapping array,
// additive schema (new fields never break old lines), safe to stream with jq.
// Writing is best-effort and never raises: metrics must never break a routed
// call that already succeeded and was already paid for.
//
// **Tokens are recorded and dollars are not computed.** Reconciliation happens
// out of band, against the vendor's own console: a repository names its own API
// key per provider, so the join between these token counts and the vendor's
// dollars is the key itself. Seat spend is not attributable per session and is
// not estimated -- `billed_usage_unavailable` marks the rows a seat transport
// produced, and `transport_session_id` (the CLI conversation id) is what
// `seat_cost` prices them by.

import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { isRecord, truthy, type RouterConfig } from "./config.ts";
import { platformNewlines } from "./journal.ts";
import { ASSET_DIR } from "./paths.ts";
import { PythonFloat, dumps } from "./pythonJson.ts";
import { readText } from "./textfile.ts";
import { writeOut } from "./output.ts";

export const METRICS_PATH_ENV_VAR = "AI_ROUTER_METRICS_PATH";
const DEFAULT_LOG_FILENAME = "router-metrics.jsonl";

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

/**
 * `AI_ROUTER_METRICS_PATH` env var > alongside the loaded config file > the
 * package directory.
 */
function logPath(config: RouterConfig): string {
  const metricsConfig = record(config["metrics"]);
  const filename =
    typeof metricsConfig["log_filename"] === "string"
      ? metricsConfig["log_filename"]
      : DEFAULT_LOG_FILENAME;

  const override = process.env[METRICS_PATH_ENV_VAR];
  if (override) return override;
  // `resolve`, not `join`: Python's `Path(dir) / name` RETURNS `name` when
  // it is absolute, and `join` would paste one path onto the other. The
  // declared filename is a config value, so it can be either.
  const configPath = config["_config_path"];
  if (typeof configPath === "string" && configPath) {
    return resolve(dirname(configPath), filename);
  }
  return resolve(ASSET_DIR, filename);
}

function metricsEnabled(config: RouterConfig): boolean {
  const block = record(config["metrics"]);
  return "enabled" in block ? Boolean(block["enabled"]) : true;
}

export interface CallRecord {
  /** "route" | "verify" */
  readonly callType: string;
  readonly taskType: string;
  /** Registry alias, or the catalog id on a seat. */
  readonly model: string;
  readonly provider: string;
  readonly generationParams: Record<string, unknown> | null;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly elapsedSeconds: number;
  readonly escalated: boolean;
  readonly stopReason: string;
  readonly sessionNumber?: number | null;
  readonly requestedModelId?: string | null;
  readonly servedModelId?: string | null;
  readonly transport?: string | null;
  readonly billedUsageUnavailable?: boolean | null;
  readonly transportSessionId?: string | null;
  readonly verifierOf?: string | null;
  readonly verdict?: string | null;
  readonly issueCount?: number | null;
}

/**
 * The row one call becomes, decided from the call alone.
 *
 * Separate from the append so the shape both routers write -- the effort and
 * thinking fields each provider spells differently, the tri-state
 * served-model flag, the float that stays a float -- is a judgement over
 * facts rather than something only a written file can show.
 */
export function metricsRow(
  call: CallRecord,
  now: Date = new Date(),
): Record<string, unknown> {
  const params = call.generationParams ?? {};
  let effort: unknown = null;
  let thinkingOn = false;
  if (call.provider === "anthropic") {
    effort = params["effort"] ?? null;
    thinkingOn = Boolean(record(params["thinking"])["enabled"]);
  } else if (call.provider === "google") {
    effort = params["thinking_level"] ?? null;
    const budget = params["thinking_budget"];
    thinkingOn =
      effort !== null ||
      (budget !== undefined && budget !== null && budget !== 0);
  } else if (call.provider === "openai") {
    effort = params["reasoning_effort"] ?? null;
    thinkingOn = !(effort === null || effort === "none" || effort === "minimal");
  }

  const requested = call.requestedModelId ?? null;
  const served = call.servedModelId ?? null;
  const row: Array<readonly [string, unknown]> = [
    ["timestamp", pythonUtcNow(now)],
    ["session_number", call.sessionNumber ?? null],
    ["call_type", call.callType],
    ["task_type", call.taskType],
    ["model", call.model],
    ["requested_model_id", requested],
    ["served_model_id", served],
    // Tri-state: true/false only when BOTH ids are known, else null -- an
    // absent id does not establish that the provider served what was asked
    // for.
    ["served_model_mismatch", requested && served ? requested !== served : null],
    ["provider", call.provider],
    ["effort", effort ?? null],
    ["thinking_on", thinkingOn],
    ["input_tokens", Math.trunc(call.inputTokens)],
    ["output_tokens", Math.trunc(call.outputTokens)],
    ["elapsed_seconds", new PythonFloat(roundHalfEven(call.elapsedSeconds, 3))],
    ["escalated", Boolean(call.escalated)],
    ["stop_reason", call.stopReason],
    ["transport", call.transport ?? null],
    ["billed_usage_unavailable", call.billedUsageUnavailable ?? null],
    ["transport_session_id", call.transportSessionId ?? null],
    ["verifier_of", call.verifierOf ?? null],
    ["verdict", call.verdict ?? null],
    ["issue_count", call.issueCount ?? null],
  ];
  return Object.fromEntries(row);
}

/**
 * Append one record. Never throws -- a write failure (disk full, permissions)
 * skips silently rather than breaking the routed call.
 */
export function recordCall(config: RouterConfig, call: CallRecord): void {
  if (!metricsEnabled(config)) return;
  try {
    const path = logPath(config);
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, platformNewlines(dumps(metricsRow(call)) + "\n"), {
      encoding: "utf8",
    });
  } catch {
    // Best-effort by contract; see the module header.
  }
}

/**
 * Read every record; unparseable lines are skipped. Empty list when the file
 * is missing.
 */
export function loadMetrics(config: RouterConfig): Array<Record<string, unknown>> {
  const path = logPath(config);
  if (!existsSync(path)) return [];
  const records: Array<Record<string, unknown>> = [];
  for (const raw of readText(path).split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (isRecord(parsed)) records.push(parsed);
  }
  return records;
}

/**
 * Rows a seat transport produced. Their spend is real and is not attributable
 * here -- `transport_session_id` is what prices them.
 */
function seatRows(
  records: ReadonlyArray<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  return records.filter((row) => row["billed_usage_unavailable"] === true);
}

function tokensOf(rows: ReadonlyArray<Record<string, unknown>>): number {
  let total = 0;
  for (const row of rows) {
    total += numberOf(row["input_tokens"]) + numberOf(row["output_tokens"]);
  }
  return total;
}

function numberOf(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringOf(value: unknown, fallback: string): string {
  return value === undefined || value === null ? fallback : String(value);
}

/**
 * Human-readable summary: token totals, per-model / per-task / per-set volume,
 * and served-model mismatches.
 */
export function printMetricsReport(
  config: RouterConfig,
  write: (text: string) => void = writeOut,
): void {
  write(renderMetricsReport(loadMetrics(config)));
}

/** The report's whole text, over rows already read. */
export function renderMetricsReport(
  records: ReadonlyArray<Record<string, unknown>>,
): string {
  let out = "";
  const print = (line = ""): void => {
    out += line + "\n";
  };
  if (records.length === 0) {
    print(
      "(no metrics recorded yet -- router-metrics.jsonl is empty " + "or missing)",
    );
    return out;
  }

  const rule = "=".repeat(68);
  print("\n" + rule);
  print(`AI ROUTER -- METRICS REPORT  (${records.length} calls logged)`);
  print(rule);

  print(
    "Total input tokens:   " +
      comma(records.reduce((sum, row) => sum + numberOf(row["input_tokens"]), 0)),
  );
  print(
    "Total output tokens:  " +
      comma(records.reduce((sum, row) => sum + numberOf(row["output_tokens"]), 0)),
  );

  const seat = seatRows(records);
  if (seat.length > 0) {
    const withId = seat.filter((row) => truthy(row["transport_session_id"])).length;
    print(
      `On a seat transport:                ${seat.length} call(s) ` +
        "(billed_usage_unavailable)",
    );
    print(
      "                                    real spend in AI credits; " +
        `${withId} carry the conversation id that prices them ` +
        "(dabbler seat-cost)",
    );
  }

  const mismatched = records.filter((row) => truthy(row["served_model_mismatch"]));
  if (mismatched.length > 0) {
    const grouped = new Map<string, number>();
    for (const row of mismatched) {
      const key = `${stringOf(row["requested_model_id"], "None")} -> ${stringOf(
        row["served_model_id"],
        "None",
      )}`;
      grouped.set(key, (grouped.get(key) ?? 0) + 1);
    }
    print("\n--- Requested vs served model ---");
    print(
      "  A dated-snapshot pin is routine; a change of model FAMILY " +
        "is a different model answering.",
    );
    for (const [key, count] of sortedBy(
      [...grouped.entries()],
      ([, count]) => -count,
    )) {
      print(`      ${pad(String(count), 5)}x  ${key}`);
    }
  }

  print("\n--- By model ---");
  interface ModelSlot {
    records: Array<Record<string, unknown>>;
    escalated: number;
    provider: string;
  }
  const byModel = new Map<string, ModelSlot>();
  for (const row of records) {
    const name = stringOf(row["model"], "?");
    let slot = byModel.get(name);
    if (!slot) {
      slot = { records: [], escalated: 0, provider: stringOf(row["provider"], "?") };
      byModel.set(name, slot);
    }
    slot.records.push(row);
    if (truthy(row["escalated"])) slot.escalated += 1;
  }
  print(
    `  ${padRight("model", 24)} ${padRight("provider", 11)} ${pad("calls", 6)} ` +
      `${pad("tokens", 12)} ${pad("esc%", 6)}`,
  );
  for (const [name, slot] of sortedBy(
    [...byModel.entries()],
    ([, slot]) => -tokensOf(slot.records),
  )) {
    const calls = slot.records.length;
    const escalationPercent = calls ? (100.0 * slot.escalated) / calls : 0;
    print(
      `  ${padRight(name, 24)} ${padRight(slot.provider, 11)} ${pad(String(calls), 6)} ` +
        `${pad(comma(tokensOf(slot.records)), 12)} ${pad(
          escalationPercent.toFixed(1),
          5,
        )}%`,
    );
  }

  print("\n--- By task type ---");
  const byTask = new Map<string, Array<Record<string, unknown>>>();
  for (const row of records) {
    const key = stringOf(row["task_type"], "?");
    const rows = byTask.get(key);
    if (rows) rows.push(row);
    else byTask.set(key, [row]);
  }
  print(`  ${padRight("task_type", 24)} ${pad("calls", 6)} ${pad("tokens", 12)}`);
  for (const [task, rows] of sortedBy(
    [...byTask.entries()],
    ([, rows]) => -tokensOf(rows),
  )) {
    print(
      `  ${padRight(task, 24)} ${pad(String(rows.length), 6)} ` +
        `${pad(comma(tokensOf(rows)), 12)}`,
    );
  }

  const sessions = new Map<number, Array<Record<string, unknown>>>();
  for (const row of records) {
    const number = row["session_number"];
    // Python's `isinstance(n, int)` excludes a float and a bool alike.
    if (typeof number !== "number" || !Number.isInteger(number)) continue;
    const rows = sessions.get(number);
    if (rows) rows.push(row);
    else sessions.set(number, [row]);
  }
  if (sessions.size > 0) {
    print("\n--- By session ---");
    print(`  ${padRight("session", 40)} ${pad("calls", 6)} ${pad("tokens", 12)}`);
    for (const [number, rows] of [...sessions.entries()].sort(
      (a, b) => a[0] - b[0],
    )) {
      print(
        `  ${padRight(`session ${number}`, 40)} ${pad(String(rows.length), 6)} ` +
          `${pad(comma(tokensOf(rows)), 12)}`,
      );
    }
  }

  print(rule + "\n");
  return out;
}

/** `dabbler metrics`. */
export function main(config: RouterConfig): number {
  printMetricsReport(config);
  return 0;
}

// --- Rendering, as Python renders it -----------------------------------------

function comma(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function pad(text: string, width: number): string {
  return text.padStart(width);
}

function padRight(text: string, width: number): string {
  return text.padEnd(width);
}

/** `sorted(items, key=...)`: stable, ascending, on a numeric key. */
function sortedBy<T>(items: readonly T[], key: (item: T) => number): T[] {
  return [...items].sort((a, b) => key(a) - key(b));
}

/** UTC now as `datetime.now(timezone.utc).isoformat()` spells it. */
function pythonUtcNow(now: Date = new Date()): string {
  const iso = now.toISOString();
  // JS carries milliseconds; Python's isoformat carries microseconds.
  return iso.replace(/\.(\d{3})Z$/, ".$1000+00:00");
}

/** Python's `round(x, 3)`: half-way values go to the even neighbour. */
export function roundHalfEven(value: number, digits: number): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** digits;
  const scaled = value * factor;
  const floor = Math.floor(scaled);
  const remainder = scaled - floor;
  let rounded: number;
  if (remainder > 0.5) rounded = floor + 1;
  else if (remainder < 0.5) rounded = floor;
  else rounded = floor % 2 === 0 ? floor : floor + 1;
  return rounded / factor;
}
