// The root build files a solution of more than one project needs, for .NET
// and for Maven.
//
// A project reaches a sibling by project reference -- a `<ProjectReference>`
// for .NET, with both projects listed in the solution file; a dependency at
// `${project.version}` for Maven, with both modules listed in the parent
// POM and built in one reactor run. The engine writes the projects and their
// references; what is here is only the root those projects build under.
//
// Which ecosystem, and which projects, come from the project graph -- the
// build files themselves -- and never from a declaration, because a
// declaration that disagreed with the tree would have to be wrong about one
// of them.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import type { ProjectGraph } from "./projectGraph.ts";

export type EcosystemKey = "dotnet" | "maven";

/** What a root-file scaffold left behind: written where absent, skipped where present. */
export interface ScaffoldResult {
  readonly written: readonly string[];
  readonly skipped: readonly string[];
  /**
   * Files that already existed and gained something -- only `.gitignore`,
   * which is a list of rules rather than a document this framework authors.
   * A file created from nothing is `written`; saying "wrote .gitignore" of
   * a file bootstrap wrote and this scaffold appended a line to would be a
   * claim about who owns it.
   */
  readonly changed?: readonly string[];
  /** Anything the scaffold could not place and says so about. */
  readonly notes: readonly string[];
}

/**
 * The root build files a solution of more than one project needs, each
 * written only where absent. Nothing is written for one project, which
 * builds from its own folder, nor where the root already holds a solution
 * file or a parent POM: the build has its root, and a second solution file
 * beside the first makes `dotnet test` refuse to choose between them.
 */
export function ensureRootFiles(root: string, graph: ProjectGraph): ScaffoldResult | null {
  if (graph.projects.length < 2) return null;
  if (graph.ecosystem === "dotnet") {
    return readdirSync(root).some((name) => /\.slnx?$/i.test(name)) ? null : rootFilesDotnet(root, graph);
  }
  if (graph.ecosystem === "maven") {
    return existsSync(join(root, "pom.xml")) ? null : rootFilesMaven(root, graph);
  }
  return null;
}

/** What a build writes inside the projects it builds, by ecosystem, with the line that says why it is ignored. */
const BUILD_OUTPUT: Readonly<Record<string, readonly [readonly string[], string]>> = {
  dotnet: [["bin/", "obj/"], "# MSBuild's own output, which lands inside the project it built."],
  maven: [["target/"], "# Maven's own output, which lands inside the module it built."],
};

/**
 * Ignore what the ecosystem's build writes inside the repository, for a
 * solution of any size and whoever wrote its root build files. A step's own
 * check builds, and output nothing ignores is a check that changed the tree it
 * was measuring. `.gitignore` when it gained a line, else nothing.
 */
export function ignoreBuildOutput(root: string, graph: ProjectGraph): string[] {
  const output = graph.ecosystem === null ? undefined : BUILD_OUTPUT[graph.ecosystem];
  if (output === undefined) return [];
  const result = { written: [] as string[], skipped: [] as string[], changed: [] as string[] };
  ensureIgnoreRules(root, output[0], output[1], result);
  return [...result.written, ...result.changed];
}

function posix(path: string): string {
  return path.split("\\").join("/");
}

/**
 * Ensure each rule is in the repository's `.gitignore`, appending the ones
 * that are missing and leaving everything else exactly as it is.
 *
 * A rule, not a file. Every other root file here is a whole document this
 * framework authors, and `writeIfAbsent` is right for those: a parent POM
 * somebody else wrote is theirs. A `.gitignore` is a list of independent
 * lines with no owner, and `dabbler bootstrap` has already written one by
 * the time a second module is declared -- so write-once meant these rules
 * were never written at all, which is exactly how they were measured
 * missing on the second walk of the Java walkthrough.
 */
