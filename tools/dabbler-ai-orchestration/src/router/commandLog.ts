// What Dabbler has been running, where the developer can read it.
//
// The operator's standing requirement (2026-08-11) is that commands are
// "echoed… so developers know what commands are being executed", and the
// git-transparency proposal is explicit that "if Dabbler can derive the
// command, Dabbler itself should run it". Transparency here means SHOWING
// the command, not delegating it to a person.
//
// When the router was a subprocess this channel showed the argv that was
// spawned. It is not one any more -- the verb runs in this process -- so
// what is shown is the line an operator could type to run the same verb
// themselves: `dabbler session cancel 4 --reason "..."`. That line is real
// and runnable, because `terminalShim` puts `dabbler` on the integrated
// terminal's PATH, and because the extension and the terminal reach one
// implementation.
//
// The command occupies a line of its OWN, with no prompt glyph, no indent
// and nothing else on it: the point of echoing is that a developer can
// select the line and run it, and a decorative `> ` prefix would make the
// copied text a shell redirection rather than a command. The label goes on
// the line above, where it costs nothing.

import * as vscode from "vscode";
import type { RouterEcho } from "dabbler-ai-router";

/** The output channel name, shared by every verb the extension runs. */
export const ROUTER_OUTPUT_CHANNEL = "Dabbler Commands";

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

/** The surface, injectable so the suite can assert WHAT is written. */
export interface CommandLogSurface {
  append(line: string): void;
  /** Bring the surface into view, once per run, before the verb starts. */
  reveal(): void;
}

const channelSurface: CommandLogSurface = {
  append: (line) => routerOutputChannel().appendLine(line),
  // `preserveFocus: true` -- showing the developer the command must never
  // steal focus from the editor mid-flow. They asked to see it, not to be
  // taken to it.
  reveal: () => routerOutputChannel().show(true),
};

/**
 * The router's echo, over a log surface.
 *
 * The line is written BEFORE the verb runs, so the developer sees it even
 * when it is the verb itself that fails. A line only printed on success is
 * not transparency.
 *
 * The default surface reaches the channel through `routerOutputChannel`
 * per call rather than holding one: this is constructed while the module
 * loads, and creating a window's output channel then would make the
 * router's existence depend on the window's.
 */
export function commandLog(
  surface: CommandLogSurface = channelSurface,
  now: () => string = () => new Date().toLocaleTimeString(),
): RouterEcho {
  return {
    running(commandLine: string): void {
      surface.reveal();
      surface.append(`[${now()}] Running:`);
      surface.append(commandLine);
    },
    wrote(output: string): void {
      for (const line of output.split(/\r?\n/)) {
        if (line.trim() !== "") surface.append(`  ${line}`);
      }
    },
  };
}
