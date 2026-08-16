# Set 113 Session 5 — the isolation verdict

> **Machine verdict: PASS.** **Six scored criteria** (I1-I6) met, plus I7 on
> presence of its required fields -- I7's *values* are deliberately not
> judged, so it is reported beside the verdict rather than inside it. Three
> clean runs, with **ffmpeg** as the in-container capturer.
> **OBS was also run inside the container** and is reported separately in
> §3: it starts, renders in software and records, and this session did not
> obtain a clean OBS capture of the target.
>
> Criteria: [`s5-isolation-criteria.md`](s5-isolation-criteria.md) /
> [`s5-isolation-criteria.json`](s5-isolation-criteria.json), committed
> **before the first container run**, read by the harness, which refuses to
> run without them and stamps their SHA-256 into every measurement.
> Raw numbers: [`s5-plugin-surface-measurement.json`](s5-plugin-surface-measurement.json),
> [`s5-container-isolation-measurement.json`](s5-container-isolation-measurement.json),
> [`s5-obs-container-measurement.json`](s5-obs-container-measurement.json),
> [`s5-isolation-verdict.json`](s5-isolation-verdict.json).
> Reproduce, from `tools/dabbler-ai-orchestration`:
> `node scripts/measure-obs-plugin-surface.js`,
> `node scripts/measure-container-isolation.js --capturer ffmpeg`,
> `node scripts/container-isolation-verdict.js`.
>
> **A PASS here is not a recommendation to build a product.** It says the
> isolation works and what it costs. What to do with that is §5's honest
> trade and, after that, the operator's call.
>
> **This document is the THIRD version.** The first claimed a PASS that
> three of its own criteria had not earned; the second fixed them in ways
> the fix-delta review then rejected as still not testing the real thing.
> §6 lists every finding and what changed, because a corrected result whose
> correction is invisible is not much better than the error.

## 1. The cheap mitigation does not dominate

Measured first, because the spec ordered it first, and for the right
reason: if `--only-bundled-plugins` removed most of the supply-chain
surface, the container might not have been worth building.

It does not. **The flag removes one module out of twenty-five.**

| | without the flag | with `--only-bundled-plugins` |
| :--- | ---: | ---: |
| modules loaded | **25** | **24** |
| removed | — | `obs-backgroundremoval.dll` |
| OBS logs "Third-party plugins disabled." | no | **yes** |

The flag demonstrably takes effect. What **survives** it is the finding —
twenty-four bundled modules totalling **317 MB**, including:

| module | what it is |
| :--- | :--- |
| `obs-browser.dll` | an embedded Chromium (CEF) |
| `win-dshow.dll` | DirectShow capture — the camera path |
| `decklink*.dll` | Blackmagic DeckLink SDK |
| `nv-filters.dll` | NVIDIA video-effects filters |
| `obs-vst.dll` | a VST plugin host |
| `vlc-video.dll` | VLC integration |
| `obs-websocket.dll` | a scriptable remote-control server |

Every large dependency the Session 4 reservation worried about **ships with
OBS**, so a flag that skips *non-bundled* plugins cannot touch any of them.

**Both denominators, not the flattering one.** By module count the reduction
is 4%. By bytes it is larger: the machine-wide plugin directory is 101 MB,
nearly all of it one ONNX background-removal model. So the flag removes the
biggest single **file** and none of the biggest **risks**.

**The probe no longer starts the operator's own OBS configuration**, and the
first version did. Verification round 2 was right to call that Major: OBS
restores its current scene collection at startup, and Session 4 had already
recorded that this operator's collection carries a live webcam, a microphone
and Desktop Audio. A probe written to measure recorder risk would have
initialised the operator's camera to do it. It now seeds its own empty
collection and profile, launches into them, and asserts from OBS's own log
that **no** `dshow_input`, `wasapi_*`, `monitor_capture`, `window_capture`
or `game_capture` source initialised — measured as `[]` on both launches. It
removes what it created by observing what appeared, and it now **stashes and
restores** the operator's `.sentinel` recovery markers instead of deleting
them.

## 2. The container hides the host

