// What a repository says it is, and the `dabbler.yaml` that says so back.
//
// This is a reading, not a guess, and two limits keep it one -- both
// deliberate silences:
//
// - **A build file is not a test command.** Where the ecosystem's runner is a
//   script somebody had to write, the script must be there: `package.json`
//   with no `scripts.test` declares nothing, and `pyproject.toml` with no
//   pytest section declares nothing about pytest. Where the runner is the
//   toolchain's own lifecycle (`mvn test`, `dotnet test`), the build file is
//   the declaration.
// - **A build file below the root is named, never entered.** A suite declares
//   a command and no working directory, so a POM or solution under `src/` is
//   named on the command line (`mvn -q -f src/pom.xml test`, `dotnet test
//   src/Thing.sln`) -- the one form that runs from the root. The root and two
//   levels below it are read; deeper layouts declare their own suites.
//
// A .NET Framework project -- a `.csproj` whose root element carries no `Sdk`
// -- is not something `dotnet test` can build. It builds the way Visual
// Studio builds it, so it declares MSBuild and vstest by placeholder, and
// the framework finds both on the machine when it runs them.

import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";

import { PLACEHOLDER_MSBUILD, PLACEHOLDER_VSTEST } from "../checks.ts";
import { PROJECT_CONFIG_FILENAME, type Posture } from "../config.ts";
import { runGit } from "../journal.ts";
import { readText } from "../textfile.ts";
import {
  PROJECT_CONFIG_HEADER,
  PROJECT_CONFIG_NO_SUITES,
  PROJECT_CONFIG_PACKAGING,
  PROJECT_CONFIG_SELECTION,
  PROJECT_CONFIG_TESTING_HEADER,
} from "./templates.ts";

/**
 * One buildable ecosystem, and the suite declaration it implies.
 *
 * `testName` and `select` are the ecosystem's own way to run the tests named
 * after a source file: .NET filters by class name (`dotnet test --filter
 * "A|B"`), Maven by test class (`-Dtest=A,B`). `runsWhole` is true for a
 * runner that takes a filter rather than a list of test files and declares
 * no `select`: the framework runs that suite complete rather than invent a
 * narrowing syntax it cannot know.
 */
export interface Ecosystem {
  readonly key: string;
  readonly command: string;
  readonly runsWhole: boolean;
  readonly testRoots: readonly string[];
  readonly testGlob: string | readonly string[];
  readonly testName?: string | readonly string[];
  readonly select?: string;
  readonly selectSeparator?: string;
  /** A line said above the suite, where its command needs a reason. */
  readonly comment?: string;
}

function exists(root: string, ...names: readonly string[]): boolean {
  return names.some((name) => existsSync(join(root, name)));
}

/** What a build or a package manager writes, and the router's own state: never a project. */
const NOT_WALKED: ReadonlySet<string> = new Set(["bin", "obj", "target", "node_modules", ".git", ".dabbler"]);

/**
 * The files at the root and up to two levels below it, repository-relative
 * with `/`: shallowest first, sorted within a level, so the first match is
 * the build file a person would call the repository's own.
 */
