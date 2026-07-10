// Set 058 S2 — unit tests for the shared consumer-bootstrap template
// writer. Renders against the CANONICAL bundle on disk
// (docs/templates/consumer-bootstrap/, the Set 058 S1 deliverable) so the
// writer and the bundle are exercised together — a stale/renamed template
// fails here, not silently at scaffold time.

import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  BootstrapContext,
  TemplateBundle,
  buildSlug,
  expandSpecSessions,
  findUnsubstitutedTokens,
  isCanonicalSlug,
  kebabCase,
  loadTemplateBundle,
  padSessionNumber,
  renderConsumerBootstrap,
  renderEngineFile,
  renderSessionState,
  renderSpec,
  resolveBundledTemplateDir,
  substituteTokens,
} from "../../utils/consumerBootstrap";

const EXT_ROOT = path.resolve(__dirname, "../../..");

/** Locate the canonical bundle (repo-root docs) from the test's location. */
function canonicalBundleDir(): string {
  const candidates = [
    path.resolve(EXT_ROOT, "../../docs/templates/consumer-bootstrap"),
    // The build artifact the packaged extension actually ships from.
    resolveBundledTemplateDir(EXT_ROOT),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "spec.md.template"))) return c;
  }
  throw new Error(
    `Could not locate the consumer-bootstrap bundle. Tried:\n${candidates.join("\n")}`,
  );
}

const bundle: TemplateBundle = loadTemplateBundle(canonicalBundleDir());

function ctx(over: Partial<BootstrapContext> = {}): BootstrapContext {
  return {
    repoName: "my-app",
    setTitle: "User authentication",
    purpose: "Add email + password sign-in.",
    slug: "001-user-authentication",
    created: "2026-06-09",
    tier: "full",
    verificationMode: "out-of-band-or-none",
    totalSessions: 3,
    ...over,
  };
}

suite("consumerBootstrap — slug helpers", () => {
  test("kebabCase normalizes free text", () => {
    assert.strictEqual(kebabCase("User Authentication"), "user-authentication");
    assert.strictEqual(kebabCase("  Add OAuth 2.0!! "), "add-oauth-2-0");
  });
  test("buildSlug produces a zero-padded NNN- prefix", () => {
    assert.strictEqual(buildSlug(1, "User Auth"), "001-user-auth");
    assert.strictEqual(buildSlug(42, "Catalog"), "042-catalog");
  });
  test("isCanonicalSlug accepts NNN-kebab and rejects bare slugs", () => {
    assert.ok(isCanonicalSlug("001-user-auth"));
    assert.ok(!isCanonicalSlug("user-auth"));
    assert.ok(!isCanonicalSlug("1-user-auth")); // needs >= 3 digits
  });
  test("padSessionNumber pads to width 3", () => {
    assert.strictEqual(padSessionNumber(2), "002");
    assert.strictEqual(padSessionNumber(123), "123");
  });
});

suite("consumerBootstrap — token substitution", () => {
  test("substitutes known tokens, leaves unknown ones for detection", () => {
    const out = substituteTokens("{{REPO_NAME}} / {{TIER}} / {{NOPE}}", ctx());
    assert.strictEqual(out, "my-app / full / {{NOPE}}");
    assert.deepStrictEqual(findUnsubstitutedTokens(out), ["{{NOPE}}"]);
  });
});

