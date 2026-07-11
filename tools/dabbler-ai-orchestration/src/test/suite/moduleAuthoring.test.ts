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
  MODULES_YAML_TEMPLATE,
  ModulePickItem,
  ModulePickUi,
  classifyModulesManifest,
  defaultModulePlanPath,
  isSafeRepoRelativePath,
  modulePlanRelPath,
  pickModuleForAuthoring,
  renderModuleManifestEntry,
  renderModulePlanStub,
  replaceEmptyModulesList,
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

  // Set 091 S1 (verdict amendment 3): the empty→first-entry transition
  // the guard previously refused. Both empty forms grow into a valid
  // one-module manifest, format-preserving.
  test("flow-style `modules: []` grows into the first block-style entry (Set 091 S1)", () => {
    const root = tmpRoot("mod-scaffold-flow-");
    try {
      writeManifest(root, "# operator header\nmodules: []\n");
      const r = scaffoldNewModule(root, "clock", "Clock");
      assert.strictEqual(r.manifestCreated, false);
      const text = readManifestText(root);
      assert.ok(text.startsWith("# operator header\nmodules:\n"), "header preserved, empty form replaced");
      assert.ok(!text.includes("modules: []"), "the empty-list marker is gone");
      const parsed = readModulesManifest(root)!;
      assert.strictEqual(parsed.length, 1);
      assert.strictEqual(parsed[0].slug, "clock");
      assert.strictEqual(parsed[0].title, "Clock");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("bare `modules:` (YAML null) grows into the first block-style entry (Set 091 S1)", () => {
    const root = tmpRoot("mod-scaffold-null-");
    try {
      writeManifest(root, "# operator header\nmodules:\n");
      const r = scaffoldNewModule(root, "clock", "Clock");
      assert.strictEqual(r.manifestCreated, false);
      const text = readManifestText(root);
      assert.ok(text.startsWith("# operator header\nmodules:\n  - slug: clock\n"));
      assert.strictEqual(readModulesManifest(root)!.length, 1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  // S1 verification R3 (Major): explicit YAML null spellings classify
  // valid-empty at the reader, so the scaffold must grow them too —
  // end to end for each spelling the YAML 1.2 core schema accepts.
  test("explicit null spellings (`null` / `Null` / `NULL` / `~`) classify valid-empty AND grow (S1 verification R3)", () => {
    for (const nullSpelling of ["null", "Null", "NULL", "~"]) {
      const root = tmpRoot("mod-scaffold-nullword-");
      try {
        writeManifest(root, `modules: ${nullSpelling}\n`);
        assert.deepStrictEqual(
          classifyModulesManifest(root),
          { kind: "present", entries: [] },
          `classifies valid-empty: modules: ${nullSpelling}`,
        );
        const r = scaffoldNewModule(root, "clock", "Clock");
        assert.strictEqual(r.manifestCreated, false);
        const parsed = readModulesManifest(root)!;
        assert.strictEqual(parsed.length, 1, `grows: modules: ${nullSpelling}`);
        assert.strictEqual(parsed[0].slug, "clock");
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
    // A non-core casing parses as a STRING: invalid on both sides —
    // classification refuses and the scaffold aborts loud.
    const root = tmpRoot("mod-scaffold-nullstring-");
    try {
      writeManifest(root, "modules: nUll\n");
      assert.deepStrictEqual(classifyModulesManifest(root), { kind: "invalid" });
      assert.throws(() => scaffoldNewModule(root, "clock", "Clock"), /not a valid module manifest/);
      assert.strictEqual(readManifestText(root), "modules: nUll\n", "refusal must not write");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  // S1 R4 third-provider adjudication: quoted keys are the accepted
  // cheap hardening — they classify valid-empty and grow end to end,
  // quote style preserved. The remaining exotic serializations (e.g. a
  // MULTILINE empty flow list) stay an adjudicated-minor residual: they
  // classify valid-empty but the scaffold refuses LOUDLY without
  // writing (the copyable-entry-block fallback), never corrupts.
  test("quoted `modules` keys grow; a multiline empty flow list refuses loudly (S1 R4 adjudication)", () => {
    for (const quoted of ['"modules": []\n', "'modules': ~\n"]) {
      const root = tmpRoot("mod-scaffold-quoted-");
      try {
        writeManifest(root, quoted);
        assert.deepStrictEqual(classifyModulesManifest(root), { kind: "present", entries: [] });
        scaffoldNewModule(root, "clock", "Clock");
        const parsed = readModulesManifest(root)!;
        assert.strictEqual(parsed.length, 1, `grows: ${JSON.stringify(quoted)}`);
        assert.ok(
          readManifestText(root).startsWith(quoted[0]),
          "quote style preserved",
        );
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
    const root = tmpRoot("mod-scaffold-multiline-");
    const multiline = "modules: [\n]\n";
    try {
      writeManifest(root, multiline);
      assert.deepStrictEqual(classifyModulesManifest(root), { kind: "present", entries: [] });
      assert.throws(() => scaffoldNewModule(root, "clock", "Clock"), /by hand/);
      assert.strictEqual(readManifestText(root), multiline, "refusal must not write");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("empty form with a trailing comment keeps the comment on the `modules:` line (Set 091 S1)", () => {
    const root = tmpRoot("mod-scaffold-emptycomment-");
    try {
      writeManifest(root, "modules: []  # declare modules here\n");
      scaffoldNewModule(root, "clock", "Clock");
      const text = readManifestText(root);
      assert.ok(
        text.startsWith("modules: # declare modules here\n  - slug: clock\n"),
        `comment survives the replacement: ${JSON.stringify(text.split("\n")[0])}`,
      );
      assert.strictEqual(readModulesManifest(root)!.length, 1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  // S1 verification R1 (Major): YAML permits root-node indentation, so a
  // root-indented empty manifest classifies valid-empty and must grow
  // exactly like the column-0 forms — end to end through the scaffold.
  test("root-INDENTED empty forms classify valid-empty AND grow into the first entry (S1 verification R1)", () => {
    for (const empty of ["  modules: []\n", "  modules:\n"]) {
      const root = tmpRoot("mod-scaffold-indented-");
      try {
        writeManifest(root, empty);
        assert.deepStrictEqual(
          classifyModulesManifest(root),
          { kind: "present", entries: [] },
          `classifies valid-empty: ${JSON.stringify(empty)}`,
        );
        const r = scaffoldNewModule(root, "clock", "Clock");
        assert.strictEqual(r.manifestCreated, false);
        const text = readManifestText(root);
        assert.ok(
          text.startsWith("  modules:\n    - slug: clock\n"),
          `key keeps its indentation, entries nest under it: ${JSON.stringify(text.slice(0, 40))}`,
        );
        const parsed = readModulesManifest(root)!;
        assert.strictEqual(parsed.length, 1);
        assert.strictEqual(parsed[0].slug, "clock");
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  });

  // S1 verification R2 (Major): an earlier NESTED `modules:` key under
  // another mapping must not swallow the replacement — the appender
  // validates each candidate line and grows the ROOT list.
  test("nested `modules:` key earlier in the file: the ROOT empty list still grows (S1 verification R2)", () => {
    for (const rootForm of ["modules: []\n", "modules:\n"]) {
      const root = tmpRoot("mod-scaffold-nested-");
      const text = `metadata:\n  modules: []\n${rootForm}`;
      try {
        writeManifest(root, text);
        assert.deepStrictEqual(classifyModulesManifest(root), { kind: "present", entries: [] });
        const r = scaffoldNewModule(root, "clock", "Clock");
        assert.strictEqual(r.manifestCreated, false);
        const grown = readManifestText(root);
        assert.ok(
          grown.startsWith("metadata:\n  modules: []\n"),
          `nested key untouched: ${JSON.stringify(grown.slice(0, 40))}`,
        );
        assert.ok(grown.includes("modules:\n  - slug: clock\n"), "root list gained the entry");
        const parsed = readModulesManifest(root)!;
        assert.strictEqual(parsed.length, 1);
        assert.strictEqual(parsed[0].slug, "clock");
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  });

  test("empty form with no trailing newline still grows cleanly (Set 091 S1)", () => {
    const root = tmpRoot("mod-scaffold-emptynoeol-");
    try {
      writeManifest(root, "modules: []"); // no trailing \n
      scaffoldNewModule(root, "clock", "Clock");
      assert.strictEqual(readModulesManifest(root)![0].slug, "clock");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  // Routed architecture ruling mandate 3: "classifies empty" is DISTINCT
  // from "is textually replaceable". An all-dropped-entries manifest
  // (entries the tolerant reader rejects) classifies present with zero
  // entries, but the appender must REFUSE, never write.
  test("all-dropped block-style entries: classifies zero entries but the appender refuses without writing", () => {
    const root = tmpRoot("mod-scaffold-alldropped-");
    const text = "modules:\n  - title: No Slug Here\n";
    try {
      writeManifest(root, text);
      const classified = classifyModulesManifest(root);
      assert.strictEqual(classified.kind, "present");
      assert.strictEqual((classified as { entries: unknown[] }).entries.length, 0);
      assert.throws(() => scaffoldNewModule(root, "clock", "Clock"), /by hand/);
      assert.strictEqual(readManifestText(root), text, "refusal must not write");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("all-dropped flow-style entries refuse too (parse-after-append backstop)", () => {
    const root = tmpRoot("mod-scaffold-alldroppedflow-");
    const text = 'modules: [{ title: "no slug" }]\n';
    try {
      writeManifest(root, text);
      assert.throws(() => scaffoldNewModule(root, "clock", "Clock"), /by hand/);
      assert.strictEqual(readManifestText(root), text, "refusal must not write");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("POPULATED flow-style list still refuses with the copyable entry block", () => {
    const root = tmpRoot("mod-scaffold-popflow-");
    const text = "modules: [{ slug: greeter }]\n";
    try {
      writeManifest(root, text);
      assert.throws(() => scaffoldNewModule(root, "clock", "Clock"), /by hand/);
      assert.strictEqual(readManifestText(root), text, "refusal must not write");
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

  // Set 091 S1: the canonical always-present template (verdict amendment
  // 3, gpt-5-4's adopted shape) — header comments + commented example
  // entries + a valid empty `modules: []`.
  test("MODULES_YAML_TEMPLATE shape: header comments + commented examples + `modules: []` (Set 091 S1)", () => {
    assert.ok(
      MODULES_YAML_TEMPLATE.startsWith("# docs/modules.yaml — the module manifest"),
      "opens with the Set 087 header comments",
    );
    assert.ok(MODULES_YAML_TEMPLATE.includes("# - slug: payment-api"), "commented example entries present");
    assert.ok(MODULES_YAML_TEMPLATE.includes("#   touches:"), "example covers the optional touches field");
    assert.ok(MODULES_YAML_TEMPLATE.endsWith("\nmodules: []\n"), "ends with the valid empty list");
    // Every non-empty line before the final key is a comment — the
    // template must contain exactly one uncommented YAML key.
    const uncommented = MODULES_YAML_TEMPLATE.split("\n").filter(
      (l) => l.trim() !== "" && !l.startsWith("#"),
    );
    assert.deepStrictEqual(uncommented, ["modules: []"]);
  });

  test("template round-trip: classifies valid-empty AND the appender grows it into a one-module manifest (Set 091 S1)", () => {
    const root = tmpRoot("mod-template-roundtrip-");
    try {
      writeManifest(root, MODULES_YAML_TEMPLATE);
      // Classifies as a valid EMPTY manifest (present, zero entries)...
      const classified = classifyModulesManifest(root);
      assert.strictEqual(classified.kind, "present");
      assert.deepStrictEqual((classified as { entries: unknown[] }).entries, []);
      // ...and the appender extends it into a valid one-module manifest,
      // preserving the header and example comments byte-for-byte.
      const commentBlock = MODULES_YAML_TEMPLATE.slice(
        0,
        MODULES_YAML_TEMPLATE.lastIndexOf("modules: []"),
      );
      const r = scaffoldNewModule(root, "greeter", "Greeter Service");
      assert.strictEqual(r.manifestCreated, false);
      const text = readManifestText(root);
      assert.ok(text.startsWith(commentBlock), "header + example comments survive verbatim");
      const parsed = readModulesManifest(root)!;
      assert.strictEqual(parsed.length, 1);
      assert.strictEqual(parsed[0].slug, "greeter");
      assert.strictEqual(parsed[0].planPath, "docs/modules/greeter/project-plan.md");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  // The pure replacement helper (routed ruling Q3: textual line
  // replacement; the guard selects among candidates — S1 verification R2).
  test("replaceEmptyModulesList: one candidate per empty-form line (Set 091 S1)", () => {
    const block = "  - slug: x\n";
    // Both empty forms, with and without whitespace variants.
    assert.deepStrictEqual(replaceEmptyModulesList("modules: []\n", block), ["modules:\n  - slug: x\n"]);
    assert.deepStrictEqual(replaceEmptyModulesList("modules:\n", block), ["modules:\n  - slug: x\n"]);
    assert.deepStrictEqual(replaceEmptyModulesList("modules: [ ]\n", block), ["modules:\n  - slug: x\n"]);
    assert.deepStrictEqual(replaceEmptyModulesList("modules:   \n", block), ["modules:\n  - slug: x\n"]);
    // Trailing comment preserved.
    assert.deepStrictEqual(
      replaceEmptyModulesList("modules: [] # keep me\n", block),
      ["modules: # keep me\n  - slug: x\n"],
    );
    // Preceding/following lines survive verbatim.
    assert.deepStrictEqual(
      replaceEmptyModulesList("# header\nmodules: []\nowner: me\n", block),
      ["# header\nmodules:\n  - slug: x\nowner: me\n"],
    );
    // S1 verification R1 (Major): YAML permits a root-indented mapping,
    // so an indented empty form matches too — the key keeps its
    // indentation and the entry block re-indents to nest under it.
    assert.deepStrictEqual(
      replaceEmptyModulesList("  modules: []\n", block),
      ["  modules:\n    - slug: x\n"],
    );
    assert.deepStrictEqual(
      replaceEmptyModulesList("  modules:\n", block),
      ["  modules:\n    - slug: x\n"],
    );
    // S1 verification R3 (Major): every YAML null spelling the reader
    // accepts is appendable too — the accepted and appendable domains
    // must match. Other casings (e.g. `nUll`) parse as strings and stay
    // non-matching (they classify invalid at the reader).
    for (const nullSpelling of ["null", "Null", "NULL", "~"]) {
      assert.deepStrictEqual(
        replaceEmptyModulesList(`modules: ${nullSpelling}\n`, block),
        ["modules:\n  - slug: x\n"],
        `null spelling: ${nullSpelling}`,
      );
    }
    assert.deepStrictEqual(replaceEmptyModulesList("modules: nUll\n", block), []);
    // S1 R4 third-provider adjudication (cheap hardening): quoted keys
    // match, quote style preserved; mismatched quotes never match.
    assert.deepStrictEqual(
      replaceEmptyModulesList('"modules": []\n', block),
      ['"modules":\n  - slug: x\n'],
    );
    assert.deepStrictEqual(
      replaceEmptyModulesList("'modules': ~\n", block),
      ["'modules':\n  - slug: x\n"],
    );
    assert.deepStrictEqual(replaceEmptyModulesList("\"modules': []\n", block), []);
    // S1 verification R2 (Major): a nested `modules:` key yields a
    // candidate PER matching line, in file order — the caller's parse
    // guard picks the one whose ROOT list gains the entry.
    assert.deepStrictEqual(
      replaceEmptyModulesList("metadata:\n  modules: []\nmodules: []\n", block),
      [
        "metadata:\n  modules:\n    - slug: x\nmodules: []\n",
        "metadata:\n  modules: []\nmodules:\n  - slug: x\n",
      ],
    );
    // Non-empty, commented, and non-key shapes never match.
    assert.deepStrictEqual(replaceEmptyModulesList("modules: [a]\n", block), []);
    assert.deepStrictEqual(replaceEmptyModulesList("# modules: []\n", block), []);
    assert.deepStrictEqual(replaceEmptyModulesList("themodules: []\n", block), []);
    assert.deepStrictEqual(replaceEmptyModulesList("", block), []);
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

  test("modulePlanRelPath: escaping/absolute planPath degrades to the default (S3 verification R2)", () => {
    for (const hostile of [
      "../outside.md",
      "docs/../../outside.md",
      "/etc/passwd",
      "C:/evil.md",
      "c:\\evil.md",
      "\\\\server\\share\\evil.md",
      "docs//weird.md",
    ]) {
      assert.strictEqual(
        modulePlanRelPath(entry({ planPath: hostile })),
        "docs/modules/greeter/project-plan.md",
        `must degrade: ${hostile}`,
      );
    }
  });

  test("isSafeRepoRelativePath matrix (S3 verification R2)", () => {
    for (const ok of ["docs/plans/x.md", "a.md", "docs/modules/g/plan.md"]) {
      assert.strictEqual(isSafeRepoRelativePath(ok), true, ok);
    }
    for (const bad of [
      "",
      "/abs.md",
      "//unc/share.md",
      "C:/x.md",
      "..",
      "../x.md",
      "a/../../x.md",
      "a//b.md",
    ]) {
      assert.strictEqual(isSafeRepoRelativePath(bad), false, bad);
    }
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

  // Set 091 S1 classification matrix (verdict amendment 3): both empty
  // forms classify as a VALID empty manifest; genuinely malformed shapes
  // keep the fail-loud invalid classification.
  test("classifyModulesManifest matrix: empty forms valid, malformed shapes invalid (Set 091 S1)", () => {
    const root = tmpRoot("mod-classify-091-");
    try {
      for (const empty of [
        "modules: []\n",
        "modules:\n",
        "# note\nmodules: [ ]  # empty\n",
        "modules: null\n",
        "modules: ~\n",
      ]) {
        writeManifest(root, empty);
        assert.deepStrictEqual(
          classifyModulesManifest(root),
          { kind: "present", entries: [] },
          `valid empty: ${JSON.stringify(empty)}`,
        );
      }
      for (const invalid of [
        "just a string\n",
        "- a\n- sequence\n",
        "somethingElse: true\n", // no modules key
        "modules: not-a-list\n", // wrong-typed value
        "modules: nUll\n", // non-core null casing parses as a string
        "modules:\n  - slug: [unclosed\n\tmix", // broken YAML
      ]) {
        writeManifest(root, invalid);
        assert.deepStrictEqual(
          classifyModulesManifest(root),
          { kind: "invalid" },
          `still invalid: ${JSON.stringify(invalid)}`,
        );
      }
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

  // Set 091 S1 (verdict amendment 3): a valid EMPTY manifest resolves
  // exactly like an absent one — single pseudo-module, no QuickPick, no
  // notice, no error. Every S3 authoring flow shares this picker, so
  // this pins the empty-parity behavior for the plan prompt, plan
  // import, and decomposition-prompt flows in one place.
  test("pickModuleForAuthoring: valid-empty manifests (`modules: []` / bare `modules:` / template) → none, no UI (Set 091 S1)", async () => {
    for (const empty of ["modules: []\n", "modules:\n", MODULES_YAML_TEMPLATE]) {
      const root = tmpRoot("mod-pick-empty-");
      const log = { infos: [] as string[], picks: [] as ModulePickItem[][], errors: [] as string[] };
      try {
        writeManifest(root, empty);
        const out = await pickModuleForAuthoring(root, pickUi(log));
        assert.deepStrictEqual(out, { kind: "none", entry: null }, JSON.stringify(empty.slice(0, 30)));
        assert.strictEqual(log.infos.length, 0, "no auto-select notice");
        assert.strictEqual(log.picks.length, 0, "no QuickPick");
        assert.strictEqual(log.errors.length, 0, "no invalid-manifest error");
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
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
      // `modules:` not the last top-level key — the append guard refuses.
      // (Set 091 S1 flipped the old `modules: []` fixture: empty forms
      // now grow into their first entry instead of refusing.)
      writeManifest(root, "modules:\n  - slug: greeter\nowner: someone\n");
      const ok = await runNewModuleFlow(flowUi(root, ["clock", "Clock"], log));
      assert.strictEqual(ok, false);
      assert.strictEqual(log.errors.length, 1);
      assert.ok(log.errors[0].includes("New module was not created"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  // Set 091 S1: the New Module flow over an empty manifest — the
  // end-to-end path an operator hits on a template-scaffolded repo.
  test("new-module flow grows an empty manifest (the template) into its first entry", async () => {
    const root = tmpRoot("mod-flow-empty-");
    const log = freshFlowLog();
    try {
      writeManifest(root, MODULES_YAML_TEMPLATE);
      const ok = await runNewModuleFlow(flowUi(root, ["greeter", "Greeter"], log));
      assert.strictEqual(ok, true);
      assert.strictEqual(log.errors.length, 0);
      assert.strictEqual(readModulesManifest(root)![0].slug, "greeter");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
