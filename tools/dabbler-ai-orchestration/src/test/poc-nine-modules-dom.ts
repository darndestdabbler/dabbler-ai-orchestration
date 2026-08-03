// Set 108 Session 1, step 5 — the four nine-module findings asserted against
// RENDERED DOM, not against a payload.
//
// Why this exists. `poc-nine-modules-ondisk.ts` drives the product's own
// manifest parser, session-set discovery and grouping, and stops at
// `buildVisibleModulePayloads` — the object the host posts to the webview. A
// routed verification round objected, correctly, that claims phrased as
// "renders as nine flat sibling rows", "grouping is exactly one level deep" and
// "manifest order wins" are claims about *rendered rows*, and a payload-order
// assertion does not establish them: the client could in principle sort, nest,
// or filter.
//
// So this test carries the SAME payloads one stage further, into a real DOM:
// headless Chromium loads the shipping `media/session-sets-tree/client.js`
// verbatim, receives the real `rowsSnapshot` message over the real
// `window.postMessage` protocol, and the assertions are made against the tree
// the client actually builds — `role="treeitem"`, `aria-level`, and document
// order.
//
// Layer 3 (@playwright/test + Electron) is the fuller harness and is the right
// place for this long-term; it does not launch on this machine (a known
// residual). Chromium via `playwright` does launch — `media/render-mockup.mjs`
// already depends on it — so this closes the gap that can be closed here, and
// names the one it cannot: no VS Code, no extension host, no theming.
//
// Run:
//   npx mocha --require ts-node/register --require ./src/test/vscode-stub.js \
//             --ui tdd --timeout 180000 src/test/poc-nine-modules-dom.ts

import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { chromium, Browser, Page } from "playwright";
import {
  buildVisibleModulePayloads,
  computeVisibleModules,
} from "../providers/SessionSetsModel";
import { classifyModulesManifest } from "../utils/moduleAuthoring";
import { readSessionSets } from "../utils/fileSystem";
import { SessionSet } from "../types";

const MEMBERS = ["priya", "sam", "chen"];
const SERVICES = ["converter", "persistence", "watcher"];

const MEDIA_DIR = path.resolve(__dirname, "..", "..", "media", "session-sets-tree");

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface Declared {
  slug: string;
  title: string;
  codeRoot: string;
}

/** Member-major, per the S1 ruling R3. Owner-in-slug, per R1. */
function declare(): Declared[] {
  const out: Declared[] = [];
  for (const member of MEMBERS) {
    for (const service of SERVICES) {
      out.push({
        slug: `${member}-${service}`,
        title: `${cap(service)} (${cap(member)})`,
        codeRoot: `modules/${member}/${service}`,
      });
    }
  }
  return out;
}

function writeWorkspace(declared: readonly Declared[], withSets: boolean): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-108-dom-"));
  const lines = ["modules:"];
  for (const d of declared) {
    lines.push(`  - slug: ${d.slug}`);
    lines.push(`    title: ${d.title}`);
    lines.push(`    codeRoots: [${d.codeRoot}]`);
    lines.push(`    planPath: docs/modules/${d.slug}/project-plan.md`);
  }
  const manifest = path.join(root, "docs", "modules.yaml");
  fs.mkdirSync(path.dirname(manifest), { recursive: true });
  fs.writeFileSync(manifest, lines.join("\n") + "\n", { encoding: "utf8" });

  if (withSets) {
    for (const d of declared) {
      for (const suffix of ["plan", "decomposition", "build"]) {
        const dir = path.join(root, "docs", "session-sets", `${d.slug}-${suffix}`);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(
          path.join(dir, "spec.md"),
          [
            `# ${d.slug}-${suffix}`,
            "",
            "## Session Set Configuration",
            "",
            "```yaml",
            "tier: full",
            "requiresUAT: false",
            "requiresE2E: false",
            `module: ${d.slug}`,
            "```",
            "",
          ].join("\n"),
          { encoding: "utf8" },
        );
      }
    }
  }
  return root;
}

/**
 * The row payload is deliberately minimal. This test is about MODULE rows —
 * their count, their nesting depth and their order. Row internals (icons,
 * fractions, migration markers) are pinned by the existing suite and are not
 * what the four findings claim.
 */
