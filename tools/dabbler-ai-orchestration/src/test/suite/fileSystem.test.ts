import * as assert from "assert";
import * as path from "path";
import * as vscode from "vscode";
import {
  deriveBlockedByPrereqs,
  fallbackState,
  listSessionSetDirNames,
  parsePrerequisites,
  parseSessionSetConfig,
  readModulesManifest,
  scanAllSessionSets,
} from "../../utils/fileSystem";
import { ProjectionCache } from "../../utils/projection";
import { makeProjection, makeSet, makeTempDir, rmrf, writeFileTree } from "./helpers";

interface StubWorkspace {
  workspaceFolders?: Array<{ uri: { fsPath: string } }>;
}

function setWorkspaceFolders(roots: string[]): void {
  (vscode.workspace as unknown as StubWorkspace).workspaceFolders =
    roots.length > 0 ? roots.map((r) => ({ uri: { fsPath: r } })) : undefined;
}

const SPEC_WITH_CONFIG = `# Set\n\n## Session Set Configuration\n\n\`\`\`yaml\nmodule: greeter\nkind: plan\nprerequisites:\n  - slug: 001-base\n    condition: complete\n\`\`\`\n\n### Session 1 of 1: Only\n1. Do.\n`;

suite("fileSystem: spec config parsing", () => {
  let dir: string;
  setup(() => (dir = makeTempDir("dabbler-fs-")));
  teardown(() => rmrf(dir));

  function specAt(content: string): string {
    const p = path.join(dir, "spec.md");
    writeFileTree(dir, { "spec.md": content });
    return p;
  }

  test("module and kind parse from the configuration block", () => {
    const config = parseSessionSetConfig(specAt(SPEC_WITH_CONFIG));
    assert.strictEqual(config.module, "greeter");
    assert.strictEqual(config.kind, "plan");
  });

  test("quoted scalars parse the same as bare ones", () => {
    const config = parseSessionSetConfig(
      specAt('## Session Set Configuration\n```yaml\nmodule: "core-api"\n```\n'),
    );
    assert.strictEqual(config.module, "core-api");
  });

  test("an absent spec reads as the implicit module", () => {
    const config = parseSessionSetConfig(path.join(dir, "missing.md"));
    assert.deepStrictEqual(config, { module: null });
  });

  test("prerequisites: absent is null, empty list is []", () => {
    assert.strictEqual(
      parsePrerequisites(specAt("## Session Set Configuration\n```yaml\nmodule: m\n```")),
      null,
    );
    assert.deepStrictEqual(
      parsePrerequisites(
        specAt("## Session Set Configuration\n```yaml\nprerequisites: []\n```"),
      ),
      [],
    );
  });

  test("prerequisite entries parse with default and explicit conditions", () => {
    const list = parsePrerequisites(specAt(SPEC_WITH_CONFIG));
    assert.deepStrictEqual(list, [{ slug: "001-base", condition: "complete" }]);
    const defaulted = parsePrerequisites(
      specAt(
        "## Session Set Configuration\n```yaml\nprerequisites:\n  - slug: 002-x\n```",
      ),
    );
    assert.deepStrictEqual(defaulted, [{ slug: "002-x", condition: "complete" }]);
  });

  test("a present-but-unknown condition drops the entry; a comment does not", () => {
    const list = parsePrerequisites(
      specAt(
        "## Session Set Configuration\n```yaml\nprerequisites:\n" +
          "  - slug: 003-a # trusted\n    condition: complete # done\n" +
          "  - slug: 004-b\n    condition: started\n```",
      ),
    );
    assert.deepStrictEqual(list, [{ slug: "003-a", condition: "complete" }]);
  });
});

suite("fileSystem: modules manifest", () => {
  let dir: string;
  setup(() => (dir = makeTempDir("dabbler-man-")));
  teardown(() => rmrf(dir));

  test("absent manifest reads null silently", () => {
    assert.strictEqual(readModulesManifest(dir), null);
  });

  test("a bare modules: key is a valid empty manifest", () => {
    writeFileTree(dir, { "docs/modules.yaml": "modules:\n" });
    assert.deepStrictEqual(readModulesManifest(dir), []);
  });

  test("entries keep file order and default title to the slug", () => {
    writeFileTree(dir, {
      "docs/modules.yaml":
        "modules:\n  - slug: beta\n  - slug: alpha\n    title: The Alpha\n",
    });
    const entries = readModulesManifest(dir)!;
    assert.deepStrictEqual(
      entries.map((e) => [e.slug, e.title]),
      [["beta", "beta"], ["alpha", "The Alpha"]],
    );
  });

  test("a duplicate slug keeps the first entry", () => {
    writeFileTree(dir, {
      "docs/modules.yaml":
        "modules:\n  - slug: a\n    title: First\n  - slug: a\n    title: Second\n",
    });
    const entries = readModulesManifest(dir)!;
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].title, "First");
  });

  test("invalid YAML degrades to null (the implicit module)", () => {
    writeFileTree(dir, { "docs/modules.yaml": "modules: [unclosed" });
    assert.strictEqual(readModulesManifest(dir), null);
  });
});

suite("fileSystem: fallback state (projection unavailable)", () => {
  let dir: string;
  setup(() => (dir = makeTempDir("dabbler-fb-")));
  teardown(() => rmrf(dir));

  test("mirrors the Python spec-only presence ladder", () => {
    assert.strictEqual(fallbackState(dir), "not-started");
    writeFileTree(dir, { "activity-log.json": "[]" });
    assert.strictEqual(fallbackState(dir), "in-progress");
    writeFileTree(dir, { "change-log.md": "# log" });
    assert.strictEqual(fallbackState(dir), "complete");
    writeFileTree(dir, { "CANCELLED.md": "x" });
    assert.strictEqual(fallbackState(dir), "cancelled");
  });
});

