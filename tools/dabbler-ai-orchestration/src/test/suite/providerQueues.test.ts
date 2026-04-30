import * as assert from "assert";
import * as vscode from "vscode";
import {
  ProviderQueuesProvider,
  QueueStatusPayload,
  QueueTreeNode,
  buildTreeItem,
  parseFetchResult,
} from "../../providers/ProviderQueuesProvider";

function samplePayload(): QueueStatusPayload {
  return {
    providers: {
      anthropic: {
        queue_path: "/ws/provider-queues/anthropic/queue.db",
        queue_present: true,
        states: { new: 1, claimed: 2, completed: 5, failed: 1, timed_out: 0 },
        messages: [
          {
            id: "abcdef0123456789",
            task_type: "session-verification",
            session_set: "my-feature",
            session_number: 3,
            state: "claimed",
            claimed_by: "verifier-google-1",
            lease_expires_at: "2026-04-30T15:30:00Z",
            enqueued_at: "2026-04-30T15:00:00Z",
            attempts: 1,
            max_attempts: 3,
            from_provider: "anthropic",
          },
          {
            id: "fedcba9876543210",
            task_type: "session-verification",
            session_set: "my-feature",
            session_number: 2,
            state: "completed",
            claimed_by: null,
            lease_expires_at: null,
            enqueued_at: "2026-04-30T14:00:00Z",
            completed_at: "2026-04-30T14:10:00Z",
            attempts: 1,
            max_attempts: 3,
            from_provider: "anthropic",
          },
        ],
      },
      openai: {
        queue_path: "/ws/provider-queues/openai/queue.db",
        queue_present: false,
        states: { new: 0, claimed: 0, completed: 0, failed: 0, timed_out: 0 },
        messages: [],
      },
    },
  };
}

function makeProvider(payload: QueueStatusPayload): ProviderQueuesProvider {
  const provider = new ProviderQueuesProvider({
    getWorkspaceRoot: () => "/ws",
    fetchPayload: async () => ({ ok: true, payload }),
  });
  return provider;
}

suite("ProviderQueuesProvider — tree shape", () => {
  test("root level lists providers alphabetically", async () => {
    const provider = makeProvider(samplePayload());
    const children = await provider.getChildren();
    assert.strictEqual(children.length, 2);
    assert.strictEqual(children[0].kind, "provider");
    assert.strictEqual((children[0] as { provider: string }).provider, "anthropic");
    assert.strictEqual((children[1] as { provider: string }).provider, "openai");
  });

  test("absent queue surfaces a single info child", async () => {
    const provider = makeProvider(samplePayload());
    const top = await provider.getChildren();
    const openai = top.find(
      (c) => c.kind === "provider" && (c as { provider: string }).provider === "openai",
    );
    assert.ok(openai, "expected openai provider node");
    const children = await provider.getChildren(openai);
    assert.strictEqual(children.length, 1);
    assert.strictEqual(children[0].kind, "info");
  });

  test("present queue expands to one bucket per state in lifecycle order", async () => {
    const provider = makeProvider(samplePayload());
    const top = await provider.getChildren();
    const anthropic = top.find(
      (c) => c.kind === "provider" && (c as { provider: string }).provider === "anthropic",
    );
    assert.ok(anthropic);
    const buckets = await provider.getChildren(anthropic);
    assert.deepStrictEqual(
      buckets.map((b) => (b as { state?: string }).state),
      ["new", "claimed", "completed", "failed", "timed_out"],
    );
  });

  test("state bucket holds only messages for that state", async () => {
    const provider = makeProvider(samplePayload());
    const top = await provider.getChildren();
    const anthropic = top[0] as Extract<QueueTreeNode, { kind: "provider" }>;
    const buckets = await provider.getChildren(anthropic);
    const claimedBucket = buckets.find(
      (b) => (b as { state?: string }).state === "claimed",
    )!;
    const completedBucket = buckets.find(
      (b) => (b as { state?: string }).state === "completed",
    )!;
    const claimedMsgs = await provider.getChildren(claimedBucket);
    const completedMsgs = await provider.getChildren(completedBucket);
    assert.strictEqual(claimedMsgs.length, 1);
    assert.strictEqual(claimedMsgs[0].kind, "message");
    assert.strictEqual(completedMsgs.length, 1);
    assert.strictEqual(completedMsgs[0].kind, "message");
  });

  test("state bucket appends 'more not shown' info node when count exceeds messages", async () => {
    const payload = samplePayload();
    payload.providers.anthropic.states.completed = 50; // 1 returned, 49 hidden
    const provider = makeProvider(payload);
    const top = await provider.getChildren();
    const buckets = await provider.getChildren(top[0]);
    const completedBucket = buckets.find(
      (b) => (b as { state?: string }).state === "completed",
    )!;
    const items = await provider.getChildren(completedBucket);
    assert.strictEqual(items.length, 2);
    assert.strictEqual(items[1].kind, "info");
    assert.match(
      (items[1] as { label: string }).label,
      /49 more not shown/,
    );
  });

  test("empty payload renders a guidance info node, not an empty tree", async () => {
    const provider = makeProvider({ providers: {} });
    const top = await provider.getChildren();
    assert.strictEqual(top.length, 1);
    assert.strictEqual(top[0].kind, "info");
    assert.match((top[0] as { label: string }).label, /no provider queues/i);
  });

  test("fetch failure surfaces an error info node", async () => {
    const provider = new ProviderQueuesProvider({
      getWorkspaceRoot: () => "/ws",
      fetchPayload: async () => ({ ok: false, message: "exit 2" }),
    });
    const top = await provider.getChildren();
    assert.strictEqual(top.length, 1);
    assert.strictEqual(top[0].kind, "info");
    assert.strictEqual((top[0] as { isError?: boolean }).isError, true);
  });
});

