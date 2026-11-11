// The router's version, read from the manifest that declares it.
//
// It appears in the writer stamp of every record this package writes, and
// the Python router stamps `ai_router.__version__` there. The two must be
// the same string or a record says two routers wrote it; they are kept in
// step by the release, not by a constant here that could be edited alone.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { PACKAGE_ROOT } from "./paths.ts";

/** What the extension's own manifest says about itself, where the router runs inside one. */
export interface ExtensionManifest {
  readonly name: string;
  readonly version: string;
  /** The manifest's `bugs` address, where reports about the framework go, or null. */
  readonly bugs: string | null;
}

/**
 * The Dabbler extension's package name. Only its manifest is the extension's:
 * a router installed under another VS Code extension's `node_modules` sits
 * below that extension's manifest, whose name, version and address are not
 * Dabbler's.
 */
export const EXTENSION_NAME = "dabbler-ai-orchestration";

/**
 * The nearest manifest above `start` that is the Dabbler extension's -- where
 * the VSIX puts the bundle -- read at the call and kept nowhere: the address
 * it names is the installed extension's own, so it can never be a stale copy.
 */
export function extensionManifestAbove(start: string): ExtensionManifest | null {
  let directory = dirname(start);
  for (;;) {
    const manifest = join(directory, "package.json");
    if (existsSync(manifest)) {
      try {
        const parsed = JSON.parse(readFileSync(manifest, "utf8")) as {
          name?: unknown;
          version?: unknown;
          engines?: { vscode?: unknown };
          bugs?: unknown;
        };
        if (
          typeof parsed.engines?.vscode === "string" &&
          parsed.name === EXTENSION_NAME &&
          typeof parsed.version === "string"
        ) {
          const bugs = parsed.bugs;
          const address =
            typeof bugs === "string"
              ? bugs
              : typeof (bugs as { url?: unknown } | undefined)?.url === "string"
                ? (bugs as { url: string }).url
                : null;
          return { name: EXTENSION_NAME, version: parsed.version, bugs: address };
        }
      } catch {
        // A manifest that will not parse is not the extension's.
      }
    }
    const parent = dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
}

function readVersion(): string {
  const manifest: unknown = JSON.parse(
    readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8"),
  );
  const declared =
    typeof manifest === "object" && manifest !== null
      ? (manifest as { version?: unknown }).version
      : undefined;
  if (typeof declared !== "string" || declared === "") {
    throw new Error("the router package declares no version");
  }
  return declared;
}

export const VERSION = readVersion();
