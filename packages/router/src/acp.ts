// The engine interface the framework needs, and two implementations of it.
// Called by nothing yet: `dabbler agent` is its only user, and it exists so
// that verification and the driver can adopt it as a configuration change
// rather than a rewrite.
//
// Four verbs and no fifth: OPEN a conversation -- fresh, or resumed BY ITS
// ID and never by recency; SEND one message; RECEIVE the events the agent
// produces while it works, structured and not painted; CANCEL the turn in
// flight. Everything the four hand-built adapters in `engines.ts`
// approximate -- an argv per CLI, an interrupt per CLI, a resume quirk per
// CLI -- is this interface, implemented per protocol.
//
// Two protocols satisfy it. The Agent Client Protocol (`copilot --acp`):
// JSON-RPC 2.0 over stdio, one record per line, with `session/update`
// notifications as the events and the agent's own requests to the client
// (`session/request_permission`) answered from here. Claude Code's
// `--input-format stream-json` / `--output-format stream-json`: a user
// message on stdin, events on stdout, a `control_request` as the
// interrupt. The second is an implementation of the same interface and
// not a special case: the events map onto one union and the outcome is one
// shape.
//
// What the client does when the agent asks permission is a POLICY the
// connection states when it opens -- `allow` answers every request with the
// agent's allow-ONCE option (never allow-always: the policy is the
// framework's and is not delegated to the agent's memory), `deny` with its
// reject option -- and never a prompt forwarded to a person who is not
// there. A request that arrives after `cancel()` is answered `cancelled`,
// which is the protocol's own word for it.
//
// Measured against the Copilot CLI 1.0.83 (`docs/acp-walkthrough.md`), and
// the code below relies on these: `initialize` reports `loadSession: true`
// and `sessionCapabilities` `close` and `list`; the updates a `session/load`
// replays arrive BEFORE the load's own response, so the reply is what ends
// the history; a `session/cancel` is answered by the pending prompt's
// response with `stopReason: "end_turn"` and no usage, not the protocol's
// `cancelled`, so a turn is reported cancelled from the client's own
// knowledge; a permission request's options carry the kinds `allow_once`,
// `allow_always` and `reject_once`, an edit asks and a read does not, the
// file the agent writes after an allow is on disk before the
// `tool_call_update` that says `completed`, and a denial comes back as a
// `tool_call_update` with `status: "failed"` and `rawOutput.code:
// "rejected"`, after which the turn may end with no text at all. The
// Claude Code implementation's permission channel
// (`--permission-prompt-tool stdio`) is NOT measured; its argv otherwise is
// the one `engines.ts` measured.

import type { ChildProcess } from "node:child_process";
import { resolve } from "node:path";

import { spawnProgram, terminateTree } from "./checks.ts";
import { VERSION } from "./version.ts";

// --- The interface -----------------------------------------------------------

/** What the client answers when the agent asks whether a tool may run. */
export type PermissionPolicy = "allow" | "deny";

export interface OpenOptions {
  /** The directory the agent works in; absolute or resolved here. */
  readonly cwd: string;
  /** The model the agent should use, where its protocol takes one. */
  readonly model?: string | null;
  /** A conversation to continue, by the id it reported when it was opened. */
  readonly resumeId?: string | null;
  readonly permissions: PermissionPolicy;
}

/**
 * One thing the agent did or said. Every event keeps `raw`, the record it
 * was made from, so a transcript loses nothing a mapping did not carry.
 */
export type AgentEvent =
  | { readonly kind: "text"; readonly role: "agent" | "user"; readonly text: string; readonly raw: unknown }
  | { readonly kind: "thought"; readonly text: string; readonly raw: unknown }
  | {
      readonly kind: "tool";
      readonly id: string;
      readonly title: string;
      readonly toolKind: string | null;
      readonly status: string | null;
      readonly raw: unknown;
    }
  | {
      readonly kind: "tool-update";
      readonly id: string;
      readonly status: string | null;
      readonly summary: string | null;
      readonly raw: unknown;
    }
  | {
      readonly kind: "permission";
      readonly id: string;
      readonly title: string;
      readonly decision: PermissionPolicy | "cancelled";
      readonly raw: unknown;
    }
  | { readonly kind: "usage"; readonly raw: unknown }
  | { readonly kind: "plan"; readonly raw: unknown }
  | { readonly kind: "stderr"; readonly text: string; readonly raw: unknown }
  | { readonly kind: "other"; readonly raw: unknown };

