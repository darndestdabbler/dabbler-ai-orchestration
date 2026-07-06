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
import { PlanImportUi, copyPlanningPrompt, importPlanFromFile } from "../../wizard/planImport";
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
  importPlan: number;
  copyPlanPrompt: number;
  // Set 060 S4: build-session-sets carries (parallel, tier).
  buildSessionSets: Array<{ parallel: boolean; tier: "full" | "lightweight" }>;
}

function recordingHandlers(): { handlers: GettingStartedHandlers; calls: CallLog } {
  const calls: CallLog = {
    openFolder: 0,
    buildStructure: [],
    buildStructureBudgets: [],
    buildStructureProfiles: [],
    importPlan: 0,
    copyPlanPrompt: 0,
    buildSessionSets: [],
  };
  const handlers: GettingStartedHandlers = {
    openFolder: async () => void calls.openFolder++,
    buildStructure: async (tier, budget, _verificationMode, transportProfile) => {
      calls.buildStructure.push(tier);
      calls.buildStructureBudgets.push(budget);
      calls.buildStructureProfiles.push(transportProfile);
    },
    importPlan: async () => void calls.importPlan++,
    copyPlanPrompt: async () => void calls.copyPlanPrompt++,
    buildSessionSets: async (parallel, tier) =>
      void calls.buildSessionSets.push({ parallel, tier }),
  };
  return { handlers, calls };
}

suite("routeGettingStartedAction — dispatch + narrowing (Set 060 S2)", () => {
  test("dispatches each known action to its handler", async () => {
    const { handlers, calls } = recordingHandlers();
    for (const action of [
      "open-folder",
      "build-structure",
      "import-plan",
      "copy-plan-prompt",
      "build-session-sets",
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
    assert.strictEqual(calls.importPlan, 1);
    assert.strictEqual(calls.copyPlanPrompt, 1);
    assert.strictEqual(calls.buildSessionSets.length, 1);
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

  test("coerces the parallel rider to a strict boolean (=== true only)", async () => {
    const { handlers, calls } = recordingHandlers();
    const post = (parallel?: unknown) =>
      routeGettingStartedAction(
        { type: "gettingStartedAction", action: "build-session-sets", parallel } as GettingStartedActionMsg,
        handlers,
      );
    await post(true);
    await post(false);
    await post(undefined);
    await post("true");      // strings are not booleans
    await post(1);
    assert.deepStrictEqual(
      calls.buildSessionSets.map((c) => c.parallel),
      [true, false, false, false, false],
    );
  });

  test("build-session-sets narrows its tier rider like build-structure (Set 060 S4)", async () => {
    const { handlers, calls } = recordingHandlers();
    const post = (tier?: unknown) =>
      routeGettingStartedAction(
        { type: "gettingStartedAction", action: "build-session-sets", tier } as GettingStartedActionMsg,
        handlers,
      );
    assert.strictEqual(await post("lightweight"), true);
    assert.strictEqual(await post("full"), true);
    assert.strictEqual(await post(undefined), true);
    assert.strictEqual(await post("LIGHTWEIGHT"), true); // Set 077: case-insensitive
    assert.strictEqual(await post("lite"), false);       // Set 077 (A11): rejected
    assert.deepStrictEqual(
      calls.buildSessionSets.map((c) => c.tier),
      ["lightweight", "full", "full", "lightweight"],
    );
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
    assert.strictEqual(calls.importPlan, 0);
    assert.strictEqual(calls.copyPlanPrompt, 0);
    assert.strictEqual(calls.buildSessionSets.length, 0);
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
  test("writes exactly the eight structure artifacts and NO starter session set", async () => {
    const { ops, store } = memFileOps();
    const result = await scaffoldConsumerRepo({
      projectDir: PROJECT,
      ctx: structureOnlyContext("repo", "full", "2026-06-10"),
      bundle,
      fileOps: ops,
      structureOnly: true,
      installRouter: async () => ({ ok: true, message: "installed" }),
    });
    // Ten writes: nine structure artifacts (the five Set-060 structure
    // artifacts, the three Set 064 D7 docs/planning/ guidance-lifecycle
    // starters, and the Set 077 S4 cross-provider verification doc)
    // plus the Set 077 S2 durable tier marker. (The verification-mode
    // marker is Lightweight-only as of Set 082; this is a Full
    // scaffold.)
    assert.strictEqual(result.written.length, 10);
    assert.ok(store.has("/repo/CLAUDE.md"));
    assert.ok(store.has("/repo/AGENTS.md"));
    assert.ok(store.has("/repo/GEMINI.md"));
    assert.ok(store.has("/repo/docs/dabbler/start-here.md"));
    assert.ok(store.has("/repo/docs/dabbler/getting-started.md"));
    assert.ok(store.has("/repo/docs/dabbler/cross-provider-verification.md"));
    assert.ok(store.has("/repo/docs/planning/lessons-learned.md"));
    assert.ok(store.has("/repo/docs/planning/project-guidance.md"));
    assert.ok(store.has("/repo/docs/planning/lessons-archive.md"));
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
    assert.strictEqual(result.written.length, 9); // 8 artifacts + tier marker (Full: no verification-mode marker, Set 082)
  });
});

suite("renderStructureBootstrap (Set 060 S2)", () => {
  test("renders the nine structure files, fully token-substituted", () => {
    const { files } = renderStructureBootstrap(
      bundle,
      structureOnlyContext("my-app", "full", "2026-06-10"),
    );
    assert.deepStrictEqual(
      Object.keys(files).sort(),
      [
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
    buildSessionSets: Array<{
      parallel: boolean;
      tier: "full" | "lightweight";
      verificationMode: string | undefined;
    }>;
  }

  function modeRecordingHandlers(): {
    handlers: GettingStartedHandlers;
    calls: ModeCallLog;
  } {
    const calls: ModeCallLog = { buildStructure: [], buildSessionSets: [] };
    const handlers: GettingStartedHandlers = {
      openFolder: async () => undefined,
      buildStructure: async (tier, budget, verificationMode) => {
        calls.buildStructure.push({ tier, budget, verificationMode });
      },
      importPlan: async () => undefined,
      copyPlanPrompt: async () => undefined,
      buildSessionSets: async (parallel, tier, verificationMode) => {
        calls.buildSessionSets.push({ parallel, tier, verificationMode });
      },
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

  test("build-session-sets threads the mode alongside parallel + tier", async () => {
    const { handlers, calls } = modeRecordingHandlers();
    const handled = await routeGettingStartedAction(
      {
        type: "gettingStartedAction",
        action: "build-session-sets",
        parallel: false,
        tier: "lightweight",
        verificationMode: "dedicated-sessions",
      },
      handlers,
    );
    assert.strictEqual(handled, true);
    assert.deepStrictEqual(calls.buildSessionSets, [
      {
        parallel: false,
        tier: "lightweight",
        verificationMode: "dedicated-sessions",
      },
    ]);
  });

  test("build-session-sets on Full carries NO mode even when the rider is present", async () => {
    const { handlers, calls } = modeRecordingHandlers();
    await routeGettingStartedAction(
      {
        type: "gettingStartedAction",
        action: "build-session-sets",
        parallel: true,
        tier: "full",
        verificationMode: "dedicated-sessions",
      },
      handlers,
    );
    assert.deepStrictEqual(calls.buildSessionSets, [
      { parallel: true, tier: "full", verificationMode: undefined },
    ]);
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
