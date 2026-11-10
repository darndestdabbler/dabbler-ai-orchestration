// `facts` -- the deterministic pass a round runs before it buys a verifier.
//
// The vocabulary is what these check. Four words, and the two that are not
// `pass` carry the weight: a control nobody declared and a control that
// could not be launched must never look like a control that ran and was
// green. The controls that really spawn, and the evidence bundle over a
// real diff, are walked in walk-record.test.ts.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  CONTROL_TIMEOUT_SECONDS,
  DEFAULT_DIFF_EXCLUDES,
  EvidenceTooLargeError,
  STATUS_FAIL,
  STATUS_NOT_APPLICABLE,
  STATUS_PASS,
  STATUS_UNKNOWN,
  appendFacts,
  assembleEvidence,
  buildDiffPathspecs,
  changedLines,
  checkEvidenceCap,
  contractFact,
  controlFact,
  controlFactRed,
  controlSpec,
  factRecord,
  factRecordToDict,
  factsPath,
  loadControlsChecked,
  parseChangedLines,
  redFactsRefusal,
  runControl,
} from "../src/facts.ts";
import { setVsToolsAsk } from "../src/checks.ts";
import { gitAnswers, seed, tempDir } from "./support/answers.ts";
const CAP_ENV = "AI_ROUTER_VERIFY_MAX_EVIDENCE_CHARS";

describe("the diff pathspecs", () => {
  it("excludes each pattern at any depth, names the lifecycle files, and gives a glob no /** twin", () => {
    // The anchored form missed `tools/x/dist`, which is the incident this
    // shape exists for; and the session's own record is not its work.
    const pathspecs = buildDiffPathspecs();
    assert.equal(pathspecs[0], ".");
    assert.ok(pathspecs.includes(":(exclude,glob)**/dist"));
    assert.ok(pathspecs.includes(":(exclude,glob)**/dist/**"));
    assert.ok(pathspecs.includes(":(exclude,glob)**/sessions.json"));
    assert.ok(pathspecs.includes(":(exclude,glob)**/*.vsix"));
    assert.ok(!pathspecs.includes(":(exclude,glob)**/*.vsix/**"));
    assert.ok(DEFAULT_DIFF_EXCLUDES.includes(".dabbler"));
  });
});

describe("the evidence", () => {
  it("names a changed transcript page as bookkeeping and carries none of its contents", () => {
    // git answers as it would for a tree with one regenerated page, one new
    // page and one source change: the page's hunk is there only for a diff
    // that did not exclude it.
    const recordDir = (args: readonly string[]): boolean => args.includes("docs/transcripts");
    const restore = gitAnswers([
      [["status"], { stdout: " M docs/transcripts/session-1.html\n M src/a.ts" }],
      [["diff", "--name-only"], { stdout: "docs/transcripts/session-1.html\0" }],
      [(args) => args[0] === "ls-files" && recordDir(args), { stdout: "docs/transcripts/session-2.html\0" }],
      [["ls-files"], { stdout: "" }],
      [
        ["diff"],
        (args) => ({
          stdout:
            "+++ b/src/a.ts\n+two" +
            (args.includes(":(exclude)docs/transcripts") ? "" : "\n+++ b/docs/transcripts/session-1.html\n+REGENERATED PAGE"),
        }),
      ],
    ]);
    try {
      const evidence = assembleEvidence(tempDir(), "docs/sessions", 1);
      const bookkeeping = evidence.split("#### Expected framework bookkeeping (paths only)")[1] ?? "";
      assert.match(bookkeeping, /- docs\/transcripts\/session-1\.html/);
      assert.match(bookkeeping, /- docs\/transcripts\/session-2\.html/);
      assert.doesNotMatch(evidence, /REGENERATED PAGE/);
      assert.match(evidence, /\+two/);
    } finally {
      restore();
    }
  });
});

