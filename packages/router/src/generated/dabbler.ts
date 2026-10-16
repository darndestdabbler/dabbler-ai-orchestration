// Generated from dabbler.schema.json by packages/router/src/schema/generate.ts.
// Do not edit: the schema is the source, and `npm run check:types` fails
// when this file no longer matches it.

/**
 * dabbler.yaml (the repository's own configuration)
 */
export type Dabbler = {
  /**
   * The shape this file is written in. Required, so a repository set up under a later shape is refused with its version named rather than read as a set of unknown keys.
   */
  schema_version: 1;
  /**
   * Suites, deterministic controls, and the smoke tests. Validated in full by checks.ts and testEvidence.ts, which is where the vocabulary lives; the shape is left open here so there is one parser rather than two that eventually disagree. Each suite declares its own test_roots and test_glob, because a repository that is Java and .NET at once has two of each, and test_name, the basename a source file's tests take with {name} for its stem ({name}Tests.cs, {name}Test.java, {name}.test.ts). select is the command that runs a selection: {paths} for the selected test files, {names} for their names joined by select_separator (a comma unless it says otherwise) -- `dotnet test --filter {names}` with separator |, `mvn -q test -Dtest={names} -Dsurefire.failIfNoSpecifiedTests=false`. A suite with no select runs whole. testing.selection.smoke runs where a changed source file has no test named after it; selection.rules and selection.repo_wide are no longer read.
   */
  testing?: Record<string, unknown>;
  /**
   * Step (f) of the session lifecycle: pack, then push to the feed; pack alone, whose artifacts are handed over from the run's package folder with a release tag; or `release: tag`. Validated in full by router-config.schema.json and packaging.ts. A repository that declares nothing here publishes nothing, which is a declaration rather than an omission.
   */
  packaging?: Record<string, unknown>;
  /**
   * No longer read. Per-module declarations (`packaging`, `sharedFiles`, `contract`) keyed by a slug docs/modules.yaml declared; the solution's shape is read from its build files now, and a start that finds `sharedFiles` here says it is not read and refuses nothing. Left open so a configuration that still carries the block loads.
   */
  modules?: Record<string, unknown>;
  /**
   * How far `dabbler session drive` may go on this repository's behalf. Repository-owned like the testing block, and for the same reason: a bound a gitignored overlay could raise is not a bound.
   */
  driver?: {
    /**
     * How many times one driven session may invoke the engine before the loop stops and closes nothing (default 24). On a Copilot seat every invocation is a premium request, so this is a spend ceiling as much as a loop bound; continuing past it is a re-run with a larger --max-invocations, which is a person deciding to spend more.
     */
    max_invocations?: number;
    /**
     * What a person sees of the engine while `session drive` runs it (default stream): `stream` renders the engine's live output -- Claude Code's stream-json as thinking / tool / text / result lines with only the `init` system event, Copilot's own progress lines, Codex's JSONL items -- and `quiet` shows nothing until the driver's next line. The engine's argv and the transcript under the driver's ledger are identical either way; `--show-engine` on `drive` overrides for one run.
     */
    engine_output?: "stream" | "quiet";
  };
  /**
   * Path facts about this repository.
   */
  paths?: {
    /**
     * Paths whose modification escalates a run to the verified path. Which paths a repository treats as sensitive is a property of the repository, so it is declared here and tracked -- a machine-local file that could quietly empty this list would be a machine turning off a repository's own control.
     */
    sensitive_paths?: string[];
  };
};
