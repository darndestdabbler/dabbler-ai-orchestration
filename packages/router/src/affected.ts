// The pre-verification stage: which tests a change makes necessary, the named
// reason for each, and the standard the command that runs them is held to.
//
// The declaration and the selector themselves live in `checks.ts` and are
// re-exported here -- one repository, one answer to what a test is.
//
// Selection is deterministic: the same changed paths against the same tree
// always yield the same tests, in the same order, with the same reasons. A
// selection record is evidence, and evidence that varies between runs proves
// nothing.
//
// Every selected test carries the reason that pulled it in, so a reader can
// tell "the selector understood this change" from "the selector gave up". A
// source file's tests are the tests named after it; one with none is never
// widened into a full-suite run: it records `selection_unknown`, pulls in the
// configured smoke tests, and is shown to the reviewer.
//
// A remediation is measured against the previous round's snapshot, not the
// session's start. Otherwise one repository-wide edit early in a session makes
// every later round demand the whole suite again, and the stage that exists to
// delete that run becomes the thing prescribing it.

import { PROJECT_CONFIG_FILENAME } from "./config.ts";
import {
  SelectionResult,
  posixPath,
  REASON_DEPENDENT_PROJECT,
  selectTests,
  shlexSplit,
  testFilesUnder,
  type SelectionConfig,
  targetedCommand,
} from "./checks.ts";
import { effectiveBaseline, readRounds } from "./ledger.ts";
import { changedPathsBetween, runGit, snapshotWorktreeTree } from "./journal.ts";
import { readSessionState } from "./progress.ts";
import { readProjectGraph, usedBy } from "./projectGraph.ts";
import {
  ACCEPTED_POLICIES,
  POLICY_OPERATOR_OVERRIDE,
  POLICY_SUITE_WHOLE,
  POLICY_TARGETED,
  POLICY_VIOLATION,
  type SuiteSpec,
} from "./testEvidence.ts";

// Both live in `checks`. A repository has one answer to "which tests does this
// change make necessary", and the copy that used to sit beside this one was
// byte-identical until the day the declaration changed shape in one of them.
// Re-exported because this module is the lifecycle-facing name for them.
export {
  REASON_CHANGED_TEST,
  REASON_NAMED_TEST,
  REASON_PRECEDENCE,
  REASON_SMOKE,
  RISK_SELECTION_UNKNOWN,
  SELECTION_FIELDS,
  SelectionResult,
  isTestFile,
  loadSelectionConfig,
  namesATest,
  selectTests,
  targetedCommand,
} from "./checks.ts";
export type {
  SelectedTest,
  SelectionConfig,
  SelectionConfigResult,
  SelectionRisk,
  SuiteScope,
} from "./checks.ts";

// --- The pre-verification policy --------------------------------------------------

/**
 * The tree a pre-verification run is judged against.
 *
 * Before the first round that is `HEAD`: all of the session's work is new.
 * Once a round exists it is that round's recorded snapshot, because a
 * remediation answers for what the fix changed and nothing else. Measuring
 * every round against `HEAD` instead is what lets one repository-wide edit
 * early in a session demand a full suite before every later round -- the exact
 * ceremony the stage exists to remove.
 */
export function preverifyBaseline(
  repoRoot: string,
  sessionsDir: string,
): string | null {
  const state = readSessionState(sessionsDir);
  const current = state ? state["currentSession"] : null;
  if (current === null || current === undefined) return null;
  const rounds = readRounds(repoRoot, Number(current));
  for (let index = rounds.length - 1; index >= 0; index -= 1) {
    const row = rounds[index] as Record<string, unknown>;
    if (row["completion_tree"]) {
      // The recorded tree, or the substitute a re-anchor supplied when this
      // object store does not hold it. Selection has to measure from the same
      // place the round will.
      return effectiveBaseline(repoRoot, Number(current), row) as string | null;
    }
  }
  return null;
}

/**
 * Paths this working tree changes against `baselineTree`, or against HEAD
 * when none is given. Tracked or not. Null when git cannot answer -- an
 * unmeasurable change set is never "empty".
 */
export function workingTreeChanges(
  repoRoot: string,
  baselineTree?: string | null,
): string[] | null {
  const current = snapshotWorktreeTree(repoRoot);
  if (current === null) return null;
  let baseline = baselineTree;
  if (!baseline) {
    const head = runGit(repoRoot, ["rev-parse", "HEAD^{tree}"]);
    if (head.code !== 0 || !head.stdout) return null;
    baseline = head.stdout;
  }
  return changedPathsBetween(repoRoot, baseline, current);
}

/**
 * What a session's changes select at its end: the tests named after each
 * changed file, and every test under a project that references -- directly
 * or through another -- a project holding a changed file, read from the
 * build files for .NET and Maven alike.
 */
