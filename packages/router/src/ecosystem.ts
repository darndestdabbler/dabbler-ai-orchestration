// The ecosystem seam: every decision in the modules block that depends on
// whether a module is .NET or Maven is a method here, and nowhere else.
//
// .NET was built first and proven against the module-checkout POC; Java is
// a stated customer, and the Maven side of every method is here beside the
// .NET one. Nothing outside this file knows which ecosystem it is on: a
// caller that needs the pin, the packaged artifact's path, a consumer's
// references or the debugging grant's effect asks the seam, and a
// `.csproj`-shaped read anywhere else is a Java team's bug waiting.
//
// Which ecosystem a module is comes from what its roots contain -- a
// `.csproj` or a solution file, or a `pom.xml` -- and never from a
// declaration, because a declaration that disagreed with the tree would
// have to be wrong about one of them.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";

import type { ModuleEntry, SolutionShape } from "./modules.ts";

export type EcosystemKey = "dotnet" | "maven";

export class EcosystemError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EcosystemError";
  }
}

/** The three projects a designed seam is made of, by name. */
export interface ContractProjectNames {
  /** The interfaces and types a consumer compiles against. */
  readonly abstractions: string;
  /** The abstract test class the implementation's tests inherit. */
  readonly contractTests: string;
  /** A consumer's compatibility suite against a provider's package. */
  compatibility(providerPackage: string): string;
}

/** One public declaration of a module's surface, with its doc comment. */
export interface SurfaceEntry {
  /** Repository-relative source file. */
  readonly file: string;
  /** The declaration line, trimmed. */
  readonly declaration: string;
  /** The doc-comment summary above it, joined; empty when there is none. */
  readonly summary: string;
}

/** What a contract scaffold left behind: written where absent, skipped where present. */
export interface ScaffoldResult {
  readonly written: readonly string[];
  readonly skipped: readonly string[];
  /** Anything the scaffold could not place and says so about. */
  readonly notes: readonly string[];
}

/** One reference a project makes to a package, with any version it carries itself. */
export interface PackageReferenceFact {
  /** Repository-relative project file. */
  readonly project: string;
  readonly packageId: string;
  /** A `Version` or `VersionOverride` of its own; null when it takes the central pin. */
  readonly ownVersion: string | null;
}

export interface Ecosystem {
  readonly key: EcosystemKey;
  /** The seam's project names for a package id. */
  contractProjectNames(packageId: string): ContractProjectNames;
  /**
   * The root build files a multi-module solution of this ecosystem needs,
   * each written only where absent and never rewritten: the committed feed
   * folder, the central pins, the build properties and targets.
   */
  rootFiles(root: string, shape: SolutionShape): ScaffoldResult;
  /**
   * The release base a project declares, any prerelease suffix stripped,
   * `0.1.0` when it declares none: what the dev version is formed on, and
   * what a bundle records as the application's version.
   */
  baseVersion(root: string, project: string): string;
  /** Where a pack leaves the package for an id and a version, relative to `packages/`. */
  packagedArtifact(packageId: string, version: string): string;
  /** The `.gitattributes` pattern that puts the committed packages under LFS. */
  readonly lfsPattern: string;
  /** The central pins the root declares, unconditioned entries only. */
  centralPins(root: string): Map<string, string>;
  /**
   * Pin `packageId` at `version` centrally: the one entry for the id
   * replaced in place and everything around it preserved, or a new entry
   * added; a conditioned or duplicated entry is refused by name. Returns
   * the repository-relative file written.
   */
  writeCentralPin(root: string, packageId: string, version: string): string;
  /** Every package reference one project file makes, with any version it carries itself. */
  packageReferences(root: string, projectFile: string): PackageReferenceFact[];
  /**
   * What a debugging grant does for the siblings of this ecosystem:
   * `debugging` is every sibling under a debugging grant in force and
   * `granted` the one just granted (null on a revoke). .NET lays or
   * removes the untracked overlay from the whole list; Maven, which loads
   * no external profile, rebuilds the granted sibling from its source into
   * the file repository through `pack`, and refuses when no pack was
   * handed in.
   */
  layDebugGrants(
    root: string,
    shape: SolutionShape,
    debugging: readonly ModuleEntry[],
    granted: ModuleEntry | null,
    pack: ((slug: string) => void) | null,
  ): void;
  /**
   * The module's public surface with its doc comments, read from source:
   * the abstractions project when the module has one, its roots outside
   * tests otherwise, in file order.
   */
  readSurface(root: string, entry: ModuleEntry, packageId: string): SurfaceEntry[];
  /**
   * Scaffold the designed seam for a module -- or, with `against`, a
   * consumer compatibility suite against that provider's package -- writing
   * only where absent.
   */
  scaffoldContract(
    root: string,
    entry: ModuleEntry,
    against: ModuleEntry | null,
  ): ScaffoldResult;
  /**
   * Every project under the module's roots that produces a package: the
   * implementation, the abstractions, the contract tests -- never a test
   * project, never one that says it is not packable.
   */
  packableProjects(root: string, entry: ModuleEntry): PackTarget[];
  /** The argv that packs one project into `output` under `version`. */
  packArgv(project: string, output: string, version: string): string[];
  /**
   * Every project file under the module's roots, tests included,
   * repository-relative with forward slashes: what the convenience file
   * lists, and what a focused checkout builds and tests.
   */
  projectFiles(root: string, entry: ModuleEntry): string[];
  /**
   * Write the file a developer opens to build and test the module alone at
   * the root of its focused checkout, and return its repository-relative
   * path. .NET: `<slug>.slnf` filtering the root's solution file to the
   * module's projects, or `<slug>.slnx` listing them when the root has no
   * solution to filter. Maven: `.mvn/maven.config` naming the module's POM.
   */
  convenienceFile(root: string, entry: ModuleEntry, projects: readonly string[]): string;
}

/** One project a pack produces a package from. */
export interface PackTarget {
  /** Repository-relative path to the project file. */
  readonly project: string;
  /** The package id it produces, as the project declares it or its file name says. */
  readonly packageId: string;
  /**
   * The project whose build produces this target when it is not the
   * target's own: a Maven module's aggregator POM builds every module
   * under it in one reactor, so its targets share one command.
   */
  readonly via?: string;
}

/**
 * The stem a package id takes in a file name: a NuGet id as it is, and
 * Maven's `groupId:artifactId` with the colon -- which no file system
 * carries -- written as `+`, which no NuGet id carries, so the name decodes
 * one way.
 */
export function fileStem(packageId: string): string {
  return packageId.replace(/:/g, "+");
}

export function packageIdOfStem(stem: string): string {
  return stem.replace(/\+/g, ":");
}

/**
 * What a debugging grant does, across ecosystems: each side acts on the
 * siblings that are its own, and the .NET overlay is regenerated (or
 * removed) from the whole list even when the sibling just granted is not
 * a .NET one.
 */
export function layDebugGrants(
  root: string,
  shape: SolutionShape,
  debugging: readonly ModuleEntry[],
  granted: ModuleEntry | null,
  pack: ((slug: string) => void) | null,
): void {
  DOTNET.layDebugGrants(root, shape, debugging, granted, pack);
  MAVEN.layDebugGrants(root, shape, debugging, granted, pack);
}

function keyOf(root: string, entry: ModuleEntry): EcosystemKey | null {
  try {
    return ecosystemOf(root, entry).key;
  } catch (error) {
    if (error instanceof EcosystemError) return null;
    throw error;
  }
}

const SKIPPED_DIRS: ReadonlySet<string> = new Set([
  ".git", "bin", "obj", "node_modules", "packages", "target", ".dabbler",
]);

/** Files under a directory, bounded in depth, skipping build output. */
export function walkFiles(dir: string, depth = 6): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries.sort()) {
    const full = join(dir, name);
    let isDir = false;
    try {
      isDir = statSync(full).isDirectory();
    } catch {
      continue;
    }
    if (isDir) {
      if (!SKIPPED_DIRS.has(name) && depth > 0) out.push(...walkFiles(full, depth - 1));
    } else {
      out.push(full);
    }
  }
  return out;
}

function isDotnetProject(name: string): boolean {
  return /\.(csproj|sln|slnx)$/i.test(name);
}

function isMavenProject(name: string): boolean {
  return name === "pom.xml";
}

/**
 * Which ecosystem a module is, from what its roots contain. Neither refuses
 * naming the module and what was looked for; both refuse too, because a
 * module is one ecosystem and a folder that is two is a folder that should
 * be two modules.
 */
export function ecosystemOf(root: string, entry: ModuleEntry): Ecosystem {
  let dotnet = false;
  let maven = false;
  const roots = entry.codeRoots.length > 0 ? entry.codeRoots : ["."];
  for (const codeRoot of roots) {
    for (const file of walkFiles(join(root, codeRoot))) {
      const name = relative(root, file).split(/[\\/]/).pop() ?? "";
      if (isDotnetProject(name)) dotnet = true;
      if (isMavenProject(name)) maven = true;
    }
  }
  if (dotnet && maven) {
    throw new EcosystemError(
      `module '${entry.slug}' holds both a .NET project and a pom.xml under ` +
        `${roots.join(", ")}; a module is one ecosystem`,
    );
  }
  if (dotnet) return DOTNET;
  if (maven) return MAVEN;
  throw new EcosystemError(
    `module '${entry.slug}' has no project file the framework knows under ` +
      `${roots.join(", ")}: a .csproj or a solution file for .NET, or a pom.xml for Maven`,
  );
}

/** The ecosystem by key, for a caller that already knows. */
export function ecosystemNamed(key: EcosystemKey): Ecosystem {
  return key === "dotnet" ? DOTNET : MAVEN;
}

/**
 * The root build files a multi-module solution needs, written where absent
 * by whichever verb first finds the solution in that shape: `modules
 * create` as the second entry lands, `module contract` and `module pack`
 * as they touch a module. The ecosystem is the first module's whose roots
 * hold a project file; a solution whose modules are still empty folders
 * gets nothing yet and is told so, and a single-module solution gets
 * nothing ever.
 */
export function ensureRootFiles(root: string, shape: SolutionShape): ScaffoldResult | null {
  if (!shape.multi) return null;
  for (const entry of shape.modules) {
    let ecosystem: Ecosystem;
    try {
      ecosystem = ecosystemOf(root, entry);
    } catch (error) {
      if (error instanceof EcosystemError) continue;
      throw error;
    }
    return ecosystem.rootFiles(root, shape);
  }
  return {
    written: [],
    skipped: [],
    notes: [
      "no module holds a project file yet, so the root build files wait for the first " +
        "one that does",
    ],
  };
}

