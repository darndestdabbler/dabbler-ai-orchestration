// What this operator CHOSE, on the machine they chose it on.
//
// **The catalog is a reading; the preferences are a choice.** They sit side
// by side under the same per-user data directory and they are two files for
// one reason: `ai-model-catalog.json` is defined as rebuildable for nothing,
// so every free refresh may replace it whole, and a selection stored inside
// it is a selection the next refresh wipes. Nothing in here is ever derived
// from a source, and nothing in here is ever rewritten by a refresh.
//
// **It lives at the user level, beside the catalog, and outside every
// repository.** A choice of engine is a fact about who is at this keyboard
// and what is installed for them, not about the project they happen to have
// open -- and a choice that travelled inside a checkout would tell the next
// clone about somebody else's machine.
//
// **Reading is total.** A missing file, a torn one, or one written by a
// schema this router does not know is *nothing chosen*. This file sits on a
// developer's machine where nothing guards it, and a framework that stopped
// over it would be stopping over a preference it can simply ask for again.
//
// **Writing keeps what it did not set.** A caller sets one field; every
// other field the file holds survives, because a control that silently
// cleared the settings beside the one it changed is a control nobody can
// trust twice.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { catalogDir, currentCatalogPath, underTestRunner } from "./catalog.ts";
import { VERSION } from "./version.ts";

/** The shape this router writes and the only one it reads. */
export const PREFERENCES_SCHEMA_VERSION = 1;

export const PREFERENCES_FILENAME = "preferences.json";

/**
 * Where a suite that cannot call `setPreferencesPath` says its file is.
 *
 * The catalog's seam, for the same reason and the same caller: the
 * extension's suite reaches the router through its published contract,
 * which deliberately does not export the modules behind it, so an import
 * seam is not available to it.
 */
export const PREFERENCES_PATH_ENV = "DABBLER_PREFERENCES_PATH";

/**
 * What an operator has chosen on this machine.
 *
 * Every field is optional and an absent one means *nobody chose*, which is a
 * different fact from any default and never collapses into one: a surface
 * that could not tell them apart would show a person a choice they never
 * made and let them act on it.
 */
export interface Preferences {
  readonly schema_version: number;
  readonly written_by: string;
  readonly written_at: string;
  /**
   * The engine the next session is offered.
   *
   * It lived in a VS Code setting, where `dabbler session start` from a
   * terminal could not read it -- so half a machine's configuration was
   * invisible to the one command that needs it. The pane still writes it;
   * it writes it here.
   */
  readonly engine?: string;
  /**
   * This person's own vehicle, where a checkout does not name one.
   *
   * A vehicle is a fact about what this machine can reach and what this
   * person is willing to spend, which is why a DEFAULT for it belongs here.
   * A checkout that states one outranks it: a committed setting is the
   * solution's policy, and a personal default is what applies where the
   * solution said nothing.
   */
  readonly transport?: string;
  /** The same, for the vehicle the reviewing roles are dispatched over. */
  readonly reviewer_transport?: string;
  /**
   * This person's own authoring model, where a checkout does not name one.
   *
   * The checkout's `.vscode/settings.json` outranks it, exactly as it does
   * for a vehicle: a committed setting is the solution's policy, and this is
   * what applies where the solution said nothing. It is here so *Set as my
   * default* has somewhere to write that is not a file somebody else clones
   * -- a personal preference committed into a repository is a preference
   * published to everyone who opens it.
   */
  readonly authoring_model?: string;
  /**
   * The model a person chose for a role, by role, as a catalog id.
   *
   * **A selection is not a preference order.** `prefer` ships in the config
   * and is an ordering: a stale entry in it costs a slightly older model.
   * This is an instruction, and the runtime either honours it or stops --
   * which is why it lives where a person's choices live rather than in a
   * file a free refresh may replace whole.
   */
  readonly selected?: Readonly<Record<string, string>>;
  /**
   * The credential this person uses for a provider, by provider, as a NAME.
   *
   * A name and never a value: what is stored here travels no further than
   * the checkout's own reference does, and the key itself is in the
   * platform's store. This is the layer that applies where a solution names
   * no credential of its own, which is every repository an operator opens
   * that was not configured for them.
   */
  readonly credentials?: Readonly<Record<string, string>>;
}

