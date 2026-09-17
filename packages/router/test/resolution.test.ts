// Where a dependency comes from right now, and what changing that costs.
//
// The two judgements -- what the configured feeds are, and what the declared
// edges reconcile to against what the producers hold -- are pure functions
// over already-read text and already-read facts, so they are asserted from
// literals. Source mode is not: it is a claim about files on disk, that the
// original element is recorded before the file is touched and the restore
// puts back exactly what was there or refuses. Those tests build a directory
// and read it back. No process is spawned anywhere.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  ResolutionError,
  artifactIdentity,
  comparePins,
  configuredFeeds,
  declareFeed,
  feedsFromConfigs,
  producerBuildVersion,
  producerProjectFor,
  publishedVersions,
  reconcileFrom,
  reconcileResolution,
  refuseIfResolvingFromSource,
  restoreFromSource,
  sourceModeActive,
  sourceModePath,
  switchToSource,
  type Feed,
  type ProducerFacts,
} from "../src/resolution.ts";
import { DEPS_FILENAME, assembleSolution, loadDeps } from "../src/solutionDeps.ts";
import { tempDir } from "./support/answers.ts";

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
  const parent = tempDir("solution-");
  const model = join(parent, "csv-model");
  mkdirSync(join(model, ".git"), { recursive: true });
  write(
    model,
    DEPS_FILENAME,
    JSON.stringify({
      schemaVersion: 1,
      solution: "csv-pipeline",
      repositoryId: "csv-model",
      consumes: [],
    }),
  );
  write(model, "src/model.csproj", PRODUCER_PROJECT);

  const app = join(parent, "csv-app");
  mkdirSync(join(app, ".git"), { recursive: true });
  write(
    app,
    DEPS_FILENAME,
    JSON.stringify({
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
    }),
  );
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

// --- Versions ----------------------------------------------------------------

describe("what the producer has published", () => {
  it("reads the version out of the producer's own manifest", () => {
    // Not from a feed. Asking a feed is a network call, and the question is
    // already answered by the two files that are open.
    const root = tempDir("producer-");
    write(root, "src/model.csproj", PRODUCER_PROJECT);
    assert.equal(producerBuildVersion(root), "2.0.0");
  });

  it("reports a version only the build tool can resolve as unknown", () => {
    const root = tempDir("producer-");
    write(
      root,
      "src/model.csproj",
      "<Project><PropertyGroup><Version>$(Release)</Version></PropertyGroup></Project>",
    );
    assert.equal(producerBuildVersion(root), null);
  });

  it("refuses to order two pins it cannot order", () => {
    // Prerelease precedence is a question this has no business answering, and
    // a wrong "you are behind" is acted on.
    assert.equal(comparePins("1.0.0", "1.2.0"), -1);
    assert.equal(comparePins("1.10.0", "1.9.0"), 1);
    assert.equal(comparePins("1.0.0-rc.2", "1.0.0"), null);
  });

  it("reads the versions the producer's own packaging record says it pushed", () => {
    const { model } = solution();
    publish(model, ["Dabbler.Csv.Model.2.0.0.nupkg"]);
    assert.deepEqual(publishedVersions(model), [
      { packageId: "Dabbler.Csv.Model", version: "2.0.0" },
    ]);
  });

  it("reads the package id off the artifact, not only the version", () => {
    assert.deepEqual(artifactIdentity("Dabbler.Csv.Model.2.0.0.nupkg"), {
      packageId: "Dabbler.Csv.Model",
      version: "2.0.0",
    });
    assert.equal(artifactIdentity("csv-model-1.4.0.jar")?.packageId, "csv-model");
    assert.equal(artifactIdentity("README.md"), null);
  });

  it("splits an ambiguous name against the ids somebody declared", () => {
    // `Foo.2.0.1.0.0.nupkg` reads as Foo at 2.0.1.0.0 or Foo.2.0 at 1.0.0,
    // and nothing in the file name decides. What decides is which of them is
    // a package this solution consumes.
    assert.deepEqual(artifactIdentity("Foo.2.0.1.0.0.nupkg", ["Foo.2.0"]), {
      packageId: "Foo.2.0",
      version: "1.0.0",
    });
    assert.equal(
      artifactIdentity("log4j-1.2-api-2.0.0.jar", ["log4j-1.2-api"])?.version,
      "2.0.0",
    );
  });
});

