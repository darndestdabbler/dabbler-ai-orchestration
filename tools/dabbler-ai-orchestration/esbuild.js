const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const watch = process.argv.includes("--watch");

// Copy the canonical consumer-bootstrap template bundle (repo-root
// docs/templates/consumer-bootstrap/, the Set 058 S1 deliverable) into
// dist/ so the packaged extension can render scaffolding artifacts at
// runtime without reaching outside the installed extension. The repo-root
// copy stays the single source of truth; this is a build artifact. The
// Session-3 snapshot check asserts the rendered output matches this bundle.
function copyTemplateBundle() {
  const src = path.resolve(__dirname, "..", "..", "docs", "templates", "consumer-bootstrap");
  const dst = path.join(__dirname, "dist", "templates", "consumer-bootstrap");
  // The packaged extension cannot render scaffolding without this bundle, so a
  // missing source is a hard build failure, not a warning — shipping a .vsix
  // with no dist/templates would break every scaffold at runtime.
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
    // Set 087 S3 (ruling Q3): module ownership + monorepo CI templates.
    "CODEOWNERS.template",
    "monorepo-ci.yml.template",
    // Set 107 S1: the Azure DevOps counterpart to monorepo-ci.yml.template.
    "azure-pipelines.yml.template",
  ];
  for (const f of required) {
    if (!fs.existsSync(path.join(src, f))) {
      throw new Error(`[esbuild] required template bundle file missing: ${path.join(src, f)}`);
    }
  }
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    fs.copyFileSync(path.join(src, entry.name), path.join(dst, entry.name));
  }
  console.log(`[esbuild] copied consumer-bootstrap template bundle -> ${path.relative(__dirname, dst)}`);
}

// Copy the canonical sample-project bundle (repo-root
// docs/templates/sample-project/, the Set 107 S1 deliverable) into dist/ so
// `Dabbler: Try a sample project` can render it at runtime without reaching
// outside the installed extension. Unlike the consumer-bootstrap bundle this
// one is a TREE (files/ has subdirectories), so the copy recurses. Same
// hard-failure posture: a .vsix with no dist/templates/sample-project cannot
// create a sample at all, which is the whole feature.
function copySampleProjectBundle() {
  const src = path.resolve(__dirname, "..", "..", "docs", "templates", "sample-project");
  const dst = path.join(__dirname, "dist", "templates", "sample-project");
  const required = [
    "bundle.json",
    path.join("files", "main.py"),
    path.join("files", "test_greeting.py"),
    path.join("files", "AGENTS.md"),
    path.join("files", "hello", "greeting.py"),
    path.join("files", "docs", "session-sets", "001-add-a-shout", "spec.md"),
  ];
  for (const f of required) {
    if (!fs.existsSync(path.join(src, f))) {
      throw new Error(`[esbuild] required sample-project bundle file missing: ${path.join(src, f)}`);
    }
  }
  // Full replace rather than merge: a file deleted from the canonical bundle
  // must disappear from dist/ too, or the packaged sample renders a ghost.
  fs.rmSync(dst, { recursive: true, force: true });
  fs.cpSync(src, dst, { recursive: true });
  console.log(`[esbuild] copied sample-project bundle -> ${path.relative(__dirname, dst)}`);
}

// Re-copy the bundles on every (re)build so `--watch` never serves a stale
// dist/templates after a canonical bundle is edited.
const copyBundlePlugin = {
  name: "copy-template-bundles",
  setup(build) {
    build.onEnd(() => {
      copyTemplateBundle();
      copySampleProjectBundle();
    });
  },
};

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node18",
  sourcemap: true,
  minify: false,
  plugins: [copyBundlePlugin],
};

if (watch) {
  esbuild.context(options).then((ctx) => {
    ctx.watch();
    console.log("Watching for changes...");
  });
} else {
  esbuild.build(options).catch(() => process.exit(1));
}
