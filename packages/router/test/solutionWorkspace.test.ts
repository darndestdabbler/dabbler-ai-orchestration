// One VS Code window over the whole solution.
//
// The property worth pinning is that the file is DERIVED and LOCAL: it is
// regenerated from the graph rather than merged, it lives where nothing
// tracks it, and it carries only folders that are actually on this machine.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  DEPS_FILENAME,
  workspaceFilePath,
  workspaceFolders,
  writeWorkspaceFile,
} from "../src/solutionDeps.ts";
import { makeTempDir, removeTempDirs } from "./support/fixtures.ts";

afterAll(removeTempDirs);

/** A repository under `parent`, declaring the solution and its edges. */
function member(
  parent: string,
  name: string,
  consumes: unknown[],
  extra: Record<string, unknown> = {},
): string {
  const root = join(parent, name);
  mkdirSync(join(root, ".git"), { recursive: true });
  writeFileSync(
    join(root, DEPS_FILENAME),
    JSON.stringify({
      schemaVersion: 1,
      solution: "csv-pipeline",
      repositoryId: name,
      consumes,
      ...extra,
    }),
    "utf8",
  );
  return root;
}

const EDGE = {
  id: "Dabbler.Csv.Model",
  kind: "nuget",
  producedBy: { id: "csv-model", remote: null, path: "../csv-model" },
  resolve: "feed",
};

describe("the workspace over a solution", () => {
  /** What VS Code would open, resolved the way VS Code resolves it. */
  function opens(repoRoot: string): string[] {
    const base = dirname(workspaceFilePath(repoRoot));
    return workspaceFolders(repoRoot).map((folder) => resolve(base, folder.path));
  }

  it("carries this repository first and its siblings after", () => {
    // This one is the window the developer already has.
    const parent = makeTempDir();
    const model = member(parent, "csv-model", []);
    const app = member(parent, "csv-app", [EDGE]);
    expect(workspaceFolders(app).map((f) => f.name)).toContain("csv-model");
    // Resolved from the FILE's directory, which is where VS Code resolves a
    // folder path from. Computed from the repository root instead, `"."`
    // opens `.dabbler` and the sibling lands inside this repository.
    expect(opens(app)).toEqual([resolve(app), resolve(model)]);
  });

  it("omits a repository nobody has cloned rather than adding a broken row", () => {
    // VS Code renders a missing folder as an error, and a window that opens
    // with three errors in it teaches people to distrust the button.
    const parent = makeTempDir();
    const app = member(parent, "csv-app", [
      { ...EDGE, producedBy: { id: "csv-model", remote: null, path: "../nowhere" } },
    ]);
    expect(workspaceFolders(app)).toHaveLength(1);
  });

  it("lives where nothing tracks it", () => {
    // It carries the paths THIS machine has. A tracked copy is wrong on the
    // second machine that opens it -- pointing at folders that are not
    // there, or at folders that are somebody else's checkout.
    const root = makeTempDir();
    expect(workspaceFilePath(root)).toContain(".dabbler");
  });

  it("uses a relative path, so moving the whole set keeps it working", () => {
    const parent = makeTempDir();
    const model = member(parent, "csv-model", []);
    const app = member(parent, "csv-app", [EDGE]);
    const sibling = workspaceFolders(app).find((f) => f.name === "csv-model");
    expect(sibling?.path).toBe("../../csv-model");
    expect(resolve(dirname(workspaceFilePath(app)), sibling?.path as string)).toBe(
      resolve(model),
    );
  });

  it("writes a document VS Code can open", () => {
    const parent = makeTempDir();
    member(parent, "csv-model", []);
    const app = member(parent, "csv-app", [EDGE]);
    const path = writeWorkspaceFile(app);
    expect(existsSync(path)).toBe(true);
    const doc = JSON.parse(readFileSync(path, "utf8")) as {
      folders: { name: string; path: string }[];
      settings: Record<string, unknown>;
    };
    expect(doc.folders).toHaveLength(2);
    // Says of itself that it is generated, so nobody keeps preferences in a
    // file that is rewritten whenever the graph changes.
    expect(doc.settings["dabbler.generated"]).toBe(true);
  });

  it("regenerates rather than merges, so a departed repository leaves", () => {
    // A merge would preserve a folder whose repository has left the
    // solution, which is the one thing a derived file must not do.
    const parent = makeTempDir();
    member(parent, "csv-model", []);
    const app = member(parent, "csv-app", [EDGE]);
    writeWorkspaceFile(app);
    writeFileSync(
      join(app, DEPS_FILENAME),
      JSON.stringify({
        schemaVersion: 1,
        solution: "csv-pipeline",
        repositoryId: "csv-app",
        searchPaths: [],
        consumes: [],
      }),
      "utf8",
    );
    const doc = JSON.parse(readFileSync(writeWorkspaceFile(app), "utf8")) as {
      folders: { name: string }[];
    };
    expect(doc.folders.map((f) => f.name)).toEqual(["csv-app"]);
  });

  it("is a window of one for a repository that reaches nothing", () => {
    const root = makeTempDir();
    expect(workspaceFolders(root)).toHaveLength(1);
  });
});
