# Set 113 follow-on sets — RESERVED, with triggers

> **Status: reservation record, written by Set 113 Session 4 (2026-08-15).**
> Four sets the Set 113 spec names as *"to reserve, not to build here"*.
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
satisfied today**. One is.

---

## 1. Independent Black-Box UI Critique

**Trigger: a standing concern, satisfied today.** This is the only one of
the four whose trigger is already met.

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
audience needs durable video, or videos outgrow manual upload. NOT
satisfied today.**

Largely pre-empted. An existing SharePoint library or Teams channel already
supplies storage, discoverability, access control and retention, and
Stream supplies auto-captioning — so manual upload of a sub-minute file is
not a pipeline and does not need one.

Two conventions hold in the meantime, and neither is code:

1. **Put the product version in the video's title or filename**, so a
   viewer can tell whether they are watching the build they are running.
2. **Treat the upload as disposable.** The authored step list is the
   source; a stale video is deleted and regenerated, never patched.

**One boundary worth restating.** SharePoint and Teams are org-internal.
That is the right home for training the operator's staff and the business
users of applications this framework builds. It is **not** reachable by
public consumers of the published VS Code extension or the PyPI package. If
narrated video is ever wanted for those audiences, it is a different
channel and a different decision.

**A Session 4 datum for whoever picks this up.** A 46-second capture of the
Work Explorer at 1440x900, recorded with OBS's default simple-output
quality, came out at **34.6 MB**. That is fine for manual upload and
comfortably inside the sub-minute convention, but it is not small, and
anyone who wants many of these should expect to set a recording quality
rather than take the default.

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
