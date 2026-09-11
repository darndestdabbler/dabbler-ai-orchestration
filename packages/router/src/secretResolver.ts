// The single call site for looking up secret values.
//
// The env-var backend is the only built-in backend; additional backends
// (keyring, secretStorage) can be registered via `registerBackend` without
// touching callers. An empty-string value is normalized to null so callers
// can use a simple truthiness check.

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
