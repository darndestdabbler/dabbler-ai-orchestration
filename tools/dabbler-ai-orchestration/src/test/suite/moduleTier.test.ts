// Set 087 Session 2 — the Explorer module tier (module → status-bucket
// → row). Covers the spec's Step-6 list and the routed rendering ruling
// (s2-explorer-render-architecture.json):
//   - groupByModule: pure grouping by validated module attribution;
//     labeled modules sorted by moduleOrder (manifest file order),
//     implicit module last; only non-empty groups; input order kept
//     within a group.
//   - readSessionSets stamps moduleOrder (the manifest entry index)
//     alongside module/moduleTitle; unknown/absent slugs stamp null.
//   - Host + webview wiring source scans (house pattern — the private
//     buildModules and the client.js IIFE are not importable from the
//     unit harness; see verificationMarker.test.ts).
//
// The "no-manifest fixture renders unchanged" invariant is pinned three
// ways: groupByModule's single-implicit-group contract here, the client
// source scan asserting the implicit-only branch renders via the
// pre-087 bucket dialect (renderBucket(bucket, null) → rows at
// aria-level 2), and the Layer 3 smoke in session-sets-tree.spec.ts
// (aria-level="2" rows + zero .module elements on a no-manifest repo).

import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  buildModulePayloads,
  groupByModule,
} from "../../providers/SessionSetsModel";
import { readSessionSets } from "../../utils/fileSystem";
import { SessionSet } from "../../types";
import { RowPayload } from "../../types/sessionSetsWebviewProtocol";

function fakeSet(over: Partial<SessionSet> = {}): SessionSet {
  return {
    name: "x",
    module: null,
    moduleTitle: null,
    moduleOrder: null,
    dir: "/x",
    specPath: "/x/spec.md",
    activityPath: "/x/activity-log.json",
    changeLogPath: "/x/change-log.md",
    statePath: "/x/session-state.json",
    aiAssignmentPath: "/x/ai-assignment.md",
    uatChecklistPath: "/x/x-uat-checklist.json",
    state: "not-started",
    totalSessions: null,
    sessionsCompleted: 0,
    lastTouched: null,
    liveSession: null,
    config: {
      requiresUAT: false,
      requiresE2E: false,
      uatScope: "none",
      tier: "full",
      verificationMode: "out-of-band-or-none",
      module: null,
    },
    uatSummary: null,
    root: "/x",
    needsMigration: false,
    migrationTargetSchemaVersion: null,
    schemaVersionOnDisk: null,
    prerequisites: null,
    blockedByPrereqs: false,
    unsatisfiedPrereqs: [],
    plusFraction: false,
    externalVerificationNoteExists: false,
    completedVerification: null,
    verificationMarker: "",
    workspaceTierMarker: null,
    ...over,
  };
}

function labeled(
  name: string,
  module: string,
  moduleOrder: number,
  over: Partial<SessionSet> = {},
): SessionSet {
  return fakeSet({
    name,
    module,
    moduleTitle: `Title of ${module}`,
    moduleOrder,
    ...over,
  });
}

suite("Set 087 S2 — groupByModule", () => {
  test("empty input produces no groups", () => {
    assert.deepStrictEqual(groupByModule([]), []);
  });

  test("all-implicit input produces exactly one unlabeled group in input order", () => {
    const a = fakeSet({ name: "a" });
    const b = fakeSet({ name: "b" });
    const groups = groupByModule([b, a]);
    assert.strictEqual(groups.length, 1);
    assert.strictEqual(groups[0].slug, null);
    assert.strictEqual(groups[0].title, null);
    assert.deepStrictEqual(groups[0].sets.map((s) => s.name), ["b", "a"]);
  });

  test("labeled modules sort by moduleOrder (manifest file order), implicit last", () => {
    const sets = [
      fakeSet({ name: "loose-1" }),
      labeled("n-1", "notifications", 1),
      labeled("b-1", "billing", 0),
      labeled("i-1", "integration", 2),
      fakeSet({ name: "loose-2" }),
      labeled("b-2", "billing", 0),
    ];
    const groups = groupByModule(sets);
    assert.deepStrictEqual(
      groups.map((g) => g.slug),
      ["billing", "notifications", "integration", null],
      "labeled groups follow manifest order; the implicit module is last",
    );
    assert.deepStrictEqual(
      groups[0].sets.map((s) => s.name),
      ["b-1", "b-2"],
      "sets keep input order within a group",
    );
    assert.deepStrictEqual(
      groups[3].sets.map((s) => s.name),
      ["loose-1", "loose-2"],
    );
    assert.strictEqual(groups[0].title, "Title of billing");
  });

  test("all-labeled input produces no implicit group", () => {
    const groups = groupByModule([labeled("b-1", "billing", 0)]);
    assert.deepStrictEqual(groups.map((g) => g.slug), ["billing"]);
  });

  test("a null moduleOrder on a labeled set sorts after indexed modules but before the implicit group", () => {
    // Defensive tolerance: module non-null with moduleOrder null cannot
    // be produced by the scanner (they are stamped together) but the
    // grouping must stay deterministic on fixture-shaped data.
    const groups = groupByModule([
      fakeSet({ name: "loose" }),
      fakeSet({ name: "odd", module: "odd", moduleTitle: "Odd", moduleOrder: null }),
      labeled("b-1", "billing", 0),
    ]);
    assert.deepStrictEqual(
      groups.map((g) => g.slug),
      ["billing", "odd", null],
    );
  });

  test("differing moduleOrder for one slug (cross-root merge) keeps the smallest", () => {
    const groups = groupByModule([
      labeled("n-1", "notifications", 3),
      labeled("b-1", "billing", 1),
      labeled("n-2", "notifications", 0),
    ]);
    assert.deepStrictEqual(
      groups.map((g) => g.slug),
      ["notifications", "billing"],
      "notifications adopts its smallest seen index (0) and outranks billing (1)",
    );
  });
});

