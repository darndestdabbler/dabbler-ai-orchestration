// Which files each view is read from.

import assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, suite, test } from "node:test";

import { setCatalogPath } from "../src/catalog.ts";
import { setCredentialsPath } from "../src/credentials.ts";
import { setPreferencesPath } from "../src/preferences.ts";
import { follow, followedPaths } from "../src/views/follow.ts";

const slash = (p: string) => p.replace(/\\/g, "/");

suite("follow: followedPaths", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "follow-"));
  const user = path.join(root, "user");
  for (const run of ["s3", "s10", "s9", "not-a-run"]) {
    fs.mkdirSync(path.join(root, ".dabbler", "runs", run), { recursive: true });
  }
  before(() => {
    setCatalogPath(path.join(user, "ai-model-catalog.json"));
    setPreferencesPath(path.join(user, "preferences.json"));
  });
  after(() => {
    setCatalogPath(null);
    setPreferencesPath(null);
    fs.rmSync(root, { recursive: true, force: true });
  });

  test("the Work Explorer follows the ledger and the named run, and no preference file", () => {
    const paths = followedPaths("work-explorer", [root], 3).map(slash);
    const at = slash(root);
    assert.ok(paths.includes(`${at}/docs/sessions/sessions.json`));
    assert.ok(paths.includes(`${at}/.dabbler/runs/s3/driver/run.json`));
    assert.ok(paths.includes(`${at}/.dabbler/runs/s3/step-execution.jsonl`));
    assert.ok(!paths.some((p) => p.includes("/s10/")));
    assert.ok(!paths.some((p) => p.startsWith(`${slash(user)}/`)));
    assert.ok(followedPaths("configuration", [root]).map(slash).includes(`${slash(user)}/preferences.json`));
  });

  test("the configuration follows the credentials index, so a stored key repaints the API Keys rows", () => {
    setCredentialsPath(path.join(user, "credentials.json"));
    try {
      assert.ok(followedPaths("configuration", [root]).map(slash).includes(`${slash(user)}/credentials.json`));
      assert.ok(!followedPaths("work-explorer", [root]).map(slash).includes(`${slash(user)}/credentials.json`));
    } finally {
      setCredentialsPath(null);
    }
  });

  test("with no session named, the Work Explorer follows the highest run", () => {
    const paths = followedPaths("work-explorer", [root]).map(slash);
    assert.ok(paths.includes(`${slash(root)}/.dabbler/runs/s10/rounds.jsonl`));
    assert.ok(!paths.some((p) => /\/s(3|9)\//.test(p)));
  });
});

suite("follow: follow", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "follow-"));
  const user = path.join(root, "user");
  const sessions = path.join(root, "docs", "sessions");
  fs.mkdirSync(user, { recursive: true });
  fs.mkdirSync(sessions, { recursive: true });
  before(() => {
    setCatalogPath(path.join(user, "ai-model-catalog.json"));
    setPreferencesPath(path.join(user, "preferences.json"));
  });
  after(() => {
    setCatalogPath(null);
    setPreferencesPath(null);
    fs.rmSync(root, { recursive: true, force: true });
  });

  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const timing = { pollMs: 10, settleMs: 50 };

  test("a change to the ledger prints the Work Explorer again, and a preference file does not", async () => {
    let printed = 0;
    const stop = follow(() => followedPaths("work-explorer", [root]), () => (printed += 1), timing);
    try {
      assert.strictEqual(printed, 1);
      fs.writeFileSync(path.join(user, "preferences.json"), "{}\n");
      await wait(300);
      assert.strictEqual(printed, 1);
      fs.writeFileSync(path.join(sessions, "sessions.json"), "{}\n");
      await wait(300);
      assert.strictEqual(printed, 2);
    } finally {
      stop();
    }
  });

  test("two changes close together print once", async () => {
    let printed = 0;
    const stop = follow(() => followedPaths("work-explorer", [root]), () => (printed += 1), timing);
    try {
      fs.writeFileSync(path.join(sessions, "sessions.json"), '{"a": 1}\n');
      fs.writeFileSync(path.join(sessions, "activity-log.json"), "[]\n");
      await wait(300);
      assert.strictEqual(printed, 2);
    } finally {
      stop();
    }
  });
});
