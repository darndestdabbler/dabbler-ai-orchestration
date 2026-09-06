// The tests phase: the verifier authors the tests, the framework runs them.
//
// The split is the whole module. The verifier authors because it did not
// write the code and does not inherit its blind spots; the framework runs
// because "the tests pass" has to be an observation. A model that both writes
// tests and reports on them is scoring its own work, and the result stops
// being a fact anything can branch on.
//
// So nothing here asks the verifier for a result, and the prompt says so.
// What comes back is a file, offered through the `test-write` block
// `agency.ts` performs -- the verifier holds no write tool on either
// transport, which is what makes a refusal possible. What decides the round
// is an exit code from `checks.execute`.
//
// The suite is the one this repository declares for the paths that were
// written, so the phase runs the tests through the same declaration ordinary
// selection reads. A written test the declared suites do not cover is refused
// rather than run some other way: a test nobody declared a runner for is a
// test whose green means nothing.

import {
  applyWrites,
  briefing,
  DEFAULT_READ_BUDGET,
  type AgencyGrant,
  grantForTransport,
  sessionScope,
  type TestWrite,
  writeAccepted,
  writeRow,
} from "./agency.ts";
import {
  type Check,
  type CheckRun,
  coversAny,
  declaresTests,
  displayCommand,
  execute,
  isSuite,
  loadChecks,
  loadSelectionConfig,
  REASON_CHANGED_TEST,
  scopeForTest,
  SelectionResult,
  selectionPayload,
  STAGE_TARGETED,
  targetedCommand,
  timeoutFor,
} from "./checks.ts";
import { resolveTransport } from "./config.ts";
import { snapshotWorktreeTree } from "./journal.ts";
import { NoCandidateError, route } from "./route.ts";
import { ROLE_VERIFIER } from "./selection.ts";
import { STEP_DELIVERABLES, STEP_TITLES } from "./solution.ts";
import { readArtifacts } from "./stepreview.ts";

/**
 * Why the phase runs what it runs. These files changed, because the verifier
 * just wrote them.
 */
export const SELECTED_BY_AUTHORED = "tests-phase";

export const TASK_TYPE = "test-generation";

/**
 * The phase could not be run. Never an outcome -- a phase that did not happen
 * and a phase whose tests failed are different facts, and a red round is the
 * one the loop is allowed to act on.
 */
export class PhaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhaseError";
  }
}

/**
 * One authoring hand-off: who wrote, over what transport, and what the
 * framework did with each file they asked for.
 */
export interface Authoring {
  readonly provider: string;
  readonly model: string;
  readonly transport: string;
  readonly writes: readonly TestWrite[];
  readonly simulated: boolean;
}

export function authoringWritten(authoring: Authoring): string[] {
  return authoring.writes.filter((w) => writeAccepted(w)).map((w) => w.path);
}

export function authoringRefused(authoring: Authoring): string[] {
  return authoring.writes.filter((w) => !writeAccepted(w)).map((w) => w.path);
}

export function authoringRow(authoring: Authoring): Record<string, unknown> {
  return {
    provider: authoring.provider,
    model: authoring.model,
    transport: authoring.transport,
    simulated: authoring.simulated,
    written: authoringWritten(authoring),
    writes: authoring.writes.map((w) => writeRow(w)),
  };
}

/**
 * What the verifier is asked for: files, not findings and not a verdict.
 *
 * The write surface is described by `agency.briefing`, so the block the
 * prompt asks for and the block the framework parses are one description.
 */
