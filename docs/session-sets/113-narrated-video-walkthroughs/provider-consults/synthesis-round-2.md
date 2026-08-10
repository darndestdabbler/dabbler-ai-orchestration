# Consult synthesis, round 2 — Set 113 (pre-Session-1)

> Second round, dispatched 2026-08-10 after the operator ruled on round 1
> and raised two new questions. Prompt:
> [`prompt-round-2.md`](prompt-round-2.md). Answers:
> [`gpt-5-5-round-2.md`](gpt-5-5-round-2.md),
> [`gemini-3-1-pro-round-2.md`](gemini-3-1-pro-round-2.md). Each model
> carried its own round-1 answer plus the round-1 cross-read as context.
> Provider families held apart as before.
>
> **Status: input, not decision.**

---

## Headline: the round-1 split closed, and it closed against OS capture

Round 1's only real disagreement was whether OS-level `ffmpeg` capture
should exist. **GPT-5.5 explicitly reversed itself:**

> *"I am changing my round-1 position on OS-level capture. I previously
> allowed it as a fallback adapter. With training material in scope, I would
> **not** build OS-level capture in Set 113."*

Gemini says the training-video argument *reinforces* its refusal. So the
information the operator supplied to **strengthen** the case for OS capture
is the same information both consults used to **kill** it — because training
material raises the bar (durability, polish, captions, versioning,
discoverability) exactly where OS capture is weakest.

**It is now unanimous on all three revisited calls:**

| Call | Round 1 | Round 2 |
| :--- | :--- | :--- |
| OS-level ffmpeg capture | split | **refuse for Set 113** (both) |
| Exemplar platform | split | **a dummy web app**, not this repo's extension (both) |
| Session structure | similar | **step-list schema + manual renderer → browser recorder → viewer/gate** (both) |

**The cost of accepting this, stated plainly:** this repo's own product is a
VS Code extension, so it gets **no video** — the set cannot dogfood a
narrated video of the Work Explorer, and non-web category (e) products get
no video either. Both consults accept that trade knowingly and say the set
is not for the orchestrator.

**One thing neither consult noticed, offered as a counterweight:** the
operator's training-video interest is mostly about the products the
framework *builds*, and (a)–(d) are all web. So "web-only video" already
covers most of the training-material demand. The uncovered gap is narrower
than it sounds: category (e), and this repo itself.

---

## New question 1 — an independent AI agent performing the UAT walkthrough

**Both refuse to call it UAT.** GPT: *"AI-assisted exploratory QA / UX
critique"*, not UAT, because UAT's defining property is a human judging fit
for purpose. Gemini is blunter: *"It is E2E testing with better marketing,
bolstered by LLM heuristics. An agent does not experience friction or
confusion; it merely parses state."*

**Both refuse to build it in Set 113** on the complexity budget. Gemini:
*"Nothing. Building a reliable, UI-driving, adversarial agent is an entirely
different product."* GPT would leave only a **schema slot** —
`reviewerType: ai-agent` with defined confidence semantics — so a later set
can populate it without a migration.

**They disagree on whether it stacks, and this is the substantive split:**

- **GPT: it stacks.** It finds *different* defects from human UAT —
  contradictory labels, dead-end flows, missing empty/error states, visual
  regressions, semantically broken UI, "works but a new user wouldn't know
  what to do next", and mismatches between acceptance criteria and the
  running product. Confidence: **low to low-medium**; more than nothing,
  less than one real user commenting.
- **Gemini: it does not stack.** *"It is a subset of E2E, not a replacement
  for human judgment."*

GPT's list of what it is *structurally blind to* is the more useful half,
and both would endorse it: whether real users care, whether domain
terminology is right in context, whether the workflow fits real operational
habits, whether the product builds trust, whether the training burden is
acceptable, whether edge cases matter in practice.

**Platform dependence: sharp, and it runs the same way as the recorder
question.** Web is the strong case (DOM, accessibility tree, console and
network errors, focus order, real navigation — semantic structure, not just
pixels). VS Code/Electron is degraded. Native desktop is degraded further
(screen/image/accessibility-driven). CLI is useful but not a *visual*
walkthrough. Gemini: *"degrades sharply to near-zero outside the browser."*

### They contradict each other on how to beat sycophancy — worth resolving

