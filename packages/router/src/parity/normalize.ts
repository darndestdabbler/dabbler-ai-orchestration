// The two normalizations, and no third.
//
// Both are defined by the SHAPE of a value rather than by a list of field
// names, so a field added to a record later cannot escape them by not
// being on a list. Everything else that differs is drift, including key
// order, whitespace, trailing newlines, float formatting, list order and
// the ordinal of a decision. That strictness is the point: the record is
// what a reader diffs across sessions, and two routers that serialized the
// same facts differently would make every future diff lie.

/**
 * Any ISO-8601 date or date-time, with or without a time, fractional
 * seconds, `Z` or a numeric offset. This covers `startedAt`, `recordedAt`,
 * `dateTime`, `decidedOn`, the date in a decision heading, and the git
 * dates inside an anchor commit -- which is why anchor commits are
 * compared by tree and not by id.
 */
const TIMESTAMP =
  /\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?/g;

export const TIMESTAMP_PLACEHOLDER = "<ts>";
export const ROOT_PLACEHOLDER = "<root>";

function escapeForRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Every spelling one absolute root can wear in a record: as the host
 * writes it, with forward slashes, and with its separators doubled --
 * which is what a Windows path looks like once JSON has escaped it.
 *
 * Longest first, so a doubled spelling is not half-eaten by the native
 * one before it is reached.
 */
export function rootSpellings(root: string): string[] {
  const native = root.replace(/[\\/]+$/, "");
  const forward = native.replace(/\\/g, "/");
  const doubled = native.replace(/\\/g, "\\\\");
  return [...new Set([doubled, native, forward])].sort(
    (left, right) => right.length - left.length,
  );
}

/**
 * One side's text, made comparable to the other's.
 *
 * `roots` are the absolute directories the two copies live in -- each
 * copy's own root becomes `<root>`, so a path that is repository-relative
 * in the record must still match exactly.
 */
export function normalize(text: string, roots: readonly string[]): string {
  let out = text;
  const spellings = roots.flatMap(rootSpellings).sort(
    (left, right) => right.length - left.length,
  );
  for (const spelling of spellings) {
    if (spelling === "") continue;
    out = out.replace(new RegExp(escapeForRegExp(spelling), "gi"), ROOT_PLACEHOLDER);
  }
  return out.replace(TIMESTAMP, TIMESTAMP_PLACEHOLDER);
}
