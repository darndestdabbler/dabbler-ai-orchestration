// The module policy: what a module session may touch, written once, and
// handed to the first step instruction as its scope.

import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { sessionNext } from "../src/drive.ts";
import type { DriverInstruction } from "../src/generated/index.ts";
import { type SolutionShape, dependencyOrder, impliedDeployables, implicitModule, parseEntries } from "../src/modules.ts";
import { capture } from "../src/output.ts";
import { policyPath, readPolicy, writePolicy } from "../src/policy.ts";
import { resetForTests as resetRouter } from "../src/route.ts";
import { resetForTests as resetRuntimeMode } from "../src/runtimeMode.ts";
import { EXIT_OK, report, sessionScope } from "../src/session.ts";
import { registerSessionStart } from "../src/writers.ts";
import { gitAnswers, makeAnsweredSandbox, seed, setProviderKeys, tempDir } from "./support/answers.ts";

// Writing a policy loads the configuration, which asks git where the
// project root is. These trees are temp directories with no repository
// under them, and the root is the directory itself. Installed for the
// file; the driven test installs its own table and restores it.
gitAnswers([[["rev-parse", "--show-toplevel"], (_args, repoRoot) => ({ stdout: repoRoot.split("\\").join("/") })]]);

const MANIFEST = [
  "modules:",
  "- slug: model",
  "  kind: shared-types",
  "  codeRoots:",
  "  - modules/model",
  "- slug: persister",
  "  dependsOn:",
  "  - model",
  "  codeRoots:",
  "  - modules/persister",
  "",
].join("\n");

async function next(sessionsDir: string): Promise<{ instruction: DriverInstruction | null; err: string }> {
  const collected = await capture(() => sessionNext(sessionsDir, {}));
  return {
    err: collected.stderr,
    instruction: collected.stdout.trim() === "" ? null : (JSON.parse(collected.stdout) as DriverInstruction),
  };
}

async function answer(sessionsDir: string, seq: number, body: unknown): Promise<number> {
  const path = join(tempDir("answer-"), "answer.json");
  writeFileSync(path, JSON.stringify(body), "utf8");
  return (await capture(() => Promise.resolve(report(sessionsDir, { seq, answerFile: path })))).value;
}

function twoModules(): SolutionShape {
  const entries = parseEntries({
    modules: [
      { slug: "model", codeRoots: ["modules/model"], package: "CsvModel" },
      { slug: "persister", codeRoots: ["modules/persister"], dependsOn: ["model"], package: "CsvPersister" },
    ],
  });
  return { multi: true, implicit: false, modules: dependencyOrder(entries), deployables: impliedDeployables(entries) };
}

describe("the module policy", () => {
  it("renders a two-module session's scope once, the sibling named and the record protected, and writes nothing for one module", () => {
    const root = tempDir("policy-");
    seed(root, {
      "modules/model/contract/README.md": "# CsvModel\n",
      "modules/model/src/CsvModel/Person.cs": "public sealed class Person {}\n",
      "modules/persister/src/CsvPersister/Store.cs": "public sealed class Store {}\n",
      "Directory.Build.props": "<Project />\n",
    });
    const sessionsDir = join(root, "docs", "sessions");
    const written = writePolicy(root, sessionsDir, twoModules(), 4, ["persister"]);
    assert.ok(written !== null);
    for (const path of ["modules/persister", "modules/model/contract", "docs/sessions", "Directory.Build.props"]) {
      assert.ok(written.allowed.includes(path), `${path} is in scope: ${written.allowed.join(", ")}`);
    }
    assert.ok(!written.allowed.includes("modules/model"), "the sibling's roots are not in scope");
    assert.deepEqual(written.siblings, [
      { slug: "model", roots: ["modules/model"], contract: "modules/model/contract" },
    ]);
    assert.deepEqual(written.modules, ["persister"]);
    assert.deepEqual(readPolicy(root, 4), written);

    const single = tempDir("single-");
    const shape: SolutionShape = { multi: false, implicit: true, modules: [implicitModule(single)], deployables: [] };
    assert.equal(writePolicy(single, join(single, "docs", "sessions"), shape, 1, []), null);
    assert.equal(existsSync(policyPath(single, 1)), false);
    assert.equal(readPolicy(single, 1), null);
  });

  it("hands the first step instruction of a module session its scope, and the scope verb prints the same list", async () => {
    setProviderKeys();
    const { repo, sessionsDir, restore } = makeAnsweredSandbox({
      "docs/modules.yaml": MANIFEST,
      "modules/model/contract/README.md": "# model\n",
      "modules/model/src/Person.cs": "public sealed class Person {}\n",
      "modules/persister/src/Store.cs": "public sealed class Store {}\n",
    });
    try {
      registerSessionStart(sessionsDir, 1, { engine: "claude-code", provider: "anthropic" });
      const plan = await next(sessionsDir);
      assert.equal(plan.instruction?.step_id, "plan", plan.err);
      // The modules reach the record with the declaration; the plan step
      // itself is issued before them, and carries nothing.
      assert.equal(plan.instruction?.scope, undefined);
      const accepted = await answer(sessionsDir, plan.instruction?.seq ?? 0, {
        task: "Make the store real.",
        releasable: false,
        modules: ["persister"],
        steps: [
          {
            id: "store",
            ask: "Make the store real.",
            files: ["modules/persister/src/Store.cs"],
            checks: [{ argv: [process.execPath, "-e", "process.exit(0)"] }],
          },
        ],
      });
      assert.equal(accepted, EXIT_OK);
      const step = await next(sessionsDir);
      assert.equal(step.instruction?.step_id, "store", `${step.err}\n${JSON.stringify(step.instruction)}`);
      const policy = readPolicy(repo, 1);
      assert.ok(policy !== null, "the declaration wrote the policy");
      assert.ok(policy.allowed.includes("modules/persister"));
      assert.ok(!policy.allowed.includes("modules/model"));
      assert.deepEqual(step.instruction?.scope, policy.allowed);
      assert.match(step.instruction?.ask ?? "", /`scope` member/);

      const printed = await capture(() => Promise.resolve(sessionScope(sessionsDir)));
      assert.equal(printed.value, EXIT_OK, printed.stderr);
      assert.deepEqual(printed.stdout.trim().split(/\r?\n/), policy.allowed);
    } finally {
      restore();
      resetRouter();
      resetRuntimeMode();
    }
  });
});
