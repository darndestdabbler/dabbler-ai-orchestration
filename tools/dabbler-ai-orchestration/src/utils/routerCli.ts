// Set 122 Session 2: the ONE way the extension runs a router CLI that
// mutates the workspace, and the surface that shows the developer what it
// ran.
//
// Two rules from the multi-module verdict drive everything here.
//
// 1. **Transactional mutation goes through Python** (verdict §8.3). The
//    module lifecycle used to be implemented twice — once in
//    `utils/moduleAuthoring.ts` and once in `ai_router/modules.py` — and the
//    TypeScript half wrote `session-state.json` directly, which only the
//    router's sanctioned writers may do. Session 1 shipped the Python side;
//    this module is how the extension reaches it, so the TypeScript half
//    could be deleted rather than left to drift.
//
// 2. **Dabbler runs the command it derived, and shows it.** The operator's
//    words (2026-08-11): *"echoed… so developers know what commands are
//    being executed"*. Transparency here means SHOWING the command, not
//    delegating it to a human or an LLM — the git-transparency proposal is
//    explicit that "if Dabbler can derive the command, Dabbler itself
//    should run it". So every run appends a copyable, hand-runnable command
//    line to an output channel BEFORE the process starts, and the result
//    after it finishes. A developer who wants to run it themselves copies
//    what they just saw and gets the same result.
//
// The interpreter is resolved with `resolvePythonInterpreter`, NEVER a bare
// `python`: a bare `python` on PATH is the documented cause of the
// "No module named ai_router" mis-diagnosis that `pythonInterpreter.ts`
// exists to prevent.

import * as vscode from "vscode";
import * as cp from "child_process";
import {
  resolvePythonInterpreter,
  interpreterResolves,
  describeMissingPython,
} from "./pythonInterpreter";
import { makeUtf8ChunkDecoder } from "./utf8ChunkDecoder";
import {
  isAiRouterNotInstalled,
  describeAiRouterImportFailure,
} from "./aiRouterInstall";

/** The output channel name, shared by every router CLI the extension runs. */
export const ROUTER_OUTPUT_CHANNEL = "Dabbler Commands";

/**
 * How a run ended, as a single discriminator the callers branch on.
 *
 * `refused` and `writeFailed` are the CLI's own exit codes 3 and 4 — they
 * are contract, not inference, and they mean materially different things:
 * a refusal guarantees the workspace is byte-identical to before the call,
 * while a write failure means the apply phase stopped (create/rename roll
 * back; delete stays declared and is re-runnable).
 *
 * `unavailable` is the one outcome that is NOT the CLI's verdict: the
 * interpreter or the router itself could not be reached, so nothing ran.
 * It is kept distinct from `failed` because the remedy is completely
 * different — install/point at an interpreter, rather than read an error.
 */
export type RouterCliOutcome =
  | "ok"
  | "refused"
  | "writeFailed"
  | "unavailable"
  | "failed";

export interface RouterCliResult {
  outcome: RouterCliOutcome;
  /** True only for `outcome === "ok"`. */
  ok: boolean;
  /** The process exit code, or null when the process never started. */
  exitCode: number | null;
  /** An operator-facing single-line explanation. Always non-empty. */
  message: string;
  /** The exact command line that was echoed and run. */
  commandLine: string;
  /** Parsed `--json` stdout, when the CLI produced a JSON object. */
  payload?: Record<string, unknown>;
  raw: { stdout: string; stderr: string };
}

/**
 * The parts of a router CLI invocation, kept separate from the interpreter
 * so the echoed line and the spawned argv are built from ONE source. A
 * command line that is assembled twice is a command line that eventually
 * shows the developer something other than what ran.
 */
export interface RouterCliInvocation {
  /** e.g. `ai_router.modules`. */
  module: string;
  /** Arguments after the module, already in argv form (never shell-joined). */
  args: string[];
  /** Working directory for the spawn — normally the repo root. */
  cwd: string;
  /** What the operator is doing, for the missing-interpreter message. */
  actionLabel: string;
}

/**
 * Quote one argv element for DISPLAY in a PowerShell-compatible way.
 *
 * The spawn itself is argv-based and shell-free, so nothing here is ever
 * fed back to a shell by the extension. It exists so the echoed line is one
 * a developer can paste into *their* terminal and have it run the same
 * command — which is the entire point of echoing it.
 *
 * PowerShell is the target because that is the shell the extension's own
 * docs, its scaffold and this repo all use on Windows, and because it is
 * the strictest of the plausible targets:
 *
 *  - It uses the BACKTICK as its escape character inside double quotes, not
 *    the backslash. Escaping `"` as `\"` — the POSIX habit — produces a
 *    string PowerShell mis-parses, and a Windows path ends in a backslash
 *    often enough that `"C:\dir\"` would swallow the closing quote.
 *  - `$` interpolates inside double quotes, so it must be escaped too.
 *
 * Single quotes would sidestep interpolation but not the embedded-quote
 * problem, and they are not portable to `cmd.exe`. Double quotes with
 * backtick escapes are correct in PowerShell and readable everywhere else.
 */
