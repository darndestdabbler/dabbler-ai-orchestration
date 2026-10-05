// Whichever door ran this suite, it is armed.
//
// The router keeps two per-user files -- what this machine's vendors and
// seat listed, and what this operator chose -- and a suite that read either
// of them would pass on this machine and fail on the next, while a suite
// that WROTE one would be editing the operator's own record as a side
// effect of proving something else. `src/test/machine-state.js` points both
// at a throwaway directory, and `.mocharc.json` is how both doors reach it.
//
// This spec is the proof that the door in hand did it, and it is deliberately
// the whole of the proof for both: the framework runs `scripts/run-unit.mjs`
// and CI runs the package's own `test:unit`, so each door proves itself by
// running this. That is what was missing when CI ran the suite unarmed for
// eleven consecutive red runs -- not a variable, but anything at all that
// would have noticed.

import * as assert from "assert";
import * as os from "os";
import * as path from "path";

/** A path under the directory this platform hands out for throwaway files. */
function isThrowaway(value: string): boolean {
  const temp = path.resolve(os.tmpdir());
  const resolved = path.resolve(value);
  return resolved === temp || resolved.startsWith(temp + path.sep);
}

suite("machine state: the suite does not read the machine it runs on", () => {
  test("both per-user records are pointed somewhere throwaway, by whichever door ran this", () => {
    const catalog = process.env.DABBLER_CATALOG_PATH;
    const preferences = process.env.DABBLER_PREFERENCES_PATH;

    for (const [name, value] of [
      ["DABBLER_CATALOG_PATH", catalog],
      ["DABBLER_PREFERENCES_PATH", preferences],
    ] as const) {
      assert.ok(
        value !== undefined && value.trim() !== "",
        `${name} is unset: this door did not arm the suite, and a read through it ` +
          "would reach the operator's own record. The arming is " +
          "src/test/machine-state.js, required by .mocharc.json.",
      );
      assert.ok(
        isThrowaway(value),
        `${name} names ${value}, which is not under this platform's temp root. ` +
          "The suite's records are throwaway by construction; a real path here " +
          "means something outside the suite pointed it at a record that outlives it.",
      );
    }

    // Two records, not one file doing both jobs: the catalog is a reading
    // and is rebuildable for nothing, so a choice stored in it is a choice
    // the next free refresh wipes.
    assert.notStrictEqual(catalog, preferences);
  });
});
