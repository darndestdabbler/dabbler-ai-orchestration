# Operator notes — Set 113

Notes captured from the operator outside a session. Sessions read this file
at their start alongside the spec. Nothing here is settled design unless it
says so; where a note bears on a decision the spec has reserved, it is the
**holder of that decision speaking early**, not a session self-authorizing.

---

## 2026-08-10 — UAT is a confidence dial, not a requirement

Recorded before Session 1, on the operator's direction. The operator is the
author of this framework and is speaking from experience developing both
solo and with AI.

### The observation

**`requiresUAT` is not really a requirement if it can be bypassed — and it
always can be, and always should be, to prevent impasses.** A flag that
cannot be routed around eventually blocks work that must ship; a flag that
can be routed around is not a requirement. Calling it one misdescribes what
it does.

The honest question is not *did UAT happen* but **how much additional
confidence in the product — for human users and for AI engines — did the
UAT work actually buy?** That quantity is continuous, and it varies enormously:

| UAT performed | Marginal confidence |
| :--- | :--- |
| No UI component at all | **Zero.** There is nothing for a human to see that automation cannot. |
| One developer watches video walkthroughs of each UI component and gives feedback (Dabbler UAT checklist or otherwise) | **Medium** — and *much* better than nothing. |
| Several independent business users spend several weeks systematically exploring and documenting every workflow path, typical cases and edge cases | **Very high.** |

**Confidence is not all-or-none, and it is not uniform across a session's
work.** The operator's worked example: a single developer watches and gives
feedback on video walkthroughs for the **low-risk, low-complexity**
components — the ones where AI is less likely to have *doctored up* (cheated
its way into) a solution — and performs **manual walkthroughs** for the
higher-risk or higher-complexity components. The additional confidence for
those latter components is greater. That is a rational allocation of a
scarce reviewer, and today's binary `walked | waived` cannot express it.

### What the operator proposes instead

> Rather than gating on UAT, we could simply **record what kind of UAT (and
> by how many developers and/or business users) was done for each component
> addressed by a session**. That's useful documentation.

Three things are being asked for that the current shape does not provide:

1. **Kind** of UAT — watched, watched-and-repeated-some-steps, fully manual
   walkthrough, systematic exploration.
2. **Who and how many** — developer(s) vs. business user(s), and a count.
   Independence matters: several independent reviewers is a different claim
   from one reviewer looking several times.
3. **Per component**, not per session. A session touching five components
   may legitimately have five different answers.

### The debt question — deliberately left open

Risk-shaped technical debt accumulates where UAT was thin, and it is **paid
down when users actually use the product in production**. Whether the
framework should *track* that debt is open. The operator's own words: *"Do
we need to keep track of this technical debt? I don't know. Perhaps we could
get input from GPT and Gemini on this, but we don't want to make things too
complicated."*

Standing constraint on any answer: **do not make things too complicated.**
See the complexity note below, which the operator raised in the same breath.

### Orchestrator's read (not settled — for the session to weigh)

- **The seam already exists.** `disposition.uat` is written today with
  `status` / `walkArtifact` / `attestation`, and `uat_walk_recorded` reads
  it. The operator's proposal is mostly a **richer record in that same
  block** (per-component entries carrying kind, reviewer class, reviewer
  count) rather than a new mechanism. That keeps the cost low.
- **The current gate is closer to the operator's position than its name
  suggests.** It already accepts `waived` on an attestation alone; its real
  product is *a recorded status plus an attestation*, not a blocked close.
  The disagreement is with the **binary**, and with the word *requires* —
  not with the existence of a record.
- **Do not lose what the gate bought.** The measured failure mode (Set 110
  S2) was **evaporation** — the walk silently not happening and nothing
  noticing. Any redesign must still make *"no UAT was done"* an explicit,
  recorded, attributable answer rather than an absence. "Record instead of
  gate" is safe only if the record is itself obligatory.