function filesNear(root: string, depth = 2): string[] {
  const found: string[] = [];
  let level = [""];
  for (let at = 0; at <= depth && level.length > 0; at += 1) {
    const here: string[] = [];
    const below: string[] = [];
    for (const dir of level) {
      let entries: { name: string; isDirectory: () => boolean }[];
      try {
        entries = readdirSync(join(root, dir), { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        const rel = dir === "" ? entry.name : `${dir}/${entry.name}`;
        if (!entry.isDirectory()) here.push(rel);
        else if (!NOT_WALKED.has(entry.name)) below.push(rel);
      }
    }
    found.push(...here.sort());
    level = below.sort();
  }
  return found;
}

/** Whether the path names a file at the root rather than below it. */
function atRoot(rel: string): boolean {
  return !rel.includes("/");
}

function reads(root: string, name: string): string {
  try {
    return readText(join(root, name));
  } catch {
    return "";
  }
}

/**
 * The repository's committed entry point when it has one.
 *
 * A wrapper is checked in precisely so the build runs without the tool being
 * installed globally, and `gradle test` on a machine that has only `gradlew`
 * fails for a reason the repository already solved. The relative form
 * resolves in both shells this framework runs in.
 */
function wrapped(
  root: string,
  wrapper: string,
  command: string,
  fallback: string,
): string {
  return exists(root, wrapper) ? command : fallback;
}

/**
 * pytest, and only where something says pytest.
 *
 * `pyproject.toml` declares that this is a Python project; it says nothing
 * about how the tests run, and plenty of them use `unittest` or `nox`. A
 * pytest configuration section is the declaration.
 */
function detectPython(root: string): Ecosystem | null {
  const declared =
    exists(root, "pytest.ini") ||
    reads(root, "pyproject.toml").includes("[tool.pytest") ||
    reads(root, "setup.cfg").includes("[tool:pytest]") ||
    reads(root, "tox.ini").includes("[pytest]");
  if (!declared) return null;
  return {
    key: "python",
    command: "python -m pytest",
    runsWhole: false,
    testRoots: ["tests"],
    testGlob: "test_*.py",
  };
}

/**
 * Maven's `test` phase is declared by the POM being a POM: it is a lifecycle
 * phase, not a script someone had to write.
 */
function detectMaven(root: string): Ecosystem | null {
  const pom = filesNear(root).find((rel) => basename(rel) === "pom.xml");
  if (pom === undefined) return null;
  const named = atRoot(pom) ? "" : ` -f ${pom}`;
  const command = wrapped(root, "mvnw", `./mvnw -q${named} test`, `mvn -q${named} test`);
  // The whole repository is the test root: a reactor keeps each module's
  // tests under that module's own `src/test/java`, and `-Dtest` runs across
  // the reactor, where a module holding none of the named classes is not a
  // failure.
  return {
    key: "maven",
    command,
    runsWhole: false,
    testRoots: ["."],
    testGlob: JAVA_TEST_GLOBS,
    testName: ["{name}Test.java", "{name}Tests.java"],
    select: `${command} -Dtest={names} -Dsurefire.failIfNoSpecifiedTests=false`,
  };
}

function detectGradle(root: string): Ecosystem | null {
  if (!exists(root, "build.gradle", "build.gradle.kts")) return null;
  return {
    key: "gradle",
    command: wrapped(root, "gradlew", "./gradlew test", "gradle test"),
    runsWhole: true,
    testRoots: ["src/test/java"],
    testGlob: JAVA_TEST_GLOBS,
  };
}

/**
 * Both spellings, in both languages: Surefire's own default includes
 * `*Test.java` and `*Tests.java`, Spring Boot's generated test is
 * `ApplicationTests.java`, and .NET test classes are as often `FooTest` as
 * `FooTests`. A repository is read as it is named.
 */
const JAVA_TEST_GLOBS: readonly string[] = ["*Test.java", "*Tests.java"];

/**
 * `dotnet test` is the SDK's own test entry point, and it resolves the
 * solution or project in the directory it runs in. A solution's test
 * projects sit wherever it puts them -- `X.Tests/` beside `X/` as often as
 * under `tests/` -- so its test root is the solution's own.
 *
 * A solution or project at the root is resolved by `dotnet test` itself;
 * one only below it is named. A repository holding a .NET Framework project
 * declares nothing here: see `frameworkProjects`.
 */
function detectDotnet(root: string): Ecosystem | null {
  const near = filesNear(root);
  if (frameworkProjects(root, near).length > 0) return null;
  const rootLevel = near.some((rel) => atRoot(rel) && /\.(slnx?|csproj|fsproj)$/i.test(rel));
  const solution = rootLevel ? undefined : near.find((rel) => /\.slnx?$/i.test(rel));
  if (!rootLevel && solution === undefined) return null;
  const command = solution === undefined ? "dotnet test" : `dotnet test ${solution}`;
  return {
    key: "dotnet",
    command,
    runsWhole: false,
    testRoots: ["."],
    testGlob: ["*Test.cs", "*Tests.cs"],
    testName: ["{name}Test.cs", "{name}Tests.cs"],
    select: `${command} --filter {names}`,
    selectSeparator: "|",
  };
}

/**
 * Whether a project file is an SDK-style project: an `Sdk` attribute on its
 * root element, or the rarer `<Sdk Name=...>` element or `<Import ... Sdk=...>`.
 */
function isSdkProject(text: string): boolean {
  const root = /<Project\b([^>]*)>/.exec(text);
  if (root !== null && /\bSdk\s*=/.test(root[1] ?? "")) return true;
  return /<Sdk\s+Name\s*=/.test(text) || /<Import\b[^>]*\bSdk\s*=/.test(text);
}

/**
 * The `.csproj` files at the root and two levels below that are .NET
 * Framework projects -- no `Sdk` on the root element -- repository-relative.
 *
 * `dotnet test` cannot build one, so a repository holding any is the
 * `dotnet-framework` ecosystem, built the way Visual Studio builds it: see
 * `frameworkCompile` and `detectDotnetFramework`.
 */
export function frameworkProjects(root: string, near: readonly string[] = filesNear(root)): string[] {
  return near.filter((rel) => /\.csproj$/i.test(rel) && !isSdkProject(reads(root, rel)));
}

/** The `TargetFrameworkVersion`s the .NET Framework projects declare (`v4.8.1`), each once, sorted. */
export function frameworkVersions(root: string): string[] {
  const versions = frameworkProjects(root).flatMap((rel) => {
    const found = /<TargetFrameworkVersion>\s*(v[\d.]+)\s*<\/TargetFrameworkVersion>/.exec(reads(root, rel));
    return found === null ? [] : [found[1] as string];
  });
  return [...new Set(versions)].sort();
}

/** A repository-relative path as Windows writes it, quoted: these commands run on Windows alone. */
function windowsPath(rel: string): string {
  return `"${rel.split("/").join("\\")}"`;
}

/** What a .NET Framework build is pointed at: the first solution near the root, else the first project. */
function frameworkTarget(root: string, near: readonly string[]): string | null {
  return near.find((rel) => /\.sln$/i.test(rel)) ?? frameworkProjects(root, near)[0] ?? null;
}

/**
 * The compile control for a repository holding .NET Framework projects, or
 * null where it holds none: MSBuild from the Visual Studio installation
 * `vswhere` names, restoring `packages.config` in its own evaluation first
 * (`/restore`), so the build sees the targets the packages bring.
 */
export function frameworkCompile(root: string): string | null {
  const target = frameworkTarget(root, filesNear(root));
  if (target === null || frameworkProjects(root).length === 0) return null;
  return (
    `${PLACEHOLDER_MSBUILD} ${windowsPath(target)} /restore /t:Build /p:RestorePackagesConfig=true ` +
    "/p:Configuration=Debug /v:minimal /nologo"
  );
}

/** A non-SDK project's text with its `packages.config` beside it: where its packages are named. */
function projectAndPackages(root: string, rel: string): string {
  const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/") + 1) : "";
  return reads(root, rel) + reads(root, `${dir}packages.config`);
}

const TEST_PACKAGE = /\b(?:id|Include)="(?:xunit|nunit|mstest\.|Microsoft\.VisualStudio\.QualityTools\.UnitTestFramework|fixie)/i;
/**
 * What lets vstest discover a project's tests: an adapter package the project
 * restores. A framework alone -- MSTest v1's included, whose built-in adapter
 * not every vstest installation carries -- is a project vstest runs and finds
 * nothing in.
 */
const VSTEST_ADAPTER =
  /\b(?:id|Include)="(?:xunit\.runner\.visualstudio|NUnit3TestAdapter|NUnitTestAdapter|MSTest\.TestAdapter)[",]/i;
const FIXIE_PACKAGE = /\b(?:id|Include)="Fixie[",]/i;

