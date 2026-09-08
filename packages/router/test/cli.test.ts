// The command lines the lifecycle documents: `dabbler session`'s
// subcommands, `dabbler status` and `dabbler modules`.
//
// The parser's whole grammar is not the contract, the flags the lifecycle
// documents are -- so what is asserted here is that every documented flag
// reaches the function it names, and that a flag nobody documented is a
// usage error rather than a silent no-op. A misspelled `--not-releasable`
// that parsed as nothing would publish.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { moduleVerb } from "../src/cli/module.ts";
import { modulesVerb } from "../src/cli/modules.ts";
import { packagingVerb } from "../src/cli/packaging.ts";
import { HANDLERS } from "../src/cli/registry.ts";
import { sessionVerb } from "../src/cli/session.ts";
import { statusVerb } from "../src/cli/status.ts";
import { extensionAbove, versionVerb } from "../src/cli/version.ts";
import { VERBS } from "../src/contracts/verbs.ts";
import { VERSION } from "../src/version.ts";
import { readCandidateRecord } from "../src/impact.ts";
import { readBundleRecord } from "../src/land.ts";
import { capture } from "../src/output.ts";
import { readRawSessionState } from "../src/progress.ts";
import { declareSessionTask, registerSessionStart } from "../src/writers.ts";
import { makeAnsweredSandbox, tempDir } from "./support/answers.ts";

/** A two-module manifest: a library an application depends on, no package of its own. */
const APPLICATION_MANIFEST = [
  "modules:",
  "  - slug: lib",
  "    kind: library",
  "    codeRoots: [modules/lib]",
  "    package: SomeLib",
  "  - slug: app",
  "    kind: application",
  "    codeRoots: [modules/app]",
  "    dependsOn: [lib]",
  "",
].join("\n");

/** The same two modules as a Maven solution: the model as a jar, an application over it. */
const MAVEN_MANIFEST = [
  "modules:",
  "  - slug: model",
  "    kind: shared-types",
  "    codeRoots: [modules/model]",
  "    package: com.example:json-model",
  "  - slug: app",
  "    kind: application",
  "    codeRoots: [modules/app]",
  "    dependsOn: [model]",
  "",
].join("\n");

const DOTNET_MANIFEST = [
  "modules:",
  "  - slug: model",
  "    kind: shared-types",
  "    codeRoots: [modules/model]",
  "    package: JsonModel",
  "  - slug: app",
  "    kind: application",
  "    codeRoots: [modules/app]",
  "    dependsOn: [model]",
  "",
].join("\n");

const MAVEN_PARENT_POM = [
  "<project>",
  "  <groupId>com.example</groupId>",
  "  <artifactId>solution-parent</artifactId>",
  "  <version>${revision}</version>",
  "  <packaging>pom</packaging>",
  "  <dependencyManagement>",
  "    <dependencies>",
  "    </dependencies>",
  "  </dependencyManagement>",
  "</project>",
  "",
].join("\n");

const mavenModulePom = (artifactId: string): string =>
  [
    "<project>",
    "  <parent>",
    "    <groupId>com.example</groupId>",
    "    <artifactId>solution-parent</artifactId>",
    "    <version>${revision}</version>",
    "    <relativePath>../../pom.xml</relativePath>",
    "  </parent>",
    `  <artifactId>${artifactId}</artifactId>`,
    "</project>",
    "",
  ].join("\n");

/**
 * A pack that leaves exactly the artifact the ecosystem looks for, so the
 * CLI's own path can be exercised on a machine with neither dotnet nor mvn:
 * the third argument is where to write it, under the output folder.
 */
const FAKE_PACK = [
  "import { mkdirSync, writeFileSync } from 'node:fs';",
  "import { dirname, join } from 'node:path';",
  "const [output, version, template] = process.argv.slice(2);",
  "const artifact = join(output, ...template.split('{v}').join(version).split('/'));",
  "mkdirSync(dirname(artifact), { recursive: true });",
  "writeFileSync(artifact, 'bytes');",
  "",
].join("\n");

