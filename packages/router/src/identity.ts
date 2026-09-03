// Orchestrator identity: which provider effectively ran this session.
//
// The independence guarantee rests here -- the verifier must come from a
// different provider than the orchestrator, so the orchestrator's effective
// provider must be *derived*, never trusted. Identity is the underlying model
// resolved through the model registry at use time; the free-text `provider`
// label on the orchestrator block is a seat descriptor and an explicit second
// choice. A Copilot seat's label is never trusted at all: multi-provider
// engines resolve through the model or fail closed.
//
// `resolveSessionOrchestratorIdentity` is the one function here that reads a
// repository rather than a block, and it reads it through `progress` -- the
// canonical reader -- rather than opening `sessions.json` itself. That is
// why it waited for session 31: a second reader of the record written here
// to reach it early is precisely the drift the port exists to remove. All of
// its judgement is `resolveOrchestratorIdentity`'s; what it adds is which
// block to ask about.

import { loadConfig } from "./config.ts";
import { readRawSessionState } from "./sessionState.ts";
import { pythonRepr } from "./pythonJson.ts";
import {
  KNOWN_PROVIDERS,
  confirmedCatalogEntries,
  type ConfirmedCatalogEntry,
} from "./transports/copilot.ts";

export const MULTI_PROVIDER_ENGINES: ReadonlySet<string> = new Set([
  "github-copilot",
  "copilot",
]);

export const PROVENANCE_DIRECT = "direct";
export const PROVENANCE_ASSERTED = "asserted";

export const SOURCE_MODEL_REGISTRY = "model-registry";
export const SOURCE_PROVIDER_FIELD = "provider-field";


/**
 * The orchestrator's effective provider cannot be established. Fail closed --
 * the fix is always `session start --model`.
 */
export class IdentityResolutionError extends Error {}

export interface OrchestratorIdentity {
  readonly effectiveProvider: string;
  readonly provenance: string | null;
  readonly source: string;
  readonly model: string | null;
  readonly engine: string | null;
}

/** A model registry: alias -> `{ provider, model_id, … }`. */
export type ModelsRegistry = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isMultiProviderEngine(engine: unknown): boolean {
  if (typeof engine !== "string") return false;
  return MULTI_PROVIDER_ENGINES.has(engine.trim().toLowerCase());
}

/**
 * Derived from the engine, never a free choice: 'asserted' for seats that can
 * front any vendor, 'direct' for single-vendor engines.
 */
export function classifyIdentityProvenance(engine: unknown): string | null {
  if (typeof engine !== "string" || engine.trim() === "") return null;
  return isMultiProviderEngine(engine) ? PROVENANCE_ASSERTED : PROVENANCE_DIRECT;
}

/**
 * Dots to hyphens, lowercased. A trailing `-YYYYMMDD` is stripped only on
 * `claude-` ids -- an unscoped strip once let an invented dated variant of
 * another provider's id normalize onto a real entry.
 *
 * The rule itself lives with the shared shapes (`contracts/models.ts`):
 * selection compares ids under the same spelling, and its import of this
 * module for a string rule was a back-edge. Re-exported so this module's
 * consumers keep their import.
 */
export { normalizeModelToken } from "./contracts/models.ts";
import { normalizeModelToken } from "./contracts/models.ts";

function loadDefaultRegistry(): ModelsRegistry {
  try {
    const models = loadConfig()["models"];
    return isRecord(models) ? models : {};
  } catch {
    return {};
  }
}

/**
 * The seat-catalog fallback: the Copilot CLI's confirmed model universe is
 * documented truth, so membership there is a registry lookup, not a
 * name-prefix guess. Best-effort -- an unreadable lock resolves nothing.
 */
function catalogProvider(
  token: string,
  entries: readonly ConfirmedCatalogEntry[] = confirmedCatalogEntries(),
): string | null {
  for (const entry of entries) {
    if (normalizeModelToken(entry.id) === token) {
      const provider = entry.provider.trim().toLowerCase();
      return KNOWN_PROVIDERS.has(provider) ? provider : null;
    }
  }
  return null;
}

function providerOf(entry: unknown): string | null {
  if (!isRecord(entry)) return null;
  const provider = entry["provider"];
  if (provider === undefined || provider === null || provider === "") return null;
  return String(provider).trim().toLowerCase();
}

/**
 * Canonical lowercase provider for a model string, or null. Four bounded
 * lookups: exact registry key, exact model_id, normalized token across both,
 * then the confirmed seat-catalog universe.
 */
export function resolveModelProvider(
  model: unknown,
  modelsRegistry?: ModelsRegistry | null,
  catalog?: readonly ConfirmedCatalogEntry[],
): string | null {
  if (typeof model !== "string" || model.trim() === "") return null;
  const registry =
    modelsRegistry !== undefined && modelsRegistry !== null
      ? modelsRegistry
      : loadDefaultRegistry();

  const exact = providerOf(registry[model]);
  if (exact !== null) return exact;

  for (const entry of Object.values(registry)) {
    if (isRecord(entry) && entry["model_id"] === model) {
      const provider = providerOf(entry);
      if (provider !== null) return provider;
    }
  }

  const token = normalizeModelToken(model);
  for (const [alias, entry] of Object.entries(registry)) {
    if (!isRecord(entry)) continue;
    const modelId = entry["model_id"];
    const matches =
      normalizeModelToken(alias) === token ||
      (typeof modelId === "string" &&
        modelId !== "" &&
        normalizeModelToken(modelId) === token);
    if (!matches) continue;
    const provider = providerOf(entry);
    if (provider !== null) return provider;
  }

  return catalogProvider(token, catalog);
}

function trimmedOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * Resolve the effective provider from a persisted orchestrator block.
 *
 * Precedence: the model resolved through the registry wins over any `provider`
 * label. A multi-provider engine whose model does not resolve fails closed --
 * the seat label is not trusted. A single-vendor engine may fall back to its
 * label (read-side legacy tolerance only; `session start` refuses any new
 * unresolvable model).
 */
export function resolveOrchestratorIdentity(
  orchestrator: unknown,
  options: {
    modelsRegistry?: ModelsRegistry | null;
    catalog?: readonly ConfirmedCatalogEntry[];
  } = {},
): OrchestratorIdentity {
  if (!isRecord(orchestrator) || Object.keys(orchestrator).length === 0) {
    throw new IdentityResolutionError(
      "session-state carries no orchestrator block; re-run " +
        "start_session with --engine and --model, then retry.",
    );
  }
  const engine = trimmedOrNull(orchestrator["engine"]);
  const model = trimmedOrNull(orchestrator["model"]);
  const provenance = classifyIdentityProvenance(engine);
  const multi = isMultiProviderEngine(engine);

  if (model !== null) {
    const provider = resolveModelProvider(model, options.modelsRegistry, options.catalog);
    if (provider) {
      return {
        effectiveProvider: provider,
        provenance,
        source: SOURCE_MODEL_REGISTRY,
        model,
        engine,
      };
    }
    if (multi) {
      throw new IdentityResolutionError(
        `orchestrator model '${model}' does not resolve in the model ` +
          "registry and the engine is a multi-provider seat, so the " +
          "provider label cannot be trusted. Re-run start_session " +
          "with a registry-known --model, then retry.",
      );
    }
  } else if (multi) {
    throw new IdentityResolutionError(
      "a multi-provider engine (Copilot seat) recorded no model; the " +
        "effective provider cannot be derived. Re-run start_session " +
        "with --model, then retry.",
    );
  }

  const label = trimmedOrNull(orchestrator["provider"]);
  if (label !== null) {
    return {
      effectiveProvider: label.toLowerCase(),
      provenance,
      source: SOURCE_PROVIDER_FIELD,
      model,
      engine,
    };
  }
  throw new IdentityResolutionError(
    "orchestrator block resolves no provider (no registry-known model, " +
      "no provider label). Re-run start_session with --model, then retry.",
  );
}

/**
 * The one session-level path: read state, pick the session, resolve.
 *
 * An explicit number wins; otherwise the session in flight; otherwise the
 * last session that carries an orchestrator block at all -- which is what
 * makes the question answerable between two sessions. A record-level
 * `orchestrator` stands in for a session that carries none. Every failure is
 * an `IdentityResolutionError`, because a caller that cannot tell whose
 * identity this is must not proceed on a guess: the verifier's independence
 * is decided from this answer.
 */
export function resolveSessionOrchestratorIdentity(
  sessionsDir: string,
  sessionNumber?: number | null,
  options: {
    modelsRegistry?: ModelsRegistry | null;
    catalog?: readonly ConfirmedCatalogEntry[];
  } = {},
): OrchestratorIdentity {
  // The raw record: identity needs the sessions array and its stored
  // per-session fields, which v5 carries as written; the projection's
  // derived view is the Work Explorer's concern, not this resolution's.
  const state = readRawSessionState(sessionsDir);
  if (state === null) {
    throw new IdentityResolutionError(
      `no readable session-state.json under ${sessionsDir}`,
    );
  }
  const block = chooseOrchestratorBlock(state, sessionNumber ?? null);
  if (block === null) {
    throw new IdentityResolutionError(
      `no session under ${sessionsDir} carries an orchestrator block ` +
        `(session_number=${pythonRepr(sessionNumber ?? null)}); re-run ` +
        "start_session with --model, then retry.",
    );
  }
  return resolveOrchestratorIdentity(block, options);
}

/**
 * Which orchestrator block a record answers with, or null when none does.
 *
 * An explicit number wins; otherwise the session in flight; otherwise the
 * last session that carries a block at all -- which is what makes the
 * question answerable between two sessions. A record-level `orchestrator`
 * stands in for a session that carries none.
 */
export function chooseOrchestratorBlock(
  state: Record<string, unknown>,
  sessionNumber: number | null,
): unknown {
  const sessions = (Array.isArray(state["sessions"]) ? state["sessions"] : []).filter(
    isRecord,
  );

  let chosen: Record<string, unknown> | null = null;
  if (sessionNumber !== null) {
    chosen = sessions.find((entry) => entry["number"] === sessionNumber) ?? null;
  } else {
    chosen = sessions.find((entry) => entry["status"] === "in-progress") ?? null;
    if (chosen === null) {
      const withBlock = sessions.filter((entry) => isRecord(entry["orchestrator"]));
      chosen = withBlock.length > 0 ? withBlock[withBlock.length - 1] : null;
    }
  }
  const fromSession = chosen === null ? null : chosen["orchestrator"];
  const block =
    fromSession !== null && fromSession !== undefined && fromSession !== false
      ? fromSession
      : (state["orchestrator"] ?? null);
  if (!block || (isRecord(block) && Object.keys(block).length === 0)) return null;
  return block;
}
