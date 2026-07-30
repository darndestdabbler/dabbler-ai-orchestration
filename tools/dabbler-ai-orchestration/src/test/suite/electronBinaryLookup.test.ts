// Repairs the Layer-3 macOS binary lookup (2026-07-30).
//
// CI's `Playwright Layer 3 (macos-latest)` job had been red for at least
// twelve commits with:
//
//   Error: No usable VS Code binary in .vscode-test.
//   Inspected: vscode-darwin-arm64-1.131.0
//
// The old `findCodeBinary` guessed exactly ONE path per platform and, on
// darwin, that guess was
// `<dir>/Visual Studio Code.app/Contents/MacOS/Electron`. When VS Code's macOS
// layout stopped matching, every Layer-3 spec failed at launch — and because
// the GitHub matrix defaults to fail-fast, the Linux leg (which was PASSING)
// and the Windows leg (which never finished downloading) were both cancelled,
// so the true per-OS picture was hidden too.
//
// The lookup now SEARCHES and reports what it found. These specs drive the
// darwin branch from any host, which is the point: the defect was macOS-only
// and therefore invisible to everyone developing on Windows or Linux. A pure
// function plus injected IO is what makes that possible.

import * as assert from "assert";
import * as path from "path";
import {
  BinaryProbeIo,
  describeVersionDir,
  resolveCodeExecutable,
} from "../playwright/electronLaunch";

/** Build a probe IO over a simple `{ "a/b/c": ["entries"] }` tree. */
function fakeIo(tree: Record<string, string[]>): BinaryProbeIo {
  const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "");
  const dirs = new Set(Object.keys(tree).map(norm));
  const files = new Set<string>();
  for (const [dir, entries] of Object.entries(tree)) {
    for (const e of entries) {
      const full = `${norm(dir)}/${e}`;
      if (!dirs.has(full)) files.add(full);
    }
  }
  return {
    exists: (p) => dirs.has(norm(p)) || files.has(norm(p)),
    isDirectory: (p) => dirs.has(norm(p)),
    readdir: (p) => tree[norm(p)] ?? tree[p] ?? [],
  };
}

const DIR = "/x/.vscode-test/vscode-darwin-arm64-1.131.0";

