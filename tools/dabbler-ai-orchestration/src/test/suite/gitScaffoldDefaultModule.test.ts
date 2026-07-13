// Set 101 Session 1 — the default-module scaffold: a fresh Build declares
// the real `default` module + its two lifecycle sets (Set 098's kind: plan
// / kind: decomposition scaffolder, reused verbatim — Set 100's
// runNewModuleFlow precedent), and a Build re-run (or a legacy repo whose
// docs/modules.yaml already exists) leaves the manifest exactly as found.
// Two layers, mirroring this codebase's existing split: the pure scaffold
// function against real fs (the moduleAuthoring.test.ts pattern), and the
// buildProjectStructureNoPrompt gating against fake seams (the
// gitScaffoldSeatSetup.test.ts "REAL build path" pattern).

import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import {
  BuildStructureSeams,
  DefaultModuleScaffoldOutcome,
  ScaffoldResult,
  buildProjectStructureNoPrompt,
  scaffoldConsumerRepo,
  scaffoldDefaultModuleAndLifecycleSets,
} from "../../commands/gitScaffold";
import { makeFileOps } from "../../commands/installAiRouterCommands";
import {
  MODULES_MANIFEST_DISPLAY,
  classifyModulesManifest,
  ensureModulesManifest,
} from "../../utils/moduleAuthoring";
import {
  parsePrerequisites,
  parseSessionSetConfig,
  readModulesManifest,
  readSessionSets,
} from "../../utils/fileSystem";
import {
  buildVisibleModulePayloads,
  computeVisibleModules,
} from "../../providers/SessionSetsModel";
import { InstallOutcome } from "../../utils/aiRouterInstall";
import {
  TemplateBundle,
  loadTemplateBundle,
  resolveBundledTemplateDir,
} from "../../utils/consumerBootstrap";

function canonicalBundleDir(): string {
  const extRoot = path.resolve(__dirname, "../../..");
  const candidates = [
    path.resolve(extRoot, "../../docs/templates/consumer-bootstrap"),
    resolveBundledTemplateDir(extRoot),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "spec.md.template"))) return c;
  }
  throw new Error("Could not locate the consumer-bootstrap bundle for tests.");
}
const realBundle: TemplateBundle = loadTemplateBundle(canonicalBundleDir());

function tmpRoot(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function listSetDirs(root: string): string[] {
  const dir = path.join(root, "docs", "session-sets");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).sort();
}

/** A minimal, unstamped legacy set — simulates real pre-existing work that
 * predates `docs/modules.yaml` (Set 101 S1 verification round 1, Major x2). */
const LEGACY_SPEC = [
  "# Existing work",
  "",
  "## Session Set Configuration",
  "",
  "```yaml",
  "tier: full",
  "requiresUAT: false",
  "```",
  "",
  "## Sessions",
  "body text",
  "",
].join("\n");

function specWith(root: string, name: string, body: string): string {
  const dir = path.join(root, "docs", "session-sets", name);
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, "spec.md");
  fs.writeFileSync(p, body, "utf8");
  return p;
}

/** The exact tree the Work Explorer renders for `root`, real fs, real parsers. */
function visibleModules(root: string) {
  const sets = readSessionSets(root);
  return buildVisibleModulePayloads(
    computeVisibleModules(classifyModulesManifest(root), sets, {
      legacyRootPlanExists: false,
    }),
    (s) => ({ slug: s.name }) as never,
  );
}

function fakeContext(): vscode.ExtensionContext {
  return { subscriptions: [] as { dispose(): void }[] } as unknown as vscode.ExtensionContext;
}

