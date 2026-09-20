// Reading a text file the way the Python router reads one.
//
// `open(path, encoding="utf-8")` is a TEXT-mode read: Python translates
// every line ending to `\n` before the caller sees it. Node hands back the
// bytes. On a CRLF checkout the two routers would then be parsing different
// strings -- a verifier output whose findings carry `\r` in their recorded
// text, a prompt template whose body differs by a byte per line -- and the
// difference would show up in the record rather than here.
//
// So a reader whose Python twin opens the file in TEXT mode reads through
// this. A reader whose Python twin opens it in BINARY mode -- `tomllib`
// takes bytes, so the seat catalog is read that way -- must NOT, because
// there the untranslated bytes are what Python parses.

import { readFileSync } from "node:fs";

export function readText(path: string): string {
  return readFileSync(path, "utf8").replace(/\r\n?/g, "\n");
}
