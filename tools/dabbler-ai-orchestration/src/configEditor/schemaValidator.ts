import Ajv from "ajv";

const ajv = new Ajv({ allErrors: true, strict: false });

export interface ValidationError {
  file: "router-config.yaml" | "budget.yaml" | "local-overrides.yaml";
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidateBatchInput {
  routerConfig: Record<string, unknown> | null;
  budget: Record<string, unknown> | null;
  localOverrides: Record<string, unknown> | null;
}

const ENV_VAR_PATTERN = /^[A-Z_][A-Z0-9_]*$/;
const ENV_VAR_PATTERN_STR = "^[A-Z_][A-Z0-9_]*$";

// router-config.yaml schema is deliberately open: the real config
// file carries many operational fields beyond Appendix B's editor-
// facing controls (model_id, tier, input_cost_per_1m, generation_params,
// etc.). The editor validates only the fields it owns; unknown keys
// are tolerated so the editor never rejects a valid shipped config.
const ROUTER_CONFIG_SCHEMA = {
  type: "object",
  properties: {
    providers: {
      type: "object",
      additionalProperties: {
        type: "object",
        required: ["api_key_env"],
        properties: {
          display_label: { type: "string" },
          enabled: { type: "boolean" },
          api_key_env: { type: "string", minLength: 1, pattern: ENV_VAR_PATTERN_STR },
          base_url: { type: "string" },
        },
      },
    },
    routing: {
      type: "object",
      properties: {
        outsourcing_mode: {
          type: "string",
          enum: ["whenever-helpful", "verification-only", "disabled"],
        },
      },
    },
    models: {
      type: "object",
      additionalProperties: {
        type: "object",
        required: ["provider"],
        properties: {
          provider: { type: "string" },
        },
      },
    },
    // delegation.decision_consensus is the Set 031 opt-in sub-block.
    // The router-config schema is deliberately open elsewhere; this
    // entry validates only the fields the visual editor needs to render
    // correctly. Unknown sub-keys are tolerated (forward-compat for the
    // V1.5/V2 fields the design doc reserved).
    delegation: {
      type: "object",
      properties: {
        decision_consensus: {
          type: "object",
          properties: {
            enabled: { type: "boolean" },
            engines: {
              type: "array",
              items: {
                type: "string",
                // "provider:model" with non-empty halves
                pattern: "^[^:]+:[^:]+$",
              },
            },
            categories: {
              type: "array",
              items: {
                type: "string",
                enum: [
                  "refactor-placement",
                  "file-layout",
                  "scoping",
                  "spec-clarification",
                  "testing-strategy",
                  "api-surface",
                  "design",
                  "architecture",
                ],
              },
            },
            unresolved_action: {
              type: "string",
              enum: ["ask_user", "proceed_with_orchestrator_judgment"],
            },
            journal_path: { type: ["string", "null"] },
            journal_full_payloads_dir: { type: ["string", "null"] },
          },
        },
      },
    },
  },
};

// budget.yaml schema is similarly open: legacy fields (set_at,
// set_by, notes) coexist with the editor-controlled ones.
const BUDGET_SCHEMA = {
  type: "object",
  required: ["threshold_usd"],
  properties: {
    threshold_usd: { type: "number", minimum: 0 },
    scope: {
      type: "string",
      enum: ["per-session-set", "per-project", "per-session"],
    },
    warn_at_percent: { type: "integer", minimum: 0, maximum: 100 },
    verification_method: {
      type: "string",
      enum: ["api", "manual-via-other-engine", "skipped"],
    },
    verification_nte_usd: { type: "number", minimum: 0 },
    mode: { type: "string" },
  },
};

// local-overrides.yaml is the most restricted file: only the
// Appendix B "Local-override allowed? Yes" paths are valid.
// We close it strictly with additionalProperties: false at every
// known level. Unknown top-level keys (e.g. `threshold_usd`,
// `models`) and unknown nested keys are rejected.
const LOCAL_OVERRIDES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    routing: {
      type: "object",
      additionalProperties: false,
      properties: {
        outsourcing_mode: {
          type: "string",
          enum: ["whenever-helpful", "verification-only", "disabled"],
        },
      },
    },
    providers: {
      type: "object",
      additionalProperties: {
        type: "object",
        additionalProperties: false,
        properties: {
          enabled: { type: "boolean" },
          api_key_env: { type: "string", minLength: 1, pattern: ENV_VAR_PATTERN_STR },
          base_url: { type: "string" },
        },
      },
    },
    notifications: {
      type: "object",
      additionalProperties: false,
      properties: {
        pushover: {
          type: "object",
          additionalProperties: false,
          properties: {
            enabled: { type: "boolean" },
            api_key_env: { type: "string", minLength: 1, pattern: ENV_VAR_PATTERN_STR },
            user_key_env: { type: "string", minLength: 1, pattern: ENV_VAR_PATTERN_STR },
          },
        },
      },
    },
    decision_review: {
      type: "object",
      additionalProperties: false,
      properties: {
        honor_annotations: { type: "boolean" },
      },
    },
  },
};

const validateRouterConfig = ajv.compile(ROUTER_CONFIG_SCHEMA);
const validateBudget = ajv.compile(BUDGET_SCHEMA);
const validateLocalOverrides = ajv.compile(LOCAL_OVERRIDES_SCHEMA);

// Paths marked "Local-override allowed? No" in Set 025 Appendix B.
// Top-level keys reserved for project-canonical files (budget.yaml).
const LOCAL_OVERRIDE_DENIED_TOP_LEVEL = new Set([
  "verification_method",
  "scope",
]);
// Per-provider keys that are project-canonical (router-config.yaml only).
const LOCAL_OVERRIDE_DENIED_PROVIDER_KEYS = new Set([
  "display_label",
]);

