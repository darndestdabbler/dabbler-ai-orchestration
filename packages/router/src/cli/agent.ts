// `dabbler agent prompt` -- one turn against an agent over its own protocol.
//
// The one user of `acp.ts`, and a measuring instrument rather than a
// lifecycle verb: it opens a conversation (fresh, or resumed by id), sends
// the one prompt, prints every event the agent produces as one JSON line
// on stdout as it arrives, prints the turn's outcome last, and closes. No
// phase, gate or record reads it. What a person learns from running it is
// what the next block adopts.
//
// The permission policy is on the command line and defaults to `deny`,
// because a tool the framework did not decide to allow does not run;
// `--permissions allow` is the stated decision that it may, once per
// request, for this turn.

import {
  COPILOT_ACP,
  type AgentClient,
  type AgentConnection,
  type AgentEvent,
  type PermissionPolicy,
  acpAgent,
  claudeCodeAgent,
} from "../acp.ts";
import { writeErr, writeOut } from "./output.ts";

const EXIT_USAGE = 2;
const EXIT_FAILED = 1;

const ENGINES = ["copilot", "claude-code"] as const;
type AgentEngine = (typeof ENGINES)[number];

function usage(): string {
  return [
    "usage: dabbler agent [-h] {prompt} ...",
    "",
    "one turn against an agent over its own protocol",
    "",
    "positional arguments:",
    "  {prompt}",
    "    prompt    open a conversation, send one prompt, print its events, close",
    "",
    "options:",
    "  -h, --help  show this help message and exit",
    "",
  ].join("\n");
}

function promptUsage(): string {
  return [
    "usage: dabbler agent prompt [-h] [--engine {copilot,claude-code}] [--model MODEL]",
    "                            [--resume SESSION_ID] [--cwd DIR]",
    "                            [--permissions {allow,deny}] [--cancel-after SECONDS]",
    "                            [--program PATH] [--arg ARG]... TEXT",
    "",
    "Open a conversation with the agent and print what it negotiated as one",
    '{"kind":"open"} JSON line; send TEXT as one prompt and print every event as one',
    "JSON line on stdout as it arrives; print the turn's outcome as a final",
    '{"kind":"turn"} line; close. On a resume, whatever the agent replays comes',
    "before the turn, each event marked replayed.",
    "",
    "options:",
    "  -h, --help            show this help message and exit",
    "  --engine {copilot,claude-code}",
    "                        which agent: the Copilot CLI over the Agent Client",
    "                        Protocol (`copilot --acp`), or Claude Code over its",
    "                        stream-json conversation (default: copilot)",
    "  --model MODEL         the model the agent should use",
    "  --resume SESSION_ID   continue the conversation with this id, as the agent",
    "                        reported it; never the most recent one",
    "  --cwd DIR             the directory the agent works in (default: here)",
    "  --permissions {allow,deny}",
    "                        what the client answers when the agent asks whether a",
    "                        tool may run: allow it once, or deny it (default: deny)",
    "  --cancel-after SECONDS",
    "                        cancel the turn this long after the prompt is sent",
    "  --program PATH        stands in for the agent's program, for a scripted peer",
    "  --arg ARG             an argument placed before the agent's own; repeatable",
    "",
  ].join("\n");
}

interface PromptArgs {
  engine: AgentEngine;
  model: string | null;
  resume: string | null;
  cwd: string;
  permissions: PermissionPolicy;
  cancelAfterSeconds: number | null;
  program: string | null;
  leadingArgs: string[];
  text: string | null;
}

function missing(flag: string): number {
  writeErr(`${promptUsage()}\ndabbler agent prompt: error: argument ${flag}: expected one argument\n`);
  return EXIT_USAGE;
}

function invalid(flag: string, value: string, choices: readonly string[]): number {
  writeErr(
    `${promptUsage()}\ndabbler agent prompt: error: argument ${flag}: invalid choice: '${value}' ` +
      `(choose from ${choices.map((choice) => `'${choice}'`).join(", ")})\n`,
  );
  return EXIT_USAGE;
}

