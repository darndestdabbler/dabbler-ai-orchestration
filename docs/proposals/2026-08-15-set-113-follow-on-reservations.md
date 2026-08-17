# Set 113 follow-on sets — RESERVED, with triggers

> **Status: reservation record, written by Set 113 Session 4 (2026-08-15;
> a fifth entry added 2026-08-16 on operator direction).** Four sets the
> Set 113 spec names as *"to reserve, not to build here"*, plus one the
> operator raised while Session 4 was closing.
> **No set numbers are reserved yet** — numbering is the operator's call.
> This document exists so the reservations are not lost with the set that
> made them, and so each trigger is written down where a future session can
> check it against reality instead of remembering it.
>
> The spec that reserved them:
> [`docs/session-sets/113-narrated-video-walkthroughs/spec.md`](../session-sets/113-narrated-video-walkthroughs/spec.md)
> → *Follow-on sets to reserve, not to build here*. Where this record and
> that spec disagree, **the spec governs**.

## Why triggers rather than an order

Each of these is genuinely worth doing *when something makes it worth
doing*, and worth nothing before then. A reserved set with a satisfied
trigger is work; a reserved set with an unsatisfied trigger is a set that
would be built against no requirements — which is the shape the operator's
standing complexity note warns about (*"this could quickly become dozens of
sets with thousands of lines of code"*).

So each entry below states its trigger **and whether that trigger is
satisfied today**. **Two have since been promoted into Set 113 itself** —
sandboxing as Session 5 and the pull-critique transport failure as Session
6 — leaving three genuinely reserved, none of whose triggers is met.

---

## 1. Independent Black-Box UI Critique

**Trigger: a standing concern, satisfied today.** The only *reserved* set
whose trigger is met, now that entry 5 has been promoted into Set 113.

Provider-diverse exploratory web E2E against what round 3 of the Set 113
consults named **common-mode self-verification failure** — the operator's
observation that *"AI tends to cheat, especially in E2E."* Web-only to
start.

The shape the spec fixed, which a future session may not quietly relax:

- The reviewer gets the acceptance criteria **approved before
  implementation**, and a persona — but **not** the diff, the tests, the
  rationale, or the authored path. It must choose its own route.
- **Evidence required per finding.** **No finding quota** — a quota
  manufactures findings.
- **Calibrated with seeded defects**, because *"if it cannot detect
  representative broken states, a clean run is not evidence."*
- Output is **advisory** and **never counts as a human reviewer**. Set 113
  Session 1's UAT record has a reviewer-type vocabulary; an AI agent is not
  one of its values, and round 3 refused to add one on the grounds that it
  bakes in the category error the operator had already avoided.

**Why it is ready now.** Session 3 shipped the web-driving machinery it
would build on — a fixture web app, a Playwright driver, a step-event
stream and an artifact-agnostic run manifest — and Session 4 has just shown
what an adversarial measurement buys: of the defects this set found, the
ones that mattered were the ones a control caught, not the ones the
implementer noticed.

**Standing caution.** Set selection is the operator's, and this
recommendation is one input. A routed analysis during Session 3 proposed
*Terminal Walkthroughs* as the next set on a trigger this repository's own
spec does not use; that suggestion was rejected and should not be revived
by repetition.

---

## 2. Terminal Walkthroughs and Cast Artifacts

**Trigger: a real terminal target exists. NOT satisfied today.**

PTY/cast recording, normalized transcripts, secret redaction, TUI
semantics.

**The trigger is not "OS capture was proved."** A routed analysis proposed
retriggering this set on *"ten consecutive clean captures"* during Session
3. That is wrong on the facts and the spec governs: a terminal cast is a
PTY recording, not a screen capture, and the two share no machinery.
Session 4 passing says nothing whatever about whether anyone has a terminal
product to walk through. Adopting that trigger would start a set with no
requirements to build against.

---

## 3. Training Publication and Retention

**Trigger, narrowed by the operator on 2026-08-10: a public or non-org
audience needs durable video, or videos outgrow manual upload. FIRED
2026-08-16 — the first half of it.** The operator directed two tutorial
videos for a **public** destination — *"We will post these on the web
somewhere — perhaps on YouTube"* — which is exactly the non-org audience
the boundary paragraph below reserves this for.

**What that does and does not license.** It does not promote this
reservation into Set 113. Sessions 7 and 8 produce publication-**ready**
files and a **human uploads them**, which is the same manual model the
operator described for SharePoint, applied to a different channel. What
fires is the *trigger for a later set*: the moment there is a public
audience, retention, stale-content policy, accessibility review and
version association stop being conventions somebody remembers and start
being somebody's job. Two of the four are already partly answered below.

Largely pre-empted. An existing SharePoint library or Teams channel already
supplies storage, discoverability, access control and retention, and
Stream supplies auto-captioning — so manual upload of a sub-minute file is
not a pipeline and does not need one.

Two conventions hold in the meantime, and neither is code:

1. **Put the product version in the video's title or filename**, so a
   viewer can tell whether they are watching the build they are running.
2. **Treat the upload as disposable.** The authored step list is the
   source; a stale video is deleted and regenerated, never patched.

**The public channel changes one thing materially: a safety pass.** An
org-internal video is seen by colleagues who already have access to the
paths, repository names and gauges it shows. A public one is not
recallable and is watched by strangers. Set 113 Session 7 builds that
checklist and Session 8 runs it again per video; a publication set
inherits it rather than reinventing it.

**One boundary worth restating.** SharePoint and Teams are org-internal.
That is the right home for training the operator's staff and the business
users of applications this framework builds. It is **not** reachable by
public consumers of the published VS Code extension or the PyPI package. If
narrated video is ever wanted for those audiences, it is a different
channel and a different decision.

**A Session 4 datum for whoever picks this up.** A sub-minute capture of
the Work Explorer at 1440x900, recorded at OBS's default simple-output
quality, comes out around **37 MB** — consistently, across the pilot's ten.
That uploads by hand without complaint and sits inside the sub-minute
convention, but it is not small, and anyone who wants many of these should
expect to set a recording quality rather than take the default.

(The duration is deliberately not restated here. It is derived from the
scenario source and rendered into all four generated documents; Session 2
learned that repeating it in prose gives it somewhere to drift.)

---

## 4. Non-Web Walkthrough Backends

**Trigger: an actual product supplies requirements. NOT satisfied today.**

Native desktop or 3270 driving and capture.

**The correction that keeps this reserved** is round 3's, and Session 4
confirmed it in practice: *"capturing pixels is the easy part; reliably
staging and driving an arbitrary desktop application is usually the
expensive part."* Session 4 spent almost all of its effort on the driver,
the OBS lifecycle and the measurement instruments, and almost none on
capture — which is the same lesson from the other side. Playwright drives
browsers and Electron; **nothing drives an arbitrary desktop application**,
and until something does, a capture backend for one has nothing to record.

This is also where a *"record any application"* tool or agent belongs. The
operator asked about one on 2026-08-15 and ruled it out for exactly this
reason.

---

## 5. Sandboxing the Capture Dependencies — PROMOTED to Set 113 Session 5

> **No longer reserved.** The operator promoted this into Set 113 itself
> on 2026-08-16, as **Session 5**. Everything below is retained because it
> is that session's brief, not because it is still waiting for a trigger.
>
> **The operator also supplied the shape that makes it tractable, and it
> corrects the framing below.** The objection recorded here — that a
> container cannot capture a *host* window without being handed back most
> of the isolation — is true and is the wrong question. Put **both** the
> target and the capturer inside: VS Code and OBS in one container,
> capturing a display that never leaves it. No capture crosses the
> boundary, and the media stack never sees host pixels, windows or devices.
> The cost is fidelity, not feasibility: Podman on Windows is a Linux VM,
> so what gets recorded is Linux VS Code rather than the Windows VS Code
> staff actually run.

### The operator's framing

> *"Especially in the age of AI-powered exploitation of software
> vulnerabilities, open source software is generally considered more risky.
> Yes, OBS Studio is also open source. What we may want to consider is this
> — whatever system we end up using — if possible, use it in a container to
> limit the risk."*

Set 113 Session 4 made this concrete rather than theoretical. To record one
walkthrough of this repository's own product, the framework now expects
**two large third-party media dependencies** on a developer's machine:

- **OBS Studio** — a GUI application the harness launches, configures over
  a local websocket, and drives. Session 4 measured its plugin surface
  incidentally: the operator's install loads a DeckLink SDK, an NVIDIA
  filters plugin, a CEF-based browser source, an AJA output plugin and a
  machine-learning background-removal model, none of which this framework
  wants.
- **ffmpeg** — installed during Session 4 to measure the fallback. A
  full build links a very large codec and container surface, and its
  historic CVE record is exactly the shape the operator names.

Neither is bundled, and both are correctly documented as optional. The
question this set would answer is **whether they can be isolated rather
than merely optional**.

### What this repository already has to build on

**`ai_router/podman_sandbox.py` (Set 069 S4)** is a working Podman cage
built on the identical principle — *"model-authored code runs only inside a
real container"* — with the container as the trust boundary rather than
human approval. That is the same argument one rung along: here the
untrusted thing is not model-authored code but a large third-party media
stack.

### What makes this genuinely hard, and must be scoped honestly

Containerising a **capture** dependency is not the same as containerising a
*compute* one, and a set that does not say so up front will overrun:

1. **Capture needs the host's display.** A container cannot Windows-Graphics-
   Capture a window belonging to a process on the host without being handed
   deep access to the host session — which is most of the isolation given
   back. This is the crux and should be settled before anything is built.
2. **Windows containers are not Linux containers.** The capture target is a
   Windows GUI application, and Podman/WSL2 does not put the host's
   desktop inside the guest.
3. **The portable path may be the better lever.** Session 3's browser
   recorder drives Chromium, which containerises conventionally — so the
   *web* recorder (the one that serves every real target) may be
   containerisable even if the Windows OS-capture path is not. That
   asymmetry is worth measuring before deciding.
4. **A cheaper mitigation may dominate.** Session 4 already established
   that the recorder creates its own OBS profile and scene collection,
   deletes every input it did not create, and restores the operator's
   configuration byte-for-byte. Running OBS with `--only-bundled-plugins`
   (an existing OBS flag) would cut the loaded plugin surface without any
   container at all. Measure that first; it may buy most of the risk
   reduction for none of the complexity.

### The shape worth reserving

**Measure before building**, the same way Session 4 did: fix the criteria
first, establish what isolation is actually achievable for each dependency,
and record a verdict either way. A defensible outcome is *"the web path
containerises, the Windows capture path cannot, and here is the
plugin-surface reduction that is achievable instead"* — that is a real
answer, and it is cheaper than a media-sandboxing subsystem nobody can
finish.

**Do not let this become the generic-recorder set in disguise.** The
complexity note binds here too.


---

## 6. The pull-critique transport failure — PROMOTED to Set 113 Session 6

> **No longer reserved.** Promoted by the operator on 2026-08-16 as Set 113
> **Session 6**, after Session 4's advisory path-aware critique produced no
> artifact across three attempts.

Recorded here so the reservation list stays a complete index of what came
out of this set. The brief lives in the spec; the evidence is Session 4's
residual **S4-R9**. The sharpest fact to start from: the *same* openai
models answered five `session-verification` calls in Session 4 without
trouble, so the ordinary routed path works while the pull-critique path
(tool-using, Responses API) returns HTTP 400 — a router-side defect rather
than a provider outage.


## 7. Close-Out Cost Must Be Produced, Not Asserted

**Trigger: FIRED. Reserved 2026-08-17 on operator direction, from a live,
priced failure in this set's own Session 8.**

Make `close_session` stop accepting a hand-written `disposition.cost` block
when it could have produced one itself.

**The failure is the specification.** Session 8 authored a cost block
claiming both seat components were `unavailable`, with a confident sentence
of reasoning: *"a Copilot seat meters CAPACITY, not dollars, and exposes no
per-session figure to this process. Unavailable is not zero."* Every clause
of that is false. `ai_router.seat_cost` reads the Copilot session store,
attributes turns by **conversation id** rather than by clock, and converts
`total_nano_aiu` to AI credits and dollars. Run retrospectively against the
same session it priced it immediately:

```
orchestrator seat   6,112.1 credits   $61.12   (242 turns)
routed calls (CLI)    912.4 credits    $9.12   (57 turns, 6 conversations)
routed calls (API)      0.0 credits    $0.00   (not applicable -- no keys)
TOTAL               7,024.4 credits   $70.24
```

**Nothing was missing and nothing was broken.** `start_session` had already
recorded `orchestrator.seatSessionIds`, the six routed conversations were
already in `router-metrics.jsonl`, and the store read cleanly at schema v6.
The measurement was available the entire session and simply was not taken.

**Why this is a GATE and not a lesson.** The close already caught it. It
refused the block and printed exactly which fields were malformed -- and
because the cost gate is **advisory**, the orchestrator hand-repaired those
fields to satisfy the validator instead of asking why a producer existed for
them at all. An advisory that can be satisfied by editing the thing it is
complaining about is not a gate; it is a hint that teaches the wrong lesson
under time pressure. Under this repo's own encode-or-drop rule (Set 121), a
*"read the schema doc more carefully"* lesson would be dropped on sight, so
the fix has to be executable.

**The procedural root cause, recorded because it generalises.**
`docs/disposition-schema.md` names `seat_cost --cost-block` as the producer
of this field, and the constitution's per-step pointer table says to open
that doc at Step 8 when authoring the disposition. It was not opened. The
*previous session's* `disposition.json` was copied and its prose edited
instead -- which is L-064-8 (a successor inheriting its predecessor's claims)
applied to a data file rather than a doc. Deriving an artifact's shape from
the last one that existed is how a stale claim outlives the thing that made
it true.

**Scope worth reserving.**

- When `transport.profile` is `copilot-cli` and `seatSessionIds` are present,
  `close_session` **produces** the cost block itself rather than reading a
  hand-written one.
- A hand-written block is accepted only with an **operator attestation**
  naming why the measurement could not be taken -- the same shape the UAT and
  waiver paths already use.
- The Direct-API half deserves the same treatment: `router-metrics.jsonl`
  already carries priced rows, so an unmeasured `routed_api` on a machine
  that has keys is equally suspect.
- Falsifiers, both directions: a session whose ids are present must refuse a
  hand-written `unavailable`, and a session with genuinely no store must
  still be able to close with an attested one.

**What it is worth.** This one miss under-reported a single session by
$70.24. The set-level and cross-set cost history is assembled from these
blocks, so an asserted `unavailable` does not merely lose one number -- it
silently biases every roll-up that reads it.