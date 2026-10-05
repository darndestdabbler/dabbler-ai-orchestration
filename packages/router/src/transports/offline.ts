// Scripted, no-network transport: the framework without a vendor.
//
// The framework's own model calls are the only thing in it that needs an
// API key, and needing one to develop the framework is a poor trade -- a
// live model also cannot be asked to produce a specific awkward response on
// demand, which is exactly what testing the verification loop requires.
//
// This transport serves responses from a directory of files instead. They
// are consumed in lexical order, one per dispatch, with the cursor kept on
// disk because every CLI verb is a separate process. Exhausting the queue is
// an error rather than a silent replay: a round 2 that quietly re-serves
// round 1's response would make the record claim something that did not
// happen.
//
// Nothing here pretends to be a provider. The provider is `offline`, the
// served model id names the file that answered, and every result carries
// `simulated: true` so no reader has to infer it.

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, extname, join } from "node:path";

import type { APIResult, DispatchRequest } from "./base.ts";

export const PROVIDER = "offline";
export const ENV_RESPONSES_DIR = "DABBLER_OFFLINE_RESPONSES";
export const CURSOR_NAME = ".cursor";
export const RESPONSE_SUFFIXES = [".md", ".txt"] as const;

export class OfflineTransportError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Python's `Path.expanduser`: a leading `~` only, and only on its own. */
function expandUser(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/") || path.startsWith("~\\")) {
    return join(homedir(), path.slice(2));
  }
  return path;
}

/**
 * `DABBLER_OFFLINE_RESPONSES` > `transports.offline.responses_dir`.
 *
 * There is no default location. The transport is opted into by saying where
 * the script lives, so it can never be selected by accident.
 */
export function resolveResponsesDir(
  config: Record<string, unknown> | null = null,
): string {
  const env = process.env[ENV_RESPONSES_DIR];
  if (env !== undefined && env.trim() !== "") return expandUser(env.trim());
  const transports = isRecord(config?.["transports"]) ? config["transports"] : {};
  const block = isRecord(transports["offline"]) ? transports["offline"] : {};
  const configured = block["responses_dir"];
  if (configured !== undefined && configured !== null && String(configured).trim() !== "") {
    return expandUser(String(configured).trim());
  }
  throw new OfflineTransportError(
    "the offline transport needs a response directory: set " +
      `${ENV_RESPONSES_DIR} or transports.offline.responses_dir in ` +
      "router-config.yaml",
  );
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** Serves the next scripted response. No network, no credentials. */
export class OfflineTransport {
  readonly responsesDir: string;

  constructor(responsesDir: string) {
    this.responsesDir = responsesDir;
  }

  /**
   * The scripted responses in lexical order.
   *
   * Python sorts `Path` objects, which compares the whole path -- and every
   * path here shares a parent, so it is the file name that orders them.
   */
  responses(): string[] {
    if (!isDirectory(this.responsesDir)) {
      throw new OfflineTransportError(
        `offline response directory ${this.responsesDir} does not exist`,
      );
    }
    const found = readdirSync(this.responsesDir)
      .map((name) => join(this.responsesDir, name))
      .filter(
        (path) =>
          isFile(path) &&
          (RESPONSE_SUFFIXES as readonly string[]).includes(
            extname(path).toLowerCase(),
          ),
      )
      .sort();
    if (found.length === 0) {
      throw new OfflineTransportError(
        `offline response directory ${this.responsesDir} holds no ` +
          `${RESPONSE_SUFFIXES.join(" or ")} files`,
      );
    }
    return found;
  }

  // --- cursor ---------------------------------------------------------
  // Deliberately beside the responses, never under .dabbler/runs/ -- this
  // is scaffolding for a developer, not part of the machine record.

  private get cursorPath(): string {
    return join(this.responsesDir, CURSOR_NAME);
  }

  private readCursor(): number {
    let text: string;
    try {
      text = readFileSync(this.cursorPath, "utf8");
    } catch {
      return 0;
    }
    // Python's `int(...)`: the whole string or nothing. `parseInt` would
    // read a leading digit out of anything and call it a cursor.
    const trimmed = text.trim();
    if (!/^[+-]?\d+$/.test(trimmed)) return 0;
    return Math.max(0, Number.parseInt(trimmed, 10));
  }

  private writeCursor(index: number): void {
    writeFileSync(this.cursorPath, `${index}\n`, { encoding: "utf8" });
  }

  /** Rewind to the first response. */
  reset(): void {
    this.writeCursor(0);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async dispatch(request: DispatchRequest): Promise<APIResult> {
    const responses = this.responses();
    const index = this.readCursor();
    if (index >= responses.length) {
      throw new OfflineTransportError(
        `offline responses exhausted: ${responses.length} scripted in ` +
          `${this.responsesDir}, dispatch ${index + 1} requested. Add ` +
          "another response file, or reset the cursor.",
      );
    }
    const path = responses[index] as string;
    // Text mode, as Python's `read_text` is: a canned response written on
    // Windows must reach a prompt with the endings its Python twin sees.
    const content = readFileSync(path, "utf8").replace(/\r\n?/g, "\n");
    if (content.trim() === "") {
      throw new OfflineTransportError(
        `offline response ${basename(path)} is empty; an empty response ` +
          "is an escalation trigger, not a script",
      );
    }
    this.writeCursor(index + 1);
    return {
      content,
      // Nothing was metered because nothing was spent. Zero here means
      // unmeasured, and the escalation triggers read it that way.
      input_tokens: 0,
      output_tokens: 0,
      stop_reason: "end_turn",
      served_model_id: `${PROVIDER}:${basename(path)}`,
      metadata: {
        error_class: null,
        simulated: true,
        response_file: basename(path),
        response_index: index,
        requested_model_id: request.model_id,
      },
    };
  }
}
