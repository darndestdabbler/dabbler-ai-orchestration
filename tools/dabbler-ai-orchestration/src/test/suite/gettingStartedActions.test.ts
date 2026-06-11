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
  routeGettingStartedAction,
} from "../../commands/gettingStartedActions";
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
  importPlan: number;
  copyPlanPrompt: number;
  // Set 060 S4: build-session-sets carries (parallel, tier).
  buildSessionSets: Array<{ parallel: boolean; tier: "full" | "lightweight" }>;
}

function recordingHandlers(): { handlers: GettingStartedHandlers; calls: CallLog } {
  const calls: CallLog = {
    openFolder: 0,
    buildStructure: [],
    importPlan: 0,
    copyPlanPrompt: 0,
    buildSessionSets: [],
  };
  const handlers: GettingStartedHandlers = {
    openFolder: async () => void calls.openFolder++,
    buildStructure: async (tier) => void calls.buildStructure.push(tier),
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
        { type: "gettingStartedAction", action },
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

  test("forwards a valid tier rider and defaults invalid / missing tiers to full", async () => {
    const { handlers, calls } = recordingHandlers();
    const post = (tier?: unknown) =>
      routeGettingStartedAction(
        { type: "gettingStartedAction", action: "build-structure", tier } as GettingStartedActionMsg,
        handlers,
      );
    await post("lightweight");
    await post("full");
    await post(undefined);
    await post("FULL");      // case-sensitive narrowing
    await post(42);
    assert.deepStrictEqual(calls.buildStructure, [
      "lightweight",
      "full",
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
    await post("lightweight");
    await post("full");
    await post(undefined);
    await post("LIGHTWEIGHT"); // case-sensitive narrowing
    assert.deepStrictEqual(
      calls.buildSessionSets.map((c) => c.tier),
      ["lightweight", "full", "full", "full"],
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
  test("writes exactly the five structure artifacts and NO starter session set", async () => {
    const { ops, store } = memFileOps();
    const result = await scaffoldConsumerRepo({
      projectDir: PROJECT,
      ctx: structureOnlyContext("repo", "full", "2026-06-10"),
      bundle,
      fileOps: ops,
      structureOnly: true,
      installRouter: async () => ({ ok: true, message: "installed" }),
    });
    // Five since Set 060 S3: the D8 getting-started.md teaching doc
    // ships with the structure scaffold.
    assert.strictEqual(result.written.length, 5);
    assert.ok(store.has("/repo/CLAUDE.md"));
    assert.ok(store.has("/repo/AGENTS.md"));
    assert.ok(store.has("/repo/GEMINI.md"));
    assert.ok(store.has("/repo/docs/dabbler/start-here.md"));
    assert.ok(store.has("/repo/docs/dabbler/getting-started.md"));
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
    assert.strictEqual(result.written.length, 4);
  });
});

suite("renderStructureBootstrap (Set 060 S2)", () => {
  test("renders the five structure files, fully token-substituted", () => {
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
        // Set 060 S3 (D8): the static Getting Started teaching doc.
        "docs/dabbler/getting-started.md",
        "docs/dabbler/start-here.md",
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