suite("gitScaffold — scaffoldDefaultModuleAndLifecycleSets (Set 101 S1, real fs)", () => {
  test("fresh manifest: declares 'default' + scaffolds both lifecycle sets at 001/002", () => {
    const root = tmpRoot("default-module-fresh-");
    try {
      ensureModulesManifest(root);
      const outcome = scaffoldDefaultModuleAndLifecycleSets(root);

      assert.strictEqual(outcome.ran, true);
      assert.strictEqual(outcome.planSlug, "001-default-plan");
      assert.strictEqual(outcome.decompositionSlug, "002-default-decomposition");
      assert.ok(outcome.note.includes("001-default-plan"));
      assert.ok(outcome.note.includes("002-default-decomposition"));
      assert.ok(/rename/i.test(outcome.note));
      assert.ok(/delete/i.test(outcome.note));

      const entries = readModulesManifest(root)!;
      assert.strictEqual(entries.length, 1);
      assert.deepStrictEqual(entries[0], {
        slug: "default",
        title: "Default",
        codeRoots: [],
        planPath: "docs/modules/default/project-plan.md",
        touches: [],
      });
      assert.ok(
        fs.existsSync(path.join(root, "docs", "modules", "default", "project-plan.md")),
      );

      assert.deepStrictEqual(listSetDirs(root), [
        "001-default-plan",
        "002-default-decomposition",
      ]);
      const planSpec = path.join(root, "docs", "session-sets", "001-default-plan", "spec.md");
      const decompSpec = path.join(
        root,
        "docs",
        "session-sets",
        "002-default-decomposition",
        "spec.md",
      );
      assert.strictEqual(parseSessionSetConfig(planSpec).kind, "plan");
      assert.strictEqual(parseSessionSetConfig(decompSpec).kind, "decomposition");
      assert.deepStrictEqual(parsePrerequisites(decompSpec), [
        { slug: "001-default-plan", condition: "complete" },
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("a repo with no modules.yaml at all still succeeds (scaffoldNewModule creates it)", () => {
    const root = tmpRoot("default-module-nomanifest-");
    try {
      const outcome = scaffoldDefaultModuleAndLifecycleSets(root);
      assert.strictEqual(outcome.ran, true);
      assert.deepStrictEqual(listSetDirs(root), [
        "001-default-plan",
        "002-default-decomposition",
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("a repo with existing session sets but no prior manifest is NOT seeded with Default (Set 101 S1 verification round 1, Major x2)", () => {
    const root = tmpRoot("default-module-legacy-sets-");
    try {
      // A legacy repo: real pre-existing work under docs/session-sets/,
      // no docs/modules.yaml yet — exactly the upgrade/rerun population the
      // spec's "already has modules OR SETS" idempotency contract protects.
      specWith(root, "047-existing-work", LEGACY_SPEC);
      ensureModulesManifest(root); // mirrors what Build's ensureModulesManifest call does

      const outcome = scaffoldDefaultModuleAndLifecycleSets(root);
      assert.strictEqual(outcome.ran, false);
      assert.ok(/already has session sets/i.test(outcome.note));

      const entries = readModulesManifest(root)!;
      assert.strictEqual(entries.length, 0, "no default entry was added");
      assert.deepStrictEqual(listSetDirs(root), ["047-existing-work"]);
      assert.strictEqual(
        fs.readFileSync(path.join(root, "docs", "session-sets", "047-existing-work", "spec.md"), "utf8"),
        LEGACY_SPEC,
        "the pre-existing legacy set is byte-for-byte untouched",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("a second direct call reports a caught refusal, never a throw, and changes nothing", () => {
    const root = tmpRoot("default-module-already-");
    try {
      ensureModulesManifest(root);
      scaffoldDefaultModuleAndLifecycleSets(root); // first call succeeds
      const before = readModulesManifest(root)!;
      const beforeDirs = listSetDirs(root);

      const outcome = scaffoldDefaultModuleAndLifecycleSets(root); // direct re-call
      assert.strictEqual(outcome.ran, false);
      assert.ok(outcome.note.includes("NOT scaffolded"));
      // Nothing was duplicated or corrupted by the refused re-call — the
      // real idempotency guarantee lives in the caller's gate (below), not
      // in this function being safe to call twice on its own.
      assert.deepStrictEqual(readModulesManifest(root), before);
      assert.deepStrictEqual(listSetDirs(root), beforeDirs);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

suite(
  "gitScaffold — buildProjectStructureNoPrompt: default-module gating (Set 101 S1)",
  () => {
    const projectDir = path.join("/tmp", "default-module-proj");
    const fakeBundle = { engineFiles: {}, templates: {} } as unknown as TemplateBundle;

    function scaffoldResult(manifestJustCreated: boolean): ScaffoldResult {
      return {
        written: manifestJustCreated
          ? ["CLAUDE.md", MODULES_MANIFEST_DISPLAY]
          : ["CLAUDE.md"],
        skipped: manifestJustCreated ? [] : [MODULES_MANIFEST_DISPLAY],
        installOk: true,
        installMessage: "installed",
        routerConfigRemoved: false,
        budgetOutcome: null,
      };
    }

    function fakeInstallOutcome(): InstallOutcome {
      return {
        ok: true,
        message: "x",
        source: "pypi",
        venvPath: null,
        routerConfigPreserved: false,
      };
    }

    function baseSeams(
      manifestJustCreated: boolean,
      scaffoldDefaultModuleCalls: string[],
    ): BuildStructureSeams {
      return {
        probePython: () => true,
        gitInit: async () => {},
        loadBundle: () => fakeBundle,
        runScaffold: async () => ({
          result: scaffoldResult(manifestJustCreated),
          installOutcome: fakeInstallOutcome(),
        }),
        showInfo: () => {},
        showWarning: () => {},
        recordSeatChoice: () => {},
        scaffoldDefaultModule: (dir: string): DefaultModuleScaffoldOutcome => {
          scaffoldDefaultModuleCalls.push(dir);
          return {
            ran: true,
            planSlug: "001-default-plan",
            decompositionSlug: "002-default-decomposition",
            note: " Default module scaffolded.",
          };
        },
      };
    }

    test("fresh manifest (written): the default-module seam runs exactly once, on projectDir", async () => {
      const calls: string[] = [];
      const seams = baseSeams(true, calls);
      const infos: string[] = [];
      seams.showInfo = (m) => infos.push(m);
      await buildProjectStructureNoPrompt(
        fakeContext(),
        projectDir,
        "full",
        undefined,
        undefined,
        undefined,
        seams,
      );
      assert.deepStrictEqual(calls, [projectDir]);
      assert.ok(infos[0].includes("Default module scaffolded."));
    });

    test("pre-existing manifest (skipped): the default-module seam never runs", async () => {
      const calls: string[] = [];
      const seams = baseSeams(false, calls);
      await buildProjectStructureNoPrompt(
        fakeContext(),
        projectDir,
        "full",
        undefined,
        undefined,
        undefined,
        seams,
      );
      assert.deepStrictEqual(calls, []);
    });

    test("gating is tier-independent: Lightweight also triggers on a fresh manifest", async () => {
      const calls: string[] = [];
      const seams = baseSeams(true, calls);
      await buildProjectStructureNoPrompt(
        fakeContext(),
        projectDir,
        "lightweight",
        undefined,
        "out-of-band-or-none",
        undefined,
        seams,
      );
      assert.deepStrictEqual(calls, [projectDir]);
    });

    test("gating is tier-independent: Lightweight also skips on a pre-existing manifest", async () => {
      const calls: string[] = [];
      const seams = baseSeams(false, calls);
      await buildProjectStructureNoPrompt(
        fakeContext(),
        projectDir,
        "lightweight",
        undefined,
        "out-of-band-or-none",
        undefined,
        seams,
      );
      assert.deepStrictEqual(calls, []);
    });

    test("without a seam override, the REAL writer runs against the real projectDir", async () => {
      const root = fs.mkdtempSync(
        path.join(os.tmpdir(), "default-module-real-build-"),
      );
      try {
        const seams = baseSeams(true, []);
        delete seams.scaffoldDefaultModule; // exercise the production default
        const infos: string[] = [];
        seams.showInfo = (m) => infos.push(m);
        await buildProjectStructureNoPrompt(
          fakeContext(),
          root,
          "full",
          undefined,
          undefined,
          undefined,
          seams,
        );
        assert.ok(
          fs.existsSync(
            path.join(root, "docs", "session-sets", "001-default-plan", "spec.md"),
          ),
        );
        assert.ok(
          fs.existsSync(
            path.join(
              root,
              "docs",
              "session-sets",
              "002-default-decomposition",
              "spec.md",
            ),
          ),
        );
        assert.ok(infos[0].includes("Default module scaffolded"));
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });

    test("without a seam override, a repo with pre-existing legacy sets gets no Default (Set 101 S1 verification round 1, Major x2)", async () => {
      const root = fs.mkdtempSync(
        path.join(os.tmpdir(), "default-module-real-build-legacy-"),
      );
      try {
        specWith(root, "047-existing-work", LEGACY_SPEC);
        const seams = baseSeams(true, []);
        delete seams.scaffoldDefaultModule; // exercise the production default
        const infos: string[] = [];
        seams.showInfo = (m) => infos.push(m);
        await buildProjectStructureNoPrompt(
          fakeContext(),
          root,
          "full",
          undefined,
          undefined,
          undefined,
          seams,
        );
        assert.deepStrictEqual(listSetDirs(root), ["047-existing-work"]);
        assert.strictEqual((readModulesManifest(root) || []).length, 0);
        assert.ok(!infos[0].includes("Default module scaffolded"));
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  },
);

suite("gitScaffold — Work Explorer tree end-state (Set 101 S1 verification finding)", () => {
  test("fresh Build: exactly one declared module (default), two pending sets, no pseudo-module, both tiers", () => {
    for (const tier of ["full", "lightweight"] as const) {
      const root = tmpRoot(`default-module-tree-${tier}-`);
      try {
        ensureModulesManifest(root);
        scaffoldDefaultModuleAndLifecycleSets(root); // tier-agnostic — the scaffold itself never branches on tier

        const modules = visibleModules(root);
        assert.strictEqual(modules.length, 1, `exactly one visible module (${tier})`);
        assert.strictEqual(modules[0].kind, "declared");
        assert.strictEqual(modules[0].slug, "default");
        const rows = modules[0].buckets.flatMap((b) => b.rows);
        assert.strictEqual(rows.length, 2, `two pending rows under default (${tier})`);
        assert.ok(
          !modules.some((m) => m.kind === "pseudo"),
          `no pseudo-module renders alongside the declared default (${tier})`,
        );
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  });

  test("legacy repo: an empty pre-existing manifest with an unstamped set keeps rendering pseudo-Default unaffected", async () => {
    const root = tmpRoot("default-module-tree-legacy-");
    try {
      specWith(root, "600-loose-end", LEGACY_SPEC);
      ensureModulesManifest(root); // pre-existing, empty `modules: []` — mirrors a repo scaffolded before Set 101

      const before = visibleModules(root);
      assert.strictEqual(before.length, 1);
      assert.strictEqual(before[0].kind, "pseudo");
      assert.strictEqual(before[0].buckets.flatMap((b) => b.rows).length, 1);

      // Re-running Build (the real writer, no seam override) must not
      // disturb this legacy tree — the manifest already exists (`skipped`,
      // not `written`), so the default-module gate never fires.
      const seams: BuildStructureSeams = {
        probePython: () => true,
        gitInit: async () => {},
        loadBundle: () => realBundle,
        runScaffold: async (ctx, bundle, pythonPath, budget) => ({
          result: await scaffoldConsumerRepo({
            projectDir: root,
            ctx,
            bundle,
            fileOps: makeFileOps(),
            structureOnly: true,
            budget,
            installRouter: async () => ({ ok: true, message: "installed (faked for test)" }),
          }),
          installOutcome: {
            ok: true,
            message: "x",
            source: "pypi",
            venvPath: null,
            routerConfigPreserved: false,
          },
        }),
        showInfo: () => {},
        showWarning: () => {},
      };
      await buildProjectStructureNoPrompt(
        fakeContext(),
        root,
        "full",
        undefined,
        undefined,
        undefined,
        seams,
      );

      const after = visibleModules(root);
      assert.deepStrictEqual(after, before, "the pseudo-Default tree is byte-for-byte unaffected");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
