# Set 113 — the guided look

**Ten minutes.** Five things to look at, three things only you can decide.
Nothing to set up: one command stages everything.

This set's deliverable is an *experience*, so the honest test of it is
whether looking at it feels worth the time. If it does not, that is the
most useful thing you can tell us.

---

## Before you start

From the repository root:

```bash
cd tools/dabbler-ai-orchestration
npm run walkthrough:vscode
```

It stages a throwaway sample project, opens a second VS Code against it,
drives five steps of the AI Work Explorer while OBS records that window,
and prints the path of a page to open. It takes about a minute and a half.
Nothing it does touches your own work.

**If OBS is not running with its websocket enabled**, the command still
finishes and still prints a page — it just says there is no video. That is
the intended behaviour, not a failure, and item 4 asks you to look at it on
purpose.

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

Run `npm run walkthrough:vscode -- --no-video` and open the page it prints.

**Look at:** what sits where the player was.

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
