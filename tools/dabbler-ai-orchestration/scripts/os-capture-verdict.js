#!/usr/bin/env node
// The OS-capture pilot's verdict (Set 113 Session 4).
//
// PURE, AND SEPARATE FROM THE HARNESS THAT COLLECTS THE NUMBERS, on
// purpose. The alternative is a human reading ten rows of JSON and
// announcing that they look fine, which reports the reader's confidence
// rather than the measurement -- and this is the session whose whole
// subject is not doing that.
//
// Every threshold comes from the criteria FILE that was committed before
// the first capture. No number is written here, so this file cannot move
// the bar it is judging against.
//
// Output is ASCII-only (Windows cp1252 console lesson, L-079-1).

"use strict";

/**
 * Per-criterion verdicts plus the overall bar.
 *
 * @param measurement the object `measure-os-capture.js` assembled
 * @param criteria    the parsed `s4-pilot-criteria.json`
 */
function evaluate(measurement, criteria) {
  const c = criteria.criteria;
  const bar = criteria.bar;
  // EVERY recording that can count toward the bar is evaluated against the
  // per-run criteria. The first cut evaluated C1-C4 over `runs` alone while
  // counting `supplementaryRuns` toward cleanRuns -- so the supplementary
  // recording, which is the one that SUPPLIES the tenth capture on the
  // designed path, was never checked against a single criterion. A
  // wrong-window supplementary capture with leaked pixels and broken
  // caption timing would still have counted as clean. Found by the
  // supplementary verification pass, in the instrument built to prevent
  // exactly this kind of false positive.
  const runs = (measurement.runs || []).concat(
    measurement.supplementaryRuns || []
  );
  const primaryRuns = measurement.runs || [];
  const variants = measurement.dependencyAbsent || [];
  const resize = measurement.resizeVariant || null;
  const controlRun = runs.find(
    (r) => r.observations && r.observations.decoyCorrelation !== null
  );
  const findings = [];
  const record = (id, name, passed, detail) =>
    findings.push({ id, name, passed, detail });

  const min = (values) =>
    values.reduce((m, v) => (v === null || v === undefined ? m : Math.min(m, v)), Infinity);
  const max = (values) =>
    values.reduce((m, v) => (v === null || v === undefined ? m : Math.max(m, v)), -Infinity);

  // ---- C1: the intended window, every time, with a decoy that must fail.
  const correlations = runs.map((r) => r.observations.correlationWithTarget);
  const decoy = controlRun ? controlRun.observations.decoyCorrelation : null;
  record(
    "C1",
    c.C1.name,
    correlations.length > 0 &&
      correlations.every((v) => v !== null && v >= c.C1.minCorrelation) &&
      decoy !== null &&
      decoy <= c.C1.control.decoyMaxCorrelation,
    {
      minCorrelationAcrossRuns: min(correlations),
      threshold: c.C1.minCorrelation,
      decoyCorrelation: decoy,
      decoyMustBeAtMost: c.C1.control.decoyMaxCorrelation,
    }
  );

  // ---- C2: nothing of the occluder in frame, and a detector proved live.
  const magentas = runs.map((r) => r.observations.magentaFractionUnderOcclusion);
  const detector = controlRun
    ? controlRun.observations.magentaFractionInDecoyCapture
    : null;
  record(
    "C2",
    c.C2.name,
    magentas.length > 0 &&
      magentas.every((v) => v !== null && v <= c.C2.maxMagentaFractionInTarget) &&
      detector !== null &&
      detector >= c.C2.control.minMagentaFractionInOccluderCapture,
    {
      worstMagentaFractionInTarget: max(magentas),
      threshold: c.C2.maxMagentaFractionInTarget,
      detectorControl: detector,
      detectorMustBeAtLeast: c.C2.control.minMagentaFractionInOccluderCapture,
      correlationHeldUnderOcclusion: runs.map(
        (r) => r.observations.correlationUnderOcclusion
      ),
    }
  );

  // ---- C3: physical pixels, across the ten and across a resize.
  const deltas = runs.map((r) => r.observations.dimensionDeltaPx);
  const resizeOk =
    resize !== null &&
    resize.observations.dimensionDeltaPx !== null &&
    resize.observations.dimensionDeltaPx <= c.C3.maxDimensionDeltaPx &&
    resize.observations.frameSize !== null &&
    primaryRuns.length > 0 &&
    primaryRuns[0].observations.frameSize !== null &&
    (resize.observations.frameSize.width !==
      primaryRuns[0].observations.frameSize.width ||
      resize.observations.frameSize.height !==
        primaryRuns[0].observations.frameSize.height);
  record(
    "C3",
    c.C3.name,
    deltas.length > 0 &&
      deltas.every((v) => v !== null && v <= c.C3.maxDimensionDeltaPx) &&
      resizeOk,
    {
      worstDimensionDeltaPx: max(deltas),
      threshold: c.C3.maxDimensionDeltaPx,
      baselineFrame: primaryRuns.length
        ? primaryRuns[0].observations.frameSize
        : null,
      resizedFrame: resize ? resize.observations.frameSize : null,
      resizedDeltaPx: resize ? resize.observations.dimensionDeltaPx : null,
      // The resize variant only means anything if the frame ACTUALLY
      // changed size. A capture pinned to a fixed canvas would report a
      // delta of 0 against a window it was ignoring.
      frameFollowedTheResize: resizeOk,
      displayScaleExercised: primaryRuns.length
        ? primaryRuns[0].observations.scaleFactor
        : null,
      scalingCaveat:
        "One display scale was exercised. A pass here is a claim about " +
        "that scale and no other.",
    }
  );

  // ---- C4: caption timing.
  const uncertainties = runs.map((r) => (r.anchor ? r.anchor.uncertaintyMillis : null));
  const cuesMatchSteps = runs.every(
    (r) => r.timing && r.timing.cues !== null && r.timing.cues === r.timing.steps
  );
  const cuesInside = runs.every((r) => r.timing && r.timing.allCuesInsideRecording === true);
  record(
    "C4",
    c.C4.name,
    uncertainties.length > 0 &&
      uncertainties.every((v) => v !== null && v <= c.C4.maxAnchorUncertaintyMillis) &&
      (!c.C4.cuesMustEqualStepCount || cuesMatchSteps) &&
      (!c.C4.allCuesWithinRecording || cuesInside),
    {
      worstAnchorUncertaintyMillis: max(uncertainties),
      threshold: c.C4.maxAnchorUncertaintyMillis,
      cuesEqualStepCount: cuesMatchSteps,
      allCuesWithinRecording: cuesInside,
      recordingDurationsMs: runs.map((r) => r.timing && r.timing.recordingDurationMs),
    }
  );

  // ---- C5: every way the dependency can be missing.
  const c5Detail = c.C5.variants.map((name) => {
    const v = variants.find((x) => x.variant === name) || null;
    return {
      variant: name,
      ran: v !== null,
      kind: v ? v.kind : null,
      mentionsObs: v ? v.mentionsObs : null,
      walkthroughStillCompleted: v ? v.walkthroughStillCompleted : null,
      manifestWritten: v ? v.manifestWritten : null,
      osVideoArtifacts: v ? v.osVideoArtifacts : null,
    };
  });
  record(
    "C5",
    c.C5.name,
    c5Detail.every(
      (v) =>
        v.ran &&
        v.kind !== null &&
        v.mentionsObs === true &&
        v.walkthroughStillCompleted === true &&
        v.manifestWritten === true &&
        v.osVideoArtifacts === 0
    ),
    c5Detail
  );

  // ---- C6: cleanup, including the part-way failures.
  const cleanupSets = runs
    .concat(resize ? [resize] : [])
    .map((r) => r.cleanupProblems || [])
    .concat(variants.map((v) => v.cleanupProblems || []));
  // THE PART-WAY FAILURE C6 ACTUALLY ASKS FOR.
  //
  // The first cut passed C6 on the dependency-absent variants and asserted
  // in its own note that those "ARE the part-way failures". They are not:
  // all three die during setup, and two of them before a scene collection
  // or profile exists at all, so they exercise a cleanup with nothing to
  // undo. Verification caught the claim. C6 now requires a failure induced
  // AFTER OBS is running, the collection and profile exist, an input exists
  // and a recording is in flight -- and requires that nothing survives it.
  const induced = measurement.inducedFailures || [];
  const inducedPoints = ["configure", "start", "stop"];
  const inducedDetail = inducedPoints.map((point) => {
    const f = induced.find((x) => x.inducedAt === point) || null;
    const cleanedUp =
      f !== null &&
      (f.cleanupProblems || []).length === 0 &&
      (f.sceneCollectionsLeftBehind || []).length === 0 &&
      (f.profilesLeftBehind || []).length === 0 &&
      (f.sentinelsLeftBehind || []).length === 0 &&
      f.obsProcessRemaining === 0 &&
      f.websocketConfigRestored === true;
    // The other half, and the one verification said was missing: a capture
    // failure must degrade to no video, not destroy the walkthrough.
    const degraded =
      f !== null &&
      f.walkthroughStillCompleted === true &&
      f.manifestWritten === true &&
      f.osVideoArtifacts === 0 &&
      f.stepsCompleted === f.stepCount;
    return { point, ran: f !== null, cleanedUp, degraded, detail: f };
  });
  const inducedOk = inducedDetail.every((d) => d.ran && d.cleanedUp && d.degraded);
  record(
    "C6",
    c.C6.name,
    cleanupSets.length > 0 &&
      cleanupSets.every((p) => p.length === 0) &&
      inducedOk,
    {
      attemptsChecked: cleanupSets.length,
      attemptsWithProblems: cleanupSets.filter((p) => p.length > 0).length,
      problems: cleanupSets.filter((p) => p.length > 0),
      setupFailuresIncluded: variants.length,
      inducedFailures: inducedDetail,
      inducedFailuresPassed: inducedOk,
      note:
        "The dependency-absent variants die during SETUP and are not the " +
        "part-way failure C6 asks for. The induced failures are: each " +
        "throws a PLAIN Error at one of the three points a capture can " +
        "fail, and each must both clean up completely AND leave the " +
        "walkthrough intact with no video.",
    }
  );

  // ---- C7: no screen, no camera, no audio.
  const forbidden = new Set(c.C7.forbiddenInputKinds);
  const kindsSeen = new Set();
  for (const r of runs) for (const k of r.observations.inputKinds || []) kindsSeen.add(k);
  const audioTracks = runs
    .map((r) =>
      r.container ? r.container.handlers.filter((h) => h === "soun").length : null
    )
    .filter((v) => v !== null);
  const noForbidden = [...kindsSeen].every((k) => !forbidden.has(k));
  const exactlyOne = runs.every((r) => r.observations.sceneItemCount === 1);
  const noAudioTrack = audioTracks.length > 0 && audioTracks.every((n) => n === 0);
  record(
    "C7",
    c.C7.name,
    noForbidden && exactlyOne && noAudioTrack,
    {
      inputKindsCreated: [...kindsSeen],
      forbiddenKinds: c.C7.forbiddenInputKinds,
      noForbiddenKindEverCreated: noForbidden,
      everySceneHeldExactlyOneSource: exactlyOne,
      audioTracksPerRecording: audioTracks,
      noAudioTrack,
      audioNote: noAudioTrack
        ? null
        : "OBS muxes an audio track regardless of configuration. No audio " +
          "SOURCE exists -- a freshly created scene collection has zero " +
          "inputs and every special input is null -- so the track can only " +
          "carry silence. The criterion as written is nevertheless NOT met, " +
          "and is reported unmet rather than reworded after the fact.",
    }
  );

  // A run counts toward the bar only if it drove every authored step, and
  // produced a video, and that video is a recording of the walkthrough and
  // nothing else.
  //
  // THAT LAST CLAUSE IS NOT PEDANTRY. The run that carries the controls
  // repoints the live capture at the decoy window part way through, AFTER
  // its own C1/C2/C3 numbers are taken -- so its measurements are sound and
  // its VIDEO contains several seconds of something that is not the Work
  // Explorer. Counting it as one of the ten clean captures would be
  // counting a deliberately contaminated artifact, so it is excluded here
  // and a supplementary run makes up the tenth. Excluding it in code rather
  // than in prose is what stops the exclusion being forgotten.
  // Contamination is DERIVED from the record rather than trusted to a flag
  // someone remembered to set: a run that reports a decoy correlation is,
  // by definition, the run that repointed the capture to measure one. The
  // explicit flag is honoured when present, but nothing depends on it.
  const carriedControls = (r) =>
    r.videoContaminatedByControls === true ||
    (r.observations && r.observations.decoyCorrelation !== null &&
      r.observations.decoyCorrelation !== undefined);
  const isClean = (r) =>
    r.usable &&
    r.stepsCompleted === r.stepCount &&
    r.videoBytes > 0 &&
    !carriedControls(r);
  const cleanRuns = runs.filter(isClean).length;
  const contaminated = runs.filter(carriedControls).length;
  const unmet = findings.filter((f) => !f.passed).map((f) => f.id);

  return {
    criteria: findings,
    cleanRuns,
    runsRequired: bar.runs,
    barRunsMet: cleanRuns >= bar.runs,
    runsMeasured: primaryRuns.length,
    supplementaryRuns: (measurement.supplementaryRuns || []).length,
    runsExcludedAsControlContaminated: contaminated,
    unmet,
    verdict: cleanRuns >= bar.runs && unmet.length === 0 ? "PASS" : "FAIL",
  };
}

module.exports = { evaluate };
