// The solution manifest: what it accepts, and what it refuses by name.
//
// A manifest is a document, so every rule here is a function of one. Only
// the command that prints the check needs a directory to read from.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { stringify as stringifyYaml } from "yaml";

import { solutionVerb } from "../src/cli/solution.ts";
import { capture } from "../src/output.ts";
import {
  ManifestError,
  STEPS,
  asDict,
  componentNamed,
  contractDocPath,
  integrationComponents,
  parse,
} from "../src/solution.ts";
import { seed, tempDir } from "./support/answers.ts";

const BASE = {
  solution: { name: "csv-demo", title: "CSV walkthrough", step: "contracts" },
  components: [
    { name: "csv-model", kind: "library" },
    { name: "csv-parser", kind: "library", dependsOn: ["csv-model"] },
    { name: "csv-app", kind: "integration", dependsOn: ["csv-model", "csv-parser"] },
  ],
};

function doc(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...structuredClone(BASE), ...over };
}

describe("parsing", () => {
  it("parses a well-formed manifest", () => {
    const solution = parse(doc());
    assert.equal(solution.name, "csv-demo");
    assert.equal(solution.components.length, 3);
  });

  it("derives usedBy from the other direction", () => {
    const solution = parse(doc());
    assert.deepEqual(componentNamed(solution, "csv-model")?.usedBy, ["csv-app", "csv-parser"]);
    assert.deepEqual(componentNamed(solution, "csv-app")?.usedBy, []);
  });

  it("defaults a component to a library at the first step", () => {
    const solution = parse(doc({ components: [{ name: "solo" }] }));
    assert.equal(componentNamed(solution, "solo")?.kind, "library");
    assert.equal(componentNamed(solution, "solo")?.step, STEPS[0]);
  });

  it("makes the integration reachable as a group", () => {
    assert.deepEqual(
      integrationComponents(parse(doc())).map((component) => component.name),
      ["csv-app"],
    );
  });
});

describe("refusals", () => {
  it("refuses a misspelled key rather than ignoring it", () => {
    assert.throws(() => parse(doc({ components: [{ name: "a", dependson: ["b"] }] })), /dependson/);
  });

  it("refuses a dependency on an unknown component", () => {
    assert.throws(() => parse(doc({ components: [{ name: "a", dependsOn: ["ghost"] }] })), /ghost/);
  });

  it("refuses a cycle and names the loop", () => {
    assert.throws(
      () =>
        parse(
          doc({
            components: [
              { name: "a", dependsOn: ["b"] },
              { name: "b", dependsOn: ["a"] },
            ],
          }),
        ),
      /a -> b -> a/,
    );
  });

  it("refuses a duplicate component", () => {
    assert.throws(() => parse(doc({ components: [{ name: "a" }, { name: "a" }] })), /duplicate/);
  });

  it("refuses an unknown kind, and an unknown step", () => {
    assert.throws(() => parse(doc({ components: [{ name: "a", kind: "service" }] })), /service/);
    assert.throws(() => parse(doc({ components: [{ name: "a", step: "shipping" }] })), /shipping/);
  });

  it("refuses an empty component list, and a component with no name", () => {
    assert.throws(() => parse(doc({ components: [] })), /components/);
    assert.throws(() => parse(doc({ components: [{ kind: "library" }] })), ManifestError);
  });
});

describe("projection", () => {
  it("carries step position for the UI", () => {
    const head = asDict(parse(doc()))["solution"] as Record<string, unknown>;
    assert.equal(head["stepNumber"], 3);
    assert.equal(head["stepCount"], 6);
    assert.ok(head["stepTitle"]);
  });

  it("carries both dependency directions", () => {
    const projected = asDict(parse(doc()));
    const model = (projected["components"] as Array<Record<string, unknown>>).find(
      (component) => component["name"] === "csv-model",
    );
    assert.deepEqual(model?.["dependsOn"], []);
    assert.deepEqual(model?.["usedBy"], ["csv-app", "csv-parser"]);
  });

  it("derives the readable contract path rather than declaring it", () => {
    // Two paths kept by hand disagree eventually, and silently.
    assert.equal(contractDocPath("components/x/contract.yaml"), "components/x/contract.md");
    assert.equal(contractDocPath("components/x/contract.md"), "components/x/contract.md");
    assert.equal(contractDocPath(null), null);
  });
});

describe("check output", () => {
  it("does not present the declared step as progress", async () => {
    // The two commands printed look-alike step lines that disagreed.
    const dir = tempDir("solution-");
    seed(dir, { "solution.yaml": stringifyYaml(BASE) });
    const { stdout } = await capture(() => solutionVerb(["check", "--workspace-root", dir]));
    assert.match(stdout, /declared starting step/);
    assert.match(stdout, /workflow status/);
    assert.ok(!stdout.includes("of 6"));
  });
});
