// What bootstrap/detect.ts declares for a repository it finds.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parse as parseYaml } from "yaml";

import { detectEcosystems, frameworkProjects, renderProjectConfig } from "../src/bootstrap/detect.ts";
import { loadSelectionConfig, selectTests } from "../src/checks.ts";
import { seed, tempDir } from "./support/answers.ts";

const SDK = '<Project Sdk="Microsoft.NET.Sdk"></Project>\n';

describe("detectEcosystems", () => {
  it("declares a .NET solution's own root as its test root, so a test project at the root is claimed", () => {
    // A field report: `X.Tests/` beside `X/`, under a declared `tests` root,
    // had named tests selected for none of its projects.
    const project = tempDir("detect-");
    seed(project, { "Acme.sln": "\n", "Acme.Tests/Acme.Tests.csproj": SDK });
    const dotnet = detectEcosystems(project)[0];
    assert.equal(dotnet?.key, "dotnet");
    assert.deepEqual(dotnet?.testRoots, ["."]);
  });

  it("names a solution file below the root in the suite it declares", () => {
    const project = tempDir("detect-");
    seed(project, { "src/Thing.sln": "\n", "src/Thing.Web/Thing.Web.csproj": SDK });
    const dotnet = detectEcosystems(project).find((eco) => eco.key === "dotnet");
    assert.equal(dotnet?.command, "dotnet test src/Thing.sln");
    assert.equal(dotnet?.select, "dotnet test src/Thing.sln --filter {names}");
  });

  it("declares a non-SDK project as dotnet-framework, with no suite command", () => {
    const project = tempDir("detect-");
    seed(project, {
      "Thing.sln": "\n",
      "Thing.Web/Thing.Web.csproj":
        '<?xml version="1.0" encoding="utf-8"?>\n<Project ToolsVersion="15.0" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">\n</Project>\n',
    });
    assert.deepEqual(detectEcosystems(project), []);
    assert.deepEqual(frameworkProjects(project), ["Thing.Web/Thing.Web.csproj"]);
    const config = renderProjectConfig([], frameworkProjects(project));
    assert.match(config, /dotnet-framework: no suite command/);
    assert.doesNotMatch(config, /^\s*command: dotnet test/m);
  });

  it("names a Java source file's tests in the singular and the plural", () => {
    const project = tempDir("detect-");
    seed(project, {
      "pom.xml": "<project/>\n",
      "src/main/java/acme/FooService.java": "class FooService {}\n",
      "src/test/java/acme/FooServiceTest.java": "class FooServiceTest {}\n",
      "src/test/java/acme/FooServiceTests.java": "class FooServiceTests {}\n",
    });
    const config = parseYaml(renderProjectConfig(detectEcosystems(project)), { version: "1.1" });
    const selection = loadSelectionConfig(config);
    assert.deepEqual(selection.errors, []);
    const selected = selectTests(project, ["src/main/java/acme/FooService.java"], selection.config);
    assert.deepEqual([...selected.testPaths].sort(), [
      "src/test/java/acme/FooServiceTest.java",
      "src/test/java/acme/FooServiceTests.java",
    ]);
  });

  it("declares Gradle from a build.gradle.kts", () => {
    const project = tempDir("detect-");
    seed(project, { "build.gradle.kts": "\n" });
    assert.equal(detectEcosystems(project)[0]?.key, "gradle");
  });
});
