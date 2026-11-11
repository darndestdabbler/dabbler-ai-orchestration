// `dabbler version` / `dabbler --version` -- which router this is, and which
// extension it is running inside, when it is.
//
// The managed body tells an engine to report the version it ran, and until
// this verb there was nothing to run to find out. The router's version is
// the one every record it writes is stamped with; the extension's is read
// from the nearest manifest above the package root that declares
// `engines.vscode`, which is where the VSIX puts the bundle
// (`<extension>/dist/`, see `paths.ts`). A development checkout has no such
// manifest above it and prints one line.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { PACKAGE_ROOT } from "../paths.ts";
import { VERSION } from "../version.ts";
import { writeErr, writeOut } from "./output.ts";

const EXIT_OK = 0;
const EXIT_USAGE = 2;

/** The extension manifest above `start`, as `[name, version]`, or null. */
export function extensionAbove(start: string): [string, string] | null {
  let directory = dirname(start);
  for (;;) {
    const manifest = join(directory, "package.json");
    if (existsSync(manifest)) {
      try {
        const parsed = JSON.parse(readFileSync(manifest, "utf8")) as {
          name?: unknown;
          version?: unknown;
          engines?: { vscode?: unknown };
        };
        if (
          typeof parsed.engines?.vscode === "string" &&
          typeof parsed.name === "string" &&
          typeof parsed.version === "string"
        ) {
          return [parsed.name, parsed.version];
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

/** The lines the verb prints: the router, then the extension when inside one. */
export function versionLines(packageRoot: string = PACKAGE_ROOT): string[] {
  const lines = [`dabbler-ai-router ${VERSION}`];
  const extension = extensionAbove(packageRoot);
  if (extension !== null) lines.push(`${extension[0]} ${extension[1]} (extension)`);
  return lines;
}

export async function versionVerb(argv: string[]): Promise<number> {
  if (argv.some((argument) => argument === "-h" || argument === "--help")) {
    writeOut(
      "usage: dabbler version\n\n" +
        "Print the router's version, and the extension's when running inside one.\n",
    );
    return EXIT_OK;
  }
  if (argv.length > 0) {
    writeErr(`dabbler version: unrecognized arguments: ${argv.join(" ")}\n`);
    return EXIT_USAGE;
  }
  writeOut(`${versionLines().join("\n")}\n`);
  return EXIT_OK;
}
