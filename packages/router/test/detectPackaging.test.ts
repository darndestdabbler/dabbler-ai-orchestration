// What a repository says it publishes, read from its own build files.
//
// The property worth pinning is that this is a READING and not an inference:
// a .NET repository that publishes nothing is the ordinary case, and the
// difference between the two is a statement the build file makes. The
// reading itself walks a directory, so these seed one; the block the
// framework writes is a function of a recipe and is asserted from literals.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  appendPackagingToProjectConfig,
  declaresPackage,
  declaresPackaging,
  detectPackaging,
  renderPackagingBlock,
} from "../src/bootstrap/detect.ts";
import { readText } from "../src/textfile.ts";
import { seed, tempDir } from "./support/answers.ts";

function repoWith(files: Record<string, string>): string {
  const root = tempDir("detect-");
  seed(root, files);
  return root;
}

const LIBRARY =
  "<Project><PropertyGroup><PackageId>Dabbler.Csv.Model</PackageId>" +
  "<TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>";

const APPLICATION =
  "<Project><PropertyGroup><OutputType>Exe</OutputType>" +
  "<TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>";

describe("what a build file says about publishing", () => {
  it("reads package metadata as the statement that this is a package", () => {
    assert.equal(declaresPackage(LIBRARY), true);
    assert.equal(declaresPackage(APPLICATION), false);
  });

  it("derives pack and push for a project that means to be published", () => {
    const found = detectPackaging(repoWith({ "model.csproj": LIBRARY }));
    assert.equal(found.recipe?.key, "dotnet");
    assert.ok(found.recipe?.pack.includes("{output}"));
    assert.ok(found.recipe?.push.includes("{secret}"));
  });

  it("declares nothing for an application, and says why", () => {
    // Packing it produces a nupkg nobody wanted.
    const found = detectPackaging(repoWith({ "app.csproj": APPLICATION }));
    assert.equal(found.recipe, null);
    assert.match(String(found.reason), /package metadata/);
  });

  it("declares nothing when the projects are below the root, and says why", () => {
    // A pack command declares no working directory, so a line naming one of
    // them fails the first time it runs. Silence that explains itself is what
    // separates a framework the operator trusts from one they work around.
    const found = detectPackaging(repoWith({ "src/model.csproj": LIBRARY }));
    assert.equal(found.recipe, null);
    assert.match(String(found.reason), /below the repository root/);
  });

  it("declares nothing for Maven, and says which contract it does not fit", () => {
    // `project.build.directory` is set in the POM and is not reliably
    // overridable from the command line, so `{output}` has nowhere to go; and
    // Maven authenticates through a <server> in settings.xml keyed by a
    // repository id, so a credential on the command line is read as the name
    // of a server. A detected line that fails the first time it runs is worse
    // than an honest absence.
    const found = detectPackaging(repoWith({ "pom.xml": "<project></project>" }));
    assert.equal(found.recipe, null);
    assert.match(String(found.reason), /settings\.xml/);
  });

  it("refuses to pick between two packable projects", () => {
    // Which of them publishes decides where an artifact carrying the
    // operator's name arrives, and filesystem order is not an answer to it.
    const found = detectPackaging(repoWith({ "a.csproj": LIBRARY, "b.csproj": LIBRARY }));
    assert.equal(found.recipe, null);
    assert.match(String(found.reason), /both declare package metadata/);
  });
});

describe("the block the framework writes", () => {
  it("quotes a value that would otherwise rewrite the document round it", () => {
    // The framework writes this file on the operator's behalf, so it does not
    // get to produce one that parses differently than it reads.
    const block = renderPackagingBlock(
      { key: "dotnet", pack: ["dotnet"], push: ["dotnet"] },
      "https://feed.invalid/index.json # not a comment",
      "PAT",
    );
    assert.match(block, /feed: "https:\/\/feed\.invalid\/index\.json # not a comment"/);
  });

  it("renders argv and never a shell string", () => {
    // A credential in a shell string is a credential a shell can re-split.
    const block = renderPackagingBlock(
      {
        key: "dotnet",
        pack: ["dotnet", "pack", "-o", "{output}"],
        push: ["dotnet", "nuget"],
      },
      "https://feed.invalid/index.json",
      "DABBLER_FEED_PAT",
    );
    assert.match(block, /argv: \["dotnet", "pack", "-o", "\{output\}"\]/);
    assert.match(block, /secret: "DABBLER_FEED_PAT"/);
  });

  it("writes the credential's name and never a credential", () => {
    const root = repoWith({ "dabbler.yaml": "version: 1\n", "model.csproj": LIBRARY });
    const recipe = detectPackaging(root).recipe;
    const path = appendPackagingToProjectConfig(
      root,
      recipe as NonNullable<typeof recipe>,
      "https://feed.invalid/index.json",
      "DABBLER_FEED_PAT",
    );
    assert.notEqual(path, null);
    assert.match(readText(path as string), /secret: "DABBLER_FEED_PAT"/);
    assert.equal(declaresPackaging(root), true);
  });

  it("declines a file that already states how this repository publishes", () => {
    // A second mapping key produces a document whose later copy silently
    // wins, and how a repository publishes is not something to overwrite.
    const root = repoWith({
      "dabbler.yaml": 'packaging:\n  pack:\n    argv: ["true"]\n',
      "model.csproj": LIBRARY,
    });
    const recipe = detectPackaging(root).recipe;
    assert.equal(
      appendPackagingToProjectConfig(
        root,
        recipe as NonNullable<typeof recipe>,
        "https://feed.invalid/index.json",
        "DABBLER_FEED_PAT",
      ),
      null,
    );
  });

  it("declines a repository with no dabbler.yaml to write into", () => {
    const root = repoWith({ "model.csproj": LIBRARY });
    const recipe = detectPackaging(root).recipe;
    assert.equal(
      appendPackagingToProjectConfig(
        root,
        recipe as NonNullable<typeof recipe>,
        "https://feed.invalid/index.json",
        "DABBLER_FEED_PAT",
      ),
      null,
    );
    assert.equal(declaresPackaging(root), false);
  });
});
