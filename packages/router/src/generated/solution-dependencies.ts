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
   * The name of the package source expected to serve this dependency. A NAME and never a URL: the URL is machine configuration and belongs where that machine keeps it, and a name is checkable against what is configured without the declaration carrying a credential. A feed nobody registered is one of the two failures that cost the most time and is invisible until a restore fails.
   */
  feed?: string | null;
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
   * This repository's OWN stable id -- the name other repositories use for it in `producedBy`. It is what makes a producer edge checkable: a path is a guess about one machine, and comparing that guess against what the repository at the path says it IS is the difference between reconciling the right manifests and reconciling whatever happens to sit there. Its absence is reported, never taken as agreement, and two checkouts stating the same id are recognised as one member rather than counted as two consumers disagreeing with themselves.
   */
  repositoryId?: string;
  /**
   * Directories, relative to this repository's root, holding the solution's other repositories. Defaults to the parent directory, which is the ordinary side-by-side layout. It exists because edges name PRODUCERS, so following them alone never reaches the other consumer of the same package -- and two consumers on two versions is the disagreement worth finding. A CI job or a machine that scatters its checkouts declares where they are rather than being guessed at; the search closes over what it finds, so naming one repository that knows the rest is enough.
   */
  searchPaths?: string[];
  /**
   * What this repository takes from its own solution. Third-party dependencies are deliberately absent -- they are the build file's business and a second record of them would rot.
   */
  consumes: SolutionDependenciesEdge[];
};
