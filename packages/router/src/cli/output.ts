// What the command writes, where a line ends, and where it goes.
//
// Python's `print` goes through a text-mode stream, which translates `\n` to
// the platform's line ending -- CRLF on Windows, and it does so whether the
// output is a console or a redirect. Node writes the bytes it is given.
//
// The parity control compares everything a verb emits, byte for byte, with
// both routers on one machine: "cross-OS parity is not claimed; line endings
// are whatever this host's Python produces, and the TypeScript side is held
// to that". So the translation lives here, once, and every verb writes
// through it. A verb that reached for `process.stdout.write` directly would
// be red on Windows for a reason no diff of its logic would explain.
//
// **Where it goes is a seam, because the router is no longer only a
// command.** In-process there is no stdout to inherit: the extension runs a
// verb and needs what it said. `capture` collects the same bytes the process
// would have received -- after the newline translation, not before, so what
// a caller reads is what a command line would have shown and not a second
// spelling of it.

import { EOL } from "node:os";

function withPlatformNewlines(text: string): string {
  return EOL === "\n" ? text : text.replace(/\r?\n/g, EOL);
}

interface Buffers {
  out: string;
  err: string;
}

let collecting: Buffers | null = null;
let diverting = false;

export function writeOut(text: string): void {
  const bytes = withPlatformNewlines(text);
  if (diverting) writeErr(text);
  else if (collecting) collecting.out += bytes;
  else process.stdout.write(bytes);
}

export function writeErr(text: string): void {
  const bytes = withPlatformNewlines(text);
  if (collecting) collecting.err += bytes;
  else process.stderr.write(bytes);
}

/**
 * Run `fn` with everything bound for stdout going to stderr instead.
 *
 * `dabbler session next` prints one thing on stdout -- the instruction JSON
 * the engine reads -- and every verb it calls on the way there (the
 * registration, the declaration, the driver's own progress lines) would
 * otherwise land in the middle of it. Diverting is the seam rather than
 * silencing: the person watching their own CLI still sees all of it, and a
 * parser reading stdout sees only the instruction.
 */
export async function divertOut<T>(fn: () => Promise<T>): Promise<T> {
  const previous = diverting;
  diverting = true;
  try {
    return await fn();
  } finally {
    diverting = previous;
  }
}

/** Everything one verb wrote, as the two streams it wrote them to. */
export interface CapturedOutput<T> {
  readonly value: T;
  readonly stdout: string;
  readonly stderr: string;
}

export class OutputAlreadyCapturedError extends Error {
  constructor() {
    super(
      "output is already being captured: two verbs cannot write to one " +
        "buffer at once. Serialize them.",
    );
    this.name = "OutputAlreadyCapturedError";
  }
}

/**
 * Collect what `fn` writes instead of letting it reach the process.
 *
 * Not re-entrant, and it says so rather than interleaving two verbs'
 * output into one buffer. The in-process router serializes, so the
 * refusal is a statement of the invariant rather than a path anything
 * takes.
 */
export async function capture<T>(fn: () => Promise<T>): Promise<CapturedOutput<T>> {
  if (collecting) throw new OutputAlreadyCapturedError();
  const buffers: Buffers = { out: "", err: "" };
  collecting = buffers;
  try {
    const value = await fn();
    return { value, stdout: buffers.out, stderr: buffers.err };
  } finally {
    collecting = null;
  }
}
