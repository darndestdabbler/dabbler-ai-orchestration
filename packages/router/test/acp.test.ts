// The engine interface -- open, send, receive, cancel -- against scripted
// peers that speak each protocol. No model, no seat, no network: a fake
// ACP agent answers JSON-RPC on its stdio and a fake Claude Code prints
// stream-json, each recording what it was asked so the test can read it.
// The live run against the real seat is `docs/acp-walkthrough.md`.
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  COPILOT_ACP,
  type AgentConnection,
  type AgentEvent,
  acpAgent,
  claudeCodeAgent,
} from "../src/acp.ts";
import { agentVerb } from "../src/cli/agent.ts";
import { capture } from "../src/output.ts";
import { tempDir } from "./support/answers.ts";

const NODE = process.execPath;

// A fake ACP agent. It answers `initialize`, `session/new`, `session/load`
// (replaying two updates before its reply), `session/prompt` (a chunk, a
// tool call, a permission request it waits on, a request the client does
// not offer, a completion, a chunk, then the reply), `session/close`, and
// `session/cancel` (the pending prompt is answered `cancelled`, after one
// more permission request that must be answered `cancelled` too). With
// FAKE_SLOW it streams chunks until cancelled; with FAKE_DIE it exits
// mid-turn. Everything it was asked, and every answer it got, goes to
// FAKE_SEEN.
const FAKE_ACP = `
const fs = require("node:fs");
const seen = {};
const note = (key, value) => { seen[key] = value; fs.writeFileSync(process.env.FAKE_SEEN, JSON.stringify(seen)); };
const out = (o) => process.stdout.write(JSON.stringify(o) + "\\n");
const update = (sessionId, update) => out({ jsonrpc: "2.0", method: "session/update", params: { sessionId, update } });
let buf = "";
let promptId = null;
let sessionId = null;
let slow = null;
let waitingOn = new Map();
function ask(method, params, then) {
  const id = "agent-" + (waitingOn.size + 1);
  waitingOn.set(id, then);
  out({ jsonrpc: "2.0", id, method, params });
}
function finishTurn(stopReason) {
  if (promptId === null) return;
  const id = promptId;
  promptId = null;
  out({ jsonrpc: "2.0", id, result: { stopReason, usage: { inputTokens: 3, outputTokens: 2 } } });
}
process.stdin.on("data", (chunk) => {
  buf += chunk.toString("utf8");
  let i;
  while ((i = buf.indexOf("\\n")) >= 0) {
    const line = buf.slice(0, i);
    buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    const m = JSON.parse(line);
    if (m.id !== undefined && m.method === undefined) {
      const then = waitingOn.get(m.id);
      waitingOn.delete(m.id);
      if (then) then(m);
      continue;
    }
    if (m.method === "initialize") {
      note("initialize", m.params);
      out({ jsonrpc: "2.0", id: m.id, result: {
        protocolVersion: 1,
        agentCapabilities: { loadSession: true, sessionCapabilities: { close: {}, list: {} } },
        agentInfo: { name: "fake-acp", version: "0" },
      } });
    } else if (m.method === "session/new") {
      note("new", m.params);
      sessionId = "conv-fresh";
      out({ jsonrpc: "2.0", id: m.id, result: { sessionId } });
    } else if (m.method === "session/load") {
      note("load", m.params);
      sessionId = m.params.sessionId;
      update(sessionId, { sessionUpdate: "user_message_chunk", content: { type: "text", text: "earlier prompt" } });
      update(sessionId, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "earlier answer" } });
      out({ jsonrpc: "2.0", id: m.id, result: {} });
    } else if (m.method === "session/prompt") {
      note("prompt", m.params);
      promptId = m.id;
      update(sessionId, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "hello" } });
      if (process.env.FAKE_DIE) process.exit(3);
      if (process.env.FAKE_SLOW) {
        let n = 0;
        slow = setInterval(() => update(sessionId, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "tick " + (++n) } }), 30);
        continue;
      }
      update(sessionId, { sessionUpdate: "tool_call", toolCallId: "t1", title: "write hello.txt", kind: "edit", status: "pending" });
      ask("session/request_permission", {
        sessionId,
        toolCall: { toolCallId: "t1", title: "write hello.txt", kind: "edit", status: "pending" },
        options: [
          { optionId: "allow_once", kind: "allow_once", name: "Allow once" },
          { optionId: "allow_always", kind: "allow_always", name: "Always allow" },
          { optionId: "reject_once", kind: "reject_once", name: "Deny" },
        ],
      }, (answer) => {
        note("permission", answer.result);
        ask("fs/read_text_file", { sessionId, path: "x" }, (reply) => {
          note("unoffered", reply);
          const allowed = answer.result && answer.result.outcome && answer.result.outcome.optionId === "allow_once";
          update(sessionId, { sessionUpdate: "tool_call_update", toolCallId: "t1", status: allowed ? "completed" : "failed",
            content: [{ type: "diff", path: "hello.txt", oldText: "", newText: "hi" }] });
          update(sessionId, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: allowed ? "done" : "refused" } });
          finishTurn("end_turn");
        });
      });
    } else if (m.method === "session/cancel") {
      note("cancel", m.params);
      if (slow) clearInterval(slow);
      ask("session/request_permission", {
        sessionId,
        toolCall: { toolCallId: "t2", title: "late", kind: "edit", status: "pending" },
        options: [{ optionId: "allow_once", kind: "allow_once", name: "Allow once" }],
      }, (answer) => {
        note("late-permission", answer.result);
        finishTurn("cancelled");
      });
    } else if (m.method === "session/close") {
      note("close", m.params);
      out({ jsonrpc: "2.0", id: m.id, result: {} });
    } else if (m.id !== undefined) {
      out({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "no" } });
    }
  }
});
process.stdin.on("end", () => process.exit(0));
`;

