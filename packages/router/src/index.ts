// What a consumer of `dabbler-ai-router` may import: the contract, the
// generated types, and the implementation of the contract. The modules
// BEHIND the contract are not exported -- a caller that reached past
// `Router` would be depending on how the router is built rather than on
// what it answers.
//
// `createInProcessRouter` is the exception that proves it: it hands back a
// `Router`, so the extension gets an implementation without getting a
// module. It is exported here rather than assembled by the caller because
// wiring one would mean knowing which module answers which verb, which is
// exactly the knowledge the contract exists to hold on the caller's
// behalf.

export * from "./contracts/router.ts";
export * from "./contracts/verbs.ts";
export * from "./generated/index.ts";
export {
  createInProcessRouter,
  commandLineFor,
  quoteForDisplay,
  type InProcessRouterOptions,
  type RouterEcho,
  type VerbRun,
} from "./inProcess.ts";
// The one spawn and the one tree kill. A host that runs `dabbler` as a
// child process -- the extension launching `session drive` -- reaches the
// same rule the router applies to its own children (an `.exe` with no
// shell, a `.cmd` shim quoted, its own process group on POSIX) rather than
// restating it.
export { spawnProgram, terminateTree } from "./checks.ts";
// The watcher rule, for the same reason: the Dabbler terminal is what
// renders "an instruction is outstanding and nothing has answered it", and
// a renderer that decided it for itself would be a second statement of a
// rule the driver already owns.
export {
  WATCHER_JOB_OUTSTANDING,
  WATCHER_OUTSTANDING,
  WATCHER_QUIET,
  readWatcher,
  treeTouchedAt,
  watcherReading,
  type WatcherInputs,
  type WatcherReading,
  type WatcherState,
} from "./driver.ts";
// The threshold that rule is judged against, from the repository's own
// configuration. The operator's editor setting still wins over it -- that
// precedence is the host's -- but the middle tier is the repository's to
// state, and a renderer that fell back to a number of its own would ignore
// a `verification.stalled_after_seconds` somebody set on purpose.
export { stalledAfterSeconds } from "./progress.ts";
