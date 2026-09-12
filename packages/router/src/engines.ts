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
import { existsSync } from "node:fs";
import { basename, delimiter, join } from "node:path";

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
  /**
   * The model the engine REFUSED, where it said so, or null.
   *
   * A separate field from `error`, and from the exit code, because it is a
   * separate fact: the CLI ran, answered, and did no work. `claude` exits 0
   * when it rejects a `--model` (measured on Claude Code 2.1.269,
   * 2026-09-12), so an invocation that read the exit status alone would
   * carry on into a session authored by whatever the CLI fell back to --
   * which is a session running on a model the operator did not choose and
   * the record does not name.
   */
  readonly refusedModel?: string | null;
  /**
   * What the engine said actually answered, or null where it said nothing.
   *
   * Null is *the engine did not say*, and is never read as agreement: a seat
   * that reports no conversation id leaves its own echo in a file nothing
   * here can tie to this invocation, and an absent statement and a statement
   * that the model was honoured are different facts.
   */
  readonly servedModel?: ServedModel | null;
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
 * The program each built-in engine is launched as.
 *
 * One statement, read by `engineShape` for the argv and by
 * `installedEngines` for the lookup. Two copies of "which program is Claude
 * Code" is how a vendor's rename comes to be made in one of them.
 */
const ENGINE_PROGRAM = {
  "claude-code": "claude",
  copilot: "copilot",
  codex: "codex",
} as const;

/** The program that engine is launched as, or null for one with no built-in shape. */
export function engineProgram(engine: string): string | null {
  return (ENGINE_PROGRAM as Record<string, string | undefined>)[engine] ?? null;
}

/** One engine's CLI, and where this machine has it. */
export interface EngineInstallation {
  readonly engine: string;
  readonly program: string;
  /** Where it was found on PATH; null when it was not found at all. */
  readonly path: string | null;
}

/**
 * What this machine has, and what that decides.
 *
 * `chosen` is an engine only where the machine leaves no choice to make --
 * exactly one CLI installed. `reason` is filled in every case, including
 * that one: a default an operator cannot see the reason for is a thing that
 * happened to them, and the sentence is the difference.
 */
export interface EngineReading {
  readonly engines: readonly EngineInstallation[];
  readonly chosen: string | null;
  readonly reason: string;
}

/**
 * The first `program` on PATH, or null.
 *
 * A LOOKUP and never a spawn: this answers a surface that repaints whenever
 * a declaration moves, and running three CLIs to draw a row would put a
 * process launch behind opening a pane. What it establishes is therefore
 * narrower than "it runs", and that is the honest claim -- a name on PATH.
 */
