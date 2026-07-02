// Set 077 Session 2 — unit tests for the durable tier-marker store
// (utils/tierMarkerStore.ts): the `.dabbler/tier` +
// `.dabbler/verification-mode` write-through markers, the tolerant
// readers, the Feature 1 read-precedence chain (marker → router-config
// inference → null), and the specPath→root derivation the Switch Tier…
// A11 fix anchors on. Routed test-generation (gemini-pro) drafted this
// suite; the orchestrator adapted it to the shipped contracts.

import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  INSTALL_METHOD_REL,
  ROUTER_CONFIG_REL,
} from "../../utils/aiRouterInstall";
import {
  MarkerFileOps,
  TIER_MARKER_REL,
  VERIFICATION_MODE_MARKER_REL,
  nodeMarkerFileOps,
  readTierMarker,
  readVerificationModeMarker,
  repoRootForSpecPath,
  resolveDurableTier,
  writeTierMarker,
  writeVerificationModeMarker,
} from "../../utils/tierMarkerStore";

/** In-memory MarkerFileOps over a normalized-path map (hermetic tests). */
function memFileOps(seed: Record<string, string> = {}): {
  ops: MarkerFileOps;
  store: Map<string, string>;
} {
  const store = new Map<string, string>();
  const norm = (p: string) => p.replace(/\\/g, "/");
  for (const [k, v] of Object.entries(seed)) store.set(norm(k), v);
  const ops: MarkerFileOps = {
    exists: (p) => store.has(norm(p)),
    readFile: (p) => {
      const content = store.get(norm(p));
      if (content === undefined) throw new Error(`ENOENT: ${p}`);
      return content;
    },
    writeFile: (p, c) => void store.set(norm(p), c),
    mkdirp: () => {},
  };
  return { ops, store };
}

const ROOT = "/repo";

suite("tierMarkerStore — read/write round-trips", () => {
  test("writes and reads the tier marker (write-through updates)", () => {
    const { ops } = memFileOps();
    writeTierMarker(ROOT, "lightweight", ops);
    assert.strictEqual(readTierMarker(ROOT, ops), "lightweight");
    writeTierMarker(ROOT, "full", ops);
    assert.strictEqual(readTierMarker(ROOT, ops), "full");
  });

  test("writes and reads the verification-mode marker", () => {
    const { ops } = memFileOps();
    writeVerificationModeMarker(ROOT, "dedicated-sessions", ops);
    assert.strictEqual(
      readVerificationModeMarker(ROOT, ops),
      "dedicated-sessions",
    );
    writeVerificationModeMarker(ROOT, "out-of-band-or-none", ops);
    assert.strictEqual(
      readVerificationModeMarker(ROOT, ops),
      "out-of-band-or-none",
    );
  });

  test("write is one word plus trailing newline", () => {
    const { ops, store } = memFileOps();
    writeTierMarker(ROOT, "full", ops);
    writeVerificationModeMarker(ROOT, "dedicated-sessions", ops);
    const tierAbs = path.join(ROOT, TIER_MARKER_REL).replace(/\\/g, "/");
    const modeAbs = path
      .join(ROOT, VERIFICATION_MODE_MARKER_REL)
      .replace(/\\/g, "/");
    assert.strictEqual(store.get(tierAbs), "full\n");
    assert.strictEqual(store.get(modeAbs), "dedicated-sessions\n");
  });

  test("missing files read as null (both markers)", () => {
    const { ops } = memFileOps();
    assert.strictEqual(readTierMarker(ROOT, ops), null);
    assert.strictEqual(readVerificationModeMarker(ROOT, ops), null);
  });

  test("an unreadable file reads as null (reader never throws)", () => {
    const { ops, store } = memFileOps();
    store.set(
      path.join(ROOT, TIER_MARKER_REL).replace(/\\/g, "/"),
      "full\n",
    );
    ops.readFile = () => {
      throw new Error("EPERM");
    };
    assert.strictEqual(readTierMarker(ROOT, ops), null);
  });

  test("junk words read as null — the tolerant-reader contract", () => {
    const { ops } = memFileOps({
      [path.join(ROOT, TIER_MARKER_REL)]: "garbage\n",
      [path.join(ROOT, VERIFICATION_MODE_MARKER_REL)]: "sometimes\n",
    });
    assert.strictEqual(readTierMarker(ROOT, ops), null);
    assert.strictEqual(readVerificationModeMarker(ROOT, ops), null);
  });

  test("reads are case-insensitive and whitespace-tolerant", () => {
    const { ops } = memFileOps({
      [path.join(ROOT, TIER_MARKER_REL)]: "  FULL  \n",
      [path.join(ROOT, VERIFICATION_MODE_MARKER_REL)]:
        "Dedicated-Sessions\n",
    });
    assert.strictEqual(readTierMarker(ROOT, ops), "full");
    assert.strictEqual(
      readVerificationModeMarker(ROOT, ops),
      "dedicated-sessions",
    );
  });
});

