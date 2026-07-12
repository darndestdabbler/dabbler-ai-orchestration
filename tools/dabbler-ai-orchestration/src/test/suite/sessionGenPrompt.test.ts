// Set 058 S2 — the session-set generation prompt must steer the AI to the
// canonical spec shape (schemaVersion 4, NNN- slug, tier +
// verificationMode) and never the retired schemaVersion: 2 / bare-slug
// form. Also covers the wizard's "start the next session" cold-start
// closure copy.

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { buildSessionGenPrompt } from "../../wizard/sessionGenPrompt";
import { scaffoldConsumerRepo } from "../../commands/gitScaffold";
import { resolveDurableTier } from "../../utils/tierMarkerStore";
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

// Set 077 Session 2 (Feature 1, A1): the prompt's tier guidance claims
// only what its resolution source supports, and the tier-less render is
// no longer a silent Full steer. Routed test-generation (gemini-pro)
// drafted this suite; adapted to the shipped wording.
suite("buildSessionGenPrompt — tier truth (Set 077 S2)", () => {
  test("form/marker source: operator-selected wording + matching exemplar", () => {
    for (const source of ["form", "marker"] as const) {
      const p = buildSessionGenPrompt(bundle, {
        tier: "lightweight",
        tierSource: source,
      });
      assert.ok(
        p.includes("The operator selected the **lightweight** tier"),
        `${source}: missing selected wording`,
      );
      assert.ok(p.includes("`tier: lightweight`"));
      assert.ok(
        /tier:\s*lightweight/.test(p),
        `${source}: exemplar must render lightweight`,
      );
    }
  });

  test("inference source: hedged wording, never claims a selection", () => {
    const p = buildSessionGenPrompt(bundle, {
      tier: "full",
      tierSource: "inference",
    });
    assert.ok(p.includes("inferred from the workspace's router configuration"));
    assert.ok(!p.includes("The operator selected"));
  });

  test("no tier at all: names the illustration honestly, never fabricates a selection", () => {
    const p = buildSessionGenPrompt(bundle, {});
    assert.ok(p.includes("No tier choice is recorded in this workspace"));
    assert.ok(p.includes("for illustration only"));
    assert.ok(!p.includes("The operator selected"));
  });

  test("Set 076 regression replay: Lightweight scaffold ⇒ lightweight prompt", async () => {
    // The reported incident chain: scaffold Lightweight, lose the
    // volatile radio (reload), copy the decomposition prompt — pre-077
    // it rendered Full exemplars with no tier guidance. Post-077 the
    // scaffold writes .dabbler/tier, the resolver reads it back, and
    // the prompt renders the truth.
    const store = new Map<string, string>();
    const norm = (p: string) => p.split(path.sep).join("/");
    const ops = {
      exists: (p: string) => store.has(norm(p)),
      readFile: (p: string) => {
        const c = store.get(norm(p));
        if (c === undefined) throw new Error(`ENOENT: ${p}`);
        return c;
      },
      writeFile: (p: string, c: string) => void store.set(norm(p), c),
      writeFileExclusive: (p: string, c: string) => {
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
      removeRecursive: (p: string) => void store.delete(norm(p)),
      mkdtemp: (prefix: string) => `/tmp/${prefix}0`,
    };
    await scaffoldConsumerRepo({
      projectDir: "/repo",
      ctx: {
        repoName: "demo",
        setTitle: "Demo",
        purpose: "Replay the Set 076 tier leak.",
        slug: "001-demo",
        created: "2026-07-02",
        tier: "lightweight",
        verificationMode: "out-of-band-or-none",
        totalSessions: 1,
      },
      bundle,
      fileOps: ops,
      installRouter: async () => ({ ok: true, message: "installed" }),
    });

    const durable = resolveDurableTier("/repo", ops);
    assert.deepStrictEqual(durable, { tier: "lightweight", source: "marker" });

    const p = buildSessionGenPrompt(bundle, {
      tier: durable!.tier,
      tierSource: durable!.source,
    });
    assert.ok(/tier:\s*lightweight/.test(p), "exemplar must carry tier: lightweight");
    assert.ok(p.includes("The operator selected the **lightweight** tier"));
    assert.ok(!p.includes("No tier choice is recorded"));
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

  test("module option composes with tier + verification-mode options", () => {
    const p = buildSessionGenPrompt(bundle, {
      module: mod,
      tier: "lightweight",
      tierSource: "form",
      verificationMode: "dedicated-sessions",
    });
    assert.ok(/^module: greeter/m.test(p));
    assert.ok(p.includes("verificationMode: dedicated-sessions"));
    assert.ok(p.includes("The operator selected the **lightweight** tier"));
  });
});

// ---------------------------------------------------------------------
// Set 077 Session 3 (Feature 2) — the decomposition prompt's
// verification-mode truth: the exemplar declares the operator's pick on
// Lightweight, the guidance steers only when a non-default pick exists,
// and Full ignores the rider (the field is inert there). Cases generated
// via routed test-generation (gemini-pro) and adapted.
// ---------------------------------------------------------------------

suite("buildSessionGenPrompt — verification-mode truth (Set 077 S3)", () => {
  test("lightweight + dedicated-sessions: exemplar declares it and guidance steers", () => {
    const prompt = buildSessionGenPrompt(bundle, {
      tier: "lightweight",
      verificationMode: "dedicated-sessions",
    });
    assert.ok(prompt.includes("verificationMode: dedicated-sessions"));
    assert.ok(
      prompt.includes("The operator selected **dedicated verification sessions**"),
    );
  });

  test("lightweight without a pick: exemplar keeps the default, no mode guidance", () => {
    const prompt = buildSessionGenPrompt(bundle, { tier: "lightweight" });
    assert.ok(prompt.includes("verificationMode: out-of-band-or-none"));
    assert.ok(!prompt.includes("verificationMode: dedicated-sessions"));
    assert.ok(
      !prompt.includes("The operator selected **dedicated verification sessions**"),
    );
  });

  test("full ignores a verificationMode option — exemplar omits the line (Set 082)", () => {
    const prompt = buildSessionGenPrompt(bundle, {
      tier: "full",
      verificationMode: "dedicated-sessions",
    });
    // The Full exemplar spec carries NO verificationMode line at all —
    // the field is Lightweight-only and Full scaffolds omit it. The only
    // rendered `verificationMode` mentions are the hard-requirements
    // prose scoping the field to Lightweight.
    assert.ok(
      !/^verificationMode:/m.test(prompt),
      "a Full-resolved prompt must not render a verificationMode config line",
    );
    assert.ok(prompt.includes("`full` sets OMIT"));
    assert.ok(
      !prompt.includes("The operator selected **dedicated verification sessions**"),
    );
  });

  // Set 082 pin: the riderless Full prompt (the common palette path)
  // renders no verificationMode line either — buildSessionGenPrompt
  // emits the field on Lightweight-resolved prompts only.
  test("full without a rider: no verificationMode line anywhere (Set 082)", () => {
    const prompt = buildSessionGenPrompt(bundle, { tier: "full" });
    assert.ok(!/^verificationMode:/m.test(prompt));
    assert.ok(prompt.includes("`full` sets OMIT"));
  });
});