function lookupOnPath(
  program: string,
  env: Readonly<Record<string, string | undefined>>,
): string | null {
  const search = (env["PATH"] ?? env["Path"] ?? "").split(delimiter).filter(Boolean);
  // On Windows a bare name is not executable: what makes `claude` runnable
  // is `claude.cmd` (or another PATHEXT member), and a lookup that ignored
  // that would report every engine missing on the platform this framework
  // is developed on.
  const extensions =
    process.platform === "win32"
      ? (env["PATHEXT"] ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)
      : [""];
  for (const directory of search) {
    for (const extension of extensions) {
      const candidate = join(directory, `${program}${extension}`);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * Which engine CLIs this machine has, and the one that follows from it.
 *
 * `env` is a parameter rather than a read of `process.env` so that what the
 * reading says is a function of the PATH it was handed, and not of whichever
 * CLIs the machine running the suite happens to have installed.
 */
export function installedEngines(
  env: Readonly<Record<string, string | undefined>> = process.env,
): EngineReading {
  const engines: EngineInstallation[] = BUILT_IN_ENGINES.map((engine) => {
    const program = ENGINE_PROGRAM[engine];
    return { engine, program, path: lookupOnPath(program, env) };
  });
  const present = engines.filter((entry) => entry.path !== null);
  const quoted = present.map((entry) => `\`${entry.program}\``);
  const names =
    quoted.length < 2
      ? quoted.join("")
      : `${quoted.slice(0, -1).join(", ")} and ${quoted[quoted.length - 1]}`;
  if (present.length === 1) {
    const only = present[0] as EngineInstallation;
    return {
      engines,
      chosen: only.engine,
      reason:
        `${names} is the only engine CLI on PATH, so it is the engine the ` +
        "next session is offered. Install another and this becomes a choice.",
    };
  }
  return {
    engines,
    chosen: null,
    reason:
      present.length === 0
        ? "No engine CLI is on PATH, so nothing is chosen here. Install one, " +
          "or name the engine yourself at `session start`."
        : `${names} are on PATH, so which one runs a session is a choice ` +
          "rather than a default, and nothing is chosen for you.",
  };
}

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
  /**
   * The model this line says the CLI REFUSED, or null.
   *
   * A shape's own reading, because only the shape knows what its CLI's
   * refusal looks like -- and because for one of them the exit code does
   * not say. Measured on 2026-09-12: `claude --model <unknown>` prints
   *
   *   [claude-code:unrecognized_model] {"model":"<id>","query_source":"sdk"}
   *
   * on stderr, answers with an ordinary assistant message explaining the
   * problem, and EXITS 0 -- its `result` event even carries
   * `subtype: "success"` beside `is_error: true`. Every reading a caller
   * could take from status alone therefore says the run went fine.
   *
   * It is the marker and not the prose: the marker is the CLI's own
   * machine-readable statement and it names the model in its own JSON,
   * while the sentence beside it is English that a release may reword.
   */
  refusedModel(line: string): string | null;
  /**
   * What this line says actually ANSWERED, or null.
   *
   * Measured on Claude Code 2.1.269, 2026-09-12: the `result` event carries
   * `modelUsage`, keyed by the model that ran, each entry naming its
   * `canonicalModel`. Asking for the alias `haiku` came back keyed
   * `claude-haiku-4-5-20251001` with `canonicalModel: "claude-haiku-4-5"` --
   * which is a resolution and not a substitution, and is why the alias case
   * is handled here rather than discovered at a round.
   *
   * The Copilot seat has none: it writes the id it was given into its own
   * `events.jsonl`, which is an echo, and it reports no conversation id at
   * all -- so there is nothing to tie that file to the invocation this
   * process just made. The newest file on disk is the wrong one whenever two
   * sessions run, so the seat answers null and the record says the evidence
   * was not available, which is a different fact from agreement.
   */
  servedModel(line: string): ServedModel | null;
}

/** What answered, as the engine reported it. */
export interface ServedModel {
  /**
   * The id the engine says ran, or null where it named more than one.
   *
   * Null on a run that used several models -- a subagent adds a key to
   * `modelUsage` -- because "the model that ran" then has no single answer,
   * and picking one would be inventing an answer out of a tie. `named`
   * carries them all so a reader can see why.
   */
  readonly id: string | null;
  /** The undated canonical the engine resolved to, where it said one. */
  readonly canonical: string | null;
  /** Every id the engine named, in the order it named them. */
  readonly named: readonly string[];
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
        program: ENGINE_PROGRAM["claude-code"],
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
        refusedModel: claudeCodeRefusedModel,
        servedModel: claudeCodeServedModel,
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
        program: ENGINE_PROGRAM.copilot,
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
        // The seat needs no reading: an unknown `--model` is refused with
        // exit 1, before any billed call, and an exit code needs no
        // interpretation. A second mechanism for a fact the status already
        // states is a second place for it to be stated wrongly.
        refusedModel: () => null,
        // The seat reports no conversation id, so its own `events.jsonl`
        // cannot be tied to the invocation this process just made -- and the
        // newest file on disk is the wrong one whenever two sessions run. It
        // is an echo besides. Null, and the record says the evidence was not
        // available, which is not agreement.
        servedModel: () => null,
      };
    case "codex":
      // Measured on Codex 0.151.0 (`codex exec --help`): the prompt is
      // positional, `--json` prints events as JSONL, and a continuation is
      // `exec resume <thread>` -- the thread id `thread.started` reports,
      // rather than `resume --last`, which picks whatever ran most recently
      // in this directory and carries the same hazard `--continue` did.
      return {
        program: ENGINE_PROGRAM.codex,
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
        // Nothing has been measured here, and a guess at another CLI's
        // refusal is worse than none: a pattern that never fires reads as
        // proof there was no refusal.
        refusedModel: () => null,
        servedModel: () => null,
      };
    default:
      return `no built-in command for '${engine}'; pass --engine-argv`;
  }
}

// --- Rendering ---------------------------------------------------------------

/**
 * The escape sequences a terminal ACTS on: CSI (`ESC [ … final byte`) and
 * OSC (`ESC ] … BEL`, or `ESC \`).
 *
 * The final byte is optional in both, so an unterminated sequence goes too.
 * That is not defensiveness: a tool result arrives already cut to whatever
 * length the engine chose, so a dangling opener is a real input -- and a
 * colour opener with no reset is exactly what bleeds.
 */
