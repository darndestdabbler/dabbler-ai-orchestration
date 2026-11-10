// What bootstrap/detect.ts declares for a repository it finds.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { detectEcosystems } from "../src/bootstrap/detect.ts";
import { seed, tempDir } from "./support/answers.ts";

describe("detectEcosystems", () => {
  it("declares a .NET solution's own root as its test root, so a test project at the root is claimed", () => {
    // A field report: `X.Tests/` beside `X/`, under a declared `tests` root,
    // had named tests selected for none of its projects.
    const project = tempDir("detect-");
    seed(project, { "Acme.sln": "\n", "Acme.Tests/Acme.Tests.csproj": "<Project/>\n" });
    const dotnet = detectEcosystems(project)[0];
    assert.equal(dotnet?.key, "dotnet");
    assert.deepEqual(dotnet?.testRoots, ["."]);
  });
});
