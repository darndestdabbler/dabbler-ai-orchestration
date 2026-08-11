// Set 058 S2 — the session-set generation prompt must steer the AI to the
// canonical spec shape (schemaVersion 4, NNN- slug) and never the retired
// schemaVersion: 2 / bare-slug
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

  test("demands the canonical schemaVersion 4 / NNN- shape", () => {
    assert.ok(/schemaVersion.*4/.test(prompt));
    assert.ok(prompt.includes("NNN-"));
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

  test("carries the operator's five step headings (Set 095 re-cut of the SVG copy)", () => {
    for (const heading of [
      "## 1. Scaffold Project Structure",
      "## 2. Define Modules (Optional)",
      "## 3. Create the Project Plan and First Session Set",
      "## 4. Start the First Session",
      "## 5. Trust But Verify",
    ]) {
      assert.ok(doc.includes(heading), `missing heading: ${heading}`);
    }
  });

  test("has the start-first-session closure (left-click copies the starter line)", () => {
    assert.ok(/Start the next\s+session of/i.test(doc));
    assert.ok(doc.includes("`001-"));
    assert.ok(/Copy Eval/.test(doc), "right-click mirror is named");
  });

  test("teaches the project-plan contract", () => {
    assert.ok(doc.includes("project-plan.md"));
    // Set 101: the onboarding flow is module-first — a fresh Build scaffolds
    // a `default` module, so the plan the doc teaches lives at the module's
    // path, not the pre-module docs/planning/ location.
    assert.ok(
      doc.includes("docs/modules/default/project-plan.md"),
      "teaches the default-module plan path (Set 101 module-first scaffold)",
    );
  });

  test("explains the parallel worktree model (D7 companion copy)", () => {
    assert.ok(doc.includes("git worktrees"));
    assert.ok(doc.includes("merged back to the main branch"));
  });
});

// ---------------------------------------------------------------------
// Set 087 Session 3 (ruling Q2) — module-targeted decomposition: the
// worked exemplar STAMPS `module: <slug>` (writer-rendered, so the
// prompt cannot drift from the shared writer), a hard-requirements line
// demands it on every generated set, the guidance recommends (never
// enforces) the slug in set names, and the plan reference points at the
// module's own plan. A module-less render is the pre-087 prompt.
// ---------------------------------------------------------------------

suite("buildSessionGenPrompt — module targeting (Set 087 S3)", () => {
  const mod = {
    slug: "greeter",
    planPath: "docs/modules/greeter/project-plan.md",
  };

  test("module option: exemplar stamps module:, requirement + guidance present, module plan referenced", () => {
    const p = buildSessionGenPrompt(bundle, { module: mod });
    assert.ok(/^module: greeter/m.test(p), "exemplar must render the module: line");
    assert.ok(p.includes("declare `module: greeter` in EVERY generated set's"));
    assert.ok(p.includes("This decomposition targets the **greeter** module"));
    assert.ok(p.includes("Recommended (not enforced)"));
    assert.ok(p.includes("docs/modules/greeter/project-plan.md"));
    assert.ok(
      !p.includes("docs/planning/project-plan.md"),
      "a module-targeted prompt must not point at the repo-level plan",
    );
    assert.ok(
      p.includes("globally unique"),
      "the grouping-not-identity invariant rides the prompt",
    );
  });

  test("no module option: no module line, no module guidance, repo-level plan (pre-087 shape)", () => {
    const p = buildSessionGenPrompt(bundle, {});
    assert.ok(!/^module:/m.test(p));
    assert.ok(!p.includes("This decomposition targets"));
    assert.ok(p.includes("docs/planning/project-plan.md"));
  });
});

// Set 094 S2 (verdict amendment 7): the parallel-session-sets UI is SHELVED,
// the MECHANISM is not. The primary decomposition paths omit the parallel
// guidance; the escape hatch (`{ parallel: true }`, fed only by the
// `dabbler.generateParallelSessionSetPrompt` command) still emits it; and the
// `prerequisites:` field + the parallel-session worktree commands survive. This
// suite is the regression pin that "shelving != removal" (routed ruling
// s2-parallel-and-d6-architecture.json Q2).
suite("parallel-sets shelving + escape hatch (Set 094 S2)", () => {
  test("default prompt (primary paths) OMITS the parallel guidance", () => {
    const prompt = buildSessionGenPrompt(bundle);
    assert.ok(
      !prompt.includes("Decompose for parallel execution"),
      "no parallel guidance on the common path",
    );
  });

  test("default prompt STILL documents the `prerequisites:` field (mechanism intact)", () => {
    // The worked-example spec carries the commented `prerequisites:` field, so
    // the ordering mechanism the shelving preserves is still taught even
    // without the parallel guidance block.
    const prompt = buildSessionGenPrompt(bundle);
    assert.ok(
      /prerequisites:/.test(prompt),
      "the prerequisites: ordering field must survive the UI shelving",
    );
  });

  test("escape hatch ({ parallel: true }) re-emits the parallel guidance + worktree/prereq wording", () => {
    const prompt = buildSessionGenPrompt(bundle, { parallel: true });
    assert.ok(prompt.includes("Decompose for parallel execution"), "hatch works");
    assert.ok(/git worktrees/.test(prompt), "still teaches the worktree model");
    assert.ok(/prerequisites:/.test(prompt), "still teaches explicit ordering");
  });

  test("the parallel session-SET generator remains contributed (worktree tooling untouched)", () => {
    // Amendment 7 kept the worktree tooling: parallel session SETS are a
    // different feature from the shelved UI guidance, and the generator
    // must not be removed by that shelving. Pin its contribution so a
    // future cleanup cannot silently drop it.
    //
    // 2026-08-11 operator menu trim: the two per-existing-set "start next
    // parallel session" commands
    // (`dabblerSessionSets.copyStartCommand.parallel` and
    // `dabbler.copyStartNextParallelSessionPrompt`) were retired here by
    // an explicit operator decision — a superseding ruling, not the
    // silent drop this guard exists to catch. The worktree MODEL is
    // unaffected and is in fact now the default: the multi-module verdict
    // (docs/proposals/2026-08-11-multi-module-architecture/) puts every
    // active session in its own worktree, so "start the next session"
    // already implies one. `ai_router/worktree.py`, the canonical
    // worktree CLI, is untouched.
    const pkgPath = path.resolve(__dirname, "../../..", "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    const ids = new Set(
      (pkg.contributes?.commands ?? []).map((c: { command: string }) => c.command),
    );
    assert.ok(
      ids.has("dabbler.generateParallelSessionSetPrompt"),
      "command dabbler.generateParallelSessionSetPrompt must stay contributed",
    );
    for (const retired of [
      "dabblerSessionSets.copyStartCommand.parallel",
      "dabbler.copyStartNextParallelSessionPrompt",
    ]) {
      assert.ok(
        !ids.has(retired),
        `${retired} was retired 2026-08-11 and must not be re-contributed`,
      );
    }
  });
});
