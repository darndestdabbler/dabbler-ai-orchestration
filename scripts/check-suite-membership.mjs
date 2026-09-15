#!/usr/bin/env node
// The split cannot drift from what is written down about it.
//
// Three things have to agree: `scripts/suite-membership.json`, which says
// which tests run on the host; the test tree, which says which tests exist;
// and `docs/design/suite-runners.md`, which says WHY each host-only test is
// there. A host-only entry naming a file that has been renamed away would
// otherwise leave that test running in the container, where it hangs, and the
// document would go on explaining a file nobody runs.
//
// It reads the runner's own `hostOnly()` and `allTests()` rather than
// re-deriving them, because two readings of which tests are where is exactly
// how a suite quietly stops proving something.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

import { allTests, hostOnly } from "./suite.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = "scripts/suite-membership.json";
const DOC = "docs/design/suite-runners.md";
const CONFIG = "dabbler.yaml";
const HOST_SUITE = "typescript-windows";
const CONTAINER_SUITE = "typescript";

const failures = [];
function refuse(message) {
  failures.push(message);
}

const manifest = JSON.parse(readFileSync(join(ROOT, MANIFEST), "utf8"));
const entries = Array.isArray(manifest.host_only) ? manifest.host_only : null;
if (entries === null) {
  refuse(`${MANIFEST}: host_only must be a list, even when it is empty.`);
}

const declared = [];
for (const [index, entry] of (entries ?? []).entries()) {
  const where = `${MANIFEST}: host_only[${index}]`;
  const file = typeof entry?.file === "string" ? entry.file : "";
  if (file === "") {
    refuse(`${where} names no file.`);
    continue;
  }
  declared.push(file);

  // A reason is the point of the manifest. A list of filenames with no reason
  // is a list nobody can audit: the next reader cannot tell a test that
  // proves Windows from a test somebody could not get working.
  const reason = typeof entry.reason === "string" ? entry.reason.trim() : "";
  if (reason === "") {
    refuse(`${where} (${file}) gives no reason for being on the host.`);
  }

  if (!existsSync(join(ROOT, file))) {
    refuse(
      `${where} names ${file}, which does not exist -- a renamed or deleted ` +
        "test leaves its entry behind, and the entry is what keeps the file " +
        "out of the container.",
    );
  }
}

const seen = new Set();
for (const file of declared) {
  if (seen.has(file)) refuse(`${MANIFEST}: ${file} is listed twice.`);
  seen.add(file);
}

// Claimed by exactly one door. The runner derives the container's set by
// subtraction, so the way this breaks is a host-only entry that is not a test
// file at all -- which would subtract nothing and run in both places.
const tests = new Set(allTests());
for (const file of declared) {
  if (!tests.has(file)) {
    refuse(
      `${MANIFEST}: ${file} is not one of the ${tests.size} test files under ` +
        "packages/router/test, so naming it here keeps nothing out of the container.",
    );
  }
}

// The document explains the split; a host-only file it does not mention is a
// split nobody can review.
const doc = existsSync(join(ROOT, DOC)) ? readFileSync(join(ROOT, DOC), "utf8") : null;
if (doc === null) {
  refuse(`${DOC} is missing: the split is declared there or it is not declared.`);
} else {
  for (const file of hostOnly()) {
    if (!doc.includes(file)) {
      refuse(`${DOC} does not name ${file}, which ${MANIFEST} keeps on the host.`);
    }
  }
}

// Both doors are declared, declared as the runner, and declared in the order
// that decides which of them owns a file.
const suites = parse(readFileSync(join(ROOT, CONFIG), "utf8"))?.testing?.suites ?? [];
const at = (name) => suites.findIndex((suite) => suite?.name === name);
const hostAt = at(HOST_SUITE);
const containerAt = at(CONTAINER_SUITE);

for (const [name, index, command] of [
  [HOST_SUITE, hostAt, "node scripts/suite.mjs host"],
  [CONTAINER_SUITE, containerAt, "node scripts/suite.mjs container"],
]) {
  if (index < 0) {
    refuse(`${CONFIG} no longer declares the suite '${name}'.`);
  } else if (suites[index].command !== command) {
    refuse(`${CONFIG}: the suite '${name}' no longer runs '${command}'.`);
  }
}

if (hostAt >= 0 && containerAt >= 0) {
  // The order is the ownership. `scopeForTest` gives a test file to the FIRST
  // declared suite whose root and glob match it, and both doors name the same
  // root -- so with the container first, it would claim the host's file, the
  // runner would decline it as not its own, and no targeted command would run
  // it anywhere.
  if (hostAt > containerAt) {
    refuse(
      `${CONFIG}: '${HOST_SUITE}' must be declared before '${CONTAINER_SUITE}'. ` +
        "Both name the same test_roots, and the first declared suite that " +
        `matches owns the file -- declared second, ${HOST_SUITE} owns nothing ` +
        "and its tests are selected for a runner that will not run them.",
    );
  }

  // The glob is the second statement of what the manifest says, and this is
  // what keeps them one fact. A glob matches a basename, so it can name one
  // file exactly; the day the manifest holds two, this refuses rather than
  // silently covering the first.
  const glob = String(suites[hostAt].test_glob ?? "");
  const basenames = [...new Set(declared.map((file) => file.slice(file.lastIndexOf("/") + 1)))];
  if (basenames.length !== 1) {
    refuse(
      `${CONFIG}: '${HOST_SUITE}' selects by a single test_glob, which names one ` +
        `file; ${MANIFEST} now holds ${basenames.length}. Give the host-only ` +
        "tests a directory of their own and point test_roots at it, so the " +
        "declaration can say what the manifest says.",
    );
  } else if (glob !== basenames[0]) {
    refuse(
      `${CONFIG}: '${HOST_SUITE}' selects '${glob}' but ${MANIFEST} keeps ` +
        `'${basenames[0]}' on the host. A file the manifest names and the glob ` +
        "does not is selected for the container, which declines it, and it runs nowhere.",
    );
  }
}

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`suite-membership: ${failure}\n`);
  process.exit(1);
}

process.stdout.write(
  `suite-membership: ${tests.size} test files, ${declared.length} on the host, ` +
    `${tests.size - declared.length} in the container; ${MANIFEST}, the tree and ${DOC} agree.\n`,
);