| | criterion | verdict | measured | bar |
| :--- | :--- | :--- | :--- | :--- |
| I1 | host is invisible | **PASS** | host-pixel fraction **0.000000**; detector control **0.999746**; zero bind mounts | ≤ 0.0005; control ≥ 0.50 |
| I2 | target is actually visible | **PASS** | correlation **0.9995**; decoy **0.3449**; frame stddev **13.62**; VS Code processes and mapped windows present; **Dabbler extension installed** | ≥ 0.90; ≤ 0.70; ≥ 8.0 |
| I3 | usable resolution | **PASS** | **0 px** delta, 1280x800 | ≤ 2 px |
| I4 | no camera, no audio, no host display | **PASS** | 0 `/dev/video*`, 0 `/dev/snd`, no host X11 socket, video track only | all four |
| I5 | dependency absent fails clearly | **PASS** | 3 of 3 declared variants, each driving **the documented entrypoint** as a child process: exit 0, manifest written, **0** video artifacts, dependency named, post-capture step ran | all postconditions |
| I6 | deterministic cleanup | **PASS** | a **fourth** run interrupted at 25 s **while capture was observed producing bytes** (48 bytes written; exit 137, 0 frames), excluded from the clean count; cleanup ran; 0 containers, 0 harness volumes, 0 zero-byte, 0 temp files; machine in entry state | zero leftovers |
| I7 | cost is recorded | **PASS** *(presence only)* | all four required fields present | present |

**The marker was genuinely on the host and genuinely in front.** A magenta
window was raised and held foreground on the operator's real desktop for the
whole of each container capture, and its own `document.hasFocus()` and
visibility are now sampled **after** the container run returns, so the claim
rests on an observation at the end of the window rather than an intention at
the start.

**The detector was proved to fire before its silence was believed.** The
positive control paints the container's own root window magenta and captures
it through the identical pipeline: **0.999746**. This is the single most
important line in the table, because Session 4's C2 was scored FAIL on a
miscalibrated control while its leakage measurement read a clean `0.000000`
— a null result from an instrument nobody had shown could produce a
non-null one.

**Isolation is asserted structurally as well as visually.** The harness
builds the `podman run` argv itself and asserts it carries none of
`--privileged`, `--net=host`, `--ipc=host`, `--pid=host`, `--userns=host`,
no mount of `/tmp/.X11-unix`, `/run/user`, `/dev/dri`, `/dev/snd` or
`/dev/video0`, and none of the forbidden environment names. **Zero bind
mounts were used at all** — artifacts come out with `podman cp` afterwards,
because a bind mount is a hole in the boundary being measured.

### What the cost actually is

| | measured |
| :--- | ---: |
| image size | **1,900 MB** |
| cold build (`--no-cache`) | **56.1 s** |
| warm build | 1.9 s |
| container cold start to capture | **24.4 s** |
| capture wall clock | 12 s |

Every figure above is **generated from the committed measurement**, not
transcribed. It was transcribed twice, and drifted from the JSON both
times — by a second or two in three places, then again after a re-run.
Small, and exactly the kind of drift that makes a reader stop trusting
the larger numbers, which is why the transcription step is now gone.

The cold number is a genuinely cold build. `podman rmi` alone was **not**
enough — it drops the tag while the layer cache survives, and reported 2.9
seconds. That is the same mislabelled-cost defect verification found in the
first version, rediscovered one layer down, and it is why `--no-cache` is
now used. It still excludes a registry pull of the base image, which a first
build on a clean machine would also pay.

### `--cap-drop=ALL` breaks the target, measured

The security posture here is lifted from `ai_router/podman_sandbox.py`
(Set 069 S4) rather than invented — but **not all of it transfers**, and the
part that does not is worth recording:

| flag | VS Code processes | mapped windows |
| :--- | ---: | ---: |
| `--cap-drop=ALL` | **2** | **0** |
| `--security-opt=no-new-privileges` | 15 | 4 |

Chromium's sandbox needs capabilities to build its user namespace, so
dropping all of them leaves VS Code unable to start. The alternative — keep
the flag and pass Chromium `--no-sandbox` — was **refused**: deliberately
unsandboxing a browser engine to satisfy a flag is the kind of convenience
this session exists to reject. The residual is stated rather than hidden:
**this container runs with Podman's default capability set, not an empty
one.** `--network=none` and `--security-opt=no-new-privileges` are applied.

What is *not* reused from `podman_sandbox.py` is the function:
`run_probe_in_container` mounts the repository read-only at `/repo` and runs
a Python probe from `/scratch`, and a capture container must have no repo
mount at all. The **policy** transfers; the plumbing does not.

## 3. OBS in the container: it runs, and it does not meet the bar

The spec names OBS as the capture candidate, and verification rejected
substituting ffmpeg for it — correctly: a session that measures a different
dependency has not answered whether the *declared* dependency can be
isolated. So OBS was installed in the image and run for real.
Raw numbers: [`s5-obs-container-measurement.json`](s5-obs-container-measurement.json)
-- **a superseded shape, retained as raw OBS evidence and never scored.** It
was written before rounds 3 and 4 corrected the harness, so it still carries
the withdrawn `podman-machine-unreachable` substitution, the post-success
"mid-run" failure, and a 2.4-second `coldBuildSeconds` taken after `podman
rmi` alone. Those fields are listed as stale inside the file itself. What it
is still good for is the only record of OBS actually running in the
container.