// A fake Claude Code on `-p --input-format stream-json`: on the first user
// message it prints `init` with a session id, then text, a tool use and
// its result, then `result`; with FAKE_TICKS=forever it prints text until
// a control_request ends the turn. What it was invoked with is recorded.
const FAKE_CLAUDE = `
const fs = require("node:fs");
const out = (o) => process.stdout.write(JSON.stringify(o) + "\\n");
let buf = "";
let timer = null;
let done = false;
const sessionId = process.argv.includes("--resume") ? process.argv[process.argv.indexOf("--resume") + 1] : "conv-claude";
function finish(subtype) {
  if (done) return;
  done = true;
  clearInterval(timer);
  out({ type: "result", subtype, session_id: sessionId, duration_ms: 5, usage: { input_tokens: 3 } });
}
process.stdin.on("data", (chunk) => {
  buf += chunk.toString("utf8");
  let i;
  while ((i = buf.indexOf("\\n")) >= 0) {
    const line = buf.slice(0, i);
    buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    const m = JSON.parse(line);
    if (m.type === "user") {
      fs.writeFileSync(process.env.FAKE_SEEN, JSON.stringify({ argv: process.argv.slice(2), prompt: m.message.content }));
      done = false;
      out({ type: "system", subtype: "init", model: "fake-model", session_id: sessionId });
      if (process.env.FAKE_TICKS === "forever") {
        let n = 0;
        timer = setInterval(() => out({ type: "assistant", message: { content: [{ type: "text", text: "tick " + (++n) }] } }), 30);
        continue;
      }
      out({ type: "assistant", message: { content: [{ type: "text", text: "hi" }, { type: "tool_use", id: "tu1", name: "Write", input: { path: "hello.txt" } }] } });
      out({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "tu1", content: "written" }] } });
      finish("success");
    }
    if (m.type === "control_request") {
      out({ type: "control_response", response: { subtype: "success", request_id: m.request_id } });
      finish("error_during_execution");
    }
  }
});
process.stdin.on("end", () => process.exit(0));
`;

interface Peer {
  readonly script: string;
  readonly seenPath: string;
  readonly cwd: string;
  seen(): Record<string, Record<string, unknown>>;
}

