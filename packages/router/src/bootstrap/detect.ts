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
// - **Only the repository root is read.** A suite declares a command and no
//   working directory, so `service/pom.xml` cannot become a runnable line --
//   `mvn -q test` at the root would simply fail. A multi-project repository
//   declares its own suites; a scaffold that guessed at the layout would hand
//   it a red suite instead.

import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { PROJECT_CONFIG_FILENAME } from "../config.ts";
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
 * `runsWhole` is true for every runner that takes a filter rather than a list
 * of test files. The framework then runs that suite complete instead of
 * inventing a narrowing syntax it cannot know -- `mvn -q test <file>` reads
 * the path as a lifecycle argument, and `dotnet test` wants a project.
 */
export interface Ecosystem {
  readonly key: string;
  readonly command: string;
  readonly runsWhole: boolean;
  readonly testRoots: readonly string[];
  readonly testGlob: string;
}

function exists(root: string, ...names: readonly string[]): boolean {
  return names.some((name) => existsSync(join(root, name)));
}

/** `Path.glob(pattern)` over the root only; the patterns here are `*.ext`. */
function globHit(root: string, pattern: string): boolean {
  const suffix = pattern.slice(1);
  try {
    return readdirSync(root).some((entry) => entry.endsWith(suffix));
  } catch {
    return false;
  }
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
  if (!exists(root, "pom.xml")) return null;
  return {
    key: "maven",
    command: wrapped(root, "mvnw", "./mvnw -q test", "mvn -q test"),
    runsWhole: true,
    testRoots: ["src/test/java"],
    testGlob: "*Test.java",
  };
}

function detectGradle(root: string): Ecosystem | null {
  if (!exists(root, "build.gradle", "build.gradle.kts")) return null;
  return {
    key: "gradle",
    command: wrapped(root, "gradlew", "./gradlew test", "gradle test"),
    runsWhole: true,
    testRoots: ["src/test/java"],
    testGlob: "*Test.java",
  };
}

/**
 * `dotnet test` is the SDK's own test entry point, and it resolves the
 * solution or project in the directory it runs in.
 */
function detectDotnet(root: string): Ecosystem | null {
  const patterns = ["*.sln", "*.slnx", "*.csproj", "*.fsproj"];
  if (!patterns.some((pattern) => globHit(root, pattern))) return null;
  return {
    key: "dotnet",
    command: "dotnet test",
    runsWhole: true,
    testRoots: ["tests"],
    testGlob: "*Tests.cs",
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

function suiteBlock(eco: Ecosystem): string {
  const lines = [
    `    - name: ${eco.key}`,
    `      command: ${eco.command}`,
    "      expensive: true",
    "      covers:",
    '        - "."',
  ];
  if (eco.runsWhole) lines.push("      runs_whole: true");
  lines.push("      test_roots:");
  for (const root of eco.testRoots) lines.push(`        - ${root}`);
  lines.push(`      test_glob: "${eco.testGlob}"`);
  return lines.join("\n");
}

/**
 * Insert a `testing.suites` block into a `dabbler.yaml` that has none.
 *
 * The narrow half of scaffolding: `scaffoldProjectConfig` writes a whole file
 * and refuses an existing one, which is right at setup and useless later --
 * a repository that grew code after setup has a config file and no suite, and
 * that is the case an answered owed decision has to be able to act on.
 *
 * Returns null when there is nothing to do or the file already declares
 * `testing:` -- appending a second mapping key would produce a document whose
 * later key silently wins, which is a worse outcome than declining.
 */
export function appendSuitesToProjectConfig(
  projectDir: string,
  ecosystems: readonly Ecosystem[],
): string | null {
  if (ecosystems.length === 0) return null;
  const path = join(projectDir, PROJECT_CONFIG_FILENAME);
  if (!existsSync(path)) return null;
  let existing: string;
  try {
    existing = readText(path);
  } catch {
    return null;
  }
  const suites = ecosystems.map(suiteBlock).join("\n") + "\n";
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
    const indent = (lines[suitesKey].match(/^\s*/) ?? [""])[0].length;
    let end = lines.length;
    for (let index = suitesKey + 1; index < lines.length; index += 1) {
      const line = lines[index];
      if (line.trim() === "") continue;
      const width = (line.match(/^\s*/) ?? [""])[0].length;
      if (width <= indent) {
        end = index;
        break;
      }
    }
    lines.splice(end, 0, suites.replace(/\n$/, ""));
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
    return path;
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
  return path;
}

/**
 * The scaffolded `dabbler.yaml` for a repository of these ecosystems. One
 * suite per ecosystem, in detection order.
 */
export function renderProjectConfig(
  ecosystems: readonly Ecosystem[],
): string {
  const out = [PROJECT_CONFIG_HEADER];
  if (ecosystems.length > 0) {
    out.push(
      PROJECT_CONFIG_TESTING_HEADER +
        ecosystems.map(suiteBlock).join("\n") +
        "\n" +
        PROJECT_CONFIG_SELECTION,
    );
  } else {
    out.push(PROJECT_CONFIG_NO_SUITES);
  }
  out.push(PROJECT_CONFIG_PACKAGING);
  return out.join("");
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
export function scaffoldProjectConfig(projectDir: string): string | null {
  const path = join(projectDir, PROJECT_CONFIG_FILENAME);
  if (existsSync(path)) return null;
  try {
    writeFileSync(path, renderProjectConfig(detectEcosystems(projectDir)), "utf8");
  } catch {
    return null;
  }
  return path;
}
