// The raw session record, read at the record's own level.
//
// This lived inside `progress.ts`, which also folds the record into the
// Work Explorer projection -- so every module that only needed to READ the
// ledger acquired an edge into the projection layer, ten of the fifty-two
// back-edges in the 2026-09-02 measurement. The reader is the record's
// concern; the fold stays with the projection.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { STATE_FILENAME } from "./evidence.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The raw on-disk record, or null when no usable state exists.
 *
 * A read error other than "not there" propagates, as Python's does: a
 * locked file is not an absent one, and treating it as absent invites
 * writers to clobber real state.
 */
export function readRawSessionState(
  sessionsDir: string,
): Record<string, unknown> | null {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(join(sessionsDir, STATE_FILENAME), "utf8"));
  } catch (error) {
    // Absent and malformed are both "no usable state"; anything else -- a
    // permission denial, a directory where the file should be -- propagates,
    // because a locked file is not an absent one and treating it as absent
    // invites writers to clobber real state.
    //
    // Asked of the file rather than of a prior `existsSync`: between that
    // question and this read the file can go, and a caller that then saw
    // ENOENT thrown would get an error where Python returns null.
    if (error instanceof SyntaxError) return null;
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  return isRecord(raw) ? raw : null;
}
