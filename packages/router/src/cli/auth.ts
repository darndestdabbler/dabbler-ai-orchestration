// `dabbler auth` -- the three verbs that put a key on this machine.
//
// **Three, and no fourth.** `set`, `list` and `remove` are the whole of what
// managing a secret store is. Which credential a solution USES is not one of
// them: that is a configured choice, it is a name rather than a value, and
// `dabbler configure` writes it -- one writer for the layers, which is what
// session 157 spent itself establishing.
//
// **A secret is never an argument.** It arrives from a hidden prompt on a
// terminal, or on stdin where there is no terminal, and it appears in no
// argument, no list, no log and no error. A key typed on a command line is
// in the shell's history and in every process listing on the machine for as
// long as the command runs, and neither of those is a thing this framework
// can take back for an operator afterwards.
//
// **`list` prints names and never values, nor prefixes or lengths of them.**
// A masked key is a key: the first six characters of an API key identify the
// account it belongs to.

import {
  CredentialError,
  listCredentials,
  looksLikeASecret,
  removeCredential,
  setCredential,
  storeDescription,
  storeKind,
} from "../credentials.ts";
import { loadConfig } from "../config.ts";
import { writeErr, writeOut } from "./output.ts";

const EXIT_OK = 0;
const EXIT_REFUSED = 1;
const EXIT_USAGE = 2;

const COMMANDS = ["set", "list", "remove"] as const;

function usage(): string {
  return [
    "usage: dabbler auth [-h] {set,list,remove} [...]",
    "",
    "what this machine holds, so a key need not be exported into every shell",
    "",
    "commands:",
    "  set PROVIDER     store a key for PROVIDER under a name. The secret is",
    "                   read from a hidden prompt, or from stdin where there",
    "                   is no terminal; it is never an argument",
    "  list             every credential this machine holds: the name, the",
    "                   provider and when it was stored. Never a value",
    "  remove NAME      forget one credential",
    "",
    "options:",
    "  --name NAME      what to call it; defaults to the provider's own name,",
    "                   which is what a machine with one key per provider wants",
    "  --from-env       take the key from the provider's environment variable,",
    "                   which is where it already is on a machine that has been",
    "                   working. Nothing is prompted for and nothing is typed",
    "  -h, --help       show this message",
    "",
    "A stored credential is named by a setting rather than used automatically:",
    "  dabbler configure --credential <provider>=<name>",
    "",
  ].join("\n");
}

/** The providers block, or nothing where no config loads here. */
function providersBlock(): Record<string, unknown> {
  try {
    const providers = loadConfig()["providers"];
    if (typeof providers === "object" && providers !== null && !Array.isArray(providers)) {
      return providers as Record<string, unknown>;
    }
  } catch {
    // A config this call cannot load is not a reason to refuse a credential
    // that has nothing to do with it.
  }
  return {};
}

/** The providers this distribution knows, read from the config and not listed twice. */
function knownProviders(): string[] {
  return Object.keys(providersBlock()).sort();
}

/** The environment variable a provider reads, or null where it names none. */
function providerVariable(provider: string): string | null {
  const block = providersBlock()[provider];
  if (typeof block !== "object" || block === null || Array.isArray(block)) return null;
  const named = (block as Record<string, unknown>)["api_key_env"];
  return typeof named === "string" && named.trim() !== "" ? named.trim() : null;
}

/**
 * A secret, from a terminal without echoing it or from stdin without a
 * terminal.
 *
 * Raw mode rather than a readline that is told not to print: readline still
 * keeps the line in its own history buffer, and the point of this is that
 * nothing keeps it.
 */
async function readSecret(prompt: string): Promise<string> {
  const input = process.stdin;
  if (!input.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of input) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
  }
  process.stdout.write(prompt);
  input.setRawMode(true);
  input.resume();
  const typed: string[] = [];
  await new Promise<void>((resolve) => {
    const onData = (chunk: Buffer | string): void => {
      for (const character of Buffer.from(chunk).toString("utf8")) {
        // Enter ends it; Ctrl-C abandons it with nothing typed, which the
        // caller reads as "no secret was given" and refuses.
        if (character === "\r" || character === "\n") return finish();
        if (character === "\u0003") {
          typed.length = 0;
          return finish();
        }
        if (character === "\u007f" || character === "\b") typed.pop();
        else typed.push(character);
      }
    };
    const finish = (): void => {
      input.off("data", onData);
      resolve();
    };
    input.on("data", onData);
  });
  input.setRawMode(false);
  input.pause();
  process.stdout.write("\n");
  return typed.join("");
}

function refuse(message: string): number {
  writeErr(`dabbler auth: ${message}\n`);
  return EXIT_REFUSED;
}

