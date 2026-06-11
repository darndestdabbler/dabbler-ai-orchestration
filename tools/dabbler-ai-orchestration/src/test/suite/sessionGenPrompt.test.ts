// Set 058 S2 — the session-set generation prompt must steer the AI to the
// canonical spec shape (schemaVersion 4, NNN- slug, tier +
// verificationMode) and never the retired schemaVersion: 2 / bare-slug
// form. Also covers the wizard's "start the next session" cold-start
// closure copy.

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { buildSessionGenPrompt } from "../../wizard/sessionGenPrompt";
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
const bundle: TemplateBundle = loadTemplateBundle(canonicalBundleDir());

suite("buildSessionGenPrompt (Set 058 S2)", () => {
  const prompt = buildSessionGenPrompt(bundle);

  test("references the plan path instead of inlining plan content (Set 060 S4)", () => {
    // Operator UAT feedback: inlining the full plan made the copied
    // prompt unreadable. The prompt now points the (path-aware)
    // assistant at the canonical plan location — same contract as the
    // Set 048 copyable review prompts (paths, never contents).
    assert.ok(prompt.includes("docs/planning/project-plan.md"));
    assert.ok(prompt.includes("Read that file directly"));
  });

  test("demands the canonical schemaVersion 4 / NNN- / tier shape", () => {
    assert.ok(/schemaVersion.*4/.test(prompt));
    assert.ok(prompt.includes("NNN-"));
    assert.ok(prompt.includes("tier"));
    assert.ok(prompt.includes("verificationMode"));
  });

  test("never instructs the retired schemaVersion: 2 form", () => {
    assert.ok(!/schemaVersion["']?\s*:\s*2\b/.test(prompt));
  });

  test("shows WRITER-RENDERED, session-expanded exemplars (not raw templates)", () => {
    // The 3-session sample must appear fully expanded — three numbered
    // blocks and three sessions[] objects — not the bundle's illustrative
    // two-block sample.
    const headers = (prompt.match(/### Session \d+ of 3:/g) || []).map((h) =>
      Number(/Session (\d+) of/.exec(h)![1]),
    );
    assert.deepStrictEqual(headers, [1, 2, 3]);
    assert.ok(prompt.includes("session-003/"));
    assert.ok(prompt.includes('"number": 3'));
    assert.ok(prompt.includes('"schemaVersion": 4'));
    assert.ok(/tier:\s*full/.test(prompt));
  });

  test("leaves NO unsubstituted {{TOKEN}} placeholders (rendered, not raw)", () => {
    assert.ok(!prompt.includes("{{"), "prompt should not show raw template tokens");
  });

  test("uses ~~~~ outer fences so the spec's inner ```yaml does not collide", () => {
    assert.ok(prompt.includes("~~~~markdown"));
    assert.ok(prompt.includes("~~~~json"));
  });

  test("worked examples use NNN- slugs everywhere, never a bare slug", () => {
    // The example set is 001-example-feature; every session-set folder /
    // sessionSetName reference must carry the NNN- prefix.
    assert.ok(prompt.includes("001-example-feature"));
    const folderRefs = prompt.match(/docs\/session-sets\/[^/\s"`]+/g) || [];
    assert.ok(folderRefs.length > 0, "expected session-set folder references");
    for (const ref of folderRefs) {
      const leaf = ref.split("/").pop()!;
      // Skip the literal placeholder used in the instructions (<NNN-slug>).
      if (leaf.startsWith("<")) continue;
      assert.ok(
        /^\d{3,}-/.test(leaf),
        `worked-example folder reference is bare-slug: ${ref}`,
      );
    }
    assert.ok(!/"sessionSetName":\s*"[a-z]/.test(prompt), "state example uses NNN- sessionSetName");
  });
});

// Set 060 S3: the Set 021/058 Get Started wizard (webview/wizard.html)
// is retired — the Session Set Explorer's Getting Started form (D1) +
// the static instructions doc (D8) are the onboarding surface. The
// cold-start-closure copy the wizard suite used to pin now lives in the
// bundled getting-started.md.template; pin it there instead.
suite("Getting Started instructions doc (Set 060 S3, D8)", () => {
  const doc = bundle.gettingStartedTemplate;

  test("is token-free (openable straight from the bundle, pre-scaffold)", () => {
    assert.deepStrictEqual(doc.match(/{{[A-Z_]+}}/g), null);
  });

  test("carries the operator's five step headings (the SVG copy)", () => {
    for (const heading of [
      "## 1. Scaffold Project Structure",
      "## 2. Create/Import Project Plan",
      "## 3. Decompose Plan Into Session Sets",
      "## 4. Start the First Session",
      "## 5. Trust But Verify",
    ]) {
      assert.ok(doc.includes(heading), `missing heading: ${heading}`);
    }
  });

  test("has the start-first-session closure (Copy Prompt > Start Next Session)", () => {
    assert.ok(/Start Next\s+Session/i.test(doc));
    assert.ok(doc.includes("`001-`"));
  });

  test("teaches the project-plan contract and both tiers", () => {
    assert.ok(doc.includes("project-plan.md"));
    assert.ok(doc.includes("docs/planning"));
    assert.ok(/Full tier/.test(doc));
    assert.ok(/Lightweight tier/.test(doc));
  });

  test("explains the parallel worktree model (D7 companion copy)", () => {
    assert.ok(doc.includes("git worktrees"));
    assert.ok(doc.includes("merged back to the main branch"));
  });
});
