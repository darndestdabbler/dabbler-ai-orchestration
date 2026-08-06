// Set 110 S1 — REAL Extension Development Host startup baseline.
//
// Operator-authorized after verification rounds 5 and 6 both rejected
// stub-based activation figures, and a third-provider adjudication upheld
// them. The objection, restated fairly: every prior harness ran Node with
// `src/test/vscode-stub.js` and never launched VS Code, so Electron spawn, the
// extension-host bootstrap, the real vscode API and IPC were all excluded —
// which is exactly the surface a webview->TreeView migration changes.
//
// This launches the SHIPPING extension in a real Extension Development Host,
// three times cold (fresh user-data-dir and extensions-dir per run), and
// measures wall clock to the first tree row actually being visible.
//
// The number is deliberately END-TO-END rather than per-bucket. In a real host
// the buckets are not independently observable without instrumenting the
// product, which this session may not do (it ships no product code). What it
// gives is the thing S4 actually needs: a real-host BEFORE baseline measured
// the same way S4 will measure the native tree AFTER.
//
// Set 110 Session 3 — RETARGETED, and this is the point of keeping the file.
//
// It measured the WEBVIEW's cold launch-to-first-row, which was Session 1's
// before-number (5,102 ms view-open to first visible row). That surface is
// deleted, so the spec could not keep measuring it — the full-suite run
// failed here, which is the harness doing its job.
//
// It now measures the NATIVE tree through the SAME protocol: real Extension
// Development Host, shipping build, fresh profile per rep, natural cold paint
// with NO forced refresh, same scales, median of the reps. That is precisely
// what Session 4's sub-second startup gate needs, and measuring it any other
// way would invalidate the comparison.
//
// Session 1's committed artifact is NOT touched. It is the before-number and
// stays exactly as measured; the tracked write here remains opt-in behind
// `DABBLER_WRITE_EVIDENCE=1`, and it now writes an AFTER file rather than
// overwriting the BEFORE one.
//
// Run: npx playwright test src/test/playwright/real-host-baseline.spec.ts
// Writes (opt-in): docs/session-sets/110-work-explorer-native-treeview/s3-native-tree-baseline.json

import { expect, test } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import {
  cleanupTmpDir,
  closeVSCode,
  launchVSCode,
  LaunchedVSCode,
  makeAdditionalSets,
  makeSet,
  makeTmpDir,
  openWorkExplorerTree,
  treeRow,
} from "./electronLaunch";

const REPS = 2;
// The spec's step 3 asks for the four scales. 0 is covered by the host-pipeline
// harness (an empty tree has no row to wait for, so there is nothing for a
// first-paint probe to observe); these are the populated scales.
const SCALES = [10, 100, 500];
const OUT = path.resolve(
  __dirname,
  "../../../../..",
  "docs/session-sets/110-work-explorer-native-treeview/s3-native-tree-baseline.json",
);

