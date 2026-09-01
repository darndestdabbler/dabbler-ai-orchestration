// Declared checks: what a repository says its suites and controls are, which
// tests a change makes necessary, and how one check is run.
//
// Two stages name what a run is evidence of -- `targeted` runs the tests a
// change makes necessary, `final-full` runs the complete suites once -- and
// the separation exists to delete one specific expense: a full suite bought
// before anyone knows whether the change is right.
//
// Every check is judged against a Git tree id, not against "the worktree". A
// command that changes the tree it was measuring has invalidated its own
// result, and that is recorded rather than rounded off.
//
// What is NOT here is the run core's half. Python's `checks.plan` and the
// `CheckPlan` it returns are called from `runcli` alone -- measured, not
// assumed -- and the run core is retired and deleted in session 35 (D88,
// D130). Porting the planner would have carried a defect into a module
// nothing calls: it appends the whole selection to every suite's command
// where the suite owns only part of it. Session 35's `testphase` and
// `fixloop` reach for `execute`, `targetedCommand`, `loadChecks`,
// `loadSelectionConfig`, `scopeForTest`, `selectionPayload`, `coversAny` and
// `timeoutFor`, and those are what is here. `execute` takes no run id for
// the same reason: the heartbeat it wrote is a run-core file.

import {
  spawn,
  spawnSync,
  type ChildProcess,
  type SpawnOptions,
} from "node:child_process";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { hiddenSpawn, snapshotWorktreeTree } from "./journal.ts";
import { pythonRepr } from "./pythonJson.ts";

export const STAGE_TARGETED = "targeted";
export const STAGE_FINAL_FULL = "final-full";
export const STAGES: readonly string[] = [STAGE_TARGETED, STAGE_FINAL_FULL];

export const OUTCOME_PASSED = "passed";
export const OUTCOME_FAILED = "failed";

export const CONTROL_KINDS: ReadonlySet<string> = new Set([
  "compile",
  "typecheck",
  "lint",
  "analyzer",
]);

/**
 * What a suite may declare. One list, imported by every module that parses a
 * suite: a second copy is a second opinion about whether `argv` is a typo.
 * `test_roots` and `test_glob` are per suite rather than per repository
 * because a repository that is Java and .NET at once has two of each, and one
 * glob cannot say both `*Test.java` and `*Tests.cs`.
 */
export const SUITE_FIELDS: ReadonlySet<string> = new Set([
  "name", "command", "argv", "covers", "cwd", "expensive", "small",
  "timeout_seconds", "test_roots", "test_glob", "runs_whole",
]);
export const CONTROL_FIELDS: ReadonlySet<string> = new Set([
  "name", "kind", "command", "argv", "covers", "cwd", "required",
  "timeout_seconds",
]);

// --- The repository's own declarations ----------------------------------------
//
// Selection is deterministic: the same changed paths against the same tree
// always yield the same tests, in the same order, with the same reasons. What
// maps to what is declared by the repository in its own configuration, in
// whatever language it is written -- an inferred mapping needs a parser per
// ecosystem and buys an optimization on an optimization. A changed path that
// maps to no test is never widened into a full-suite run: it records
// `selection_unknown`, pulls in the configured smoke tests, and raises a
// risk. Running everything is the expensive way to hide an incomplete
// mapping.

export const REASON_CHANGED_TEST = "changed-test";
export const REASON_CONFIGURED_RULE = "configured-rule";
export const REASON_SMOKE = "selection-unknown-smoke";

/**
 * Strongest first. A test selected by several routes is recorded once, under
 * the most specific reason that reached it.
 */
export const REASON_PRECEDENCE: readonly string[] = [
  REASON_CHANGED_TEST, REASON_CONFIGURED_RULE, REASON_SMOKE,
];

export const RISK_SELECTION_UNKNOWN = "selection_unknown";

export const SELECTION_FIELDS: ReadonlySet<string> = new Set([
  "smoke", "repo_wide", "rules",
]);
export const RULE_FIELDS: ReadonlySet<string> = new Set(["when", "select"]);

/**
 * Where they went. Named in the refusal so a config written against the old
 * shape says so instead of reporting a typo.
 */
const MOVED_TO_SUITES: readonly string[] = ["test_roots", "test_glob"];

// --- Python spellings this module needs ----------------------------------------

/**
 * `shlex.split` in POSIX mode, which is what both routers parse a declared
 * command string with.
 *
 * Whitespace splits; a backslash escapes the next character; single quotes
 * are literal; inside double quotes a backslash escapes only itself and the
 * quote. An unterminated quote and a trailing lone backslash are errors, as
 * they are in Python -- a caller that swallowed them would run a command it
 * had silently rewritten.
 */
export function shlexSplit(text: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let started = false;
  let index = 0;
  while (index < text.length) {
    const char = text[index] as string;
    if (/\s/.test(char)) {
      if (started) {
        tokens.push(current);
        current = "";
        started = false;
      }
      index += 1;
      continue;
    }
    started = true;
    if (char === "\\") {
      if (index + 1 >= text.length) throw new Error("No escaped character");
      current += text[index + 1] as string;
      index += 2;
      continue;
    }
    if (char === "'") {
      const close = text.indexOf("'", index + 1);
      if (close === -1) throw new Error("No closing quotation");
      current += text.slice(index + 1, close);
      index = close + 1;
      continue;
    }
    if (char === '"') {
      index += 1;
      let closed = false;
      while (index < text.length) {
        const inner = text[index] as string;
        if (inner === '"') {
          closed = true;
          index += 1;
          break;
        }
        if (inner === "\\") {
          const next = text[index + 1];
          if (next === undefined) throw new Error("No escaped character");
          // Python keeps the backslash unless it escapes itself or the quote.
          current += next === "\\" || next === '"' ? next : inner + next;
          index += 2;
          continue;
        }
        current += inner;
        index += 1;
      }
      if (!closed) throw new Error("No closing quotation");
      continue;
    }
    current += char;
    index += 1;
  }
  if (started) tokens.push(current);
  return tokens;
}