async function setCommand(argv: readonly string[]): Promise<number> {
  const [provider, ...rest] = argv;
  if (provider === undefined || provider.startsWith("-")) {
    writeErr(`dabbler auth set: which provider is this key for?\n\n${usage()}`);
    return EXIT_USAGE;
  }
  let name = provider;
  let fromEnvironment = false;
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === "--from-env") {
      fromEnvironment = true;
      continue;
    }
    if (rest[index] !== "--name") {
      writeErr(`dabbler auth set: unexpected argument '${rest[index]}'\n\n${usage()}`);
      return EXIT_USAGE;
    }
    const value = rest[index + 1];
    if (value === undefined || value.trim() === "") {
      writeErr(`dabbler auth set: --name needs a value\n\n${usage()}`);
      return EXIT_USAGE;
    }
    name = value.trim();
    index += 1;
  }
  // A NAME is what a setting carries and what this stores under; a key
  // typed here would be a key in a shell's history, which is the one place
  // this whole verb exists to keep it out of.
  if (looksLikeASecret(name)) {
    return refuse(
      "--name takes a NAME for the credential, not the key itself, and " +
        "what was given looks like a key. It was not stored, and it is not " +
        "printed here. Choose a label -- `--name work` -- and the verb will " +
        "ask for the key without echoing it.",
    );
  }
  const known = knownProviders();
  if (known.length > 0 && !known.includes(provider)) {
    return refuse(
      `'${provider}' is not a provider this distribution reaches. It knows ` +
        `${known.join(", ")}.`,
    );
  }
  // **What is already in the environment, rather than a paste.** On a
  // machine that has been working, the key is in a variable this process
  // can read, and making a person dig it back out of wherever they keep it
  // is how a convenience becomes a reason not to bother.
  //
  // It is resolved BEFORE the store is checked, because what the request
  // asks for is a property of the request and the store is a property of
  // the machine -- the same order the name and the provider are checked in.
  // The PROMPT is the other way round: nobody is asked to type a key that
  // has nowhere to go.
  let secret: string | null = null;
  if (fromEnvironment) {
    const variable = providerVariable(provider);
    if (variable === null) {
      return refuse(`'${provider}' names no environment variable to read a key from.`);
    }
    const held = process.env[variable];
    if (held === undefined || held === "") {
      return refuse(
        `${variable} is not set in this environment, so there is nothing to ` +
          "take. Run this without --from-env and it will ask for the key.",
      );
    }
    secret = held;
  }
  const kind = storeKind();
  if (kind === null) {
    return refuse(
      "this platform has no credential store this framework can use, so " +
        "nothing was stored and no plain file was written. Supply the key " +
        "through the provider's environment variable instead -- `dabbler " +
        "configuration explain` names the one each provider reads.",
    );
  }
  if (secret === null) secret = await readSecret(`Key for ${provider} (not echoed): `);
  if (secret.trim() === "") return refuse("no secret was given, so nothing was stored.");
  try {
    const entry = setCredential(name, provider, secret);
    writeOut(
      `auth: '${entry.name}' stored for ${entry.provider} in ${storeDescription(kind)}.\n` +
        `Name it in this checkout with: dabbler configure --credential ${provider}=${entry.name}\n`,
    );
    return EXIT_OK;
  } catch (error) {
    return refuse(error instanceof CredentialError ? error.message : String(error));
  }
}

function listCommand(): number {
  const kind = storeKind();
  const entries = listCredentials();
  if (entries.length === 0) {
    writeOut(
      kind === null
        ? "auth: this machine holds no credentials, and this platform has no store this framework can use.\n"
        : `auth: this machine holds no credentials. The store is ${storeDescription(kind)}.\n`,
    );
    return EXIT_OK;
  }
  const width = Math.max(...entries.map((entry) => entry.name.length));
  const lines = entries.map(
    (entry) => `  ${entry.name.padEnd(width)}  ${entry.provider}  stored ${entry.storedAt}`,
  );
  writeOut(
    [
      `auth: ${entries.length} credential(s) in ${kind === null ? "a store this platform no longer has" : storeDescription(kind)}:`,
      ...lines,
      "",
    ].join("\n"),
  );
  return EXIT_OK;
}

function removeCommand(argv: readonly string[]): number {
  const [name] = argv;
  if (name === undefined || name.startsWith("-")) {
    writeErr(`dabbler auth remove: which credential?\n\n${usage()}`);
    return EXIT_USAGE;
  }
  try {
    if (!removeCredential(name)) {
      return refuse(`this machine holds no credential called '${name}'.`);
    }
  } catch (error) {
    return refuse(error instanceof CredentialError ? error.message : String(error));
  }
  writeOut(
    `auth: '${name}' is gone. A setting that still names it is now a stop, ` +
      "which `dabbler configuration explain` will say.\n",
  );
  return EXIT_OK;
}

export async function authVerb(argv: string[]): Promise<number> {
  if (argv.length === 0 || argv.includes("-h") || argv.includes("--help")) {
    writeOut(usage());
    return argv.length === 0 ? EXIT_USAGE : EXIT_OK;
  }
  const [command, ...rest] = argv as [string, ...string[]];
  if (!(COMMANDS as readonly string[]).includes(command)) {
    writeErr(`dabbler auth: unknown command '${command}'\n\n${usage()}`);
    return EXIT_USAGE;
  }
  if (command === "set") return setCommand(rest);
  if (command === "list") return listCommand();
  return removeCommand(rest);
}
