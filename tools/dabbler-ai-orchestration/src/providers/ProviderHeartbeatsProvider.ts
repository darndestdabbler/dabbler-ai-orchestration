import * as vscode from "vscode";
import { runPythonModule, PythonRunResult } from "../utils/pythonRunner";

/**
 * Tree view backing the ``Provider Heartbeats`` activity-bar entry.
 *
 * Shells out to ``python -m ai_router.heartbeat_status --format json``
 * for the same reason :class:`ProviderQueuesProvider` shells out to
 * ``queue_status``: the on-disk format lives in :mod:`ai_router.capacity`
 * and a TS reader would either duplicate or drift from it.
 *
 * **Framing.** Every visible string in this view is backward-looking.
 * The Python helper ships a ``_disclaimer`` field with every payload,
 * and the tree's view-description footer echoes it. The cross-provider
 * v1 review explicitly rejected predictive framings (subscription-window
 * exhaustion, throttle risk, "is this provider healthy") — see the
 * Set 005 spec, Risks section, "Heartbeat misuse".
 */

const CACHE_TTL_MS = 5_000;
const DEFAULT_LOOKBACK_MINUTES = 60;
const DEFAULT_SILENT_WARNING_MINUTES = 30;

export const HEARTBEAT_FOOTER =
  "Observational only. Subscription windows are not introspectable. Use as a heartbeat signal, not as routing guidance.";

export interface ProviderHeartbeat {
  signal_path: string;
  signal_file_present: boolean;
  last_completion_at: string | null;
  minutes_since_last_completion: number | null;
  /** ``completions_in_last_<N>min`` — N = lookback_minutes. */
  completions_in_window: number;
  /** ``tokens_in_last_<N>min`` — N = lookback_minutes. */
  tokens_in_window: number;
  lookback_minutes: number;
  disclaimer: string;
}

export interface HeartbeatStatusPayload {
  providers: Record<string, ProviderHeartbeat>;
  disclaimer: string;
}

// ---------- tree node shapes ----------

export type HeartbeatTreeNode = ProviderNode | InfoNode;

interface ProviderNode {
  kind: "provider";
  provider: string;
  data: ProviderHeartbeat;
  silentWarningMinutes: number;
}
interface InfoNode {
  kind: "info";
  label: string;
  detail?: string;
  isError?: boolean;
}

// ---------- provider ----------

export interface ProviderHeartbeatsDeps {
  getWorkspaceRoot: () => string | undefined;
  /** Override for tests. */
  fetchPayload?: (
    workspaceRoot: string,
    lookbackMinutes: number,
  ) => Promise<{ ok: true; payload: HeartbeatStatusPayload } | { ok: false; message: string }>;
  /** Override for tests. */
  getSettings?: () => { lookbackMinutes: number; silentWarningMinutes: number };
  /** Clock — overridable for tests. */
  now?: () => number;
}

