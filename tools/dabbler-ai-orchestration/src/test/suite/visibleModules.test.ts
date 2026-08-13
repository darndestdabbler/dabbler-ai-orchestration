// Set 091 Session 2 — the visible-module computation, the
// Default/Unassigned naming rule, the never-persist-`module: default`
// guard, and the legacy root-plan mapping (verdict amendment 2 + the Q8
// compat matrix; routed rulings saved raw at
// docs/session-sets/091-module-first-model-and-manifest-compat/
// s2-visible-module-architecture.json + -2.json).
//
// Each Q8 row of docs/planning/work-explorer-compat-matrix.md cites the
// test that pins it BY NAME — renaming a test here means updating the
// matrix in the same pass.
//
// Set 092 consumes this model in the shipping host. The renderer-switch
// suite at the bottom pins the host wiring and the multi-root merge.

import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  PSEUDO_MODULE_COEXIST_NAME,
  PSEUDO_MODULE_SOLE_NAME,
  VisibleModule,
  buildVisibleModulePayloads,
  chooseRenderableModuleSnapshot,
  computeVisibleModules,
  groupByModule,
  mergeVisibleModules,
} from "../../providers/SessionSetsModel";
import {
  LEGACY_ROOT_PLAN_REL,
  MODULES_YAML_TEMPLATE,
  ModulesManifestClassification,
  classifyModulesManifest,
  modulePlanRelPath,
  pickModuleForAuthoring,
  resolveModulePlanRelPath,
} from "../../utils/moduleAuthoring";
import { createModuleFixture } from "./moduleCliFixture";
import { readSessionSets } from "../../utils/fileSystem";
import {
  BootstrapContext,
  TemplateBundle,
  loadTemplateBundle,
  renderSpec,
  resolveBundledTemplateDir,
} from "../../utils/consumerBootstrap";
import { ModuleManifestEntry, SessionSet } from "../../types";

// ---------- fixtures ----------

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
    ...over,
  };
}

/** A set stamped `module: <raw>` in its spec (the raw declared value). */
function stamped(name: string, raw: string, over: Partial<SessionSet> = {}): SessionSet {
  const base = fakeSet({ name, ...over });
  return { ...base, config: { ...base.config, module: raw } };
}

function entry(slug: string, over: Partial<ModuleManifestEntry> = {}): ModuleManifestEntry {
  return { slug, title: `Title of ${slug}`, codeRoots: [], planPath: null, touches: [], ...over };
}

const ABSENT: ModulesManifestClassification = { kind: "absent" };
const INVALID: ModulesManifestClassification = { kind: "invalid" };
function present(entries: ModuleManifestEntry[]): ModulesManifestClassification {
  return { kind: "present", entries };
}

const NO_PLAN = { legacyRootPlanExists: false };
const WITH_PLAN = { legacyRootPlanExists: true };

function kinds(mods: VisibleModule[]): string[] {
  return mods.map((m) => m.kind);
}
function names(mods: VisibleModule[]): string[] {
  return mods.map((m) => m.displayName);
}

// ---------- the Q8 compat rows (cited by work-explorer-compat-matrix.md) ----------

