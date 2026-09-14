// Mocha --require shim that points this suite's per-user records at a
// throwaway directory, so the suite cannot read the machine it runs on.
//
// The router keeps two files under this platform's per-user data directory:
// `ai-model-catalog.json`, which is what this machine's vendors and seat
// listed, and `preferences.json`, which is what this operator chose. The
// router's own suite says where they are through an import seam
// (`setCatalogPath`, `setPreferencesPath`). This suite cannot: it reaches
// the router through the package's published contract, which does not
// export the modules behind it. So it says so here, through the two
// environment variables those seams read.
//
// **Here rather than in either door.** The suite has two doors -- the
// package's own `test:unit`, which CI runs, and `scripts/run-unit.mjs`,
// which `dabbler.yaml` declares -- and this used to be armed in the runner
// alone. CI therefore ran the suite unarmed for eleven consecutive red
// runs, and before the spec that needed the variable existed, it ran
// against the operator's real catalog and would have passed on this machine
// while failing on anyone else's. Both doors reach this file through
// `.mocharc.json`, which is the one place the require list lives, so
// neither can drop the arming by being edited alone.
//
// A value the caller already set is left alone: a targeted run may point
// the suite at a fixture it prepared, and an arming that overwrote it would
// be arming against its own caller.

const { mkdtempSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

/**
 * One temp root for the whole run, made once when mocha loads this file.
 *
 * Per run rather than per test: these are the records a *machine* keeps, and
 * every spec that writes one writes the file it means to. A spec that needs
 * its own gets it by setting the variable itself, which this leaves alone.
 */
const root = mkdtempSync(join(tmpdir(), "dabbler-suite-"));

for (const [name, file] of [
  ["DABBLER_CATALOG_PATH", "ai-model-catalog.json"],
  ["DABBLER_PREFERENCES_PATH", "preferences.json"],
]) {
  const already = process.env[name];
  if (already !== undefined && already.trim() !== "") continue;
  process.env[name] = join(root, file);
}
