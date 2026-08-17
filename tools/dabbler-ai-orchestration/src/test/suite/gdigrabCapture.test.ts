// Set 113 S8 -- the gdigrab backend's guards, and the geometry they rest on.
//
// WHAT IS TESTED HERE AND WHY IT IS THIS AND NOT THE CAPTURE. The spec
// refuses CI recording outright, ffmpeg is an optional prerequisite no CI
// machine has, and the Win32 z-order walk needs a real desktop. So what a
// test can honestly own is the pure half -- and for this backend the pure
// half is exactly where the risk is.
//
// The whole case for using a desktop-rectangle capture at all is that two
// guards make up for what it structurally lacks: the occlusion guard
// (because gdigrab reads the composited desktop and is NOT immune to an
// overlapping window, measured at 25.39% leakage with the guard off) and the
// window-follow guard (because the rectangle is fixed at stream open). Those
// guards are decisions made by `findOccluders` and a handful of predicates.
// A guard that silently matched nothing would look identical, from the
// artifact, to a clean desktop -- which is the exact false pass L-112-1
// describes and the exact one that already bit this set once, when Session
// 7's first pointer check passed its own control.
//
// So every rule below gets BOTH a case that must fire and a planted
// look-alike that must NOT: a window above vs below in z-order, a cloaked
// window vs a real one, the target's own process vs a stranger's, an overlap
// above the threshold vs a sliver beneath it.