export class ProviderHeartbeatsProvider
  implements vscode.TreeDataProvider<HeartbeatTreeNode>
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    HeartbeatTreeNode | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _cache:
    | { fetchedAt: number; payload: HeartbeatStatusPayload; lookback: number }
    | null = null;
  private _lastError: string | null = null;
  private _inFlight: Promise<void> | null = null;

  constructor(private readonly deps: ProviderHeartbeatsDeps) {}

  refresh(): void {
    this._cache = null;
    this._onDidChangeTreeData.fire();
  }

  /** Test-only — inject a payload and skip the spawn path. */
  _setPayloadForTest(payload: HeartbeatStatusPayload, lookback: number): void {
    this._cache = {
      fetchedAt: this.deps.now?.() ?? Date.now(),
      payload,
      lookback,
    };
    this._lastError = null;
  }

  // ---------- TreeDataProvider ----------

  getTreeItem(element: HeartbeatTreeNode): vscode.TreeItem {
    return buildTreeItem(element);
  }

  async getChildren(element?: HeartbeatTreeNode): Promise<HeartbeatTreeNode[]> {
    if (element) return [];

    const root = this.deps.getWorkspaceRoot();
    if (!root) {
      return [{ kind: "info", label: "No workspace folder open." }];
    }
    const settings = this._readSettings();
    const payload = await this._getPayload(root, settings.lookbackMinutes);
    if (!payload) {
      const detail = this._lastError ?? "Unknown error.";
      return [
        {
          kind: "info",
          label: "Failed to read heartbeat status.",
          detail,
          isError: true,
        },
      ];
    }
    const providers = Object.keys(payload.providers).sort();
    if (providers.length === 0) {
      return [
        {
          kind: "info",
          label: "No provider capacity signals found.",
          detail:
            "Looked for capacity_signal.jsonl files under provider-queues/. Run a session that emits work to populate this view.",
        },
      ];
    }
    return providers.map<ProviderNode>((p) => ({
      kind: "provider",
      provider: p,
      data: payload.providers[p],
      silentWarningMinutes: settings.silentWarningMinutes,
    }));
  }

  // ---------- internals ----------

  private _readSettings(): { lookbackMinutes: number; silentWarningMinutes: number } {
    if (this.deps.getSettings) return this.deps.getSettings();
    const cfg = vscode.workspace.getConfiguration("dabblerProviderHeartbeats");
    return {
      lookbackMinutes: cfg.get<number>("lookbackMinutes", DEFAULT_LOOKBACK_MINUTES),
      silentWarningMinutes: cfg.get<number>(
        "silentWarningMinutes",
        DEFAULT_SILENT_WARNING_MINUTES,
      ),
    };
  }

  private async _getPayload(
    root: string,
    lookback: number,
  ): Promise<HeartbeatStatusPayload | null> {
    const now = this.deps.now?.() ?? Date.now();
    if (
      this._cache &&
      this._cache.lookback === lookback &&
      now - this._cache.fetchedAt < CACHE_TTL_MS
    ) {
      return this._cache.payload;
    }
    if (this._inFlight) {
      await this._inFlight;
      return this._cache?.payload ?? null;
    }
    const fetcher = this.deps.fetchPayload ?? defaultFetchPayload;
    this._inFlight = (async () => {
      const result = await fetcher(root, lookback);
      if (result.ok) {
        this._cache = {
          fetchedAt: this.deps.now?.() ?? Date.now(),
          payload: result.payload,
          lookback,
        };
        this._lastError = null;
      } else {
        this._lastError = result.message;
      }
    })();
    try {
      await this._inFlight;
    } finally {
      this._inFlight = null;
    }
    return this._cache?.payload ?? null;
  }
}

// ---------- tree-item rendering ----------

export function isSilent(data: ProviderHeartbeat, silentMinutes: number): boolean {
  // No signal file or no completions ever recorded both count as silent —
  // the operator cannot tell the difference between "never ran" and "stopped
  // running" without other context, and either way the provider has not
  // produced anything.
  if (!data.signal_file_present) return true;
  if (data.minutes_since_last_completion === null) return true;
  return data.minutes_since_last_completion > silentMinutes;
}

export function formatMinutesAgo(m: number | null): string {
  if (m === null) return "never";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h ago` : `${h}h ${rem}m ago`;
}

export function buildTreeItem(node: HeartbeatTreeNode): vscode.TreeItem {
  switch (node.kind) {
    case "provider": {
      const d = node.data;
      const silent = isSilent(d, node.silentWarningMinutes);
      const item = new vscode.TreeItem(
        node.provider,
        vscode.TreeItemCollapsibleState.None,
      );
      const lookback = d.lookback_minutes;
      if (!d.signal_file_present) {
        item.description = "no capacity signal yet";
      } else if (d.minutes_since_last_completion === null) {
        item.description = `silent · 0 completions / ${lookback}m`;
      } else {
        const ago = formatMinutesAgo(d.minutes_since_last_completion);
        item.description = `last seen ${ago} · ${d.completions_in_window} completions / ${lookback}m`;
      }
      item.iconPath = new vscode.ThemeIcon(
        silent ? "warning" : "pulse",
        silent
          ? new vscode.ThemeColor("notificationsWarningIcon.foreground")
          : undefined,
      );
      item.tooltip = buildProviderTooltip(node.provider, d, silent);
      item.contextValue = silent ? "heartbeatProvider:silent" : "heartbeatProvider:active";
      return item;
    }
    case "info": {
      const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
      item.description = node.detail;
      item.tooltip = node.detail ? new vscode.MarkdownString(node.detail) : undefined;
      item.iconPath = new vscode.ThemeIcon(node.isError ? "warning" : "info");
      item.contextValue = node.isError ? "heartbeatInfo:error" : "heartbeatInfo";
      return item;
    }
  }
}

function buildProviderTooltip(
  provider: string,
  d: ProviderHeartbeat,
  silent: boolean,
): vscode.MarkdownString {
  const lines: string[] = [
    `**${provider}** ${silent ? "· ⚠️ silent" : ""}`.trim(),
    `Last completion: ${d.last_completion_at ?? "—"}`,
    `Completions in last ${d.lookback_minutes}m: ${d.completions_in_window}`,
    `Tokens in last ${d.lookback_minutes}m: ${d.tokens_in_window}`,
    `Signal file: \`${d.signal_path}\``,
    `_${d.disclaimer}_`,
  ];
  return new vscode.MarkdownString(lines.join("\n\n"));
}

