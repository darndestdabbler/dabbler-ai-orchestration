// Validating a payload against one of the framework's schemas.
//
// Four modules ask this question -- the config loader, the round ledger,
// the critique subtree and the state writer -- and each refuses in its own
// error type. What they share is the mechanics: compile once per schema,
// stop at the first error, and name the location the way Python's
// `jsonschema` names it, so a refusal reads the same whichever router
// produced it.
//
// The wording of the error itself is NOT shared with Python and is not
// claimed to be: `ajv` and `jsonschema` word and order their messages
// differently, and matching them would be a second implementation of the
// schema language (D165). What is claimed is the location and the verdict
// -- whether the payload is legal, and which member is wrong.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import Ajv2020, { type ValidateFunction } from "ajv/dist/2020.js";

import { SCHEMA_DIR } from "../paths.ts";

const ajv = new Ajv2020({ allErrors: false, strict: false });

// A second instance, because `allErrors` is fixed at construction. Only the
// plan review needs it: every other caller refuses at the first error, and a
// reviewer is told everything at once so a plan is not revised one exception
// per round.
const ajvAll = new Ajv2020({ allErrors: true, strict: false });

const validatorCache = new Map<Record<string, unknown>, ValidateFunction>();
const allValidatorCache = new Map<Record<string, unknown>, ValidateFunction>();
const fileCache = new Map<string, Record<string, unknown>>();

/** One of the bundled schemas, read once. */
export function loadSchemaFile(fileName: string): Record<string, unknown> {
  let schema = fileCache.get(fileName);
  if (!schema) {
    schema = JSON.parse(
      readFileSync(join(SCHEMA_DIR, fileName), "utf8"),
    ) as Record<string, unknown>;
    fileCache.set(fileName, schema);
  }
  return schema;
}

export function validatorFor(
  schema: Record<string, unknown>,
): ValidateFunction {
  let validate = validatorCache.get(schema);
  if (!validate) {
    validate = ajv.compile(schema);
    validatorCache.set(schema, validate);
  }
  return validate;
}

/**
 * `providers/anthropic`, or `(root)` -- the location Python names.
 *
 * Python builds it by joining `exc.absolute_path`, which holds the raw
 * member names and array indices. `ajv` gives the same path as a JSON
 * Pointer, so the leading slash goes and the two pointer escapes are
 * undone.
 */
export function errorLocation(instancePath: string): string {
  if (!instancePath) return "(root)";
  return instancePath
    .replace(/^\//, "")
    .split("/")
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"))
    .join("/");
}

/**
 * `null` when the payload is legal, else `"<subject> failed schema
 * validation at <location>: <message>"` -- the sentence every caller
 * refuses with, wrapped in whichever error type that caller owns.
 */
export function schemaFailure(
  data: unknown,
  schema: Record<string, unknown>,
  subject: string,
): string | null {
  const validate = validatorFor(schema);
  if (validate(data)) return null;
  const error = validate.errors?.[0];
  const location = errorLocation(error?.instancePath ?? "");
  const message = error?.message ?? "does not match the schema";
  return `${subject} failed schema validation at ${location}: ${message}`;
}

/** One schema error, split the way a caller reports it. */
export interface SchemaFailure {
  readonly location: string;
  readonly message: string;
}

/**
 * Every way `data` breaks `schema`, rather than only the first.
 *
 * The order is `(location, message)`, which is this router's own and is NOT
 * Python's: `jsonschema` sorts by `str(error)` over a multi-line rendering
 * that has no counterpart here. The set of members reported is the claim; the
 * sequence and the wording are `ajv`'s, as D165 already settled for the
 * single-error form.
 */
export function allSchemaFailures(
  data: unknown,
  schema: Record<string, unknown>,
): SchemaFailure[] {
  let validate = allValidatorCache.get(schema);
  if (!validate) {
    validate = ajvAll.compile(schema);
    allValidatorCache.set(schema, validate);
  }
  if (validate(data)) return [];
  return (validate.errors ?? [])
    .map((error) => ({
      location: errorLocation(error.instancePath ?? ""),
      message: error.message ?? "does not match the schema",
    }))
    .sort(
      (left, right) =>
        left.location.localeCompare(right.location) ||
        left.message.localeCompare(right.message),
    );
}
