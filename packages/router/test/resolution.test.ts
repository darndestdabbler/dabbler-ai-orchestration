// Where a dependency comes from right now, and what changing that costs.
//
// The property worth pinning is that source mode is REVERSIBLE and VISIBLE:
// the original element is recorded before the file is touched, the restore
// puts back exactly what was there or refuses, and while anything is switched
// the run of record will not be written.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  ResolutionError,
  comparePins,
  configuredFeeds,
  declareFeed,
  producerProjectFor,
  producerBuildVersion,
  publishedVersions,
  reconcileResolution,
  refuseIfResolvingFromSource,
  restoreFromSource,
  sourceModeActive,
  sourceModePath,
  switchToSource,
} from "../src/resolution.ts";
import { DEPS_FILENAME, assembleSolution, loadDeps } from "../src/solutionDeps.ts";
import { makeTempDir, removeTempDirs } from "./support/fixtures.ts";

afterAll(removeTempDirs);

function write(root: string, rel: string, text: string): string {
  const path = join(root, ...rel.split("/"));
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text, "utf8");
  return path;
}

const CONSUMER_PROJECT =
  '<Project><ItemGroup><PackageReference Include="Dabbler.Csv.Model" Version="1.0.0" /></ItemGroup></Project>';

const PRODUCER_PROJECT =
  "<Project><PropertyGroup><PackageId>Dabbler.Csv.Model</PackageId>" +
  "<Version>2.0.0</Version></PropertyGroup></Project>";

/** A consumer beside its producer, both declaring the same solution. */
function solution(): { readonly app: string; readonly model: string } {
  const parent = makeTempDir();
  const model = join(parent, "csv-model");
  mkdirSync(join(model, ".git"), { recursive: true });
  write(model, DEPS_FILENAME, JSON.stringify({
    schemaVersion: 1,
    solution: "csv-pipeline",
    repositoryId: "csv-model",
    consumes: [],
  }));
  write(model, "src/model.csproj", PRODUCER_PROJECT);

  const app = join(parent, "csv-app");
  mkdirSync(join(app, ".git"), { recursive: true });
  write(app, DEPS_FILENAME, JSON.stringify({
    schemaVersion: 1,
    solution: "csv-pipeline",
    repositoryId: "csv-app",
    consumes: [
      {
        id: "Dabbler.Csv.Model",
        kind: "nuget",
        producedBy: { id: "csv-model", remote: null, path: "../csv-model" },
        resolve: "feed",
        feed: "dabbler-local",
      },
    ],
  }));
  write(app, "src/app.csproj", CONSUMER_PROJECT);
  return { app, model };
}

/** A packaging row saying this repository pushed these artifacts. */
function publish(root: string, artifacts: readonly string[]): void {
  write(
    root,
    ".dabbler/runs/s001/packaging.jsonl",
    `${JSON.stringify({ outcome: "published", artifacts })}\n`,
  );
}

