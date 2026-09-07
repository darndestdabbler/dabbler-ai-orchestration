// The focused checkout: the cone a module's clone is narrowed to, derived
// from the manifest and never declared.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CheckoutError, checkoutCone, openModule } from "../src/checkout.ts";
import { type SolutionShape, dependencyOrder, implicitModule, parseEntries, impliedDeployables } from "../src/modules.ts";
import { tempDir } from "./support/answers.ts";

function shapeOf(doc: Record<string, unknown>): SolutionShape {
  const entries = parseEntries(doc);
  return { multi: entries.length > 1, implicit: false, modules: dependencyOrder(entries), deployables: impliedDeployables(entries) };
}

describe("the cone", () => {
  it("names the middle module's roots, the feed, the record and its neighbours' contract folders, and no sibling source", () => {
    const shape = shapeOf({
      modules: [
        { slug: "a", codeRoots: ["modules/a"], package: "A" },
        { slug: "b", codeRoots: ["modules/b/src", "modules/b/tests/"], dependsOn: ["a"], package: "B" },
        { slug: "c", codeRoots: ["modules/c"], dependsOn: ["b"], package: "C" },
      ],
    });
    // A shared file under a folder brings its folder; one at the root brings
    // nothing, because the root's files come with every cone.
    const cone = checkoutCone(shape, "b", ["build/common.props", "Directory.Build.props"]);
    assert.deepEqual(cone, [
      "build",
      "docs",
      "modules/a/contract",
      "modules/b/src",
      "modules/b/tests",
      "modules/c/contract",
      "packages",
    ]);
  });
});

describe("the focused clone", () => {
  it("refuses a single-module solution before any git runs: the repository is the module, so open it", () => {
    // Under the no-git preload a spawn of git would throw its own error, so
    // reaching the refusal proves the shape was judged first.
    const root = tempDir("single-");
    const shape: SolutionShape = { multi: false, implicit: true, modules: [implicitModule(root)], deployables: [] };
    assert.throws(
      () => openModule(root, shape, "anything"),
      (error: unknown) =>
        error instanceof CheckoutError && /single-module solution.*open the repository itself/.test(error.message),
    );
  });
});