// readSessionSets stamps moduleOrder with the manifest entry index —
// same fixture style as modulesManifest.test.ts.
suite("Set 087 S2 — moduleOrder stamping at scan time", () => {
  function makeTmpDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-modtier-test-"));
  }

  function writeManifest(root: string, text: string): void {
    fs.mkdirSync(path.join(root, "docs"), { recursive: true });
    fs.writeFileSync(path.join(root, "docs", "modules.yaml"), text);
  }

  function writeSet(
    root: string,
    name: string,
    opts: { module?: string } = {},
  ): void {
    const dir = path.join(root, "docs", "session-sets", name);
    fs.mkdirSync(dir, { recursive: true });
    const moduleLine = opts.module ? `module: ${opts.module}\n` : "";
    fs.writeFileSync(
      path.join(dir, "spec.md"),
      `# ${name}\n\n## Session Set Configuration\n\`\`\`yaml\n` +
        `tier: full\nrequiresUAT: false\nrequiresE2E: false\n${moduleLine}\`\`\`\n`,
    );
  }

  const MANIFEST = [
    "modules:",
    "  - slug: billing",
    "    title: Billing & Invoicing",
    "  - slug: notifications",
    "  - slug: integration",
    "    title: Cross-Module Integration",
    "",
  ].join("\n");

  test("a manifest-valid module stamps its manifest index; unknown and absent stamp null", () => {
    const root = makeTmpDir();
    try {
      writeManifest(root, MANIFEST);
      writeSet(root, "001-core", { module: "billing" });
      writeSet(root, "002-pings", { module: "notifications" });
      writeSet(root, "003-glue", { module: "integration" });
      writeSet(root, "004-typo", { module: "no-such-module" });
      writeSet(root, "005-plain");
      const byName = new Map(readSessionSets(root).map((s) => [s.name, s]));
      assert.strictEqual(byName.get("001-core")!.moduleOrder, 0);
      assert.strictEqual(byName.get("002-pings")!.moduleOrder, 1);
      assert.strictEqual(byName.get("003-glue")!.moduleOrder, 2);
      // Unknown slug degrades to the implicit module entirely —
      // attribution AND order (S1 contract, extended).
      assert.strictEqual(byName.get("004-typo")!.module, null);
      assert.strictEqual(byName.get("004-typo")!.moduleOrder, null);
      assert.strictEqual(byName.get("005-plain")!.moduleOrder, null);
    } finally {
      fs.rmSync(root, { recursive: true });
    }
  });

  test("no manifest stamps null moduleOrder on every set (single implicit module)", () => {
    const root = makeTmpDir();
    try {
      writeSet(root, "001-a", { module: "billing" });
      writeSet(root, "002-b");
      for (const s of readSessionSets(root)) {
        assert.strictEqual(s.module, null);
        assert.strictEqual(s.moduleOrder, null);
      }
    } finally {
      fs.rmSync(root, { recursive: true });
    }
  });

  test("scan output groups end-to-end: manifest order wins over directory order", () => {
    const root = makeTmpDir();
    try {
      writeManifest(root, MANIFEST);
      // Directory order (alphabetical scan) is integration → billing;
      // the manifest orders billing (0) before integration (2).
      writeSet(root, "001-glue", { module: "integration" });
      writeSet(root, "002-core", { module: "billing" });
      writeSet(root, "003-plain");
      const groups = groupByModule(readSessionSets(root));
      assert.deepStrictEqual(
        groups.map((g) => g.slug),
        ["billing", "integration", null],
      );
      assert.strictEqual(groups[0].title, "Billing & Invoicing");
      // Title defaults to the slug in the manifest reader; carried
      // through attribution untouched.
      assert.deepStrictEqual(
        groups.map((g) => g.title),
        ["Billing & Invoicing", "Cross-Module Integration", null],
      );
    } finally {
      fs.rmSync(root, { recursive: true });
    }
  });
});

