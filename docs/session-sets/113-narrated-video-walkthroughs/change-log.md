# Set 113 — Narrated Video Walkthroughs

## What this set was for

A gate makes skipping **visible**; it does not make walking **pleasant**.
Set 111 shipped the `requiresUAT` close gate because Set 110 closed with no
walk and nothing noticed — but a gate that forces an unpleasant activity
produces waivers, and a waiver rate near 100% is a gate routed around
rather than satisfied.

Set 111 had already removed the **staging** cost: `npm run walk` stages a
fixture and opens the view. This set removed the **comprehension** cost,
and replaced a binary flag with a truthful record.

Four sessions, and the operator's standing complexity note — *"this could
quickly become dozens of sets with thousands of lines of code"* — bound all
four.

## What shipped

### Session 1 — the gate demands an accounting, not a walk

`disposition.uat`'s binary `walked | waived` is gone. In its place, one
facts-only record per component: what was done, by which kind of reviewer,
how many of them, with evidence and findings. **"No UAT" is a valid,
attested, passing value** — which answers the impasse objection the
operator raised, because nothing blocks.

The load-bearing detail is that the gate checks the **component
inventory** declared in the spec, not whatever records happen to be
present. Without that, an omitted component simply becomes the new form of
evaporation.

Two closed vocabularies, both closed on purpose. Reviewer types are
`developer` and `business-user` only: consult round 3 refused to reserve an
`ai-agent` type because *"it bakes in the category error the operator has
already avoided"*, and a closed enum is the only form of that rule a schema
can enforce. Component keys are exactly six, because an open shape is how
`confidence: 0.8` gets in later without anyone deciding to add it.

The decision was journaled under **operator authority**: it reduces
verification, and `decision_journal` refuses that under AI authority — a
refusal that is correct.

### Session 2 — one source, four documents, and a seam that holds

A scenario is authored once. Its **portable** half — stable step ids,
prerequisites, a known baseline, reset and recovery instructions, and per
step the action and the expected observable result — renders the manual
walkthrough, the training document, the WebVTT captions and the chapter
metadata. A digest over that half is stamped into all four, and
`scenario_render --check` fails if they can diverge.

Everything target-specific lives under `drivers:`, which **no renderer
reads**. That quarantine is the seam round 3 named as the one that actually
matters, and it was proved rather than asserted: Session 4 rewrote the
`playwright-vscode` block entirely and all four generated documents stayed
byte-identical.

The operator's condition on cutting the synced window — *"very clear,
step-by-step instructions to get to any point"* — is honoured in what the
documents say. Reaching an arbitrary point means **replaying a documented
prefix from a baseline or a named checkpoint**, stated plainly rather than
implying random access nobody built.

### Session 3 — the portable recorder, proved with a control

`npm run walkthrough:web` drives a real web UI through an authored scenario
and writes a watchable, captioned result. `--url` points it at a consumer's
own application, which is the whole cross-cutting claim: .NET, Java, Python
and vanilla-JS web applications are **one target, not four**, once they
reach a browser.

**The premise was measured, not assumed.** This repository had measured
only the failing case — Set 111 measured that Playwright's `recordVideo`
breaks the VS Code workbench. So the browser claim was measured the same
way: the same probe, the same fixture, run twice, one option different. Arm
A drove the UI *and* wrote a video; arm B drove it and wrote nothing — the
exact inversion of the workbench result. `measure-browser-record.js`
reproduces it and exits non-zero if it ever stops holding.

The run manifest is the hedge the set agreed to pay for, and nothing in it
assumes an MP4: zero or more typed artifacts, a closed kind vocabulary
naming `terminal-cast` and `transcript` beside video, and an **empty
artifact list is valid**, because failure to record must never fail the
walkthrough.