- **This is a verification-reduction question**, and therefore inside the
  decision-rights hard carve-out. These notes are the operator exercising
  that carve-out early, which is legitimate — but they read as *direction
  and a stated lean*, not a final ruling ("we should consider", "I don't
  know"). Session 3's education-mode brief should now be presented
  **against this lean**, and the outcome journaled with attestation as
  planned. No session may treat this file as the attestation.

### Consequences for the spec as written

- **Session 3, step 2–3** was framed as "does watching satisfy
  `requiresUAT`?" then "wire the outcome into the close gate." The
  operator's framing reframes the question: not *does watching count*, but
  *what did each component get, and from whom*. Session 3 should present
  that framing as the leading option.
- **Spec decision #5** ("watching is not automatically walking") survives
  intact and is in fact sharpened: watching is not the same as walking, it
  is simply **worth something**, and the record should say which happened.
- **This set's own config block** (`requiresUAT: true`) is now in tension
  with the operator's framing. Left as-is deliberately — changing it is an
  operator-held call, not a bookkeeping edit, and Session 3 is where it
  lands.

---

## 2026-08-10 — Pause-and-do-it-yourself, with a synced window

### The observation

Ideally a video walkthrough can be **paused while the user performs the same
steps manually in another window**. At each pause the user has two paths:

- **Path (a)** — the user **continues in their own window** to the next
  manual step. They are driving the real product themselves, start to finish.
- **Path (b)** — the program **launches a new window that is synced with the
  video recording**, so the user only has to perform the **current** step
  they just watched.

**Ranking, explicitly:** a user who takes path (a) throughout the whole
walkthrough (parallel manual steps for *every* step) gains higher confidence
than one who takes path (b) — but **path (b) is much better than nothing.**

### Orchestrator's read (not settled)

- This is the same gradient as the note above, at step granularity. It is
  further evidence that the record should capture **how much of the walk was
  actually performed**, not just that a walk occurred — path (a) for every
  step, path (b) for every step, and every mixture between, are different
  claims.
- Path (b) requires the harness to **replay state to the point the video is
  at** so the user's window matches what they just saw. Set 111 S4's
  `npm run walk` already stages a fixture workspace from nothing, which is
  the expensive half of that; the missing half is stepping a fixture to an
  arbitrary point in the scenario. Session 2's one-source-two-outputs step
  format is the natural place for that to become possible, because a step
  list that renders captions and manual instructions can also address *"put
  the fixture in the state before step N."*
- **Path (b) is where the complexity lives.** Path (a) needs almost nothing
  beyond a video the user can pause and a staged fixture — both already
  planned. Sequence accordingly: ship path (a) first and prove reviewers
  use it before building the synced-window machinery.

---

## 2026-08-10 — Complexity budget: this can eat the roadmap

### The observation

> *"Potentially, this feature of the framework that provides a video
> walkthrough with sync'd manual steps would add some complexity to the
> framework. All things equal, we need to keep things as simple as possible.
> This feature could quickly become something that evolves into dozens of
> sets with thousands of lines of code."*

Treat this as a **standing constraint on Set 113**, binding on all three
sessions, not as an aside. Anything that looks like the beginning of a
media-tooling subsystem is a signal to stop and re-scope, not to press on.

The set's own non-goals already point this way (no video library, no CI
recording, no TTS unless chosen). This note extends them: prefer the
smallest thing that produces the confidence, and let the *thin* version be
observed in real use before any of it is generalized.

---

## 2026-08-10 — Electron/VS Code is the odd platform out, not the target

### The observation

Electron and Visual Studio Code are the platform for the **orchestrator
project itself**. The likelihood of the orchestrator being used to generate
another Electron-based solution is **extremely low**. The products this
framework will actually be used to build are more like:

- (a) .NET web applications
- (b) Java web applications
- (c) vanilla JavaScript / HTML applications
- (d) Python web applications
- (e) various non-web applications, and others that cannot all be anticipated

The operator's question for the set: **how much of this work would be
helpful only to orchestrator maintenance?** If one video-walkthrough
solution can serve (a) through (d), that is better than a one-off that only
works for Electron — *but not at unbounded complexity cost.*

### Orchestrator's read (not settled — but load-bearing for Session 1)

This materially changes the Session 1 framing and should be read before the
capture dependency is settled.

- **(a)–(d) are not four platforms; they are one.** .NET, Java, vanilla
  JS/HTML and Python web apps all render **in a browser**. A single
  browser-driving recorder covers all four. The framework's cross-cutting
  value is therefore concentrated in the *browser* path — which is exactly
  the path this set was **not** planning to build.
- **The proposal's feasibility finding is narrower than it reads.**
  Playwright's `recordVideo` was measured to break the **VS Code workbench
  window** specifically. It is well-behaved when recording an ordinary
  Chromium page. So the honest conclusion is inverted from how Session 1 is
  currently framed: in-process recording is the *primary* path for the
  portable (a)–(d) case, and OS-level capture (ffmpeg `gdigrab`) is the
  **fallback for the awkward host** — Electron/VS Code, and category (e).
  Session 1 should re-read the feasibility table with this distinction in
  mind rather than treating "not `recordVideo`" as universal.
- **Two capture backends behind one seam** is the shape that satisfies both
  this note and the complexity note: a browser recorder for web targets, an
  OS-level recorder for everything else, and the core carrying neither
  (portability rule: it must degrade to the manual walkthrough alone with no
  recorder present).