**What works.** OBS 30.2.3.1 starts on the virtual display under Mesa's
software rasteriser with **no GPU device passed in**, loads a seeded profile
and scene collection, records through its own pipeline, and produces a
playable MP4. On the evidence, **headless OBS in a container is feasible**,
which is the thing nobody here knew this morning.

**Two things had to be discovered to get that far, and both are the point.**

1. **OBS records itself.** `--minimize-to-tray` has no tray to minimise into
   on a bare X display, so OBS renders its GUI onto the very screen it is
   capturing. The first OBS run came out **27% magenta and ~70% OBS**. Fixed
   by unmapping OBS's own window with `xdotool` after it starts — it keeps
   running and recording, it just stops being on screen. The positive
   control went from 0.289 to **0.999747** once it was gone.
2. **A count that counted the wrong thing.** The first check grepped every
   X child whose name contained "obs" and reported six still mapped, five of
   which are 1x1 Qt helper windows that were never visible. A working unmap
   looked like a failed one.

**Where it stops, and a correction to the previous version of this
document.** The OBS recording is real content — frame standard deviation
**13.4**, colour histogram nearly identical to the in-container still — but
the **correlation instrument reads 0.085 against a 0.90 bar**.

The previous version called that disagreement *unexplained*. It is not, and
saying so was unsupported: **every OBS run records
`obs_main_window_mapped: 1`**, and `mapped_window_names_during_capture`
still lists `OBS 30.2.3.1-3`. The `xdotool` unmap moved the window enough to
clear the *control* frame — which is why the control went from 0.289 to
0.999747 — but OBS's main window was **still mapped** during the target
captures. So the OBS result is **confounded**, not mysterious: the most
likely reading is that OBS's own GUI is still contributing to what it
records, and nothing here rules that out.

So, precisely: **OBS runs in a container, and this session did not obtain a
clean OBS capture of the target.** The bar was fixed before the first run
and is not being moved to accommodate it. The container path therefore
passes with **ffmpeg**; OBS is feasible-and-unfinished, with the window
suppression as the named next problem rather than an instrument mystery.
That is a materially better answer than the first version's "not attempted",
and an honest distance from "OBS works".

## 4. What is now proven that was not, and what still is not

**Proven this round, and not before:**

- **The real extension is installed and VS Code runs with it.** The image
  installs the published `dabbler-ai-orchestration` 0.51.0 VSIX and the run
  asserts it: VS Code reports `darndestdabbler.dabbler-ai-orchestration`
  installed, with a fixture workspace shaped like a Dabbler repo open, and 15
  processes and 4 mapped windows. The first version ran stock VS Code and
  proved nothing at all about it.
  **What that does NOT establish, precisely:** installation and a mapped
  window are not activation, and neither is rendering. Nothing here observes
  the extension activating or the Work Explorer drawing its tree. Saying it
  "runs" would be over-reading the evidence by one step.
- **Degradation is tested through the command an operator actually runs.**
  Each of the three declared variants re-executes
  `measure-container-isolation.js` as a child process with the dependency
  genuinely broken — a missing podman binary, a **stopped machine**, an
  absent image with the build skipped so the tag stays absent — and each must
  exit 0, write the manifest, name the dependency, run its post-capture step
  and produce no video. **FAILURE TO RECORD MUST NEVER FAIL THE WALKTHROUGH**
  is the set's cardinal guarantee; it was first certified without being
  exercised at all, then certified by a private helper that always reported
  success, and is now exercised against the documented entrypoint.
- **Cleanup survives a real interruption.** A **fourth** run is force-removed
  from the host at 22 seconds, *while capture is active* — it exits 137 with
  zero frames — and the container removal, marker teardown and filesystem
  checks all run through a `finally`. It is **not** counted among the three
  clean runs, which the previous version did.

**Still not proven, and said plainly:**

- **Not that the Work Explorer RENDERS correctly.** The extension is
  installed and activates; nobody has looked at its tree under Linux
  software rendering, and no criterion here measures it.
- **Nothing about Windows display scaling.** A virtual display has one fixed
  geometry; I3 deliberately dropped Session 4's scaling claim.
- **Nothing about long recordings.** Runs are 12 seconds. A tutorial-length
  capture in a container is unmeasured.
- **Not a first-build cost on a clean machine** (no registry pull measured).

## 5. The fidelity trade, named rather than discovered

Podman on Windows is a Linux VM, so what is on screen is **Linux VS Code**.
Concretely, from the runs: the captured window is titled *"Welcome - fixture
- Visual Studio Code"*, on a bare X display with **no window manager**, so
there are no title-bar controls, no Windows chrome, and Linux font rendering
throughout.

