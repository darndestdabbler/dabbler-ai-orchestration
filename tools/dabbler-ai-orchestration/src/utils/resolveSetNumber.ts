// Pure number->slug resolver for the Set 050 S4 (Feature 2) extension
// affordance. Mirrors `ai_router/resolve_set.py` so the extension can
// resolve a "Set 50" handle WITHOUT shelling out to Python — a
// Lightweight consumer with no router installed still gets the handle.
//
// Exact integer-prefix match within a list of slugs, leading zeros
// normalized (50 == "050-..."). No fuzzy matching. Collision (two slugs
// share a numeric prefix) and no-match are distinct, named outcomes so
// the command can surface the right message (verdict Q8).

// One-or-more leading digits terminated by a hyphen. A bare "050" with
// no trailing hyphen is not a slug prefix.
const PREFIX_RE = /^(\d+)-/;

export function numericPrefix(slug: string): number | null {
  const m = PREFIX_RE.exec(slug);
  return m ? parseInt(m[1], 10) : null;
}

export type ResolveResult =
  | { kind: "match"; slug: string }
  | { kind: "no-match"; available: number[] }
  | { kind: "collision"; matches: string[] };

// Resolve `n` against `slugs` (directory basenames). Returns a tagged
// union so the caller decides how to present each outcome.
export function resolveSetNumber(slugs: string[], n: number): ResolveResult {
  const matches = slugs.filter((s) => numericPrefix(s) === n);
  if (matches.length === 0) {
    const available = Array.from(
      new Set(
        slugs
          .map(numericPrefix)
          .filter((p): p is number => p !== null),
      ),
    ).sort((a, b) => a - b);
    return { kind: "no-match", available };
  }
  if (matches.length > 1) {
    return { kind: "collision", matches: matches.slice().sort() };
  }
  return { kind: "match", slug: matches[0] };
}

// Parse a user-typed handle into an integer, or null when it is not a
// bare number. Tolerates surrounding whitespace and a leading "set"
// word so "Set 50", "50", " 050 " all resolve. Leading zeros normalized.
export function parseSetHandle(raw: string): number | null {
  const trimmed = raw.trim().replace(/^set\s+/i, "");
  if (!/^\d+$/.test(trimmed)) return null;
  return parseInt(trimmed, 10);
}

// Digit-count of a slug's numeric prefix (0 when it has none).
function prefixWidth(slug: string): number {
  const m = PREFIX_RE.exec(slug);
  return m ? m[1].length : 0;
}

export interface NextSetNumber {
  n: number;
  padded: string;
}

/**
 * Set 098 S2: pure TS mirror of ``ai_router.resolve_set.next_session_set_number``
 * — ``max(existing numeric prefix) + 1`` (``1`` when none exist), zero-padded to
 * ``width = max(3, widest existing numeric prefix)`` so a repo that has grown
 * past 3-digit prefixes keeps its width. ``dirNames`` is every directory
 * basename under ``docs/session-sets`` (the caller excludes ``_``-prefixed
 * dirs, same as the Python lister); slugs without a numeric prefix are
 * ignored for max-finding, matching the Python contract exactly.
 */
export function nextSessionSetNumberFrom(dirNames: string[]): NextSetNumber {
  const numbered = dirNames
    .map(numericPrefix)
    .filter((p): p is number => p !== null);
  const n = numbered.length ? Math.max(...numbered) + 1 : 1;
  const widest = dirNames.reduce((w, name) => Math.max(w, prefixWidth(name)), 0);
  const width = Math.max(3, widest);
  return { n, padded: String(n).padStart(width, "0") };
}
