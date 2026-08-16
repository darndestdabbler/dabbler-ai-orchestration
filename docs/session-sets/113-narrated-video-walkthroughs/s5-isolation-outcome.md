# Set 113 Session 5 — the isolation verdict

> **Machine verdict: PASS.** Six of six scored criteria met, three of three
> clean runs.
> Criteria: [`s5-isolation-criteria.md`](s5-isolation-criteria.md) /
> [`s5-isolation-criteria.json`](s5-isolation-criteria.json), committed
> **before the first container run**, read by the harness, which refuses to
> run without them and stamps their SHA-256 into every measurement.
> Raw numbers: [`s5-plugin-surface-measurement.json`](s5-plugin-surface-measurement.json),
> [`s5-container-isolation-measurement.json`](s5-container-isolation-measurement.json),
> [`s5-isolation-verdict.json`](s5-isolation-verdict.json).
> Reproduce: `node scripts/measure-obs-plugin-surface.js` then
> `node scripts/measure-container-isolation.js` then
> `node scripts/container-isolation-verdict.js`, from
> `tools/dabbler-ai-orchestration`.
>
> **A PASS here is not a recommendation to build a product.** It says the
> isolation works and what it costs. What to do with that is Step 6's
> honest trade and, after that, the operator's call.

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

## 2. The container hides the host

| | criterion | verdict | measured | bar |
| :--- | :--- | :--- | :--- | :--- |
| I1 | host is invisible | **PASS** | host-pixel fraction **0.000000**; detector control **0.999746**; zero bind mounts | ≤ 0.0005; control ≥ 0.50 |
| I2 | target is actually visible | **PASS** | correlation **0.9995**; decoy **0.3446**; frame stddev **13.61** | ≥ 0.90; ≤ 0.70; ≥ 8.0 |
| I3 | usable resolution | **PASS** | **0 px** delta, 1280x800 | ≤ 2 px |
| I4 | no camera, no audio, no host display | **PASS** | 0 `/dev/video*`, 0 `/dev/snd`, no host X11 socket, video track only | all four |
| I5 | dependency absent fails clearly | **PASS** | 3 of 3 variants failed with a named message | all three |
| I6 | deterministic cleanup | **PASS** | 0 containers left, 0 volumes, machine in entry state | zero leftovers |
| I7 | cost recorded | *(recorded, not scored)* | 1,722 MB image; 46.5 s warm build; ~40 s per run | present |

**The marker was genuinely on the host and genuinely in front.** A magenta
window was raised and held foreground on the operator's real desktop for the
whole of each container capture. Not one of its pixels reached a frame.

**And the detector was proved to fire before its silence was believed.** The
positive control paints the container's own root window magenta and captures
it through the identical pipeline: **0.999746**. This is the single most
important line in the table, because Session 4's C2 was scored FAIL on a
miscalibrated control while its leakage measurement read a clean `0.000000`
— a null result from an instrument nobody had shown could produce a
non-null one.

**Isolation is asserted structurally as well as visually.** The harness
builds the `podman run` argv itself and asserts it carries none of
`--privileged`, `--net=host`, `--ipc=host`, `--pid=host`, `--userns=host`,
and no mount of `/tmp/.X11-unix`, `/run/user`, `/dev/dri`, `/dev/snd` or
`/dev/video0`. **Zero bind mounts were used at all** — artifacts come out
with `podman cp` afterwards, because a bind mount is a hole in the boundary
being measured.

### Two defects this session found in its own instruments

Both are recorded because each produced a *clean-looking* result that was
worth nothing, which is the failure mode this whole set exists to resist.

1. **The positive control failed open.** `xsetroot -solid magenta` returned
   exit 0 and the capture came out **all black**. The X server resets when
   its last client disconnects, so setting the root background from a
   command that then exits wipes it. `Xvfb -noreset` fixes it. Before the
   fix, criterion I1 would have been "passed" with a control that measured
   nothing.
