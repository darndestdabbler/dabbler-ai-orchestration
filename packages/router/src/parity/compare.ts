// Which paths are compared, and what a difference looks like when there
// is one.
//
// The rule is an allow-list of what the router is allowed to write, not a
// deny-list of what to ignore: a file neither side writes cannot make the
// control red, and a file one side writes and the other does not is the
// drift the control exists to find. A path present in one copy and absent
// from the other is a difference, not a skip.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { normalize } from "./normalize.ts";

/** Repository-relative, forward slashes, as every pattern below is written. */
export function toPosix(path: string): string {
  return path.split(sep).join("/");
}

/**
 * Everything the router is allowed to write. `bootstrap`'s outputs are
 * here too: the managed guidance fence, the pre-commit hook and the
 * ignore rule are writes, and a reader diffs them.
 *
 * `docs/modules.yaml` is the one entry here that people also edit by hand.
 * It is compared anyway, because `modules create` rewrites the whole file
 * through a YAML emitter on each side and two routers that reformatted a
 * tracked file differently would make every later diff of it lie.
 */
export const COMPARED: readonly RegExp[] = [
  /^docs\/sessions\/(sessions\.json|activity-log\.json|decisions-log\.md|project-work-plan\.md|change-log\.md)$/,
  /^\.dabbler\/runs\/[^/]+\.jsonl$/,
  /^\.dabbler\/runs\/s\d+\/.+$/,
  /^docs\/modules\.yaml$/,
  /^copilot-catalog\.lock$/,
  /^\.dabbler\/api-models\.lock$/,
  /^(AGENTS|CLAUDE|GEMINI)\.md$/,
  /^\.gitignore$/,
  /^\.git\/hooks\/pre-commit$/,
  // The six-step driver's own record: the append-only event log and the
  // projection folded from it. `reviews/` is deliberately absent -- each
  // file there is a vendor's reply verbatim, named with the second it was
  // filed at, so two copies can agree on the bytes and never on the name.
  /^\.dabbler\/solution\/(events\.jsonl|projection\.json)$/,
];

/**
 * Written, and deliberately not compared.
 *
 * `router-metrics.jsonl` is gitignored per-call telemetry carrying elapsed
 * seconds; it is not the record. The two lock files are transient.
 *
 * The run core's records stay listed after its deletion. Nothing writes them
 * now, but their names sit under `.dabbler/runs/s<n>/`, which the allow-list
 * above matches whole -- so the entries are what bounds that pattern rather
 * than a description of files that exist. Removing them would silently widen
 * what the control compares, in the session that had the least reason to.
 */
export const EXCLUDED: readonly RegExp[] = [
  /(^|\/)router-metrics\.jsonl$/,
  /(^|\/)\.lifecycle\.lock$/,
  /(^|\/)journal\.lock$/,
  /(^|\/)(journal\.jsonl|heartbeat\.json|run-projection\.json)$/,
];

/**
 * Ledgers of digests over content that is itself compared.
 *
 * `state-writes.jsonl` is one row per sanctioned write of
 * `sessions.json`, each row the sha256 of that file's text. The text
 * carries `startedAt`, so the digest carries a timestamp one hash away and
 * two runs can never agree on its value -- while the file it covers is
 * compared in full a directory away. What such a ledger proves that its
 * payload does not is how many writes there were and in what order, so
 * that is what is compared: the digests are reduced to their shape.
 *
 * This is normalization 1 reaching a value it cannot reach as text, the
 * same concession the specification already makes for a git commit id
 * (compared by tree, because a commit differs only through its dates).
 * It is not licence for a third rule: a digest over content with no
 * timestamp in it -- every tree hash in the record -- is compared exactly.
 */
const DIGEST_LEDGERS: readonly RegExp[] = [
  /(^|\/)state-writes\.jsonl$/,
  // `.dabbler/api-models.lock` is the second, and it names itself here as
  // the rule above requires. Its `content_digest` covers the record's own
  // rendered text -- which carries `written_at` and, after a failed
  // enumeration, a `last_error_at` per vendor. Every line the digest covers
  // is compared exactly two lines above it, so reducing the digest proves
  // nothing less; leaving it exact would convict two identical records of
  // having been written a second apart.
  /(^|\/)api-models\.lock$/,
  // The third, and it names itself here for the same reason. Each row is the
  // sha256 of the whole `approved-plan.json` as one write left it, and that
  // file carries `approved_at` and each amendment's `recorded_at` -- so two
  // runs can never agree on the value, while the file it covers is compared
  // in full beside it. What is NOT reduced is the plan's own `plan_hash`:
  // that digest is bound over the core fields, which deliberately exclude
  // every timestamp, so it is compared exactly and is the strongest single
  // check that both routers canonicalize JSON identically.
  /(^|\/)approved-plan-writes\.jsonl$/,
];

const SHA256_VALUE = /sha256:[0-9a-f]{64}/g;
export const DIGEST_PLACEHOLDER = "sha256:<digest>";

/**
 * A git object id, reduced when two BUILDS are being compared.
 *
 * A tree hash over content with no timestamp in it is compared exactly, and
 * stays that way for the two-router comparison. But once a shape records a
 * verification round, its `completion_tree` is a hash over the working tree
 * INCLUDING the lifecycle's own bookkeeping -- `sessions.json` carries
 * `startedAt`, `activity-log.json` carries a stamp per row -- so two builds
 * of one shape can never agree on its value, while both files are compared
 * in full a directory away.
 *
 * That is the same concession `DIGEST_LEDGERS` already makes, and it is
 * scoped to the question that needs it. Two builds are two CLOCKS; two
 * routers share one build (a shape is built once and copied), so nothing is
 * reduced where a disagreement about which tree was reviewed could hide.
 */
