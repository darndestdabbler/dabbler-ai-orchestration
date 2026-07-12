// Set 060 S2 — the Getting Started form's three wired actions.
//
// Covers the durable contracts:
//   1. routeGettingStartedAction — pure dispatch + untrusted-input
//      narrowing (unknown action ignored, tier defaulted to "full",
//      parallel coerced to a strict boolean);
//   2. the structure-only scaffold path (spec D5) — engine files +
//      start-here only, NO starter session set, tier divergence and
//      skip-existing guard preserved;
//   3. renderStructureBootstrap / structureOnlyContext — exactly the
//      four structure artifacts, fully token-substituted;
//   4. buildSessionGenPrompt's parallel option (D4/D7) — worktree +
//      prerequisites guidance present iff the checkbox rode along;
//   5. importPlanFromFile / copyPlanningPrompt with an injected UI
//      (mocked VS Code surfaces).

import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  GettingStartedHandlers,
  asBudgetChoice,
  asVerificationModeRider,
  resolveVerificationMode,
  routeGettingStartedAction,
} from "../../commands/gettingStartedActions";
import { BudgetChoice } from "../../utils/budgetYaml";
import { scaffoldConsumerRepo } from "../../commands/gitScaffold";
import { FileOps } from "../../utils/aiRouterInstall";
import {
  TemplateBundle,
  loadTemplateBundle,
  renderStructureBootstrap,
  resolveBundledTemplateDir,
  structureOnlyContext,
  findUnsubstitutedTokens,
} from "../../utils/consumerBootstrap";
import { buildSessionGenPrompt } from "../../wizard/sessionGenPrompt";
import {
  PlanImportUi,
  copyPlanningPrompt,
  importPlanFromFile,
  openModulePlan,
} from "../../wizard/planImport";
import { GettingStartedActionMsg } from "../../types/sessionSetsWebviewProtocol";

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
const bundle: TemplateBundle = loadTemplateBundle(canonicalBundleDir());

// ---------- 1. routeGettingStartedAction ----------

interface CallLog {
  openFolder: number;
  buildStructure: Array<"full" | "lightweight">;
  // Set 063 S2: the narrowed budget rider build-structure forwards.
  buildStructureBudgets: Array<BudgetChoice | undefined>;
  // Set 081 S1: the narrowed seat-profile rider build-structure forwards.
  buildStructureProfiles: Array<string | undefined>;
  // Set 094: the Define-modules "Open modules.yaml" action (no riders).
  openModules: number;
  // Set 094 S2: the Define-modules "Copy AI decomposition prompt" action (D6).
  copyDecompositionPrompt: number;
}

function recordingHandlers(): { handlers: GettingStartedHandlers; calls: CallLog } {
  const calls: CallLog = {
    openFolder: 0,
    buildStructure: [],
    buildStructureBudgets: [],
    buildStructureProfiles: [],
    openModules: 0,
    copyDecompositionPrompt: 0,
  };
  const handlers: GettingStartedHandlers = {
    openFolder: async () => void calls.openFolder++,
    buildStructure: async (tier, budget, _verificationMode, transportProfile) => {
      calls.buildStructure.push(tier);
      calls.buildStructureBudgets.push(budget);
      calls.buildStructureProfiles.push(transportProfile);
    },
    openModules: async () => void calls.openModules++,
    copyDecompositionPrompt: async () => void calls.copyDecompositionPrompt++,
  };
  return { handlers, calls };
}

