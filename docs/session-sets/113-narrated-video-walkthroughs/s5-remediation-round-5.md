# Set 113 Session 5 — remediation, rounds 1 and 2

Five Major findings across two discovery passes. Both discovery lenses
(spec-conformance and failure-scenario) independently found the same four;
the supplementary pass found the fifth. **Three of the five were false
passes in this session's own verdict script** — the harness reported PASS on
criteria it had not tested — which is the part worth stating first, because
a verdict that grades itself generously is worse than no verdict.

All five are fixed. Nothing was waived, and no criterion threshold was
moved: the criteria file is byte-identical to the one committed before the
first container run, and the verdict script refuses to score a measurement
whose stamped digest does not match it.

---

## F1 — the experiment substituted ffmpeg for OBS, and stock VS Code for the extension

**Round 1, both lenses, Major.** The spec's step 5 names *"VS Code and OBS
on a virtual display inside Podman"*. What ran was VS Code and ffmpeg, with
stock VS Code rather than the Dabbler extension. The verifier's reasoning
was exact and is accepted in full: *"An AI-authored `goal-over-letter`
journal entry does not discharge an explicit operator-approved session
plan"*, and a session that measures a different dependency has not answered
whether the declared one can be isolated.

**Fixed by doing the work.**

- `obs-studio`, Mesa's software rasteriser and `xdotool` added to the image.
- OBS seeded with its own profile and scene collection and run for real,
  recording through its own pipeline with no GPU device passed in.
- The **published 0.51.0 VSIX** is copied into the image and installed at
  run time, and the install is a recorded fact:
  `extensions_installed=darndestdabbler.dabbler-ai-orchestration`. A fixture
  workspace shaped like a Dabbler repo is opened so the Work Explorer has
  something to render.
- The verdict now requires the target to have actually started —
  `target_process_count > 0` and `mapped_window_count > 0` — before I2 can
  pass at all.

**Result, reported honestly rather than favourably: OBS runs in the
container and does NOT meet the predeclared I2 instrument** (correlation
0.085 against a 0.90 bar), so the scored PASS is the ffmpeg path and OBS is
documented separately with its two solved obstacles and one unexplained
disagreement. See the outcome document §3. The bar was not moved to
accommodate it.

**What remains unproven and is now stated in the outcome:** the extension
*activates*; nobody has looked at whether the Work Explorer *renders*
correctly under software rendering, and no criterion here measures that.

## F2 — I5 passed without exercising the degradation guarantee

**Round 1, both lenses, Major.** I5 requires *"the walkthrough still
completes without a video"* plus `manifestStillWritten` and
`videoArtifactCount: 0`. The harness ran three bare `podman` commands and
scored their exit codes; the verdict checked only that at least three
records existed and each carried a non-empty message. The set's cardinal
guarantee — **FAILURE TO RECORD MUST NEVER FAIL THE WALKTHROUGH** — was
certified without being tested.

**Fixed by building the thing the criterion was about.**
`containerCaptureEntrypoint()` attempts a container capture and, on **any**
failure, writes a run manifest describing what happened and returns
normally. It never throws. All three variants now drive it, and the verdict
scores the criterion's own postconditions per variant: walkthrough
completed, manifest written, zero video artifacts, dependency named. It also
now checks the **exact declared variant identities** rather than a count, so
a renamed or dropped variant fails instead of passing.

**And the declared variant is now run literally.** An earlier version of
this fix substituted a non-existent connection name for
`podman-machine-stopped` and declared the substitution; the round-1
acceptance criterion was executable and still FAILED on the fixed tree,
because it requires exact set equality with the declared variant names. The
verifier was right and the substitution is withdrawn: the machine is now
**stopped for real**, the entrypoint runs against it, and the restart is
**verified** rather than assumed -- `stopped=true restored=true` -- because
I6 requires the machine to be left in its entry state and this is the one
variant that can violate it. The verdict scores that restoration.

A second, quieter defect surfaced with it: the harness recorded
`manifestWritten` while the criterion names `manifestStillWritten`. Same
fact, different name -- and a criterion checked against a renamed field is a
criterion that has quietly stopped being checked.

