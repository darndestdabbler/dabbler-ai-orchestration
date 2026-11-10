// The single call site for looking up secret values.
//
// Two backends are built in and they are the two layers a key can come from:
// `env` reads the process environment, and `store` reads what this machine
// has stored under a name. Which of them answers for a given provider is
// `providerSecret`'s to decide and not a caller's; more backends can still
// be registered here without touching one. An empty-string value is
// normalized to null so callers can use a simple truthiness check.

import { credentialValue } from "./credentials.ts";

export type SecretBackend = (name: string) => string | null;

const BACKENDS = new Map<string, SecretBackend>();

/**
 * Register a secret backend under `name`.
 *
 * `fn` receives the secret name (e.g. `"DABBLER_ANTHROPIC_API_KEY"`) and
 * returns its value, or null if the secret is absent.
 */
export function registerBackend(name: string, fn: SecretBackend): void {
  BACKENDS.set(name, fn);
}

/**
 * Look up `name` via the named `source` backend.
 *
 * Returns the secret value, or null if it is absent or empty. Throws if
 * `source` names an unregistered backend.
 */
export function resolveSecret(name: string, source = "env"): string | null {
  const backend = BACKENDS.get(source);
  if (backend === undefined) {
    throw new Error(
      `Unknown secret backend: '${source}'. Registered: ` +
        `[${[...BACKENDS.keys()].map((key) => `'${key}'`).join(", ")}]`,
    );
  }
  const value = backend(name);
  if (value === "") return null;
  return value;
}

function envBackend(name: string): string | null {
  return process.env[name] ?? null;
}

registerBackend("env", envBackend);

/**
 * What this machine has stored under that name.
 *
 * A name and not an environment variable: the store is keyed by the
 * reference an operator chose, which is what a setting carries and what a
 * pane shows.
 */
registerBackend("store", (name) => credentialValue(name));
