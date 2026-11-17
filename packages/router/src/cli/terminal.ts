// `dabbler terminal` -- the Dabbler Terminal's lines at a bare prompt.
//
// The same lines the VS Code extension's terminal shows, from the same
// class: what a run's records say, laid out at a width and painted in a
// theme. It reads files and prints; it dispatches nothing and bills nothing.
// Without `--follow` it looks once and exits, which is what a person asking
// "where is this session" wants; with it, it keeps looking until interrupted.

import { repoRootFor, resolveSessionsDir, SessionsRootNotFoundError } from "../evidence.ts";
import type { ThemeKind } from "../transcript.ts";
import { TerminalLines } from "../views/terminalLines.ts";
import { writeErr, writeOut } from "./output.ts";

const EXIT_OK = 0;
const EXIT_USAGE = 2;

function usage(): string {
  return [
    "usage: dabbler terminal [-h] [--follow] [--json] [--width N] [--theme light|dark]",
    "                        [--sessions-dir SESSIONS_DIR]",
    "",
    "  Print the lines of the run in flight, or of the last one, as the",
    "  Dabbler Terminal shows them, and exit. Reads records; spends nothing.",
    "",
    "options:",
    "  --follow                 keep printing as the run goes on, until interrupted",
    "  --json                   one JSON object per line in place of coloured text: each",
    "                           line's event, fields and toned text, a job's output, and",
    "                           the notices (a session paused, an instruction overdue)",
    "  --width N                lay the lines out N columns wide; this terminal's width when absent",
    "  --theme light|dark       the palette the lines are painted in; dark when absent",
    "  --sessions-dir PATH      the sessions root; derived from the cwd when absent",
    "  -h, --help               show this message",
    "",
  ].join("\n");
}

interface Parsed {
  readonly follow: boolean;
  readonly json: boolean;
  readonly width: number | undefined;
  readonly theme: ThemeKind;
  readonly sessionsDir: string | undefined;
}

/** The arguments, or the one sentence saying why they are not arguments. */
export function parseTerminalArgs(argv: readonly string[]): Parsed | string {
  let follow = false;
  let json = false;
  let width: number | undefined;
  let theme: ThemeKind = "dark";
  let sessionsDir: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const value = argv[index + 1];
    if (token === "--follow") {
      follow = true;
      continue;
    }
    if (token === "--json") {
      json = true;
      continue;
    }
    if (token === "--width") {
      const parsed = Number(value);
      if (value === undefined || !Number.isInteger(parsed) || parsed < 1) return "--width takes a number of columns";
      width = parsed;
      index += 1;
      continue;
    }
    if (token === "--theme") {
      if (value !== "light" && value !== "dark") return "--theme takes light or dark";
      theme = value;
      index += 1;
      continue;
    }
    if (token === "--sessions-dir") {
      if (value === undefined) return "--sessions-dir takes a path";
      sessionsDir = value;
      index += 1;
      continue;
    }
    return `unrecognized arguments: ${token}`;
  }
  return { follow, json, width, theme, sessionsDir };
}

export function terminalVerb(argv: string[]): Promise<number> {
  if (argv.includes("-h") || argv.includes("--help")) {
    writeOut(usage());
    return Promise.resolve(EXIT_OK);
  }
  const parsed = parseTerminalArgs(argv);
  if (typeof parsed === "string") {
    writeErr(`${usage()}dabbler terminal: ${parsed}\n`);
    return Promise.resolve(EXIT_USAGE);
  }

  let sessionsDir: string;
  let root: string | null;
  try {
    sessionsDir = resolveSessionsDir(parsed.sessionsDir);
    root = repoRootFor(sessionsDir);
  } catch (error) {
    if (!(error instanceof SessionsRootNotFoundError)) throw error;
    writeErr(`terminal: ${error.message}\n`);
    return Promise.resolve(EXIT_USAGE);
  }
  if (root === null) {
    writeErr("terminal: not inside a git repository\n");
    return Promise.resolve(EXIT_USAGE);
  }

  const stdout = process.stdout;
  let wrote = false;
  const lines = new TerminalLines({
    repoRoot: root,
    sessionsDir,
    write: (text) => {
      wrote = true;
      writeOut(text);
    },
    columns: parsed.width ?? stdout.columns ?? null,
    theme: parsed.theme,
    format: parsed.json ? "json" : "text",
    // A frame is erased by the next write, which only a terminal can do; a
    // look that exits has no next write at all.
    indicator: parsed.follow && stdout.isTTY === true,
  });

  if (!parsed.follow) {
    lines.poll();
    lines.dispose();
    // Said in prose only to a person: an empty stream is the JSON answer.
    if (!wrote && !parsed.json) writeOut("terminal: no session is registered and no run is recorded here.\n");
    return Promise.resolve(EXIT_OK);
  }

  // A width the person named is kept; otherwise the lines follow the
  // terminal's own as it is resized.
  const resized = (): void => {
    if (stdout.columns) lines.setColumns(stdout.columns);
  };
  if (parsed.width === undefined) stdout.on("resize", resized);
  lines.start();
  return new Promise((resolve) => {
    // The timers are unref'd, so this interval is what keeps the process
    // alive between looks; Ctrl+C ends it.
    const alive = setInterval(() => undefined, 60_000);
    process.once("SIGINT", () => {
      clearInterval(alive);
      stdout.off("resize", resized);
      lines.dispose();
      if (!parsed.json) writeOut("\n");
      resolve(EXIT_OK);
    });
  });
}