suite("tierMarkerStore — resolveDurableTier precedence", () => {
  test("marker outranks the router-config inference", () => {
    const { ops } = memFileOps({
      [path.join(ROOT, TIER_MARKER_REL)]: "lightweight\n",
      [path.join(ROOT, INSTALL_METHOD_REL)]: "pypi\n",
      [path.join(ROOT, ROUTER_CONFIG_REL)]: "providers: {}\n", // says "full"
    });
    assert.deepStrictEqual(resolveDurableTier(ROOT, ops), {
      tier: "lightweight",
      source: "marker",
    });
  });

  test("no marker + install evidence + router config ⇒ full by inference", () => {
    const { ops } = memFileOps({
      [path.join(ROOT, INSTALL_METHOD_REL)]: "pypi\n",
      [path.join(ROOT, ROUTER_CONFIG_REL)]: "providers: {}\n",
    });
    assert.deepStrictEqual(resolveDurableTier(ROOT, ops), {
      tier: "full",
      source: "inference",
    });
  });

  test("no marker + install evidence + NO router config ⇒ lightweight by inference", () => {
    const { ops } = memFileOps({
      [path.join(ROOT, INSTALL_METHOD_REL)]: "pypi\n",
    });
    assert.deepStrictEqual(resolveDurableTier(ROOT, ops), {
      tier: "lightweight",
      source: "inference",
    });
  });

  test("a corrupt marker falls through to the inference rung", () => {
    const { ops } = memFileOps({
      [path.join(ROOT, TIER_MARKER_REL)]: "ful\n", // typo — reads null
      [path.join(ROOT, INSTALL_METHOD_REL)]: "pypi\n",
      [path.join(ROOT, ROUTER_CONFIG_REL)]: "providers: {}\n",
    });
    assert.deepStrictEqual(resolveDurableTier(ROOT, ops), {
      tier: "full",
      source: "inference",
    });
  });

  test("no durable signal at all ⇒ null (never a silent Full default)", () => {
    const { ops } = memFileOps();
    assert.strictEqual(resolveDurableTier(ROOT, ops), null);
  });

  test("router config alone (no install evidence) is NOT inference input", () => {
    // A stray ai_router/ folder in a never-scaffolded repo must not
    // masquerade as a tier choice.
    const { ops } = memFileOps({
      [path.join(ROOT, ROUTER_CONFIG_REL)]: "providers: {}\n",
    });
    assert.strictEqual(resolveDurableTier(ROOT, ops), null);
  });
});

suite("tierMarkerStore — repoRootForSpecPath (Switch Tier… A11 anchor)", () => {
  test("derives the root three levels above the spec", () => {
    const specPath = path.join(
      "/repo",
      "docs",
      "session-sets",
      "001-demo",
      "spec.md",
    );
    assert.strictEqual(repoRootForSpecPath(specPath), path.resolve("/repo"));
  });

  test("handles a nested (worktree-style) root", () => {
    const specPath = path.join(
      "/repos",
      "app-worktrees",
      "feature-x",
      "docs",
      "session-sets",
      "002-x",
      "spec.md",
    );
    assert.strictEqual(
      repoRootForSpecPath(specPath),
      path.resolve(path.join("/repos", "app-worktrees", "feature-x")),
    );
  });
});

suite("tierMarkerStore — nodeMarkerFileOps real-fs round-trip", () => {
  test("writes exactly 'lightweight\\n' as UTF-8 with no BOM", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-test-"));
    try {
      writeTierMarker(tempDir, "lightweight", nodeMarkerFileOps);
      const bytes = fs.readFileSync(path.join(tempDir, TIER_MARKER_REL));
      assert.deepStrictEqual(bytes, Buffer.from("lightweight\n", "utf8"));
      assert.strictEqual(
        readTierMarker(tempDir, nodeMarkerFileOps),
        "lightweight",
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
