// The one place the extension decides WHICH router it is talking to.
//
// Every caller takes a `Router` (or a `RouterCommands`) as a parameter and
// defaults it from here. That is what made the cutover a change to this
// file rather than to six: before the seam existed, each command
// default-constructed its own implementation, so the choice was restated
// once per command — six places to find, and six chances to miss one.
//
// **The rule this directory states.** `src/router/` is where the extension
// meets the router and nowhere else does: `host` chooses it, `commandLog`
// shows the developer what it ran, `terminalShim` puts the same verbs on
// the integrated terminal's PATH. There is no spawn here any more, and no
// interpreter to find — the router is a Node library and the extension
// host is a Node process, so a verb is a function call.

import {
  createInProcessRouter,
  commandLineFor,
  type Router,
  type RouterResult,
} from "dabbler-ai-router";
import { commandLog } from "./commandLog";

/**
 * The half of an answer a caller reports: a refusal, a failed write, or a
 * failure. Derived from the contract, so it is the same type whichever
 * router produced it — which is why it lives here and not beside one
 * implementation.
 */
export type RouterRefusal = Extract<RouterResult<never>, { ok: false }>;

/**
 * What a caller needs when the OPERATOR runs a verb rather than the
 * extension: a line they can read, adjust and press Enter on.
 *
 * It is separate from `Router` on purpose. `Router` is about answers, and
 * a line to pre-type is not an answer — it is what the extension offers
 * instead of taking an action the operator should take themselves. A
 * router with nothing to pre-type says so by returning null, and the
 * caller shows the operator something else.
 */
export interface RouterCommands {
  /**
   * A copy-pasteable line that runs one verb in *cwd*, or null when this
   * router has no command line for it.
   */
  commandLine(verb: string, args: readonly string[], cwd: string): string | null;
}

/**
 * **Settled at the cutover.** Start and Close are still PRE-TYPED into a
 * terminal rather than executed: `session start` needs an engine the
 * operator chooses, and `session close` runs gates they should watch. The
 * question the seam left open was what those two become for a router with
 * no command line — and the answer is that this one has one after all.
 * `terminalShim` puts `dabbler` on the integrated terminal's PATH from the
 * extension's own Node, so the line is real, runnable, and the same verb
 * the extension itself would call.
 *
 * The working directory is not in the line. The terminal is opened at the
 * repository root, and the router derives the sessions root from where it
 * is standing — the same derivation every other invocation gets.
 */
const commands: RouterCommands = {
  commandLine: (verb, args) => commandLineFor(verb, args),
};

/** The router every production caller talks to, and its command lines. */
const production = createInProcessRouter({ echo: commandLog() });

export function productionRouter(): Router {
  return production;
}

export function productionCommands(): RouterCommands {
  return commands;
}
