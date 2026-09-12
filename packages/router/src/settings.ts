// What this CHECKOUT was configured with, in the file an editor already owns.
//
// **One file, one prefix, one reader.** `<repo>/.vscode/settings.json` is
// where a VS Code workspace keeps its own settings, it is a file developers
// already know how to read and commit, and every value this framework puts
// there is under `dabbler.`. The router reads and writes it DIRECTLY rather
// than through the extension, because the two callers that need an answer --
// a verb typed in a terminal and a row drawn in a pane -- must get the same
// one, and a setting only one of them can see is exactly the split that made
// the engine choice invisible to `dabbler session start` until session 150.
//
// **The operator's own text survives every write.** `jsonc-parser` is the
// parser VS Code itself uses: MIT, no dependencies, and it edits a document
// in place rather than re-serialising a parse. A writer that round-tripped
// through `JSON.parse`/`JSON.stringify` would silently charge an operator
// their comments and their key order for using a control -- and this file is
// shared with every other extension they have configured, so what it drops
// is not even this framework's to drop.
//
// **A file this parser cannot read is left exactly as it is.** Not
// overwritten with a freshly generated one, not partially repaired: a
// half-typed setting is a file somebody is in the middle of editing, and the
// only safe thing to do with it is say so. Reading such a file yields NO
// values rather than a guess, because a recovered parse of a document with a
// syntax error is a reading of what the operator has not finished writing.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { applyEdits, modify, parse, type ParseError, printParseErrorCode } from "jsonc-parser";

/** Where a checkout's own settings live, relative to its root. */
export const SETTINGS_RELPATH = join(".vscode", "settings.json");

export function settingsPath(root: string): string {
  return join(root, SETTINGS_RELPATH);
}

/**
 * Every key this framework owns in that file.
 *
 * Stated once, as one table, because two lists of what `dabbler.*` means is
 * how a key comes to be written by one surface and read by none. A key that
 * is not here is not this framework's and is never touched.
 */
export const SETTING_TRANSPORT = "dabbler.transport";
export const SETTING_REVIEWER_TRANSPORT = "dabbler.reviewerTransport";
export const SETTING_ENGINE = "dabbler.engine";
export const SETTING_AUTHORING_MODEL = "dabbler.authoringModel";
export const SETTING_REVIEWER_MODEL = "dabbler.reviewerModel";
export const SETTING_AUXILIARY_MODEL = "dabbler.auxiliaryModel";

/**
 * Which credential this solution uses for a provider -- a NAME, never a key.
 *
 * One key per provider, spelled out rather than derived, because this table
 * is the whole statement of what `dabbler.*` means and a key built from a
 * string at runtime is a key nothing here can enumerate. A provider the
 * distribution gains later gains a line here; a provider with no line simply
 * has no solution-level reference, which resolves to this person's default.
 */
export const SETTING_CREDENTIAL_ANTHROPIC = "dabbler.credentials.anthropic";
export const SETTING_CREDENTIAL_OPENAI = "dabbler.credentials.openai";
export const SETTING_CREDENTIAL_GOOGLE = "dabbler.credentials.google";

export const CREDENTIAL_SETTING_BY_PROVIDER = {
  anthropic: SETTING_CREDENTIAL_ANTHROPIC,
  openai: SETTING_CREDENTIAL_OPENAI,
  google: SETTING_CREDENTIAL_GOOGLE,
} as const;

