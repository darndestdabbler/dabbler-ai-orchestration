// `dabbler modules create` -- append one entry to `docs/modules.yaml`;
// `dabbler modules show` -- print the manifest as the framework reads it.
//
// One writer, because the manifest has one writer. The `Router` contract
// used to name `list` and `retire`; nothing implemented either, and a
// contract naming a verb nothing implements is a promise that would be
// refused at the moment it was needed (D162/D152). `show` is the reader:
// the shape, the entries in dependency order, and `usedBy` derived. Rename,
// delete and reorganization stay manual edits to the manifest.

import { EXIT_OK as CREATED, create, show } from "../modules.ts";
import { tryWriteProjection } from "../projection.ts";
import { writeErr, writeOut } from "./output.ts";
import { statSync } from "node:fs";

const EXIT_OK = 0;
const EXIT_USAGE = 2;

/** Flags that may be given more than once, each occurrence appending. */
const REPEATABLE: Readonly<Record<string, string>> = {
  "--code-root": "codeRoots",
  "--depends-on": "dependsOn",
  "--spec-section": "specSections",
  "--context-asset": "contextAssets",
};

const SINGLE = new Set([
  "--slug",
  "--title",
  "--plan-path",
  "--kind",
  "--package",
  "--contract",
]);

function usage(): string {
  return [
    "usage: dabbler modules create [-h] --slug SLUG --title TITLE",
    "                              [--plan-path PLAN_PATH]",
    "                              [--code-root CODE_ROOTS]",
    "                              [--kind {shared-types,library,application}]",
    "                              [--depends-on SLUG]",
    "                              [--package PACKAGE]",
    "                              [--contract {designed,package,generated}]",
    "                              [--spec-section SPEC_SECTIONS]",
    "                              [--context-asset CONTEXT_ASSETS]",
    "                              workspace_root",
    "       dabbler modules show [-h] workspace_root",
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
    "  --kind KIND           shared-types, library (the default) or application",
    "  --depends-on SLUG     a module this one consumes (repeatable); who",
    "                        depends on a module is derived, never declared",
    "  --package PACKAGE     the artifact id a sibling consumes (a NuGet id, or",
    "                        Maven's groupId:artifactId)",
    "  --contract MODE       designed, package (the default when a package is",
    "                        declared) or generated",
    "  --spec-section SPEC_SECTIONS",
    "                        reference spec section as PATH or PATH#anchor",
    "                        (repeatable)",
    "  --context-asset CONTEXT_ASSETS",
    "                        schema/config/migration path or glob (repeatable)",
    "",
    "`show` prints the manifest as the framework reads it: the shape (one",
    "module, or many), the entries in dependency order, and usedBy per module.",
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
  if (subcommand === "show") {
    const [root, ...extra] = rest;
    if (root === "--help" || root === "-h") {
      writeOut(usage());
      return EXIT_OK;
    }
    if (root === undefined || extra.length > 0) {
      writeErr(`dabbler modules show: the following arguments are required: workspace_root\n`);
      return EXIT_USAGE;
    }
    if (!isDirectory(root)) {
      writeErr(`modules: not a directory: ${root}\n`);
      return EXIT_USAGE;
    }
    return show(root);
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
  const code = create(workspaceRoot, single.get("--slug")!, single.get("--title")!, {
    planPath: single.get("--plan-path") ?? null,
    codeRoots: repeated.get("codeRoots") ?? null,
    specSections: repeated.get("specSections") ?? null,
    contextAssets: repeated.get("contextAssets") ?? null,
    kind: single.get("--kind") ?? null,
    dependsOn: repeated.get("dependsOn") ?? null,
    package: single.get("--package") ?? null,
    contract: single.get("--contract") ?? null,
  });
  // The manifest moved, so the projection the Solution Explorer reads is
  // rewritten here, by the verb that moved it -- the same rule every other
  // declaration-moving verb follows. The extension also re-derives on a
  // manifest change it watches, but a verb run from a terminal has no
  // extension to do it for it.
  if (code === CREATED) tryWriteProjection(workspaceRoot);
  return code;
}