describe("what the producer has published", () => {
  it("reads the version out of the producer's own manifest", () => {
    // Not from a feed. Asking a feed is a network call, and the question is
    // already answered by the two files that are open.
    const root = makeTempDir();
    write(root, "src/model.csproj", PRODUCER_PROJECT);
    expect(producerBuildVersion(root)).toBe("2.0.0");
  });

  it("reports a version only the build tool can resolve as unknown", () => {
    const root = makeTempDir();
    write(
      root,
      "src/model.csproj",
      "<Project><PropertyGroup><Version>$(Release)</Version></PropertyGroup></Project>",
    );
    expect(producerBuildVersion(root)).toBeNull();
  });

  it("refuses to order two pins it cannot order", () => {
    // Prerelease precedence is a question this has no business answering, and
    // a wrong "you are behind" is acted on.
    expect(comparePins("1.0.0", "1.2.0")).toBe(-1);
    expect(comparePins("1.10.0", "1.9.0")).toBe(1);
    expect(comparePins("1.0.0-rc.2", "1.0.0")).toBeNull();
  });

  it("reads the versions the producer's own packaging record says it pushed", () => {
    const { model } = solution();
    publish(model, ["Dabbler.Csv.Model.2.0.0.nupkg"]);
    expect(publishedVersions(model)).toEqual(["2.0.0"]);
  });

  it("does not call a version bump a publication", () => {
    // A producer bumps its version while preparing a release and the feed
    // stays where it was. Reporting that as an upgrade tells a consumer
    // correctly pinned to the released version to move to one that does not
    // exist yet.
    const { app } = solution();
    const found = reconcileResolution(assembleSolution(app), []);
    expect(found.some((f) => f.kind === "behind-producer")).toBe(false);
    expect(found.some((f) => f.kind === "producer-source-ahead")).toBe(true);
  });

  it("names a pin behind a version there is evidence was published", () => {
    const { app, model } = solution();
    publish(model, ["Dabbler.Csv.Model.2.0.0.nupkg"]);
    const found = reconcileResolution(assembleSolution(app), []);
    expect(found.some((f) => f.kind === "behind-producer")).toBe(true);
  });

  it("says nothing when the pin has caught up", () => {
    const { app, model } = solution();
    publish(model, ["Dabbler.Csv.Model.2.0.0.nupkg"]);
    write(
      app,
      "src/app.csproj",
      CONSUMER_PROJECT.replace('Version="1.0.0"', 'Version="2.0.0"'),
    );
    const found = reconcileResolution(assembleSolution(app), []);
    expect(found.some((f) => f.kind === "behind-producer")).toBe(false);
    expect(found.some((f) => f.kind === "producer-source-ahead")).toBe(false);
  });
});

describe("the feeds this machine has", () => {
  it("reads a repository-scoped source and honours a disabled one", () => {
    const root = makeTempDir();
    write(
      root,
      "NuGet.config",
      "<configuration><packageSources>" +
        '<add key="dabbler-local" value="https://feed.invalid/v3/index.json" />' +
        '<add key="off" value="https://other.invalid/index.json" />' +
        "</packageSources><disabledPackageSources>" +
        '<add key="off" value="true" />' +
        "</disabledPackageSources></configuration>",
    );
    const feeds = configuredFeeds(root, join(root, "no-profile"));
    expect(feeds.find((f) => f.key === "dabbler-local")?.enabled).toBe(true);
    expect(feeds.find((f) => f.key === "off")?.enabled).toBe(false);
  });

  it("says a local source is not on this machine rather than calling it usable", () => {
    const root = makeTempDir();
    write(
      root,
      "NuGet.config",
      "<configuration><packageSources>" +
        `<add key="local" value="${join(root, "nowhere").replace(/\\/g, "/")}" />` +
        "</packageSources></configuration>",
    );
    const [feed] = configuredFeeds(root, join(root, "no-profile"));
    expect(feed.unusable).toContain("not on this machine");
  });

  it("names a declared feed no source on this machine serves", () => {
    // Invisible until a restore fails, and the failure names the package
    // rather than the feed.
    const { app } = solution();
    const found = reconcileResolution(assembleSolution(app), []);
    expect(found.some((f) => f.kind === "feed-not-configured")).toBe(true);
  });

  it("writes a source into THIS repository and nowhere else", () => {
    // Machine-global configuration belongs to the person whose machine it is.
    const root = makeTempDir();
    const path = declareFeed(root, { key: "dabbler-local", value: "C:/feed" });
    expect(path).toBe(join(root, "NuGet.config"));
    expect(readFileSync(path, "utf8")).toContain("dabbler-local");
    expect(configuredFeeds(root, join(root, "no-profile"))[0].key).toBe("dabbler-local");
  });

  it("refuses to redeclare a source that is already named", () => {
    const root = makeTempDir();
    declareFeed(root, { key: "dabbler-local", value: "C:/feed" });
    expect(() => declareFeed(root, { key: "dabbler-local", value: "C:/other" })).toThrow(
      ResolutionError,
    );
  });
});

