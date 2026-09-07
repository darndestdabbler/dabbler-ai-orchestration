// The ecosystem seam: every decision in the modules block that depends on
// whether a module is .NET or Maven is a method here, and nowhere else.
//
// .NET is built first and proven against the module-checkout POC; Java is a
// stated customer, so the Maven side of every method exists from the day
// the method does and REFUSES BY NAME until session 108 fills it. A method
// that guessed a Maven shape would be a promise the framework breaks the
// first time a Java team reaches it; a refusal that names the session is a
// promise it keeps.
//
// Which ecosystem a module is comes from what its roots contain -- a
// `.csproj` or a solution file, or a `pom.xml` -- and never from a
// declaration, because a declaration that disagreed with the tree would
// have to be wrong about one of them.

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

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

export interface Ecosystem {
  readonly key: EcosystemKey;
  /** The seam's project names for a package id. */
  contractProjectNames(packageId: string): ContractProjectNames;
  /**
   * The root build files a multi-module solution of this ecosystem needs,
   * each written only where absent and never rewritten: the committed feed
   * folder, the central pins, the build properties and targets.
   */
  rootFiles(root: string): ScaffoldResult;
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
   * solution to filter.
   */
  convenienceFile(root: string, entry: ModuleEntry, projects: readonly string[]): string;
}

/** One project a pack produces a package from. */
export interface PackTarget {
  /** Repository-relative path to the project file. */
  readonly project: string;
  /** The package id it produces, as the project declares it or its file name says. */
  readonly packageId: string;
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
    return ecosystem.rootFiles(root);
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
  const pins = new Map<string, string>();
  const text = readFileSync(path, "utf8");
  for (const match of text.matchAll(/<PackageVersion\s+Include="([^"]+)"\s+Version="([^"]+)"/g)) {
    pins.set(match[1] as string, match[2] as string);
  }
  return pins;
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

  writeIfAbsent(
    root,
    `modules/${entry.slug}/contract/README.md`,
    [
      `# ${packageId} — what it promises`,
      "",
      `The notes page of ${entry.slug}'s contract: everything a signature cannot carry. A`,
      `consumer reads this and \`${packageId}.api.md\` beside it, never the implementation.`,
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
    ].join("\n"),
    result,
  );
  return result;
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

function mavenRefusal(what: string): EcosystemError {
  return new EcosystemError(
    `Maven's ${what} is session 108's; the ecosystem seam refuses rather than guesses`,
  );
}

const MAVEN: Ecosystem = {
  key: "maven",
  contractProjectNames(): ContractProjectNames {
    // Not guessed here either: session 108 lays the api and contract-test
    // modules out the way Maven projects are, and names them then.
    throw mavenRefusal("contract project names");
  },
  rootFiles(): ScaffoldResult {
    throw mavenRefusal("root build files");
  },
  packableProjects(): PackTarget[] {
    throw mavenRefusal("packable projects");
  },
  packArgv(): string[] {
    throw mavenRefusal("pack command");
  },
  readSurface(): SurfaceEntry[] {
    throw mavenRefusal("surface reader");
  },
  scaffoldContract(): ScaffoldResult {
    throw mavenRefusal("contract scaffold");
  },
  projectFiles(): string[] {
    throw mavenRefusal("project listing");
  },
  convenienceFile(): string {
    throw mavenRefusal("convenience file (a reactor over the module's poms)");
  },
};
