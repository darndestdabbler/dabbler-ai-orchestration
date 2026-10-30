// The solution's shape, read from its build files: a .NET solution file and
// its project references, a Maven reactor and its sibling dependencies, and a
// repository with neither.

import assert from "node:assert/strict";
import { basename } from "node:path";
import { describe, it } from "node:test";

import { readProjectGraph, usedBy } from "../src/projectGraph.ts";
import { seed, tempDir } from "./support/answers.ts";

describe("the project graph", () => {
  it("reads a .slnx's web project, library and test project with their kinds and references", () => {
    const root = tempDir("graph-dotnet-");
    seed(root, {
      "Csv.slnx":
        "<Solution>\n" +
        '  <Project Path="src/Csv.Api/Csv.Api.csproj" />\n' +
        '  <Project Path="src/Csv.Model/Csv.Model.csproj" />\n' +
        '  <Project Path="tests/Csv.Tests/Csv.Tests.csproj" />\n' +
        "</Solution>\n",
      "src/Csv.Api/Csv.Api.csproj":
        '<Project Sdk="Microsoft.NET.Sdk.Web">\n' +
        '  <ItemGroup><ProjectReference Include="..\\Csv.Model\\Csv.Model.csproj" /></ItemGroup>\n' +
        "</Project>\n",
      "src/Csv.Model/Csv.Model.csproj": '<Project Sdk="Microsoft.NET.Sdk"></Project>\n',
      "tests/Csv.Tests/Csv.Tests.csproj":
        '<Project Sdk="Microsoft.NET.Sdk">\n' +
        "  <ItemGroup>\n" +
        '    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.11.1" />\n' +
        '    <ProjectReference Include="../../src/Csv.Api/Csv.Api.csproj" />\n' +
        '    <ProjectReference Include="../../src/Csv.Model/Csv.Model.csproj" />\n' +
        "  </ItemGroup>\n" +
        "</Project>\n",
      // Not in the solution file, so not in the solution.
      "scratch/Stray/Stray.csproj": "<Project />\n",
    });
    const graph = readProjectGraph(root);
    assert.equal(graph.ecosystem, "dotnet");
    assert.deepEqual(
      graph.projects.map((project) => [project.name, project.kind, project.path, project.dependsOn]),
      [
        ["Csv.Model", "library", "src/Csv.Model/Csv.Model.csproj", []],
        ["Csv.Api", "service", "src/Csv.Api/Csv.Api.csproj", ["Csv.Model"]],
        ["Csv.Tests", "test", "tests/Csv.Tests/Csv.Tests.csproj", ["Csv.Api", "Csv.Model"]],
      ],
    );
    assert.deepEqual(usedBy(graph, "Csv.Model"), ["Csv.Api", "Csv.Tests"]);
  });

  it("scans for the projects when the solution file lists none", () => {
    const root = tempDir("graph-empty-slnx-");
    seed(root, {
      "Csv.slnx": "<Solution>\n</Solution>\n",
      "src/Csv/Csv.csproj": '<Project Sdk="Microsoft.NET.Sdk"></Project>\n',
    });
    const graph = readProjectGraph(root);
    assert.equal(graph.ecosystem, "dotnet");
    assert.deepEqual(graph.projects.map((project) => project.path), ["src/Csv/Csv.csproj"]);
  });

  it("reads the solution file that lists projects when a .sln and a .slnx both stand", () => {
    const root = tempDir("graph-two-solutions-");
    seed(root, {
      "Csv.slnx": "<Solution>\n</Solution>\n",
      "Csv.sln": 'Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "Csv", "src\\Csv\\Csv.csproj", "{1}"\nEndProject\n',
      "src/Csv/Csv.csproj": '<Project Sdk="Microsoft.NET.Sdk"></Project>\n',
      // Not in the listing solution, so not in the solution.
      "scratch/Stray/Stray.csproj": "<Project />\n",
    });
    assert.deepEqual(readProjectGraph(root).projects.map((project) => project.path), ["src/Csv/Csv.csproj"]);
  });

  it("reads a Maven parent's two modules, the sibling dependency and the Spring Boot service", () => {
    const root = tempDir("graph-maven-");
    const parent = "  <parent><groupId>com.example</groupId><artifactId>csv-parent</artifactId><version>0.1.0</version></parent>\n";
    seed(root, {
      "pom.xml":
        "<project>\n  <artifactId>csv-parent</artifactId>\n  <packaging>pom</packaging>\n" +
        "  <modules>\n    <module>model</module>\n    <module>api</module>\n  </modules>\n</project>\n",
      "api/pom.xml":
        `<project>\n${parent}  <artifactId>csv-api</artifactId>\n` +
        "  <dependencies>\n" +
        "    <dependency><groupId>com.example</groupId><artifactId>csv-model</artifactId><version>${project.version}</version></dependency>\n" +
        "    <dependency><groupId>org.junit.jupiter</groupId><artifactId>junit-jupiter</artifactId></dependency>\n" +
        "  </dependencies>\n" +
        "  <build><plugins><plugin><groupId>org.springframework.boot</groupId><artifactId>spring-boot-maven-plugin</artifactId></plugin></plugins></build>\n" +
        "</project>\n",
      "model/pom.xml": `<project>\n${parent}  <artifactId>csv-model</artifactId>\n</project>\n`,
    });
    const graph = readProjectGraph(root);
    assert.equal(graph.ecosystem, "maven");
    assert.deepEqual(
      graph.projects.map((project) => [project.name, project.kind, project.path, project.dependsOn]),
      [
        ["csv-model", "library", "model/pom.xml", []],
        ["csv-api", "service", "api/pom.xml", ["csv-model"]],
      ],
    );
    assert.deepEqual(usedBy(graph, "csv-model"), ["csv-api"]);
  });

  it("reads a repository with no build files as one project, itself", () => {
    const root = tempDir("graph-none-");
    seed(root, { "README.md": "nothing to build\n" });
    assert.deepEqual(readProjectGraph(root), {
      ecosystem: null,
      projects: [{ name: basename(root), path: ".", kind: "application", dependsOn: [] }],
    });
  });
});