interface Sample {
  scale: number;
  rep: number;
  /** Electron spawn + host bootstrap + activation + view open + first paint. */
  launchToFirstRowMs: number;
  /** View click -> first row visible. THE number the S4 gate is stated against. */
  viewOpenToFirstRowMs: number;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Two earlier attempts failed and the cause was mine, not the harness's:
// `launchVSCode(tmpPath)` opened the tmp PARENT directory rather than the
// fixture's repo root, so VS Code opened a workspace with no session sets in
// it and the tree correctly painted nothing. The passing specs pass
// `handle.repo_root`. Fixed, and the row wait now mirrors
// `session-sets-tree.spec.ts` — the tree test id, then a SPECIFIC data-slug.
test.describe("Set 110 S1 — real Extension Development Host baseline", () => {
  test.describe.configure({ timeout: 900_000 });

  test("measures cold launch-to-first-row for the shipping native tree", async () => {
    const samples: Sample[] = [];

    for (const scale of SCALES) {
    for (let rep = 1; rep <= REPS; rep++) {
      const tmpPath = makeTmpDir("dabbler-110-realhost");
      let launch: LaunchedVSCode | undefined;
      try {
        let handle = makeSet(tmpPath, "001-real-host-baseline", 4);
        handle = makeAdditionalSets(
          handle,
          scale - 1,
          "real-host-baseline-",
          2,
          4,
        );

        const tLaunch = Date.now();
        // launchVSCode must open the fixture's REPO ROOT, not the tmp parent.
        // Passing tmpPath opened a workspace containing no session sets, which
        // is why attempt 2 waited 60 s for a row that could never exist.
        launch = await launchVSCode(handle.repo_root);

        const tOpen = Date.now();
        const pane = await openWorkExplorerTree(launch.page);
        // NO triggerRefresh. The passing specs use it for DETERMINISM, but
        // forcing a refresh would measure a refresh, not a first paint — the
        // artifact said as much, and it is also the step that flaked in 3 of 4
        // earlier attempts (the command palette failing to open). Waiting for
        // the view's NATURAL paint is both the more correct measurement and the
        // one that does not depend on driving VS Code's command palette.

        // The first MODULE row is the first visible row of the native tree —
        // the tree is lazy, so set rows do not exist until a module is
        // expanded, and waiting for one would measure an interaction rather
        // than a paint. `openWorkExplorerTree` already waited for the first
        // row; this re-asserts it explicitly so a future edit to the helper
        // cannot silently change what is being timed.
        await expect(treeRow(pane, "Default")).toBeVisible({ timeout: 120_000 });
        const tRow = Date.now();

        samples.push({
          scale,
          rep,
          launchToFirstRowMs: tRow - tLaunch,
          viewOpenToFirstRowMs: tRow - tOpen,
        });
      } finally {
        if (launch) await closeVSCode(launch);
        cleanupTmpDir(tmpPath);
      }
    }
    }

    const payload = {
      generatedBy:
        "src/test/playwright/real-host-baseline.spec.ts (Set 110 S1, operator-authorized " +
        "after rounds 5 and 6 rejected stub figures)",
      what:
        "REAL VS Code Extension Development Host, shipping extension, fresh profile per " +
        "rep. Includes Electron spawn, extension-host bootstrap, real vscode API, IPC, " +
        "activation, and the native TreeView's first getChildren + paint. Set 110 S3: this " +
        "is the AFTER measurement; the BEFORE (the deleted webview) is s1-real-host-baseline.json " +
        "and is not overwritten.",
      whyEndToEnd:
        "The individual buckets are not independently observable in a real host without " +
        "instrumenting the product. Session 2 added utils/startupTiming.ts for the host-side " +
        "buckets (DABBLER_STARTUP_TIMING_PATH); first paint stays a DOM observation because " +
        "the host cannot see when a row becomes visible.",
      naturalPaint:
        "NO refresh command is issued. This is the view's natural cold paint after the " +
        "extension's own scan completes, which is the honest first-paint number. This is " +
        "the SAME protocol s1-real-host-baseline.json used, which is what makes the " +
        "before/after comparison valid. Do not add a refresh.",
      fixture: "N session sets x 4 sessions, at each scale below",
      scales: SCALES,
      reps: REPS,
      perScale: SCALES.map((sc) => {
        const rows = samples.filter((x) => x.scale === sc);
        return {
          sets: sc,
          launchToFirstRowMs: rows.length ? median(rows.map((x) => x.launchToFirstRowMs)) : null,
          viewOpenToFirstRowMs: rows.length ? median(rows.map((x) => x.viewOpenToFirstRowMs)) : null,
        };
      }),
      samples,
    };

    // Set 110 S2: writing the tracked artifact is OPT-IN, and S3 keeps it
    // that way even though the output file changed.
    //
    // This spec is part of the standing Layer 3 suite, so every full run
    // re-measured and OVERWROTE `s1-real-host-baseline.json` — Session
    // 1's committed measurement of record, quoted by
    // `s1-migration-decision.md` and by the operator's Session 4 startup
    // gate. A later session silently rewriting a prior session's recorded
    // evidence is the wrong default no matter how close the numbers land
    // (S2's re-run agreed with S1 to within ~2%, which is beside the
    // point). The measurement still runs and is still printed; only the
    // write to the tracked file is gated.
    const writeTracked = process.env.DABBLER_WRITE_EVIDENCE === "1";
    if (writeTracked) {
      fs.mkdirSync(path.dirname(OUT), { recursive: true });
      fs.writeFileSync(OUT, JSON.stringify(payload, null, 2), "utf8");
    }

    // eslint-disable-next-line no-console
    const lines = payload.perScale.map(
      (r) =>
        `  ${String(r.sets).padStart(4)} sets: launch->row ${r.launchToFirstRowMs} ms, ` +
        `viewopen->row ${r.viewOpenToFirstRowMs} ms`,
    );
    console.log(
      [
        "",
        "[110 S1] REAL HOST, per scale:",
        ...lines,
        writeTracked
          ? `[110 S1] wrote ${OUT}`
          : `[110 S1] measured only — set DABBLER_WRITE_EVIDENCE=1 to update ${OUT}`,
        "",
      ].join(
        "\n",
      ),
    );

    // One sample per (scale, rep). Asserting REPS here was a leftover from the
    // single-scale version and failed the spec AFTER the measurements and the
    // artifact had already been written.
    expect(samples).toHaveLength(SCALES.length * REPS);
    for (const r of payload.perScale) {
      expect(r.viewOpenToFirstRowMs).toBeGreaterThan(0);
    }
  });
});
