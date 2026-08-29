// The one place the extension decides WHICH router it is talking to.
//
// Every caller takes a `Router` (or a `RouterCommands`) as a parameter and
// defaults it from here, so the name `PythonSpawnRouter` appears in
// exactly two files: the implementation, and this one. Session 35 changes
// the line below and nothing else.
//
// Before this existed each command default-constructed its own
// implementation. That still isolated the callers from Python's argv, but
// it left the choice of implementation restated once per command — six
// places to find, and six chances to miss one.
//
// **The rule this directory states.** Everything in `src/router/` is the
// Python implementation and its transport: `pythonSpawnRouter` builds the
// argv, `routerCli` runs it and shows it, `pythonInterpreter` finds the
// interpreter, `projectionPayload` narrows what comes back. Nothing
// outside imports any of them — callers import this file, and get an
// interface. The one deliberate exception is `commands/bootstrapProject`,
// the first-run path: it creates a venv and pip-installs the router, so
// it runs BEFORE there is a router to ask and has to know what it is
// installing. When the router stops being Python, this directory is what
// changes, and that exception is the one other place to look.

import type { Router, RouterResult } from "dabbler-ai-router";
import { PythonSpawnRouter } from "./pythonSpawnRouter";

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
 * a router that answers in-process has no command line to offer — which
 * is why this is the extension's own interface and not an addition to the
 * contract. A router with nothing to pre-type says so by returning null,
 * and the caller shows the operator something else.
 */
export interface RouterCommands {
  /**
   * A copy-pasteable line that runs one verb in *cwd*, or null when this
   * router has no command line for it.
   */
  commandLine(verb: string, args: readonly string[], cwd: string): string | null;
}

/**
 * **Owed to session 35.** Start and Close are pre-typed into a terminal
 * rather than executed, because `session start` needs an engine the
 * OPERATOR chooses and `session close` runs gates they should watch. An
 * in-process router has no line to pre-type, so what those two commands
 * become is a UX decision that session makes — not one this seam can take
 * on its behalf. Until then a router with no command line says so out
 * loud; it does not quietly do nothing.
 */

/** The router every production caller talks to, and its command lines. */
const production = new PythonSpawnRouter();

export function productionRouter(): Router {
  return production;
}

export function productionCommands(): RouterCommands {
  return production;
}
