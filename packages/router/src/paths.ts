// Where this package sits, resolved from the running file rather than from
// the working directory.
//
// It walks up looking for a `package.json` that NAMES this package, because
// the same code runs from three layouts and the depth differs in each:
// `src/` under Node's type stripping, `dist/` after esbuild, and
// `<extension>/dist/` inside the VSIX. A constant number of `..` segments
// would be right in one and silently wrong in the others, and "silently
// wrong" here means reading a config from a directory that happens to
// exist.
//
// The third layout is why the marker is the NAME rather than the file. A
// VSIX bundles this package into the extension's own `dist/`, where the
// nearest `package.json` above is the extension's; the build writes one
// beside the bundle that says what it is, and the walk finds that. A
// bundle that could not say what it is would resolve to the extension and
// read its schemas from a directory with none.
//
// The bundled defaults -- `router-config.yaml`, the schemas, the prompt
// templates, the seat catalog -- sit at that root, so they travel with
// whichever copy of the package is running and there is never a second one
// to drift.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_NAME = "dabbler-ai-router";

function findPackageRoot(start: string): string {
  let directory = start;
  for (;;) {
    const manifest = join(directory, "package.json");
    if (existsSync(manifest)) {
      try {
        const parsed: unknown = JSON.parse(readFileSync(manifest, "utf8"));
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          (parsed as { name?: unknown }).name === PACKAGE_NAME
        ) {
          return directory;
        }
      } catch {
        // A package.json that will not parse is not this one.
      }
    }
    const parent = dirname(directory);
    if (parent === directory) {
      throw new Error(
        `could not locate the ${PACKAGE_NAME} package root above ${start}`,
      );
    }
    directory = parent;
  }
}

/** `packages/router`. */
export const PACKAGE_ROOT = findPackageRoot(
  dirname(fileURLToPath(import.meta.url)),
);

/** The repository holding this package, in a development checkout. */
export const REPO_ROOT = join(PACKAGE_ROOT, "..", "..");

/**
 * The bundled data: `router-config.yaml`, the schemas, the prompt
 * templates, the seat catalog. It is the package root because that is what
 * ships -- `files` in the manifest names each of them, and the extension's
 * build copies the same set beside its bundle.
 */
export const ASSET_DIR = PACKAGE_ROOT;

export const SCHEMA_DIR = join(ASSET_DIR, "schemas");
