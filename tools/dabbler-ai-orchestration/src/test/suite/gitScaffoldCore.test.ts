// Set 058 S2 — unit tests for the pure scaffolding core
// (scaffoldConsumerRepo). The VS Code wiring (folder picker, tier prompt,
// progress notification) is exercised manually; this asserts the durable
// contract: which files are written, the skip-existing guard, and the ONE
// tier divergence the design lock allows (router config: Full keeps, the
// Lightweight path removes the seeded copy).

import * as assert from "assert";
import * as path from "path";
import * as os from "os";
import * as vscode from "vscode";
import {
  asTier,
  buildProjectStructureNoPrompt,
  registerGitScaffoldCommand,
  scaffoldConsumerRepo,
} from "../../commands/gitScaffold";
import { FileOps } from "../../utils/aiRouterInstall";
import {
  TIER_MARKER_REL,
  VERIFICATION_MODE_MARKER_REL,
} from "../../utils/tierMarkerStore";
import {
  BootstrapContext,
  TemplateBundle,
  loadTemplateBundle,
  resolveBundledTemplateDir,
} from "../../utils/consumerBootstrap";
import * as fs from "fs";

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

// Set 059: the Get Started wizard forwards the operator's chosen tier into
// `dabbler.setupNewProject` so it does not re-prompt (the double-prompt /
// dead-end the operator hit on 0.28.0). `asTier` is the narrowing boundary
// that decides whether the forwarded value is trusted (skip the prompt) or
// ignored (fall back to prompting). The end-to-end wizard wiring is UAT-gated.
// Set 077 S2 (A11): the narrowing is now case-insensitive and FAIL-LOUD —
// a present-but-unrecognized value throws (callers surface it as an error
// toast / rejected form action) instead of silently reading as undefined
// and letting a `?? "full"` fallback scaffold Full over a typo.
suite("gitScaffold — asTier (Set 077 fail-loud contract)", () => {
  test("accepts the two valid tiers, case-insensitively, canonical lowercase out", () => {
    assert.strictEqual(asTier("full"), "full");
    assert.strictEqual(asTier("lightweight"), "lightweight");
    assert.strictEqual(asTier("Full"), "full");
    assert.strictEqual(asTier("FULL"), "full");
    assert.strictEqual(asTier("Lightweight"), "lightweight");
    assert.strictEqual(asTier("LIGHTWEIGHT"), "lightweight");
  });
  test("absent input (undefined/null) returns undefined so callers apply their defaults", () => {
    assert.strictEqual(asTier(undefined), undefined);
    assert.strictEqual(asTier(null), undefined);
  });
  test("throws on any other present value, naming it", () => {
    for (const bad of ["", "lite", "f", 1, {}, "router", true]) {
      assert.throws(
        () => asTier(bad),
        (err: unknown) =>
          err instanceof Error &&
          err.message.includes("Unrecognized tier value") &&
          err.message.includes(JSON.stringify(bad)),
        `asTier(${JSON.stringify(bad)}) should throw`,
      );
    }
  });
});

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

function ctx(over: Partial<BootstrapContext> = {}): BootstrapContext {
  return {
    repoName: "demo",
    setTitle: "First feature",
    purpose: "Do a thing.",
    slug: "001-first-feature",
    created: "2026-06-09",
    tier: "full",
    verificationMode: "out-of-band-or-none",
    totalSessions: 2,
    ...over,
  };
}

const PROJECT = "/repo";
const cfgPath = path.join(PROJECT, "ai_router", "router-config.yaml").replace(/\\/g, "/");

