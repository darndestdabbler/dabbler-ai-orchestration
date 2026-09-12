// The keys an operator can change without editing their environment.
//
// **A value lives in the platform's store; a NAME lives everywhere else.**
// This module is the only thing in the router that holds a secret value, and
// it holds one for as long as one process runs. Everything above it --
// settings, preferences, the projection, the pane -- carries a reference: a
// name that says which credential, and never the credential.
//
// **One index, three platforms.** The index is a small JSON file beside the
// catalog and the preferences, and it says what credentials exist, which
// provider each is for, and when it was stored. Where the platform keeps the
// VALUE differs: on Windows there is no user-level secret service, so the
// value is DPAPI ciphertext inside the index itself; on macOS and Linux the
// value is in the system store and the index holds no ciphertext at all.
// One file to list from either way, because a list that read three different
// places would answer differently depending on where it ran.
//
// **What Windows does is DPAPI encryption of a file this application owns,
// and it is NOT Windows Credential Manager.** `docs/design/credential-store.md`
// is the page that says so, with the operator's approval, the scope that
// actually protects it, and what was traded away. Do not restate the
// argument here; do not contradict it.
//
// **A platform with no store has no store.** There is no fallback to a plain
// file, because an operator who believes a key is protected and finds it in
// plaintext is worse off than one who was told to keep using an environment
// variable.
//
// **The secret is never an argument.** Not to this module's own spawns and
// not to the verbs above it: a command line is in a shell's history and in
// every process listing on the machine. It travels on stdin, and a child's
// stderr is scrubbed of it before anything prints.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";

import { catalogDir, underTestRunner } from "./catalog.ts";
import { preferredCredential } from "./preferences.ts";
import {
  CREDENTIAL_SETTING_BY_PROVIDER,
  SETTINGS_RELPATH,
  settingValue,
  type SettingKey,
} from "./settings.ts";
import { VERSION } from "./version.ts";

/** The shape this router writes and the only one it reads. */
export const CREDENTIALS_SCHEMA_VERSION = 1;

export const CREDENTIALS_FILENAME = "credentials.json";

/**
 * Where a suite that cannot call `setCredentialsPath` says its index is.
 *
 * The catalog's seam and the preferences' seam, for the same caller and the
 * same reason: the extension's suite reaches the router through a published
 * contract that deliberately does not export the modules behind it.
 */
export const CREDENTIALS_PATH_ENV = "DABBLER_CREDENTIALS_PATH";

/** What each platform's store is called, in the words a message uses. */
export type StoreKind = "dpapi" | "keychain" | "secret-service";

/** The service name a system store files these under. */
const SERVICE = "dabbler";

/** A credential this machine holds, as everything except its value. */
export interface CredentialEntry {
  readonly name: string;
  readonly provider: string;
  readonly storedAt: string;
}

/** A store operation that could not be done, in terms an operator can act on. */
export class CredentialError extends Error {}

export function credentialsPath(): string {
  return join(catalogDir(), CREDENTIALS_FILENAME);
}

let configuredPath: string | null = null;

/**
 * The one seam: where this machine's credential index is.
 *
 * Setting it drops whatever was decrypted for the old one. A cache that
 * survived a change of path would answer a test with the operator's own
 * credentials, which is the one thing this seam exists to prevent.
 */
export function setCredentialsPath(path: string | null): void {
  configuredPath = path;
  cached = null;
}

/**
 * Where this process reads and writes the index.
 *
 * Under the test runner the machine's own path is refused, exactly as the
 * catalog's and the preferences' are.
 */
export function currentCredentialsPath(): string {
  if (configuredPath !== null) return configuredPath;
  const named = process.env[CREDENTIALS_PATH_ENV];
  if (named !== undefined && named.trim() !== "") return named.trim();
  if (underTestRunner()) {
    throw new Error(
      "no credentials path is set: a test may not read or write this " +
        "machine's own credentials. Call setCredentialsPath() with a path " +
        "under the suite's temp root.",
    );
  }
  return credentialsPath();
}

/** Windows PowerShell, at the path the system owns rather than the one PATH found. */
function windowsPowerShell(): string {
  const root = process.env["SystemRoot"] ?? "C:\\Windows";
  return join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}

