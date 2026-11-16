#!/usr/bin/env node
// The suite's batching, proved over a short list with a canned run: one
// progress line per batch, in order, with the counts so far, and the run's
// status the worst batch's.

import { runBatches } from "./suite.mjs";

const tap = (pass, fail) => `TAP version 13\n# tests ${pass + fail}\n# pass ${pass}\n# fail ${fail}\n`;
const answers = [
  { status: 0, tap: tap(3, 0) },
  { status: 1, tap: tap(2, 1) },
  { status: 0, tap: tap(4, 0) },
];

const ran = [];
const said = [];
const status = await runBatches(
  ["a.test.ts", "b.test.ts", "c.test.ts", "d.test.ts", "e.test.ts"],
  async (batch) => {
    ran.push(batch.join(","));
    return answers[ran.length - 1];
  },
  2,
  (line) => said.push(line),
);

const failures = [];
const expect = (what, actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
};
expect("batches", ran, ["a.test.ts,b.test.ts", "c.test.ts,d.test.ts", "e.test.ts"]);
expect(
  "progress lines",
  said.map((line) => line.replace(/^dabbler \[\d\d:\d\d:\d\d\] /, "")),
  [
    "suite-batch files=2/5 passed=3 failed=0\n",
    "suite-batch files=4/5 passed=5 failed=1\n",
    "suite-batch files=5/5 passed=9 failed=1\n",
  ],
);
expect("every line in the router's format", said.every((line) => /^dabbler \[\d\d:\d\d:\d\d\] suite-batch /.test(line)), true);
expect("status", status, 1);

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`check-suite-batches: ${failure}\n`);
  process.exit(1);
}
process.stdout.write("check-suite-batches: one line per batch, the worst status kept\n");
