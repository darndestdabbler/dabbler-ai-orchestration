# Consult prompt, round 3 — Set 113: critical review of the whole consensus

> Requested by the operator 2026-08-10, after two consult rounds produced a
> unanimous recommendation the operator is not convinced by. Addressed to a
> frontier model asked to **review the consensus critically**, not to join
> it. Prior material: [`prompt.md`](prompt.md),
> [`gpt-5-5.md`](gpt-5-5.md), [`gemini-3-1-pro.md`](gemini-3-1-pro.md),
> [`synthesis.md`](synthesis.md), [`prompt-round-2.md`](prompt-round-2.md),
> [`gpt-5-5-round-2.md`](gpt-5-5-round-2.md),
> [`gemini-3-1-pro-round-2.md`](gemini-3-1-pro-round-2.md),
> [`synthesis-round-2.md`](synthesis-round-2.md).

---

You are being brought in as a **critical reviewer of a design consensus**,
not as a third voice to add to it. Two capable models from different
provider families reviewed a not-yet-started session set across two rounds
and converged on a unanimous recommendation. The framework's author — an
experienced developer with substantial AI-assisted development experience —
is **not convinced**, for reasons given in Section 3 below.

Your job: **stress-test the consensus.** Consensus between two models that
saw each other's answers is weak evidence, not strong. Say where they are
right, where they are wrong, and where they agreed for bad reasons.

All the prior material is supplied as context. Read it. Do not restate it.

## 1. The setting, compressed

`dabbler-ai-orchestration` hosts shared AI-orchestration infrastructure: a
Python package (`ai_router` — routing, session state, close gates, metrics;
published to PyPI) and a VS Code extension. Work runs as **session sets**,
each session run by an AI orchestrator with a human operator, each gated at
close.

The framework exists to **build other products** — .NET web, Java web,
vanilla JS/HTML, Python web, and various non-web applications. Its own
platform (a VS Code extension) is explicitly not representative.

**Set 113** was specified to fix a measured failure: UAT *evaporates*. A
session shipped UI with no human walkthrough and nothing noticed. The
proposal is narrated video walkthroughs plus a "repeat it yourself" manual
walkthrough rendered from the same authored step list.

Binding constraints: a **portability rule** (the core must work unmodified
in repos with no UI at all); a **complexity budget** (the operator's own
warning that this "could quickly become dozens of sets with thousands of
lines of code"); and **decision rights** (any reduction in verification is
reserved to the human operator).

## 2. What the two consults unanimously concluded

1. Convert the UAT close gate from a **verification-success** gate to a
   **record-completeness** gate; per-component records of UAT method,
   reviewer type and reviewer count; **"no UAT" is a valid, attested,
   passing value**. *(The operator has accepted this.)*
2. Cut the "synced window" feature (replaying app state to match a video
   timestamp) as a complexity trap. *(The operator has accepted this,
   conditional on very clear written step-by-step instructions letting a
   user reach any point in the video.)*
3. **Author the step list first**; it renders manual steps, captions, a
   training document, chapter metadata and the UAT record. Ship it before
   any recorder, because it delivers value with **no video at all**.
4. **Browser/Playwright recording only**, built against a **dummy web
   app**, not against this repo's VS Code extension.
5. **Videos regenerated on demand, never committed** — so staleness is
   impossible by construction and no media-management subsystem appears.
6. **Refuse OS-level screen capture** (`ffmpeg -f gdigrab`) entirely in this
   set. Consequence, accepted knowingly: this repo's own VS Code extension
   gets no video, and **non-web applications get no video at all** — only
   written walkthroughs.
7. **Refuse to build AI-agent-performed UAT** here. Both said an agent
   driving a UI is not UAT; one called it *"E2E testing with better
   marketing."* One would reserve a `reviewerType: ai-agent` schema slot;
   the other would build nothing.

Notably, on point 6 one model **reversed its round-1 position**: told that
the videos might double as **training material**, it concluded that training
*raises* the bar (durability, polish, captions, versioning) precisely where
OS capture is weakest, and therefore moved from "keep it as a fallback
adapter" to "refuse it." The other said the training argument reinforced its
existing refusal.

## 3. The operator's objections — the reason you were called

The operator read all of the above and pushed back on two points.

### 3.1 The non-web training gap

> *"My concern about not having OS-level videos is the **training gap for
> non-web applications**. It is possible that those applications would
> benefit **significantly** from those videos. Also, the training videos
> would **help with UAT**."*

> *"**Who knows where AI-led development will take us**, especially in a
> world where security patches are now becoming something to fix
> immediately — perhaps **back to COBOL and mainframe or desktop
> applications**."*

Take this seriously rather than dismissing it as speculation. The claim has
three parts: (i) non-web products may need training video *more* than web
products do, not less, because there is no ambient familiarity to fall back
on; (ii) training and UAT reinforce each other rather than competing; and
(iii) a browser-only architecture is a **bet on a platform mix** that
current pressures — immediate security patching, AI-led development
economics, the durability of mainframe and desktop code — may not
vindicate.

The consensus dismissed non-web in roughly one sentence per model. It never
sized the gap, never asked who the non-web audience is, and never
distinguished among the very different things "non-web" covers (native
desktop GUI, terminal/TUI, CLI, mainframe/3270-style green-screen).