// Behavior-level payload-shape coverage (verifier round 1, Major): the
// spec's "buildModules payload shape; Layer 2 fixture with 2–3 modules
// + an integration module" acceptance criterion, exercised through the
// extracted pure `buildModulePayloads` — the exact function the host's
// `buildModules` delegates to, with a stub row builder standing in for
// the host's private `buildRow` (whose own field derivations are
// covered by the existing model-helper suites).
suite("Set 087 S2 — buildModulePayloads payload shape (Layer 2 fixture)", () => {
  function stubRow(set: SessionSet): RowPayload {
    return {
      slug: set.name,
      name: set.name,
      state: set.state,
      fraction: "",
      fractionTooltip: "",
      description: "",
      contextValue: "",
      iconSlug: "",
      needsMigration: false,
      migrationMarker: "",
      migrationTooltip: "",
      tierMarker: "",
      tierTooltip: "",
      blockedMarker: "",
      blockedTooltip: "",
      verificationMarker: "",
      verificationTooltip: "",
      accordionHtml: null,
      accordionUpdatedAt: null,
    };
  }

  // The 2-modules-plus-integration fixture the spec names, every
  // labeled module carrying all four lifecycle states so each renders
  // the full four-bucket set; two implicit sets ride along.
  function fixture(): SessionSet[] {
    const mk = (
      name: string,
      module: string | null,
      order: number | null,
      state: SessionSet["state"],
    ): SessionSet =>
      module === null
        ? fakeSet({ name, state })
        : labeled(name, module, order as number, { state });
    return [
      // greeter (manifest index 0) — all four states.
      mk("g-active", "greeter", 0, "in-progress"),
      mk("g-new", "greeter", 0, "not-started"),
      mk("g-done", "greeter", 0, "complete"),
      mk("g-dropped", "greeter", 0, "cancelled"),
      // clock (manifest index 1) — all four states.
      mk("c-active", "clock", 1, "in-progress"),
      mk("c-new", "clock", 1, "not-started"),
      mk("c-done", "clock", 1, "complete"),
      mk("c-dropped", "clock", 1, "cancelled"),
      // integration (manifest index 2) — all four states.
      mk("i-active", "integration", 2, "in-progress"),
      mk("i-new", "integration", 2, "not-started"),
      mk("i-done", "integration", 2, "complete"),
      mk("i-dropped", "integration", 2, "cancelled"),
      // Implicit module — no cancelled set (pins the omitted-bucket
      // contract).
      mk("loose-a", null, null, "not-started"),
      mk("loose-b", null, null, "in-progress"),
    ];
  }

  test("modules arrive titled, in manifest order, implicit last", () => {
    const payload = buildModulePayloads(fixture(), stubRow);
    assert.deepStrictEqual(
      payload.map((m) => m.slug),
      ["greeter", "clock", "integration", ""],
    );
    assert.deepStrictEqual(
      payload.map((m) => m.title),
      ["Title of greeter", "Title of clock", "Title of integration", ""],
    );
  });

  test("every labeled module carries the four lifecycle buckets in canonical order", () => {
    const payload = buildModulePayloads(fixture(), stubRow);
    for (const mod of payload.slice(0, 3)) {
      assert.deepStrictEqual(
        mod.buckets.map((b) => b.key),
        ["in-progress", "not-started", "complete", "cancelled"],
        `module ${mod.slug} must render all four buckets`,
      );
      assert.deepStrictEqual(
        mod.buckets.map((b) => b.label),
        ["In Progress", "Not Started", "Complete", "Cancelled"],
      );
      for (const bucket of mod.buckets) {
        assert.strictEqual(bucket.count, 1, `${mod.slug}/${bucket.key}`);
        assert.strictEqual(bucket.rows.length, 1);
      }
    }
  });

  test("rows land in their own module's bucket for the matching state", () => {
    const payload = buildModulePayloads(fixture(), stubRow);
    const byModule = new Map(payload.map((m) => [m.slug, m]));
    const rowSlugs = (mod: string, key: string): string[] =>
      byModule.get(mod)!.buckets.find((b) => b.key === key)!.rows.map((r) => r.slug);
    assert.deepStrictEqual(rowSlugs("greeter", "in-progress"), ["g-active"]);
    assert.deepStrictEqual(rowSlugs("clock", "complete"), ["c-done"]);
    assert.deepStrictEqual(rowSlugs("integration", "not-started"), ["i-new"]);
    assert.deepStrictEqual(rowSlugs("integration", "cancelled"), ["i-dropped"]);
    // Cross-containment: no module's buckets carry another module's rows.
    for (const mod of payload) {
      const prefix =
        mod.slug === "" ? "loose" : mod.slug.charAt(0);
      for (const bucket of mod.buckets) {
        for (const row of bucket.rows) {
          assert.ok(
            row.slug.startsWith(prefix),
            `row ${row.slug} leaked into module "${mod.slug}"`,
          );
        }
      }
    }
  });

  test("a module with no cancelled sets omits the Cancelled bucket (pre-087 contract); empty defaults still render", () => {
    const payload = buildModulePayloads(fixture(), stubRow);
    const implicit = payload[3];
    assert.strictEqual(implicit.slug, "");
    assert.deepStrictEqual(
      implicit.buckets.map((b) => b.key),
      ["in-progress", "not-started", "complete"],
      "no cancelled sets → no Cancelled bucket",
    );
    // The implicit fixture has no complete set: the default bucket
    // still renders, empty (count 0, zero rows) — exactly the host's
    // pre-087 behavior.
    const complete = implicit.buckets.find((b) => b.key === "complete")!;
    assert.strictEqual(complete.count, 0);
    assert.deepStrictEqual(complete.rows, []);
  });

  test("an all-implicit workspace produces exactly one ModulePayload with \"\" sentinels (the pixel-compatible case)", () => {
    const payload = buildModulePayloads(
      [fakeSet({ name: "a" }), fakeSet({ name: "b", state: "complete" })],
      stubRow,
    );
    assert.strictEqual(payload.length, 1);
    assert.strictEqual(payload[0].slug, "");
    assert.strictEqual(payload[0].title, "");
    assert.deepStrictEqual(
      payload[0].buckets.map((b) => b.key),
      ["in-progress", "not-started", "complete"],
    );
  });

  test("not-started rows sort by name within a module's bucket (sortBucket reused per module)", () => {
    const payload = buildModulePayloads(
      [
        labeled("z-later", "greeter", 0, { state: "not-started" }),
        labeled("a-first", "greeter", 0, { state: "not-started" }),
      ],
      stubRow,
    );
    const notStarted = payload[0].buckets.find((b) => b.key === "not-started")!;
    assert.deepStrictEqual(
      notStarted.rows.map((r) => r.slug),
      ["a-first", "z-later"],
    );
  });

  test("end-to-end from disk: a manifest fixture flows scan → payload with manifest order and titles", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-modpayload-"));
    try {
      fs.mkdirSync(path.join(root, "docs"), { recursive: true });
      fs.writeFileSync(
        path.join(root, "docs", "modules.yaml"),
        [
          "modules:",
          "  - slug: billing",
          "    title: Billing & Invoicing",
          "  - slug: integration",
          "    title: Cross-Module Integration",
          "",
        ].join("\n"),
      );
      const writeSet = (name: string, module?: string) => {
        const dir = path.join(root, "docs", "session-sets", name);
        fs.mkdirSync(dir, { recursive: true });
        const moduleLine = module ? `module: ${module}\n` : "";
        fs.writeFileSync(
          path.join(dir, "spec.md"),
          `# ${name}\n\n## Session Set Configuration\n\`\`\`yaml\n` +
            `tier: full\nrequiresUAT: false\nrequiresE2E: false\n${moduleLine}\`\`\`\n`,
        );
      };
      // Directory order puts integration first; manifest order must win.
      writeSet("001-glue", "integration");
      writeSet("002-core", "billing");
      writeSet("003-plain");
      const payload = buildModulePayloads(readSessionSets(root), stubRow);
      assert.deepStrictEqual(
        payload.map((m) => [m.slug, m.title]),
        [
          ["billing", "Billing & Invoicing"],
          ["integration", "Cross-Module Integration"],
          ["", ""],
        ],
      );
      const billingRows = payload[0].buckets.flatMap((b) => b.rows.map((r) => r.slug));
      assert.deepStrictEqual(billingRows, ["002-core"]);
    } finally {
      fs.rmSync(root, { recursive: true });
    }
  });
});

