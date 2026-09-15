// The shape of a solution, read from its build files and from nothing else.
//
// A .NET solution is its root `.slnx` or `.sln` -- or, where there is
// neither, every `.csproj` under the root -- and each project's
// `<ProjectReference>`s. A Maven solution is its root `pom.xml`'s `<modules>`,
// read recursively -- or, where there is no root POM, every `pom.xml` under
// the root -- and each module's `<dependency>` on a sibling's artifact. A
// repository with neither is one project: itself.
//
// Nothing here is declared. A list of projects kept beside the build files
// is a second thing to keep true, and the build tool never reads it.

import { existsSync, readdirSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

import { type XmlElement, buildFilesIn, childText, readXmlElements } from "./solutionDeps.ts";
import { readText } from "./textfile.ts";

export type ProjectKind = "service" | "worker" | "application" | "test" | "library";

export interface Project {
  /** The `.csproj` file's base name, or Maven's `artifactId`. */
  readonly name: string;
  /** The build file, repository-relative and forward-slashed; `.` for a repository that is one project. */
  readonly path: string;
  readonly kind: ProjectKind;
  /** The projects this one references, by name, in the order its build file names them. */
  readonly dependsOn: readonly string[];
}

export interface ProjectGraph {
  readonly ecosystem: "dotnet" | "maven" | null;
  /** In dependency order: every project after everything it references. */
  readonly projects: readonly Project[];
}

function posix(path: string): string {
  return path.split("\\").join("/");
}

/** Two spellings of one file are one file; Windows paths differ only in case. */
function sameFile(path: string): string {
  const full = resolve(path);
  return process.platform === "win32" ? full.toLowerCase() : full;
}

/**
 * A build file's elements, or null where it cannot be read. An unreadable
 * project is still a project -- it is listed with nothing known about it --
 * because a view that dropped it would be claiming the solution is smaller
 * than it is.
 */
function elementsOf(path: string): XmlElement[] | null {
  try {
    return readXmlElements(readText(path));
  } catch {
    return null;
  }
}

function rootNames(root: string): string[] {
  try {
    return readdirSync(root).sort();
  } catch {
    return [];
  }
}

// --- .NET ---------------------------------------------------------------------

/** The projects a root solution file lists, as absolute paths, or null where the root has none. */
function solutionProjects(root: string): string[] | null {
  const names = rootNames(root);
  const slnx = names.find((name) => name.toLowerCase().endsWith(".slnx"));
  if (slnx !== undefined) {
    const elements = elementsOf(join(root, slnx)) ?? [];
    return elements
      .filter((element) => element.name === "Project" && element.attributes["Path"])
      .map((element) => resolve(root, posix(element.attributes["Path"] as string)));
  }
  const sln = names.find((name) => name.toLowerCase().endsWith(".sln"));
  if (sln !== undefined) {
    let text = "";
    try {
      text = readText(join(root, sln));
    } catch {
      return [];
    }
    return [...text.matchAll(/^Project\("[^"]*"\)\s*=\s*"[^"]*",\s*"([^"]+\.csproj)"/gim)].map((match) =>
      resolve(root, posix(match[1] as string)),
    );
  }
  return null;
}

function dotnetKind(elements: readonly XmlElement[]): ProjectKind {
  const sdk = elements.find((element) => element.name === "Project")?.attributes["Sdk"] ?? "";
  const references = elements.filter((element) => element.name === "PackageReference");
  if (references.some((element) => element.attributes["Include"] === "Microsoft.NET.Test.Sdk")) return "test";
  if (sdk === "Microsoft.NET.Sdk.Web") return "service";
  if (sdk === "Microsoft.NET.Sdk.Worker") return "worker";
  const output = elements.find((element) => element.name === "OutputType")?.text.trim().toLowerCase();
  return output === "exe" || output === "winexe" ? "application" : "library";
}

function dotnetGraph(root: string, files: readonly string[]): Project[] {
  const nameOf = new Map(files.map((file) => [sameFile(file), basename(file).replace(/\.csproj$/i, "")] as const));
  return files.map((file) => {
    const elements = elementsOf(file) ?? [];
    const dependsOn = elements
      .filter((element) => element.name === "ProjectReference" && element.attributes["Include"])
      .map((element) => nameOf.get(sameFile(join(dirname(file), posix(element.attributes["Include"] as string)))))
      .filter((name): name is string => name !== undefined);
    return {
      name: nameOf.get(sameFile(file)) as string,
      path: posix(relative(root, file)),
      kind: dotnetKind(elements),
      dependsOn: [...new Set(dependsOn)],
    };
  });
}

// --- Maven --------------------------------------------------------------------

/** The text of the project's own top-level element, not one nested in a block. */
function topLevel(elements: readonly XmlElement[], name: string): string | null {
  const found = elements.find((element) => element.name === name && element.path.join("/") === "project");
  return found ? found.text : null;
}

/** Every POM that builds something, following `<modules>` down from `pom`; an aggregator is not a project. */
function reactorPoms(pom: string, seen = new Set<string>()): string[] {
  if (seen.has(sameFile(pom)) || !existsSync(pom)) return [];
  seen.add(sameFile(pom));
  const modules = (elementsOf(pom) ?? []).filter(
    (element) => element.name === "module" && element.path.join("/") === "project/modules",
  );
  if (modules.length === 0) return [pom];
  return modules.flatMap((module) => reactorPoms(join(dirname(pom), posix(module.text.trim()), "pom.xml"), seen));
}

function mavenGraph(root: string, poms: readonly string[]): Project[] {
  const read = poms.map((pom) => ({ pom, elements: elementsOf(pom) ?? [] }));
  const artifacts = new Set(read.map(({ elements }) => topLevel(elements, "artifactId")).filter((id): id is string => id !== null));
  return read.map(({ pom, elements }) => {
    const plugins = elements.filter((element) => element.name === "plugin");
    const bootPlugin = plugins.some((plugin) => childText(elements, plugin, "artifactId") === "spring-boot-maven-plugin");
    const dependsOn = elements
      .filter(
        (element) =>
          element.name === "dependency" &&
          !element.path.includes("dependencyManagement") &&
          !element.path.includes("plugin"),
      )
      .map((dependency) => childText(elements, dependency, "artifactId"))
      .filter((id): id is string => id !== null && artifacts.has(id));
    return {
      name: topLevel(elements, "artifactId") ?? basename(dirname(pom)),
      path: posix(relative(root, pom)),
      kind: topLevel(elements, "packaging") === "war" || bootPlugin ? "service" : "library",
      dependsOn: [...new Set(dependsOn)],
    };
  });
}

// --- The graph ------------------------------------------------------------------

/** Every project after everything it references, the build files' order breaking ties. */
function dependencyOrder(projects: readonly Project[]): Project[] {
  const remaining = [...projects];
  const placed = new Set<string>();
  const out: Project[] = [];
  while (remaining.length > 0) {
    const ready = remaining.findIndex((project) => project.dependsOn.every((name) => placed.has(name)));
    // A reference cycle cannot be built, but it can be listed; the guard
    // takes the next project rather than spinning.
    const next = remaining.splice(ready === -1 ? 0 : ready, 1)[0] as Project;
    placed.add(next.name);
    out.push(next);
  }
  return out;
}

/** The solution at `root`, as its build files describe it. */
export function readProjectGraph(root: string): ProjectGraph {
  const listed = solutionProjects(root);
  const csprojs = listed ?? buildFilesIn(root).filter((file) => file.toLowerCase().endsWith(".csproj"));
  if (csprojs.length > 0) {
    return { ecosystem: "dotnet", projects: dependencyOrder(dotnetGraph(root, csprojs)) };
  }
  const rootPom = join(root, "pom.xml");
  const poms = existsSync(rootPom)
    ? reactorPoms(rootPom)
    : buildFilesIn(root).filter((file) => basename(file) === "pom.xml" && reactorPoms(file)[0] === file);
  if (poms.length > 0) {
    return { ecosystem: "maven", projects: dependencyOrder(mavenGraph(root, poms)) };
  }
  return {
    ecosystem: null,
    projects: [{ name: basename(resolve(root)) || "solution", path: ".", kind: "application", dependsOn: [] }],
  };
}

/** Every project that references `name`, directly or through another, in dependency order. */
export function usedBy(graph: ProjectGraph, name: string): string[] {
  const reached = new Set<string>();
  let frontier = [name];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const project of graph.projects) {
      if (project.name === name || reached.has(project.name)) continue;
      if (project.dependsOn.some((dependency) => frontier.includes(dependency))) {
        reached.add(project.name);
        next.push(project.name);
      }
    }
    frontier = next;
  }
  return graph.projects.map((project) => project.name).filter((candidate) => reached.has(candidate));
}
