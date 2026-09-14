// `dabbler module` -- one module's seam, from the terminal.
//
// `contract <slug>` scaffolds the designed seam through the ecosystem seam,
// writing only where absent and naming what it wrote; `contract <slug>
// --against <provider>` scaffolds the consumer's compatibility suite against
// the provider's package; `pack <slug>` makes the committed package; `candidate` packs what the run
// of record tests against. One verb for the things done TO a module, beside
// `modules` for the manifest they are declared in.

import { statSync } from "node:fs";

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { ConfigError, loadConfig } from "../config.ts";
import { ContractError, renderModuleContract } from "../contractdoc.ts";
import { ensureRootFilesWithSuite } from "../bootstrap/detect.ts";
import { EcosystemError, ecosystemOf, hasProjectFile } from "../ecosystem.ts";
import { sessionsDirFor } from "../evidence.ts";
import { writeCandidateRecord } from "../impact.ts";
import { platformNewlines, runGit } from "../journal.ts";
import { LandError, bundleRecord, writeBundleRecord } from "../land.ts";
import { ManifestError, type ModuleEntry, deployablesOf, moduleConfigs, solutionShape } from "../modules.ts";
import { PackagesError, packModule, readRecords } from "../packages.ts";
import { PackagingConfigError, ensureFolderFeed, loadDeclaration } from "../packaging.ts";
import { sessionIsReleasable } from "../writers.ts";
import { writeErr, writeOut } from "./output.ts";

const EXIT_OK = 0;
const EXIT_REFUSED = 1;
const EXIT_USAGE = 2;

function usage(): string {
  return [
    "usage: dabbler module contract [-h] [--against PROVIDER]",
    "                               [--workspace-root WORKSPACE_ROOT] slug",
    "       dabbler module pack [-h] [--session N] [--workspace-root WORKSPACE_ROOT] slug",
    "       dabbler module candidate [-h] [--session N] [--workspace-root WORKSPACE_ROOT] slug [slug ...]",
    "",
    "the things done to one module: its designed seam, its committed package,",
    "and the candidate the run of record tests against",
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
    "immutable dev version (<base>-dev.<yyyymmdd>.<n>.g<digest>), the pin moved where",
    "the ecosystem keeps it (Directory.Packages.props for .NET, the root pom.xml's",
    "dependencyManagement for Maven), and a record beside each package naming the source",
    "and contract it was built from. Refused where the module's source is not on",
    "this disk.",
    "",
    "candidate: what the run of record tests against -- each named module packed (its",
    "declared pack or the ecosystem's default) with the pin moved and the record written,",
    "then its contract page regenerated. The framework runs it as one job before the",
    "suites of a module session; every refusal prints as one line.",
    "",
  ].join("\n");
}