/** `modules.<slug>.packaging` naming that pack, and the push it is never without. */
const packDeclaration = (slug: string, artifact: string): string =>
  [
    "schema_version: 1",
    "modules:",
    `  ${slug}:`,
    "    packaging:",
    "      pack:",
    `        argv: [node, tools/fake-pack.mjs, "{output}", "{version}", "${artifact}"]`,
    "      push:",
    '        argv: [node, tools/fake-pack.mjs, "{artifact}", "{feed}"]',
    "        feed: /feeds/local",
    "",
  ].join("\n");

async function run(
  verb: () => Promise<number> | number,
): Promise<{ code: number; out: string; err: string }> {
  const collected = await capture(() => Promise.resolve(verb()));
  return { code: collected.value, out: collected.stdout, err: collected.stderr };
}

describe("dabbler packaging --dry-run", () => {
  it("exits 0 in a session that may not publish when the declaration loads, and says no gate was asked", async () => {
    // A rehearsal that exited 1 on releasability alone, one line under a
    // sentence saying every gate passed, could not be named by a plan check
    // in the sessions before the one that publishes -- which is every
    // session in which the declaration is written.
    const { repo, sessionsDir } = makeAnsweredSandbox();
    writeFileSync(
      join(repo, "dabbler.yaml"),
      [
        "schema_version: 1",
        "packaging:",
        "  pack:",
        '    argv: ["dotnet", "pack", "-c", "Release", "-o", "{output}"]',
        "  push:",
        '    argv: ["dotnet", "nuget", "push", "{artifact}", "--source", "{feed}"]',
        "    feed: /feeds/local",
        "",
      ].join("\n"),
      "utf8",
    );
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    declareSessionTask(sessionsDir, { sessionNumber: 1, task: "refactor only", releasable: false });
    const result = await run(() => packagingVerb(["--dry-run", "--sessions-dir", sessionsDir]));
    assert.equal(result.code, 0, result.err);
    assert.match(result.out, /No gate was asked/);
    assert.doesNotMatch(result.out, /Every gate the close reads passes/);
  });
});

describe("dabbler version", () => {
  it("prints the manifest's version, and the extension's only when one is above the package", async () => {
    const result = await run(() => versionVerb([]));
    assert.equal(result.code, 0);
    assert.equal(result.out.trim().split("\n")[0], `dabbler-ai-router ${VERSION}`);
    // A development checkout sits under no extension; the VSIX puts the
    // bundle under a manifest that declares `engines.vscode`.
    const extension = tempDir("ext-");
    writeFileSync(
      join(extension, "package.json"),
      JSON.stringify({ name: "some-extension", version: "9.9.9", engines: { vscode: "^1.90.0" } }),
      "utf8",
    );
    mkdirSync(join(extension, "dist"), { recursive: true });
    assert.deepEqual(extensionAbove(join(extension, "dist")), ["some-extension", "9.9.9"]);
    assert.equal(extensionAbove(tempDir("no-ext-")), null);
  });
});