suite("Set 091 S2 — computeVisibleModules: Q8 compat rows", () => {
  test("Q8 no-manifest-no-sets: sole pseudo `Default`, no warning, sets empty", () => {
    const mods = computeVisibleModules(ABSENT, [], NO_PLAN);
    assert.strictEqual(mods.length, 1);
    assert.strictEqual(mods[0].kind, "pseudo");
    assert.strictEqual(mods[0].slug, null);
    assert.strictEqual(mods[0].displayName, PSEUDO_MODULE_SOLE_NAME);
    assert.strictEqual(mods[0].warning, null);
    assert.deepStrictEqual(mods[0].sets, []);
  });

  test("Q8 no-manifest-unstamped-sets: sole pseudo `Default` with the sets + manifest-missing warning", () => {
    const a = fakeSet({ name: "a" });
    const b = fakeSet({ name: "b" });
    const mods = computeVisibleModules(ABSENT, [b, a], NO_PLAN);
    assert.strictEqual(mods.length, 1);
    assert.strictEqual(mods[0].displayName, PSEUDO_MODULE_SOLE_NAME);
    assert.deepStrictEqual(mods[0].warning, { code: "manifest-missing" });
    assert.deepStrictEqual(mods[0].sets.map((s) => s.name), ["b", "a"], "input order kept");
  });

  test("Q8 no-manifest-stamped-sets: fallback groups by observed slug + pseudo `Unassigned` for the unstamped, manifest-missing warning", () => {
    const mods = computeVisibleModules(
      ABSENT,
      [stamped("s1", "zeta"), fakeSet({ name: "loose" }), stamped("s2", "alpha")],
      NO_PLAN,
    );
    assert.deepStrictEqual(kinds(mods), ["fallback", "fallback", "pseudo"]);
    assert.deepStrictEqual(
      mods.slice(0, 2).map((m) => m.slug),
      ["alpha", "zeta"],
      "fallback groups sort alphabetically by slug",
    );
    assert.deepStrictEqual(mods[0].warning, { code: "undeclared-slug", rawSlug: "alpha" });
    assert.strictEqual(mods[2].displayName, PSEUDO_MODULE_COEXIST_NAME);
    assert.deepStrictEqual(mods[2].warning, { code: "manifest-missing" });
  });

  test("Q8 no-manifest-all-stamped: fallback groups only, no pseudo row (nothing for it to hold)", () => {
    const mods = computeVisibleModules(ABSENT, [stamped("s1", "alpha")], NO_PLAN);
    assert.deepStrictEqual(kinds(mods), ["fallback"]);
  });

  test("Q8 empty-manifest-no-sets: sole pseudo `Default`, NO warning (valid-empty is not a fault)", () => {
    const mods = computeVisibleModules(present([]), [], NO_PLAN);
    assert.strictEqual(mods.length, 1);
    assert.strictEqual(mods[0].displayName, PSEUDO_MODULE_SOLE_NAME);
    assert.strictEqual(mods[0].warning, null);
  });

  test("Q8 empty-manifest-unstamped-sets: sole pseudo `Default` with the sets, NO warning", () => {
    const mods = computeVisibleModules(present([]), [fakeSet({ name: "a" })], NO_PLAN);
    assert.strictEqual(mods.length, 1);
    assert.strictEqual(mods[0].displayName, PSEUDO_MODULE_SOLE_NAME);
    assert.strictEqual(mods[0].warning, null);
    assert.deepStrictEqual(mods[0].sets.map((s) => s.name), ["a"]);
  });

  test("Q8 empty-manifest-all-stamped: fallback groups only, no manifest-level warning (valid-empty is not a fault)", () => {
    // Verification round 2, finding 1: the empty-manifest × stamped-set
    // states were undocumented. A valid-empty manifest never yields
    // `manifest-missing`; stamped slugs are undeclared -> fallback.
    const mods = computeVisibleModules(
      present([]),
      [stamped("s1", "billing"), stamped("s2", "alpha")],
      NO_PLAN,
    );
    assert.deepStrictEqual(
      mods.map((m) => [m.kind, m.slug]),
      [
        ["fallback", "alpha"],
        ["fallback", "billing"],
      ],
    );
    assert.deepStrictEqual(mods[0].warning, { code: "undeclared-slug", rawSlug: "alpha" });
  });

  test("Q8 empty-manifest-stamped-plus-unstamped: fallback groups + pseudo Unassigned with the unstamped-sets warning", () => {
    const mods = computeVisibleModules(
      present([]),
      [stamped("s1", "billing"), fakeSet({ name: "loose" })],
      NO_PLAN,
    );
    assert.deepStrictEqual(kinds(mods), ["fallback", "pseudo"]);
    assert.strictEqual(mods[1].displayName, PSEUDO_MODULE_COEXIST_NAME);
    assert.deepStrictEqual(
      mods[1].warning,
      { code: "unstamped-sets" },
      "valid-empty never yields a manifest-level warning; the unstamped-sets advisory applies",
    );
    assert.deepStrictEqual(mods[1].sets.map((s) => s.name), ["loose"]);
  });

  test("Q8 populated-matching-only: declared modules in manifest order, no pseudo row", () => {
    const mods = computeVisibleModules(
      present([entry("billing"), entry("notifications")]),
      [stamped("n1", "notifications"), stamped("b1", "billing"), stamped("b2", "billing")],
      NO_PLAN,
    );
    assert.deepStrictEqual(kinds(mods), ["declared", "declared"]);
    assert.deepStrictEqual(mods.map((m) => m.slug), ["billing", "notifications"]);
    assert.deepStrictEqual(mods[0].sets.map((s) => s.name), ["b1", "b2"], "input order kept");
    assert.strictEqual(mods[0].warning, null);
  });

  test("Q8 populated-plus-unstamped: declared plus pseudo `Unassigned` carrying the unstamped-sets warning", () => {
    const mods = computeVisibleModules(
      present([entry("billing")]),
      [stamped("b1", "billing"), fakeSet({ name: "legacy-1" })],
      NO_PLAN,
    );
    assert.deepStrictEqual(kinds(mods), ["declared", "pseudo"]);
    assert.strictEqual(mods[1].displayName, PSEUDO_MODULE_COEXIST_NAME);
    assert.deepStrictEqual(mods[1].warning, { code: "unstamped-sets" });
    assert.deepStrictEqual(mods[1].sets.map((s) => s.name), ["legacy-1"]);
  });

  test("Q8 populated-plus-undeclared-slugs: declared, then warning-flagged fallback groups, work never hidden", () => {
    const mods = computeVisibleModules(
      present([entry("billing")]),
      [stamped("b1", "billing"), stamped("t1", "no-such-module")],
      NO_PLAN,
    );
    assert.deepStrictEqual(kinds(mods), ["declared", "fallback"]);
    assert.strictEqual(mods[1].slug, "no-such-module");
    assert.strictEqual(mods[1].displayName, "no-such-module");
    assert.deepStrictEqual(mods[1].warning, {
      code: "undeclared-slug",
      rawSlug: "no-such-module",
    });
    assert.deepStrictEqual(mods[1].sets.map((s) => s.name), ["t1"]);
  });

  test("Q8 invalid-manifest: fallback grouping from observed stamps + pseudo with the manifest-invalid warning", () => {
    const mods = computeVisibleModules(
      INVALID,
      [stamped("s1", "billing"), fakeSet({ name: "loose" })],
      NO_PLAN,
    );
    assert.deepStrictEqual(kinds(mods), ["fallback", "pseudo"]);
    assert.strictEqual(mods[0].slug, "billing");
    assert.deepStrictEqual(mods[1].warning, { code: "manifest-invalid" });
  });

  test("Q8 invalid-manifest-no-sets: sole pseudo `Default` still renders (never a blank tree), manifest-invalid warning", () => {
    const mods = computeVisibleModules(INVALID, [], NO_PLAN);
    assert.strictEqual(mods.length, 1);
    assert.strictEqual(mods[0].kind, "pseudo");
    assert.strictEqual(mods[0].displayName, PSEUDO_MODULE_SOLE_NAME);
    assert.deepStrictEqual(mods[0].warning, { code: "manifest-invalid" });
  });

  test("Q8 invalid-manifest-all-stamped: fallback groups only, no pseudo row (manifest fault surfaces via the classification)", () => {
    // Verification round 1, finding 1: the presence rule is uniform —
    // an invalid manifest over fully stamped sets (no unstamped sets, no
    // legacy plan) renders fallback groups only; the manifest-level
    // fault reaches the operator through the classification surface the
    // Set 092 diagnostics strip renders, not a synthetic pseudo row.
    const mods = computeVisibleModules(
      INVALID,
      [stamped("s1", "billing"), stamped("s2", "alpha")],
      NO_PLAN,
    );
    assert.deepStrictEqual(
      mods.map((m) => [m.kind, m.slug]),
      [
        ["fallback", "alpha"],
        ["fallback", "billing"],
      ],
    );
  });
});

