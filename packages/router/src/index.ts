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

// The transports there are, and the variable that outranks a config file's
// answer about which one. The Configuration pane offers the choice and says
// what would shadow it, and a surface with a list of its own would be the
// second copy of a vocabulary -- which is the drift that has already been
// paid for once here, in a phase list that was written down twice.
export { VALID_TRANSPORTS, TRANSPORT_ENV_VAR } from "./config.ts";
// The token a gate that judged nothing carries after its name. It is on the
// contract because the terminal paints a gate row's mark as the bytes pass
// and has to tell "passed" from "judged nothing", which wear the same mark.
// A second copy of the token in the renderer is how the two would come to
// disagree about the same fact.
export { GATE_NOT_APPLICABLE } from "./gates.ts";
// Which router this is, for a host that has to say so. The extension bundles
// the router rather than finding it on PATH, so "run `dabbler version`" is a
// question about a terminal's PATH and not about the router this window is
// using -- and a diagnostic that answered it that way would report the wrong
// program, or none. One string, read from the manifest that declares it.
export { VERSION as ROUTER_VERSION } from "./version.ts";
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
// The words a stop is read in, and the one rule for "it is moving again",
// for the same reason once more: the Dabbler terminal renders both from
// the run record, and a renderer with a wording of its own is a second
// statement of what the driver already says on stderr and in the status
// projection.
export {
  PULL_ENGINE,
  progressResumed,
  renderStop,
  renderUncollected,
  uncollectedJob,
  type JobPoll,
  type PhaseReading,
  type StopContext,
  type StopRecord,
  type StopRendering,
  type UncollectedJob,
} from "./driver.ts";
// A job that finished and nobody collected, read the one way: the Work
// Explorer's liveness row and the terminal's indicator both said "working"
// over a process that had exited, and this is the reader that says
// otherwise, in the driver's words.
export { readUncollectedJob, type UncollectedJobReading } from "./jobs.ts";
// The threshold that rule is judged against, from the repository's own
// configuration. The operator's editor setting still wins over it -- that
// precedence is the host's -- but the middle tier is the repository's to
// state, and a renderer that fell back to a number of its own would ignore
// a `verification.stalled_after_seconds` somebody set on purpose.
export { stalledAfterSeconds } from "./progress.ts";
// Re-deriving the solution projection, for the same reason again: it is
// written by the commands that move a declaration and by nothing else, so
// a host watching the DECLARATIONS underneath it has to be able to ask for
// a fresh one. The alternative is a host that reads the module manifest and
// the sibling repositories itself, which is the second implementation this
// export exists to prevent. It writes and never throws on a manifest
// problem, so a broken declaration leaves the last good projection standing
// rather than emptying the view.
export { tryWriteProjection } from "./projection.ts";
// What a session would be run with, asked for at the moment it is rendered
// rather than read out of a file somebody else wrote. It is not in the
// projection any more, for two reasons that point the same way: it was
// 98.4% of that document, and every input it depends on -- the model
// catalog, this operator's preferences -- lives at the USER level, where no
// workspace watcher can ever be told they moved. A reading derived on
// demand is also a reading this router made, so a pane cannot render an
// older router's shape of it.
export { configurationNode } from "./projection.ts";
