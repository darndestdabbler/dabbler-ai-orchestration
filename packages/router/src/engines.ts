// How `dabbler session drive` reaches an engine.
//
// The loop in `drive.ts` asks for one thing at a time and judges the answer;
// this module is the other half of that exchange -- the process that is
// spawned to read the instruction. One interface, `Engine.invoke`, and four
// adapters behind it: the three CLIs the lifecycle registers (Claude Code,
// the Copilot CLI, Codex) with their argv shapes measured against the
// installed programs, and `commandEngine`, an argv the operator supplies
// for anything else.
//
// Three rules, each bought by the driver spike. The prompt on the command
// line is one sentence and the instruction travels by file, so the argv
// stays short of every ceiling. A program is reached through
// `checks.spawnProgram` -- an executable with no shell, a `.cmd` shim
// through `cmd.exe` with every argument quoted -- because a shell's unquoted
// join shattered the first Copilot prompt into its words. And what the
// engine prints is recorded line by line (stderr prefixed, line endings
// normalised) whether or not it is shown: the transcript is the record,
// and a knob about what a person sees must not change it.
//
// An invocation ends one of three ways: the engine exits, the engine cannot
// be run, or the driver ends it -- an interrupt, delivered through the
// invocation's `signal`. An adapter honours the abort with the CLI's own
// interrupt where it has one (Claude Code's stream-json control message,
// measured to end the turn and keep the process and its context) and with
// a tree kill where it has none; the driver then re-invokes into the same
// conversation and says why. The driver never knows which.
//
// A conversation is resumed BY ITS ID. The engine reports one while it runs
// (`session_id`, `thread_id`), the outcome hands it back, the driver keeps
// it on `run.json`, and the next invocation names it. Resuming by recency
// -- `--continue`, `resume --last` -- is what session 60 did, and what it
// resumed was an interactive session somebody had opened in the same
// working directory since. The Copilot seat still does it, because it
// reports no id and nothing else has been measured; that is said where the
// shape is, not hidden.

import type { ChildProcess } from "node:child_process";
import { basename } from "node:path";

import { spawnProgram, terminateTree } from "./checks.ts";
import type { DriverInstruction } from "./generated/index.ts";

// --- The interface -----------------------------------------------------------

export interface EngineInvocation {
  readonly instruction: DriverInstruction;
  /** Absolute path of `instruction.json`, which the engine reads. */
  readonly instructionPath: string;
  readonly repoRoot: string;
  readonly sessionsDir: string;
  readonly sessionNumber: number;
  /** 1-based, and cumulative across re-runs of the same session. */
  readonly invocation: number;
  /**
   * The first invocation of this session. An engine with a session store
   * of its own starts a session here and continues it on every later one,
   * so one context carries the whole run.
   */
  readonly first: boolean;
  /**
   * The engine's own conversation, by the id it reported on its first
   * invocation, or null when there is none to resume. An adapter NAMES it;
   * nothing here asks for the most recent conversation in this directory,
   * because the most recent one can be somebody else's.
   */
  readonly resumeId: string | null;
  /** Aborted by the driver to end the invocation; the reason is the interrupt's. */
  readonly signal: AbortSignal;
  /**
   * One line of the engine's output. `line` is appended to the transcript
   * verbatim; `display` is what a person sees when the engine's output is
   * streamed -- the line itself when omitted, nothing when null.
   */
  readonly emit: (line: string, display?: string | null) => void;
}

export interface EngineOutcome {
  readonly exitCode: number | null;
  /**
   * The conversation id the engine reported while it ran, for the next
   * invocation to name. Null for an engine that reports none.
   */
  readonly sessionId?: string | null;
  /** Set when the engine could not be run at all, as opposed to ran and failed. */
  readonly error?: string | null;
  /** The driver ended the invocation through `signal`. */
  readonly interrupted?: boolean;
}

/** One engine, reached one way. */
export interface Engine {
  readonly name: string;
  invoke(invocation: EngineInvocation): Promise<EngineOutcome>;
}

export const INSTRUCTION_PLACEHOLDER = "{instruction}";
export const INSTRUCTION_ENV_VAR = "DABBLER_DRIVER_INSTRUCTION";