// --- .NET -------------------------------------------------------------------

const DOTNET: Ecosystem = {
  key: "dotnet",
  contractProjectNames(packageId: string): ContractProjectNames {
    return {
      abstractions: `${packageId}.Abstractions`,
      contractTests: `${packageId}.ContractTests`,
      compatibility: (providerPackage: string) => `${providerPackage}.Compatibility`,
    };
  },
  rootFiles(root: string): ScaffoldResult {
    return rootFilesDotnet(root);
  },
  baseVersion(root: string, project: string): string {
    return baseVersionOfProject(readFileSync(join(root, project), "utf8"));
  },
  packagedArtifact(packageId: string, version: string): string {
    return `${packageId}.${version}.nupkg`;
  },
  lfsPattern: "*.nupkg",
  centralPins(root: string): Map<string, string> {
    const path = join(root, "Directory.Packages.props");
    return centralPinsOfProps(existsSync(path) ? readFileSync(path, "utf8") : "");
  },
  writeCentralPin(root: string, packageId: string, version: string): string {
    const path = join(root, "Directory.Packages.props");
    const props = existsSync(path)
      ? readFileSync(path, "utf8")
      : "<Project>\n  <PropertyGroup>\n    <ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>\n  </PropertyGroup>\n</Project>\n";
    writeFileSync(path, pinPackageVersion(props, packageId, version), "utf8");
    return "Directory.Packages.props";
  },
  packageReferences(root: string, projectFile: string): PackageReferenceFact[] {
    return packageReferencesOf(projectFile, readFileSync(join(root, projectFile), "utf8"));
  },
  layDebugGrants(root: string, shape: SolutionShape, debugging: readonly ModuleEntry[]): void {
    writeOverlay(root, debugging.filter((entry) => keyOf(root, entry) === "dotnet"));
  },
  readSurface(root: string, entry: ModuleEntry, packageId: string): SurfaceEntry[] {
    const names = this.contractProjectNames(packageId);
    const roots = entry.codeRoots.length > 0 ? entry.codeRoots : ["."];
    const files = roots.flatMap((codeRoot) => walkFiles(join(root, codeRoot)));
    const sources = files.filter((file) => file.toLowerCase().endsWith(".cs"));
    // The abstractions project is the surface when the module has one --
    // that is what a consumer compiles against. Otherwise every source
    // outside the tests, which is the surface of a module whose package is
    // its own abstraction.
    const abstractions = sources.filter((file) =>
      relative(root, file).split(/[\\/]/).includes(names.abstractions),
    );
    const chosen =
      abstractions.length > 0
        ? abstractions
        : sources.filter((file) => !/[\\/](tests?|[^\\/]+\.Tests)[\\/]/i.test(relative(root, file)));
    const out: SurfaceEntry[] = [];
    for (const file of chosen) out.push(...readCSharpSurface(root, file));
    return out;
  },
  scaffoldContract(root: string, entry: ModuleEntry, against: ModuleEntry | null): ScaffoldResult {
    return scaffoldDotnet(root, entry, against);
  },
  packableProjects(root: string, entry: ModuleEntry): PackTarget[] {
    const roots = entry.codeRoots.length > 0 ? entry.codeRoots : ["."];
    const out: PackTarget[] = [];
    for (const codeRoot of roots) {
      for (const file of walkFiles(join(root, codeRoot))) {
        if (!file.toLowerCase().endsWith(".csproj")) continue;
        const rel = relative(root, file).split("\\").join("/");
        // A test project, a compatibility suite and a project that says
        // IsPackable=false produce no package.
        if (/\.Tests?\.csproj$/i.test(rel) || /\.Compatibility\.csproj$/.test(rel)) continue;
        if (/[\\/]tests?[\\/]/i.test(rel)) continue;
        const text = readFileSync(file, "utf8");
        if (/<IsPackable>\s*false\s*<\/IsPackable>/i.test(text)) continue;
        const declared = /<PackageId>\s*([^<\s]+)\s*<\/PackageId>/.exec(text);
        const packageId = declared ? (declared[1] as string) : rel.split("/").pop()!.replace(/\.csproj$/i, "");
        out.push({ project: rel, packageId });
      }
    }
    return out;
  },
  packArgv(project: string, output: string, version: string): string[] {
    return ["dotnet", "pack", project, "-c", "Release", "-o", output, `-p:PackageVersion=${version}`, NO_SHARED_COMPILATION, "--nologo"];
  },
  projectFiles(root: string, entry: ModuleEntry): string[] {
    const roots = entry.codeRoots.length > 0 ? entry.codeRoots : ["."];
    const out = new Set<string>();
    for (const codeRoot of roots) {
      for (const file of walkFiles(join(root, codeRoot))) {
        if (file.toLowerCase().endsWith(".csproj")) out.add(relative(root, file).split("\\").join("/"));
      }
    }
    return [...out].sort();
  },
  convenienceFile(root: string, entry: ModuleEntry, projects: readonly string[]): string {
    return convenienceFileDotnet(root, entry, projects);
  },
};

/**
 * `<slug>.slnf` when the root holds exactly one solution file -- a filter
 * over it, which is what Visual Studio and `dotnet` open as "this part of
 * the solution" -- and `<slug>.slnx` otherwise: a filter needs one solution
 * to filter, and a solution of the module's own projects is what a
 * repository without one (or with several) can be given instead. Written
 * every time, because the module's projects are what it lists and they
 * move; excluded in the clone's own `.git/info/exclude`, never tracked.
 */
function convenienceFileDotnet(root: string, entry: ModuleEntry, projects: readonly string[]): string {
  const solutions = readdirSync(root).filter((name) => /\.slnx?$/i.test(name) && !/\.slnf$/i.test(name));
  if (solutions.length === 1) {
    const file = `${entry.slug}.slnf`;
    const filter = { solution: { path: solutions[0], projects: [...projects] } };
    writeFileSync(join(root, file), `${JSON.stringify(filter, null, 2)}\n`, "utf8");
    return file;
  }
  const file = `${entry.slug}.slnx`;
  const lines = ["<Solution>"];
  for (const project of projects) lines.push(`  <Project Path="${project}" />`);
  lines.push("</Solution>", "");
  writeFileSync(join(root, file), lines.join("\n"), "utf8");
  return file;
}

// --- The .NET version, pins and references -------------------------------------------

/**
 * The release base a .NET project declares: `<Version>` or
 * `<VersionPrefix>`, with any prerelease suffix stripped, `0.1.0` when it
 * declares none. The dev version is formed on the base, never on a dev
 * version already there.
 */
export function baseVersionOfProject(projectText: string): string {
  const match =
    /<VersionPrefix>\s*([^<\s]+)\s*<\/VersionPrefix>/.exec(projectText) ??
    /<Version>\s*([^<\s]+)\s*<\/Version>/.exec(projectText);
  const raw = match ? (match[1] as string) : "0.1.0";
  return raw.split("-")[0] ?? "0.1.0";
}

/**
 * Every `<Element ...>` of one name in an MSBuild file, self-closing or with
 * a body, as its attributes and its body: MSBuild takes an item's metadata
 * as attributes or as child elements, and a reader that saw only one form
 * would be evaded by the other.
 */
function msbuildItems(text: string, element: string): { attributes: string; body: string }[] {
  const pattern = new RegExp(`<${element}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${element}>)`, "g");
  return [...text.matchAll(pattern)].map((match) => ({ attributes: match[1] ?? "", body: match[2] ?? "" }));
}

/** An attribute, or the same-named child element, of one item. */
function metadata(item: { attributes: string; body: string }, name: string): string | null {
  const attribute = new RegExp(`\\b${name}="([^"]*)"`).exec(item.attributes);
  if (attribute !== null) return attribute[1] as string;
  const child = new RegExp(`<${name}>\\s*([^<]*?)\\s*</${name}>`).exec(item.body);
  return child === null ? null : (child[1] as string);
}

/** The central pins a Directory.Packages.props declares, as attributes or as child elements. */
export function centralPinsOfProps(propsText: string): Map<string, string> {
  const pins = new Map<string, string>();
  for (const item of msbuildItems(propsText, "PackageVersion")) {
    const include = metadata(item, "Include");
    const version = metadata(item, "Version");
    if (include !== null && version !== null) pins.set(include, version);
  }
  return pins;
}

/** Every package reference in a .NET project file, with any version it carries itself, as attribute or child. */
export function packageReferencesOf(project: string, projectText: string): PackageReferenceFact[] {
  const out: PackageReferenceFact[] = [];
  for (const item of msbuildItems(projectText, "PackageReference")) {
    const include = metadata(item, "Include");
    if (include === null) continue;
    const own = metadata(item, "Version") ?? metadata(item, "VersionOverride");
    out.push({ project, packageId: include, ownVersion: own });
  }
  return out;
}

const PIN_RE = /<PackageVersion\s+Include="([^"]+)"([^>]*?)\/>/g;

/**
 * `Directory.Packages.props` with `id` pinned to `version`: the one
 * unconditioned `PackageVersion` for the id replaced in place and the XML
 * around it preserved, or a new entry added under the `Modules` group (or
 * a new group before `</Project>`) when there is none. An entry under a
 * `Condition` -- on the element or its item group -- or one that appears
 * twice is refused by name: a consumer must resolve one pin, and "which
 * one" is the question central management exists to remove.
 */
export function pinPackageVersion(propsText: string, id: string, version: string): string {
  const matches = [...propsText.matchAll(PIN_RE)].filter((match) => match[1] === id);
  if (matches.length > 1) {
    throw new EcosystemError(
      `Directory.Packages.props pins '${id}' ${matches.length} times; a consumer must ` +
        "resolve one pin, so the duplicate is refused rather than chosen between",
    );
  }
  if (matches.length === 1) {
    const match = matches[0] as RegExpMatchArray;
    const attributes = match[2] ?? "";
    const at = match.index ?? 0;
    const groupStart = propsText.lastIndexOf("<ItemGroup", at);
    const groupTag = groupStart >= 0 ? propsText.slice(groupStart, propsText.indexOf(">", groupStart) + 1) : "";
    if (/\bCondition\s*=/.test(attributes) || /\bCondition\s*=/.test(groupTag)) {
      throw new EcosystemError(
        `Directory.Packages.props pins '${id}' under a Condition; the module's pin is ` +
          "one unconditioned entry, so it is refused rather than moved",
      );
    }
    const replaced = /\bVersion="[^"]*"/.test(attributes)
      ? attributes.replace(/\bVersion="[^"]*"/, `Version="${version}"`)
      : `${attributes.replace(/\s*$/, "")} Version="${version}" `;
    return `${propsText.slice(0, at)}<PackageVersion Include="${id}"${replaced}/>${propsText.slice(at + match[0].length)}`;
  }
  const line = `    <PackageVersion Include="${id}" Version="${version}" />`;
  const modulesGroup = /<ItemGroup\s+Label="Modules"\s*>/.exec(propsText);
  if (modulesGroup) {
    const insertAt = (modulesGroup.index ?? 0) + modulesGroup[0].length;
    return `${propsText.slice(0, insertAt)}\n${line}${propsText.slice(insertAt)}`;
  }
  const end = propsText.lastIndexOf("</Project>");
  const group = `  <ItemGroup Label="Modules">\n${line}\n  </ItemGroup>\n`;
  if (end < 0) return `${propsText}\n${group}`;
  return `${propsText.slice(0, end)}${group}${propsText.slice(end)}`;
}