describe("the evidence cap", () => {
  it("refuses over the cap naming the largest files and .gitignore before the variable that raises it, and falls back when the variable is not an integer", () => {
    process.env[CAP_ENV] = "10";
    try {
      assert.throws(() => checkEvidenceCap("x".repeat(11)), EvidenceTooLargeError);
      assert.throws(() => checkEvidenceCap("x".repeat(11)), /evidence bundle is 11 chars \(cap 10\)/);
      // The refusal names what is large, and .gitignore before the variable.
      const bundle =
        "diff --git a/src/Parser.cs b/src/Parser.cs\n+small\n" +
        "\n**src/bin/Debug/Csv.deps.json**\n```\n" + "y".repeat(40) + "\n```\n";
      assert.throws(() => checkEvidenceCap(bundle), /Largest: src\/bin\/Debug\/Csv\.deps\.json \(\d+ chars\), src\/Parser\.cs/);
      assert.throws(() => checkEvidenceCap(bundle), /\.gitignore.*AI_ROUTER_VERIFY_MAX_EVIDENCE_CHARS/s);
      process.env[CAP_ENV] = "600k";
      assert.doesNotThrow(() => checkEvidenceCap("x".repeat(1000)));
    } finally {
      delete process.env[CAP_ENV];
    }
  });
});

describe("the changed lines", () => {
  it("counts only what the diff adds, numbered in the post-image, and attributes nothing to a deleted file", () => {
    const diff = ["--- a/one.py", "+++ b/one.py", "@@ -1,2 +1,3 @@", " keep", "+added", "+also", "@@ -10,2 +12,0 @@", "-gone", "-gone too"].join("\n");
    assert.deepEqual(parseChangedLines(diff), { "one.py": [1, 2, 3] });
    assert.deepEqual(parseChangedLines(["--- a/gone.py", "+++ /dev/null", "@@ -1,2 +0,0 @@", "-x"].join("\n")), {});
  });

  it("answers null when git cannot measure, never an empty change set", () => {
    const restore = gitAnswers([[() => true, { code: 128, stderr: "not a git repository" }]]);
    try {
      assert.equal(changedLines(tempDir()), null);
    } finally {
      restore();
    }
  });
});

describe("the control declarations", () => {
  it("reports every error rather than the first, loading what parsed", () => {
    // A control lost to a typo and a control never declared both end up
    // `not_applicable`; only the error list tells them apart.
    const loaded = loadControlsChecked({
      testing: {
        controls: [
          { kind: "compile", command: "true", extra: 1 },
          { kind: "nonsense", command: "true" },
          { kind: "lint", command: "  " },
          { kind: "compile", command: "twice" },
          "not a mapping",
        ],
      },
    });
    assert.deepEqual(loaded.errors, [
      "testing.controls[0] has unknown key(s) ['extra']",
      "testing.controls[1].kind must be one of ['compile', 'typecheck', 'lint', 'analyzer']",
      "testing.controls[2].command must be a non-empty string",
      "testing.controls[3].kind 'compile' is declared more than once",
      "testing.controls[4] must be a mapping",
    ]);
    assert.deepEqual(loaded.controls.map((spec) => spec.kind), ["compile"]);
    assert.deepEqual(loadControlsChecked({ testing: { controls: {} } }).errors, ["testing.controls must be a list"]);
  });

  it("runs a compile control with the MSBuild vswhere names, and its row says which one", () => {
    // Node stands in for MSBuild: what is proved is the substitution and the record.
    const restore = setVsToolsAsk((args) => (args.at(-1)?.endsWith("MSBuild.exe") ? `${process.execPath}\n` : ""));
    try {
      const fact = runControl(tempDir(), controlSpec("compile", `{msbuild} -e "process.stdout.write('built')"`, true));
      assert.equal(fact.status, STATUS_PASS);
      assert.equal(fact.detail, `msbuild: ${process.execPath}\nbuilt`);
    } finally {
      restore();
    }
  });

  it("has a timeout, so a hung control cannot wedge every round", () => {
    assert.equal(CONTROL_TIMEOUT_SECONDS, 600);
  });
});

