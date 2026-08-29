// `dabbler modules create` -- append one entry to `docs/modules.yaml`.
//
// One subcommand, because `python -m ai_router.modules` has one. The
// `Router` contract used to name `list` and `retire`; neither exists on
// either side, and a port is not where a verb gets invented (D162/D152).
// Rename, delete and reorganization stay manual edits to the manifest.

import { create } from "../modules.ts";
import { writeErr, writeOut } from "./output.ts";
import { statSync } from "node:fs";

const EXIT_OK = 0;
const EXIT_USAGE = 2;

/** Flags that may be given more than once, each occurrence appending. */
const REPEATABLE: Readonly<Record<string, string>> = {
  "--code-root": "codeRoots",
  "--spec-section": "specSections",
  "--context-asset": "contextAssets",
};

const SINGLE = new Set(["--slug", "--title", "--plan-path"]);

function usage(): string {
  return [
    "usage: dabbler modules create [-h] --slug SLUG --title TITLE",
    "                              [--plan-path PLAN_PATH]",
    "                              [--code-root CODE_ROOTS]",
    "                              [--spec-section SPEC_SECTIONS]",
    "                              [--context-asset CONTEXT_ASSETS]",
    "                              workspace_root",
    "",
    "positional arguments:",
    "  workspace_root        workspace root containing docs/",
    "",
    "options:",
    "  -h, --help            show this help message and exit",
    "  --slug SLUG           machine identity (kebab-case)",
    "  --title TITLE         display name the Explorer shows",
    "  --plan-path PLAN_PATH",
    "                        module plan path, relative to the root",
    "  --code-root CODE_ROOTS",
    "                        repo-relative directory that bounds the module on",
    "                        disk (repeatable)",
    "  --spec-section SPEC_SECTIONS",
    "                        reference spec section as PATH or PATH#anchor",
    "                        (repeatable)",
    "  --context-asset CONTEXT_ASSETS",
    "                        schema/config/migration path or glob (repeatable)",
    "",
  ].join("\n");
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export async function modulesVerb(argv: string[]): Promise<number> {
  const [subcommand, ...rest] = argv;
  if (subcommand === undefined) {
    writeErr(
      `dabbler modules: the following arguments are required: command\n\n${usage()}`,
    );
    return EXIT_USAGE;
  }
  if (subcommand === "--help" || subcommand === "-h") {
    writeOut(usage());
    return EXIT_OK;
  }
  if (subcommand !== "create") {
    writeErr(`dabbler modules: '${subcommand}' is not a subcommand\n\n${usage()}`);
    return EXIT_USAGE;
  }

  const single = new Map<string, string>();
  const repeated = new Map<string, string[]>();
  const positional: string[] = [];
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === "--help" || token === "-h") {
      writeOut(usage());
      return EXIT_OK;
    }
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const equals = token.indexOf("=");
    const flag = equals === -1 ? token : token.slice(0, equals);
    if (!SINGLE.has(flag) && !(flag in REPEATABLE)) {
      writeErr(`dabbler modules create: unrecognized argument: ${flag}\n\n${usage()}`);
      return EXIT_USAGE;
    }
    let value: string;
    if (equals !== -1) {
      value = token.slice(equals + 1);
    } else {
      const next = rest[index + 1];
      if (next === undefined || next.startsWith("--")) {
        writeErr(`dabbler modules create: argument ${flag}: expected one argument\n`);
        return EXIT_USAGE;
      }
      value = next;
      index += 1;
    }
    if (flag in REPEATABLE) {
      const key = REPEATABLE[flag];
      repeated.set(key, [...(repeated.get(key) ?? []), value]);
    } else {
      single.set(flag, value);
    }
  }

  const missing = ["--slug", "--title"].filter((flag) => !single.has(flag));
  if (positional.length === 0) missing.unshift("workspace_root");
  if (missing.length > 0) {
    writeErr(
      `dabbler modules create: the following arguments are required: ${missing.join(", ")}\n`,
    );
    return EXIT_USAGE;
  }
  const workspaceRoot = positional[0];
  if (!isDirectory(workspaceRoot)) {
    writeErr(`modules: not a directory: ${workspaceRoot}\n`);
    return EXIT_USAGE;
  }
  return create(workspaceRoot, single.get("--slug")!, single.get("--title")!, {
    planPath: single.get("--plan-path") ?? null,
    codeRoots: repeated.get("codeRoots") ?? null,
    specSections: repeated.get("specSections") ?? null,
    contextAssets: repeated.get("contextAssets") ?? null,
  });
}