// eslint-disable-next-line no-control-regex -- ESC is the byte being removed
const ESCAPE_SEQUENCE = /\x1b\[[0-?]*[ -/]*[@-~]?|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?/g;

/**
 * Engine-derived text with the terminal's own instructions taken out.
 *
 * Only CSI and OSC go. The words, the punctuation and any other control
 * character the engine chose to print stay: a renderer is showing what the
 * engine said, not editing it.
 */
export function stripEscapes(text: string): string {
  return text.replace(ESCAPE_SEQUENCE, "");
}

/**
 * One line of engine-derived text, as a renderer may speak it.
 *
 * It strips before it truncates, and that order is the whole fix: cutting
 * at a character count can take a colour's reset away while leaving its
 * opener, and session 61 showed what that does in a real terminal -- a
 * green checkmark at a line's end left every line after it green. Doing it
 * here rather than in each renderer means the terminal and the
 * `dabbler-drive` grammar's scopes both get clean text by construction,
 * instead of by each of them remembering.
 *
 * The Dabbler terminal's job-log passthrough is deliberately not this seam:
 * there the runners' colours arrive whole, resets included, which is the
 * point of a terminal.
 */
export function clip(text: unknown, limit: number): string {
  return stripEscapes(String(text ?? ""))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
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

/**
 * The marker Claude Code prints when it will not run on the model it was
 * given, and the id it carries.
 *
 * Exported so one statement of the shape serves the reading and its test.
 * The id is the marker's own JSON where it parses; where it does not, the
 * marker still fired and the refusal is still real, so the answer is the
 * sentinel rather than null -- reading "no model was named" as "no refusal
 * happened" is the failure this whole reading exists to stop.
 */
export const UNRECOGNIZED_MODEL_MARKER = "[claude-code:unrecognized_model]";

/** What a refusal that named no parsable model is recorded as. */
export const REFUSED_MODEL_UNNAMED = "(the model this call named)";

export function claudeCodeRefusedModel(line: string): string | null {
  const at = line.indexOf(UNRECOGNIZED_MODEL_MARKER);
  if (at < 0) return null;
  const json = parseJson(line.slice(at + UNRECOGNIZED_MODEL_MARKER.length).trim());
  const model = json?.["model"];
  return typeof model === "string" && model.trim() !== "" ? model.trim() : REFUSED_MODEL_UNNAMED;
}

/**
 * What Claude Code says ran, off the `result` event's `modelUsage`.
 *
 * Measured on 2026-09-12 against Claude Code 2.1.269: asking for `haiku`
 * came back keyed `claude-haiku-4-5-20251001` with `canonicalModel:
 * "claude-haiku-4-5"`. A refused model leaves `modelUsage` EMPTY, which is
 * why an empty one answers null rather than an id -- there is nothing there
 * to read as agreement.
 */
export function claudeCodeServedModel(line: string): ServedModel | null {
  const event = parseJson(line);
  if (event === null || event["type"] !== "result") return null;
  const usage = event["modelUsage"];
  if (typeof usage !== "object" || usage === null || Array.isArray(usage)) return null;
  const named = Object.keys(usage as Record<string, unknown>);
  if (named.length === 0) return null;
  // One key is one model. More than one is a run that used several -- a
  // subagent adds a key -- and "the model that ran" then has no single
  // answer; picking one would be inventing one out of a tie.
  const only = named.length === 1 ? (named[0] as string) : null;
  const entry = only === null ? null : (usage as Record<string, unknown>)[only];
  const canonical =
    entry !== null && typeof entry === "object" && !Array.isArray(entry)
      ? (entry as Record<string, unknown>)["canonicalModel"]
      : null;
  return {
    id: only,
    canonical: typeof canonical === "string" && canonical !== "" ? canonical : null,
    named,
  };
}

/**
 * The names an engine's CLI always accepts, whatever its catalog holds.
 *
 * The engine's own fact, so it lives with the engine's shape: it is both the
 * floor a pane offers where nothing can be enumerated and the reason an
 * alias resolving to a dated canonical id is not a substitution. Two copies
 * of "what does `claude` always take" is one copy too many.
 */
const ENGINE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  "claude-code": ["opus", "sonnet", "haiku"],
};

export function engineAliases(engine: string | null): readonly string[] {
  return engine === null ? [] : (ENGINE_ALIASES[engine] ?? []);
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
  /**
   * Seen on every line of BOTH streams.
   *
   * `onLine` is stdout's, because that is where a protocol lives. A CLI's
   * refusal of its own arguments does not: `claude` prints
   * `[claude-code:unrecognized_model]` on stderr and exits 0, so a watcher
   * that read stdout alone could not see the one line that says the run is
   * worthless.
   */
  readonly onAnyLine?: (line: string) => void;
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
        run.onAnyLine?.(line);
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
      // The CLI's refusal of its own `--model`, from whichever stream it
      // arrives on. First one wins, like the session id: a later line
      // repeating it must not move the answer onto a different model.
      let refusedModel: string | null = null;
      // What answered, off the engine's own closing statement. LAST wins
      // rather than first, unlike the session id: the result event comes at
      // the end and an invocation that somehow produced two has the later
      // one as its answer.
      let servedModel: ServedModel | null = null;
      const watch = (line: string): void => {
        if (sessionId === null) sessionId = shape.sessionId(line);
        servedModel = shape.servedModel(line) ?? servedModel;
      };
      const watchBoth = (line: string): void => {
        if (refusedModel === null) refusedModel = shape.refusedModel(line);
      };
      const reported = (outcome: EngineOutcome): EngineOutcome => ({
        ...outcome,
        sessionId,
        refusedModel,
        servedModel,
      });
      if (shape.input === "argv") {
        return runChild({
          child: spawned,
          invocation,
          render: shape.render,
          interrupt: terminateTree,
          onLine: watch,
          onAnyLine: watchBoth,
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
        onAnyLine: watchBoth,
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