describe("what counts as red", () => {
  it("is a required control on anything but green, UNKNOWN included", () => {
    // The author is the only one who can turn "the tool did not run" into
    // an answer, and a verifier cannot.
    assert.equal(controlFactRed(controlFact("lint", STATUS_UNKNOWN, "x", true)), true);
    assert.equal(controlFactRed(controlFact("lint", STATUS_FAIL, "x", true)), true);
    assert.equal(controlFactRed(controlFact("lint", STATUS_FAIL, "x", false)), false);
    assert.equal(controlFactRed(controlFact("lint", STATUS_NOT_APPLICABLE, "", true)), false);
  });

  it("says nothing when nothing is red, and returns the red rows to their author with the prefix it was given", () => {
    assert.equal(redFactsRefusal(factRecord({ controls: [] })), "");
    const refusal = redFactsRefusal(
      factRecord({ controls: [controlFact("lint", STATUS_UNKNOWN, "ruff check", true, "gone\nmore")] }),
      "verify step close",
    );
    assert.match(refusal, /verify step close: refused -- 1 required deterministic control\(s\) are not green:/);
    assert.ok(refusal.includes("  lint       UNKNOWN        ruff check"), refusal);
    assert.ok(refusal.includes("\n              gone\n"), refusal);
    assert.doesNotMatch(refusal, /more/);
  });
});

describe("the record", () => {
  it("carries counts rather than line numbers, omits what is absent, and tells an unmeasurable change set from an empty one", () => {
    const dict = factRecordToDict(
      factRecord({
        controls: [controlFact("lint", STATUS_PASS, "ruff", true, "clean")],
        changed: { "a.py": [1, 2, 3] },
        recordedAt: "2026-01-01T00:00:00+00:00",
      }),
    );
    assert.deepEqual(dict["changedLines"], { "a.py": 3 });
    assert.deepEqual(dict["controls"], [{ kind: "lint", status: "pass", required: true, command: "ruff", detail: "clean" }]);
    assert.equal("sessionNumber" in dict, false);
    assert.equal(factRecordToDict(factRecord({}))["changedLines"], null);
  });

  it("appends one sorted-key line per collection", () => {
    const repo = tempDir();
    appendFacts(repo, factRecord({ recordedAt: "one" }));
    appendFacts(repo, factRecord({ recordedAt: "two" }));
    const lines = readFileSync(factsPath(repo), "utf8").trimEnd().split("\n");
    assert.equal(lines.length, 2);
    assert.equal(lines[0], '{"changedLines": null, "controls": [], "recordedAt": "one"}');
  });
});

/**
 * The contract control over a fixture tree with a HEAD: `tree` is written to
 * disk, and git answers for HEAD with `head`'s paths and contents.
 */
function contractOver(
  head: Record<string, string>,
  tree: Record<string, string>,
  posture: "greenfield" | "maintenance" = "maintenance",
): ReturnType<typeof contractFact> {
  const repo = tempDir();
  seed(repo, tree);
  const restore = gitAnswers([
    [["ls-tree"], { stdout: Object.keys(head).join("\0") }],
    [["ls-files"], { stdout: Object.keys(tree).join("\0") }],
    [(args) => args[0] === "show", (args) => ({ stdout: head[(args[1] ?? "").replace(/^[^:]*:/, "")] ?? "" })],
  ]);
  try {
    return contractFact(repo, posture);
  } finally {
    restore();
  }
}

const CLASSIC = (version: string): string =>
  `<Project ToolsVersion="15.0"><PropertyGroup><TargetFrameworkVersion>${version}</TargetFrameworkVersion></PropertyGroup></Project>`;
const SDK = (extra = ""): string =>
  `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework>${extra}</PropertyGroup></Project>`;