describe("dabbler session, the whole surface", () => {
  it("registers every subcommand the lifecycle documents", async () => {
    const result = await run(() => sessionVerb(["--help"]));
    for (const name of [
      "start",
      "decision",
      "declare",
      "plan",
      "close",
      "cancel",
      "restore",
      "migrate",
    ]) {
      assert.ok(result.out.includes(name), name);
    }
    assert.ok(!result.out.includes("not yet"));
  });

  it("refuses a subcommand that does not exist, and says so differently", async () => {
    const result = await run(() => sessionVerb(["clsoe"]));
    assert.equal(result.code, 2);
    assert.match(result.err, /is not a subcommand/);
  });

  it("answers --help on a SUBCOMMAND with that subcommand's own arguments", async () => {
    // `--help` was read by the option parser as a flag expecting a value, so
    // the one way to discover a subcommand's arguments was to run it bare and
    // read a refusal -- which names what is required and never what is
    // optional.
    for (const [subcommand, flag, expected] of [
      ["start", "--help", "--engine"],
      ["declare", "-h", "--releasable"],
      ["plan", "--help", "--max-rounds"],
    ] as const) {
      const result = await run(() => sessionVerb([subcommand, flag]));
      assert.equal(result.code, 0, subcommand);
      assert.ok(result.out.includes(expected), `${subcommand} ${expected}`);
      assert.ok(!result.err.includes("expected one argument"));
    }
  });

  it("runs the close read-only under --dry-run", async () => {
    const { sessionsDir } = makeAnsweredSandbox();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    const result = await run(() => sessionVerb(["close", "--dry-run", "--sessions-dir", sessionsDir]));
    assert.equal(result.code, 1);
    assert.match(result.out, /gates pass; nothing written\./);
    // One bullet per gate, indented under the close's own sentences.
    assert.match(result.out, /^ {4}- verification_clean +(PASS|FAIL|SKIP)/m);
    const record = (readRawSessionState(sessionsDir)?.["sessions"] as Record<string, unknown>[])[0];
    assert.equal(record?.["status"], "in-progress");
  });

  it("takes the session number for cancel as a positional, and refuses a forced cancel from an engine", async () => {
    const { sessionsDir } = makeAnsweredSandbox();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    // Who is asking is read from the environment: a person's shell has
    // neither marker, and the suite may itself be running under one.
    const saved = { driven: process.env["DABBLER_DRIVEN"], claude: process.env["CLAUDECODE"] };
    const restoreEnv = () => {
      for (const [key, value] of [["DABBLER_DRIVEN", saved.driven], ["CLAUDECODE", saved.claude]] as const) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    };
    try {
      process.env["DABBLER_DRIVEN"] = "1";
      delete process.env["CLAUDECODE"];
      const engine = await run(() =>
        sessionVerb(["cancel", "1", "--reason", "stop", "--force", "--sessions-dir", sessionsDir]),
      );
      assert.equal(engine.code, 3);
      assert.match(engine.err, /a person's verb, never the engine's/);
      delete process.env["DABBLER_DRIVEN"];
      const person = await run(() =>
        sessionVerb(["cancel", "1", "--reason", "stop", "--force", "--sessions-dir", sessionsDir]),
      );
      assert.equal(person.code, 0);
      assert.match(person.out, /"status": "cancelled"/);
    } finally {
      restoreEnv();
    }
  });

  it("requires the reason a cancellation is recorded under", async () => {
    const { sessionsDir } = makeAnsweredSandbox();
    const result = await run(() => sessionVerb(["cancel", "1", "--sessions-dir", sessionsDir]));
    assert.equal(result.code, 2);
    assert.match(result.err, /--reason/);
  });

  it("refuses a session number that is not one, and requires the positional", async () => {
    const { sessionsDir } = makeAnsweredSandbox();
    const notANumber = await run(() => sessionVerb(["restore", "one", "--sessions-dir", sessionsDir]));
    assert.equal(notANumber.code, 2);
    assert.match(notANumber.err, /invalid int value/);

    const missing = await run(() => sessionVerb(["restore", "--sessions-dir", sessionsDir]));
    assert.equal(missing.code, 2);
    assert.match(missing.err, /session_number/);
  });

  it("takes the plan prose inline or from a file, and never both", async () => {
    const { sessionsDir } = makeAnsweredSandbox();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    const both = await run(() =>
      sessionVerb(["plan", "--body", "a", "--body-file", "b", "--sessions-dir", sessionsDir]),
    );
    assert.equal(both.code, 2);
    assert.match(both.err, /not allowed with argument --body/);

    const neither = await run(() => sessionVerb(["plan", "--sessions-dir", sessionsDir]));
    assert.equal(neither.code, 2);
    assert.match(neither.err, /one of the arguments --body --body-file/);

    const ok = await run(() =>
      sessionVerb(["plan", "--body", "The plan.", "--sessions-dir", sessionsDir]),
    );
    assert.equal(ok.code, 0);
    assert.match(readFileSync(join(sessionsDir, "project-work-plan.md"), "utf8"), /The plan\./);
  });

  it("requires the legacy directory a migration reads", async () => {
    const { sessionsDir } = makeAnsweredSandbox();
    const result = await run(() => sessionVerb(["migrate", "--sessions-dir", sessionsDir]));
    assert.equal(result.code, 2);
    assert.match(result.err, /legacy_set_dir/);
  });
});

