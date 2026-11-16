import * as assert from "assert";
import * as path from "path";
import * as vscode from "vscode";
import {
  hasSessionsRoot,
  readMechanicMemo,
  scanRepositories,
  sessionsDirOf,
} from "../../utils/fileSystem";
import { ProjectionCache } from "../../utils/projection";
import { makeProjection, makeTempDir, rmrf, writeFileTree } from "./helpers";

interface StubWorkspace {
  workspaceFolders?: Array<{ uri: { fsPath: string } }>;
}

function setWorkspaceFolders(roots: string[]): void {
  (vscode.workspace as unknown as StubWorkspace).workspaceFolders =
    roots.length > 0 ? roots.map((r) => ({ uri: { fsPath: r } })) : undefined;
}

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
    const projection = makeProjection({
      repository: { totalSessions: 2, sessionsCompleted: 1, currentSession: 2 },
    });
    const scan = await scanRepositories(
      fakeCache({ [sessionsDirOf(root)]: projection }),
      [root],
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
    const scan = await scanRepositories(fakeCache({}), [root]);
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
    assert.strictEqual(hasSessionsRoot(root), true);
    const projection = makeProjection({
      repository: { sessionsSource: "plan", totalSessions: 2, sessionsCompleted: 0 },
    });
    const scan = await scanRepositories(
      fakeCache({ [sessionsDirOf(root)]: projection }),
      [root],
    );
    assert.strictEqual(scan.repositories.length, 1);
    assert.strictEqual(scan.repositories[0].sessionsSource, "plan");
    assert.strictEqual(scan.repositories[0].sessions.length, 2);
  });

  test("a folder with neither file contributes no row", async () => {
    writeFileTree(root, { "README.md": "# not a dabbler repository" });
    assert.strictEqual(hasSessionsRoot(root), false);
    const scan = await scanRepositories(fakeCache({}), [root]);
    assert.deepStrictEqual(scan.repositories, []);
  });

  test("the scan takes the roots it is given and starts no git process", async () => {
    // Discovery spawns git; the scan runs on every watcher event, so it
    // must read the roots it is handed and never discover its own. The
    // workspace names a different folder, which the scan must not read.
    const other = makeTempDir("dabbler-scan-other-");
    writeFileTree(root, { "docs/sessions/sessions.json": "{}" });
    writeFileTree(other, { "docs/sessions/sessions.json": "{}" });
    setWorkspaceFolders([other]);
    // The module object itself, not an interop copy, so the stubs are what
    // the scan would call.
    const childProcess = process.getBuiltinModule("child_process") as unknown as Record<string, unknown>;
    const names = ["execFile", "execFileSync", "spawn", "spawnSync", "exec", "execSync"];
    const saved = names.map((name) => childProcess[name]);
    let spawned = 0;
    for (const name of names) {
      childProcess[name] = () => {
        spawned += 1;
        throw new Error(`the scan spawned a process (${name})`);
      };
    }
    try {
      const scan = await scanRepositories(fakeCache({}), [root]);
      assert.deepStrictEqual(scan.repositories.map((r) => r.root), [root]);
    } finally {
      names.forEach((name, i) => (childProcess[name] = saved[i]));
      rmrf(other);
    }
    assert.strictEqual(spawned, 0);
  });
});

suite("fileSystem: the Mechanic's memo", () => {
  test("reads the memo the router says it leaves, and nothing where there is none", () => {
    const root = makeTempDir("dabbler-memo-");
    try {
      assert.strictEqual(readMechanicMemo(root, 4), null);
      writeFileTree(root, { ".dabbler/scratch/mechanic-memo-s4.md": "  The cause, and what to decide.\n" });
      assert.strictEqual(readMechanicMemo(root, 4), "The cause, and what to decide.");
    } finally {
      rmrf(root);
    }
  });
});
