# Pre-set consult prompt — Set 113 (narrated video walkthroughs / UAT reframing)

> Sent before Session 1, at the operator's direction, because the operator's
> 2026-08-10 notes could materially change the set. Responses land beside
> this file. This is a **design consult, not a verification round.**

---

You are being asked for high-level design input on a session set that has
been specified but **not started**. The framework author has just recorded
observations that may materially change it. Nothing is built yet, so
disagreement is cheap and welcome — say plainly if the premise is wrong.

## 1. Context: the framework

`dabbler-ai-orchestration` is a repo of shared AI-orchestration
infrastructure used by several "AI-led workflow" repos. Work is organised
into **session sets**: a spec declares 2-6 sessions, each session is run by
an AI orchestrator with a human operator, and each session must pass close
gates before it can be marked complete. Two relevant pieces:

- **`ai_router/`** — a Python package: multi-provider routing, session
  state, close gates, metrics. Published to PyPI; consumer repos install it.
- **`tools/dabbler-ai-orchestration/`** — a VS Code extension (the "Work
  Explorer") that renders session-set progress. Published to the VS Code
  Marketplace.

A spec carries a config block, e.g.:

```yaml
tier: full
requiresUAT: true
requiresE2E: true
uatStyle: ad-hoc
uatScope: per-set
```

**Portability rule (binding):** *"Universal core, gated extensions, addendum
specifics."* Anything in the core must work unmodified when
`requiresUAT: false` and `requiresE2E: false` are permanent defaults —
because many consumer repos have no UI at all. UI/UAT/E2E behaviour must be
gated on spec-level flags.

**Decision rights:** decisions are routed by *authority*, not difficulty.
Any change that **reduces verification** is a hard carve-out reserved to the
human operator and cannot be self-authorized by an AI, even when the AI is
confident.

## 2. The UAT problem, as measured in this repo

The operator, verbatim:

> *"I want to do UAT, but the experience has to be good. In the past, it has
> been awful. In the past, the instructions have been way too difficult to
> decipher and often too involved. Often, the setup is too involved."*

> *"We often bypass UAT. I haven't complained because it totally sucks, but
> we shouldn't bypass it. It should be a pleasurable experience."*

Evidence, not preference:

- Set 110 Session 2 closed **without its UAT walk, and nothing noticed.**
  The failure mode is **evaporation** — not a decision to skip, but the walk
  simply not happening.
- Set 111 built a close gate in response. A `requiresUAT: true` session now
  closes only when `disposition.uat` records either
  `status: "walked"` (plus a `walkArtifact` file that must exist on disk)
  or `status: "waived"` (plus an operator attestation). There is
  deliberately no third value.
- Set 111 also removed the **staging** cost: `npm run walk` builds a
  disposable fixture workspace, launches an isolated VS Code Extension
  Development Host, and opens the view with zero operator steps.
- The current UAT format is a **"guided look"**: <=5 "Look" items (three
  lines each: how to get there, what to look at, one question) and <=3
  "Decide" items (provisional calls only the operator can ratify). Ten
  minutes total.

What remains unsolved is the **comprehension** cost: reading step
instructions and deciding what "right" looks like.

## 3. Set 113 as currently specified

**Premise:** a gate makes skipping *visible*; it does not make walking
*pleasant*. A gate that forces an unpleasant activity produces waivers, and
a waiver rate near 100% is a gate that has been routed around rather than
satisfied.

**Proposal:** narrated video walkthroughs. An automated script drives the
real product through a short scenario; the run is recorded to video with
captions at two levels (what this accomplishes; what is being clicked and
typed). The reviewer **watches** — cheap, and where most UI feedback comes
from. Each video then offers **"repeat it yourself"**: the same fixture,
already staged, and the same steps as a short manual walkthrough. Many
short videos (tens of seconds each), not one long tour.

**Load-bearing constraint — one source, two outputs.** The step list is
authored once and renders *both* the video's captions *and* the manual
walkthrough. A video and a hand-written instruction sheet that drift apart
are worse than no video, because the reviewer trusts the video and then
cannot reproduce it.

**Measured feasibility (2026-08-08, with a control).** The same launch
script run twice against the real VS Code Extension Development Host,
differing only in whether Playwright's `recordVideo` option was passed:

| Run | `recordVideo` | Outcome |
| :--- | :--- | :--- |
| A | `{ dir, size: 1280x800 }` | `firstWindow()` resolves to a window with an **empty URL**; no window exposes `.activitybar`; the automation cannot drive the workbench; **no video file written** |
| B | omitted | workbench window found immediately, `.activitybar` visible, tree rows present, clicks drive the real UI |

Conclusion recorded: Playwright's Electron video recording does not attach
usefully to a **VS Code workbench window**, and passing it breaks the very
automation it would record. The automation half already works today. The
spec therefore says: start from **OS-level capture** (`ffmpeg -f gdigrab` on
Windows), not from `recordVideo`. ffmpeg is **not currently on PATH** on the
operator's machine.

**Three sessions as specified:**

1. **The recording spine** — settle the capture dependency (bundled /
   documented prerequisite / optional capability; the portability rule means
   the core must work with no recorder, degrading to the manual walkthrough
   alone); build the recorder around the existing Playwright automation;
   record one real walkthrough and watch it; settle where videos live
   (committed binaries are forever).
2. **One source, two outputs** — author the step format; render timed
   captions from it (`.vtt` sidecar and/or burned in); render the manual
   walkthrough from the *same* steps; add a test that fails if narration and
   manual steps can diverge.
3. **Adoption, and what counts as a walk** — an operator-held
   education-mode brief on whether watching satisfies `requiresUAT`; wire
   the outcome into the close gate and `disposition.uat`; document the
   authoring flow for consumer repos; dogfood.

**Non-goals as specified:** no library of walkthroughs for other sets (build
the capability plus one exemplar); no voice synthesis unless chosen; no CI
recording (a headless runner records a different thing than the operator's
machine shows).

## 4. What the operator has now added (2026-08-10) — the reason for this consult

The operator is the framework's author, with substantial experience
developing both solo and with AI. Four observations, faithfully summarised:

### (1) `requiresUAT` is not really a requirement

A flag that can be bypassed is not a requirement — and it **always can be
bypassed, and always should be, to prevent impasses**. The better question
is **how much additional confidence** in the product (for human users *and*
for AI engines) the UAT work provides:

- **No UI component** -> marginal confidence is **zero**.
- **Several independent business users, several weeks**, systematically
  exploring and documenting every workflow path, typical and edge cases ->
  **very high**.
- **A single developer** who does nothing more than watch video walkthroughs
  of each UI component and give feedback (via a UAT checklist or otherwise)
  -> **medium**, and *much* better than nothing.

Confidence is **not all-or-none**, and it is **not uniform within a
session**. Worked example from the operator: a single developer watches and
comments on video walkthroughs for **low-risk, low-complexity** components —
where AI is less likely to have "doctored up" (cheated its way into) a
solution — and does **manual walkthroughs** for higher-risk or
higher-complexity components. Confidence for those latter components is
correspondingly greater.

Therefore, instead of gating: **record what kind of UAT was done, and by how
many developers and/or business users, for each component addressed by a
session.** That is useful documentation.

Risk-shaped technical debt accumulates where UAT was thin, and is **paid
down when users actually use the product in production**.

### (2) Pause-and-do-it-yourself, optionally with a synced window

Ideally the video can be **paused while the user performs the same steps
manually in another window**. At each pause the user can either:

- **(a)** continue in **their own window** to the next manual step — i.e.
  perform every step themselves in parallel with the video; or
- **(b)** have the program **launch a new window synced to the video's
  position**, so the user need only perform the step they just watched.

Path (a) throughout gives higher confidence than path (b) — but **(b) is
much better than nothing.**

### (3) Complexity budget

> *"This feature could quickly become something that evolves into dozens of
> sets with thousands of lines of code."* All things equal, keep things as
> simple as possible.

### (4) Electron/VS Code is the platform of the *orchestrator*, not of the products

The likelihood of this framework being used to generate **another
Electron-based** solution is extremely low. The products it will actually be
used to build look like: (a) .NET web applications, (b) Java web
applications, (c) vanilla JavaScript/HTML applications, (d) Python web
applications, (e) various non-web applications — and others that cannot all
be anticipated. So: **how much of Set 113's work would help only orchestrator
maintenance?** If one solution can serve (a) through (d), that beats an
Electron-only one-off — but not at unbounded complexity cost.

*(An orchestrator's unverified reading, offered so you can attack it: (a)-(d)
all render in a browser, so they are arguably one platform, not four; and the
measured `recordVideo` failure was specific to the VS Code workbench window,
so in-process browser recording may be the portable primary path with
OS-level capture as the fallback for Electron and non-web. Say if this is
wrong or if it underrates the difficulty.)*

## 5. What we want from you

Answer these five directly. Be concrete and opinionated; where you
recommend something, say what it costs and what it gives up. Where you think
the operator or the spec is wrong, say so.

**(a)** Is the reframing — from a **requirement gate** to **detailed UAT
data tracking** — reasonable under these circumstances, or is there a better
approach? Note the specific risk: the gate was built because UAT
*evaporated* silently, so any replacement must still make "no UAT happened"
an explicit, attributable, recorded answer rather than an absence.

**(b)** What is the best way to balance **UAT functionality**, **UAT UX**
(so users like UAT and find it easy), and **under-the-hood UAT complexity**?

**(c)** What is the best way to ensure **maximum portability** of the UAT
tooling across .NET / Java / vanilla JS / Python web apps and non-web apps,
given that the repo hosting it is itself a VS Code extension?

**(d)** Given that UAT is unlikely to be revisited in later sessions, and
that production use will ferret out many issues eventually — **should the
technical debt associated with less UAT be documented?** If yes, at what
granularity and where; if no, say why the cost exceeds the benefit.

**(e)** Given all of the above, **what are your recommendations for Set
113** — session structure, what to build first, what to cut, what to defer,
and what you would refuse to build at all?

Prefer a decisive recommendation over an even-handed survey. If you would
restructure or cancel the set, say that outright.