Measured: 3 of 3 variants degrade correctly.

## F3 — I6 passed with no induced failure and no filesystem check

**Round 1, both lenses, Major.** I6 requires assertions *"after every run
and after one deliberately induced mid-run failure"*, including
`noZeroByteOrTempFilesInRunDir`. No failure was induced, no files were
inspected, and cleanup sat on the normal control flow — so a decode error or
a failed `podman cp` would have left a headed browser window and a container
behind while the criterion reported deterministic cleanup.

**Fixed.** Cleanup moved into a `finally`; a real mid-run exception is thrown
on the last target run from where a decode or copy error would land, so the
`finally` is the thing under test rather than a claim about it; zero-byte and
temporary files are counted **inside** the container and on the host; harness
volumes are counted **by label** instead of counting every volume on the
machine, which would have failed an operator with unrelated volumes.

Measured: failure induced, cleanup ran, 0 containers left, 0 harness
volumes, 0 zero-byte files, 0 temp files, machine in its entry state.

## F4 — the cost record was incomplete and contradicted the outcome

**Round 1, both lenses, Major.** I7 declares four required fields;
`coldStartSeconds` did not exist, and the verdict copied `m.cost` without
checking. The outcome said "46.5 s warm build" and "~40 s per run" while the
JSON said 1.5 s and 29.5 s.

**Fixed in three places.**

- The verdict now scores I7 on **presence** of the required fields. The
  criteria say `passFail: false` *and* list required fields; the honest
  reading of both halves is that presence is required and values are not
  judged. That implements the criterion rather than amending it.
- `coldStartSeconds` and `captureWallClockSeconds` are measured, the latter
  reported by the container itself.
- **The cold build is genuinely cold.** `podman rmi` alone was not enough —
  it drops the tag while the layer cache survives, and reported 2.9 seconds.
  That is this same defect one layer down, found while fixing it.
  `--no-cache` gives **55.7 s**.

Every number in the outcome document is now regenerated from the committed
measurement rather than transcribed from a console log.

## F5 — the plugin probe launched the operator's live OBS configuration

**Round 2 (supplementary), Major, and the most serious of the five.** The
probe launched OBS with only `--minimize-to-tray` and `--multi`, so OBS
restored **the operator's current scene collection** — which Session 4 had
already recorded as carrying a live webcam (NexiGo N940P), a microphone and
Desktop Audio. A probe written to measure recorder risk could have
initialised the operator's camera to do it, in a session whose entire
subject is not exposing the host.

**Fixed.** The probe seeds its **own empty collection and profile**, launches
with `--collection/--profile/--scene` pointing at them, and asserts from
OBS's own log that no `dshow_input`, `wasapi_*`, `monitor_capture`,
`window_capture` or `game_capture` source initialised. Measured: `[]` on
both launches, with `isolatedCollectionUsed: true`. What it created is
removed by **observing what appeared** rather than predicting OBS's slug
rules — the lesson Session 4's `obs-capture.js` already paid for. The
operator's `.sentinel` recovery markers are now **stashed and restored**
instead of deleted.

---

## Nits addressed in the same pass

- Forbidden **environment names** were declared in I1 and never checked.
- The verdict ignored `target_process_count` / `mapped_window_count`, so a
  non-black error dialog would have satisfied I2 as well as a running
  editor.
- Marker foreground was *requested* (`bringToFront()`) and then claimed as
  fact; it is now **observed** after the run via the window's own
  `document.hasFocus()`.
- Harness volume counting was machine-wide; now label-scoped.
- `run-capture.sh` described `<outdir>` as *"the one bind-mounted path"*
  while the harness deliberately uses **zero** bind mounts.
- `session-progress.json` was stale in the reviewed tree; regenerated.

## Nit acknowledged and NOT actioned

The round-2 nit that the plugin measurement's ordering claim was
contradicted by the cost note. The ordering was in fact honoured — the
plugin surface was measured before the container was built — and the
contradiction was in the **note's wording**, which described a warm build
while claiming the mitigation ran first. The note is rewritten; no ordering
changed, because none needed to.