function ensureIgnoreRules(
  root: string,
  rules: readonly string[],
  why: string,
  result: { written: string[]; skipped: string[]; changed: string[] },
): void {
  const path = join(root, ".gitignore");
  const existing = existsSync(path) ? readFileSync(path, "utf8") : null;
  // Trailing whitespace and the carriage return are not part of a pattern;
  // LEADING whitespace is, so a line of `  target/` does not ignore
  // `target/` and must not be read as though it did.
  const lines = (existing ?? "").split("\n").map((line) => line.replace(/\s+$/, ""));
  const missing = rules.filter((rule) => !lines.includes(rule));
  if (missing.length === 0) {
    result.skipped.push(".gitignore");
    return;
  }
  const separator = existing === null || existing === "" ? "" : existing.endsWith("\n") ? "\n" : "\n\n";
  writeFileSync(path, `${existing ?? ""}${separator}${why}\n${missing.join("\n")}\n`, "utf8");
  // Created, or somebody else's file that gained a line. The second is the
  // ordinary case -- bootstrap writes `.gitignore` before any module is
  // declared -- and calling it "wrote" would misreport the normal path.
  (existing === null ? result.written : result.changed).push(".gitignore");
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

// --- The .NET root files ----------------------------------------------------------

/** The SDK release that reads `.slnx`; below it the file is not a solution. */
const SLNX_SDK_FLOOR = "9.0.200";

/**
 * The three files a .NET solution of several projects needs at its root,
 * written only where absent, and MSBuild's output ignored.
 *
 * The solution file is here because `dotnet test` resolves the project or
 * solution in the directory it runs in: a solution whose projects all live
 * in folders had nothing at its root, so the suite this scaffold declares
 * answered `MSB1003: Specify a project or solution file`. It lists the
 * projects that exist when it is written, says to add each one created
 * later, and is never rewritten afterwards.
 */
function rootFilesDotnet(root: string, graph: ProjectGraph): ScaffoldResult {
  const result = {
    written: [] as string[],
    skipped: [] as string[],
    changed: [] as string[],
    notes: [] as string[],
  };
  writeIfAbsent(
    root,
    "Directory.Build.props",
    [
      "<Project>",
      "  <PropertyGroup>",
      "    <Nullable>enable</Nullable>",
      "    <ImplicitUsings>enable</ImplicitUsings>",
      "  </PropertyGroup>",
      "</Project>",
      "",
    ].join("\n"),
    result,
  );
  // Present so a solution has the one place root-level targets go.
  writeIfAbsent(root, "Directory.Build.targets", ["<Project>", "</Project>", ""].join("\n"), result);
  // The directory's own name, case and all, which is what `dotnet new sln`
  // does. It is NOT the parent POM's rule: an artifactId is lowercase and
  // hyphenated by Maven convention, and a solution file has no such
  // convention to obey.
  // Resolved first: a root given as `.` has no name of its own to lend.
  const solution = `${basename(resolve(root))}.slnx`;
  const projects = graph.projects.map((project) => project.path).sort();
  // `.slnx`, not `.sln`: it is plain XML a scaffold can write and a person
  // can read and edit, where `.sln` carries a per-project GUID that no
  // generator has any business inventing.
  writeIfAbsent(
    root,
    solution,
    [
      "<Solution>",
      "  <!-- The solution's projects. `dotnet test` resolves the solution in the directory",
      "       it runs in, so this file is what gives the root suite something to run. A project",
      "       reaches a sibling with a <ProjectReference>, and both projects are listed here.",
      "       Add each project you create here. -->",
      ...projects.map((path) => `  <Project Path="${path}" />`),
      "</Solution>",
      "",
    ].join("\n"),
    result,
  );
  if (result.written.includes(solution)) {
    result.notes.push(
      `${solution} is an XML solution file, which the .NET SDK reads from ` +
        `${SLNX_SDK_FLOOR} onward; below that release it is not a solution file at all.`,
    );
  }
  const [rules, why] = BUILD_OUTPUT["dotnet"]!;
  ensureIgnoreRules(root, rules, why, result);
  return result;
}

// --- The Maven root files -----------------------------------------------------------

/** What a POM says of itself, as far as the parent POM needs it. */
interface Pom {
  readonly groupId: string | null;
}

/** A POM's text with its nested blocks removed, so a top-level element reads as the project's own. */
function pomTopLevel(text: string): string {
  return text.replace(/<(parent|dependencies|dependencyManagement|build|profiles|reporting|modules|properties)>[\s\S]*?<\/\1>/g, "");
}

function pomElement(text: string, name: string): string | null {
  const match = new RegExp(`<${name}>\\s*([^<]*?)\\s*</${name}>`).exec(text);
  return match === null ? null : (match[1] as string);
}

function readPom(path: string): Pom | null {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return null;
  }
  const parentBlock = /<parent>([\s\S]*?)<\/parent>/.exec(text);
  const parentGroup = parentBlock === null ? null : pomElement(parentBlock[1] as string, "groupId");
  return { groupId: pomElement(pomTopLevel(text), "groupId") ?? parentGroup };
}

const MAVEN_POM_HEAD = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
  '         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">',
  "  <modelVersion>4.0.0</modelVersion>",
];

/**
 * What the scaffolded root POM targets when no JDK answers: the oldest LTS
 * a team still starts a project on, so the file that is written once errs
 * towards one that compiles rather than one that cannot.
 */
const FALLBACK_JAVA_RELEASE = 17;