describe("dabbler status", () => {
  it("emits the projection as indented JSON, in one output mode", async () => {
    // `--json` is what the projection IS, not a switch between two shapes.
    const { sessionsDir } = makeAnsweredSandbox();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    const bare = await run(() => statusVerb(["--sessions-dir", sessionsDir]));
    assert.equal(bare.code, 0);
    const projection = JSON.parse(bare.out) as Record<string, unknown>;
    assert.equal(projection["schemaVersion"], 1);
    assert.equal((projection["sessions"] as unknown[]).length, 2);

    const flagged = await run(() => statusVerb(["--json", "--sessions-dir", sessionsDir]));
    const strip = (text: string): string =>
      text.replace(/"generatedAt": "[^"]*"/, '"generatedAt": "<ts>"');
    assert.equal(strip(flagged.out), strip(bare.out));
  });

  it("is the one name for the projection, and `progress` is not a verb", async () => {
    // `status` is what the operator was promised when the run core's own
    // `status` went away. It was an alias over `progress` for one session,
    // because the extension spawned `progress`; the extension calls a method
    // now, so the second name has nothing holding it up.
    assert.ok(!VERBS.map((spec) => spec.verb).includes("progress"));
    assert.equal(HANDLERS["progress"], undefined);
    assert.match((await run(() => statusVerb(["--help"]))).out, /usage: dabbler status/);
  });

  it("refuses a sessions root that is not a directory, and an argument it does not know", async () => {
    const absent = await run(() =>
      statusVerb(["--sessions-dir", join(tempDir("cli-"), "nowhere")]),
    );
    assert.equal(absent.code, 2);
    assert.match(absent.err, /not a directory/);

    const unknown = await run(() => statusVerb(["--sessions"]));
    assert.equal(unknown.code, 2);
    assert.match(unknown.err, /unrecognized argument/);
  });
});

describe("dabbler modules", () => {
  it("refuses a subcommand it does not have", async () => {
    const result = await run(() => modulesVerb(["retire", tempDir("cli-")]));
    assert.equal(result.code, 2);
    assert.match(result.err, /is not a subcommand/);
  });

  it("creates with the module vocabulary and shows it back with usedBy derived", async () => {
    const root = tempDir("cli-");
    const model = await run(() =>
      modulesVerb([
        "create", root, "--slug", "model", "--title", "Model",
        "--kind", "shared-types", "--package", "CsvModel", "--code-root", "modules/model",
      ]),
    );
    assert.equal(model.code, 0);
    const persister = await run(() =>
      modulesVerb([
        "create", root, "--slug", "persister", "--title", "Persister",
        "--depends-on", "model", "--package", "CsvPersister", "--contract", "designed",
      ]),
    );
    assert.equal(persister.code, 0);
    const shown = await run(() => modulesVerb(["show", root]));
    assert.equal(shown.code, 0);
    const doc = JSON.parse(shown.out) as {
      multi: boolean;
      modules: { slug: string; kind: string; contract: string | null; usedBy: string[] }[];
    };
    assert.equal(doc.multi, true);
    assert.deepEqual(doc.modules.map((m) => m.slug), ["model", "persister"]);
    assert.deepEqual(doc.modules[0], {
      slug: "model", title: "Model", kind: "shared-types", package: "CsvModel",
      contract: "package", codeRoots: ["modules/model"], dependsOn: [], usedBy: ["persister"],
      // Neither module is an application, so nothing here ships on its own.
      shipsIn: [],
    });
    assert.equal(doc.modules[1]?.contract, "designed");
    // The verb that moved the manifest rewrote the projection the Solution
    // Explorer reads, so a terminal `create` shows up in the tree.
    const projected = JSON.parse(
      readFileSync(join(root, ".dabbler", "solution", "projection.json"), "utf8"),
    ) as { modules: { slug: string }[] };
    assert.deepEqual(projected.modules.map((m) => m.slug), ["model", "persister"]);
    // A dependency the manifest does not declare is refused at write time.
    const dangling = await run(() =>
      modulesVerb(["create", root, "--slug", "x", "--title", "X", "--depends-on", "nope"]),
    );
    assert.equal(dangling.code, 1);
    assert.match(dangling.err, /does not declare/);
  });

  it("passes the root positionally and collects each repeatable flag", async () => {
    const root = tempDir("cli-");
    const result = await run(() =>
      modulesVerb([
        "create",
        root,
        "--slug",
        "greeter",
        "--title",
        "Greeter",
        "--code-root",
        "src/greeter",
        "--code-root",
        "tests/greeter",
      ]),
    );
    assert.equal(result.code, 0);
    const manifest = readFileSync(join(root, "docs", "modules.yaml"), "utf8");
    assert.match(manifest, /src\/greeter/);
    assert.match(manifest, /tests\/greeter/);
  });

  it("requires the slug and the title, which the CLI does not default", async () => {
    const result = await run(() => modulesVerb(["create", tempDir("cli-")]));
    assert.equal(result.code, 2);
    assert.match(result.err, /--slug, --title/);
  });

  it("refuses a workspace root that is not a directory", async () => {
    const result = await run(() =>
      modulesVerb(["create", join(tempDir("cli-"), "nowhere"), "--slug", "a", "--title", "A"]),
    );
    assert.equal(result.code, 2);
    assert.match(result.err, /not a directory/);
  });
});