**For proving a UI behaves, that is mostly fine.** For a **training video**
it is a different product on screen, and a viewer's first three seconds are
spent noticing that it does not look like their machine.

| use | container | host (Session 4 path) |
| :--- | :--- | :--- |
| proving a UI behaves | **good** — isolated, repeatable, no host state | works, but the recorder can see the host's screen |
| training staff who run Windows | **wrong product on screen** | right product, real risk |

**The operator accepted the fidelity cost on 2026-08-16, and then bounded it
the same day**: Sessions 7 and 8, the tutorial videos, record **the host,
not the container**. That is the correct split and this session endorses it
on evidence — the container is the right home for *verification* capture and
the wrong home for *training* capture.

## 6. What verification caught, and what changed

Five Majors across two discovery passes, both lenses agreeing on four of
them. Three were **false passes in this session's own verdict**, which is
the uncomfortable half and the reason they are listed here rather than
summarised away.

| # | finding | what changed |
| :--- | :--- | :--- |
| 1 | ffmpeg substituted for OBS; stock VS Code for the extension | OBS installed and run (§3); the real VSIX installed and asserted |
| 2 | I5 passed without exercising the degradation guarantee | a real capture entrypoint the variants drive; postconditions scored |
| 3 | I6 passed with no induced mid-run failure and no filesystem check | failure induced; cleanup in a `finally`; zero-byte and temp files counted |
| 4 | cost record incomplete and contradicted the outcome | `--no-cache` cold build; all four fields present and scored; numbers reconciled |
| 5 | the plugin probe launched the operator's live OBS config | isolated collection and profile; no live source initialised; sentinels restored |

**Round 3 (fix-delta review) then rejected two of those five fixes**, and
both rejections were correct:

| # | rejection | what changed |
| :--- | :--- | :--- |
| L2 | I5 was tested through a private helper that always set `completed = true`, while the documented script threw out of `buildImage()` under the same failures and wrote no manifest at all | the script itself degrades on every dependency failure and writes its manifest; the variants re-execute **it** |
| L3 | the "mid-run" failure was thrown *after* capture, copying, decoding and track analysis had all succeeded — and the error-marked run was still counted as one of three clean runs | a distinct fourth run, force-removed **during** capture, excluded from the clean count |

Two further defects surfaced while fixing those, and are worth recording
because each would have passed silently: the `image-absent` variant was
**building** the image under its bogus tag, so it measured a fully
successful run and proved the opposite of its name; and the variant's video
count listed only the top directory level, where a successful child writes
nothing, so a variant that failed to degrade would still have reported zero
video artifacts.

Nits addressed in the same pass: forbidden environment names are now
checked; the verdict requires VS Code to have actually started before I2 can
pass; marker foreground is observed rather than requested; harness volumes
are counted by label instead of counting every volume on the machine; and
`run-capture.sh` no longer describes a bind mount it does not use; the
extension check is now part of I2's pass expression rather than merely
recorded beside it; the plugin probe's `ok` now **fails** when a safety
assertion fails instead of reporting success regardless; and the probe
snapshots the profile directory **before** creating its own, which is why it
now removes `dabbler-plugin-probe` from both `scenes` and `profiles` where
it previously leaked the profile every run.

**Two instrument defects this session found in itself**, both of which
produced clean-looking results worth nothing, and both kept in the record:

1. **The positive control failed open.** `xsetroot -solid magenta` returned
   exit 0 and captured an all-black screen — the X server resets when its
   last client disconnects. `Xvfb -noreset` fixes it. Before the fix, I1
   would have "passed" on a control that measured nothing.
2. **A fact parser silently dropped the fact I4 needs most.** The regex was
   `[a-z_]+`, which cannot match the digits in `host_x11_socket_present`.
   The verdict now requires each I4 fact to be **observed** rather than
   merely un-contradicted.

## 7. Recommendation

**Keep the container path as an internal verification capability, not as a
recorder for training material**, and do not promote it to a shipped feature
in this session. What it earned:

1. **The capability risk is answered.** A recorder that cannot see the host
   is categorically different from one that is *configured* not to look, and
   the difference is measured rather than argued.
2. **The cheap mitigation is answered too** — it does not dominate, so this
   was not wasted effort.
3. **OBS is feasible in a container** and not yet usable in one: it starts,
   renders in software and records, and its own window is still on the
   display it captures. The named next problem is window suppression, not an
   instrument mystery.
4. **Sessions 7 and 8 are unaffected**, by operator ruling and now by
   evidence: they record the host because the audience runs Windows.

The Session 4 host recorder remains **gated closed** on its own FAIL, and
nothing here changes that. Two separate paths, two separate verdicts, and
neither is a licence for the other.
