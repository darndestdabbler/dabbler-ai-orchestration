// The one act that cannot be taken back.
//
// The property worth pinning is that nothing here decides. A version pushed
// to a public registry is downloadable by everyone from that moment, npm
// refuses `unpublish` after 72 hours, and a Marketplace version slot is never
// reusable -- so the framework states what would ship and waits, and does the
// typing only once there is an answer.

import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  canonicalVersion,
  packageVersion,
  releaseVersion,
  servedVersions,
  tagsFor,
} from "../src/cli/release.ts";
import {
  ID_PUBLICATION,
  answerOwed,
  blockingDecisions,
  currentDecisions,
  raisePublicationDecision,
} from "../src/owedDecisions.ts";
import { makeAnsweredSandbox, tempDir } from "./support/answers.ts";

const VERSION = "2.0.0";

describe("what an answer means", () => {
  it("tags one artifact, because there is one", () => {
    // There were two until 2026-09-02, with an order between them: the
    // router to npm first, because the extension bundles it and a
    // Marketplace version whose npm half was missing would be the broken
    // half-release. npm is retired — the router ships INSIDE the extension —
    // so there is no half that can be missing and nothing to sequence.
    assert.deepEqual(tagsFor("publish", VERSION), ["vsix-v2.0.0"]);
  });

  it("builds a release candidate without publishing it", () => {
    // The workflow classifies an `-rcN` tag as build-only, so the artifact is
    // downloadable from the run and installable by hand while the listing
    // does not move. A rehearsal is not a release, and the brief says that of
    // itself rather than leaving the reader to discover it.
    assert.deepEqual(tagsFor("release-candidate", VERSION), ["vsix-v2.0.0-rc1"]);
  });

  it("tags nothing at all for an answer that declines", () => {
    assert.deepEqual(tagsFor("not yet", VERSION), []);
  });

  it("tags nothing for an answer nobody offered", () => {
    // A vocabulary this does not know is not a licence to guess at a release.
    assert.deepEqual(tagsFor("ship it", VERSION), []);
  });
});

describe("reading what would ship", () => {
  it("takes the versions from the packages themselves", () => {
    const root = tempDir("release-");
    mkdirSync(join(root, "packages", "router"), { recursive: true });
    writeFileSync(
      join(root, "packages", "router", "package.json"),
      JSON.stringify({ name: "dabbler-ai-router", version: "2.1.0" }),
      "utf8",
    );
    assert.equal(packageVersion(root, "packages/router/package.json"), "2.1.0");
  });

  it("reports a package it cannot read rather than inventing a version", () => {
    assert.equal(packageVersion(tempDir("release-"), "packages/router/package.json"), null);
  });

  it("takes the version from version.json and refuses a manifest that is stale", () => {
    // An install showed router 2.0.0 beside extension 2.7.0 -- two things
    // where the operator has one. npm and the Marketplace each need a
    // literal version in their own manifest, so ONE SOURCE means one file
    // that declares it and a stamping step that writes it everywhere;
    // `release` asks whether that stamping is current before it tags.
    const root = tempDir("release-");
    const write = (rel: string, doc: unknown): void => {
      const path = join(root, ...rel.split("/"));
      mkdirSync(join(path, ".."), { recursive: true });
      writeFileSync(path, JSON.stringify(doc), "utf8");
    };
    const stamped = (
      canonical: string,
      router: string,
      extension: string,
      dependency: string,
    ): void => {
      write("version.json", { version: canonical });
      write("packages/router/package.json", { name: "dabbler-ai-router", version: router });
      write("tools/dabbler-ai-orchestration/package.json", {
        version: extension,
        dependencies: { "dabbler-ai-router": dependency },
      });
    };

    stamped("2.8.0", "2.8.0", "2.8.0", "2.8.0");
    assert.deepEqual(releaseVersion(root), { version: "2.8.0", reason: "" });

    // A manifest left behind by a bump: named, with the command that fixes it.
    stamped("2.8.0", "2.0.0", "2.8.0", "2.8.0");
    assert.deepEqual(releaseVersion(root).version, null);
    assert.match(String(releaseVersion(root).reason), /stamp:version/);

    // And the dependency, EXACTLY: the extension bundles the router, so a
    // range that merely contains the number is not this version being named.
    stamped("2.8.0", "2.8.0", "2.8.0", "^2.0.0");
    assert.equal(releaseVersion(root).version, null);
    stamped("2.8.0", "2.8.0", "2.8.0", "12.8.0");
    assert.equal(releaseVersion(root).version, null);
    write("tools/dabbler-ai-orchestration/package.json", { version: "2.8.0" });
    assert.equal(releaseVersion(root).version, null);
  });

  it("has one version in this repository, and every manifest carries it", () => {
    // The control that keeps the merge merged after the session that made
    // it: it reads the repository itself, so a half-stamped release is a red
    // suite rather than two artifacts nobody can say the version of.
    const here = join(import.meta.dirname, "..", "..", "..");
    const agreed = releaseVersion(here);
    assert.equal(agreed.reason, "");
    assert.equal(agreed.version, canonicalVersion(here));
    assert.deepEqual(tagsFor("publish", agreed.version ?? ""), [`vsix-v${agreed.version}`]);
  });
});

