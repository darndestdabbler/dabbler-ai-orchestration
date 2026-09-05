// How `session drive` reaches an engine: the spawn that does not shatter,
// the argv shapes measured against the CLIs, what of the engine's output a
// person is shown, and the two ways an invocation is ended early.
//
// The CLIs themselves are stood in for by scripts that speak their protocol
// -- no model, no seat, no network. The argv shapes and the renderers are
// pure and are asserted from literals.
import assert from "node:assert/strict";
import { type ChildProcess } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { spawnProgram } from "../src/checks.ts";
import { sessionVerb } from "../src/cli/session.ts";
import {
  builtInEngine,
  commandEngine,
  enginePrompt,
  engineShape,
  renderClaudeCodeEvent,
  renderCodexEvent,
  type EngineInvocation,
} from "../src/engines.ts";
import { capture } from "../src/output.ts";
import { EXIT_USAGE } from "../src/session.ts";
import { tempDir } from "./support/answers.ts";

const NODE = process.execPath;

function collect(child: ChildProcess): Promise<{ code: number | null; out: string }> {
  return new Promise((settle) => {
    let out = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
    });
    child.on("close", (code) => settle({ code, out }));
  });
}

interface Emitted {
  readonly line: string;
  readonly display: string | null | undefined;
}

/** An invocation whose transcript is the `emitted` list. */
function invocation(
  overrides: Partial<EngineInvocation>,
  emitted: Emitted[],
): EngineInvocation {
  return {
    instruction: {
      schema_version: 1,
      seq: 1,
      kind: "step",
      session_number: 1,
      issued_at: "2026-08-31T10:00:00-04:00",
      step_id: "widget",
      ask: "Make the widget real.",
      answer_schema: "driver-report.schema.json",
      answer_command: "dabbler session report --seq 1 --step widget ...",
    },
    instructionPath: join(tempDir("engine-"), "instruction.json"),
    repoRoot: tempDir("engine-"),
    sessionsDir: tempDir("engine-"),
    sessionNumber: 1,
    invocation: 1,
    first: true,
    resumeId: null,
    signal: new AbortController().signal,
    emit: (line, display) => emitted.push({ line, display }),
    ...overrides,
  } as EngineInvocation;
}

// A stand-in for Claude Code's `-p --input-format stream-json`: reads user
// messages from stdin, prints the events the real CLI prints, answers a
// control_request by ending the turn, and exits when stdin closes. What it
// was invoked with is written where the test can read it.
const FAKE_CLAUDE = `
const fs = require("node:fs");
const out = (o) => process.stdout.write(JSON.stringify(o) + "\\n");
let buf = "";
let ticks = 0;
let timer = null;
let done = false;
function finish(subtype) {
  if (done) return;
  done = true;
  clearInterval(timer);
  out({ type: "result", subtype, duration_ms: 5, total_cost_usd: 0.0123 });
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
      out({ type: "system", subtype: "init", model: "fake-model", session_id: process.env.FAKE_SESSION_ID || "conv-first" });
      timer = setInterval(() => {
        ticks += 1;
        out({ type: "system", subtype: "thinking_tokens" });
        out({ type: "assistant", message: { content: [{ type: "text", text: "tick " + ticks }] } });
        if (ticks >= 3 && process.env.FAKE_TICKS !== "forever") finish("success");
      }, 40);
    }
    if (m.type === "control_request") {
      out({ type: "control_response", response: { subtype: "success", request_id: m.request_id } });
      finish("error_during_execution");
    }
  }
});
process.stdin.on("end", () => process.exit(0));
`;

/** A fake Claude Code on disk, and where it records what it was asked. */
function fakeClaude(): { engine: ReturnType<typeof builtInEngine>; seenPath: string } {
  const dir = tempDir("engine-");
  const script = join(dir, "claude.cjs");
  writeFileSync(script, FAKE_CLAUDE, "utf8");
  const seenPath = join(dir, "seen.json");
  process.env["FAKE_SEEN"] = seenPath;
  delete process.env["FAKE_TICKS"];
  delete process.env["FAKE_SESSION_ID"];
  return {
    engine: builtInEngine("claude-code", "fake-model", { program: NODE, leadingArgs: [script] }),
    seenPath,
  };
}

