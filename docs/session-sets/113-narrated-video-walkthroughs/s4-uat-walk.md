# Set 113 — the guided look

**Ten minutes.** Five things to look at, three things only you can decide.
Nothing to set up: one command stages everything.

This set's deliverable is an *experience*, so the honest test of it is
whether looking at it feels worth the time. If it does not, that is the
most useful thing you can tell us.

---

## Before you start

**Nothing to run for most of this.** The pilot already recorded ten clean
walkthroughs on this machine and left them on disk. Open this file in a
browser:

```
tools/dabbler-ai-orchestration/.walkthrough-runs/pilot/run-11/index.html
```

That is a real recording of the real AI Work Explorer being driven through
the five authored steps, with its captions and its step list. Items 1 to 3
are all on that one page.

**The recorder itself will refuse to capture**, on purpose. The pilot's
verdict is FAIL on two criteria, and a failed pilot ships no recorder — so
the command now stops rather than warning and recording anyway. Decision A
below is what would change that. You can see the refusal in one second:

```bash
cd tools/dabbler-ai-orchestration
node scripts/record-vscode-walkthrough.js
```

---

## Look

### 1. Watch the recording

Open the `index.html` the command printed, and watch the video once.

**Look at:** whether you could follow what was happening without anyone
explaining it to you.

*Could a colleague who has never seen the Work Explorer follow this?*

### 2. The steps beside the video

Same page, scroll down to the step list under the player.

**Look at:** whether the written steps say the same thing the video shows,
in words you would actually use.

*If the video vanished, would this page still be worth keeping?*

### 3. Turn the captions on

Use the player's captions button, then scrub to about halfway.

**Look at:** whether the caption matches what is on screen at that moment.

*Is the caption describing the step you are actually watching?*

### 4. The version with no video

Run this — it is allowed, because it captures nothing:

```bash
node scripts/record-vscode-walkthrough.js --no-video
```

**Look at:** what sits where the player was, on the page it prints.

*Does this page tell you plainly that there is no recording, rather than
looking broken?*

### 5. Your OBS, afterwards

Open OBS Studio. Check *Tools → WebSocket Server Settings*, and look at
your scene list.

**Look at:** whether anything is different from how you left it.

*Is your OBS exactly as you had it — server still off, your own scene
collection untouched, no leftover `dabbler-*` profile?*

---

## Decide

### A. OBS always writes a silent audio track. Is that acceptable?

The spec says "no audio", and no audio *source* exists — the recorder
builds its own scene collection, which contains nothing but the one window
capture, and your webcam and microphone are never in it. But OBS muxes an
audio track into the file regardless. Four configurations were tried,
including advanced output mode with zero tracks requested; the track is
always there and is always silence.

- **Accept it** — a provably contentless track is not a privacy problem.
- **Treat it as blocking** — the recorder does not ship until the track is
  genuinely gone.

### B. Enabling the OBS websocket: your click, or the tool's?

The recorder needs obs-websocket's server enabled. Neither of OBS's
command-line flags turns it on, so something has to write one boolean.

- **You enable it once, in the OBS UI** (what ships today) — the tool
  never edits another application's configuration.
- **The tool enables it and puts it back** — one less manual step, but a
  tool that silently reconfigures OBS.

### C. A sub-minute recording is about 37 MB. Is that small enough?

At OBS's default quality, consistently across the pilot's ten captures. It
sits inside the sub-minute SharePoint/Teams convention and uploads by hand
without complaint, but it is not small.

- **Leave it** — default quality, no knob, revisit if it ever bites.
- **Set a lower quality** — smaller files, one more setting the recorder
  owns and can get wrong.

---

## When you are done

Nothing to submit. Tell the next session what you saw, and your three
choices. Your answers to A, B and C are recorded as decisions and the next
session opens by showing each one applied or reversed.
