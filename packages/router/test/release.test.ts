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

import { packageVersion, releaseVersion, tagsFor } from "../src/cli/release.ts";
import {
  ID_PUBLICATION,
  answerOwed,
  blockingDecisions,
  currentDecisions,
  raisePublicationDecision,
} from "../src/owedDecisions.ts";
import { makeSandboxRepo, makeTempDir, removeTempDirs } from "./support/fixtures.ts";

afterAll(removeTempDirs);

const VERSION = "2.0.0";

describe("what an answer means", () => {
  it("tags the router before the extension", () => {
    // The extension bundles the router, so a Marketplace version whose npm
    // half is missing is the broken half-release: somebody installs the
    // extension, it cannot resolve what it wraps, and the failure looks like
    // the extension's.
    expect(tagsFor("publish", VERSION)).toEqual(["v2.0.0", "vsix-v2.0.0"]);
  });

  it("rehearses the npm half only, and says so", () => {
    // NOT "the whole path": it never touches the Marketplace, and calling it
    // that is how an operator following the recommendation ends up with a
    // product still returning 404.
    expect(tagsFor("release-candidate", VERSION)).toEqual(["v2.0.0-rc1"]);
  });

  it("tags nothing at all for an answer that declines", () => {
    expect(tagsFor("not yet", VERSION)).toEqual([]);
  });

  it("tags nothing for an answer nobody offered", () => {
    // A vocabulary this does not know is not a licence to guess at a release.
    expect(tagsFor("ship it", VERSION)).toEqual([]);
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

  it("is one version, and refuses to name one when the halves disagree", () => {
    // An install showed router 2.0.0 beside extension 2.7.0 -- two things
    // where the operator has one. npm and the Marketplace each need a
    // literal version in their own manifest, so "one source" can only be
    // one number and one rule that refuses the rest. This is that rule, and
    // `release` asks it before it tags.
    const root = makeTempDir();
    const write = (rel: string, doc: unknown): void => {
      const path = join(root, ...rel.split("/"));
      mkdirSync(join(path, ".."), { recursive: true });
      writeFileSync(path, JSON.stringify(doc), "utf8");
    };
    const halves = (router: string, extension: string, dependency: string): void => {
      write("packages/router/package.json", { name: "dabbler-ai-router", version: router });
      write("tools/dabbler-ai-orchestration/package.json", {
        version: extension,
        dependencies: { "dabbler-ai-router": dependency },
      });
    };

    halves("2.8.0", "2.8.0", "2.8.0");
    expect(releaseVersion(root)).toEqual({ version: "2.8.0", reason: "" });

    halves("2.0.0", "2.8.0", "2.8.0");
    expect(releaseVersion(root).version).toBeNull();
    expect(releaseVersion(root).reason).toContain("2.0.0");

    // And the third way they come apart: the extension bundles the router,
    // so a dependency naming another version is a build wrapping something
    // else, whatever the two manifests say.
    halves("2.8.0", "2.8.0", "^2.0.0");
    expect(releaseVersion(root).version).toBeNull();
    expect(releaseVersion(root).reason).toContain("^2.0.0");
  });

  it("has one version in this repository, which is what the tags carry", () => {
    // The control that keeps the merge merged after the session that made
    // it: it reads the repository itself, so a half-bumped release is a red
    // suite rather than two artifacts nobody can say the version of.
    const here = join(import.meta.dirname, "..", "..", "..");
    const agreed = releaseVersion(here);
    expect(agreed.reason).toBe("");
    expect(tagsFor("publish", agreed.version ?? "")).toEqual([
      `v${agreed.version}`,
      `vsix-v${agreed.version}`,
    ]);
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
