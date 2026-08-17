import * as assert from "assert";
import {
  buildArgv,
  buildCommandLine,
  classify,
  describeAiRouterImportFailure,
  isAiRouterNotInstalled,
  parseJsonPayload,
  quoteForDisplay,
} from "../../utils/routerCli";
import { cancelArgs, describeLifecycleFailure, restoreArgs } from "../../utils/sessionLifecycleCli";
import { createArgs } from "../../utils/moduleLifecycleCli";
import {
  closeSessionCommandLine,
  startSessionCommandLine,
} from "../../commands/sessionTerminalCommands";
import { bootstrapCommandLine } from "../../commands/bootstrapProject";
import { installCommandLine } from "../../commands/installAiRouter";

suite("routerCli: outcome classification", () => {
  test("exit 0 is ok with stdout as the message", () => {
    const r = classify(0, undefined, '{"status":"cancelled"}', "");
    assert.strictEqual(r.outcome, "ok");
    assert.ok(r.ok);
  });

  test("exit 3 is a refusal — nothing written", () => {
    const r = classify(3, undefined, "", "a session is in flight");
    assert.strictEqual(r.outcome, "refused");
    assert.ok(r.message.includes("in flight"));
  });

  test("exit 4 is a write failure", () => {
    assert.strictEqual(classify(4, undefined, "", "disk full").outcome, "writeFailed");
  });

  test("any other exit is an unclassified failure carrying the process text", () => {
    const r = classify(2, undefined, "", "usage: ...");
    assert.strictEqual(r.outcome, "failed");
    assert.ok(r.message.includes("usage"));
  });

  test("parseJsonPayload tolerates a warning banner before the object", () => {
    const payload = parseJsonPayload('RuntimeWarning: blah\n{"slug": "m"}');
    assert.deepStrictEqual(payload, { slug: "m" });
    assert.strictEqual(parseJsonPayload("no json here"), undefined);
  });
});

suite("routerCli: missing-router detection", () => {
  test("recognizes the three ModuleNotFound shapes", () => {
    assert.ok(isAiRouterNotInstalled("ModuleNotFoundError: No module named 'ai_router'"));
    assert.ok(
      isAiRouterNotInstalled(
        "Error while finding module specification for 'ai_router.session' " +
          "(ModuleNotFoundError: No module named 'ai_router')",
      ),
    );
    assert.ok(isAiRouterNotInstalled("python.exe: No module named ai_router.session"));
  });

  test("does not match unrelated modules", () => {
    assert.ok(!isAiRouterNotInstalled("No module named 'ai_router_helpers'"));
    assert.ok(!isAiRouterNotInstalled(""));
  });

  test("the failure message names the interpreter and the pip remedy", () => {
    const msg = describeAiRouterImportFailure("C:\\py\\python.exe");
    assert.ok(msg.includes("C:\\py\\python.exe"));
    assert.ok(msg.includes("pip install dabbler-ai-router"));
  });
});

suite("CLI argv contracts", () => {
  test("cancel/restore target ai_router.session subcommands", () => {
    assert.deepStrictEqual(cancelArgs("D:\\ws\\docs\\session-sets\\001-a", "done"), [
      "cancel",
      "D:\\ws\\docs\\session-sets\\001-a",
      "--reason",
      "done",
    ]);
    assert.deepStrictEqual(restoreArgs("D:\\x", ""), ["restore", "D:\\x", "--reason", ""]);
  });

  test("modules create passes the root positionally and omits empty options", () => {
    assert.deepStrictEqual(createArgs("D:\\ws", { slug: "greeter" }), [
      "create",
      "D:\\ws",
      "--slug",
      "greeter",
    ]);
    assert.deepStrictEqual(
      createArgs("D:\\ws", { slug: "g", title: "Greeter", planPath: "docs/p.md" }),
      ["create", "D:\\ws", "--slug", "g", "--title", "Greeter", "--plan-path", "docs/p.md"],
    );
  });

  test("start pre-fills the human engine; close carries no --force", () => {
    const start = startSessionCommandLine("python", "D:\\ws\\docs\\session-sets\\001 a");
    assert.ok(start.includes("ai_router.session start"));
    assert.ok(start.includes("--engine human"));
    assert.ok(start.includes('"D:\\ws\\docs\\session-sets\\001 a"'));
    const close = closeSessionCommandLine("python", "D:\\x");
    assert.ok(close.includes("ai_router.session close"));
    assert.ok(!close.includes("--force"));
  });

  test("bootstrap and install command lines are single pip/python invocations", () => {
    assert.ok(bootstrapCommandLine("python", "D:\\proj").includes("ai_router.bootstrap"));
    const install = installCommandLine("python");
    assert.ok(install.includes("pip install --upgrade dabbler-ai-router"));
  });

  test("describeLifecycleFailure states the nothing-was-written guarantee on refusal", () => {
    const message = describeLifecycleFailure("Cancelling", "001-a", {
      outcome: "refused",
      ok: false,
      exitCode: 3,
      message: "a session is in flight.",
    } as never);
    assert.ok(message.includes("Nothing was written"));
  });

  test("quoteForDisplay wraps only what the shell would split", () => {
    assert.strictEqual(quoteForDisplay("python"), "python");
    assert.strictEqual(quoteForDisplay("C:\\my tools\\python.exe"), '"C:\\my tools\\python.exe"');
  });

  test("buildCommandLine and buildArgv agree on the module invocation", () => {
    const invocation = { module: "ai_router.session", args: ["cancel", "x"], cwd: "D:\\ws", actionLabel: "t" };
    assert.deepStrictEqual(buildArgv(invocation), ["-m", "ai_router.session", "cancel", "x"]);
    assert.ok(buildCommandLine("python", invocation).startsWith("python -m ai_router.session"));
  });
});
