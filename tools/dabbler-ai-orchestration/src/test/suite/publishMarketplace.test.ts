// What the publish decides when the Marketplace does not simply answer yes.
//
// The release path is the one place in this repository where a wrong
// decision is expensive and invisible: 2.1.0 and 2.1.2 were both tagged and
// neither reached an operator, and the second was lost to a gallery timeout
// that the publish step read as a verdict. Every case here is one the
// release has actually met or is one attempt away from meeting; none of them
// touches the network, spawns a process or needs a credential.
import * as assert from "assert";

import {
  ATTEMPTS,
  backoffMs,
  classifyPublishFailure,
  galleryHasVersion,
  publish,
} from "../../../scripts/publish-marketplace.mjs";

const EXTENSION = "DarndestDabbler.dabbler-ai-orchestration";

/** A gallery answer in the shape the extensionquery returns. */
function gallery(...versions: string[]) {
  return { results: [{ extensions: [{ versions: versions.map((version) => ({ version })) }] }] };
}

/** A publish run that fails every attempt with the same words. */
function alwaysFails(output: string) {
  const calls: string[] = [];
  return {
    calls,
    publishOnce: (vsixFile: string) => {
      calls.push(vsixFile);
      return { ok: false, output };
    },
  };
}

suite("publish-marketplace: what a failure was", () => {
  test("the fault that cost 2.1.2 is the weather, not a verdict", () => {
    assert.strictEqual(classifyPublishFailure("##[error]Request timeout: /_apis/gallery"), "transient");
  });

  test("a dropped or refused connection is the same weather", () => {
    for (const output of ["socket hang up", "ETIMEDOUT", "ECONNRESET", "503 Service Unavailable"]) {
      assert.strictEqual(classifyPublishFailure(output), "transient", output);
    }
  });

  test("a refusal is a refusal and is never retried", () => {
    for (const output of [
      "Failed Request: Unauthorized(401)",
      "ERROR  Access Denied: 403 Forbidden",
      "the personal access token has expired",
      "Version 2.1.2 already exists",
    ]) {
      assert.strictEqual(classifyPublishFailure(output), "refusal", output);
    }
  });

  test("a refusal delivered through a proxy is still a refusal", () => {
    // Both vocabularies in one message. Reading this as transient is how a
    // bad credential becomes four identical failures and a slow release.
    assert.strictEqual(classifyPublishFailure("403 Forbidden (bad gateway)"), "refusal");
  });

  test("an unrecognised failure is not claimed as transient", () => {
    assert.strictEqual(classifyPublishFailure("something nobody has seen before"), "unknown");
  });
});

