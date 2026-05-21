// Pure render helpers for the orchestrator accordion body in the Set
// 029 Session 4 custom-tree view. Extracted from the retired
// orchestratorIndicatorProvider.ts per S4 audit Q1 (a) +
// GPT-5.4 M4 — no filesystem watchers, no vscode.* lifecycle calls,
// no message-protocol coupling. Just deterministic state-in → HTML-out.
//
// Visual treatment, gauge geometry, mismatch semantics, escaping —
// all unchanged from v0.15.0. Callers (CustomSessionSetsView)
// resolve the RenderState elsewhere and ask this module to render
// the body fragment.

// ----- Schema types -----

export interface OrchestratorMarker {
  schemaVersion: number;
  sessionSetSlug?: string;
  updatedAt: string;
  writer: string;
  signalKind: "current" | "configured-default" | "last-observed" | "manual";
  confidence: "high" | "medium" | "low";
  provider: string;
  providerDisplayName: string;
  model: string;
  modelDisplayName: string;
  tier: "low" | "mid" | "flagship" | "unknown";
  effort: {
    normalized: "low" | "medium" | "high" | "extra-high" | "max";
    native: string;
    thinking: boolean;
    signalKind: "current" | "configured-default" | "last-observed" | "manual";
    confidence: "high" | "medium" | "low";
    observedAt?: string;
  };
  stalenessMaxSec: number;
}

export interface Recommendation {
  rawText: string;
  providerName: string;
  modelName: string;
  effort: string;
  sessionLabel: string;
  setName: string;
}

export interface Mismatch {
  recommendation: Recommendation;
  reason: string;
}

export interface EmptyCta {
  commandId: string;
  // Short verb fragment for the "No signal — <label>" link
  // (e.g., "install Claude Code hook", "set up Codex", "set Gemini").
  label: string;
  // Optional command args (e.g., `{prefillProvider: "google"}` for the
  // Gemini shim). Plumbed through the webview's data-command-args
  // attribute and JSON.parsed at dispatch time.
  args?: unknown;
}

export type RenderState =
  | { kind: "empty"; cta?: EmptyCta | null }
  | { kind: "loaded"; marker: OrchestratorMarker; stale: boolean; ageSec: number; mismatch: Mismatch | null };

export const DEFAULT_STALENESS_MAX_SEC = 28800; // 8h

// ----- Tier / effort rank helpers (mismatch logic) -----

export function tierRank(tier: string | undefined): number {
  switch ((tier || "").toLowerCase()) {
    case "low":      return 0;
    case "mid":      return 1;
    case "flagship": return 2;
    default:         return -1;
  }
}

export function effortRank(effort: string | undefined): number {
  switch ((effort || "").toLowerCase()) {
    case "low":        return 0;
    case "medium":     return 1;
    case "high":       return 2;
    case "extra-high": return 3;
    case "max":        return 4;
    default:           return -1;
  }
}

export function classifyRecommendationTier(providerName: string, modelName: string): string {
  const p = (providerName || "").toLowerCase();
  const m = (modelName || "").toLowerCase();
  if (p.includes("claude") || m.includes("claude")) {
    if (m.includes("opus")) return "flagship";
    if (m.includes("sonnet")) return "mid";
    if (m.includes("haiku")) return "low";
  }
  if (p.includes("gemini") || m.includes("gemini")) {
    if (m.includes("pro")) return "flagship";
    if (m.includes("flash 2") || m.includes("2.5")) return "mid";
    if (m.includes("flash")) return "low";
  }
  if (p.includes("codex") || p.includes("openai") || m.startsWith("gpt-") || m.includes("codex") || m.startsWith("o1") || m.startsWith("o3")) {
    if (m.includes("mini")) return "low";
    if (m.startsWith("o1") || m.startsWith("o3") || m.includes("5") || (m.includes("4o") && !m.includes("mini"))) return "flagship";
    return "mid";
  }
  if (p.includes("copilot") || m.includes("copilot")) return "mid";
  return "unknown";
}

// ----- Formatting helpers -----