// --- The reconciliation, over facts ------------------------------------------

describe("reconciling a pin against what the producer holds", () => {
  const members = () => assembleSolution(solution().app);

  function facts(
    published: Record<string, readonly string[]> = {},
    built: Record<string, string> = {},
  ): ProducerFacts {
    return { published: new Map(Object.entries(published)), built: new Map(Object.entries(built)) };
  }

  const kinds = (found: ReadonlyArray<{ kind: string }>): string[] =>
    found.map((finding) => finding.kind);

  it("does not call a version bump a publication", () => {
    // A producer bumps its version while preparing a release and the feed
    // stays where it was. Reporting that as an upgrade tells a consumer
    // correctly pinned to the released version to move to one that does not
    // exist yet.
    const found = reconcileFrom(members(), [], facts({}, { "csv-model": "2.0.0" }));
    assert.ok(!kinds(found).includes("behind-producer"));
    assert.ok(kinds(found).includes("producer-source-ahead"));
  });

  it("names a pin behind a version there is evidence was published", () => {
    const found = reconcileFrom(
      members(),
      [],
      facts({ "Dabbler.Csv.Model": ["2.0.0"] }, { "csv-model": "2.0.0" }),
    );
    assert.ok(kinds(found).includes("behind-producer"));
  });

  it("says nothing when the pin has caught up", () => {
    const { app } = solution();
    write(app, "src/app.csproj", CONSUMER_PROJECT.replace('Version="1.0.0"', 'Version="2.0.0"'));
    const found = reconcileFrom(
      assembleSolution(app),
      [],
      facts({ "Dabbler.Csv.Model": ["2.0.0"] }, { "csv-model": "2.0.0" }),
    );
    assert.ok(!kinds(found).includes("behind-producer"));
    assert.ok(!kinds(found).includes("producer-source-ahead"));
  });

  it("does not report one package's release against another", () => {
    // Multi-package repositories are ordinary, and attributing A's 2.0.0 to a
    // consumer correctly pinned to B's 1.0.0 sends them at a version of their
    // dependency that was never cut.
    const found = reconcileFrom(
      members(),
      [],
      facts({ "Package.A": ["2.0.0"], "Dabbler.Csv.Model": ["1.0.0"] }),
    );
    assert.ok(!kinds(found).includes("behind-producer"));
  });

  it("names a declared feed no source on this machine serves", () => {
    // Invisible until a restore fails, and the failure names the package
    // rather than the feed.
    assert.ok(kinds(reconcileFrom(members(), [], facts())).includes("feed-not-configured"));
  });

  it("names a feed that is configured and cannot serve", () => {
    const disabled: Feed = {
      key: "dabbler-local",
      value: "https://feed.invalid/index.json",
      enabled: false,
      file: "/repo/NuGet.config",
      unusable: "",
    };
    const found = reconcileFrom(members(), [disabled], facts());
    const feedFinding = found.find((finding) => finding.kind === "feed-not-configured");
    assert.match(String(feedFinding?.detail), /the source is disabled/);
  });

  it("says nothing about a feed that serves", () => {
    const usable: Feed = {
      key: "dabbler-local",
      value: "https://feed.invalid/index.json",
      enabled: true,
      file: "/repo/NuGet.config",
      unusable: "",
    };
    assert.ok(!kinds(reconcileFrom(members(), [usable], facts())).includes("feed-not-configured"));
  });

  it("reads the producer checkouts for itself when nobody hands it facts", () => {
    // The composed path, once: everything above is the judgement, and this
    // is the reader it is composed with.
    const { app, model } = solution();
    publish(model, ["Dabbler.Csv.Model.2.0.0.nupkg"]);
    assert.ok(kinds(reconcileResolution(assembleSolution(app), [])).includes("behind-producer"));
  });
});

