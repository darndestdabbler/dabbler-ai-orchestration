// `dabbler <verb> …` — the engine-facing command, and the same verbs the
// extension reaches through `Router`.
//
// Until a verb's module is ported the command refuses it with the exit
// code every refusal uses (3) and says which session lands it. That is a
// different answer from "unknown verb", and the difference matters: an
// orchestrator reading the first should wait, and reading the second
// should check the spelling.

import { VERBS, findVerb } from "../contracts/verbs.ts";
import { EXIT_OK, EXIT_REFUSED } from "../contracts/router.ts";
import { HANDLERS, isImplemented } from "./registry.ts";

const EXIT_USAGE = 2;

function usage(): string {
  const width = Math.max(...VERBS.map((spec) => spec.verb.length));
  const lines = VERBS.map((spec) => {
    const state = isImplemented(spec.verb)
      ? ""
      : `  (not yet: session ${spec.portedInSession})`;
    return `  ${spec.verb.padEnd(width)}  ${spec.summary}${state}`;
  });
  return ["usage: dabbler <verb> [options]", "", ...lines, ""].join("\n");
}

export async function run(argv: string[]): Promise<number> {
  const [name, ...rest] = argv;

  if (name === undefined || name === "--help" || name === "-h") {
    process.stdout.write(usage());
    return name === undefined ? EXIT_USAGE : EXIT_OK;
  }

  const spec = findVerb(name);
  if (!spec) {
    process.stderr.write(`dabbler: '${name}' is not a verb\n\n${usage()}`);
    return EXIT_USAGE;
  }

  const handler = HANDLERS[spec.verb];
  if (!handler) {
    process.stderr.write(
      `dabbler ${spec.verb}: refused -- this verb is not ported yet. ` +
        `Session ${spec.portedInSession} of the port plan lands it; until ` +
        `then run 'python -m ${spec.pythonModule}'.\n`,
    );
    return EXIT_REFUSED;
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
    process.stderr.write(`dabbler: ${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  },
);
