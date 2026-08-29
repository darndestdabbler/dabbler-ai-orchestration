// The `dabbler` command's verb list, and the session each verb is ported
// in. One table, two readers: the CLI dispatches on it, and the parity
// control uses `portedInSession` to decide what may be compared yet.
//
// A second copy of this list would be the drift the port exists to
// remove, so there is not one. Adding a verb here without porting its
// module is how a verb announces itself before it works: the CLI refuses
// it by name, which is a better answer than "unknown command".

/** The order the port runs in; see docs/sessions/session-plan.md. */
export interface VerbSpec {
  /** As typed: `dabbler session start`. */
  readonly verb: string;
  /** The Python module this replaces, for as long as both exist. */
  readonly pythonModule: string;
  /**
   * False when that module has no command line of its own today -- it is
   * reached as a library, or through another verb. The refusal says so
   * rather than naming a `python -m` that would fail.
   */
  readonly pythonCli?: false;
  /** The session of the port plan that makes this verb real. */
  readonly portedInSession: number;
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
    pythonModule: "ai_router.session",
    // Session 26 lands the four subcommands that WRITE the record --
    // `start`, `declare`, `log`, `decision` -- because the sanctioned
    // writers land there and a writer no verb reaches cannot be compared
    // (D171). The handler refuses `close`, `cancel`, `restore`, `plan` and
    // `migrate` by name until session 31 takes the lifecycle's judgment
    // half: the gates, the boundary reversals and the legacy migration.
    portedInSession: 26,
    extensionFacing: true,
    summary: "start, declare, log, decision, close, cancel, restore",
  },
  {
    verb: "progress",
    pythonModule: "ai_router.progress",
    portedInSession: 31,
    extensionFacing: true,
    summary: "the repository's projection, for a reader or for --json",
  },
  {
    verb: "modules",
    pythonModule: "ai_router.modules",
    portedInSession: 31,
    extensionFacing: true,
    summary: "list, create and retire the modules of a workspace",
  },
  {
    verb: "ledger",
    pythonModule: "ai_router.ledger",
    pythonCli: false,
    portedInSession: 26,
    extensionFacing: true,
    summary: "read the round ledger: the latest round, and the unresolved view",
  },
  {
    verb: "approved-plan",
    pythonModule: "ai_router.approved_plan",
    pythonCli: false,
    portedInSession: 32,
    extensionFacing: true,
    summary: "the session's approved plan, as the task level reads it",
  },
  {
    verb: "affected",
    pythonModule: "ai_router.affected",
    portedInSession: 27,
    extensionFacing: false,
    summary: "the tests this change makes necessary, and the command to run",
  },
  {
    verb: "test-evidence",
    pythonModule: "ai_router.test_evidence",
    portedInSession: 27,
    extensionFacing: false,
    summary: "record a test run as evidence",
  },
  {
    verb: "facts",
    pythonModule: "ai_router.facts",
    portedInSession: 32,
    extensionFacing: false,
    summary: "the deterministic controls, run and recorded",
  },
  {
    verb: "verify",
    pythonModule: "ai_router.verify",
    portedInSession: 33,
    extensionFacing: true,
    summary: "one cross-provider round; dispute, adjudicate, reanchor, step",
  },
  {
    verb: "discovery",
    pythonModule: "ai_router.discovery",
    portedInSession: 28,
    extensionFacing: false,
    summary: "what exists: enumerate a vendor, date the records, diff the roles",
  },
  {
    verb: "seat-cost",
    pythonModule: "ai_router.seat_cost",
    portedInSession: 30,
    extensionFacing: false,
    summary: "what a Copilot seat spent, from its own session store",
  },
  {
    // The seat catalog's only writer. It is a verb rather than a library
    // call because the absence of one IS the incident this record's design
    // turns on: with no refresh command, hand-editing was the only remedy
    // for a stale lockfile and two people took it. A cutover that left the
    // seat record unrefreshable from the router that dispatches off it
    // would recreate that exactly.
    verb: "copilot",
    pythonModule: "ai_router.transports.copilot",
    portedInSession: 30,
    extensionFacing: false,
    summary: "refresh the seat catalog: probe a named scope and merge it in",
  },
  {
    verb: "metrics",
    pythonModule: "ai_router.metrics",
    portedInSession: 25,
    extensionFacing: false,
    summary: "per-call telemetry, gitignored and not the record",
  },
  {
    verb: "bootstrap",
    pythonModule: "ai_router.bootstrap",
    portedInSession: 34,
    extensionFacing: true,
    summary: "set a project up: the managed guidance, the hook, the ignore rule",
  },
  {
    verb: "packaging",
    pythonModule: "ai_router.packaging",
    portedInSession: 34,
    extensionFacing: false,
    summary: "pack, then push to the declared feed",
  },
  {
    verb: "workflow",
    pythonModule: "ai_router.workflow",
    portedInSession: 35,
    extensionFacing: true,
    summary: "the six-step driver: enter, review, approve, test, suite, fix",
  },
  {
    verb: "solution",
    pythonModule: "ai_router.solution",
    portedInSession: 35,
    extensionFacing: false,
    summary: "the solution view over a workspace's modules",
  },
  {
    verb: "contractdoc",
    pythonModule: "ai_router.contractdoc",
    portedInSession: 35,
    extensionFacing: false,
    summary: "render a module's contract from its declaration",
  },
];

/** The verb by name, or undefined. */
export function findVerb(name: string): VerbSpec | undefined {
  return VERBS.find((spec) => spec.verb === name);
}