suite("scaffoldConsumerRepo — file writes", () => {
  test("writes the full-render artifacts under the project dir", async () => {
    const { ops, store } = memFileOps();
    const result = await scaffoldConsumerRepo({
      projectDir: PROJECT,
      ctx: ctx(),
      bundle,
      fileOps: ops,
      installRouter: async () => ({ ok: true, message: "installed" }),
    });
    // Fifteen writes: thirteen artifacts (the seven Set-060 artifacts,
    // the three Set 064 D7 docs/planning/ guidance-lifecycle starters,
    // the Set 077 S4 cross-provider verification doc, and the two Set
    // 087 S3 ownership/CI teaching templates), the Set 077 S2 durable
    // tier marker, and the Set 094 docs/modules.yaml ensure-write. (The
    // verification-mode marker is Lightweight-only as of Set 082; this is
    // a Full scaffold, so it is not written.)
    assert.strictEqual(result.written.length, 15);
    assert.strictEqual(result.skipped.length, 0);
    assert.ok(store.has("/repo/CLAUDE.md"));
    assert.ok(store.has("/repo/AGENTS.md"));
    assert.ok(store.has("/repo/GEMINI.md"));
    assert.ok(store.has("/repo/docs/dabbler/start-here.md"));
    assert.ok(store.has("/repo/docs/dabbler/getting-started.md"));
    assert.ok(store.has("/repo/docs/dabbler/cross-provider-verification.md"));
    assert.ok(store.has("/repo/docs/planning/lessons-learned.md"));
    assert.ok(store.has("/repo/docs/planning/project-guidance.md"));
    assert.ok(store.has("/repo/docs/planning/lessons-archive.md"));
    assert.ok(store.has("/repo/docs/session-sets/001-first-feature/spec.md"));
    assert.ok(store.has("/repo/docs/session-sets/001-first-feature/session-state.json"));
    // Set 087 S3 (ruling Q3): ownership + monorepo-CI teaching templates.
    assert.ok(store.has("/repo/.github/CODEOWNERS"));
    assert.ok(store.has("/repo/.github/workflows/monorepo-ci.yml"));
    // Set 094 (adjudication A): the scaffold ensures docs/modules.yaml.
    assert.ok(store.has("/repo/docs/modules.yaml"), "modules.yaml ensured");
  });

  test("never clobbers an existing file (records it as skipped)", async () => {
    const { ops, store } = memFileOps({ "/repo/CLAUDE.md": "PRE-EXISTING" });
    const result = await scaffoldConsumerRepo({
      projectDir: PROJECT,
      ctx: ctx(),
      bundle,
      fileOps: ops,
      installRouter: async () => ({ ok: true, message: "installed" }),
    });
    assert.deepStrictEqual(result.skipped, ["CLAUDE.md"]);
    assert.strictEqual(store.get("/repo/CLAUDE.md"), "PRE-EXISTING");
    // 12 artifacts + tier marker + modules.yaml (Full: no verification-mode
    // marker, Set 082; Set 094: + the modules.yaml ensure-write).
    assert.strictEqual(result.written.length, 14);
  });
});

suite("scaffoldConsumerRepo — tier divergence (router config)", () => {
  test("Full keeps the seeded router-config.yaml", async () => {
    const { ops, store } = memFileOps();
    // Model the install seeding router-config.yaml (it ships as package data).
    const result = await scaffoldConsumerRepo({
      projectDir: PROJECT,
      ctx: ctx({ tier: "full" }),
      bundle,
      fileOps: ops,
      installRouter: async () => {
        store.set(cfgPath, "models: {}\n");
        return { ok: true, message: "installed" };
      },
    });
    assert.strictEqual(result.routerConfigRemoved, false);
    assert.ok(store.has(cfgPath), "Full tier must keep router-config.yaml");
  });

  test("Lightweight removes the seeded router-config.yaml", async () => {
    const { ops, store } = memFileOps();
    const result = await scaffoldConsumerRepo({
      projectDir: PROJECT,
      ctx: ctx({ tier: "lightweight" }),
      bundle,
      fileOps: ops,
      installRouter: async () => {
        store.set(cfgPath, "models: {}\n");
        return { ok: true, message: "installed" };
      },
    });
    assert.strictEqual(result.routerConfigRemoved, true);
    assert.ok(!store.has(cfgPath), "Lightweight tier must not carry router config");
    // The spec still carries tier: lightweight — the actual switch.
    const spec = store.get("/repo/docs/session-sets/001-first-feature/spec.md")!;
    assert.ok(/tier:\s*lightweight/.test(spec));
  });

  test("surfaces a failed install without throwing", async () => {
    const { ops } = memFileOps();
    const result = await scaffoldConsumerRepo({
      projectDir: PROJECT,
      ctx: ctx(),
      bundle,
      fileOps: ops,
      installRouter: async () => ({ ok: false, message: "pip failed" }),
    });
    assert.strictEqual(result.installOk, false);
    assert.strictEqual(result.installMessage, "pip failed");
    // artifacts + tier marker + modules.yaml still written (Full); Set 094.
    assert.strictEqual(result.written.length, 15);
  });
});