/**
 * The environment a PowerShell spawn gets.
 *
 * **`PSModulePath` is replaced, not inherited.** Measured 2026-09-12: with
 * PowerShell 7's module directories ahead of 5.1's -- which is what a
 * session on this machine inherits -- Windows PowerShell fails to autoload
 * `Microsoft.PowerShell.Security` with `CouldNotAutoloadMatchingModule`, and
 * `ConvertFrom-SecureString` is not a command at all. Inheriting it would
 * work on a machine with no PowerShell 7 and fail on one that has it.
 */
function powerShellEnv(): NodeJS.ProcessEnv {
  const root = process.env["SystemRoot"] ?? "C:\\Windows";
  return {
    ...process.env,
    PSModulePath: join(root, "System32", "WindowsPowerShell", "v1.0", "Modules"),
  };
}

function onPath(program: string): boolean {
  const path = process.env["PATH"] ?? "";
  for (const dir of path.split(delimiter)) {
    if (dir !== "" && existsSync(join(dir, program))) return true;
  }
  return false;
}

/**
 * Which store this platform has, or null where it has none.
 *
 * Null is a real answer and the callers act on it: it is what turns `auth
 * set` into a refusal that names an environment variable.
 */
export function storeKind(platform: string = process.platform): StoreKind | null {
  if (platform === "win32") return existsSync(windowsPowerShell()) ? "dpapi" : null;
  if (platform === "darwin") return onPath("security") ? "keychain" : null;
  return onPath("secret-tool") ? "secret-service" : null;
}

/** What each store is called where a person reads it. */
export function storeDescription(kind: StoreKind): string {
  if (kind === "dpapi") {
    return "a DPAPI-encrypted file this application owns (not Windows Credential Manager)";
  }
  if (kind === "keychain") return "the macOS keychain, through `security`";
  return "the Secret Service keyring, through `secret-tool`";
}

/** Every occurrence of the secret replaced, so a child's complaint cannot carry it. */
function scrub(text: string, secret: string): string {
  return secret === "" ? text : text.split(secret).join("<redacted>");
}

interface Spawned {
  readonly ok: boolean;
  readonly out: string;
  readonly err: string;
}

function spawnWith(
  program: string,
  args: readonly string[],
  input: string,
  env?: NodeJS.ProcessEnv,
): Spawned {
  const result = spawnSync(program, [...args], {
    input,
    encoding: "utf8",
    ...(env === undefined ? {} : { env }),
  });
  if (result.error !== undefined) {
    return { ok: false, out: "", err: result.error.message };
  }
  return {
    ok: result.status === 0,
    out: result.stdout ?? "",
    err: (result.stderr ?? "").trim(),
  };
}

/**
 * The script that encrypts. The secret arrives on stdin and is in no
 * argument; the script itself holds nothing worth reading.
 */
const SEAL_SCRIPT =
  "$ErrorActionPreference='Stop';" +
  "$plain=[Console]::In.ReadToEnd();" +
  "Write-Output (ConvertFrom-SecureString (ConvertTo-SecureString $plain -AsPlainText -Force))";

/**
 * The script that decrypts, for EVERY entry in one spawn.
 *
 * One spawn costs about 300 ms on this machine and `providerReachable` is
 * called in loops over providers and candidate models, so the whole store is
 * decrypted once per process rather than once per read. Ciphertext in, a
 * JSON object of name to value out.
 */
const UNSEAL_SCRIPT =
  "$ErrorActionPreference='Stop';" +
  "$in=[Console]::In.ReadToEnd()|ConvertFrom-Json;" +
  "$out=@{};" +
  "foreach($k in $in.PSObject.Properties.Name){" +
  "$s=ConvertTo-SecureString $in.$k;" +
  "$b=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s);" +
  "$out[$k]=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($b);" +
  "[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b)};" +
  "Write-Output ($out|ConvertTo-Json -Compress)";

