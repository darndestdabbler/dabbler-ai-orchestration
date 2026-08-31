// How `session drive` reaches an engine: the spawn that does not shatter,
// the argv shapes measured against the CLIs, what of the engine's output a
// person is shown, and the two ways an invocation is ended early. The
// CLIs themselves are stood in for by scripts that speak their protocol --
// no model, no seat.

import { type ChildProcess } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { spawnProgram } from "../src/checks.ts";
import { sessionVerb } from "../src/cli/session.ts";
import {
  type EngineInvocation,
  builtInEngine,
  commandEngine,
  enginePrompt,
  engineShape,
  renderClaudeCodeEvent,
  renderCodexEvent,
} from "../src/engines.ts";
import { EXIT_USAGE } from "../src/session.ts";
import { captured, makeTempDir, removeTempDirs } from "./support/fixtures.ts";

afterAll(removeTempDirs);

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
    instructionPath: join(makeTempDir(), "instruction.json"),
    repoRoot: makeTempDir(),
    sessionsDir: makeTempDir(),
    sessionNumber: 1,
    invocation: 1,
    first: true,
    signal: new AbortController().signal,
    emit: (line, display) => emitted.push({ line, display }),
    ...overrides,
  };
}

// A stand-in for Claude Code's `-p --input-format stream-json`: reads user
// messages from stdin, prints the events the real CLI prints, answers a
// control_request by ending the turn, and exits when stdin closes. What
// it was invoked with is written where the test can read it.
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
      out({ type: "system", subtype: "init", model: "fake-model" });
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