export interface TurnOutcome {
  /** The agent's own word for how the turn ended. */
  readonly stopReason: string;
  /** Whether this client cancelled it, whatever the agent's word was. */
  readonly cancelled: boolean;
  readonly usage: Record<string, unknown> | null;
}

export interface AgentConnection {
  /** The conversation's id, as the agent reported it; what a resume names. */
  readonly sessionId: string;
  /** What the agent said it can do, as it said it. */
  readonly capabilities: Record<string, unknown>;
  /** The events a resume replayed, in order; empty for a fresh conversation. */
  readonly history: readonly AgentEvent[];
  prompt(text: string, onEvent: (event: AgentEvent) => void): Promise<TurnOutcome>;
  /** End the turn in flight; its `prompt` still settles, marked cancelled. */
  cancel(): void;
  close(): Promise<void>;
}

export interface AgentClient {
  readonly name: string;
  open(options: OpenOptions): Promise<AgentConnection>;
}

/** Stands in for the CLI, for a test that speaks its protocol. */
export interface StandIn {
  readonly program?: string;
  readonly leadingArgs?: readonly string[];
}

// --- The child, line by line -------------------------------------------------

/** How long a closed conversation's process gets to exit on its own. */
const CLOSE_GRACE_MS = 5_000;

interface Child {
  readonly exited: Promise<number | null>;
  write(record: Record<string, unknown>): void;
  end(): Promise<void>;
}

/**
 * Spawn the agent and read its output as records, one per line. Stderr
 * lines reach `onLine` too, marked; `onExit` fires once, with the code.
 */
