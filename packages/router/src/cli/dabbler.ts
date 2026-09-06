// `dabbler <verb> …` — the engine-facing command, and the same verbs the
// extension reaches through `Router`.
//
// One dispatcher over one table. An unknown verb is a usage error with the
// list printed beside it, because the only thing left for it to be is a
// misspelling.

import { VERBS, findVerb } from "../contracts/verbs.ts";
import { EXIT_OK } from "../contracts/router.ts";
import { HANDLERS } from "./registry.ts";
import { writeErr, writeOut } from "./output.ts";

const EXIT_USAGE = 2;

function usage(): string {
  const width = Math.max(...VERBS.map((spec) => spec.verb.length));
  const lines = VERBS.map(
    (spec) => `  ${spec.verb.padEnd(width)}  ${spec.summary}`,
  );
  return ["usage: dabbler <verb> [options]", "", ...lines, ""].join("\n");
}

export async function run(argv: string[]): Promise<number> {
  const [name, ...rest] = argv;

  if (name === undefined || name === "--help" || name === "-h") {
    writeOut(usage());
    return name === undefined ? EXIT_USAGE : EXIT_OK;
  }

  const spec = findVerb(name);
  const handler = spec ? HANDLERS[spec.verb] : undefined;
  if (!handler) {
    writeErr(`dabbler: '${name}' is not a verb\n\n${usage()}`);
    return EXIT_USAGE;
  }

  return handler(rest);
}

// Not top-level `await`: this file is bundled to CommonJS for the
// extension host, and CommonJS has no such thing.
run(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    writeErr(`dabbler: ${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  },
);
