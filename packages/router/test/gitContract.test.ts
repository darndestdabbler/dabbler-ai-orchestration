// The contract band: the git behaviors the router relies on, pinned against
// real repositories. Every test here names the call site that depends on the
// behavior it pins. These are the only tests allowed to build a repository
// from nothing -- everything else feeds recorded answers through the
// `journal.runGit` seam and asserts the decision that comes back.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { runGit, runGitBinary } from "../src/journal.ts";
import {
  git,
  initRepo,
  makeSeededRepo,
  makeTempDir,
  removeTempDirs,
} from "./support/fixtures.ts";

afterAll(removeTempDirs);

function commitFile(repo: string, rel: string, text: string, message = "c"): void {
  const path = join(repo, ...rel.split("/"));
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text, "utf8");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", message, "--no-gpg-sign");
}

function headTree(repo: string): string {
  return runGit(repo, ["rev-parse", "HEAD^{tree}"]).stdout;
}

describe("gitContract", () => {
  // affected.ts and drive.ts read `rev-parse` output as an identifier with
  // no framing: the contract is bare hex after journal's newline strip --
  // no trailing newline and, on Windows git, no carriage return either.
  it("rev-parse emits a bare 40-hex identifier", () => {
    const repo = makeSeededRepo();
    const tree = headTree(repo);
    expect(tree).toMatch(/^[0-9a-f]{40}$/);
    const head = runGit(repo, ["rev-parse", "HEAD"]).stdout;
    expect(head).toMatch(/^[0-9a-f]{40}$/);
  });

  // release.ts and driver.ts parse `status --porcelain` lines as a two
  // character code, one space, then the path -- including the first line,
  // which a gate once misparsed.
  it("status --porcelain shapes: modified and untracked", () => {
    const repo = makeSeededRepo({ "a.txt": "one\n" });
    writeFileSync(join(repo, "a.txt"), "two\n", "utf8");
    writeFileSync(join(repo, "new.txt"), "n\n", "utf8");
    const lines = runGit(repo, ["status", "--porcelain"]).stdout.split("\n");
    expect(lines).toContain(" M a.txt");
    expect(lines).toContain("?? new.txt");
  });

  it("status --porcelain is empty for a clean tree", () => {
    const repo = makeSeededRepo();
    expect(runGit(repo, ["status", "--porcelain"]).stdout).toBe("");
  });

  // evidence.ts existence checks branch on the exit code of `cat-file -e`.
  it("cat-file -e answers existence by exit code", () => {
    const repo = makeSeededRepo();
    const tree = headTree(repo);
    expect(runGit(repo, ["cat-file", "-e", `${tree}^{object}`]).code).toBe(0);
    const missing = "0123456789012345678901234567890123456789";
    expect(runGit(repo, ["cat-file", "-e", `${missing}^{object}`]).code).not.toBe(0);
  });

  // evidence.ts writes round anchors with `update-ref` and reads them back
  // with `for-each-ref --format=%(refname)` under a prefix.
  it("update-ref then for-each-ref round-trips a dabbler ref", () => {
    const repo = makeSeededRepo();
    const head = runGit(repo, ["rev-parse", "HEAD"]).stdout;
    expect(runGit(repo, ["update-ref", "refs/dabbler/rounds/s1/r1", head]).code).toBe(0);
    const refs = runGit(repo, ["for-each-ref", "--format=%(refname)", "refs/dabbler/"]).stdout;
    expect(refs.split("\n")).toContain("refs/dabbler/rounds/s1/r1");
  });

  // journal strips only OUTER newlines: a multi-ref listing keeps its
  // internal newline separators.
  it("multi-line stdout keeps internal newlines after the outer strip", () => {
    const repo = makeSeededRepo();
    const head = runGit(repo, ["rev-parse", "HEAD"]).stdout;
    git(repo, "update-ref", "refs/dabbler/a", head);
    git(repo, "update-ref", "refs/dabbler/b", head);
    const refs = runGit(repo, ["for-each-ref", "--format=%(refname)", "refs/dabbler/"]).stdout;
    expect(refs).toBe("refs/dabbler/a\nrefs/dabbler/b");
  });

  // evidence.ts derives the branch from `symbolic-ref --short -q HEAD` and
  // treats a non-zero exit as detached.
  it("symbolic-ref names the branch and fails detached", () => {
    const repo = makeSeededRepo();
    expect(runGit(repo, ["symbolic-ref", "--short", "-q", "HEAD"]).stdout).toBe("main");
    git(repo, "checkout", "-q", "--detach");
    const detached = runGit(repo, ["symbolic-ref", "--short", "-q", "HEAD"]);
    expect(detached.code).not.toBe(0);
    expect(detached.stdout).toBe("");
  });

  // evidence.ts and owed.ts branch on `remote get-url` exit code; bootstrap
  // reads bare `remote` as emptiness.
  it("remote answers: none configured, get-url fails on missing", () => {
    const repo = makeSeededRepo();
    expect(runGit(repo, ["remote"]).stdout).toBe("");
    expect(runGit(repo, ["remote", "get-url", "origin"]).code).not.toBe(0);
  });

  // evidence.ts reads file content at a tree with `cat-file blob` through
  // runGitBinary: bytes come back exactly, CRLF included.
  it("cat-file blob returns exact bytes through the binary path", () => {
    const repo = makeTempDir();
    initRepo(repo, "-b", "main");
    writeFileSync(join(repo, "crlf.txt"), "a\r\nb\r\n", "utf8");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "c", "--no-gpg-sign");
    const tree = headTree(repo);
    const blob = runGitBinary(repo, ["cat-file", "blob", `${tree}:crlf.txt`]);
    expect(blob.code).toBe(0);
    expect(blob.stdout.toString("utf8")).toBe("a\r\nb\r\n");
  });

  // evidence.ts enumerates a tree with `ls-tree -r --name-only -z`: NUL
  // separated, nested paths with forward slashes, spaces raw.
  it("ls-tree -z lists nested and spaced paths NUL-separated", () => {
    const repo = makeSeededRepo({ "dir/nested.txt": "n\n", "a b.txt": "s\n" });
    const out = runGit(repo, ["ls-tree", "-r", "--name-only", "-z", headTree(repo)]);
    const names = out.stdout.split("\0").filter(Boolean);
    expect(names).toContain("dir/nested.txt");
    expect(names).toContain("a b.txt");
  });

  // facts.ts and the selector diff trees with `--name-only -z`: the changed
  // set arrives NUL-separated with no quoting.
  it("diff --name-only -z between commits names exactly the change", () => {
    const repo = makeSeededRepo({ "a.txt": "one\n", "b.txt": "two\n" });
    const before = headTree(repo);
    commitFile(repo, "a.txt", "changed\n");
    const after = headTree(repo);
    const out = runGit(repo, ["diff", "--name-only", "-z", "--no-ext-diff", before, after]);
    expect(out.stdout.split("\0").filter(Boolean)).toEqual(["a.txt"]);
  });

  // facts.ts enumerates tracked files with `ls-files`: forward slashes on
  // every platform, spaces unquoted.
  it("ls-files enumerates with forward slashes and raw spaces", () => {
    const repo = makeSeededRepo({ "dir/nested.txt": "n\n", "a b.txt": "s\n" });
    const names = runGit(repo, ["ls-files"]).stdout.split("\n");
    expect(names).toContain("dir/nested.txt");
    expect(names).toContain("a b.txt");
  });

  // bootstrap.ts asks `diff --cached --quiet -- <paths>` and reads staged
  // versus clean from the exit code alone.
  it("diff --cached --quiet answers staged-ness by exit code", () => {
    const repo = makeSeededRepo({ "a.txt": "one\n" });
    expect(runGit(repo, ["diff", "--cached", "--quiet", "--", "a.txt"]).code).toBe(0);
    writeFileSync(join(repo, "a.txt"), "two\n", "utf8");
    git(repo, "add", "a.txt");
    expect(runGit(repo, ["diff", "--cached", "--quiet", "--", "a.txt"]).code).toBe(1);
  });

  // The session-66 class, pinned: with core.autocrlf=true a checkout of an
  // LF-committed file writes CRLF bytes into the working tree while
  // `status --porcelain` stays clean -- content changed on disk, record
  // silent. This is the incident that hid a red CI suite for weeks.
  it("autocrlf=true rewrites checkout bytes while status stays clean", () => {
    const repo = makeTempDir();
    initRepo(repo, "-b", "main");
    writeFileSync(join(repo, "lf.txt"), "a\nb\n", "utf8");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "c", "--no-gpg-sign");
    git(repo, "config", "core.autocrlf", "true");
    rmSync(join(repo, "lf.txt"));
    git(repo, "checkout", "--", "lf.txt");
    expect(readFileSync(join(repo, "lf.txt"), "utf8")).toBe("a\r\nb\r\n");
    expect(runGit(repo, ["status", "--porcelain"]).stdout).toBe("");
  });

  // And the fix that ended it: a `* -text` attribute defeats the rewrite,
  // so the same checkout leaves LF bytes alone.
  it("a -text attribute defeats the autocrlf rewrite", () => {
    const repo = makeTempDir();
    initRepo(repo, "-b", "main");
    writeFileSync(join(repo, ".gitattributes"), "* -text\n", "utf8");
    writeFileSync(join(repo, "lf.txt"), "a\nb\n", "utf8");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "c", "--no-gpg-sign");
    git(repo, "config", "core.autocrlf", "true");
    rmSync(join(repo, "lf.txt"));
    git(repo, "checkout", "--", "lf.txt");
    expect(readFileSync(join(repo, "lf.txt"), "utf8")).toBe("a\nb\n");
  });
});
