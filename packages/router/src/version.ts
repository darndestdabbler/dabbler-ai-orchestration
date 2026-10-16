// The router's version, read from the manifest that declares it.
//
// It appears in the writer stamp of every record this package writes, and
// the Python router stamps `ai_router.__version__` there. The two must be
// the same string or a record says two routers wrote it; they are kept in
// step by the release, not by a constant here that could be edited alone.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PACKAGE_ROOT } from "./paths.ts";

function readVersion(): string {
  const manifest: unknown = JSON.parse(
    readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8"),
  );
  const declared =
    typeof manifest === "object" && manifest !== null
      ? (manifest as { version?: unknown }).version
      : undefined;
  if (typeof declared !== "string" || declared === "") {
    throw new Error("the router package declares no version");
  }
  return declared;
}

export const VERSION = readVersion();
