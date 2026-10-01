#!/usr/bin/env node
// The rule that holds a gate to the suite it stands for, proved against
// canned inputs.
//
// `check-ci-suites.mjs` is what runs it over this repository's own files, and
// this is what stops that rule from quietly accepting everything -- the very
// defect it exists to catch. Session 154's incident is the shape: the
// extension suite was declared as one runner and gated on another, the gate
// was red for eleven consecutive runs, and three sessions closed VERIFIED
// over it because nothing compared the two. A rule nothing has ever seen
// REFUSE is a rule nobody has checked.
//
// Canned data rather than fixture files: `doorFailures` reads nothing, so
// what it is given is exactly what it judged.

import { doorFailures, workflowCommands } from "../packages/router/scripts/check-ci-suites.mjs";

const failures = [];

/** @param {boolean} ok @param {string} what */
function expect(ok, what) {
  if (!ok) failures.push(what);
}

const RUNNER = "node tools/x/scripts/run-unit.mjs";
const NPM_DOOR = "npm run test:unit";
const suites = [{ name: "extension", command: RUNNER, expensive: true }];
const ran = [{ command: NPM_DOOR, where: ".github/workflows/test.yml (extension)" }];

// 1. The incident itself: the framework runs one door, the gate runs another,
//    and nothing says why.
expect(
  doorFailures(suites, [{ suite: "extension", workflow_command: NPM_DOOR }], ran).length === 1,
  "an undeclared difference between the declared command and the gate's was accepted",
);

// 2. A difference that IS declared is legal. Session 153 left one behind on
//    purpose -- a container locally, windows-latest in CI, because that is
//    what proves the platform -- so a check that forbade every divergence
//    would have been deleted by the next session that needed one.
expect(
  doorFailures(
    suites,
    [{ suite: "extension", workflow_command: NPM_DOOR, reason: "CI proves the door a person copies" }],
    ran,
  ).length === 0,
  "a declared, reasoned divergence was refused",
);

// 3. And the excuse must not outlive the difference. A reason for a command
//    no workflow runs is a reason for something that is not happening.
expect(
  doorFailures(
    suites,
    [{ suite: "extension", workflow_command: "npm run test:gone", reason: "stale" }],
    ran,
  ).some((failure) => failure.includes("which no workflow step runs")),
  "a declared divergence no workflow runs was accepted",
);

// 4. An expensive suite no gate is declared to run at all. This is the wider
//    form of the same defect: not a gate reading the wrong door, but a suite
//    with no gate over it.
expect(
  doorFailures(suites, [], ran).some((failure) => failure.includes("no workflow is declared to run it")),
  "an expensive suite with no declared gate was accepted",
);

// 5. A reason where the two commands are identical excuses nothing, and a
//    reason that excuses nothing is the start of a reason nobody reads.
expect(
  doorFailures(
    [{ name: "extension", command: NPM_DOOR, expensive: true }],
    [{ suite: "extension", workflow_command: NPM_DOOR, reason: "because" }],
    ran,
  ).length === 1,
  "a reason was accepted where there is no difference to excuse",
);

// 6. A declaration for a suite dabbler.yaml does not declare: the manifest
//    may not invent the thing it is excusing.
expect(
  doorFailures(suites, [{ suite: "ghost", workflow_command: NPM_DOOR }], ran).some((failure) =>
    failure.includes("which dabbler.yaml does not declare"),
  ),
  "a declaration for an undeclared suite was accepted",
);

// And the reading that feeds it: a step's `run` is a command wherever it sits
// in the workflow, and a folded block is several.
const parsed = workflowCommands(["t.yml"], () => "jobs:\n  a:\n    steps:\n      - run: |\n          npm ci\n          npm run test:unit\n      - uses: actions/checkout@v4\n");
expect(
  parsed.length === 2 && parsed[1].command === "npm run test:unit",
  "a folded run block was not read as the commands it runs",
);

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`ci-divergence: ${failure}\n`);
  process.exit(1);
}

process.stdout.write(
  "ci-divergence: an undeclared difference between a gate and its suite is refused, " +
    "a declared one is accepted, and an excuse no workflow needs is refused.\n",
);
