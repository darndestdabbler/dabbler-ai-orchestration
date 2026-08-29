// Where this package sits, and where the Python package it is replacing
// sits, resolved from the running file rather than from the working
// directory.
//
// It walks up looking for this package's own `package.json`, because the
// same code runs from two depths: `src/` under ts-node and `dist/` after
// esbuild. A constant number of `..` segments would be right in one and
// silently wrong in the other, and "silently wrong" here means reading a
// config from a directory that happens to exist.
//
// Until session 36 the bundled defaults -- `router-config.yaml`, the
// schemas, the prompt templates -- are read from `ai_router/`, the one
// copy. A second copy under this package would be data that drifts, and
// the parity control compares two routers reading the same input: a
// second copy would make a difference between them mean nothing.

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

/** The repository holding this package. */
export const REPO_ROOT = join(PACKAGE_ROOT, "..", "..");

/** The Python package: the bundled config, the schemas, the templates. */
export const AI_ROUTER_DIR = join(REPO_ROOT, "ai_router");

export const SCHEMA_DIR = join(AI_ROUTER_DIR, "schemas");