suite("routeGettingStartedAction — dispatch + narrowing (Set 060 S2)", () => {
  test("dispatches each known action to its handler (Set 094 S2: four actions)", async () => {
    const { handlers, calls } = recordingHandlers();
    for (const action of [
      "open-folder",
      "build-structure",
      "open-modules",
      "copy-decomposition-prompt",
    ] as const) {
      const handled = await routeGettingStartedAction(
        // Set 063 S2: Full build-structure REQUIRES a budget rider (the
        // fail-closed R1 fix), so the dispatch probe carries one.
        action === "build-structure"
          ? { type: "gettingStartedAction", action, budgetUsd: 25 }
          : { type: "gettingStartedAction", action },
        handlers,
      );
      assert.strictEqual(handled, true, action);
    }
    assert.strictEqual(calls.openFolder, 1);
    assert.strictEqual(calls.buildStructure.length, 1);
    assert.strictEqual(calls.openModules, 1);
    assert.strictEqual(calls.copyDecompositionPrompt, 1);
  });

  test("open-modules dispatches to the openModules handler (no riders)", async () => {
    const { handlers, calls } = recordingHandlers();
    const handled = await routeGettingStartedAction(
      { type: "gettingStartedAction", action: "open-modules" },
      handlers,
    );
    assert.strictEqual(handled, true);
    assert.strictEqual(calls.openModules, 1);
    // It never touches the scaffold path.
    assert.strictEqual(calls.buildStructure.length, 0);
  });

  test("copy-decomposition-prompt dispatches to the copyDecompositionPrompt handler (Set 094 S2, no riders)", async () => {
    const { handlers, calls } = recordingHandlers();
    const handled = await routeGettingStartedAction(
      { type: "gettingStartedAction", action: "copy-decomposition-prompt" },
      handlers,
    );
    assert.strictEqual(handled, true);
    assert.strictEqual(calls.copyDecompositionPrompt, 1);
    // It never touches the scaffold or the open-modules path.
    assert.strictEqual(calls.buildStructure.length, 0);
    assert.strictEqual(calls.openModules, 0);
  });

  test("forwards a valid tier rider; absent defaults to full; unknown is REJECTED (Set 077 A11)", async () => {
    const { handlers, calls } = recordingHandlers();
    // Budget rider present throughout: tier narrowing is the concern
    // here, and Full without a budget is rejected since the R1 fix.
    const post = (tier?: unknown) =>
      routeGettingStartedAction(
        {
          type: "gettingStartedAction",
          action: "build-structure",
          tier,
          budgetUsd: 25,
        } as GettingStartedActionMsg,
        handlers,
      );
    assert.strictEqual(await post("lightweight"), true);
    assert.strictEqual(await post("full"), true);
    assert.strictEqual(await post(undefined), true);   // absent -> the radio default
    assert.strictEqual(await post("FULL"), true);      // Set 077: case-insensitive, accepted
    // Set 077 (A11): a present-but-unrecognized rider is rejected loud —
    // no handler call, action reports unhandled — never a silent Full.
    assert.strictEqual(await post(42), false);
    assert.strictEqual(await post("lite"), false);
    assert.deepStrictEqual(calls.buildStructure, [
      "lightweight",
      "full",
      "full",
      "full",
    ]);
  });

  test("forwards narrowed budget riders on build-structure (Set 063 S2)", async () => {
    const { handlers, calls } = recordingHandlers();
    const post = (riders: Partial<GettingStartedActionMsg>) =>
      routeGettingStartedAction(
        {
          type: "gettingStartedAction",
          action: "build-structure",
          ...riders,
        } as GettingStartedActionMsg,
        handlers,
      );
    assert.strictEqual(await post({ tier: "full", budgetUsd: 25 }), true);
    assert.strictEqual(
      await post({ tier: "full", budgetUsd: 0, zeroBudgetMethod: "skipped" }),
      true,
    );
    // Lightweight drops the rider but still builds (no budget file).
    assert.strictEqual(await post({ tier: "lightweight", budgetUsd: 25 }), true);
    assert.deepStrictEqual(calls.buildStructureBudgets, [
      { thresholdUsd: 25 },
      { thresholdUsd: 0, zeroMethod: "skipped" },
      undefined,
    ]);
  });

  test("REJECTS a Full build-structure whose budget rider does not narrow (R1 fail-closed fix)", async () => {
    const { handlers, calls } = recordingHandlers();
    const post = (riders: Partial<GettingStartedActionMsg>) =>
      routeGettingStartedAction(
        {
          type: "gettingStartedAction",
          action: "build-structure",
          ...riders,
        } as GettingStartedActionMsg,
        handlers,
      );
    for (const riders of [
      { tier: "full" as const },                                   // no rider at all
      { tier: "full" as const, budgetUsd: -5 },                    // negative
      { tier: "full" as const, budgetUsd: "25" as unknown as number }, // wrong type
      { tier: "full" as const, budgetUsd: 0 },                     // $0 without the pick
      {},                                                          // tier defaults to full
    ]) {
      const handled = await post(riders);
      assert.strictEqual(handled, false, JSON.stringify(riders));
    }
    assert.strictEqual(
      calls.buildStructure.length,
      0,
      "no handler may run for a rejected Full build",
    );
  });

  test("ignores unknown actions (returns false, no handler runs)", async () => {
    const { handlers, calls } = recordingHandlers();
    const handled = await routeGettingStartedAction(
      { type: "gettingStartedAction", action: "rm-rf" } as unknown as GettingStartedActionMsg,
      handlers,
    );
    assert.strictEqual(handled, false);
    assert.strictEqual(calls.openFolder, 0);
    assert.strictEqual(calls.buildStructure.length, 0);
    assert.strictEqual(calls.openModules, 0);
    assert.strictEqual(calls.copyDecompositionPrompt, 0);
  });
});

// ---------- 1b. asBudgetChoice narrowing (Set 063 S2, spec D1) ----------

suite("asBudgetChoice — untrusted budget-rider narrowing", () => {
  const msg = (riders: Partial<GettingStartedActionMsg>): GettingStartedActionMsg =>
    ({
      type: "gettingStartedAction",
      action: "build-structure",
      ...riders,
    }) as GettingStartedActionMsg;

  test("valid amounts narrow on the Full tier", () => {
    assert.deepStrictEqual(asBudgetChoice(msg({ budgetUsd: 25 }), "full"), {
      thresholdUsd: 25,
    });
    assert.deepStrictEqual(
      asBudgetChoice(msg({ budgetUsd: 0, zeroBudgetMethod: "manual-via-other-engine" }), "full"),
      { thresholdUsd: 0, zeroMethod: "manual-via-other-engine" },
    );
  });

  test("Lightweight always narrows to undefined (never writes the file)", () => {
    assert.strictEqual(asBudgetChoice(msg({ budgetUsd: 25 }), "lightweight"), undefined);
  });

  test("malformed riders narrow to undefined (the router then fail-closes on Full)", () => {
    for (const riders of [
      {},
      { budgetUsd: -5 },
      { budgetUsd: NaN },
      { budgetUsd: "25" as unknown as number },
      { budgetUsd: 0 }, // $0 without the required zero-rule pick
      { budgetUsd: 0, zeroBudgetMethod: "api" as unknown as "skipped" },
    ]) {
      assert.strictEqual(
        asBudgetChoice(msg(riders), "full"),
        undefined,
        JSON.stringify(riders),
      );
    }
  });

  test("a zero-rule rider on a positive amount is ignored, not recorded", () => {
    assert.deepStrictEqual(
      asBudgetChoice(msg({ budgetUsd: 25, zeroBudgetMethod: "skipped" }), "full"),
      { thresholdUsd: 25 },
    );
  });
});

// ---------- 1c. Set 081 S1: budget rider scoped to the Direct-API ----------
// sub-choice. The budget governs metered provider-API spend, which the
// copilot-cli seat profile excludes by design — a Copilot-seat Build
// legitimately carries no budget riders (the webview never renders the
// block there) and must NOT be fail-closed rejected, while a budget
// rider that does arrive under copilot-cli (hostile/buggy webview) is
// dropped, never written.

suite("asBudgetChoice — Copilot seat drops the budget rider (Set 081 S1)", () => {
  const msg = (riders: Partial<GettingStartedActionMsg>): GettingStartedActionMsg =>
    ({
      type: "gettingStartedAction",
      action: "build-structure",
      ...riders,
    }) as GettingStartedActionMsg;

  test("copilot-cli drops even a valid rider (never writes budget.yaml)", () => {
    assert.strictEqual(
      asBudgetChoice(msg({ budgetUsd: 25 }), "full", "copilot-cli"),
      undefined,
    );
    assert.strictEqual(
      asBudgetChoice(
        msg({ budgetUsd: 0, zeroBudgetMethod: "skipped" }),
        "full",
        "copilot-cli",
      ),
      undefined,
    );
  });

  test("api / absent profile keep the Set 063 narrowing unchanged", () => {
    assert.deepStrictEqual(
      asBudgetChoice(msg({ budgetUsd: 25 }), "full", "api"),
      { thresholdUsd: 25 },
    );
    assert.deepStrictEqual(asBudgetChoice(msg({ budgetUsd: 25 }), "full"), {
      thresholdUsd: 25,
    });
  });
});