function clearFakeEnv(): void {
  for (const name of ["FAKE_SEEN", "FAKE_TICKS", "FAKE_SESSION_ID"]) delete process.env[name];
}

describe("spawning an engine", () => {
  it("does not shatter an argument, through an executable or a shim", async () => {
    const dir = tempDir("engine-");
    const script = join(dir, "args.cjs");
    writeFileSync(script, "process.stdout.write(JSON.stringify(process.argv.slice(2)));\n", "utf8");
    const args = ["two words", 'say "hi"', "plain", "a%b!c"];

    const direct = await collect(
      spawnProgram([NODE, script, ...args], { stdio: ["ignore", "pipe", "pipe"] }),
    );
    assert.equal(direct.code, 0);
    assert.deepEqual(JSON.parse(direct.out), args);

    if (process.platform !== "win32") return;
    const shim = join(dir, "engine.cmd");
    writeFileSync(shim, `@"${NODE}" "${script}" %*\r\n`, "utf8");
    const through = await collect(
      spawnProgram([shim, ...args], { stdio: ["ignore", "pipe", "pipe"] }),
    );
    assert.equal(through.code, 0);
    assert.deepEqual(JSON.parse(through.out), args);
  });
});

describe("the argv each engine is measured to take", () => {
  const prompt = "read the file";
  const fresh = { resumeId: null };
  const again = { resumeId: "conv-1" };

  it("puts Claude Code's prompt on stdin and resumes after the first", () => {
    const claude = engineShape("claude-code", "claude-haiku-4-5-20251001");
    assert.notEqual(typeof claude, "string");
    if (typeof claude === "string") return;
    assert.equal(claude.program, "claude");
    assert.equal(claude.input, "stdin");
    assert.deepEqual(claude.argv(fresh, prompt), [
      "-p",
      "--input-format",
      "stream-json",
      "--output-format",
      "stream-json",
      "--verbose",
      "--dangerously-skip-permissions",
      "--model",
      "claude-haiku-4-5-20251001",
    ]);
    assert.deepEqual(claude.argv(again, prompt).slice(-2), ["--resume", "conv-1"]);
  });

  it("starts the seat fresh every time, because it reports no id to resume", () => {
    // What it must never do is continue whatever ran in this directory last.
    const copilot = engineShape("copilot", "gpt-5.6-luna");
    if (typeof copilot === "string") throw new Error(copilot);
    assert.deepEqual(copilot.argv(fresh, prompt), [
      "-p",
      prompt,
      "--model",
      "gpt-5.6-luna",
      "--allow-all-tools",
      "--allow-all-paths",
      "--no-ask-user",
    ]);
    assert.deepEqual(copilot.argv(again, prompt), copilot.argv(fresh, prompt));
    assert.ok(!copilot.argv(again, prompt).includes("--continue"));
    assert.equal(copilot.sessionId('{"session_id":"anything"}'), null);
    assert.match(String(engineShape("copilot", null)), /--model/);
  });

  it("resumes Codex by the thread it started, and only from the start event", () => {
    const codex = engineShape("codex", null);
    if (typeof codex === "string") throw new Error(codex);
    assert.deepEqual(codex.argv(fresh, prompt), [
      "exec",
      "--json",
      "--dangerously-bypass-approvals-and-sandbox",
      prompt,
    ]);
    assert.deepEqual(codex.argv(again, prompt).slice(0, 3), ["exec", "resume", "conv-1"]);
    assert.equal(codex.sessionId('{"type":"thread.started","thread_id":"t-9"}'), "t-9");
    assert.equal(codex.sessionId('{"type":"turn.completed","thread_id":"t-later"}'), null);
  });

  it("has no built-in command for an engine nobody measured", () => {
    assert.match(String(engineShape("gemini", null)), /--engine-argv/);
  });

  it("tells the engine to read the instruction and run its answer command", () => {
    assert.match(
      enginePrompt("D:/repo/.dabbler/runs/s1/driver/instruction.json"),
      /^Read D:\/repo.*answer_command.*stop\.$/s,
    );
  });
});