suite("ProviderQueuesProvider — tree item rendering", () => {
  test("provider node tooltip and description use queue totals", async () => {
    const provider = makeProvider(samplePayload());
    const top = await provider.getChildren();
    const item = buildTreeItem(top[0]);
    assert.match(String(item.description), /9 msgs/);
    assert.match(String(item.description), /2 claimed/);
    assert.match(String(item.description), /1 failed/);
  });

  test("message node carries openPayload command and queueMessage:<state> contextValue", async () => {
    const provider = makeProvider(samplePayload());
    const top = await provider.getChildren();
    const buckets = await provider.getChildren(top[0]);
    const claimedBucket = buckets.find(
      (b) => (b as { state?: string }).state === "claimed",
    )!;
    const claimedMsgs = await provider.getChildren(claimedBucket);
    const item = buildTreeItem(claimedMsgs[0]);
    assert.strictEqual(item.contextValue, "queueMessage:claimed");
    assert.strictEqual(item.command?.command, "dabblerProviderQueues.openPayload");
  });

  test("collapsible state buckets: 'completed' starts collapsed, 'claimed' expanded", async () => {
    const provider = makeProvider(samplePayload());
    const top = await provider.getChildren();
    const buckets = await provider.getChildren(top[0]);
    const completed = buildTreeItem(
      buckets.find((b) => (b as { state?: string }).state === "completed")!,
    );
    const claimed = buildTreeItem(
      buckets.find((b) => (b as { state?: string }).state === "claimed")!,
    );
    assert.strictEqual(completed.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);
    assert.strictEqual(claimed.collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
  });
});

suite("ProviderQueuesProvider — parseFetchResult", () => {
  function fakeRun(over: Partial<{
    stdout: string;
    stderr: string;
    exitCode: number | null;
    timedOut: boolean;
  }> = {}) {
    return {
      stdout: "",
      stderr: "",
      exitCode: 0,
      signal: null,
      timedOut: false,
      ...over,
    };
  }

  test("parses valid JSON", () => {
    const r = parseFetchResult(fakeRun({ stdout: '{"providers":{}}' }));
    assert.ok(r.ok);
    if (r.ok) assert.deepStrictEqual(r.payload.providers, {});
  });

  test("rejects timeout", () => {
    const r = parseFetchResult(fakeRun({ timedOut: true, exitCode: null }));
    assert.strictEqual(r.ok, false);
  });

  test("rejects non-zero exit", () => {
    const r = parseFetchResult(fakeRun({ exitCode: 2, stderr: "boom" }));
    assert.strictEqual(r.ok, false);
    if (!r.ok) assert.match(r.message, /exited 2/);
  });

  test("rejects malformed JSON", () => {
    const r = parseFetchResult(fakeRun({ stdout: "not json" }));
    assert.strictEqual(r.ok, false);
  });

  test("rejects JSON missing 'providers' field", () => {
    const r = parseFetchResult(fakeRun({ stdout: '{"foo":1}' }));
    assert.strictEqual(r.ok, false);
  });
});
