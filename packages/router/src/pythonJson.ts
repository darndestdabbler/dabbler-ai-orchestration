// Serializing a value the way `json.dumps` serializes it.
//
// Every file the record is made of is written by whichever router ran, and
// compared byte for byte against the other's. `JSON.stringify` and
// `json.dumps` disagree on three things that reach those bytes, so the
// translation lives here once rather than at each of the dozen writers:
//
// - **Separators.** `json.dumps(x)` puts `", "` between members and `": "`
//   after a key. `json.dumps(x, indent=2)` drops the space after the comma,
//   because the newline carries it. `JSON.stringify` writes `","` in the
//   first case and matches in the second.
// - **Non-ASCII.** `ensure_ascii` defaults to true, so `é` is written
//   `é` and an astral character as its surrogate pair. `JSON.stringify`
//   emits the character. A record holding a decision headline with a dash
//   in it differs on this alone.
// - **Floats.** JavaScript has one number type, so `1.0` round-trips to `1`
//   and stops being the float Python wrote. `PythonFloat` marks a value
//   whose Python twin is a float, and it is rendered by CPython's `repr`.
//
// An empty container is `{}` or `[]` on both sides, with no newline inside,
// which is what CPython does and what a naive indent implementation gets
// wrong.

/**
 * A number whose Python twin is a float, so `1.0` is not written `1`.
 *
 * Only for a value the record means as a float. A count that happens to be
 * whole is an int on both sides and needs no marker.
 */
export class PythonFloat {
  readonly value: number;

  constructor(value: number) {
    this.value = value;
  }
}

export interface DumpOptions {
  /** Spaces per level. Omitted for the one-line form `json.dumps(x)` writes. */
  readonly indent?: number;
  /** `ensure_ascii`; true, as CPython's default is. */
  readonly ensureAscii?: boolean;
  /**
   * `sort_keys`. Keys are ordered by code point, which is what Python
   * compares strings by -- JavaScript's default sort compares UTF-16 code
   * units, and the two disagree above the basic plane.
   */
  readonly sortKeys?: boolean;
  /**
   * `separators`, as `[item, key]`. CPython defaults to `[", ", ": "]`
   * with no indent and `[",", ": "]` with one, and a caller that hashes
   * the result passes `[",", ":"]` -- the compact form, whose bytes are
   * the digest's input rather than a rendering choice.
   */
  readonly separators?: readonly [string, string];
}

/**
 * CPython's `repr` of a float: the shortest text that reads back as the same
 * value, with the same exponent threshold and the same two-digit exponent.
 * JavaScript's own is shortest too, and switches to exponent notation at
 * different magnitudes -- which would put a different string in the file for
 * the same measurement.
 *
 * It sits here rather than beside the one writer that first needed it,
 * because rendering a Python value is what this file is: the seat catalog's
 * TOML, the metrics ledger and every record row now ask the same question
 * and get the same answer.
 */
export function pythonFloatRepr(value: number): string {
  const negative = value < 0 || Object.is(value, -0);
  const sign = negative ? "-" : "";
  const abs = Math.abs(value);
  if (abs === 0) return `${sign}0.0`;

  const [mantissa, exponentText] = abs.toExponential().split("e");
  const exponent = Number(exponentText);
  const digits = mantissa.replace(".", "");
  // CPython uses scientific notation when the decimal point would sit at or
  // before -4, or past 16 significant places.
  const decimalPoint = exponent + 1;
  if (decimalPoint <= -4 || decimalPoint > 16) {
    const expSign = exponent < 0 ? "-" : "+";
    return `${sign}${mantissa}e${expSign}${String(Math.abs(exponent)).padStart(2, "0")}`;
  }
  if (decimalPoint <= 0) {
    return `${sign}0.${"0".repeat(-decimalPoint)}${digits}`;
  }
  if (decimalPoint >= digits.length) {
    return `${sign}${digits}${"0".repeat(decimalPoint - digits.length)}.0`;
  }
  return `${sign}${digits.slice(0, decimalPoint)}.${digits.slice(decimalPoint)}`;
}

const DEL = 0x7f;

function escapeNonAscii(text: string): string {
  let out = "";
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    // CPython's ASCII encoder keeps `0x20 <= c < 0x7f` and escapes the rest,
    // so DEL is escaped even though it is ASCII. `JSON.stringify` has already
    // escaped everything below 0x20, so DEL is the one survivor.
    if (code < 0x80 && code !== DEL) {
      out += char;
    } else if (code > 0xffff) {
      // Python escapes an astral character as its surrogate pair.
      for (let index = 0; index < char.length; index += 1) {
        out += `\\u${char.charCodeAt(index).toString(16).padStart(4, "0")}`;
      }
    } else {
      out += `\\u${code.toString(16).padStart(4, "0")}`;
    }
  }
  return out;
}

