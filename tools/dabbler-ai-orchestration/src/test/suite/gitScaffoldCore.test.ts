// Set 058 S2 — unit tests for the pure scaffolding core
// (scaffoldConsumerRepo). The VS Code wiring (folder picker, tier prompt,
// progress notification) is exercised manually; this asserts the durable
// contract: which files are written, the skip-existing guard, and the ONE
// tier divergence the design lock allows (router config: Full keeps, the
// Lightweight path removes the seeded copy).

import * as assert from "assert";
import * as path from "path";
import { asTier, scaffoldConsumerRepo } from "../../commands/gitScaffold";
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
  test("writes the ten artifacts under the project dir", async () => {
    const { ops, store } = memFileOps();
    const result = await scaffoldConsumerRepo({
      projectDir: PROJECT,
      ctx: ctx(),
      bundle,
      fileOps: ops,
      installRouter: async () => ({ ok: true, message: "installed" }),
    });
    // Ten artifacts since Set 064 D7 (the three docs/planning/
    // guidance-lifecycle starters joined the seven Set-060 artifacts),
    // plus the two Set 077 S2 durable markers (.dabbler/tier +
    // .dabbler/verification-mode).
    assert.strictEqual(result.written.length, 12);
    assert.strictEqual(result.skipped.length, 0);
    assert.ok(store.has("/repo/CLAUDE.md"));
    assert.ok(store.has("/repo/AGENTS.md"));
    assert.ok(store.has("/repo/GEMINI.md"));
    assert.ok(store.has("/repo/docs/dabbler/start-here.md"));
    assert.ok(store.has("/repo/docs/dabbler/getting-started.md"));
    assert.ok(store.has("/repo/docs/planning/lessons-learned.md"));
    assert.ok(store.has("/repo/docs/planning/project-guidance.md"));
    assert.ok(store.has("/repo/docs/planning/lessons-archive.md"));
    assert.ok(store.has("/repo/docs/session-sets/001-first-feature/spec.md"));
    assert.ok(store.has("/repo/docs/session-sets/001-first-feature/session-state.json"));
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
    assert.strictEqual(result.written.length, 11); // 9 artifacts + 2 markers
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
    assert.strictEqual(result.written.length, 12); // artifacts + markers still written
  });
});

// Set 077 S2 (Feature 1, A1 + Critique-2 M1/M2): the scaffold persists
// the operator's tier + verification-mode choice as durable markers,
// written by the same path that shapes the scaffold — and OUTSIDE the
// no-clobber loop, because they are write-through caches of the latest
// sanctioned choice, not one-shot seeds.
suite("scaffoldConsumerRepo — durable tier/verification-mode markers", () => {
  test("Full scaffold writes full + the default verification mode", async () => {
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
      "out-of-band-or-none\n",
    );
    assert.ok(result.written.includes(TIER_MARKER_REL));
    assert.ok(result.written.includes(VERIFICATION_MODE_MARKER_REL));
  });

  test("Lightweight scaffold writes lightweight + its declared mode", async () => {
    const { ops, store } = memFileOps();
    await scaffoldConsumerRepo({
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
