// The twenty schemas under `ai_router/schemas/` are the framework's
// meaning. This turns each of them into one TypeScript declaration file,
// in one direction only: a schema changes, the generator runs, and the
// checked-in output moves with it. Nothing here reads the generated files,
// so there is no path by which a hand edit survives.
//
// What a JSON Schema says and what a TypeScript type can say do not
// coincide, so the translation is stated rather than inferred:
//
// - `$ref` resolves only into this file's own `$defs`. A pointer anywhere
//   else is an error, not a widening to `unknown`: the schemas are
//   self-contained today and a cross-file pointer is a design change.
// - `oneOf` and `anyOf` become unions; `allOf` becomes an intersection of
//   the members that carry shape. An `if`/`then`/`else` member carries
//   none -- it refines which values are legal, which is ajv's job at run
//   time and cannot be spelled in a structural type.
// - `not`, `minimum`, `minLength`, `minItems` and their kin are dropped
//   for the same reason: they constrain values, not shapes.
// - An object with declared `properties` renders those properties and
//   stops. An object with none renders `Record<string, T>` -- `T` from
//   `additionalProperties` when it is a schema, `unknown` otherwise --
//   because a schema that declares no property is describing a map.
// - `additionalProperties: false` adds nothing either way; it is already
//   what the rendered shape says.

export type JsonSchema = boolean | JsonSchemaObject;

export interface JsonSchemaObject {
  $defs?: Record<string, JsonSchema>;
  $ref?: string;
  title?: string;
  description?: string;
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  const?: unknown;
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  allOf?: JsonSchema[];
  additionalProperties?: JsonSchema;
  [keyword: string]: unknown;
}

export class SchemaTranslationError extends Error {}

/** One schema file on its way to one module. */
export interface SchemaSource {
  /** File name as it sits in `ai_router/schemas/`, e.g. `rounds.schema.json`. */
  fileName: string;
  schema: JsonSchemaObject;
}

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const DEF_POINTER = /^#\/\$defs\/(.+)$/;

/** `router-config.schema.json` -> `router-config`. */
export function moduleName(fileName: string): string {
  return fileName.replace(/\.schema\.json$/, "");
}

/** `router-config` -> `RouterConfig`; `run-event` -> `RunEvent`. */
export function pascalCase(text: string): string {
  const words = text.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (words.length === 0) {
    throw new SchemaTranslationError(`no name can be made from '${text}'`);
  }
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

/** The exported type name for a schema file. */
export function typeNameFor(fileName: string): string {
  return pascalCase(moduleName(fileName));
}

interface Context {
  rootName: string;
  defs: Record<string, JsonSchema>;
  /** `$defs` reached from the root, in the order they were reached. */
  used: Set<string>;
}

function quoteKey(key: string): string {
  return IDENTIFIER.test(key) ? key : JSON.stringify(key);
}

function literal(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "number":
    case "boolean":
      return String(value);
    default:
      throw new SchemaTranslationError(
        `only string, number, boolean and null literals translate; got ${typeof value}`,
      );
  }
}

function primitive(name: string): string {
  switch (name) {
    case "string":
      return "string";
    case "integer":
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "null":
      return "null";
    case "object":
      return "Record<string, unknown>";
    case "array":
      return "unknown[]";
    default:
      throw new SchemaTranslationError(`unknown JSON Schema type '${name}'`);
  }
}

function union(members: string[]): string {
  const unique = [...new Set(members)];
  if (unique.length === 0) return "never";
  if (unique.length === 1) return unique[0]!;
  return unique.join(" | ");
}

function indent(text: string, depth: number): string {
  const pad = "  ".repeat(depth);
  return text
    .split("\n")
    .map((line) => (line ? pad + line : line))
    .join("\n");
}

function docComment(description: string | undefined, depth: number): string {
  if (!description) return "";
  const pad = "  ".repeat(depth);
  const body = description
    .split("\n")
    .map((line) => `${pad} * ${line}`.trimEnd())
    .join("\n");
  return `${pad}/**\n${body}\n${pad} */\n`;
}

/** True when this subschema says something about shape rather than values. */
function carriesShape(schema: JsonSchema): boolean {
  if (typeof schema === "boolean") return false;
  return (
    schema.$ref !== undefined ||
    schema.type !== undefined ||
    schema.properties !== undefined ||
    schema.items !== undefined ||
    schema.enum !== undefined ||
    schema.const !== undefined ||
    schema.oneOf !== undefined ||
    schema.anyOf !== undefined ||
    schema.allOf !== undefined
  );
}

function renderObject(schema: JsonSchemaObject, context: Context, depth: number): string {
  const properties = schema.properties;
  const additional = schema.additionalProperties;

  if (!properties || Object.keys(properties).length === 0) {
    if (additional === false) return "Record<string, never>";
    const value =
      additional === undefined || additional === true
        ? "unknown"
        : render(additional, context, depth);
    return `Record<string, ${value}>`;
  }

  const required = new Set(schema.required ?? []);
  const lines: string[] = [];
  // Named properties and an open door at once. The door is `unknown`
  // whatever `additionalProperties` says, because a typed index signature
  // has to admit every declared property too, and narrowing one of them to
  // satisfy it would state something the schema does not.
  if (additional !== undefined && additional !== false) {
    lines.push("  [key: string]: unknown;");
  }
  for (const [key, value] of Object.entries(properties)) {
    const rendered = render(value, context, depth + 1);
    const optional = required.has(key) ? "" : "?";
    const description = typeof value === "object" ? value.description : undefined;
    lines.push(
      `${docComment(description, 1)}  ${quoteKey(key)}${optional}: ${indent(rendered, 1).trimStart()};`,
    );
  }
  return `{\n${lines.join("\n")}\n}`;
}

