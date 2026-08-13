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
  DefaultModuleGate,
  DefaultModuleScaffoldOutcome,
  ScaffoldResult,
  buildProjectStructureNoPrompt,
  decideDefaultModuleScaffold,
  describeDefaultModuleSkip,
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
import { RunRouterCliDeps } from "../../utils/routerCli";
import { fixturePython } from "./moduleCliFixture";

/**
 * Set 122 S2: the default-module scaffold shells out to the router CLI now,
 * so these tests need an interpreter that has `ai_router`. A temp projectDir
 * has no `.venv`, so production resolution would correctly fall through to
 * bare `python` — which is exactly the machine-dependent thing this injects
 * around.
 */
function cliDeps(): RunRouterCliDeps {
  return {
    resolveInterpreter: () => fixturePython(),
    echo: { append: () => undefined, reveal: () => undefined },
  };
}

/** The stub's test-only configuration hooks (see `src/test/vscode-stub.js`). */
interface VscodeConfigStub {
  __setConfig(section: string, key: string, value: string): void;
  __clearConfig(): void;
}
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
  test("fresh manifest: declares 'default' + scaffolds both lifecycle sets at 001/002", async () => {
    const root = tmpRoot("default-module-fresh-");
    try {
      ensureModulesManifest(root);
      const outcome = await scaffoldDefaultModuleAndLifecycleSets(root, cliDeps());

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

  test("a repo with no modules.yaml at all still succeeds (the CLI creates it)", async () => {
    const root = tmpRoot("default-module-nomanifest-");
    try {
      const outcome = await scaffoldDefaultModuleAndLifecycleSets(root, cliDeps());
      assert.strictEqual(outcome.ran, true);
      assert.deepStrictEqual(listSetDirs(root), [
        "001-default-plan",
        "002-default-decomposition",
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("a repo with existing session sets but no prior manifest is NOT seeded with Default (Set 101 S1 verification round 1, Major x2)", async () => {
    const root = tmpRoot("default-module-legacy-sets-");
    try {
      // A legacy repo: real pre-existing work under docs/session-sets/,
      // no docs/modules.yaml yet — exactly the upgrade/rerun population the
      // spec's "already has modules OR SETS" idempotency contract protects.
      specWith(root, "047-existing-work", LEGACY_SPEC);
      ensureModulesManifest(root); // mirrors what Build's ensureModulesManifest call does

      const outcome = await scaffoldDefaultModuleAndLifecycleSets(root, cliDeps());
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

  test("a second direct call reports a caught refusal, never a throw, and changes nothing", async () => {
    const root = tmpRoot("default-module-already-");
    try {
      ensureModulesManifest(root);
      await scaffoldDefaultModuleAndLifecycleSets(root, cliDeps()); // first call succeeds
      const before = readModulesManifest(root)!;
      const beforeDirs = listSetDirs(root);

      const outcome = await scaffoldDefaultModuleAndLifecycleSets(root, cliDeps()); // direct re-call
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

    function scaffoldResult(manifestJustCreated: boolean, installOk = true): ScaffoldResult {
      return {
        written: manifestJustCreated
          ? ["CLAUDE.md", MODULES_MANIFEST_DISPLAY]
          : ["CLAUDE.md"],
        skipped: manifestJustCreated ? [] : [MODULES_MANIFEST_DISPLAY],
        installOk,
        installMessage: installOk ? "installed" : "pip install failed",
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
      gate: DefaultModuleGate = "scaffold",
      installOk = true,
    ): BuildStructureSeams {
      return {
        probePython: () => true,
        gitInit: async () => {},
        loadBundle: () => fakeBundle,
        runScaffold: async () => ({
          result: scaffoldResult(manifestJustCreated, installOk),
          installOutcome: fakeInstallOutcome(),
        }),
        showInfo: () => {},
        showWarning: () => {},
        recordSeatChoice: () => {},
        // Set 122 S3: the gate is a seam so the wiring tests below drive
        // each branch without arranging a real manifest on disk. The gate's
        // own decision logic is pinned by the pure-function suite further
        // down, against real classifications.
        decideDefaultModule: () => gate,
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

    test("gate says scaffold: the default-module seam runs exactly once, on projectDir", async () => {
      const calls: string[] = [];
      const seams = baseSeams(true, calls);
      const infos: string[] = [];
      seams.showInfo = (m) => infos.push(m);
      await buildProjectStructureNoPrompt(
        fakeContext(),
        projectDir,
        undefined,
        undefined,
        seams,
      );
      assert.deepStrictEqual(calls, [projectDir]);
      assert.ok(infos[0].includes("Default module scaffolded."));
    });

    test("gate says modules already declared: the default-module seam never runs", async () => {
      const calls: string[] = [];
      const seams = baseSeams(false, calls, "skip-modules-declared");
      const infos: string[] = [];
      seams.showInfo = (m) => infos.push(m);
      await buildProjectStructureNoPrompt(
        fakeContext(),
        projectDir,
        undefined,
        undefined,
        seams,
      );
      assert.deepStrictEqual(calls, []);
      // A repo that already has modules is not told anything about the
      // default module — silence is the correct note here.
      assert.ok(
        !infos[0].includes("default module"),
        `unexpected default-module note: ${infos[0]}`,
      );
    });

    test("gate says the router is unavailable: nothing is scaffolded and the retry path is named", async () => {
      // Set 122 S3. The old flow shelled out to `python -m ai_router.modules`
      // regardless and reported the failure after the fact; worse, the
      // attempt consumed the only chance to create the module. Both halves
      // are asserted here: no Python-backed mutation is attempted, AND the
      // operator is told the retry works without deleting anything.
      const calls: string[] = [];
      const warnings: string[] = [];
      const seams = baseSeams(true, calls, "skip-router-unavailable", false);
      seams.showWarning = (m) => warnings.push(m);
      await buildProjectStructureNoPrompt(
        fakeContext(),
        projectDir,
        undefined,
        undefined,
        seams,
      );
      assert.deepStrictEqual(calls, [], "no Python-backed module mutation may be attempted");
      const note = warnings.join(" ");
      assert.ok(
        note.includes("was NOT scaffolded"),
        `expected an explicit not-scaffolded note, got: ${note}`,
      );
      assert.ok(
        /do NOT need to delete/i.test(note),
        `expected the retry path to be named, got: ${note}`,
      );
    });
    test("without a seam override, the REAL writer runs against the real projectDir", async () => {
      const root = fs.mkdtempSync(
        path.join(os.tmpdir(), "default-module-real-build-"),
      );
      // The production path resolves its own interpreter, so point the
      // operator setting at one that has `ai_router` — a temp root has no
      // `.venv` and would otherwise fall through to bare `python`.
      (vscode.workspace as unknown as VscodeConfigStub).__setConfig(
        "dabblerSessionSets",
        "pythonPath",
        fixturePython(),
      );
      try {
        const seams = baseSeams(true, []);
        delete seams.scaffoldDefaultModule; // exercise the production default
        const infos: string[] = [];
        seams.showInfo = (m) => infos.push(m);
        await buildProjectStructureNoPrompt(
          fakeContext(),
          root,
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
        (vscode.workspace as unknown as VscodeConfigStub).__clearConfig();
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
  test("fresh Build: exactly one declared module (default), two pending sets, no pseudo-module", async () => {
    const root = tmpRoot("default-module-tree-");
    try {
      ensureModulesManifest(root);
      await scaffoldDefaultModuleAndLifecycleSets(root, cliDeps());

      const modules = visibleModules(root);
      assert.strictEqual(modules.length, 1, "exactly one visible module");
      assert.strictEqual(modules[0].kind, "declared");
      assert.strictEqual(modules[0].slug, "default");
      const rows = modules[0].buckets.flatMap((b) => b.rows);
      assert.strictEqual(rows.length, 2, "two pending rows under default");
      assert.ok(
        !modules.some((m) => m.kind === "pseudo"),
        "no pseudo-module renders alongside the declared default",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
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

suite("gitScaffold — decideDefaultModuleScaffold (Set 122 S3)", () => {
  const capable = true;
  test("an absent manifest with a working router scaffolds", () => {
    assert.strictEqual(
      decideDefaultModuleScaffold({ kind: "absent" }, capable),
      "scaffold",
    );
  });

  test("RETRYABILITY: a manifest that already exists but declares NO modules still scaffolds", () => {
    // This is the regression falsifier for the Set 122 S3 fix. The manifest
    // is written BEFORE the install runs, so under the old
    // "did this call create docs/modules.yaml?" gate the first attempt
    // always consumed the only chance to create the module: a retry after a
    // failed install found the file present and declined forever, and the
    // user's only recovery was deleting a file nobody told them about.
    assert.strictEqual(
      decideDefaultModuleScaffold({ kind: "present", entries: [] }, capable),
      "scaffold",
    );
  });

  test("a manifest that declares modules is left alone", () => {
    assert.strictEqual(
      decideDefaultModuleScaffold(
        {
          kind: "present",
          entries: [{ slug: "api", title: "API" } as never],
        },
        capable,
      ),
      "skip-modules-declared",
    );
  });

  test("an invalid manifest is never written through", () => {
    assert.strictEqual(
      decideDefaultModuleScaffold({ kind: "invalid" }, capable),
      "skip-manifest-invalid",
    );
  });

  test("an unavailable router refuses BEFORE any Python-backed mutation", () => {
    // L-079-3: provisioning is exactly where silent fail-open paths hide.
    assert.strictEqual(
      decideDefaultModuleScaffold({ kind: "absent" }, false),
      "skip-router-unavailable",
    );
    assert.strictEqual(
      decideDefaultModuleScaffold({ kind: "present", entries: [] }, false),
      "skip-router-unavailable",
    );
  });

  test("a repo that already has modules is NOT told the router is missing", () => {
    // Reporting an install problem to a repo that needed no install is a
    // false alarm; the declared-modules answer wins over the router one.
    assert.strictEqual(
      decideDefaultModuleScaffold(
        {
          kind: "present",
          entries: [{ slug: "api", title: "API" } as never],
        },
        false,
      ),
      "skip-modules-declared",
    );
  });

  test("every declining branch that has a retry path names it", () => {
    assert.strictEqual(describeDefaultModuleSkip("scaffold"), "");
    assert.strictEqual(describeDefaultModuleSkip("skip-modules-declared"), "");
    assert.ok(describeDefaultModuleSkip("skip-manifest-invalid").length > 0);
    const unavailable = describeDefaultModuleSkip("skip-router-unavailable");
    assert.ok(/Dabbler: Install ai-router/.test(unavailable), unavailable);
    assert.ok(/do NOT need to delete/i.test(unavailable), unavailable);
  });
});