describe("what the Marketplace says it serves", () => {
  it("reads the versions out of a gallery answer, newest first", () => {
    // The parsing is here and the network call is not: a test that asked the
    // Marketplace would be a test of the Marketplace, green or red for
    // reasons that have nothing to do with this repository.
    assert.deepEqual(
      servedVersions({
        results: [
          {
            extensions: [
              {
                extensionName: "dabbler-ai-orchestration",
                versions: [{ version: "2.0.0" }, { version: "1.0.4" }],
              },
            ],
          },
        ],
      }),
      ["2.0.0", "1.0.4"],
    );
  });

  it("separates a query that matched nothing from an answer it cannot read", () => {
    // Two different facts, and only one of them is about the release. A
    // query that matched no extension IS "the Marketplace serves nothing";
    // an answer in a shape this reader does not recognise says nothing at
    // all, and reporting it as a missing version would tell an operator
    // mid-release that their publish failed on the evidence of a schema
    // change.
    assert.deepEqual(servedVersions({ results: [] }), []);
    assert.deepEqual(servedVersions({ results: [{ extensions: [] }] }), []);
    for (const unreadable of [{}, null, { results: {} }, { results: [{}] }]) {
      assert.deepEqual(servedVersions(unreadable), null);
    }
    // A recognised shape whose version entries are not versions is empty,
    // not unreadable: the rows are there and none of them names one.
    assert.deepEqual(servedVersions({ results: [{ extensions: [{ versions: [{}, 3] }] }] }), []);
  });
});

describe("the brief the operator answers", () => {
  it("states the cost of a wrong answer, not only the choices", () => {
    // The whole reason this is a brief and not a prompt: the reader has to
    // be able to tell what they cannot take back.
    const { repo } = makeAnsweredSandbox();
    const row = raisePublicationDecision(repo, { version: "2.0.0" });
    assert.match(String(row?.["determined"]), /cannot be recalled/);
    assert.deepEqual(
      (row?.["options"] as Array<{ label: string }>).map((option) => option.label),
      ["publish", "release-candidate", "not yet"],
    );
  });

  it("does not recommend the answer that defeats the session", () => {
    // This session exists BECAUSE the product is uninstallable, so the answer
    // leaving it uninstallable cannot be the recommended one. An earlier
    // draft recommended the release candidate and called it "the whole
    // path", which was false -- it never touches the Marketplace -- and was
    // a recommendation to not do the thing.
    const { repo } = makeAnsweredSandbox();
    const row = raisePublicationDecision(repo, { version: "2.0.0" });
    assert.deepEqual(row?.["recommendation"], "publish");
    const rc = (row?.["options"] as { label: string; consequence: string }[]).find(
      (option) => option.label === "release-candidate",
    );
    // And it says so of itself: a build that publishes nothing.
    assert.match(String(rc?.consequence), /BUILDS and does/);
    assert.match(String(rc?.consequence), /not publish/);
  });

  it("does not block a close, because an unpublished product is not unverified", () => {
    const { repo } = makeAnsweredSandbox();
    raisePublicationDecision(repo, { version: "2.0.0" });
    assert.deepEqual(blockingDecisions(repo), []);
  });

  it("asks once, however often the verb runs", () => {
    const { repo } = makeAnsweredSandbox();
    raisePublicationDecision(repo, { version: "2.0.0" });
    assert.equal(raisePublicationDecision(repo, { version: "2.0.0" }), null);
  });

  it("carries the operator's answer, and nobody else's", () => {
    // `answeredBy` is "operator" and there is no other value: a verdict a
    // model can write is a verdict a model can be wrong about.
    const { repo } = makeAnsweredSandbox();
    raisePublicationDecision(repo, { version: "2.0.0" });
    answerOwed(repo, ID_PUBLICATION, "not yet");
    const row = currentDecisions(repo).find((r) => String(r["id"]) === ID_PUBLICATION);
    assert.equal(row?.["answer"], "not yet");
    assert.equal(row?.["answeredBy"], "operator");
  });
});