suite("Layer-3 binary lookup — macOS (the CI-red repair)", () => {
  test("finds Electron in the classic bundle layout", () => {
    const io = fakeIo({
      [DIR]: ["Visual Studio Code.app"],
      [`${DIR}/Visual Studio Code.app`]: ["Contents"],
      [`${DIR}/Visual Studio Code.app/Contents`]: ["MacOS"],
      [`${DIR}/Visual Studio Code.app/Contents/MacOS`]: ["Electron"],
    });
    assert.strictEqual(
      resolveCodeExecutable(DIR, "darwin", io)?.replace(/\\/g, "/"),
      `${DIR}/Visual Studio Code.app/Contents/MacOS/Electron`,
    );
  });

  test("finds the binary when the app bundle is named differently", () => {
    // e.g. an Insiders download, which the old single-guess path missed.
    const io = fakeIo({
      [DIR]: ["Visual Studio Code - Insiders.app"],
      [`${DIR}/Visual Studio Code - Insiders.app`]: ["Contents"],
      [`${DIR}/Visual Studio Code - Insiders.app/Contents`]: ["MacOS"],
      [`${DIR}/Visual Studio Code - Insiders.app/Contents/MacOS`]: ["Electron"],
    });
    assert.ok(
      resolveCodeExecutable(DIR, "darwin", io)?.includes("Insiders.app"),
      "a non-default bundle name must still resolve",
    );
  });

  test("finds the binary when the EXECUTABLE is named differently", () => {
    // The likeliest shape of the real CI failure: bundle present, `Electron`
    // gone. Preference order picks the next known name.
    const io = fakeIo({
      [DIR]: ["Visual Studio Code.app"],
      [`${DIR}/Visual Studio Code.app`]: ["Contents"],
      [`${DIR}/Visual Studio Code.app/Contents`]: ["MacOS"],
      [`${DIR}/Visual Studio Code.app/Contents/MacOS`]: ["Code Helper"],
    });
    assert.strictEqual(
      resolveCodeExecutable(DIR, "darwin", io)?.replace(/\\/g, "/"),
      `${DIR}/Visual Studio Code.app/Contents/MacOS/Code Helper`,
    );
  });

  test("takes a single unknown executable rather than failing on a rename", () => {
    const io = fakeIo({
      [DIR]: ["Visual Studio Code.app"],
      [`${DIR}/Visual Studio Code.app`]: ["Contents"],
      [`${DIR}/Visual Studio Code.app/Contents`]: ["MacOS"],
      [`${DIR}/Visual Studio Code.app/Contents/MacOS`]: ["SomeFutureName"],
    });
    assert.ok(resolveCodeExecutable(DIR, "darwin", io)?.endsWith("SomeFutureName"));
  });

  test("tolerates the version dir already BEING the bundle", () => {
    const io = fakeIo({
      [DIR]: ["Contents"],
      [`${DIR}/Contents`]: ["MacOS"],
      [`${DIR}/Contents/MacOS`]: ["Electron"],
    });
    assert.strictEqual(
      resolveCodeExecutable(DIR, "darwin", io)?.replace(/\\/g, "/"),
      `${DIR}/Contents/MacOS/Electron`,
    );
  });

  test("returns null (not a wrong path) when there is genuinely nothing", () => {
    const io = fakeIo({ [DIR]: ["README.md"] });
    assert.strictEqual(resolveCodeExecutable(DIR, "darwin", io), null);
  });

  test("the failure message names what was actually inside", () => {
    // The old error said only the directory name, which cost a CI round-trip
    // per diagnosis. This one is self-describing.
    const io = fakeIo({
      [DIR]: ["Visual Studio Code.app"],
      [`${DIR}/Visual Studio Code.app`]: ["Contents"],
      [`${DIR}/Visual Studio Code.app/Contents`]: ["MacOS"],
      [`${DIR}/Visual Studio Code.app/Contents/MacOS`]: ["Code Helper", "chrome_crashpad"],
    });
    const described = describeVersionDir(DIR, "darwin", io);
    assert.ok(described.includes("vscode-darwin-arm64-1.131.0"));
    assert.ok(described.includes("Visual Studio Code.app"));
    assert.ok(described.includes("Code Helper"), described);
  });
});

suite("Layer-3 binary lookup — Windows and Linux still resolve", () => {
  test("Windows finds Code.exe", () => {
    const dir = "/x/.vscode-test/vscode-win32-x64-archive-1.128.0";
    const io = fakeIo({ [dir]: ["Code.exe", "bin"] });
    assert.strictEqual(
      resolveCodeExecutable(dir, "win32", io)?.replace(/\\/g, "/"),
      `${dir}/Code.exe`,
    );
  });

  test("Windows falls back to any .exe", () => {
    const dir = "/x/.vscode-test/vscode-win32-x64-archive-1.128.0";
    const io = fakeIo({ [dir]: ["CodeRenamed.exe"] });
    assert.ok(resolveCodeExecutable(dir, "win32", io)?.endsWith("CodeRenamed.exe"));
  });

  test("Linux finds top-level `code`, then bin/code", () => {
    const flat = "/x/.vscode-test/vscode-linux-x64-1.128.0";
    assert.strictEqual(
      resolveCodeExecutable(flat, "linux", fakeIo({ [flat]: ["code"] }))?.replace(/\\/g, "/"),
      `${flat}/code`,
    );
    const nested = "/y/vscode-linux-x64-1.128.0";
    const io = fakeIo({ [nested]: ["bin"], [`${nested}/bin`]: ["code"] });
    assert.strictEqual(
      resolveCodeExecutable(nested, "linux", io)?.replace(/\\/g, "/"),
      `${nested}/bin/code`,
    );
  });

  test("Linux returns null when nothing is there", () => {
    const dir = "/x/empty-1.0.0";
    assert.strictEqual(resolveCodeExecutable(dir, "linux", fakeIo({ [dir]: [] })), null);
  });
});
