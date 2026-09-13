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
  siblingBytes,
  writeExposure,
} from "../src/exposure.ts";
import { moduleScope } from "../src/agency.ts";
import { type SolutionShape, dependencyOrder, impliedDeployables, implicitModule, parseEntries } from "../src/modules.ts";
import { gitAnswers, seed, tempDir } from "./support/answers.ts";

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

// Measuring a sibling's source asks git what this repository ignores, and
// these trees are temp directories with no repository under them: nothing is
// ignored anywhere. A test that needs a different answer installs its own.
gitAnswers([[["ls-files", "--others", "--ignored", "--exclude-standard", "-z"], { stdout: "" }]]);

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
      decision: grantDecisionId("model"),
    });
    const granted = appendGrant(root, 4, {
      event: "granted",
      sibling: "model",
      reason: "debugging the mapper",
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
        // The .csproj is a manifest, not implementation, and a focused
        // checkout holds a sibling's whether anybody asked or not: cone
        // mode materialises every file beside a directory it keeps.
        bytes: "public sealed class Person {}\n".length,
        files: ["modules/model/src/CsvModel/Person.cs"],
      },
    ]);
    assert.deepEqual(written.grants, [
      { sibling: "model", reason: "debugging the mapper", grantedAt: granted.at },
    ]);
    assert.deepEqual(written.outsideScope, ["modules/model/src/CsvModel/Person.cs"]);
  });

  it("counts neither the committed feed nor the framework's own state as changed outside the scope", () => {
    // Measured on the Java walk: a module session packed its own candidate
    // and the close refused, naming the packages the pack left and the
    // projection the framework itself had rewritten.
    const root = tempDir("feed-");
    seed(root, {
      "modules/model/contract/README.md": "# CsvModel\n",
      "modules/persister/src/CsvPersister/Store.cs": "public sealed class Store {}\n",
    });
    const shape = twoModules();
    const scope = moduleScope(root, null, shape, ["persister"]);
    assert.ok(scope.includes("packages"), scope.join(", "));
    // Measuring a sibling's source asks git what this repository ignores.
    const restore = gitAnswers([
      [["ls-files", "--others", "--ignored", "--exclude-standard", "-z"], { stdout: "" }],
    ]);
    let written;
    try {
      written = writeExposure(root, shape, 5, {
        modules: ["persister"],
        phase: "close",
        scope,
        changedPaths: [
          "packages/com/example/json-store/0.1.0-dev.20260907.1.gabc1234/json-store-0.1.0-dev.20260907.1.gabc1234.jar.sha1",
          ".dabbler/solution/solution.json",
          "modules/persister/src/CsvPersister/Store.cs",
          "modules/model/src/CsvModel/Person.cs",
        ],
      });
    } finally {
      restore();
    }
    // Only the sibling's source, which is the one thing the gate is for.
    assert.deepEqual(written?.outsideScope, ["modules/model/src/CsvModel/Person.cs"]);
  });
});

describe("what a focused checkout unavoidably holds", () => {
  it("exposes nothing for a sibling present as its build file, its build output and its contract", () => {
    // Measured on the walk: the app's focused clone held the model's and
    // the store's pom.xml (cone mode brings them beside the contract
    // folders the cone asks for) and a .flattened-pom.xml the reactor
    // wrote, with no source at all -- and the close refused for 2826 bytes
    // of "implementation" that was nothing of the kind.
    const root = tempDir("cone-");
    seed(root, {
      "modules/model/pom.xml": "<project><artifactId>json-model</artifactId></project>\n",
      "modules/model/.flattened-pom.xml": "<project><artifactId>json-model</artifactId></project>\n",
      "modules/model/contract/README.md": "# json-model\n",
      "modules/persister/pom.xml": "<project><artifactId>json-store</artifactId></project>\n",
      ".gitignore": "target/\n.flattened-pom.xml\n",
    });
    const restore = gitAnswers([
      [
        ["ls-files", "--others", "--ignored", "--exclude-standard", "-z"],
        { stdout: "modules/model/.flattened-pom.xml\0" },
      ],
    ]);
    try {
      const exposure = siblingBytes(root, twoModules(), ["persister"]);
      assert.deepEqual(exposure, [{ slug: "model", bytes: 0, files: [] }]);
    } finally {
      restore();
    }
  });

  it("still exposes a sibling's source, which is the one thing the gate is for", () => {
    const root = tempDir("cone-source-");
    seed(root, {
      "modules/model/pom.xml": "<project><artifactId>json-model</artifactId></project>\n",
      "modules/model/src/main/java/com/example/model/Item.java": "public class Item {}\n",
      "modules/model/contract/README.md": "# json-model\n",
    });
    const restore = gitAnswers([
      [["ls-files", "--others", "--ignored", "--exclude-standard", "-z"], { stdout: "" }],
    ]);
    try {
      const exposure = siblingBytes(root, twoModules(), ["persister"]);
      assert.deepEqual(exposure, [
        {
          slug: "model",
          bytes: "public class Item {}\n".length,
          files: ["modules/model/src/main/java/com/example/model/Item.java"],
        },
      ]);
    } finally {
      restore();
    }
  });
});
