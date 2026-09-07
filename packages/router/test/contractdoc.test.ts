// Contract rendering: the sections a reader needs, and the refusals.

import assert from "node:assert/strict";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { CONTRACT_BEGIN, type ContractGraph, ContractError, load, render, renderModuleContract } from "../src/contractdoc.ts";
import { solutionShape } from "../src/modules.ts";
import { seed, tempDir } from "./support/answers.ts";

const CONTRACT: Record<string, unknown> = {
  component: "csv-parser",
  version: "1.0.0",
  summary: "Reads a simple CSV file.",
  operations: [
    {
      name: "parse",
      signature: "List<CsvRecord> parse(Path file)",
      preconditions: ["The file exists and is readable."],
      postconditions: ["One record per data row, in file order."],
      retained: ["A trailing empty field stays an empty string, not null."],
      sideEffects: ["None. The file is not modified."],
      errors: ["A header-only file returns an empty list."],
      notPromised: ["The concrete List implementation."],
    },
  ],
};

// csv-parser's place in a three-module graph, as `dabbler contractdoc`
// derives it from docs/modules.yaml: what it declares, and who is derived
// to use it.
const GRAPH: ContractGraph = { dependsOn: ["csv-model"], usedBy: ["csv-app"] };

describe("rendering", () => {
  it("carries every section a reader needs", () => {
    const out = render(CONTRACT);
    for (const heading of [
      "Must be true going in",
      "Guaranteed coming out",
      "Kept on purpose",
      "Side effects",
      "How it fails",
    ]) {
      assert.ok(out.includes(heading), heading);
    }
  });

  it("calls out what is not promised, separately from the table", () => {
    const out = render(CONTRACT);
    assert.ok((out).includes("Not promised"));
    assert.ok((out).includes("concrete List implementation"));
  });

  it("says an empty section is empty rather than rendering blank", () => {
    const thin = { component: "x", operations: [{ name: "go" }] };
    assert.ok((render(thin)).includes("*none stated*"));
  });

  it("shows both dependency directions in the diagram", () => {
    const out = render(CONTRACT, GRAPH);
    assert.ok((out).includes("```mermaid"));
    assert.ok((out).includes("csv_parser --> csv_model"));
    assert.ok((out).includes("csv_app"));
  });

  it("names who breaks under used-by", () => {
    assert.ok(render(CONTRACT, GRAPH).includes("**Used by:** `csv-app`"));
  });

  it("draws no diagram for a module the manifest does not place, nor for one with no edges", () => {
    const out = render({ component: "stranger", operations: [{ name: "go" }] }, null);
    assert.ok(!out.includes("```mermaid"));
    const alone = render(CONTRACT, { dependsOn: [], usedBy: [] });
    assert.ok(!alone.includes("```mermaid"));
  });

  it("says not to hand-edit it", () => {
    assert.ok(render(CONTRACT).includes("Do not edit by hand"));
  });
});

