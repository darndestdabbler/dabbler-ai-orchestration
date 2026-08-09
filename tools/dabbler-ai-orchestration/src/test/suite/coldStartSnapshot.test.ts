// Set 058 S3 — golden snapshot of the consumer-bootstrap render (D8).
//
// Renders the shared template writer's output for a FIXED context and asserts
// byte-equality against the committed golden fixture under repo-root
// test-fixtures/cold-start/<tier>/. A template edit changes the render and
// fails this test until the golden is regenerated — that regeneration is the
// deliberate, reviewed act that keeps generated stubs and the rendered
// template bundle in lock-step.
//
// Set 112 S1 deleted the Lightweight tier and its golden tree, so only the
// `full` render is snapshotted. The `Tier` type and the context's
// `verificationMode` field are still threaded through consumerBootstrap; S2
// removes them from the extension along with the Getting Started tier fork.
//
// The same golden tree is the input to the Python cold-start ACCEPTANCE test
// (ai_router/tests/test_cold_start_acceptance.py), which boots a throwaway repo
// from these exact files and walks the cold-start chain: it resolves THE active
// set, drives the real start_session entry point, and closes through the shared
// gate. One artifact set, checked from both languages: TS proves the writer
// emits it, Python proves it boots.
//
// Regenerate after an intentional template change:
//   cd tools/dabbler-ai-orchestration
//   UPDATE_GOLDEN=1 npm run test:unit
// then review + commit the test-fixtures/cold-start/ diff.

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import {
  BootstrapContext,
  TemplateBundle,
  Tier,
  loadTemplateBundle,
  renderConsumerBootstrap,
  resolveBundledTemplateDir,
} from "../../utils/consumerBootstrap";

const EXT_ROOT = path.resolve(__dirname, "../../..");
const REPO_ROOT = path.resolve(EXT_ROOT, "../..");
const GOLDEN_ROOT = path.join(REPO_ROOT, "test-fixtures", "cold-start");

function canonicalBundleDir(): string {
  const candidates = [
    path.resolve(EXT_ROOT, "../../docs/templates/consumer-bootstrap"),
    resolveBundledTemplateDir(EXT_ROOT),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "spec.md.template"))) return c;
  }
  throw new Error("Could not locate the consumer-bootstrap bundle for snapshot test.");
}

const bundle: TemplateBundle = loadTemplateBundle(canonicalBundleDir());

// The fixed context the golden is rendered from. Stable on purpose — a change
// here is a snapshot change and must regenerate the golden.
function goldenCtx(tier: Tier): BootstrapContext {
  return {
    repoName: "acme-app",
    setTitle: "Sample feature",
    purpose: "A representative consumer set used by the cold-start fixtures.",
    slug: "001-sample-feature",
    created: "2026-06-09",
    tier,
    verificationMode: "out-of-band-or-none",
    totalSessions: 3,
  };
}

const TIERS: Tier[] = ["full"];
const UPDATE = process.env.UPDATE_GOLDEN === "1";

suite("consumerBootstrap — cold-start golden snapshot", () => {
  for (const tier of TIERS) {
    test(`rendered ${tier} bundle matches the committed golden`, () => {
      const { files } = renderConsumerBootstrap(bundle, goldenCtx(tier));
      const tierDir = path.join(GOLDEN_ROOT, tier);

      if (UPDATE) {
        // Regeneration mode: rewrite the golden tree from the live render.
        fs.rmSync(tierDir, { recursive: true, force: true });
        for (const [rel, content] of Object.entries(files)) {
          const dest = path.join(tierDir, rel);
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.writeFileSync(dest, content, "utf8");
        }
        return;
      }

      assert.ok(
        fs.existsSync(tierDir),
        `golden missing for tier ${tier}; run "UPDATE_GOLDEN=1 npm run test:unit"`,
      );
      for (const [rel, content] of Object.entries(files)) {
        const goldenPath = path.join(tierDir, rel);
        assert.ok(
          fs.existsSync(goldenPath),
          `golden file missing: test-fixtures/cold-start/${tier}/${rel}`,
        );
        // Normalize CRLF so a Windows checkout that flipped line endings on the
        // committed golden does not produce a phantom diff (the writer emits LF).
        const got = content.replace(/\r\n/g, "\n");
        const want = fs.readFileSync(goldenPath, "utf8").replace(/\r\n/g, "\n");
        assert.strictEqual(
          got,
          want,
          `render drifted from golden for ${tier}/${rel}; regenerate with UPDATE_GOLDEN=1 if intended`,
        );
      }

      // The golden tree must not carry extra files the render no longer emits.
      const expected = new Set(Object.keys(files).map((r) => r.replace(/\\/g, "/")));
      const walk = (dir: string, base = ""): string[] => {
        const out: string[] = [];
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const rel = path.posix.join(base, e.name);
          if (e.isDirectory()) out.push(...walk(path.join(dir, e.name), rel));
          else out.push(rel);
        }
        return out;
      };
      for (const rel of walk(tierDir)) {
        assert.ok(
          expected.has(rel),
          `stale golden file not produced by the render: ${tier}/${rel}`,
        );
      }
    });
  }
});
