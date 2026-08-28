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
   * Suites, deterministic controls, and the path-to-test selection rules. Validated in full by ai_router.checks and ai_router.affected, which is where the vocabulary lives; the shape is left open here so there is one parser rather than two that eventually disagree. Each suite declares its own test_roots and test_glob, because a repository that is Java and .NET at once has two of each; a suite whose runner takes no list of test files -- `mvn -q test`, `dotnet test` -- declares runs_whole, and the framework then runs it complete rather than inventing a narrowing syntax it cannot know.
   */
  testing?: Record<string, unknown>;
  /**
   * Step (f) of the session lifecycle: pack, then push to the feed. Validated in full by ai_router.packaging. A repository that declares nothing here publishes nothing, which is a declaration rather than an omission.
   */
  packaging?: Record<string, unknown>;
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
