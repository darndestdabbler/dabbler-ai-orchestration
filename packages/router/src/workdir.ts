// Where the router is standing.
//
// Every path a caller does not name is resolved from here: the sessions
// root when no `--sessions-dir` is given, the project root the config
// overlay is discovered against, the record path a relative
// `discovery.record` points at. On a command line the answer is
// `process.cwd()` and nothing else is needed.
//
// In-process it cannot be. The extension host is one Node process shared
// with every other extension, so `process.chdir` would move the ground
// under all of them in order to run one verb. `standIn` sets the answer
// for the duration of one call and restores it, and the readers ask here
// instead of asking the process.
//
// It is deliberately not a stack. Two verbs standing in two repositories
// at once would each resolve half their paths against the other, and no
// correct answer exists for that -- so `standIn` refuses to nest, and the
// in-process router serializes rather than discovering the refusal.

let root: string | null = null;

/** The directory the router resolves unnamed paths against. */
export function workingDirectory(): string {
  return root ?? process.cwd();
}

export class WorkingDirectoryConflictError extends Error {
  constructor(held: string, wanted: string) {
    super(
      `the router is already standing in ${held} and cannot also stand in ` +
        `${wanted}: two calls cannot resolve relative paths at once.`,
    );
    this.name = "WorkingDirectoryConflictError";
  }
}

/** Run `fn` as though the process stood in `directory`. */
export async function standIn<T>(
  directory: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (root !== null) throw new WorkingDirectoryConflictError(root, directory);
  root = directory;
  try {
    return await fn();
  } finally {
    root = null;
  }
}