// ---------- pseudo-module presence + naming rules ----------

suite("Set 091 S2 — pseudo-module presence and Default/Unassigned naming", () => {
  test("legacy root plan keeps the pseudo-module visible even when every set is stamped (gpt-5-4 Critical #1)", () => {
    const mods = computeVisibleModules(
      present([entry("billing")]),
      [stamped("b1", "billing")],
      WITH_PLAN,
    );
    assert.deepStrictEqual(kinds(mods), ["declared", "pseudo"]);
    assert.strictEqual(mods[1].displayName, PSEUDO_MODULE_COEXIST_NAME);
    assert.deepStrictEqual(mods[1].sets, []);
    assert.strictEqual(mods[1].warning, null, "a legacy plan is not a fault");
  });

  test("legacy plan does not mask manifest faults: absent -> manifest-missing, invalid -> manifest-invalid on the legacy-kept pseudo row", () => {
    // Verification round 2, finding 2: the legacy plan only keeps the
    // pseudo-module VISIBLE; its warning follows the standard precedence
    // (a legacy plan must never suppress an actionable manifest fault).
    const absent = computeVisibleModules(ABSENT, [stamped("s1", "alpha")], WITH_PLAN);
    assert.deepStrictEqual(kinds(absent), ["fallback", "pseudo"]);
    assert.deepStrictEqual(absent[1].warning, { code: "manifest-missing" });

    const invalid = computeVisibleModules(INVALID, [stamped("s1", "alpha")], WITH_PLAN);
    assert.deepStrictEqual(kinds(invalid), ["fallback", "pseudo"]);
    assert.deepStrictEqual(invalid[1].warning, { code: "manifest-invalid" });

    const validEmpty = computeVisibleModules(present([]), [stamped("s1", "alpha")], WITH_PLAN);
    assert.deepStrictEqual(kinds(validEmpty), ["fallback", "pseudo"]);
    assert.strictEqual(validEmpty[1].warning, null, "a usable manifest keeps the legacy-kept pseudo row quiet");
  });

  test("declared-but-empty modules are visible with zero sets (Set 100 flattened-tree contract)", () => {
    const mods = computeVisibleModules(
      present([entry("billing"), entry("empty-module")]),
      [stamped("b1", "billing")],
      NO_PLAN,
    );
    assert.deepStrictEqual(mods.map((m) => m.slug), ["billing", "empty-module"]);
    assert.deepStrictEqual(mods[1].sets, []);
  });

  test("fallback groups count as coexisting modules for naming: pseudo labels `Unassigned` beside fallback-only groups", () => {
    const mods = computeVisibleModules(
      ABSENT,
      [stamped("s1", "alpha"), fakeSet({ name: "loose" })],
      NO_PLAN,
    );
    assert.deepStrictEqual(kinds(mods), ["fallback", "pseudo"]);
    assert.strictEqual(mods[1].displayName, PSEUDO_MODULE_COEXIST_NAME);
  });

  test("a user-declared literal `default` slug is a normal declared module and forces the pseudo-module to `Unassigned`", () => {
    const mods = computeVisibleModules(
      present([entry("default", { title: "Default (declared)" })]),
      [stamped("d1", "default"), fakeSet({ name: "loose" })],
      NO_PLAN,
    );
    assert.deepStrictEqual(kinds(mods), ["declared", "pseudo"]);
    assert.strictEqual(mods[0].slug, "default");
    assert.deepStrictEqual(mods[0].sets.map((s) => s.name), ["d1"]);
    assert.strictEqual(mods[1].displayName, PSEUDO_MODULE_COEXIST_NAME);
  });

  test("a hand-written `module: default` with NO declared `default` slug is an undeclared-slug fallback group, never merged into the pseudo-module", () => {
    const mods = computeVisibleModules(
      present([entry("billing")]),
      [stamped("h1", "default"), fakeSet({ name: "loose" })],
      NO_PLAN,
    );
    assert.deepStrictEqual(kinds(mods), ["declared", "fallback", "pseudo"]);
    assert.strictEqual(mods[1].slug, "default");
    assert.deepStrictEqual(mods[1].warning, { code: "undeclared-slug", rawSlug: "default" });
    assert.deepStrictEqual(mods[1].sets.map((s) => s.name), ["h1"]);
    assert.deepStrictEqual(mods[2].sets.map((s) => s.name), ["loose"]);
  });

  test("ordering contract: declared (manifest order) then fallback (alphabetical) then pseudo last", () => {
    const mods = computeVisibleModules(
      present([entry("zeta-declared"), entry("alpha-declared")]),
      [
        stamped("f2", "m-undeclared-b"),
        stamped("f1", "m-undeclared-a"),
        fakeSet({ name: "loose" }),
        stamped("d1", "alpha-declared"),
      ],
      NO_PLAN,
    );
    assert.deepStrictEqual(
      mods.map((m) => [m.kind, m.slug]),
      [
        ["declared", "zeta-declared"],
        ["declared", "alpha-declared"],
        ["fallback", "m-undeclared-a"],
        ["fallback", "m-undeclared-b"],
        ["pseudo", null],
      ],
    );
  });
});

