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
    summary: "start, declare, drive, interrupt, report, decision, close, cancel, restore",
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
    summary: "create and show the modules of a workspace",
  },
  {
    // The things done TO one module, beside the manifest they are declared
    // in: its designed seam, its package and its focused checkout now -- the
    // extension's Open Module reaches `open` -- and its grants as the block
    // adds them.
    verb: "module",
    extensionFacing: true,
    summary: "one module: scaffold its designed contract, pack its committed package, open its focused checkout",
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
    // The cross-repository graph, one edge-set per repository. Extension-
    // facing since session 69, and only for the three verbs that WRITE:
    // `locate`, `clone` and `scaffold` are what an Explorer row offers when
    // a producing repository is not on this machine, and the alternative
    // was the extension editing a tracked declaration itself.
    verb: "deps",
    extensionFacing: true,
    summary:
      "what this repository takes from its solution, what disagrees, and where " +
      "each producing repository is",
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
    // A measuring instrument, not a lifecycle verb: the one caller of the
    // engine interface in `acp.ts`, which no phase, gate or record reads
    // yet. Not extension-facing -- it spends a turn on an agent, and a
    // button that spends one is a button somebody presses to see what it
    // does.
    verb: "agent",
    extensionFacing: false,
    summary: "one turn against an agent over its own protocol: prompt, events, cancel, resume by id",
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
    // The operator's inbox. Extension-facing because the answer is a
    // decision, and a decision reserved to a person should not require a
    // terminal -- the Explorer renders these rows and the framework acts on
    // the answer.
    verb: "owed",
    extensionFacing: true,
    summary: "what the framework is waiting on a person for; list and answer",
  },
  {
    // The second opinion on a stopped session, and the one verb both modes
    // call: an attended engine when it is stuck, the unattended loop on a
    // deadlock. Not extension-facing -- it spends a provider call, and a
    // button that spends one is a button somebody presses to see what it
    // does.
    verb: "triage",
    extensionFacing: false,
    summary: "classify a stopped session on a provider that is not the engine's",
  },
  {
    // The git an operator would otherwise type by hand, after the framework
    // has told them their host answered "which branch is the trunk" for
    // them. The choice is a person's; the typing is not, and this is what
    // the engine runs once the person has answered. Not extension-facing:
    // nothing in the extension calls it, and a verb listed as one the
    // extension calls when it does not is the drift this table exists to
    // stop.
    verb: "repo",
    extensionFacing: false,
    summary: "this repository at its remote: set which branch is the trunk",
  },
  {
    // The pane's Configuration section is what calls it, which is why it is
    // extension-facing: an operator choosing a model clicks a row, and the
    // row's command is this verb. It stays typeable because the same choice
    // has to be makeable on a machine with no editor open.
    verb: "configure",
    extensionFacing: true,
    summary: "what the next session is run with: the transport, and the two models",
  },
  {
    verb: "contractdoc",
    extensionFacing: false,
    summary: "render a module's contract from its declaration",
  },
  {
    // The managed body tells an engine to report the version it ran; this
    // is what it runs. `dabbler --version` is the same handler.
    verb: "version",
    extensionFacing: false,
    summary: "the router's version, and the extension's when inside one",
  },
];

/** The verb by name, or undefined. */
export function findVerb(name: string): VerbSpec | undefined {
  return VERBS.find((spec) => spec.verb === name);
}