**Round 1 of that session's own verification verified nothing**, and saying
so is the point. The work had been committed before `verify_session` ran,
and it diffs the working tree against `HEAD` — so the bundle was empty, the
verifier correctly said it had been handed nothing, and the doc-only
severity cap recorded that at Minor, printing *"effectively VERIFIED"* with
instructions to close. A session that verified nothing was one instruction
from closing as verified. Fixed at the source: an empty evidence bundle is
now refused before anything routes.

### Session 4 — a measured answer on Windows OS capture

The one surface the portable recorder cannot serve is this repository's own
product. `node scripts/record-vscode-walkthrough.js` records the AI Work
Explorer with OBS Studio, behind an internal and explicitly unstable
interface. It is deliberately **not** an npm script and announces its own
unapproved status on every run — see below.

**The criteria were made checkable rather than merely written down.** They
were committed as a machine-readable file *before the first capture*; the
harness reads it, refuses to run without it, and stamps its SHA-256 into
every measurement; and the verdict is computed by a separate pure module
that contains no threshold of its own. Anyone can recompute it from the
committed numbers and the committed thresholds.

Seven criteria, each with an instrument, and a **control** wherever the
claim would otherwise be unfalsifiable — because a correlation threshold
with no decoy cannot tell a working instrument from one that returns 1.0
for everything.

**Ten clean captures out of ten.** Correlation 0.9996 against a screenshot
of the same window every time, with a decoy scoring 0.2987 on the same
instrument. Zero occluder pixels in frame while an occluder covered 80.8%
of the target and held focus. Frame dimensions exactly the window's
physical pixels, following a deliberate resize. Anchor uncertainty
106–110 ms against a 1500 ms bar. Three induced dependency-absent variants,
each named and each still producing a walkthrough. Fourteen cleanup
attempts, zero leftovers — confirmed independently, not from the harness's
own report.

**The machine verdict is nevertheless FAIL**, on two clauses this session
set for itself. C7's no-audio-track clause cannot be satisfied through OBS
at all: four configurations were tried and a silent track is always muxed,
though no audio *source* exists. C2 fails on its **control**, not its
claim — leakage measured exactly zero, while the check proving the detector
fires came in at 0.441 against a 0.50 bar, because the occluder doubles as
C1's structured decoy and includes browser chrome. It was deliberately
**not** retuned: adjusting the instrument to pass is the same sin as moving
the threshold.

So the recorder is **not shipped**. Verification was blunt about the first
attempt at this — calling it "provisional" in an outcome document gates
nothing — so the `npm run` entry is gone, the documentation says plainly
that it is not approved for use, and the recorder reads the pilot's own
verdict and says so on every run, a notice that stops printing by itself
when the verdict changes. The code remains only because the measurement
cannot exist without it. Waiving a criterion reduces verification, which is
inside the decision-rights hard carve-out, so the question goes to the
operator rather than being settled here.

## What the criteria bought

Writing them first caught a defect nothing else in the set would have
found: the last caption cue ended **32–83 ms after the recording did**, on
every one of the first eleven captures. The videos look fine and the
captions look fine; the two were only ever compared because a criterion
said to compare them. Fixed, and the **whole pilot re-run** against the
fixed recorder rather than one number patched.

Four more defects came from probing rather than reasoning, before any
measurement: `--websocket_port` is honoured and does **not** enable the
server; a leftover run marker raises a modal dialog that *hangs* the next
launch rather than failing it; `RecQuality=Small` makes OBS accept
`StartRecord` and never start, silently; and cleanup **predicted** OBS's
filenames instead of observing them, so it deleted nothing and reported
success.

## What this set deliberately did not build

No video library, no CI recording, no voice synthesis, no committed
binaries, no custom viewer, no generic cross-platform recorder, and no
self-assessed confidence scores. A *"record any application"* tool was
asked about and refused: capture is the cheap half, and a generic recorder
is idle until something can **drive** an arbitrary application, which
nothing does.

Four follow-on sets are reserved with triggers in
[`docs/proposals/2026-08-15-set-113-follow-on-reservations.md`](../../proposals/2026-08-15-set-113-follow-on-reservations.md).
Exactly one trigger is satisfied today.