describe("the module form", () => {
  /** A persister with a designed seam and a model whose package is its own abstraction. */
  function solution(contract: string, withNotes = true): { root: string; shape: ReturnType<typeof solutionShape> } {
    const root = tempDir("bundle-");
    seed(root, {
      "docs/modules.yaml": [
        "modules:",
        "- slug: model",
        "  package: CsvModel",
        "  codeRoots: [modules/model]",
        "- slug: persister",
        "  package: CsvPersister",
        `  contract: ${contract}`,
        "  dependsOn: [model]",
        "  codeRoots: [modules/persister]",
        "",
      ].join("\n"),
      "modules/persister/src/CsvPersister.Abstractions/CsvPersister.Abstractions.csproj": "<Project />\n",
      "modules/persister/src/CsvPersister.Abstractions/IPersister.cs": [
        "namespace CsvPersister.Abstractions;",
        "",
        "/// <summary>Keeps persons; a later save of the same name replaces the earlier one.</summary>",
        "public interface IPersister",
        "{",
        "    /// <summary>Saves or replaces.</summary>",
        "    void Save(Person person);",
        "    /// <summary>The person by name, or null.</summary>",
        "    [Pure]",
        "    public Person? Find(string firstName, string lastName);",
        "    public int Count { get; }",
        "}",
        "",
      ].join("\n"),
      "modules/persister/src/CsvPersister/CsvPersister.csproj": "<Project />\n",
      "modules/persister/src/CsvPersister/InMemoryPersister.cs": "public sealed class InMemoryPersister {}\n",
      "modules/persister/tests/CsvPersister.Tests/PersisterTests.cs": "public class PersisterTests {}\n",
      ...(withNotes
        ? {
            "modules/persister/contract/README.md": "# CsvPersister — what it promises\n\nSaving twice keeps one.\n",
            "modules/persister/contract/contract.yaml": "component: persister\noperations:\n  - name: Save\n    postconditions: [\"the person is findable by name\"]\n",
          }
        : {}),
    });
    return { root, shape: solutionShape(root) };
  }

  it("reads a designed surface from the abstractions project's source, with its summaries, and marks it designed", () => {
    const { root, shape } = solution("designed");
    const bundle = renderModuleContract(root, shape, "persister");
    assert.equal(bundle.mode, "designed");
    assert.equal(bundle.apiPath, "modules/persister/contract/CsvPersister.api.md");
    // The notes page keeps the author's prose and carries the rendering of
    // the contract.yaml beside it between markers -- the file form's
    // renderer, with the module's place in the graph -- regenerated in
    // place rather than appended twice; without a yaml, the page is the
    // author's alone.
    assert.equal(bundle.notesPath, "modules/persister/contract/README.md");
    assert.equal(bundle.notesRendered, true);
    assert.match(bundle.notes, /Saving twice keeps one/);
    assert.match(bundle.notes, /the person is findable by name/);
    assert.match(bundle.notes, /persister --> model/);
    assert.ok(bundle.notes.indexOf("Saving twice keeps one") < bundle.notes.indexOf(CONTRACT_BEGIN));
    writeFileSync(join(root, "modules/persister/contract/README.md"), bundle.notes, "utf8");
    const again = renderModuleContract(root, shape, "persister");
    assert.equal(again.notes.split(CONTRACT_BEGIN).length, 2);
    assert.equal(again.notes, bundle.notes);
    const handWritten = solution("designed");
    rmSync(join(handWritten.root, "modules/persister/contract/contract.yaml"));
    const kept = renderModuleContract(handWritten.root, handWritten.shape, "persister");
    assert.equal(kept.notesRendered, false);
    assert.match(kept.notes, /Saving twice keeps one/);
    assert.doesNotMatch(kept.notes, /dabbler:contract/);
    const api = bundle.api ?? "";
    assert.match(api, /^# CsvPersister — contract surface/);
    assert.match(api, /\*Designed: read from the abstractions project's source/);
    assert.match(api, /`public interface IPersister` — Keeps persons; a later save of the same name replaces the earlier one\./);
    // An interface member is public without saying so, and is read with
    // its summary; an attribute between the two keeps the summary.
    assert.match(api, /`void Save\(Person person\);` — Saves or replaces\./);
    assert.match(api, /`public Person\? Find\(string firstName, string lastName\);` — The person by name, or null\./);
    assert.match(api, /`public int Count`/);
    // The implementation and the tests are not the surface.
    assert.doesNotMatch(api, /InMemoryPersister|PersisterTests/);
    // A declared seam with no notes page is refused by path -- with or
    // without a contract.yaml beside where the page should be, because a
    // definition renders INTO the page and is not one.
    const bare = solution("designed", false);
    assert.throws(
      () => renderModuleContract(bare.root, bare.shape, "persister"),
      /no notes page at modules\/persister\/contract\/README\.md/,
    );
    const yamlAlone = solution("designed");
    rmSync(join(yamlAlone.root, "modules/persister/contract/README.md"));
    assert.throws(
      () => renderModuleContract(yamlAlone.root, yamlAlone.shape, "persister"),
      /no notes page at modules\/persister\/contract\/README\.md.*not one/,
    );
  });

  it("marks a generated surface as shape rather than behaviour, and refuses without a generator", () => {
    const { root, shape } = solution("generated");
    assert.throws(
      () => renderModuleContract(root, shape, "persister"),
      /names no modules\.persister\.contract\.generate/,
    );
    const ran: string[][] = [];
    const bundle = renderModuleContract(root, shape, "persister", {
      generate: ["dotnet", "genapi", "modules/persister"],
      runGenerate: (argv) => {
        ran.push([...argv]);
        return "public interface IPersister {}\n";
      },
    });
    assert.deepEqual(ran, [["dotnet", "genapi", "modules/persister"]]);
    assert.match(bundle.api ?? "", /\*Generated from the built assembly — shape, not behaviour\./);
    assert.match(bundle.api ?? "", /public interface IPersister \{\}/);
    // A package contract is its notes page and nothing else.
    const plain = solution("package");
    const notesOnly = renderModuleContract(plain.root, plain.shape, "persister");
    assert.equal(notesOnly.api, null);
    assert.equal(notesOnly.apiPath, null);
  });
});

describe("refusals", () => {
  it("refuses a missing file", () => {
    assert.throws(() => load(join(tempDir("contract-"), "nope.yaml")), /no contract/);
  });

  it("refuses a contract without operations", () => {
    const path = join(tempDir("contract-"), "c.yaml");
    writeFileSync(path, "component: x\n", "utf8");
    assert.throws(() => load(path), /operations/);
  });

  it("refuses an operation without a name", () => {
    const path = join(tempDir("contract-"), "c.yaml");
    writeFileSync(path, "component: x\noperations:\n  - signature: foo()\n", "utf8");
    assert.throws(() => load(path), ContractError);
  });
});

// The column said every clause was tested, on every contract, always. A
// contract people trust is worse than one they check.
describe("what proves a clause", () => {
  it("says so when a clause has no test", () => {
    const md = render({
      component: "x",
      operations: [{ name: "f", preconditions: ["a is positive"] }],
    });
    assert.ok(md.includes("**not proved**"));
  });

  it("names the test that proves a clause", () => {
    const md = render({
      component: "x",
      operations: [
        {
          name: "f",
          preconditions: ["a is positive"],
          tests: { preconditions: ["test_rejects_negative_a"] },
        },
      ],
    });
    assert.ok(md.includes("`test_rejects_negative_a`"));
    assert.ok(!md.includes("**not proved**"));
  });

  it("has nothing to prove for an empty section", () => {
    const md = render({ component: "x", operations: [{ name: "f" }] });
    assert.ok(md.includes("*nothing to prove*"));
    assert.ok(!md.includes("**not proved**"));
  });
});
