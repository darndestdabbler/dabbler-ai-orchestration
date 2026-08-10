# Pre-set consult prompt, round 2 — Set 113

> Second round, dispatched 2026-08-10 after the operator read both round-1
> answers. Round 1 is [`prompt.md`](prompt.md) with answers in
> [`gpt-5-5.md`](gpt-5-5.md) and [`gemini-3-1-pro.md`](gemini-3-1-pro.md);
> the cross-read is [`synthesis.md`](synthesis.md). Two genuinely new
> questions, plus one reopened.

---

You reviewed a not-yet-started session set ("Set 113 — narrated video
walkthroughs") for a shared AI-orchestration framework. Another model from a
different provider reviewed it independently. **You are now being asked to
go further on two questions neither round-1 answer addressed, and to revisit
one call in light of new information.** Read Section 1 for what has been
settled so you do not re-litigate it.

## 0. Recap of the framework (you may have this from round 1)

`dabbler-ai-orchestration` hosts shared infrastructure — a Python package
(`ai_router`: multi-provider routing, session state, close gates, metrics,
published to PyPI) and a VS Code extension — used by several "AI-led
workflow" repos. Work runs as **session sets**: a spec declares 2-6
sessions, each run by an AI orchestrator working with a human operator, each
gated at close.

The framework's purpose is to **build other products**: .NET web apps, Java
web apps, vanilla JS/HTML apps, Python web apps, and various non-web apps.
The VS Code extension is the orchestrator's own platform and is explicitly
*not* representative of what gets built.

The problem being solved: **UAT evaporates.** A session shipped UI with no
human walkthrough and nothing noticed. A close gate was added; the operator
(the framework's author) argues a gate that can always be bypassed is not
really a requirement, and that what matters is *how much additional
confidence* the UAT work bought — which varies by reviewer type, reviewer
count, and per component.

Binding constraints: a **portability rule** (the core must work unmodified
in repos with no UI at all), a **complexity budget** (the operator's warning
that this "could quickly become dozens of sets with thousands of lines of
code"), and **decision rights** (any reduction in verification is reserved
to the human operator).

## 1. Settled by the operator — do not re-litigate

Both round-1 consults converged, and the operator has now ruled:

1. **The record-completeness gate is accepted.** The gate stops demanding a
   walk and starts demanding an *accounting*: per-component records of what
   UAT was done, by which kind of reviewer, and how many. "No UAT" is a
   valid, attested, **passing** value. Nothing blocks; nothing evaporates.
2. **The synced-window feature (replaying app state to match a video
   timestamp) is cut** — with one **condition the operator attached**:

   > cutting the synced window is fine, **as long as very clear,
   > step-by-step instructions are provided for the user to get to any point
   > in the video.**

   Treat that condition as a requirement on whatever replaces it. The user
   must be able to reach an arbitrary point in the scenario **by following
   written steps**, without any state-injection machinery.
3. Manual-walkthrough rendering comes before the recorder; the step list is
   authored once and renders both captions and manual steps; browser-first
   is the portable path.

## 2. NEW QUESTION 1 — Can an independent, non-sycophantic AI agent perform the UAT walkthrough itself?

The operator's question, verbatim:

> *"Would there be a way for a path-aware AI agent other than the
> orchestrating agent — that is, an **independent** AI agent — to
> critically (with a **non-sycophantic** mindset) do a UAT walkthrough
> themselves? Would it depend upon the type of solution platform?"*

Context you need to answer this well:

- The framework **already has a related mechanism** called **path-aware
  critique** (spec field `pathAwareCritique: none | advisory | required`).
  It is an end-of-set, **multi-provider** review in which the reviewing
  agent **retrieves repo ground truth itself** rather than reviewing a
  snippet the biased author pasted. Measured result when it was introduced:
  12 unique real defects including two Criticals that a single-shot verifier
  had missed. A single provider was demonstrably insufficient, so the gate
  requires **two or more distinct providers**.
- The framework also already enforces **provider diversity on
  verification**: a session's verification round must run on a different
  effective provider from the orchestrator that did the work.
- So the machinery for "independent, cross-provider, ground-truth-retrieving
  review" exists — but it reviews **code and repo state**, never a **running
  UI**.

Answer specifically:

- **Is agent-performed UAT a real category, or is it just E2E testing with
  better marketing?** UAT's defining property is that a *human judges fit
  for purpose*. If an agent drives the UI and renders judgment, what exactly
  is it adding beyond the automated E2E suite that already exists? Be
  precise — if the honest answer is "very little," say so.
- **If it is real, what is it good at and what is it structurally blind
  to?** Where would an independent agent catch things automated assertions
  miss (visual regressions, nonsense labels, dead ends, confusing flows,
  states no assertion thought to check), and where can it not substitute for
  a human at all?
- **The sycophancy problem is the crux.** An agent asked "does this look
  right?" about work another agent produced will tend to say yes. What
  concretely defeats that? Consider: different provider family; no access to
  the implementer's rationale or diff; being given the *acceptance criteria*
  and the *running product* but not the code; adversarial framing ("find
  what a new user would get stuck on"); requiring a fixed number of concrete
  findings; scoring findings for specificity. Say which of these actually
  work and which are theatre.
- **Does it depend on the solution platform?** Compare: web apps (agent can
  drive a browser and read the DOM, so it can inspect semantic structure,
  not just pixels), VS Code extensions / Electron, and non-web desktop or
  CLI apps. Where does the capability degrade, and how sharply?
- **What is the honest confidence claim?** In the operator's model, marginal
  confidence runs from zero (no UI) to medium (one developer watches videos
  and comments) to very high (several independent business users over
  weeks). **Where does an independent agent's walkthrough sit on that
  scale, and does it stack with human UAT or merely overlap with it?** Say
  plainly if you think it belongs at the low end.
- **What would you actually build**, if anything, and would you build it in
  Set 113 or refuse it here on the complexity budget?

## 3. NEW QUESTION 2 — The videos are dual-purpose: UAT evidence *and* training material

The operator's second point, verbatim:

> *"We should keep in mind that these video recordings could double as
> **training videos** — so they might have a dual purpose. That said, it
> might be better to have the **OS-level recordings** and to design them so
> that they can be **replayed as training videos at any time**."*

This is new information that **reopens a round-1 call.** In round 1 the two
consults split on OS-level screen capture (`ffmpeg -f gdigrab` on Windows):
one kept it as a fallback adapter for Electron and non-web targets, the
other refused it outright as brittle and budget-ruining, accepting that VS
Code extensions and non-web apps would simply get no video.

That split was argued **purely on UAT value**. If the artifact is *also*
end-user training material, the calculus changes: training video is a
durable deliverable with its own audience, it must survive past the session
that produced it, and "this platform gets no video" now means "this product
ships with no training material."

Answer specifically:

- **Does the dual purpose change your round-1 recommendation on OS-level
  capture?** Say explicitly whether you are changing your position, and why
  or why not.
- **Are UAT evidence and training material actually the same artifact?**
  They have different audiences (a reviewer hunting for defects vs. a user
  learning the product), different lifetimes (one session vs. indefinite),
  different tolerance for staleness, and different bars for polish. Is
  "one recording, two purposes" a genuine efficiency or a trap where the
  artifact serves neither audience well? Give your honest read.
- **If a recording must be replayable as training material at any time,
  what does that impose?** Consider durability (a UAT artifact can be
  regenerated and thrown away; training material cannot silently rot),
  storage (committed binaries are forever; the round-1 spec flagged this),
  versioning (the product changes and the video lies), discoverability, and
  captions/accessibility. Which of these are cheap and which are the
  beginning of a media-management subsystem the complexity budget forbids?
- **Is there a design that gets the dual purpose nearly free?** For example:
  the same authored step list renders captions, manual steps, *and* a
  training document; recordings are regenerated on demand from the step
  list rather than archived, so staleness is impossible by construction.
  Evaluate that, or propose better.
- **Reconcile it with the operator's condition in §1.2** — "very clear,
  step-by-step instructions to get to any point in the video." That
  requirement serves training at least as well as it serves UAT. What is the
  concrete artifact that satisfies both? (Chapter markers? Numbered steps
  with timestamps? A written script that stands alone without the video?)

## 4. Revisit — one line each

Given your answers above, state in one line each whether you now change
your round-1 position on:

- OS-level capture: fallback adapter, or refuse?
- Which platform the exemplar is built against (this repo's VS Code
  extension, or a dummy web app)?
- Session structure for Set 113.

---

Be decisive and specific. Where you are changing your mind, say so
explicitly. Where the operator is wrong, say so. Where a proposal is a
complexity trap, name it as one.
