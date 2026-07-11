// Set 087 Session 3 — the "New module" scaffold (docs/modules.yaml append
// + plan stub) and the shared module-target picker the authoring flows
// use. Exercises the REAL fs against temp roots (the modulesManifest.test
// pattern) so the tolerant reader and the scaffold are tested together.

import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  INVALID_MANIFEST_MESSAGE,
  MODULES_YAML_HEADER,
  ModulePickItem,
  ModulePickUi,
  classifyModulesManifest,
  defaultModulePlanPath,
  modulePlanRelPath,
  pickModuleForAuthoring,
  renderModuleManifestEntry,
  renderModulePlanStub,
  resolveModuleTarget,
  scaffoldNewModule,
  validateNewModuleSlug,
} from "../../utils/moduleAuthoring";
import { runNewModuleFlow, NewModuleUi } from "../../commands/newModule";
import { readModulesManifest } from "../../utils/fileSystem";
import { ModuleManifestEntry } from "../../types";

function tmpRoot(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeManifest(root: string, text: string): void {
  const dir = path.join(root, "docs");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "modules.yaml"), text, "utf8");
}

function readManifestText(root: string): string {
  return fs.readFileSync(path.join(root, "docs", "modules.yaml"), "utf8");
}

function entry(over: Partial<ModuleManifestEntry> = {}): ModuleManifestEntry {
  return {
    slug: "greeter",
    title: "Greeter",
    codeRoots: ["services/greeter"],
    planPath: null,
    touches: [],
    ...over,
  };
}

suite("moduleAuthoring — slug validation (Set 087 S3)", () => {
  test("accepts kebab-case slugs", () => {
    for (const ok of ["greeter", "payment-api", "a1", "x-2-y"]) {
      assert.strictEqual(validateNewModuleSlug(ok, []), null, ok);
    }
  });

  test("rejects empty, non-kebab, and whitespace shapes with messages", () => {
    for (const bad of ["", "  ", "Greeter", "two words", "-lead", "trail-", "a--b", "ünïcode"]) {
      const msg = validateNewModuleSlug(bad, []);
      assert.ok(typeof msg === "string" && msg.length > 0, `should reject: ${JSON.stringify(bad)}`);
    }
  });

  test("rejects a slug already in the manifest", () => {
    const msg = validateNewModuleSlug("greeter", ["greeter", "clock"]);
    assert.ok(msg && msg.includes("already exists"));
  });

  test("trims surrounding whitespace before validating", () => {
    assert.strictEqual(validateNewModuleSlug("  greeter  ", []), null);
  });
});