suite("publish-marketplace: what the gallery already holds", () => {
  test("a version the gallery lists is not published over", async () => {
    const attempts = alwaysFails("Request timeout: /_apis/gallery");
    const code = await publish(
      { version: "2.1.2", vsixFile: "x.vsix", extensionId: EXTENSION, pat: "unused" },
      {
        readGallery: async () => gallery("2.1.1", "2.1.2"),
        publishOnce: attempts.publishOnce,
        wait: async () => undefined,
        log: () => undefined,
      },
    );
    assert.strictEqual(code, 0, "a job re-run after a landed upload must succeed");
    assert.strictEqual(attempts.calls.length, 0, "nothing should have been uploaded");
  });

  test("an upload that landed behind a timeout is recognised, not repeated", async () => {
    // The 2.1.2 shape exactly: the upload succeeds, the far end stops
    // answering three minutes later, and the step reads a failure.
    let asked = 0;
    const attempts = alwaysFails("##[error]Request timeout: /_apis/gallery");
    const code = await publish(
      { version: "2.1.3", vsixFile: "x.vsix", extensionId: EXTENSION, pat: "unused" },
      {
        readGallery: async () => gallery(...(++asked > 1 ? ["2.1.3"] : [])),
        publishOnce: attempts.publishOnce,
        wait: async () => undefined,
        log: () => undefined,
      },
    );
    assert.strictEqual(code, 0);
    assert.strictEqual(attempts.calls.length, 1, "it must not upload a second time");
  });

  test("an unreadable gallery after an upload stops the publish rather than sending a second", async () => {
    // The outage is correlated: the upload times out because the gallery is
    // unavailable, so the query that would say whether it landed is
    // unavailable for the same reason. Reading that silence as "not
    // published" is how one upload becomes two, and the second is refused
    // for a version that already exists -- a release that succeeded,
    // reported as a failure. It must ask, and it must not guess.
    const attempts = alwaysFails("##[error]Request timeout: /_apis/gallery");
    let asked = 0;
    const code = await publish(
      { version: "2.1.3", vsixFile: "x.vsix", extensionId: EXTENSION, pat: "unused" },
      {
        readGallery: async () => {
          asked++;
          throw new Error("the gallery answered 503");
        },
        publishOnce: attempts.publishOnce,
        wait: async () => undefined,
        log: () => undefined,
      },
    );
    assert.strictEqual(code, 1, "it must report a publish it cannot account for");
    assert.strictEqual(attempts.calls.length, 1, "it must not upload again unconfirmed");
    assert.ok(asked > 2, "it must keep asking the gallery before giving up");
  });

  test("a gallery that recovers after the upload settles it without a second upload", async () => {
    const attempts = alwaysFails("Request timeout: /_apis/gallery");
    let asked = 0;
    const code = await publish(
      { version: "2.1.3", vsixFile: "x.vsix", extensionId: EXTENSION, pat: "unused" },
      {
        readGallery: async () => {
          // Absent before the upload; unreadable straight after it; holding
          // the version once the far end comes back.
          asked++;
          if (asked === 1) return gallery("2.1.1");
          if (asked === 2) throw new Error("the gallery answered 503");
          return gallery("2.1.1", "2.1.3");
        },
        publishOnce: attempts.publishOnce,
        wait: async () => undefined,
        log: () => undefined,
      },
    );
    assert.strictEqual(code, 0);
    assert.strictEqual(attempts.calls.length, 1);
  });

  test("a gallery that cannot be read does not stop the publish", async () => {
    let uploads = 0;
    const code = await publish(
      { version: "2.1.3", vsixFile: "x.vsix", extensionId: EXTENSION, pat: "unused" },
      {
        readGallery: async () => {
          throw new Error("the gallery answered 500");
        },
        publishOnce: () => {
          uploads++;
          return { ok: true, output: "" };
        },
        wait: async () => undefined,
        log: () => undefined,
      },
    );
    assert.strictEqual(code, 0);
    assert.strictEqual(uploads, 1);
  });
});

suite("publish-marketplace: retrying", () => {
  test("the weather is waited out, up to the bound", async () => {
    const attempts = alwaysFails("Request timeout: /_apis/gallery");
    const waits: number[] = [];
    const code = await publish(
      { version: "2.1.3", vsixFile: "x.vsix", extensionId: EXTENSION, pat: "unused" },
      {
        readGallery: async () => gallery("2.1.1"),
        publishOnce: attempts.publishOnce,
        wait: async (ms: number) => {
          waits.push(ms);
        },
        log: () => undefined,
      },
    );
    assert.strictEqual(code, 1, "an unavailable gallery still fails in the end");
    assert.strictEqual(attempts.calls.length, ATTEMPTS);
    assert.strictEqual(waits.length, ATTEMPTS - 1, "it waits between attempts, not after the last");
    assert.deepStrictEqual(waits, [backoffMs(1), backoffMs(2), backoffMs(3)]);
  });

  test("a refusal ends it at the first attempt", async () => {
    const attempts = alwaysFails("Failed Request: Unauthorized(401)");
    const code = await publish(
      { version: "2.1.3", vsixFile: "x.vsix", extensionId: EXTENSION, pat: "unused" },
      {
        readGallery: async () => gallery("2.1.1"),
        publishOnce: attempts.publishOnce,
        wait: async () => undefined,
        log: () => undefined,
      },
    );
    assert.strictEqual(code, 1);
    assert.strictEqual(attempts.calls.length, 1, "a bad credential must not be tried four times");
  });

  test("an unrecognised failure is not retried either", async () => {
    const attempts = alwaysFails("something nobody has seen before");
    const code = await publish(
      { version: "2.1.3", vsixFile: "x.vsix", extensionId: EXTENSION, pat: "unused" },
      {
        readGallery: async () => gallery("2.1.1"),
        publishOnce: attempts.publishOnce,
        wait: async () => undefined,
        log: () => undefined,
      },
    );
    assert.strictEqual(code, 1);
    assert.strictEqual(attempts.calls.length, 1);
  });
});

suite("publish-marketplace: reading the gallery's answer", () => {
  test("a version present and a version absent", () => {
    assert.ok(galleryHasVersion(gallery("2.1.1", "2.1.2"), "2.1.2"));
    assert.ok(!galleryHasVersion(gallery("2.1.1"), "2.1.2"));
  });

  test("an extension the gallery has never heard of holds nothing", () => {
    assert.ok(!galleryHasVersion({ results: [{ extensions: [] }] }, "2.1.3"));
  });
});
