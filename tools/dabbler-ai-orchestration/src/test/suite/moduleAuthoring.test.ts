// Set 087 Session 3 — the "New module" scaffold (docs/modules.yaml append
// + plan stub) and the shared module-target picker the authoring flows
// use. Exercises the REAL fs against temp roots (the modulesManifest.test
// pattern) so the tolerant reader and the scaffold are tested together.

import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  EnsureManifestIo,
  INVALID_MANIFEST_MESSAGE,
  MODULES_YAML_TEMPLATE,
  ModulePickItem,
  ModulePickUi,
  assertStampedTextValid,
  assignLegacySetsToModule,
  classifyModulesManifest,
  defaultModulePlanPath,
  ensureModulesManifest,
  isSafeRepoRelativePath,
  modulePlanRelPath,
  pickModuleForAuthoring,
  renderModuleManifestEntry,
  renderModulePlanStub,
  replaceEmptyModulesList,
  resolveModuleTarget,
  scaffoldNewModule,
  stampModuleIntoSpecText,
  unknownModuleMessage,
  validateNewModuleSlug,
} from "../../utils/moduleAuthoring";
import { runNewModuleFlow, NewModuleUi } from "../../commands/newModule";
import {
  ExclusiveWriteOps,
  readModulesManifest,
  parseSessionSetConfig,
  writeFileExclusiveSync,
} from "../../utils/fileSystem";
import {
  buildVisibleModulePayloads,
  computeVisibleModules,
} from "../../providers/SessionSetsModel";
import { ModuleManifestEntry, SessionSet } from "../../types";

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

// ---------------------------------------------------------------------
// Set 094 Session 1 (adjudication A) — the shared ensure-write primitive.
// docs/modules.yaml is CREATED from the canonical template ONLY on an
// explicit user action, and NEVER overwritten (a present manifest, valid
// or invalid, is left byte-for-byte intact). The read / classify path — the
// passive snapshot path the tree render runs — never writes.
// ---------------------------------------------------------------------