function peer(source: string): Peer {
  const dir = tempDir("acp-");
  const script = join(dir, "peer.cjs");
  writeFileSync(script, source, "utf8");
  const seenPath = join(dir, "seen.json");
  process.env["FAKE_SEEN"] = seenPath;
  delete process.env["FAKE_SLOW"];
  delete process.env["FAKE_DIE"];
  delete process.env["FAKE_TICKS"];
  return {
    script,
    seenPath,
    cwd: dir,
    seen: () =>
      existsSync(seenPath)
        ? (JSON.parse(readFileSync(seenPath, "utf8")) as Record<string, Record<string, unknown>>)
        : {},
  };
}

function fakeAcp(): Peer {
  return peer(FAKE_ACP);
}

function fakeClaude(): Peer {
  return peer(FAKE_CLAUDE);
}

/** Every event of one turn, in order. */
async function turn(
  connection: AgentConnection,
  text: string,
  during?: (event: AgentEvent, connection: AgentConnection) => void,
): Promise<{ events: AgentEvent[]; outcome: Awaited<ReturnType<AgentConnection["prompt"]>> }> {
  const events: AgentEvent[] = [];
  const outcome = await connection.prompt(text, (event) => {
    events.push(event);
    during?.(event, connection);
  });
  return { events, outcome };
}

