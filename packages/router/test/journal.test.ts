// How the router spells a path and a moment, and what it hands the OS.
import assert from "node:assert/strict";
import { mkdirSync, symlinkSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { describe, it } from "node:test";

import {
  canonicalPath,
  hiddenSpawn,
  isMachineStatePath,
  nowIso,
  platformNewlines,
  repoRelativePath,
} from "../src/journal.ts";
import { tempDir } from "./support/answers.ts";

describe("what the router hands the OS", () => {
  it("adds the hidden window without disturbing what the caller asked for", () => {
    // The VS Code extension host has no console of its own, so a console
    // child gets one, and Windows gives that window the foreground. The
    // helper composes; a call site's own options survive it.
    assert.deepEqual(hiddenSpawn({ cwd: "/repo", timeout: 30_000 }), {
      cwd: "/repo",
      timeout: 30_000,
      windowsHide: true,
    });
  });
});

describe("telling the record from the work", () => {
  it("counts everything under .dabbler as the record, whichever separator spells it", () => {
    assert.equal(isMachineStatePath(".dabbler/runs/s1/rounds.jsonl"), true);
    assert.equal(isMachineStatePath(".dabbler\\runs\\s1\\rounds.jsonl"), true);
  });

  it("does not count a path that merely starts with the same letters", () => {
    assert.equal(isMachineStatePath(".dabblerish/notes.md"), false);
  });
});

describe("the writer's clock", () => {
  it("prints milliseconds to exactly three places", () => {
    assert.match(nowIso("milliseconds", new Date(2026, 0, 2, 3, 4, 5, 60)), /^2026-01-02T03:04:05\.060[+-]\d{2}:\d{2}$/);
  });

  it("omits the fraction entirely when it is zero, as isoformat does", () => {
    assert.match(nowIso("microseconds", new Date(2026, 0, 2, 3, 4, 5, 0)), /^2026-01-02T03:04:05[+-]\d{2}:\d{2}$/);
  });
});

describe("the line-ending seam", () => {
  it("writes what this host's text mode writes, and does not double an ending already there", () => {
    const expected = process.platform === "win32" ? "a\r\nb\r\n" : "a\nb\n";
    assert.equal(platformNewlines("a\nb\n"), expected);
    assert.equal(platformNewlines(platformNewlines("a\n")), platformNewlines("a\n"));
  });
});

describe("one spelling for a path, whoever handed it over", () => {
  // Windows hands out more than one spelling for a directory -- the 8.3
  // short name, a junction, a mapped drive -- and git answers with its own.
  // Comparing two of them unresolved is what made twelve CI runs red, and
  // the same comparison decides a plan's file envelope and a verifier's
  // read scope.
  function aliased(): { real: string; alias: string } {
    const real = tempDir("canonical-");
    mkdirSync(join(real, "docs", "sessions"), { recursive: true });
    const alias = join(dirname(real), `${basename(real)}-alias`);
    symlinkSync(real, alias, process.platform === "win32" ? "junction" : "dir");
    return { real, alias };
  }

  it("answers the same repository-relative path through an alias as through the real one", () => {
    const { real, alias } = aliased();
    assert.equal(repoRelativePath(real, join(alias, "docs", "sessions")), "docs/sessions");
    assert.equal(repoRelativePath(alias, join(real, "docs", "sessions")), "docs/sessions");
    assert.equal(canonicalPath(alias), canonicalPath(real));
  });

  it("canonicalises a path that does not exist yet as far as it goes", () => {
    // Half the callers name an output before anything has written it: the
    // deepest ancestor that exists is canonicalised and the rest re-appended.
    const { real, alias } = aliased();
    assert.equal(repoRelativePath(real, join(alias, "not", "written", "yet.json")), "not/written/yet.json");
    assert.equal(repoRelativePath(alias, join(real, "docs", "sessions", "sessions.json")), "docs/sessions/sessions.json");
    assert.equal(repoRelativePath(real, join(real, "nothing", "here.json")), "nothing/here.json");
  });
});
