// What bootstrap/detect.ts declares for a repository it finds.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parse as parseYaml } from "yaml";

import { detectEcosystems, frameworkCompile, frameworkProjects, renderProjectConfig } from "../src/bootstrap/detect.ts";
import { loadSelectionConfig, selectTests } from "../src/checks.ts";
import { seed, tempDir } from "./support/answers.ts";

const SDK = '<Project Sdk="Microsoft.NET.Sdk"></Project>\n';
const CLASSIC = (body: string): string =>
  `<?xml version="1.0" encoding="utf-8"?>\n<Project ToolsVersion="15.0" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">${body}</Project>\n`;

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

  it("declares a non-SDK solution's MSBuild compile control and its vstest suite over the assembly each test project builds", () => {
    const project = tempDir("detect-");
    seed(project, {
      "Thing.sln": "\n",
      "Thing.Web/Thing.Web.csproj": CLASSIC(""),
      "Thing.Tests/Thing.Tests.csproj": CLASSIC(
        "<PropertyGroup><AssemblyName>Acme.Thing.Tests</AssemblyName></PropertyGroup>" +
          `<PropertyGroup Condition=" '$(Configuration)|$(Platform)' == 'Debug|AnyCPU' "><OutputPath>out\\Debug\\</OutputPath></PropertyGroup>`,
      ),
      "Thing.Tests/packages.config": '<packages><package id="xunit.runner.visualstudio" version="2.4.5" /></packages>\n',
    });
    assert.deepEqual(frameworkProjects(project), ["Thing.Tests/Thing.Tests.csproj", "Thing.Web/Thing.Web.csproj"]);
    const config = parseYaml(renderProjectConfig(detectEcosystems(project), frameworkCompile(project)), { version: "1.1" }) as {
      testing: { suites: Array<Record<string, unknown>>; controls: Array<Record<string, unknown>> };
    };
    assert.deepEqual(config.testing.controls, [
      {
        name: "compile",
        kind: "compile",
        command: '{msbuild} "Thing.sln" /restore /t:Build /p:RestorePackagesConfig=true /p:Configuration=Debug /v:minimal /nologo',
        required: true,
      },
    ]);
    const [suite] = config.testing.suites;
    assert.equal(suite?.["name"], "dotnet-framework");
    assert.equal(suite?.["command"], '{vstest} "Thing.Tests\\out\\Debug\\Acme.Thing.Tests.dll" "/logger:console;verbosity=minimal"');
    assert.match(String(suite?.["select"]), /\/TestCaseFilter:FullyQualifiedName~\{names\}$/);
    assert.equal(suite?.["select_separator"], "|FullyQualifiedName~");
  });

  it("declares a Fixie 1 test project's own console runner, run whole, and says why", () => {
    const project = tempDir("detect-");
    seed(project, {
      "Thing.sln": "\n",
      "Thing.Tests/Thing.Tests.csproj": CLASSIC(""),
      "Thing.Tests/packages.config": '<packages><package id="Fixie" version="1.0.2" targetFramework="net45" /></packages>\n',
    });
    const [fixie] = detectEcosystems(project);
    assert.equal(fixie?.command, '"packages\\Fixie.1.0.2\\lib\\net45\\Fixie.Console.exe" "Thing.Tests\\bin\\Debug\\Thing.Tests.dll"');
    assert.equal(fixie?.runsWhole, true);
    assert.equal(fixie?.select, undefined);
    assert.match(renderProjectConfig(detectEcosystems(project)), /# Fixie 1 runs under its own console, which vstest cannot drive/);
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