// Wiring source scans. The host class and the webview IIFE are not
// importable from the unit harness, so — per the prerequisites.test.ts
// / verificationMarker.test.ts house pattern — assert the shipped
// sources delegate to the behavior-tested builder above and carry the
// rendering the protocol promises.
suite("Set 087 S2 — module tier payload + rendering source scans", () => {
  const extRoot = path.resolve(__dirname, "..", "..", "..");

  test("host ships modules by delegating to the behavior-tested builder; no top-level buckets", () => {
    const view = fs.readFileSync(
      path.join(extRoot, "src", "providers", "CustomSessionSetsView.ts"),
      "utf8",
    );
    assert.ok(view.includes("modules: this.buildModules(all)"));
    assert.ok(
      view.includes("buildModulePayloads(all, (set) => this.buildRow(set))"),
      "buildModules must delegate to the extracted, behavior-tested builder",
    );
    assert.ok(
      !view.includes("buckets: this.buildBuckets"),
      "the pre-087 top-level bucket payload must be gone (ruling Q2)",
    );
  });

  test("protocol replaces SnapshotPayload.buckets with modules", () => {
    const proto = fs.readFileSync(
      path.join(extRoot, "src", "types", "sessionSetsWebviewProtocol.ts"),
      "utf8",
    );
    assert.ok(proto.includes("modules: ModulePayload[]"));
    const snapshotBlock = proto.slice(
      proto.indexOf("export interface SnapshotPayload"),
      proto.indexOf("// ----- Host → Webview -----"),
    );
    // Match a real field DECLARATION line (the block's doc comment
    // legitimately names the retired field in prose).
    assert.ok(
      !/\n\s*buckets: BucketPayload\[\];/.test(snapshotBlock),
      "SnapshotPayload must not carry the retired top-level buckets field",
    );
  });

  test("webview renders both dialects: byte-identical implicit-only and a conformant 3-level ARIA tree", () => {
    const client = fs.readFileSync(
      path.join(extRoot, "media", "session-sets-tree", "client.js"),
      "utf8",
    );
    // Implicit-only branch renders through the pre-087 bucket dialect.
    assert.ok(client.includes('modules.length === 1 && modules[0].slug === ""'));
    assert.ok(client.includes("renderBucket(bucket, null)"));
    // Module nodes: role="treeitem" carrying aria-level 1 +
    // aria-expanded (R2 conformance fix), children nested in
    // role="group", quiet fallback label for the unlabeled implicit
    // module, per-module collapse state, composite per-(module, bucket)
    // collapse keys, rows at aria-level 3.
    assert.ok(client.includes('class="module-header"'));
    assert.ok(client.includes('"(ungrouped)"'));
    assert.ok(client.includes("moduleCollapsed[slug]"));
    assert.ok(client.includes('moduleSlug + "/" + bucket.key'));
    assert.ok(
      client.includes('\'<div role="treeitem" tabindex="-1" aria-level="1"\''),
      "the module node itself is a treeitem at level 1",
    );
    assert.ok(
      client.includes('\'<div role="treeitem" tabindex="-1" aria-level="2"\''),
      "the bucket node itself is a treeitem at level 2 in the module dialect",
    );
    assert.ok(client.includes('class="module-body" role="group"'));
    assert.ok(client.includes('class="bucket-body" role="group"'));
    assert.ok(client.includes("renderRow(row, inModule ? 3 : 2)"));
    // Keyboard operability: shared toggler wired to Enter/Space and
    // ArrowRight/ArrowLeft; arrow navigation walks visible nodes only.
    assert.ok(client.includes("function toggleCollapsible(nodeEl"));
    assert.ok(client.includes("toggleCollapsible(item, true)"));
    assert.ok(client.includes("toggleCollapsible(item, false)"));
    assert.ok(client.includes("function visibleTreeItems()"));
  });

  test("the module header style ships (collapse affordance + hidden body)", () => {
    const css = fs.readFileSync(
      path.join(extRoot, "media", "session-sets-tree", "tree.css"),
      "utf8",
    );
    assert.ok(css.includes(".module-header"));
    assert.ok(css.includes('.module[aria-expanded="false"] .module-body'));
  });
});