/**
 * The assembly a test project builds, repository-relative: its Debug
 * `OutputPath` and `AssemblyName`, with MSBuild's own defaults where the
 * project states neither -- `bin\Debug\` and the project file's stem.
 */
function testAssembly(root: string, rel: string): string {
  const text = reads(root, rel);
  const groups = [...text.matchAll(/<PropertyGroup\b([^>]*)>([\s\S]*?)<\/PropertyGroup>/g)];
  const outputOf = (body: string): string | undefined => /<OutputPath>\s*([^<]*?)\s*<\/OutputPath>/.exec(body)?.[1];
  const output =
    groups.map(([, attrs, body]) => (/Debug/.test(attrs ?? "") ? outputOf(body ?? "") : undefined)).find(Boolean) ??
    groups.map(([, attrs, body]) => (/Condition/.test(attrs ?? "") ? undefined : outputOf(body ?? ""))).find(Boolean) ??
    "bin\\Debug\\";
  const name = /<AssemblyName>\s*([^<]*?)\s*<\/AssemblyName>/.exec(text)?.[1] ?? basename(rel).replace(/\.csproj$/i, "");
  const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/") + 1) : "";
  const folder = output.split("\\").join("/").replace(/\/?$/, "/");
  return `${dir}${folder}${name}.dll`;
}

/**
 * The Fixie version a project restores into the solution's `packages\`
 * folder, from its packages.config or its HintPath; null where neither says.
 * A `<PackageReference>` restores into the per-user NuGet folder instead,
 * which no committed command can name.
 */
function fixieVersion(text: string): string | null {
  return (
    /<package\b[^>]*\bid="Fixie"[^>]*\bversion="([^"]+)"/i.exec(text)?.[1] ??
    /<package\b[^>]*\bversion="([^"]+)"[^>]*\bid="Fixie"/i.exec(text)?.[1] ??
    /packages[\\/]Fixie\.(\d[\w.-]*)[\\/]/i.exec(text)?.[1] ??
    null
  );
}

/**
 * The suite of a repository's .NET Framework test projects: vstest over
 * their assemblies, narrowed by `/TestCaseFilter` -- the separator repeats
 * the property, so two classes read `FullyQualifiedName~A|FullyQualifiedName~B`
 * -- or, where a project runs under Fixie, whose 1.x releases vstest cannot
 * drive, Fixie's own console from the restored packages, run whole.
 */
function detectDotnetFramework(root: string): Ecosystem | null {
  const near = filesNear(root);
  const tests = frameworkProjects(root, near).filter((rel) => TEST_PACKAGE.test(projectAndPackages(root, rel)));
  if (tests.length === 0) return null;
  const shared = {
    key: "dotnet-framework",
    testRoots: ["."],
    testGlob: ["*Test.cs", "*Tests.cs"],
    testName: ["{name}Test.cs", "{name}Tests.cs"],
  };
  const fixie: { rel: string; version: string }[] = [];
  const vstest: string[] = [];
  const unrun: string[] = [];
  for (const rel of tests) {
    const text = projectAndPackages(root, rel);
    const version = FIXIE_PACKAGE.test(text) ? fixieVersion(text) : null;
    if (version !== null) fixie.push({ rel, version });
    else if (!FIXIE_PACKAGE.test(text) && VSTEST_ADAPTER.test(text)) vstest.push(rel);
    else unrun.push(rel);
  }
  const unrunNote =
    unrun.length > 0
      ? `${unrun.join(", ")} carry no vstest adapter and no Fixie console in packages\\, so no suite runs them`
      : "";
  if (fixie.length > 0) {
    const target = frameworkTarget(root, near) ?? "";
    const packages = `${target.includes("/") ? target.slice(0, target.lastIndexOf("/") + 1) : ""}packages`;
    const runner = `${packages}/Fixie.${(fixie[0] as { version: string }).version}/lib/net45/Fixie.Console.exe`;
    return {
      ...shared,
      command: [runner, ...fixie.map((one) => testAssembly(root, one.rel))].map(windowsPath).join(" "),
      runsWhole: true,
      comment: [
        "Fixie 1 runs under its own console, which vstest cannot drive, so this suite runs whole",
        vstest.length > 0 ? `${vstest.join(", ")} run under vstest and need a suite of their own` : "",
        unrunNote,
      ]
        .filter(Boolean)
        .join("; "),
    };
  }
  if (vstest.length === 0) return null;
  const command = [PLACEHOLDER_VSTEST, ...vstest.map((rel) => windowsPath(testAssembly(root, rel)))].join(" ");
  return {
    ...shared,
    command: `${command} "/logger:console;verbosity=minimal"`,
    runsWhole: false,
    select: `${command} "/logger:console;verbosity=minimal" /TestCaseFilter:FullyQualifiedName~{names}`,
    selectSeparator: "|FullyQualifiedName~",
    ...(unrunNote ? { comment: unrunNote } : {}),
  };
}

