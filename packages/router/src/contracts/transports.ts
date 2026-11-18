// The copilot-cli transport's timeout contract: the shape, the shipped
// defaults, the resolution, and the validation a config block must pass.
//
// This is a shared SHAPE, at the contracts level, because two sides consume
// it: the transport enforces the ceilings while spawning, and `config.ts`
// validates the block at load time. While it lived inside the transport,
// config's validation import was a back-edge into the transport layer --
// one of the fifty-two in the 2026-09-02 measurement, and the cut that
// freed the config cluster.

export const DEFAULT_SPAWN_TIMEOUT_SECONDS = 10.0;
export const DEFAULT_FIRST_BYTE_TIMEOUT_SECONDS = 30.0;
export const DEFAULT_TOTAL_TIMEOUT_SECONDS = 1200.0;

export interface TransportTimeouts {
  readonly spawn_seconds: number;
  readonly first_byte_seconds: number;
  readonly total_seconds: number;
}

export const TIMEOUT_FIELD_DEFAULTS: ReadonlyArray<
  readonly [keyof TransportTimeouts, number]
> = [
  ["spawn_seconds", DEFAULT_SPAWN_TIMEOUT_SECONDS],
  ["first_byte_seconds", DEFAULT_FIRST_BYTE_TIMEOUT_SECONDS],
  ["total_seconds", DEFAULT_TOTAL_TIMEOUT_SECONDS],
];

export const DEFAULT_TIMEOUTS: TransportTimeouts = {
  spawn_seconds: DEFAULT_SPAWN_TIMEOUT_SECONDS,
  first_byte_seconds: DEFAULT_FIRST_BYTE_TIMEOUT_SECONDS,
  total_seconds: DEFAULT_TOTAL_TIMEOUT_SECONDS,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Python's `type(x).__name__` for the values a YAML load can produce. */
export function typeName(value: unknown): string {
  if (value === null || value === undefined) return "NoneType";
  if (typeof value === "boolean") return "bool";
  if (typeof value === "number") return Number.isInteger(value) ? "int" : "float";
  if (typeof value === "string") return "str";
  if (Array.isArray(value)) return "list";
  return "dict";
}

/**
 * Effective timeouts for a `transports.copilot-cli` block; each field falls
 * back to its shipped default.
 */
export function resolveTransportTimeouts(cliConfig: unknown): TransportTimeouts {
  const raw = isRecord(cliConfig) ? cliConfig["timeouts"] : undefined;
  const block = isRecord(raw) ? raw : {};
  const values: Record<string, number> = {};
  for (const [name, fallback] of TIMEOUT_FIELD_DEFAULTS) {
    const candidate = name in block ? block[name] : fallback;
    const parsed =
      typeof candidate === "number" && Number.isFinite(candidate)
        ? candidate
        : Number(candidate);
    values[name] = Number.isFinite(parsed) ? parsed : fallback;
  }
  return values as unknown as TransportTimeouts;
}

/**
 * Throw unless `block` is a valid `timeouts:` mapping.
 *
 * Unknown keys are rejected rather than ignored: a typo'd `total_second`
 * silently keeping the default is exactly the failure this exists to end.
 * The trio must satisfy spawn < first_byte < total, or an inner ceiling can
 * never fire and a stall is misclassified at the outer one.
 */
export function validateTransportTimeouts(block: unknown): void {
  if (block === null || block === undefined) return;
  if (!isRecord(block)) {
    throw new Error(
      `transports.copilot-cli.timeouts must be a mapping, got ${typeName(block)}`,
    );
  }
  const known = TIMEOUT_FIELD_DEFAULTS.map(([name]) => String(name));
  const unknown = Object.keys(block)
    .filter((key) => !known.includes(key))
    .sort();
  if (unknown.length > 0) {
    throw new Error(
      `transports.copilot-cli.timeouts has unknown key(s): ${render(unknown)}. ` +
        `Known: ${render([...known].sort())}`,
    );
  }
  for (const [name] of TIMEOUT_FIELD_DEFAULTS) {
    if (!(name in block)) continue;
    const value = block[name];
    // A boolean is an int in Python; `true` here is a config error, not 1s.
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(
        `transports.copilot-cli.timeouts.${name} must be a number, ` +
          `got ${typeName(value)}`,
      );
    }
    if (value <= 0) {
      throw new Error(
        `transports.copilot-cli.timeouts.${name} must be > 0, got ${value}`,
      );
    }
  }
  const resolved = resolveTransportTimeouts({ timeouts: block });
  if (
    !(
      resolved.spawn_seconds < resolved.first_byte_seconds &&
      resolved.first_byte_seconds < resolved.total_seconds
    )
  ) {
    throw new Error(
      "transports.copilot-cli.timeouts must satisfy spawn_seconds < " +
        "first_byte_seconds < total_seconds; got " +
        `${resolved.spawn_seconds} / ${resolved.first_byte_seconds} / ` +
        `${resolved.total_seconds}`,
    );
  }
}

/** Python renders a list of strings as `['a', 'b']`. */
function render(items: readonly string[]): string {
  return `[${items.map((item) => `'${item}'`).join(", ")}]`;
}