## Two instrument defects found by this session in itself

Kept in the record because each produced a clean-looking result that was
worth nothing, which is the failure mode this whole set exists to resist.

1. **The positive control failed open.** `xsetroot -solid magenta` returned
   exit 0 and produced an all-black capture: the X server resets when its
   last client disconnects, wiping a root background set by a command that
   then exits. `Xvfb -noreset` fixes it. Before the fix, I1 would have
   "passed" on a control that measured nothing — exactly how Session 4's C2
   came to be scored FAIL beside a clean `0.000000`.
2. **A fact parser silently dropped the fact I4 needs most.** The
   `FACT key=value` regex was `[a-z_]+`, which cannot match the digits in
   `host_x11_socket_present`. The verdict now requires each I4 fact to be
   **observed**, not merely un-contradicted — the omitted-component failure
   mode in different clothes.

## Verdict after round-1 and round-2 remediation

**PASS**, seven of seven scored criteria -- but see below: the fix-delta
review rejected two of these fixes.

---

## Round 3 — the fix-delta review rejected two of the five fixes

Both rejections were correct, and both were the same mistake in different
clothes: **a test that certifies itself**.

### L2 rejected — I5 was tested through a private helper, not the real command

`containerCaptureEntrypoint()` lived inside the measurement script, always
set `completed = true`, and was only ever called after the image build and
the normal runs had already succeeded. Meanwhile the script an operator
actually runs threw out of `buildImage()` the moment podman was missing --
so under the very dependency failures I5 declares, the documented command
aborted with no manifest at all while I5 reported PASS.

**Fixed.** The script degrades on every dependency failure: it writes its own
run manifest, records `postCaptureStep: "ran"`, and exits 0 with no video.
Each of the three declared variants now re-executes
`measure-container-isolation.js` **as a child process** with the dependency
genuinely broken, and the verdict requires the record to name that
entrypoint.

Two further defects surfaced while fixing it, each of which would have
passed silently:

- **`image-absent` was building the image.** Pointing `DABBLER_S5_IMAGE` at
  a bogus tag simply built the image under that name, so the child ran a
  complete successful measurement -- the variant proving the opposite of what
  it claims. It now skips the build and requires the tag to exist, and the
  bogus tag is removed before every run because an earlier attempt had left
  it in the image store.
- **The video count looked only at the top directory level**, where a child
  that captured successfully writes nothing. A variant that failed to degrade
  would have reported zero video artifacts and passed. It is recursive now.

### L3 rejected — the "mid-run" failure fired after everything had succeeded

The induced exception was thrown after `podman run` returned and after all
three `podman cp` calls, `analyseRun()` and `readTracks()` had completed.
That tests the teardown of a **successful** run. Worse, the error-marked run
was still counted toward "three consecutive clean runs", so
`cleanRunsObserved` read 3 when only two runs were undisturbed.

**Fixed.** There is now a distinct **fourth** run, spawned asynchronously and
force-removed from the host at 22 seconds **while capture is active**: it
exits 137 with zero frames and genuinely partial artifacts. It is excluded
from the clean-run count, and the verdict requires the induced failure to
carry `killedMidCapture: true` -- an exception thrown after a clean capture
can no longer satisfy I6.

A quieter defect went with it: `cleanupRanAfterFailure` was keyed off a
thrown exception, and an interrupted child throws nothing -- so the one run
that *was* the failure reported that cleanup had not run after a failure.

### The nit that turned out to be a real leak

Round 3 noted that `seedIsolatedConfig()` created the probe's profile
directory **before** taking its snapshot, so cleanup never treated it as new.
It was right, and the evidence was on disk: a `dabbler-plugin-probe` profile
left in the operator's OBS configuration from earlier runs. The snapshot is
taken first now, and the probe removes both the collection and the profile --
confirmed by `profilesRemoved: ["dabbler-plugin-probe"]` and by the
operator's profile directory containing only their own `Untitled` again.