// ---------- legacy root-plan mapping ----------

suite("Set 091 S2 — legacy root-plan mapping", () => {
  test("LEGACY_ROOT_PLAN_REL is the repo-level plan path", () => {
    assert.strictEqual(LEGACY_ROOT_PLAN_REL, "docs/planning/project-plan.md");
  });

  test("the pseudo-module always carries LEGACY_ROOT_PLAN_REL as planPath, whether or not the file exists (ruling Q7)", () => {
    for (const opts of [NO_PLAN, WITH_PLAN]) {
      const mods = computeVisibleModules(ABSENT, [fakeSet({ name: "a" })], opts);
      const pseudo = mods.find((m) => m.kind === "pseudo")!;
      assert.strictEqual(pseudo.planPath, LEGACY_ROOT_PLAN_REL);
    }
  });

  test("declared modules resolve planPath purely: explicit value kept, absent defaults, unsafe degrades WITHOUT any console side effect", () => {
    // Verification round 4: computeVisibleModules is a pure model
    // function — the unsafe-planPath degradation must not log (the
    // interactive flows' modulePlanRelPath wrapper owns the warning).
    const warned: unknown[][] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => void warned.push(args);
    try {
      const mods = computeVisibleModules(
        present([
          entry("billing", { planPath: "docs/custom/billing-plan.md" }),
          entry("notifications"),
          entry("evil", { planPath: "../outside.md" }),
        ]),
        [],
        NO_PLAN,
      );
      assert.strictEqual(mods[0].planPath, "docs/custom/billing-plan.md");
      assert.strictEqual(mods[1].planPath, "docs/modules/notifications/project-plan.md");
      assert.strictEqual(mods[2].planPath, "docs/modules/evil/project-plan.md");
    } finally {
      console.warn = originalWarn;
    }
    assert.deepStrictEqual(warned, [], "no console output from the pure computation");
  });

  test("resolveModulePlanRelPath reports the degradation as data; the modulePlanRelPath wrapper still warns for the interactive flows", () => {
    const evil = entry("evil", { planPath: "../outside.md" });
    assert.deepStrictEqual(resolveModulePlanRelPath(evil), {
      path: "docs/modules/evil/project-plan.md",
      degraded: true,
    });
    assert.deepStrictEqual(resolveModulePlanRelPath(entry("billing")), {
      path: "docs/modules/billing/project-plan.md",
      degraded: false,
    });
    const warned: unknown[][] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => void warned.push(args);
    try {
      assert.strictEqual(modulePlanRelPath(evil), "docs/modules/evil/project-plan.md");
    } finally {
      console.warn = originalWarn;
    }
    assert.strictEqual(warned.length, 1, "the wrapper keeps the operator diagnostic");
  });

  test("fallback groups carry no planPath (no manifest entry to read)", () => {
    const mods = computeVisibleModules(ABSENT, [stamped("s1", "alpha")], NO_PLAN);
    assert.strictEqual(mods[0].planPath, null);
  });
});