export function sessionSelection(
  repoRoot: string,
  changed: readonly string[],
  selection: SelectionConfig,
): SelectionResult {
  const named = selectTests(repoRoot, changed, selection);
  const graph = readProjectGraph(repoRoot);
  if (graph.ecosystem === null) return named;
  const dirOf = (buildFile: string): string =>
    buildFile.includes("/") ? buildFile.slice(0, buildFile.lastIndexOf("/")) : "";
  const holds = (dir: string, rel: string): boolean =>
    dir === "" || rel === dir || rel.startsWith(`${dir}/`);
  const reached = new Set<string>();
  for (const project of graph.projects) {
    const dir = dirOf(project.path);
    if (!changed.some((rel) => holds(dir, posixPath(rel)))) continue;
    for (const name of usedBy(graph, project.name)) reached.add(name);
  }
  const selected = [...named.selected];
  const seen = new Set(selected.map((entry) => entry.path));
  for (const project of graph.projects) {
    if (!reached.has(project.name)) continue;
    for (const test of testFilesUnder(repoRoot, dirOf(project.path), selection)) {
      if (seen.has(test.path)) continue;
      seen.add(test.path);
      selected.push({ path: test.path, reason: REASON_DEPENDENT_PROJECT, selectedBy: project.name, suite: test.suite });
    }
  }
  return new SelectionResult({ selected, risks: named.risks });
}

export interface PreverifyVerdict {
  readonly policy: string;
  readonly reason: string;
  readonly missing: readonly string[];
  readonly accepted: boolean;
}

function verdict(
  policy: string,
  reason: string,
  missing: readonly string[] = [],
): PreverifyVerdict {
  return { policy, reason, missing, accepted: ACCEPTED_POLICIES.includes(policy) };
}