suite("moduleAuthoring — ensureModulesManifest (Set 094)", () => {
  const manifestAbs = (root: string) =>
    path.join(root, "docs", "modules.yaml");

  test("absent manifest: creates it from MODULES_YAML_TEMPLATE, created:true", () => {
    const root = tmpRoot("ensure-absent-");
    try {
      const r = ensureModulesManifest(root);
      assert.strictEqual(r.created, true);
      assert.strictEqual(r.manifestRel, "docs/modules.yaml");
      assert.strictEqual(
        fs.readFileSync(manifestAbs(root), "utf8"),
        MODULES_YAML_TEMPLATE,
        "the created file is the canonical template verbatim",
      );
      // It classifies as a valid EMPTY manifest (row 4/5 state).
      const classified = classifyModulesManifest(root);
      assert.strictEqual(classified.kind, "present");
      assert.deepStrictEqual(
        classified.kind === "present" ? classified.entries : null,
        [],
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("present (valid) manifest: never overwritten, created:false (idempotent)", () => {
    const root = tmpRoot("ensure-present-");
    try {
      const existing = "modules:\n  - slug: greeter\n    title: Greeter\n";
      writeManifest(root, existing);
      const r = ensureModulesManifest(root);
      assert.strictEqual(r.created, false);
      assert.strictEqual(
        readManifestText(root),
        existing,
        "an existing manifest survives byte-for-byte",
      );
      // A second ensure is likewise a no-op.
      assert.strictEqual(ensureModulesManifest(root).created, false);
      assert.strictEqual(readManifestText(root), existing);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("existing-destination fast-path never STAGES a temp (injected spy; round-6/7)", () => {
    // Round-7: the round-6 "no stray temp remains" test could NOT distinguish
    // the fast-path from a temp-first impl (which cleans up in finally). This
    // injects the fs ops and asserts writeExclusive is NEVER called when the
    // destination exists — the portable proof that opening an existing manifest
    // needs no write beside it (so a read-only / full docs/ can't break it).
    const calls = { lstat: 0, writeExclusive: 0, link: 0 };
    const ops: ExclusiveWriteOps = {
      lstat: () => void calls.lstat++, // returns normally => destination present
      writeExclusive: () => void calls.writeExclusive++,
      link: () => void calls.link++,
      remove: () => {},
    };
    assert.throws(
      () => writeFileExclusiveSync("/repo/docs/modules.yaml", "data", ops),
      /EEXIST/,
    );
    assert.strictEqual(calls.lstat, 1, "the fast-path stat runs");
    assert.strictEqual(
      calls.writeExclusive,
      0,
      "no temp is staged when the destination exists",
    );
    assert.strictEqual(calls.link, 0, "no publish attempted for an existing dest");
  });

  test("link-unsupported filesystem fails LOUD (no racy fallback) and cleans the temp (round-7)", () => {
    // Round-7: on a filesystem without hard links (FAT/exFAT, some network FS)
    // linkSync throws ENOTSUP/EPERM. The primitive must NOT fall back to a
    // create that could follow a racing symlink — it fails loud with an
    // actionable message, staging temp cleaned.
    const removed: string[] = [];
    let staged = 0;
    const ops: ExclusiveWriteOps = {
      lstat: () => {
        const e: NodeJS.ErrnoException = new Error("ENOENT");
        e.code = "ENOENT";
        throw e; // destination absent
      },
      writeExclusive: () => void staged++,
      link: () => {
        const e: NodeJS.ErrnoException = new Error("ENOTSUP");
        e.code = "ENOTSUP";
        throw e;
      },
      remove: (p) => void removed.push(p),
    };
    assert.throws(
      () => writeFileExclusiveSync("/repo/docs/modules.yaml", "data", ops),
      /does not support hard links/,
    );
    assert.strictEqual(staged, 1, "the temp is staged, then the link is attempted");
    assert.strictEqual(removed.length, 1, "the staging temp is cleaned up on failure");
    assert.ok(
      removed[0].includes("dabbler-exclusive-tmp"),
      "the cleaned path is the staging temp",
    );
  });

  test("a destination that RACES in (link EEXIST) is surfaced as EEXIST → created:false (round-7)", () => {
    // If an entry appears between the fast-path stat and the atomic link, link
    // fails EEXIST and NEVER follows/replaces it — surfaced as EEXIST so
    // ensureModulesManifest reports created:false (never a write-through).
    const ops: ExclusiveWriteOps = {
      lstat: () => {
        const e: NodeJS.ErrnoException = new Error("ENOENT");
        e.code = "ENOENT";
        throw e; // absent at stat time...
      },
      writeExclusive: () => {},
      link: () => {
        const e: NodeJS.ErrnoException = new Error("EEXIST"); // ...but raced in by publish
        e.code = "EEXIST";
        throw e;
      },
      remove: () => {},
    };
    assert.throws(
      () => writeFileExclusiveSync("/repo/docs/modules.yaml", "data", ops),
      (e: NodeJS.ErrnoException) => e.code === "EEXIST",
    );
  });

  test("present (INVALID) manifest: never overwritten — the guardrails own it", () => {
    const root = tmpRoot("ensure-invalid-");
    try {
      const broken = "just a string, not a manifest\n";
      writeManifest(root, broken);
      assert.strictEqual(classifyModulesManifest(root).kind, "invalid");
      const r = ensureModulesManifest(root);
      assert.strictEqual(r.created, false, "never creates over a present entry");
      assert.strictEqual(
        readManifestText(root),
        broken,
        "an invalid manifest is left intact — ensure never auto-overwrites",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("existing DIRECTORY at the manifest path: created:false, never overwritten (atomic publish)", () => {
    const root = tmpRoot("ensure-dir-");
    try {
      // A directory entry named docs/modules.yaml must fail the exclusive
      // create (EEXIST) exactly like a file — never clobbered.
      fs.mkdirSync(manifestAbs(root), { recursive: true });
      const r = ensureModulesManifest(root);
      assert.strictEqual(r.created, false);
      assert.ok(
        fs.statSync(manifestAbs(root)).isDirectory(),
        "the directory entry survives untouched",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("DANGLING symlink at the manifest path: created:false, never followed (Round-2/4 Major)", () => {
    // The correctness finding across rounds 2 and 4: a dangling manifest
    // symlink must never be written THROUGH to an out-of-workspace target,
    // with no check-then-act window. The atomic hard-link publish
    // (writeFileExclusiveSync: temp-write → link()) fails EEXIST on the
    // symlink at the destination and never follows it — one syscall, no
    // window — the SAME primitive makeFileOps.writeFileExclusive uses on the
    // scaffold path. (An O_EXCL `wx` write alone would follow the reparse
    // point on Windows; an lstat+wx pair reopened the race.)
    const root = tmpRoot("ensure-symlink-");
    const outsideTarget = path.join(root, "..", `escaped-${path.basename(root)}.yaml`);
    try {
      fs.mkdirSync(path.join(root, "docs"), { recursive: true });
      try {
        fs.symlinkSync(outsideTarget, manifestAbs(root)); // dangling: target absent
      } catch (err) {
        // Windows without Developer Mode / admin cannot create symlinks —
        // skip rather than fail (the guarantee is an OS-level O_EXCL property).
        if ((err as NodeJS.ErrnoException).code === "EPERM") return;
        throw err;
      }
      const r = ensureModulesManifest(root);
      assert.strictEqual(r.created, false, "never creates over a dangling symlink");
      assert.ok(
        fs.lstatSync(manifestAbs(root)).isSymbolicLink(),
        "the symlink entry survives untouched",
      );
      assert.ok(
        !fs.existsSync(outsideTarget),
        "the write is NEVER followed through the symlink to an outside target",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(outsideTarget, { force: true });
    }
  });

  test("maps an EEXIST-coded exclusive-write failure to created:false (injected io)", () => {
    const calls: { mkdirp: string[]; write: Array<[string, string]> } = {
      mkdirp: [],
      write: [],
    };
    const eexistIo: EnsureManifestIo = {
      mkdirp: (dir) => void calls.mkdirp.push(dir),
      writeFileExclusive: (abs, data) => {
        calls.write.push([abs, data]);
        const err: NodeJS.ErrnoException = new Error("EEXIST");
        err.code = "EEXIST";
        throw err;
      },
    };
    const r = ensureModulesManifest("/repo", eexistIo);
    assert.strictEqual(r.created, false);
    assert.strictEqual(calls.mkdirp.length, 1, "parent dir ensured first");
    assert.strictEqual(calls.write.length, 1, "exclusive create attempted once");
    assert.strictEqual(calls.write[0][1], MODULES_YAML_TEMPLATE);
  });

  test("re-throws a non-EEXIST write failure (a real I/O error is not swallowed)", () => {
    const io: EnsureManifestIo = {
      mkdirp: () => {},
      writeFileExclusive: () => {
        const err: NodeJS.ErrnoException = new Error("EACCES");
        err.code = "EACCES";
        throw err;
      },
    };
    assert.throws(() => ensureModulesManifest("/repo", io), /EACCES/);
  });

  test("the pure read / classify model functions never write docs/modules.yaml", () => {
    // Supplemental (model-level) coverage: the pure functions the passive
    // snapshot path composes — classify + read + computeVisibleModules — never
    // create the manifest over an ABSENT fixture. The end-to-end activation /
    // snapshot / refresh no-write guarantee is proven at Layer 3
    // (session-sets-tree.spec.ts "opening/refreshing an empty workspace never
    // creates docs/modules.yaml"); the structural guard below pins that no
    // passive host / activation call site reaches ensureModulesManifest.
    const root = tmpRoot("ensure-noread-write-");
    try {
      const classified = classifyModulesManifest(root);
      assert.strictEqual(classified.kind, "absent");
      assert.strictEqual(readModulesManifest(root), null);
      computeVisibleModules(classified, [], { legacyRootPlanExists: false });
      assert.ok(
        !fs.existsSync(manifestAbs(root)),
        "reading / classifying must never CREATE the manifest — adjudication A",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("structural guard: no passive host / activation / watcher path calls ensureModulesManifest (adjudication A)", () => {
    // Adjudication A / routed ruling Q4: the ensure-write is an EXPLICIT-ACTION
    // primitive. This pins the trust boundary at the SOURCE level — the passive
    // snapshot builders (buildGettingStarted / buildModules / buildSystemStatus)
    // and the activation + watcher wiring must NEVER reference
    // ensureModulesManifest, so a future edit that made "opening or refreshing a
    // repo" write the manifest fails this test immediately (no live host / VSIX
    // launch required). The legitimate callers are the explicit-action sites
    // (openModulesManifest.ts, gitScaffold.ts scaffold, moduleAuthoring.ts
    // Add-module, and Session 2's copy-decomposition command) — not asserted here.
    const srcDir = path.resolve(process.cwd(), "src");
    const passivePaths = [
      path.join(srcDir, "providers", "CustomSessionSetsView.ts"),
      path.join(srcDir, "extension.ts"),
    ];
    for (const file of passivePaths) {
      const text = fs.readFileSync(file, "utf8");
      assert.ok(
        !/\bensureModulesManifest\b/.test(text),
        `${path.basename(file)} must not reference ensureModulesManifest — the ` +
          `passive snapshot / activation / watcher path must never write the manifest`,
      );
    }
  });
});

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
  test("absent manifest: creates docs/modules.yaml from the canonical template + entry, plus the plan stub (Set 094)", () => {
    const root = tmpRoot("mod-scaffold-fresh-");
    try {
      const r = scaffoldNewModule(root, "greeter", "Greeter Service");
      assert.strictEqual(r.manifestCreated, true);
      assert.strictEqual(r.planCreated, true);
      assert.strictEqual(r.planRel, "docs/modules/greeter/project-plan.md");

      const text = readManifestText(root);
      // Set 094: a created manifest now starts from MODULES_YAML_TEMPLATE
      // (header comments + commented example entries), grown into its first
      // block-style entry — the SAME shape the ensure-write sites write.
      assert.ok(
        text.startsWith(MODULES_YAML_TEMPLATE.slice(0, 40)),
        "template header present",
      );
      assert.ok(
        text.includes("# - slug: payment-api"),
        "the commented example entries carry over from the template",
      );
      // The tolerant reader parses the created file back to exactly one
      // (live) entry with the explicit planPath (the commented examples are
      // comments, never parsed as entries).
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

// Set 093 Session 2 (routed ruling D1): the explicit-module-target seam.
// A row/context invocation carries its module, so pickModuleForAuthoring
// must skip BOTH the QuickPick and the auto-select notice — and fail loud on
// a slug that no longer resolves (a stale snapshot), never fall to the repo
// plan. This is the "targeting parity" contract (row vs palette).
suite("moduleAuthoring — preselected module target (Set 093 S2)", () => {
  function pickUi(log: {
    infos: string[];
    picks: ModulePickItem[][];
    errors: string[];
  }): ModulePickUi {
    return {
      showQuickPick: async (items) => {
        log.picks.push(items);
        return undefined;
      },
      showInformationMessage: (m) => void log.infos.push(m),
      showErrorMessage: (m) => void log.errors.push(m),
    };
  }
  function fresh() {
    return { infos: [] as string[], picks: [] as ModulePickItem[][], errors: [] as string[] };
  }
  const twoModules =
    "modules:\n" +
    "  - slug: greeter\n    title: Greeter\n" +
    "  - slug: payments\n    title: Payments\n";

  test("declared preselect resolves WITHOUT a QuickPick or a notice — even with >=2 modules", async () => {
    const root = tmpRoot("mod-preselect-");
    const log = fresh();
    try {
      writeManifest(root, twoModules);
      const out = await pickModuleForAuthoring(root, pickUi(log), {
        preselectedSlug: "payments",
      });
      assert.strictEqual(out.kind, "picked");
      assert.strictEqual(out.entry?.slug, "payments");
      assert.strictEqual(log.picks.length, 0, "no QuickPick on a row path");
      assert.strictEqual(log.infos.length, 0, "no auto-select notice on a row path");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("empty preselect ('') is repo-level (none) — no QuickPick even with >=2 modules (pseudo row)", async () => {
    const root = tmpRoot("mod-preselect-empty-");
    const log = fresh();
    try {
      writeManifest(root, twoModules);
      const out = await pickModuleForAuthoring(root, pickUi(log), {
        preselectedSlug: "",
      });
      assert.strictEqual(out.kind, "none");
      assert.strictEqual(log.picks.length, 0);
      assert.strictEqual(log.infos.length, 0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("unresolvable preselect → unknown-module + a loud error, NEVER repo-level fallback", async () => {
    const root = tmpRoot("mod-preselect-stale-");
    const log = fresh();
    try {
      writeManifest(root, twoModules);
      const out = await pickModuleForAuthoring(root, pickUi(log), {
        preselectedSlug: "ghost",
      });
      assert.strictEqual(out.kind, "unknown-module");
      assert.strictEqual(log.errors.length, 1);
      assert.ok(log.errors[0] === unknownModuleMessage("ghost"));
      assert.strictEqual(log.picks.length, 0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("invalid manifest aborts BEFORE the preselect branch (a stale slug on a broken file is 'invalid', not 'unknown')", async () => {
    const root = tmpRoot("mod-preselect-invalid-");
    const log = fresh();
    try {
      writeManifest(root, "just a string\n");
      const out = await pickModuleForAuthoring(root, pickUi(log), {
        preselectedSlug: "greeter",
      });
      assert.strictEqual(out.kind, "invalid-manifest");
      assert.strictEqual(log.errors.length, 1);
      assert.ok(log.errors[0].includes("not a valid module manifest"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("targeting parity: a declared preselect and the palette QuickPick resolve the SAME entry", async () => {
    const root = tmpRoot("mod-parity-");
    try {
      writeManifest(root, twoModules);
      const rowLog = fresh();
      const row = await pickModuleForAuthoring(root, pickUi(rowLog), {
        preselectedSlug: "greeter",
      });
      // Palette path: the operator picks "greeter" from the QuickPick.
      const paletteUi: ModulePickUi = {
        showQuickPick: async (items) => items.find((i) => i.entry.slug === "greeter"),
        showInformationMessage: () => undefined,
        showErrorMessage: () => undefined,
      };
      const palette = await pickModuleForAuthoring(root, paletteUi);
      assert.strictEqual(row.kind, "picked");
      assert.strictEqual(palette.kind, "picked");
      assert.deepStrictEqual(row.entry, palette.entry);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

// Set 093 Session 2 (routed ruling D4): the format-preserving spec.md
// `module:` stamp writer + the two-phase batch assign flow.
suite("moduleAuthoring — module stamp writer (Set 093 S2)", () => {
  const SPEC = [
    "# My Set",
    "",
    "## Session Set Configuration",
    "",
    "```yaml",
    "tier: full          # keep this comment",
    "requiresUAT: false",
    "```",
    "",
    "## Sessions",
    "body text",
    "",
  ].join("\n");

  test("stampModuleIntoSpecText inserts module: as the first block line, preserving every other byte", () => {
    const out = stampModuleIntoSpecText(SPEC, "greeter");
    assert.strictEqual(out.kind, "written");
    if (out.kind !== "written") return;
    assert.ok(out.text.includes("```yaml\nmodule: greeter\ntier: full"));
    // Comment + all other content survive verbatim.
    assert.ok(out.text.includes("# keep this comment"));
    assert.ok(out.text.includes("## Sessions\nbody text"));
    // Byte-diff guard passes for the real splice.
    assert.doesNotThrow(() => assertStampedTextValid(SPEC, out.text, "greeter"));
  });

  // Set 093 S2 verification R6 (Major): a valid splice must NOT be refused
  // when the first existing block key ALSO starts with `m` (model:/mode:) —
  // the byte-diff guard used to mis-identify the inserted line here and gate
  // the whole batch.
  test("stamp + guard succeed when the first config key starts with 'm' (model:)", () => {
    const spec = [
      "## Session Set Configuration",
      "```yaml",
      "model: opus",
      "mode: fast",
      "tier: full",
      "```",
      "",
    ].join("\n");
    const out = stampModuleIntoSpecText(spec, "greeter");
    assert.strictEqual(out.kind, "written");
    if (out.kind !== "written") return;
    assert.ok(out.text.includes("```yaml\nmodule: greeter\nmodel: opus\nmode: fast"));
    assert.doesNotThrow(() => assertStampedTextValid(spec, out.text, "greeter"));
  });

  test("assignLegacySetsToModule stamps sets whose first config key starts with 'm' (single + multi)", () => {
    const root = tmpRoot("assign-mkey-");
    try {
      writeManifest(root, "modules:\n  - slug: greeter\n    title: Greeter\n");
      const mSpec = [
        "# Set",
        "## Session Set Configuration",
        "```yaml",
        "model: opus",
        "tier: full",
        "```",
        "",
      ].join("\n");
      const a = specWith(root, "001-a", mSpec);
      const b = specWith(root, "002-b", mSpec);
      const report = assignLegacySetsToModule(root, "greeter", [
        { name: "001-a", specAbs: a },
        { name: "002-b", specAbs: b },
      ]);
      assert.deepStrictEqual(report.stamped.sort(), ["001-a", "002-b"]);
      assert.strictEqual(report.refused, undefined);
      assert.strictEqual(report.writeFailed, undefined);
      assert.ok(fs.readFileSync(a, "utf8").includes("```yaml\nmodule: greeter\nmodel: opus"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("stampModuleIntoSpecText is a no-op when already stamped to the same slug", () => {
    const already = SPEC.replace("```yaml\n", "```yaml\nmodule: greeter\n");
    assert.strictEqual(stampModuleIntoSpecText(already, "greeter").kind, "noop");
  });

  test("stampModuleIntoSpecText refuses when stamped to a DIFFERENT module", () => {
    const other = SPEC.replace("```yaml\n", "```yaml\nmodule: payments\n");
    const out = stampModuleIntoSpecText(other, "greeter");
    assert.strictEqual(out.kind, "refused");
    if (out.kind === "refused") {
      assert.strictEqual(out.reason.code, "already-assigned");
    }
  });

  test("stampModuleIntoSpecText refuses with no config block / no yaml fence", () => {
    assert.strictEqual(
      stampModuleIntoSpecText("# Just a title\n\nbody\n", "greeter").kind === "refused" &&
        (stampModuleIntoSpecText("# Just a title\n\nbody\n", "greeter") as any).reason.code,
      "no-config-block",
    );
    const noFence = "## Session Set Configuration\n\ntier: full\n\n## Sessions\n";
    const out = stampModuleIntoSpecText(noFence, "greeter");
    assert.strictEqual(out.kind, "refused");
    if (out.kind === "refused") assert.strictEqual(out.reason.code, "no-yaml-fence");
  });

  // Set 093 S2 verification R2 (Major): an UNTERMINATED config fence must
  // refuse — never borrow a closing fence from a LATER section (which would
  // let a malformed block be mutated instead of rejected).
  test("stampModuleIntoSpecText refuses an unterminated fence even when a later section has a fence", () => {
    const malformed = [
      "## Session Set Configuration",
      "```yaml",
      "tier: full",
      "",
      "## Sessions",
      "```yaml",
      "not-really: config",
      "```",
      "",
    ].join("\n");
    const out = stampModuleIntoSpecText(malformed, "greeter");
    assert.strictEqual(out.kind, "refused");
    if (out.kind === "refused") assert.strictEqual(out.reason.code, "no-yaml-fence");
    // And nothing was produced — the input is unchanged (caller writes nothing).
    assert.ok(!("text" in out));
  });

  test("assertStampedTextValid throws when anything besides the single line changed", () => {
    const written = stampModuleIntoSpecText(SPEC, "greeter");
    if (written.kind !== "written") return assert.fail("expected written");
    // Tamper with an unrelated line — the byte-diff guard must catch it.
    const tampered = written.text.replace("requiresUAT: false", "requiresUAT: true");
    assert.throws(() => assertStampedTextValid(SPEC, tampered, "greeter"));
    // Wrong target slug caught too.
    assert.throws(() => assertStampedTextValid(SPEC, written.text, "payments"));
  });

  function specWith(root: string, name: string, body: string): string {
    const dir = path.join(root, "docs", "session-sets", name);
    fs.mkdirSync(dir, { recursive: true });
    const p = path.join(dir, "spec.md");
    fs.writeFileSync(p, body, "utf8");
    return p;
  }

  test("assignLegacySetsToModule stamps multiple sets and reports them", () => {
    const root = tmpRoot("assign-multi-");
    try {
      writeManifest(root, "modules:\n  - slug: greeter\n    title: Greeter\n");
      const a = specWith(root, "001-a", SPEC);
      const b = specWith(root, "002-b", SPEC);
      const report = assignLegacySetsToModule(root, "greeter", [
        { name: "001-a", specAbs: a },
        { name: "002-b", specAbs: b },
      ]);
      assert.deepStrictEqual(report.stamped.sort(), ["001-a", "002-b"]);
      assert.strictEqual(report.refused, undefined);
      assert.ok(fs.readFileSync(a, "utf8").includes("module: greeter"));
      assert.ok(fs.readFileSync(b, "utf8").includes("module: greeter"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("assignLegacySetsToModule is all-or-nothing: one bad set leaves EVERY file untouched", () => {
    const root = tmpRoot("assign-atomic-");
    try {
      writeManifest(root, "modules:\n  - slug: greeter\n    title: Greeter\n");
      const good = specWith(root, "001-good", SPEC);
      // Second set has no yaml fence → phase-1 refusal for the whole batch.
      const bad = specWith(root, "002-bad", "## Session Set Configuration\n\ntier: full\n");
      const report = assignLegacySetsToModule(root, "greeter", [
        { name: "001-good", specAbs: good },
        { name: "002-bad", specAbs: bad },
      ]);
      assert.ok(report.refused, "batch refused");
      assert.strictEqual(report.stamped.length, 0);
      assert.ok(!fs.readFileSync(good, "utf8").includes("module:"), "good set untouched");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("assignLegacySetsToModule: already-same-target is a no-op skip, not a refusal", () => {
    const root = tmpRoot("assign-noop-");
    try {
      writeManifest(root, "modules:\n  - slug: greeter\n    title: Greeter\n");
      const already = SPEC.replace("```yaml\n", "```yaml\nmodule: greeter\n");
      const p = specWith(root, "001-a", already);
      const report = assignLegacySetsToModule(root, "greeter", [{ name: "001-a", specAbs: p }]);
      assert.deepStrictEqual(report.alreadyAssigned, ["001-a"]);
      assert.strictEqual(report.stamped.length, 0);
      assert.strictEqual(report.refused, undefined);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  // Set 093 S2 verification R9 resolution: the writer is ATOMIC (temp →
  // verify → rename), so ANY write failure leaves the operator's spec.md
  // intact — there is no partial-write / rollback / post-write-mismatch state.
  // A tiny in-memory fs models the four io ops; `<path>.dabbler-assign-tmp`
  // is the staging file.
  function memIo(
    store: Record<string, string>,
    over: Partial<{
      readFileSync: (p: string) => string;
      writeFileSync: (p: string, d: string) => void;
      renameSync: (from: string, to: string) => void;
      rmSync: (p: string) => void;
    }> = {},
  ) {
    return {
      readFileSync: (p: string) => {
        if (!(p in store)) throw new Error(`ENOENT: ${p}`);
        return store[p];
      },
      writeFileSync: (p: string, d: string) => {
        store[p] = d;
      },
      renameSync: (from: string, to: string) => {
        store[to] = store[from];
        delete store[from];
      },
      rmSync: (p: string) => {
        delete store[p];
      },
      ...over,
    };
  }

  // A corrupt STAGED write is caught by the temp verification BEFORE the
  // atomic rename — the target is never touched.
  test("assignLegacySetsToModule leaves the target intact when the staged temp does not verify", () => {
    const root = tmpRoot("assign-tmp-corrupt-");
    try {
      writeManifest(root, "modules:\n  - slug: greeter\n    title: Greeter\n");
      const fakePath = path.join(root, "docs", "session-sets", "001-a", "spec.md");
      const store: Record<string, string> = { [fakePath]: SPEC };
      const io = memIo(store, {
        writeFileSync: (p, d) => {
          // The temp write corrupts the staged bytes.
          store[p] = d.includes("module: greeter") ? "CORRUPT-STAGE" : d;
        },
      });
      const report = assignLegacySetsToModule(
        root,
        "greeter",
        [{ name: "001-a", specAbs: fakePath }],
        io,
      );
      assert.ok(report.writeFailed);
      assert.strictEqual(report.stamped.length, 0);
      assert.strictEqual(store[fakePath], SPEC, "the target spec.md is untouched");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  // A throwing (temp) write leaves the target intact — the atomic rename
  // never runs.
  test("assignLegacySetsToModule leaves the target intact when the staged write throws", () => {
    const root = tmpRoot("assign-tmp-throw-");
    try {
      writeManifest(root, "modules:\n  - slug: greeter\n    title: Greeter\n");
      const fakePath = path.join(root, "docs", "session-sets", "001-a", "spec.md");
      const store: Record<string, string> = { [fakePath]: SPEC };
      const io = memIo(store, {
        writeFileSync: () => {
          throw new Error("disk full");
        },
      });
      const report = assignLegacySetsToModule(
        root,
        "greeter",
        [{ name: "001-a", specAbs: fakePath }],
        io,
      );
      assert.ok(report.writeFailed);
      assert.ok(/left intact/i.test(report.writeFailed!.reason));
      assert.strictEqual(store[fakePath], SPEC);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  // Set 093 S2 verification R4 (Major, TOCTOU): a file changed AFTER phase-1
  // validation (a concurrent editor) must NOT be overwritten with the stale
  // splice — the writer re-reads immediately before writing and refuses,
  // preserving the external edit.
  test("assignLegacySetsToModule refuses to overwrite a file edited after validation", () => {
    const root = tmpRoot("assign-toctou-");
    try {
      writeManifest(root, "modules:\n  - slug: greeter\n    title: Greeter\n");
      const fakePath = path.join(root, "docs", "session-sets", "001-a", "spec.md");
      const edited = SPEC.replace("# My Set", "# My Set (edited by hand)");
      const store: Record<string, string> = { [fakePath]: SPEC };
      let reads = 0;
      const io = memIo(store, {
        readFileSync: (p) => {
          reads++;
          // phase-1 read sees the original; the pre-write re-read (2nd) sees
          // the external edit.
          if (reads >= 2 && p === fakePath) {
            store[p] = edited;
            return edited;
          }
          return store[p];
        },
      });
      const report = assignLegacySetsToModule(
        root,
        "greeter",
        [{ name: "001-a", specAbs: fakePath }],
        io,
      );
      assert.ok(report.writeFailed);
      assert.ok(/concurrent edit|changed after/i.test(report.writeFailed!.reason));
      assert.strictEqual(report.stamped.length, 0);
      // The external edit is preserved (never overwritten).
      assert.strictEqual(store[fakePath], edited);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  // Set 093 S2 verification R10 (Major): a concurrent edit landing during the
  // staged write (between the pre-write check and the rename) must survive —
  // the final target re-check before the rename aborts rather than clobber it.
  test("assignLegacySetsToModule preserves a concurrent edit that lands during staging", () => {
    const root = tmpRoot("assign-stage-race-");
    try {
      writeManifest(root, "modules:\n  - slug: greeter\n    title: Greeter\n");
      const fakePath = path.join(root, "docs", "session-sets", "001-a", "spec.md");
      const userEdit = SPEC.replace("# My Set", "# CONCURRENT SAVE DURING STAGING");
      const store: Record<string, string> = { [fakePath]: SPEC };
      const isTmp = (p: string) => p.endsWith(".dabbler-assign-tmp");
      const io = memIo(store, {
        writeFileSync: (p, d) => {
          store[p] = d;
          // A concurrent editor saves the TARGET while we stage the temp.
          if (isTmp(p)) store[fakePath] = userEdit;
        },
      });
      const report = assignLegacySetsToModule(
        root,
        "greeter",
        [{ name: "001-a", specAbs: fakePath }],
        io,
      );
      assert.ok(report.writeFailed);
      assert.ok(/changed during the staged write|concurrent edit/i.test(report.writeFailed!.reason));
      assert.strictEqual(report.stamped.length, 0);
      // The concurrent edit survives; the (unique) staged temp was cleaned up.
      assert.strictEqual(store[fakePath], userEdit);
      assert.ok(!Object.keys(store).some(isTmp), "the staged temp was discarded");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  // Set 093 S2 verification R9 (Major): an indented `module:` inside a block
  // scalar / nested mapping is NOT a top-level stamp — it must not be mistaken
  // for "already assigned"; the writer stamps a real top-level key.
  test("stampModuleIntoSpecText: a nested / block-scalar `module:` is not a stamp (parsed top-level)", () => {
    const nested = [
      "## Session Set Configuration",
      "```yaml",
      "notes: |",
      "  module: greeter",
      "tier: full",
      "```",
      "",
    ].join("\n");
    const out = stampModuleIntoSpecText(nested, "greeter");
    assert.strictEqual(out.kind, "written", "must splice a real top-level module key");
    if (out.kind !== "written") return;
    assert.ok(out.text.includes("```yaml\nmodule: greeter\nnotes: |"));
    assert.doesNotThrow(() => assertStampedTextValid(nested, out.text, "greeter"));
  });

  test("assignLegacySetsToModule stamps a set whose block scalar contains a `module:` line", () => {
    const root = tmpRoot("assign-nested-");
    try {
      writeManifest(root, "modules:\n  - slug: greeter\n    title: Greeter\n");
      const nested = [
        "# Set",
        "## Session Set Configuration",
        "```yaml",
        "notes: |",
        "  module: greeter (a mention, not a stamp)",
        "tier: full",
        "```",
        "",
      ].join("\n");
      const p = specWith(root, "001-a", nested);
      const report = assignLegacySetsToModule(root, "greeter", [{ name: "001-a", specAbs: p }]);
      assert.deepStrictEqual(report.stamped, ["001-a"]);
      assert.ok(fs.readFileSync(p, "utf8").includes("```yaml\nmodule: greeter\nnotes: |"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  // Set 093 S2 verification R8 (Major): the target must be re-validated
  // against the manifest at WRITE time. If the module is removed from
  // docs/modules.yaml during phase-1 reads, phase 2 must refuse before
  // stamping any spec.md with the now-obsolete slug.
  test("assignLegacySetsToModule refuses (no writes) when the target module is removed between phase 1 and phase 2", () => {
    const root = tmpRoot("assign-manifest-toctou-");
    try {
      writeManifest(root, "modules:\n  - slug: greeter\n    title: Greeter\n");
      const a = specWith(root, "001-a", SPEC);
      const b = specWith(root, "002-b", SPEC);
      let rewrote = false;
      const io = {
        readFileSync: (p: string) => {
          const content = fs.readFileSync(p, "utf8");
          // On the first spec read (phase 1), remove the target from the real
          // manifest so the write-time re-validation sees it gone.
          if (!rewrote) {
            writeManifest(root, "modules: []\n");
            rewrote = true;
          }
          return content;
        },
        writeFileSync: (p: string, d: string) => fs.writeFileSync(p, d, "utf8"),
        renameSync: (from: string, to: string) => fs.renameSync(from, to),
        rmSync: (p: string) => fs.rmSync(p, { force: true }),
      };
      const report = assignLegacySetsToModule(
        root,
        "greeter",
        [
          { name: "001-a", specAbs: a },
          { name: "002-b", specAbs: b },
        ],
        io,
      );
      assert.ok(report.refused, "must refuse when the target vanished at write time");
      assert.strictEqual(report.stamped.length, 0);
      assert.ok(!fs.readFileSync(a, "utf8").includes("module:"), "001-a untouched");
      assert.ok(!fs.readFileSync(b, "utf8").includes("module:"), "002-b untouched");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("assignLegacySetsToModule never writes the pseudo/default target and refuses an undeclared one", () => {
    const root = tmpRoot("assign-guard-");
    try {
      writeManifest(root, "modules:\n  - slug: greeter\n    title: Greeter\n");
      const p = specWith(root, "001-a", SPEC);
      for (const bad of ["", "default", "Default", "ghost"]) {
        const report = assignLegacySetsToModule(root, bad, [{ name: "001-a", specAbs: p }]);
        assert.ok(report.refused, `refuses target ${JSON.stringify(bad)}`);
        assert.ok(!fs.readFileSync(p, "utf8").includes("module:"), "file untouched");
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  // Set 093 S2 verification R3 (Major): the never-hide-work regrouping
  // invariant, driven WRITER → parser → model (the spec's Step-5 promise
  // "Unassigned disappears from a module only when emptied — work never
  // vanishes"). Parses the stamped config back off disk so the assertion
  // exercises the real writer output, not a hand-set attribution.
  test("never-hide-work: Unassigned persists until emptied; total rows preserved", () => {
    const root = tmpRoot("assign-regroup-");
    try {
      writeManifest(root, "modules:\n  - slug: greeter\n    title: Greeter\n");
      const names = ["001-a", "002-b", "003-c"];
      const specs = names.map((n) => specWith(root, n, SPEC));
      // Re-read each set's raw `module:` stamp from disk and build the
      // minimal SessionSet computeVisibleModules re-derives attribution from.
      const setsFromDisk = (): SessionSet[] =>
        names.map(
          (name, i) =>
            ({
              name,
              specPath: specs[i],
              root,
              state: "not-started",
              lastTouched: null,
              config: parseSessionSetConfig(specs[i]),
            }) as unknown as SessionSet,
        );
      const visible = (sets: SessionSet[]) =>
        buildVisibleModulePayloads(
          computeVisibleModules(classifyModulesManifest(root), sets, {
            legacyRootPlanExists: false,
          }),
          (s) => ({ slug: s.name }) as never,
        );
      const totalRows = (mods: ReturnType<typeof visible>) =>
        mods.reduce(
          (n, m) => n + m.buckets.reduce((b, bk) => b + bk.rows.length, 0),
          0,
        );

      // Baseline: all three unassigned under the pseudo module.
      let mods = visible(setsFromDisk());
      let pseudo = mods.find((m) => m.kind === "pseudo");
      let greeter = mods.find((m) => m.slug === "greeter");
      assert.ok(pseudo && pseudo.title === "Unassigned");
      assert.strictEqual(totalRows([pseudo!]), 3);
      assert.strictEqual(totalRows([greeter!]), 0);
      assert.strictEqual(totalRows(mods), 3);

      // Assign a SUBSET → Unassigned PERSISTS with the remaining set; the
      // total is preserved (work never vanishes).
      assignLegacySetsToModule(root, "greeter", [
        { name: "001-a", specAbs: specs[0] },
        { name: "002-b", specAbs: specs[1] },
      ]);
      mods = visible(setsFromDisk());
      pseudo = mods.find((m) => m.kind === "pseudo");
      greeter = mods.find((m) => m.slug === "greeter");
      assert.ok(pseudo, "Unassigned must persist while a set is still unassigned");
      assert.strictEqual(totalRows([pseudo!]), 1);
      assert.strictEqual(totalRows([greeter!]), 2);
      assert.strictEqual(totalRows(mods), 3);

      // Assign the LAST set → Unassigned disappears ONLY now (emptied); every
      // set remains visible under greeter.
      assignLegacySetsToModule(root, "greeter", [{ name: "003-c", specAbs: specs[2] }]);
      mods = visible(setsFromDisk());
      pseudo = mods.find((m) => m.kind === "pseudo");
      greeter = mods.find((m) => m.slug === "greeter");
      assert.strictEqual(pseudo, undefined, "Unassigned disappears only when emptied");
      assert.strictEqual(totalRows([greeter!]), 3);
      assert.strictEqual(totalRows(mods), 3);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
