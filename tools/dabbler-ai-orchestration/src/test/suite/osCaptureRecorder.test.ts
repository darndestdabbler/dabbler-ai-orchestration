// Set 113 S4 — the OS-capture recorder's refusals, and the measuring
// instruments the pilot's verdict rests on.
//
// WHAT IS TESTED HERE AND WHY IT IS THIS AND NOT THE CAPTURE. The spec
// refuses CI recording outright ("a headless runner records a different
// thing than the operator's machine shows"), and OBS is an optional
// prerequisite no CI machine has. So what a test can honestly own is the
// pure half: the driver-block refusals, and the PNG/MP4/WebVTT instruments
// the measurement reads its numbers from.
//
// The instruments matter more than they look. The pilot's whole verdict is
// "correlation was 0.97 and the magenta fraction was 0" -- and a decoder
// that silently mis-unfiltered a scanline, or a correlation that returned
// 1.0 for two blank images, would produce exactly those numbers while
// measuring nothing. Every instrument below therefore gets BOTH a case that
// must pass and a planted case that must fail (L-112-1): a real PNG and a
// corrupt one, matching images and mismatched ones, magenta present and
// magenta absent.

import * as assert from "assert";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as zlib from "zlib";
// A local TS import keeps this file on the CommonJS load path under
// ts-node, which is what makes the `require` calls below legal. It earns
// its place with a real assertion at the bottom of the file.
import { readSessionSets } from "../../utils/fileSystem";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const recorder = require("../../../scripts/record-vscode-walkthrough.js") as {
  DRIVER_NAME: string;
  parseArgs: (argv: string[]) => {
    scenario: string;
    out: string | null;
    video: boolean;
    keep: boolean;
  };
  validateDriverBlock: (plan: unknown) => unknown;
  captureApproval: () => { approved: boolean; reason: string };
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const metrics = require("../../../scripts/png-metrics.js") as {
  decodePng: (buffer: Buffer) => {
    width: number;
    height: number;
    channels: number;
    data: Buffer;
  };
  grayscaleGrid: (image: unknown, size: number) => Float64Array;
  correlate: (a: Float64Array, b: Float64Array) => number;
  colorFraction: (
    image: unknown,
    rgb: [number, number, number],
    tolerance: number,
  ) => number;
  comparePngs: (
    a: Buffer,
    b: Buffer,
    size?: number,
  ) => { correlation: number; a: { width: number; height: number } };
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const obsClient = require("../../../scripts/obs-websocket-client.js") as {
  authResponse: (password: string, salt: string, challenge: string) => string;
  ObsUnavailableError: new (kind: string, message: string) => Error & {
    kind: string;
  };
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const capture = require("../../../scripts/obs-capture.js") as {
  toEven: (n: number) => number;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pilot = require("../../../scripts/measure-os-capture.js") as {
  parseVtt: (file: string) => { start: number; end: number }[];
  OCCLUDER_HTML: string;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const verdict = require("../../../scripts/os-capture-verdict.js") as {
  evaluate: (
    measurement: Record<string, unknown>,
    criteria: Record<string, unknown>,
  ) => { verdict: string; unmet: string[]; cleanRuns: number };
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const realCriteria = require("../../../../../docs/session-sets/113-narrated-video-walkthroughs/s4-pilot-criteria.json") as Record<
  string,
  unknown
>;

/** A plan shaped like the one `walkthrough_run plan` emits. */
function plan(overrides: Record<string, unknown> = {}) {
  return {
    scenarioId: "sample",
    steps: [
      { id: "one", title: "One", action: "a", expect: "b", seconds: 8 },
      { id: "two", title: "Two", action: "a", expect: "b", seconds: 8 },
    ],
    driverBlock: {
      paneSelector: ".monaco-list-row",
      twistieSelector: ".monaco-tl-twistie",
      steps: {
        one: { rowText: "Default" },
        two: { rowText: "Default", click: "twistie" },
      },
    },
    ...overrides,
  };
}

/**
 * A minimal 8-bit RGBA PNG encoder, so the decoder is tested against bytes
 * a real encoder would produce rather than against itself.
 *
 * `filterType` is a parameter because filter 0 hides every unfilter bug:
 * the round-trip test below drives all five, since real OBS and Playwright
 * screenshots use the others and a decoder that only handled filter 0
 * would return garbage on the one input that matters.
 */
function encodePng(
  width: number,
  height: number,
  pixel: (x: number, y: number) => [number, number, number],
  filterType = 0,
): Buffer {
  const stride = width * 4;
  const rawRows: Buffer[] = [];
  const previous = Buffer.alloc(stride);
  let prior = previous;
  for (let y = 0; y < height; y++) {
    const line = Buffer.alloc(stride);
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y);
      line[x * 4] = r;
      line[x * 4 + 1] = g;
      line[x * 4 + 2] = b;
      line[x * 4 + 3] = 255;
    }
    const encoded = Buffer.alloc(stride + 1);
    encoded[0] = filterType;
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? line[i - 4] : 0;
      const b = prior[i];
      const c = i >= 4 ? prior[i - 4] : 0;
      let value: number;
      switch (filterType) {
        case 1:
          value = line[i] - a;
          break;
        case 2:
          value = line[i] - b;
          break;
        case 3:
          value = line[i] - ((a + b) >> 1);
          break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          value = line[i] - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default:
          value = line[i];
      }
      encoded[i + 1] = value & 0xff;
    }
    rawRows.push(encoded);
    prior = line;
  }

  const chunk = (type: string, body: Buffer): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(body.length);
    const typeAndBody = Buffer.concat([Buffer.from(type, "ascii"), body]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typeAndBody) >>> 0);
    return Buffer.concat([length, typeAndBody, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(Buffer.concat(rawRows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c;
}

const STRUCTURED = (x: number, y: number): [number, number, number] => [
  (x * 7) % 256,
  (y * 11) % 256,
  (x * y) % 256,
];

suite("Set 113 S4 - OS capture driver-block refusals", () => {
  test("accepts a block that covers every portable step", () => {
    assert.doesNotThrow(() => recorder.validateDriverBlock(plan()));
  });

  test("refuses a scenario with no driver block for this driver", () => {
    assert.throws(
      () => recorder.validateDriverBlock(plan({ driverBlock: undefined })),
      /has no 'playwright-vscode' driver block/,
    );
  });

  test("refuses a block missing the selectors it drives with", () => {
    const broken = plan();
    delete (broken.driverBlock as Record<string, unknown>).twistieSelector;
    assert.throws(
      () => recorder.validateDriverBlock(broken),
      /needs both paneSelector and twistieSelector/,
    );
  });

  test("refuses a portable step the block has no mechanics for", () => {
    const broken = plan();
    delete (broken.driverBlock.steps as Record<string, unknown>).two;
    assert.throws(
      () => recorder.validateDriverBlock(broken),
      /no mechanics for portable step 'two'/,
    );
  });

  test("refuses mechanics for a step the scenario does not have", () => {
    const broken = plan();
    (broken.driverBlock.steps as Record<string, unknown>).three = {
      rowText: "Nope",
    };
    assert.throws(
      () => recorder.validateDriverBlock(broken),
      /driver that drives steps nobody authored/,
    );
  });

  test("--no-video is what asks for the degraded path", () => {
    assert.strictEqual(recorder.parseArgs([]).video, true);
    assert.strictEqual(recorder.parseArgs(["--no-video"]).video, false);
  });

  test("an unrecognised argument is refused rather than ignored", () => {
    assert.throws(() => recorder.parseArgs(["--recrod"]), /unrecognised/);
  });
});

suite("Set 113 S4 - the PNG instrument the verdict rests on", () => {
  test("decodes width, height and pixels a real encoder produced", () => {
    const png = encodePng(9, 5, () => [10, 20, 30]);
    const image = metrics.decodePng(png);
    assert.strictEqual(image.width, 9);
    assert.strictEqual(image.height, 5);
    assert.strictEqual(image.channels, 4);
    assert.strictEqual(image.data[0], 10);
    assert.strictEqual(image.data[1], 20);
    assert.strictEqual(image.data[2], 30);
  });

  test("every scanline filter round-trips", () => {
    // The planted case for the unfilter. Filter 0 hides every unfilter bug,
    // and OBS and Playwright both emit mixed filters on real screenshots --
    // so a decoder tested only on filter 0 would pass here and return
    // garbage on the one input that matters.
    for (const filter of [0, 1, 2, 3, 4]) {
      const png = encodePng(16, 9, STRUCTURED, filter);
      const image = metrics.decodePng(png);
      for (const [x, y] of [
        [0, 0],
        [7, 3],
        [15, 8],
      ]) {
        const [r, g, b] = STRUCTURED(x, y);
        const i = (y * 16 + x) * 4;
        assert.strictEqual(image.data[i], r, `filter ${filter} R at ${x},${y}`);
        assert.strictEqual(image.data[i + 1], g, `filter ${filter} G`);
        assert.strictEqual(image.data[i + 2], b, `filter ${filter} B`);
      }
    }
  });

  test("refuses bytes that are not a PNG", () => {
    assert.throws(
      () => metrics.decodePng(Buffer.from("this is not a png")),
      /not a PNG/,
    );
  });

  test("an image correlates with itself and not with a different one", () => {
    const a = encodePng(24, 16, STRUCTURED);
    const b = encodePng(24, 16, (x, y) => {
      const [r, g, bb] = STRUCTURED(x, y);
      return [255 - r, 255 - g, 255 - bb];
    });
    assert.ok(
      metrics.comparePngs(a, a, 16).correlation > 0.999,
      "an image must correlate with itself",
    );
    // The planted failure. Without it, an instrument that returned 1.0 for
    // every pair would pass the assertion above and would report every
    // wrong-window capture as correct.
    assert.ok(
      metrics.comparePngs(a, b, 16).correlation < 0.9,
      "an inverted image must not clear the C1 threshold",
    );
  });

  test("a blank frame scores zero rather than one", () => {
    // A black frame is the failure mode gdigrab produces on
    // hardware-accelerated windows. Two blank images have zero variance,
    // and a naive Pearson divides by zero; returning 1.0 there would make
    // the single most likely capture failure look like a perfect capture.
    const blank = encodePng(16, 16, () => [0, 0, 0]);
    assert.strictEqual(metrics.comparePngs(blank, blank, 16).correlation, 0);
  });

  test("the magenta detector fires on magenta and not on the workbench", () => {
    const magenta = encodePng(20, 20, () => [255, 0, 255]);
    const dark = encodePng(20, 20, () => [30, 30, 30]);
    assert.strictEqual(
      metrics.colorFraction(metrics.decodePng(magenta), [255, 0, 255], 24),
      1,
    );
    assert.strictEqual(
      metrics.colorFraction(metrics.decodePng(dark), [255, 0, 255], 24),
      0,
    );
  });

  test("the detector's tolerance is a window, not an equality", () => {
    const nearly = encodePng(10, 10, () => [245, 12, 240]);
    assert.strictEqual(
      metrics.colorFraction(metrics.decodePng(nearly), [255, 0, 255], 24),
      1,
    );
    const beyond = encodePng(10, 10, () => [200, 60, 200]);
    assert.strictEqual(
      metrics.colorFraction(metrics.decodePng(beyond), [255, 0, 255], 24),
      0,
    );
  });

  test("half a magenta frame reads as half", () => {
    const split = encodePng(20, 20, (_x, y) =>
      y < 10 ? [255, 0, 255] : [0, 0, 0],
    );
    assert.strictEqual(
      metrics.colorFraction(metrics.decodePng(split), [255, 0, 255], 24),
      0.5,
    );
  });

  test("the occluder page is actually magenta", () => {
    // The C2 control is only a control if the thing it raises is the colour
    // the detector looks for.
    assert.ok(decodeURIComponent(pilot.OCCLUDER_HTML).includes("#ff00ff"));
  });
});

suite("Set 113 S4 - obs-websocket and capture helpers", () => {
  test("the v5 auth response matches the documented construction", () => {
    // base64(sha256(base64(sha256(password + salt)) + challenge)). Pinned
    // against a hand-computed vector: a wrong hash here fails as
    // "unreachable", which sends whoever debugs it to look at firewalls.
    const password = "supersecret";
    const salt = "salty";
    const challenge = "chally";
    const secret = crypto
      .createHash("sha256")
      .update(password + salt, "utf8")
      .digest("base64");
    const expected = crypto
      .createHash("sha256")
      .update(secret + challenge, "utf8")
      .digest("base64");
    assert.strictEqual(
      obsClient.authResponse(password, salt, challenge),
      expected,
    );
  });

  test("an unavailable OBS carries a machine-readable kind", () => {
    // C5 asks for a NAMED failure per variant, and a name that exists only
    // in prose is not one -- callers must not have to grep a message.
    const err = new obsClient.ObsUnavailableError("auth-rejected", "nope");
    assert.strictEqual(err.kind, "auth-rejected");
    assert.strictEqual(err.name, "ObsUnavailableError");
  });

  test("canvas dimensions are rounded down to even", () => {
    // yuv420 encoders reject odd dimensions, and the canvas is the window,
    // whose size is whatever the window happens to be.
    assert.strictEqual(capture.toEven(1440), 1440);
    assert.strictEqual(capture.toEven(1441), 1440);
    assert.strictEqual(capture.toEven(1), 2);
  });
});

suite("Set 113 S4 - caption timing instrument", () => {
  test("cue windows are read out of real WebVTT", () => {
    const file = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-vtt-")),
      "captions.vtt",
    );
    fs.writeFileSync(
      file,
      "WEBVTT\n\n1\n00:00:00.000 --> 00:00:08.500\nFirst\n\n" +
        "2\n00:00:08.500 --> 00:01:02.250\nSecond\n",
      "utf8",
    );
    const cues = pilot.parseVtt(file);
    assert.deepStrictEqual(cues, [
      { start: 0, end: 8500 },
      { start: 8500, end: 62250 },
    ]);
  });

  test("a file with no cues yields no cues rather than throwing", () => {
    // C4 compares cue count against step count; a parser that threw on an
    // empty caption file would turn a measurable failure into a crash.
    const file = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-vtt-empty-")),
      "captions.vtt",
    );
    fs.writeFileSync(file, "WEBVTT\n", "utf8");
    assert.deepStrictEqual(pilot.parseVtt(file), []);
  });
});

suite("Set 113 S4 - the pilot verdict, and its ability to fail", () => {
  // A synthetic measurement that SHOULD pass, built once and then damaged
  // one field at a time. This is the L-112-1 shape: an evaluator that
  // returned PASS unconditionally would satisfy the happy case and would
  // have rubber-stamped the whole session.
  function passingMeasurement() {
    const run = (index: number) => ({
      observations: {
        index,
        correlationWithTarget: 0.9996,
        frameSize: { width: 1440, height: 900 },
        windowPhysical: { width: 1440, height: 900 },
        dimensionDeltaPx: 0,
        scaleFactor: 1,
        magentaFractionUnderOcclusion: 0,
        correlationUnderOcclusion: 0.99,
        sceneItemCount: 1,
        inputKinds: ["window_capture"] as string[],
        decoyCorrelation: index === 1 ? 0.11 : null,
        magentaFractionInDecoyCapture: index === 1 ? 0.82 : null,
        errors: [] as string[],
      },
      timing: {
        cues: 5,
        steps: 5,
        allCuesInsideRecording: true,
        recordingDurationMs: 46000,
      },
      container: { handlers: ["vide"] as string[], durationSeconds: 46 },
      anchor: { uncertaintyMillis: 110 },
      stepsCompleted: 5,
      stepCount: 5,
      usable: true,
      failure: null,
      cleanupProblems: [] as string[],
      videoBytes: 34612776,
    });
    // Shaped like the real pilot: run 1 carries the controls, so its video
    // is contaminated and a supplementary run supplies the tenth clean
    // capture. A fixture that pretended all ten were clean would not
    // exercise the exclusion the verdict actually applies.
    return {
      runs: Array.from({ length: 10 }, (_v, i) => run(i + 1)),
      supplementaryRuns: [run(11)],
      resizeVariant: (() => {
        const r = run(90);
        r.observations.frameSize = { width: 1024, height: 700 };
        r.observations.windowPhysical = { width: 1024, height: 700 };
        return r;
      })(),
      // C6's real evidence: a plain-Error failure induced at each point a
      // capture can fail, each of which must clean up completely AND leave
      // the walkthrough intact.
      inducedFailures: ["configure", "start", "stop"].map((point) => ({
        inducedAt: point,
        stateAtFailure: {
          inputs: ["window_capture"] as string[],
          sceneItems: 1,
          currentSceneCollection: "dabbler-walkthrough-collection",
          // Active at start and stop; not yet at configure. This is the
          // shape that proves the failure was induced AFTER the operation.
          recordingActive: point !== "configure",
        },
        walkthroughStillCompleted: true,
        manifestWritten: true,
        osVideoArtifacts: 0,
        stepsCompleted: 5,
        stepCount: 5,
        cleanupProblems: [] as string[],
        obsProcessRemaining: 0,
        sceneCollectionsLeftBehind: [] as string[],
        profilesLeftBehind: [] as string[],
        websocketConfigRestored: true,
        sentinelsLeftBehind: [] as string[],
      })),
      dependencyAbsent: [
        "websocket-unreachable",
        "websocket-auth-rejected",
        "obs-executable-absent",
      ].map((variant) => ({
        variant,
        kind: variant,
        mentionsObs: true,
        walkthroughStillCompleted: true,
        manifestWritten: true,
        osVideoArtifacts: 0,
        cleanupProblems: [] as string[],
      })),
    };
  }

  test("a clean measurement passes against the real committed criteria", () => {
    const result = verdict.evaluate(passingMeasurement(), realCriteria);
    assert.deepStrictEqual(result.unmet, []);
    assert.strictEqual(result.verdict, "PASS");
    assert.strictEqual(result.cleanRuns, 10);
  });

  test("one run below the correlation threshold fails C1", () => {
    const m = passingMeasurement();
    m.runs[6].observations.correlationWithTarget = 0.62;
    const result = verdict.evaluate(m, realCriteria);
    assert.ok(result.unmet.includes("C1"));
    assert.strictEqual(result.verdict, "FAIL");
  });

  test("a decoy that correlates as well as the target fails C1", () => {
    // The control's whole job. Without this branch, an instrument that
    // returned 0.9996 for every pair would score a perfect pass.
    const m = passingMeasurement();
    m.runs[0].observations.decoyCorrelation = 0.98;
    assert.ok(verdict.evaluate(m, realCriteria).unmet.includes("C1"));
  });

  test("no control run at all fails C1 rather than passing by default", () => {
    const m = passingMeasurement();
    m.runs[0].observations.decoyCorrelation = null;
    assert.ok(verdict.evaluate(m, realCriteria).unmet.includes("C1"));
  });

  test("occluder pixels in frame fail C2", () => {
    const m = passingMeasurement();
    m.runs[3].observations.magentaFractionUnderOcclusion = 0.07;
    assert.ok(verdict.evaluate(m, realCriteria).unmet.includes("C2"));
  });

  test("a magenta detector that finds nothing anywhere fails C2", () => {
    const m = passingMeasurement();
    m.runs[0].observations.magentaFractionInDecoyCapture = 0.0;
    assert.ok(verdict.evaluate(m, realCriteria).unmet.includes("C2"));
  });

  test("a frame that ignores the window's size fails C3", () => {
    const m = passingMeasurement();
    m.runs[2].observations.dimensionDeltaPx = 40;
    assert.ok(verdict.evaluate(m, realCriteria).unmet.includes("C3"));
  });

  test("a resize the frame did not follow fails C3", () => {
    // A capture pinned to a fixed canvas reports a delta of zero against a
    // window it is ignoring, so equal frame sizes before and after a
    // deliberate resize must not pass.
    const m = passingMeasurement();
    m.resizeVariant.observations.frameSize = { width: 1440, height: 900 };
    assert.ok(verdict.evaluate(m, realCriteria).unmet.includes("C3"));
  });

  test("a caption cue past the end of the recording fails C4", () => {
    const m = passingMeasurement();
    m.runs[8].timing.allCuesInsideRecording = false;
    assert.ok(verdict.evaluate(m, realCriteria).unmet.includes("C4"));
  });

  test("a missing cue fails C4 even when the timing is fine", () => {
    const m = passingMeasurement();
    m.runs[1].timing.cues = 4;
    assert.ok(verdict.evaluate(m, realCriteria).unmet.includes("C4"));
  });

  test("a dependency-absent variant that never ran fails C5", () => {
    const m = passingMeasurement();
    m.dependencyAbsent = m.dependencyAbsent.filter(
      (v) => v.variant !== "websocket-auth-rejected",
    );
    assert.ok(verdict.evaluate(m, realCriteria).unmet.includes("C5"));
  });

  test("a clean failure that loses the walkthrough fails C5", () => {
    // The more important half: reporting the missing dependency beautifully
    // and then producing nothing is not the degradation the spec asks for.
    const m = passingMeasurement();
    m.dependencyAbsent[0].walkthroughStillCompleted = false;
    assert.ok(verdict.evaluate(m, realCriteria).unmet.includes("C5"));
  });

  test("anything left behind fails C6", () => {
    const m = passingMeasurement();
    m.runs[5].cleanupProblems = ["obs process 1234 still running"];
    assert.ok(verdict.evaluate(m, realCriteria).unmet.includes("C6"));
  });

  test("C6 cannot pass on setup failures alone", () => {
    // The finding verification caught: the dependency-absent variants all
    // die during SETUP, two of them before a scene collection exists, so
    // they exercise a cleanup with nothing to undo. C6 asks for a failure
    // AFTER everything exists, and must refuse to pass without one.
    const m = passingMeasurement();
    m.inducedFailures = [];
    assert.ok(verdict.evaluate(m, realCriteria).unmet.includes("C6"));
  });

  test("a missing induction point fails C6", () => {
    const m = passingMeasurement();
    m.inducedFailures = m.inducedFailures.filter((f) => f.inducedAt !== "stop");
    assert.ok(verdict.evaluate(m, realCriteria).unmet.includes("C6"));
  });

  test("an induced failure that leaves OBS running fails C6", () => {
    const m = passingMeasurement();
    m.inducedFailures[1].obsProcessRemaining = 1;
    assert.ok(verdict.evaluate(m, realCriteria).unmet.includes("C6"));
  });

  test("an induced failure that leaves a scene collection fails C6", () => {
    const m = passingMeasurement();
    m.inducedFailures[0].sceneCollectionsLeftBehind = ["stray.json"];
    assert.ok(verdict.evaluate(m, realCriteria).unmet.includes("C6"));
  });

  test("an induced failure that does not restore the config fails C6", () => {
    const m = passingMeasurement();
    m.inducedFailures[2].websocketConfigRestored = false;
    assert.ok(verdict.evaluate(m, realCriteria).unmet.includes("C6"));
  });

  test("a capture failure that DESTROYS the walkthrough fails C6", () => {
    // The other half, and the one that matters most: cleaning up perfectly
    // while deleting the user's walkthrough is not success. This is the
    // defect verification found in the recorder, pinned in the evaluator.
    const m = passingMeasurement();
    m.inducedFailures[0].walkthroughStillCompleted = false;
    assert.ok(verdict.evaluate(m, realCriteria).unmet.includes("C6"));
    const noManifest = passingMeasurement();
    noManifest.inducedFailures[1].manifestWritten = false;
    assert.ok(verdict.evaluate(noManifest, realCriteria).unmet.includes("C6"));
  });

  test("a degraded run that still emits a video artifact fails C6", () => {
    const m = passingMeasurement();
    m.inducedFailures[2].osVideoArtifacts = 1;
    assert.ok(verdict.evaluate(m, realCriteria).unmet.includes("C6"));
  });

  test("an induced failure with no recorded state fails C6", () => {
    // Verification's nit: an injection sitting BEFORE its operation proves
    // less than the prose claims. C6 now requires the live OBS state at the
    // instant of the throw, so "post-operation" is evidence, not wording.
    const m = passingMeasurement();
    (m.inducedFailures[0] as Record<string, unknown>).stateAtFailure = null;
    assert.ok(verdict.evaluate(m, realCriteria).unmet.includes("C6"));
  });

  test("a failure induced before the scene exists fails C6", () => {
    const m = passingMeasurement();
    m.inducedFailures[0].stateAtFailure.sceneItems = 0;
    assert.ok(verdict.evaluate(m, realCriteria).unmet.includes("C6"));
  });

  test("a 'start' failure with no live recording fails C6", () => {
    // If the recording is not active, the failure was induced before
    // startRecording returned, which is the pre-operation case.
    const m = passingMeasurement();
    m.inducedFailures[1].stateAtFailure.recordingActive = false;
    assert.ok(verdict.evaluate(m, realCriteria).unmet.includes("C6"));
  });

  test("a supplementary run is judged against C1-C4, not just counted", () => {
    // The supplementary pass caught this: cleanRuns included
    // supplementaryRuns while C1-C4 were evaluated over `runs` alone, so
    // the recording that SUPPLIES the tenth capture was never checked.
    const m = passingMeasurement();
    m.supplementaryRuns[0].observations.correlationWithTarget = 0.3;
    const result = verdict.evaluate(m, realCriteria);
    assert.ok(result.unmet.includes("C1"), "a bad supplementary run must fail C1");
    const leaky = passingMeasurement();
    leaky.supplementaryRuns[0].observations.magentaFractionUnderOcclusion = 0.4;
    assert.ok(verdict.evaluate(leaky, realCriteria).unmet.includes("C2"));
  });

  test("a leftover from a PART-WAY failure fails C6 too", () => {
    const m = passingMeasurement();
    m.dependencyAbsent[2].cleanupProblems = ["profile file survived cleanup"];
    assert.ok(verdict.evaluate(m, realCriteria).unmet.includes("C6"));
  });

  test("a second source in the scene fails C7", () => {
    const m = passingMeasurement();
    m.runs[4].observations.sceneItemCount = 2;
    assert.ok(verdict.evaluate(m, realCriteria).unmet.includes("C7"));
  });

  test("a camera or screen input anywhere fails C7", () => {
    const m = passingMeasurement();
    m.runs[7].observations.inputKinds = ["window_capture", "dshow_input"];
    assert.ok(verdict.evaluate(m, realCriteria).unmet.includes("C7"));
    const screen = passingMeasurement();
    screen.runs[0].observations.inputKinds = ["monitor_capture"];
    assert.ok(verdict.evaluate(screen, realCriteria).unmet.includes("C7"));
  });

  test("an audio track fails C7", () => {
    // This is the one the real pilot trips, and the test pins that the
    // evaluator reports it rather than tolerating it.
    const m = passingMeasurement();
    m.runs[0].container.handlers = ["vide", "soun"];
    assert.ok(verdict.evaluate(m, realCriteria).unmet.includes("C7"));
  });

  test("nine clean runs is not ten", () => {
    const m = passingMeasurement();
    m.runs[9].videoBytes = 0;
    const result = verdict.evaluate(m, realCriteria);
    assert.strictEqual(result.cleanRuns, 9);
    assert.strictEqual(result.verdict, "FAIL");
  });

  test("a run that stopped short of the last step is not clean", () => {
    const m = passingMeasurement();
    m.runs[2].stepsCompleted = 3;
    assert.strictEqual(verdict.evaluate(m, realCriteria).cleanRuns, 9);
  });

  test("the control-carrying run's video does not count toward the ten", () => {
    // The run carrying the controls repoints the live capture at the decoy
    // part way through. Its MEASUREMENTS are taken first and are sound; its
    // video is several seconds of something that is not the product. If
    // this exclusion lived only in prose it would be forgotten, so it lives
    // in the verdict and this is the test that keeps it there.
    const m = passingMeasurement();
    assert.strictEqual(verdict.evaluate(m, realCriteria).cleanRuns, 10);
    m.supplementaryRuns = [];
    const result = verdict.evaluate(m, realCriteria);
    assert.strictEqual(result.cleanRuns, 9, "run 1 carried the controls");
    assert.strictEqual(result.verdict, "FAIL");
  });

  test("contamination is derived from the record, not from a flag", () => {
    // A flag someone forgot to set would silently readmit a contaminated
    // capture. Reporting a decoy correlation IS carrying the controls.
    const m = passingMeasurement();
    m.supplementaryRuns = [];
    m.runs[4].observations.decoyCorrelation = 0.1;
    assert.strictEqual(verdict.evaluate(m, realCriteria).cleanRuns, 8);
  });
});

suite("Set 113 S4 - the criteria the harness resolves by path", () => {
  test("the session set the pilot hardcodes is a real session set", () => {
    // The harness resolves its criteria file through a hardcoded set
    // directory and REFUSES to run when it is missing. That refusal is
    // correct, but it turns a rename of the set directory into "the pilot
    // will not start" with no hint as to why. This asserts the path still
    // resolves, using the project's own session-set reader rather than a
    // second opinion here about what a set directory looks like.
    // `readSessionSets` takes the WORKSPACE ROOT and joins docs/session-sets
    // itself, so this passes the root rather than the sets directory.
    const repoRoot = path.resolve(__dirname, "..", "..", "..", "..", "..");
    const setsRoot = path.join(repoRoot, "docs", "session-sets");
    if (!fs.existsSync(setsRoot)) return;
    const slugs = readSessionSets(repoRoot).map((s) => s.name);
    assert.ok(
      slugs.includes("113-narrated-video-walkthroughs"),
      "the pilot's criteria path names a set that no longer exists; found " +
        slugs.length +
        " sets",
    );
    assert.ok(
      fs.existsSync(
        path.join(
          setsRoot,
          "113-narrated-video-walkthroughs",
          "s4-pilot-criteria.json",
        ),
      ),
      "the committed pass criteria are missing; the pilot would refuse to run",
    );
  });
});

suite("Set 113 S4 - capture is gated, not merely announced", () => {
  test("capture is refused while the committed verdict is not PASS", () => {
    // Verification rejected two weaker versions of this gate. Prose in an
    // outcome document gates nothing, and a notice that printed and then
    // recorded anyway "leaves the operator's decision right advisory rather
    // than enforced". A failed pilot ships no recorder, so the CLI fails
    // closed -- and this test reads the REAL committed measurement, so it
    // starts passing for the right reason the moment a genuine PASS or a
    // committed operator waiver exists.
    const approval = recorder.captureApproval();
    const measurementPath = path.resolve(
      __dirname,
      "..",
      "..",
      "..",
      "..",
      "..",
      "docs",
      "session-sets",
      "113-narrated-video-walkthroughs",
      "s4-os-capture-measurement.json",
    );
    const waiverPath = path.resolve(
      path.dirname(measurementPath),
      "s4-operator-waiver.json",
    );
    if (!fs.existsSync(measurementPath)) return;
    const verdict = JSON.parse(fs.readFileSync(measurementPath, "utf8"))
      .evaluation?.verdict;
    const waived = fs.existsSync(waiverPath);

    if (verdict === "PASS" || waived) {
      assert.strictEqual(
        approval.approved,
        true,
        "a PASS verdict or a committed waiver must approve capture",
      );
    } else {
      assert.strictEqual(
        approval.approved,
        false,
        "capture must be refused while the pilot's verdict is " + verdict,
      );
      assert.ok(
        /FAIL|could not be read/.test(approval.reason),
        "the refusal must say why: " + approval.reason,
      );
    }
  });

  test("the refusal names a route that does not require capture", () => {
    // A gate that only says no is a dead end. The degraded path captures
    // nothing and is therefore never gated, which is what keeps the
    // walkthrough itself reachable.
    assert.strictEqual(recorder.parseArgs(["--no-video"]).video, false);
    assert.strictEqual(recorder.parseArgs([]).video, true);
  });
});
