#!/usr/bin/env node
// Scores Set 113 Session 5's container measurement against its own criteria.
//
//   node scripts/container-isolation-verdict.js
//
// SEPARATE FROM THE HARNESS ON PURPOSE, the way Session 4 separated
// os-capture-verdict.js from measure-os-capture.js. A harness that both
// takes the measurement and decides whether it passed can drift its
// thresholds toward its results without anyone noticing. This reads the
// criteria file and the measurement file, and knows how to produce neither.
//
// It refuses to score a measurement whose stamped criteria digest does not
// match the criteria file on disk: that combination means the criteria
// moved after the run, and the only honest response is to re-run.
//
// Output is ASCII-only (Windows cp1252 console lesson, L-079-1).

"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const SET_DIR = path.join(
  REPO_ROOT,
  "docs",
  "session-sets",
  "113-narrated-video-walkthroughs"
);
const CRITERIA_PATH = path.join(SET_DIR, "s5-isolation-criteria.json");
const MEASUREMENT_PATH = path.join(SET_DIR, "s5-container-isolation-measurement.json");
const OUT_PATH = path.join(SET_DIR, "s5-isolation-verdict.json");

function sha256(file) {
  return (
    "sha256:" + crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")
  );
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function main() {
  const criteria = JSON.parse(fs.readFileSync(CRITERIA_PATH, "utf8"));
  const m = JSON.parse(fs.readFileSync(MEASUREMENT_PATH, "utf8"));

  const digestNow = sha256(CRITERIA_PATH);
  if (m.criteriaSha256 !== digestNow) {
    console.error(
      "[verdict] REFUSING to score: the measurement was taken against criteria " +
        m.criteriaSha256 +
        " but the criteria file is now " +
        digestNow +
        ". Criteria that moved after the run are not criteria; re-run the harness."
    );
    process.exit(3);
  }

  const targets = m.runs.filter((r) => r.mode === "target");
  const control = m.runs.find((r) => r.mode === "magenta-control");
  const c = criteria.criteria;
  const results = {};

  // --- I1 ---------------------------------------------------------------
  const leakBar = c.I1.maxMagentaFractionInFrames;
  const controlBar = c.I1.control.minMagentaFractionInPositiveControl;
  const worstLeak = Math.max(...targets.map((r) => r.analysis.maxMagentaFraction ?? 1));
  const controlValue = control ? control.analysis.maxMagentaFraction : null;
  const structuralClean = targets.every(
    (r) =>
      r.structural.forbiddenFlagsPresent.length === 0 &&
      r.structural.forbiddenMountsPresent.length === 0
  );
  results.I1 = {
    name: c.I1.name,
    pass: worstLeak <= leakBar && controlValue >= controlBar && structuralClean,
    measured: {
      worstHostPixelFraction: worstLeak,
      positiveControl: controlValue,
      structuralAssertionsClean: structuralClean,
      bindMountsUsed: targets.reduce((n, r) => n + r.structural.bindMountCount, 0),
    },
    bar: {
      maxMagentaFractionInFrames: leakBar,
      minMagentaFractionInPositiveControl: controlBar,
    },
  };

  // --- I2 ---------------------------------------------------------------
  const minCorr = Math.min(...targets.map((r) => r.analysis.minCorrelationToInside ?? 0));
  const worstDecoy = Math.max(...targets.map((r) => r.analysis.decoyCorrelation ?? 1));
  const minSd = Math.min(...targets.map((r) => r.analysis.minFrameStdDev ?? 0));
  results.I2 = {
    name: c.I2.name,
    pass:
      minCorr >= c.I2.minCorrelation &&
      worstDecoy <= c.I2.control.decoyMaxCorrelation &&
      minSd >= c.I2.blackFrameGuard.minFrameStdDev,
    measured: {
      minCorrelationToInside: minCorr,
      worstDecoyCorrelation: worstDecoy,
      minFrameStdDev: minSd,
    },
    bar: {
      minCorrelation: c.I2.minCorrelation,
      decoyMaxCorrelation: c.I2.control.decoyMaxCorrelation,
      minFrameStdDev: c.I2.blackFrameGuard.minFrameStdDev,
    },
  };

  // --- I3 ---------------------------------------------------------------
  const deltas = targets.map((r) => {
    const [fw, fh] = String(r.analysis.frameDimensions || "0x0").split("x").map(num);
    const [dw, dh] = String(r.facts.display_geometry || "0x0").split("x").map(num);
    return Math.max(Math.abs(fw - dw), Math.abs(fh - dh));
  });
  const worstDelta = Math.max(...deltas);
  results.I3 = {
    name: c.I3.name,
    pass: worstDelta <= c.I3.maxDimensionDeltaPx,
    measured: { worstDimensionDeltaPx: worstDelta, geometries: targets.map((r) => r.facts.display_geometry) },
    bar: { maxDimensionDeltaPx: c.I3.maxDimensionDeltaPx },
  };

  // --- I4 ---------------------------------------------------------------
  const i4 = {
    noDevVideoNodes: targets.every((r) => num(r.facts.dev_video_nodes) === 0),
    noDevSndNodes: targets.every((r) => num(r.facts.dev_snd_nodes) === 0),
    noHostX11SocketPresent: targets.every((r) => r.facts.host_x11_socket_present === "no"),
    recordingMustHaveNoAudioTrack: targets.every(
      (r) => r.tracks && Array.isArray(r.tracks.handlers) && !r.tracks.handlers.includes("soun")
    ),
  };
  // Every declared requirement must be OBSERVED, not merely not-contradicted:
  // a fact the harness failed to emit must fail the criterion rather than
  // pass it by absence. That is the omitted-component failure mode wearing a
  // different hat.
  const i4Observed = targets.every(
    (r) =>
      "dev_video_nodes" in r.facts &&
      "dev_snd_nodes" in r.facts &&
      "host_x11_socket_present" in r.facts
  );
  results.I4 = {
    name: c.I4.name,
    pass: Object.values(i4).every(Boolean) && i4Observed,
    measured: { ...i4, allFactsObserved: i4Observed },
  };

  // --- I5 ---------------------------------------------------------------
  const declared = c.I5.variants.length;
  const ran = (m.inducedVariants || []).length;
  const allFailedClearly = (m.inducedVariants || []).every((v) => v.failed && v.message);
  results.I5 = {
    name: c.I5.name,
    pass: ran >= declared && allFailedClearly,
    measured: {
      variantsDeclared: declared,
      variantsRun: ran,
      allFailedWithAMessage: allFailedClearly,
      substitutionsDeclared: (m.inducedVariants || [])
        .filter((v) => v.substitutionDeclared)
        .map((v) => v.variant),
    },
  };

  // --- I6 ---------------------------------------------------------------
  results.I6 = {
    name: c.I6.name,
    pass:
      m.runs.every((r) => r.cleanup.removeStatus === 0 && !r.cleanup.containerStillListed) &&
      m.runs.every((r) => r.cleanup.volumeCount === 0) &&
      m.machineLeftInEntryState === true,
    measured: {
      containersStillListed: m.runs.filter((r) => r.cleanup.containerStillListed).length,
      maxVolumeCount: Math.max(...m.runs.map((r) => r.cleanup.volumeCount)),
      machineLeftInEntryState: m.machineLeftInEntryState,
    },
  };

  // --- I7 (recorded, not scored) ----------------------------------------
  results.I7 = {
    name: c.I7.name,
    pass: null,
    scored: false,
    measured: m.cost,
    note: "Recorded rather than scored, exactly as the criteria say. The cost decision is the operator's.",
  };

  const barRuns = criteria.bar.runs;
  const cleanRuns = targets.filter(
    (r) =>
      (r.analysis.maxMagentaFraction ?? 1) <= leakBar &&
      (r.analysis.minCorrelationToInside ?? 0) >= c.I2.minCorrelation &&
      (r.analysis.minFrameStdDev ?? 0) >= c.I2.blackFrameGuard.minFrameStdDev &&
      r.exitStatus === 0
  ).length;

  const scored = ["I1", "I2", "I3", "I4", "I5", "I6"];
  const unmet = scored.filter((k) => !results[k].pass);
  const verdict = unmet.length === 0 && cleanRuns >= barRuns ? "PASS" : "FAIL";

  const out = {
    verdict,
    scoredAt: new Date().toISOString(),
    criteriaSha256: digestNow,
    measurementCriteriaSha256: m.criteriaSha256,
    barRunsRequired: barRuns,
    cleanRunsObserved: cleanRuns,
    criteriaUnmet: unmet,
    results,
    honestFail: criteria.honestFail,
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + "\n", "utf8");

  process.stdout.write("[verdict] " + verdict + "\n");
  for (const k of scored) {
    process.stdout.write(
      "  " + k + " " + (results[k].pass ? "PASS" : "FAIL") + "  " + results[k].name + "\n"
    );
  }
  process.stdout.write(
    "  clean runs " + cleanRuns + "/" + barRuns + "\n[verdict] wrote " +
      path.relative(REPO_ROOT, OUT_PATH) + "\n"
  );
  process.exitCode = verdict === "PASS" ? 0 : 1;
}

main();