/**
 * The untracked overlay a debugging grant lays: for each .NET sibling
 * granted with `debug`, its package reference removed and its project(s)
 * referenced by path, for this clone only. The tracked
 * `Directory.Build.targets` imports it when it exists; regenerated whole
 * from the grants in force, and removed when none is a debugging one.
 */
function writeOverlay(root: string, debugging: readonly ModuleEntry[]): void {
  const path = join(root, ...OVERLAY_TARGETS.split("/"));
  if (debugging.length === 0) {
    rmSync(path, { force: true });
    return;
  }
  const lines = [
    "<Project>",
    "  <!-- Laid by dabbler module grant (debug) for this clone only: the granted",
    "       sibling is built from its source rather than restored as its package.",
    "       Untracked; dabbler module revoke removes it. -->",
  ];
  for (const entry of debugging) {
    lines.push(`  <ItemGroup Label="dabbler-grant:${entry.slug}">`);
    for (const target of DOTNET.packableProjects(root, entry)) {
      lines.push(`    <PackageReference Remove="${target.packageId}" />`);
      lines.push(`    <ProjectReference Include="$(MSBuildThisFileDirectory)../${target.project}" />`);
    }
    lines.push("  </ItemGroup>");
  }
  lines.push("</Project>", "");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, lines.join("\n"), "utf8");
}

// --- The .NET root files ----------------------------------------------------------

/** Where the committed packages live, relative to the root. */
export const PACKAGES_DIR = "packages";

/**
 * The environment every .NET toolchain command is spawned with. MSBuild's
 * node reuse and the compiler server keep processes alive after the command
 * returns, and they hold files under TEMP open; a check whose TEMP is a
 * scratch directory then cannot remove it, and once that crashed the
 * driver mid-`next`. With both off, nothing outlives the command. The
 * compiler server is also refused per command (`-p:UseSharedCompilation=
 * false` in the argv), because no environment variable turns it off.
 */
export const DOTNET_TOOLCHAIN_ENV: Readonly<Record<string, string>> = {
  MSBUILDDISABLENODEREUSE: "1",
  DOTNET_CLI_USE_MSBUILD_SERVER: "0",
  DOTNET_CLI_TELEMETRY_OPTOUT: "1",
  DOTNET_NOLOGO: "1",
};

/** The MSBuild property that keeps a build from starting the compiler server. */
export const NO_SHARED_COMPILATION = "-p:UseSharedCompilation=false";
/** The untracked overlay a debugging grant lays; imported by the tracked targets when it exists. */
export const OVERLAY_TARGETS = ".dabbler/overlay.targets";

/**
 * The six files a multi-module .NET solution needs at its root, written only
 * where absent. The feed is a relative path so a clone on any machine
 * resolves it; the pins are central so a consumer's project says
 * `<PackageReference Include="X" />` and nothing else; Source Link is off
 * in a driven session because it fetches source from the host and an
 * engine could too; the overlay import sits in the TARGETS file because
 * props load before a project's items exist and the overlay rewrites
 * items; LFS for the packages folder is declared and left for the ceiling
 * to turn on.
 */
function rootFilesDotnet(root: string): ScaffoldResult {
  const result = { written: [] as string[], skipped: [] as string[], notes: [] as string[] };
  writeIfAbsent(
    root,
    "nuget.config",
    [
      '<?xml version="1.0" encoding="utf-8"?>',
      "<configuration>",
      "  <packageSources>",
      "    <!-- The solution's own modules, as committed packages; a relative path, so a",
      "         clone on any machine resolves it. -->",
      `    <add key="modules" value="${PACKAGES_DIR}" />`,
      '    <add key="nuget.org" value="https://api.nuget.org/v3/index.json" />',
      "  </packageSources>",
      "</configuration>",
      "",
    ].join("\n"),
    result,
  );
  writeIfAbsent(
    root,
    "Directory.Packages.props",
    [
      "<Project>",
      "  <PropertyGroup>",
      "    <ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>",
      "  </PropertyGroup>",
      "",
      "  <!-- Sibling modules, consumed as packages from the committed ./packages folder.",
      "       The pin is the module's current dev version; `dabbler module pack` moves it",
      "       in the same commit as the new package. -->",
      '  <ItemGroup Label="Modules">',
      "  </ItemGroup>",
      "</Project>",
      "",
    ].join("\n"),
    result,
  );
  writeIfAbsent(
    root,
    "Directory.Build.props",
    [
      "<Project>",
      "  <PropertyGroup>",
      "    <Nullable>enable</Nullable>",
      "    <ImplicitUsings>enable</ImplicitUsings>",
      "    <!-- Source Link fetches source from the host, and an engine in a driven",
      "         session could too; the wall is what is on the disk. -->",
      "    <EnableSourceLink Condition=\"'$(DABBLER_DRIVEN)' != ''\">false</EnableSourceLink>",
      "  </PropertyGroup>",
      "</Project>",
      "",
    ].join("\n"),
    result,
  );
  writeIfAbsent(
    root,
    "Directory.Build.targets",
    [
      "<Project>",
      // No double hyphen inside the comment: XML refuses it, and the real
      // build was the one that said so.
      "  <!-- A debugging grant (dabbler module grant, with debug) lays an untracked overlay",
      "       that turns a sibling's PackageReference into a ProjectReference for this",
      "       clone only. Imported here, after a project's items exist, and only when the",
      "       file does: nothing in a committed project file changes. -->",
      `  <Import Project="$(MSBuildThisFileDirectory)${OVERLAY_TARGETS}" Condition="Exists('$(MSBuildThisFileDirectory)${OVERLAY_TARGETS}')" />`,
      "</Project>",
      "",
    ].join("\n"),
    result,
  );
  writeIfAbsent(
    root,
    `${PACKAGES_DIR}/.gitattributes`,
    [
      "# Committed packages are small by the ceiling (`modules.packages.ceilingBytes`,",
      "# 5 MiB unless dabbler.yaml says otherwise). A package over it is refused until",
      "# this line is uncommented, which puts every package here under Git LFS:",
      "# *.nupkg filter=lfs diff=lfs merge=lfs -text",
      "",
    ].join("\n"),
    result,
  );
  writeIfAbsent(
    root,
    `${PACKAGES_DIR}/README.md`,
    [
      "# packages",
      "",
      "The solution's own modules, as committed packages. A module consumes a sibling",
      "from here -- `<PackageReference Include=\"Sibling\" />`, pinned once in",
      "`Directory.Packages.props` -- and never from its source, so a focused checkout",
      "holding one module builds against exactly the bytes its siblings landed.",
      "",
      "`dabbler module pack <slug>` writes a module's packages here under an immutable",
      "dev version and records, beside each, the source and contract it was built",
      "from. Nothing here is edited by hand.",
      "",
    ].join("\n"),
    result,
  );
  return result;
}

// --- The .NET scaffold ----------------------------------------------------------

/** The two test packages a contract-test library needs, and the three a test project does. */
// The extensibility package, not the runner core: a LIBRARY of tests is not
// a test project, and xunit v3 refuses to build one that references the
// core as if it were ("test projects must be executable").
const XUNIT_CORE = "xunit.v3.extensibility.core";
const XUNIT_ASSERT = "xunit.v3.assert";
const XUNIT_META = "xunit.v3";
const TEST_SDK = "Microsoft.NET.Test.Sdk";
const XUNIT_RUNNER = "xunit.runner.visualstudio";
const DEFAULT_VERSIONS: Readonly<Record<string, string>> = {
  [XUNIT_CORE]: "3.2.2",
  [XUNIT_ASSERT]: "3.2.2",
  [XUNIT_META]: "3.2.2",
  [TEST_SDK]: "18.8.1",
  [XUNIT_RUNNER]: "3.1.5",
};

function posix(path: string): string {
  return path.split("\\").join("/");
}

/** The pins `Directory.Packages.props` carries, when the root has one. */
function centralPins(root: string): Map<string, string> | null {
  const path = join(root, "Directory.Packages.props");
  if (!existsSync(path)) return null;
  return centralPinsOfProps(readFileSync(path, "utf8"));
}

/**
 * Add the pins the scaffold's packages need to `Directory.Packages.props`,
 * where central management is on and a pin is missing: an unversioned
 * reference with no pin is a restore error, and the scaffold must leave a
 * tree that builds.
 */
function ensurePins(root: string, ids: readonly string[], written: string[]): void {
  const pins = centralPins(root);
  if (pins === null) return;
  const missing = ids.filter((id) => !pins.has(id));
  if (missing.length === 0) return;
  const path = join(root, "Directory.Packages.props");
  const text = readFileSync(path, "utf8");
  const family = pins.get(XUNIT_META) ?? DEFAULT_VERSIONS[XUNIT_META] ?? "3.2.2";
  const lines = missing.map((id) => {
    const version = id.startsWith("xunit.v3") ? family : (DEFAULT_VERSIONS[id] ?? "0.0.0");
    return `    <PackageVersion Include="${id}" Version="${version}" />`;
  });
  const block = `  <ItemGroup Label="Contract tests">\n${lines.join("\n")}\n  </ItemGroup>\n`;
  const end = text.lastIndexOf("</Project>");
  const next = end < 0 ? `${text}\n${block}` : `${text.slice(0, end)}${block}${text.slice(end)}`;
  writeFileSync(path, next, "utf8");
  written.push("Directory.Packages.props");
}

function packageReference(id: string, pinned: boolean): string {
  return pinned
    ? `    <PackageReference Include="${id}" />`
    : `    <PackageReference Include="${id}" Version="${DEFAULT_VERSIONS[id] ?? "0.0.0"}" />`;
}