function commandTokens(command: unknown): Set<string> {
  const text = posixPath(String(command ?? ""));
  let tokens: string[];
  try {
    tokens = shlexSplit(text);
  } catch {
    tokens = text.split(/\s+/);
  }
  return new Set(
    tokens.filter((token) => token !== "").map((token) => token.replace(/^['"]+|['"]+$/g, "")),
  );
}

function sameTokens(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) return false;
  for (const token of left) if (!right.has(token)) return false;
  return true;
}

/**
 * Whether `command` names `testPath` as a test to run.
 *
 * A file, or a node id inside that file -- nothing wider. A directory
 * argument is deliberately not a match: `pytest tests/` is the full suite with
 * a path typed in front of it, and accepting it would make every refusal in
 * this module one keystroke away from meaningless.
 */
export function commandNamesTest(command: unknown, testPath: string): boolean {
  const target = posixPath(testPath);
  for (const token of commandTokens(command)) {
    if (token === target || token.startsWith(target + "::")) return true;
  }
  return false;
}

/**
 * One command per declared suite, each naming only the tests that suite owns
 * -- or, where the repository declared no suite, the declaration to make
 * instead of a command to run.
 *
 * A repository that is Java and .NET at once has two runners, and a single
 * line naming both ecosystems' tests would fail in whichever of them was asked
 * to run the other's. Where nothing is declared there is nothing to print:
 * improvising `pytest` teaches an orchestrator in a Java repository to paste
 * a runner nobody declared, and the run of record would then cite it.
 */
export function runnableCommands(
  suites: readonly SuiteSpec[],
  result: SelectionResult,
  declared = suites.length,
): string[] {
  if (suites.length === 0) {
    // Two different repositories reach this line and they need two
    // different sentences. The caller filters on `expensive` before it gets
    // here, so a repository that HAS declared a suite and merely not
    // flagged it was being told its suite did not exist -- which sends an
    // operator to write a declaration that is already in the file. What
    // `declared` carries is the only thing this function cannot see for
    // itself: how many there were before the filter.
    if (declared > 0) {
      return [
        "no suite is marked expensive, so there is no command to run here. " +
          `The suite is declared; add \`expensive: true\` to it under ` +
          `testing.suites in ${PROJECT_CONFIG_FILENAME}. Only an expensive ` +
          "suite is worth selecting a subset of -- a cheap one is run whole.",
      ];
    }
    return [
      "no suite is declared, so there is no command to run. Declare one under " +
        `testing.suites in ${PROJECT_CONFIG_FILENAME}: a name, the command ` +
        "that runs it, and the paths it covers.",
    ];
  }
  return suites
    .map((suite) =>
      targetedCommand(suite.command, result.forSuite(suite.name), suite),
    )
    .filter((command) => command !== "");
}

export const RECORD_PLACEHOLDER = "<the command you ran>";

/**
 * The one rendering of the record line. Every message that asks for
 * pre-verification evidence prints this, so a caller cannot invent a variant
 * that names a flag the CLI does not take.
 */
export function recordCommand(
  sessionsDir: string,
  suite: string,
  command = "",
): string {
  return (
    `dabbler test-evidence record --sessions-dir ${sessionsDir} ` +
    `--suite ${suite || "<name>"} --stage preverify-targeted ` +
    `--command "${command || RECORD_PLACEHOLDER}" --outcome passed ` +
    "--duration-seconds <elapsed>"
  );
}

/**
 * Run the selected tests, then record that run. Both lines or neither: a
 * message that named the run without the record would leave the caller one
 * refusal short of where it thought it was.
 */
export function preverifyRecipe(
  sessionsDir: string,
  suite: string,
  command: string,
): string {
  return (
    "Run the affected tests, then record that command:\n" +
    `  ${command}\n` +
    `  ${recordCommand(sessionsDir, suite, command)}`
  );
}

/**
 * What a fix must do before another round opens. The selector answers again
 * rather than being quoted from the last round: a fix moves the surfaces, so
 * the tests it now affects are not the tests the session affected.
 */
export function remediationRecipe(sessionsDir: string, suite = ""): string {
  return (
    "Prove the fix before the next round:\n" +
    `  dabbler affected --sessions-dir ${sessionsDir}\n` +
    "  <run the command it prints>\n" +
    `  ${recordCommand(sessionsDir, suite)}\n` +
    `  dabbler verify --sessions-dir ${sessionsDir}`
  );
}

/** The two audited ways past a refusal, and the refusal itself. */
function overrideOrViolation(
  overrideReason: string | null | undefined,
  why: string,
  missing: readonly string[],
): PreverifyVerdict {
  if (overrideReason !== null && overrideReason !== undefined) {
    const reason = String(overrideReason).trim();
    if (reason) return verdict(POLICY_OPERATOR_OVERRIDE, reason, missing);
    return verdict(
      POLICY_VIOLATION,
      "--allow-full-preverify carried no reason; an override nobody can audit " +
        "is not an exception",
      missing,
    );
  }
  return verdict(POLICY_VIOLATION, why, missing);
}

/**
 * What makes `command` acceptable pre-verification evidence, or why it is not.
 *
 * A command earns `targeted` by naming every test the selector chose -- not
 * most of them, and not the directory they live in. An operator override
 * with a reason is the only other way through, and it lands in the record
 * under its own name so a reader can tell it from a targeted run. Everything else is a `policy_violation`: the run happened, it cost what
 * it cost, and it proves nothing about the change.
 *
 * Zero selected tests is not a free pass. A change declared to affect no test
 * needs no run, so every run recorded against it is a run nobody asked for --
 * in practice the whole suite, which is the single case this stage exists to
 * refuse.
 */
export function classifyPreverifyCommand(
  command: unknown,
  result: SelectionResult,
  options: {
    overrideReason?: string | null;
    runsWhole?: boolean;
    declaredCommand?: string;
  } = {},
): PreverifyVerdict {
  const overrideReason = options.overrideReason;
  const declaredCommand = options.declaredCommand ?? "";
  const paths = result.testPaths;
  if (paths.length === 0) {
    return overrideOrViolation(
      overrideReason,
      "the selector maps this change set to no test, so no pre-verification " +
        "run was needed and this one is evidence of nothing",
      [],
    );
  }
  if (options.runsWhole === true) {
    // The suite said its runner takes no subset, so "names the selected tests"
    // is a standard it could never meet -- and holding it to one would make
    // every honest run of it a policy_violation. What it can be held to is
    // running exactly what it declared, unembellished.
    if (sameTokens(commandTokens(command), commandTokens(declaredCommand))) {
      return verdict(
        POLICY_SUITE_WHOLE,
        "the suite declares runs_whole, so its complete run is the smallest " +
          `evidence available for the ${paths.length} selected test(s)`,
      );
    }
    return overrideOrViolation(
      overrideReason,
      "the suite declares runs_whole, so the only run it sanctions is its own " +
        `declared command ('${declaredCommand}'); this one is something else`,
      [],
    );
  }
  const missing = paths.filter((path) => !commandNamesTest(command, path));
  if (missing.length === 0) {
    return verdict(POLICY_TARGETED, `names all ${paths.length} selected test(s)`);
  }
  return overrideOrViolation(
    overrideReason,
    `the command names ${paths.length - missing.length} of ${paths.length} ` +
      "selected test(s) and misses " +
      missing.slice(0, 5).join(", ") +
      (missing.length > 5 ? "..." : "") +
      ". A run that does not name the selected tests is not evidence that " +
      "they ran",
    missing,
  );
}