function renderRef(pointer: string, context: Context): string {
  const match = DEF_POINTER.exec(pointer);
  if (!match) {
    throw new SchemaTranslationError(
      `only '#/$defs/<name>' pointers translate; got '${pointer}'`,
    );
  }
  const name = match[1]!;
  if (!(name in context.defs)) {
    throw new SchemaTranslationError(`'${pointer}' names no entry in $defs`);
  }
  context.used.add(name);
  return `${context.rootName}${pascalCase(name)}`;
}

/** One subschema as a TypeScript type expression. */
export function render(schema: JsonSchema, context: Context, depth = 0): string {
  if (schema === true) return "unknown";
  if (schema === false) return "never";

  if (schema.$ref !== undefined) return renderRef(schema.$ref, context);
  if (schema.const !== undefined) return literal(schema.const);
  if (schema.enum !== undefined) return union(schema.enum.map(literal));

  const branches = schema.oneOf ?? schema.anyOf;
  if (branches !== undefined) {
    return union(branches.map((branch) => render(branch, context, depth)));
  }

  if (schema.allOf !== undefined) {
    const parts = schema.allOf
      .filter(carriesShape)
      .map((part) => render(part, context, depth));
    // A base type beside the intersection: `allOf` here is how a schema
    // says "this, refined", and the refinements are ajv's.
    const own = carriesShape({ ...schema, allOf: undefined })
      ? render({ ...schema, allOf: undefined }, context, depth)
      : undefined;
    const all = own ? [own, ...parts] : parts;
    if (all.length === 0) return "unknown";
    if (all.length === 1) return all[0]!;
    return all.join(" & ");
  }

  const types = schema.type === undefined ? [] : [schema.type].flat();

  if (types.length > 1) {
    return union(
      types.map((name) =>
        name === "object" || name === "array"
          ? render({ ...schema, type: name }, context, depth)
          : primitive(name),
      ),
    );
  }

  const only = types[0];

  if (only === "array" || (only === undefined && schema.items !== undefined)) {
    const items = schema.items === undefined ? "unknown" : render(schema.items, context, depth);
    return items.includes("|") || items.includes("&") ? `Array<${items}>` : `${items}[]`;
  }

  if (only === "object" || (only === undefined && schema.properties !== undefined)) {
    return renderObject(schema, context, depth);
  }

  if (only === undefined) return "unknown";
  return primitive(only);
}

/**
 * One schema file as one TypeScript module: the root type, plus a named
 * type for every `$defs` entry the root actually reaches.
 */
export function generateModule(source: SchemaSource): string {
  const rootName = typeNameFor(source.fileName);
  const context: Context = {
    rootName,
    defs: source.schema.$defs ?? {},
    used: new Set(),
  };

  const rootBody = render({ ...source.schema, $defs: undefined }, context);

  // Rendering a `$defs` entry can reach another, so walk until the set
  // stops growing rather than assuming one pass is enough.
  const bodies = new Map<string, string>();
  const pending = [...context.used];
  while (pending.length > 0) {
    const name = pending.shift()!;
    if (bodies.has(name)) continue;
    const before = new Set(context.used);
    bodies.set(name, render(context.defs[name]!, context));
    for (const reached of context.used) {
      if (!before.has(reached) && !bodies.has(reached)) pending.push(reached);
    }
  }

  const parts: string[] = [
    "// Generated from " + source.fileName + " by packages/router/src/schema/generate.ts.",
    "// Do not edit: the schema is the source, and `npm run check:types` fails",
    "// when this file no longer matches it.",
    "",
  ];

  // `$defs` first, in the order they are declared in the schema, so a
  // reordering of the generator's traversal cannot churn the output.
  for (const name of Object.keys(context.defs)) {
    const body = bodies.get(name);
    if (body === undefined) continue;
    const declared = context.defs[name]!;
    const description = typeof declared === "object" ? declared.description : undefined;
    parts.push(docComment(description, 0) + `export type ${rootName}${pascalCase(name)} = ${body};`);
    parts.push("");
  }

  parts.push(docComment(source.schema.title, 0) + `export type ${rootName} = ${rootBody};`);
  parts.push("");
  return parts.join("\n");
}

/** The barrel that re-exports every generated module. */
export function generateIndex(sources: SchemaSource[]): string {
  const seen = new Map<string, string>();
  for (const source of sources) {
    const name = typeNameFor(source.fileName);
    const previous = seen.get(name);
    if (previous) {
      throw new SchemaTranslationError(
        `'${source.fileName}' and '${previous}' both generate the type '${name}'`,
      );
    }
    seen.set(name, source.fileName);
  }
  const lines = [
    "// Generated by packages/router/src/schema/generate.ts. Do not edit.",
    "",
    ...[...sources]
      .map((source) => moduleName(source.fileName))
      .sort()
      .map((name) => `export * from "./${name}.ts";`),
    "",
  ];
  return lines.join("\n");
}