import * as assert from "assert";
// A local TS import keeps this file on the CommonJS load path under ts-node,
// which is what makes the `require` calls below legal. It earns its place
// with a real assertion at the bottom of the file.
import { readSessionSets } from "../../utils/fileSystem";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Win {
  hwnd: number;
  pid: number;
  z: number;
  visible: boolean;
  minimized: boolean;
  cloaked: boolean;
  className: string;
  title: string;
  name?: string;
  bounds: Rect;
  client?: Rect;
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const geometry = require("../../../scripts/window-geometry.js") as {
  overlap: (
    target: Rect,
    other: Rect
  ) => { intersects: boolean; area: number; fractionOfTarget: number };
  DESKTOP_SHELL_CLASSES: Set<string>;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const capture = require("../../../scripts/gdigrab-capture.js") as {
  findOccluders: (windows: Win[], target: Win, rect: Rect) => Array<{
    hwnd: number;
    label: string;
    overlapFractionOfCapture: number;
  }>;
  isPotentialOccluder: (win: Win, targetPid: number) => boolean;
  toEven: (n: number) => number;
  WINDOW_FOLLOW_POLICY: string;
  OCCLUSION_MIN_FRACTION: number;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const longForm = require("../../../scripts/record-long-form.js") as {
  shippedVsCodeMatch: (candidate: { name: string }) => boolean;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const recorder = require("../../../scripts/record-vscode-walkthrough.js") as {
  parseArgs: (argv: string[]) => { backend: string; video: boolean };
  captureApproval: (backend?: string) => {
    approved: boolean;
    reason: string;
    waiverPath: string;
  };
  waiverCoverage: (
    waiver: unknown,
    evaluation: {
      unmet: string[];
      barRunsMet?: boolean;
      cleanRuns?: number;
      runsRequired?: number;
    } | null,
    backend: string,
    which: { waiver: string }
  ) => { sufficient: boolean; why: string | null; covered: string[] };
};

const TARGET_RECT: Rect = { x: 240, y: 90, width: 1440, height: 900 };

function win(overrides: Partial<Win>): Win {
  return {
    hwnd: 1,
    pid: 100,
    z: 50,
    visible: true,
    minimized: false,
    cloaked: false,
    className: "Chrome_WidgetWin_1",
    title: "something",
    bounds: { x: 0, y: 0, width: 10, height: 10 },
    ...overrides,
  };
}

/** The window being recorded: pid 100, sitting at z-order 50. */
const TARGET = win({ hwnd: 999, pid: 100, z: 50, title: "the workbench" });

/** A stranger's window covering the middle of the capture rectangle. */
function occluderAt(z: number, overrides: Partial<Win> = {}): Win {
  return win({
    hwnd: 2,
    pid: 200,
    z,
    title: "a stranger",
    bounds: { x: 500, y: 300, width: 600, height: 400 },
    ...overrides,
  });
}

suite("Set 113 S8 - gdigrab occlusion and window-follow guards", () => {
  suite("overlap", () => {
    test("reports the intersecting fraction of the TARGET, not of the other", () => {
      // A 600x400 window inside a 1440x900 capture covers 240000/1296000.
      const hit = geometry.overlap(TARGET_RECT, {
        x: 500,
        y: 300,
        width: 600,
        height: 400,
      });
      assert.strictEqual(hit.intersects, true);
      assert.strictEqual(hit.area, 240000);
      assert.ok(
        Math.abs(hit.fractionOfTarget - 240000 / (1440 * 900)) < 1e-9,
        "fraction must be of the capture rectangle: " + hit.fractionOfTarget
      );
    });

    test("PLANTED: two rectangles that merely touch do not intersect", () => {
      // Edge-adjacent, sharing a boundary and no area. A `<=` written as `<`
      // is the classic way this returns a 1px phantom overlap, which would
      // refuse to record whenever a window was docked beside the editor.
      const hit = geometry.overlap(TARGET_RECT, {
        x: 240 + 1440,
        y: 90,
        width: 300,
        height: 900,
      });
      assert.strictEqual(hit.intersects, false);
      assert.strictEqual(hit.area, 0);
    });
  });

  suite("isPotentialOccluder", () => {
    test("a visible stranger's window is a potential occluder", () => {
      assert.strictEqual(capture.isPotentialOccluder(occluderAt(10), 100), true);
    });

    // Each of these is a REAL population on a real desktop, not a
    // hypothetical. The machine this was written on listed 333 top-level
    // windows of which 11 were real; a guard that skipped these checks would
    // refuse to record on a perfectly clean desktop, every time.
    test("PLANTED: a CLOAKED window is not (every suspended UWP app is one)", () => {
      assert.strictEqual(
        capture.isPotentialOccluder(occluderAt(10, { cloaked: true }), 100),
        false
      );
    });

    test("PLANTED: an invisible window is not", () => {
      assert.strictEqual(
        capture.isPotentialOccluder(occluderAt(10, { visible: false }), 100),
        false
      );
    });

    test("PLANTED: a minimized window is not", () => {
      assert.strictEqual(
        capture.isPotentialOccluder(occluderAt(10, { minimized: true }), 100),
        false
      );
    });

    test("PLANTED: the desktop shell is not (it is the wallpaper)", () => {
      for (const className of ["Progman", "WorkerW"]) {
        assert.strictEqual(
          capture.isPotentialOccluder(occluderAt(10, { className }), 100),
          false,
          className + " must not be treated as occluding the window on top of it"
        );
      }
    });

    test("PLANTED: the TARGET'S OWN process is not -- its popups are the product", () => {
      assert.strictEqual(
        capture.isPotentialOccluder(occluderAt(10, { pid: 100 }), 100),
        false
      );
      // ... and the same window owned by anyone else still is, so the rule
      // is "same process", not "always allow".
      assert.strictEqual(
        capture.isPotentialOccluder(occluderAt(10, { pid: 101 }), 100),
        true
      );
    });
  });

  suite("findOccluders", () => {
    test("finds a stranger's window ABOVE the target", () => {
      const found = capture.findOccluders(
        [TARGET, occluderAt(10)],
        TARGET,
        TARGET_RECT
      );
      assert.strictEqual(found.length, 1);
      assert.strictEqual(found[0].hwnd, 2);
      assert.ok(found[0].overlapFractionOfCapture > 0.18);
    });

    test("PLANTED: the SAME window BELOW the target is not an occluder", () => {
      // This is the rule that keeps the guard usable. Windows parked behind
      // the editor overlap it constantly and contribute no pixels; a guard
      // that ignored z-order would refuse to record on any busy desktop.
      const found = capture.findOccluders(
        [TARGET, occluderAt(80)],
        TARGET,
        TARGET_RECT
      );
      assert.deepStrictEqual(found, []);
    });

    test("PLANTED: a sliver below the threshold is not reported", () => {
      // A few permanently-topmost helper windows of a handful of pixels are
      // normal on Windows. The threshold sits BELOW the pilot's own C2
      // leakage bar, so nothing the guard forgives could pass C2.
      const sliver = occluderAt(10, {
        bounds: { x: 240, y: 90, width: 6, height: 6 },
      });
      const found = capture.findOccluders([TARGET, sliver], TARGET, TARGET_RECT);
      assert.deepStrictEqual(found, []);
      assert.ok(
        capture.OCCLUSION_MIN_FRACTION < 0.0005,
        "the guard's tolerance must stay below C2's leakage bar of 0.0005"
      );
    });

    test("PLANTED: a window that is above but does not overlap is not reported", () => {
      const elsewhere = occluderAt(10, {
        bounds: { x: 4000, y: 0, width: 500, height: 500 },
      });
      assert.deepStrictEqual(
        capture.findOccluders([TARGET, elsewhere], TARGET, TARGET_RECT),
        []
      );
    });

    test("sorts by how much of the frame is covered, worst first", () => {
      const small = occluderAt(10, {
        hwnd: 3,
        bounds: { x: 300, y: 150, width: 200, height: 200 },
      });
      const big = occluderAt(11, {
        hwnd: 4,
        bounds: { x: 300, y: 150, width: 900, height: 700 },
      });
      const found = capture.findOccluders(
        [TARGET, small, big],
        TARGET,
        TARGET_RECT
      );
      assert.strictEqual(found.length, 2);
      assert.strictEqual(found[0].hwnd, 4, "the worst offender must be first");
    });

    test("an UNTITLED occluder is still named usefully", () => {
      // A borderless form, a tooltip and a splash screen all have no title.
      // Reporting `""` tells the operator a window is in the way and nothing
      // about which -- the difference between a message that ends the
      // problem and one that starts a hunt.
      const untitled = occluderAt(10, { title: "", name: "", className: "MyForm" });
      const found = capture.findOccluders(
        [TARGET, untitled],
        TARGET,
        TARGET_RECT
      );
      assert.strictEqual(found.length, 1);
      assert.notStrictEqual(found[0].label.trim(), "");
      assert.ok(
        found[0].label.includes("MyForm"),
        "an untitled window should be identified by class: " + found[0].label
      );
    });
  });

  suite("toEven", () => {
    test("rounds DOWN, so the rectangle never grows past the window", () => {
      // yuv420p needs even dimensions. Rounding up asks the grabber for a
      // pixel column outside the client area.
      assert.strictEqual(capture.toEven(1441), 1440);
      assert.strictEqual(capture.toEven(1440), 1440);
      assert.strictEqual(capture.toEven(901), 900);
    });
  });

  suite("the window-follow policy is a decision, and is stated", () => {
    test("is abort-on-move", () => {
      assert.strictEqual(capture.WINDOW_FOLLOW_POLICY, "abort-on-move");
    });
  });

  suite("long-form target selection", () => {
    test("matches the SHIPPED VS Code window", () => {
      assert.strictEqual(
        longForm.shippedVsCodeMatch({
          name: "repo - Visual Studio Code [Code.exe]",
        }),
        true
      );
    });

    test("PLANTED: refuses the Extension Development Host", () => {
      // The inverse of every other matcher in this repo, and the inversion
      // is the point: the tutorial records the product the operator
      // installed, not a debug host.
      assert.strictEqual(
        longForm.shippedVsCodeMatch({
          name: "[Extension Development Host] fixture [Code.exe]",
        }),
        false
      );
    });

    test("PLANTED: refuses a window that is not VS Code at all", () => {
      assert.strictEqual(
        longForm.shippedVsCodeMatch({ name: "Inbox [olk.exe]" }),
        false
      );
    });
  });

  suite("recorder backend selection", () => {
    test("defaults to obs, because promoting a backend is a gate decision", () => {
      assert.strictEqual(recorder.parseArgs([]).backend, "obs");
    });

    test("accepts gdigrab", () => {
      assert.strictEqual(
        recorder.parseArgs(["--backend", "gdigrab"]).backend,
        "gdigrab"
      );
    });

    test("PLANTED: refuses an unknown backend rather than falling back", () => {
      // A silent fallback to the default would record with a backend the
      // caller did not ask for, which for this pair is the difference
      // between a video with a cursor and one without.
      assert.throws(
        () => recorder.parseArgs(["--backend", "obs-studio"]),
        /unknown capture backend/i
      );
    });
  });

  suite("the capture gate is per-backend, and fails closed", () => {
    test("OBS is judged by Session 4's pilot, gdigrab by Session 8's measurement", () => {
      // Two mechanisms, two measurements, two verdicts. A gate that read one
      // to approve the other would be approving something nobody measured --
      // and the two do not even fail on the same criteria: OBS is unmet on
      // C2 and C7, gdigrab on C7 alone.
      const obs = recorder.captureApproval("obs");
      const gdigrab = recorder.captureApproval("gdigrab");
      assert.strictEqual(obs.waiverPath, "s4-operator-waiver.json");
      assert.strictEqual(gdigrab.waiverPath, "s8-operator-waiver.json");
      assert.notStrictEqual(obs.reason, gdigrab.reason);
    });

    test("OBS stays refused; gdigrab is approved ONLY by the committed waiver", () => {
      // The state this session leaves behind, asserted so it cannot drift
      // silently in either direction. Session 4's OBS verdict still stands
      // at FAIL (C2, C7) and nothing here changed it. gdigrab's verdict is
      // ALSO still FAIL (C7) -- what approves it is an operator waiver on
      // disk, which is the only route this session was permitted to use.
      const obs = recorder.captureApproval("obs");
      assert.strictEqual(obs.approved, false, obs.reason);
      assert.ok(/FAIL/.test(obs.reason));

      const gdigrab = recorder.captureApproval("gdigrab");
      assert.strictEqual(gdigrab.approved, true, gdigrab.reason);
      assert.ok(
        /operator waiver on file/.test(gdigrab.reason),
        "gdigrab must be approved by a WAIVER, never by a passing verdict " +
          "it does not have: " + gdigrab.reason
      );
    });

    test("PLANTED: the waiver is narrow, and says so in the file", () => {
      // A waiver whose scope is only in prose is a waiver that widens. The
      // machine-readable scope is asserted here so a later edit that quietly
      // dropped C1-C6 or the no-audio clause from `doesNotWaive` would fail
      // a test rather than pass a gate.
      const waiver = require("../../../../../docs/session-sets/113-narrated-video-walkthroughs/s8-operator-waiver.json") as {
        waivedBy: string;
        attestation: string;
        scope: {
          appliesToBackend: string;
          doesNotWaive: string[];
          publicationSafetyPassStillRequired: boolean;
        };
      };
      assert.strictEqual(waiver.scope.appliesToBackend, "ffmpeg-gdigrab-desktop");
      assert.strictEqual(waiver.scope.publicationSafetyPassStillRequired, true);
      for (const owed of ["C1", "C2", "C3", "C4", "C5", "C6", "C7/no-audio-track"]) {
        assert.ok(
          waiver.scope.doesNotWaive.includes(owed),
          owed + " must remain un-waived"
        );
      }
      assert.ok(waiver.waivedBy.length > 0);
    });

    test("PLANTED: an unknown backend is judged by the OBS gate, not waved through", () => {
      // Defaulting to the STRICTER, older gate is the safe direction for a
      // caller that passes nothing.
      const unknown = recorder.captureApproval(undefined);
      assert.strictEqual(unknown.approved, false);
      assert.strictEqual(unknown.waiverPath, "s4-operator-waiver.json");
    });
  });

  suite("a waiver is not a skeleton key", () => {
    // The failure this closes: approving on the mere PRESENCE of a signature
    // makes the waiver permanent gate state that covers whatever fails next.
    // A later re-measurement that broke C2 (leakage into a public video) or
    // C6 (leaked processes) would still record, approved by a signature
    // given for something else entirely.
    const WAIVER = {
      waivedBy: "someone",
      attestation: "...",
      criteriaSha256: null,
      scope: { appliesToBackend: "ffmpeg-gdigrab-desktop" },
      waivedCriteria: [{ id: "C7", clause: "never-captures-the-screen" }],
    };
    const WHICH = { waiver: "s8-operator-waiver.json" };

    test("covers the criterion it names", () => {
      const covers = recorder.waiverCoverage(
        WAIVER,
        { unmet: ["C7"] },
        "gdigrab",
        WHICH
      );
      assert.strictEqual(covers.sufficient, true, covers.why || "");
    });

    test("PLANTED: does NOT cover a criterion it never mentions", () => {
      const covers = recorder.waiverCoverage(
        WAIVER,
        { unmet: ["C7", "C2"] },
        "gdigrab",
        WHICH
      );
      assert.strictEqual(covers.sufficient, false);
      assert.ok(/C2/.test(covers.why || ""), covers.why || "");
    });

    test("PLANTED: does NOT apply to a backend it was not signed for", () => {
      const covers = recorder.waiverCoverage(
        WAIVER,
        { unmet: ["C7"] },
        "obs",
        WHICH
      );
      assert.strictEqual(covers.sufficient, false);
      assert.ok(/applies to/.test(covers.why || ""), covers.why || "");
    });

    test("PLANTED: is refused when the criteria file it was signed against changed", () => {
      const drifted = { ...WAIVER, criteriaSha256: "sha256:deadbeef" };
      const covers = recorder.waiverCoverage(
        drifted,
        { unmet: ["C7"] },
        "gdigrab",
        WHICH
      );
      assert.strictEqual(covers.sufficient, false);
      assert.ok(/signed against criteria/.test(covers.why || ""), covers.why || "");
    });

    test("PLANTED: is refused when there is no measurement to check against", () => {
      const covers = recorder.waiverCoverage(WAIVER, null, "gdigrab", WHICH);
      assert.strictEqual(covers.sufficient, false);
      assert.ok(/no measurement/.test(covers.why || ""), covers.why || "");
    });

    test("PLANTED: is refused when the RUN-COUNT BAR failed, even though every unmet criterion is named", () => {
      // A waiver excepts CRITERIA, not the number of consecutive clean runs.
      // This is the case where criterion-coverage alone waves through a
      // measurement that failed outright: C7 really is the only unmet
      // criterion and really is waived, but the backend only managed four
      // clean runs of the ten the pilot requires.
      const covers = recorder.waiverCoverage(
        WAIVER,
        { unmet: ["C7"], barRunsMet: false, cleanRuns: 4, runsRequired: 10 },
        "gdigrab",
        WHICH
      );
      assert.strictEqual(covers.sufficient, false);
      assert.ok(/run-count bar/.test(covers.why || ""), covers.why || "");
    });

    test("the same waiver IS sufficient once the bar is met", () => {
      // The other side of the falsifier: the bar check must not refuse
      // everything, or it would be indistinguishable from a broken gate.
      const covers = recorder.waiverCoverage(
        WAIVER,
        { unmet: ["C7"], barRunsMet: true, cleanRuns: 10, runsRequired: 10 },
        "gdigrab",
        WHICH
      );
      assert.strictEqual(covers.sufficient, true, covers.why || "");
    });

    test("PLANTED: is refused when it names no backend at all", () => {
      const vague = { waivedBy: "x", attestation: "y", waivedCriteria: [] };
      const covers = recorder.waiverCoverage(
        vague,
        { unmet: ["C7"] },
        "gdigrab",
        WHICH
      );
      assert.strictEqual(covers.sufficient, false);
      assert.ok(/which backend/.test(covers.why || ""), covers.why || "");
    });
  });

  suite("the local TS import is exercised", () => {
    test("readSessionSets tolerates a missing root", () => {
      assert.deepStrictEqual(
        readSessionSets("/definitely/not/a/real/session/set/root"),
        []
      );
    });
  });
});