export function preferencesPath(): string {
  return join(catalogDir(), PREFERENCES_FILENAME);
}

let configuredPath: string | null = null;

/**
 * The one seam: where this machine's preferences are.
 *
 * A test speaks through it rather than through the environment, because a
 * suite that read the machine it runs on would pass on one machine and fail
 * on the next -- and one that WROTE it would be editing the operator's own
 * choices as a side effect of proving something else.
 */
export function setPreferencesPath(path: string | null): void {
  configuredPath = path;
}

/**
 * Where this process reads and writes the preferences.
 *
 * **Under the test runner the machine's own path is refused**, exactly as
 * the catalog's is: a test says where its file is, or it does not get one.
 * Which runs are tests is `underTestRunner`, stated once in catalog.ts and
 * imported here rather than restated -- two readings of what a test run is
 * is how the catalog's guard came to watch one runner out of two.
 */
export function currentPreferencesPath(): string {
  if (configuredPath !== null) return configuredPath;
  const named = process.env[PREFERENCES_PATH_ENV];
  if (named !== undefined && named.trim() !== "") return named.trim();
  if (underTestRunner()) {
    throw new Error(
      "no preferences path is set: a test may not read or write this " +
        "machine's own preferences. Call setPreferencesPath() with a path " +
        "under the suite's temp root.",
    );
  }
  return preferencesPath();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/**
 * What this machine has chosen, or an empty set of choices.
 *
 * Never null and never throws: *nothing chosen* is the honest answer to
 * every way of failing to read this file, and it is the same answer a
 * first-run machine gives.
 */
export function readPreferences(path: string = currentPreferencesPath()): Preferences {
  const empty: Preferences = {
    schema_version: PREFERENCES_SCHEMA_VERSION,
    written_by: "",
    written_at: "",
  };
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return empty;
  }
  if (!isRecord(parsed)) return empty;
  if (parsed["schema_version"] !== PREFERENCES_SCHEMA_VERSION) return empty;
  const engine = optionalString(parsed["engine"]);
  const transport = optionalString(parsed["transport"]);
  const reviewerTransport = optionalString(parsed["reviewer_transport"]);
  const authoringModel = optionalString(parsed["authoring_model"]);
  // One torn entry is one role unchosen, not the whole file lost: the
  // choices beside it are still choices this person made.
  const selected: Record<string, string> = {};
  if (isRecord(parsed["selected"])) {
    for (const [role, value] of Object.entries(parsed["selected"])) {
      const model = optionalString(value);
      if (model !== undefined) selected[role] = model;
    }
  }
  const credentials: Record<string, string> = {};
  if (isRecord(parsed["credentials"])) {
    for (const [provider, value] of Object.entries(parsed["credentials"])) {
      const reference = optionalString(value);
      if (reference !== undefined) credentials[provider] = reference;
    }
  }
  return {
    schema_version: PREFERENCES_SCHEMA_VERSION,
    written_by: optionalString(parsed["written_by"]) ?? "",
    written_at: optionalString(parsed["written_at"]) ?? "",
    ...(engine === undefined ? {} : { engine }),
    ...(transport === undefined ? {} : { transport }),
    ...(reviewerTransport === undefined ? {} : { reviewer_transport: reviewerTransport }),
    ...(authoringModel === undefined ? {} : { authoring_model: authoringModel }),
    ...(Object.keys(selected).length === 0 ? {} : { selected }),
    ...(Object.keys(credentials).length === 0 ? {} : { credentials }),
  };
}

/** What a caller may set. An absent member is a thing they did not touch. */
export interface PreferenceChoice {
  /** The engine the next session is offered; "" clears the choice. */
  readonly engine?: string;
  /** This person's own vehicle where a checkout names none; "" clears it. */
  readonly transport?: string;
  /** The same for the reviewing vehicle; "" clears it. */
  readonly reviewerTransport?: string;
  /** This person's own authoring model; "" clears it. */
  readonly authoringModel?: string;
  /** The role whose model is being chosen, with `""` clearing the choice. */
  readonly role?: string;
  readonly selected?: string;
  /** The provider whose credential is being named, with `""` clearing it. */
  readonly credentialProvider?: string;
  readonly credential?: string;
}

