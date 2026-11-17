// Resolves whether the current invocation suppresses routed calls.
//
// `--no-router` mode makes an invocation issue no LLM API calls -- no routed
// dispatch, no auto-verification. It exists for CI and hermetic tests, which
// need the CLIs to run end-to-end without spending money or touching a
// network.
//
// It is a test affordance, not a gate escape: it suppresses routed calls and
// nothing else, and never relieves a close of any verification gate.
//
// Precedence (high to low):
//   1. CLI flag `--no-router` (one-off override)
//   2. Env var `DABBLER_NO_ROUTER` (CI / shell-session default)
//   3. Default: router enabled

export const ENV_VAR_NAME = "DABBLER_NO_ROUTER";

const TRUTHY = ["1", "true", "yes", "on"];

// undefined means "not yet resolved". Once resolveNoRouterMode runs, the
// result is cached so calls deep in the stack do not re-read the environment.
let noRouterMode: boolean | undefined;

function envVarTruthy(): boolean {
  const raw = process.env[ENV_VAR_NAME] ?? "";
  return TRUTHY.includes(raw.trim().toLowerCase());
}

/**
 * Resolve and cache the --no-router decision for this process.
 *
 * Idempotent: subsequent calls return the cached value without re-evaluating
 * precedence (a silent cache overwrite is a footgun for entry points that
 * resolve twice). Tests call `resetForTests` first.
 */
export function resolveNoRouterMode(cliFlag: boolean): boolean {
  if (noRouterMode !== undefined) return noRouterMode;
  noRouterMode = cliFlag || envVarTruthy();
  return noRouterMode;
}

/**
 * The cached resolution, falling back to the env var alone.
 *
 * The fallback does not cache -- callers needing the result more than once
 * should call `resolveNoRouterMode` at entry-point startup.
 */
export function isNoRouterMode(): boolean {
  return noRouterMode ?? envVarTruthy();
}

/** Clear the cached resolution so each test starts fresh. */
export function resetForTests(): void {
  noRouterMode = undefined;
}