suite("consumerBootstrap — spec.md render", () => {
  test("substitutes scalars and carries tier + verificationMode", () => {
    const spec = renderSpec(bundle, ctx({ tier: "lightweight" }));
    assert.ok(spec.includes("# User authentication"));
    assert.ok(spec.includes("**Purpose:** Add email + password sign-in."));
    assert.ok(spec.includes("docs/session-sets/001-user-authentication/"));
    assert.ok(/tier:\s*lightweight/.test(spec));
    assert.ok(/verificationMode:\s*out-of-band-or-none/.test(spec));
    assert.ok(/totalSessions:\s*3/.test(spec));
    assert.strictEqual(findUnsubstitutedTokens(spec).length, 0);
  });

  // Set 082: the verificationMode field is Lightweight-only — a Full
  // render omits the whole line (omission means the documented default),
  // with no blank-line residue where the line used to be.
  test("module context renders the module: line; absent omits it (Set 087 S3)", () => {
    const withModule = renderSpec(bundle, ctx({ module: "greeter" }));
    assert.ok(/^module: greeter/m.test(withModule), "module line must render");
    assert.ok(
      withModule.includes("globally unique"),
      "the grouping-only comment rides the line",
    );
    const without = renderSpec(bundle, ctx());
    assert.ok(!/^module:/m.test(without), "no module context — no module line");
    // Whole-line token: no blank-line residue where the token sat.
    assert.ok(
      /^tier: full[^\n]*\nrequiresUAT/m.test(without),
      "tier line must be directly followed by requiresUAT",
    );
  });

  test("Full render omits the verificationMode line entirely (Set 082)", () => {
    const spec = renderSpec(bundle, ctx({ tier: "full" }));
    assert.ok(
      !/verificationMode/.test(spec),
      "a Full-tier spec must not mention verificationMode",
    );
    // No blank-line residue: uatStyle is immediately followed by
    // totalSessions inside the config block.
    assert.ok(
      /uatStyle: ad-hoc[^\n]*\ntotalSessions: 3\n/.test(spec),
      "the omitted line must leave no blank-line residue",
    );
    assert.strictEqual(findUnsubstitutedTokens(spec).length, 0);
  });

  test("Lightweight render keeps the exact line, comment included (Set 082)", () => {
    const spec = renderSpec(bundle, ctx({ tier: "lightweight" }));
    assert.ok(
      spec.includes(
        "\nverificationMode: out-of-band-or-none  # Lightweight only: out-of-band-or-none (default) | dedicated-sessions; inert on Full\ntotalSessions: 3\n",
      ),
      "the Lightweight line (with its comment) must render byte-identically to the pre-082 output",
    );
  });

  test("Lightweight render carries a dedicated-sessions pick (Set 082)", () => {
    const spec = renderSpec(
      bundle,
      ctx({ tier: "lightweight", verificationMode: "dedicated-sessions" }),
    );
    assert.ok(/^verificationMode: dedicated-sessions  #/m.test(spec));
  });

  test("expands to EXACTLY totalSessions numbered blocks with the right prefixes", () => {
    const spec = renderSpec(bundle, ctx({ totalSessions: 4 }));
    // Exactly N session headers, numbered 1..N, no leftover sample block.
    const headers = (spec.match(/### Session \d+ of 4:/g) || []).map((h) =>
      Number(/Session (\d+) of/.exec(h)![1]),
    );
    assert.deepStrictEqual(headers, [1, 2, 3, 4]);
    // Per-block isolation: each block K references ONLY its own
    // session-00K/ prefix — no stale session-001/ leaking into later blocks.
    const blocks = spec
      .split(/### Session \d+ of 4:/)
      .slice(1); // drop the preamble before the first header
    assert.strictEqual(blocks.length, 4);
    blocks.forEach((block, i) => {
      const k = i + 1;
      const inBlock = [...new Set(block.match(/session-\d{3}\//g) || [])];
      assert.deepStrictEqual(
        inBlock,
        [`session-${padSessionNumber(k)}/`],
        `block ${k} should reference only its own prefix`,
      );
    });
  });

  test("handles a CRLF-checked-out template (Windows core.autocrlf)", () => {
    // Simulate a CRLF bundle by hand-constructing the bundle from CRLF text.
    const crlf = (s: string) => s.replace(/\n/g, "\r\n");
    const crlfBundle: TemplateBundle = {
      specTemplate: crlf(bundle.specTemplate),
      sessionStateTemplate: crlf(bundle.sessionStateTemplate),
      startHereTemplate: crlf(bundle.startHereTemplate),
      gettingStartedTemplate: crlf(bundle.gettingStartedTemplate),
      sharedBody: crlf(bundle.sharedBody),
      claudeTail: crlf(bundle.claudeTail),
      agentsTail: crlf(bundle.agentsTail),
      geminiTail: crlf(bundle.geminiTail),
      lessonsLearnedTemplate: crlf(bundle.lessonsLearnedTemplate),
      projectGuidanceTemplate: crlf(bundle.projectGuidanceTemplate),
      lessonsArchiveTemplate: crlf(bundle.lessonsArchiveTemplate),
      crossProviderVerificationTemplate: crlf(
        bundle.crossProviderVerificationTemplate,
      ),
      codeownersTemplate: crlf(bundle.codeownersTemplate),
      monorepoCiTemplate: crlf(bundle.monorepoCiTemplate),
    };
    const spec = renderSpec(crlfBundle, ctx({ totalSessions: 3 }));
    const headers = (spec.match(/### Session \d+ of 3:/g) || []).map((h) =>
      Number(/Session (\d+) of/.exec(h)![1]),
    );
    assert.deepStrictEqual(headers, [1, 2, 3], "expansion must still fire under CRLF");
    const prefixes = [...new Set(spec.match(/session-\d{3}\//g) || [])].sort();
    assert.deepStrictEqual(prefixes, ["session-001/", "session-002/", "session-003/"]);
  });

  test("single-session set emits exactly one block", () => {
    const spec = renderSpec(bundle, ctx({ totalSessions: 1 }));
    const headers = spec.match(/### Session \d+ of 1:/g) || [];
    assert.strictEqual(headers.length, 1);
  });

  test("expandSpecSessions is a no-op when markers are absent", () => {
    const text = "no sessions header here";
    assert.strictEqual(expandSpecSessions(text, 3), text);
  });
});

suite("consumerBootstrap — session-state.json render", () => {
  test("schemaVersion 4, not-started, one object per session", () => {
    const json = JSON.parse(renderSessionState(bundle, ctx({ totalSessions: 3 })));
    assert.strictEqual(json.schemaVersion, 4);
    assert.strictEqual(json.sessionSetName, "001-user-authentication");
    assert.strictEqual(json.status, "not-started");
    assert.strictEqual(json.sessions.length, 3);
    json.sessions.forEach((s: Record<string, unknown>, i: number) => {
      assert.strictEqual(s.number, i + 1);
      assert.strictEqual(s.title, `Session ${i + 1}`);
      assert.strictEqual(s.status, "not-started");
      assert.strictEqual(s.orchestrator, null);
      assert.strictEqual(s.verificationVerdict, null);
    });
  });
  test("never emits schemaVersion 2", () => {
    const text = renderSessionState(bundle, ctx());
    assert.ok(!/"schemaVersion":\s*2\b/.test(text));
  });
});

suite("consumerBootstrap — engine files", () => {
  test("each engine file = shared body + its tail", () => {
    const claude = renderEngineFile(bundle.sharedBody, bundle.claudeTail, ctx());
    assert.ok(claude.includes("AI orchestrator instructions — `my-app`"));
    assert.ok(claude.includes("Engine-specific bootstrap (Claude Code)"));
    const agents = renderEngineFile(bundle.sharedBody, bundle.agentsTail, ctx());
    assert.ok(agents.includes("Engine-specific bootstrap (Codex / GitHub Copilot)"));
    const gemini = renderEngineFile(bundle.sharedBody, bundle.geminiTail, ctx());
    assert.ok(gemini.includes("Engine-specific bootstrap (Gemini Code Assist)"));
    // All three share the identical body prefix.
    const body = substituteTokens(bundle.sharedBody, ctx());
    assert.ok(claude.startsWith(body));
    assert.ok(agents.startsWith(body));
    assert.ok(gemini.startsWith(body));
  });
});

suite("consumerBootstrap — full render", () => {
  test("produces the thirteen artifacts at canonical relative paths", () => {
    const { files } = renderConsumerBootstrap(bundle, ctx());
    const keys = Object.keys(files).sort();
    assert.deepStrictEqual(keys, [
      // Set 087 S3 (ruling Q3): ownership + monorepo-CI teaching templates.
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
      "docs/session-sets/001-user-authentication/session-state.json",
      "docs/session-sets/001-user-authentication/spec.md",
    ]);
  });

  test("no rendered artifact contains an unsubstituted token (both tiers)", () => {
    for (const tier of ["full", "lightweight"] as const) {
      const { files } = renderConsumerBootstrap(bundle, ctx({ tier }));
      for (const [rel, content] of Object.entries(files)) {
        assert.deepStrictEqual(
          findUnsubstitutedTokens(content),
          [],
          `${rel} (${tier}) has leftover tokens`,
        );
      }
    }
  });

  test("renderConsumerBootstrap does NOT emit a router-config (caller's job)", () => {
    const { files } = renderConsumerBootstrap(bundle, ctx());
    assert.ok(!Object.keys(files).some((k) => k.includes("router-config")));
  });

  test("rejects a non-positive-integer totalSessions at the writer boundary", () => {
    for (const bad of [0, -1, 1.5, NaN]) {
      assert.throws(
        () => renderConsumerBootstrap(bundle, ctx({ totalSessions: bad })),
        /positive integer/,
        `totalSessions=${bad} should throw`,
      );
    }
  });
});

suite("consumerBootstrap — packaged-runtime bundle path", () => {
  // Pins the contract the INSTALLED extension actually uses at scaffold
  // time: resolveBundledTemplateDir(extensionPath) -> the dist copy esbuild
  // writes, loaded by loadTemplateBundle. The commands resolve the bundle
  // this way (not from repo-root docs), so a missing/mispackaged dist copy
  // must fail here, not silently at scaffold time on a user's machine.
  test("resolves under <extensionRoot>/dist/templates/consumer-bootstrap", () => {
    const fakeRoot = path.join("/some", "installed", "extension");
    assert.strictEqual(
      resolveBundledTemplateDir(fakeRoot).replace(/\\/g, "/"),
      "/some/installed/extension/dist/templates/consumer-bootstrap",
    );
  });

  test("the REAL packaged dist bundle exists with all fourteen files", () => {
    // Pins the actual build artifact the .vsix ships (esbuild copyTemplateBundle
    // writes it; it is committed alongside dist/extension.js). A broken copy
    // step or a missing packaged bundle fails here, not on a user's machine.
    const distDir = resolveBundledTemplateDir(EXT_ROOT);
    const required = [
      "spec.md.template",
      "session-state.json.template",
      "start-here.md.template",
      "getting-started.md.template",
      "engine-file.shared-body.md",
      "engine-file.claude-tail.md",
      "engine-file.agents-tail.md",
      "engine-file.gemini-tail.md",
      // Set 064 (D7): guidance-lifecycle starters.
      "lessons-learned.md.template",
      "project-guidance.md.template",
      "lessons-archive.md.template",
      // Set 077 S4 (Feature 3): engine-facing verification instructions.
      "cross-provider-verification.md.template",
      // Set 087 S3 (ruling Q3): ownership + monorepo-CI templates.
      "CODEOWNERS.template",
      "monorepo-ci.yml.template",
    ];
    for (const f of required) {
      assert.ok(
        fs.existsSync(path.join(distDir, f)),
        `packaged bundle missing ${f} at ${distDir} — run "npm run compile"`,
      );
    }
    // And it must actually render.
    const { files } = renderConsumerBootstrap(loadTemplateBundle(distDir), ctx());
    assert.strictEqual(Object.keys(files).length, 13);
  });

  test("loadTemplateBundle reads a bundle laid out at the packaged path", () => {
    const fakeExt = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-ext-"));
    try {
      const bundleDir = resolveBundledTemplateDir(fakeExt);
      fs.mkdirSync(bundleDir, { recursive: true });
      // Copy the real bundle files into the packaged layout.
      const src = canonicalBundleDir();
      for (const f of fs.readdirSync(src)) {
        if (f.endsWith(".template") || f.endsWith(".md")) {
          fs.copyFileSync(path.join(src, f), path.join(bundleDir, f));
        }
      }
      const loaded = loadTemplateBundle(resolveBundledTemplateDir(fakeExt));
      const { files } = renderConsumerBootstrap(loaded, ctx());
      assert.ok(files["CLAUDE.md"].includes("my-app"));
      assert.ok(JSON.parse(files["docs/session-sets/001-user-authentication/session-state.json"]).schemaVersion === 4);
    } finally {
      fs.rmSync(fakeExt, { recursive: true, force: true });
    }
  });
});
