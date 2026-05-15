"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateBatch = validateBatch;
const ajv_1 = __importDefault(require("ajv"));
const ajv = new ajv_1.default({ allErrors: true, strict: false });
const ENV_VAR_PATTERN = /^[A-Z_][A-Z0-9_]*$/;
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
                    api_key_env: { type: "string" },
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
    },
};
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
const LOCAL_OVERRIDES_SCHEMA = {
    type: "object",
    properties: {
        routing: {
            type: "object",
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
                properties: {
                    enabled: { type: "boolean" },
                    api_key_env: { type: "string" },
                    base_url: { type: "string" },
                },
            },
        },
        notifications: { type: "object" },
        decision_review: { type: "object" },
    },
};
const validateRouterConfig = ajv.compile(ROUTER_CONFIG_SCHEMA);
const validateBudget = ajv.compile(BUDGET_SCHEMA);
const validateLocalOverrides = ajv.compile(LOCAL_OVERRIDES_SCHEMA);
const LOCAL_OVERRIDE_DENIED_PATHS = new Set([
    "verification_method",
    "scope",
]);
function validateBatch(input) {
    const errors = [];
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
        _checkEnvVarNames(input.routerConfig, errors);
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
        if (!validateLocalOverrides(input.localOverrides)) {
            for (const e of validateLocalOverrides.errors ?? []) {
                errors.push({
                    file: "local-overrides.yaml",
                    path: e.instancePath || "/",
                    message: e.message ?? "validation error",
                });
            }
        }
        _checkLocalOverridesAllowlist(input.localOverrides, input.routerConfig, errors);
    }
    return { valid: errors.length === 0, errors };
}
function _checkEnvVarNames(routerConfig, errors) {
    const providers = routerConfig["providers"];
    if (!providers || typeof providers !== "object")
        return;
    for (const [id, providerRaw] of Object.entries(providers)) {
        const provider = providerRaw;
        if (!provider || typeof provider !== "object")
            continue;
        const envVar = provider["api_key_env"];
        if (typeof envVar === "string" && envVar.length > 0 && !ENV_VAR_PATTERN.test(envVar)) {
            errors.push({
                file: "router-config.yaml",
                path: `/providers/${id}/api_key_env`,
                message: `"${envVar}" is not a valid env var name (must match [A-Z_][A-Z0-9_]*)`,
            });
        }
    }
}
function _checkModelProviderRefs(routerConfig, errors) {
    const providers = routerConfig["providers"];
    const models = routerConfig["models"];
    if (!providers || typeof providers !== "object")
        return;
    if (!models || typeof models !== "object")
        return;
    const providerIds = new Set(Object.keys(providers));
    for (const [modelId, modelRaw] of Object.entries(models)) {
        const model = modelRaw;
        if (!model || typeof model !== "object")
            continue;
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
function _checkLocalOverridesAllowlist(localOverrides, routerConfig, errors) {
    // Reject overrides for paths marked "Local-override allowed? No"
    for (const deniedPath of LOCAL_OVERRIDE_DENIED_PATHS) {
        if (deniedPath in localOverrides) {
            errors.push({
                file: "local-overrides.yaml",
                path: `/${deniedPath}`,
                message: `"${deniedPath}" is not locally overridable (project-canonical field)`,
            });
        }
    }
    // Reject providers/models that exist only in local-overrides
    if (routerConfig !== null) {
        const sharedProviders = routerConfig["providers"];
        const sharedProviderIds = new Set(sharedProviders && typeof sharedProviders === "object"
            ? Object.keys(sharedProviders)
            : []);
        const localProviders = localOverrides["providers"];
        if (localProviders && typeof localProviders === "object") {
            for (const id of Object.keys(localProviders)) {
                if (!sharedProviderIds.has(id)) {
                    errors.push({
                        file: "local-overrides.yaml",
                        path: `/providers/${id}`,
                        message: `provider "${id}" exists only in local-overrides (local overrides cannot add new providers)`,
                    });
                }
            }
        }
    }
}
//# sourceMappingURL=schemaValidator.js.map