- **The portable value is the step format, not the recorder.** Session 2's
  one-source-two-outputs work — the authored step list, the captions, the
  manual "repeat it yourself" walkthrough, the divergence test — is
  **target-agnostic**. It is worth as much to a Java web app as to this
  extension. The recorder is the platform-specific, replaceable part. If the
  complexity budget forces a cut, cut recorder generality before step-format
  generality.
- **Category (e) is the honest limit.** Non-web desktop and CLI products can
  only be served by OS-level capture, which is the same backend the
  Electron case needs — so building it is not orchestrator-only work, but
  neither is it free. Do not attempt per-framework cleverness beyond the two
  backends.

---

## 2026-08-10 — Operator rulings after round 1, and two new questions

Recorded after the operator read both round-1 consults
([`provider-consults/synthesis.md`](provider-consults/synthesis.md)).

### Ruled

- **(a) The record-completeness gate is accepted.** The gate stops demanding
  a walk and starts demanding an *accounting*: per-component records of what
  UAT was done, by which kind of reviewer, and how many. **"No UAT" is a
  valid, attested, passing value.** Nothing blocks — which answers the
  impasse objection — and nothing evaporates, which preserves what Set 111
  bought. This is the operator exercising the verification-reduction
  carve-out; Session 3 still owes the journaled attestation.
- **(b) Cutting the synced window is accepted, with a condition:**

  > *"as long as very clear, step-by-step instructions are provided for the
  > user to get to any point in the video."*

  Treat that as a **requirement on the replacement**, not a nicety. A user
  must be able to reach an arbitrary point in the scenario by following
  written steps, with no state-injection machinery.

### New question (c) — independent, non-sycophantic AI agent UAT

> *"Would there be a way for a path-aware AI agent other than the
> orchestrating agent — that is, an independent AI agent — to critically
> (with a non-sycophantic mindset) do a UAT walkthrough themselves? Would it
> depend upon the type of solution platform?"*

### New question (d) — the videos are dual-purpose

> *"We should keep in mind that these video recordings could double as
> training videos — so they might have a dual purpose. That said, it might
> be better to have the OS-level recordings and to design them so that they
> can be replayed as training videos at any time."*

Note the operator's lean here: dual purpose is an argument **for** OS-level
recording and durable, replayable artifacts.

Both questions were routed for a second round; see
[`provider-consults/synthesis-round-2.md`](provider-consults/synthesis-round-2.md).
**The second round answered the operator's lean in (d) with a reversal:**
GPT-5.5 changed its round-1 position and now refuses OS-level capture
*because* training material is in scope, and Gemini says the training
argument reinforces its existing refusal. Both instead make the **authored
step list** the durable artifact and treat videos as **regenerated on
demand, never archived** — which makes staleness impossible by construction
and, in the same stroke, satisfies condition (b) above. On (c), both refuse
to call agent-driven review "UAT" at all and both refuse to build it in this
set.

---

## 2026-08-10 — Round 3: the operator challenges the consensus

The operator was unconvinced by the unanimous round-2 recommendation and
called for a critical review by a frontier model (GPT-5.6 Sol). Their
objections, verbatim:

> *"My concern about not having OS-level videos is the **training gap for
> non-web applications**. It is possible that those applications would
> benefit significantly from those videos. Also, the training videos would
> help with UAT. **Who knows where AI-led development will take us**,
> especially in a world where security patches are now becoming something to
> fix immediately — perhaps back to COBOL and mainframe or desktop
> applications."*

> *"On (c), **yes it is E2E**. That said, over the past few months that I
> have used AI, I often find that **AI tends to cheat — especially in E2E**.
> So, TREATING E2E AS THOUGH IT WERE UAT, by having an independent AI agent
> do the E2E — emulating as much as possible a **skeptical/critical user** —
> might be valuable. Yes, that might be a separate session set. Yes, it
> might not be worth it at all. But it is worth careful consideration
> because anything that we can do to make UAT easier and more likely to
> succeed (that is, detect and address more UI-related issues before UAT),
> the better."*

**The challenge was substantially vindicated.** See
[`provider-consults/synthesis-round-3.md`](provider-consults/synthesis-round-3.md).
The critical review **overturned the unanimous refusal of OS capture**,
replacing it with a bounded, measured one-session Windows pilot; **killed
round 2's "regeneration makes staleness impossible"** claim (a generated
video is not training material unless it is published, and the step list can
go stale too); and judged the operator's E2E-cheating observation
well-founded, renaming it **common-mode self-verification failure** and
agreeing the reframe *"materially changes the verdict."*

It also corrected the operator on the more expensive half of their own
argument: *"Capturing pixels is the easy part; **reliably staging and
driving an arbitrary desktop application is usually the expensive part**."*
Every prior party — both consults, the operator, and this orchestrator —
had argued about capture and ignored the driver.

---

## 2026-08-10 — Where the videos live: SharePoint or a Teams channel