function parsePrompt(rest: string[]): PromptArgs | number {
  const args: PromptArgs = {
    engine: "copilot",
    model: null,
    resume: null,
    cwd: process.cwd(),
    permissions: "deny",
    cancelAfterSeconds: null,
    program: null,
    leadingArgs: [],
    text: null,
  };
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index]!;
    const value = (): string | undefined => rest[++index];
    if (argument === "-h" || argument === "--help") {
      writeOut(promptUsage());
      return 0;
    } else if (argument === "--engine") {
      const engine = value();
      if (engine === undefined) return missing(argument);
      if (!(ENGINES as readonly string[]).includes(engine)) return invalid(argument, engine, ENGINES);
      args.engine = engine as AgentEngine;
    } else if (argument === "--model") {
      const model = value();
      if (model === undefined) return missing(argument);
      args.model = model;
    } else if (argument === "--resume") {
      const resume = value();
      if (resume === undefined) return missing(argument);
      args.resume = resume;
    } else if (argument === "--cwd") {
      const cwd = value();
      if (cwd === undefined) return missing(argument);
      args.cwd = cwd;
    } else if (argument === "--permissions") {
      const permissions = value();
      if (permissions === undefined) return missing(argument);
      if (permissions !== "allow" && permissions !== "deny") {
        return invalid(argument, permissions, ["allow", "deny"]);
      }
      args.permissions = permissions;
    } else if (argument === "--cancel-after") {
      const seconds = value();
      if (seconds === undefined) return missing(argument);
      const parsed = Number(seconds);
      if (!Number.isFinite(parsed) || parsed < 0) {
        writeErr(
          `${promptUsage()}\ndabbler agent prompt: error: argument --cancel-after: ` +
            `invalid float value: '${seconds}'\n`,
        );
        return EXIT_USAGE;
      }
      args.cancelAfterSeconds = parsed;
    } else if (argument === "--program") {
      const program = value();
      if (program === undefined) return missing(argument);
      args.program = program;
    } else if (argument === "--arg") {
      const leading = value();
      if (leading === undefined) return missing(argument);
      args.leadingArgs.push(leading);
    } else if (argument.startsWith("-") && args.text === null) {
      writeErr(`${promptUsage()}\ndabbler agent prompt: error: unrecognized arguments: ${argument}\n`);
      return EXIT_USAGE;
    } else if (args.text === null) {
      args.text = argument;
    } else {
      writeErr(`${promptUsage()}\ndabbler agent prompt: error: unrecognized arguments: ${argument}\n`);
      return EXIT_USAGE;
    }
  }
  if (args.text === null) {
    writeErr(`${promptUsage()}\ndabbler agent prompt: error: the following arguments are required: TEXT\n`);
    return EXIT_USAGE;
  }
  return args;
}

/** The client `--engine` names, with the stand-in the test passes. */
function clientFor(args: PromptArgs): AgentClient {
  const standIn = {
    ...(args.program !== null ? { program: args.program } : {}),
    leadingArgs: args.leadingArgs,
  };
  return args.engine === "claude-code" ? claudeCodeAgent(standIn) : acpAgent(COPILOT_ACP, standIn);
}

function line(record: Record<string, unknown>): void {
  writeOut(`${JSON.stringify(record)}\n`);
}

function eventLine(event: AgentEvent, replayed: boolean): void {
  line(replayed ? { ...event, replayed: true } : { ...event });
}

export async function agentVerb(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (command === undefined || command === "-h" || command === "--help") {
    if (command === undefined) {
      writeErr(`${usage()}\ndabbler agent: error: the following arguments are required: command\n`);
      return EXIT_USAGE;
    }
    writeOut(usage());
    return 0;
  }
  if (command !== "prompt") {
    writeErr(
      `${usage()}\ndabbler agent: error: argument command: invalid choice: '${command}' (choose from 'prompt')\n`,
    );
    return EXIT_USAGE;
  }
  const parsed = parsePrompt(rest);
  if (typeof parsed === "number") return parsed;

  let connection: AgentConnection;
  try {
    connection = await clientFor(parsed).open({
      cwd: parsed.cwd,
      model: parsed.model,
      resumeId: parsed.resume,
      permissions: parsed.permissions,
    });
  } catch (error: unknown) {
    writeErr(`agent: ${error instanceof Error ? error.message : String(error)}\n`);
    return EXIT_FAILED;
  }
  // What was negotiated, before anything the agent does with it: the
  // handshake's reply and the reply to opening the conversation, as the
  // agent gave them.
  line({
    kind: "open",
    sessionId: connection.sessionId,
    resumed: parsed.resume !== null,
    capabilities: connection.capabilities,
    session: connection.session,
  });
  for (const event of connection.history) eventLine(event, true);

  let cancelTimer: NodeJS.Timeout | null = null;
  try {
    const turn = connection.prompt(parsed.text as string, (event) => eventLine(event, false));
    if (parsed.cancelAfterSeconds !== null) {
      cancelTimer = setTimeout(() => connection.cancel(), parsed.cancelAfterSeconds * 1000);
    }
    const outcome = await turn;
    line({
      kind: "turn",
      sessionId: connection.sessionId,
      stopReason: outcome.stopReason,
      cancelled: outcome.cancelled,
      usage: outcome.usage,
    });
    writeErr(
      `agent: ${parsed.engine} conversation ${connection.sessionId} -- ` +
        `${outcome.cancelled ? "cancelled" : "ended"} (${outcome.stopReason})\n`,
    );
    return 0;
  } catch (error: unknown) {
    writeErr(`agent: ${error instanceof Error ? error.message : String(error)}\n`);
    return EXIT_FAILED;
  } finally {
    if (cancelTimer !== null) clearTimeout(cancelTimer);
    await connection.close();
  }
}