function spawnChild(
  argv: readonly string[],
  cwd: string,
  onLine: (line: string, stream: "out" | "err") => void,
  onExit: (code: number | null) => void,
): Child | string {
  let child: ChildProcess;
  try {
    child = spawnProgram(argv, { cwd, stdio: ["pipe", "pipe", "pipe"], env: { ...process.env } });
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  const pending = { out: "", err: "" };
  const consume = (key: "out" | "err", chunk: Buffer): void => {
    pending[key] += chunk.toString("utf8");
    let newline: number;
    while ((newline = pending[key].indexOf("\n")) >= 0) {
      const line = pending[key].slice(0, newline).replace(/\r$/, "");
      pending[key] = pending[key].slice(newline + 1);
      if (line.trim() !== "") onLine(line, key);
    }
  };
  child.stdout?.on("data", (chunk: Buffer) => consume("out", chunk));
  child.stderr?.on("data", (chunk: Buffer) => consume("err", chunk));
  const exited = new Promise<number | null>((settle) => {
    let done = false;
    const finish = (code: number | null): void => {
      if (done) return;
      done = true;
      for (const key of ["out", "err"] as const) {
        if (pending[key].trim() !== "") onLine(pending[key], key);
      }
      onExit(code);
      settle(code);
    };
    child.on("error", () => finish(null));
    child.on("close", (code) => finish(code));
  });
  return {
    exited,
    write: (record) => {
      if (child.stdin && child.stdin.writable) child.stdin.write(`${JSON.stringify(record)}\n`);
    },
    end: () => {
      child.stdin?.end();
      const grace = setTimeout(() => terminateTree(child), CLOSE_GRACE_MS);
      return exited.then(() => clearTimeout(grace));
    },
  };
}

function parseRecord(line: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(line);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function summarise(text: unknown, limit = 200): string {
  return String(text ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

// --- The Agent Client Protocol -----------------------------------------------

/** The program that speaks ACP on its stdio, and how it takes a model. */
export interface AcpShape {
  readonly program: string;
  readonly args: readonly string[];
  readonly modelArgs?: (model: string) => string[];
}

/** The Copilot CLI as an ACP agent: measured on 1.0.83. */
export const COPILOT_ACP: AcpShape = {
  program: "copilot",
  args: ["--acp"],
  modelArgs: (model) => ["--model", model],
};

const ACP_PROTOCOL_VERSION = 1;
const JSONRPC_METHOD_NOT_FOUND = -32601;

/** The options a permission request offers, by the kind the protocol names. */
function permissionOption(
  options: readonly Record<string, unknown>[],
  wanted: "allow" | "reject",
): string | null {
  const exact = options.find((option) => option["kind"] === `${wanted}_once`);
  const any = options.find((option) => asString(option["kind"]).startsWith(wanted));
  const chosen = exact ?? any;
  return chosen ? asString(chosen["optionId"]) || null : null;
}

/** One `session/update` as the interface speaks it. */
export function acpEvent(update: Record<string, unknown>): AgentEvent {
  const content = asRecord(update["content"]);
  switch (update["sessionUpdate"]) {
    case "agent_message_chunk":
      return { kind: "text", role: "agent", text: asString(content["text"], JSON.stringify(content)), raw: update };
    case "user_message_chunk":
      return { kind: "text", role: "user", text: asString(content["text"], JSON.stringify(content)), raw: update };
    case "agent_thought_chunk":
      return { kind: "thought", text: asString(content["text"], JSON.stringify(content)), raw: update };
    case "tool_call":
      return {
        kind: "tool",
        id: asString(update["toolCallId"]),
        title: asString(update["title"]),
        toolKind: typeof update["kind"] === "string" ? update["kind"] : null,
        status: typeof update["status"] === "string" ? update["status"] : null,
        raw: update,
      };
    case "tool_call_update": {
      const blocks = Array.isArray(update["content"]) ? (update["content"] as unknown[]).map(asRecord) : [];
      const first = blocks[0];
      // The seat puts a read tool's text and a rejection's message in
      // `rawOutput` with no content block at all; that is still the update's
      // one line worth showing.
      const rawOutput = asRecord(update["rawOutput"]);
      const summary =
        first === undefined
          ? typeof rawOutput["content"] === "string"
            ? summarise(rawOutput["content"])
            : typeof rawOutput["message"] === "string"
              ? summarise(rawOutput["message"])
              : null
          : first["type"] === "diff"
            ? `diff ${asString(first["path"])}`
            : first["type"] === "content"
              ? summarise(asRecord(first["content"])["text"])
              : asString(first["type"], "content");
      return {
        kind: "tool-update",
        id: asString(update["toolCallId"]),
        status: typeof update["status"] === "string" ? update["status"] : null,
        summary,
        raw: update,
      };
    }
    case "plan":
      return { kind: "plan", raw: update };
    case "usage_update":
      return { kind: "usage", raw: update };
    default:
      return { kind: "other", raw: update };
  }
}

interface Pending {
  readonly method: string;
  readonly resolve: (result: Record<string, unknown>) => void;
  readonly reject: (error: Error) => void;
}

/**
 * An ACP agent reached over its stdio. `argv` is the program and the
 * arguments that put it in ACP mode; the model, when the shape takes one,
 * goes on the argv too because that is where the Copilot CLI takes it.
 */
export function acpAgent(shape: AcpShape, standIn: StandIn = {}): AgentClient {
  return {
    name: `acp:${shape.program}`,
    async open(options: OpenOptions): Promise<AgentConnection> {
      const cwd = resolve(options.cwd);
      const model = options.model ?? null;
      const argv = [
        standIn.program ?? shape.program,
        ...(standIn.leadingArgs ?? []),
        ...shape.args,
        ...(model !== null && shape.modelArgs ? shape.modelArgs(model) : []),
      ];

      let nextId = 1;
      const pending = new Map<number, Pending>();
      let sessionId: string | null = null;
      const history: AgentEvent[] = [];
      let loading = false;
      let turn: ((event: AgentEvent) => void) | null = null;
      let cancelled = false;
      let exitCode: number | null | undefined;

      const deliver = (event: AgentEvent): void => {
        if (loading) history.push(event);
        else if (turn !== null) turn(event);
        // Between turns nothing is listening: the seat's own housekeeping
        // (`available_commands_update` after a `session/new`) is dropped.
      };

      const onLine = (line: string, stream: "out" | "err"): void => {
        if (stream === "err") {
          deliver({ kind: "stderr", text: line, raw: line });
          return;
        }
        const record = parseRecord(line);
        if (record === null) {
          deliver({ kind: "other", raw: line });
          return;
        }
        const id = record["id"];
        if (typeof id === "number" && record["method"] === undefined) {
          const waiting = pending.get(id);
          if (waiting === undefined) return;
          pending.delete(id);
          if (record["error"] !== undefined) {
            const error = asRecord(record["error"]);
            waiting.reject(
              new Error(`${waiting.method} refused: ${asString(error["message"], JSON.stringify(record["error"]))}`),
            );
          } else {
            waiting.resolve(asRecord(record["result"]));
          }
          return;
        }
        const method = asString(record["method"]);
        const params = asRecord(record["params"]);
        if (id === undefined || id === null) {
          if (method === "session/update") deliver(acpEvent(asRecord(params["update"])));
          else deliver({ kind: "other", raw: record });
          return;
        }
        // A request FROM the agent. Permission is the policy's to answer;
        // nothing else is offered, and the agent is told so in the
        // protocol's own words rather than left waiting.
        if (method === "session/request_permission") {
          const toolCall = asRecord(params["toolCall"]);
          const offered = Array.isArray(params["options"]) ? (params["options"] as unknown[]).map(asRecord) : [];
          const optionId = cancelled
            ? null
            : permissionOption(offered, options.permissions === "allow" ? "allow" : "reject");
          const decision: PermissionPolicy | "cancelled" = optionId === null ? "cancelled" : options.permissions;
          child.write({
            jsonrpc: "2.0",
            id,
            result: {
              outcome: optionId === null ? { outcome: "cancelled" } : { outcome: "selected", optionId },
            },
          });
          deliver({
            kind: "permission",
            id: asString(toolCall["toolCallId"]),
            title: asString(toolCall["title"]),
            decision,
            raw: record,
          });
          return;
        }
        child.write({
          jsonrpc: "2.0",
          id,
          error: { code: JSONRPC_METHOD_NOT_FOUND, message: `${method} is not offered by this client` },
        });
        deliver({ kind: "other", raw: record });
      };

      const spawned = spawnChild(argv, cwd, onLine, (code) => {
        exitCode = code;
        for (const [id, waiting] of pending) {
          pending.delete(id);
          waiting.reject(new Error(`the agent exited (code ${code === null ? "none" : code}) before answering ${waiting.method}`));
        }
      });
      if (typeof spawned === "string") throw new Error(`the agent could not be run: ${spawned}`);
      const child = spawned;

      const request = (method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> => {
        if (exitCode !== undefined) {
          return Promise.reject(new Error(`the agent exited (code ${exitCode === null ? "none" : exitCode}) before ${method}`));
        }
        const id = nextId++;
        child.write({ jsonrpc: "2.0", id, method, params });
        return new Promise((resolve, reject) => pending.set(id, { method, resolve, reject }));
      };
      const notify = (method: string, params: Record<string, unknown>): void => {
        child.write({ jsonrpc: "2.0", method, params });
      };

      const capabilities = await request("initialize", {
        protocolVersion: ACP_PROTOCOL_VERSION,
        // No file or terminal service is offered: the agent does its own
        // IO, which is what an unattended client can stand behind.
        clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
        clientInfo: { name: "dabbler", version: VERSION },
      });
      if (options.resumeId) {
        loading = true;
        try {
          await request("session/load", { sessionId: options.resumeId, cwd, mcpServers: [] });
        } finally {
          loading = false;
        }
        sessionId = options.resumeId;
      } else {
        const created = await request("session/new", { cwd, mcpServers: [] });
        sessionId = asString(created["sessionId"]) || null;
        if (sessionId === null) throw new Error("session/new answered with no sessionId");
      }
      const opened = sessionId;

      return {
        sessionId: opened,
        capabilities,
        history,
        async prompt(text, onEvent): Promise<TurnOutcome> {
          if (turn !== null) throw new Error("a turn is already in flight on this conversation");
          turn = onEvent;
          cancelled = false;
          try {
            const result = await request("session/prompt", {
              sessionId: opened,
              prompt: [{ type: "text", text }],
            });
            return {
              stopReason: asString(result["stopReason"], "unknown"),
              cancelled,
              usage: result["usage"] === undefined ? null : asRecord(result["usage"]),
            };
          } finally {
            turn = null;
          }
        },
        cancel(): void {
          if (turn === null || cancelled) return;
          cancelled = true;
          notify("session/cancel", { sessionId: opened });
        },
        async close(): Promise<void> {
          if (exitCode === undefined) {
            await request("session/close", { sessionId: opened }).catch(() => undefined);
          }
          await child.end();
        },
      };
    },
  };
}

// --- Claude Code's stream-json -----------------------------------------------

/** The event's content blocks, for the `assistant` and `user` records. */
function contentBlocks(record: Record<string, unknown>): Record<string, unknown>[] {
  const content = asRecord(record["message"])["content"];
  return Array.isArray(content) ? content.map(asRecord) : [];
}

/** One stream-json record as the interface speaks it; several for a message. */
export function claudeCodeEvents(record: Record<string, unknown>): AgentEvent[] {
  switch (record["type"]) {
    case "assistant":
      return contentBlocks(record).map((block): AgentEvent => {
        if (block["type"] === "text") return { kind: "text", role: "agent", text: asString(block["text"]), raw: record };
        if (block["type"] === "thinking") return { kind: "thought", text: asString(block["thinking"]), raw: record };
        if (block["type"] === "tool_use") {
          return {
            kind: "tool",
            id: asString(block["id"]),
            title: asString(block["name"]),
            toolKind: null,
            status: "pending",
            raw: record,
          };
        }
        return { kind: "other", raw: record };
      });
    case "user":
      return contentBlocks(record)
        .filter((block) => block["type"] === "tool_result")
        .map((block): AgentEvent => {
          const body = typeof block["content"] === "string" ? block["content"] : JSON.stringify(block["content"] ?? "");
          return {
            kind: "tool-update",
            id: asString(block["tool_use_id"]),
            status: block["is_error"] === true ? "failed" : "completed",
            summary: summarise(body),
            raw: record,
          };
        });
    default:
      return [{ kind: "other", raw: record }];
  }
}

/**
 * Claude Code reached through the stream-json conversation `engines.ts`
 * measured: the prompt is a user message on stdin, the `init` event names
 * the conversation, a `result` ends the turn, and the interrupt is a
 * control message the CLI answers by ending the turn with the process and
 * its context intact. A resume is `--resume <id>` and replays nothing, so
 * the history is empty; that is the protocol's answer and not a gap.
 */
export function claudeCodeAgent(standIn: StandIn = {}): AgentClient {
  return {
    name: "claude-code",
    open(options: OpenOptions): Promise<AgentConnection> {
      const cwd = resolve(options.cwd);
      const argv = [
        standIn.program ?? "claude",
        ...(standIn.leadingArgs ?? []),
        "-p",
        "--input-format", "stream-json",
        "--output-format", "stream-json",
        "--verbose",
        ...(options.permissions === "allow"
          ? ["--dangerously-skip-permissions"]
          : ["--permission-prompt-tool", "stdio"]),
        ...(options.model ? ["--model", options.model] : []),
        ...(options.resumeId ? ["--resume", options.resumeId] : []),
      ];

      let turn: ((event: AgentEvent) => void) | null = null;
      let settleTurn: ((result: Record<string, unknown>) => void) | null = null;
      let failTurn: ((error: Error) => void) | null = null;
      let cancelled = false;
      let exitCode: number | null | undefined;
      // Named by the resume, or by the `init` event the first turn opens
      // with: `-p` announces the conversation when the first message
      // arrives, not before, so a fresh conversation has its id after its
      // first prompt.
      let sessionId: string | null = options.resumeId ?? null;
      let capabilities: Record<string, unknown> = {};
      let interrupts = 0;

      const deliver = (event: AgentEvent): void => {
        if (turn !== null) turn(event);
      };

      const onLine = (line: string, stream: "out" | "err"): void => {
        if (stream === "err") {
          deliver({ kind: "stderr", text: line, raw: line });
          return;
        }
        const record = parseRecord(line);
        if (record === null) {
          deliver({ kind: "other", raw: line });
          return;
        }
        if (record["type"] === "system" && record["subtype"] === "init") {
          const id = asString(record["session_id"]);
          if (sessionId === null && id !== "") sessionId = id;
          capabilities = record;
          return;
        }
        if (record["type"] === "result") {
          const settle = settleTurn;
          settleTurn = null;
          failTurn = null;
          settle?.(record);
          return;
        }
        if (record["type"] === "control_request") {
          const inner = asRecord(record["request"]);
          if (inner["subtype"] === "can_use_tool") {
            const decision: PermissionPolicy | "cancelled" = cancelled ? "cancelled" : options.permissions;
            child.write({
              type: "control_response",
              response: {
                subtype: "success",
                request_id: record["request_id"],
                response:
                  decision === "allow"
                    ? { behavior: "allow", updatedInput: inner["input"] ?? {} }
                    : { behavior: "deny", message: `denied by policy (${decision})` },
              },
            });
            deliver({
              kind: "permission",
              id: asString(inner["tool_use_id"], asString(record["request_id"])),
              title: asString(inner["tool_name"]),
              decision,
              raw: record,
            });
            return;
          }
        }
        for (const event of claudeCodeEvents(record)) deliver(event);
      };

      const spawned = spawnChild(argv, cwd, onLine, (code) => {
        exitCode = code;
        const fail = failTurn;
        failTurn = null;
        settleTurn = null;
        fail?.(new Error(`the agent exited (code ${code === null ? "none" : code}) before answering`));
      });
      if (typeof spawned === "string") {
        return Promise.reject(new Error(`the agent could not be run: ${spawned}`));
      }
      const child = spawned;

      return Promise.resolve({
        get sessionId() {
          return sessionId ?? "";
        },
        get capabilities() {
          return capabilities;
        },
        history: [],
        async prompt(text, onEvent): Promise<TurnOutcome> {
          if (turn !== null) throw new Error("a turn is already in flight on this conversation");
          if (exitCode !== undefined) {
            throw new Error(`the agent exited (code ${exitCode === null ? "none" : exitCode}) before the prompt`);
          }
          turn = onEvent;
          cancelled = false;
          try {
            const result = await new Promise<Record<string, unknown>>((resolveTurn, rejectTurn) => {
              settleTurn = resolveTurn;
              failTurn = rejectTurn;
              child.write({ type: "user", message: { role: "user", content: text } });
            });
            return {
              stopReason: asString(result["subtype"], "unknown"),
              cancelled,
              usage: result["usage"] === undefined ? null : asRecord(result["usage"]),
            };
          } finally {
            turn = null;
          }
        },
        cancel(): void {
          if (turn === null || cancelled) return;
          cancelled = true;
          interrupts += 1;
          child.write({
            type: "control_request",
            request_id: `interrupt-${interrupts}`,
            request: { subtype: "interrupt" },
          });
        },
        close(): Promise<void> {
          return child.end();
        },
      });
    },
  };
}
