// `dabbler affected`: what a command has to name to count as a targeted run,
// and every message that asks for evidence. Pure over strings; the gate over
// a real change set is a milestone of walk-verify.test.ts.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { RECORD_PLACEHOLDER, commandNamesTest, preverifyRecipe, recordCommand, remediationRecipe, sessionSelection } from "../src/affected.ts";
import { seed, tempDir } from "./support/answers.ts";
import { STAGE_FINAL_FULL, runOfRecordRecipe } from "../src/testEvidence.ts";

describe("what a command names", () => {
  it("names a test when a token is the path or a node id under it, and not when the path is only a prefix", () => {
    assert.equal(commandNamesTest("python -m pytest tests/test_a.py", "tests/test_a.py"), true);
    assert.equal(commandNamesTest("python -m pytest tests/test_a.py::TestX::test_y", "tests/test_a.py"), true);
    assert.equal(commandNamesTest("python -m pytest tests/", "tests/test_a.py"), false);
    assert.equal(commandNamesTest("python -m pytest tests/test_ab.py", "tests/test_a.py"), false);
    assert.equal(commandNamesTest("pytest tests\\test_a.py", "tests/test_a.py"), true);
  });
});

describe("what a session's changes select at its end", () => {
  it("selects the tests of a project that references a changed library, beside the tests named after the change", () => {
    const repo = tempDir();
    seed(repo, {
      "Csv.slnx":
        "<Solution>\n" +
        '  <Project Path="src/Csv.Model/Csv.Model.csproj" />\n' +
        '  <Project Path="src/Csv.Api/Csv.Api.csproj" />\n' +
        '  <Project Path="tests/Csv.Api.Tests/Csv.Api.Tests.csproj" />\n' +
        "</Solution>\n",
      "src/Csv.Model/Csv.Model.csproj": '<Project Sdk="Microsoft.NET.Sdk"></Project>\n',
      "src/Csv.Model/CsvReader.cs": "class CsvReader {}\n",
      "src/Csv.Api/Csv.Api.csproj":
        '<Project Sdk="Microsoft.NET.Sdk.Web">\n' +
        '  <ItemGroup><ProjectReference Include="..\\Csv.Model\\Csv.Model.csproj" /></ItemGroup>\n' +
        "</Project>\n",
      "tests/Csv.Api.Tests/Csv.Api.Tests.csproj":
        '<Project Sdk="Microsoft.NET.Sdk">\n' +
        "  <ItemGroup>\n" +
        '    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.11.1" />\n' +
        '    <ProjectReference Include="../../src/Csv.Api/Csv.Api.csproj" />\n' +
        "  </ItemGroup>\n" +
        "</Project>\n",
      "tests/Csv.Api.Tests/RoutesTests.cs": "class RoutesTests {}\n",
      "tests/Csv.Model.Tests/CsvReaderTests.cs": "class CsvReaderTests {}\n",
    });
    const selection = { scopes: [{ suite: "dotnet", roots: ["tests"], glob: "*Tests.cs", testName: "{name}Tests.cs" }], smoke: [] };
    const result = sessionSelection(repo, ["src/Csv.Model/CsvReader.cs"], selection);
    assert.deepEqual(
      result.selected.map((entry) => [entry.path, entry.reason, entry.selectedBy]),
      [
        ["tests/Csv.Model.Tests/CsvReaderTests.cs", "named-test", "src/Csv.Model/CsvReader.cs"],
        ["tests/Csv.Api.Tests/RoutesTests.cs", "dependent-project", "Csv.Api.Tests"],
      ],
    );
  });
});

describe("every message that asks for evidence", () => {
  it("names the run and the record it must be followed by", () => {
    const text = preverifyRecipe("docs/sessions", "python", "python -m pytest tests/test_thing.py");
    assert.ok(text.includes("python -m pytest tests/test_thing.py") && text.includes("--stage preverify-targeted") && text.includes("--suite python"));
  });

  it("routes a remediation back through the selector rather than quoting it, with a placeholder where the command is not yet known", () => {
    // A blocking round that said only "re-run verify" would earn a refusal
    // at the gate: the fix moved the surfaces the round's evidence answered for.
    const text = remediationRecipe("docs/sessions", "python");
    assert.ok(text.includes("dabbler affected") && text.includes("--stage preverify-targeted") && text.includes("dabbler verify"));
    assert.ok(text.includes(RECORD_PLACEHOLDER));
    assert.ok(recordCommand("docs/sessions", "").includes("--suite <name>"));
  });

  it("names the complete run, its record and the push before a close", () => {
    // A verified session is not a closeable one, and a message that stopped
    // at "verified" is how a close gets attempted two steps early.
    const text = runOfRecordRecipe("docs/sessions", "python", "python -m pytest");
    assert.ok(text.includes("python -m pytest") && text.includes(`--stage ${STAGE_FINAL_FULL}`));
    assert.ok(text.includes("git push") && text.includes("dabbler session close"));
  });
});
