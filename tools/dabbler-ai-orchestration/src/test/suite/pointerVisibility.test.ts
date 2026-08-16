// Set 113 S7 — the pointer, and the check that proves it is in the frames.
//
// The recording itself is not tested here and cannot be: the spec refuses CI
// recording outright, and "a pointer is visible in the recorded frames" is a
// claim about a video file that only a real machine can produce. That claim
// is measured instead, in `s7-pointer-visibility-web.json` (6 of 6 probes)
// against its control (0.00000 at every target).
//
// What a test CAN honestly own is the part that is pure, and each rule below
// gets the shape L-112-1 asks for: one assertion that plants the defect and
// one that plants the legitimate look-alike. Several are structural rather
// than textual, because the things most likely to break here are invisible
// in a passing run -- an ffmpeg flag in the wrong order still produces a
// frame, just the wrong one.

import * as assert from "assert";
// A local TS import keeps this file on the CommonJS load path under ts-node,
// which is what makes the `require` calls below legal.
import { readSessionSets } from "../../utils/fileSystem";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pointer = require("../../../scripts/pointer.js") as {
  POINTER_ID: string;
  POINTER_SVG: string;
  APPROACH_SAMPLES: number;
  APPROACH_TOTAL_MS: number;
  entryPoint: (viewport: { width: number; height: number }) => {
    x: number;
    y: number;
  };
  PhysicalPointer: any;
  PhysicalPointerUnavailableError: any;
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const checker = require("../../../scripts/check-pointer-visible.js") as {
  CROP: { size: number; backX: number; backY: number };
  CHANNEL_TOLERANCE: number;
  ARRIVAL_MIN_CHANGED: number;
  CONTROL_MAX_CHANGED: number;
  parseArgs: (argv: string[]) => Record<string, unknown>;
  looksLikeACursor: (
    region: {
      fraction?: number;
      changed?: number;
      total?: number;
      box: { x: number; y: number; width: number; height: number } | null;
    },
    hotspot: { x: number; y: number },
    cropSize: number
  ) => { ok: boolean; why: string };
  cropFor: (
    point: { x: number; y: number },
    frame: { width: number; height: number },
    size?: number
  ) => { x: number; y: number; width: number; height: number };
  startedInsideCrop: (
    probe: { previousPosition: { x: number; y: number } | null },
    rect: { x: number; y: number; width: number; height: number }
  ) => boolean;
  checkRun: (options: { run: string }) => Record<string, unknown>;
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const webRecorder = require("../../../scripts/record-web-walkthrough.js") as {
  parseArgs: (argv: string[]) => { pointer: boolean };
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require("fs") as typeof import("fs");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require("path") as typeof import("path");

const SCRIPTS = path.resolve(__dirname, "..", "..", "..", "scripts");

suite("Set 113 S7 - pointer visibility", () => {
  suite("the synthetic pointer", () => {
    test("it cannot swallow the click it exists to illustrate", () => {
      // The element sits at the exact coordinate the next click targets, so
      // pointer-events:none is load-bearing rather than tidy. Read from the
      // source, because the style is built as a string at runtime.
      const source = fs.readFileSync(path.join(SCRIPTS, "pointer.js"), "utf8");
      assert.ok(
        source.includes('"pointer-events:none"'),
        "the synthetic pointer would intercept the click it is illustrating"
      );
    });

    test("it draws a cursor, not a highlight", () => {
      // The spec's "do not expand" list rules out ripples, highlight
      // animations and theming. A cursor that looks like something else
      // teaches the viewer something false.
      assert.ok(/<path /.test(pointer.POINTER_SVG), "no arrow is drawn");
      assert.ok(
        !/animate|@keyframes|transition/i.test(pointer.POINTER_SVG),
        "the pointer animates, which the spec refused"
      );
    });

    test("it needs nothing from the network", () => {
      // A consumer points this at their own application, and a page under a
      // strict content policy would silently drop an external reference --
      // leaving a recorder that draws no pointer on exactly the targets it
      // was built for.
      //
      // The `xmlns` declaration is excluded deliberately: it is a namespace
      // identifier that no browser ever fetches, and a rule that flagged it
      // would fail on every valid inline SVG, which is a gate that fires on
      // the legitimate look-alike.
      const withoutNamespace = pointer.POINTER_SVG.replace(
        /xmlns="[^"]*"/g,
        ""
      );
      assert.ok(
        !/https?:\/\//i.test(withoutNamespace),
        "the pointer glyph references something off-page"
      );
      assert.ok(
        !/\b(href|src)=/i.test(withoutNamespace),
        "the pointer glyph loads something rather than drawing it"
      );
    });

    test("the entry point is off in a corner, not over the content", () => {
      const at = pointer.entryPoint({ width: 1000, height: 1000 });
      assert.ok(
        at.x > 600 && at.y > 800,
        `the first approach starts at ${at.x},${at.y}, which is over the UI`
      );
    });

    test("the approach is interpolated rather than a jump", () => {
      assert.ok(
        pointer.APPROACH_SAMPLES >= 6,
        "too few samples to read as motion at 25fps"
      );
      assert.ok(
        pointer.APPROACH_TOTAL_MS >= 200,
        "the approach is too short to be seen"
      );
    });
  });

  suite("the physical pointer", () => {
    test("the driver runs as a script FILE, never piped into -Command -", () => {
      // `-Command -` makes PowerShell read its own script from stdin, which
      // is the same pipe the move loop then reads coordinates from. The two
      // readers race, the loop never sees a coordinate, and nothing reports
      // an error. This is a structural assertion because the symptom of
      // getting it wrong is silence.
      const source = fs.readFileSync(path.join(SCRIPTS, "pointer.js"), "utf8");
      const spawnLoop = source.slice(source.indexOf("this.proc = cp.spawn("));
      const firstCall = spawnLoop.slice(0, spawnLoop.indexOf("]"));
      assert.ok(
        firstCall.includes('"-File"'),
        "the pointer driver is not run as a file"
      );
      assert.ok(
        !firstCall.includes('"-Command"'),
        "the pointer driver reads its script from the stdin it needs for moves"
      );
    });

    test("the driver announces readiness, and the caller waits for it", () => {
      // Add-Type compiles C# on first use and takes seconds; moves written
      // before then sit in the pipe. The failure mode is a calibration that
      // PARTLY succeeds, which reads as intermittent.
      const source = fs.readFileSync(path.join(SCRIPTS, "pointer.js"), "utf8");
      assert.ok(source.includes("'ready'"), "the driver never says it is ready");
      assert.ok(
        typeof pointer.PhysicalPointer.prototype.waitUntilReady === "function",
        "nothing waits for the driver to be ready"
      );
    });

    test("it refuses to take over a pointer it could not put back", () => {
      const original = pointer.PhysicalPointer.readPosition;
      pointer.PhysicalPointer.readPosition = () => null;
      try {
        const handle = new pointer.PhysicalPointer(() => undefined);
        assert.throws(
          () => handle.open(),
          /nowhere to put the pointer back|Windows-only/,
          "it took over a mouse with no recorded entry position"
        );
      } finally {
        pointer.PhysicalPointer.readPosition = original;
      }
    });

    test("closing twice is safe, because the failure path also closes", () => {
      const handle = new pointer.PhysicalPointer(() => undefined);
      handle.closed = false;
      handle.entry = null;
      handle.proc = null;
      handle.close();
      assert.doesNotThrow(() => handle.close());
    });

    test("the VS Code recorder never turns it on by itself", () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const vscodeRecorder = require("../../../scripts/record-vscode-walkthrough.js") as {
        parseArgs: (argv: string[]) => { physicalPointer: boolean };
      };
      assert.strictEqual(
        vscodeRecorder.parseArgs([]).physicalPointer,
        false,
        "taking over the operator's mouse is a default"
      );
      assert.strictEqual(
        vscodeRecorder.parseArgs(["--physical-pointer"]).physicalPointer,
        true
      );
    });
  });

  suite("the visibility check", () => {
    test("the crop is anchored back and up from the hotspot", () => {
      // The arrow's tip is AT the hotspot and the glyph hangs down and to
      // the right, so a crop centred on the hotspot would cut the tip off.
      const rect = checker.cropFor({ x: 500, y: 400 }, { width: 1280, height: 800 });
      assert.strictEqual(rect.x, 500 - checker.CROP.backX);
      assert.strictEqual(rect.y, 400 - checker.CROP.backY);
    });

    test("a hotspot at the frame's edge still yields a crop inside the frame", () => {
      const rect = checker.cropFor({ x: 2, y: 798 }, { width: 1280, height: 800 });
      assert.ok(rect.x >= 0 && rect.y >= 0);
      assert.ok(rect.x + rect.width <= 1280);
      assert.ok(rect.y + rect.height <= 800);
    });

    test("the crop grows with the recorder's pixel space", () => {
      // A browser video is one CSS pixel to one video pixel; an OBS window
      // capture is the window's PHYSICAL pixels, so on a 200% display the
      // system cursor is twice the size. A fixed crop is right for one
      // recorder and wrong for the other.
      const small = checker.cropFor({ x: 500, y: 400 }, { width: 2560, height: 1600 }, 56);
      const large = checker.cropFor({ x: 500, y: 400 }, { width: 2560, height: 1600 }, 112);
      assert.strictEqual(small.width, 56);
      assert.strictEqual(large.width, 112);
      assert.ok(
        large.x < small.x,
        "the larger crop did not move back to keep the hotspot in the same place"
      );
    });

    test("a probe whose pointer was already in the crop cannot decide anything", () => {
      const rect = { x: 100, y: 100, width: 56, height: 56 };
      assert.strictEqual(
        checker.startedInsideCrop({ previousPosition: { x: 120, y: 120 } }, rect),
        true,
        "a pointer that was already there would be read as having arrived"
      );
      assert.strictEqual(
        checker.startedInsideCrop({ previousPosition: { x: 900, y: 900 } }, rect),
        false,
        "a pointer that came from far away was wrongly called indecisive"
      );
      assert.strictEqual(
        checker.startedInsideCrop({ previousPosition: null }, rect),
        false,
        "the control run, which moves no pointer, must still be decidable"
      );
    });

    test("frames are seeked exactly, not to the nearest keyframe", () => {
      // `-ss` BEFORE `-i` is the fast seek and lands on a preceding
      // keyframe; after `-i` it decodes and lands on the exact frame. A
      // pointer one keyframe early is a pointer that is not there, and both
      // orderings produce a frame, so nothing else would catch this.
      const source = fs.readFileSync(
        path.join(SCRIPTS, "check-pointer-visible.js"),
        "utf8"
      );
      const args = source.slice(source.indexOf("const args = ["));
      const block = args.slice(0, args.indexOf("];"));
      assert.ok(
        block.indexOf('"-i"') < block.indexOf('"-ss"'),
        "-ss comes before -i, so the check reads the nearest keyframe"
      );
    });

    test("the arrival bar sits above encoder shimmer and below a whole cursor", () => {
      assert.ok(
        checker.ARRIVAL_MIN_CHANGED > checker.CONTROL_MAX_CHANGED,
        "a target could pass on less change than the control is allowed"
      );
      assert.ok(
        checker.ARRIVAL_MIN_CHANGED < 0.09,
        "the bar is set at a whole synthetic arrow, so a smaller cursor fails"
      );
    });

    test("no video is UNMEASURED, which is not the same as a failure", () => {
      // Failure to record must never fail the walkthrough (the spec's rule,
      // inherited by everything in this set), so a run with no video has to
      // be distinguishable from a run whose pointer did not show up.
      const source = fs.readFileSync(
        path.join(SCRIPTS, "check-pointer-visible.js"),
        "utf8"
      );
      assert.ok(source.includes('"UNMEASURED"'));
      assert.ok(
        source.includes("not a pointer failure"),
        "the degraded path is not distinguished from a real failure"
      );
    });
  });

  suite("a change is only a pointer when it is shaped like one", () => {
    // Verification's discovery pass caught the bare "something changed" test
    // passing on something that was not a cursor, and named the case this
    // instrument actually met: a VS Code hover TOOLTIP scored 6.5% on a
    // recording with no cursor in it anywhere.
    const hotspot = { x: 10, y: 10 };
    const cursorish = {
      fraction: 0.06,
      changed: 190,
      box: { x: 10, y: 10, width: 19, height: 28 },
      total: 3136,
    };

    test("a compact mark with its tip at the hotspot is a cursor", () => {
      const verdict = checker.looksLikeACursor(cursorish, hotspot, 56);
      assert.strictEqual(verdict.ok, true, verdict.why);
    });

    test("a tooltip-sized repaint is not", () => {
      const tooltip = {
        fraction: 0.35,
        changed: 1100,
        box: { x: 0, y: 0, width: 56, height: 40 },
        total: 3136,
      };
      assert.strictEqual(checker.looksLikeACursor(tooltip, hotspot, 56).ok, false);
    });

    test("a compact hover repaint on a small control is not", () => {
      // The case the remediation review named: a checkbox or toolbar icon
      // whose hover state repaints a compact region right at the pointer.
      // It clears the size bar and the anchor bar; what it cannot do is be
      // taller than it is wide, because it follows the control's own shape.
      const hoverBox = {
        fraction: 0.06,
        changed: 200,
        box: { x: 10, y: 12, width: 24, height: 20 },
        total: 3136,
      };
      const verdict = checker.looksLikeACursor(hoverBox, hotspot, 56);
      assert.strictEqual(verdict.ok, false);
      assert.ok(/proportion of an arrow/.test(verdict.why), verdict.why);
    });

    test("a cursor-sized mark somewhere else in the crop is not", () => {
      const elsewhere = {
        fraction: 0.06,
        changed: 190,
        box: { x: 34, y: 30, width: 19, height: 28 },
        total: 3136,
      };
      const verdict = checker.looksLikeACursor(elsewhere, hotspot, 56);
      assert.strictEqual(verdict.ok, false);
      assert.ok(/tip is AT the point/.test(verdict.why));
    });

    test("no change at all is not a cursor either", () => {
      assert.strictEqual(
        checker.looksLikeACursor({ fraction: 0, changed: 0, box: null }, hotspot, 56)
          .ok,
        false
      );
    });

    test("the bounds scale with the crop, so a 200% cursor still passes", () => {
      // At double scaling the frame is the window's physical pixels, the crop
      // doubles, and so does the cursor. A rule tuned to 56px would reject
      // every probe on a scaled display.
      const big = {
        fraction: 0.06,
        changed: 760,
        box: { x: 20, y: 20, width: 38, height: 56 },
        total: 12544,
      };
      assert.strictEqual(
        checker.looksLikeACursor(big, { x: 20, y: 20 }, 112).ok,
        true
      );
    });

    test("a shape that is not a cursor is indecisive, never a pass", () => {
      // The distinction matters: "I cannot tell" and "there was no pointer"
      // are different claims, and only one of them should fail a run.
      const source = fs.readFileSync(
        path.join(SCRIPTS, "check-pointer-visible.js"),
        "utf8"
      );
      assert.ok(
        source.includes("not shaped like a "),
        "an unrecognised shape does not report itself as indecisive"
      );
    });
  });

  suite("the pointer stays on top when a modal opens after it", () => {
    test("it is re-promoted on every ensure, not promoted once", () => {
      // Top-layer entries stack in the order they were added, so a pointer
      // promoted once at the start of a run sits UNDER a dialog opened part
      // way through it -- which is every real walkthrough. Structural,
      // because the broken version passes any test that only opens a modal
      // before the pointer exists.
      const source = fs.readFileSync(path.join(SCRIPTS, "pointer.js"), "utf8");
      assert.ok(
        source.includes('if (node.matches(":popover-open")) node.hidePopover();'),
        "an already-open pointer is never moved back to the top of the stack"
      );
    });
  });

  suite("the falsifier is reachable from the command line", () => {
    test("the web recorder draws a pointer unless told not to", () => {
      assert.strictEqual(webRecorder.parseArgs([]).pointer, true);
      assert.strictEqual(webRecorder.parseArgs(["--no-pointer"]).pointer, false);
    });

    test("the control run keeps the pointer run's timing", () => {
      // The control has to differ in the pointer and in NOTHING else, or a
      // check that fails on it has not been shown to be about pixels.
      const source = fs.readFileSync(
        path.join(SCRIPTS, "record-web-walkthrough.js"),
        "utf8"
      );
      assert.ok(
        source.includes("if (!drawPointer) await page.waitForTimeout(pointer.APPROACH_TOTAL_MS)"),
        "the control run does not wait out the approach it is not making"
      );
    });
  });

  suite("the walkthrough directory is not a session-set directory", () => {
    test("readSessionSets does not pick up the walkthrough scenarios", () => {
      // Guards the same confusion the S3 suite guards: these directories sit
      // under docs/ and carry JSON, and a scanner that took them for session
      // sets would report scenarios as work.
      const repoRoot = path.resolve(__dirname, "..", "..", "..", "..", "..");
      const sets = readSessionSets(path.join(repoRoot, "docs", "session-sets"));
      assert.ok(
        !sets.some((set: { name: string }) => set.name === "publication-safety-checklist"),
        "a walkthrough document was read as a session set"
      );
    });
  });
});
