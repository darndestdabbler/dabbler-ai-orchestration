// The solution manifest: what it accepts, and what it refuses by name.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { stringify as stringifyYaml } from "yaml";
import { afterAll, describe, expect, it } from "vitest";

import { solutionVerb } from "../src/cli/solution.ts";
import {
  asDict,
  componentNamed,
  contractDocPath,
  integrationComponents,
  ManifestError,
  parse,
  STEPS,
} from "../src/solution.ts";
import { captured, makeTempDir, removeTempDirs } from "./support/fixtures.ts";

afterAll(removeTempDirs);

const BASE = {
  solution: { name: "csv-demo", title: "CSV walkthrough", step: "contracts" },
  components: [
    { name: "csv-model", kind: "library" },
    { name: "csv-parser", kind: "library", dependsOn: ["csv-model"] },
    {
      name: "csv-app",
      kind: "integration",
      dependsOn: ["csv-model", "csv-parser"],
    },
  ],
};

function doc(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...structuredClone(BASE), ...over };
}

describe("parsing", () => {
  it("parses a well-formed manifest", () => {
    const s = parse(doc());
    expect(s.name).toBe("csv-demo");
    expect(s.components).toHaveLength(3);
  });

  it("derives usedBy from the other direction", () => {
    const s = parse(doc());
    expect(componentNamed(s, "csv-model")?.usedBy).toEqual([
      "csv-app",
      "csv-parser",
    ]);
    expect(componentNamed(s, "csv-app")?.usedBy).toEqual([]);
  });

  it("defaults a component to a library at the first step", () => {
    const s = parse(doc({ components: [{ name: "solo" }] }));
    expect(componentNamed(s, "solo")?.kind).toBe("library");
    expect(componentNamed(s, "solo")?.step).toBe(STEPS[0]);
  });

  it("makes the integration reachable as a group", () => {
    expect(integrationComponents(parse(doc())).map((c) => c.name)).toEqual([
      "csv-app",
    ]);
  });
});

describe("refusals", () => {
  it("refuses a misspelled key rather than ignoring it", () => {
    expect(() => parse(doc({ components: [{ name: "a", dependson: ["b"] }] })))
      .toThrow(/dependson/);
  });

  it("refuses a dependency on an unknown component", () => {
    expect(() => parse(doc({ components: [{ name: "a", dependsOn: ["ghost"] }] })))
      .toThrow(/ghost/);
  });

  it("refuses a cycle and names the loop", () => {
    expect(() =>
      parse(
        doc({
          components: [
            { name: "a", dependsOn: ["b"] },
            { name: "b", dependsOn: ["a"] },
          ],
        }),
      ),
    ).toThrow(/a -> b -> a/);
  });

  it("refuses a duplicate component", () => {
    expect(() => parse(doc({ components: [{ name: "a" }, { name: "a" }] })))
      .toThrow(/duplicate/);
  });

  it("refuses an unknown kind", () => {
    expect(() => parse(doc({ components: [{ name: "a", kind: "service" }] })))
      .toThrow(/service/);
  });

  it("refuses an unknown step", () => {
    expect(() => parse(doc({ components: [{ name: "a", step: "shipping" }] })))
      .toThrow(/shipping/);
  });

  it("refuses an empty component list", () => {
    expect(() => parse(doc({ components: [] }))).toThrow(/components/);
  });

  it("refuses a component without a name", () => {
    expect(() => parse(doc({ components: [{ kind: "library" }] })))
      .toThrow(ManifestError);
  });
});

describe("projection", () => {
  it("carries step position for the UI", () => {
    const d = asDict(parse(doc()));
    const head = d.solution as Record<string, unknown>;
    expect(head.stepNumber).toBe(3);
    expect(head.stepCount).toBe(6);
    expect(head.stepTitle).toBeTruthy();
  });

  it("carries both dependency directions", () => {
    const d = asDict(parse(doc()));
    const model = (d.components as Array<Record<string, unknown>>).find(
      (c) => c.name === "csv-model",
    );
    expect(model?.dependsOn).toEqual([]);
    expect(model?.usedBy).toEqual(["csv-app", "csv-parser"]);
  });

  it("derives the readable contract path rather than declaring it", () => {
    // Two paths kept by hand disagree eventually, and silently.
    expect(contractDocPath("components/x/contract.yaml")).toBe(
      "components/x/contract.md",
    );
    expect(contractDocPath("components/x/contract.md")).toBe(
      "components/x/contract.md",
    );
    expect(contractDocPath(null)).toBeNull();
  });
});

describe("check output", () => {
  it("does not present the declared step as progress", async () => {
    // The two commands printed look-alike step lines that disagreed.
    const dir = makeTempDir();
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "solution.yaml"), stringifyYaml(BASE), "utf8");
    const { out } = await captured(() =>
      solutionVerb(["check", "--workspace-root", dir]),
    );
    expect(out).toContain("declared starting step");
    expect(out).toContain("workflow status");
    expect(out).not.toContain("of 6");
  });
});