describe("an ACP agent over its stdio", () => {
  it("streams a turn's events in order, raw records kept, and hands back the agent's stop reason", async () => {
    const fake = fakeAcp();
    const connection = await acpAgent(COPILOT_ACP, { program: NODE, leadingArgs: [fake.script] }).open({
      cwd: fake.cwd,
      model: "m-1",
      permissions: "allow",
    });
    try {
      assert.equal(connection.sessionId, "conv-fresh");
      assert.equal((connection.capabilities["agentCapabilities"] as Record<string, unknown>)["loadSession"], true);
      // The reply to opening the conversation is kept whole, as the agent gave it.
      assert.deepEqual(connection.session, { sessionId: "conv-fresh" });
      assert.deepEqual(connection.history, []);
      // The handshake said what this client offers: no file or terminal
      // service, and protocol 1.
      assert.equal(fake.seen()["initialize"]?.["protocolVersion"], 1);
      assert.deepEqual(fake.seen()["initialize"]?.["clientCapabilities"], {
        fs: { readTextFile: false, writeTextFile: false },
        terminal: false,
      });

      const { events, outcome } = await turn(connection, "write hello");
      assert.deepEqual(
        events.map((event) => event.kind),
        ["text", "tool", "permission", "other", "tool-update", "text"],
      );
      assert.deepEqual(
        events.map((event) => (event.kind === "text" ? event.text : event.kind === "tool" ? event.title : null)),
        ["hello", "write hello.txt", null, null, null, "done"],
      );
      const completed = events[4];
      assert.equal(completed?.kind === "tool-update" && completed.status, "completed");
      assert.equal(completed?.kind === "tool-update" && completed.summary, "diff hello.txt");
      // The record each event was made from travels with it.
      assert.equal((events[1]?.raw as Record<string, unknown>)["toolCallId"], "t1");
      assert.equal(outcome.stopReason, "end_turn");
      assert.equal(outcome.cancelled, false);
      assert.deepEqual(outcome.usage, { inputTokens: 3, outputTokens: 2 });
      assert.deepEqual(fake.seen()["prompt"]?.["prompt"], [{ type: "text", text: "write hello" }]);
    } finally {
      await connection.close();
    }
    assert.deepEqual(fake.seen()["close"], { sessionId: "conv-fresh" });
  });

  it("resumes by id: session/load names it, and what the load replays is history, not the turn", async () => {
    const fake = fakeAcp();
    const connection = await acpAgent(COPILOT_ACP, { program: NODE, leadingArgs: [fake.script] }).open({
      cwd: fake.cwd,
      resumeId: "conv-old",
      permissions: "allow",
    });
    try {
      assert.equal(fake.seen()["load"]?.["sessionId"], "conv-old");
      assert.equal(fake.seen()["new"], undefined);
      assert.equal(connection.sessionId, "conv-old");
      assert.deepEqual(
        connection.history.map((event) => (event.kind === "text" ? `${event.role}: ${event.text}` : event.kind)),
        ["user: earlier prompt", "agent: earlier answer"],
      );
      const { events } = await turn(connection, "and now");
      assert.equal(events[0]?.kind === "text" && events[0].text, "hello");
      assert.ok(!events.some((event) => event.kind === "text" && event.text === "earlier answer"));
    } finally {
      await connection.close();
    }
  });

  it("answers a permission request from the policy: allow once, or deny, and says so on the event", async () => {
    for (const [policy, optionId, status] of [
      ["allow", "allow_once", "completed"],
      ["deny", "reject_once", "failed"],
    ] as const) {
      const fake = fakeAcp();
      const connection = await acpAgent(COPILOT_ACP, { program: NODE, leadingArgs: [fake.script] }).open({
        cwd: fake.cwd,
        permissions: policy,
      });
      try {
        const { events } = await turn(connection, "write hello");
        const permission = events.find((event) => event.kind === "permission");
        assert.equal(permission?.kind === "permission" && permission.decision, policy);
        assert.equal(permission?.kind === "permission" && permission.id, "t1");
        assert.deepEqual(fake.seen()["permission"], { outcome: { outcome: "selected", optionId } });
        const update = events.find((event) => event.kind === "tool-update");
        assert.equal(update?.kind === "tool-update" && update.status, status);
      } finally {
        await connection.close();
      }
    }
  });

  it("cancels the turn in flight: session/cancel goes out, a late permission request is answered cancelled, and the outcome says cancelled", async () => {
    const fake = fakeAcp();
    process.env["FAKE_SLOW"] = "1";
    const connection = await acpAgent(COPILOT_ACP, { program: NODE, leadingArgs: [fake.script] }).open({
      cwd: fake.cwd,
      permissions: "allow",
    });
    try {
      const { events, outcome } = await turn(connection, "go on forever", (event, open) => {
        if (event.kind === "text" && event.text === "tick 2") open.cancel();
      });
      assert.deepEqual(fake.seen()["cancel"], { sessionId: "conv-fresh" });
      assert.deepEqual(fake.seen()["late-permission"], { outcome: { outcome: "cancelled" } });
      const late = events.find((event) => event.kind === "permission");
      assert.equal(late?.kind === "permission" && late.decision, "cancelled");
      assert.equal(outcome.cancelled, true);
      assert.equal(outcome.stopReason, "cancelled");
    } finally {
      await connection.close();
    }
  });

  it("answers a request it does not offer with method-not-found, in the protocol's words", async () => {
    const fake = fakeAcp();
    const connection = await acpAgent(COPILOT_ACP, { program: NODE, leadingArgs: [fake.script] }).open({
      cwd: fake.cwd,
      permissions: "allow",
    });
    try {
      await turn(connection, "write hello");
      const reply = fake.seen()["unoffered"] as Record<string, unknown>;
      assert.equal((reply["error"] as Record<string, unknown>)["code"], -32601);
      assert.equal(reply["result"], undefined);
    } finally {
      await connection.close();
    }
  });

  it("rejects the prompt, naming the exit code, when the agent exits mid-turn", async () => {
    const fake = fakeAcp();
    process.env["FAKE_DIE"] = "1";
    const connection = await acpAgent(COPILOT_ACP, { program: NODE, leadingArgs: [fake.script] }).open({
      cwd: fake.cwd,
      permissions: "allow",
    });
    try {
      await assert.rejects(turn(connection, "write hello"), /exited \(code 3\) before answering session\/prompt/);
    } finally {
      await connection.close();
    }
  });
});

