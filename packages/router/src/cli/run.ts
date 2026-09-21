// The dispatcher: one verb, one handler, one table.
//
// Separate from `dabbler.ts` because that file RUNS a command line the
// moment it is loaded, and there are callers that want the dispatch without
// the process's argv -- the extension's `Router`, and a walkthrough running
// the framework's own long work in-process rather than paying for a child
// per job. Importing the entry to reach `run` would have run the test
// worker's argv as a verb.
//
// An unknown verb is a usage error with the list printed beside it, because
// the only thing left for it to be is a misspelling.

import { VERBS, findVerb } from "../contracts/verbs.ts";
import { EXIT_OK } from "../contracts/router.ts";
import { HANDLERS } from "./registry.ts";
import { writeErr, writeOut } from "./output.ts";

export const EXIT_USAGE = 2;

function usage(): string {
  const width = Math.max(...VERBS.map((spec) => spec.verb.length));
  const lines = VERBS.map(
    (spec) => `  ${spec.verb.padEnd(width)}  ${spec.summary}`,
  );
  return ["usage: dabbler <verb> [options]", "", ...lines, ""].join("\n");
}

export async function run(argv: readonly string[]): Promise<number> {
  const [name, ...rest] = argv;

  if (name === undefined || name === "--help" || name === "-h") {
    writeOut(usage());
    return name === undefined ? EXIT_USAGE : EXIT_OK;
  }
  // The flag every command answers, routed to the verb of the same name so
  // there is one answer to "which router is this".
  if (name === "--version" || name === "-V") return HANDLERS["version"]!(rest);

  const spec = findVerb(name);
  const handler = spec ? HANDLERS[spec.verb] : undefined;
  if (!handler) {
    writeErr(`dabbler: '${name}' is not a verb\n\n${usage()}`);
    return EXIT_USAGE;
  }

  return handler(rest);
}
