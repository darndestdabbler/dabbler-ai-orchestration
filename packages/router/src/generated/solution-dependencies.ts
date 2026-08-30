// Generated from solution-dependencies.schema.json by packages/router/src/schema/generate.ts.
// Do not edit: the schema is the source, and `npm run check:types` fails
// when this file no longer matches it.

export type SolutionDependenciesEdge = {
  /**
   * The package id exactly as the build file names it. It is the join key between this declaration and the .csproj or POM, so a near-miss is a missing edge rather than a fuzzy match.
   */
  id: string;
  kind: "nuget" | "maven";
  producedBy: SolutionDependenciesProducer;
  /**
   * Where the dependency comes from right now. `feed` is the ordinary state. `source` is the troubleshooting mode -- the sibling checkout compiled directly -- and it is recorded here rather than left implicit in a build file, because a green build against a sibling checkout proves nothing about the published package and the record has to be able to say so.
   */
  resolve: "feed" | "source";
};

/**
 * Which repository builds this package. All three fields are ways of naming the same repository, and none of them is required to be resolvable right now: a sibling that is absent, moved or not cloned is a REPORTED state, never an error that stops work.
 */
export type SolutionDependenciesProducer = {
  /**
   * A stable name for the repository, independent of where anyone checked it out. It survives a move, a rename of the folder, and a second clone; the other two fields do not, which is why this one is required and they are not.
   */
  id: string;
  /**
   * The remote URL, when there is one. Two checkouts of the same repository agree here and disagree on `path`.
   */
  remote?: string | null;
  /**
   * Where this machine has it, relative to this repository's root. Machine-specific by nature, which is why it is optional and why nothing refuses when it is wrong -- the honest answer to a path that does not exist is to say so.
   */
  path?: string | null;
};

/**
 * solution-dependencies.json (one repository's edges in its solution)
 */
export type SolutionDependencies = {
  schemaVersion: 1;
  /**
   * The solution this repository belongs to. Repositories naming the same solution are the ones whose edges are assembled together; it is how the union knows where to stop.
   */
  solution: string;
  /**
   * What this repository takes from its own solution. Third-party dependencies are deliberately absent -- they are the build file's business and a second record of them would rot.
   */
  consumes: SolutionDependenciesEdge[];
};