suite("routeGettingStartedAction — Full+copilot build matrix (Set 081 S1)", () => {
  const post = (
    handlers: GettingStartedHandlers,
    riders: Partial<GettingStartedActionMsg>,
  ) =>
    routeGettingStartedAction(
      {
        type: "gettingStartedAction",
        action: "build-structure",
        ...riders,
      } as GettingStartedActionMsg,
      handlers,
    );

  test("Full+copilot WITHOUT budget riders dispatches (no fail-closed reject)", async () => {
    const { handlers, calls } = recordingHandlers();
    const handled = await post(handlers, {
      tier: "full",
      transportProfile: "copilot-cli",
    });
    assert.strictEqual(handled, true, "a Copilot-seat Build has no budget to demand");
    assert.deepStrictEqual(calls.buildStructure, ["full"]);
    assert.deepStrictEqual(calls.buildStructureBudgets, [undefined]);
    assert.deepStrictEqual(calls.buildStructureProfiles, ["copilot-cli"]);
  });

  test("Full+copilot WITH budget riders dispatches with the budget dropped", async () => {
    const { handlers, calls } = recordingHandlers();
    const handled = await post(handlers, {
      tier: "full",
      transportProfile: "copilot-cli",
      budgetUsd: 25,
    });
    assert.strictEqual(handled, true);
    assert.deepStrictEqual(calls.buildStructureBudgets, [undefined]);
  });

  test("Full+api (explicit or defaulted) without a budget stays REJECTED fail-closed", async () => {
    const { handlers, calls } = recordingHandlers();
    assert.strictEqual(
      await post(handlers, { tier: "full", transportProfile: "api" }),
      false,
    );
    assert.strictEqual(await post(handlers, { tier: "full" }), false);
    assert.strictEqual(calls.buildStructure.length, 0);
  });

  test("Full+api with a valid budget still dispatches with both riders", async () => {
    const { handlers, calls } = recordingHandlers();
    const handled = await post(handlers, {
      tier: "full",
      transportProfile: "api",
      budgetUsd: 25,
    });
    assert.strictEqual(handled, true);
    assert.deepStrictEqual(calls.buildStructureBudgets, [{ thresholdUsd: 25 }]);
    assert.deepStrictEqual(calls.buildStructureProfiles, ["api"]);
  });
});

// ---------- 2. structure-only scaffold (spec D5) ----------

/** Minimal in-memory FileOps over a normalized-path map. */
function memFileOps(seed: Record<string, string> = {}): {
  ops: FileOps;
  store: Map<string, string>;
} {
  const store = new Map<string, string>();
  const norm = (p: string) => p.replace(/\\/g, "/");
  for (const [k, v] of Object.entries(seed)) store.set(norm(k), v);
  const ops: FileOps = {
    exists: (p) => store.has(norm(p)),
    readFile: (p) => store.get(norm(p)) ?? "",
    writeFile: (p, c) => void store.set(norm(p), c),
    writeFileExclusive: (p, c) => {
      const k = norm(p);
      if (store.has(k)) {
        const e: NodeJS.ErrnoException = new Error(`EEXIST: ${p} exists`);
        e.code = "EEXIST";
        throw e;
      }
      store.set(k, c);
    },
    mkdirp: () => {},
    copyDir: () => {},
    removeRecursive: (p) => void store.delete(norm(p)),
    mkdtemp: (prefix) => `/tmp/${prefix}0`,
  };
  return { ops, store };
}

const PROJECT = "/repo";
const cfgPath = path.join(PROJECT, "ai_router", "router-config.yaml").replace(/\\/g, "/");