/** Whether the root's `Directory.Build.props` sets the target framework for every project. */
function frameworkFromRoot(root: string): string | null {
  const path = join(root, "Directory.Build.props");
  if (!existsSync(path)) return null;
  const match = /<TargetFramework>([^<]+)<\/TargetFramework>/.exec(readFileSync(path, "utf8"));
  return match ? (match[1] as string) : null;
}

function frameworkLine(root: string, fallbackFrom: string | null): string {
  if (frameworkFromRoot(root) !== null) return "";
  let tfm = "net10.0";
  if (fallbackFrom !== null && existsSync(fallbackFrom)) {
    const match = /<TargetFramework>([^<]+)<\/TargetFramework>/.exec(readFileSync(fallbackFrom, "utf8"));
    if (match) tfm = match[1] as string;
  }
  return `    <TargetFramework>${tfm}</TargetFramework>\n`;
}

/** The module's projects: the implementation (packable, not a test) and its test project. */
function dotnetProjects(root: string, entry: ModuleEntry, packageId: string): {
  implementation: string | null;
  tests: string | null;
} {
  const roots = entry.codeRoots.length > 0 ? entry.codeRoots : ["."];
  const projects = roots
    .flatMap((codeRoot) => walkFiles(join(root, codeRoot)))
    .filter((file) => file.toLowerCase().endsWith(".csproj"));
  const isTest = (file: string): boolean => /\.Tests?\.csproj$/i.test(file) || /[\\/]tests?[\\/]/i.test(relative(root, file));
  const named = projects.find((file) => file.endsWith(`${packageId}.csproj`)) ?? null;
  const implementation =
    named ??
    projects.find(
      (file) => !isTest(file) && !/\.(Abstractions|ContractTests|Compatibility)\.csproj$/.test(file),
    ) ??
    null;
  const tests = projects.find((file) => isTest(file) && !/\.Compatibility\.csproj$/.test(file)) ?? null;
  return { implementation, tests };
}

function writeIfAbsent(root: string, rel: string, text: string, result: { written: string[]; skipped: string[] }): void {
  const full = join(root, rel);
  if (existsSync(full)) {
    result.skipped.push(rel);
    return;
  }
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text, "utf8");
  result.written.push(rel);
}

function scaffoldDotnet(root: string, entry: ModuleEntry, against: ModuleEntry | null): ScaffoldResult {
  const packageId = entry.package ?? entry.slug;
  const names = DOTNET.contractProjectNames(packageId);
  const result = { written: [] as string[], skipped: [] as string[], notes: [] as string[] };
  const pinned = centralPins(root) !== null;
  const { implementation, tests } = dotnetProjects(root, entry, packageId);
  const moduleRoot = entry.codeRoots[0] ?? `modules/${entry.slug}`;

  if (against !== null) {
    // The consumer's compatibility suite: a test project against the
    // provider's PACKAGE -- pinned centrally, never versioned here, and never
    // a project reference, which is what keeps a focused clone honest.
    const providerPackage = against.package ?? against.slug;
    const name = names.compatibility(providerPackage);
    const dir = posix(join(`modules/${entry.slug}/contract`, name));
    ensurePins(root, [TEST_SDK, XUNIT_META, XUNIT_RUNNER], result.written);
    writeIfAbsent(
      root,
      `${dir}/${name}.csproj`,
      [
        '<Project Sdk="Microsoft.NET.Sdk">',
        "  <PropertyGroup>",
        frameworkLine(root, tests).replace(/\n$/, ""),
        "    <IsPackable>false</IsPackable>",
        "    <Nullable>enable</Nullable>",
        "    <ImplicitUsings>enable</ImplicitUsings>",
        "  </PropertyGroup>",
        "  <ItemGroup>",
        packageReference(TEST_SDK, pinned),
        packageReference(XUNIT_META, pinned),
        packageReference(XUNIT_RUNNER, pinned),
        "  </ItemGroup>",
        "  <ItemGroup>",
        `    <!-- Across the seam: ${against.slug}'s package from the committed feed, never its source. -->`,
        `    <PackageReference Include="${providerPackage}" />`,
        "  </ItemGroup>",
        "</Project>",
        "",
      ].filter((line) => line !== "").join("\n"),
      result,
    );
    writeIfAbsent(
      root,
      `${dir}/${providerPackage.replace(/\W/g, "")}Compatibility.cs`,
      [
        "using Xunit;",
        "",
        `namespace ${entry.slug.replace(/\W/g, "")}.Contract;`,
        "",
        `/// <summary>What ${entry.slug} assumes of ${providerPackage} beyond its provider contract. Runs against the package the pin names, so a candidate ${providerPackage} that breaks an assumption fails here before it lands.</summary>`,
        `public class ${providerPackage.replace(/\W/g, "")}Compatibility`,
        "{",
        "    [Fact]",
        `    public void The_package_is_the_one_we_assume() => Assert.True(true, "replace with what ${entry.slug} relies on");`,
        "}",
        "",
      ].join("\n"),
      result,
    );
    return result;
  }

  // The designed seam: the abstractions, the contract tests, the wiring
  // into the implementation's own test project, and the notes page.
  const srcDir = implementation !== null ? posix(relative(root, dirname(dirname(implementation)))) : `${moduleRoot}/src`;
  const abstractionsDir = `${srcDir}/${names.abstractions}`;
  const contractTestsDir = `${srcDir}/${names.contractTests}`;
  const interfaceName = `I${packageId.replace(/\W/g, "")}`;
  const classPrefix = packageId.replace(/\W/g, "");

  writeIfAbsent(
    root,
    `${abstractionsDir}/${names.abstractions}.csproj`,
    [
      '<Project Sdk="Microsoft.NET.Sdk">',
      "  <PropertyGroup>",
      frameworkLine(root, implementation).replace(/\n$/, ""),
      `    <PackageId>${names.abstractions}</PackageId>`,
      "    <IsPackable>true</IsPackable>",
      "    <Nullable>enable</Nullable>",
      "    <ImplicitUsings>enable</ImplicitUsings>",
      "    <GenerateDocumentationFile>true</GenerateDocumentationFile>",
      "  </PropertyGroup>",
      "</Project>",
      "",
    ].filter((line) => line !== "").join("\n"),
    result,
  );
  writeIfAbsent(
    root,
    `${abstractionsDir}/${interfaceName}.cs`,
    [
      `namespace ${names.abstractions};`,
      "",
      `/// <summary>What ${packageId} promises its consumers. Designed here, proved by ${names.contractTests}; a consumer compiles against this and never against the implementation.</summary>`,
      `public interface ${interfaceName}`,
      "{",
      "}",
      "",
    ].join("\n"),
    result,
  );
  ensurePins(root, [XUNIT_CORE, XUNIT_ASSERT], result.written);
  writeIfAbsent(
    root,
    `${contractTestsDir}/${names.contractTests}.csproj`,
    [
      '<Project Sdk="Microsoft.NET.Sdk">',
      "  <PropertyGroup>",
      frameworkLine(root, implementation).replace(/\n$/, ""),
      `    <PackageId>${names.contractTests}</PackageId>`,
      "    <!-- A library of tests, inherited by the implementation's test project; not a test project itself. -->",
      "    <OutputType>Library</OutputType>",
      "    <IsTestProject>false</IsTestProject>",
      "    <IsPackable>true</IsPackable>",
      "    <Nullable>enable</Nullable>",
      "    <ImplicitUsings>enable</ImplicitUsings>",
      "  </PropertyGroup>",
      "  <ItemGroup>",
      packageReference(XUNIT_CORE, pinned),
      packageReference(XUNIT_ASSERT, pinned),
      "  </ItemGroup>",
      "  <ItemGroup>",
      `    <ProjectReference Include="../${names.abstractions}/${names.abstractions}.csproj" />`,
      "  </ItemGroup>",
      "</Project>",
      "",
    ].filter((line) => line !== "").join("\n"),
    result,
  );
  writeIfAbsent(
    root,
    `${contractTestsDir}/${classPrefix}ContractTests.cs`,
    [
      `using ${names.abstractions};`,
      "using Xunit;",
      "",
      `namespace ${names.contractTests};`,
      "",
      `/// <summary>The provider contract: what every implementation of ${interfaceName} must satisfy. The implementation's test project inherits this and supplies Create(); each fact here is a promise the notes page makes.</summary>`,
      `public abstract class ${classPrefix}ContractTests`,
      "{",
      `    protected abstract ${interfaceName} Create();`,
      "",
      "    [Fact]",
      "    public void An_implementation_can_be_created() => Assert.NotNull(Create());",
      "}",
      "",
    ].join("\n"),
    result,
  );

  if (tests === null) {
    result.notes.push(
      `no test project was found under ${moduleRoot}; add a ProjectReference to ` +
        `${contractTestsDir}/${names.contractTests}.csproj and a subclass of ${classPrefix}ContractTests to it`,
    );
  } else {
    const testsRel = posix(relative(root, tests));
    const testsDir = dirname(tests);
    const referenceRel = posix(relative(testsDir, join(root, contractTestsDir, `${names.contractTests}.csproj`)));
    const csproj = readFileSync(tests, "utf8");
    if (csproj.includes(names.contractTests)) {
      result.skipped.push(testsRel);
    } else {
      const end = csproj.lastIndexOf("</Project>");
      const group =
        "  <ItemGroup>\n" +
        "    <!-- The provider contract, inherited: the implementation is held to the seam it exposes. -->\n" +
        `    <ProjectReference Include="${referenceRel}" />\n` +
        "  </ItemGroup>\n";
      writeFileSync(tests, end < 0 ? `${csproj}\n${group}` : `${csproj.slice(0, end)}${group}${csproj.slice(end)}`, "utf8");
      result.written.push(testsRel);
    }
    writeIfAbsent(
      root,
      `${posix(relative(root, testsDir))}/ImplementationContractTests.cs`,
      [
        `using ${names.abstractions};`,
        `using ${names.contractTests};`,
        "",
        `/// <summary>${packageId}'s implementation, held to its own contract. Create() returns the implementation under test.</summary>`,
        `public sealed class ImplementationContractTests : ${classPrefix}ContractTests`,
        "{",
        `    protected override ${interfaceName} Create() => throw new NotImplementedException("construct the implementation under test");`,
        "}",
        "",
      ].join("\n"),
      result,
    );
  }

  writeIfAbsent(root, `modules/${entry.slug}/contract/README.md`, contractNotesPage(entry.slug, packageId), result);
  return result;
}