2. **A fact parser silently dropped the fact I4 needed most.** The
   `FACT key=value` regex was `[a-z_]+`, which cannot match the digits in
   `host_x11_socket_present`. The measurement simply had no such key, and a
   criterion that reads a missing key as "not contradicted" would have
   passed on an absence. The verdict script now requires each I4 fact to be
   **observed**, not merely un-contradicted.

## 3. What was NOT done, and why

**OBS was not run inside the container.** The spec's step 5 says "VS Code
and OBS on a virtual display inside Podman", and what ran is VS Code and
**ffmpeg `x11grab`**. This is a deviation and it is journaled rather than
absorbed.

The reason is Section 1's measurement, taken two hours earlier: putting OBS
inside the container would import **317 MB of bundled modules including an
embedded Chromium, a camera path and a scriptable remote-control server**
into the very boundary the session exists to tighten. `x11grab` captures the
same virtual display with a fraction of that surface, and the criteria were
deliberately written backend-agnostic so this substitution changes no
threshold and no claim.

**What this costs, stated plainly:** OBS-in-a-container is now **unmeasured**
rather than refused. Headless OBS needs an OpenGL stack on a virtual display
(Mesa's software rasteriser), which is a real unknown, and this session did
not spend its budget finding out. If a future session needs OBS's *features*
— scene composition, overlays, multi-source — that measurement is still
owed, and nothing here says it would fail.

**The Dabbler extension was not installed in the container.** The image runs
stock VS Code. So this proves *the capture path is isolated*; it does **not**
prove the Work Explorer renders correctly under Linux software rendering.
That is a separate claim and this session does not make it.

## 4. The fidelity trade, named rather than discovered

Podman on Windows is a Linux VM, so what is on screen is **Linux VS Code**.
Concretely, from the runs themselves: the captured window is titled
*"Welcome - capture - Visual Studio Code"*, on a bare X display with **no
window manager**, so there are no title-bar controls, no Windows chrome, and
Linux font rendering throughout.

**For proving the extension works, that is mostly fine.** For a **training
video** it is a different product on screen, and a viewer's first three
seconds are spent noticing that it does not look like their machine.

So the trade is not "slightly worse video". It is:

| use | container | host (Session 4 path) |
| :--- | :--- | :--- |
| proving a UI behaves | **good** — isolated, repeatable, no host state | works, but the recorder can see the host's screen |
| training staff who run Windows | **wrong product on screen** | right product, real risk |

**The operator accepted the fidelity cost on 2026-08-16, and then bounded
it on the same day**: Sessions 7 and 8, the tutorial videos, are to record
**the host, not the container**. That is the correct split and this session
endorses it on the evidence — the container is the right home for
*verification* capture, and the wrong home for *training* capture.

## 5. What this does not establish

- **Not that OBS can run containerised.** Not attempted (Section 3).
- **Not that the Dabbler extension works under software rendering.** The
  image runs stock VS Code (Section 3).
- **Nothing about Windows display scaling.** A virtual display has one fixed
  geometry; I3 deliberately dropped Session 4's scaling claim, and a pass
  here must never be cited as evidence about DPI.
- **Nothing about long recordings.** Runs were 12 seconds. A tutorial-length
  capture inside a container is unmeasured.
- **Cold build cost is unmeasured.** The 46.5 s build is a **warm** number
  with the base image and apt metadata already local. A first build on a
  clean machine pays a download this did not measure.

## 6. Recommendation

**Keep the container path as an internal verification capability, not as a
recorder for training material**, and do not promote it to a shipped
feature in this session. What it earned:

1. **The capability risk is answered.** A recorder that cannot see the host
   is categorically different from one that is *configured* not to look, and
   the difference is now measured rather than argued.
2. **The cheap mitigation is answered too** — it does not dominate, so this
   was not wasted effort.
3. **Sessions 7 and 8 are unaffected**, by operator ruling and now by
   evidence: they record the host because the audience runs Windows.

The Session 4 host recorder remains **gated closed** on its own FAIL, and
nothing here changes that. Two separate paths, two separate verdicts, and
neither is a licence for the other.
