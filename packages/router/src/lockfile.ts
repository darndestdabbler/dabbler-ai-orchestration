// The restricted-TOML record format both discovery paths write.
//
// Two records exist -- the seat catalog (empirical probe) and the direct-API
// enumeration -- and §5.b of the framework spec says they are the same record
// shape: what exists, what was confirmed, and when. That is only true if one
// piece of code renders both, so the renderer, the writer stamp, the content
// digest and the hand-edit verdict live here rather than in either record's
// module.
//
// The format is deliberately small: one flat table then repeated flat tables,
// holding scalars and flat arrays of strings. Nothing nested, so writing needs
// no TOML library and the file stays legible to an operator who must never
// have to edit it. Reading is `smol-toml`, which accepts far more than this
// subset writes; a key this writer cannot render must be coerced where it
// arrived from rather than admitted here.
//
// **Unknown is written by omission.** An absent key and a null key are the
// same fact and TOML has only the first, so a value a vendor stopped
// reporting drops out of the file instead of becoming a placeholder that later
// reads as a measurement.

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { pythonFloatRepr } from "./pythonJson.ts";
import { VERSION } from "./version.ts";

export const PROVENANCE_MACHINE_WRITTEN = "machine-written";
export const PROVENANCE_HAND_EDITED = "hand-edited";
export const PROVENANCE_UNSTAMPED = "unstamped";

const TOML_STRING_ESCAPES: Record<string, string> = {
  "\\": "\\\\",
  '"': '\\"',
  "\n": "\\n",
  "\r": "\\r",
  "\t": "\\t",
};

/**
 * A number this record means as a TOML float.
 *
 * Python distinguishes `1` from `1.0` by type and renders each accordingly.
 * JavaScript has one number type, so a measurement that lands exactly on an
 * integer would otherwise be written as an integer and read back as one --
 * a difference in the file for a value neither router chose. A caller holding
 * a float says so here; an unwrapped integral number is an integer, which is
 * what every count in these records is.
 */
export class TomlFloat {
  // Declared and assigned, not a constructor parameter property: Node runs
  // these sources by stripping types, and a parameter property is syntax it
  // would have to compile rather than erase.
  readonly value: number;

  constructor(value: number) {
    this.value = value;
  }
}

export function tomlFloat(value: number): TomlFloat {
  return new TomlFloat(value);
}

/** What a table may hold: scalars, and flat arrays of strings. */
export type LockValue =
  | string
  | number
  | boolean
  | TomlFloat
  | readonly string[]
  | null
  | undefined;

export type LockTable = Record<string, LockValue>;

export function renderString(value: string): string {
  const out: string[] = [];
  for (const char of value) {
    const escaped = TOML_STRING_ESCAPES[char];
    if (escaped !== undefined) {
      out.push(escaped);
    } else {
      const code = char.codePointAt(0) ?? 0;
      if (code < 0x20 || code === 0x7f) {
        throw new Error(
          "catalog value contains an unrenderable control character " +
            JSON.stringify(char),
        );
      }
      out.push(char);
    }
  }
  return `"${out.join("")}"`;
}

export function renderValue(key: string, value: LockValue): string {
  // Boolean first: in Python it is an int subclass, and `true` must not
  // render as `1`.
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof TomlFloat) {
    if (!Number.isFinite(value.value)) {
      throw new Error(
        `catalog key '${key}' holds a non-finite number, which is not ` +
          "a measurement of anything",
      );
    }
    return pythonFloatRepr(value.value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(
        `catalog key '${key}' holds a non-finite number, which is not ` +
          "a measurement of anything",
      );
    }
    // Shortest text that reads back as the same number, so a sample
    // survives a rewrite unchanged and the content digest holds.
    return Number.isInteger(value) ? String(value) : pythonFloatRepr(value);
  }
  if (typeof value === "string") return renderString(value);
  if (Array.isArray(value)) {
    if (!value.every((item) => typeof item === "string")) {
      throw new Error(
        `catalog key '${key}' holds an array the lockfile cannot ` +
          "represent: arrays are flat arrays of strings",
      );
    }
    const body = value.map((item) => `    ${renderString(item)},\n`).join("");
    return `[\n${body}]`;
  }
  throw new Error(
    `catalog key '${key}' holds a value the lockfile cannot represent: ` +
      `${String(value)}. Coerce it where it arrived from -- a value the ` +
      "writer cannot render must never reach the writer.",
  );
}

/**
 * An absent key and a null key are the same fact, and TOML has only the
 * first: unknown is written by omission, never by a placeholder.
 */
export function setOrDrop(table: LockTable, key: string, value: LockValue): void {
  if (value === null || value === undefined) {
    delete table[key];
  } else {
    table[key] = value;
  }
}

export function renderTable(header: string, table: LockTable): string {
  const lines = [header];
  for (const [key, value] of Object.entries(table)) {
    lines.push(`${key} = ${renderValue(key, value)}`);
  }
  return lines.join("\n");
}

/** `[header, table]` pairs rendered as the whole file text. */
export function renderDocument(
  tables: ReadonlyArray<readonly [string, LockTable]>,
): string {
  return (
    tables.map(([header, table]) => renderTable(header, table)).join("\n\n") + "\n"
  );
}

/**
 * Write record text with LF endings on every platform: the digest covers the
 * bytes, so a CRLF rewrite on Windows would convict a clean file.
 *
 * The parent directory is created, because a record whose home does not exist
 * yet is the first-run case rather than an error -- the writer is the only
 * sanctioned way to produce these files, so a missing directory here would
 * mean the record simply cannot be made.
 */
export function writeDocument(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, { encoding: "utf8" });
}

export function digestText(text: string): string {
  return "sha256:" + createHash("sha256").update(text, "utf8").digest("hex");
}

export function utcNow(now: Date = new Date()): string {
  return now.toISOString().replace(/\.\d+Z$/, "Z");
}

export function writerId(moduleName: string): string {
  return `${moduleName} ${VERSION}`;
}

export interface ProvenanceInput {
  readonly storedDigest?: string | null;
  readonly recomputedDigest?: string | null;
  readonly writtenBy?: string | null;
  readonly writtenAt?: string | null;
}

/**
 * How a record came to hold what it holds.
 *
 * A stamp stripped of its digest reads as hand-edited, not as unstamped:
 * removing the line that would convict is itself the edit. A file carrying no
 * stamp at all is merely older than the writer.
 *
 * Detection, not enforcement: an operator may still edit a record, but the
 * record will say they did, and the value it carries is empirical or it is
 * nothing. The digest covers rendered content and not the file's mtime,
 * because these files are committed and every checkout rewrites mtime -- a
 * guard that fires on the innocent case teaches people to ignore it.
 */
export function provenance(input: ProvenanceInput): string {
  const { storedDigest, recomputedDigest, writtenBy, writtenAt } = input;
  if (!storedDigest && !writtenBy && !writtenAt) return PROVENANCE_UNSTAMPED;
  if (storedDigest && storedDigest === recomputedDigest) {
    return PROVENANCE_MACHINE_WRITTEN;
  }
  return PROVENANCE_HAND_EDITED;
}