// ---------- the never-persist-`module: default` guard (writer audit) ----------

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

function bootstrapCtx(moduleSlug?: string): BootstrapContext {
  return {
    repoName: "example-app",
    setTitle: "Example feature",
    purpose: "Guard-test context.",
    slug: "001-example-feature",
    created: "2026-01-01",
    totalSessions: 2,
    module: moduleSlug,
  };
}

suite("Set 091 S2 — never-persist `module: default` guard", () => {
  const bundle: TemplateBundle = loadTemplateBundle(canonicalBundleDir());

  test("pseudo-module spec render carries NO module: line at all ({{MODULE_LINE}} writer)", () => {
    const spec = renderSpec(bundle, bootstrapCtx());
    assert.ok(!/^module:/m.test(spec), "an unstamped set must have no module: line");
    assert.ok(!spec.includes("module: default"));
  });

  test("only a picked manifest slug is ever stamped; a picked literal `default` entry stamps legitimately", () => {
    // The pseudo-module can never reach this writer with a slug (its
    // resolution is `entry: null` -> the module field stays undefined);
    // `default` appears ONLY as a manifest-declared, operator-picked slug.
    const spec = renderSpec(bundle, bootstrapCtx("default"));
    assert.ok(/^module: default\b/m.test(spec));
  });

  test("pickModuleForAuthoring resolves `none` (no stamp) for absent, valid-empty, and template manifests — the pseudo-module writes nothing", async () => {
    const ui = {
      showQuickPick: async () => {
        throw new Error("QuickPick must not open for zero-module manifests");
      },
      showInformationMessage: () => undefined,
      showErrorMessage: () => undefined,
    };
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-guard-"));
    try {
      // Absent manifest.
      assert.strictEqual((await pickModuleForAuthoring(root, ui)).kind, "none");
      // Both valid-empty forms + the canonical template.
      for (const text of ["modules: []\n", "modules:\n", MODULES_YAML_TEMPLATE]) {
        fs.mkdirSync(path.join(root, "docs"), { recursive: true });
        fs.writeFileSync(path.join(root, "docs", "modules.yaml"), text);
        const outcome = await pickModuleForAuthoring(root, ui);
        assert.strictEqual(outcome.kind, "none");
        assert.strictEqual(outcome.entry, null);
      }
    } finally {
      fs.rmSync(root, { recursive: true });
    }
  });

  test("provenance, pseudo path: a `none` resolution feeds the writer a null target and emits no module stamp", async () => {
    // Verification round 1, finding 2: couple the picker to the writer
    // so the guard proves provenance instead of assuming it. An absent
    // manifest resolves `none` -> the writer receives null/undefined ->
    // zero module output.
    //
    // Set 123 S3: writers 2 and 3 (the session-gen prompt and the planning
    // prompt) went with `wizard/`. The bootstrap spec render is the only
    // remaining writer that can emit a `module:` line at all, so it is the
    // only one this provenance pin can couple to.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-guard-pseudo-"));
    try {
      const ui = {
        showQuickPick: async () => {
          throw new Error("QuickPick must not open");
        },
        showInformationMessage: () => undefined,
        showErrorMessage: () => undefined,
      };
      const pick = await pickModuleForAuthoring(root, ui);
      assert.strictEqual(pick.kind, "none");
      assert.strictEqual(pick.entry, null);
      // The bootstrap spec render ({{MODULE_LINE}}).
      const spec = renderSpec(bundle, bootstrapCtx(pick.entry ?? undefined));
      assert.ok(!/^module:/m.test(spec));
    } finally {
      fs.rmSync(root, { recursive: true });
    }
  });

  test("provenance, declared-`default` path: the picker returns the manifest entry and the writer stamps exactly that slug", async () => {
    // The ONLY sanctioned route to a `module: default` stamp: an
    // operator-declared literal `default` manifest entry, auto-picked.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-guard-default-"));
    try {
      fs.mkdirSync(path.join(root, "docs"), { recursive: true });
      fs.writeFileSync(
        path.join(root, "docs", "modules.yaml"),
        "modules:\n  - slug: default\n    title: Declared Default\n",
      );
      const notices: string[] = [];
      const ui = {
        showQuickPick: async () => {
          throw new Error("QuickPick must not open for a single-module manifest");
        },
        showInformationMessage: (m: string) => void notices.push(m),
        showErrorMessage: () => undefined,
      };
      const pick = await pickModuleForAuthoring(root, ui);
      assert.strictEqual(pick.kind, "picked");
      const entry = pick.entry!;
      assert.strictEqual(entry.slug, "default", "the slug came from the manifest");
      assert.strictEqual(notices.length, 1, "the auto-pick is operator-visible");
      // The bootstrap spec render stamps the picked slug, and nothing else:
      // every `module:` line in the rendered spec is the slug the picker
      // returned, so a synthesized stamp cannot hide beside a legitimate one.
      const spec = renderSpec(bundle, bootstrapCtx(entry.slug));
      assert.ok(/^module: default\b/m.test(spec));
      const stamps = spec.match(/^module: [a-z0-9-]+/gm) ?? [];
      assert.ok(stamps.length > 0);
      assert.ok(
        stamps.every((s: string) => s === "module: default"),
        `every module: stamp is the picked slug, got: ${stamps.join(", ")}`,
      );
    } finally {
      fs.rmSync(root, { recursive: true });
    }
  });

  test("no writer path synthesizes a `default` manifest entry: the scaffold appends only the operator's slug", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-guard-scaffold-"));
    try {
      createModuleFixture(root, "greeter", "Greeter");
      const manifest = fs.readFileSync(path.join(root, "docs", "modules.yaml"), "utf8");
      assert.ok(!manifest.includes("slug: default"));
      const classified = classifyModulesManifest(root);
      assert.strictEqual(classified.kind, "present");
      assert.deepStrictEqual(
        (classified.kind === "present" ? classified.entries : []).map((e) => e.slug),
        ["greeter"],
      );
    } finally {
      fs.rmSync(root, { recursive: true });
    }
  });

  test("end-to-end from disk: a hand-written `module: default` under a manifest with no `default` slug reads as an undeclared stamp (fallback semantics)", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-guard-reader-"));
    try {
      fs.mkdirSync(path.join(root, "docs"), { recursive: true });
      fs.writeFileSync(
        path.join(root, "docs", "modules.yaml"),
        "modules:\n  - slug: billing\n",
      );
      const dir = path.join(root, "docs", "session-sets", "001-hand");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, "spec.md"),
        "# 001-hand\n\n## Session Set Configuration\n```yaml\n" +
          "tier: full\nrequiresUAT: false\nrequiresE2E: false\nmodule: default\n```\n",
      );
      const sets = readSessionSets(root);
      assert.strictEqual(sets.length, 1);
      assert.strictEqual(sets[0].module, null, "not validated (undeclared)");
      assert.strictEqual(sets[0].config.module, "default", "raw stamp preserved");
      const mods = computeVisibleModules(classifyModulesManifest(root), sets, NO_PLAN);
      assert.deepStrictEqual(
        mods.map((m) => [m.kind, m.slug]),
        [
          ["declared", "billing"],
          ["fallback", "default"],
        ],
        "fallback group named `default`, no pseudo row (no unstamped sets, no legacy plan)",
      );
    } finally {
      fs.rmSync(root, { recursive: true });
    }
  });
});