export function quoteForDisplay(arg: string): string {
  if (arg === "") return '""';
  if (!/[\s"'`$&|<>()^;,{}[\]@#]/.test(arg)) return arg;
  return `"${arg.replace(/(["`$])/g, "`$1")}"`;
}

/**
 * The exact line shown to the developer — bare, and runnable as-is.
 *
 * Two things are load-bearing.
 *
 * **The interpreter is its resolved absolute path**, not a friendly
 * `python`. The whole failure class this replaces is a developer running
 * `python -m ai_router.…` against a DIFFERENT interpreter than the
 * extension used and getting a different answer.
 *
 * **A quoted executable path is prefixed with PowerShell's call operator
 * `&`.** PowerShell parses a leading quoted token as a *string expression*,
 * not a command, so `"C:\...\python.exe" -m ai_router.modules` echoes the
 * path and runs nothing. `&` is what makes the pasted line actually
 * execute, and paths with spaces are the common case on Windows
 * (`C:\Program Files\…`, or any user folder with a space in it).
 */
export function buildCommandLine(
  pythonPath: string,
  invocation: Pick<RouterCliInvocation, "module" | "args">,
): string {
  const exe = quoteForDisplay(pythonPath);
  const parts = [exe, "-m", invocation.module, ...invocation.args.map(quoteForDisplay)];
  return (exe.startsWith('"') ? "& " : "") + parts.join(" ");
}

/** The argv actually spawned. Shares its inputs with {@link buildCommandLine}. */
export function buildArgv(
  invocation: Pick<RouterCliInvocation, "module" | "args">,
): string[] {
  return ["-m", invocation.module, ...invocation.args];
}

/**
 * The echo surface. Injectable so the Layer-2 suite can assert WHAT is
 * echoed and WHEN without a VS Code window.
 */
export interface RouterCliEcho {
  /** Append one line. */
  append(line: string): void;
  /** Bring the surface into view (called once per run, before spawning). */
  reveal(): void;
}

let sharedChannel: vscode.OutputChannel | undefined;

/**
 * The shared output channel, created lazily and reused.
 *
 * One channel for every command, not one per command: the developer's
 * question is "what has Dabbler been running?", and the answer is a single
 * chronological log they can scroll.
 */
export function routerOutputChannel(): vscode.OutputChannel {
  if (!sharedChannel) {
    sharedChannel = vscode.window.createOutputChannel(ROUTER_OUTPUT_CHANNEL);
  }
  return sharedChannel;
}

function defaultEcho(): RouterCliEcho {
  const channel = routerOutputChannel();
  return {
    append: (line) => channel.appendLine(line),
    // `preserveFocus: true` — showing the developer the command must never
    // steal focus from the editor mid-flow. They asked to see it, not to be
    // taken to it.
    reveal: () => channel.show(true),
  };
}

export interface RunRouterCliDeps {
  echo?: RouterCliEcho;
  /** Injectable spawn (Layer-2 tests drive the real code path, no subprocess). */
  spawn?: typeof cp.spawn;
  /** Injectable interpreter resolution. */
  resolveInterpreter?: (cwd: string) => string;
  /** Injectable pre-spawn interpreter existence check. */
  interpreterExists?: (pythonPath: string) => boolean;
}

/**
 * Run a router CLI, echoing the exact command first, and classify the
 * result by the CLI's own exit-code contract.
 *
 * Never rejects: every failure path resolves as a `RouterCliResult`, so a
 * caller can report uniformly instead of wrapping each call in try/catch.
 * That matters because these are UI entry points — an unhandled rejection
 * inside a command handler surfaces to the developer as an unhelpful
 * "command failed" toast with none of the CLI's own explanation.
 */
