// The one version, stamped into every manifest: run against a copy of the
// files it stamps, so nothing here touches this repository's own.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { seed, tempDir } from "./support/answers.ts";

const scripts = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts");
const VS_MANIFEST =
  "tools/dabbler-visual-studio/Dabbler.VisualStudio/source.extension.vsixmanifest";

function vsManifest(version: string): string {
  return (
    '<PackageManifest Version="2.0.0">\n' +
    `  <Metadata>\n    <Identity Id="X" Version="${version}" Language="en-US" Publisher="P" />\n  </Metadata>\n` +
    "</PackageManifest>\n"
  );
}

/** A copy whose every manifest carries 3.37.0 except the Visual Studio one. */
function copyWithStaleVisualStudioManifest(): string {
  const root = tempDir("stamp-");
  seed(root, {
    "version.json": JSON.stringify({ version: "3.37.0" }),
    "packages/router/package.json": JSON.stringify({ name: "dabbler-ai-router", version: "3.37.0" }, null, 2),
    "tools/dabbler-ai-orchestration/package.json": JSON.stringify(
      { name: "e", version: "3.37.0", devDependencies: { "dabbler-ai-router": "3.37.0" } },
      null,
      2,
    ),
    "package-lock.json": `${JSON.stringify({ packages: {} }, null, 2)}\n`,
    [VS_MANIFEST]: vsManifest("3.36.0"),
  });
  return root;
}

function stamp(root: string, ...flags: string[]) {
  return spawnSync(
    process.execPath,
    [join(scripts, "run-ts.mjs"), join(scripts, "stamp-version.ts"), ...flags, "--root", root],
    { encoding: "utf8", timeout: 60_000 },
  );
}

describe("stamp-version", () => {
  it("fails the check on a stale Visual Studio manifest, and stamps only its Identity", () => {
    const root = copyWithStaleVisualStudioManifest();

    const checked = stamp(root, "--check");
    assert.equal(checked.status, 1, checked.stdout + checked.stderr);
    assert.match(checked.stderr, /stale\s+tools\/dabbler-visual-studio\/.*source\.extension\.vsixmanifest/);

    const stamped = stamp(root);
    assert.equal(stamped.status, 0, stamped.stdout + stamped.stderr);
    assert.equal(readFileSync(join(root, VS_MANIFEST), "utf8"), vsManifest("3.37.0"));
    assert.equal(stamp(root, "--check").status, 0);
  });
});