// --- Feeds -------------------------------------------------------------------

describe("the sources a machine's configuration declares", () => {
  const sources = (body: string, file = "/repo/NuGet.config"): { file: string; text: string } => ({
    file,
    text: `<configuration><packageSources>${body}</packageSources></configuration>`,
  });

  /** Every source is reachable, so the tests below are about the XML alone. */
  const reachable = (): string => "";

  it("reads a repository-scoped source and honours a disabled one", () => {
    const feeds = feedsFromConfigs(
      [
        {
          file: "/repo/NuGet.config",
          text:
            "<configuration><packageSources>" +
            '<add key="dabbler-local" value="https://feed.invalid/v3/index.json" />' +
            '<add key="off" value="https://other.invalid/index.json" />' +
            "</packageSources><disabledPackageSources>" +
            '<add key="off" value="true" />' +
            "</disabledPackageSources></configuration>",
        },
      ],
      reachable,
    );
    assert.equal(feeds.find((feed) => feed.key === "dabbler-local")?.enabled, true);
    assert.equal(feeds.find((feed) => feed.key === "off")?.enabled, false);
  });

  it("says a local source is not on this machine rather than calling it usable", () => {
    const [feed] = configuredFeeds(
      (() => {
        const root = tempDir("feeds-");
        write(
          root,
          "NuGet.config",
          "<configuration><packageSources>" +
            `<add key="local" value="${join(root, "nowhere").replace(/\\/g, "/")}" />` +
            "</packageSources></configuration>",
        );
        return root;
      })(),
      join(tempDir("feeds-"), "no-profile"),
    );
    assert.match(String(feed?.unusable), /not on this machine/);
  });

  it("honours a clear, because a restore honours it", () => {
    // A `<clear />` discards the sources of every file FURTHER OUT, not the
    // ones beside it, and reporting a cleared source as available says a feed
    // is reachable that no restore will reach.
    const keys = feedsFromConfigs(
      [
        sources('<clear /><add key="inner" value="https://b.invalid/i.json" />'),
        sources('<add key="outer" value="https://a.invalid/i.json" />', "/home/NuGet.Config"),
      ],
      reachable,
    ).map((feed) => feed.key);
    assert.ok(keys.includes("inner"));
    assert.ok(!keys.includes("outer"));
  });

  it("honours a remove, and takes the nearest declaration of a repeated key", () => {
    const feeds = feedsFromConfigs(
      [
        sources('<remove key="gone" /><add key="shared" value="near" />'),
        sources(
          '<add key="gone" value="https://a.invalid/i.json" /><add key="shared" value="far" />',
          "/home/NuGet.Config",
        ),
      ],
      reachable,
    );
    assert.ok(!feeds.some((feed) => feed.key === "gone"));
    assert.equal(feeds.find((feed) => feed.key === "shared")?.value, "near");
  });

  it("reports a configuration file it cannot read rather than throwing", () => {
    // A broken NuGet.config elsewhere on the machine must not stop a
    // dependency check.
    const malformed = feedsFromConfigs(
      [{ file: "/repo/NuGet.config", text: "<configuration></packageSources>" }],
      reachable,
    );
    assert.equal(malformed[0]?.key, "(unreadable)");
    assert.match(String(malformed[0]?.unusable), /not readable as XML/);
    // And a file that would not read at all is the same fact.
    assert.equal(
      feedsFromConfigs([{ file: "/repo/NuGet.config", text: null }], reachable)[0]?.key,
      "(unreadable)",
    );
  });

  it("finds the Unix user config, not only the Windows one", () => {
    // A reader that knew only %APPDATA% reports a feed the machine has as
    // absent, asks a question nobody needed to answer, and writes a duplicate
    // repository configuration on the strength of it.
    const home = tempDir("home-");
    write(
      home,
      ".nuget/NuGet/NuGet.Config",
      "<configuration><packageSources>" +
        '<add key="dabbler-local" value="https://feed.invalid/index.json" />' +
        "</packageSources></configuration>",
    );
    const previousHome = process.env["HOME"];
    const appData = process.env["APPDATA"];
    try {
      process.env["HOME"] = home;
      delete process.env["APPDATA"];
      const feeds = configuredFeeds(tempDir("feeds-"));
      assert.ok(feeds.some((feed) => feed.key === "dabbler-local"));
    } finally {
      if (previousHome === undefined) delete process.env["HOME"];
      else process.env["HOME"] = previousHome;
      if (appData !== undefined) process.env["APPDATA"] = appData;
    }
  });

  it("writes a source into THIS repository and nowhere else", () => {
    // Machine-global configuration belongs to the person whose machine it is.
    const root = tempDir("feeds-");
    const path = declareFeed(root, { key: "dabbler-local", value: "C:/feed" });
    assert.equal(path, join(root, "NuGet.config"));
    assert.match(readFileSync(path, "utf8"), /dabbler-local/);
    assert.equal(configuredFeeds(root, join(root, "no-profile"))[0]?.key, "dabbler-local");
  });

  it("refuses to redeclare a source that is already named", () => {
    const root = tempDir("feeds-");
    declareFeed(root, { key: "dabbler-local", value: "C:/feed" });
    assert.throws(
      () => declareFeed(root, { key: "dabbler-local", value: "C:/other" }),
      ResolutionError,
    );
  });
});