export { DEFAULT_ENGINE_OUTPUT, ENGINE_OUTPUT_MODES, type EngineOutput } from "./config.ts";

/** The engines `session start` registers that have a built-in argv here. */
export const BUILT_IN_ENGINES = ["claude-code", "copilot", "codex"] as const;

/**
 * The one sentence on the command line; everything else is in the file.
 *
 * "Run", not "answer with": walked with Haiku, "answer with the command"
 * ended two turns in a row with the command printed as the reply and never
 * executed, and the driver refused both for want of an answer. A less
 * capable engine reads the sentence literally, which is the engine this
 * loop exists for.
 */
export function enginePrompt(instructionPath: string): string {
  return (
    `Read ${instructionPath} and do exactly what its "ask" says, then RUN the shell ` +
    'command it names as "answer_command" -- running it is the answer; printing it ' +
    "is not -- and stop."
  );
}

// --- The shapes --------------------------------------------------------------

/**
 * Which conversation this invocation continues.
 *
 * `first` is deliberately not here. It was, and it was what a shape reached
 * for to decide "continue whatever ran last" -- which is the one thing no
 * shape may do. A conversation is continued by naming it, and an adapter
 * with no id to name starts a fresh one.
 */
export interface ArgvContext {
  /** The id the engine reported earlier, or null: start a fresh conversation. */
  readonly resumeId: string | null;
}

/** How a CLI is invoked once per instruction, measured rather than assumed. */
export interface EngineShape {
  readonly program: string;
  /**
   * Where the prompt goes. `argv` puts it on the command line; `stdin`
   * writes it as a stream-json user message and keeps the process's own
   * interrupt available.
   */
  readonly input: "argv" | "stdin";
  /** The arguments after the program, for a fresh conversation or a named one. */
  argv(context: ArgvContext, prompt: string): string[];
  /** One output line as a person should see it, or null for one not worth showing. */
  render(line: string): string | null;
  /**
   * The conversation id this line reports, or null. Read once per
   * invocation, off the engine's own first event, and handed back so the
   * next invocation can name it.
   */
  sessionId(line: string): string | null;
}

/**
 * The built-in shape for an engine, or the sentence that says why there is
 * none. `model` is what `session start` registered; the Copilot seat needs
 * it on every invocation and the others take it when given.
 */
export function engineShape(engine: string, model: string | null): EngineShape | string {
  const modelArgs = (flag: string): string[] => (model ? [flag, model] : []);
  switch (engine) {
    case "claude-code":
      // Measured on Claude Code 2.1: `-p` with `--input-format stream-json`
      // reads user messages from stdin and answers a `control_request`
      // interrupt mid-turn with a `control_response` and a `result`, the
      // process and its context intact. `stream-json` output needs
      // `--verbose`. A continuation is `--resume <id>`, and the id is the
      // `session_id` the first invocation's `init` event reported.
      //
      // It was `--continue`, which resumes the most recent conversation in
      // this directory -- and in session 60 that was an interactive session
      // somebody had opened in the same working directory since, so the
      // driver spent its invocation talking to the wrong conversation. With
      // no id to name, this starts a fresh one rather than guessing: a lost
      // context costs a re-read, and the wrong context costs the session.
      return {
        program: "claude",
        input: "stdin",
        argv: ({ resumeId }) => [
          "-p",
          "--input-format", "stream-json",
          "--output-format", "stream-json",
          "--verbose",
          "--dangerously-skip-permissions",
          ...modelArgs("--model"),
          ...(resumeId ? ["--resume", resumeId] : []),
        ],
        render: renderClaudeCodeEvent,
        sessionId: claudeCodeSessionId,
      };
    case "copilot":
      // Measured on the Copilot CLI: `-p` runs one prompt and exits. The
      // seat exposes no reasoning and has no interrupt, so its own progress
      // lines are what is shown and a tree kill is how an invocation ends
      // early. The model is the seat's own id, required as it is at
      // `session start`.
      //
      // Every invocation is a FRESH conversation. The seat has a
      // `--continue`, and it resumes the most recent session in this
      // directory -- the hazard that cost session 60, and worse here than
      // anywhere because an interactive seat in the working repository is
      // the staff's normal day. It reports no conversation id on its
      // output, so there is nothing to name instead; until a resume-by-id
      // is measured against the seat, each instruction arrives with the
      // context the instruction file carries and no other. A re-read is the
      // price; the wrong conversation is not a price, it is a wrong answer.
      if (!model) return "a Copilot seat names its model: pass --model";
      return {
        program: "copilot",
        input: "argv",
        argv: (_context, prompt) => [
          "-p", prompt,
          "--model", model,
          "--allow-all-tools",
          "--allow-all-paths",
          "--no-ask-user",
        ],
        render: (line) => line,
        sessionId: () => null,
      };
    case "codex":
      // Measured on Codex 0.151.0 (`codex exec --help`): the prompt is
      // positional, `--json` prints events as JSONL, and a continuation is
      // `exec resume <thread>` -- the thread id `thread.started` reports,
      // rather than `resume --last`, which picks whatever ran most recently
      // in this directory and carries the same hazard `--continue` did.
      return {
        program: "codex",
        input: "argv",
        argv: ({ resumeId }, prompt) => [
          "exec",
          ...(resumeId ? ["resume", resumeId] : []),
          "--json",
          ...modelArgs("-m"),
          "--dangerously-bypass-approvals-and-sandbox",
          prompt,
        ],
        render: renderCodexEvent,
        sessionId: codexThreadId,
      };
    default:
      return `no built-in command for '${engine}'; pass --engine-argv`;
  }
}