export function runRouterCli(
  invocation: RouterCliInvocation,
  deps: RunRouterCliDeps = {},
): Promise<RouterCliResult> {
  const resolveInterpreter = deps.resolveInterpreter ?? resolvePythonInterpreter;
  const interpreterExists =
    deps.interpreterExists ?? ((p: string) => interpreterResolves(p));
  const spawn = deps.spawn ?? cp.spawn;
  const echo = deps.echo ?? defaultEcho();

  const pythonPath = resolveInterpreter(invocation.cwd);
  const commandLine = buildCommandLine(pythonPath, invocation);

  // Echoed BEFORE anything else can fail, so the developer sees the command
  // even when it is the command itself that could not start. A line that is
  // only printed on success is not transparency.
  //
  // The command occupies a line of its OWN, with no prompt glyph, no
  // indent and nothing else on it: the point of echoing is that a developer
  // can select the line and run it, and a decorative `> ` prefix makes the
  // copied text a shell redirection rather than the command. The label goes
  // on the line above, where it costs nothing.
  echo.reveal();
  echo.append(`[${new Date().toLocaleTimeString()}] Running:`);
  echo.append(commandLine);

  const settleUnavailable = (message: string): RouterCliResult => {
    echo.append(`  ${message}`);
    return {
      outcome: "unavailable",
      ok: false,
      exitCode: null,
      message,
      commandLine,
      raw: { stdout: "", stderr: "" },
    };
  };

  if (!interpreterExists(pythonPath)) {
    return Promise.resolve(
      settleUnavailable(describeMissingPython(invocation.actionLabel)),
    );
  }

  return new Promise<RouterCliResult>((resolve) => {
    let settled = false;
    const settle = (result: RouterCliResult): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    let child: cp.ChildProcess;
    try {
      child = spawn(pythonPath, buildArgv(invocation), {
        cwd: invocation.cwd,
        windowsHide: true,
      });
    } catch (err) {
      settle(
        settleUnavailable(
          `could not spawn ${pythonPath}: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
      return;
    }

    let stdout = "";
    let stderr = "";
    // Streaming-safe decode: a chunk boundary can split a multibyte UTF-8
    // sequence, and the router's output is not guaranteed ASCII (module
    // titles are operator-authored). L-079-1 is the standing bug class.
    const outDec = makeUtf8ChunkDecoder();
    const errDec = makeUtf8ChunkDecoder();
    child.stdout?.on("data", (c: Buffer) => (stdout += outDec.write(c)));
    child.stderr?.on("data", (c: Buffer) => (stderr += errDec.write(c)));

    child.on("error", (err: Error) => {
      settle(settleUnavailable(`could not spawn ${pythonPath}: ${err.message}`));
    });

    child.on("close", (code: number | null) => {
      if (settled) return;
      stdout += outDec.end();
      stderr += errDec.end();

      for (const line of `${stdout}${stderr}`.split(/\r?\n/)) {
        if (line.trim() !== "") echo.append(`  ${line}`);
      }

      if (isAiRouterNotInstalled(stderr)) {
        settle({
          outcome: "unavailable",
          ok: false,
          exitCode: code,
          message: describeAiRouterImportFailure(pythonPath),
          commandLine,
          raw: { stdout, stderr },
        });
        return;
      }

      const payload = parseJsonPayload(stdout);
      settle({
        ...classify(code, payload, stdout, stderr),
        commandLine,
        payload,
        raw: { stdout, stderr },
      });
    });
  });
}

/**
 * Parse the CLI's `--json` stdout.
 *
 * Tolerant on purpose: `python -m` can emit a `RuntimeWarning` banner ahead
 * of real output on some interpreters, so the object is located rather than
 * assumed to start at byte 0. A payload that cannot be parsed is not an
 * error by itself — the exit code is the contract, and the payload only
 * enriches the message.
 */
export function parseJsonPayload(
  stdout: string,
): Record<string, unknown> | undefined {
  const text = (stdout || "").trim();
  if (!text) return undefined;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function firstString(
  payload: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = payload?.[key];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/**
 * Map an exit code onto an outcome.
 *
 * The mapping is the CLI's published contract (`ai_router.modules` and
 * `ai_router.session_lifecycle` share it deliberately): 0 ok, 3 refused
 * with nothing written, 4 write failure. Anything else — including the
 * argparse usage code 2 — is an unclassified failure, reported with
 * whatever the process said rather than a guess.
 */
export function classify(
  code: number | null,
  payload: Record<string, unknown> | undefined,
  stdout: string,
  stderr: string,
): Pick<RouterCliResult, "outcome" | "ok" | "exitCode" | "message"> {
  const fallback = (stderr.trim() || stdout.trim() || `exit ${code}`).slice(
    0,
    600,
  );
  if (code === 0) {
    return { outcome: "ok", ok: true, exitCode: code, message: stdout.trim() };
  }
  if (code === 3) {
    return {
      outcome: "refused",
      ok: false,
      exitCode: code,
      message: firstString(payload, "refused") ?? fallback,
    };
  }
  if (code === 4) {
    return {
      outcome: "writeFailed",
      ok: false,
      exitCode: code,
      message: firstString(payload, "writeFailed") ?? fallback,
    };
  }
  return { outcome: "failed", ok: false, exitCode: code, message: fallback };
}