/** The notes page of a module's contract, the same in every ecosystem. */
function contractNotesPage(slug: string, packageId: string): string {
  return [
    `# ${packageId} — what it promises`,
    "",
    `The notes page of ${slug}'s contract: everything a signature cannot carry. A`,
    `consumer reads this and \`${fileStem(packageId)}.api.md\` beside it, never the implementation.`,
    "",
    "## Must be true going in",
    "",
    "*What the caller guarantees before the call.*",
    "",
    "## Guaranteed coming out",
    "",
    "*What the module guarantees when it returns.*",
    "",
    "## Kept on purpose",
    "",
    "*Deliberately not removed or altered. The part people forget.*",
    "",
    "## Side effects",
    "",
    "*Anything that changes besides the return value.*",
    "",
    "## How it fails",
    "",
    "*Including whether failure is a normal outcome.*",
    "",
    "## Examples",
    "",
    "*One call, its inputs and what came back.*",
    "",
    "## Not promised",
    "",
    "*What callers must not depend on. Pinning it in a test freezes an implementation*",
    "*detail, so an improvement then looks like a break.*",
    "",
  ].join("\n");
}

/**
 * Every `public` declaration in one C# file with the `///` summary above
 * it, in file order. A reading of the text, not a parse: what it promises
 * is the declaration line and the doc comment as written, which is what a
 * reader of the page wants and what a consumer may rely on.
 */
