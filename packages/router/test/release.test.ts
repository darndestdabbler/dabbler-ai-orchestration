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
import { makeSandboxRepo, makeTempDir, removeTempDirs } from "./support/fixtures.ts";

afterAll(removeTempDirs);

const VERSION = "2.0.0";

describe("what an answer means", () => {
  it("tags one artifact, because there is one", () => {
    // There were two until 2026-09-02, with an order between them: the
    // router to npm first, because the extension bundles it and a
    // Marketplace version whose npm half was missing would be the broken
    // half-release. npm is retired — the router ships INSIDE the extension —
    // so there is no half that can be missing and nothing to sequence.
    expect(tagsFor("publish", VERSION)).toEqual(["vsix-v2.0.0"]);
  });

  it("builds a release candidate without publishing it", () => {
    // The workflow classifies an `-rcN` tag as build-only, so the artifact is
    // downloadable from the run and installable by hand while the listing
    // does not move. A rehearsal is not a release, and the brief says that of
    // itself rather than leaving the reader to discover it.
    expect(tagsFor("release-candidate", VERSION)).toEqual(["vsix-v2.0.0-rc1"]);
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

  it("takes the version from version.json and refuses a manifest that is stale", () => {
    // An install showed router 2.0.0 beside extension 2.7.0 -- two things
    // where the operator has one. npm and the Marketplace each need a
    // literal version in their own manifest, so ONE SOURCE means one file
    // that declares it and a stamping step that writes it everywhere;
    // `release` asks whether that stamping is current before it tags.
    const root = makeTempDir();
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
    expect(releaseVersion(root)).toEqual({ version: "2.8.0", reason: "" });

    // A manifest left behind by a bump: named, with the command that fixes it.
    stamped("2.8.0", "2.0.0", "2.8.0", "2.8.0");
    expect(releaseVersion(root).version).toBeNull();
    expect(releaseVersion(root).reason).toContain("stamp:version");

    // And the dependency, EXACTLY: the extension bundles the router, so a
    // range that merely contains the number is not this version being named.
    stamped("2.8.0", "2.8.0", "2.8.0", "^2.0.0");
    expect(releaseVersion(root).version).toBeNull();
    stamped("2.8.0", "2.8.0", "2.8.0", "12.8.0");
    expect(releaseVersion(root).version).toBeNull();
    write("tools/dabbler-ai-orchestration/package.json", { version: "2.8.0" });
    expect(releaseVersion(root).version).toBeNull();
  });

  it("has one version in this repository, and every manifest carries it", () => {
    // The control that keeps the merge merged after the session that made
    // it: it reads the repository itself, so a half-stamped release is a red
    // suite rather than two artifacts nobody can say the version of.
    const here = join(import.meta.dirname, "..", "..", "..");
    const agreed = releaseVersion(here);
    expect(agreed.reason).toBe("");
    expect(agreed.version).toBe(canonicalVersion(here));
    expect(tagsFor("publish", agreed.version ?? "")).toEqual([
      `vsix-v${agreed.version}`,
    ]);
  });
});

describe("what the Marketplace says it serves", () => {
  it("reads the versions out of a gallery answer, newest first", () => {
    // The parsing is here and the network call is not: a test that asked the
    // Marketplace would be a test of the Marketplace, green or red for
    // reasons that have nothing to do with this repository.
    expect(
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
    ).toEqual(["2.0.0", "1.0.4"]);
  });

  it("answers nothing for a shape it does not recognise, rather than guessing", () => {
    // An empty answer means "the Marketplace serves no version of this",
    // which `--verify-install` reports as a refusal. Inventing a version
    // from a malformed payload would report a publish that never happened.
    for (const payload of [{}, { results: [] }, { results: [{ extensions: [] }] }, null]) {
      expect(servedVersions(payload)).toEqual([]);
    }
    expect(servedVersions({ results: [{ extensions: [{ versions: [{}, 3] }] }] })).toEqual([]);
  });
});

describe("the brief the operator answers", () => {
  it("states the cost of a wrong answer, not only the choices", () => {
    // The whole reason this is a brief and not a prompt: the reader has to
    // be able to tell what they cannot take back.
    const { repo } = makeSandboxRepo();
    const row = raisePublicationDecision(repo, { version: "2.0.0" });
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
    const row = raisePublicationDecision(repo, { version: "2.0.0" });
    expect(row?.["recommendation"]).toBe("publish");
    const rc = (row?.["options"] as { label: string; consequence: string }[]).find(
      (option) => option.label === "release-candidate",
    );
    // And it says so of itself: a build that publishes nothing.
    expect(rc?.consequence).toContain("BUILDS and does");
    expect(rc?.consequence).toContain("not publish");
  });

  it("does not block a close, because an unpublished product is not unverified", () => {
    const { repo } = makeSandboxRepo();
    raisePublicationDecision(repo, { version: "2.0.0" });
    expect(blockingDecisions(repo)).toEqual([]);
  });

  it("asks once, however often the verb runs", () => {
    const { repo } = makeSandboxRepo();
    raisePublicationDecision(repo, { version: "2.0.0" });
    expect(
      raisePublicationDecision(repo, { version: "2.0.0" }),
    ).toBeNull();
  });

  it("carries the operator's answer, and nobody else's", () => {
    // `answeredBy` is "operator" and there is no other value: a verdict a
    // model can write is a verdict a model can be wrong about.
    const { repo } = makeSandboxRepo();
    raisePublicationDecision(repo, { version: "2.0.0" });
    answerOwed(repo, ID_PUBLICATION, "not yet");
    const row = currentDecisions(repo).find((r) => String(r["id"]) === ID_PUBLICATION);
    expect(row?.["answer"]).toBe("not yet");
    expect(row?.["answeredBy"]).toBe("operator");
  });
});