export const SETTING_KEYS = [
  SETTING_TRANSPORT,
  SETTING_REVIEWER_TRANSPORT,
  SETTING_ENGINE,
  SETTING_AUTHORING_MODEL,
  SETTING_REVIEWER_MODEL,
  SETTING_AUXILIARY_MODEL,
  SETTING_CREDENTIAL_ANTHROPIC,
  SETTING_CREDENTIAL_OPENAI,
  SETTING_CREDENTIAL_GOOGLE,
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

/** A settings file this parser could not read. The file is never rewritten. */
export class SettingsError extends Error {}

/** What one checkout's settings file says, and whether it could be read. */
export interface SettingsReading {
  readonly path: string;
  /** True where the file exists at all; an absent file is silence, not an error. */
  readonly present: boolean;
  /**
   * The `dabbler.*` values, trimmed, with empty strings dropped.
   *
   * Empty because nothing was set and empty because the file is unreadable
   * are told apart by `malformed`, never by the size of this map: a caller
   * that could not tell them apart would report "nothing configured" over a
   * file the operator can plainly see a setting in.
   */
  readonly values: Readonly<Partial<Record<SettingKey, string>>>;
  /** The first syntax error, in the parser's own words, or null. */
  readonly malformed: string | null;
}

function describe(errors: readonly ParseError[], text: string): string {
  const first = errors[0] as ParseError;
  const line = text.slice(0, first.offset).split("\n").length;
  return `${printParseErrorCode(first.error)} at line ${line}`;
}

/**
 * What this checkout's settings file says.
 *
 * Never throws. A missing file, an unreadable one and a malformed one are
 * three different facts and all three are *no values*, which is what a
 * resolution order needs from a layer that did not speak.
 */
export function readSettings(root: string): SettingsReading {
  const path = settingsPath(root);
  if (!existsSync(path)) {
    return { path, present: false, values: {}, malformed: null };
  }
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    return {
      path,
      present: true,
      values: {},
      malformed: error instanceof Error ? error.message : String(error),
    };
  }
  const errors: ParseError[] = [];
  const parsed: unknown = parse(text, errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    return { path, present: true, values: {}, malformed: describe(errors, text) };
  }
  const values: Partial<Record<SettingKey, string>> = {};
  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
    const record = parsed as Record<string, unknown>;
    for (const key of SETTING_KEYS) {
      const value = record[key];
      if (typeof value === "string" && value.trim() !== "") values[key] = value.trim();
    }
  }
  return { path, present: true, values, malformed: null };
}

/** One setting's value in this checkout, or null where the file is silent. */
export function settingValue(root: string, key: SettingKey): string | null {
  return readSettings(root).values[key] ?? null;
}

/** What a write changed, in the words a person reads. */
export interface SettingsWrite {
  readonly path: string;
  readonly changed: readonly string[];
}

/**
 * Write settings into this checkout's own file, keeping everything else.
 *
 * An empty value REMOVES the key rather than storing an empty string: "I
 * want no setting here" is a thing an operator means, and a stored empty
 * string is a setting that reads as one and resolves to nothing.
 *
 * Refuses a malformed file. The alternative -- writing a fresh document over
 * it -- would take an operator who mistyped one comma and delete every
 * setting every other extension of theirs had in that file.
 */
export function writeSettings(
  root: string,
  values: Readonly<Partial<Record<SettingKey, string>>>,
): SettingsWrite {
  const path = settingsPath(root);
  const reading = readSettings(root);
  if (reading.malformed !== null) {
    throw new SettingsError(
      `${SETTINGS_RELPATH} could not be read (${reading.malformed}), so it was ` +
        "left exactly as it is. Fix the file and run this again -- writing a " +
        "fresh one over it would discard every other setting in it.",
    );
  }
  let text = reading.present ? readFileSync(path, "utf8") : "{}\n";
  const changed: string[] = [];
  for (const [key, raw] of Object.entries(values) as [SettingKey, string | undefined][]) {
    if (raw === undefined) continue;
    const value = raw.trim();
    const edits = modify(text, [key], value === "" ? undefined : value, {
      formattingOptions: { insertSpaces: true, tabSize: 2 },
    });
    text = applyEdits(text, edits);
    changed.push(value === "" ? `${key} is no longer set` : `${key} is now '${value}'`);
  }
  if (changed.length === 0) return { path, changed };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, "utf8");
  return { path, changed };
}