describe("finding the project that builds a package", () => {
  it("matches the declared PackageId rather than the file name", () => {
    // A project publishing under a name other than its own file name is
    // ordinary, and guessing there swaps in the wrong project.
    const root = makeTempDir();
    write(root, "src/Core.csproj", PRODUCER_PROJECT);
    expect(producerProjectFor(root, "Dabbler.Csv.Model").path).toContain("Core.csproj");
  });

  it("refuses when two projects claim the same package", () => {
    const root = makeTempDir();
    write(root, "a/one.csproj", PRODUCER_PROJECT);
    write(root, "b/two.csproj", PRODUCER_PROJECT);
    const found = producerProjectFor(root, "Dabbler.Csv.Model");
    expect(found.path).toBeNull();
    expect(found.reason).toContain("2 projects");
  });
});

describe("stepping into a dependency's source", () => {
  it("points the reference at the producer and records what it replaced", () => {
    const { app, model } = solution();
    const swap = switchToSource(app, {
      packageId: "Dabbler.Csv.Model",
      producerRoot: model,
    });
    const text = readFileSync(join(app, "src", "app.csproj"), "utf8");
    expect(text).toContain("ProjectReference");
    expect(text).not.toContain("PackageReference");
    expect(swap.originalElement).toContain("PackageReference");
  });

  it("restores the file exactly, byte for byte", () => {
    // Anything less and a repository builds against a sibling checkout while
    // every gate believes it does not.
    const { app, model } = solution();
    const path = join(app, "src", "app.csproj");
    const before = readFileSync(path, "utf8");
    switchToSource(app, { packageId: "Dabbler.Csv.Model", producerRoot: model });
    restoreFromSource(app, "Dabbler.Csv.Model");
    expect(readFileSync(path, "utf8")).toBe(before);
    expect(sourceModeActive(app)).toEqual([]);
  });

  it("refuses to restore a file that changed while it was switched", () => {
    const { app, model } = solution();
    switchToSource(app, { packageId: "Dabbler.Csv.Model", producerRoot: model });
    write(
      app,
      "src/app.csproj",
      '<Project><ItemGroup><ProjectReference Include="x" />' +
        '<PackageReference Include="Newtonsoft.Json" Version="13.0.0" />' +
        "</ItemGroup></Project>",
    );
    expect(() => restoreFromSource(app, "Dabbler.Csv.Model")).toThrow(ResolutionError);
  });

  it("closes the record when a crash left the file untouched", () => {
    // Recording before writing means a crash between them leaves a record of
    // a swap that did not happen. Refusing there would block every gate
    // forever over an edit nobody made.
    const { app, model } = solution();
    const path = join(app, "src", "app.csproj");
    const before = readFileSync(path, "utf8");
    switchToSource(app, { packageId: "Dabbler.Csv.Model", producerRoot: model });
    writeFileSync(path, before, "utf8");
    expect(restoreFromSource(app, "Dabbler.Csv.Model").restoredAt).not.toBeNull();
    expect(sourceModeActive(app)).toEqual([]);
  });

  it("refuses a package two build files reference", () => {
    // Switching one and leaving the other builds half against source.
    const { app, model } = solution();
    write(app, "src/other.csproj", CONSUMER_PROJECT);
    expect(() =>
      switchToSource(app, { packageId: "Dabbler.Csv.Model", producerRoot: model }),
    ).toThrow(ResolutionError);
  });

  it("treats an unreadable record as switched rather than as clear", () => {
    // "We cannot tell" must never resolve to "nothing is switched": that is
    // how a corrupt line turns the refusals off.
    const root = makeTempDir();
    write(root, ".dabbler/runs/source-mode.jsonl", "{not json\n");
    expect(() => sourceModeActive(root)).toThrow(ResolutionError);
  });
});

describe("what a switched dependency refuses", () => {
  it("names the package in the refusal the three callers print", () => {
    const { app, model } = solution();
    expect(refuseIfResolvingFromSource(app, "the run of record")).toBeNull();
    switchToSource(app, { packageId: "Dabbler.Csv.Model", producerRoot: model });
    const refused = refuseIfResolvingFromSource(app, "the run of record");
    expect(refused).toContain("Dabbler.Csv.Model");
    expect(refused).toContain("the run of record");
  });

  it("has a record under .dabbler, which is the machine's and not the tree's", () => {
    const { app } = solution();
    expect(sourceModePath(app)).toContain(".dabbler");
  });
});