/**
 * Whether `scripts.test` is a script that exists in order to fail.
 *
 * `npm init` writes `echo "Error: no test specified" && exit 1`, and a
 * repository that has not replaced it has said the opposite of "my tests run
 * this way". Declaring a suite around it produces a standing red that blocks
 * the lifecycle until someone edits generated configuration -- the failure
 * this detector was narrowed to avoid.
 */
export function isPlaceholderTestScript(script: string): boolean {
  const lowered = script.toLowerCase().split(/\s+/).filter(Boolean).join(" ");
  return (
    lowered.includes("no test specified") ||
    lowered === "exit 1" ||
    lowered === "false"
  );
}

/**
 * `npm test` runs whatever `scripts.test` says, so the script is the
 * declaration, and both its absence and its placeholder are the repository
 * saying nothing.
 */
function detectNode(root: string): Ecosystem | null {
  let manifest: unknown;
  try {
    manifest = JSON.parse(reads(root, "package.json") || "{}");
  } catch {
    return null;
  }
  if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) {
    return null;
  }
  // `scripts` is whatever the file says it is. A manifest that parses is not
  // a manifest that conforms, and a shape error here must leave node
  // undetected rather than end the whole bootstrap.
  const scripts = (manifest as Record<string, unknown>)["scripts"];
  if (scripts === null || typeof scripts !== "object" || Array.isArray(scripts)) {
    return null;
  }
  const script = (scripts as Record<string, unknown>)["test"];
  if (typeof script !== "string" || script.trim() === "") return null;
  if (isPlaceholderTestScript(script)) return null;
  return {
    key: "node",
    command: "npm test",
    runsWhole: true,
    testRoots: ["test", "tests"],
    testGlob: "*.test.ts",
  };
}

/**
 * One detector per ecosystem, in the order suites are declared. A repository
 * that is Java and .NET at once matches twice and gets two suites, which is
 * the case `testing.suites` was made plural for.
 */
export const DETECTORS: readonly ((root: string) => Ecosystem | null)[] = [
  detectPython,
  detectMaven,
  detectGradle,
  detectDotnet,
  detectDotnetFramework,
  detectNode,
];

/**
 * Which ecosystems this repository declares itself to be, and how it says its
 * tests run.
 */
export function detectEcosystems(projectDir: string): Ecosystem[] {
  const found: Ecosystem[] = [];
  for (const detect of DETECTORS) {
    const eco = detect(projectDir);
    if (eco) found.push(eco);
  }
  return found;
}

/** The solution and build files the .NET, Maven and Gradle detectors read. */
const BUILD_FILE = /^(.+\.(sln|slnx|csproj|fsproj)|pom\.xml|build\.gradle(\.kts)?)$/;

/** A file that is code: what a repository already holding some is maintained in. */
const SOURCE_FILE =
  /\.(cs|vb|fs|java|kt|kts|scala|groovy|ts|tsx|js|jsx|mjs|cjs|py|go|rs|rb|php|cshtml|vbhtml|razor|aspx|ascx|asax|ashx|master|jsp|jspx|sql)$/i;

/** The posture set-up chose for a repository, and the sentence that says why. */
export interface PostureReading {
  readonly posture: Posture;
  readonly reason: string;
}

/**
 * The posture of a repository at set-up, read from what git tracks there:
 * `maintenance` where it already holds a source or build file, `greenfield`
 * where it holds none. Tracked rather than present, because what a person
 * has committed is what they are maintaining, and a folder of scratch files
 * is not a codebase.
 */
export function readPosture(projectDir: string): PostureReading {
  let listed: { code: number; stdout: string };
  try {
    listed = runGit(projectDir, ["ls-files", "-z"]);
  } catch {
    listed = { code: -1, stdout: "" };
  }
  if (listed.code !== 0) {
    // Unread is not maintenance: what every repository was before the
    // member existed, and one word to change.
    return { posture: "greenfield", reason: "git could not list this repository's tracked files when bootstrap ran" };
  }
  const tracked = listed.stdout.split("\0").filter((path) => path !== "");
  const code = tracked.filter((path) => BUILD_FILE.test(basename(path)) || SOURCE_FILE.test(path));
  if (code.length === 0) {
    return {
      posture: "greenfield",
      reason: "no tracked source or build file when bootstrap ran: the framework lays out new projects",
    };
  }
  const example = code.find((path) => BUILD_FILE.test(basename(path))) ?? (code[0] as string);
  return {
    posture: "maintenance",
    reason:
      `${code.length} tracked source or build file(s) when bootstrap ran (${example}): ` +
      "the framework fits itself to them and writes no root build files",
  };
}