### 3.2 AI cheats — so treat E2E *as if* it were UAT

The operator accepts the consensus's classification and then turns it into
an argument *for* the thing they refused:

> *"On (c), **yes it is E2E**. That said, over the past few months that I
> have used AI, I often find that **AI tends to cheat — especially in
> E2E**. So, **TREATING E2E AS THOUGH IT WERE UAT**, by having an
> independent AI agent do the E2E — emulating as much as possible a
> **skeptical/critical user** — might be valuable. Yes, that might be a
> separate session set. Yes, it might not be worth it at all. But it is
> worth careful consideration because **anything that we can do to make UAT
> easier and more likely to succeed (that is, detect and address more
> UI-related issues before UAT), the better**."*

This is a **different question from the one the consults answered.** They
were asked "can an agent perform UAT?" and answered, reasonably, "no,
because UAT means a human judges fit for purpose." The operator's actual
claim is about **collusion**: the agent that writes the code also writes the
E2E test, and therefore has both the means and the motive to make the test
pass without the feature working. On that framing the independent agent is
not a substitute for human judgment at all — it is an **integrity control on
the E2E suite**, aimed at the author/verifier collusion the current
arrangement permits.

Relevant, and known to work in this repo: the framework **already** enforces
provider diversity on verification (a session's verifier must run on a
different effective provider from the orchestrator that did the work), and
**already** runs a "path-aware critique" — a multi-provider review in which
the reviewer **retrieves repo ground truth itself** rather than reviewing a
snippet the biased author pasted. When introduced, it found **12 unique real
defects including two Criticals that a single-shot verifier had missed**,
with no finding quota. That mechanism is measured and exists. It reviews
**code and repo state** and has never been pointed at a **running UI**.

## 4. Three claims from the orchestrator, offered for you to attack

The orchestrator (a third model, from a third provider family) has made
these observations. Say if they are wrong.

1. **"Non-web" is not one category, and one part of it is cheap.**
   Terminal, TUI, CLI and mainframe/green-screen applications can be
   recorded as **terminal session recordings** (asciinema-style: a text
   event stream with timings), which are small, diffable, versionable,
   regenerable, and need no screen-capture binary at all. That is a
   fundamentally different and much cheaper primitive than `ffmpeg` screen
   capture, and **neither consult mentioned it**. If the operator's
   COBOL/mainframe/desktop scenario materialises, a large part of it is
   terminal-shaped, not GUI-shaped.
2. **The real decision may not be "OS capture: yes or no."** It may be
   whether Session 1 defines the recorder as a **pluggable backend behind a
   documented contract**, ships only the browser backend, and thereby makes
   a later OS-capture or terminal-capture backend a small drop-in rather
   than a re-architecture. Cost now: close to zero. The counter-argument is
   real too — a seam designed with only one implementation is usually the
   wrong seam. Mitigating that: the portability rule *already* requires a
   third path (no recorder at all, manual walkthrough only), so the contract
   has two live implementations from day one, not one.
3. **The collusion reframe strengthens §3.2 considerably.** The independent
   agent's value is not that it judges UI well — it is that it did not write
   the code or the test, cannot see the diff, and is therefore not defending
   its own work. That is the *same* mechanism the path-aware critique
   already proved on code, aimed at a new surface.

## 5. What to deliver

Be decisive and specific. Disagree with the consensus, the operator, or the
orchestrator wherever warranted — you were called because unanimity is
suspicious, not because a fourth endorsement is needed.

**(a)** Is the unanimous refusal of OS-level capture **correct**, or is it
an artefact of two models optimising a stated complexity budget while
under-weighting a strategic risk they were not asked to price? Give your own
answer on OS capture, and say what evidence would change it.

**(b)** Size the **non-web training gap** honestly. Who is the audience,
what do they lose with written-only walkthroughs, and does it differ across
native desktop GUI / terminal-TUI / CLI / mainframe? Assess the
terminal-recording claim in §4.1 — is it the cheap win it appears to be, or
is it a distraction?

**(c)** How should a framework **hedge platform uncertainty** without paying
for platforms it may never target? Is the pluggable-backend contract in
§4.2 a genuine hedge or premature abstraction? If premature, what is the
correct cheap hedge — or is "none, and pay later" the right answer?

**(d)** On **AI cheating in E2E**: is the operator's observation
well-founded in your experience of how code-writing agents behave? Does the
**collusion** framing change the verdict the two consults reached? If an
independent skeptical-user agent is worth building, what is the **minimum
credible version**, what does its output feed (a gate? the UAT record? a
findings list?), and what confidence claim may it honestly make? If it is
not worth building, say so plainly and say what should be done about E2E
self-collusion instead — because that problem does not disappear if the
agent is refused.

**(e)** Given everything: **your recommendation for Set 113.** Session
structure, what ships first, what is cut, what is deferred to a named later
set, and what you would refuse outright. If you would restructure or cancel
the set, say so.

Where you change a conclusion, name which one and why. Where the consensus
is right, say so briefly and move on — the operator needs your disagreements
more than your agreements.