describe("the user-level configuration this machine actually has", () => {
  it("finds the Unix user config, not only the Windows one", () => {
    // A reader that knew only %APPDATA% reports a feed the machine has as
    // absent, asks a question nobody needed to answer, and writes a duplicate
    // repository configuration on the strength of it.
    const home = makeTempDir();
    write(
      home,
      ".nuget/NuGet/NuGet.Config",
      "<configuration><packageSources>" +
        '<add key="dabbler-local" value="https://feed.invalid/index.json" />' +
        "</packageSources></configuration>",
    );
    const previous = process.env["HOME"];
    const appData = process.env["APPDATA"];
    try {
      process.env["HOME"] = home;
      delete process.env["APPDATA"];
      const feeds = configuredFeeds(makeTempDir());
      expect(feeds.some((feed) => feed.key === "dabbler-local")).toBe(true);
    } finally {
      if (previous === undefined) delete process.env["HOME"];
      else process.env["HOME"] = previous;
      if (appData !== undefined) process.env["APPDATA"] = appData;
    }
  });

  it("honours a clear, because a restore honours it", () => {
    // Reporting a cleared source as available says a feed is reachable that
    // no restore will reach.
    const home = makeTempDir();
    write(
      home,
      "NuGet/NuGet.Config",
      '<configuration><packageSources><add key="outer" value="https://a.invalid/i.json" />' +
        "</packageSources></configuration>",
    );
    const root = makeTempDir();
    write(
      root,
      "NuGet.config",
      "<configuration><packageSources><clear />" +
        '<add key="inner" value="https://b.invalid/i.json" />' +
        "</packageSources></configuration>",
    );
    const keys = configuredFeeds(root, home).map((feed) => feed.key);
    expect(keys).toContain("inner");
    expect(keys).not.toContain("outer");
  });
});

describe("what a switched dependency refuses, beyond the moment it is switched", () => {
  it("moves the declaration with the build file, and back again", () => {
    // Moving only the build file leaves the declaration saying `feed` while
    // the project builds from source: the declare-and-check model disagreeing
    // with itself on its own main path.
    const { app, model } = solution();
    switchToSource(app, { packageId: "Dabbler.Csv.Model", producerRoot: model });
    expect(loadDeps(app)?.consumes[0].resolve).toBe("source");
    restoreFromSource(app, "Dabbler.Csv.Model");
    expect(loadDeps(app)?.consumes[0].resolve).toBe("feed");
  });

  it("refuses on the declaration alone when the machine record is gone", () => {
    // `.dabbler` is machine state and can be deleted; the declaration is
    // tracked. "We cannot tell whether this is switched" never resolves to
    // "assume it is not".
    const { app, model } = solution();
    switchToSource(app, { packageId: "Dabbler.Csv.Model", producerRoot: model });
    rmSync(sourceModePath(app));
    expect(refuseIfResolvingFromSource(app, "the close")).toContain("Dabbler.Csv.Model");
  });

  it("rejects a run that executed while the dependency was switched", () => {
    // Switch, run, restore, record is the ordinary debugging sequence, and a
    // check asking only "is anything switched right now" accepts exactly that
    // run -- the one the refusal exists to reject.
    const { app, model } = solution();
    switchToSource(app, { packageId: "Dabbler.Csv.Model", producerRoot: model });
    restoreFromSource(app, "Dabbler.Csv.Model");
    const during = new Date(Date.now() - 600_000).toISOString();
    expect(refuseIfResolvingFromSource(app, "the run of record", { ranFrom: during })).toContain(
      "while this run",
    );
  });

  it("accepts a run that started after the restore", () => {
    const { app, model } = solution();
    switchToSource(app, { packageId: "Dabbler.Csv.Model", producerRoot: model });
    restoreFromSource(app, "Dabbler.Csv.Model");
    const after = new Date(Date.now() + 60_000).toISOString();
    expect(refuseIfResolvingFromSource(app, "the run of record", { ranFrom: after })).toBeNull();
  });
});
