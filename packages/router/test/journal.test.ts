// How this router spawns git, which is the child it spawns most.
//
// `node:child_process` is mocked for the whole file, so nothing here runs a
// real git -- which is why it is its own file rather than a describe block
// inside one that does. What is under test is the options the router hands
// the OS, and those are invisible from outside the call.

import { mkdirSync, mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The parameters are declared even though the body ignores them: without
 * them `calls[0]` infers as the empty tuple, and reading the options
 * argument off it is a conversion from `undefined` that the typecheck
 * refuses. The types are what make the recorded call readable.
 */
const spawnSync = vi.fn(
  (
    _command: string,
    _args: readonly string[],
    _options: Record<string, unknown>,
  ) => ({
    status: 0,
    stdout: "",
    stderr: "",
    error: undefined,
  }),
);

vi.mock("node:child_process", () => ({ spawnSync }));

const { canonicalPath, hiddenSpawn, repoRelativePath, runGit, runGitBinary } =
  await import("../src/journal.ts");

afterEach(() => spawnSync.mockClear());

describe("what the router hands the OS", () => {
  it("hides the console window on every git call", () => {
    // The VS Code extension host has no console of its own, so a console
    // child gets one -- and Windows gives that window the foreground, taking
    // the caret out of whatever the operator was typing. git is the child
    // this router spawns most: a status, a diff and a rev-parse behind
    // every refresh of the Work Explorer.
    //
    // Session 65 gave `windowsHide` to the two spawn paths in `checks.ts`
    // and could not reach this one, because no step of that session
    // declared this file.
    runGit("/repo", ["status", "--porcelain"]);
    expect(spawnSync).toHaveBeenCalledTimes(1);
    expect(spawnSync.mock.calls[0]?.[2]?.["windowsHide"]).toBe(true);

    // Both encodings go through the same seam, so neither can be the one
    // that was forgotten.
    spawnSync.mockClear();
    runGitBinary("/repo", ["cat-file", "blob", "deadbeef:file"]);
    expect(spawnSync.mock.calls[0]?.[2]?.["windowsHide"]).toBe(true);
  });

  it("adds the hidden window without disturbing what the caller asked for", () => {
    // The helper is a composition and not a replacement: a call site's own
    // options survive it, or adding it would silently change how a child is
    // run rather than only where its window goes.
    const composed = hiddenSpawn({ cwd: "/repo", timeout: 30_000 });
    expect(composed).toEqual({ cwd: "/repo", timeout: 30_000, windowsHide: true });
  });
});

describe("one spelling for a path, whoever handed it over", () => {
  it("answers the same repository-relative path through an alias as through the real one", () => {
    // Windows hands out more than one spelling for a directory -- the 8.3
    // short name, a junction, a mapped drive -- and git answers with its
    // own. Comparing two of them unresolved is what made twelve CI runs
    // red, and it is not a test-only defect: the same comparison decides a
    // plan's file envelope and a verifier's read scope.
    const real = mkdtempSync(join(tmpdir(), "canonical-"));
    mkdirSync(join(real, "docs", "sessions"), { recursive: true });
    const alias = join(dirname(real), `${basename(real)}-alias`);
    symlinkSync(real, alias, process.platform === "win32" ? "junction" : "dir");

    expect(repoRelativePath(real, join(alias, "docs", "sessions"))).toBe("docs/sessions");
    expect(repoRelativePath(alias, join(real, "docs", "sessions"))).toBe("docs/sessions");
    expect(canonicalPath(alias)).toBe(canonicalPath(real));
  });

  it("answers for a path that does not exist rather than refusing", () => {
    // Half the callers name an output before anything has written it, and a
    // path nobody has created cannot be canonicalised.
    const root = mkdtempSync(join(tmpdir(), "canonical-"));
    expect(repoRelativePath(root, join(root, "not", "written", "yet.json"))).toBe(
      "not/written/yet.json",
    );
  });
});
