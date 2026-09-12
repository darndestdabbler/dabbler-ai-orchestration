// The store, against the platform this machine actually has.
//
// **One of these skips where there is no store, saying so.** Only the round
// trip needs a real one -- the container image has neither PowerShell nor
// `secret-tool`, and asserting a round trip there would be asserting
// something about a machine that cannot do it. Everything else is arranged
// from a seeded index and runs everywhere, because what a listing carries,
// what a refusal says and whether a removal is a removal are not platform
// facts. CI on `windows-latest` proves the round trip;
// `docs/design/suite-runners.md` carries the same list, and
// `docs/design/credential-store.md` says what the store is on each platform.

import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import { authVerb } from "../src/cli/auth.ts";
import { configurationVerb } from "../src/cli/configuration.ts";
import { capture } from "../src/output.ts";
import {
  CREDENTIALS_FILENAME,
  CREDENTIALS_SCHEMA_VERSION,
  CREDENTIAL_LAYER_KEY,
  CREDENTIAL_REFERENCE_KEY,
  CredentialError,
  credentialProvider,
  credentialReferenceFor,
  credentialValue,
  currentCredentialsPath,
  holdsCredential,
  listCredentials,
  looksLikeASecret,
  providerKeyStop,
  providerSecret,
  removeCredential,
  setCredential,
  setCredentialsPath,
  storeKind,
} from "../src/credentials.ts";
import {
  currentPreferencesPath,
  setPreferencesPath,
  writePreferences,
} from "../src/preferences.ts";
import { resolveSecret } from "../src/secretResolver.ts";
import { tempDir } from "./support/answers.ts";

const ARMED = currentCredentialsPath();
const ARMED_PREFERENCES = currentPreferencesPath();
afterEach(() => {
  setCredentialsPath(ARMED);
  setPreferencesPath(ARMED_PREFERENCES);
});

function inTemp(): string {
  const path = join(tempDir("credentials-"), CREDENTIALS_FILENAME);
  setCredentialsPath(path);
  return path;
}

/** A value shaped like the thing this protects, so a leak is recognisable. */
const SECRET = "sk-ant-api03-159-DoNotEcho-7f3a9c2e";

/** Said in the test's own words rather than left as a silent pass. */
const NO_STORE = storeKind() === null ? "this platform has no credential store" : false;

