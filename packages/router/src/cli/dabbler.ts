// `dabbler <verb> …` — the engine-facing command, and the same verbs the
// extension reaches through `Router`.
//
// The entry, and only the entry: loading this file RUNS the process's argv,
// so the dispatch itself lives in `run.ts` where an in-process caller can
// reach it without a command line being executed as a side effect.

import { run } from "./run.ts";
import { writeErr } from "./output.ts";

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