// --- Rendering ---------------------------------------------------------------

function clip(text: unknown, limit: number): string {
  return String(text ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function parseJson(line: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(line);
    return parsed !== null && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function contentBlocks(event: Record<string, unknown>): Array<Record<string, unknown>> {
  const message = event["message"];
  const content = message && typeof message === "object" ? (message as Record<string, unknown>)["content"] : null;
  return Array.isArray(content) ? (content as Array<Record<string, unknown>>) : [];
}

/**
 * Claude Code's stream-json, one event per line. Of the `system` events
 * only `init` is shown: the rest (token accounting after every turn, hooks,
 * compaction) are bookkeeping a person reading along does not need, and
 * the transcript keeps them anyway.
 */
export function renderClaudeCodeEvent(line: string): string | null {
  const event = parseJson(line);
  if (event === null) return line;
  switch (event["type"]) {
    case "system":
      return event["subtype"] === "init" ? `engine session started (${String(event["model"] ?? "?")})` : null;
    case "assistant":
      return (
        contentBlocks(event)
          .map((block) => {
            if (block["type"] === "thinking") return `thinking: ${clip(block["thinking"], 240)}`;
            if (block["type"] === "text") return `engine: ${clip(block["text"], 240)}`;
            if (block["type"] === "tool_use") {
              return `tool ${String(block["name"])}  ${clip(JSON.stringify(block["input"] ?? {}), 140)}`;
            }
            return null;
          })
          .filter((entry): entry is string => entry !== null)
          .join("\n") || null
      );
    case "user":
      return (
        contentBlocks(event)
          .filter((block) => block["type"] === "tool_result")
          .map((block) => {
            const body = typeof block["content"] === "string" ? block["content"] : JSON.stringify(block["content"]);
            return `  ← ${clip(body, 120)}`;
          })
          .join("\n") || null
      );
    case "result": {
      const cost = event["total_cost_usd"];
      return (
        `result: ${String(event["subtype"] ?? "")} in ${String(event["duration_ms"] ?? "?")} ms` +
        (typeof cost === "number" ? `, $${cost.toFixed(4)}` : "")
      );
    }
    case "control_response":
      return "interrupt acknowledged";
    default:
      return null;
  }
}

/**
 * Codex's `--json` JSONL: `thread.started`, `turn.*` and `item.*` events
 * carrying an item with its own `type`. Only a completed item is shown --
 * `item.started` and `item.updated` are the same item on its way.
 */
export function renderCodexEvent(line: string): string | null {
  const event = parseJson(line);
  if (event === null) return line;
  const type = String(event["type"] ?? "");
  if (type === "thread.started") return `engine session started (${String(event["thread_id"] ?? "?")})`;
  if (type === "turn.completed") return "result: turn completed";
  if (type === "turn.failed" || type === "error") {
    const error = event["error"];
    const message = error && typeof error === "object" ? (error as Record<string, unknown>)["message"] : event["message"];
    return `error: ${clip(message, 240)}`;
  }
  if (type !== "item.completed") return null;
  const item = event["item"];
  if (!item || typeof item !== "object") return null;
  const row = item as Record<string, unknown>;
  switch (row["type"]) {
    case "agent_message":
      return `engine: ${clip(row["text"], 240)}`;
    case "reasoning":
      return `thinking: ${clip(row["text"], 240)}`;
    case "command_execution":
      return `tool command  ${clip(row["command"], 140)} -> exit ${String(row["exit_code"] ?? "?")}`;
    case "file_change": {
      const changes = Array.isArray(row["changes"]) ? (row["changes"] as Array<Record<string, unknown>>) : [];
      return `edit ${changes.map((change) => String(change["path"] ?? "")).join(", ")}`;
    }
    case "error":
      return `error: ${clip(row["message"], 240)}`;
    default:
      return null;
  }
}

/**
 * Claude Code's conversation id, off any event that carries one.
 *
 * The `init` event is the first, and the `result` event carries it again;
 * reading it off whichever comes first means the id survives a stream that
 * starts with something else.
 */
export function claudeCodeSessionId(line: string): string | null {
  const id = parseJson(line)?.["session_id"];
  return typeof id === "string" && id !== "" ? id : null;
}

/** Codex's thread id, off `thread.started` and nowhere else. */
export function codexThreadId(line: string): string | null {
  const event = parseJson(line);
  if (event === null || event["type"] !== "thread.started") return null;
  const id = event["thread_id"];
  return typeof id === "string" && id !== "" ? id : null;
}

// --- Running a child ---------------------------------------------------------

interface ChildRun {
  readonly child: ChildProcess;
  readonly invocation: EngineInvocation;
  readonly render: (line: string) => string | null;
  /** End the invocation early; `fallback` kills the tree if this does not. */
  readonly interrupt: (child: ChildProcess) => void;
  /** Seen on every stdout line, for an adapter that watches the protocol. */
  readonly onLine?: (line: string) => void;
}

const INTERRUPT_GRACE_MS = 10_000;

/** Consume the child's output into the transcript and settle on its close. */
function runChild(run: ChildRun): Promise<EngineOutcome> {
  const { child, invocation } = run;
  return new Promise((settle) => {
    const pending = { out: "", err: "" };
    let settled = false;
    let interrupted = false;
    let fallback: NodeJS.Timeout | null = null;

    const consume = (key: "out" | "err", chunk: Buffer): void => {
      pending[key] += chunk.toString("utf8");
      let newline: number;
      while ((newline = pending[key].indexOf("\n")) >= 0) {
        const line = pending[key].slice(0, newline).replace(/\r$/, "");
        pending[key] = pending[key].slice(newline + 1);
        if (key === "err") {
          invocation.emit(`stderr: ${line}`);
          continue;
        }
        run.onLine?.(line);
        invocation.emit(line, line.trim() === "" ? null : run.render(line));
      }
    };
    child.stdout?.on("data", (chunk: Buffer) => consume("out", chunk));
    child.stderr?.on("data", (chunk: Buffer) => consume("err", chunk));

    const onAbort = (): void => {
      if (settled || interrupted) return;
      interrupted = true;
      run.interrupt(child);
      fallback = setTimeout(() => terminateTree(child), INTERRUPT_GRACE_MS);
    };
    if (invocation.signal.aborted) onAbort();
    else invocation.signal.addEventListener("abort", onAbort, { once: true });

    const finish = (outcome: EngineOutcome): void => {
      if (settled) return;
      settled = true;
      invocation.signal.removeEventListener("abort", onAbort);
      if (fallback) clearTimeout(fallback);
      settle(outcome);
    };
    child.on("error", (error) => finish({ exitCode: null, error: error.message }));
    child.on("close", (code) => {
      for (const key of ["out", "err"] as const) {
        if (pending[key].trim()) invocation.emit((key === "err" ? "stderr: " : "") + pending[key]);
      }
      finish({ exitCode: code, interrupted });
    });
  });
}

function spawnOrFail(
  argv: readonly string[],
  invocation: EngineInvocation,
  stdin: "ignore" | "pipe",
): ChildProcess | string {
  try {
    return spawnProgram(argv, {
      cwd: invocation.repoRoot,
      stdio: [stdin, "pipe", "pipe"],
      env: { ...process.env, [INSTRUCTION_ENV_VAR]: invocation.instructionPath },
    });
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

// --- The adapters ------------------------------------------------------------

export interface BuiltInEngineOptions {
  /** Stands in for the CLI, for a test that speaks its protocol. */
  readonly program?: string;
  readonly leadingArgs?: readonly string[];
}

/**
 * The engine `session start` registered, reached through its measured
 * shape. Refused by name, with the reason, when there is no shape for it.
 */
export function builtInEngine(
  engine: string,
  model: string | null,
  options: BuiltInEngineOptions = {},
): Engine | string {
  const shape = engineShape(engine, model);
  if (typeof shape === "string") return shape;
  const program = options.program ?? shape.program;
  const leading = options.leadingArgs ?? [];
  return {
    name: engine,
    invoke(invocation: EngineInvocation): Promise<EngineOutcome> {
      const prompt = enginePrompt(invocation.instructionPath);
      const argv = [program, ...leading, ...shape.argv({ resumeId: invocation.resumeId }, prompt)];
      const spawned = spawnOrFail(argv, invocation, shape.input === "stdin" ? "pipe" : "ignore");
      if (typeof spawned === "string") return Promise.resolve({ exitCode: null, error: spawned });
      // The id the engine reports for the conversation it just opened. It
      // is read once -- the first line that carries one -- so a later event
      // repeating it cannot move the run onto a different conversation.
      let sessionId: string | null = null;
      const watch = (line: string): void => {
        if (sessionId === null) sessionId = shape.sessionId(line);
      };
      const reported = (outcome: EngineOutcome): EngineOutcome => ({ ...outcome, sessionId });
      if (shape.input === "argv") {
        return runChild({
          child: spawned,
          invocation,
          render: shape.render,
          interrupt: terminateTree,
          onLine: watch,
        }).then(reported);
      }
      // The stream-json conversation: the prompt is a user message, the
      // turn ends with a `result` event, and stdin is closed then so the
      // process exits on its own. An interrupt is the control message the
      // CLI answers by ending the turn -- which produces the same `result`.
      const write = (record: Record<string, unknown>): void => {
        if (spawned.stdin && spawned.stdin.writable) spawned.stdin.write(`${JSON.stringify(record)}\n`);
      };
      write({ type: "user", message: { role: "user", content: prompt } });
      return runChild({
        child: spawned,
        invocation,
        render: shape.render,
        interrupt: () =>
          write({
            type: "control_request",
            request_id: `interrupt-${invocation.invocation}`,
            request: { subtype: "interrupt" },
          }),
        onLine: (line) => {
          watch(line);
          if (parseJson(line)?.["type"] === "result") spawned.stdin?.end();
        },
      }).then(reported);
    },
  };
}

/**
 * An argv the operator supplies, spawned once per instruction in the
 * repository root. `{instruction}` in any element is the instruction's
 * path, which the child also finds in `DABBLER_DRIVER_INSTRUCTION`. Its
 * output is shown as it is, and an interrupt ends its tree.
 */
export function commandEngine(argv: readonly string[]): Engine {
  if (argv.length === 0 || argv[0] === "") {
    throw new Error("an engine command names a program");
  }
  return {
    name: `command:${basename(argv[0] as string)}`,
    invoke(invocation: EngineInvocation): Promise<EngineOutcome> {
      const rendered = argv.map((element) =>
        element.replaceAll(INSTRUCTION_PLACEHOLDER, invocation.instructionPath),
      );
      const spawned = spawnOrFail(rendered, invocation, "ignore");
      if (typeof spawned === "string") return Promise.resolve({ exitCode: null, error: spawned });
      return runChild({ child: spawned, invocation, render: (line) => line, interrupt: terminateTree });
    },
  };
}
