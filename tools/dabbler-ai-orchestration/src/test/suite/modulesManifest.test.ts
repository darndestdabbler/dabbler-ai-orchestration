// Set 087 Session 1 — module manifest + module attribution + the
// fail-loud global set-name uniqueness check.
//
// Covers the spec's Step-5 list and the routed architecture ruling's
// test matrix (s1-collision-check-architecture.json):
//   - readModulesManifest: present / absent / malformed, tolerant-entry
//     rules (missing slug dropped, duplicate slug keeps first, title
//     defaults to slug, list fields filtered).
//   - module attribution on readSessionSets: manifest-valid slug
//     attributes; unknown / absent / no-manifest all read as the
//     implicit module (null) — existing sets untouched.
//   - parseSessionSetConfig: the raw `module:` key.
//   - readAllSessionSetsWithDiagnostics: true collisions (distinct repo
//     families sharing a name) fail loud; the legitimate main+worktree
//     merge of ONE set stays silent; the Explorer never blanks; the
//     console.error is deduped across runs and re-arms when cleared.
//
// Matrix case 7 (Phase-3 nested layout registering as a same-family
// collision) is untestable through the public API today — discovery
// scans exactly one directory level — and is covered by construction:
// the identity key folds in the root-relative path, so a deeper layout
// yields distinct keys with no predicate change.

import * as assert from "assert";
import * as cp from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  parseSessionSetConfig,
  readAllSessionSets,
  readAllSessionSetsWithDiagnostics,
  readModulesManifest,
  readSessionSets,
} from "../../utils/fileSystem";

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-mod-test-"));
}

function writeManifest(root: string, text: string): void {
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "modules.yaml"), text);
}

function writeSet(
  root: string,
  name: string,
  opts: { module?: string; state?: string } = {},
): string {
  const dir = path.join(root, "docs", "session-sets", name);
  fs.mkdirSync(dir, { recursive: true });
  const moduleLine = opts.module ? `module: ${opts.module}\n` : "";
  fs.writeFileSync(
    path.join(dir, "spec.md"),
    `# ${name}\n\n## Session Set Configuration\n\`\`\`yaml\n` +
      `tier: full\nrequiresUAT: false\nrequiresE2E: false\n${moduleLine}\`\`\`\n`,
  );
  const state = opts.state ?? "not-started";
  const session = {
    number: 1,
    title: "Session 1",
    status: state === "complete" ? "complete" : state,
    startedAt: null,
    completedAt: null,
    orchestrator: null,
    verificationVerdict: null,
  };
  fs.writeFileSync(
    path.join(dir, "session-state.json"),
    JSON.stringify({
      schemaVersion: 4,
      sessionSetName: name,
      status: state,
      sessions: [session],
    }),
  );
  return dir;
}

const VALID_MANIFEST = [
  "modules:",
  "  - slug: billing",
  "    title: Billing & Invoicing",
  "    codeRoots: [services/billing]",
  "    planPath: docs/modules/billing/project-plan.md",
  "  - slug: notifications",
  "    title: Notifications",
  "    codeRoots:",
  "      - services/notifications",
  "    planPath: docs/modules/notifications/project-plan.md",
  "  - slug: integration",
  "    title: Cross-Module Integration",
  "    codeRoots: []",
  "    touches: [billing, notifications]",
  "    planPath: docs/modules/integration/project-plan.md",
  "",
].join("\n");