export function readCSharpSurface(root: string, file: string): SurfaceEntry[] {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const rel = relative(root, file).split("\\").join("/");
  const out: SurfaceEntry[] = [];
  let pending: string[] = [];
  // Inside a public interface every member is public without saying so;
  // the reader tracks the braces so those members are read as the
  // declarations they are, and stops at the interface's end.
  let interfaceDepth = 0;
  let inInterface = false;
  const push = (line: string): void => {
    out.push({
      file: rel,
      declaration: line.replace(/\s*\{\s*(get;\s*)?(init;|set;)?\s*\}?\s*$/, "").replace(/\s*\{$/, "").trim(),
      summary: pending.filter((part) => part !== "").join(" "),
    });
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("///")) {
      pending.push(
        line
          .replace(/^\/\/\/\s?/, "")
          .replace(/<\/?summary>/g, "")
          .trim(),
      );
      continue;
    }
    // An attribute between the summary and its declaration keeps the
    // summary; anything else ends it.
    if (line.startsWith("[") && line.endsWith("]")) continue;
    if (/^public\s/.test(line)) {
      push(line);
      if (/^public\s+(partial\s+)?interface\s/.test(line)) {
        inInterface = true;
        interfaceDepth = 0;
      }
    } else if (
      inInterface &&
      // Directly inside the interface's body; a C# 8 default method's
      // body sits deeper and is not a member.
      interfaceDepth === 1 &&
      line !== "" &&
      !line.startsWith("//") &&
      !line.startsWith("{") &&
      !line.startsWith("}") &&
      !/^(private|internal|protected|static|namespace|using)\b/.test(line) &&
      (line.endsWith(";") || /\(|\{\s*get/.test(line))
    ) {
      push(line);
    }
    if (inInterface) {
      interfaceDepth += (line.match(/\{/g) ?? []).length;
      interfaceDepth -= (line.match(/\}/g) ?? []).length;
      if (interfaceDepth <= 0 && line.includes("}")) inInterface = false;
    }
    pending = [];
  }
  return out;
}

// --- Maven ------------------------------------------------------------------
//
// The same seam, the way a Maven team already works. A module is built from
// its own POM (`mvn -f modules/<slug>/pom.xml`), reaching the parent by
// relativePath, which is what a focused clone can do without every sibling
// the parent's <modules> names on disk. Siblings are consumed from the
// committed `packages/` folder as a file repository the parent declares;
// the pin is one managed <dependency> in the parent's
// <dependencyManagement>, and a consumer's <dependency> carries no version
// of its own. The version is the CI-friendly `${revision}`, so one
// `-Drevision=` gives a whole reactor the dev version without touching a
// tracked file. A Maven package id is `groupId:artifactId`.

/** The two halves of a Maven package id, or the refusal by name. */
export function mavenCoordinates(packageId: string): { groupId: string; artifactId: string } {
  const match = /^([^:\s]+):([^:\s]+)$/.exec(packageId);
  if (match === null) {
    throw new EcosystemError(
      `'${packageId}' is not a Maven package id: a Maven module's package is groupId:artifactId ` +
        "(com.example:reports), the coordinates its siblings depend on",
    );
  }
  return { groupId: match[1] as string, artifactId: match[2] as string };
}

/** The artifactId of a package id, or the id itself when it carries no group. */
function artifactIdOf(packageId: string): string {
  return packageId.includes(":") ? (packageId.split(":").pop() as string) : packageId;
}

/** What a POM says of itself. */
interface Pom {
  readonly groupId: string | null;
  readonly artifactId: string | null;
  readonly version: string | null;
  readonly packaging: string;
  readonly parent: { groupId: string | null; artifactId: string | null; version: string | null; relativePath: string } | null;
  readonly modules: readonly string[];
  readonly text: string;
}

/** A POM's text with its nested blocks removed, so a top-level element reads as the project's own. */
function pomTopLevel(text: string): string {
  return text.replace(/<(parent|dependencies|dependencyManagement|build|profiles|reporting|modules|properties)>[\s\S]*?<\/\1>/g, "");
}

function pomElement(text: string, name: string): string | null {
  const match = new RegExp(`<${name}>\\s*([^<]*?)\\s*</${name}>`).exec(text);
  return match === null ? null : (match[1] as string);
}

export function parsePom(text: string): Pom {
  const top = pomTopLevel(text);
  const parentBlock = /<parent>([\s\S]*?)<\/parent>/.exec(text);
  const parent =
    parentBlock === null
      ? null
      : {
          groupId: pomElement(parentBlock[1] as string, "groupId"),
          artifactId: pomElement(parentBlock[1] as string, "artifactId"),
          version: pomElement(parentBlock[1] as string, "version"),
          relativePath: pomElement(parentBlock[1] as string, "relativePath") ?? "../pom.xml",
        };
  const modulesBlock = /<modules>([\s\S]*?)<\/modules>/.exec(text.replace(/<profiles>[\s\S]*?<\/profiles>/g, ""));
  const modules =
    modulesBlock === null
      ? []
      : [...(modulesBlock[1] as string).matchAll(/<module>\s*([^<]+?)\s*<\/module>/g)].map((match) => match[1] as string);
  return {
    groupId: pomElement(top, "groupId") ?? parent?.groupId ?? null,
    artifactId: pomElement(top, "artifactId"),
    version: pomElement(top, "version") ?? parent?.version ?? null,
    packaging: pomElement(top, "packaging") ?? "jar",
    parent,
    modules,
    text,
  };
}

function readPom(path: string): Pom | null {
  try {
    return parsePom(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/** The POM a parent's relativePath names: a file, or the pom.xml of a directory. */
function parentPomPath(fromDir: string, relativePath: string): string {
  const path = join(fromDir, relativePath);
  try {
    return statSync(path).isDirectory() ? join(path, "pom.xml") : path;
  } catch {
    return path;
  }
}

/**
 * The release base a Maven project declares: its literal version, or the
 * property (`${revision}`) it and its parents resolve, prerelease stripped,
 * `0.1.0` when nothing resolves.
 */
function baseVersionMaven(root: string, project: string): string {
  let path = join(root, project);
  let pom = readPom(path);
  let version = pom?.version ?? null;
  for (let depth = 0; pom !== null && depth < 6; depth++) {
    if (version !== null && !version.includes("${")) break;
    const property = version === null ? null : (/^\$\{([^}]+)\}$/.exec(version)?.[1] ?? null);
    const resolved = property === null ? null : pomElement(pom.text, property);
    if (resolved !== null && !resolved.includes("${")) {
      version = resolved;
      break;
    }
    if (pom.parent === null) break;
    path = parentPomPath(dirname(path), pom.parent.relativePath);
    pom = readPom(path);
    if (pom !== null && version === null) version = pom.version;
  }
  const literal = version === null || version.includes("${") ? "0.1.0" : version;
  return literal.split("-")[0] ?? "0.1.0";
}

/** Every pom.xml under the module's roots, repository-relative with forward slashes, shallowest first. */
function mavenPoms(root: string, entry: ModuleEntry): string[] {
  const roots = entry.codeRoots.length > 0 ? entry.codeRoots : ["."];
  const out = new Set<string>();
  for (const codeRoot of roots) {
    for (const file of walkFiles(join(root, codeRoot))) {
      if (basename(file) === "pom.xml") out.add(posix(relative(root, file)));
    }
  }
  return [...out].sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
}

/** The `<dependency>` items of one block, each with its coordinates and where it sits in the text. */
function dependencyItems(text: string): { groupId: string | null; artifactId: string | null; version: string | null; start: number; end: number }[] {
  return [...text.matchAll(/<dependency>([\s\S]*?)<\/dependency>/g)].map((match) => ({
    groupId: pomElement(match[1] as string, "groupId"),
    artifactId: pomElement(match[1] as string, "artifactId"),
    version: pomElement(match[1] as string, "version"),
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
}

/** The top-level `<dependencyManagement>` block of a POM (never a profile's), with its offset. */
function managementBlock(text: string): { start: number; end: number; inner: string } | null {
  const withoutProfiles = text.replace(/<profiles>[\s\S]*?<\/profiles>/g, (block) => " ".repeat(block.length));
  const match = /<dependencyManagement>([\s\S]*?)<\/dependencyManagement>/.exec(withoutProfiles);
  if (match === null) return null;
  return { start: match.index, end: match.index + match[0].length, inner: match[1] as string };
}

function managedPins(pomText: string): Map<string, string> {
  const pins = new Map<string, string>();
  const block = managementBlock(pomText);
  if (block === null) return pins;
  for (const item of dependencyItems(block.inner)) {
    if (item.groupId !== null && item.artifactId !== null && item.version !== null) {
      pins.set(`${item.groupId}:${item.artifactId}`, item.version);
    }
  }
  return pins;
}

/**
 * The parent POM with `packageId` managed at `version`: the one managed
 * `<dependency>` for the coordinates replaced in place and everything
 * around it preserved, or a new one added to the top-level block (or a
 * new block before `</project>`). Two entries for one id are refused by
 * name, as the .NET side refuses a duplicated pin.
 */
export function pinManagedDependency(pomText: string, packageId: string, version: string): string {
  const { groupId, artifactId } = mavenCoordinates(packageId);
  const block = managementBlock(pomText);
  const entry = [
    "      <dependency>",
    `        <groupId>${groupId}</groupId>`,
    `        <artifactId>${artifactId}</artifactId>`,
    `        <version>${version}</version>`,
    "      </dependency>",
  ].join("\n");
  if (block === null) {
    const end = pomText.lastIndexOf("</project>");
    const managed = `  <dependencyManagement>\n    <dependencies>\n${entry}\n    </dependencies>\n  </dependencyManagement>\n`;
    return end < 0 ? `${pomText}\n${managed}` : `${pomText.slice(0, end)}${managed}${pomText.slice(end)}`;
  }
  const matches = dependencyItems(block.inner).filter((item) => item.groupId === groupId && item.artifactId === artifactId);
  if (matches.length > 1) {
    throw new EcosystemError(
      `pom.xml manages '${packageId}' ${matches.length} times; a consumer must resolve one ` +
        "pin, so the duplicate is refused rather than chosen between",
    );
  }
  if (matches.length === 1) {
    const item = matches[0]!;
    const original = block.inner.slice(item.start, item.end);
    const replaced = /<version>[^<]*<\/version>/.test(original)
      ? original.replace(/<version>[^<]*<\/version>/, `<version>${version}</version>`)
      : original.replace(/(<artifactId>[^<]*<\/artifactId>)/, `$1\n        <version>${version}</version>`);
    const at = block.start + "<dependencyManagement>".length + item.start;
    return `${pomText.slice(0, at)}${replaced}${pomText.slice(at + original.length)}`;
  }
  const closing = block.inner.lastIndexOf("</dependencies>");
  if (closing < 0) {
    const at = block.start + "<dependencyManagement>".length;
    return `${pomText.slice(0, at)}\n    <dependencies>\n${entry}\n    </dependencies>\n  ${pomText.slice(at)}`;
  }
  const at = block.start + "<dependencyManagement>".length + closing;
  return `${pomText.slice(0, at)}${entry}\n    ${pomText.slice(at)}`;
}

/** The dependencies a POM declares for itself, outside management and profiles. */
function ownDependencies(pomText: string): { groupId: string | null; artifactId: string | null; version: string | null }[] {
  const stripped = pomText
    .replace(/<dependencyManagement>[\s\S]*?<\/dependencyManagement>/g, "")
    .replace(/<profiles>[\s\S]*?<\/profiles>/g, "")
    .replace(/<build>[\s\S]*?<\/build>/g, "");
  const block = /<dependencies>([\s\S]*?)<\/dependencies>/.exec(stripped);
  return block === null ? [] : dependencyItems(block[1] as string);
}

function pascal(text: string): string {
  return text
    .split(/[^A-Za-z0-9]+/)
    .filter((part) => part !== "")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/** A Java package for a module's api: the group, the artifact with its punctuation dropped, and a suffix. */
function javaPackage(groupId: string, artifactId: string, suffix: string): string {
  const artifact = artifactId.toLowerCase().replace(/[^a-z0-9]/g, "");
  return [groupId, artifact === "" ? "module" : artifact, suffix].filter((part) => part !== "").join(".");
}

const MAVEN_POM_HEAD = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
  '         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">',
  "  <modelVersion>4.0.0</modelVersion>",
];
const JUNIT = "org.junit.jupiter:junit-jupiter";
const JUNIT_API = "org.junit.jupiter:junit-jupiter-api";
const JUNIT_VERSION = "5.13.4";
const DEPLOY_PLUGIN_VERSION = "3.1.4";
const FLATTEN_PLUGIN_VERSION = "1.7.0";

function dependencyXml(packageId: string, options: { version?: string | null; scope?: string } = {}): string[] {
  const { groupId, artifactId } = mavenCoordinates(packageId);
  return [
    "    <dependency>",
    `      <groupId>${groupId}</groupId>`,
    `      <artifactId>${artifactId}</artifactId>`,
    ...(options.version ? [`      <version>${options.version}</version>`] : []),
    ...(options.scope ? [`      <scope>${options.scope}</scope>`] : []),
    "    </dependency>",
  ];
}

/**
 * The `<parent>` a child under a module takes: the module's own POM when it
 * aggregates, the module's parent otherwise (one level further away), the
 * root POM when the module has neither; nothing when there is no POM to
 * name, and the child then carries its own group and `${revision}`.
 */
function parentXml(root: string, moduleDir: string, modulePom: Pom | null, childDir: string, groupId: string): string[] {
  const from = join(root, childDir);
  const lines = (g: string | null, a: string, v: string | null, path: string): string[] => [
    "  <parent>",
    `    <groupId>${g ?? groupId}</groupId>`,
    `    <artifactId>${a}</artifactId>`,
    `    <version>${v ?? "${revision}"}</version>`,
    `    <relativePath>${path}</relativePath>`,
    "  </parent>",
  ];
  if (modulePom !== null && modulePom.packaging === "pom" && modulePom.artifactId !== null) {
    return lines(modulePom.groupId, modulePom.artifactId, modulePom.version, posix(relative(from, join(root, moduleDir, "pom.xml"))));
  }
  if (modulePom !== null && modulePom.parent !== null && modulePom.parent.artifactId !== null) {
    const parentPath = parentPomPath(join(root, moduleDir), modulePom.parent.relativePath);
    return lines(modulePom.parent.groupId, modulePom.parent.artifactId, modulePom.parent.version, posix(relative(from, parentPath)));
  }
  const rootPom = readPom(join(root, "pom.xml"));
  if (rootPom !== null && rootPom.artifactId !== null) {
    return lines(rootPom.groupId, rootPom.artifactId, rootPom.version, posix(relative(from, join(root, "pom.xml"))));
  }
  return [`  <groupId>${groupId}</groupId>`, "  <version>${revision}</version>"];
}

/** Add `<module>` entries to an aggregator's `<modules>` where absent. */
function addModules(pomText: string, names: readonly string[]): string {
  const block = /<modules>([\s\S]*?)<\/modules>/.exec(pomText);
  if (block === null) return pomText;
  const present = new Set([...(block[1] as string).matchAll(/<module>\s*([^<]+?)\s*<\/module>/g)].map((match) => match[1] as string));
  const missing = names.filter((name) => !present.has(name));
  if (missing.length === 0) return pomText;
  const at = block.index + block[0].length - "</modules>".length;
  return `${pomText.slice(0, at)}${missing.map((name) => `  <module>${name}</module>\n  `).join("")}${pomText.slice(at)}`;
}

/** Add dependencies to a POM's own `<dependencies>` (made before `</project>` when absent), skipping ones present. */
function addDependencies(pomText: string, deps: readonly { packageId: string; version?: string | null; scope?: string }[]): string {
  const have = new Set(ownDependencies(pomText).map((item) => `${item.groupId}:${item.artifactId}`));
  const missing = deps.filter((dep) => !have.has(dep.packageId));
  if (missing.length === 0) return pomText;
  const xml = missing.flatMap((dep) => dependencyXml(dep.packageId, dep)).join("\n");
  const stripped = pomText.replace(/<dependencyManagement>[\s\S]*?<\/dependencyManagement>/g, (block) => " ".repeat(block.length)).replace(/<profiles>[\s\S]*?<\/profiles>/g, (block) => " ".repeat(block.length));
  const closing = stripped.lastIndexOf("</dependencies>");
  if (closing >= 0) return `${pomText.slice(0, closing)}${xml}\n  ${pomText.slice(closing)}`;
  const end = pomText.lastIndexOf("</project>");
  const block = `  <dependencies>\n${xml}\n  </dependencies>\n`;
  return end < 0 ? `${pomText}\n${block}` : `${pomText.slice(0, end)}${block}${pomText.slice(end)}`;
}

/** Manage the versions the scaffold's test packages need in the root POM, where there is one and a pin is missing. */
function ensureManaged(root: string, ids: readonly string[], written: string[]): boolean {
  const path = join(root, "pom.xml");
  if (!existsSync(path)) return false;
  let text = readFileSync(path, "utf8");
  const pins = managedPins(text);
  const missing = ids.filter((id) => !pins.has(id));
  for (const id of missing) text = pinManagedDependency(text, id, JUNIT_VERSION);
  if (missing.length > 0) {
    writeFileSync(path, text, "utf8");
    written.push("pom.xml");
  }
  return true;
}

/** The module's own POM, its coordinates and its implementation POM (the one the artifact names, else the module's when it is a jar). */
function mavenModule(root: string, entry: ModuleEntry): {
  moduleDir: string;
  modulePom: Pom | null;
  groupId: string;
  artifactId: string;
  implementation: string | null;
} {
  const moduleDir = entry.codeRoots[0] ?? `modules/${entry.slug}`;
  const modulePom = readPom(join(root, moduleDir, "pom.xml"));
  const coordinates =
    entry.package !== null
      ? mavenCoordinates(entry.package)
      : { groupId: modulePom?.groupId ?? "com.example", artifactId: modulePom?.artifactId ?? entry.slug };
  const poms = mavenPoms(root, entry);
  const implementation =
    poms.find((pom) => readPom(join(root, pom))?.artifactId === coordinates.artifactId) ??
    (modulePom !== null && modulePom.packaging !== "pom" ? `${moduleDir}/pom.xml` : null);
  return { moduleDir, modulePom, ...coordinates, implementation };
}

const MAVEN: Ecosystem = {
  key: "maven",
  contractProjectNames(packageId: string): ContractProjectNames {
    const artifact = artifactIdOf(packageId);
    return {
      abstractions: `${artifact}-api`,
      contractTests: `${artifact}-contract-tests`,
      compatibility: (providerPackage: string) => `${artifactIdOf(providerPackage)}-compatibility`,
    };
  },
  rootFiles(root: string, shape: SolutionShape): ScaffoldResult {
    return rootFilesMaven(root, shape);
  },
  baseVersion(root: string, project: string): string {
    return baseVersionMaven(root, project);
  },
  packagedArtifact(packageId: string, version: string): string {
    const { groupId, artifactId } = mavenCoordinates(packageId);
    return `${groupId.split(".").join("/")}/${artifactId}/${version}/${artifactId}-${version}.jar`;
  },
  lfsPattern: "*.jar",
  centralPins(root: string): Map<string, string> {
    const path = join(root, "pom.xml");
    return existsSync(path) ? managedPins(readFileSync(path, "utf8")) : new Map();
  },
  writeCentralPin(root: string, packageId: string, version: string): string {
    const path = join(root, "pom.xml");
    if (!existsSync(path)) {
      throw new EcosystemError(
        "no root pom.xml to manage the pin in: the root build files are written when the " +
          "solution becomes multi-module (dabbler modules create, module contract, module pack)",
      );
    }
    writeFileSync(path, pinManagedDependency(readFileSync(path, "utf8"), packageId, version), "utf8");
    return "pom.xml";
  },
  packageReferences(root: string, projectFile: string): PackageReferenceFact[] {
    const pom = readPom(join(root, projectFile));
    if (pom === null) return [];
    return ownDependencies(pom.text)
      .filter((item) => item.artifactId !== null)
      .map((item) => ({
        project: projectFile,
        packageId: `${(item.groupId === "${project.groupId}" ? pom.groupId : item.groupId) ?? ""}:${item.artifactId}`,
        ownVersion: item.version,
      }));
  },
  layDebugGrants(
    root: string,
    _shape: SolutionShape,
    debugging: readonly ModuleEntry[],
    granted: ModuleEntry | null,
    pack: ((slug: string) => void) | null,
  ): void {
    // No overlay: Maven loads no external profile, so the granted sibling
    // is rebuilt from its source into the file repository, and the consumer
    // resolves the fresh artifact -- the reactor's own answer to the same
    // question. Only the sibling just granted; a revoke undoes nothing,
    // because what was packed is what its source was.
    if (granted === null || keyOf(root, granted) !== "maven") return;
    if (!debugging.some((entry) => entry.slug === granted.slug)) return;
    if (pack === null) {
      throw new EcosystemError(
        `a debugging grant of Maven module '${granted.slug}' rebuilds it from its source into ` +
          "the file repository with module pack, and no pack was handed in",
      );
    }
    pack(granted.slug);
  },
  readSurface(root: string, entry: ModuleEntry, packageId: string): SurfaceEntry[] {
    const names = this.contractProjectNames(packageId);
    const roots = entry.codeRoots.length > 0 ? entry.codeRoots : ["."];
    // Java packages are directories, and a source sits eight or more deep
    // under its module; the walk goes as deep as they do.
    const files = roots.flatMap((codeRoot) => walkFiles(join(root, codeRoot), 16)).filter((file) => file.endsWith(".java"));
    // The api module is the surface when the module has one; otherwise
    // every main source, which is the surface of a module whose artifact
    // is its own abstraction.
    const api = files.filter((file) => relative(root, file).split(/[\\/]/).includes(names.abstractions));
    const chosen = api.length > 0 ? api : files.filter((file) => !/[\\/]src[\\/]test[\\/]/.test(relative(root, file)));
    const out: SurfaceEntry[] = [];
    for (const file of chosen) out.push(...readJavaSurface(root, file));
    return out;
  },
  scaffoldContract(root: string, entry: ModuleEntry, against: ModuleEntry | null): ScaffoldResult {
    return scaffoldMaven(root, entry, against);
  },
  packableProjects(root: string, entry: ModuleEntry): PackTarget[] {
    const poms = mavenPoms(root, entry);
    const top = poms[0];
    const aggregator = top !== undefined && readPom(join(root, top))?.packaging === "pom" ? top : undefined;
    const out: PackTarget[] = [];
    for (const project of poms) {
      const pom = readPom(join(root, project));
      if (pom === null || pom.artifactId === null || pom.packaging === "pom") continue;
      // A compatibility suite produces no artifact anyone consumes.
      if (pom.artifactId.endsWith("-compatibility") || /\/src\/test\//.test(project)) continue;
      const packageId = `${pom.groupId ?? "unknown"}:${pom.artifactId}`;
      out.push(aggregator !== undefined && aggregator !== project ? { project, packageId, via: aggregator } : { project, packageId });
    }
    return out;
  },
  packArgv(project: string, output: string, version: string): string[] {
    // One reactor build per module, deployed into the committed file
    // repository under the dev version: `-Drevision` reaches every POM that
    // takes `${revision}`, the tests are the run of record's business, and
    // the deploy plugin's `id::url` names the repository the parent POM
    // declares.
    return ["mvn", "-B", "-f", project, "-DskipTests", `-Drevision=${version}`, `-DaltDeploymentRepository=modules::${pathToFileURL(output).href}`, "deploy"];
  },
  projectFiles(root: string, entry: ModuleEntry): string[] {
    return mavenPoms(root, entry).sort();
  },
  convenienceFile(root: string, entry: ModuleEntry, projects: readonly string[]): string {
    // `.mvn/maven.config` is what `mvn` reads from the directory it is run
    // in, so a plain `mvn test` at the clone's root builds the module from
    // its own POM; one argument per line, which every Maven since 3.3 reads.
    const top = [...projects].sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b))[0] ?? `${entry.codeRoots[0] ?? `modules/${entry.slug}`}/pom.xml`;
    const file = ".mvn/maven.config";
    mkdirSync(join(root, ".mvn"), { recursive: true });
    writeFileSync(join(root, file), `-f\n${top}\n`, "utf8");
    return file;
  },
};

/**
 * The root files a multi-module Maven solution needs, written only where
 * absent: the parent POM (the modules it aggregates, the CI-friendly
 * `${revision}`, the committed file repository, the deploy and flatten
 * plugins managed), and the packages folder's attributes and README.
 */
function rootFilesMaven(root: string, shape: SolutionShape): ScaffoldResult {
  const result = { written: [] as string[], skipped: [] as string[], notes: [] as string[] };
  const moduleDirs: string[] = [];
  let groupId: string | null = null;
  for (const entry of shape.modules) {
    const dir = posix(entry.codeRoots[0] ?? `modules/${entry.slug}`);
    const pom = readPom(join(root, dir, "pom.xml"));
    if (pom === null) continue;
    moduleDirs.push(dir);
    groupId ??= pom.groupId;
  }
  const parentArtifact = `${basename(root).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "solution"}-parent`;
  writeIfAbsent(
    root,
    "pom.xml",
    [
      ...MAVEN_POM_HEAD,
      `  <groupId>${groupId ?? "com.example"}</groupId>`,
      `  <artifactId>${parentArtifact}</artifactId>`,
      "  <version>${revision}</version>",
      "  <packaging>pom</packaging>",
      "",
      "  <properties>",
      "    <!-- CI-friendly: one -Drevision= gives the whole reactor a version without touching",
      "         a tracked file; dabbler module pack builds each package under its dev version this way. -->",
      "    <revision>0.1.0-SNAPSHOT</revision>",
      "    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>",
      "    <maven.compiler.release>21</maven.compiler.release>",
      "  </properties>",
      "",
      "  <!-- A module is built from its own POM (mvn -f modules/<slug>/pom.xml), reaching this",
      "       parent by relativePath, so a focused checkout that holds one module builds it",
      "       without the siblings this list names. Add a module here when it gets its POM. -->",
      "  <modules>",
      ...moduleDirs.map((dir) => `    <module>${dir}</module>`),
      "  </modules>",
      "",
      "  <repositories>",
      "    <!-- The solution's own modules, as committed artifacts; resolved from the root of",
      "         whatever checkout this is. -->",
      "    <repository>",
      "      <id>modules</id>",
      `      <url>file:///\${maven.multiModuleProjectDirectory}/${PACKAGES_DIR}</url>`,
      "    </repository>",
      "  </repositories>",
      "",
      "  <!-- Sibling modules, consumed from the committed ./packages folder. The managed",
      "       version is the module's current dev version; dabbler module pack moves it in the",
      "       same commit as the new artifact, and a consumer's dependency carries no version. -->",
      "  <dependencyManagement>",
      "    <dependencies>",
      "    </dependencies>",
      "  </dependencyManagement>",
      "",
      "  <build>",
      "    <pluginManagement>",
      "      <plugins>",
      "        <plugin>",
      "          <groupId>org.apache.maven.plugins</groupId>",
      "          <artifactId>maven-deploy-plugin</artifactId>",
      `          <version>${DEPLOY_PLUGIN_VERSION}</version>`,
      "        </plugin>",
      "        <plugin>",
      "          <groupId>org.codehaus.mojo</groupId>",
      "          <artifactId>flatten-maven-plugin</artifactId>",
      `          <version>${FLATTEN_PLUGIN_VERSION}</version>`,
      "          <configuration>",
      "            <updatePomFile>true</updatePomFile>",
      "            <flattenMode>resolveCiFriendliesOnly</flattenMode>",
      "          </configuration>",
      "          <executions>",
      "            <execution>",
      "              <id>flatten</id>",
      "              <phase>process-resources</phase>",
      "              <goals><goal>flatten</goal></goals>",
      "            </execution>",
      "            <execution>",
      "              <id>flatten-clean</id>",
      "              <phase>clean</phase>",
      "              <goals><goal>clean</goal></goals>",
      "            </execution>",
      "          </executions>",
      "        </plugin>",
      "      </plugins>",
      "    </pluginManagement>",
      "    <plugins>",
      "      <!-- The installed POM carries the resolved version, not the literal ${revision}. -->",
      "      <plugin>",
      "        <groupId>org.codehaus.mojo</groupId>",
      "        <artifactId>flatten-maven-plugin</artifactId>",
      "      </plugin>",
      "    </plugins>",
      "  </build>",
      "</project>",
      "",
    ].join("\n"),
    result,
  );
  writeIfAbsent(
    root,
    `${PACKAGES_DIR}/.gitattributes`,
    [
      "# Committed artifacts are small by the ceiling (`modules.packages.ceilingBytes`,",
      "# 5 MiB unless dabbler.yaml says otherwise). An artifact over it is refused until",
      "# this line is uncommented, which puts every jar here under Git LFS:",
      "# *.jar filter=lfs diff=lfs merge=lfs -text",
      "",
    ].join("\n"),
    result,
  );
  writeIfAbsent(
    root,
    `${PACKAGES_DIR}/README.md`,
    [
      "# packages",
      "",
      "The solution's own modules, as committed artifacts in Maven repository layout. A",
      "module consumes a sibling from here -- a `<dependency>` with no version, managed",
      "once in the root `pom.xml` -- and never from its source, so a focused checkout",
      "holding one module builds against exactly the bytes its siblings landed.",
      "",
      "`dabbler module pack <slug>` deploys a module's artifacts here under an immutable",
      "dev version and records, beside them, the source and contract they were built",
      "from. Nothing here is edited by hand.",
      "",
    ].join("\n"),
    result,
  );
  if (moduleDirs.length === 0) result.notes.push("no module holds a pom.xml yet, so the parent POM lists none; add each as it gets one");
  return result;
}

/**
 * The designed seam for a Maven module: an `<artifact>-api` module (what a
 * consumer compiles against), an `<artifact>-contract-tests` module with
 * the abstract JUnit class the implementation's tests inherit, the wiring
 * into the module's aggregator and its implementation, and the notes page;
 * or, with `against`, a compatibility module against a provider's
 * artifact, pinned centrally and never a reactor project.
 */
function scaffoldMaven(root: string, entry: ModuleEntry, against: ModuleEntry | null): ScaffoldResult {
  const result = { written: [] as string[], skipped: [] as string[], notes: [] as string[] };
  const { moduleDir, modulePom, groupId, artifactId, implementation } = mavenModule(root, entry);
  const packageId = `${groupId}:${artifactId}`;
  const names = MAVEN.contractProjectNames(packageId);

  if (against !== null) {
    const provider = mavenModule(root, against);
    const providerPackage = `${provider.groupId}:${provider.artifactId}`;
    const name = names.compatibility(providerPackage);
    const dir = posix(join(`modules/${entry.slug}/contract`, name));
    const managed = ensureManaged(root, [JUNIT], result.written);
    const pkg = javaPackage(groupId, artifactId, "compat");
    writeIfAbsent(
      root,
      `${dir}/pom.xml`,
      [
        ...MAVEN_POM_HEAD,
        ...parentXml(root, moduleDir, modulePom, dir, groupId),
        `  <artifactId>${name}</artifactId>`,
        "  <packaging>jar</packaging>",
        "",
        "  <dependencies>",
        `    <!-- Across the seam: ${against.slug}'s artifact from the committed repository, never its source. -->`,
        ...dependencyXml(providerPackage),
        ...dependencyXml(JUNIT, { version: managed ? null : JUNIT_VERSION, scope: "test" }),
        "  </dependencies>",
        "</project>",
        "",
      ].join("\n"),
      result,
    );
    writeIfAbsent(
      root,
      `${dir}/src/test/java/${pkg.split(".").join("/")}/${pascal(provider.artifactId)}Compatibility.java`,
      [
        `package ${pkg};`,
        "",
        "import static org.junit.jupiter.api.Assertions.assertTrue;",
        "",
        "import org.junit.jupiter.api.Test;",
        "",
        `/** What ${entry.slug} assumes of ${providerPackage} beyond its provider contract. Runs against the artifact the managed version names, so a candidate ${provider.artifactId} that breaks an assumption fails here before it lands. */`,
        `public class ${pascal(provider.artifactId)}Compatibility {`,
        "    @Test",
        `    void theArtifactIsTheOneWeAssume() { assertTrue(true, "replace with what ${entry.slug} relies on"); }`,
        "}",
        "",
      ].join("\n"),
      result,
    );
    return result;
  }

  const apiDir = `${moduleDir}/${names.abstractions}`;
  const testsDir = `${moduleDir}/${names.contractTests}`;
  const apiPackage = javaPackage(groupId, artifactId, "api");
  const contractPackage = javaPackage(groupId, artifactId, "contract");
  const interfaceName = pascal(artifactId);
  const managed = ensureManaged(root, [JUNIT_API, JUNIT], result.written);

  writeIfAbsent(
    root,
    `${apiDir}/pom.xml`,
    [
      ...MAVEN_POM_HEAD,
      ...parentXml(root, moduleDir, modulePom, apiDir, groupId),
      `  <artifactId>${names.abstractions}</artifactId>`,
      "  <packaging>jar</packaging>",
      `  <!-- What a consumer of ${artifactId} compiles against: its interfaces and types, and nothing of its implementation. -->`,
      "</project>",
      "",
    ].join("\n"),
    result,
  );
  writeIfAbsent(
    root,
    `${apiDir}/src/main/java/${apiPackage.split(".").join("/")}/${interfaceName}.java`,
    [
      `package ${apiPackage};`,
      "",
      `/** What ${packageId} promises its consumers. Designed here, proved by ${names.contractTests}; a consumer compiles against this and never against the implementation. */`,
      `public interface ${interfaceName} {`,
      "}",
      "",
    ].join("\n"),
    result,
  );
  writeIfAbsent(
    root,
    `${testsDir}/pom.xml`,
    [
      ...MAVEN_POM_HEAD,
      ...parentXml(root, moduleDir, modulePom, testsDir, groupId),
      `  <artifactId>${names.contractTests}</artifactId>`,
      "  <packaging>jar</packaging>",
      "  <!-- A library of tests, inherited by the implementation's tests; not a test module itself. -->",
      "",
      "  <dependencies>",
      ...dependencyXml(`${groupId}:${names.abstractions}`, { version: "${project.version}" }),
      ...dependencyXml(JUNIT_API, { version: managed ? null : JUNIT_VERSION }),
      "  </dependencies>",
      "</project>",
      "",
    ].join("\n"),
    result,
  );
  writeIfAbsent(
    root,
    `${testsDir}/src/main/java/${contractPackage.split(".").join("/")}/${interfaceName}ContractTests.java`,
    [
      `package ${contractPackage};`,
      "",
      "import static org.junit.jupiter.api.Assertions.assertNotNull;",
      "",
      `import ${apiPackage}.${interfaceName};`,
      "import org.junit.jupiter.api.Test;",
      "",
      `/** The provider contract: what every implementation of ${interfaceName} must satisfy. The implementation's tests extend this and supply create(); each test here is a promise the notes page makes. */`,
      `public abstract class ${interfaceName}ContractTests {`,
      `    protected abstract ${interfaceName} create();`,
      "",
      "    @Test",
      "    void anImplementationCanBeCreated() { assertNotNull(create()); }",
      "}",
      "",
    ].join("\n"),
    result,
  );

  // The wiring: the aggregator lists the two, and the implementation
  // inherits the contract in its own tests.
  const modulePomPath = join(root, moduleDir, "pom.xml");
  if (modulePom !== null && modulePom.packaging === "pom") {
    const extended = addModules(modulePom.text, [names.abstractions, names.contractTests]);
    if (extended !== modulePom.text) {
      writeFileSync(modulePomPath, extended, "utf8");
      result.written.push(`${moduleDir}/pom.xml`);
    } else {
      result.skipped.push(`${moduleDir}/pom.xml`);
    }
  } else {
    result.notes.push(
      `${moduleDir}/pom.xml does not aggregate; list ${names.abstractions} and ${names.contractTests} as modules ` +
        "of the POM that builds this module, or make the module's POM an aggregator",
    );
  }
  if (implementation === null) {
    result.notes.push(
      `no implementation POM was found under ${moduleDir}; add a test-scoped dependency on ` +
        `${groupId}:${names.contractTests} and a subclass of ${interfaceName}ContractTests to it`,
    );
  } else {
    const implPath = join(root, implementation);
    const text = readFileSync(implPath, "utf8");
    const wired = addDependencies(text, [
      { packageId: `${groupId}:${names.contractTests}`, version: "${project.version}", scope: "test" },
      { packageId: JUNIT, version: managed ? null : JUNIT_VERSION, scope: "test" },
    ]);
    if (wired !== text) {
      writeFileSync(implPath, wired, "utf8");
      result.written.push(implementation);
    } else {
      result.skipped.push(implementation);
    }
    const implPackage = javaPackage(groupId, artifactId, "");
    writeIfAbsent(
      root,
      `${posix(dirname(implementation))}/src/test/java/${implPackage.split(".").join("/")}/ImplementationContractTests.java`,
      [
        `package ${implPackage};`,
        "",
        `import ${apiPackage}.${interfaceName};`,
        `import ${contractPackage}.${interfaceName}ContractTests;`,
        "",
        `/** ${artifactId}'s implementation, held to its own contract. create() returns the implementation under test. */`,
        `public final class ImplementationContractTests extends ${interfaceName}ContractTests {`,
        "    @Override",
        `    protected ${interfaceName} create() { throw new UnsupportedOperationException("construct the implementation under test"); }`,
        "}",
        "",
      ].join("\n"),
      result,
    );
  }
  writeIfAbsent(root, `modules/${entry.slug}/contract/README.md`, contractNotesPage(entry.slug, packageId), result);
  return result;
}

/**
 * Every `public` declaration in one Java file with the Javadoc above it,
 * in file order: the same reading the C# side does, over block comments.
 * A tag line (`@param`, `@return`) is not the summary; an annotation
 * between the comment and its declaration keeps the summary.
 */
export function readJavaSurface(root: string, file: string): SurfaceEntry[] {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const rel = posix(relative(root, file));
  const out: SurfaceEntry[] = [];
  let pending: string[] = [];
  let inDoc = false;
  let inInterface = false;
  let interfaceDepth = 0;
  const push = (line: string): void => {
    out.push({
      file: rel,
      declaration: line.replace(/\s*\{.*$/, "").replace(/;\s*$/, "").trim(),
      summary: pending
        .map((part) => part.trim())
        .filter((part) => part !== "" && !part.startsWith("@"))
        .join(" "),
    });
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (inDoc) {
      const end = line.indexOf("*/");
      pending.push((end < 0 ? line : line.slice(0, end)).replace(/^\*\s?/, ""));
      if (end >= 0) inDoc = false;
      continue;
    }
    if (line.startsWith("/**")) {
      const end = line.indexOf("*/");
      pending = [(end < 0 ? line.slice(3) : line.slice(3, end)).trim()];
      inDoc = end < 0;
      continue;
    }
    if (line.startsWith("@")) continue;
    if (/^public\s/.test(line)) {
      push(line);
      if (/^public\s+(?:\w+\s+)*interface\s/.test(line)) {
        inInterface = true;
        interfaceDepth = 0;
      }
    } else if (
      inInterface &&
      // Directly inside the interface's body: a line deeper than that is
      // the body of a default or static method, not a member.
      interfaceDepth === 1 &&
      line !== "" &&
      !line.startsWith("//") &&
      !line.startsWith("{") &&
      !line.startsWith("}") &&
      // Inside an interface every member is public unless it says
      // `private` (a Java 9 helper): a `default` method and a `static`
      // factory or constant are part of the promise, and are read.
      !/^(private|package|import)\b/.test(line) &&
      (line.endsWith(";") || /\(/.test(line))
    ) {
      push(line);
    }
    if (inInterface) {
      interfaceDepth += (line.match(/\{/g) ?? []).length;
      interfaceDepth -= (line.match(/\}/g) ?? []).length;
      if (interfaceDepth <= 0 && line.includes("}")) inInterface = false;
    }
    pending = [];
  }
  return out;
}
