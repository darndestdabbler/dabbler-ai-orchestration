// `dabbler module` -- one module's seam, from the terminal.
//
// `contract <slug>` scaffolds the designed seam through the ecosystem seam,
// writing only where absent and naming what it wrote; `contract <slug>
// --against <provider>` scaffolds the consumer's compatibility suite against
// the provider's package. Later sessions add `pack`, `open`, `grant` and
// `revoke` here: one verb for the things done TO a module, beside `modules`
// for the manifest they are declared in.

import { statSync } from "node:fs";

import { loadConfig } from "../config.ts";
import { EcosystemError, ecosystemOf, ensureRootFiles } from "../ecosystem.ts";
import { ManifestError, solutionShape } from "../modules.ts";
import { PackagesError, packModule } from "../packages.ts";
import { writeErr, writeOut } from "./output.ts";

const EXIT_OK = 0;
const EXIT_REFUSED = 1;
const EXIT_USAGE = 2;

function usage(): string {
  return [
    "usage: dabbler module contract [-h] [--against PROVIDER]",
    "                               [--workspace-root WORKSPACE_ROOT] slug",
    "       dabbler module pack [-h] [--session N] [--workspace-root WORKSPACE_ROOT] slug",
    "",
    "the things done to one module: its designed seam, its committed package",
    "",
    "positional arguments:",
    "  slug                  the module, as docs/modules.yaml declares it",
    "",
    "options:",
    "  -h, --help            show this help message and exit",
    "  --against PROVIDER    contract: scaffold this module's compatibility suite",
    "                        against PROVIDER's package instead of its own seam",
    "  --session N           pack: the session the record names",
    "  --workspace-root WORKSPACE_ROOT",
    "                        the repository root (default: the working directory)",
    "",
    "contract: for a .NET module with `contract: designed`, <Package>.Abstractions,",
    "<Package>.ContractTests (an abstract xunit class the implementation's tests",
    "inherit), the implementation's test project wired to it, and the notes page",
    "under modules/<slug>/contract/. Each is written only where absent and named.",
    "",
    "pack: every packable project under the module's roots into packages/ under one",
    "immutable dev version (<base>-dev.<yyyymmdd>.<n>.g<digest>), the pin moved in",
    "Directory.Packages.props, and a record beside each package naming the source",
    "and contract it was built from. Refused where the module's source is not on",
    "this disk: in a focused checkout a sibling is a package, and the grant is the",
    "way to its source.",
    "",
  ].join("\n");
}