const POWERSHELL_ARGS = ["-NoProfile", "-NonInteractive", "-Command"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** What the index holds for one credential. `sealed` exists on Windows only. */
interface IndexEntry {
  readonly provider: string;
  readonly stored_at: string;
  readonly sealed?: string;
}

interface CredentialIndex {
  readonly entries: Record<string, IndexEntry>;
}

/**
 * What the index says, or nothing.
 *
 * Never throws. A missing file, a torn one and one from a schema this router
 * does not know are all *no credentials*, which is what a first-run machine
 * says too -- and a framework that stopped over this file would be stopping
 * over something an operator can simply store again.
 */
function readIndex(path: string): CredentialIndex {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return { entries: {} };
  }
  if (!isRecord(parsed) || parsed["schema_version"] !== CREDENTIALS_SCHEMA_VERSION) {
    return { entries: {} };
  }
  const entries: Record<string, IndexEntry> = {};
  if (isRecord(parsed["entries"])) {
    for (const [name, value] of Object.entries(parsed["entries"])) {
      if (!isRecord(value)) continue;
      const provider = value["provider"];
      const storedAt = value["stored_at"];
      if (typeof provider !== "string" || typeof storedAt !== "string") continue;
      const sealed = value["sealed"];
      entries[name] = {
        provider,
        stored_at: storedAt,
        ...(typeof sealed === "string" ? { sealed } : {}),
      };
    }
  }
  return { entries };
}