/** A JSON string literal, escaped as CPython escapes one. */
function encodeString(text: string, ensureAscii: boolean): string {
  const quoted = JSON.stringify(text);
  return ensureAscii ? escapeNonAscii(quoted) : quoted;
}

function encodeScalar(value: unknown, ensureAscii: boolean): string {
  if (value instanceof PythonFloat) {
    return Number.isFinite(value.value) ? pythonFloatRepr(value.value) : "null";
  }
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "null";
    return Number.isInteger(value) ? String(value) : pythonFloatRepr(value);
  }
  if (typeof value === "string") return encodeString(value, ensureAscii);
  return encodeString(String(value), ensureAscii);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The options as `encode` reads them, every default already resolved. */
interface Encoding {
  readonly ensureAscii: boolean;
  readonly indent: number | undefined;
  readonly sortKeys: boolean;
  readonly itemSep: string;
  readonly keySep: string;
}

/** `<` on two Python strings: code point order, not UTF-16 code unit order. */
function byCodePoint(left: string, right: string): number {
  const leftPoints = [...left];
  const rightPoints = [...right];
  const shared = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < shared; index += 1) {
    const a = leftPoints[index].codePointAt(0)!;
    const b = rightPoints[index].codePointAt(0)!;
    if (a !== b) return a - b;
  }
  return leftPoints.length - rightPoints.length;
}

function encode(value: unknown, options: Encoding, depth: number): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value.map((item) => encode(item, options, depth + 1));
    return wrap("[", items, "]", options, depth);
  }
  if (isPlainObject(value) && !(value instanceof PythonFloat)) {
    const keys = Object.keys(value);
    if (keys.length === 0) return "{}";
    if (options.sortKeys) keys.sort(byCodePoint);
    const items = keys.map(
      (key) =>
        `${encodeString(key, options.ensureAscii)}${options.keySep}` +
        encode(value[key], options, depth + 1),
    );
    return wrap("{", items, "}", options, depth);
  }
  return encodeScalar(value, options.ensureAscii);
}

/**
 * The members between their brackets.
 *
 * Indented: a newline after the opening bracket, the item separator plus a
 * newline between members, and the closing bracket back at the parent's
 * depth. Flat: the item separator alone -- `", "` by default, which is the
 * space CPython writes when no indent carries it.
 */
function wrap(
  open: string,
  items: readonly string[],
  close: string,
  options: Encoding,
  depth: number,
): string {
  const { indent, itemSep } = options;
  if (indent === undefined) return `${open}${items.join(itemSep)}${close}`;
  const inner = " ".repeat(indent * (depth + 1));
  const outer = " ".repeat(indent * depth);
  return `${open}\n${inner}${items.join(`${itemSep}\n${inner}`)}\n${outer}${close}`;
}

/** `json.dumps(value, **options)`. */
export function dumps(value: unknown, options: DumpOptions = {}): string {
  // CPython's own defaulting: the item separator loses its trailing space
  // once an indent supplies the break, and an explicit pair overrides both.
  const [itemSep, keySep] =
    options.separators ?? (options.indent === undefined ? [", ", ": "] : [",", ": "]);
  return encode(
    value,
    {
      ensureAscii: options.ensureAscii ?? true,
      indent: options.indent,
      sortKeys: options.sortKeys ?? false,
      itemSep,
      keySep,
    },
    0,
  );
}

/**
 * `str(x)` for the values these records hold.
 *
 * It lives beside `pythonRepr` because it is the other half of one rule:
 * a message the Python router built by interpolation renders `None`,
 * `True` and `False` where JavaScript would render `null`, `undefined`
 * and lower case, and a reader diffing two routers' output sees that
 * before anything else.
 */
export function pythonStr(value: unknown): string {
  if (value === null || value === undefined) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  return String(value);
}

/**
 * `repr(x)` for the values that reach a refusal an operator reads.
 *
 * The Python router writes those messages with `repr`, so a dict renders
 * with its Python punctuation -- single-quoted keys, `True`/`None`, a space
 * after each comma -- because that is what the reader of the other router's
 * message sees. A tuple is not here: its repr differs from a list's and
 * JavaScript has nothing that distinguishes them, so the two modules whose
 * Python twins interpolate a tuple spell that one out.
 *
 * It sits beside `dumps` for the reason `dumps` gives: rendering a Python
 * value is what this file is, and four modules asking the question in four
 * places is four chances for the answers to drift apart.
 */
export function pythonRepr(value: unknown): string {
  if (value === null || value === undefined) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
  }
  if (Array.isArray(value)) return `[${value.map(pythonRepr).join(", ")}]`;
  if (typeof value === "object") {
    const members = Object.entries(value as Record<string, unknown>).map(
      ([key, item]) => `${pythonRepr(key)}: ${pythonRepr(item)}`,
    );
    return `{${members.join(", ")}}`;
  }
  return String(value);
}
