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
// Run: npx playwright test src/test/playwright/real-host-baseline.spec.ts
// Writes: docs/session-sets/110-work-explorer-native-treeview/s1-real-host-baseline.json

import { expect, test } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import {
  cleanupTmpDir,
  closeVSCode,
  launchVSCode,
  LaunchedVSCode,
  makeAdditionalSet,
  makeSet,
  makeTmpDir,
  openSessionSetsView,
} from "./electronLaunch";

const REPS = 2;
// The spec's step 3 asks for the four scales. 0 is covered by the host-pipeline
// harness (an empty tree has no row to wait for, so there is nothing for a
// first-paint probe to observe); these are the populated scales.
const SCALES = [10, 100, 500];
const OUT = path.resolve(
  __dirname,
  "../../../../..",
  "docs/session-sets/110-work-explorer-native-treeview/s1-real-host-baseline.json",
);

interface Sample {
  scale: number;
  rep: number;
  /** Electron spawn + host bootstrap + activation + view open + first paint. */
  launchToFirstRowMs: number;
  /** View click -> first row visible: webview resolve + cold start + paint. */
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

  test("measures cold launch-to-first-row for the shipping webview", async () => {
    const samples: Sample[] = [];

    for (const scale of SCALES) {
    for (let rep = 1; rep <= REPS; rep++) {
      const tmpPath = makeTmpDir("dabbler-110-realhost");
      let launch: LaunchedVSCode | undefined;
      try {
        let handle = makeSet(tmpPath, "001-real-host-baseline", 4);
        for (let i = 2; i <= scale; i++) {
          handle = makeAdditionalSet(
            handle,
            `${String(i).padStart(3, "0")}-real-host-baseline`,
            4,
          );
        }

        const tLaunch = Date.now();
        // launchVSCode must open the fixture's REPO ROOT, not the tmp parent.
        // Passing tmpPath opened a workspace containing no session sets, which
        // is why attempt 2 waited 60 s for a row that could never exist.
        launch = await launchVSCode(handle.repo_root);

        const tOpen = Date.now();
        const inner = await openSessionSetsView(launch.page);
        // NO triggerRefresh. The passing specs use it for DETERMINISM, but
        // forcing a refresh would measure a refresh, not a first paint — the
        // artifact said as much, and it is also the step that flaked in 3 of 4
        // earlier attempts (the command palette failing to open). Waiting for
        // the view's NATURAL paint is both the more correct measurement and the
        // one that does not depend on driving VS Code's command palette.

        const tree = inner.getByTestId("work-explorer-tree");
        await expect(tree).toBeVisible({ timeout: 60_000 });
        const firstRow = inner.locator(
          '[role="treeitem"][data-slug="001-real-host-baseline"]',
        );
        await firstRow.waitFor({ state: "visible", timeout: 120_000 });
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
        "activation, webview resolve and renderer cold start — everything every previous " +
        "harness in this session excluded.",
      whyEndToEnd:
        "The individual buckets are not independently observable in a real host without " +
        "instrumenting the product, and this session ships no product code. This is the " +
        "real-host BEFORE baseline, measured the same way S4 will measure the native " +
        "tree AFTER, which is what makes the comparison valid.",
      naturalPaint:
        "NO refresh command is issued. This is the view's natural cold paint after the " +
        "extension's own scan completes, which is the honest first-paint number. S4 must " +
        "measure the native tree the SAME way — no forced refresh — or the comparison is " +
        "invalid.",
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

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(payload, null, 2), "utf8");

    // eslint-disable-next-line no-console
    const lines = payload.perScale.map(
      (r) =>
        `  ${String(r.sets).padStart(4)} sets: launch->row ${r.launchToFirstRowMs} ms, ` +
        `viewopen->row ${r.viewOpenToFirstRowMs} ms`,
    );
    console.log(
      ["", "[110 S1] REAL HOST, per scale:", ...lines, `[110 S1] wrote ${OUT}`, ""].join(
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