suite("moduleAuthoring — scaffoldNewModule (Set 087 S3)", () => {
  test("absent manifest: creates docs/modules.yaml with header + entry, plus the plan stub", () => {
    const root = tmpRoot("mod-scaffold-fresh-");
    try {
      const r = scaffoldNewModule(root, "greeter", "Greeter Service");
      assert.strictEqual(r.manifestCreated, true);
      assert.strictEqual(r.planCreated, true);
      assert.strictEqual(r.planRel, "docs/modules/greeter/project-plan.md");

      const text = readManifestText(root);
      assert.ok(text.startsWith(MODULES_YAML_HEADER.slice(0, 20)), "header present");
      // The tolerant reader parses the created file back to one entry
      // with the explicit planPath (ruling Q1: never rely on a runtime
      // default).
      const parsed = readModulesManifest(root);
      assert.ok(parsed && parsed.length === 1);
      assert.strictEqual(parsed![0].slug, "greeter");
      assert.strictEqual(parsed![0].title, "Greeter Service");
      assert.strictEqual(parsed![0].planPath, "docs/modules/greeter/project-plan.md");
      assert.deepStrictEqual(parsed![0].codeRoots, []);

      const stub = fs.readFileSync(
        path.join(root, "docs", "modules", "greeter", "project-plan.md"),
        "utf8",
      );
      assert.ok(stub.startsWith("# Greeter Service — module project plan"));
      assert.ok(stub.includes("`greeter`"));
      assert.ok(stub.includes("TODO"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("append preserves the existing file's text — comments and formatting included", () => {
    const root = tmpRoot("mod-scaffold-append-");
    const existing =
      "# my hand-written header comment\n" +
      "modules:\n" +
      "  - slug: greeter\n" +
      "    title: Greeter   # inline comment I care about\n" +
      "    codeRoots: [services/greeter]\n";
    try {
      writeManifest(root, existing);
      const r = scaffoldNewModule(root, "clock", "");
      assert.strictEqual(r.manifestCreated, false);
      const text = readManifestText(root);
      assert.ok(text.startsWith(existing), "existing bytes must survive verbatim");
      const parsed = readModulesManifest(root);
      assert.deepStrictEqual(parsed!.map((e) => e.slug), ["greeter", "clock"]);
      // Empty title defaults to the slug (ruling Q1).
      assert.strictEqual(parsed![1].title, "clock");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("append tolerates a file with no trailing newline", () => {
    const root = tmpRoot("mod-scaffold-noeol-");
    try {
      writeManifest(root, "modules:\n  - slug: greeter"); // no trailing \n
      scaffoldNewModule(root, "clock", "Clock");
      assert.deepStrictEqual(
        readModulesManifest(root)!.map((e) => e.slug),
        ["greeter", "clock"],
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("duplicate slug refuses before any write", () => {
    const root = tmpRoot("mod-scaffold-dup-");
    try {
      writeManifest(root, "modules:\n  - slug: greeter\n");
      assert.throws(() => scaffoldNewModule(root, "greeter", "Again"), /already exists/);
      assert.ok(!fs.existsSync(path.join(root, "docs", "modules")), "no stub written");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("malformed manifest refuses loud (never appends to a broken file)", () => {
    const root = tmpRoot("mod-scaffold-broken-");
    try {
      writeManifest(root, "just a string, not a mapping\n");
      assert.throws(() => scaffoldNewModule(root, "clock", "Clock"), /not a valid module manifest/);
      assert.strictEqual(readManifestText(root), "just a string, not a mapping\n");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("flow-style `modules: []` refuses with the copyable entry block (parse-after-append guard)", () => {
    const root = tmpRoot("mod-scaffold-flow-");
    try {
      writeManifest(root, "modules: []\n");
      assert.throws(() => scaffoldNewModule(root, "clock", "Clock"), /by hand/);
      assert.strictEqual(readManifestText(root), "modules: []\n", "refusal must not write");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("`modules:` not the last top-level key refuses instead of mis-appending", () => {
    const root = tmpRoot("mod-scaffold-notlast-");
    const text = "modules:\n  - slug: greeter\nowner: someone\n";
    try {
      writeManifest(root, text);
      assert.throws(() => scaffoldNewModule(root, "clock", "Clock"));
      assert.strictEqual(readManifestText(root), text, "refusal must not write");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("an existing plan file is kept, never clobbered", () => {
    const root = tmpRoot("mod-scaffold-keepplan-");
    const planAbs = path.join(root, "docs", "modules", "clock", "project-plan.md");
    try {
      fs.mkdirSync(path.dirname(planAbs), { recursive: true });
      fs.writeFileSync(planAbs, "MY REAL PLAN\n", "utf8");
      const r = scaffoldNewModule(root, "clock", "Clock");
      assert.strictEqual(r.planCreated, false);
      assert.strictEqual(fs.readFileSync(planAbs, "utf8"), "MY REAL PLAN\n");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("a free-text title with YAML-hostile characters round-trips (JSON-quoted scalar)", () => {
    const root = tmpRoot("mod-scaffold-title-");
    try {
      const title = 'Greeter: the "hello" module #1';
      scaffoldNewModule(root, "greeter", title);
      assert.strictEqual(readModulesManifest(root)![0].title, title);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("renderModuleManifestEntry / renderModulePlanStub shapes", () => {
    const block = renderModuleManifestEntry("greeter", "Greeter", "docs/modules/greeter/project-plan.md");
    assert.ok(block.startsWith("  - slug: greeter\n"));
    assert.ok(block.includes('title: "Greeter"'));
    assert.ok(block.includes("codeRoots: []"));
    assert.ok(block.includes("planPath: docs/modules/greeter/project-plan.md"));
    assert.ok(block.endsWith("\n"));
    const stub = renderModulePlanStub("greeter", "Greeter");
    assert.ok(stub.includes("module: greeter") || stub.includes("`greeter`"));
    assert.strictEqual(defaultModulePlanPath("greeter"), "docs/modules/greeter/project-plan.md");
  });
});

suite("moduleAuthoring — module-target resolution (Set 087 S3)", () => {
  test("resolveModuleTarget: null / empty → none; one → auto; many → pick", () => {
    assert.deepStrictEqual(resolveModuleTarget(null), { kind: "none" });
    assert.deepStrictEqual(resolveModuleTarget([]), { kind: "none" });
    const one = [entry()];
    assert.deepStrictEqual(resolveModuleTarget(one), { kind: "auto", entry: one[0] });
    const two = [entry(), entry({ slug: "clock", title: "Clock" })];
    assert.deepStrictEqual(resolveModuleTarget(two), { kind: "pick", entries: two });
  });

  test("modulePlanRelPath: explicit planPath wins; absent defaults; backslashes normalize", () => {
    assert.strictEqual(
      modulePlanRelPath(entry({ planPath: "docs/plans/greeter.md" })),
      "docs/plans/greeter.md",
    );
    assert.strictEqual(
      modulePlanRelPath(entry({ planPath: null })),
      "docs/modules/greeter/project-plan.md",
    );
    assert.strictEqual(
      modulePlanRelPath(entry({ planPath: "docs\\plans\\greeter.md" })),
      "docs/plans/greeter.md",
    );
  });

  function pickUi(log: {
    infos: string[];
    picks: ModulePickItem[][];
    errors?: string[];
  }, answer?: (items: ModulePickItem[]) => ModulePickItem | undefined): ModulePickUi {
    return {
      showQuickPick: async (items, _opts) => {
        log.picks.push(items);
        return answer ? answer(items) : undefined;
      },
      showInformationMessage: (m) => void log.infos.push(m),
      showErrorMessage: (m) => void (log.errors ?? (log.errors = [])).push(m),
    };
  }

  test("classifyModulesManifest: absent vs invalid vs present (S3 verification R1)", () => {
    const root = tmpRoot("mod-classify-");
    try {
      assert.deepStrictEqual(classifyModulesManifest(root), { kind: "absent" });
      writeManifest(root, "just a string\n");
      assert.deepStrictEqual(classifyModulesManifest(root), { kind: "invalid" });
      writeManifest(root, "modules:\n  - slug: greeter\n");
      const out = classifyModulesManifest(root);
      assert.strictEqual(out.kind, "present");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("pickModuleForAuthoring: a PRESENT-but-invalid manifest errors and aborts — never the repo-level fallback (S3 verification R1)", async () => {
    const root = tmpRoot("mod-pick-invalid-");
    const log = { infos: [] as string[], picks: [] as ModulePickItem[][], errors: [] as string[] };
    try {
      writeManifest(root, "not: [a, module, manifest\n"); // broken YAML
      const out = await pickModuleForAuthoring(root, pickUi(log));
      assert.deepStrictEqual(out, { kind: "invalid-manifest", entry: null });
      assert.deepStrictEqual(log.errors, [INVALID_MANIFEST_MESSAGE]);
      assert.strictEqual(log.picks.length, 0, "no QuickPick on an invalid manifest");
      assert.strictEqual(log.infos.length, 0, "no auto-select notice either");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("pickModuleForAuthoring: no manifest → none, no UI at all", async () => {
    const root = tmpRoot("mod-pick-none-");
    const log = { infos: [] as string[], picks: [] as ModulePickItem[][] };
    try {
      const out = await pickModuleForAuthoring(root, pickUi(log));
      assert.deepStrictEqual(out, { kind: "none", entry: null });
      assert.strictEqual(log.infos.length, 0);
      assert.strictEqual(log.picks.length, 0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("pickModuleForAuthoring: one module auto-selects WITH the operator notice (ruling Q2)", async () => {
    const root = tmpRoot("mod-pick-auto-");
    const log = { infos: [] as string[], picks: [] as ModulePickItem[][] };
    try {
      writeManifest(root, "modules:\n  - slug: greeter\n    title: Greeter\n");
      const out = await pickModuleForAuthoring(root, pickUi(log));
      assert.strictEqual(out.kind, "picked");
      assert.strictEqual(out.entry!.slug, "greeter");
      assert.strictEqual(log.picks.length, 0, "no QuickPick for a single module");
      assert.strictEqual(log.infos.length, 1);
      assert.ok(log.infos[0].includes("greeter"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("pickModuleForAuthoring: two modules → QuickPick in manifest order; Esc cancels", async () => {
    const root = tmpRoot("mod-pick-two-");
    try {
      writeManifest(
        root,
        "modules:\n" +
          "  - slug: greeter\n    title: Greeter\n" +
          "  - slug: clock\n    title: Clock\n    planPath: docs/plans/clock.md\n",
      );
      // Esc → cancelled.
      const cancelLog = { infos: [] as string[], picks: [] as ModulePickItem[][] };
      const cancelled = await pickModuleForAuthoring(root, pickUi(cancelLog));
      assert.deepStrictEqual(cancelled, { kind: "cancelled", entry: null });
      assert.strictEqual(cancelLog.picks.length, 1);
      assert.deepStrictEqual(
        cancelLog.picks[0].map((i) => i.description),
        ["greeter", "clock"],
        "QuickPick rows follow manifest file order",
      );
      assert.ok(cancelLog.picks[0][1].detail.includes("docs/plans/clock.md"));

      // Picking the second row returns its entry.
      const pickLog = { infos: [] as string[], picks: [] as ModulePickItem[][] };
      const picked = await pickModuleForAuthoring(
        root,
        pickUi(pickLog, (items) => items[1]),
      );
      assert.strictEqual(picked.kind, "picked");
      assert.strictEqual(picked.entry!.slug, "clock");
      assert.strictEqual(pickLog.infos.length, 0, "no auto-select notice on an explicit pick");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

// ---------- the palette / form flow over the scaffold ----------

interface FlowLog {
  inputs: string[];
  infos: string[];
  errors: string[];
  opened: string[];
}

function flowUi(
  root: string | undefined,
  answers: Array<string | undefined>,
  log: FlowLog,
): NewModuleUi {
  let i = 0;
  return {
    showInputBox: (async (opts?: { prompt?: string }) => {
      log.inputs.push(opts?.prompt ?? "");
      return answers[i++];
    }) as NewModuleUi["showInputBox"],
    showInformationMessage: (m: string) => void log.infos.push(m),
    showErrorMessage: (m: string) => void log.errors.push(m),
    openFile: async (absPath: string) => void log.opened.push(absPath),
    workspaceRoot: () => root,
  };
}

function freshFlowLog(): FlowLog {
  return { inputs: [], infos: [], errors: [], opened: [] };
}

suite("runNewModuleFlow (Set 087 S3)", () => {
  test("happy path: slug + title → manifest entry + stub, stub opened, toast", async () => {
    const root = tmpRoot("mod-flow-ok-");
    const log = freshFlowLog();
    try {
      const ok = await runNewModuleFlow(flowUi(root, ["greeter", "Greeter"], log));
      assert.strictEqual(ok, true);
      assert.strictEqual(log.errors.length, 0);
      assert.strictEqual(readModulesManifest(root)![0].slug, "greeter");
      assert.strictEqual(log.opened.length, 1);
      assert.ok(log.opened[0].endsWith(path.join("docs", "modules", "greeter", "project-plan.md")));
      assert.strictEqual(log.infos.length, 1);
      assert.ok(log.infos[0].includes("greeter"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("Esc on either input box cancels without writing", async () => {
    for (const answers of [[undefined], ["greeter", undefined]] as Array<
      Array<string | undefined>
    >) {
      const root = tmpRoot("mod-flow-esc-");
      const log = freshFlowLog();
      try {
        const ok = await runNewModuleFlow(flowUi(root, answers, log));
        assert.strictEqual(ok, false);
        assert.ok(!fs.existsSync(path.join(root, "docs", "modules.yaml")));
        assert.strictEqual(log.errors.length, 0);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  });

  test("empty title defaults to the slug", async () => {
    const root = tmpRoot("mod-flow-title-");
    const log = freshFlowLog();
    try {
      await runNewModuleFlow(flowUi(root, ["clock", ""], log));
      assert.strictEqual(readModulesManifest(root)![0].title, "clock");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("no workspace root errors loud", async () => {
    const log = freshFlowLog();
    const ok = await runNewModuleFlow(flowUi(undefined, [], log));
    assert.strictEqual(ok, false);
    assert.strictEqual(log.errors.length, 1);
  });

  test("scaffold refusal surfaces as an error toast, not a throw", async () => {
    const root = tmpRoot("mod-flow-refuse-");
    const log = freshFlowLog();
    try {
      writeManifest(root, "modules: []\n"); // flow-style — the append guard refuses
      const ok = await runNewModuleFlow(flowUi(root, ["clock", "Clock"], log));
      assert.strictEqual(ok, false);
      assert.strictEqual(log.errors.length, 1);
      assert.ok(log.errors[0].includes("New module was not created"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