describe("what of an engine's stream a person is shown", () => {
  it("shows only the init system event of Claude's stream", () => {
    assert.equal(
      renderClaudeCodeEvent('{"type":"system","subtype":"init","model":"claude-haiku-4-5-20251001"}'),
      "engine session started (claude-haiku-4-5-20251001)",
    );
    assert.equal(renderClaudeCodeEvent('{"type":"system","subtype":"thinking_tokens"}'), null);
    assert.equal(
      renderClaudeCodeEvent(
        '{"type":"assistant","message":{"content":[{"type":"thinking","thinking":"hm"},{"type":"tool_use","name":"Bash","input":{"command":"ls"}},{"type":"text","text":"done"}]}}',
      ),
      'thinking: hm\ntool Bash  {"command":"ls"}\nengine: done',
    );
    assert.equal(
      renderClaudeCodeEvent('{"type":"result","subtype":"success","duration_ms":120,"total_cost_usd":0.0388}'),
      "result: success in 120 ms, $0.0388",
    );
    // A line that is not the protocol at all is still the engine talking.
    assert.equal(renderClaudeCodeEvent("not json"), "not json");
  });

  it("shows only a completed item of Codex's", () => {
    assert.equal(renderCodexEvent('{"type":"thread.started","thread_id":"t-1"}'), "engine session started (t-1)");
    assert.equal(renderCodexEvent('{"type":"item.started","item":{"type":"agent_message","text":"half"}}'), null);
    assert.equal(
      renderCodexEvent('{"type":"item.completed","item":{"type":"command_execution","command":"npm test","exit_code":0}}'),
      "tool command  npm test -> exit 0",
    );
    assert.equal(renderCodexEvent('{"type":"turn.completed","usage":{}}'), "result: turn completed");
  });

  it("leaves no escape behind in a coloured line it has to truncate", () => {
    // Session 61, watched in a real terminal: a green checkmark at the end
    // of a tool result left every line after it green. The result is quoted
    // at 120 characters, so the reset was cut away and the opener was not.
    const ESC = "\u001b";
    const line = renderClaudeCodeEvent(
      JSON.stringify({
        type: "user",
        message: {
          content: [
            {
              type: "tool_result",
              content: `${ESC}]0;vitest${ESC}\\${ESC}[32m✓ ${"tests passed ".repeat(20)}${ESC}[0m`,
            },
          ],
        },
      }),
    );
    assert.notEqual(line, null);
    assert.ok(!String(line).includes(ESC));
    // What the engine actually said survives, cut to the same length it
    // would have been cut to with the escapes still counted against it.
    assert.match(String(line), /✓ tests passed/);
    assert.ok(String(line).includes("  ← "));
  });
});