export function buildPrompt(
  target: string,
  step: string,
  artifacts: ReadonlyArray<readonly [string, string]>,
  grant: AgencyGrant,
): string {
  const body: string[] = [
    "You are writing tests for one step of a solution being built in six " +
      "steps.",
    "A different AI produced the work below. You did not write it, you " +
      "are not fixing it, and you are not reviewing it — your job is to " +
      "author tests that fail if it is wrong.",
    "",
    `## The step: ${STEP_TITLES[step]}`,
    "",
    `**Under test:** \`${target}\``,
    "",
    "**What this step owes:**",
    "",
    STEP_DELIVERABLES[step],
    "",
    "## What it produced",
    "",
  ];
  for (const [path, text] of artifacts) {
    body.push(`### \`${path}\``, "", "````", text.trimEnd(), "````", "");
  }

  const brief = briefing(grant);
  if (brief) body.push(brief, "");

  body.push(
    "## How to answer",
    "",
    "**Emit the test files and nothing else that matters.** Every file " +
      "goes in its own `test-write` block, exactly as described above. " +
      "Prose outside the blocks is read by a person and acted on by " +
      "nobody.",
    "",
    "- **One test per behaviour.** A second test of the same behaviour " +
      "costs a maintenance obligation and proves nothing the first did " +
      "not.",
    "- **Test what the work claims, at its boundaries and its error " +
      "paths.** A test that passes against an empty implementation is " +
      "worse than no test, because it reads as coverage.",
    "- **Name each test after the behaviour it proves**, so a failure " +
      "says what broke without anyone reading the body.",
    "- **Do not test the framework, the test runner, or your own " +
      "fixtures.**",
    "",
    "**You will not run these tests, and you must not say whether they " +
      "pass.** The framework runs them and the exit code is the fact. A " +
      "sentence claiming a result is the one thing this hand-off exists " +
      "to prevent — it would be scoring your own work, and it is ignored.",
    "",
    "**You cannot change the implementation.** Your only write is a test " +
      "file under the declared test root. If the work is untestable as it " +
      "stands, write the test that says so and let it fail.",
  );
  return body.join("\n");
}

/**
 * Ask a verifier for the tests and write the ones the boundary allows.
 *
 * Returns `[Authoring, raw response]` -- the raw text is returned so the
 * caller can file it verbatim.
 *
 * The grant the prompt describes is built from the resolved transport
 * preference; the writes are applied under the grant of the transport the
 * call actually ran on, because a round that fell back to the API path could
 * not have been offered a surface however it was briefed.
 */
export async function author(
  repoRoot: string,
  target: string,
  step: string,
  artifactPaths: readonly string[],
  config: Record<string, unknown>,
  options: {
    authorProvider?: string | null;
    transport?: string | null;
    readBudget?: number | null;
  } = {},
): Promise<readonly [Authoring, string]> {
  if (!(step in STEP_TITLES)) throw new PhaseError(`unknown step '${step}'`);
  const artifacts = readArtifacts(artifactPaths);
  if (artifacts.length === 0) {
    throw new PhaseError(
      "name at least one artifact. Tests written against nothing pass " +
        "against anything.",
    );
  }

  const selection = loadSelectionConfig(config).config;
  if (!declaresTests(selection)) {
    throw new PhaseError(
      "no suite in testing.suites declares where its tests live, so no " +
        "file the verifier offers could be confirmed to be a test and " +
        "every write would be refused. Declare test_roots and test_glob " +
        "on a suite first.",
    );
  }
  const scope = sessionScope(
    repoRoot,
    null,
    artifacts.map(([path]) => path),
  );
  const budget = options.readBudget || DEFAULT_READ_BUDGET;

  const grantFor = (forTransport: string): AgencyGrant =>
    grantForTransport(forTransport, {
      scope,
      readBudget: budget,
      testScopes: selection.scopes,
      allowWrite: true,
    });

  // Briefed from the resolved preference; the writes are applied under the
  // grant of the transport the call actually ran on, because a round that
  // fell back could not look however it was briefed. The write itself
  // survives the fallback: no tool carries it.
  const briefed = grantFor(resolveTransport(config, options.transport ?? null));
  const prompt = buildPrompt(target, step, artifacts, briefed);
  const exclude = options.authorProvider ? [options.authorProvider] : [];
  let result;
  try {
    result = await route(prompt, {
      taskType: TASK_TYPE,
      role: ROLE_VERIFIER,
      excludeProviders: exclude,
      transport: options.transport ?? null,
    });
  } catch (error) {
    if (error instanceof NoCandidateError) {
      throw new PhaseError(
        `${error.message}. The tests are authored by a provider that is not ` +
          "the author's; configure another or this step's tests would be " +
          "written by whoever wrote the code.",
      );
    }
    throw error;
  }

  const simulated = Boolean(result.metadata?.simulated);
  if (!simulated && options.authorProvider && result.provider === options.authorProvider) {
    throw new PhaseError(
      `${result.provider} answered despite being excluded, so the code and ` +
        "its tests would have one author. Refusing to write them.",
    );
  }

  const writes = applyWrites(repoRoot, grantFor(result.transport), result.content);
  return [
    {
      provider: result.provider,
      model: result.served_model_id || result.model_name,
      transport: result.transport,
      writes,
      simulated,
    },
    result.content,
  ] as const;
}

