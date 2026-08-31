// The `dabbler` command's verb list.
//
// One table, and the CLI dispatches on it. A second copy of this list
// would be drift, so there is not one: the usage text, the dispatcher and
// the "no such verb" refusal all read this.
//
// A verb belongs here when the command can run it. `ledger` and
// `approved-plan` do not: they are libraries the `Router` contract reaches
// as functions, with no arguments to parse and no output to print, and a
// verb declared here that dispatches to nothing would be a promise the
// usage text makes and the command breaks.

export interface VerbSpec {
  /** As typed: `dabbler session start`. */
  readonly verb: string;
  /**
   * True when the extension calls it. The rest are engine-facing: an
   * orchestrator runs them by hand from the session lifecycle.
   */
  readonly extensionFacing: boolean;
  readonly summary: string;
}

export const VERBS: readonly VerbSpec[] = [
  {
    verb: "session",
    extensionFacing: true,
    summary: "start, declare, log, decision, close, cancel, restore",
  },
  {
    // The name D88 and D130 promised the operator when the run core was
    // retired. `dabbler status` used to print the RUN projection; it prints
    // the lifecycle's.
    //
    // It was an alias over `progress` for one session, because the
    // extension spawned `progress` and a rename would have broken the spawn
    // site. The extension does not spawn anything now -- it calls
    // `Router.progress`, which is a method and not a command line -- so the
    // second name has nothing left holding it up and is gone. One name, one
    // projection.
    verb: "status",
    extensionFacing: false,
    summary: "where this repository is, from the lifecycle's own record",
  },
  {
    verb: "modules",
    extensionFacing: true,
    summary: "list, create and retire the modules of a workspace",
  },
  {
    verb: "affected",
    extensionFacing: false,
    summary: "the tests this change makes necessary, and the command to run",
  },
  {
    verb: "test-evidence",
    extensionFacing: false,
    summary: "record a test run as evidence",
  },
  {
    verb: "facts",
    extensionFacing: false,
    summary: "the deterministic controls, run and recorded",
  },
  {
    verb: "verify",
    extensionFacing: true,
    summary: "one cross-provider round; dispute, adjudicate, reanchor, step",
  },
  {
    // The cross-repository graph, one edge-set per repository. Not
    // extension-facing yet: session 47 assembles the union and gives the
    // Solution Explorer rows to render, and a verb advertised to a caller
    // before there is a view for it is a promise made early.
    verb: "deps",
    extensionFacing: false,
    summary: "what this repository takes from its solution, and what disagrees",
  },
  {
    // One VS Code window over the whole solution. Extension-facing: the
    // Solution Explorer offers it, and the file it writes is derived local
    // state that a developer should never have to author.
    verb: "workspace",
    extensionFacing: true,
    summary: "a VS Code workspace over every repository in this solution",
  },
  {
    // The one act that cannot be taken back, and the reason it is a verb at
    // all: the operator decides and the FRAMEWORK types. Not
    // extension-facing -- a button that publishes is a button somebody
    // presses to see what it does.
    verb: "release",
    extensionFacing: false,
    summary: "tag the release the operator authorised, router before extension",
  },
  {
    verb: "discovery",
    extensionFacing: false,
    summary: "what exists: enumerate a vendor, date the records, diff the roles",
  },
  {
    verb: "seat-cost",
    extensionFacing: false,
    summary: "what a Copilot seat spent, from its own session store",
  },
  {
    // The seat catalog's only writer. It is a verb rather than a library
    // call because the absence of one IS the incident this record's design
    // turns on: with no refresh command, hand-editing was the only remedy
    // for a stale lockfile and two people took it.
    verb: "copilot",
    extensionFacing: false,
    summary: "refresh the seat catalog: probe a named scope and merge it in",
  },
  {
    verb: "metrics",
    extensionFacing: false,
    summary: "per-call telemetry, gitignored and not the record",
  },
  {
    verb: "bootstrap",
    extensionFacing: true,
    summary: "set a project up: the managed guidance, the hook, the ignore rule",
  },
  {
    verb: "packaging",
    extensionFacing: false,
    summary: "pack, then push to the declared feed",
  },
  {
    verb: "workflow",
    extensionFacing: true,
    summary: "the six-step driver: enter, review, approve, test, suite, fix",
  },
  {
    // The operator's inbox. Extension-facing because the answer is a
    // decision, and a decision reserved to a person should not require a
    // terminal -- the Explorer renders these rows and the framework acts on
    // the answer.
    verb: "owed",
    extensionFacing: true,
    summary: "what the framework is waiting on a person for; list and answer",
  },
  {
    verb: "solution",
    extensionFacing: false,
    summary: "the solution view over a workspace's modules",
  },
  {
    verb: "contractdoc",
    extensionFacing: false,
    summary: "render a module's contract from its declaration",
  },
];

/** The verb by name, or undefined. */
export function findVerb(name: string): VerbSpec | undefined {
  return VERBS.find((spec) => spec.verb === name);
}