suite("scaffoldConsumerRepo — structureOnly (Set 060 S2, spec D5)", () => {
  test("writes exactly the structure artifacts and NO starter session set", async () => {
    const { ops, store } = memFileOps();
    const result = await scaffoldConsumerRepo({
      projectDir: PROJECT,
      ctx: structureOnlyContext("repo", "full", "2026-06-10"),
      bundle,
      fileOps: ops,
      structureOnly: true,
      installRouter: async () => ({ ok: true, message: "installed" }),
    });
    // Thirteen writes: eleven structure artifacts (the five Set-060
    // structure artifacts, the three Set 064 D7 docs/planning/
    // guidance-lifecycle starters, the Set 077 S4 cross-provider
    // verification doc, and the two Set 087 S3 ownership/CI teaching
    // templates), the Set 077 S2 durable tier marker, and the Set 094
    // docs/modules.yaml ensure-write. (The verification-mode marker is
    // Lightweight-only as of Set 082; this is a Full scaffold.)
    assert.strictEqual(result.written.length, 13);
    assert.ok(store.has("/repo/CLAUDE.md"));
    assert.ok(store.has("/repo/AGENTS.md"));
    assert.ok(store.has("/repo/GEMINI.md"));
    assert.ok(store.has("/repo/docs/dabbler/start-here.md"));
    assert.ok(store.has("/repo/docs/dabbler/getting-started.md"));
    assert.ok(store.has("/repo/docs/dabbler/cross-provider-verification.md"));
    assert.ok(store.has("/repo/docs/planning/lessons-learned.md"));
    assert.ok(store.has("/repo/docs/planning/project-guidance.md"));
    assert.ok(store.has("/repo/docs/planning/lessons-archive.md"));
    // Set 087 S3 (ruling Q3): ownership + monorepo-CI teaching templates.
    assert.ok(store.has("/repo/.github/CODEOWNERS"));
    assert.ok(store.has("/repo/.github/workflows/monorepo-ci.yml"));
    // Set 094 (adjudication A): the scaffold is one of the explicit-action
    // ensure-write sites — docs/modules.yaml is created from the canonical
    // template (the sole writer; not part of the static template bundle).
    assert.ok(store.has("/repo/docs/modules.yaml"), "modules.yaml ensured");
    const manifest = store.get("/repo/docs/modules.yaml")!;
    assert.ok(manifest.startsWith("# docs/modules.yaml"), "template header");
    assert.ok(manifest.includes("modules: []"), "valid-empty modules list");
    assert.ok(manifest.includes("# - slug: payment-api"), "commented examples");
    // The whole point of structureOnly: no docs/session-sets path is
    // materialized, so the dual-mode Explorer stays on the form
    // (hasAnySets keys on a renderable set) and no unnamed starter set
    // is seeded (the D5 no-title-prompt rule).
    for (const key of store.keys()) {
      assert.ok(
        !key.includes("/docs/session-sets/"),
        `structureOnly must not write under docs/session-sets — wrote ${key}`,
      );
    }
  });

  test("Lightweight structureOnly still removes the seeded router-config.yaml", async () => {
    const { ops, store } = memFileOps();
    const result = await scaffoldConsumerRepo({
      projectDir: PROJECT,
      ctx: structureOnlyContext("repo", "lightweight", "2026-06-10"),
      bundle,
      fileOps: ops,
      structureOnly: true,
      installRouter: async () => {
        store.set(cfgPath, "models: {}\n");
        return { ok: true, message: "installed" };
      },
    });
    assert.strictEqual(result.routerConfigRemoved, true);
    assert.ok(!store.has(cfgPath), "Lightweight must remove the seeded router config");
  });

  test("skip-existing guard still applies on the structureOnly path", async () => {
    const { ops, store } = memFileOps({ "/repo/CLAUDE.md": "PRE-EXISTING" });
    const result = await scaffoldConsumerRepo({
      projectDir: PROJECT,
      ctx: structureOnlyContext("repo", "full", "2026-06-10"),
      bundle,
      fileOps: ops,
      structureOnly: true,
      installRouter: async () => ({ ok: true, message: "installed" }),
    });
    assert.deepStrictEqual(result.skipped, ["CLAUDE.md"]);
    assert.strictEqual(store.get("/repo/CLAUDE.md"), "PRE-EXISTING");
    // 10 artifacts + tier marker + modules.yaml (Full: no verification-mode
    // marker, Set 082; Set 094: + the modules.yaml ensure-write).
    assert.strictEqual(result.written.length, 12);
  });

  test("Set 094: a pre-existing docs/modules.yaml is kept, never overwritten (skipped)", async () => {
    const existingManifest = "modules:\n  - slug: greeter\n    title: Greeter\n";
    const { ops, store } = memFileOps({
      "/repo/docs/modules.yaml": existingManifest,
    });
    const result = await scaffoldConsumerRepo({
      projectDir: PROJECT,
      ctx: structureOnlyContext("repo", "full", "2026-07-12"),
      bundle,
      fileOps: ops,
      structureOnly: true,
      installRouter: async () => ({ ok: true, message: "installed" }),
    });
    assert.ok(
      result.skipped.includes("docs/modules.yaml"),
      "an existing manifest is reported skipped, not written",
    );
    assert.ok(!result.written.includes("docs/modules.yaml"));
    assert.strictEqual(
      store.get("/repo/docs/modules.yaml"),
      existingManifest,
      "the operator's manifest survives the scaffold byte-for-byte",
    );
  });
});

suite("renderStructureBootstrap (Set 060 S2)", () => {
  test("renders the eleven structure files, fully token-substituted", () => {
    const { files } = renderStructureBootstrap(
      bundle,
      structureOnlyContext("my-app", "full", "2026-06-10"),
    );
    assert.deepStrictEqual(
      Object.keys(files).sort(),
      [
        // Set 087 S3 (ruling Q3): ownership + monorepo-CI templates.
        ".github/CODEOWNERS",
        ".github/workflows/monorepo-ci.yml",
        "AGENTS.md",
        "CLAUDE.md",
        "GEMINI.md",
        // Set 077 S4 (Feature 3): the engine-facing verification doc.
        "docs/dabbler/cross-provider-verification.md",
        // Set 060 S3 (D8): the static Getting Started teaching doc.
        "docs/dabbler/getting-started.md",
        "docs/dabbler/start-here.md",
        // Set 064 (D7): guidance-lifecycle starters under docs/planning/.
        "docs/planning/lessons-archive.md",
        "docs/planning/lessons-learned.md",
        "docs/planning/project-guidance.md",
      ].sort(),
    );
    for (const [rel, content] of Object.entries(files)) {
      assert.deepStrictEqual(findUnsubstitutedTokens(content), [], rel);
    }
    assert.ok(
      files["docs/dabbler/start-here.md"].includes("my-app"),
      "start-here must carry the repo name",
    );
  });
});

// ---------- 3. buildSessionGenPrompt parallel + tier options (D4/D7, S4) ----------

suite("buildSessionGenPrompt — parallel option (Set 060 S2)", () => {
  const base = buildSessionGenPrompt(bundle);
  const parallel = buildSessionGenPrompt(bundle, { parallel: true });
  const explicitlyOff = buildSessionGenPrompt(bundle, { parallel: false });

  test("parallel: true adds worktree + prerequisites decomposition guidance", () => {
    assert.ok(parallel.includes("git worktrees"));
    assert.ok(parallel.includes("prerequisites:"));
    assert.ok(parallel.includes("Decompose for parallel execution"));
  });

  test("unchecked / omitted leaves the prompt without parallel guidance", () => {
    for (const p of [base, explicitlyOff]) {
      assert.ok(!p.includes("Decompose for parallel execution"));
      assert.ok(!p.includes("git worktrees"));
    }
  });

  test("parallel guidance does not displace the canonical-shape requirements", () => {
    assert.ok(/schemaVersion.*4/.test(parallel));
    assert.ok(parallel.includes("NNN-"));
    assert.ok(parallel.includes("docs/planning/project-plan.md"));
  });
});

suite("buildSessionGenPrompt — tier option (Set 060 S4 UAT feedback)", () => {
  const noTier = buildSessionGenPrompt(bundle);
  const light = buildSessionGenPrompt(bundle, { tier: "lightweight" });
  const full = buildSessionGenPrompt(bundle, { tier: "full" });

  test("tier: lightweight renders Lightweight exemplars + operator-tier guidance", () => {
    assert.ok(/tier:\s*lightweight/.test(light));
    assert.ok(light.includes("3-session Lightweight set"));
    assert.ok(light.includes("operator selected the **lightweight** tier"));
  });

  test("tier: full renders Full exemplars + operator-tier guidance", () => {
    assert.ok(/tier:\s*full/.test(full));
    assert.ok(full.includes("3-session Full set"));
    assert.ok(full.includes("operator selected the **full** tier"));
  });

  test("omitted tier keeps the Full exemplar and stays generic (palette command)", () => {
    assert.ok(/tier:\s*full/.test(noTier));
    assert.ok(!noTier.includes("operator selected the"));
  });
});