function candidateSubcommand(rest: readonly string[]): number {
  const slugs: string[] = [];
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
        writeErr(`dabbler module candidate: argument ${token}: expected one argument\n`);
        return EXIT_USAGE;
      }
      if (token === "--workspace-root") workspaceRoot = value;
      else {
        session = Number.parseInt(value, 10);
        if (!Number.isInteger(session) || session < 1) {
          writeErr(`dabbler module candidate: argument --session: invalid int value: '${value}'\n`);
          return EXIT_USAGE;
        }
      }
      index += 1;
      continue;
    }
    if (token.startsWith("--")) {
      writeErr(`dabbler module candidate: unrecognized argument: ${token}\n`);
      return EXIT_USAGE;
    }
    slugs.push(token);
  }
  if (slugs.length === 0) {
    writeErr("dabbler module candidate: the following arguments are required: slug\n");
    return EXIT_USAGE;
  }
  if (!isDirectory(workspaceRoot)) {
    writeErr(`module: not a directory: ${workspaceRoot}\n`);
    return EXIT_USAGE;
  }
  try {
    const shape = solutionShape(workspaceRoot);
    const config = loadConfig(undefined, workspaceRoot);
    const configs = moduleConfigs(config, shape.modules);
    // Everything the candidate writes is recorded beside the run: the gate
    // that refuses a tree moved after verification reads it, because these
    // paths are the framework's own derivation of the verified source and
    // not a change to it. The central pin file is one of them and is added
    // as each pack reports it -- .NET moves `Directory.Packages.props` and
    // Maven the root `pom.xml`, and a seeded literal names the wrong one
    // half the time, leaving the file that really moved unaccounted for.
    const written = new Set<string>();
    const bundled = new Set<string>();
    for (const slug of slugs) {
      const entry = shape.modules.find((module) => module.slug === slug);
      // A module the manifest declares before its code exists has nothing to
      // pack, no source for a surface page and no bundle to record. A change
      // that reaches it -- a shared file every module names -- names it as a
      // candidate all the same, and refusing the whole run for it stopped
      // the sample's first run of record on three modules that were empty
      // by plan. Before the application branch, because a bundle record
      // asks the ecosystem too.
      if (entry !== undefined && !hasProjectFile(workspaceRoot, entry)) {
        writeOut(`skipped ${slug}: no project file under ${entry.codeRoots.join(", ") || "."} yet, so there is nothing to pack\n`);
        continue;
      }
      // An application's candidate is the bundle record -- what it ships,
      // at the versions the central pins name -- written into the tree
      // before the run of record so the land carries it, whether or not the
      // application also packs. Refused, and the candidate with it, while a
      // pin is a dev version. Only a releasable session ships anything, so
      // only a releasable session's candidate is asked to name released
      // versions: `module pack` writes nothing else, and a solution that
      // never publishes to a feed would otherwise refuse every session that
      // touches an application module, forever. Mirrors bundleCandidates in
      // drive.ts, which the run of record gates the same way.
      if (
        entry !== undefined &&
        entry.kind === "application" &&
        session !== null &&
        sessionIsReleasable(sessionsDirFor(workspaceRoot), session)
      ) {
        // What ships is a deployable, not a module: one record per
        // deployable this application feeds -- the one implied by the
        // module itself when the manifest declares no block -- and each
        // written once however many of its modules this candidate names.
        const versionOf = (module: ModuleEntry): string => {
          const ecosystem = ecosystemOf(workspaceRoot, module);
          const project = ecosystem.projectFiles(workspaceRoot, module)[0];
          return project === undefined ? "0.1.0" : ecosystem.baseVersion(workspaceRoot, project);
        };
        const pins = ecosystemOf(workspaceRoot, entry).centralPins(workspaceRoot);
        for (const name of deployablesOf(shape.deployables, slug)) {
          if (bundled.has(name)) continue;
          const deployable = shape.deployables.find((one) => one.slug === name)!;
          const record = bundleRecord(shape, deployable, pins, readRecords(workspaceRoot), versionOf, {
            session,
            baseCommit: runGit(workspaceRoot, ["rev-parse", "HEAD"]).stdout || null,
          });
          const path = writeBundleRecord(workspaceRoot, record);
          bundled.add(name);
          written.add(path);
          writeOut(`bundled ${name} ${record.version}: ${path} (${record.dependencies.map((d) => `${d.package} ${d.version}`).join(", ") || "no dependencies"})\n`);
        }
      }
      if (entry !== undefined && entry.kind === "application" && entry.package === null) continue;
      // The contract page first, then the pack: the pack's record digests
      // the contract folder, and the land holds the tree to that digest, so
      // the page the record covers must be the page that lands.
      if (entry?.contract === null) {
        writeOut(`no contract page: module '${slug}' declares no contract\n`);
      } else {
        const bundle = renderModuleContract(workspaceRoot, shape, slug, {
          generate: configs.get(slug)?.contractGenerate ?? null,
        });
        if (bundle.notesRendered) {
          const target = join(workspaceRoot, bundle.notesPath);
          mkdirSync(dirname(target), { recursive: true });
          writeFileSync(target, platformNewlines(bundle.notes), { encoding: "utf8" });
          writeOut(`wrote ${bundle.notesPath} (from contract.yaml)\n`);
          written.add(bundle.notesPath);
        }
        if (bundle.api !== null && bundle.apiPath !== null) {
          const target = join(workspaceRoot, bundle.apiPath);
          mkdirSync(dirname(target), { recursive: true });
          writeFileSync(target, platformNewlines(bundle.api), { encoding: "utf8" });
          writeOut(`wrote ${bundle.apiPath} (${bundle.mode})\n`);
          written.add(bundle.apiPath);
        } else {
          writeOut(`kept ${bundle.notesPath}; a ${bundle.mode} contract has no surface page\n`);
        }
      }
      // A declared folder feed the pack's restore will read as a package
      // source is made before the pack, where it is declared and not there;
      // a tag release and an undeclared module have no feed to make.
      const declared = loadDeclaration(config, slug);
      const feedMade = declared === null ? null : ensureFolderFeed(workspaceRoot, declared.push.feed);
      if (feedMade !== null) writeOut(`${feedMade}\n`);
      const packed = packModule(workspaceRoot, shape, slug, { session, config });
      writeOut(`packed ${packed.slug} ${packed.version}\n`);
      for (const artifact of packed.artifacts) {
        writeOut(`  ${artifact}\n`);
        written.add(artifact);
      }
      if (packed.pinFile !== null) {
        writeOut(`pinned ${packed.pins.join(", ")} in ${packed.pinFile}\n`);
        written.add(packed.pinFile);
      }
      // Everything the pack left in the feed, not only the packages this
      // framework went looking for: Maven writes a POM and a checksum pair
      // beside each artifact, and a record that names none of them leaves
      // them looking like a tree that moved after verification.
      for (const path of packed.left) written.add(path);
      for (const record of packed.records) {
        writeOut(`recorded ${record}\n`);
        written.add(record);
      }
    }
    if (session !== null) writeCandidateRecord(workspaceRoot, session, [...written].sort());
  } catch (error) {
    if (
      error instanceof PackagesError ||
      error instanceof EcosystemError ||
      error instanceof ManifestError ||
      error instanceof PackagingConfigError ||
      error instanceof ConfigError ||
      error instanceof ContractError ||
      error instanceof LandError
    ) {
      writeErr(`module candidate: refused -- ${error.message}\n`);
      return EXIT_REFUSED;
    }
    throw error;
  }
  return EXIT_OK;
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
    const rootFiles = ensureRootFilesWithSuite(workspaceRoot, shape);
    for (const path of rootFiles?.written ?? []) writeOut(`wrote ${path}\n`);
    for (const path of rootFiles?.changed ?? []) writeOut(`updated ${path}\n`);
    result = packModule(workspaceRoot, shape, slug, {
      session,
      config: loadConfig(undefined, workspaceRoot),
    });
  } catch (error) {
    // Every refusal the pack can make -- the manifest, the configuration,
    // the ecosystem, the pack itself -- is printed as one and exits 1; a
    // stack trace is for a defect, not for a declaration somebody can fix.
    if (
      error instanceof PackagesError ||
      error instanceof EcosystemError ||
      error instanceof ManifestError ||
      error instanceof PackagingConfigError ||
      error instanceof ConfigError
    ) {
      writeErr(`module pack: refused -- ${error.message}\n`);
      return EXIT_REFUSED;
    }
    throw error;
  }
  writeOut(`packed ${result.slug} ${result.version}\n`);
  for (const artifact of result.artifacts) writeOut(`  ${artifact}\n`);
  if (result.pinFile !== null) writeOut(`pinned ${result.pins.join(", ")} in ${result.pinFile}\n`);
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
  if (subcommand === "candidate") return candidateSubcommand(rest);
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
    const rootFiles = ensureRootFilesWithSuite(root, shape);
    for (const path of rootFiles?.written ?? []) writeOut(`wrote ${path}\n`);
    for (const path of rootFiles?.changed ?? []) writeOut(`updated ${path}\n`);
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