describe("Claude Code over stream-json, the same interface", () => {
  it("sends the prompt on stdin, names the conversation from init, and speaks tool use and its result as tool events", async () => {
    const fake = fakeClaude();
    const connection = await claudeCodeAgent({ program: NODE, leadingArgs: [fake.script] }).open({
      cwd: fake.cwd,
      model: "fake-model",
      permissions: "allow",
    });
    try {
      // `-p` announces the conversation with the first turn, not before.
      assert.equal(connection.sessionId, "");
      const { events, outcome } = await turn(connection, "write hello");
      assert.equal(connection.sessionId, "conv-claude");
      assert.equal(connection.capabilities["model"], "fake-model");
      assert.deepEqual(
        events.map((event) => event.kind),
        ["text", "tool", "tool-update"],
      );
      assert.equal(events[1]?.kind === "tool" && events[1].title, "Write");
      assert.equal(events[2]?.kind === "tool-update" && events[2].id, "tu1");
      assert.equal(events[2]?.kind === "tool-update" && events[2].status, "completed");
      assert.equal(outcome.stopReason, "success");
      assert.equal(outcome.cancelled, false);
      const seen = fake.seen() as unknown as { argv: string[]; prompt: string };
      assert.equal(seen.prompt, "write hello");
      assert.ok(seen.argv.includes("--dangerously-skip-permissions"));
      assert.deepEqual(seen.argv.slice(-2), ["--model", "fake-model"]);
    } finally {
      await connection.close();
    }
  });

  it("resumes by --resume and cancels with the control message, the outcome marked cancelled", async () => {
    const fake = fakeClaude();
    process.env["FAKE_TICKS"] = "forever";
    const connection = await claudeCodeAgent({ program: NODE, leadingArgs: [fake.script] }).open({
      cwd: fake.cwd,
      resumeId: "conv-earlier",
      permissions: "deny",
    });
    try {
      assert.equal(connection.sessionId, "conv-earlier");
      const { outcome } = await turn(connection, "go on forever", (event, open) => {
        if (event.kind === "text" && event.text === "tick 2") open.cancel();
      });
      assert.equal(outcome.cancelled, true);
      assert.equal(outcome.stopReason, "error_during_execution");
      const seen = fake.seen() as unknown as { argv: string[] };
      assert.deepEqual(seen.argv.slice(-2), ["--resume", "conv-earlier"]);
      assert.ok(seen.argv.includes("--permission-prompt-tool"));
      assert.ok(!seen.argv.includes("--dangerously-skip-permissions"));
    } finally {
      await connection.close();
    }
  });
});

describe("dabbler agent prompt", () => {
  it("prints one JSON line per event as it arrives and the turn last", async () => {
    const fake = fakeAcp();
    const result = await capture(() =>
      agentVerb([
        "prompt", "write hello",
        "--program", NODE, "--arg", fake.script,
        "--cwd", fake.cwd,
        "--permissions", "allow",
      ]),
    );
    assert.equal(result.value, 0, result.stderr);
    const lines = result.stdout
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    assert.deepEqual(
      lines.map((line) => line["kind"]),
      ["open", "text", "tool", "permission", "other", "tool-update", "text", "turn"],
    );
    const opened = lines[0];
    assert.equal(opened?.["sessionId"], "conv-fresh");
    assert.equal(opened?.["resumed"], false);
    assert.deepEqual(opened?.["session"], { sessionId: "conv-fresh" });
    assert.equal((opened?.["capabilities"] as Record<string, unknown>)["protocolVersion"], 1);
    const last = lines[lines.length - 1];
    assert.equal(last?.["sessionId"], "conv-fresh");
    assert.equal(last?.["stopReason"], "end_turn");
    assert.equal(last?.["cancelled"], false);
    assert.match(result.stderr, /conv-fresh/);
  });

  it("refuses a policy or an engine it does not know, and a prompt with no text", async () => {
    const wrongPolicy = await capture(() => agentVerb(["prompt", "hi", "--permissions", "maybe"]));
    assert.equal(wrongPolicy.value, 2);
    assert.match(wrongPolicy.stderr, /invalid choice: 'maybe'/);
    const wrongEngine = await capture(() => agentVerb(["prompt", "hi", "--engine", "codex"]));
    assert.equal(wrongEngine.value, 2);
    const noText = await capture(() => agentVerb(["prompt", "--permissions", "deny"]));
    assert.equal(noText.value, 2);
    assert.match(noText.stderr, /TEXT/);
  });
});