suite("Set 087 — readModulesManifest", () => {
  test("absent manifest returns null (single implicit module)", () => {
    const root = makeTmpDir();
    try {
      assert.strictEqual(readModulesManifest(root), null);
    } finally {
      fs.rmSync(root, { recursive: true });
    }
  });

  test("parses a well-formed manifest in file order with all fields", () => {
    const root = makeTmpDir();
    try {
      writeManifest(root, VALID_MANIFEST);
      const entries = readModulesManifest(root)!;
      assert.strictEqual(entries.length, 3);
      assert.deepStrictEqual(
        entries.map((e) => e.slug),
        ["billing", "notifications", "integration"],
        "manifest file order is preserved (it is the Explorer display order)",
      );
      assert.deepStrictEqual(entries[0], {
        slug: "billing",
        title: "Billing & Invoicing",
        codeRoots: ["services/billing"],
        planPath: "docs/modules/billing/project-plan.md",
        touches: [],
      });
      // Block-style list form parses the same as inline.
      assert.deepStrictEqual(entries[1].codeRoots, ["services/notifications"]);
      // Integration module: empty codeRoots, touches carried.
      assert.deepStrictEqual(entries[2].codeRoots, []);
      assert.deepStrictEqual(entries[2].touches, ["billing", "notifications"]);
    } finally {
      fs.rmSync(root, { recursive: true });
    }
  });

  test("malformed YAML returns null, never throws", () => {
    const root = makeTmpDir();
    try {
      writeManifest(root, "modules:\n  - slug: [unclosed\n    title: :::\n\tmix");
      assert.strictEqual(readModulesManifest(root), null);
    } finally {
      fs.rmSync(root, { recursive: true });
    }
  });

  test("missing or non-list modules key returns null", () => {
    const root = makeTmpDir();
    try {
      writeManifest(root, "somethingElse: true\n");
      assert.strictEqual(readModulesManifest(root), null);
      writeManifest(root, "modules: not-a-list\n");
      assert.strictEqual(readModulesManifest(root), null);
    } finally {
      fs.rmSync(root, { recursive: true });
    }
  });

  // S1 verifier round 1: a PRESENT manifest with the wrong shape must be
  // distinguishable from the intentional no-manifest case — it warns.
  // The absent-file path stays silent (that is the designed fallback).
  test("wrong-shape manifest warns; absent manifest stays silent", () => {
    const root = makeTmpDir();
    const origWarn = console.warn;
    const warnings: string[] = [];
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };
    try {
      readModulesManifest(root); // absent — no warning
      assert.strictEqual(warnings.length, 0);
      writeManifest(root, "- just\n- a\n- sequence\n"); // not a mapping
      readModulesManifest(root);
      assert.strictEqual(warnings.length, 1);
      assert.ok(warnings[0].includes("not a YAML mapping"));
      writeManifest(root, "somethingElse: true\n"); // no modules: list
      readModulesManifest(root);
      assert.strictEqual(warnings.length, 2);
      assert.ok(warnings[1].includes('no "modules:" list'));
    } finally {
      console.warn = origWarn;
      fs.rmSync(root, { recursive: true });
    }
  });

  test("tolerant entries: missing slug dropped, duplicate keeps first, title defaults to slug, non-string list members filtered", () => {
    const root = makeTmpDir();
    try {
      writeManifest(
        root,
        [
          "modules:",
          "  - title: No Slug Here",
          "  - slug: billing",
          "    title: First Billing",
          "  - slug: billing",
          "    title: Second Billing (dropped)",
          "  - slug: bare",
          "  - slug: mixed",
          "    codeRoots: [services/ok, 42, '', services/also-ok]",
          "",
        ].join("\n"),
      );
      const entries = readModulesManifest(root)!;
      assert.deepStrictEqual(
        entries.map((e) => e.slug),
        ["billing", "bare", "mixed"],
      );
      assert.strictEqual(entries[0].title, "First Billing");
      assert.strictEqual(entries[1].title, "bare", "title defaults to slug");
      assert.strictEqual(entries[1].planPath, null);
      assert.deepStrictEqual(entries[2].codeRoots, [
        "services/ok",
        "services/also-ok",
      ]);
    } finally {
      fs.rmSync(root, { recursive: true });
    }
  });

  test("manifest present but entries empty returns []", () => {
    const root = makeTmpDir();
    try {
      writeManifest(root, "modules: []\n");
      assert.deepStrictEqual(readModulesManifest(root), []);
    } finally {
      fs.rmSync(root, { recursive: true });
    }
  });
});