Fixing it exposed one more: the guard added to avoid clobbering operator
state **dead-ended on the probe's own litter**, because it demanded byte
equality with what it had written and OBS rewrites a profile it loads (here,
prepending a UTF-8 BOM). It now recognises its own leftovers by the profile's
`Name=` key and cleans them, and still refuses anything it does not
recognise.

### The claim this round forced me to withdraw

The previous document said OBS's remaining I2 failure was an *unexplained*
correlation disagreement. Round 3 pointed at the measurement:
`obs_main_window_mapped: 1` on every OBS run. The unmap cleared the control
frame but did **not** remove OBS's window during the target captures, so the
OBS result is **confounded rather than mysterious**. That correction is in
the outcome document, and it moves OBS from "works except for something
strange" to "feasible, with window suppression as the named next problem".

## Verdict after round-3 remediation

**PASS**, seven of seven scored criteria, **three** clean runs plus one
deliberately interrupted run that is not counted among them, all against the
same criteria file committed before the first container run.



---

## Round 4 — one rejection left, and it was about assuming instead of observing

Three fixes accepted (cost record, isolated plugin probe, degradation through
the documented entrypoint). One rejected.

### L11 rejected — the interruption asserted "capture was active" without observing it

The interrupt fired on a **fixed 22-second timer** and set
`killedMidCapture: true` unconditionally when it expired. It checked neither a
recorder process nor an artifact. So on any run where VS Code started a little
slower, the container would have been removed **before recording began** and
I6 would still have certified an interruption during capture. The measurement
itself makes the risk concrete: it records **24.5 seconds** of non-capture wall
time, against a 22-second timer.

The same finding caught a second gap: `openHostMarker()` ran only for
`mode === "target"`, so the failure run never raised the headed marker and
**marker teardown on the failure path was never exercised** -- which is exactly
the cleanup surface a mid-run failure exists to test.

**Fixed by observing.** The harness now polls the running container --
`stat -c %s /out/capture.mp4` -- and interrupts only when the capture file is
**present and growing**, recording the whole poll series. The interrupted run
raises the same headed marker as a target run, and its teardown is observed via
the browser's own `isConnected()` rather than assumed from having called
`close()`.

Measured on the re-run: 23 polls, sizes `0 ... 0, 48`, interrupted at **25.1 s**
with **48 bytes** of capture written -- three seconds later than the old fixed
timer would have fired, which is the margin the timer was silently gambling
with. Marker raised: yes. Marker closed: yes. The verdict now requires
`captureObservedActive`, `markerRaised` and `markerClosed`, so a timer-only
interruption can no longer satisfy I6.

### The three nits, all actioned

- **"Seven of seven scored"** overstated it: I7 is presence-only and sits
  outside the verdict's scored set. The outcome now says six scored criteria
  plus I7 on presence.
- **The OBS side-measurement carried superseded shapes** while being linked as
  raw evidence. It now carries a `_supersededEvidenceNotice` naming each stale
  field, and the outcome says so where it links it.
- **"The real extension runs"** was one step past the evidence. Installation
  and a mapped window are not activation, and neither is rendering. The
  outcome now says exactly that.

## Verdict after round-4 remediation

**PASS.** Six scored criteria (I1-I6) plus I7 on presence, three clean runs,
and one interrupted run -- excluded from the clean count -- whose interruption
during active artifact production was observed rather than timed.


---

## Round 5 — six fixes accepted, and one new Major about the fix itself

Fix verdicts: **six accepted**, one accepted-with-modification, **none
rejected**. L1 (OBS and the real extension), L2/L10 (degradation through the
documented entrypoint), L3 and L11/L12 (the interruption and its observation),
L9 (the isolated plugin probe) are all settled.

The new Major is the sharpest kind: it is about a change an *earlier* round
pushed me into.

### The machine-stopped variant was safe for this machine and unsafe as a command