// Set 077 S2 (Feature 1, A1 + Critique-2 M1/M2): the scaffold persists
// the operator's tier + verification-mode choice as durable markers,
// written by the same path that shapes the scaffold — and OUTSIDE the
// no-clobber loop, because they are write-through caches of the latest
// sanctioned choice, not one-shot seeds. Set 082 narrows the
// verification-mode marker to Lightweight only: the mode machinery is
// inert on Full, so a Full scaffold records no phantom choice — it
// neither writes nor deletes the marker (a prior Lightweight pick
// survives a tier round-trip untouched).
suite("scaffoldConsumerRepo — durable tier/verification-mode markers", () => {
  test("Full scaffold writes the tier marker but SKIPS the verification-mode marker (Set 082)", async () => {
    const { ops, store } = memFileOps();
    const result = await scaffoldConsumerRepo({
      projectDir: PROJECT,
      ctx: ctx({ tier: "full" }),
      bundle,
      fileOps: ops,
      installRouter: async () => ({ ok: true, message: "installed" }),
    });
    assert.strictEqual(store.get("/repo/.dabbler/tier"), "full\n");
    assert.strictEqual(
      store.get("/repo/.dabbler/verification-mode"),
      undefined,
      "a Full scaffold must not write a verification-mode marker",
    );
    assert.ok(result.written.includes(TIER_MARKER_REL));
    assert.ok(!result.written.includes(VERIFICATION_MODE_MARKER_REL));
  });

  test("Full scaffold PRESERVES a pre-existing Lightweight marker (Set 082)", async () => {
    const { ops, store } = memFileOps({
      "/repo/.dabbler/verification-mode": "dedicated-sessions\n",
    });
    const result = await scaffoldConsumerRepo({
      projectDir: PROJECT,
      ctx: ctx({ tier: "full" }),
      bundle,
      fileOps: ops,
      installRouter: async () => ({ ok: true, message: "installed" }),
    });
    // Neither written nor deleted: the prior Lightweight pick survives a
    // tier round-trip untouched (the Set 081 "hiding never clears" posture).
    assert.strictEqual(
      store.get("/repo/.dabbler/verification-mode"),
      "dedicated-sessions\n",
    );
    assert.ok(!result.written.includes(VERIFICATION_MODE_MARKER_REL));
  });

  test("Lightweight scaffold writes lightweight + its declared mode", async () => {
    const { ops, store } = memFileOps();
    const result = await scaffoldConsumerRepo({
      projectDir: PROJECT,
      ctx: ctx({ tier: "lightweight", verificationMode: "dedicated-sessions" }),
      bundle,
      fileOps: ops,
      installRouter: async () => ({ ok: true, message: "installed" }),
    });
    assert.strictEqual(store.get("/repo/.dabbler/tier"), "lightweight\n");
    assert.strictEqual(
      store.get("/repo/.dabbler/verification-mode"),
      "dedicated-sessions\n",
    );
    assert.ok(result.written.includes(VERIFICATION_MODE_MARKER_REL));
  });

  test("re-scaffold with a different tier UPDATES the marker (write-through, not no-clobber)", async () => {
    const { ops, store } = memFileOps({ "/repo/.dabbler/tier": "full\n" });
    const result = await scaffoldConsumerRepo({
      projectDir: PROJECT,
      ctx: ctx({ tier: "lightweight" }),
      bundle,
      fileOps: ops,
      installRouter: async () => ({ ok: true, message: "installed" }),
    });
    assert.strictEqual(store.get("/repo/.dabbler/tier"), "lightweight\n");
    assert.ok(result.written.includes(TIER_MARKER_REL));
  });
});

// ---------------------------------------------------------------------
// Set 077 Session 3 (A10, Critique-2 M7) — the Python pre-flight is the
// FIRST, side-effect-free step of the scaffold: a missing interpreter
// fails friendly BEFORE git init, the durable markers, and the template
// writes, so the target folder stays byte-empty. The regression drives
// the real buildProjectStructureNoPrompt under the vscode stub with the
// pythonPath setting pointed at a nonexistent absolute interpreter.
// ---------------------------------------------------------------------