describe("driving a built-in engine", () => {
  it("speaks stream-json, resumes after the first, and ends the turn on an interrupt", async () => {
    const { engine, seenPath } = fakeClaude();
    if (typeof engine === "string") throw new Error(engine);
    try {
      const first: Emitted[] = [];
      const outcome = await engine.invoke(invocation({ first: true }, first));
      assert.deepEqual(outcome, { exitCode: 0, interrupted: false, sessionId: "conv-first" });
      const seen = JSON.parse(readFileSync(seenPath, "utf8")) as { argv: string[]; prompt: string };
      assert.ok(!seen.argv.includes("--resume"));
      assert.match(seen.prompt, /^Read .*instruction\.json and do exactly/);
      // Every event is on the transcript; the display drops what is not
      // worth showing.
      assert.ok(first.some((entry) => entry.line.includes('"thinking_tokens"')));
      assert.equal(first.find((entry) => entry.line.includes('"thinking_tokens"'))?.display, null);
      assert.ok(first.some((entry) => entry.display === "engine session started (fake-model)"));
      assert.ok(first.some((entry) => entry.display === "engine: tick 1"));

      process.env["FAKE_TICKS"] = "forever";
      const controller = new AbortController();
      const second: Emitted[] = [];
      const started = Date.now();
      setTimeout(() => controller.abort("the plan changed"), 250);
      const ended = await engine.invoke(
        invocation(
          { first: false, invocation: 2, resumeId: "conv-first", signal: controller.signal },
          second,
        ),
      );
      assert.equal(ended.exitCode, 0);
      assert.equal(ended.interrupted, true);
      assert.ok(Date.now() - started < 5_000);
      assert.ok((JSON.parse(readFileSync(seenPath, "utf8")) as { argv: string[] }).argv.includes("--resume"));
      assert.ok(second.some((entry) => entry.display === "interrupt acknowledged"));
      assert.ok(
        second.some((entry) => entry.display === "result: error_during_execution in 5 ms, $0.0123"),
      );
    } finally {
      clearFakeEnv();
    }
  });

  it("resumes the conversation the engine reported, not the newest in the directory", async () => {
    const { engine, seenPath } = fakeClaude();
    if (typeof engine === "string") throw new Error(engine);
    const argvOf = (): string[] =>
      (JSON.parse(readFileSync(seenPath, "utf8")) as { argv: string[] }).argv;
    try {
      // The first invocation opens a conversation and says which one.
      const opened = await engine.invoke(invocation({ first: true, resumeId: null }, []));
      assert.equal(opened.sessionId, "conv-first");
      assert.ok(!argvOf().includes("--resume"));

      // Session 60's incident: somebody opens a newer conversation in the
      // same working directory. The driver holds an id, so the second
      // invocation names that one -- the newer one is not picked up, and
      // there is no `--continue` left to pick it up with.
      process.env["FAKE_SESSION_ID"] = "conv-newer-interactive";
      const resumed = await engine.invoke(
        invocation({ first: false, invocation: 2, resumeId: opened.sessionId ?? null }, []),
      );
      const argv = argvOf();
      assert.equal(argv[argv.indexOf("--resume") + 1], "conv-first");
      assert.ok(!argv.includes("--continue"));
      assert.ok(!argv.includes("conv-newer-interactive"));
      assert.equal(resumed.exitCode, 0);
    } finally {
      clearFakeEnv();
    }
  });

  it("ends a command engine's whole tree, the tool it was running included", async () => {
    const dir = tempDir("engine-");
    const tool = join(dir, "tool.cjs");
    writeFileSync(tool, "setTimeout(() => {}, 60_000);\n", "utf8");
    // The engine starts a long-running tool and prints its pid, the way a
    // CLI mid-step has a shell command in flight.
    const script = join(dir, "engine.cjs");
    writeFileSync(
      script,
      "const { spawn } = require('node:child_process');\n" +
        `const child = spawn(process.execPath, [${JSON.stringify(tool)}], { stdio: 'ignore' });\n` +
        "process.stdout.write(`tool ${child.pid}\\n`);\n" +
        "setTimeout(() => {}, 60_000);\n",
      "utf8",
    );
    const controller = new AbortController();
    const emitted: Emitted[] = [];
    const started = Date.now();
    const pending = commandEngine([NODE, script, "{instruction}"]).invoke(
      invocation({ signal: controller.signal }, emitted),
    );
    const toolPid = await new Promise<number>((resolve) => {
      const look = setInterval(() => {
        const line = emitted.find((entry) => entry.line.startsWith("tool "));
        if (line) {
          clearInterval(look);
          resolve(Number(line.line.slice(5)));
        }
      }, 20);
    });
    controller.abort("stop");
    const outcome = await pending;
    assert.equal(outcome.interrupted, true);
    assert.ok(Date.now() - started < 10_000);
    // The grandchild is gone too: signalling it is refused.
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.throws(() => process.kill(toolPid, 0));
  });
});

describe("what the command line refuses", () => {
  it("refuses an engine with no command, a seat with no model, and a mode it has not", async () => {
    const sessionsDir = tempDir("engine-");
    const usage = async (...args: string[]) =>
      capture(() => sessionVerb(["drive", "--sessions-dir", sessionsDir, ...args]));

    const gemini = await usage("--engine", "gemini");
    assert.equal(gemini.value, EXIT_USAGE);
    assert.match(gemini.stderr, /no built-in command for 'gemini'; pass --engine-argv/);

    const seat = await usage("--engine", "copilot");
    assert.equal(seat.value, EXIT_USAGE);
    assert.match(seat.stderr, /--model/);

    const loud = await usage("--engine", "claude-code", "--show-engine", "loud");
    assert.equal(loud.value, EXIT_USAGE);
    assert.match(loud.stderr, /invalid choice: 'loud'/);
  });
});