// ---------- Set 092 renderer assembly ----------

suite("Set 092 S1 — visible-module renderer assembly", () => {
  const extRoot = path.resolve(__dirname, "..", "..", "..");

  // Set 110 S2: the assembly moved out of `CustomSessionSetsView` into
  // `providers/moduleAssembly.ts`, which the native `TreeDataProvider`
  // also calls — the point being that the two Explorer surfaces shipped
  // side by side cannot disagree about which modules are visible. This
  // scan follows it there, and now additionally asserts that BOTH
  // consumers go through the shared function rather than re-deriving.
  test("the shipping assembly consumes computeVisibleModules", () => {
    const assembly = fs.readFileSync(
      path.join(extRoot, "src", "providers", "moduleAssembly.ts"),
      "utf8",
    );
    assert.ok(
      assembly.includes("computeVisibleModules("),
      "the assembly must consume the Set 091 model",
    );
    assert.ok(
      assembly.includes("mergeVisibleModules(byRoot)"),
      "root-scoped results must pass through the global merge",
    );
  });

  // Set 110 S3: there is one Explorer surface again. The webview's copy went
  // with the renderer, so the assertion narrows from "both surfaces agree" to
  // "the surviving surface still does not re-derive" — which is what keeps a
  // future second consumer from forking the logic again.
  test("the Explorer surface goes through the shared assembly", () => {
    for (const file of ["WorkExplorerTreeProvider.ts"]) {
      const src = fs.readFileSync(path.join(extRoot, "src", "providers", file), "utf8");
      assert.ok(
        src.includes("assembleVisibleModules("),
        `${file} must build its module list through the shared assembly, ` +
          `not re-derive one`,
      );
      assert.ok(
        !src.includes("computeVisibleModules("),
        `${file} re-derives the module list instead of calling the shared ` +
          `assembly — the two surfaces will drift`,
      );
    }
  });

  test("multi-root merge keeps declared/fallback identities separate and pseudo last", () => {
    const rootA = computeVisibleModules(
      present([entry("billing"), entry("ops")]),
      [stamped("a", "billing"), stamped("typo-a", "typo")],
      NO_PLAN,
    );
    const rootB = computeVisibleModules(
      present([entry("ops"), entry("billing")]),
      [stamped("b", "billing"), stamped("typo-b", "typo"), fakeSet({ name: "plain" })],
      NO_PLAN,
    );
    const merged = mergeVisibleModules([rootA, rootB]);
    assert.deepStrictEqual(
      merged.map((module) => [module.kind, module.slug, module.displayName, module.sets.length]),
      [
        ["declared", "billing", "Title of billing", 2],
        ["declared", "ops", "Title of ops", 0],
        ["fallback", "typo", "typo", 2],
        ["pseudo", null, "Unassigned", 1],
      ],
    );
    assert.deepStrictEqual(merged[2].warning, { code: "undeclared-slug", rawSlug: "typo" });
  });

  test("visible-module payload carries semantic kind and warning", () => {
    const modules = computeVisibleModules(INVALID, [stamped("bad", "typo")], NO_PLAN);
    const payload = buildVisibleModulePayloads(modules, (set) => ({
      slug: set.name,
    } as never));
    assert.strictEqual(payload[0].kind, "fallback");
    assert.deepStrictEqual(payload[0].warning, { code: "undeclared-slug", rawSlug: "typo" });
  });

  test("invalid manifest retains the last known good module snapshot only", () => {
    const prior = computeVisibleModules(
      present([entry("billing")]),
      [stamped("a", "billing")],
      NO_PLAN,
    );
    const invalidCurrent = computeVisibleModules(
      INVALID,
      [stamped("a", "billing")],
      NO_PLAN,
    );
    assert.deepStrictEqual(
      chooseRenderableModuleSnapshot(INVALID, invalidCurrent, prior),
      { modules: prior, retainedLastKnownGood: true },
    );

    const absentCurrent = computeVisibleModules(
      ABSENT,
      [stamped("a", "billing")],
      NO_PLAN,
    );
    assert.deepStrictEqual(
      chooseRenderableModuleSnapshot(ABSENT, absentCurrent, prior),
      { modules: absentCurrent, retainedLastKnownGood: false },
    );

    const empty = present([]);
    const emptyCurrent = computeVisibleModules(empty, [], NO_PLAN);
    assert.deepStrictEqual(
      chooseRenderableModuleSnapshot(empty, emptyCurrent, prior),
      { modules: emptyCurrent, retainedLastKnownGood: false },
    );
  });

  test("no surface recomputes the model outside the shared assembly", () => {
    // Set 110 S3: this test used to scan `client.js` for the webview's
    // module-rendering expressions (`mod.title || mod.slug || "Default"`,
    // `moduleWarningText(mod.warning)`). Set 123 S3 deleted that client
    // outright, so the scan now has exactly one renderer to police.
    //
    // What the test protects is the invariant that no RENDERER re-derives the
    // module model — that is how two surfaces drift. With one surface left it
    // reads as belt-and-braces, and it is kept precisely because the cheapest
    // way for drift to come back is a second renderer re-deriving the model
    // rather than consuming the assembly.
    const treeModel = fs.readFileSync(
      path.join(extRoot, "src", "providers", "workExplorerTreeModel.ts"),
      "utf8",
    );
    assert.ok(!treeModel.includes("computeVisibleModules("));
    // The display name is read from the assembled model, never re-derived
    // from slug/title fallbacks at the render site.
    assert.ok(treeModel.includes("module.displayName"));
  });

  test("legacy groupByModule semantics remain stable for callers outside the shipping renderer", () => {
    // The scanner still nulls unvalidated stamps for legacy callers of
    // groupByModule; the shipping renderer now uses computeVisibleModules.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-bytestable-"));
    try {
      fs.mkdirSync(path.join(root, "docs"), { recursive: true });
      fs.writeFileSync(
        path.join(root, "docs", "modules.yaml"),
        "modules:\n  - slug: billing\n",
      );
      const writeSet = (name: string, moduleLine: string) => {
        const dir = path.join(root, "docs", "session-sets", name);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(
          path.join(dir, "spec.md"),
          `# ${name}\n\n## Session Set Configuration\n\`\`\`yaml\n` +
            `tier: full\nrequiresUAT: false\nrequiresE2E: false\n${moduleLine}\`\`\`\n`,
        );
      };
      writeSet("001-b", "module: billing\n");
      writeSet("002-typo", "module: no-such-module\n");
      writeSet("003-plain", "");
      const sets = readSessionSets(root);
      const groups = groupByModule(sets);
      assert.deepStrictEqual(
        groups.map((g) => g.slug),
        ["billing", null],
        "legacy grouping: validated module + one implicit group",
      );
      assert.deepStrictEqual(
        groups[1].sets.map((s) => s.name),
        ["002-typo", "003-plain"],
      );
    } finally {
      fs.rmSync(root, { recursive: true });
    }
  });
});