/** An index as a machine that had stored something would have left it. */
function seed(path: string): void {
  writeFileSync(
    path,
    `${JSON.stringify(
      {
        schema_version: CREDENTIALS_SCHEMA_VERSION,
        written_by: "a previous run",
        entries: {
          work: { provider: "anthropic", stored_at: "2026-09-12T00:00:00.000Z", sealed: "01000000d0" },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

describe("the store this platform has", () => {
  it(
    "round-trips a credential through the real store, and writes no plaintext",
    { skip: NO_STORE },
    () => {
      const path = inTemp();
      const entry = setCredential("work", "anthropic", SECRET, { path });
      assert.equal(entry.provider, "anthropic");
      assert.equal(credentialValue("work", { path }), SECRET);
      // Through the seam every caller uses, not only the module's own door.
      setCredentialsPath(path);
      assert.equal(resolveSecret("work", "store"), SECRET);
      // And the file it left behind. A `sealed` blob that happened to hold
      // the key would be a store that encrypted nothing.
      assert.ok(!readFileSync(path, "utf8").includes(SECRET));
    },
  );

  it("lists what a person chooses between, and nothing that could be a value", () => {
    const path = inTemp();
    seed(path);
    const listed = listCredentials(path);
    assert.deepEqual(listed, [
      { name: "work", provider: "anthropic", storedAt: "2026-09-12T00:00:00.000Z" },
    ]);
    // Stated as the whole shape rather than as an absence: a field added
    // later that carried ciphertext would pass an `assert.ok(!includes)` and
    // fail this.
    assert.deepEqual(Object.keys(listed[0] as object).sort(), ["name", "provider", "storedAt"]);
  });

  it("refuses on a platform with no store, and names the environment variable", () => {
    const path = inTemp();
    assert.equal(storeKind("sunos"), null);
    assert.throws(
      () => setCredential("work", "google", SECRET, { path, platform: "sunos" }),
      (error: unknown) =>
        error instanceof CredentialError &&
        /environment variable/.test(error.message) &&
        // The one path that has the secret in hand must not print it.
        !error.message.includes(SECRET),
    );
    // Nothing was written: a store that degraded to a plain file would be
    // worse than the refusal, because the operator would believe otherwise.
    assert.equal(existsSync(path), false);
  });

  it("reads the checkout's reference over this person's, and neither over the environment", () => {
    const root = tempDir("credential-layers-");
    mkdirSync(join(root, ".vscode"), { recursive: true });

    // Nobody has said anything: no reference, and the provider falls to its
    // environment variable, which is what every machine does today.
    assert.equal(credentialReferenceFor("openai", root), null);

    setPreferencesPath(join(tempDir("credential-prefs-"), "preferences.json"));
    writePreferences({ credentialProvider: "openai", credential: "mine" });
    assert.equal(credentialReferenceFor("openai", root)?.name, "mine");

    writeFileSync(
      join(root, ".vscode", "settings.json"),
      `${JSON.stringify({ "dabbler.credentials.openai": "the-solution's" }, null, 2)}\n`,
      "utf8",
    );
    const decided = credentialReferenceFor("openai", root);
    assert.equal(decided?.name, "the-solution's");
    // The layer travels with the value, because a refusal that cannot name
    // where a value came from is a refusal nobody can act on.
    assert.match(String(decided?.layer), /settings\.json/);
  });

  it("puts the environment above a reference, and stops on one that names nothing", () => {
    const path = inTemp();
    seed(path);
    const block = {
      api_key_env: "DABBLER_TEST_159_KEY",
      [CREDENTIAL_REFERENCE_KEY]: "absent",
      [CREDENTIAL_LAYER_KEY]: ".vscode/settings.json (`dabbler.credentials.openai`)",
    };

    // A reference naming nothing is a STOP and never a fall through to the
    // next layer: which key answers decides which account is billed.
    assert.equal(providerSecret(block), null);
    const stop = providerKeyStop("openai", block);
    assert.match(String(stop), /'absent'/);
    assert.match(String(stop), /settings\.json/);
    assert.match(String(stop), /dabbler auth set openai/);

    // And the environment is first, which is how CI injects a key. With one
    // set there is nothing left to stop over.
    process.env["DABBLER_TEST_159_KEY"] = "from-the-environment";
    try {
      assert.equal(providerSecret(block), "from-the-environment");
      assert.equal(providerKeyStop("openai", block), null);
    } finally {
      delete process.env["DABBLER_TEST_159_KEY"];
    }
  });

  it("refuses a key sitting where a name belongs, at either layer, without echoing it", () => {
    const path = inTemp();
    seed(path);
    // A name is a label a person chose; a key is what a vendor issued. The
    // two rules are blunt on purpose: a false positive costs a rename and a
    // false negative commits an API key to a repository.
    assert.equal(looksLikeASecret("client-a"), false);
    assert.equal(looksLikeASecret("my work key"), false);
    assert.equal(looksLikeASecret(SECRET), true);
    assert.equal(looksLikeASecret("AIzaSyA-short"), true);
    assert.equal(looksLikeASecret("a".repeat(32)), true);

    // A key pasted as the credential's NAME in a committed setting.
    const pasted = {
      api_key_env: "DABBLER_TEST_159_KEY",
      [CREDENTIAL_REFERENCE_KEY]: SECRET,
      [CREDENTIAL_LAYER_KEY]: ".vscode/settings.json (`dabbler.credentials.openai`)",
    };
    const stop = String(providerKeyStop("openai", pasted));
    assert.match(stop, /looks like a KEY/);
    assert.match(stop, /dabbler auth set openai/);
    assert.ok(!stop.includes(SECRET), stop);
    assert.equal(providerSecret(pasted), null);

    // And a key pasted where the NAME OF A VARIABLE belongs, which resolves
    // to nothing at all and used to read as "no key" over a file the
    // operator can plainly see the key in.
    const inVariable = { api_key_env: SECRET };
    const variableStop = String(providerKeyStop("openai", inVariable));
    assert.match(variableStop, /the NAME of an environment variable/);
    assert.ok(!variableStop.includes(SECRET), variableStop);
  });

  it("will not let one provider use a credential stored for another", () => {
    // A credential belongs to the vendor that issued it. Without this a
    // reference could point openai at an anthropic key: one vendor's secret
    // sent to another's endpoint, billed to an account nobody chose, and
    // failing three layers from the setting that caused it.
    const path = inTemp();
    seed(path);
    assert.equal(credentialProvider("work", path), "anthropic");
    const misdirected = {
      provider_name: "openai",
      api_key_env: "DABBLER_TEST_159_KEY",
      [CREDENTIAL_REFERENCE_KEY]: "work",
      [CREDENTIAL_LAYER_KEY]: ".vscode/settings.json (dabbler.credentials.openai)",
    };
    assert.equal(providerSecret(misdirected), null);
    const stop = String(providerKeyStop("openai", misdirected));
    assert.match(stop, /stored for anthropic/);
    assert.match(stop, /dabbler auth set openai/);
    // The same block, pointed at a credential that IS this vendor's, has
    // nothing to stop over on those grounds.
    const matched = providerKeyStop("anthropic", {
      ...misdirected,
      provider_name: "anthropic",
    });
    assert.ok(matched === null || !matched.includes("stored for"), String(matched));
  });

  it(
    "keeps a real stored value out of every rendering there is",
    { skip: NO_STORE },
    async () => {
      // The round trip above proves the value comes back. This proves the
      // other half of the same sentence: that having come back, it appears
      // in nothing a person or a log can read. It uses the REAL store and a
      // real decryption, because a fixture that cannot be decrypted would
      // pass this test by failing to resolve.
      const path = inTemp();
      setCredential("shown", "openai", SECRET, { path });
      const root = tempDir("credential-render-");
      mkdirSync(join(root, ".vscode"), { recursive: true });
      writeFileSync(
        join(root, ".vscode", "settings.json"),
        `${JSON.stringify({ "dabbler.credentials.openai": "shown" }, null, 2)}\n`,
        "utf8",
      );
      setCredentialsPath(path);
      const rendered = [
        JSON.stringify(listCredentials(path)),
        (await capture(() => authVerb(["list"]))).stdout,
        (await capture(() => configurationVerb(["explain", "--repo-root", root]))).stdout,
        (await capture(() => configurationVerb(["options", "--repo-root", root]))).stdout,
      ];
      for (const text of rendered) {
        assert.ok(text.includes("shown") || text.includes("credential"), text.slice(0, 200));
        assert.ok(!text.includes(SECRET), text.slice(0, 400));
        // Not a prefix either: six characters of an API key identify the
        // account it belongs to.
        assert.ok(!text.includes(SECRET.slice(0, 10)), text.slice(0, 400));
      }
    },
  );

  it("forgets a removed credential rather than leaving it readable", () => {
    const path = inTemp();
    seed(path);
    assert.equal(holdsCredential("work", path), true);
    assert.equal(removeCredential("work", { path }), true);
    assert.equal(holdsCredential("work", path), false);
    assert.equal(credentialValue("work", { path }), null);
    // A second removal is not an error a caller has to guard against; it is
    // the honest answer that there was nothing of that name.
    assert.equal(removeCredential("work", { path }), false);
  });
});