suite("gitScaffold — Python pre-flight leaves no artifacts (Set 077 S3, M7)", () => {
  test("missing interpreter: friendly error, undefined result, EMPTY folder", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-preflight-"));
    const missingInterpreter = path.join(tmpDir, "definitely", "missing", "python.exe");
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const ws = vscode.workspace as any;
    const win = vscode.window as any;
    const savedGetConfiguration = ws.getConfiguration;
    const savedShowError = win.showErrorMessage;
    const errors: string[] = [];
    ws.getConfiguration = () => ({
      inspect: (key: string) =>
        key === "pythonPath" ? { globalValue: missingInterpreter } : undefined,
      get: (_k: string, dflt: unknown) => dflt,
    });
    win.showErrorMessage = async (msg: string) => {
      errors.push(msg);
      return undefined;
    };
    /* eslint-enable @typescript-eslint/no-explicit-any */
    try {
      const fakeContext = {
        extensionPath: path.resolve(__dirname, "../../.."),
      } as unknown as import("vscode").ExtensionContext;
      const result = await buildProjectStructureNoPrompt(
        fakeContext,
        tmpDir,
        "lightweight",
        undefined,
        "dedicated-sessions",
      );
      assert.strictEqual(result, undefined, "scaffold must not run");
      // The friendly explainer fired (not a raw ENOENT).
      assert.strictEqual(errors.length, 1);
      assert.ok(errors[0].includes("python.org"));
      assert.ok(errors[0].includes("NOT"), "must break the missing-keys mis-diagnosis");
      // NO durable write of any kind: no .git, no .dabbler markers, no
      // rendered docs — the folder is exactly as it was.
      assert.deepStrictEqual(
        fs.readdirSync(tmpDir),
        [],
        "pre-flight failure must leave no setup artifacts",
      );
    } finally {
      ws.getConfiguration = savedGetConfiguration;
      win.showErrorMessage = savedShowError;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------
// Set 101 S1 close-out dispute, third-opinion remediation: a routed
// second opinion (gemini-pro, s1-third-opinion-vsix-dispute.json) on the
// close backstop's "locally built VSIX walkthrough" finding agreed the
// verifier's literal demand (install the .vsix, drive native dialogs via
// Playwright) is technically infeasible given this repo's own documented
// constraints, but identified a REAL, narrower, previously-untested gap:
// nothing proved that the REGISTERED `dabbler.setupNewProject` command's
// callback actually dispatches into `buildProjectStructureNoPrompt` with
// the right arguments — every existing test (unit + Playwright) calls
// `buildProjectStructureNoPrompt` directly, bypassing
// `vscode.commands.registerCommand` / the command palette entirely.
// `activationNoFolder.test.ts` proves the command NAME registers; this
// proves the registered CALLBACK truly wires through.
//
// Reuses the missing-python pre-flight as a wiring probe (not because the
// missing-interpreter case itself is interesting here, but because its
// friendly error can ONLY fire if the callback correctly resolved
// projectDir + tier and called all the way into
// buildProjectStructureNoPrompt's real pre-flight) — entirely offline, no
// network install, no native-dialog automation, using the SAME
// vscode-stub substitution this repo's own CONTRIBUTING.md already
// prescribes in place of the known-broken @vscode/test-electron harness.
suite("gitScaffold — dabbler.setupNewProject command wiring (Set 101 S1 third-opinion remediation)", () => {
  test("invoking the REGISTERED callback reaches buildProjectStructureNoPrompt with the right args", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-cmd-wiring-"));
    const missingInterpreter = path.join(tmpDir, "definitely", "missing", "python.exe");
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const cmds = vscode.commands as any;
    const ws = vscode.workspace as any;
    const win = vscode.window as any;
    const savedRegisterCommand = cmds.registerCommand;
    const savedWorkspaceFolders = ws.workspaceFolders;
    const savedGetConfiguration = ws.getConfiguration;
    const savedShowError = win.showErrorMessage;

    let captured: ((arg?: { tier?: string }) => Promise<void>) | undefined;
    cmds.registerCommand = (id: string, cb: (arg?: { tier?: string }) => Promise<void>) => {
      if (id === "dabbler.setupNewProject") captured = cb;
      return { dispose() {} };
    };
    ws.workspaceFolders = [
      { uri: vscode.Uri.file(tmpDir), name: "tmp", index: 0 },
    ];
    ws.getConfiguration = () => ({
      inspect: (key: string) =>
        key === "pythonPath" ? { globalValue: missingInterpreter } : undefined,
      get: (_k: string, dflt: unknown) => dflt,
    });
    const errors: string[] = [];
    win.showErrorMessage = async (msg: string) => {
      errors.push(msg);
      return undefined;
    };
    /* eslint-enable @typescript-eslint/no-explicit-any */

    try {
      const fakeContext = {
        extensionPath: path.resolve(__dirname, "../../.."),
        subscriptions: [],
      } as unknown as import("vscode").ExtensionContext;
      registerGitScaffoldCommand(fakeContext);
      assert.ok(captured, "dabbler.setupNewProject must register a callback");

      // An explicit tier arg skips the tier QuickPick (the command's own
      // documented wizard-arg contract); the open workspace folder skips
      // the folder picker — so invoking the callback drives the REAL
      // dispatch (asTier parsing -> buildProjectStructureNoPrompt) with no
      // further native-dialog interaction needed to reach the pre-flight.
      await captured!({ tier: "full" });

      assert.strictEqual(
        errors.length,
        1,
        "the friendly Python-missing error only fires if the callback truly reached buildProjectStructureNoPrompt's pre-flight",
      );
      assert.ok(errors[0].includes("python.org"));
      assert.deepStrictEqual(
        fs.readdirSync(tmpDir),
        [],
        "no partial artifacts — the same pre-flight-first contract holds through the real command dispatch",
      );
    } finally {
      cmds.registerCommand = savedRegisterCommand;
      ws.workspaceFolders = savedWorkspaceFolders;
      ws.getConfiguration = savedGetConfiguration;
      win.showErrorMessage = savedShowError;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