const OBJECT_ID = /\b[0-9a-f]{40}\b/g;
export const OBJECT_ID_PLACEHOLDER = "<oid>";

/** One file's text, made comparable. Both roots, so each becomes `<root>`. */
export function normalizeForPath(
  relPath: string,
  text: string,
  roots: readonly string[],
  options: { reduceObjectIds?: boolean } = {},
): string {
  const normalized = normalize(text, roots);
  const reduced = DIGEST_LEDGERS.some((pattern) => pattern.test(relPath))
    ? normalized.replace(SHA256_VALUE, DIGEST_PLACEHOLDER)
    : normalized;
  return options.reduceObjectIds === true
    ? reduced.replace(OBJECT_ID, OBJECT_ID_PLACEHOLDER)
    : reduced;
}


export function isCompared(relPath: string): boolean {
  if (EXCLUDED.some((pattern) => pattern.test(relPath))) return false;
  return COMPARED.some((pattern) => pattern.test(relPath));
}

/** Every compared path under one copy, repository-relative and sorted. */
export function comparedPaths(root: string): string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(directory);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(directory, entry);
      let stats;
      try {
        stats = statSync(full);
      } catch {
        continue;
      }
      if (stats.isDirectory()) {
        // `.git` holds one compared path and several thousand others.
        if (entry === ".git") {
          const hook = join(full, "hooks", "pre-commit");
          try {
            if (statSync(hook).isFile()) found.push(".git/hooks/pre-commit");
          } catch {
            /* no hook is a legitimate state */
          }
          continue;
        }
        if (entry === "node_modules") continue;
        walk(full);
        continue;
      }
      const rel = toPosix(relative(root, full));
      if (isCompared(rel)) found.push(rel);
    }
  };
  walk(root);
  return [...new Set(found)].sort();
}

// --- The diff ----------------------------------------------------------------

/** Longest common subsequence of two line arrays, as index pairs. */
function commonSubsequence(left: string[], right: string[]): Array<[number, number]> {
  const lengths: number[][] = Array.from({ length: left.length + 1 }, () =>
    new Array<number>(right.length + 1).fill(0),
  );
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      lengths[i]![j] =
        left[i] === right[j]
          ? lengths[i + 1]![j + 1]! + 1
          : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
    }
  }
  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      pairs.push([i, j]);
      i += 1;
      j += 1;
    } else if (lengths[i + 1]![j]! >= lengths[i]![j + 1]!) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return pairs;
}

/**
 * A unified diff of two normalized texts. Not a general diff utility: it
 * exists so a red control can say what moved, and nothing reads it back.
 */
export function unifiedDiff(
  path: string,
  before: string,
  after: string,
  context = 3,
): string {
  const left = before.split("\n");
  const right = after.split("\n");
  const pairs = commonSubsequence(left, right);

  const rows: string[] = [];
  let i = 0;
  let j = 0;
  for (const [ci, cj] of [...pairs, [left.length, right.length] as [number, number]]) {
    while (i < ci) {
      rows.push(`-${left[i]}`);
      i += 1;
    }
    while (j < cj) {
      rows.push(`+${right[j]}`);
      j += 1;
    }
    if (ci < left.length) {
      rows.push(` ${left[ci]}`);
      i = ci + 1;
      j = cj + 1;
    }
  }
  // Trim runs of unchanged lines to `context` on either side of a change.
  const interesting = rows.map((row) => !row.startsWith(" "));
  const shown = rows.map((_, index) =>
    interesting
      .slice(Math.max(0, index - context), index + context + 1)
      .some(Boolean),
  );
  const body: string[] = [];
  let elided = false;
  rows.forEach((row, index) => {
    if (shown[index]) {
      if (elided) body.push("@@");
      body.push(row);
      elided = false;
    } else {
      elided = true;
    }
  });

  return [`--- python/${path}`, `+++ typescript/${path}`, ...body].join("\n");
}

// --- The comparison ----------------------------------------------------------

export interface PathDifference {
  readonly path: string;
  readonly kind: "content" | "only-in-python" | "only-in-typescript";
  /** Empty for a path only one side wrote. */
  readonly diff: string;
}

export interface ComparisonResult {
  readonly compared: number;
  readonly differences: readonly PathDifference[];
}

function readOrNull(root: string, relPath: string): string | null {
  try {
    return readFileSync(join(root, ...relPath.split("/")), "utf8");
  } catch {
    return null;
  }
}

/** Two copies of one shape, after both routers have run against them. */
export function compareCopies(
  pythonRoot: string,
  typescriptRoot: string,
  options: { reduceObjectIds?: boolean } = {},
): ComparisonResult {
  const paths = [
    ...new Set([...comparedPaths(pythonRoot), ...comparedPaths(typescriptRoot)]),
  ].sort();
  const roots = [pythonRoot, typescriptRoot];
  const differences: PathDifference[] = [];

  for (const path of paths) {
    const left = readOrNull(pythonRoot, path);
    const right = readOrNull(typescriptRoot, path);
    if (left === null) {
      differences.push({ path, kind: "only-in-typescript", diff: "" });
      continue;
    }
    if (right === null) {
      differences.push({ path, kind: "only-in-python", diff: "" });
      continue;
    }
    const before = normalizeForPath(path, left, roots, options);
    const after = normalizeForPath(path, right, roots, options);
    if (before === after) continue;
    differences.push({ path, kind: "content", diff: unifiedDiff(path, before, after) });
  }

  return { compared: paths.length, differences };
}