Operator direction, recorded after the round-3 review flagged durable
publication as an unsolved problem:

> *"If the UAT/training videos are very short (and they should be … less
> than one minute, if possible), then **SharePoint or a Teams Channel might
> be a good target** for them. We could **manually upload** them. If they
> must be longer, then we may need to consider other options."*

**This largely collapses the reserved *Training Publication and Retention*
set into a convention.** Round 3 listed what durable publication would
otherwise cost: external storage, product-version association,
discoverability, accessibility review, retention and stale-content policy.
An existing SharePoint library or Teams channel supplies **storage,
discoverability, access control and retention** for free — they are already
administered — and Teams/Stream supplies auto-captioning, which covers the
accessibility item. Manual upload of a sub-minute file is not a pipeline.

**What it does not solve, and the cheap discipline that covers it.**
Version association and staleness remain, exactly as round 3 said: a video
lies the moment the UI changes. Two conventions are enough, and neither is
code:

1. **Put the product version in the video's title or filename**, so a
   viewer can tell whether they are watching the build they are running.
2. **Treat the upload as disposable.** The authored step list is the source;
   a stale video is deleted and regenerated, never patched.

**The constraint is well-aligned.** "Under a minute" matches the spec's
existing "one scenario each, measured in tens of seconds" decision. If a
scenario cannot be told in a minute it is probably two scenarios — the
length limit is a design check, not just a hosting limit.

**One boundary worth stating.** SharePoint and Teams are **org-internal**.
That is the right home for training the operator's staff and the business
users of the applications this framework builds. It is **not reachable by
public consumers** of the published VS Code extension or the PyPI package.
If narrated video is ever wanted for *those* audiences, it is a different
channel and a different decision — do not let the internal answer be quietly
assumed to cover it.

**Standing until revisited:** videos are generated into ignored output,
optionally uploaded by hand to SharePoint or Teams, and never committed to
git. The reserved publication set stays reserved, with its trigger narrowed
to *"a public or non-org audience needs durable video, or videos outgrow
manual upload."*

---

## Open items these notes hand to the sessions

**Consulted three times, 2026-08-10, before Session 1.**
[Round 1](provider-consults/synthesis.md) (GPT-5.5, Gemini 3.1 Pro,
independent) → [round 2](provider-consults/synthesis-round-2.md) (same two,
new questions, unanimous) →
[round 3](provider-consults/synthesis-round-3.md) (GPT-5.6 Sol, critical
review of the consensus). Round 3 supersedes round 2 where they conflict.

| # | Item | Status |
| :--- | :--- | :--- |
| 1 | Per-component record of UAT kind, reviewer class and count, replacing binary `walked \| waived` | **Operator-ruled** (accepted). R3 adds: the gate must check the **component inventory**, or an omitted component becomes the new evaporation |
| 2 | Whether thin-UAT risk debt is tracked | All rounds: intrinsic to the UAT record, machine-readable, component-granular. R3: **no self-assessed confidence scores, no parallel ledger** |
| 3 | OS-level capture | **Operator-held.** R2 unanimous against; **R3 overturns it** — one bounded Windows pilot against the Work Explorer with hard pass criteria and a one-session budget |
| 4 | Path (b) synced window | **Operator-ruled** (cut). R3: "reach any point" honestly means replaying a documented prefix from a known baseline or checkpoint |
| 5 | Step list authored first, usable **without** the video | All rounds agree. R3: it is the **durable training deliverable**; the video is not |
| 6 | Exemplar platform | R3 splits it: **dummy web app** for the browser proof, **Work Explorer** for the OS pilot |
| 7 | Reserve `reviewerType: ai-agent` | R2 (GPT-5.5) would; **R3 would not** — it bakes in the category error the operator already avoided |
| 8 | Independent skeptical-user agent driving the UI | **Deferred to a named later set**, web-only, with seeded-defect calibration, no quota, advisory output that never counts as a human reviewer |
| 9 | Cheap anti-collusion measures available **now**, needing no new set | Freeze operator-approved acceptance criteria **before** implementation; verifier challenges black-box assertions; check tests exercise user-visible outcomes; **forbid the implementer silently weakening tests to get a pass** |
| 10 | Session count | R3 recommends **four** sessions, not three |

### Unrelated finding, surfaced by the round-3 dispatch

`route(prefer_model="gpt-5-6-sol")` silently resolved to `gpt-5.5`: the seat
catalog lock `ai_router/copilot-catalog.lock` was probed 2026-08-05 and has
**no GPT-5.6 entries**, though the CLI serves `gpt-5.6-sol` today. Because
`gpt-5-6-sol` is the registry's **pinned `session-verification` verifier**,
that pin does not currently bind on this seat. Not a Set 113 matter —
recorded so it is not lost.