// ---------- default fetcher (production path) ----------

async function defaultFetchPayload(
  workspaceRoot: string,
  lookbackMinutes: number,
): Promise<{ ok: true; payload: HeartbeatStatusPayload } | { ok: false; message: string }> {
  const result = await runPythonModule({
    cwd: workspaceRoot,
    module: "ai_router.heartbeat_status",
    args: [
      "--format",
      "json",
      "--lookback-minutes",
      String(lookbackMinutes),
    ],
    pythonPathSetting: "dabblerProviderQueues.pythonPath",
  });
  return parseFetchResult(result, lookbackMinutes);
}

export function parseFetchResult(
  result: PythonRunResult,
  lookbackMinutes: number,
): { ok: true; payload: HeartbeatStatusPayload } | { ok: false; message: string } {
  if (result.timedOut) {
    return { ok: false, message: "heartbeat_status timed out (10s)" };
  }
  if (result.exitCode !== 0) {
    const trimmed = (result.stderr || result.stdout).trim();
    const detail = trimmed ? ` — ${trimmed.split("\n").slice(-3).join(" / ")}` : "";
    return {
      ok: false,
      message: `heartbeat_status exited ${result.exitCode}${detail}`,
    };
  }
  try {
    const raw = JSON.parse(result.stdout) as {
      providers: Record<string, Record<string, unknown>>;
      _disclaimer?: string;
    };
    if (!raw || typeof raw !== "object" || !raw.providers) {
      return { ok: false, message: "heartbeat_status returned malformed JSON (missing 'providers')" };
    }
    const providers: Record<string, ProviderHeartbeat> = {};
    for (const [name, info] of Object.entries(raw.providers)) {
      providers[name] = normalizeProvider(info, lookbackMinutes);
    }
    return {
      ok: true,
      payload: { providers, disclaimer: String(raw._disclaimer ?? HEARTBEAT_FOOTER) },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Failed to parse heartbeat_status JSON: ${msg}` };
  }
}

/**
 * Normalize the Python payload's embedded-N field names
 * (``completions_in_last_60min``) into stable names. Falls back to the
 * default lookback if the payload disagrees with the request — defensive
 * against a future helper-version mismatch where the CLI ignores
 * ``--lookback-minutes`` or rounds it.
 */
function normalizeProvider(
  info: Record<string, unknown>,
  requestedLookback: number,
): ProviderHeartbeat {
  const lookback =
    typeof info.lookback_minutes === "number" ? info.lookback_minutes : requestedLookback;
  const completions =
    pickNumber(info, `completions_in_last_${lookback}min`) ??
    pickNumber(info, `completions_in_last_${requestedLookback}min`) ??
    0;
  const tokens =
    pickNumber(info, `tokens_in_last_${lookback}min`) ??
    pickNumber(info, `tokens_in_last_${requestedLookback}min`) ??
    0;
  return {
    signal_path: String(info.signal_path ?? ""),
    signal_file_present: Boolean(info.signal_file_present),
    last_completion_at:
      typeof info.last_completion_at === "string" ? info.last_completion_at : null,
    minutes_since_last_completion:
      typeof info.minutes_since_last_completion === "number"
        ? info.minutes_since_last_completion
        : null,
    completions_in_window: completions,
    tokens_in_window: tokens,
    lookback_minutes: lookback,
    disclaimer: String(info._disclaimer ?? HEARTBEAT_FOOTER),
  };
}

function pickNumber(obj: Record<string, unknown>, key: string): number | null {
  const v = obj[key];
  return typeof v === "number" ? v : null;
}
