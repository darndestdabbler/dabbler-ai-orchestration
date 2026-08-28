// What the command writes, and how a line ends.
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

import { EOL } from "node:os";

function withPlatformNewlines(text: string): string {
  return EOL === "\n" ? text : text.replace(/\r?\n/g, EOL);
}

export function writeOut(text: string): void {
  process.stdout.write(withPlatformNewlines(text));
}

export function writeErr(text: string): void {
  process.stderr.write(withPlatformNewlines(text));
}
