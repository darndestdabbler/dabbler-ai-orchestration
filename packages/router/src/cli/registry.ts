// Which verbs the `dabbler` command can actually run.
//
// A verb is available when a handler is registered here, not when a
// constant says the port has reached its session. There is nothing to
// bump: porting a module adds its handler, and every reader -- the CLI,
// the parity control -- sees the same fact at the same moment.

/** argv after the verb; the process's exit code comes back. */
export type VerbHandler = (argv: string[]) => Promise<number>;

/**
 * Empty until session 25 lands the first module. `VERBS` in
 * `../contracts/verbs.ts` is the full list; a verb declared there and
 * absent here is announced and refused, which is what "not yet" looks
 * like from a command line.
 */
export const HANDLERS: Readonly<Record<string, VerbHandler>> = {};

export function isImplemented(verb: string): boolean {
  return Object.prototype.hasOwnProperty.call(HANDLERS, verb);
}