function writeIndex(path: string, index: CredentialIndex): void {
  const document = {
    schema_version: CREDENTIALS_SCHEMA_VERSION,
    written_by: `dabbler-ai-router ${VERSION}`,
    entries: index.entries,
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  cached = null;
}

/** The decrypted store for one path, for the life of one process. */
let cached: { path: string; values: Map<string, string> } | null = null;

function noStore(): CredentialError {
  return new CredentialError(
    "this platform has no credential store this framework can use " +
      "(Windows uses PowerShell's DPAPI, macOS `security`, Linux " +
      "`secret-tool`), so nothing was written. Supply the key through the " +
      "provider's environment variable instead -- `dabbler configuration " +
      "explain` names the one each provider reads.",
  );
}

/** What `auth list` shows: every credential, and not one value. */
export function listCredentials(path: string = currentCredentialsPath()): CredentialEntry[] {
  const index = readIndex(path);
  return Object.entries(index.entries)
    .map(([name, entry]) => ({ name, provider: entry.provider, storedAt: entry.stored_at }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

/** True where this machine holds a credential of that name. */
export function holdsCredential(name: string, path: string = currentCredentialsPath()): boolean {
  return readIndex(path).entries[name] !== undefined;
}

/**
 * The provider a stored credential was stored FOR, or null where there is
 * no credential of that name here.
 *
 * A credential is bound to a vendor and not only to a label. Without this
 * a reference could point one provider at another's key -- which sends the
 * key to a vendor it was not issued by, bills an account nobody chose, and
 * fails as an authentication error three layers away from the setting that
 * caused it.
 */
export function credentialProvider(
  name: string,
  path: string = currentCredentialsPath(),
): string | null {
  return readIndex(path).entries[name]?.provider ?? null;
}

/**
 * Store a value under `name`, for `provider`.
 *
 * Replaces a credential of the same name rather than refusing it: rotating a
 * key is the commonest reason anyone runs this, and a verb that made a
 * person remove before setting would be a verb that leaves them keyless in
 * between.
 */
export function setCredential(
  name: string,
  provider: string,
  secret: string,
  options: { path?: string; at?: string; platform?: string } = {},
): CredentialEntry {
  const path = options.path ?? currentCredentialsPath();
  const kind = storeKind(options.platform ?? process.platform);
  if (kind === null) throw noStore();
  if (secret.trim() === "") {
    throw new CredentialError("no secret was given, so nothing was stored.");
  }
  const index = readIndex(path);
  const storedAt = options.at ?? new Date().toISOString();
  let sealed: string | undefined;
  if (kind === "dpapi") {
    const run = spawnWith(
      windowsPowerShell(),
      [...POWERSHELL_ARGS, SEAL_SCRIPT],
      secret,
      powerShellEnv(),
    );
    if (!run.ok || run.out.trim() === "") {
      throw new CredentialError(
        `the credential could not be encrypted: ${scrub(run.err, secret) || "the encryption step produced nothing"}`,
      );
    }
    sealed = run.out.trim();
  } else if (kind === "keychain") {
    // **`security -i` reads its COMMAND from stdin, and that is the only
    // way to hand it a password without putting one in an argument.** `-w`
    // with no value does not read stdin: it prompts on the controlling
    // terminal, so piping to it stores nothing and hangs where there is a
    // tty. With `-i` the whole command line -- password included -- travels
    // on the pipe, and no process on the machine lists it.
    //
    // The name and the provider are this framework's own and cannot carry a
    // quote; the secret can, so it is the one field escaped. `-U` updates
    // an existing item rather than refusing it, because rotating a key is
    // the commonest reason anyone runs this.
    const quoted = `"${secret.split("\\").join("\\\\").split('"').join('\\"')}"`;
    const run = spawnWith(
      "security",
      ["-i"],
      `add-generic-password -U -s ${SERVICE} -a ${name} -w ${quoted}\n`,
    );
    if (!run.ok) {
      throw new CredentialError(
        `the keychain refused the credential: ${scrub(run.err, secret) || "no reason given"}`,
      );
    }
  } else {
    const run = spawnWith(
      "secret-tool",
      ["store", "--label", `dabbler ${name}`, "service", SERVICE, "account", name],
      secret,
    );
    if (!run.ok) {
      throw new CredentialError(
        `the keyring refused the credential: ${scrub(run.err, secret) || "no reason given"}`,
      );
    }
  }
  writeIndex(path, {
    entries: {
      ...index.entries,
      [name]: { provider, stored_at: storedAt, ...(sealed === undefined ? {} : { sealed }) },
    },
  });
  return { name, provider, storedAt };
}

/** Forget it. False where this machine held no such credential. */
export function removeCredential(
  name: string,
  options: { path?: string; platform?: string } = {},
): boolean {
  const path = options.path ?? currentCredentialsPath();
  const index = readIndex(path);
  if (index.entries[name] === undefined) return false;
  const kind = storeKind(options.platform ?? process.platform);
  if (kind === "keychain") {
    spawnWith("security", ["delete-generic-password", "-s", SERVICE, "-a", name], "");
  } else if (kind === "secret-service") {
    spawnWith("secret-tool", ["clear", "service", SERVICE, "account", name], "");
  }
  const entries = { ...index.entries };
  delete entries[name];
  if (Object.keys(entries).length === 0 && existsSync(path)) {
    rmSync(path);
    cached = null;
  } else {
    writeIndex(path, { entries });
  }
  return true;
}

/** Every value this machine holds, decrypted in ONE spawn and kept for this process. */
function decryptAll(path: string, platform: string): Map<string, string> {
  if (cached !== null && cached.path === path) return cached.values;
  const index = readIndex(path);
  const values = new Map<string, string>();
  const kind = storeKind(platform);
  if (kind === "dpapi") {
    const sealed: Record<string, string> = {};
    for (const [name, entry] of Object.entries(index.entries)) {
      if (entry.sealed !== undefined) sealed[name] = entry.sealed;
    }
    if (Object.keys(sealed).length > 0) {
      const run = spawnWith(
        windowsPowerShell(),
        [...POWERSHELL_ARGS, UNSEAL_SCRIPT],
        JSON.stringify(sealed),
        powerShellEnv(),
      );
      if (run.ok) {
        try {
          const parsed: unknown = JSON.parse(run.out.trim());
          if (isRecord(parsed)) {
            for (const [name, value] of Object.entries(parsed)) {
              if (typeof value === "string") values.set(name, value);
            }
          }
        } catch {
          // A store this process cannot decrypt is a store with nothing in
          // it, and the reference that names one of its entries becomes the
          // stop the caller already has words for.
        }
      }
    }
  } else if (kind !== null) {
    for (const name of Object.keys(index.entries)) {
      const run =
        kind === "keychain"
          ? spawnWith("security", ["find-generic-password", "-s", SERVICE, "-a", name, "-w"], "")
          : spawnWith("secret-tool", ["lookup", "service", SERVICE, "account", name], "");
      if (run.ok && run.out !== "") values.set(name, run.out.replace(/\r?\n$/, ""));
    }
  }
  cached = { path, values };
  return values;
}

/**
 * The value stored under `name`, or null where this machine has none.
 *
 * Null covers every way of not having it -- never stored, removed, a store
 * this account cannot decrypt -- because to every caller they are the same
 * fact: there is no key here, and a reference that named one is a stop.
 */
export function credentialValue(
  name: string,
  options: { path?: string; platform?: string } = {},
): string | null {
  // `currentCredentialsPath` throws under the test runner where nothing has
  // armed a path, and that throw is deliberately not caught: a suite that
  // read the operator's own store would pass here and fail on the next
  // machine, and the refusal names what to arm.
  const path = options.path ?? currentCredentialsPath();
  if (!existsSync(path)) return null;
  return decryptAll(path, options.platform ?? process.platform).get(name) ?? null;
}

/** Drop what this process decrypted. For a caller that has just written. */
export function forgetDecrypted(): void {
  cached = null;
}

// ---------------------------------------------------------------------------
// Which key a provider uses, and which layer said so.
//
// **One order, stated once: the process environment, then the solution's
// reference, then this person's default.** The environment is first because
// that is how CI injects a key, and because the only precedence worth having
// is one that can be explained in a sentence. Nothing below reads a value
// out of a settings file or a preferences file: both hold a NAME.
//
// This module deliberately does not import `config.ts`. It is handed a
// provider block that `loadConfig` has already stamped with the reference it
// resolved, so the root is known where roots are known -- at the load -- and
// not threaded through seven call sites that have no business knowing one.
// ---------------------------------------------------------------------------

/** The key `loadConfig` stamps a resolved reference onto a provider block as. */
export const CREDENTIAL_REFERENCE_KEY = "credential_reference";
/** And the layer that chose it, in the words a refusal uses. */
export const CREDENTIAL_LAYER_KEY = "credential_reference_layer";
/**
 * The provider's own name, stamped beside the reference.
 *
 * `providerSecret` is handed a block and nothing else, and it has to know
 * which vendor the block is for to refuse a credential stored for another
 * one. Threading the name through seven call sites instead would put the
 * same fact in seven places.
 */
export const CREDENTIAL_PROVIDER_KEY = "provider_name";

/** A configured reference, and which layer named it. */
export interface CredentialReference {
  readonly name: string;
  /** The file, as a person would go and edit it. */
  readonly layer: string;
  /** The command that changes it, ready to be printed. */
  readonly fix: string;
}

/**
 * The credential this repository, or this person, has named for `provider`.
 *
 * The checkout outranks the person, exactly as it does for a vehicle and a
 * model: a committed setting is the solution's policy and a personal default
 * is what applies where the solution said nothing.
 */
export function credentialReferenceFor(
  provider: string,
  root: string | null,
): CredentialReference | null {
  const key = (CREDENTIAL_SETTING_BY_PROVIDER as Record<string, SettingKey | undefined>)[provider];
  if (root !== null && key !== undefined) {
    const named = settingValue(root, key);
    if (named !== null) {
      return {
        name: named,
        layer: `${SETTINGS_RELPATH} (\`${key}\`)`,
        fix: `dabbler configure --credential ${provider}=<name>`,
      };
    }
  }
  let personal: string | null = null;
  try {
    personal = preferredCredential(provider);
  } catch {
    // Under a test runner with nothing armed there is no personal layer to
    // read, which is the same answer as a machine that chose nothing.
  }
  if (personal === null) return null;
  return {
    name: personal,
    layer: "your own preferences.json",
    fix: `dabbler configure --credential ${provider}=<name> --mine`,
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * The vendor prefixes an API key is recognisably issued under.
 *
 * Stated rather than inferred, because the whole value of this check is
 * that it fires on the thing an operator is most likely to paste.
 */
const KEY_PREFIXES = ["sk-", "sk-ant-", "AIza", "gsk_", "ghp_", "github_pat_", "xai-"] as const;

/**
 * Does this look like a KEY rather than the NAME of one?
 *
 * **A false positive costs a rename; a false negative commits an API key to
 * a repository.** So the two rules are deliberately blunt: a recognisable
 * vendor prefix, or a token long enough that nobody would type it as a
 * label. A credential name is something like `client-a` or `work`, chosen
 * by a person to tell two of them apart, and thirty-two unbroken characters
 * is not that.
 *
 * The value is never returned, logged or echoed by anything that calls
 * this. The answer is a boolean.
 */
export function looksLikeASecret(value: string): boolean {
  const candidate = value.trim();
  if (candidate === "") return false;
  if (KEY_PREFIXES.some((prefix) => candidate.startsWith(prefix))) return true;
  return candidate.length >= 32 && !/\s/.test(candidate);
}

/**
 * The key to dispatch `providerBlock` with, or null where there is none.
 *
 * Null is every way of not having a key, including a reference that names a
 * credential this machine does not hold -- because to a caller deciding
 * whether a provider is reachable they are the same fact. What makes the
 * dangling reference different is `providerKeyStop`, which says so in
 * words; a caller that must not proceed silently asks that too.
 */
export function providerSecret(providerBlock: Record<string, unknown>): string | null {
  const variable = text(providerBlock["api_key_env"]);
  if (variable !== "") {
    const fromEnvironment = process.env[variable];
    if (fromEnvironment !== undefined && fromEnvironment !== "") return fromEnvironment;
  }
  const reference = text(providerBlock[CREDENTIAL_REFERENCE_KEY]);
  if (reference === "") return null;
  // A credential stored for another vendor is not this vendor's key, and
  // using it would send one vendor's secret to another's endpoint. The
  // mismatch is a stop rather than a fall-through; `providerKeyStop` says
  // so in words.
  const provider = text(providerBlock[CREDENTIAL_PROVIDER_KEY]);
  if (provider !== "") {
    const storedFor = credentialProvider(reference);
    if (storedFor !== null && storedFor !== provider) return null;
  }
  const value = credentialValue(reference);
  return value === "" ? null : value;
}

/**
 * Why a configured reference cannot be used, or null.
 *
 * **A reference that names nothing is a stop, never a fall to the next
 * layer.** Falling through would change which key -- and so which account --
 * is billed, without saying so, and it would rebuild in this order the exact
 * silent shadowing session 157 deleted the transport variable for.
 */
export function providerKeyStop(
  provider: string,
  providerBlock: Record<string, unknown>,
): string | null {
  const variable = text(providerBlock["api_key_env"]);
  // **A key typed where the NAME of a variable belongs.** It resolves to
  // nothing -- `process.env["sk-ant-..."]` is undefined -- so without this
  // the operator sees "no key" over a file they can plainly see the key in.
  // The value is named by its shape and never printed.
  if (variable !== "" && looksLikeASecret(variable)) {
    return (
      `${provider}'s \`api_key_env\` holds what looks like a key rather than ` +
      "the NAME of an environment variable, so nothing can read it. That " +
      "file is committed and a key in it is published to everyone who " +
      `clones. Remove it, then store the key here with \`dabbler auth set ` +
      `${provider}\` and name it with \`dabbler configure --credential ` +
      `${provider}=<name>\`.`
    );
  }
  const reference = text(providerBlock[CREDENTIAL_REFERENCE_KEY]);
  if (reference === "") return null;
  // The same mistake one layer up: a key pasted where a credential's name
  // goes. It is never stored and never echoed back.
  if (looksLikeASecret(reference)) {
    const layer = text(providerBlock[CREDENTIAL_LAYER_KEY]) || "a configured layer";
    return (
      `the credential named for ${provider} in ${layer} looks like a KEY ` +
      "rather than the name of one. A name is what travels in a setting; " +
      "the value belongs in this machine's own store. Nothing was read from " +
      `it and it is not printed here. Run \`dabbler auth set ${provider} ` +
      `--name <name>\`, then \`dabbler configure --credential ` +
      `${provider}=<name>\`, and take the key out of that file.`
    );
  }
  // Stored, but for someone else. This is checked BEFORE the environment,
  // because a setting that points one vendor at another's key is wrong
  // whether or not a variable is currently covering for it.
  const storedFor = credentialProvider(reference);
  if (storedFor !== null && storedFor !== provider) {
    return (
      `the credential '${reference}' was stored for ${storedFor}, and ${provider} ` +
      "is configured to use it. A credential belongs to the vendor that " +
      "issued it: using it here would send one vendor's key to another's " +
      `endpoint. Store ${provider}'s own with \`dabbler auth set ${provider} ` +
      `--name <name>\`, or point ${provider} at a credential stored for it.`
    );
  }
  if (variable !== "" && (process.env[variable] ?? "") !== "") return null;
  if (credentialValue(reference) !== null) return null;
  const layer = text(providerBlock[CREDENTIAL_LAYER_KEY]) || "a configured layer";
  return (
    `${provider} is configured to use the credential '${reference}', and this ` +
    `machine holds no credential of that name. It was named in ${layer}. ` +
    `Store it with \`dabbler auth set ${provider} --name ${reference}\`, or ` +
    `name a different one; \`dabbler auth list\` says what this machine has. ` +
    `Setting ${variable || "the provider's environment variable"} also works ` +
    "and outranks the reference."
  );
}