/**
 * Write one choice, keeping every other choice the file holds.
 *
 * An empty string CLEARS a field rather than storing one, because "I want no
 * default" is a thing a person can mean and a stored empty string is a
 * choice that reads as one.
 */
export function writePreferences(
  choice: PreferenceChoice,
  options: { path?: string; at?: string } = {},
): Preferences {
  const path = options.path ?? currentPreferencesPath();
  const held = readPreferences(path);
  const engine =
    choice.engine === undefined ? held.engine : optionalString(choice.engine);
  const transport =
    choice.transport === undefined ? held.transport : optionalString(choice.transport);
  const reviewerTransport =
    choice.reviewerTransport === undefined
      ? held.reviewer_transport
      : optionalString(choice.reviewerTransport);
  const authoringModel =
    choice.authoringModel === undefined
      ? held.authoring_model
      : optionalString(choice.authoringModel);
  const selected: Record<string, string> = { ...(held.selected ?? {}) };
  if (choice.role !== undefined && choice.selected !== undefined) {
    const model = optionalString(choice.selected);
    if (model === undefined) delete selected[choice.role];
    else selected[choice.role] = model;
  }
  const credentials: Record<string, string> = { ...(held.credentials ?? {}) };
  if (choice.credentialProvider !== undefined && choice.credential !== undefined) {
    const reference = optionalString(choice.credential);
    if (reference === undefined) delete credentials[choice.credentialProvider];
    else credentials[choice.credentialProvider] = reference;
  }
  const written: Preferences = {
    schema_version: PREFERENCES_SCHEMA_VERSION,
    written_by: `dabbler-ai-router ${VERSION}`,
    written_at: options.at ?? new Date().toISOString(),
    ...(engine === undefined ? {} : { engine }),
    ...(transport === undefined ? {} : { transport }),
    ...(reviewerTransport === undefined ? {} : { reviewer_transport: reviewerTransport }),
    ...(authoringModel === undefined ? {} : { authoring_model: authoringModel }),
    ...(Object.keys(selected).length === 0 ? {} : { selected }),
    ...(Object.keys(credentials).length === 0 ? {} : { credentials }),
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(written, null, 2)}\n`, "utf8");
  return written;
}

/**
 * The directories a configuration reading is derived FROM, deduplicated.
 *
 * The catalog and the preferences normally share one per-user directory;
 * they do not have to, and under a test runner they deliberately do not.
 * Whoever wants to WATCH them has to be told where they actually are rather
 * than where they usually are -- a watcher over the usual place would miss
 * every change on a machine that moved either, and would watch the
 * operator's own files from inside a suite.
 */
export function configurationSourceDirs(): string[] {
  const dirs = new Set<string>();
  for (const read of [currentCatalogPath, currentPreferencesPath]) {
    try {
      dirs.add(dirname(read()));
    } catch {
      // Not readable here, so there is nothing at it to watch either.
    }
  }
  return [...dirs];
}

/** The engine this machine has chosen, or null where nobody has. */
export function chosenEngine(path: string = currentPreferencesPath()): string | null {
  return readPreferences(path).engine ?? null;
}

/**
 * The model this machine chose for `role`, or null where nobody chose.
 *
 * Null is *nobody chose* and is never a default: the two are different
 * facts, and the whole difference between `selected` and `prefer` is that
 * the runtime honours one and merely orders by the other.
 */
export function selectedModel(
  role: string,
  path: string = currentPreferencesPath(),
): string | null {
  return readPreferences(path).selected?.[role] ?? null;
}

/**
 * The credential name this person uses for `provider`, or null.
 *
 * Null is *nobody chose*, which is a different fact from a credential this
 * machine does not hold: the first resolves to the environment variable and
 * the second is a stop.
 */
export function preferredCredential(
  provider: string,
  path: string = currentPreferencesPath(),
): string | null {
  return readPreferences(path).credentials?.[provider] ?? null;
}
