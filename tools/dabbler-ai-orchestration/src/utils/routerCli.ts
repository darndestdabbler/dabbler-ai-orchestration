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
import type { RouterOutcome } from "dabbler-ai-router";
import { outcomeForExitCode } from "dabbler-ai-router";
import {
  resolvePythonInterpreter,
  interpreterResolves,
  describeMissingPython,
} from "./pythonInterpreter";
import { makeUtf8ChunkDecoder } from "./utf8ChunkDecoder";

/**
 * True when *stderr* says the interpreter cannot import ai_router — an
 * installation problem, not a CLI verdict. Covers the plain
 * ModuleNotFoundError, `python -m`'s module-specification wrapper, and
 * the namespace-shadow case (a config-only `ai_router/` folder in the
 * cwd with no installed package), anchored to a submodule path so it
 * does not match unrelated modules.
 */
export function isAiRouterNotInstalled(stderr: string): boolean {
  if (!stderr) return false;
  if (/ModuleNotFoundError:\s*No module named ['"]ai_router['"]/.test(stderr)) return true;
  if (
    /Error while finding module specification for ['"]ai_router\./.test(stderr) &&
    /No module named ['"]ai_router['"]/.test(stderr)
  ) {
    return true;
  }
  if (/No module named ['"]?ai_router\.[\w.]+['"]?/.test(stderr)) return true;
  return false;
}

export function describeAiRouterImportFailure(
  pythonPath: string,
  hint?: string,
): string {
  const venvHint =
    process.platform === "win32"
      ? ".venv\\Scripts\\python.exe"
      : ".venv/bin/python";
  return (
    `ai_router could not be imported by the interpreter '${pythonPath}'. ` +
    `This is an interpreter / installation problem — NOT missing API keys. ` +
    `Point the 'dabblerSessionSets.pythonPath' setting at your workspace ` +
    `venv (e.g. ${venvHint}), or install the router into that interpreter: ` +
    `${pythonPath} -m pip install dabbler-ai-router.` +
    (hint ? ` (${hint})` : "")
  );
}

/** The output channel name, shared by every router CLI the extension runs. */
export const ROUTER_OUTPUT_CHANNEL = "Dabbler Commands";

/**
 * How a run ended, as a single discriminator the callers branch on.
 *
 * The four the router itself can mean are `RouterOutcome`, from the
 * contract, and they are not restated here: `refused` and `writeFailed`
 * are exit codes 3 and 4, they are contract rather than inference, and
 * they mean materially different things — a refusal guarantees the
 * workspace is byte-identical to before the call, while a write failure
 * means the apply phase stopped (create/rename roll back; delete stays
 * declared and is re-runnable).
 *
 * `unavailable` is the one this module adds, and the one that is NOT the
 * router's verdict: the interpreter or the router itself could not be
 * reached, so nothing ran. It is kept distinct from `failed` because the
 * remedy is completely different — install or point at an interpreter,
 * rather than read an error.
 */
export type RouterCliOutcome = RouterOutcome | "unavailable";

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
  /**
   * Kill the process after this many milliseconds and settle as
   * `unavailable`, or run unbounded when omitted.
   *
   * Unbounded is right for a command the operator asked for and is
   * watching: a close that runs its gates for a minute has not failed,
   * and killing it would be this module deciding how long the router may
   * take. It is wrong for a poll nobody asked for — the projection runs
   * every thirty seconds behind a tree that awaits it, so one wedged
   * interpreter would hang the whole view with no rows and no message.
   */
  timeoutMs?: number;
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
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = (result: RouterCliResult): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
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

    // A process that outlived its budget produced no verdict, so it
    // settles as `unavailable` — nothing ran, in the sense that matters —
    // rather than as a refusal it never made.
    if (invocation.timeoutMs !== undefined) {
      timer = setTimeout(() => {
        child.kill();
        settle(
          settleUnavailable(
            `${invocation.actionLabel} did not answer within ` +
              `${Math.round(invocation.timeoutMs! / 1000)}s and was stopped.`,
          ),
        );
      }, invocation.timeoutMs);
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
 * Map an exit code onto an outcome, and take the message off whichever
 * stream carried one.
 *
 * The mapping itself is the router's published contract — every verb
 * shares it — and the contract states it once, in `outcomeForExitCode`.
 * This function is where a PROCESS becomes that vocabulary: the code
 * decides the outcome, and the payload, stdout and stderr decide what
 * the operator is told. `PythonSpawnRouter` is the one caller that has
 * to agree with both.
 */
export function classify(
  code: number | null,
  payload: Record<string, unknown> | undefined,
  stdout: string,
  stderr: string,
): Pick<RouterCliResult, "outcome" | "ok" | "exitCode" | "message"> {
  const outcome = outcomeForExitCode(code);
  if (outcome === "ok") {
    return { outcome, ok: true, exitCode: code, message: stdout.trim() };
  }
  // A refusal and a failed write each name themselves in `--json` output
  // when the verb emits any; an unclassified failure has no such key, so
  // it always falls back. The fallback is whichever stream carried text,
  // truncated so an operator-facing toast stays readable.
  const named =
    outcome === "failed" ? undefined : firstString(payload, outcome);
  const fallback = (stderr.trim() || stdout.trim() || `exit ${code}`).slice(0, 600);
  return { outcome, ok: false, exitCode: code, message: named ?? fallback };
}
