// One version, stamped into every manifest that has to carry it.
//
// npm and the VS Code Marketplace each require a literal `version` in their
// own `package.json`, and the extension names the router as a dependency, so
// three literals have to agree. Keeping them in step by hand is what put an
// install of router 2.0.0 beside extension 2.7.0 in front of the operator --
// two things where they have one.
//
// So `version.json` is the source and nothing else is authored: this script
// writes it into the manifests and the lock file, and `--check` reports what
// is stale without writing. It is the same shape as `check:types` beside it,
// for the same reason: a rule that only refuses tells you late, and a
// generator that nothing checks drifts.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const check = process.argv.includes("--check");

const ROUTER_MANIFEST = "packages/router/package.json";
const EXTENSION_MANIFEST = "tools/dabbler-ai-orchestration/package.json";
const LOCKFILE = "package-lock.json";
const ROUTER_PACKAGE = "dabbler-ai-router";

function read(relPath: string): string {
  return readFileSync(join(repoRoot, relPath), "utf8");
}

/** The one version, from the one file that declares it. */
export function canonicalVersion(root: string = repoRoot): string {
  const declared = (
    JSON.parse(readFileSync(join(root, "version.json"), "utf8")) as {
      version?: unknown;
    }
  ).version;
  if (typeof declared !== "string" || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(declared)) {
    throw new Error(`version.json declares ${JSON.stringify(declared)}, which is not a version`);
  }
  return declared;
}

/** Replace one manifest's own `"version"`, which is always its first. */
function stampVersionField(text: string, version: string): string {
  return text.replace(/("version":\s*")[^"]+(")/, `$1${version}$2`);
}

function stampDependency(text: string, version: string): string {
  return text.replace(
    new RegExp(`("${ROUTER_PACKAGE}":\\s*")[^"]+(")`),
    `$1${version}$2`,
  );
}

/**
 * The lock file, whose two workspace entries carry the versions npm resolved.
 *
 * Parsed and re-serialised rather than patched by regex: npm writes it with
 * two-space indent and a trailing newline, and a lock file that disagrees
 * with the manifests is an `npm ci` that installs the wrong thing.
 */
function stampLock(text: string, version: string): string {
  const lock = JSON.parse(text) as {
    packages?: Record<string, { version?: string; dependencies?: Record<string, string> }>;
  };
  const router = lock.packages?.["packages/router"];
  const extension = lock.packages?.["tools/dabbler-ai-orchestration"];
  if (router) router.version = version;
  if (extension) {
    extension.version = version;
    if (extension.dependencies?.[ROUTER_PACKAGE] !== undefined) {
      extension.dependencies[ROUTER_PACKAGE] = version;
    }
  }
  return `${JSON.stringify(lock, null, 2)}\n`;
}

// `process.exitCode`, never `process.exit()`: this runs through `run-ts.mjs`'s
// dynamic import, and exiting from inside one while stdout is still draining
// crashes on Windows with libuv's `UV_HANDLE_CLOSING` assertion -- a control
// that printed its pass and then failed the step.
function main(): number {
  const version = canonicalVersion();
  const stamped: { readonly path: string; readonly text: string }[] = [
    { path: ROUTER_MANIFEST, text: stampVersionField(read(ROUTER_MANIFEST), version) },
    {
      path: EXTENSION_MANIFEST,
      text: stampDependency(stampVersionField(read(EXTENSION_MANIFEST), version), version),
    },
    { path: LOCKFILE, text: stampLock(read(LOCKFILE), version) },
  ];

  const stale = stamped.filter((file) => file.text !== read(file.path));

  if (check) {
    if (stale.length === 0) {
      process.stdout.write(`check:version: ${stamped.length} manifest(s) carry ${version}\n`);
      return 0;
    }
    for (const file of stale) process.stderr.write(`  stale      ${file.path}\n`);
    process.stderr.write(
      `check:version: ${stale.length} file(s) do not carry ${version}, the version ` +
        "declared in version.json. Run 'npm run stamp:version'.\n",
    );
    return 1;
  }

  for (const file of stale) writeFileSync(join(repoRoot, file.path), file.text, "utf8");
  process.stdout.write(
    stale.length === 0
      ? `stamp:version: every manifest already carries ${version}\n`
      : `stamp:version: wrote ${version} into ${stale.map((f) => f.path).join(", ")}\n`,
  );
  return 0;
}

process.exitCode = main();
