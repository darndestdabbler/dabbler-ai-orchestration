// Set 110 S4 round 7 — the SECOND creator of ai_router/local-overrides.yaml.
//
// Round 6 guaranteed the gitignore rule in `Dabbler: Set Up Copilot Seat`.
// Round 7 found the config editor creates the same file by a different door:
// `ConfigEditorPanel` builds an empty local-overrides document when none
// exists and writes it on Save. The section rendered directly above that
// editor tells the operator the file "is in `.gitignore` by design" and that
// values in it "never get pushed" — so creating it without the rule recreates
// the shared-state contamination round 6 was meant to close.
//
// WHY THIS IS A SOURCE-LEVEL PIN, following the precedent
// `costDashboardGate.test.ts` sets for exactly this shape: driving
// `ConfigEditorPanel._handleSave` needs a real webview panel and a live
// workspace, which is Layer 3 territory and disproportionate for a
// call-ordering invariant. What must never regress is structural — a writer of
// this file that does not first guarantee the rule — and that is decidable from
// the source. The BEHAVIOUR of the guarantee itself is unit-tested against a
// fake filesystem in copilotSeatSetup.test.ts; this pins that the config
// editor's write path is wired to it, and wired in the right order.

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";

const EXTENSION_ROOT = process.env.DABBLER_EXTENSION_ROOT ?? process.cwd();
const PANEL_TS = path.join(
  EXTENSION_ROOT,
  "src",
  "configEditor",
  "ConfigEditorPanel.ts",
);

const source = fs.readFileSync(PANEL_TS, "utf-8");

suite("Set 110 S4 — the config editor guarantees the local-overrides ignore", () => {
  test("the panel actually calls the guarantee", () => {
    assert.ok(
      source.includes("ensureLocalOverridesIgnored("),
      "ConfigEditorPanel.ts must call ensureLocalOverridesIgnored before it " +
        "writes ai_router/local-overrides.yaml — see round 7.",
    );
  });

  test("the guarantee precedes every local-overrides write in the save path", () => {
    // Ordering is the invariant, not mere presence: a guarantee that runs
    // AFTER the write leaves a window in which the file exists un-ignored,
    // and that window is one `git add -A` away from committing machine-local
    // router state.
    const writeIdx = source.indexOf('writeAtomic("local-overrides.yaml"');
    assert.ok(
      writeIdx >= 0,
      "expected a writeAtomic(\"local-overrides.yaml\", ...) call to pin",
    );
    const guaranteeIdx = source.lastIndexOf(
      "ensureLocalOverridesIgnored(",
      writeIdx,
    );
    assert.ok(
      guaranteeIdx >= 0,
      "the local-overrides write is not preceded by ensureLocalOverridesIgnored",
    );
    // And they must be in the same neighbourhood, not merely both present
    // somewhere in a 900-line file.
    const between = source.slice(guaranteeIdx, writeIdx);
    assert.ok(
      between.split("\n").length < 40,
      "the guarantee is too far from the write to be guarding it " +
        `(${between.split("\n").length} lines apart)`,
    );
  });

  test("a failed guarantee is surfaced rather than swallowed", () => {
    // The UI's promise is either kept or withdrawn; it is never repeated while
    // false. If the rule cannot be written the operator has to be told, in the
    // same breath as the save.
    assert.ok(
      /ignored\.ok/.test(source),
      "the panel must branch on the guarantee's result",
    );
    assert.ok(
      /showWarningMessage[\s\S]{0,400}git-ignored/.test(source),
      "a failed ignore guarantee must raise a warning naming the problem",
    );
  });
});
