import * as assert from "assert";
import * as path from "path";
import * as vscode from "vscode";
import {
  hasSessionsRoot,
  scanRepositories,
  sessionsDirOf,
} from "../../utils/fileSystem";
import { readModuleSlugs } from "../../utils/moduleAuthoring";
import { ProjectionCache } from "../../utils/projection";
import { makeProjection, makeTempDir, rmrf, writeFileTree } from "./helpers";

interface StubWorkspace {
  workspaceFolders?: Array<{ uri: { fsPath: string } }>;
}

function setWorkspaceFolders(roots: string[]): void {
  (vscode.workspace as unknown as StubWorkspace).workspaceFolders =
    roots.length > 0 ? roots.map((r) => ({ uri: { fsPath: r } })) : undefined;
}

suite("fileSystem: module manifest slugs", () => {
  let dir: string;
  setup(() => (dir = makeTempDir("dabbler-man-")));
  teardown(() => rmrf(dir));

  test("an absent, invalid or listless manifest reads as no slugs", () => {
    assert.deepStrictEqual(readModuleSlugs(dir), []);
    writeFileTree(dir, { "docs/modules.yaml": "modules: [unclosed" });
    assert.deepStrictEqual(readModuleSlugs(dir), []);
    writeFileTree(dir, { "docs/modules.yaml": "something: else\n" });
    assert.deepStrictEqual(readModuleSlugs(dir), []);
  });

  test("slugs keep file order and drop duplicates", () => {
    writeFileTree(dir, {
      "docs/modules.yaml":
        "modules:\n  - slug: beta\n  - slug: alpha\n  - slug: beta\n",
    });
    assert.deepStrictEqual(readModuleSlugs(dir), ["beta", "alpha"]);
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
    byDir: Record<string, ReturnType<typeof makeProjection> | null>,
  ): ProjectionCache {
    return new ProjectionCache(async (sessionsDir) => {
      const payload = byDir[sessionsDir];
      return payload
        ? { payload, error: null }
        : { payload: null, error: "No module named ai_router.progress" };
    });
  }

  test("a repository row carries the projection's sessions and its own paths", async () => {
    writeFileTree(root, {
      "docs/sessions/sessions.json": "{}",
      "docs/sessions/session-plan.md": "# plan",
    });
    setWorkspaceFolders([root]);
    const projection = makeProjection({
      repository: { totalSessions: 2, sessionsCompleted: 1, currentSession: 2 },
    });
    const scan = await scanRepositories(
      fakeCache({ [sessionsDirOf(root)]: projection }),
    );
    assert.strictEqual(scan.repositories.length, 1);
    const repository = scan.repositories[0];
    assert.strictEqual(repository.currentSession, 2);
    assert.strictEqual(repository.sessions.length, 2);
    assert.strictEqual(repository.label, path.basename(root));
    assert.ok(repository.planPath.endsWith("session-plan.md"));
    assert.deepStrictEqual(scan.projectionErrors, []);
  });

  test("a failed projection reports the error and shows no sessions", async () => {
    // There is no file-presence fallback: which sessions exist and what
    // state they are in is Python's answer, and guessing it here would
    // be a second implementation of the rule.
    writeFileTree(root, { "docs/sessions/sessions.json": "{}" });
    setWorkspaceFolders([root]);
    const scan = await scanRepositories(fakeCache({}));
    assert.strictEqual(scan.repositories.length, 1);
    assert.deepStrictEqual(scan.repositories[0].sessions, []);
    assert.strictEqual(scan.repositories[0].totalSessions, null);
    assert.strictEqual(scan.projectionErrors.length, 1);
    assert.ok(scan.projectionErrors[0].error.includes("ai_router"));
  });

  test("a folder with a plan and no ledger is a row, from the plan", async () => {
    // A bootstrapped repository has a plan and nothing else, and the two
    // setup sessions live in it until the first registration writes a
    // ledger. Presence decides only whether to ask the projection; the
    // projection decides what the sessions are and says where they came
    // from.
    writeFileTree(root, { "docs/sessions/session-plan.md": "# plan" });
    setWorkspaceFolders([root]);
    assert.strictEqual(hasSessionsRoot(root), true);
    const projection = makeProjection({
      repository: { sessionsSource: "plan", totalSessions: 2, sessionsCompleted: 0 },
    });
    const scan = await scanRepositories(
      fakeCache({ [sessionsDirOf(root)]: projection }),
    );
    assert.strictEqual(scan.repositories.length, 1);
    assert.strictEqual(scan.repositories[0].sessionsSource, "plan");
    assert.strictEqual(scan.repositories[0].sessions.length, 2);
  });

  test("a folder with neither file contributes no row", async () => {
    writeFileTree(root, { "README.md": "# not a dabbler repository" });
    setWorkspaceFolders([root]);
    assert.strictEqual(hasSessionsRoot(root), false);
    const scan = await scanRepositories(fakeCache({}));
    assert.deepStrictEqual(scan.repositories, []);
  });

  test("no workspace folders scans to an empty result", async () => {
    setWorkspaceFolders([]);
    const scan = await scanRepositories(fakeCache({}));
    assert.deepStrictEqual(scan.repositories, []);
  });
});