// --- Source mode -------------------------------------------------------------

describe("finding the project that builds a package", () => {
  it("matches the declared PackageId rather than the file name", () => {
    // A project publishing under a name other than its own file name is
    // ordinary, and guessing there swaps in the wrong project.
    const root = tempDir("producer-");
    write(root, "src/Core.csproj", PRODUCER_PROJECT);
    assert.match(String(producerProjectFor(root, "Dabbler.Csv.Model").path), /Core\.csproj/);
  });

  it("refuses when two projects claim the same package", () => {
    const root = tempDir("producer-");
    write(root, "a/one.csproj", PRODUCER_PROJECT);
    write(root, "b/two.csproj", PRODUCER_PROJECT);
    const found = producerProjectFor(root, "Dabbler.Csv.Model");
    assert.equal(found.path, null);
    assert.match(String(found.reason), /2 projects/);
  });
});

describe("stepping into a dependency's source", () => {
  it("points the reference at the producer and records what it replaced", () => {
    const { app, model } = solution();
    const swap = switchToSource(app, { packageId: "Dabbler.Csv.Model", producerRoot: model });
    const text = readFileSync(join(app, "src", "app.csproj"), "utf8");
    assert.match(text, /ProjectReference/);
    assert.ok(!text.includes("PackageReference"));
    assert.match(swap.originalElement, /PackageReference/);
  });

  it("restores the file exactly, byte for byte", () => {
    // Anything less and a repository builds against a sibling checkout while
    // every gate believes it does not.
    const { app, model } = solution();
    const path = join(app, "src", "app.csproj");
    const before = readFileSync(path, "utf8");
    switchToSource(app, { packageId: "Dabbler.Csv.Model", producerRoot: model });
    restoreFromSource(app, "Dabbler.Csv.Model");
    assert.equal(readFileSync(path, "utf8"), before);
    assert.deepEqual(sourceModeActive(app), []);
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
    assert.throws(() => restoreFromSource(app, "Dabbler.Csv.Model"), ResolutionError);
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
    assert.notEqual(restoreFromSource(app, "Dabbler.Csv.Model").restoredAt, null);
    assert.deepEqual(sourceModeActive(app), []);
  });

  it("refuses a package two build files reference", () => {
    // Switching one and leaving the other builds half against source.
    const { app, model } = solution();
    write(app, "src/other.csproj", CONSUMER_PROJECT);
    assert.throws(
      () => switchToSource(app, { packageId: "Dabbler.Csv.Model", producerRoot: model }),
      ResolutionError,
    );
  });

  it("treats an unreadable record as switched rather than as clear", () => {
    // "We cannot tell" must never resolve to "nothing is switched": that is
    // how a corrupt line turns the refusals off.
    const root = tempDir("swap-");
    write(root, ".dabbler/runs/source-mode.jsonl", "{not json\n");
    assert.throws(() => sourceModeActive(root), ResolutionError);
  });

  it("moves the declaration with the build file, and back again", () => {
    // Moving only the build file leaves the declaration saying `feed` while
    // the project builds from source: the declare-and-check model disagreeing
    // with itself on its own main path.
    const { app, model } = solution();
    switchToSource(app, { packageId: "Dabbler.Csv.Model", producerRoot: model });
    assert.equal(loadDeps(app)?.consumes[0].resolve, "source");
    restoreFromSource(app, "Dabbler.Csv.Model");
    assert.equal(loadDeps(app)?.consumes[0].resolve, "feed");
  });

  it("finds the edge even when its producer shares the package name", () => {
    // A search for the first `"id"` matches the nested producedBy object and
    // leaves the edge itself untouched.
    const { app, model } = solution();
    write(
      app,
      DEPS_FILENAME,
      JSON.stringify({
        schemaVersion: 1,
        solution: "csv-pipeline",
        repositoryId: "csv-app",
        consumes: [
          {
            producedBy: { id: "Dabbler.Csv.Model", remote: null, path: "../csv-model" },
            id: "Dabbler.Csv.Model",
            kind: "nuget",
            resolve: "feed",
          },
        ],
      }),
    );
    switchToSource(app, { packageId: "Dabbler.Csv.Model", producerRoot: model });
    assert.equal(loadDeps(app)?.consumes[0].resolve, "source");
  });

  it("changes exactly the edge it was asked about", () => {
    // A search running from an id to the next `resolve` token mutates a LATER
    // edge whenever a declaration orders its keys the other way round.
    const { app, model } = solution();
    const deps = loadDeps(app);
    write(
      app,
      DEPS_FILENAME,
      JSON.stringify({
        schemaVersion: 1,
        solution: "csv-pipeline",
        repositoryId: "csv-app",
        consumes: [
          { resolve: "feed", id: "Other.Package", kind: "nuget", producedBy: { id: "other" } },
          ...(deps?.consumes ?? []).map((edge) => ({
            id: edge.id,
            kind: edge.kind,
            producedBy: { id: edge.producedBy.id, path: edge.producedBy.path },
            resolve: edge.resolve,
            feed: edge.feed,
          })),
        ],
      }),
    );
    switchToSource(app, { packageId: "Dabbler.Csv.Model", producerRoot: model });
    const after = loadDeps(app);
    assert.equal(
      after?.consumes.find((edge) => edge.id === "Dabbler.Csv.Model")?.resolve,
      "source",
    );
    assert.equal(after?.consumes.find((edge) => edge.id === "Other.Package")?.resolve, "feed");
  });

  it("restores two swaps in any order without reviving the first", () => {
    // A whole-file snapshot restored in switch order reintroduces
    // `resolve: source` for a dependency already put back, and leaves no open
    // record able to repair it.
    const { app, model } = solution();
    const deps = loadDeps(app);
    write(
      app,
      "src/second.csproj",
      '<Project><ItemGroup><PackageReference Include="Dabbler.Csv.Writer" Version="1.0.0" /></ItemGroup></Project>',
    );
    write(
      model,
      "src/writer.csproj",
      "<Project><PropertyGroup><PackageId>Dabbler.Csv.Writer</PackageId>" +
        "<Version>1.0.0</Version></PropertyGroup></Project>",
    );
    write(
      app,
      DEPS_FILENAME,
      JSON.stringify({
        schemaVersion: 1,
        solution: "csv-pipeline",
        repositoryId: "csv-app",
        consumes: [
          ...(deps?.consumes ?? []),
          {
            id: "Dabbler.Csv.Writer",
            kind: "nuget",
            producedBy: { id: "csv-model", remote: null, path: "../csv-model" },
            resolve: "feed",
          },
        ],
      }),
    );
    switchToSource(app, { packageId: "Dabbler.Csv.Model", producerRoot: model });
    switchToSource(app, { packageId: "Dabbler.Csv.Writer", producerRoot: model });
    restoreFromSource(app, "Dabbler.Csv.Model");
    restoreFromSource(app, "Dabbler.Csv.Writer");
    assert.ok(loadDeps(app)?.consumes.every((edge) => edge.resolve === "feed"));
  });
});