suite("fileSystem: prerequisite blocking", () => {
  test("an unknown slug still blocks (a typo must not unblock)", () => {
    const blocked = makeSet({
      name: "002-b",
      prerequisites: [{ slug: "no-such-set", condition: "complete" }],
    });
    deriveBlockedByPrereqs([blocked]);
    assert.strictEqual(blocked.blockedByPrereqs, true);
    assert.strictEqual(blocked.unsatisfiedPrereqs[0].targetState, "unknown");
  });

  test("a complete target satisfies; anything else blocks with its state", () => {
    const target = makeSet({ name: "001-a", state: "in-progress" });
    const blocked = makeSet({
      name: "002-b",
      prerequisites: [{ slug: "001-a", condition: "complete" }],
    });
    deriveBlockedByPrereqs([target, blocked]);
    assert.strictEqual(blocked.blockedByPrereqs, true);
    assert.strictEqual(blocked.unsatisfiedPrereqs[0].targetState, "in-progress");
    target.state = "complete";
    deriveBlockedByPrereqs([target, blocked]);
    assert.strictEqual(blocked.blockedByPrereqs, false);
  });
});

suite("fileSystem: workspace scan", () => {
  let root: string;
  setup(() => {
    root = makeTempDir("dabbler-scan-");
  });
  teardown(() => {
    setWorkspaceFolders([]);
    rmrf(root);
  });

  function fakeCache(
    bySlug: Record<string, ReturnType<typeof makeProjection> | null>,
  ): ProjectionCache {
    return new ProjectionCache(async (_py, setDir) => {
      const slug = path.basename(setDir);
      const payload = bySlug[slug];
      return payload
        ? { payload, error: null }
        : { payload: null, error: "No module named ai_router.progress" };
    });
  }

  test("underscore-prefixed set dirs are skipped by the listing", () => {
    writeFileTree(root, {
      "docs/session-sets/001-a/spec.md": "# a",
      "docs/session-sets/_drafts/spec.md": "# draft",
    });
    assert.deepStrictEqual(listSessionSetDirNames(root), ["001-a"]);
  });

  test("a scanned set carries projection state, config, and paths", async () => {
    writeFileTree(root, {
      "docs/session-sets/001-a/spec.md": SPEC_WITH_CONFIG,
      "docs/session-sets/001-a/session-state.json": "{}",
      "docs/modules.yaml": "modules:\n  - slug: greeter\n    title: Greeter\n",
    });
    setWorkspaceFolders([root]);
    const projection = makeProjection({
      set: { slug: "001-a", status: "in-progress", iconKey: "in-progress" },
    });
    const scan = await scanAllSessionSets(fakeCache({ "001-a": projection }));
    assert.strictEqual(scan.sets.length, 1);
    const set = scan.sets[0];
    assert.strictEqual(set.state, "in-progress");
    assert.strictEqual(set.module, "greeter");
    assert.strictEqual(set.moduleTitle, "Greeter");
    assert.strictEqual(set.kind, "plan");
    assert.strictEqual(set.sessions.length, 2);
    assert.ok(set.specPath.endsWith("spec.md"));
    assert.strictEqual(scan.projectionErrors.length, 0);
  });

  test("a failed projection falls back to file presence and reports the error", async () => {
    writeFileTree(root, {
      "docs/session-sets/002-b/spec.md": "# b",
      "docs/session-sets/002-b/change-log.md": "# done",
    });
    setWorkspaceFolders([root]);
    const scan = await scanAllSessionSets(fakeCache({}));
    assert.strictEqual(scan.sets[0].state, "complete");
    assert.strictEqual(scan.sets[0].sessions.length, 0);
    assert.strictEqual(scan.projectionErrors.length, 1);
    assert.ok(scan.projectionErrors[0].error.includes("ai_router"));
  });

  test("a module stamp unknown to the manifest stays raw config, not validated attribution", async () => {
    writeFileTree(root, {
      "docs/session-sets/003-c/spec.md":
        "## Session Set Configuration\n```yaml\nmodule: ghost\n```",
    });
    setWorkspaceFolders([root]);
    const scan = await scanAllSessionSets(
      fakeCache({ "003-c": makeProjection({ set: { slug: "003-c" } }) }),
    );
    assert.strictEqual(scan.sets[0].module, null);
    assert.strictEqual(scan.sets[0].config.module, "ghost");
  });

  test("prerequisites are derived against the merged cross-root map", async () => {
    writeFileTree(root, {
      "docs/session-sets/001-a/spec.md": "# a",
      "docs/session-sets/002-b/spec.md":
        "## Session Set Configuration\n```yaml\nprerequisites:\n  - slug: 001-a\n```",
    });
    setWorkspaceFolders([root]);
    const scan = await scanAllSessionSets(
      fakeCache({
        "001-a": makeProjection({ set: { slug: "001-a", status: "not-started", iconKey: "not-started" } }),
        "002-b": makeProjection({ set: { slug: "002-b", status: "not-started", iconKey: "not-started" } }),
      }),
    );
    const blocked = scan.sets.find((s) => s.name === "002-b")!;
    assert.strictEqual(blocked.blockedByPrereqs, true);
  });

  test("no workspace folders scans to an empty result", async () => {
    setWorkspaceFolders([]);
    const scan = await scanAllSessionSets(fakeCache({}));
    assert.deepStrictEqual(scan.sets, []);
    assert.deepStrictEqual(scan.collisions, []);
  });
});
