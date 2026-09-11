#!/usr/bin/env node
// The guard that makes a cancelled test fail, proved against a canned run.
//
// `node --test` counts a cancelled test outside `# fail`, so a file whose
// tests hang reports `# fail 0` and a runner reading the failure count calls
// it green. The guard in `scripts/suite.mjs` is what stops that; this is what
// stops the guard from failing silently, which is the very defect it exists
// to catch. The stream below is the shape node really emits -- a clean pass,
// then a test cancelled by its parent, then a summary claiming no failures.

import { announceCancelled, cancelledCount, scanCancelled, verdict } from "./suite.mjs";

const CANCELLED_RUN = `TAP version 13
# Subtest: dispatching one turn through the seat
    # Subtest: parses the content, the tokens and the conversation id
    ok 1 - parses the content, the tokens and the conversation id
      ---
      duration_ms: 4.02234
      type: 'test'
      ...
    # Subtest: classifies a spawn that never returns as a spawn timeout
    not ok 2 - classifies a spawn that never returns as a spawn timeout
      ---
      duration_ms: 0.9311
      type: 'test'
      location: '/repo/packages/router/test/copilot.test.ts:321:3'
      failureType: 'cancelledByParent'
      error: 'Promise resolution is still pending but the event loop has already resolved'
      code: 'ERR_TEST_FAILURE'
      ...
    1..2
not ok 1 - dispatching one turn through the seat
  ---
  duration_ms: 6.1
  type: 'suite'
  location: '/repo/packages/router/test/copilot.test.ts:119:1'
  failureType: 'cancelledByParent'
  ...
1..1
# tests 2
# suites 1
# pass 1
# fail 0
# cancelled 2
# skipped 0
# todo 0
`;

const CLEAN_RUN = `TAP version 13
# Subtest: a project on its first day
    ok 1 - writes the managed guidance
      ---
      duration_ms: 144.4
      type: 'test'
      ...
    1..1
ok 1 - a project on its first day
  ---
  duration_ms: 896.4
  type: 'suite'
  ...
1..1
# tests 1
# suites 1
# pass 1
# fail 0
# cancelled 0
# skipped 0
# todo 0
`;

const failures = [];
function expect(condition, what) {
  if (!condition) failures.push(what);
}

// The run the guard exists for: the child exited 0 and the summary says no
// failures, and it must still be a red run.
const cancelled = verdict(CANCELLED_RUN, 0);
expect(
  cancelled.status !== 0,
  "a run carrying a cancelled test was judged a pass; the child exited 0 and " +
    "`# fail 0` is exactly the claim the guard exists to refuse",
);
expect(
  cancelledCount(CANCELLED_RUN) === 2,
  `the summary said 'cancelled 2'; the guard read ${cancelledCount(CANCELLED_RUN)}`,
);

// Named, and by file: a red run with no name in it leaves the next reader
// exactly where the silent green left them.
const printed = [];
const wrote = process.stderr.write.bind(process.stderr);
process.stderr.write = (chunk) => {
  printed.push(String(chunk));
  return true;
};
try {
  announceCancelled(cancelled);
} finally {
  process.stderr.write = wrote;
}
const said = printed.join("");
expect(
  said.includes("classifies a spawn that never returns as a spawn timeout"),
  "the guard did not name the cancelled test in what it printed",
);
expect(
  said.includes("packages/router/test/copilot.test.ts"),
  "the guard did not name the file the cancelled test came from",
);
expect(
  /CANCELLED/.test(said),
  "the guard did not say that the tests were cancelled rather than failed",
);

// The suite entry is a consequence, not the thing that stopped being proved.
const scanned = scanCancelled(CANCELLED_RUN);
expect(
  scanned.some((entry) => entry.type === "test"),
  "the guard found no cancelled TEST, only the suite around it",
);

// And a clean run is left alone. A guard that reddened every run would be
// removed within a session, which is a guard that protects nothing.
const clean = verdict(CLEAN_RUN, 0);
expect(clean.status === 0, "a clean run was judged a failure");
expect(clean.cancelled.length === 0, "a clean run was read as carrying cancelled tests");
expect(verdict(CLEAN_RUN, 1).status === 1, "a failing clean run lost the child's own exit code");

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`cancelled-guard: ${failure}\n`);
  process.exit(1);
}

process.stdout.write(
  "cancelled-guard: a cancelled test fails the run, is named with its file, " +
    "and a clean run keeps the exit code it earned.\n",
);