export function validateBatch(input: ValidateBatchInput): ValidationResult {
  const errors: ValidationError[] = [];

  if (input.routerConfig !== null) {
    if (!validateRouterConfig(input.routerConfig)) {
      for (const e of validateRouterConfig.errors ?? []) {
        errors.push({
          file: "router-config.yaml",
          path: e.instancePath || "/",
          message: e.message ?? "validation error",
        });
      }
    }
    _checkModelProviderRefs(input.routerConfig, errors);
  }

  if (input.budget !== null) {
    if (!validateBudget(input.budget)) {
      for (const e of validateBudget.errors ?? []) {
        errors.push({
          file: "budget.yaml",
          path: e.instancePath || "/",
          message: e.message ?? "validation error",
        });
      }
    }
  }

  if (input.localOverrides !== null) {
    // Run the custom allowlist checker first so its friendlier
    // "not locally overridable (project-canonical field)" messages
    // are recorded before Ajv's generic additionalProperties errors.
    const beforeAllowlist = errors.length;
    _checkLocalOverridesAllowlist(input.localOverrides, input.routerConfig, errors);
    const allowlistPaths = new Set(
      errors.slice(beforeAllowlist).map((e) => e.path)
    );

    if (!validateLocalOverrides(input.localOverrides)) {
      for (const e of validateLocalOverrides.errors ?? []) {
        const ajvPath = _ajvErrorPath(e);
        // Skip Ajv additionalProperties errors when the custom
        // checker already produced a friendlier message for the
        // same effective path.
        if (e.keyword === "additionalProperties" && allowlistPaths.has(ajvPath)) {
          continue;
        }
        // Use ajvPath for additionalProperties so the offending
        // key surfaces in the drift banner (e.instancePath alone
        // would point at the parent object).
        const reportedPath = e.keyword === "additionalProperties"
          ? ajvPath
          : (e.instancePath || "/");
        errors.push({
          file: "local-overrides.yaml",
          path: reportedPath,
          message: e.message ?? "validation error",
        });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

function _ajvErrorPath(e: { instancePath?: string; params?: Record<string, unknown> }): string {
  // For additionalProperties errors, params.additionalProperty holds the
  // offending key. Combine it with instancePath to match the path our
  // custom checker writes (e.g. "/scope" or "/providers/anthropic/display_label").
  const base = e.instancePath || "";
  const extra = e.params && typeof e.params["additionalProperty"] === "string"
    ? `/${e.params["additionalProperty"]}`
    : "";
  return `${base}${extra}` || "/";
}

function _checkModelProviderRefs(
  routerConfig: Record<string, unknown>,
  errors: ValidationError[]
): void {
  const providers = routerConfig["providers"];
  const models = routerConfig["models"];
  if (!providers || typeof providers !== "object") return;
  if (!models || typeof models !== "object") return;
  const providerIds = new Set(Object.keys(providers as Record<string, unknown>));
  for (const [modelId, modelRaw] of Object.entries(models as Record<string, unknown>)) {
    const model = modelRaw as Record<string, unknown>;
    if (!model || typeof model !== "object") continue;
    const ref = model["provider"];
    if (typeof ref === "string" && !providerIds.has(ref)) {
      errors.push({
        file: "router-config.yaml",
        path: `/models/${modelId}/provider`,
        message: `provider "${ref}" not found in providers block`,
      });
    }
  }
}

function _checkLocalOverridesAllowlist(
  localOverrides: Record<string, unknown>,
  routerConfig: Record<string, unknown> | null,
  errors: ValidationError[]
): void {
  // Reject top-level paths marked "Local-override allowed? No"
  for (const deniedPath of LOCAL_OVERRIDE_DENIED_TOP_LEVEL) {
    if (deniedPath in localOverrides) {
      errors.push({
        file: "local-overrides.yaml",
        path: `/${deniedPath}`,
        message: `"${deniedPath}" is not locally overridable (project-canonical field)`,
      });
    }
  }

  // Reject providers/models that exist only in local-overrides,
  // and reject per-provider keys that are project-canonical.
  if (routerConfig !== null) {
    const sharedProviders = routerConfig["providers"];
    const sharedProviderIds = new Set(
      sharedProviders && typeof sharedProviders === "object"
        ? Object.keys(sharedProviders as Record<string, unknown>)
        : []
    );

    const localProviders = localOverrides["providers"];
    if (localProviders && typeof localProviders === "object") {
      for (const [id, providerRaw] of Object.entries(
        localProviders as Record<string, unknown>
      )) {
        if (!sharedProviderIds.has(id)) {
          errors.push({
            file: "local-overrides.yaml",
            path: `/providers/${id}`,
            message: `provider "${id}" exists only in local-overrides (local overrides cannot add new providers)`,
          });
          continue;
        }
        const provider = providerRaw as Record<string, unknown>;
        if (!provider || typeof provider !== "object") continue;
        for (const deniedKey of LOCAL_OVERRIDE_DENIED_PROVIDER_KEYS) {
          if (deniedKey in provider) {
            errors.push({
              file: "local-overrides.yaml",
              path: `/providers/${id}/${deniedKey}`,
              message: `"${deniedKey}" is not locally overridable (project-canonical field)`,
            });
          }
        }
      }
    }
  }
}

// Exported for tests that exercise the env-var shape directly.
export function isValidEnvVarName(name: string): boolean {
  return typeof name === "string" && ENV_VAR_PATTERN.test(name);
}