describe("dabbler module", () => {
  it("refuses a subcommand it does not have, and a contract in a single-module solution", async () => {
    const unknown = await run(() => moduleVerb(["retire", tempDir("cli-")]));
    assert.equal(unknown.code, 2);
    assert.match(unknown.err, /is not a subcommand/);
    // The repository is the module: there is no seam to scaffold.
    const single = tempDir("cli-");
    const refused = await run(() => moduleVerb(["contract", "whole", "--workspace-root", single]));
    assert.equal(refused.code, 1);
    assert.match(refused.err, /single-module solution/);
  });

  it("packs a not-releasable session's application module and writes no bundle", async () => {
    // `module pack` only ever writes dev versions, and a bundle names
    // released ones; a solution that never publishes to a feed must still
    // be able to close a session that only touches an application module.
    const { repo, sessionsDir } = makeAnsweredSandbox({ "docs/modules.yaml": APPLICATION_MANIFEST });
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    declareSessionTask(sessionsDir, { sessionNumber: 1, task: "touch the app", releasable: false });
    const result = await run(() =>
      moduleVerb(["candidate", "--session", "1", "--workspace-root", repo, "app"]),
    );
    assert.equal(result.code, 0, result.err);
    assert.doesNotMatch(result.out, /bundled/);
    assert.equal(readBundleRecord(repo, "app"), null);
  });

  it("bundles a releasable session's application module, and still refuses a dev-versioned dependency", async () => {
    const { repo, sessionsDir } = makeAnsweredSandbox({
      "docs/modules.yaml": APPLICATION_MANIFEST,
      "modules/app/App.sln": "",
      "Directory.Packages.props":
        '<Project><ItemGroup><PackageVersion Include="SomeLib" ' +
        'Version="1.0.0-dev.20260907.1.gabc1234" /></ItemGroup></Project>\n',
    });
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    declareSessionTask(sessionsDir, { sessionNumber: 1, task: "ship the app", releasable: true });
    const devPinned = await run(() =>
      moduleVerb(["candidate", "--session", "1", "--workspace-root", repo, "app"]),
    );
    assert.equal(devPinned.code, 1);
    assert.match(devPinned.err, /SomeLib is pinned at 1\.0\.0-dev\.20260907\.1\.gabc1234, a dev version/);
    assert.equal(readBundleRecord(repo, "app"), null);

    writeFileSync(
      join(repo, "Directory.Packages.props"),
      '<Project><ItemGroup><PackageVersion Include="SomeLib" Version="1.0.0" /></ItemGroup></Project>\n',
      "utf8",
    );
    const released = await run(() =>
      moduleVerb(["candidate", "--session", "1", "--workspace-root", repo, "app"]),
    );
    assert.equal(released.code, 0, released.err);
    assert.match(released.out, /bundled app/);
    assert.equal(readBundleRecord(repo, "app")?.dependencies[0]?.package, "SomeLib");
    assert.equal(readBundleRecord(repo, "app")?.dependencies[0]?.version, "1.0.0");
  });

  it("names the pin file the Maven seam wrote, and records it as the candidate's", async () => {
    // The message and the candidate record used to hold the literal
    // `Directory.Packages.props`, which does not exist in a Maven solution:
    // the pin moves the root pom.xml, so the record named a file that was
    // never written and left the one that was unaccounted for -- and the
    // land's verification gate reads that record to tell the framework's
    // own derivation from a tree that moved.
    const { repo, sessionsDir } = makeAnsweredSandbox({
      "docs/modules.yaml": MAVEN_MANIFEST,
      "pom.xml": MAVEN_PARENT_POM,
      "modules/model/pom.xml": mavenModulePom("json-model"),
      "modules/model/contract/README.md": "# json-model\n",
      "modules/app/pom.xml": mavenModulePom("json-app"),
      "dabbler.yaml": packDeclaration("model", "com/example/json-model/{v}/json-model-{v}.jar"),
      "tools/fake-pack.mjs": FAKE_PACK,
    });
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    declareSessionTask(sessionsDir, { sessionNumber: 1, task: "pack the model", releasable: false });
    const result = await run(() =>
      moduleVerb(["candidate", "--session", "1", "--workspace-root", repo, "model"]),
    );
    assert.equal(result.code, 0, result.err);
    assert.match(result.out, /pinned com\.example:json-model in pom\.xml/);
    assert.doesNotMatch(result.out, /Directory\.Packages\.props/);
    const recorded = readCandidateRecord(repo, 1).paths.map((entry) => entry.path);
    assert.ok(recorded.includes("pom.xml"), recorded.join(", "));
    assert.ok(!recorded.includes("Directory.Packages.props"), recorded.join(", "));
  });

  it("names Directory.Packages.props for a .NET module, and records that", async () => {
    const { repo, sessionsDir } = makeAnsweredSandbox({
      "docs/modules.yaml": DOTNET_MANIFEST,
      "modules/model/JsonModel/JsonModel.csproj": '<Project Sdk="Microsoft.NET.Sdk" />\n',
      "modules/model/contract/README.md": "# JsonModel\n",
      "modules/app/App/App.csproj": '<Project Sdk="Microsoft.NET.Sdk" />\n',
      "dabbler.yaml": packDeclaration("model", "JsonModel.{v}.nupkg"),
      "tools/fake-pack.mjs": FAKE_PACK,
    });
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    declareSessionTask(sessionsDir, { sessionNumber: 1, task: "pack the model", releasable: false });
    const result = await run(() =>
      moduleVerb(["candidate", "--session", "1", "--workspace-root", repo, "model"]),
    );
    assert.equal(result.code, 0, result.err);
    assert.match(result.out, /pinned JsonModel in Directory\.Packages\.props/);
    assert.ok(readCandidateRecord(repo, 1).paths.some((entry) => entry.path === "Directory.Packages.props"));
  });
});

describe("the verb registry", () => {
  it("has a handler for every verb the table offers", () => {
    for (const spec of VERBS) {
      assert.equal(typeof HANDLERS[spec.verb], "function", spec.verb);
    }
  });
});

describe("dabbler session run", () => {
  it("refuses when no session is in flight, naming the registration it needs", async () => {
    const { sessionsDir } = makeAnsweredSandbox();
    const result = await run(() => sessionVerb(["run", "--sessions-dir", sessionsDir]));
    assert.notEqual(result.code, 0);
    assert.match(result.err, /no session is in flight/);
    // `start`, not `next`: registration left `next` in session 90, so a
    // refusal that still named `next` would send the operator to a verb
    // that now refuses them back.
    assert.match(result.err, /session start/);
  });
});