/**
 * `[[suite, its paths], ...]` -- these test files, grouped by the suite that
 * answers for each one, in declaration order.
 *
 * Ownership comes from the suite's own `test_roots` and `test_glob`, which is
 * what makes a two-ecosystem repository work: Maven is handed the Java tests
 * and `dotnet test` the .NET ones, rather than every path going to whichever
 * suite happened to be declared first. `covers` is the fallback for a path no
 * suite's test declaration claims -- a suite that runs something which is not
 * a test file still runs it.
 *
 * A path nothing claims is refused rather than handed to some other runner:
 * the framework runs tests through the declaration or it does not run them,
 * and inventing a command here would be a second implementation of what a
 * suite is.
 */
export function suitesFor(
  config: Record<string, unknown>,
  testPaths: readonly string[],
): Array<readonly [Check, readonly string[]]> {
  const suites = loadChecks(config).filter((c) => isSuite(c));
  const byName = new Map(suites.map((c) => [c.name, c] as const));
  const selection = loadSelectionConfig(config).config;

  const grouped = new Map<string, string[]>();
  const unclaimed: string[] = [];
  for (const path of testPaths) {
    const scope = scopeForTest(path, selection);
    const owner = scope ? byName.get(scope.suite) : undefined;
    if (owner === undefined) {
      unclaimed.push(path);
    } else {
      const bucket = grouped.get(owner.name) ?? [];
      bucket.push(path);
      grouped.set(owner.name, bucket);
    }
  }

  for (const path of unclaimed) {
    const check = suites.find((c) => coversAny(c, [path]));
    if (check === undefined) {
      const declared = suites.map((c) => c.name).join(", ") || "(none)";
      throw new PhaseError(
        `no declared suite covers ${path} — declared suites: ${declared}. ` +
          "Add the path to a suite's `test_roots` and `test_glob`, or to " +
          "its `covers`, under testing.suites; a test with no declared " +
          "runner is a test whose result nothing can read.",
      );
    }
    const bucket = grouped.get(check.name) ?? [];
    bucket.push(path);
    grouped.set(check.name, bucket);
  }

  return suites
    .filter((c) => grouped.has(c.name))
    .map((c) => [c, grouped.get(c.name) as string[]] as const);
}

/**
 * Run the authored tests and report what the exit codes said.
 *
 * Returns one `CheckRun` per suite that owns some of these files, in
 * declaration order. Plural because a repository running two ecosystems has
 * two runners: one run carries one command, one exit code and one tree, so
 * Maven and `dotnet test` cannot share a row. A single-suite repository gets
 * a one-element array.
 *
 * The tree is snapshotted per run rather than once, so a suite that dirties
 * the worktree is measured against what it actually found and the mutation is
 * recorded on the run that caused it.
 *
 * This module does not decide whether a run passed -- `checkRunGreen` already
 * does, against the tree the run measured, and a second opinion here would
 * eventually disagree with it.
 */
export async function runAuthored(
  repoRoot: string,
  config: Record<string, unknown>,
  testPaths: readonly string[],
): Promise<CheckRun[]> {
  const paths = [...new Set(testPaths.filter((p) => p))];
  if (paths.length === 0) {
    throw new PhaseError(
      "no authored test to run. A run of nothing exits zero, which is " +
        "indistinguishable from a suite that passed.",
    );
  }
  const runs: CheckRun[] = [];
  for (const [check, owned] of suitesFor(config, paths)) {
    const tree = snapshotWorktreeTree(repoRoot);
    if (tree === null) {
      throw new PhaseError(
        `could not snapshot the working tree at ${repoRoot}. Every run is ` +
          "judged against a tree id, so a run that cannot name the tree it " +
          "measured proves nothing about it.",
      );
    }
    const selection = new SelectionResult({
      selected: owned.map((path) => ({
        path,
        reason: REASON_CHANGED_TEST,
        selectedBy: SELECTED_BY_AUTHORED,
        suite: check.name,
      })),
    });
    let timeout: number;
    try {
      timeout = timeoutFor(check, config);
    } catch (error) {
      throw new PhaseError(
        "run_policy.check_timeout_seconds is not declared, and an " +
          "unbounded suite run is how a loop stops being bounded: " +
          `${(error as Error).message}`,
      );
    }
    runs.push(
      await execute(
        repoRoot,
        check,
        targetedCommand(displayCommand(check), selection, {
          runsWhole: check.runsWhole,
        }),
        {
          stage: STAGE_TARGETED,
          treeDigest: tree,
          timeoutSeconds: timeout,
          selection: selectionPayload(selection),
        },
      ),
    );
  }
  return runs;
}
