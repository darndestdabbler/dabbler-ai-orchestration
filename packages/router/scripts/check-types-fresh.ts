// The staleness control (`testing.controls`, kind `typecheck`'s neighbour
// -- declared as part of the analyzer's family in `dabbler.yaml`).
//
// Exit 0 when every checked-in module is what the generator would write
// today; exit 1 naming each file that is not. There is no third answer:
// this control reads files and compares strings, so it cannot fail to run
// in a way `tsc` would not have caught first.

import { readSchemaSources, renderGenerated, readGenerated, staleFiles } from "../src/schema/emit.ts";

const expected = renderGenerated(readSchemaSources());
const stale = staleFiles(expected, readGenerated());

if (stale.length === 0) {
  process.stdout.write(
    `check:types: ${expected.size} generated module(s) match the schemas\n`,
  );
  process.exit(0);
}

for (const file of stale) {
  process.stderr.write(`  ${file.state.padEnd(10)} src/generated/${file.name}\n`);
}
process.stderr.write(
  `check:types: ${stale.length} generated module(s) no longer match the schemas. ` +
    `Run 'npm run generate:types'.\n`,
);
process.exit(1);