describe("the engine adapters", () => {
  it("spawns an executable with no shell and a .cmd shim with every argument quoted, and neither shatters an argument", async () => {
    const dir = makeTempDir();
    const script = join(dir, "args.cjs");
    writeFileSync(script, "process.stdout.write(JSON.stringify(process.argv.slice(2)));\n", "utf8");
    const args = ["two words", 'say "hi"', "plain", "a%b!c"];

    const direct = await collect(spawnProgram([NODE, script, ...args], { stdio: ["ignore", "pipe", "pipe"] }));
    expect(direct.code).toBe(0);
    expect(JSON.parse(direct.out)).toEqual(args);

    if (process.platform !== "win32") return;
    const shim = join(dir, "engine.cmd");
    writeFileSync(shim, `@"${NODE}" "${script}" %*\r\n`, "utf8");
    const through = await collect(spawnProgram([shim, ...args], { stdio: ["ignore", "pipe", "pipe"] }));
    expect(through.code).toBe(0);
    expect(JSON.parse(through.out)).toEqual(args);
  });

  it("has one measured argv per engine, continues after the first invocation, and refuses an engine it has none for", () => {
    const prompt = "read the file";
    const claude = engineShape("claude-code", "claude-haiku-4-5-20251001");
    expect(typeof claude).not.toBe("string");
    if (typeof claude === "string") return;
    expect(claude.program).toBe("claude");
    expect(claude.input).toBe("stdin");
    expect(claude.argv(true, prompt)).toEqual([
      "-p",
      "--input-format", "stream-json",
      "--output-format", "stream-json",
      "--verbose",
      "--dangerously-skip-permissions",
      "--model", "claude-haiku-4-5-20251001",
    ]);
    expect(claude.argv(false, prompt)).toContain("--continue");

    const copilot = engineShape("copilot", "gpt-5.6-luna");
    if (typeof copilot === "string") throw new Error(copilot);
    expect(copilot.argv(true, prompt)).toEqual([
      "-p", prompt,
      "--model", "gpt-5.6-luna",
      "--allow-all-tools",
      "--allow-all-paths",
      "--no-ask-user",
    ]);
    expect(copilot.argv(false, prompt).at(-1)).toBe("--continue");
    expect(engineShape("copilot", null)).toMatch(/--model/);

    const codex = engineShape("codex", null);
    if (typeof codex === "string") throw new Error(codex);
    expect(codex.argv(true, prompt)).toEqual([
      "exec", "--json", "--dangerously-bypass-approvals-and-sandbox", prompt,
    ]);
    expect(codex.argv(false, prompt).slice(0, 3)).toEqual(["exec", "resume", "--last"]);

    expect(engineShape("gemini", null)).toMatch(/--engine-argv/);
    expect(enginePrompt("D:/repo/.dabbler/runs/s1/driver/instruction.json")).toMatch(/^Read D:\/repo.*answer_command.*stop\.$/);
  });

  it("shows only the init system event of Claude's stream, and only a completed item of Codex's", () => {
    expect(renderClaudeCodeEvent('{"type":"system","subtype":"init","model":"claude-haiku-4-5-20251001"}')).toBe(
      "engine session started (claude-haiku-4-5-20251001)",
    );
    expect(renderClaudeCodeEvent('{"type":"system","subtype":"thinking_tokens"}')).toBeNull();
    expect(
      renderClaudeCodeEvent(
        '{"type":"assistant","message":{"content":[{"type":"thinking","thinking":"hm"},{"type":"tool_use","name":"Bash","input":{"command":"ls"}},{"type":"text","text":"done"}]}}',
      ),
    ).toBe('thinking: hm\ntool Bash  {"command":"ls"}\nengine: done');
    expect(renderClaudeCodeEvent('{"type":"result","subtype":"success","duration_ms":120,"total_cost_usd":0.0388}')).toBe(
      "result: success in 120 ms, $0.0388",
    );
    expect(renderClaudeCodeEvent("not json")).toBe("not json");

    expect(renderCodexEvent('{"type":"thread.started","thread_id":"t-1"}')).toBe("engine session started (t-1)");
    expect(renderCodexEvent('{"type":"item.started","item":{"type":"agent_message","text":"half"}}')).toBeNull();
    expect(renderCodexEvent('{"type":"item.completed","item":{"type":"command_execution","command":"npm test","exit_code":0}}')).toBe(
      "tool command  npm test -> exit 0",
    );
    expect(renderCodexEvent('{"type":"turn.completed","usage":{}}')).toBe("result: turn completed");
  });

  it("speaks Claude Code's stream-json: the prompt on stdin, --continue after the first, and an interrupt as the control message that ends the turn", async () => {
    const dir = makeTempDir();
    const fake = join(dir, "claude.cjs");
    writeFileSync(fake, FAKE_CLAUDE, "utf8");
    const seenPath = join(dir, "seen.json");
    process.env["FAKE_SEEN"] = seenPath;
    delete process.env["FAKE_TICKS"];
    const engine = builtInEngine("claude-code", "fake-model", { program: NODE, leadingArgs: [fake] });
    if (typeof engine === "string") throw new Error(engine);
    try {
      const first: Emitted[] = [];
      const outcome = await engine.invoke(invocation({ first: true }, first));
      expect(outcome).toEqual({ exitCode: 0, interrupted: false });
      const seen = JSON.parse(readFileSync(seenPath, "utf8")) as { argv: string[]; prompt: string };
      expect(seen.argv).not.toContain("--continue");
      expect(seen.prompt).toMatch(/^Read .*instruction\.json and do exactly/);
      // Every event is on the transcript; the display drops what is not worth showing.
      expect(first.map((entry) => entry.line)).toContain('{"type":"system","subtype":"thinking_tokens"}');
      expect(first.find((entry) => entry.line.includes('"thinking_tokens"'))?.display).toBeNull();
      expect(first.map((entry) => entry.display)).toContain("engine session started (fake-model)");
      expect(first.map((entry) => entry.display)).toContain("engine: tick 1");

      process.env["FAKE_TICKS"] = "forever";
      const controller = new AbortController();
      const second: Emitted[] = [];
      const started = Date.now();
      setTimeout(() => controller.abort("the plan changed"), 250);
      const ended = await engine.invoke(invocation({ first: false, invocation: 2, signal: controller.signal }, second));
      expect(ended).toEqual({ exitCode: 0, interrupted: true });
      expect(Date.now() - started).toBeLessThan(5_000);
      expect(JSON.parse(readFileSync(seenPath, "utf8")).argv).toContain("--continue");
      expect(second.map((entry) => entry.display)).toContain("interrupt acknowledged");
      expect(second.map((entry) => entry.display)).toContain("result: error_during_execution in 5 ms, $0.0123");
    } finally {
      delete process.env["FAKE_SEEN"];
      delete process.env["FAKE_TICKS"];
    }
  });

  it("ends a command engine's tree when the driver interrupts it", async () => {
    const dir = makeTempDir();
    const script = join(dir, "slow.cjs");
    writeFileSync(script, "process.stdout.write('working\\n'); setTimeout(() => {}, 30_000);\n", "utf8");
    const controller = new AbortController();
    const emitted: Emitted[] = [];
    const started = Date.now();
    setTimeout(() => controller.abort("stop"), 200);
    const outcome = await commandEngine([NODE, script, "{instruction}"]).invoke(
      invocation({ signal: controller.signal }, emitted),
    );
    expect(outcome.interrupted).toBe(true);
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(emitted.map((entry) => entry.line)).toContain("working");
  });

  it("refuses on the command line an engine with no built-in command, a seat without its model, and an output mode it does not have", async () => {
    const sessionsDir = makeTempDir();
    const usage = async (...args: string[]) =>
      captured(() => sessionVerb(["drive", "--sessions-dir", sessionsDir, ...args]));
    const gemini = await usage("--engine", "gemini");
    expect(gemini.code).toBe(EXIT_USAGE);
    expect(gemini.err).toContain("no built-in command for 'gemini'; pass --engine-argv");
    const seat = await usage("--engine", "copilot");
    expect(seat.code).toBe(EXIT_USAGE);
    expect(seat.err).toContain("--model");
    const loud = await usage("--engine", "claude-code", "--show-engine", "loud");
    expect(loud.code).toBe(EXIT_USAGE);
    expect(loud.err).toContain("invalid choice: 'loud'");
  });
});