/**
 * What `java -version` printed, or null when java could not be run. The
 * version is on stderr, so both streams are handed to the parser.
 *
 * A source rather than a call so a test states the JDK instead of taking
 * whichever one the machine happens to have -- `setGitSource` in journal.ts
 * is the same shape, for the same reason.
 */
export type JavaVersionSource = () => string | null;

function spawnJavaVersion(): string | null {
  const result = spawnSync("java", ["-version"], { encoding: "utf8", windowsHide: true });
  if (result.error !== undefined || result.status !== 0) return null;
  return `${result.stderr ?? ""}${result.stdout ?? ""}`;
}

let javaVersionSource: JavaVersionSource = spawnJavaVersion;

/** Install a java-version source; the returned function restores the real one. */
export function setJavaSource(source: JavaVersionSource): () => void {
  const previous = javaVersionSource;
  javaVersionSource = source;
  return () => {
    javaVersionSource = previous;
  };
}

/**
 * The major release a `java -version` line names: 17 from `openjdk version
 * "17.0.9"`, 8 from `java version "1.8.0_392"` (the 1.x scheme every JDK
 * before 9 printed), null from anything this does not recognise.
 */
export function javaReleaseOf(output: string | null): number | null {
  const match = /version\s+"(\d+)(?:\.(\d+))?/.exec(output ?? "");
  if (match === null) return null;
  const major = Number(match[1]);
  if (major === 1) return match[2] === undefined ? null : Number(match[2]);
  return Number.isInteger(major) && major > 1 ? major : null;
}

/**
 * The root files a Maven solution of several modules needs, written only
 * where absent: the parent POM -- its properties, the compiler release, and
 * the modules it builds in one reactor run -- and Maven's output ignored.
 */
function rootFilesMaven(root: string, graph: ProjectGraph): ScaffoldResult {
  const result = {
    written: [] as string[],
    skipped: [] as string[],
    changed: [] as string[],
    notes: [] as string[],
  };
  const moduleDirs: string[] = [];
  let groupId: string | null = null;
  for (const project of graph.projects) {
    const pom = readPom(join(root, project.path));
    if (pom === null) continue;
    moduleDirs.push(posix(dirname(project.path)));
    groupId ??= pom.groupId;
  }
  const parentArtifact = `${basename(resolve(root)).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "solution"}-parent`;
  // The release the JDK doing the scaffolding can actually compile to. A
  // constant here targeted a version half the machines that run this do not
  // have, and every build then failed on a line the developer had to find
  // and edit before anything worked.
  const detected = javaReleaseOf(javaVersionSource());
  const release = detected ?? FALLBACK_JAVA_RELEASE;
  const releaseComment =
    detected === null
      ? [
          "    <!-- No JDK answered `java -version` where this was scaffolded, so this is the",
          `         stated default. Change it to the release your team builds against. -->`,
        ]
      : [
          "    <!-- The JDK that scaffolded this solution (`java -version`). Written once and",
          "         never rewritten: raise it when your team's JDK does. -->",
        ];
  writeIfAbsent(
    root,
    "pom.xml",
    [
      ...MAVEN_POM_HEAD,
      `  <groupId>${groupId ?? "com.example"}</groupId>`,
      `  <artifactId>${parentArtifact}</artifactId>`,
      "  <version>0.1.0-SNAPSHOT</version>",
      "  <packaging>pom</packaging>",
      "",
      "  <properties>",
      "    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>",
      ...releaseComment,
      `    <maven.compiler.release>${release}</maven.compiler.release>`,
      "  </properties>",
      "",
      "  <!-- The reactor: every module below is built in one run from here. A module reaches",
      "       a sibling with a <dependency> on it at ${project.version}. Add a module here when",
      "       it gets its POM. -->",
      "  <modules>",
      ...moduleDirs.map((dir) => `    <module>${dir}</module>`),
      "  </modules>",
      "</project>",
      "",
    ].join("\n"),
    result,
  );
  const [rules, why] = BUILD_OUTPUT["maven"]!;
  ensureIgnoreRules(root, rules, why, result);
  // Only when the parent POM is this scaffold's: an existing one carries
  // whatever release its team chose, and saying anything about it here
  // would be a claim about a file nothing wrote.
  if (result.written.includes("pom.xml")) {
    result.notes.push(
      detected === null
        ? `pom.xml targets Java ${release}, the stated default: no JDK answered \`java -version\` here. ` +
            "Change it to the release your team builds against."
        : `pom.xml targets Java ${release}, the JDK that scaffolded it. It is written once and never ` +
            "rewritten, so raise it when your team's JDK does.",
    );
  }
  return result;
}