/**
 * `fnmatch.fnmatchcase`: `*`, `?` and `[seq]`, case-sensitive on every
 * platform.
 *
 * Case-sensitive is the point. Selection is evidence, and evidence that
 * depends on which filesystem produced it proves nothing -- which is why
 * this is `fnmatchcase` and not `fnmatch`.
 */
export function fnmatchCase(name: string, pattern: string): boolean {
  const out: string[] = [];
  let index = 0;
  while (index < pattern.length) {
    const char = pattern[index] as string;
    index += 1;
    if (char === "*") {
      out.push(".*");
    } else if (char === "?") {
      out.push(".");
    } else if (char === "[") {
      let close = index;
      if (pattern[close] === "!") close += 1;
      if (pattern[close] === "]") close += 1;
      while (close < pattern.length && pattern[close] !== "]") close += 1;
      if (close >= pattern.length) {
        out.push("\\[");
      } else {
        let body = pattern.slice(index, close).replace(/\\/g, "\\\\");
        index = close + 1;
        if (body.startsWith("!")) body = "^" + body.slice(1);
        else if (body.startsWith("^")) body = "\\" + body;
        out.push(`[${body}]`);
      }
    } else {
      out.push(char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    }
  }
  return new RegExp(`^${out.join("")}$`, "s").test(name);
}

/**
 * Forward slashes, with no leading or trailing separator.
 *
 * Every platform, never `path.sep`: a Windows-authored path evaluated
 * elsewhere must still match.
 */
export function posixPath(path: unknown): string {
  return String(path).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

/**
 * The repository-relative spelling every prefix question is asked about.
 *
 * Python states this twice -- `checks` and `test_evidence` carry
 * byte-identical copies whose only difference is whether their `_posix`
 * strips separators first. The two answers can differ only for a path
 * beginning `/./`, which nothing git emits, so the rule is stated once here
 * and both readers ask it.
 */
export function normaliseRel(path: unknown): string {
  let rel = posixPath(path).trim();
  // A "./" PREFIX loop, never a character-set strip: stripping "./" as a set
  // would eat the leading dot of ".github/".
  while (rel.startsWith("./")) rel = rel.slice(2);
  rel = rel.replace(/^\/+|\/+$/g, "");
  // "." is the whole-repo prefix; it must match everything, not nothing.
  return rel === "." ? "" : rel;
}

/**
 * Which declared prefixes cover `rel`, anchored at path boundaries --
 * `a/tests_helper.py` does not match prefix `a/tests/`. A prefix that
 * normalises to '' (a whole-repo suite) matches everything.
 */
export function matchingPrefixes(
  rel: string,
  prefixes: readonly string[],
): string[] {
  const relN = normaliseRel(rel);
  const hits: string[] = [];
  for (const prefix of prefixes) {
    const prefixN = normaliseRel(prefix);
    if (prefixN === "" || relN === prefixN || relN.startsWith(prefixN + "/")) {
      hits.push(prefix);
    }
  }
  return hits;
}

// --- Selection ------------------------------------------------------------------

export interface SelectedTest {
  readonly path: string;
  readonly reason: string;
  readonly selectedBy: string;
  /**
   * The suite whose declaration claims this file. Carried rather than
   * recomputed: a repository running two ecosystems has two runners, and a
   * path set that has forgotten which suite owns each entry cannot be handed
   * to either one without guessing.
   */
  readonly suite: string;
}

export interface SelectionRisk {
  readonly kind: string;
  readonly path: string;
  readonly detail: string;
}

/**
 * One suite's answer to "what is a test here": where they live and what this
 * repository calls them. Both are declared, because guessing either one is
 * guessing an ecosystem's convention, and they are declared per suite
 * because a repository may run more than one ecosystem.
 */
export interface SuiteScope {
  readonly suite: string;
  readonly roots: readonly string[];
  readonly glob: string;
}

export function scopeIsComplete(scope: SuiteScope): boolean {
  return scope.roots.length > 0 && scope.glob !== "";
}

export interface SelectionConfig {
  /** One entry per suite that declares where its tests live. */
  readonly scopes: readonly SuiteScope[];
  readonly smoke: readonly string[];
  readonly repoWide: readonly string[];
  /** `[whenPrefix, [testPath, ...]]` pairs. */
  readonly rules: ReadonlyArray<readonly [string, readonly string[]]>;
}

export function emptySelectionConfig(): SelectionConfig {
  return { scopes: [], smoke: [], repoWide: [], rules: [] };
}

/** Every declared test root, in declaration order, deduplicated. */
export function selectionTestRoots(config: SelectionConfig): string[] {
  const seen: string[] = [];
  for (const scope of config.scopes) {
    for (const root of scope.roots) if (!seen.includes(root)) seen.push(root);
  }
  return seen;
}

/**
 * Whether any suite said enough for a path to be confirmed a test. A
 * repository that declared nothing cannot have a file offered to it as a
 * test, and the refusal has to say so rather than write it.
 */
export function declaresTests(config: SelectionConfig): boolean {
  return config.scopes.some(scopeIsComplete);
}

export interface SelectionConfigResult {
  readonly config: SelectionConfig;
  readonly errors: readonly string[];
  readonly ok: boolean;
}

/** The selector's answer: what to run, what it could not map, and why. */
export class SelectionResult {
  readonly selected: readonly SelectedTest[];
  readonly risks: readonly SelectionRisk[];
  readonly allTestsAffected: boolean;
  readonly allAffectedReason: string;

  constructor(
    fields: {
      selected?: readonly SelectedTest[];
      risks?: readonly SelectionRisk[];
      allTestsAffected?: boolean;
      allAffectedReason?: string;
    } = {},
  ) {
    this.selected = fields.selected ?? [];
    this.risks = fields.risks ?? [];
    this.allTestsAffected = fields.allTestsAffected ?? false;
    this.allAffectedReason = fields.allAffectedReason ?? "";
  }

  get testPaths(): string[] {
    return [...new Set(this.selected.map((entry) => entry.path))].sort();
  }

  get unknownPaths(): string[] {
    return this.risks
      .filter((risk) => risk.kind === RISK_SELECTION_UNKNOWN)
      .map((risk) => risk.path);
  }

  /**
   * This selection as the named suite sees it: the tests it owns, plus the
   * ones no suite's declaration claims.
   *
   * Naming every selected test to every runner is how a Java test ends up in
   * a `dotnet test` command. An unclaimed path stays offered to all of them,
   * because "no suite declared this a test file" is not the same as "this
   * suite does not run it" -- the suite's `covers` may still say it does.
   */
  forSuite(name: string): SelectionResult {
    return new SelectionResult({
      selected: this.selected.filter(
        (entry) => entry.suite === "" || entry.suite === name,
      ),
      risks: this.risks,
      allTestsAffected: this.allTestsAffected,
      allAffectedReason: this.allAffectedReason,
    });
  }

  toDict(): Record<string, unknown> {
    return {
      selected: this.selected.map((entry) => ({
        path: entry.path,
        reason: entry.reason,
        selectedBy: entry.selectedBy,
        ...(entry.suite ? { suite: entry.suite } : {}),
      })),
      risks: this.risks.map((risk) => ({
        kind: risk.kind,
        path: risk.path,
        detail: risk.detail,
      })),
      allTestsAffected: this.allTestsAffected,
      allAffectedReason: this.allAffectedReason,
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function testingBlock(config: unknown): Record<string, unknown> | null {
  if (!isRecord(config)) return null;
  const testing = config["testing"];
  return isRecord(testing) ? testing : null;
}

/** `sorted(set(entry) - allowed)`, which is how every unknown-key message reads. */
function unknownKeys(
  entry: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  alsoAllowed: readonly string[] = [],
): string[] {
  return Object.keys(entry)
    .filter((key) => !allowed.has(key) && !alsoAllowed.includes(key))
    .sort();
}

/**
 * `(scopes, errors)` from `testing.suites`.
 *
 * Errors are accumulated rather than thrown: this is the same declaration
 * `loadChecks` refuses outright, read here by the selector, and a selector
 * that threw would make one bad suite hide every good one. A suite that
 * declares neither key contributes no scope, which is how a repository says
 * "this suite runs something that is not a test file".
 */
export function loadTestScopes(config: unknown): {
  scopes: SuiteScope[];
  errors: string[];
} {
  const testing = testingBlock(config);
  const raw = testing ? testing["suites"] : undefined;
  if (raw === null || raw === undefined) return { scopes: [], errors: [] };
  if (!Array.isArray(raw)) {
    return { scopes: [], errors: ["testing.suites must be a list"] };
  }
  const scopes: SuiteScope[] = [];
  const errors: string[] = [];
  raw.forEach((entry, index) => {
    const label = `testing.suites[${index}]`;
    if (!isRecord(entry)) return; // loadChecks refuses it; one complaint is enough
    const name = String(entry["name"] ?? "").trim();
    const rootsRaw = entry["test_roots"];
    const globRaw = entry["test_glob"] ?? "";
    if ((rootsRaw === null || rootsRaw === undefined) && !globRaw) return;
    if (
      !Array.isArray(rootsRaw) ||
      !rootsRaw.every((value) => typeof value === "string")
    ) {
      errors.push(`${label}.test_roots must be a list of strings`);
      return;
    }
    if (typeof globRaw !== "string" || globRaw.trim() === "") {
      errors.push(
        `${label}.test_glob must be a non-empty string: a root with no glob ` +
          "would make every file under it a test",
      );
      return;
    }
    const roots = (rootsRaw as string[])
      .map((value) => value.trim())
      .filter((value) => value !== "");
    if (roots.length === 0) {
      errors.push(
        `${label}.test_roots must name at least one root: a glob with no root ` +
          "would make a test of any file anywhere",
      );
      return;
    }
    scopes.push({ suite: name, roots, glob: globRaw.trim() });
  });
  return { scopes, errors };
}

/**
 * The declared selection rules plus every declaration error.
 *
 * A silently dropped rule and no rule at all must never look the same: a typo
 * that removes a mapping turns real coverage into `selection_unknown`.
 */
export function loadSelectionConfig(config: unknown): SelectionConfigResult {
  const result = (
    selection: SelectionConfig,
    errors: readonly string[],
  ): SelectionConfigResult => ({
    config: selection,
    errors,
    ok: errors.length === 0,
  });
  if (!isRecord(config)) return result(emptySelectionConfig(), []);
  // Scopes come from the suites, so they are read whether or not this
  // repository declares any mapping rules: a repository with one suite and no
  // rules still knows what a test file looks like.
  const { scopes, errors: scopeErrors } = loadTestScopes(config);
  const testing = testingBlock(config);
  const raw = testing ? testing["selection"] : undefined;
  if (raw === null || raw === undefined) {
    return result({ ...emptySelectionConfig(), scopes }, scopeErrors);
  }
  if (!isRecord(raw)) {
    return result({ ...emptySelectionConfig(), scopes }, [
      ...scopeErrors,
      "testing.selection must be a mapping",
    ]);
  }
  const errors = [...scopeErrors];
  const moved = MOVED_TO_SUITES.filter((key) => key in raw);
  if (moved.length > 0) {
    errors.push(
      `testing.selection declares ${pythonRepr(moved)}, which each suite now ` +
        "declares for itself under testing.suites. Left here they would be a " +
        "second answer to what a test is, and the two would disagree the " +
        "first time a repository ran two ecosystems.",
    );
  }
  const unknown = unknownKeys(raw, SELECTION_FIELDS, MOVED_TO_SUITES);
  if (unknown.length > 0) {
    errors.push(`testing.selection has unknown key(s) ${pythonRepr(unknown)}`);
  }

  const strList = (value: unknown, label: string): string[] => {
    if (value === null || value === undefined) return [];
    if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
      errors.push(`${label} must be a list of strings`);
      return [];
    }
    return (value as string[]).map((v) => v.trim()).filter((v) => v !== "");
  };

  const smoke = strList(raw["smoke"], "testing.selection.smoke");
  const repoWide = strList(raw["repo_wide"], "testing.selection.repo_wide");

  const rules: Array<readonly [string, readonly string[]]> = [];
  let rawRules = raw["rules"];
  if (rawRules !== null && rawRules !== undefined && !Array.isArray(rawRules)) {
    errors.push("testing.selection.rules must be a list");
    rawRules = null;
  }
  const entries = Array.isArray(rawRules) ? rawRules : [];
  entries.forEach((entry, index) => {
    const label = `testing.selection.rules[${index}]`;
    if (!isRecord(entry)) {
      errors.push(`${label} must be a mapping`);
      return;
    }
    const extra = unknownKeys(entry, RULE_FIELDS);
    if (extra.length > 0) {
      errors.push(`${label} has unknown key(s) ${pythonRepr(extra)}`);
    }
    const when = entry["when"];
    if (typeof when !== "string" || when.trim() === "") {
      errors.push(`${label}.when must be a non-empty path prefix`);
      return;
    }
    const select = entry["select"];
    // An explicit empty list is the declaration "this path affects no test",
    // which is different from "unmapped" and must stay expressible.
    if (
      select === null ||
      select === undefined ||
      !Array.isArray(select) ||
      !select.every((value) => typeof value === "string")
    ) {
      errors.push(`${label}.select must be a list of test paths`);
      return;
    }
    rules.push([
      when.trim(),
      (select as string[]).map((value) => value.trim()).filter((v) => v !== ""),
    ]);
  });

  return result({ scopes, smoke, repoWide, rules }, errors);
}

/**
 * The suite scope that claims `rel`, or null.
 *
 * The scope rather than a boolean, because "is this a test" and "whose test
 * is it" are one question asked twice. A repository running two ecosystems
 * has two runners, and an answer that collapses to yes/no leaves the caller
 * to guess which of them to hand the file to.
 *
 * The first claiming scope wins, in declaration order. Two suites that both
 * claim one path are a declaration this module cannot resolve, and picking
 * the first is at least a stable answer the record can name.
 *
 * Presence is deliberately not asked. This is the question a write has to
 * answer -- a test file being created does not exist yet -- and it is the
 * same declaration selection reads, so the test root is defined once.
 */
export function scopeForTest(
  rel: string,
  selection: SelectionConfig,
): SuiteScope | null {
  const name = rel.slice(rel.lastIndexOf("/") + 1);
  for (const scope of selection.scopes) {
    if (!scopeIsComplete(scope)) continue;
    if (matchingPrefixes(rel, scope.roots).length === 0) continue;
    if (fnmatchCase(name, scope.glob)) return scope;
  }
  return null;
}

/** Whether any declared suite calls `rel` a test. */
export function namesATest(rel: string, selection: SelectionConfig): boolean {
  return scopeForTest(rel, selection) !== null;
}

/**
 * Whether `rel` is one of this repository's tests and is there.
 *
 * Presence is what keeps a deleted test out of the command -- naming it would
 * fail the very run it was meant to prove.
 */
export function isTestFile(
  repoRoot: string,
  rel: string,
  selection: SelectionConfig,
): boolean {
  if (!namesATest(rel, selection)) return false;
  try {
    return statSync(join(repoRoot, ...rel.split("/"))).isFile();
  } catch {
    return false;
  }
}

/**
 * The tests `changedPaths` make necessary, each with the reason that selected
 * it, plus the risks the selection raised.
 *
 * Reasons are assigned by precedence, so a test reachable by several routes is
 * recorded once under the most specific one. Nothing here widens to the full
 * suite except an explicitly declared repository-wide path.
 */
export function selectTests(
  repoRoot: string,
  changedPaths: readonly string[],
  selection: SelectionConfig,
): SelectionResult {
  const changed = changedPaths
    .filter((path) => String(path).trim() !== "")
    .map((path) => posixPath(path));

  const repoWideHits =
    selection.repoWide.length > 0
      ? changed.filter((rel) => matchingPrefixes(rel, selection.repoWide).length > 0)
      : [];
  if (repoWideHits.length > 0) {
    return new SelectionResult({
      allTestsAffected: true,
      allAffectedReason:
        "declared repository-wide path(s) changed: " +
        [...new Set(repoWideHits)].sort().join(", "),
    });
  }

  // Best reason wins: {test path: [precedence index, reason, selectedBy]}
  const best = new Map<string, [number, string, string]>();
  const offer = (testPath: string, reason: string, selectedBy: string): void => {
    const key = posixPath(testPath);
    const rank = REASON_PRECEDENCE.indexOf(reason);
    const current = best.get(key);
    if (current === undefined || rank < current[0]) {
      best.set(key, [rank, reason, selectedBy]);
    }
  };

  const unknown: string[] = [];
  for (const rel of changed) {
    let matched = false;

    if (isTestFile(repoRoot, rel, selection)) {
      offer(rel, REASON_CHANGED_TEST, rel);
      matched = true;
    }
    // Everything else under a test root -- a shared helper, a fixture, a
    // package marker -- maps to nothing on its own. It must fall through to
    // the rules and, failing those, to selection_unknown: treating it as
    // mapped would return clean targeted evidence for a change that can break
    // any test using it.

    for (const [when, targets] of selection.rules) {
      if (matchingPrefixes(rel, [when]).length > 0) {
        // An empty target list is a declaration that this path affects no
        // test -- mapped, deliberately selecting nothing.
        matched = true;
        for (const target of targets) offer(target, REASON_CONFIGURED_RULE, rel);
      }
    }

    if (!matched) unknown.push(rel);
  }

  const risks: SelectionRisk[] = [...new Set(unknown)].sort().map((rel) => ({
    kind: RISK_SELECTION_UNKNOWN,
    path: rel,
    detail:
      "no test maps to this path; the configured smoke tests ran instead and " +
      "verification must judge the exposure. Add a testing.selection rule " +
      "rather than widening the run.",
  }));
  if (unknown.length > 0) {
    for (const smoke of selection.smoke) offer(smoke, REASON_SMOKE, "selection_unknown");
  }

  // Ownership is resolved once, here, from the same declaration that decided
  // what a test is. A later caller that re-derived it would be a second
  // opinion about which runner answers for a file.
  const owner = (path: string): string => scopeForTest(path, selection)?.suite ?? "";

  const selected = [...best.entries()]
    .map(([path, [, reason, selectedBy]]) => ({
      path,
      reason,
      selectedBy,
      suite: owner(path),
    }))
    .sort(
      (left, right) =>
        REASON_PRECEDENCE.indexOf(left.reason) - REASON_PRECEDENCE.indexOf(right.reason) ||
        (left.path < right.path ? -1 : left.path > right.path ? 1 : 0),
    );

  return new SelectionResult({ selected, risks });
}

/**
 * The command this change set sanctions, or `""` when it sanctions none.
 *
 * The bare suite command is correct only where the selector proved every test
 * affected; a change mapped to no test has nothing to run, and naming the
 * suite there would be this module recommending the one run it exists to
 * refuse.
 *
 * Appending the selected paths is a *convention*, not a universal: pytest,
 * vitest, jest and `go test` take a file list, and `mvn -q test` and `dotnet
 * test` do not -- the first would read the path as a lifecycle argument and
 * the second wants a project. A suite whose runner has no subset form
 * declares `runs_whole` and is handed its own command unchanged, which is
 * then the smallest honest run of it. Guessing a narrowing syntax per
 * ecosystem is how this module would start emitting commands nobody can run,
 * under a policy name that says they proved something.
 */
export function targetedCommand(
  base: string,
  result: SelectionResult,
  options: { runsWhole?: boolean } = {},
): string {
  const command = String(base ?? "").trim();
  if (result.allTestsAffected) return command;
  const paths = result.testPaths;
  if (paths.length === 0) return "";
  if (options.runsWhole === true) return command;
  return [command, ...paths].join(" ");
}

export const RECORD_PLACEHOLDER = "<the command you ran>";

/**
 * A declaration error. Refused at load: a check nobody can run and a check
 * nobody declared must never look the same.
 */
export class CheckConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckConfigError";
  }
}

export interface Check {
  readonly name: string;
  readonly argv: readonly string[];
  readonly command: string;
  readonly covers: readonly string[];
  readonly cwd: string;
  readonly required: boolean;
  readonly kind: string;
  readonly small: boolean;
  /**
   * The runner has no way to be asked for a subset of its tests, so a run of
   * it is the complete suite. Declared, never inferred: only the repository
   * knows whether its command takes a file list.
   */
  readonly runsWhole: boolean;
  readonly timeoutSeconds: number | null;
  /**
   * A suite's own answer to what a test file is here. Empty on a control: a
   * linter has no test files, and pretending otherwise would put a verifier's
   * writes under a root nothing runs.
   */
  readonly testRoots: readonly string[];
  readonly testGlob: string;
}

export function makeCheck(fields: Partial<Check> & { name: string }): Check {
  return {
    argv: [],
    command: "",
    covers: [],
    cwd: "",
    required: true,
    kind: "suite",
    small: false,
    runsWhole: false,
    timeoutSeconds: null,
    testRoots: [],
    testGlob: "",
    ...fields,
  };
}

export function isSuite(check: Check): boolean {
  return check.kind === "suite";
}

export function displayCommand(check: Check): string {
  return check.command || check.argv.join(" ");
}

export interface CheckRun {
  readonly check: Check;
  readonly stage: string;
  readonly command: string;
  readonly treeDigest: string;
  readonly postTreeDigest: string | null;
  readonly treeMutated: boolean;
  readonly exitCode: number | null;
  readonly durationSeconds: number;
  readonly timedOut: boolean;
  readonly outcome: string;
  readonly selection: Record<string, unknown>;
  readonly output: string;
}

export function checkRunGreen(run: CheckRun): boolean {
  return run.outcome === OUTCOME_PASSED && !run.treeMutated;
}

export function checkRunBlocks(run: CheckRun): boolean {
  return run.check.required && !checkRunGreen(run);
}

// --- Declarations ---------------------------------------------------------------

function normalizeCovers(entries: readonly unknown[], label: string): string[] {
  const covers: string[] = [];
  for (const entry of entries) {
    const normalized = String(entry).replace(/\\/g, "/").trim();
    if (normalized === "") {
      throw new CheckConfigError(`${label}.covers has an empty entry`);
    }
    if (normalized.includes("*") || normalized.includes("?")) {
      throw new CheckConfigError(
        `${label}.covers entry ${pythonRepr(entry)} uses a glob; v1 accepts a ` +
          "directory prefix ending in '/' or an exact file path.",
      );
    }
    // `lstrip("./")` strips a character SET, which is what Python does here.
    covers.push(normalized.replace(/^[./]+/, ""));
  }
  return covers;
}

function entryCommand(
  entry: Record<string, unknown>,
  label: string,
): [string[], string] {
  const rawCommand = entry["command"];
  const hasCommand = typeof rawCommand === "string" && rawCommand.trim() !== "";
  const argv = entry["argv"];
  const hasArgv = Array.isArray(argv) && argv.length > 0;
  if (hasCommand && hasArgv) {
    throw new CheckConfigError(
      `${label} declares both 'command' and 'argv'; a check has one way to run.`,
    );
  }
  if (!hasCommand && !hasArgv) {
    throw new CheckConfigError(`${label} declares neither 'command' nor 'argv'.`);
  }
  if (hasArgv && !argv.every((value) => typeof value === "string" && value !== "")) {
    throw new CheckConfigError(`${label}.argv must be non-empty strings`);
  }
  return [
    hasArgv ? ([...argv] as string[]) : [],
    hasCommand ? (rawCommand as string).trim() : "",
  ];
}

/**
 * Every declared suite and control, or a `CheckConfigError`.
 *
 * Repository configuration is trusted input, so a legacy `command` string
 * still runs through the platform shell; new declarations use `argv` and are
 * executed directly.
 */
export function loadChecks(config: unknown): Check[] {
  const testing = testingBlock(config) ?? {};
  const checks: Check[] = [];
  const names = new Set<string>();

  const suites = Array.isArray(testing["suites"]) ? testing["suites"] : [];
  suites.forEach((entry, index) => {
    const label = `testing.suites[${index}]`;
    if (!isRecord(entry)) throw new CheckConfigError(`${label} must be a mapping`);
    const unknown = unknownKeys(entry, SUITE_FIELDS);
    if (unknown.length > 0) {
      throw new CheckConfigError(`${label} has unknown key(s) ${pythonRepr(unknown)}`);
    }
    const name = String(entry["name"] ?? "").trim();
    if (name === "") {
      throw new CheckConfigError(`${label}.name must be a non-empty string`);
    }
    if (names.has(name)) {
      throw new CheckConfigError(`${label}.name ${pythonRepr(name)} is declared twice`);
    }
    names.add(name);
    const [argv, command] = entryCommand(entry, label);
    const timeout = entry["timeout_seconds"];
    checks.push(
      makeCheck({
        name,
        argv,
        command,
        covers: normalizeCovers(
          (entry["covers"] as unknown[] | null | undefined) ?? [],
          label,
        ),
        cwd: String(entry["cwd"] ?? ""),
        required: true, // a suite is always required
        kind: "suite",
        small: Boolean(entry["small"]),
        runsWhole: Boolean(entry["runs_whole"]),
        timeoutSeconds: typeof timeout === "number" ? timeout : null,
        testRoots: (entry["test_roots"] as string[] | null | undefined) ?? [],
        testGlob: String(entry["test_glob"] ?? ""),
      }),
    );
  });

  const controls = Array.isArray(testing["controls"]) ? testing["controls"] : [];
  controls.forEach((entry, index) => {
    const label = `testing.controls[${index}]`;
    if (!isRecord(entry)) throw new CheckConfigError(`${label} must be a mapping`);
    const unknown = unknownKeys(entry, CONTROL_FIELDS);
    if (unknown.length > 0) {
      throw new CheckConfigError(`${label} has unknown key(s) ${pythonRepr(unknown)}`);
    }
    const name = String(entry["name"] ?? "").trim();
    if (name === "") {
      throw new CheckConfigError(`${label}.name must be a non-empty string`);
    }
    if (names.has(name)) {
      throw new CheckConfigError(`${label}.name ${pythonRepr(name)} is declared twice`);
    }
    names.add(name);
    const kind = String(entry["kind"] ?? "").trim();
    if (!CONTROL_KINDS.has(kind)) {
      throw new CheckConfigError(
        `${label}.kind ${pythonRepr(kind)} is not one of ${pythonRepr([...CONTROL_KINDS].sort())}`,
      );
    }
    const [argv, command] = entryCommand(entry, label);
    const timeout = entry["timeout_seconds"];
    checks.push(
      makeCheck({
        name,
        argv,
        command,
        covers: normalizeCovers(
          (entry["covers"] as unknown[] | null | undefined) ?? [],
          label,
        ),
        cwd: String(entry["cwd"] ?? ""),
        required: entry["required"] === undefined ? true : Boolean(entry["required"]),
        kind,
        timeoutSeconds: typeof timeout === "number" ? timeout : null,
      }),
    );
  });

  return checks;
}

/** Prefix entries end in `/`; every other entry is an exact file. */
export function coversAny(check: Check, changed: readonly string[]): boolean {
  for (const path of changed) {
    for (const entry of check.covers) {
      if (entry.endsWith("/")) {
        if (matchingPrefixes(path, [entry.replace(/\/+$/, "")]).length > 0) return true;
      } else if (path === entry) {
        return true;
      }
    }
  }
  return false;
}

// --- Execution ---------------------------------------------------------------------

/**
 * The child environment is built, never inherited.
 *
 * A check command is repository-declared and runs on the router's own
 * machine, so inheriting the environment hands every vendor key, feed PAT and
 * git token to code the framework did not write and cannot audit. The names
 * below are what a toolchain needs to find its interpreter, its SDK and a
 * scratch directory.
 *
 * Nothing on this list carries a credential, and that is the property being
 * kept: vendor keys (DABBLER_*_API_KEY and the raw ANTHROPIC_, OPENAI_,
 * GEMINI_ forms), feed PATs (NUGET_*, NPM_TOKEN,
 * VSS_NUGET_EXTERNAL_FEED_ENDPOINTS), git tokens (GH_TOKEN, GITHUB_TOKEN,
 * GIT_ASKPASS) and proxy credentials (HTTP_PROXY / HTTPS_PROXY, whose URLs
 * routinely carry user:password) never reach a child because they were never
 * added -- not because a filter caught them on the way out.
 *
 * Option-injection variables are absent on the same terms: _JAVA_OPTIONS,
 * JAVA_TOOL_OPTIONS, JDK_JAVA_OPTIONS, NODE_OPTIONS, PYTHONPATH and
 * PYTHONSTARTUP all change what a runtime executes without changing the
 * command the record says ran.
 *
 * TEMP, TMP and TMPDIR are deliberately absent: they are always set to a
 * per-check scratch directory rather than passed through, so a check cannot
 * read what the parent left in its temp directory or leave something there
 * for the next one.
 */
export const CHILD_ENV_ALLOWLIST: readonly string[] = [
  // Where to find programs, and how to talk to the user's console.
  "PATH", "PATHEXT", "COMSPEC", "SHELL", "TERM",
  "LANG", "LC_ALL", "LC_CTYPE", "TZ",
  // Identity and home, which build tools use to locate their caches.
  "HOME", "USERPROFILE", "HOMEDRIVE", "HOMEPATH",
  "USER", "USERNAME", "LOGNAME",
  // Windows platform roots.
  "SYSTEMROOT", "WINDIR", "SYSTEMDRIVE", "PUBLIC", "ALLUSERSPROFILE",
  "PROGRAMFILES", "PROGRAMFILES(X86)", "PROGRAMW6432", "PROGRAMDATA",
  "COMMONPROGRAMFILES", "COMMONPROGRAMFILES(X86)",
  "APPDATA", "LOCALAPPDATA",
  "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE", "OS",
  // Toolchain roots. Every one of these names a directory.
  "VIRTUAL_ENV", "JAVA_HOME",
  "DOTNET_ROOT", "DOTNET_ROOT(X86)",
  "DOTNET_CLI_TELEMETRY_OPTOUT", "DOTNET_NOLOGO",
  "GOROOT", "GOPATH", "GOCACHE", "GOMODCACHE",
  "CARGO_HOME", "RUSTUP_HOME",
  // A build that behaves differently under automation should know it is.
  "CI",
];

/**
 * The environment a check process gets: the allowlist, plus a scratch
 * directory of its own for TEMP/TMP/TMPDIR.
 *
 * Windows environment names are case-insensitive and `process.env` answers
 * them that way, so the allowlist is written in the one spelling Python uses
 * and the child is handed exactly those names.
 */
export function childEnv(scratch: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of CHILD_ENV_ALLOWLIST) {
    const value = process.env[name];
    if (value !== undefined) env[name] = value;
  }
  env["TEMP"] = scratch;
  env["TMP"] = scratch;
  env["TMPDIR"] = scratch;
  return env;
}

/**
 * Did the OS refuse this spawn for command-line size?
 *
 * Decided from the error code, not from message text, which is localized.
 * Measured on Windows 11 / Node 24: a `spawn` whose rendered command line
 * exceeds the ceiling fails with `ENAMETOOLONG` (libuv's mapping of
 * `ERROR_FILENAME_EXCED_RANGE`, 206) -- the same OS error Python's transport
 * classifier reads as `winerror == 206`. POSIX answers `E2BIG`, which is what
 * the Python side reads there. The Copilot transport's handoff exists to make
 * this unreachable; it is named anyway, because the failure spent a year
 * wearing the generic-unknown mask.
 */
export const ERROR_CLASS_ARGV_TOO_LARGE = "argv-too-large";

export function isArgvTooLarge(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === "ENAMETOOLONG" || code === "E2BIG";
}

/** Kill the child and everything it started. */
export function terminateTree(child: ChildProcess): void {
  const pid = child.pid;
  if (pid === undefined) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/F", "/T", "/PID", String(pid)], { stdio: "ignore" });
    return;
  }
  try {
    // `detached: true` gave the child its own group, so the negative pid
    // reaches the grandchildren a bare kill would leave running.
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      child.kill("SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

/**
 * A program name as the OS will resolve it, and whether it lands on a
 * Windows batch shim.
 *
 * Node refuses to `spawn` a `.cmd` or `.bat` without a shell (measured:
 * EINVAL), where Python's `CreateProcess` appears to run one directly. It
 * does not: `CreateProcess` special-cases a batch file by launching
 * `cmd.exe /c` around it, so the Python side already pays cmd's parsing on
 * exactly these programs. "Spawn the shim's target" is therefore not
 * available to either router -- a batch file IS a cmd script, and something
 * has to interpret it -- and parsing an npm-style shim to find the `node`
 * invocation inside it would be a guess about one package manager's
 * generated file.
 *
 * So the shim is handed to the interpreter that can run it, with each
 * declared argument quoted HERE rather than reassembled from a string:
 * `shell: true` would join the argv and let a shell re-split it, which is
 * exactly what an argv declaration exists to avoid. `/v:off` pins delayed
 * expansion off, so a machine whose registry enables it cannot make `!` in
 * an argument mean something -- a hole the Python side does leave open.
 * `%VAR%` is still expanded by cmd on both sides, and there is no command
 * line that prevents it.
 */
export function resolveProgram(program: string): { path: string; isBatch: boolean } {
  const batch = (path: string): boolean => /\.(cmd|bat)$/i.test(path);
  if (process.platform !== "win32") return { path: program, isBatch: false };
  if (/[\\/]/.test(program)) return { path: program, isBatch: batch(program) };

  const extensions = (process.env["PATHEXT"] ?? ".COM;.EXE;.BAT;.CMD").split(";");
  const directories = (process.env["PATH"] ?? "").split(";").filter((dir) => dir !== "");
  const candidates = /\.[^\\/.]+$/.test(program)
    ? [program]
    : extensions.map((extension) => program + extension);

  // Two passes, and an executable anywhere on PATH beats a shim nearer the
  // front. That is not `cmd`'s rule -- `cmd` and `where` take the first hit in
  // the first directory, whatever its extension -- but neither caller here is
  // a shell: both `spawn` without one, and the OS rule for that is
  // `CreateProcess`, which appends `.exe` and never considers `.cmd` at all.
  // Matching it is what makes this router reach the SAME program Python's
  // `subprocess` reaches from the same PATH.
  //
  // On this machine that is the difference between the Copilot CLI's real
  // executable and a batch shim VS Code installs ahead of it -- and the shim
  // has to be interpreted by `cmd.exe`, whose command line stops at 8,191
  // characters where `CreateProcess` allows 32,767. Preferring the executable
  // is therefore not a tidiness: it is four times the room for a prompt.
  const search = (accept: (path: string) => boolean): string | null => {
    for (const directory of directories) {
      for (const candidate of candidates) {
        const full = join(directory, candidate);
        if (accept(full) && existsSync(full)) return full;
      }
    }
    return null;
  };
  const executable = search((path) => !batch(path));
  if (executable !== null) return { path: executable, isBatch: false };
  // No executable: a shim is what exists, so it is what runs -- and Python
  // pays exactly the same `cmd.exe` interpretation there, because
  // `CreateProcess` special-cases a batch file by launching `cmd /c` around
  // it. Equal, and equally bounded by cmd's shorter line.
  const shim = search(() => true);
  if (shim !== null) return { path: shim, isBatch: batch(shim) };
  return { path: program, isBatch: batch(program) };
}

/** `cmd.exe`'s quoting for one argument of a `/c` command line. */
export function quoteForCmd(argument: string): string {
  if (argument !== "" && !/[\s"^&|<>()%!]/.test(argument)) return argument;
  return `"${argument.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, "$1$1")}"`;
}

/**
 * What every child spawned on these paths gets, whichever way it is reached.
 *
 * `windowsHide` is the one that has to be here rather than at a call site.
 * A console child of a parent that has no console -- which is what the
 * extension host is -- gets a console window of its own, and Windows gives
 * that window the foreground. Every declared check the extension ran
 * therefore flashed a `cmd` window in front of the operator and took the
 * caret out of whatever they were typing into. `jobs.ts` and `packaging.ts`
 * already passed it; these paths did not, and they are the ones a
 * repository's own suite runs through.
 *
 * `mode` is the only difference between the two. A declared `command`
 * string is trusted repository configuration and keeps its shell; an argv
 * never gets one, because which branch runs is `resolveProgram`'s to decide
 * and a shell shatters an argument that holds spaces. On POSIX both get
 * their own process group, so `terminateTree` reaches the grandchildren --
 * a tool the engine was running, a seat's helper -- and not the router that
 * spawned them. Windows needs no flag for that; `taskkill /T` has the same
 * reach.
 */
export function spawnOptionsFor(
  base: SpawnOptions,
  mode: "shell" | "argv",
): SpawnOptions {
  return hiddenSpawn({
    ...base,
    shell: mode === "shell",
    ...(process.platform === "win32" ? {} : { detached: true }),
  });
}

function spawnCheck(
  check: Check,
  command: string,
  cwd: string,
  env: Record<string, string>,
): ChildProcess {
  const options: SpawnOptions = {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  };
  if (check.command) {
    return spawn(command, spawnOptionsFor(options, "shell"));
  }
  const argv =
    command === check.argv.join(" ") ? [...check.argv] : shlexSplit(command);
  return spawnProgram(argv, options);
}

/**
 * Spawn an argv the way `resolveProgram` says it must be reached: an
 * executable with no shell, or a batch shim through `cmd.exe` with every
 * argument quoted here. The one implementation for every argv the router
 * spawns -- a declared check, the Copilot seat, an engine under `session
 * drive` -- because the first Copilot prompt the driver spike sent through
 * a shell arrived shattered into its words, and the CLI exited 0 without
 * calling a model. `shell` in the options is ignored: which branch runs is
 * the program's to decide, never the caller's.
 *
 * The process group and the hidden window both come from
 * `spawnOptionsFor`, which states why each is there. They belong in one
 * place rather than at each call site because a caller that forgot the
 * first would hand `terminateTree` a child it cannot fully end, and a
 * caller that forgot the second would open a window in front of the
 * operator.
 */
export function spawnProgram(argv: readonly string[], options: SpawnOptions): ChildProcess {
  const [program, ...rest] = argv;
  const resolved = resolveProgram(String(program));
  const grouped: SpawnOptions = spawnOptionsFor(options, "argv");
  if (resolved.isBatch) {
    // The outer pair is `/s`'s own rule and not decoration: cmd strips the
    // first and last quote of everything after `/c` when the first character
    // is a quote. Without it a shim under `C:\Program Files` loses the quotes
    // that hold its path together and cmd answers `'C:\Program' is not
    // recognized`, which reads as a missing program rather than as quoting.
    const line = `"${[resolved.path, ...rest].map(quoteForCmd).join(" ")}"`;
    return spawn(process.env["COMSPEC"] ?? "cmd.exe", ["/d", "/s", "/v:off", "/c", line], {
      ...grouped,
      windowsVerbatimArguments: true,
    });
  }
  return spawn(resolved.path, rest, grouped);
}

export function emptySelection(): Record<string, unknown> {
  return new SelectionResult().toDict();
}

export function selectionPayload(
  result: SelectionResult,
  fullReason = "",
): Record<string, unknown> {
  const payload = result.toDict();
  if (fullReason) payload["policy"] = fullReason;
  return payload;
}

export function timeoutFor(check: Check, config: unknown): number {
  if (check.timeoutSeconds) return Number(check.timeoutSeconds);
  const runPolicy = (config as Record<string, Record<string, unknown>>)["run_policy"];
  return Number(runPolicy["check_timeout_seconds"]);
}

/**
 * Run one declared check and measure what it did to the tree.
 *
 * A command that mutates the candidate tree fails the check whatever its exit
 * code said: it did not measure the tree anyone is about to commit. Async
 * because the timeout has to be able to kill a live process tree, which a
 * blocking spawn cannot do -- Python polls its child for the same reason.
 */
export async function execute(
  root: string,
  check: Check,
  command: string,
  options: {
    stage: string;
    treeDigest: string;
    timeoutSeconds: number;
    selection?: Record<string, unknown> | null;
  },
): Promise<CheckRun> {
  const cwd = check.cwd ? join(root, check.cwd) : root;
  const started = performance.now();
  let timedOut = false;
  const chunks: Buffer[] = [];
  let spawnError: unknown = null;
  let exitCode: number | null = null;

  const scratch = mkdtempSync(join(tmpdir(), "dabbler-check-"));
  try {
    // A command line past the OS ceiling is refused HERE rather than on the
    // error event -- Node measures the rendered length before it asks the OS
    // -- so a handler-only path would let the throw escape as a crash of the
    // framework instead of a failed check.
    let child: ChildProcess | null = null;
    try {
      child = spawnCheck(check, command, cwd, childEnv(scratch));
    } catch (error) {
      spawnError = error;
    }

    if (child !== null) {
      const live = child;
      live.stdout?.on("data", (chunk: Buffer) => chunks.push(chunk));
      live.stderr?.on("data", (chunk: Buffer) => chunks.push(chunk));
      await new Promise<void>((resolve) => {
        const deadline = setTimeout(() => {
          timedOut = true;
          terminateTree(live);
        }, options.timeoutSeconds * 1000);
        let settled = false;
        const finish = (): void => {
          if (settled) return;
          settled = true;
          clearTimeout(deadline);
          resolve();
        };
        live.on("error", (error) => {
          spawnError = error;
          finish();
        });
        live.on("close", (code) => {
          exitCode = code;
          finish();
        });
      });
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true, maxRetries: 3 });
  }

  const duration = (performance.now() - started) / 1000;
  const post = snapshotWorktreeTree(root);
  const mutated = post !== options.treeDigest;
  const failedToSpawn = spawnError !== null;
  const outcome =
    exitCode === 0 && !timedOut && !mutated && !failedToSpawn
      ? OUTCOME_PASSED
      : OUTCOME_FAILED;
  const output = failedToSpawn
    ? `${check.name} could not be executed: ${
        isArgvTooLarge(spawnError)
          ? `${ERROR_CLASS_ARGV_TOO_LARGE}: the rendered command line exceeds ` +
            "this operating system's ceiling"
          : String((spawnError as Error).message)
      }`
    : Buffer.concat(chunks).toString("utf8");

  return {
    check,
    stage: options.stage,
    command,
    treeDigest: options.treeDigest,
    postTreeDigest: post,
    treeMutated: mutated,
    exitCode: timedOut ? null : exitCode,
    durationSeconds: Math.round(duration * 1000) / 1000,
    timedOut,
    outcome,
    selection: options.selection ?? emptySelection(),
    output,
  };
}