suite("Set 087 — parseSessionSetConfig module key", () => {
  test("parses module:, defaults to null when absent", () => {
    const dir = makeTmpDir();
    const specPath = path.join(dir, "spec.md");
    try {
      fs.writeFileSync(
        specPath,
        "## Session Set Configuration\n```yaml\nmodule: billing\n```",
      );
      assert.strictEqual(parseSessionSetConfig(specPath).module, "billing");
      fs.writeFileSync(
        specPath,
        "## Session Set Configuration\n```yaml\nrequiresUAT: false\n```",
      );
      assert.strictEqual(parseSessionSetConfig(specPath).module, null);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("accepts quoted values and trailing comments", () => {
    const dir = makeTmpDir();
    const specPath = path.join(dir, "spec.md");
    try {
      fs.writeFileSync(
        specPath,
        '## Session Set Configuration\n```yaml\nmodule: "billing"  # grouping\n```',
      );
      assert.strictEqual(parseSessionSetConfig(specPath).module, "billing");
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });
});

suite("Set 087 — module attribution on readSessionSets", () => {
  test("manifest-valid slug attributes module + moduleTitle", () => {
    const root = makeTmpDir();
    try {
      writeManifest(root, VALID_MANIFEST);
      writeSet(root, "091-billing-webhooks", { module: "billing" });
      const sets = readSessionSets(root);
      assert.strictEqual(sets[0].module, "billing");
      assert.strictEqual(sets[0].moduleTitle, "Billing & Invoicing");
      assert.strictEqual(sets[0].config.module, "billing");
    } finally {
      fs.rmSync(root, { recursive: true });
    }
  });

  test("unknown slug reads as the implicit module but keeps the raw config value", () => {
    const root = makeTmpDir();
    try {
      writeManifest(root, VALID_MANIFEST);
      writeSet(root, "092-typo-module", { module: "biling" });
      const sets = readSessionSets(root);
      assert.strictEqual(sets[0].module, null);
      assert.strictEqual(sets[0].moduleTitle, null);
      assert.strictEqual(
        sets[0].config.module,
        "biling",
        "raw declared value survives for later diagnostic surfacing",
      );
    } finally {
      fs.rmSync(root, { recursive: true });
    }
  });

  test("no module key reads as the implicit module (existing sets untouched)", () => {
    const root = makeTmpDir();
    try {
      writeManifest(root, VALID_MANIFEST);
      writeSet(root, "093-legacy-set");
      const sets = readSessionSets(root);
      assert.strictEqual(sets[0].module, null);
      assert.strictEqual(sets[0].moduleTitle, null);
      assert.strictEqual(sets[0].config.module, null);
    } finally {
      fs.rmSync(root, { recursive: true });
    }
  });

  test("no manifest: a declared module still reads as implicit (fallback intact)", () => {
    const root = makeTmpDir();
    try {
      writeSet(root, "094-declared-no-manifest", { module: "billing" });
      const sets = readSessionSets(root);
      assert.strictEqual(sets[0].module, null);
      assert.strictEqual(sets[0].moduleTitle, null);
      assert.strictEqual(sets[0].config.module, "billing");
    } finally {
      fs.rmSync(root, { recursive: true });
    }
  });

  // S1 verifier round 2: the per-set unknown-slug warning must not fire
  // when no manifest loaded — "no valid manifest" and "slug missing from
  // a loaded manifest" are different conditions and must warn
  // differently (manifest-level vs per-set).
  test("per-set unknown-slug warning fires only when a manifest actually loaded", () => {
    const root = makeTmpDir();
    const origWarn = console.warn;
    const warnings: string[] = [];
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };
    try {
      writeSet(root, "095-declared", { module: "billing" });
      // Absent manifest: silent (designed fallback, no per-set warn).
      readSessionSets(root);
      assert.strictEqual(
        warnings.filter((w) => w.includes("not a slug")).length,
        0,
        "no unknown-slug warn without a manifest",
      );
      // Malformed manifest: ONE manifest-level warn, still no per-set warn.
      writeManifest(root, "modules: not-a-list\n");
      readSessionSets(root);
      assert.strictEqual(
        warnings.filter((w) => w.includes('no "modules:" list')).length,
        1,
      );
      assert.strictEqual(
        warnings.filter((w) => w.includes("not a slug")).length,
        0,
        "malformed manifest reports at manifest level, not per set",
      );
      // Valid manifest lacking the slug: NOW the per-set warn fires.
      writeManifest(root, VALID_MANIFEST.replace(/billing/g, "invoicing"));
      readSessionSets(root);
      assert.strictEqual(
        warnings.filter((w) => w.includes("not a slug")).length,
        1,
      );
    } finally {
      console.warn = origWarn;
      fs.rmSync(root, { recursive: true });
    }
  });
});

suite("Set 087 — fail-loud global set-name uniqueness", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const vscode = require("vscode");

  function withWorkspaceFolders<T>(roots: string[], body: () => T): T {
    const orig = vscode.workspace.workspaceFolders;
    vscode.workspace.workspaceFolders = roots.map((r, i) => ({
      uri: { fsPath: r },
      name: `root${i}`,
      index: i,
    }));
    try {
      return body();
    } finally {
      vscode.workspace.workspaceFolders = orig;
    }
  }

  function captureConsoleError<T>(body: () => T): { result: T; errors: string[] } {
    const orig = console.error;
    const errors: string[] = [];
    console.error = (...args: unknown[]) => {
      errors.push(args.map(String).join(" "));
    };
    try {
      return { result: body(), errors };
    } finally {
      console.error = orig;
    }
  }

  test("matrix 1 — single root, unique names: no collisions, no error field, no log (backward-compat gate)", () => {
    const root = makeTmpDir();
    try {
      writeSet(root, "001-alpha");
      writeSet(root, "002-beta");
      const { result, errors } = captureConsoleError(() =>
        withWorkspaceFolders([root], () => readAllSessionSetsWithDiagnostics()),
      );
      assert.deepStrictEqual(result.collisions, []);
      assert.strictEqual(result.sets.length, 2);
      for (const s of result.sets) {
        assert.strictEqual(s.duplicateNameError, undefined);
      }
      assert.deepStrictEqual(errors, []);
    } finally {
      fs.rmSync(root, { recursive: true });
    }
  });

  test("matrix 3/4/5 — two distinct repos sharing a name: one flagged winner row, uniques untouched, one deduped log", () => {
    const rootA = makeTmpDir();
    const rootB = makeTmpDir();
    try {
      const dirA = writeSet(rootA, "001-bootstrap", { state: "complete" });
      const dirB = writeSet(rootB, "001-bootstrap", { state: "in-progress" });
      writeSet(rootA, "002-only-in-a");
      writeSet(rootB, "003-only-in-b");
      const run = () =>
        withWorkspaceFolders([rootA, rootB], () =>
          readAllSessionSetsWithDiagnostics(),
        );
      const { result, errors } = captureConsoleError(run);

      // Exactly one row for the collided name — the precedence winner
      // (complete outranks in-progress) — flagged, never dropped.
      const rows = result.sets.filter((s) => s.name === "001-bootstrap");
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0].dir, dirA, "complete copy wins the merge");
      assert.ok(rows[0].duplicateNameError, "winner carries the error flag");
      assert.strictEqual(rows[0].duplicateNameError!.chosenDir, dirA);
      assert.deepStrictEqual(
        rows[0].duplicateNameError!.conflictingDirs,
        [dirA, dirB].sort(),
      );

      // Diagnostics envelope mirrors the flag.
      assert.strictEqual(result.collisions.length, 1);
      assert.strictEqual(result.collisions[0].name, "001-bootstrap");
      assert.strictEqual(result.collisions[0].candidates.length, 2);
      const states = result.collisions[0].candidates.map((c) => c.state).sort();
      assert.deepStrictEqual(states, ["complete", "in-progress"]);

      // Uniques ship unflagged — the Explorer never blanks.
      const unique = result.sets.filter((s) => s.name !== "001-bootstrap");
      assert.deepStrictEqual(
        unique.map((s) => s.name).sort(),
        ["002-only-in-a", "003-only-in-b"],
      );
      for (const s of unique) assert.strictEqual(s.duplicateNameError, undefined);

      // Loud exactly once...
      assert.strictEqual(errors.length, 1);
      assert.ok(errors[0].includes("DUPLICATE SESSION-SET NAME"));
      assert.ok(errors[0].includes("001-bootstrap"));

      // ...and deduped on the next scan (matrix 6, persistent half).
      const second = captureConsoleError(run);
      assert.strictEqual(second.result.collisions.length, 1);
      assert.deepStrictEqual(second.errors, [], "repeat scan does not re-log");

      // Compat shim returns the same rows.
      const shim = withWorkspaceFolders([rootA, rootB], () => readAllSessionSets());
      assert.deepStrictEqual(
        shim.map((s) => s.name).sort(),
        result.sets.map((s) => s.name).sort(),
      );
    } finally {
      fs.rmSync(rootA, { recursive: true });
      fs.rmSync(rootB, { recursive: true });
    }
  });

  test("matrix 6 — a cleared collision re-arms: reintroduction logs again", () => {
    const rootA = makeTmpDir();
    const rootB = makeTmpDir();
    try {
      writeSet(rootA, "005-rearm", { state: "complete" });
      const dirB = writeSet(rootB, "005-rearm", { state: "in-progress" });
      const run = () =>
        withWorkspaceFolders([rootA, rootB], () =>
          readAllSessionSetsWithDiagnostics(),
        );
      const first = captureConsoleError(run);
      assert.strictEqual(first.errors.length, 1);

      // Collision cleared (one copy renamed away) → no log, re-armed.
      fs.rmSync(dirB, { recursive: true });
      const cleared = captureConsoleError(run);
      assert.deepStrictEqual(cleared.result.collisions, []);
      assert.deepStrictEqual(cleared.errors, []);

      // Reintroduced → logs again instead of staying silent forever.
      writeSet(rootB, "005-rearm", { state: "in-progress" });
      const again = captureConsoleError(run);
      assert.strictEqual(again.result.collisions.length, 1);
      assert.strictEqual(again.errors.length, 1);
    } finally {
      fs.rmSync(rootA, { recursive: true });
      fs.rmSync(rootB, { recursive: true });
    }
  });

  test("matrix 2/8 — main checkout + its git worktree: same family, NOT a collision, one merged row", function () {
    // Real git fixture: the family predicate rides on `git worktree
    // list`, so this is the one case a stub cannot prove.
    const tmp = makeTmpDir();
    const main = path.join(tmp, "repo");
    const wt = path.join(tmp, "repo-worktrees", "session-set-x");
    fs.mkdirSync(main, { recursive: true });
    const git = (args: string[], cwd: string) =>
      cp.execFileSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
    try {
      try {
        git(["init", "-b", "main"], main);
      } catch {
        this.skip(); // git unavailable in this environment
        return;
      }
      git(["config", "user.email", "test@example.com"], main);
      git(["config", "user.name", "Test"], main);
      fs.writeFileSync(path.join(main, "README.md"), "seed\n");
      git(["add", "."], main);
      git(["commit", "-m", "seed"], main);
      git(["worktree", "add", wt], main);

      // The SAME set exists in both checkouts (normal worktree state).
      writeSet(main, "010-shared-set", { state: "in-progress" });
      writeSet(wt, "010-shared-set", { state: "in-progress" });

      const { result, errors } = captureConsoleError(() =>
        withWorkspaceFolders([main, wt], () =>
          readAllSessionSetsWithDiagnostics(),
        ),
      );
      const rows = result.sets.filter((s) => s.name === "010-shared-set");
      assert.strictEqual(rows.length, 1, "legitimate merge: one row");
      assert.strictEqual(rows[0].duplicateNameError, undefined);
      assert.deepStrictEqual(result.collisions, []);
      assert.deepStrictEqual(errors, []);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