export function fmtAge(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "?";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

export function providerHasExtraCapacity(provider: string): boolean {
  const p = (provider || "").toLowerCase();
  return p === "anthropic" || p === "google" || p.includes("claude") || p.includes("gemini");
}

export function effortDisplayName(effort: string): string {
  switch (effort) {
    case "low":        return "Low";
    case "medium":     return "Medium";
    case "high":       return "High";
    case "extra-high": return "Extra-High";
    case "max":        return "Max";
    default:           return "Unknown";
  }
}

// Compose the full "Actual Model" description from a marker. Canonical
// textual description shown in the model table. Future-proof — new
// capacity parameters become extra clauses appended here.
export function describeMarker(marker: OrchestratorMarker): string {
  const provider = marker.providerDisplayName || "";
  const modelIsUnknown = !marker.model || marker.model === "unknown";
  const modelText = modelIsUnknown ? "(model unknown)" : (marker.modelDisplayName || "");
  const effortText = effortDisplayName(marker.effort.normalized).toLowerCase();
  const modelClause = marker.signalKind === "configured-default"
    ? `${provider} ${modelText} (configured default)`
    : `${provider} ${modelText}`;
  let desc = `${modelClause}, ${effortText} effort`;
  if (providerHasExtraCapacity(marker.provider)) {
    const thinkingOn = marker.effort.thinking === true;
    if (thinkingOn && marker.effort.signalKind === "last-observed" && marker.effort.observedAt) {
      const ageSec = (Date.now() - Date.parse(marker.effort.observedAt)) / 1000;
      const native = marker.effort.native || "/think";
      desc += `, thinking on (last ${native} ${fmtAge(ageSec)} ago)`;
    } else if (thinkingOn) {
      desc += `, thinking on`;
    } else {
      desc += `, thinking off`;
    }
  }
  return desc.trim().replace(/\s+/g, " ");
}

export function describeRecommendation(rec: Recommendation): string {
  return `${rec.providerName} ${rec.modelName}, ${rec.effort.toLowerCase()} effort`.replace(/\s+/g, " ");
}

// ----- Mismatch computation -----

export function computeMismatch(marker: OrchestratorMarker, rec: Recommendation): Mismatch | null {
  const norm = (s: string) => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

  const providerOk = norm(marker.providerDisplayName).includes(norm(rec.providerName)) ||
                     norm(rec.providerName).includes(norm(marker.providerDisplayName));
  const modelOk = norm(marker.modelDisplayName).includes(norm(rec.modelName)) ||
                  norm(rec.modelName).includes(norm(marker.modelDisplayName));
  const effortOk = norm(marker.effort.normalized) === norm(rec.effort);

  if (providerOk && modelOk && effortOk) return null;

  const diffs: string[] = [];
  if (!providerOk || !modelOk) {
    diffs.push(
      `model: actual "${marker.providerDisplayName} ${marker.modelDisplayName}", recommended "${rec.providerName} ${rec.modelName}"`,
    );
  }
  if (!effortOk) {
    diffs.push(`effort: actual "${marker.effort.normalized}", recommended "${rec.effort}"`);
  }
  if (!providerOk && diffs.length === 0) {
    diffs.push(`provider: actual "${marker.providerDisplayName}", recommended "${rec.providerName}"`);
  }

  return {
    recommendation: rec,
    reason:
      `Current orchestrator differs from ${rec.setName} ${rec.sessionLabel} recommendation. ` +
      diffs.join("; ") +
      ". This may be intentional (e.g., extra credits, task harder or simpler than anticipated) — " +
      `the Suggested row surfaces the recommendation; you decide. ` +
      `Switch via "Dabbler: Check Out As…".`,
  };
}

// ----- HTML escaping (S4 R13 mitigation per GPT M5) -----

export function escHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function escAttr(s: string): string {
  return escHtml(s).replace(/"/g, "&quot;");
}

// ----- Gauge geometry -----

export function tierToNeedleAngle(tier: string): number {
  switch (tier) {
    case "low":      return -150;
    case "mid":      return -90;
    case "flagship": return -30;
    case "unknown":  return -90;
    default:         return -90;
  }
}

export function effortToNeedleAngle(effort: string): number {
  switch (effort) {
    case "low":        return -150;
    case "medium":     return -90;
    case "high":       return -60;
    case "extra-high": return -35;
    case "max":        return -15;
    default:           return -90;
  }
}

export function effortColorBucket(effort: string): string {
  switch (effort) {
    case "low":        return "low";
    case "medium":     return "mid";
    case "high":       return "mid";
    case "extra-high": return "flagship";
    case "max":        return "flagship";
    default:           return "unknown";
  }
}

export function renderGaugeSvg(tier: string, signalKind: string, needleAngleDeg: number): string {
  const cx = 35;
  const cy = 35;
  const radius = 28;
  const arcBg = `M${cx - radius},${cy} A${radius},${radius} 0 0 1 ${cx + radius},${cy}`;

  const fillAngleDeg = Math.max(-180, Math.min(0, needleAngleDeg));
  const fillAngleRad = (fillAngleDeg * Math.PI) / 180;
  const fillEndX = cx + radius * Math.cos(fillAngleRad);
  const fillEndY = cy + radius * Math.sin(fillAngleRad);
  const arcFill = `M${cx - radius},${cy} A${radius},${radius} 0 0 1 ${fillEndX.toFixed(2)},${fillEndY.toFixed(2)}`;

  const needleAngleRad = (needleAngleDeg * Math.PI) / 180;
  const needleLength = radius - 4;
  const needleTipX = cx + needleLength * Math.cos(needleAngleRad);
  const needleTipY = cy + needleLength * Math.sin(needleAngleRad);

  return `<svg class="gauge-svg" viewBox="0 0 70 38" data-tier="${escAttr(tier)}" data-signal="${escAttr(signalKind)}">
  <path class="gauge-arc-bg" d="${arcBg}" />
  <path class="gauge-arc-fill" d="${arcFill}" />
  <path class="gauge-rim" d="${arcBg}" />
  <line class="gauge-needle" x1="${cx}" y1="${cy}" x2="${needleTipX.toFixed(2)}" y2="${needleTipY.toFixed(2)}" />
  <circle class="gauge-needle-pivot" cx="${cx}" cy="${cy}" r="1.6" />
</svg>`;
}

// ----- Tooltips -----

export function modelTooltip(marker: OrchestratorMarker): string {
  const conf = marker.confidence;
  switch (marker.signalKind) {
    case "current":
      return conf === "low"
        ? "live signal (low confidence — hook payload missing model)"
        : `live signal (${conf} confidence)`;
    case "configured-default":
      return "configured default (medium confidence — does not track runtime changes)";
    case "last-observed":
      return "last observed via /think (high confidence in detection, but may not reflect current message)";
    case "manual":
      return "set manually (high confidence)";
    default:
      return "";
  }
}

export function effortTooltip(marker: OrchestratorMarker): string {
  const eSig = marker.effort.signalKind;
  if (eSig === "last-observed" && marker.effort.observedAt) {
    const age = fmtAge((Date.now() - Date.parse(marker.effort.observedAt)) / 1000);
    return `last observed ${age} ago via ${marker.effort.native || "/think"} (high confidence in detection, but may not reflect current message)`;
  }
  if (eSig === "configured-default") {
    return "configured default effort (medium confidence — does not track runtime changes)";
  }
  if (eSig === "manual") {
    return "set manually (high confidence)";
  }
  return `effort: ${effortDisplayName(marker.effort.normalized)} (${marker.effort.confidence} confidence)`;
}

// ----- Accordion body rendering -----

// Empty state for the accordion: marker not present for the resolved
// in-progress set. Renders the smart-CTA link only — Set 035 retired
// the grey gauges that used to sit above the CTA. The gauges were
// meant to occupy the visual slot future loaded-state gauges would
// fill, but in practice they read as "data we don't have," which the
// operator (2026-05-21) called out as more confusing than useful.
//
// The CTA button fires via a `data-command` attribute; the webview
// client.js captures the click and posts `{ type: "executeCommand",
// commandId }` to the host. The host dispatches via
// vscode.commands.executeCommand.
//
// Session 5 (smart CTA): the "install hook" link's target is no longer
// hardcoded to Claude. The caller passes an optional `cta` based on
// what's actually installed locally (Claude Code, Codex CLI, Gemini
// Code Assist extension, GitHub Copilot extension) and the operator's
// MRU. If `cta` is null/undefined we fall back to the v0.16.0 behavior
// (link to the Claude Code installer) so existing callers and the
// empty-workspace case keep working unchanged.
const DEFAULT_CTA: EmptyCta = {
  commandId: "dabbler.installOrchestratorHook.claudeCode",
  label: "install Claude Code hook",
};

export function renderAccordionEmpty(cta?: EmptyCta | null): string {
  const effectiveCta = cta || DEFAULT_CTA;
  const argsAttr =
    effectiveCta.args !== undefined
      ? ` data-command-args="${escAttr(JSON.stringify(effectiveCta.args))}"`
      : "";
  return `<div class="acc-empty">
  <div class="acc-empty-cta">
    <span>No signal — </span>
    <button class="acc-link" type="button" data-command="${escAttr(effectiveCta.commandId)}"${argsAttr}>${escHtml(effectiveCta.label)}</button>
  </div>
</div>`;
}

// Loaded state: marker present. Lifts the v0.14.2 gauge treatment
// wholesale — same SVG, same sublabels, same model-section vertical
// stack with optional Suggested row, same stale annotation, same
// "updated Xs ago" footer.
export function renderAccordionLoaded(
  marker: OrchestratorMarker,
  stale: boolean,
  ageSec: number,
  mismatch: Mismatch | null,
): string {
  const modelClasses = [
    "gauge-cell",
    `tier-${marker.tier || "unknown"}`,
    `signal-${marker.signalKind}`,
  ].join(" ");
  const effortClasses = [
    "gauge-cell",
    `effort-${marker.effort.normalized || "unknown"}`,
    `signal-${marker.effort.signalKind || "current"}`,
  ].join(" ");

  const modelNeedle = tierToNeedleAngle(marker.tier);
  const effortNeedle = effortToNeedleAngle(marker.effort.normalized);

  const modelIsUnknown = !marker.model || marker.model === "unknown";
  const modelSublabelText = modelIsUnknown
    ? escHtml(marker.providerDisplayName)
    : `${escHtml(marker.providerDisplayName)} ${escHtml(marker.modelDisplayName)}`;

  const modelOverlay = marker.signalKind === "last-observed"
    ? `<span class="clock-overlay" title="last observed signal">⏱</span>`
    : "";
  const effortOverlay = marker.effort.signalKind === "last-observed"
    ? `<span class="clock-overlay" title="last observed signal">⏱</span>`
    : "";

  const modelTip = modelTooltip(marker);
  const effortTip = effortTooltip(marker);

  const staleClass = stale ? "stale" : "";
  const staleAnnotation = stale
    ? `<div class="last-updated">last updated ${fmtAge(ageSec)} ago — stale</div>`
    : `<div class="last-updated">updated ${fmtAge(ageSec)} ago</div>`;

  const actualDescription = describeMarker(marker);
  const actualSection = mismatch
    ? `<div class="model-section">
    <div class="model-section-header">Actual Model</div>
    <div class="model-section-text">${escHtml(actualDescription)}</div>
  </div>`
    : `<div class="model-section">
    <div class="model-section-text">${escHtml(actualDescription)}</div>
  </div>`;
  const suggestedSection = mismatch
    ? `<div class="model-section model-section-suggested" title="${escAttr(mismatch.reason)}">
    <div class="model-section-header">Suggested</div>
    <div class="model-section-text">${escHtml(describeRecommendation(mismatch.recommendation))}</div>
  </div>`
    : "";
  const modelSections = `<div class="model-sections">${actualSection}${suggestedSection}</div>`;

  // Set 029 Session 6: the Set Orchestrator + Writer Log buttons
  // relegated out of the accordion body to Command Palette +
  // right-click context menu (per consensus call 2026-05-19, GPT-5.4
  // round-2 Q4 must-fix). The S4 M8 indicator-action parity rule no
  // longer applies — the row-action affordance subsumes it.
  return `<div class="gauges ${staleClass}">
  <div class="${modelClasses}" title="${escAttr(modelTip)}">
    <div class="gauge-svg-wrap">
      ${renderGaugeSvg(marker.tier, marker.signalKind, modelNeedle)}
      ${modelOverlay}
    </div>
    <div class="gauge-sublabel">${modelSublabelText}</div>
  </div>
  <div class="${effortClasses}" title="${escAttr(effortTip)}">
    <div class="gauge-svg-wrap">
      ${renderGaugeSvg(effortColorBucket(marker.effort.normalized), marker.effort.signalKind, effortNeedle)}
      ${effortOverlay}
    </div>
    <div class="gauge-sublabel">${escHtml(effortDisplayName(marker.effort.normalized))}</div>
  </div>
</div>
${staleAnnotation}
${modelSections}`;
}

// Top-level dispatcher: state-in, HTML-out. Caller decides whether
// to render the accordion at all (per Q3 = a, non-in-progress rows
// don't get one); this function handles the in-progress case where
// the row IS expanded and the body needs HTML.
export function renderAccordionBody(state: RenderState): string {
  if (state.kind === "empty") {
    return renderAccordionEmpty(state.cta ?? null);
  }
  return renderAccordionLoaded(state.marker, state.stale, state.ageSec, state.mismatch);
}

// ----- Set 033 Session 2 — orchestrator block → RenderState -----
//
// The `.dabbler/orchestrator.json` per-set marker is retired (H2);
// the orchestrator's check-out record is now the `orchestrator` block
// on `session-state.json` (Set 033 Session 1 schema). The accordion
// renderer's input shape — RenderState / OrchestratorMarker — is
// preserved so the gauge geometry, mismatch logic, CSS class hooks,
// and Suggested-row treatment carry through unchanged. This adapter
// synthesizes an OrchestratorMarker-shaped object from the simpler
// check-out record:
//
//   - `signalKind` always `"current"` — the orchestrator block is the
//     writer's own self-report at check-out time, so it is by
//     definition the live signal. The retired "configured-default" /
//     "last-observed" / "manual" branches in the renderer remain
//     reachable in principle (CSS hooks survive) but no orchestrator-
//     block-fed render produces them.
//   - `confidence` always `"high"` — the writer just declared.
//   - `tier` from `classifyRecommendationTier(provider, model)` — the
//     same classifier the recommendation parser uses.
//   - `thinking` always `false` — the new architecture does not track
//     `/think` runtime state. The accordion's "thinking on/off"
//     sublabel becomes "thinking off" for every block-fed render.
//   - `stalenessMaxSec` = DEFAULT_STALENESS_MAX_SEC (8h).
//   - `ageSec` measured from `lastActivityAt` if present (S1 schema),
//     else from `checkedOutAt`, else `0` (fresh tolerated read).
//
// Inputs:
//   - `block` — the orchestrator block from session-state.json
//     (`liveSession.orchestrator`). May be null / partial.
//   - `recommendation` — optional Recommendation pulled from the
//     set's ai-assignment.md by the caller (per-row, since the
//     custom-tree now renders N in-progress sets).
//
// Returns `{ kind: "empty" }` when the block is null / lacks the
// minimum identity (engine + provider OR engine + model).
export function accordionStateFromOrchestratorBlock(
  block: {
    engine?: string;
    provider?: string;
    model?: string;
    effort?: string;
    checkedOutAt?: string;
    lastActivityAt?: string;
  } | null | undefined,
  recommendation: Recommendation | null = null,
): RenderState {
  if (!block) return { kind: "empty" };
  const provider = block.provider ?? block.engine ?? "";
  const model = block.model ?? "";
  if (!provider && !model) return { kind: "empty" };

  const effort = (block.effort ?? "unknown").toLowerCase();
  const tier = classifyRecommendationTier(provider, model);

  const marker: OrchestratorMarker = {
    schemaVersion: 3,
    sessionSetSlug: undefined,
    updatedAt: block.lastActivityAt ?? block.checkedOutAt ?? new Date().toISOString(),
    writer: block.engine ?? "orchestrator",
    signalKind: "current",
    confidence: "high",
    provider,
    providerDisplayName: provider,
    model,
    modelDisplayName: model,
    tier: (tier === "unknown" ? "unknown" : tier) as OrchestratorMarker["tier"],
    effort: {
      normalized: (effort as OrchestratorMarker["effort"]["normalized"]),
      native: effort,
      thinking: false,
      signalKind: "current",
      confidence: "high",
    },
    stalenessMaxSec: DEFAULT_STALENESS_MAX_SEC,
  };

  const reference = block.lastActivityAt ?? block.checkedOutAt;
  const ageSec = reference ? (Date.now() - Date.parse(reference)) / 1000 : 0;
  const stale = ageSec > DEFAULT_STALENESS_MAX_SEC;
  const mismatch = recommendation ? computeMismatch(marker, recommendation) : null;

  return { kind: "loaded", marker, stale, ageSec, mismatch };
}