describe("what a switched dependency refuses", () => {
  it("names the package and the caller in the refusal", () => {
    const { app, model } = solution();
    assert.equal(refuseIfResolvingFromSource(app, "the run of record"), null);
    switchToSource(app, { packageId: "Dabbler.Csv.Model", producerRoot: model });
    const refused = refuseIfResolvingFromSource(app, "the run of record");
    assert.match(String(refused), /Dabbler\.Csv\.Model/);
    assert.match(String(refused), /the run of record/);
    // The record is under `.dabbler`: the machine's, not the tree's.
    assert.match(sourceModePath(app), /\.dabbler/);
  });

  it("refuses on the declaration alone when the machine record is gone", () => {
    // `.dabbler` is machine state and can be deleted; the declaration is
    // tracked. "We cannot tell whether this is switched" never resolves to
    // "assume it is not".
    const { app, model } = solution();
    switchToSource(app, { packageId: "Dabbler.Csv.Model", producerRoot: model });
    rmSync(sourceModePath(app));
    assert.match(String(refuseIfResolvingFromSource(app, "the close")), /Dabbler\.Csv\.Model/);
  });

  it("refuses evidence whose window nothing observed", () => {
    // Switch, run, restore, record is the ordinary debugging sequence, and a
    // reported duration cannot distinguish it from a clean run: restore, read
    // the output, record a minute later, and the inferred start lands after
    // the restore for a run that happened before it.
    const { app, model } = solution();
    switchToSource(app, { packageId: "Dabbler.Csv.Model", producerRoot: model });
    restoreFromSource(app, "Dabbler.Csv.Model");
    assert.match(
      String(refuseIfResolvingFromSource(app, "the run of record")),
      /test-evidence run/,
    );
  });

  it("judges a framework-timed run by whether it started after the restore", () => {
    const { app, model } = solution();
    switchToSource(app, { packageId: "Dabbler.Csv.Model", producerRoot: model });
    restoreFromSource(app, "Dabbler.Csv.Model");
    const during = new Date(Date.now() - 600_000).toISOString();
    assert.match(
      String(refuseIfResolvingFromSource(app, "the run of record", { observedStart: during })),
      /while this run/,
    );
    const after = new Date(Date.now() + 60_000).toISOString();
    assert.equal(
      refuseIfResolvingFromSource(app, "the run of record", { observedStart: after }),
      null,
    );
  });

  it("stops asking once a run of record has been accepted since the restore", () => {
    // Otherwise a repository that ever used source mode would need a
    // framework-timed run forever, which is a tax on a debugging session
    // somebody finished properly.
    const { app, model } = solution();
    switchToSource(app, { packageId: "Dabbler.Csv.Model", producerRoot: model });
    const restored = restoreFromSource(app, "Dabbler.Csv.Model");
    const later = new Date(Date.parse(restored.restoredAt as string) + 1000).toISOString();
    assert.equal(refuseIfResolvingFromSource(app, "the close", { since: later }), null);
  });
});
