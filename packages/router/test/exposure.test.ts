// The exposure manifest: what a module session's checkout holds of its
// siblings, the grants in force, and what changed outside the scope.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { describe, it } from "node:test";

import {
  appendGrant,
  exposurePath,
  grantDecisionId,
  readExposure,
  writeExposure,
} from "../src/exposure.ts";
import { type SolutionShape, dependencyOrder, implicitModule, parseEntries, impliedDeployables } from "../src/modules.ts";
import { seed, tempDir } from "./support/answers.ts";

function twoModules(): SolutionShape {
  const entries = parseEntries({
    modules: [
      { slug: "model", codeRoots: ["modules/model"], package: "CsvModel" },
      { slug: "persister", codeRoots: ["modules/persister"], dependsOn: ["model"], package: "CsvPersister" },
    ],
  });
  return { multi: true, implicit: false, modules: dependencyOrder(entries), deployables: impliedDeployables(entries) };
}

const SCOPE = ["modules/persister", "modules/model/contract", "docs/sessions"];

describe("the exposure manifest", () => {
  it("records zero bytes for every sibling and no grant in a clean focused clone, and nothing at all for a single-module solution", () => {
    const root = tempDir("exposure-");
    seed(root, {
      "modules/model/contract/README.md": "# CsvModel\n",
      "modules/persister/src/CsvPersister/Store.cs": "public sealed class Store {}\n",
      "modules/persister/bin/Debug/stale.dll": "not source\n",
    });
    const written = writeExposure(root, twoModules(), 4, { modules: ["persister"], phase: "start", scope: SCOPE });
    assert.ok(written !== null);
    assert.deepEqual(written.siblings, [{ slug: "model", bytes: 0, files: [] }]);
    assert.deepEqual(written.grants, []);
    assert.deepEqual(written.outsideScope, []);
    assert.equal(written.phase, "start");
    assert.deepEqual(readExposure(root, 4), written);

    const single = tempDir("single-");
    const shape: SolutionShape = { multi: false, implicit: true, modules: [implicitModule(single)], deployables: [] };
    assert.equal(writeExposure(single, shape, 1, { modules: [], phase: "start", scope: [] }), null);
    assert.equal(existsSync(exposurePath(single, 1)), false);
  });

  it("records the bytes, the files and the grant with its reason once a clone is widened, and the paths changed outside the scope", () => {
    const root = tempDir("widened-");
    seed(root, {
      "modules/model/contract/README.md": "# CsvModel\n",
      "modules/model/src/CsvModel/Person.cs": "public sealed class Person {}\n",
      "modules/model/src/CsvModel/CsvModel.csproj": "<Project />\n",
      "modules/model/src/CsvModel/obj/project.assets.json": "{}\n",
      "modules/persister/src/CsvPersister/Store.cs": "public sealed class Store {}\n",
    });
    appendGrant(root, 4, {
      event: "requested",
      sibling: "model",
      reason: "debugging the mapper",
      debug: true,
      decision: grantDecisionId("model"),
    });
    const granted = appendGrant(root, 4, {
      event: "granted",
      sibling: "model",
      reason: "debugging the mapper",
      debug: true,
      decision: grantDecisionId("model"),
    });
    const written = writeExposure(root, twoModules(), 4, {
      modules: ["persister"],
      phase: "close",
      scope: SCOPE,
      changedPaths: ["modules/persister/src/CsvPersister/Store.cs", "modules/model/src/CsvModel/Person.cs"],
    });
    assert.ok(written !== null);
    assert.deepEqual(written.siblings, [
      {
        slug: "model",
        bytes: "public sealed class Person {}\n".length + "<Project />\n".length,
        files: ["modules/model/src/CsvModel/CsvModel.csproj", "modules/model/src/CsvModel/Person.cs"],
      },
    ]);
    assert.deepEqual(written.grants, [
      { sibling: "model", reason: "debugging the mapper", debug: true, grantedAt: granted.at },
    ]);
    assert.deepEqual(written.outsideScope, ["modules/model/src/CsvModel/Person.cs"]);
  });
});