/** The `posture:` line, with its reason beside it. */
function postureLine(reading: PostureReading): string {
  const other = reading.posture === "maintenance" ? "greenfield" : "maintenance";
  return `posture: ${reading.posture}  # ${reading.reason}. Changing this word to ${other} changes it.\n`;
}

/**
 * The solution and build files already at the repository root and up to two
 * levels below it, repository-relative: the code a planning session is to
 * read and fit, rather than re-create.
 */
export function existingBuildFiles(projectDir: string): string[] {
  return filesNear(projectDir).filter((rel) => BUILD_FILE.test(basename(rel)));
}

/** One quoted YAML scalar, or a flow list of them. */
function quoted(value: string | readonly string[]): string {
  return typeof value === "string" ? `"${value}"` : `[${value.map((one) => `"${one}"`).join(", ")}]`;
}

/**
 * A command as a YAML scalar: single-quoted where a plain one would be read
 * as something else -- `{msbuild} ...` is a flow mapping, and a quoted Windows
 * path is a double-quoted scalar with escapes in it.
 */
function commandScalar(command: string): string {
  return /^[{['"&*!|>%@`]|["#]|: /.test(command) ? `'${command.split("'").join("''")}'` : command;
}

function suiteBlock(eco: Ecosystem): string {
  const lines = [
    ...(eco.comment ? [`    # ${eco.comment}.`] : []),
    `    - name: ${eco.key}`,
    `      command: ${commandScalar(eco.command)}`,
    "      expensive: true",
    "      covers:",
    '        - "."',
  ];
  if (eco.runsWhole) lines.push("      runs_whole: true");
  lines.push("      test_roots:");
  // Quoted: the loader reads YAML 1.1, where a bare `.` -- Maven's test root -- is null.
  for (const root of eco.testRoots) lines.push(`        - "${root}"`);
  lines.push(`      test_glob: ${quoted(eco.testGlob)}`);
  if (eco.testName) lines.push(`      test_name: ${quoted(eco.testName)}`);
  if (eco.select) lines.push(`      select: ${commandScalar(eco.select)}`);
  if (eco.selectSeparator) lines.push(`      select_separator: "${eco.selectSeparator}"`);
  return lines.join("\n");
}

/** What answering the suite decision did to `dabbler.yaml`. */
export interface SuitesWritten {
  /** The file, repository-absolute. */
  readonly path: string;
  /** It did not exist and this call wrote it whole. */
  readonly created: boolean;
  /** The suites this call added, by name. */
  readonly added: readonly string[];
  /** The suites the file already declared, by name; not written twice. */
  readonly alreadyDeclared: readonly string[];
}

/** Whether the config text already declares a suite of this name. */
function declaresSuiteNamed(text: string, name: string): boolean {
  return new RegExp(`^\\s*-\\s*name:\\s*["']?${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']?\\s*$`, "m").test(text);
}

/**
 * Insert a `testing.suites` block into `dabbler.yaml`, whatever state the
 * file is in.
 *
 * The narrow half of scaffolding: `scaffoldProjectConfig` writes a whole file
 * and refuses an existing one, which is right at setup and useless later --
 * a repository that grew code after setup has a config file and no suite, and
 * that is the case the written block has to cover.
 *
 * Two states the Java walk met, and both are answered here rather than
 * refused. A repository with NO `dabbler.yaml` gets one written: the
 * recommended answer to the suite decision could otherwise not be taken at
 * all in a fresh project, which is where it is asked. And a file that
 * already declares a suite of that name is left as it is and said so: the
 * same answer given twice appended a second, identical `maven` suite.
 *
 * Returns null only when there is genuinely nothing to do -- no ecosystem
 * to declare -- or when the file could not be read or written.
 */
export function appendSuitesToProjectConfig(
  projectDir: string,
  ecosystems: readonly Ecosystem[],
): SuitesWritten | null {
  if (ecosystems.length === 0) return null;
  const path = join(projectDir, PROJECT_CONFIG_FILENAME);
  if (!existsSync(path)) {
    // No file at all: the whole scaffold, with these suites in it. The
    // decision is asked in a fresh project more often than anywhere else.
    try {
      writeFileSync(path, renderProjectConfig(ecosystems), "utf8");
    } catch {
      return null;
    }
    return { path, created: true, added: ecosystems.map((eco) => eco.key), alreadyDeclared: [] };
  }
  let existing: string;
  try {
    existing = readText(path);
  } catch {
    return null;
  }
  const alreadyDeclared = ecosystems.filter((eco) => declaresSuiteNamed(existing, eco.key));
  const missing = ecosystems.filter((eco) => !declaresSuiteNamed(existing, eco.key));
  if (missing.length === 0) {
    return {
      path,
      created: false,
      added: [],
      alreadyDeclared: alreadyDeclared.map((eco) => eco.key),
    };
  }
  const written: SuitesWritten = {
    path,
    created: false,
    added: missing.map((eco) => eco.key),
    alreadyDeclared: alreadyDeclared.map((eco) => eco.key),
  };
  const suites = missing.map(suiteBlock).join("\n") + "\n";
  let next: string;
  const suitesKey = existing
    .split(/\r?\n/)
    .findIndex((line) => /^\s+suites:\s*$/.test(line));
  if (suitesKey !== -1) {
    // A list somebody authored, gaining one more entry. Refusing here was the
    // obvious safe-looking choice and it was wrong: a repository whose suites
    // are all cheap raises the blocking question and then has no way through
    // it, so "safe" meant "the operator edits the file by hand forever",
    // which is the thing this record exists to stop.
    //
    // Appended rather than merged. Nothing here reads the existing entries or
    // decides what they mean; the new suite goes after them, and YAML's own
    // list semantics do the rest.
    const lines = existing.split(/\r?\n/);
    // The list's OWN indentation, read from its first item rather than
    // assumed from the key. YAML allows a sequence at the same indent as the
    // key it belongs to (`suites:` then `  - name:` at the key's own column),
    // and treating the key's indent as the boundary would insert the new item
    // before the existing ones at the wrong depth.
    const firstItem = lines.findIndex(
      (line, index) => index > suitesKey && /^\s*- /.test(line),
    );
    if (firstItem === -1) return null;
    const itemIndent = (lines[firstItem].match(/^\s*/) ?? [""])[0].length;
    let end = lines.length;
    for (let index = firstItem + 1; index < lines.length; index += 1) {
      const line = lines[index];
      if (line.trim() === "") continue;
      const width = (line.match(/^\s*/) ?? [""])[0].length;
      if (width < itemIndent) {
        end = index;
        break;
      }
    }
    // `suiteBlock` renders at four spaces; shift it onto the list's column so
    // the file keeps one shape rather than gaining a second.
    const shift = itemIndent - 4;
    const body = suites
      .replace(/\n$/, "")
      .split("\n")
      .map((line) =>
        shift >= 0 ? " ".repeat(shift) + line : line.slice(Math.min(-shift, line.length - line.trimStart().length)),
      )
      .join("\n");
    lines.splice(end, 0, body);
    next = lines.join("\n");
    // The splice can land after the trailing empty field `split` leaves for a
    // file that ended in a newline, which would otherwise emit a file that
    // does not.
    if (!next.endsWith("\n")) next += "\n";
    try {
      writeFileSync(path, next, "utf8");
    } catch {
      return null;
    }
    return written;
  }
  if (/^testing:/m.test(existing)) {
    // The ordinary shape for a repository configured at setup and grown
    // since: `testing:` exists carrying controls or selection, and the one
    // thing missing is the suites. Insert into the mapping rather than
    // appending a second `testing:` key, whose later copy would silently win.
    const lines = existing.split(/\r?\n/);
    const index = lines.findIndex((line) => /^testing:/.test(line));
    lines.splice(index + 1, 0, "  suites:", suites.replace(/\n$/, ""));
    next = lines.join("\n");
  } else {
    const separator = existing.endsWith("\n") ? "" : "\n";
    next =
      existing +
      separator +
      PROJECT_CONFIG_TESTING_HEADER +
      suites +
      PROJECT_CONFIG_SELECTION;
  }
  try {
    writeFileSync(path, next, "utf8");
  } catch {
    return null;
  }
  return written;
}

/**
 * The scaffolded `dabbler.yaml` for a repository of these ecosystems. One
 * suite per ecosystem, in detection order.
 */
export function renderProjectConfig(
  ecosystems: readonly Ecosystem[],
  compile: string | null = null,
  posture: PostureReading | null = null,
): string {
  const out = [PROJECT_CONFIG_HEADER];
  if (posture !== null) out.push(postureLine(posture));
  if (ecosystems.length > 0) {
    out.push(
      PROJECT_CONFIG_TESTING_HEADER +
        ecosystems.map(suiteBlock).join("\n") +
        "\n" +
        PROJECT_CONFIG_SELECTION,
    );
    if (compile !== null) out.push(compileBlock(compile));
  } else {
    out.push(PROJECT_CONFIG_NO_SUITES);
    if (compile !== null) out.push(`\n${FRAMEWORK_NO_TESTS}testing:\n${compileBlock(compile)}`);
  }
  out.push(PROJECT_CONFIG_PACKAGING);
  return out.join("");
}

const FRAMEWORK_NO_TESTS =
  "# dotnet-framework: no test project vstest or Fixie's console can run was\n" +
  "# found -- one needs an xunit, NUnit or MSTest adapter package, or Fixie in\n" +
  "# packages.config -- so no suite is declared, and the compile control\n" +
  "# below proves the build.\n";

/**
 * The compile control of a .NET Framework repository, inside `testing:`.
 * Required: a red build goes back to the author before a reviewer is asked.
 */
function compileBlock(command: string): string {
  return (
    "  # MSBuild from the Visual Studio installation vswhere names on this\n" +
    "  # machine: `{msbuild}` is filled in when the control runs, and the record\n" +
    "  # says which MSBuild it was.\n" +
    "  controls:\n" +
    "    - kind: compile\n" +
    `      command: ${commandScalar(command)}\n` +
    "      required: true\n"
  );
}

/**
 * Write the repository's tracked `dabbler.yaml`; return the path when it was
 * written.
 *
 * Without this file a scaffolded project cannot reach step 4 of the lifecycle
 * it was just handed: `test_evidence` refuses a suite the repository never
 * declared, and there is nowhere tracked to declare one. An existing file is
 * never touched -- it is the repository's own statement about itself, and
 * later runs of bootstrap refresh instructions, not declarations.
 */
export function scaffoldProjectConfig(
  projectDir: string,
  posture?: PostureReading,
): string | null {
  const path = join(projectDir, PROJECT_CONFIG_FILENAME);
  if (existsSync(path)) return null;
  try {
    writeFileSync(
      path,
      renderProjectConfig(
        detectEcosystems(projectDir),
        frameworkCompile(projectDir),
        posture ?? readPosture(projectDir),
      ),
      "utf8",
    );
  } catch {
    return null;
  }
  return path;
}

// --- What a repository publishes ----------------------------------------------

/**
 * The pack and push commands a repository's own build files imply.
 *
 * Detected under the same two silences the suites are, and for the same
 * reason. A `.csproj` carrying package metadata says "this is meant to be a
 * package", which is what makes `dotnet pack` a reading rather than a guess;
 * a `.csproj` that is an application says nothing of the kind, and emitting
 * a pack line for it produces a nupkg nobody wanted. And only the repository
 * root is read: `pack` declares a command and no working directory, so
 * `service/lib.csproj` cannot become a runnable line, and a detected line
 * that fails on first use is worse than an honest absence.
 *
 * `reason` carries what was found when nothing was declared. Silence that
 * explains itself is the difference between a framework the operator trusts
 * and one they work around.
 */
export interface PackagingRecipe {
  readonly key: string;
  readonly pack: readonly string[];
  readonly push: readonly string[];
}

export interface PackagingReading {
  readonly recipe: PackagingRecipe | null;
  readonly reason: string;
}

/** Whether a `.csproj` says it is meant to become a package. */
export function declaresPackage(text: string): boolean {
  return (
    /<PackageId>/.test(text) ||
    /<GeneratePackageOnBuild>\s*true/i.test(text) ||
    /<IsPackable>\s*true/i.test(text) ||
    (/<Version>/.test(text) && /<TargetFramework/.test(text) &&
      !/<OutputType>\s*Exe/i.test(text))
  );
}

/**
 * The packaging this repository implies, or why it implies none.
 *
 * Never inferred from an ecosystem alone: a repository can be a .NET
 * repository and publish nothing, and the great majority are. What is read is
 * the statement the build file itself makes.
 */
export function detectPackaging(projectDir: string): PackagingReading {
  if (exists(projectDir, "pom.xml")) {
    // Maven does not fit the contract, and saying so is the honest answer.
    //
    // Two things are required of every declared recipe here: `pack` takes its
    // output directory from the framework, and the credential arrives as ONE
    // argv element. Maven satisfies neither. `project.build.directory` is set
    // in the POM and is not reliably overridable from the command line, so
    // `{output}` has nowhere to go; and Maven authenticates through a
    // `<server>` entry in `settings.xml` keyed by a repository id, so a
    // credential passed on the command line is read as the name of a server
    // rather than as a password.
    //
    // The plan said a POM implies `mvn -q package` and `deploy`. It does not,
    // and a detected line that fails the first time it runs is worse than an
    // honest absence -- which is the rule this whole detector already
    // follows. Amended on the record rather than implemented differently in
    // silence.
    return {
      recipe: null,
      reason:
        "Maven publishes through its own lifecycle: `distributionManagement` " +
        "in the POM names the repository, and a `<server>` entry in " +
        "settings.xml holds the credential. Neither is something this " +
        "framework can write for you without holding a credential or " +
        "editing a file outside this repository, so `mvn deploy` stays " +
        "yours to run. Everything else in the session -- the gates, the " +
        "evidence, the close -- is unaffected.",
    };
  }

  // A solution file at the root is the shape the SDK itself lays out: the
  // projects live below it, and `dotnet pack <project>` from the root
  // resolves them the way the solution does. The reading covers what the
  // solution fronts, because a pack from here does not fail -- a repository
  // with `X.sln` at the root and the library under `src/` ran exactly that
  // argv through six checks and one publish while this detector said it
  // would fail the first time.
  const atRoot = rootFiles(projectDir);
  const solution = atRoot.some((name) => name.endsWith(".sln") || name.endsWith(".slnx"));
  const rootProjects = atRoot.filter((name) => name.endsWith(".csproj"));
  const projects =
    rootProjects.length > 0 ? rootProjects : solution ? projectsBelow(projectDir) : [];
  if (projects.length === 0) {
    const deeper = hasDeeperProject(projectDir);
    return {
      recipe: null,
      reason: deeper
        ? "the project files are below the repository root, and a pack " +
          "command declares no working directory. A line naming one of them " +
          "would fail the first time it ran, so nothing is declared -- say " +
          "which project publishes and the block can be written."
        : "no .csproj or pom.xml at the repository root, so there is nothing " +
          "here that says what a package would be built from.",
    };
  }
  const packable = projects.filter((name) => declaresPackage(reads(projectDir, name)));
  if (packable.length === 0) {
    return {
      recipe: null,
      reason:
        `${projects.join(", ")} carries no package metadata -- no PackageId, ` +
        "no IsPackable, no GeneratePackageOnBuild. A project that is an " +
        "application is not a package, and packing it produces a nupkg " +
        "nobody wanted.",
    };
  }
  if (packable.length > 1) {
    // Which of them publishes is an external-consequence choice, and
    // filesystem order is not an answer to it.
    return {
      recipe: null,
      reason:
        `${packable.join(" and ")} both declare package metadata, and which ` +
        "of them publishes is not derivable from the files. Picking the " +
        "first would decide by directory order where an artifact carrying " +
        "your name arrives.",
    };
  }
  return {
    recipe: {
      key: "dotnet",
      pack: ["dotnet", "pack", packable[0], "-c", "Release", "-o", "{output}"],
      push: [
        "dotnet",
        "nuget",
        "push",
        "{artifact}",
        "--source",
        "{feed}",
        "--api-key",
        "{secret}",
      ],
    },
    reason: "",
  };
}

/** Names directly inside the repository root. */
function rootFiles(root: string): string[] {
  try {
    return readdirSync(root);
  } catch {
    return [];
  }
}

/**
 * The `.csproj` files below the root, repository-relative with `/`, in the
 * order the walk meets them -- the projects a root solution file fronts.
 * Build output, dependencies and the router's own state are not walked, for
 * the same reason `hasDeeperProject` skips them: a project file under `bin/`
 * is a copy, not a project.
 */
function projectsBelow(root: string, depth = 3): string[] {
  const found: string[] = [];
  const walk = (dir: string, left: number): void => {
    let entries: { name: string; isDirectory: () => boolean }[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (!entry.isDirectory()) {
        if (dir !== root && entry.name.endsWith(".csproj")) {
          found.push(relative(root, path).split("\\").join("/"));
        }
        continue;
      }
      const name = entry.name;
      if (name === "node_modules" || name === ".git" || name === "bin") continue;
      if (name === "obj" || name === "target" || name === ".dabbler") continue;
      if (left > 0) walk(path, left - 1);
    }
  };
  walk(root, depth);
  return found;
}

/** Whether a project file exists somewhere below the root but not at it. */
function hasDeeperProject(root: string, depth = 3): boolean {
  const walk = (dir: string, left: number): boolean => {
    let entries: string[];
    try {
      entries = readdirSync(dir, { withFileTypes: true }).map((entry) =>
        entry.isDirectory() ? `/${entry.name}` : entry.name,
      );
    } catch {
      return false;
    }
    for (const entry of entries) {
      if (!entry.startsWith("/")) {
        if (dir !== root && (entry.endsWith(".csproj") || entry === "pom.xml")) return true;
        continue;
      }
      const name = entry.slice(1);
      if (name === "node_modules" || name === ".git" || name === "bin") continue;
      if (name === "obj" || name === "target" || name === ".dabbler") continue;
      if (left > 0 && walk(join(dir, name), left - 1)) return true;
    }
    return false;
  };
  return walk(root, depth);
}

/**
 * The `packaging:` block for a detected recipe, with the operator's answers.
 *
 * `secret` is a NAME. The credential itself is never written here, never read
 * here, and never placed in an environment: it resolves at spawn into one
 * argv element. A block holding a PAT is a block that reaches a git history.
 */
export function renderPackagingBlock(
  recipe: PackagingRecipe,
  feed: string,
  secret: string,
): string {
  const argv = (values: readonly string[]): string =>
    `[${values.map((value) => JSON.stringify(value)).join(", ")}]`;
  return [
    "",
    "# Step (f) of the lifecycle: pack, then push. Both argv and never shell",
    "# strings, so a credential cannot be re-split by a shell; `secret` names",
    "# the credential and never holds it.",
    "packaging:",
    "  pack:",
    `    argv: ${argv(recipe.pack)}`,
    "  push:",
    `    argv: ${argv(recipe.push)}`,
    // Quoted, both of them. A feed URL carrying ` #` or a credential name
    // somebody pasted with a newline would otherwise rewrite the document
    // around it -- and this is a file the framework writes on the operator's
    // behalf, so it does not get to produce one that parses differently than
    // it reads.
    `    feed: ${JSON.stringify(feed)}`,
    `    secret: ${JSON.stringify(secret)}`,
    "",
  ].join("\n");
}

/**
 * Write a detected `packaging:` block into a `dabbler.yaml` that has none.
 *
 * Returns null when there is nothing to do, or when the file already declares
 * `packaging:` -- a second mapping key would produce a document whose later
 * copy silently wins, and this repository's statement about how it publishes
 * is not something to overwrite.
 */
export function appendPackagingToProjectConfig(
  projectDir: string,
  recipe: PackagingRecipe,
  feed: string,
  secret: string,
): string | null {
  const path = join(projectDir, PROJECT_CONFIG_FILENAME);
  if (!existsSync(path)) return null;
  let existing: string;
  try {
    existing = readText(path);
  } catch {
    return null;
  }
  if (/^packaging:/m.test(existing)) return null;
  const separator = existing.endsWith("\n") ? "" : "\n";
  try {
    writeFileSync(
      path,
      existing + separator + renderPackagingBlock(recipe, feed, secret),
      "utf8",
    );
  } catch {
    return null;
  }
  return path;
}

/** Whether this repository already states how it publishes. */
export function declaresPackaging(projectDir: string): boolean {
  const path = join(projectDir, PROJECT_CONFIG_FILENAME);
  if (!existsSync(path)) return false;
  try {
    return /^packaging:/m.test(readText(path));
  } catch {
    return false;
  }
}