function minimalRow(set: SessionSet): Record<string, unknown> {
  return {
    slug: set.name,
    name: set.name,
    state: set.state,
    fraction: "",
    fractionTooltip: "",
    description: "",
    contextValue: `sessionSet:${set.state}`,
    iconSlug: "not-started.svg",
    needsMigration: false,
    migrationMarker: "",
    migrationTooltip: "",
  };
}

function payloadsFor(root: string): unknown[] {
  const classification = classifyModulesManifest(root);
  const sets = readSessionSets(root);
  const modules = computeVisibleModules(classification, sets, {
    legacyRootPlanExists: false,
  });
  return buildVisibleModulePayloads(modules, minimalRow as never) as unknown[];
}

/**
 * A page hosting the SHIPPING webview scripts, in the same order the host
 * loads them. The ONLY stub is `acquireVsCodeApi` — everything that builds
 * markup is the shipped code, byte for byte off disk.
 */
function harnessHtml(): string {
  const read = (f: string) => fs.readFileSync(path.join(MEDIA_DIR, f), "utf8");
  const css = read("tree.css");
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head>
<body>
<div id="root"></div>
<script>
  window.__errors = [];
  window.addEventListener("error", function (e) { window.__errors.push(String(e.message)); });
  window.__posted = [];
  window.acquireVsCodeApi = function () {
    return {
      postMessage: function (m) { window.__posted.push(m); },
      getState: function () { return undefined; },
      setState: function () {},
    };
  };
</script>
<script>${read("gettingStartedHtml.js")}</script>
<script>${read("systemStatusHtml.js")}</script>
<script>${read("client.js")}</script>
</body></html>`;
}

async function renderInBrowser(page: Page, modules: unknown[]): Promise<void> {
  await page.setContent(harnessHtml(), { waitUntil: "load" });
  await page.evaluate((mods) => {
    // `window` here is the browser's, not Node's — typed loosely because this
    // file compiles under the Node lib, not the DOM lib.
    (globalThis as unknown as {
      postMessage: (m: unknown, o: string) => void;
    }).postMessage(
      {
        type: "rowsSnapshot",
        version: 1,
        scanState: "ready",
        payload: {
          // `mode: "list"` is what makes render() fall through to the tree
          // rather than the Getting Started form. Required on the snapshot
          // since Set 063.
          gettingStarted: { mode: "list" },
          systemStatus: { tier: "full", transportProfile: "api" },
          modules: mods,
        },
      },
      "*",
    );
  }, modules);
  try {
    await page.waitForSelector('[data-testid="work-explorer-tree"]', { timeout: 15_000 });
  } catch (err) {
    const errors = await page.evaluate(
      () => (globalThis as unknown as { __errors?: string[] }).__errors ?? [],
    );
    const html = await page.evaluate(
      () =>
        (globalThis as unknown as { document: { body: { innerHTML: string } } }).document.body
          .innerHTML,
    );
    throw new Error(
      `tree never rendered.\npage errors: ${JSON.stringify(errors)}\nbody: ${html.slice(0, 900)}`,
    );
  }
}

suite("Set 108 S1 — nine modules asserted against RENDERED DOM", function () {
  let browser: Browser;
  let page: Page;
  const created: string[] = [];

  suiteSetup(async function () {
    this.timeout(120_000);
    browser = await chromium.launch();
    page = await browser.newPage();
  });

  suiteTeardown(async function () {
    this.timeout(60_000);
    if (browser) await browser.close();
    for (const root of created) {
      try {
        fs.rmSync(root, { recursive: true, force: true });
      } catch {
        /* a temp dir that outlives the run is not a test failure */
      }
    }
  });

  test("finding 1 — the rendered tree contains exactly nine module rows, none warned", async () => {
    const declared = declare();
    const root = writeWorkspace(declared, true);
    created.push(root);
    await renderInBrowser(page, payloadsFor(root));

    const moduleRows = await page.$$('[role="treeitem"][aria-level="1"]');
    assert.strictEqual(moduleRows.length, 9, "nine module rows in the DOM");

    const kinds = await page.$$eval('[role="treeitem"][aria-level="1"]', (els) =>
      els.map((e) => e.getAttribute("data-module-kind")),
    );
    assert.ok(kinds.every((k) => k === "declared"), `all declared, got ${JSON.stringify(kinds)}`);

    const warnings = await page.$$('[role="treeitem"][aria-level="1"] .module-warning');
    assert.strictEqual(warnings.length, 0, "no module renders a warning glyph");

    const titles = await page.$$eval('[role="treeitem"][aria-level="1"]', (els) =>
      els.map((e) => (e.textContent || "").trim().split("\n")[0]),
    );
    console.log("\n" + "=".repeat(72));
    console.log("RENDERED DOM — nine module rows, from the shipping client.js");
    console.log("=".repeat(72));
    for (const t of titles) console.log("  " + t.replace(/\s+/g, " ").slice(0, 60));
  });

  test("finding 2 — the tree is exactly module > bucket > row; no module nests in a module", async () => {
    const declared = declare();
    const root = writeWorkspace(declared, true);
    created.push(root);
    await renderInBrowser(page, payloadsFor(root));

    // Every aria-level present in the rendered tree.
    const levels = await page.$$eval('[role="treeitem"]', (els) =>
      Array.from(new Set(els.map((e) => e.getAttribute("aria-level")))).sort(),
    );
    assert.deepStrictEqual(levels, ["1", "2", "3"], `expected exactly 3 levels, got ${levels}`);

    // The decisive assertion: no level-1 module row contains another level-1
    // module row. A per-member sub-tree would have to show up exactly here.
    const nested = await page.$$eval('[role="treeitem"][aria-level="1"]', (els) =>
      els.filter((e) => e.querySelector('[role="treeitem"][aria-level="1"]') !== null).length,
    );
    assert.strictEqual(nested, 0, "no module row may contain another module row");

    // And no member's name is itself a module row.
    const slugs = await page.$$eval('[role="treeitem"][aria-level="1"]', (els) =>
      els.map((e) => e.getAttribute("data-module-slug")),
    );
    for (const member of ["priya", "sam", "chen"]) {
      assert.ok(!slugs.includes(member), `${member} must not render as a module of its own`);
    }
  });

  test("finding 3 — rendered document order follows the manifest, and members stay contiguous", async () => {
    const declared = declare();
    const root = writeWorkspace(declared, true);
    created.push(root);
    await renderInBrowser(page, payloadsFor(root));

    const rendered = await page.$$eval('[role="treeitem"][aria-level="1"]', (els) =>
      els.map((e) => e.getAttribute("data-module-slug")),
    );
    assert.deepStrictEqual(
      rendered,
      declared.map((d) => d.slug),
      "rendered order must match manifest order",
    );

    const alphabetical = [...declared.map((d) => d.slug)].sort();
    assert.notDeepStrictEqual(
      rendered,
      alphabetical,
      "the fixture must distinguish manifest order from alphabetical, or this proves nothing",
    );

    for (const member of MEMBERS) {
      const positions: number[] = rendered
        .map((s: string | null, i: number) => ({
          i,
          mine: (s ?? "").startsWith(`${member}-`),
        }))
        .filter((x: { i: number; mine: boolean }) => x.mine)
        .map((x: { i: number; mine: boolean }) => x.i);
      assert.strictEqual(positions.length, 3, `${member} owns three rendered rows`);
      assert.strictEqual(
        positions[2] - positions[0],
        2,
        `${member}'s rows must be contiguous, got ${JSON.stringify(positions)}`,
      );
    }
  });

  test("finding 4 — day one renders nine module rows with no set rows and no warnings", async () => {
    const declared = declare();
    const root = writeWorkspace(declared, false);
    created.push(root);
    await renderInBrowser(page, payloadsFor(root));

    const moduleRows = await page.$$('[role="treeitem"][aria-level="1"]');
    assert.strictEqual(moduleRows.length, 9, "all nine still render with zero sets");

    const setRows = await page.$$('[role="treeitem"][aria-level="3"]');
    assert.strictEqual(setRows.length, 0, "no set rows exist yet");

    const warnings = await page.$$('[role="treeitem"][aria-level="1"] .module-warning');
    assert.strictEqual(warnings.length, 0, "empty is a healthy state, not a warning");

    console.log("\n" + "=".repeat(72));
    console.log("RENDERED DOM — day one: nine rows, nothing started, no warnings");
    console.log("=".repeat(72));
  });
});