Round 1's acceptance criterion required the declared `podman-machine-stopped`
variant to run literally, so I stopped the machine for real. Round 5 pointed
out what that traded away: **`podman-machine-default` is shared by every local
Podman workload.** Every invocation of the documented command reached
`inducedVariants()` and stopped it unconditionally; restarting the VM does not
restart containers that have no restart policy; and the harness then published
`machineLeftInEntryState: true` on the strength of a **VM status string** that
knows nothing about what was running inside.

On this machine nothing else was running, so nothing was harmed. As a
*documented command* it was a hazard, and that distinction is the finding.

**Fixed by refusing rather than by trying harder.** The harness now takes a
full container inventory first. If **any** container it does not own is
running, it does **not** stop the machine: it records the refusal, the names of
the containers it protected, and marks the variant not-run — which fails I5,
correctly, because the declared variant did not happen. Only when nothing
foreign is running does it stop, and restoration is then demonstrated by
comparing the **inventory** (same containers, same states) rather than the VM
status.

Measured on the re-run, with no foreign containers present:
`stopped=true restored=true inventoryPreserved=true`.

### The nit that had now drifted twice

The cost table disagreed with the committed measurement again — a second or two
in three places, after a re-run changed the numbers under a hand-written table.
Correcting the digits a second time would have been treating the symptom, so
**the transcription step is gone**: the table and the interruption figures are
now generated from `s5-container-isolation-measurement.json`.

The other nit was real too: `session-progress.json` still carried a Step 5
description saying OBS was not run and the extension was not installed, both of
which remediation had made false. A corrected step entry supersedes it.

## Where this leaves the loop

**The bound is reached and the loop is SUSPENDED.** Rounds 4 and 5 both ran on
the operator's explicit authorization of "up to two more", and that
authorization is now spent. The remaining finding is **remediated but
unreviewed**: no verifier has judged the refusal-based fix above.

That is stated plainly rather than closed over, and it is the operator's call —
accept the fix, dismiss the finding, or authorize a further round. **This
session does not have the authority to settle it**, and self-authorizing one
more round is exactly what the bound exists to prevent.


---

## Round 6 — seven fixes accepted, and the same pattern caught a third time

Fix verdicts: **seven accepted** (failure-path cleanup, the cost record, the
isolated plugin probe, the interruption, its observation, the host marker, and
the shared-Podman protection), one accepted-with-modification, **one
rejected**.

### L2 rejected again — the post-capture step was a string, not a step

Round 3 established that I5 must show the walkthrough still completing when
the recorder is gone. My round-3 fix wrote `postCaptureStep: "ran"` into the
manifest on the degraded path, and the parent read that same field back out as
`postCaptureStepRan: true`. **Nothing executed.** The evidence for the
criterion was a string the code under test wrote about itself.

That is the third time this session has been caught on the same pattern -- a
test certifying itself -- and the verifier said so: *"repeats the substantive
false-certification problem behind L2/L6"*.

**Fixed by making the step do something.** What a walkthrough actually owes
after capture is the readable artifact -- the thing a reviewer opens when there
is no video -- so the post-capture step now **renders the run's step list to a
standalone document**, and it runs on the degraded path too, which is the whole
point of the guarantee. The parent derives `postCaptureStepRan` from that FILE:
its existence, a marker comment, the presence of list items, and a size floor,
so an empty file cannot satisfy a boolean.

Measured, per declared variant: `podman-executable-absent` 454 bytes,
`podman-machine-stopped` 581 bytes, `image-absent` 448 bytes -- each written
while the dependency was genuinely broken, alongside a manifest and zero video
artifacts.

## Where this leaves the loop, finally

The operator authorized this round with the close to follow on the attested
path. Round 6's finding is now **fixed, and unreviewed** -- there is no round
left to judge it, and this session will not self-authorize one.

What that means precisely, and it is worth stating rather than softening: the
FIX above is unverified. The criterion it serves is now evidenced by an
artifact rather than an assertion, which is strictly better than what round 6
rejected, but no independent reviewer has confirmed that. It is recorded as an
owed residual with a named owner in the disposition, which is what an
adjudication at the bound is supposed to leave behind.