// ---------- Set 100 S1: flattened module payload ----------
//
// The 093-era persistent `Plan` / `Session sets` child nodes (and the
// `deriveModuleChildren` / `planExists` machinery that fed them) are
// retired: plan/decomposition state is visible as the kind-typed sets
// themselves, and the status buckets are the module's DIRECT children.
// These pins hold the payload to the flattened contract.

/** A VisibleModule fixture. */
function vm(
  over: Partial<VisibleModule> &
    Pick<VisibleModule, "kind" | "slug" | "displayName">,
): VisibleModule {
  return { warning: null, planPath: null, sets: [], ...over };
}

suite("Set 100 S1 — flattened module payload (no child-state fields)", () => {
  const stubRow = (set: SessionSet) => ({ slug: set.name } as never);

  test("the payload carries buckets directly and NO plan / sessionSets child-state keys, for every module kind", () => {
    const payloads = buildVisibleModulePayloads(
      [
        vm({
          kind: "declared",
          slug: "billing",
          displayName: "Billing",
          planPath: "docs/modules/billing/project-plan.md",
          sets: [fakeSet({ name: "a" })],
        }),
        vm({
          kind: "fallback",
          slug: "typo",
          displayName: "typo",
          warning: { code: "undeclared-slug", rawSlug: "typo" },
          sets: [fakeSet({ name: "t1" })],
        }),
        vm({
          kind: "pseudo",
          slug: null,
          displayName: PSEUDO_MODULE_SOLE_NAME,
          planPath: LEGACY_ROOT_PLAN_REL,
          sets: [],
        }),
      ],
      stubRow,
    );
    for (const p of payloads) {
      assert.ok(!("plan" in p), `${p.slug || "pseudo"}: retired plan field leaked`);
      assert.ok(
        !("sessionSets" in p),
        `${p.slug || "pseudo"}: retired sessionSets field leaked`,
      );
      assert.ok(Array.isArray(p.buckets), "buckets are the module's direct children");
    }
  });

  test("a module with zero sets still ships its three default buckets (the landing zone for scaffolded lifecycle sets)", () => {
    const [p] = buildVisibleModulePayloads(
      [
        vm({
          kind: "declared",
          slug: "ops",
          displayName: "Ops",
          planPath: "docs/modules/ops/project-plan.md",
          sets: [],
        }),
      ],
      stubRow,
    );
    assert.deepStrictEqual(
      p.buckets.map((b) => [b.key, b.count]),
      [
        ["in-progress", 0],
        ["not-started", 0],
        ["complete", 0],
      ],
      "empty defaults render; Cancelled is omitted when empty (pre-087 contract)",
    );
  });

  test("mergeVisibleModules still combines sets across roots for every kind", () => {
    const rootA = [
      vm({
        kind: "declared",
        slug: "billing",
        displayName: "Billing",
        sets: [fakeSet({ name: "a" })],
      }),
      vm({
        kind: "pseudo",
        slug: null,
        displayName: PSEUDO_MODULE_SOLE_NAME,
        sets: [fakeSet({ name: "loose-a" })],
      }),
    ];
    const rootB = [
      vm({
        kind: "declared",
        slug: "billing",
        displayName: "Billing",
        sets: [fakeSet({ name: "b" })],
      }),
      vm({
        kind: "pseudo",
        slug: null,
        displayName: PSEUDO_MODULE_SOLE_NAME,
        sets: [],
      }),
    ];
    const merged = mergeVisibleModules([rootA, rootB]);
    assert.deepStrictEqual(
      merged.map((m) => [m.kind, m.sets.length]),
      [
        ["declared", 2],
        ["pseudo", 1],
      ],
    );
  });
});