function packSubcommand(rest: readonly string[]): number {
  let slug: string | null = null;
  let workspaceRoot = ".";
  let session: number | null = null;
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index] as string;
    if (token === "--help" || token === "-h") {
      writeOut(usage());
      return EXIT_OK;
    }
    if (token === "--session" || token === "--workspace-root") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) {
        writeErr(`dabbler module pack: argument ${token}: expected one argument\n`);
        return EXIT_USAGE;
      }
      if (token === "--workspace-root") workspaceRoot = value;
      else {
        session = Number.parseInt(value, 10);
        if (!Number.isInteger(session) || session < 1) {
          writeErr(`dabbler module pack: argument --session: invalid int value: '${value}'\n`);
          return EXIT_USAGE;
        }
      }
      index += 1;
      continue;
    }
    if (token.startsWith("--") || slug !== null) {
      writeErr(`dabbler module pack: unrecognized argument: ${token}\n`);
      return EXIT_USAGE;
    }
    slug = token;
  }
  if (slug === null) {
    writeErr("dabbler module pack: the following arguments are required: slug\n");
    return EXIT_USAGE;
  }
  if (!isDirectory(workspaceRoot)) {
    writeErr(`module: not a directory: ${workspaceRoot}\n`);
    return EXIT_USAGE;
  }
  let shape;
  try {
    shape = solutionShape(workspaceRoot);
  } catch (error) {
    if (!(error instanceof ManifestError)) throw error;
    writeErr(`module pack: refused -- ${error.message}\n`);
    return EXIT_REFUSED;
  }
  let result;
  try {
    const rootFiles = ensureRootFiles(workspaceRoot, shape);
    for (const path of rootFiles?.written ?? []) writeOut(`wrote ${path}\n`);
    result = packModule(workspaceRoot, shape, slug, {
      session,
      config: loadConfig(undefined, workspaceRoot),
    });
  } catch (error) {
    if (error instanceof PackagesError || error instanceof EcosystemError) {
      writeErr(`module pack: refused -- ${error.message}\n`);
      return EXIT_REFUSED;
    }
    throw error;
  }
  writeOut(`packed ${result.slug} ${result.version}\n`);
  for (const artifact of result.artifacts) writeOut(`  ${artifact}\n`);
  writeOut(`pinned ${result.pins.join(", ")} in Directory.Packages.props\n`);
  for (const record of result.records) writeOut(`recorded ${record}\n`);
  return EXIT_OK;
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export async function moduleVerb(argv: string[]): Promise<number> {
  const [subcommand, ...rest] = argv;
  if (subcommand === undefined || subcommand === "--help" || subcommand === "-h") {
    if (subcommand === undefined) {
      writeErr(`dabbler module: the following arguments are required: command\n\n${usage()}`);
      return EXIT_USAGE;
    }
    writeOut(usage());
    return EXIT_OK;
  }
  if (subcommand === "pack") return packSubcommand(rest);
  if (subcommand !== "contract") {
    writeErr(`dabbler module: '${subcommand}' is not a subcommand\n\n${usage()}`);
    return EXIT_USAGE;
  }
  let slug: string | null = null;
  let against: string | null = null;
  let workspaceRoot = ".";
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index] as string;
    if (token === "--help" || token === "-h") {
      writeOut(usage());
      return EXIT_OK;
    }
    if (token === "--against" || token === "--workspace-root") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) {
        writeErr(`dabbler module contract: argument ${token}: expected one argument\n`);
        return EXIT_USAGE;
      }
      if (token === "--against") against = value;
      else workspaceRoot = value;
      index += 1;
      continue;
    }
    if (token.startsWith("--")) {
      writeErr(`dabbler module contract: unrecognized argument: ${token}\n\n${usage()}`);
      return EXIT_USAGE;
    }
    if (slug !== null) {
      writeErr(`dabbler module contract: unrecognized argument: ${token}\n`);
      return EXIT_USAGE;
    }
    slug = token;
  }
  if (slug === null) {
    writeErr("dabbler module contract: the following arguments are required: slug\n");
    return EXIT_USAGE;
  }
  if (!isDirectory(workspaceRoot)) {
    writeErr(`module: not a directory: ${workspaceRoot}\n`);
    return EXIT_USAGE;
  }
  return contract(workspaceRoot, slug, against);
}

function contract(root: string, slug: string, against: string | null): number {
  let shape;
  try {
    shape = solutionShape(root);
  } catch (error) {
    if (!(error instanceof ManifestError)) throw error;
    writeErr(`module contract: refused -- ${error.message}\n`);
    return EXIT_REFUSED;
  }
  if (!shape.multi) {
    writeErr(
      "module contract: refused -- this repository is a single-module solution, and a " +
        "contract is the seam between modules; declare a second module in " +
        "docs/modules.yaml first\n",
    );
    return EXIT_REFUSED;
  }
  const entry = shape.modules.find((module) => module.slug === slug);
  if (entry === undefined) {
    writeErr(`module contract: refused -- docs/modules.yaml declares no module '${slug}'\n`);
    return EXIT_REFUSED;
  }
  let provider = null;
  if (against !== null) {
    provider = shape.modules.find((module) => module.slug === against) ?? null;
    if (provider === null) {
      writeErr(`module contract: refused -- docs/modules.yaml declares no module '${against}'\n`);
      return EXIT_REFUSED;
    }
    if (provider.package === null) {
      writeErr(
        `module contract: refused -- module '${against}' declares no package, and a ` +
          "compatibility suite runs against a provider's package\n",
      );
      return EXIT_REFUSED;
    }
  } else if (entry.contract !== "designed") {
    writeErr(
      `module contract: refused -- module '${slug}' declares contract: ${entry.contract ?? "none"}; ` +
        "the designed seam is scaffolded for `contract: designed` only\n",
    );
    return EXIT_REFUSED;
  }
  let result;
  try {
    // The root build files first, where absent: the scaffold pins its
    // packages centrally, and the central pins live in one of them.
    const rootFiles = ensureRootFiles(root, shape);
    for (const path of rootFiles?.written ?? []) writeOut(`wrote ${path}\n`);
    result = ecosystemOf(root, entry).scaffoldContract(root, entry, provider);
  } catch (error) {
    if (!(error instanceof EcosystemError)) throw error;
    writeErr(`module contract: refused -- ${error.message}\n`);
    return EXIT_REFUSED;
  }
  for (const path of result.written) writeOut(`wrote ${path}\n`);
  for (const path of result.skipped) writeOut(`kept ${path} (already there)\n`);
  for (const note of result.notes) writeOut(`note: ${note}\n`);
  if (result.written.length === 0) writeOut("nothing to write: the seam is already there\n");
  return EXIT_OK;
}
