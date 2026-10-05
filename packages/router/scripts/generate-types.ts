// Write the generated types. One direction only: schemas in, modules out.
//
//     npm run generate:types        (from the workspace root)

import { writeGeneratedTypes } from "../src/schema/emit.ts";

const result = writeGeneratedTypes();
for (const path of result.written) process.stdout.write(`wrote ${path}\n`);
process.stdout.write(
  `generate-types: ${result.written.length} module(s) from ${result.sources} schema(s)\n`,
);
