// The one act that cannot be taken back.
//
// The property worth pinning is that nothing here decides. A version pushed
// to a public registry is downloadable by everyone from that moment, npm
// refuses `unpublish` after 72 hours, and a Marketplace version slot is never
// reusable -- so the framework states what would ship and waits, and does the
// typing only once there is an answer.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { packageVersion, tagsFor } from "../src/cli/release.ts";
import {
  ID_PUBLICATION,
  answerOwed,
  blockingDecisions,
  currentDecisions,
  raisePublicationDecision,
} from "../src/owedDecisions.ts";
import { makeSandboxRepo, makeTempDir, removeTempDirs } from "./support/fixtures.ts";

afterAll(removeTempDirs);

const VERSIONS = { router: "2.0.0", extension: "2.0.0" } as const;

describe("what an answer means", () => {
  it("tags the router before the extension", () => {
    // The extension bundles the router, so a Marketplace version whose npm
    // half is missing is the broken half-release: somebody installs the
    // extension, it cannot resolve what it wraps, and the failure looks like
    // the extension's.
    expect(tagsFor("publish", VERSIONS)).toEqual(["v2.0.0", "vsix-v2.0.0"]);
  });

  it("rehearses the npm half only, and says so", () => {
    // NOT "the whole path": it never touches the Marketplace, and calling it
    // that is how an operator following the recommendation ends up with a
    // product still returning 404.
    expect(tagsFor("release-candidate", VERSIONS)).toEqual(["v2.0.0-rc1"]);
  });

  it("tags nothing at all for an answer that declines", () => {
    expect(tagsFor("not yet", VERSIONS)).toEqual([]);
  });

  it("tags nothing for an answer nobody offered", () => {
    // A vocabulary this does not know is not a licence to guess at a release.
    expect(tagsFor("ship it", VERSIONS)).toEqual([]);
  });
});

describe("reading what would ship", () => {
  it("takes the versions from the packages themselves", () => {
    const root = makeTempDir();
    mkdirSync(join(root, "packages", "router"), { recursive: true });
    writeFileSync(
      join(root, "packages", "router", "package.json"),
      JSON.stringify({ name: "dabbler-ai-router", version: "2.1.0" }),
      "utf8",
    );
    expect(packageVersion(root, "packages/router/package.json")).toBe("2.1.0");
  });

  it("reports a package it cannot read rather than inventing a version", () => {
    expect(packageVersion(makeTempDir(), "packages/router/package.json")).toBeNull();
  });
});

describe("the brief the operator answers", () => {
  it("states the cost of a wrong answer, not only the choices", () => {
    // The whole reason this is a brief and not a prompt: the reader has to
    // be able to tell what they cannot take back.
    const { repo } = makeSandboxRepo();
    const row = raisePublicationDecision(repo, {
      routerVersion: "2.0.0",
      extensionVersion: "2.0.0",
    });
    expect(String(row?.["determined"])).toContain("cannot be recalled");
    expect((row?.["options"] as { label: string }[]).map((o) => o.label)).toEqual([
      "publish",
      "release-candidate",
      "not yet",
    ]);
  });

  it("does not recommend the answer that defeats the session", () => {
    // This session exists BECAUSE the product is uninstallable, so the answer
    // leaving it uninstallable cannot be the recommended one. An earlier
    // draft recommended the release candidate and called it "the whole
    // path", which was false -- it never touches the Marketplace -- and was
    // a recommendation to not do the thing.
    const { repo } = makeSandboxRepo();
    const row = raisePublicationDecision(repo, {
      routerVersion: "2.0.0",
      extensionVersion: "2.0.0",
    });
    expect(row?.["recommendation"]).toBe("publish");
    const rc = (row?.["options"] as { label: string; consequence: string }[]).find(
      (option) => option.label === "release-candidate",
    );
    // And it says so of itself: a rehearsal that still returns 404.
    expect(rc?.consequence).toContain("404");
  });

  it("does not block a close, because an unpublished product is not unverified", () => {
    const { repo } = makeSandboxRepo();
    raisePublicationDecision(repo, { routerVersion: "2.0.0", extensionVersion: "2.0.0" });
    expect(blockingDecisions(repo)).toEqual([]);
  });

  it("asks once, however often the verb runs", () => {
    const { repo } = makeSandboxRepo();
    raisePublicationDecision(repo, { routerVersion: "2.0.0", extensionVersion: "2.0.0" });
    expect(
      raisePublicationDecision(repo, { routerVersion: "2.0.0", extensionVersion: "2.0.0" }),
    ).toBeNull();
  });

  it("carries the operator's answer, and nobody else's", () => {
    // `answeredBy` is "operator" and there is no other value: a verdict a
    // model can write is a verdict a model can be wrong about.
    const { repo } = makeSandboxRepo();
    raisePublicationDecision(repo, { routerVersion: "2.0.0", extensionVersion: "2.0.0" });
    answerOwed(repo, ID_PUBLICATION, "not yet");
    const row = currentDecisions(repo).find((r) => String(r["id"]) === ID_PUBLICATION);
    expect(row?.["answer"]).toBe("not yet");
    expect(row?.["answeredBy"]).toBe("operator");
  });
});