describe("the build contract", () => {
  it("refuses a non-SDK project whose TargetFrameworkVersion moved, naming both values", () => {
    const fact = contractOver({ "Web/Web.csproj": CLASSIC("v4.5.1") }, { "Web/Web.csproj": CLASSIC("v4.8") });
    assert.equal(fact.status, STATUS_FAIL);
    assert.equal(fact.required, true);
    assert.match(fact.detail, /Web\/Web\.csproj: TargetFrameworkVersion at HEAD v4\.5\.1, in the tree v4\.8/);
  });

  it("refuses an SDK project that gained Nullable", () => {
    const fact = contractOver({ "App/App.csproj": SDK() }, { "App/App.csproj": SDK("<Nullable>enable</Nullable>") });
    assert.equal(fact.status, STATUS_FAIL);
    assert.match(fact.detail, /Nullable at HEAD \(absent\), in the tree enable/);
  });

  it("refuses the first of two conditioned LangVersion declarations moved, though the second is unchanged", () => {
    const project = (debug: string): string =>
      `<Project ToolsVersion="15.0">` +
      `<PropertyGroup Condition=" '$(Configuration)' == 'Debug' "><LangVersion>${debug}</LangVersion></PropertyGroup>` +
      `<PropertyGroup Condition=" '$(Configuration)' == 'Release' "><LangVersion>7.3</LangVersion></PropertyGroup></Project>`;
    const fact = contractOver({ "Web/Web.csproj": project("7.3") }, { "Web/Web.csproj": project("latest") });
    assert.equal(fact.status, STATUS_FAIL);
    assert.match(fact.detail, /LangVersion \('\$\(Configuration\)' == 'Debug'\) at HEAD 7\.3, in the tree latest/);
    assert.doesNotMatch(fact.detail, /Release/);
  });

  it("refuses a PropertyGroup whose condition moved under an unchanged LangVersion, naming both conditions", () => {
    const project = (configuration: string): string =>
      `<Project ToolsVersion="15.0"><PropertyGroup Condition=" '$(Configuration)' == '${configuration}' ">` +
      `<LangVersion>7.3</LangVersion></PropertyGroup></Project>`;
    const fact = contractOver({ "Web/Web.csproj": project("Debug") }, { "Web/Web.csproj": project("Release") });
    assert.equal(fact.status, STATUS_FAIL);
    assert.match(fact.detail, /LangVersion \('\$\(Configuration\)' == 'Debug'\) at HEAD 7\.3, in the tree \(absent\)/);
    assert.match(fact.detail, /LangVersion \('\$\(Configuration\)' == 'Release'\) at HEAD \(absent\), in the tree 7\.3/);
  });

  it("refuses a POM whose parent relativePath moved", () => {
    const pom = (path: string): string =>
      `<project><parent><groupId>g</groupId><artifactId>p</artifactId><version>1</version><relativePath>${path}</relativePath></parent></project>`;
    const fact = contractOver({ "app/pom.xml": pom("../parent/pom.xml") }, { "app/pom.xml": pom("") });
    assert.equal(fact.status, STATUS_FAIL);
    assert.match(fact.detail, /parent relativePath at HEAD \.\.\/parent\/pom\.xml, in the tree /);
  });

  it("refuses a packages.config entry bumped", () => {
    const config = (version: string): string =>
      `<?xml version="1.0"?><packages><package id="Newtonsoft.Json" version="${version}" targetFramework="net451" /></packages>`;
    const fact = contractOver({ "Web/packages.config": config("6.0.4") }, { "Web/packages.config": config("13.0.3") });
    assert.equal(fact.status, STATUS_FAIL);
    assert.match(fact.detail, /package Newtonsoft\.Json at HEAD 6\.0\.4 \(net451\), in the tree 13\.0\.3 \(net451\)/);
  });

  it("refuses a POM that gained maven.compiler.release", () => {
    const pom = (properties: string): string =>
      `<project><packaging>war</packaging><properties><java.version>1.8</java.version>${properties}</properties></project>`;
    const fact = contractOver(
      { "pom.xml": pom("") },
      { "pom.xml": pom("<maven.compiler.release>17</maven.compiler.release>") },
    );
    assert.equal(fact.status, STATUS_FAIL);
    assert.match(fact.detail, /pom\.xml: properties maven\.compiler\.release at HEAD \(absent\), in the tree 17/);
    assert.doesNotMatch(fact.detail, /java\.version/);
  });

  it("refuses a Maven wrapper whose distributionUrl moved", () => {
    const wrapper = (version: string): string =>
      `distributionUrl=https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/${version}/apache-maven-${version}-bin.zip\n`;
    const path = ".mvn/wrapper/maven-wrapper.properties";
    const fact = contractOver({ [path]: wrapper("3.6.3") }, { [path]: wrapper("3.9.9") });
    assert.equal(fact.status, STATUS_FAIL);
    assert.match(fact.detail, /maven-wrapper\.properties: distributionUrl at HEAD .*3\.6\.3.*, in the tree .*3\.9\.9/);
  });

  it("passes a new test project, recording its target, and refuses a deleted build file", () => {
    const added = contractOver(
      { "Web/Web.csproj": CLASSIC("v4.8") },
      { "Web/Web.csproj": CLASSIC("v4.8"), "Web.Tests/Web.Tests.csproj": CLASSIC("v4.8") },
    );
    assert.equal(added.status, STATUS_PASS);
    assert.match(added.detail, /1 build file\(s\) held to HEAD; none moved/);
    assert.match(added.detail, /Web\.Tests\/Web\.Tests\.csproj: new, Project ToolsVersion=15\.0, TargetFrameworkVersion=v4\.8/);
    const deleted = contractOver({ "Web/Web.csproj": CLASSIC("v4.8") }, {});
    assert.equal(deleted.status, STATUS_FAIL);
    assert.match(deleted.detail, /Web\/Web\.csproj: deleted/);
  });

  it("refuses a new .cs under a non-SDK project that no Compile item lists, naming the file, and passes it once listed", () => {
    const project = (items: string): string =>
      `<Project ToolsVersion="15.0"><PropertyGroup><TargetFrameworkVersion>v4.8</TargetFrameworkVersion></PropertyGroup>` +
      `<ItemGroup><Compile Include="Global.asax.cs" />${items}</ItemGroup></Project>`;
    const head = { "Web/Web.csproj": project("") };
    const unlisted = contractOver(head, { "Web/Web.csproj": project(""), "Web/Controllers/CalcController.cs": "class C {}" });
    assert.equal(unlisted.status, STATUS_FAIL);
    assert.match(unlisted.detail, /Web\/Controllers\/CalcController\.cs: new, and no Compile item of Web\/Web\.csproj lists it/);
    const listed = contractOver(head, {
      "Web/Web.csproj": project(`<Compile Include="Controllers\\CalcController.cs" />`),
      "Web/Controllers/CalcController.cs": "class C {}",
    });
    // The project gained an item, which is no element of its contract.
    assert.equal(listed.status, STATUS_PASS, listed.detail);
  });

  it("holds the tree to the commit the session started on, so a target the engine moved and committed is still refused", () => {
    const repo = tempDir();
    seed(repo, { "Web/Web.csproj": CLASSIC("v4.8") });
    // HEAD carries the engine's commit of v4.8; the start commit carries v4.5.1.
    const at: Record<string, string> = { "HEAD:Web/Web.csproj": CLASSIC("v4.8"), "a1b2c3d4e5f6a7b8:Web/Web.csproj": CLASSIC("v4.5.1") };
    const restore = gitAnswers([
      [["ls-tree"], { stdout: "Web/Web.csproj" }],
      [["ls-files"], { stdout: "Web/Web.csproj" }],
      [(args) => args[0] === "show", (args) => ({ stdout: at[args[1] ?? ""] ?? "" })],
    ]);
    try {
      assert.equal(contractFact(repo, "maintenance").status, STATUS_PASS);
      const fact = contractFact(repo, "maintenance", null, "a1b2c3d4e5f6a7b8");
      assert.equal(fact.status, STATUS_FAIL);
      assert.match(fact.detail, /TargetFrameworkVersion at the session's start a1b2c3d4e5f6 v4\.5\.1, in the tree v4\.8/);
    } finally {
      restore();
    }
  });

  it("does not apply to a greenfield repository", () => {
    const fact = contractOver({ "App/App.csproj": SDK() }, { "App/App.csproj": SDK("<Nullable>enable</Nullable>") }, "greenfield");
    assert.equal(fact.status, STATUS_NOT_APPLICABLE);
    assert.equal(fact.required, false);
  });
});
