import * as assert from "assert";
import { REFRESH_WINDOW_MS, WorkExplorerTreeProvider } from "../../providers/WorkExplorerTreeProvider";

suite("WorkExplorerTreeProvider: refresh", () => {
  let provider: WorkExplorerTreeProvider;
  let changes: number;
  setup(() => {
    provider = new WorkExplorerTreeProvider({} as never);
    changes = 0;
    provider.onDidChangeTreeData(() => (changes += 1));
  });
  teardown(() => provider.dispose());

  const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

  test("three refresh() calls inside the window fire one change", async () => {
    provider.refresh();
    provider.refresh();
    provider.refresh();
    assert.strictEqual(changes, 0);
    await wait(REFRESH_WINDOW_MS + 100);
    assert.strictEqual(changes, 1);
  });

  test("refresh(true) fires at once", async () => {
    provider.refresh();
    provider.refresh(true);
    assert.strictEqual(changes, 1);
    // The pending repaint it overtook does not fire a second change.
    await wait(REFRESH_WINDOW_MS + 100);
    assert.strictEqual(changes, 1);
  });
});
