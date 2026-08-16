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
  // forbiddenEnvPresent was declared in the criteria and never checked
  // (verification round 1 nit). The hardening flags are checked too: they
  // are the policy this harness borrowed from ai_router/podman_sandbox.py,
  // and an unasserted safety property is a hope.
  const structuralClean = targets.every(
    (r) =>
      r.structural.forbiddenFlagsPresent.length === 0 &&
      r.structural.forbiddenMountsPresent.length === 0 &&
      (r.structural.forbiddenEnvPresent || []).length === 0 &&
      r.structural.networkNone === true &&
      r.structural.noNewPrivileges === true
  );
  // capDropAll is REPORTED, not required. It was measured to break
  // Chromium's sandbox (2 VS Code processes and no mapped window, against 15
  // without it), and the alternative -- keeping the flag and passing
  // --no-sandbox -- was refused. Scoring a flag the harness deliberately does
  // not pass would either fail every run or quietly stop meaning anything.
  const capDropAll = targets.every((r) => r.structural.capDropAll === true);
  results.I1 = {
    name: c.I1.name,
    pass: worstLeak <= leakBar && controlValue >= controlBar && structuralClean,
    measured: {
      worstHostPixelFraction: worstLeak,
      positiveControl: controlValue,
      structuralAssertionsClean: structuralClean,
      capDropAllUsed: capDropAll,
      capDropOmittedReason: targets.length ? targets[0].structural.capDropOmittedReason : null,
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
  // The target must have actually STARTED. Without this, a non-black error
  // dialog satisfies I2 just as well as a running Work Explorer -- the
  // false pass verification round 1 flagged as a nit and which would have
  // become a Major the first time VS Code failed to launch.
  const targetStarted = targets.every(
    (r) =>
      Number(r.facts.target_process_count) > 0 &&
      Number(r.facts.mapped_window_count) > 0
  );
  const extensionInstalled = targets.every((r) =>
    String(r.facts.extensions_installed || "").includes("dabbler-ai-orchestration")
  );
  results.I2 = {
    name: c.I2.name,
    pass:
      minCorr >= c.I2.minCorrelation &&
      worstDecoy <= c.I2.control.decoyMaxCorrelation &&
      minSd >= c.I2.blackFrameGuard.minFrameStdDev &&
      targetStarted,
    measured: {
      minCorrelationToInside: minCorr,
      worstDecoyCorrelation: worstDecoy,
      minFrameStdDev: minSd,
      targetProcessesAndWindowsPresent: targetStarted,
      dabblerExtensionInstalled: extensionInstalled,
      mappedWindowNames: targets.map((r) => r.facts.mapped_window_names),
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
  // REWRITTEN after verification round 1 (Major, both lenses). The old
  // version scored "at least three records exist and each has a nonempty
  // message", which certified the set's cardinal degradation guarantee --
  // FAILURE TO RECORD MUST NEVER FAIL THE WALKTHROUGH -- without testing it.
  // Now: the exact declared variant identities must be present (allowing the
  // one declared substitution), and each must satisfy the criterion's OWN
  // postconditions.
  const declaredNames = c.I5.variants.slice();
  const ranRecords = m.inducedVariants || [];
  const ranNames = ranRecords.map((v) => v.variant);
  const substituted = ranRecords.filter((v) => v.substitutionDeclared).map((v) => v.variant);
  // A declared variant is satisfied by its own name, or by a record that
  // explicitly declares itself a substitution for it.
  // EXACT set equality with the declared names. The earlier version accepted
  // any record that declared itself a substitution, which is how
  // `podman-machine-stopped` came to be scored by a variant that never
  // stopped a machine.
  const identitiesOk =
    declaredNames.length === ranRecords.length &&
    new Set(ranNames).size === ranNames.length &&
    declaredNames.every((d) => ranNames.includes(d));
  const postconditionsOk = ranRecords.every(
    (v) =>
      v.walkthroughCompleted === true &&
      v.manifestStillWritten === true &&
      v.videoArtifactCount === 0 &&
      v.errorMentionsContainerDependency === true
  );
  results.I5 = {
    name: c.I5.name,
    pass: identitiesOk && postconditionsOk && ranRecords.length >= declaredNames.length,
    measured: {
      variantsDeclared: declaredNames,
      variantsRun: ranNames,
      identitiesOk,
      postconditionsOk,
      substitutionsDeclared: substituted,
      perVariant: ranRecords.map((v) => ({
        variant: v.variant,
        walkthroughCompleted: v.walkthroughCompleted,
        manifestStillWritten: v.manifestStillWritten,
        videoArtifactCount: v.videoArtifactCount,
        errorMentionsContainerDependency: v.errorMentionsContainerDependency,
      })),
    },
  };

  // --- I6 ---------------------------------------------------------------
  // REWRITTEN after verification round 1 (Major). The criterion says "after
  // every run AND after one deliberately induced mid-run failure", and
  // requires noZeroByteOrTempFilesInRunDir. The old version induced no
  // failure and looked at no files, so it certified deterministic cleanup on
  // the happy path only -- which is the one path where cleanup was never in
  // doubt.
  const failureRun = m.runs.find((r) => r.inducedMidRunFailure);
  const cleanupAlwaysRan = m.runs.every(
    (r) => r.cleanup && r.cleanup.removeStatus === 0 && !r.cleanup.containerStillListed
  );
  const noZeroByte = m.runs.every(
    (r) =>
      (r.cleanup.zeroByteFilesInContainer === null ||
        r.cleanup.zeroByteFilesInContainer === 0) &&
      r.cleanup.zeroByteFilesOnHost === 0
  );
  const noTempFiles = m.runs.every(
    (r) => r.cleanup.tempFilesInContainer === null || r.cleanup.tempFilesInContainer === 0
  );
  const noHarnessVolumes = m.runs.every((r) => r.cleanup.harnessVolumeCount === 0);
  results.I6 = {
    name: c.I6.name,
    pass:
      cleanupAlwaysRan &&
      noZeroByte &&
      noTempFiles &&
      noHarnessVolumes &&
      Boolean(failureRun) &&
      Boolean(failureRun && failureRun.cleanup.cleanupRanAfterFailure) &&
      !(failureRun && failureRun.cleanup.containerStillListed) &&
      m.machineLeftInEntryState === true &&
      // The machine-stopped variant is the one thing in this harness that can
      // leave the operator's environment broken, so its restoration is scored
      // rather than trusted.
      (!m.machineStopVariant || m.machineStopVariant.restored === true) &&
      (m.harnessContainersLeftBehind || []).length === 0,
    measured: {
      midRunFailureInduced: Boolean(failureRun),
      cleanupRanAfterInducedFailure: Boolean(
        failureRun && failureRun.cleanup.cleanupRanAfterFailure
      ),
      containersStillListed: m.runs.filter((r) => r.cleanup.containerStillListed).length,
      harnessContainersLeftBehind: m.harnessContainersLeftBehind || [],
      maxHarnessVolumeCount: Math.max(...m.runs.map((r) => r.cleanup.harnessVolumeCount || 0)),
      zeroByteFilesClean: noZeroByte,
      tempFilesClean: noTempFiles,
      machineLeftInEntryState: m.machineLeftInEntryState,
      machineStopVariantRestored: m.machineStopVariant ? m.machineStopVariant.restored : null,
    },
  };

  // --- I7 (recorded, not scored) ----------------------------------------
  // The criteria say `passFail: false` AND `requires: {imageBytes,
  // imageBuildSeconds, coldStartSeconds, captureWallClockSeconds}`. The old
  // version read the first half and copied `m.cost` unchecked, so a missing
  // coldStartSeconds passed silently (verification round 1, Major). The
  // honest reading of both halves: PRESENCE is required, VALUES are not
  // judged. That is implementing the criterion, not amending it.
  const requiredCostFields = Object.keys(c.I7.requires || {});
  const missingCostFields = requiredCostFields.filter(
    (k) => !m.cost || m.cost[k] === undefined || m.cost[k] === null
  );
  results.I7 = {
    name: c.I7.name,
    pass: missingCostFields.length === 0,
    scoredOn: "presence of the required fields only; the values are not judged",
    measured: m.cost,
    missingRequiredFields: missingCostFields,
    note:
      "Values are the operator's decision, as the criteria say. Presence is " +
      "this verdict's business, because a required field that is absent is " +
      "an unmet predeclared requirement however unjudged its value would be.",
  };

  const barRuns = criteria.bar.runs;
  const cleanRuns = targets.filter(
    (r) =>
      (r.analysis.maxMagentaFraction ?? 1) <= leakBar &&
      (r.analysis.minCorrelationToInside ?? 0) >= c.I2.minCorrelation &&
      (r.analysis.minFrameStdDev ?? 0) >= c.I2.blackFrameGuard.minFrameStdDev &&
      r.exitStatus === 0
  ).length;

  // I7 is scored ON PRESENCE (see above), so it belongs in the list. The
  // criteria's honestFail clause names I1-I6 as the fail condition, so I7 is
  // reported separately rather than folded into the verdict, and a missing
  // cost field is surfaced as its own line instead of vanishing.
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
    costFieldsMissing: results.I7.missingRequiredFields,
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
    "  I7 " + (results.I7.pass ? "PASS" : "FAIL") + "  " + results.I7.name +
      " (presence only)\n" +
      "  clean runs " + cleanRuns + "/" + barRuns + "\n[verdict] wrote " +
      path.relative(REPO_ROOT, OUT_PATH) + "\n"
  );
  process.exitCode = verdict === "PASS" ? 0 : 1;
}

main();