// ---------- 4. plan import handlers (mocked VS Code UI) ----------

interface UiLog {
  clipboard: string[];
  infos: string[];
  errors: string[];
  opened: Array<{ command: string; args: unknown[] }>;
}

function makeUi(over: Partial<PlanImportUi>, log: UiLog): PlanImportUi {
  return {
    showOpenDialog: async () => undefined,
    // Set 087 S3: the module picker's QuickPick — no-manifest tests never
    // reach it (pickModuleForAuthoring resolves "none" first).
    showQuickPick: async () => undefined,
    showWarningMessage: (async () => undefined) as PlanImportUi["showWarningMessage"],
    showInformationMessage: (async (m: string) => {
      log.infos.push(m);
      return undefined;
    }) as PlanImportUi["showInformationMessage"],
    showErrorMessage: (async (m: string) => {
      log.errors.push(m);
      return undefined;
    }) as PlanImportUi["showErrorMessage"],
    writeClipboard: async (text) => void log.clipboard.push(text),
    executeCommand: async (command, ...args) => void log.opened.push({ command, args }),
    workspaceRoot: () => undefined,
    ...over,
  };
}

function freshLog(): UiLog {
  return { clipboard: [], infos: [], errors: [], opened: [] };
}

suite("planImport handlers (Set 060 S2)", () => {
  test("copyPlanningPrompt copies the authoring prompt and toasts", async () => {
    const log = freshLog();
    await copyPlanningPrompt(makeUi({}, log));
    assert.strictEqual(log.clipboard.length, 1);
    assert.ok(log.clipboard[0].includes("project plan"));
    assert.ok(log.clipboard[0].includes("docs/planning/project-plan.md"));
    assert.strictEqual(log.infos.length, 1);
  });

  test("importPlanFromFile returns false when the picker is cancelled", async () => {
    const log = freshLog();
    const ok = await importPlanFromFile(makeUi({}, log));
    assert.strictEqual(ok, false);
    assert.strictEqual(log.errors.length, 0);
  });

  test("importPlanFromFile errors (false) when no workspace folder is open", async () => {
    const log = freshLog();
    const src = path.join(os.tmpdir(), `gs-plan-src-${process.pid}.md`);
    fs.writeFileSync(src, "# plan\n");
    try {
      const ok = await importPlanFromFile(
        makeUi(
          {
            showOpenDialog: (async () => [{ fsPath: src }]) as unknown as PlanImportUi["showOpenDialog"],
            workspaceRoot: () => undefined,
          },
          log,
        ),
      );
      assert.strictEqual(ok, false);
      assert.strictEqual(log.errors.length, 1);
    } finally {
      fs.rmSync(src, { force: true });
    }
  });

  test("importPlanFromFile copies the picked file into docs/planning/project-plan.md", async () => {
    const log = freshLog();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gs-import-root-"));
    const src = path.join(os.tmpdir(), `gs-plan-src-${process.pid}-ok.md`);
    fs.writeFileSync(src, "# the plan\nPLAN_BODY_MARKER\n");
    try {
      const ok = await importPlanFromFile(
        makeUi(
          {
            showOpenDialog: (async () => [{ fsPath: src }]) as unknown as PlanImportUi["showOpenDialog"],
            workspaceRoot: () => root,
          },
          log,
        ),
      );
      assert.strictEqual(ok, true);
      const dest = path.join(root, "docs", "planning", "project-plan.md");
      assert.ok(fs.existsSync(dest));
      assert.ok(fs.readFileSync(dest, "utf8").includes("PLAN_BODY_MARKER"));
      assert.strictEqual(log.opened.length, 1, "imported plan opens in the editor");
      assert.strictEqual(log.opened[0].command, "vscode.open");
    } finally {
      fs.rmSync(src, { force: true });
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("importPlanFromFile refuses to overwrite without confirmation", async () => {
    const log = freshLog();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gs-import-keep-"));
    const destDir = path.join(root, "docs", "planning");
    fs.mkdirSync(destDir, { recursive: true });
    const dest = path.join(destDir, "project-plan.md");
    fs.writeFileSync(dest, "ORIGINAL\n");
    const src = path.join(os.tmpdir(), `gs-plan-src-${process.pid}-ow.md`);
    fs.writeFileSync(src, "REPLACEMENT\n");
    try {
      const ok = await importPlanFromFile(
        makeUi(
          {
            showOpenDialog: (async () => [{ fsPath: src }]) as unknown as PlanImportUi["showOpenDialog"],
            workspaceRoot: () => root,
            // Operator dismisses the modal — no "Overwrite" answer.
            showWarningMessage: (async () => undefined) as PlanImportUi["showWarningMessage"],
          },
          log,
        ),
      );
      assert.strictEqual(ok, false);
      assert.strictEqual(fs.readFileSync(dest, "utf8"), "ORIGINAL\n");
    } finally {
      fs.rmSync(src, { force: true });
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------
// Set 087 Session 3 (ruling Q4) — the plan-authoring flows are
// module-aware: with a module manifest the prompt/import target the
// picked module's plan (one module auto-selects with a notice; Esc on
// the multi-module picker cancels); with no manifest both flows are the
// unchanged repo-level pre-087 behavior (pinned by the Set 060 suite
// above, whose fixtures have no docs/modules.yaml).
// ---------------------------------------------------------------------

suite("planImport — module-aware targeting (Set 087 S3)", () => {
  function moduleRoot(prefix: string, manifest: string): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    fs.mkdirSync(path.join(root, "docs"), { recursive: true });
    fs.writeFileSync(path.join(root, "docs", "modules.yaml"), manifest, "utf8");
    return root;
  }
  const ONE_MODULE = "modules:\n  - slug: greeter\n    title: Greeter\n";
  const TWO_MODULES =
    "modules:\n" +
    "  - slug: greeter\n    title: Greeter\n" +
    "  - slug: clock\n    title: Clock\n    planPath: docs/plans/clock.md\n";

  test("copyPlanningPrompt: single module auto-targets its plan with the notice", async () => {
    const log = freshLog();
    const root = moduleRoot("gs-mod-prompt-", ONE_MODULE);
    try {
      await copyPlanningPrompt(makeUi({ workspaceRoot: () => root }, log));
      assert.strictEqual(log.clipboard.length, 1);
      assert.ok(log.clipboard[0].includes("docs/modules/greeter/project-plan.md"));
      assert.ok(log.clipboard[0].includes('the "Greeter" module'));
      assert.ok(!log.clipboard[0].includes("docs/planning/project-plan.md"));
      // Two toasts: the auto-select notice + the copied confirmation.
      assert.strictEqual(log.infos.length, 2);
      assert.ok(log.infos[0].includes("greeter"));
      assert.ok(log.infos[1].includes("docs/modules/greeter/project-plan.md"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("copyPlanningPrompt: Esc on the multi-module picker copies nothing", async () => {
    const log = freshLog();
    const root = moduleRoot("gs-mod-cancel-", TWO_MODULES);
    try {
      await copyPlanningPrompt(
        makeUi(
          { workspaceRoot: () => root, showQuickPick: async () => undefined },
          log,
        ),
      );
      assert.strictEqual(log.clipboard.length, 0);
      assert.strictEqual(log.infos.length, 0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  // Set 093 S2 (routed ruling D1): a row/context invocation carries its
  // module — copyPlanningPrompt must target that module WITHOUT ever opening
  // the QuickPick, even when the manifest holds >= 2 modules.
  test("copyPlanningPrompt: a preselected module targets its plan with NO QuickPick (row path)", async () => {
    const log = freshLog();
    const root = moduleRoot("gs-mod-preselect-", TWO_MODULES);
    let quickPickCalls = 0;
    try {
      await copyPlanningPrompt(
        makeUi(
          {
            workspaceRoot: () => root,
            showQuickPick: async () => {
              quickPickCalls++;
              return undefined;
            },
          },
          log,
        ),
        { preselectedSlug: "clock" },
      );
      assert.strictEqual(quickPickCalls, 0, "no module QuickPick on a row path");
      assert.strictEqual(log.clipboard.length, 1);
      assert.ok(log.clipboard[0].includes("docs/plans/clock.md"));
      assert.ok(log.clipboard[0].includes('the "Clock" module'));
      // No auto-select notice either — only the copied-confirmation toast.
      assert.strictEqual(log.infos.length, 1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  // Set 093 S2 (routed ruling D2): a pseudo row's `preselectedSlug: ""` is
  // repo-level — the module-less plan, no QuickPick even with >= 2 modules.
  test("copyPlanningPrompt: empty preselect ('') is repo-level with NO QuickPick (pseudo row)", async () => {
    const log = freshLog();
    const root = moduleRoot("gs-mod-preselect-empty-", TWO_MODULES);
    let quickPickCalls = 0;
    try {
      await copyPlanningPrompt(
        makeUi(
          {
            workspaceRoot: () => root,
            showQuickPick: async () => {
              quickPickCalls++;
              return undefined;
            },
          },
          log,
        ),
        { preselectedSlug: "" },
      );
      assert.strictEqual(quickPickCalls, 0);
      assert.strictEqual(log.clipboard.length, 1);
      assert.ok(log.clipboard[0].includes("docs/planning/project-plan.md"));
      assert.ok(!log.clipboard[0].includes("module"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("importPlanFromFile: the picked module's planPath is the destination", async () => {
    const log = freshLog();
    const root = moduleRoot("gs-mod-import-", TWO_MODULES);
    const src = path.join(os.tmpdir(), `gs-mod-src-${process.pid}.md`);
    fs.writeFileSync(src, "# clock plan\nCLOCK_PLAN_MARKER\n");
    try {
      const ok = await importPlanFromFile(
        makeUi(
          {
            workspaceRoot: () => root,
            // Pick the second row (clock, with an explicit planPath).
            showQuickPick: async (items) => items[1],
            showOpenDialog: (async () => [
              { fsPath: src },
            ]) as unknown as PlanImportUi["showOpenDialog"],
          },
          log,
        ),
      );
      assert.strictEqual(ok, true);
      const dest = path.join(root, "docs", "plans", "clock.md");
      assert.ok(fs.existsSync(dest), "plan must land at the module's planPath");
      assert.ok(fs.readFileSync(dest, "utf8").includes("CLOCK_PLAN_MARKER"));
      assert.ok(
        !fs.existsSync(path.join(root, "docs", "planning", "project-plan.md")),
        "repo-level plan path must stay untouched",
      );
      assert.ok(log.infos.some((m) => m.includes("docs/plans/clock.md")));
    } finally {
      fs.rmSync(src, { force: true });
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  // Set 093 S2 verification R2 (Major): `Open Plan` must have a Command
  // Palette mirror — the palette path resolves the selected module via the
  // QuickPick and opens ITS plan file.
  test("openModulePlan (palette path): the QuickPicked module's plan opens", async () => {
    const log = freshLog();
    const root = moduleRoot("gs-mod-openplan-", TWO_MODULES);
    // Materialize the clock module's plan so open (not the import fallback)
    // fires.
    const clockPlan = path.join(root, "docs", "plans", "clock.md");
    fs.mkdirSync(path.dirname(clockPlan), { recursive: true });
    fs.writeFileSync(clockPlan, "# clock plan\n");
    try {
      await openModulePlan(
        makeUi(
          {
            workspaceRoot: () => root,
            showQuickPick: async (items) => items[1], // clock
          },
          log,
        ),
      );
      const opened = log.opened.find((o) => o.command === "vscode.open");
      assert.ok(opened, "vscode.open must fire");
      const uri = opened!.args[0] as { fsPath: string };
      assert.ok(uri.fsPath.endsWith(path.join("docs", "plans", "clock.md")));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  // Set 093 S2: the row-path Open Plan carries its module (no QuickPick).
  test("openModulePlan (row path): a preselected module opens its plan with NO QuickPick", async () => {
    const log = freshLog();
    const root = moduleRoot("gs-mod-openplan-row-", TWO_MODULES);
    const clockPlan = path.join(root, "docs", "plans", "clock.md");
    fs.mkdirSync(path.dirname(clockPlan), { recursive: true });
    fs.writeFileSync(clockPlan, "# clock plan\n");
    let quickPickCalls = 0;
    try {
      await openModulePlan(
        makeUi(
          {
            workspaceRoot: () => root,
            showQuickPick: async () => {
              quickPickCalls++;
              return undefined;
            },
          },
          log,
        ),
        { preselectedSlug: "clock" },
      );
      assert.strictEqual(quickPickCalls, 0);
      const opened = log.opened.find((o) => o.command === "vscode.open");
      assert.ok(opened, "vscode.open must fire");
      assert.ok(
        (opened!.args[0] as { fsPath: string }).fsPath.endsWith(
          path.join("docs", "plans", "clock.md"),
        ),
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  // Set 091 S1 (verdict amendment 3): a valid EMPTY manifest —
  // `modules: []` or a bare `modules:` — behaves exactly like an absent
  // one: repo-level prompt/destination, no module notice, no QuickPick,
  // no error. The pre-091 code aborted the bare form as invalid.
  test("copyPlanningPrompt: valid-empty manifests behave exactly like no manifest (Set 091 S1)", async () => {
    // The no-manifest baseline the empty forms must match byte-for-byte.
    const baseline = freshLog();
    const bareRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gs-mod-empty-baseline-"));
    try {
      await copyPlanningPrompt(makeUi({ workspaceRoot: () => bareRoot }, baseline));
    } finally {
      fs.rmSync(bareRoot, { recursive: true, force: true });
    }
    assert.strictEqual(baseline.clipboard.length, 1);

    for (const empty of ["modules: []\n", "modules:\n"]) {
      const log = freshLog();
      const root = moduleRoot("gs-mod-empty-prompt-", empty);
      let quickPickShown = false;
      try {
        await copyPlanningPrompt(
          makeUi(
            {
              workspaceRoot: () => root,
              showQuickPick: async () => {
                quickPickShown = true;
                return undefined;
              },
            },
            log,
          ),
        );
        assert.strictEqual(log.clipboard.length, 1, JSON.stringify(empty));
        assert.strictEqual(
          log.clipboard[0],
          baseline.clipboard[0],
          "byte-identical to the no-manifest prompt",
        );
        assert.strictEqual(log.infos.length, 1, "only the copied confirmation — no auto-select notice");
        assert.strictEqual(log.errors.length, 0);
        assert.strictEqual(quickPickShown, false);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  });

  test("importPlanFromFile: a valid-empty manifest imports to the repo-level plan (Set 091 S1)", async () => {
    for (const empty of ["modules: []\n", "modules:\n"]) {
      const log = freshLog();
      const root = moduleRoot("gs-mod-empty-import-", empty);
      const src = path.join(os.tmpdir(), `gs-mod-empty-src-${process.pid}.md`);
      fs.writeFileSync(src, "# plan\nEMPTY_MANIFEST_MARKER\n");
      try {
        const ok = await importPlanFromFile(
          makeUi(
            {
              workspaceRoot: () => root,
              showOpenDialog: (async () => [
                { fsPath: src },
              ]) as unknown as PlanImportUi["showOpenDialog"],
            },
            log,
          ),
        );
        assert.strictEqual(ok, true, JSON.stringify(empty));
        const dest = path.join(root, "docs", "planning", "project-plan.md");
        assert.ok(fs.existsSync(dest), "repo-level destination, exactly like no manifest");
        assert.ok(fs.readFileSync(dest, "utf8").includes("EMPTY_MANIFEST_MARKER"));
        assert.strictEqual(log.errors.length, 0);
      } finally {
        fs.rmSync(src, { force: true });
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  });

  test("copyPlanningPrompt: a PRESENT-but-invalid manifest errors and copies NOTHING (S3 verification R1)", async () => {
    const log = freshLog();
    const root = moduleRoot("gs-mod-invalid-prompt-", "just a string, not a manifest\n");
    try {
      await copyPlanningPrompt(makeUi({ workspaceRoot: () => root }, log));
      assert.strictEqual(log.clipboard.length, 0, "must not fall back to the repo-level prompt");
      assert.strictEqual(log.infos.length, 0);
      assert.strictEqual(log.errors.length, 1);
      assert.ok(log.errors[0].includes("not a valid module manifest"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("importPlanFromFile: a PRESENT-but-invalid manifest errors and never opens the file dialog (S3 verification R1)", async () => {
    const log = freshLog();
    const root = moduleRoot("gs-mod-invalid-import-", "modules: 42\n");
    let dialogShown = false;
    try {
      const ok = await importPlanFromFile(
        makeUi(
          {
            workspaceRoot: () => root,
            showOpenDialog: (async () => {
              dialogShown = true;
              return undefined;
            }) as unknown as PlanImportUi["showOpenDialog"],
          },
          log,
        ),
      );
      assert.strictEqual(ok, false);
      assert.strictEqual(dialogShown, false, "must abort before the file dialog");
      assert.strictEqual(log.errors.length, 1);
      assert.ok(log.errors[0].includes("not a valid module manifest"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("importPlanFromFile: an escaping manifest planPath NEVER writes outside the workspace (S3 verification R2)", async () => {
    // The manifest is repository-controlled input; a traversal planPath
    // must not steer the import outside the workspace. The choke point
    // (modulePlanRelPath) degrades it to the module's default plan path,
    // and the write-time containment guard backstops the class.
    const log = freshLog();
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), "gs-mod-escape-"));
    const root = path.join(parent, "repo");
    fs.mkdirSync(path.join(root, "docs"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "docs", "modules.yaml"),
      "modules:\n  - slug: greeter\n    title: Greeter\n    planPath: ../escaped.md\n",
      "utf8",
    );
    const src = path.join(os.tmpdir(), `gs-mod-src-${process.pid}-esc.md`);
    fs.writeFileSync(src, "ESCAPE_ATTEMPT\n");
    try {
      const ok = await importPlanFromFile(
        makeUi(
          {
            workspaceRoot: () => root,
            showOpenDialog: (async () => [
              { fsPath: src },
            ]) as unknown as PlanImportUi["showOpenDialog"],
          },
          log,
        ),
      );
      assert.strictEqual(ok, true);
      assert.ok(
        !fs.existsSync(path.join(parent, "escaped.md")),
        "must never write outside the workspace root",
      );
      const safeDest = path.join(root, "docs", "modules", "greeter", "project-plan.md");
      assert.ok(fs.existsSync(safeDest), "import lands at the module's default plan path");
      assert.ok(fs.readFileSync(safeDest, "utf8").includes("ESCAPE_ATTEMPT"));
    } finally {
      fs.rmSync(src, { force: true });
      fs.rmSync(parent, { recursive: true, force: true });
    }
  });

  test("importPlanFromFile: Esc on the module picker never opens the file dialog", async () => {
    const log = freshLog();
    const root = moduleRoot("gs-mod-import-esc-", TWO_MODULES);
    let dialogShown = false;
    try {
      const ok = await importPlanFromFile(
        makeUi(
          {
            workspaceRoot: () => root,
            showQuickPick: async () => undefined,
            showOpenDialog: (async () => {
              dialogShown = true;
              return undefined;
            }) as unknown as PlanImportUi["showOpenDialog"],
          },
          log,
        ),
      );
      assert.strictEqual(ok, false);
      assert.strictEqual(dialogShown, false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------
// Set 077 Session 3 (Feature 2) — the three-way choice's verification-
// mode rider: narrowing, tier gating, and dispatch threading. Cases
// generated via routed test-generation (gemini-pro) and adapted to the
// suite's recorder pattern.
// ---------------------------------------------------------------------

suite("verification-mode rider — narrowing (Set 077 S3)", () => {
  test("asVerificationModeRider: absent returns undefined", () => {
    assert.strictEqual(asVerificationModeRider(undefined), undefined);
    assert.strictEqual(asVerificationModeRider(null), undefined);
  });

  test("asVerificationModeRider: valid values pass, case-insensitively", () => {
    assert.strictEqual(
      asVerificationModeRider("dedicated-sessions"),
      "dedicated-sessions",
    );
    assert.strictEqual(
      asVerificationModeRider("DEDICATED-SESSIONS"),
      "dedicated-sessions",
    );
    assert.strictEqual(
      asVerificationModeRider("out-of-band-or-none"),
      "out-of-band-or-none",
    );
  });

  test("asVerificationModeRider: present-but-unrecognized fails loud", () => {
    assert.throws(() => asVerificationModeRider("invalid-mode"));
    assert.throws(() => asVerificationModeRider(123));
    assert.throws(() => asVerificationModeRider({}));
  });

  test("resolveVerificationMode: Full drops the rider outright", () => {
    const msg = {
      type: "gettingStartedAction",
      action: "build-structure",
      verificationMode: "dedicated-sessions",
    } as GettingStartedActionMsg;
    assert.strictEqual(resolveVerificationMode(msg, "full"), undefined);
  });

  test("resolveVerificationMode: Lightweight defaults, honors, and rejects", () => {
    const bare = {
      type: "gettingStartedAction",
      action: "build-structure",
    } as GettingStartedActionMsg;
    assert.strictEqual(
      resolveVerificationMode(bare, "lightweight"),
      "out-of-band-or-none",
    );
    const dedicated = {
      ...bare,
      verificationMode: "dedicated-sessions",
    } as GettingStartedActionMsg;
    assert.strictEqual(
      resolveVerificationMode(dedicated, "lightweight"),
      "dedicated-sessions",
    );
    const malformed = {
      ...bare,
      verificationMode: "invalid-mode",
    } as unknown as GettingStartedActionMsg;
    assert.throws(() => resolveVerificationMode(malformed, "lightweight"));
  });
});

suite("verification-mode rider — dispatch threading (Set 077 S3)", () => {
  interface ModeCallLog {
    buildStructure: Array<{
      tier: "full" | "lightweight";
      budget: BudgetChoice | undefined;
      verificationMode: string | undefined;
    }>;
  }

  function modeRecordingHandlers(): {
    handlers: GettingStartedHandlers;
    calls: ModeCallLog;
  } {
    const calls: ModeCallLog = { buildStructure: [] };
    const handlers: GettingStartedHandlers = {
      openFolder: async () => undefined,
      buildStructure: async (tier, budget, verificationMode) => {
        calls.buildStructure.push({ tier, budget, verificationMode });
      },
      openModules: async () => undefined,
      copyDecompositionPrompt: async () => undefined,
    };
    return { handlers, calls };
  }

  test("build-structure threads the Lightweight dedicated-sessions pick", async () => {
    const { handlers, calls } = modeRecordingHandlers();
    const handled = await routeGettingStartedAction(
      {
        type: "gettingStartedAction",
        action: "build-structure",
        tier: "lightweight",
        verificationMode: "dedicated-sessions",
      },
      handlers,
    );
    assert.strictEqual(handled, true);
    assert.deepStrictEqual(calls.buildStructure, [
      {
        tier: "lightweight",
        budget: undefined,
        verificationMode: "dedicated-sessions",
      },
    ]);
  });

  test("build-structure without a rider defaults the Lightweight mode", async () => {
    const { handlers, calls } = modeRecordingHandlers();
    await routeGettingStartedAction(
      {
        type: "gettingStartedAction",
        action: "build-structure",
        tier: "lightweight",
      },
      handlers,
    );
    assert.deepStrictEqual(calls.buildStructure, [
      {
        tier: "lightweight",
        budget: undefined,
        verificationMode: "out-of-band-or-none",
      },
    ]);
  });

  test("a malformed mode rider rejects the action — NO handler runs", async () => {
    const { handlers, calls } = modeRecordingHandlers();
    const handled = await routeGettingStartedAction(
      {
        type: "gettingStartedAction",
        action: "build-structure",
        tier: "lightweight",
        verificationMode: "invalid-mode",
      } as unknown as GettingStartedActionMsg,
      handlers,
    );
    assert.strictEqual(handled, false);
    assert.deepStrictEqual(calls.buildStructure, []);
  });
});

suite("structureOnlyContext — verificationMode threading (Set 077 S3, A11)", () => {
  test("defaults to out-of-band-or-none when omitted", () => {
    const ctx = structureOnlyContext("repo", "lightweight", "2026-07-02");
    assert.strictEqual(ctx.verificationMode, "out-of-band-or-none");
  });

  test("carries an explicit dedicated-sessions pick (hardcode replaced)", () => {
    const ctx = structureOnlyContext(
      "repo",
      "lightweight",
      "2026-07-02",
      "dedicated-sessions",
    );
    assert.strictEqual(ctx.verificationMode, "dedicated-sessions");
  });
});