Both agree on: **different provider family**, **blind to the code, diff and
implementer rationale** (GPT: it stops the agent behaving like *"a defense
attorney"*), **given only acceptance criteria plus the running product**,
and **adversarial framing**.

They split on **quotas**:

- **Gemini:** *"force a quota ('You must find at least 3 UX frictions').
  Anything less is theatre and will result in the agent congratulating the
  orchestrator."*
- **GPT:** a fixed number of findings is *"mostly theatre. It creates fake
  nitpicks."* Prefer *"up to N high-confidence findings"* plus
  **scoring findings for specificity and reproducibility** — *"this is the
  useful gate, not sentiment."*

**This repo has evidence bearing on it.** The existing path-aware critique
is already blind-to-author, multi-provider and ground-truth-retrieving, and
it produced 12 unique real defects including two Criticals that a
single-shot verifier missed — without a quota. That is weak evidence for
GPT's position and for reusing the mechanism rather than inventing one.

---

## New question 2 — dual-purpose videos (UAT evidence *and* training)

**Both reject "one recording, two purposes" as a trap**, in near-identical
terms. UAT evidence is point-in-time, disposable, low-polish, defect-
oriented and session-scoped. Training material is durable, high-polish,
generic, discoverable, versioned — and *rots the moment the UI changes*.
Gemini: conflating them yields *"terrible training videos (full of
UAT-specific edge-case testing) and bloated UAT processes (because operators
feel pressured to make the video 'training quality')."* GPT: *"a raw UAT
recording is usually too rough for training; a polished training video is
usually too curated to be honest UAT evidence."*

**But both then converge on the same resolution — and it is genuinely
elegant:**

> **The shared asset is the authored step list, not the video file.**
> Commit the step list. **Regenerate videos on demand; never archive them.**

Because the video is generated *from* the step list, staleness is impossible
by construction: the product changes → the step list is updated → the video
is regenerated. No committed binaries, no media-management subsystem, no
version rot, no discoverability problem. The step list renders manual UAT
steps, captions/narration, a **training document**, chapter metadata, and
the UAT accounting references — five outputs from one source, which is the
set's original "one source, two outputs" constraint extended rather than
abandoned.

### It also satisfies the operator's §1.2 condition, for free

The operator's condition on cutting the synced window was *"very clear,
step-by-step instructions to get to any point in the video."* Both answer it
with the same artifact. GPT's concrete shape: a **versioned walkthrough
script** carrying scenario title and audience, prerequisites/setup, numbered
steps, **expected result per step**, narration text, component tags,
**chapter markers**, **timestamps once rendered to video**, and explicit
*"jump to this point"* instructions — each step carrying enough written
instruction to reach that point manually from a known baseline.

GPT's rule for it: **the written walkthrough must be usable without the
video; the video is an enhancement.** That is the strongest single sentence
across both rounds, because it makes the portable core (the script) the
thing that always works and the recorder the thing that is allowed to be
absent — which is precisely what the portability rule demands.

### One tension to watch

Gemini says the video *"can be regenerated automatically when the UI
changes."* **Automatically** collides with the spec's existing non-goal —
*no CI recording*, because a headless runner records something different
from what the operator's machine shows. Regeneration **on demand** is
compatible; regeneration **in CI** is not. Keep the former, keep refusing
the latter.

---

## Where the two rounds leave the set

Unanimous across both models and both rounds, with the operator having
already ruled on the first two:

1. Record-completeness gate; "no UAT" is a valid, attested, passing value. *(operator-ruled)*
2. Synced window cut, replaced by a written script that stands alone. *(operator-ruled)*
3. **Step-list schema + manual/training renderer first** — it ships value with no video at all.
4. **Browser/Playwright recording second**, web-first, against a dummy web app.
5. **Videos regenerated on demand, never committed.**
6. **No OS-level ffmpeg capture in this set** — so no video for this repo's extension or for non-web targets.
7. **No AI-agent UAT built here** — at most a `reviewerType: ai-agent` slot in the record schema.
8. Viewer UX and gate wiring last.

Still open, and operator-held:

- **D1 (reopened and now unanimous):** accept the refusal of OS capture,
  knowing this repo's own product and category (e) get no video?
- **D2:** build the exemplar against a dummy web app, accepting that Set
  113's own UAT becomes a manual walk rather than the narrated video its
  dogfood step assumes?
- **D3 (new):** reserve `reviewerType: ai-agent` in the UAT record schema
  now, or leave the schema clean and add it when a later set earns it?
