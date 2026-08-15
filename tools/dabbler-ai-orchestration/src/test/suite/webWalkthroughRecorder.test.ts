// Set 113 S3 — the browser recorder's own refusals, and the fixture it drives.
//
// The Python model treats a scenario's `drivers:` block as OPAQUE on
// purpose: that quarantine is what lets a selector change leave all four
// generated documents byte-identical. The cost of the quarantine is that
// validating the block becomes this driver's job rather than nobody's, so
// the refusals live here and so do their falsifiers.
//
// The recording itself is deliberately NOT tested here. The spec refuses CI
// recording outright — "a headless runner records a different thing than
// the operator's machine shows" — so what a test can honestly own is the
// part that is pure: the argument parsing, the block validation, and the
// fixture the recorder serves.

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
// A local TS import keeps this file on the CommonJS load path under
// ts-node, which is what makes the `require` calls below legal.
import { readSessionSets } from "../../utils/fileSystem";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const recorder = require("../../../scripts/record-web-walkthrough.js") as {
  DRIVER_NAME: string;
  STEP_KEYS: Set<string>;
  ACTION_KEYS: Set<string>;
  EMPHASIS_STYLE: string;
  parseArgs: (argv: string[]) => {
    scenario: string;
    out: string | null;
    url: string | null;
    video: boolean;
    keep: boolean;
  };
  validateDriverBlock: (plan: unknown) => void;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fixture = require("../../../scripts/web-fixture-server.js") as {
  FIXTURE_ROOT: string;
  startFixtureServer: (
    root?: string,
  ) => Promise<{ url: string; close: () => Promise<void> }>;
};

/** A plan shaped like the one `walkthrough_run plan` emits. */
function plan(overrides: Record<string, unknown> = {}) {
  return {
    scenarioId: "sample",
    steps: [
      { id: "one", title: "One", action: "a", expect: "b", seconds: 8 },
      { id: "two", title: "Two", action: "a", expect: "b", seconds: 8 },
    ],
    driverBlock: {
      fixture: "task-board",
      steps: {
        one: { emphasize: "#one" },
        two: { do: [{ click: "#two" }], expect: { selector: "#s", text: "x" } },
      },
    },
    ...overrides,
  };
}

suite("Set 113 S3 — web walkthrough recorder", () => {
  suite("argument parsing", () => {
    test("records with video by default", () => {
      const options = recorder.parseArgs([]);
      assert.strictEqual(options.video, true);
      assert.ok(options.scenario.includes("walkthroughs"));
    });

    test("--no-video is the degraded path, on purpose", () => {
      assert.strictEqual(recorder.parseArgs(["--no-video"]).video, false);
    });

    test("--url points the same recorder at somebody else's application", () => {
      // The cross-cutting claim: a consumer repo changes a URL and nothing
      // else. If this ever stops parsing, the recorder is orchestrator-only.
      const options = recorder.parseArgs(["--url", "http://localhost:5173"]);
      assert.strictEqual(options.url, "http://localhost:5173");
    });

    test("an unknown flag is refused rather than ignored", () => {
      assert.throws(() => recorder.parseArgs(["--recrod-video"]), /unknown argument/);
    });
  });

  suite("driver-block validation", () => {
    test("a well-formed block passes", () => {
      assert.doesNotThrow(() => recorder.validateDriverBlock(plan()));
    });

    test("an authored step with no driver detail is refused by name", () => {
      // The defect this catches is the quiet one: the document lists five
      // steps and the recording shows four.
      const broken = plan();
      delete (broken.driverBlock.steps as Record<string, unknown>).two;
      assert.throws(
        () => recorder.validateDriverBlock(broken),
        /step 'two' has no/,
      );
    });

    test("a driver step the scenario does not declare is refused", () => {
      const broken = plan();
      (broken.driverBlock.steps as Record<string, unknown>).three = {
        emphasize: "#three",
      };
      assert.throws(
        () => recorder.validateDriverBlock(broken),
        /which the scenario does not declare/,
      );
    });

    test("an unknown step key is refused rather than silently skipped", () => {
      const broken = plan();
      (broken.driverBlock.steps as Record<string, Record<string, unknown>>).one = {
        emphasise: "#one", // the other spelling
      };
      assert.throws(() => recorder.validateDriverBlock(broken), /unknown key/);
    });

    test("an unknown action verb is refused", () => {
      const broken = plan();
      (broken.driverBlock.steps as Record<string, Record<string, unknown>>).two = {
        do: [{ doubleClick: "#two" }],
      };
      assert.throws(() => recorder.validateDriverBlock(broken), /unknown action/);
    });

    test("an expectation with nothing to read it from is refused", () => {
      const broken = plan();
      (broken.driverBlock.steps as Record<string, Record<string, unknown>>).two = {
        expect: { text: "x" },
      };
      assert.throws(() => recorder.validateDriverBlock(broken), /needs a/);
    });

    test("declaring neither a fixture nor a url is refused", () => {
      const broken = plan();
      delete (broken.driverBlock as Record<string, unknown>).fixture;
      assert.throws(() => recorder.validateDriverBlock(broken), /either 'fixture'/);
    });

    test("declaring both a fixture and a url is refused as ambiguous", () => {
      const broken = plan();
      (broken.driverBlock as Record<string, unknown>).url = "http://x/";
      assert.throws(() => recorder.validateDriverBlock(broken), /pick one/);
    });

    test("a url alone is fine — that is the consumer case", () => {
      // The legitimate look-alike for the two refusals above.
      const consumer = plan();
      delete (consumer.driverBlock as Record<string, unknown>).fixture;
      (consumer.driverBlock as Record<string, unknown>).url = "http://localhost:5173";
      assert.doesNotThrow(() => recorder.validateDriverBlock(consumer));
    });

    test("a fixture this repo does not bundle is refused with the alternative", () => {
      const broken = plan();
      (broken.driverBlock as Record<string, unknown>).fixture = "storefront";
      assert.throws(() => recorder.validateDriverBlock(broken), /point 'url' at your/);
    });
  });

  suite("step emphasis", () => {
    test("the stylesheet is the driver's, not the page's", () => {
      // A consumer cannot add a stylesheet to their own running
      // application, so an emphasis that depended on the page cooperating
      // would work on the fixture and nowhere else.
      const appCss = fs.readFileSync(
        path.join(fixture.FIXTURE_ROOT, "app.css"),
        "utf8",
      );
      assert.ok(
        !appCss.includes("dabbler-emphasis"),
        "the fixture page must not carry the emphasis styling",
      );
      assert.ok(recorder.EMPHASIS_STYLE.includes("dabbler-emphasis"));
    });

    test("emphasis uses outline, never border or margin", () => {
      // An outline does not occupy flow space. A border or a margin would
      // reflow the page mid-recording, and this repo has already measured
      // what a hover-revealed element above tree content does to a click
      // (Layer 3, Set 110).
      assert.ok(recorder.EMPHASIS_STYLE.includes("outline:"));
      assert.ok(!/\bborder:/.test(recorder.EMPHASIS_STYLE));
      assert.ok(!/\bmargin:/.test(recorder.EMPHASIS_STYLE));
      assert.ok(!/\bpadding:/.test(recorder.EMPHASIS_STYLE));
    });
  });

  suite("the fixture web app", () => {
    test("it is served over HTTP on a port nobody reserved", async () => {
      const server = await fixture.startFixtureServer();
      try {
        assert.match(server.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
        const response = await fetch(server.url);
        const body = await response.text();
        assert.strictEqual(response.status, 200);
        assert.ok(body.includes("Task Board"));
      } finally {
        await server.close();
      }
    });

    test("closing twice is safe, because the failure path may also close", async () => {
      const server = await fixture.startFixtureServer();
      await server.close();
      await server.close();
    });

    test("it refuses to serve a directory that is not the fixture", async () => {
      await assert.rejects(
        fixture.startFixtureServer(path.join(fixture.FIXTURE_ROOT, "nope")),
        /fixture web app not found/,
      );
    });

    test("a request cannot climb out of the fixture root", async () => {
      // PERCENT-ENCODED on purpose. A literal `../` is collapsed by the
      // client before the request is sent, so asserting on that form
      // would pass whether or not the server had a guard at all -- the
      // shape of test this repo already calls out (L-112-1: a gate that
      // matches nothing looks identical to one that finds nothing). The
      // encoded form survives the client and is decoded server-side,
      // which is exactly the input the guard exists for.
      const server = await fixture.startFixtureServer();
      try {
        const response = await fetch(`${server.url}%2e%2e%2f%2e%2e%2fpackage.json`);
        assert.strictEqual(response.status, 403);
      } finally {
        await server.close();
      }
    });

    test("an ordinary asset is still served", async () => {
      // The legitimate look-alike: the guard must not refuse the fixture's
      // own files.
      const server = await fixture.startFixtureServer();
      try {
        const response = await fetch(`${server.url}app.js`);
        assert.strictEqual(response.status, 200);
        assert.match(
          response.headers.get("content-type") || "",
          /text\/javascript/,
        );
      } finally {
        await server.close();
      }
    });

    test("the fixture carries no build step and no dependency", () => {
      const files = fs.readdirSync(fixture.FIXTURE_ROOT).sort();
      assert.deepStrictEqual(files, ["app.css", "app.js", "index.html"]);
    });
  });

  suite("the committed scenario stays drivable", () => {
    test("every element the driver targets exists in the fixture markup", () => {
      // The scenario's driver block and the fixture are two files that
      // have to agree. Nothing else notices when they stop, because the
      // Python model is deliberately blind to driver detail.
      const html = fs.readFileSync(
        path.join(fixture.FIXTURE_ROOT, "index.html"),
        "utf8",
      );
      const js = fs.readFileSync(path.join(fixture.FIXTURE_ROOT, "app.js"), "utf8");
      const markup = html + js;
      for (const id of [
        "new-task",
        "add-task",
        "summary",
        "empty-state",
        "task-list",
        "filters",
        "filter-open",
      ]) {
        assert.ok(
          markup.includes(`"${id}"`),
          `the fixture no longer has an element the scenario drives: ${id}`,
        );
      }
      for (const cls of ["task", "task-toggle"]) {
        assert.ok(
          markup.includes(cls),
          `the fixture no longer has the class the scenario drives: ${cls}`,
        );
      }
    });

    test("the walkthrough directory is not a session-set directory", () => {
      // `readSessionSets` is imported for a real assertion rather than to
      // satisfy the CommonJS load path: walkthroughs live beside session
      // sets and must never be mistaken for them.
      const walkthroughs = path.resolve(
        fixture.FIXTURE_ROOT,
        "..",
        "..",
        "..",
        "..",
        "..",
        "..",
        "docs",
        "walkthroughs",
      );
      if (!fs.existsSync(walkthroughs)) return;
      assert.strictEqual(readSessionSets(walkthroughs).length, 0);
    });
  });
});
