// Set 087 Session 3 — the shared module-authoring helpers, trimmed to the
// read/validate/classify surface by Set 122 Session 2.
//
// The writer suites that used to live here (scaffoldNewModule, the spec.md
// stamp writer, assignLegacySetsToModule, renameModule's preflight/apply/
// rollback matrices, deleteModule's apply matrix, the lifecycle-set
// scaffolder and its template renderers) went with the writers themselves.
// Those behaviours are not untested: `ai_router/tests/
// test_modules_lifecycle.py` owns them against the one implementation that
// remains, and it tests strictly more than these did — the TypeScript
// rename/delete had no rollback falsifiers, and its running-session refusal
// was narrower than the Python one.
//
// Exercises the REAL fs against temp roots (the modulesManifest.test
// pattern) so the tolerant reader and its callers are tested together.

import * as assert from "assert";
import * as cp from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  EnsureManifestIo,
  INVALID_MANIFEST_MESSAGE,
  MODULES_YAML_TEMPLATE,
  ModulePickItem,
  ModulePickUi,
  classifyModuleSetsForDeletion,
  classifyModulesManifest,
  defaultModulePlanPath,
  ensureModulesManifest,
  isSafeRepoRelativePath,
  modulePlanRelPath,
  pickModuleForAuthoring,
  resolveModuleTarget,
  unknownModuleMessage,
  validateNewModuleSlug,
} from "../../utils/moduleAuthoring";
import { runNewModuleFlow, NewModuleUi } from "../../commands/newModule";
import { RunRouterCliDeps } from "../../utils/routerCli";
import {
  ExclusiveWriteOps,
  readModulesManifest,
  parsePrerequisites,
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

/** Write `body` as `<root>/docs/session-sets/<name>/spec.md`, returning its absolute path. */
function specWith(root: string, name: string, body: string): string {
  const dir = path.join(root, "docs", "session-sets", name);
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, "spec.md");
  fs.writeFileSync(p, body, "utf8");
  return p;
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

  test("the canonical template header references the D6 decomposition command (spec D6)", () => {
    // Verdict amendment 8: the decomposition prompt is REFERENCED from the
    // manifest header — never embedded as a giant comment block. Pin the
    // pointer (the command title) and the absence of a pasted prompt body.
    assert.ok(
      MODULES_YAML_TEMPLATE.includes("Copy Module Decomposition Prompt"),
      "header names the decomposition command",
    );
    assert.ok(
      !MODULES_YAML_TEMPLATE.includes("Module-decomposition request"),
      "the prompt body is not embedded in the manifest header",
    );
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
    // Set 110 S3: the passive set GREW. The native `TreeDataProvider` and
    // the shared module assembly both run on a passive open, so both join
    // the boundary. Set 123 S3: `SetupStatusView.ts` and `systemStatus.ts`
    // leave the list because they no longer exist — the webview that hosted
    // the passive snapshot builders is deleted, and the tree provider plus
    // the shared assembly are now the whole passive path. The boundary is
    // unchanged; only the set of files that can violate it shrank.
    const srcDir = path.resolve(process.cwd(), "src");
    const passivePaths = [
      path.join(srcDir, "providers", "WorkExplorerTreeProvider.ts"),
      path.join(srcDir, "providers", "workExplorerTreeModel.ts"),
      path.join(srcDir, "providers", "moduleAssembly.ts"),
      path.join(srcDir, "providers", "SessionSetsModel.ts"),
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

// ---------- the palette / form flow over the CLI ----------
//
// Set 122 S2: `runNewModuleFlow` no longer scaffolds in TypeScript — it
// shells out to `python -m ai_router.modules create`. These tests drive the
// REAL CLI against a temp root (the `sampleProjectSmoke.test.ts` precedent)
// rather than stubbing the spawn, because the thing most likely to break
// here is the CONTRACT between the two sides — the flag names, the exit
// codes, the JSON keys the toast is built from. A stubbed spawn would
// assert the flow's own arithmetic and prove nothing about that.
//
// The interpreter is injected because a temp root has no `.venv`, so
// production resolution would correctly fall through to bare `python`.

interface FlowLog {
  inputs: string[];
  infos: string[];
  errors: string[];
  opened: string[];
}

/**
 * An interpreter that can `import ai_router`.
 *
 * Deliberately NOT skip-on-missing: a test that quietly skips is worse than
 * none, because the launcher contract would rot invisibly. The failure
 * message names the exact fix instead.
 */
function resolveCliPython(): string {
  const repoRoot = path.resolve(__dirname, "../../../../..");
  const candidates = [
    process.env.DABBLER_SMOKE_PYTHON,
    path.join(repoRoot, ".venv", "Scripts", "python.exe"),
    path.join(repoRoot, ".venv", "bin", "python"),
    "python",
    "python3",
  ].filter((c): c is string => !!c);
  for (const candidate of candidates) {
    const probe = cp.spawnSync(candidate, ["-c", "import ai_router"], {
      encoding: "utf8",
    });
    if (probe.status === 0) return candidate;
  }
  throw new Error(
    "The module-lifecycle flow tests need a Python interpreter with " +
      "`ai_router` importable. Tried: " +
      candidates.join(", ") +
      ". Fix it with `.venv/Scripts/pip install -e .` from the repo root, or " +
      "point DABBLER_SMOKE_PYTHON at a suitable interpreter.",
  );
}

let cliPython: string | undefined;

/** CLI deps that use the real router but a silent echo surface. */
function cliDeps(): RunRouterCliDeps {
  if (!cliPython) cliPython = resolveCliPython();
  return {
    resolveInterpreter: () => cliPython as string,
    echo: { append: () => undefined, reveal: () => undefined },
  };
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

suite("runNewModuleFlow (Set 087 S3, Python-backed since Set 122 S2)", () => {
  test("happy path: slug + title → manifest entry + stub, stub opened, toast", async () => {
    const root = tmpRoot("mod-flow-ok-");
    const log = freshFlowLog();
    try {
      const ok = await runNewModuleFlow(
        flowUi(root, ["greeter", "Greeter"], log),
        cliDeps(),
      );
      assert.strictEqual(ok, true, log.errors.join(" | "));
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
        const ok = await runNewModuleFlow(flowUi(root, answers, log), cliDeps());
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
      await runNewModuleFlow(flowUi(root, ["clock", ""], log), cliDeps());
      assert.strictEqual(readModulesManifest(root)![0].title, "clock");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("no workspace root errors loud", async () => {
    const log = freshFlowLog();
    const ok = await runNewModuleFlow(flowUi(undefined, [], log), cliDeps());
    assert.strictEqual(ok, false);
    assert.strictEqual(log.errors.length, 1);
  });

  test("a CLI refusal surfaces as an error toast, not a throw", async () => {
    const root = tmpRoot("mod-flow-refuse-");
    const log = freshFlowLog();
    try {
      // `modules:` not the last top-level key — the append guard refuses.
      writeManifest(root, "modules:\n  - slug: greeter\nowner: someone\n");
      const ok = await runNewModuleFlow(flowUi(root, ["clock", "Clock"], log), cliDeps());
      assert.strictEqual(ok, false);
      assert.strictEqual(log.errors.length, 1);
      assert.ok(
        log.errors[0].includes("New module refused") ||
          log.errors[0].includes("New module failed"),
        `unexpected message: ${log.errors[0]}`,
      );
      // The refusal contract: nothing was written.
      assert.strictEqual(
        fs.readFileSync(path.join(root, "docs", "modules.yaml"), "utf8"),
        "modules:\n  - slug: greeter\nowner: someone\n",
      );
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
      const ok = await runNewModuleFlow(
        flowUi(root, ["greeter", "Greeter"], log),
        cliDeps(),
      );
      assert.strictEqual(ok, true, log.errors.join(" | "));
      assert.strictEqual(log.errors.length, 0);
      assert.strictEqual(readModulesManifest(root)![0].slug, "greeter");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  // Set 100 Session 2 (spec: "Add module now scaffolds the module's two
  // lifecycle sets"): the end-to-end Add-module state — manifest entry +
  // plan stub + the two scaffolded sets, correctly numbered and linked.
  // A fresh empty root always starts numbering at 001, so this asserts the
  // exact slugs, not just a digit pattern.
  test("scaffolds the module's plan + decomposition lifecycle sets after the manifest append", async () => {
    const root = tmpRoot("mod-flow-lifecycle-");
    const log = freshFlowLog();
    try {
      const ok = await runNewModuleFlow(
        flowUi(root, ["greeter", "Greeter"], log),
        cliDeps(),
      );
      assert.strictEqual(ok, true, log.errors.join(" | "));
      assert.strictEqual(log.errors.length, 0);
      // One combined toast (not a second notification) names both sets.
      assert.strictEqual(log.infos.length, 1);
      assert.match(
        log.infos[0],
        /Next steps scaffolded: 001-greeter-plan and 002-greeter-decomposition\.$/,
      );

      const planName = "001-greeter-plan";
      const decompName = "002-greeter-decomposition";
      assert.ok(
        fs.existsSync(path.join(root, "docs", "session-sets", planName, "spec.md")),
        "plan set directory must exist",
      );
      assert.ok(
        fs.existsSync(path.join(root, "docs", "session-sets", decompName, "spec.md")),
        "decomposition set directory must exist",
      );

      const planConfig = parseSessionSetConfig(
        path.join(root, "docs", "session-sets", planName, "spec.md"),
      );
      assert.strictEqual(planConfig.kind, "plan");
      const decompConfig = parseSessionSetConfig(
        path.join(root, "docs", "session-sets", decompName, "spec.md"),
      );
      assert.strictEqual(decompConfig.kind, "decomposition");
      const prereqs = parsePrerequisites(
        path.join(root, "docs", "session-sets", decompName, "spec.md"),
      );
      assert.ok(
        prereqs?.some(
          (p: { slug: string; condition: string }) =>
            p.slug === planName && p.condition === "complete",
        ),
        "the decomposition set must prerequisite its sibling plan set",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  // NOT a "re-run the flow for the same slug" test — `runNewModuleFlow`
  // cannot be invoked twice for one slug (the input box's live validator
  // refuses a slug already in the manifest), so that path is unreachable
  // through the UI. What this DOES pin: a module that already carries
  // scaffolded lifecycle sets stays untouched when a LATER Add-module
  // declares a different module.
  test("an already-lifecycle-scaffolded module's sets survive a later Add-module for a different module", async () => {
    const root = tmpRoot("mod-flow-lifecycle-coexist-");
    const log = freshFlowLog();
    try {
      const first = await runNewModuleFlow(
        flowUi(root, ["greeter", "Greeter"], freshFlowLog()),
        cliDeps(),
      );
      assert.strictEqual(first, true);
      const before = fs
        .readdirSync(path.join(root, "docs", "session-sets"))
        .sort();
      assert.ok(before.length > 0, "the first module must have scaffolded its sets");

      const ok = await runNewModuleFlow(
        flowUi(root, ["clock", "Clock"], log),
        cliDeps(),
      );
      assert.strictEqual(ok, true, log.errors.join(" | "));
      // greeter's lifecycle sets are untouched; only clock's new ones land.
      const after = fs.readdirSync(path.join(root, "docs", "session-sets")).sort();
      for (const name of before) {
        assert.ok(after.includes(name), `${name} must survive the later Add-module`);
      }
      assert.ok(
        after.includes("003-clock-plan") && after.includes("004-clock-decomposition"),
        `clock's sets must be minted after greeter's; got ${after.join(", ")}`,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  // Set 122 S2 — a BEHAVIOUR CHANGE, asserted rather than assumed.
  //
  // The TypeScript flow wrote the manifest entry and the lifecycle sets as
  // two separate steps, so a scaffold failure left the module declared
  // without its sets ("module without sets beats half-written sets"). The
  // CLI runs the whole create in ONE transaction, so the same failure now
  // rolls the manifest back too and the flow reports an error. That is the
  // stronger contract, and this is its falsifier: the failure is INJECTED
  // (a same-named FILE where the plan set's directory must go) rather than
  // hoped for.
  test("a blocked lifecycle-set scaffold now rolls the whole create back", async () => {
    const root = tmpRoot("mod-flow-lifecycle-refuse-");
    const log = freshFlowLog();
    try {
      fs.mkdirSync(path.join(root, "docs", "session-sets"), { recursive: true });
      fs.writeFileSync(
        path.join(root, "docs", "session-sets", "001-greeter-plan"),
        "not a directory",
        "utf8",
      );
      const ok = await runNewModuleFlow(
        flowUi(root, ["greeter", "Greeter"], log),
        cliDeps(),
      );
      assert.strictEqual(ok, false, "a failed create must not report success");
      assert.strictEqual(log.errors.length, 1, log.errors.join(" | "));
      assert.strictEqual(log.infos.length, 0, "no success toast on a rolled-back create");
      // Nothing is left behind: no manifest entry, no plan stub.
      assert.strictEqual(
        readModulesManifest(root),
        null,
        "the manifest must not survive a rolled-back create",
      );
      assert.ok(
        !fs.existsSync(path.join(root, "docs", "modules", "greeter")),
        "the plan stub directory must not survive a rolled-back create",
      );
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

// ---------------------------------------------------------------------
// Set 099 Session 2 — the module DELETE writer + classification.
// ---------------------------------------------------------------------

suite("moduleAuthoring — classifyModuleSetsForDeletion (Set 099 S2)", () => {
  const moduleSpec = (slug: string, kindLine?: string): string =>
    [
      "# A Set",
      "## Session Set Configuration",
      "```yaml",
      `module: ${slug}`,
      ...(kindLine ? [kindLine] : []),
      "tier: full",
      "```",
      "",
    ].join("\n");

  const writeState = (dir: string, status: string, sessions: unknown[] = []): void => {
    fs.writeFileSync(
      path.join(dir, "session-state.json"),
      JSON.stringify({ schemaVersion: 4, status, sessions }),
      "utf8",
    );
  };

  test("complete set classifies terminal", () => {
    const root = tmpRoot("delclassify-complete-");
    try {
      const a = specWith(root, "001-a", moduleSpec("greeter"));
      writeState(path.dirname(a), "complete", [{ number: 1, status: "complete" }]);
      const [c] = classifyModuleSetsForDeletion(root, "greeter");
      assert.strictEqual(c.disposition, "terminal");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("already-cancelled set classifies terminal", () => {
    const root = tmpRoot("delclassify-cancelled-");
    try {
      const a = specWith(root, "001-a", moduleSpec("greeter"));
      writeState(path.dirname(a), "cancelled");
      const [c] = classifyModuleSetsForDeletion(root, "greeter");
      assert.strictEqual(c.disposition, "terminal");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  // Dogfood-caught regression: cancelSessionSet only touches
  // session-state.json when one ALREADY exists (a set cancelled before its
  // first start_session leaves ONLY CANCELLED.md on disk). readCancellationState
  // alone reports "unknown" for that shape — the classifier must fall back
  // to the legacy CANCELLED.md presence check (mirroring readSessionSets'
  // own fallback) or it would wrongly re-cancel an already-cancelled set.
  test("a set cancelled before ever having a session-state.json (CANCELLED.md only) classifies terminal", () => {
    const root = tmpRoot("delclassify-legacycancelled-");
    try {
      const a = specWith(root, "001-a", moduleSpec("greeter"));
      fs.writeFileSync(
        path.join(path.dirname(a), "CANCELLED.md"),
        "# Cancellation history\n\nCancelled on 2026-01-01T00:00:00-04:00\nunrelated prior cancel\n\n",
        "utf8",
      );
      assert.ok(!fs.existsSync(path.join(path.dirname(a), "session-state.json")));
      const [c] = classifyModuleSetsForDeletion(root, "greeter");
      assert.strictEqual(c.disposition, "terminal");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("kindless unstarted set (no state file at all) classifies cancel, not remove", () => {
    const root = tmpRoot("delclassify-kindless-");
    try {
      specWith(root, "001-a", moduleSpec("greeter"));
      const [c] = classifyModuleSetsForDeletion(root, "greeter");
      assert.strictEqual(c.disposition, "cancel");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("unstarted kind: plan scaffold with no execution artifacts classifies remove", () => {
    const root = tmpRoot("delclassify-planscaffold-");
    try {
      specWith(root, "001-a", moduleSpec("greeter", "kind: plan"));
      const [c] = classifyModuleSetsForDeletion(root, "greeter");
      assert.strictEqual(c.disposition, "remove");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("unstarted kind: decomposition scaffold with no execution artifacts classifies remove", () => {
    const root = tmpRoot("delclassify-decompscaffold-");
    try {
      specWith(root, "001-a", moduleSpec("greeter", "kind: decomposition"));
      const [c] = classifyModuleSetsForDeletion(root, "greeter");
      assert.strictEqual(c.disposition, "remove");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("a kind: plan set that was actually started (has an execution artifact) classifies cancel, not remove", () => {
    const root = tmpRoot("delclassify-startedplan-");
    try {
      const a = specWith(root, "001-a", moduleSpec("greeter", "kind: plan"));
      fs.writeFileSync(path.join(path.dirname(a), "ai-assignment.md"), "# Assignment\n", "utf8");
      const [c] = classifyModuleSetsForDeletion(root, "greeter");
      assert.strictEqual(c.disposition, "cancel");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("in-progress set classifies cancel (running-session refusal is the writer's separate gate)", () => {
    const root = tmpRoot("delclassify-inprogress-");
    try {
      const a = specWith(root, "001-a", moduleSpec("greeter"));
      writeState(path.dirname(a), "in-progress", [{ number: 1, status: "in-progress" }]);
      const [c] = classifyModuleSetsForDeletion(root, "greeter");
      assert.strictEqual(c.disposition, "cancel");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  // Path-aware critique (both providers, Critical/Major): a legacy set that
  // predates the session-state.json lifecycle (or was never backfilled) has
  // NO state file at all -- readStatus's own synthesizer would infer its
  // status from change-log.md / activity-log.json presence, and the
  // non-mutating classifier must replicate that same inference rather than
  // reading "no state file" as "untouched".
  test("a legacy COMPLETE set with change-log.md but no session-state.json classifies terminal", () => {
    const root = tmpRoot("delclassify-legacycomplete-");
    try {
      const a = specWith(root, "001-a", moduleSpec("greeter"));
      fs.writeFileSync(path.join(path.dirname(a), "change-log.md"), "# Change Log\n", "utf8");
      assert.ok(!fs.existsSync(path.join(path.dirname(a), "session-state.json")));
      const [c] = classifyModuleSetsForDeletion(root, "greeter");
      assert.strictEqual(c.disposition, "terminal");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("a legacy IN-PROGRESS set with activity-log.json but no session-state.json still classifies cancel (not remove)", () => {
    const root = tmpRoot("delclassify-legacyinprogress-");
    try {
      const a = specWith(root, "001-a", moduleSpec("greeter", "kind: plan"));
      fs.writeFileSync(path.join(path.dirname(a), "activity-log.json"), "{}", "utf8");
      const [c] = classifyModuleSetsForDeletion(root, "greeter");
      // hasExecutionArtifacts already caught this (activity-log.json is a
      // listed artifact), so this alone would not have failed pre-fix --
      // the point of this test is rawSessionSetStatus's inference, checked
      // directly below.
      assert.strictEqual(c.disposition, "cancel");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("an unrelated module's sets are excluded from the scan", () => {
    const root = tmpRoot("delclassify-unrelated-");
    try {
      specWith(root, "001-a", moduleSpec("greeter"));
      specWith(root, "002-b", moduleSpec("payments"));
      const result = classifyModuleSetsForDeletion(root, "greeter");
      assert.deepStrictEqual(
        result.map((c) => c.name),
        ["001-a"],
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
