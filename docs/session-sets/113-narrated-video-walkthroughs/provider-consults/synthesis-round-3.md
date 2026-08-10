# Consult synthesis, round 3 — Set 113 (pre-Session-1)

> Third round, 2026-08-10. The operator called for a **critical review of
> the consensus** after two rounds produced unanimity they were not
> convinced by. Prompt: [`prompt-round-3.md`](prompt-round-3.md). Answer:
> [`gpt-5-6-sol-round-3.md`](gpt-5-6-sol-round-3.md), carrying the complete
> two-round prior record as context.
>
> **Status: input, not decision.**

## Dispatch note — a real finding about the router, not about Set 113

`route(prefer_model="gpt-5-6-sol")` **silently resolved to `gpt-5.5`.** The
seat catalog lockfile `ai_router/copilot-catalog.lock` was probed
**2026-08-05** and contains **no GPT-5.6 entries at all**, while the CLI on
this seat serves `gpt-5.6-sol` today (verified directly). Because
`transports.copilot-cli` is late-bound against the lock and
`require_pinned_version: true`, the alias fell back to the newest OpenAI
model the lock knows about.

**This matters beyond this consult.** `gpt-5-6-sol` is the registry's
**pinned `session-verification` verifier** (operator, 2026-07-10). On this
seat that pin does not bind — verification rounds have been running on
`gpt-5.5`, silently. Worth a look independently of Set 113.

The round-3 answer was therefore obtained by invoking the CLI directly with
`--model gpt-5.6-sol`, bypassing the stale lock.

---

## Headline: the consensus was too categorical, and for a reason nobody named

Sol's own summary: the consensus is right about the record-completeness
gate, the standalone step source, browser-first implementation, and cutting
state injection — and **too categorical about OS capture**, plus **too
casual about two claims that were treated as settled.**

### It killed the round-2 centrepiece

Round 2's elegant resolution was *"regenerate videos on demand, never
archive them — staleness is impossible by construction."* Sol:

> **"'Generated on demand' does not make staleness impossible.** The step
> list can be stale, the automation can stop matching the product, and a
> generated video is not training material available 'at any time' unless it
> is published somewhere learners can actually reach it."

So the round-2 answer to the operator's durability concern **does not
actually answer it**. Generated-on-demand video is a fine *UAT aid* and is
**not** durable training material. The durable training deliverable, until a
real audience justifies a publication pipeline, is the **standalone rendered
document** — not the video.

### It corrected the operator too, on the more important half

> *"The operator should not infer that adding `ffmpeg` solves non-web
> training. **Capturing pixels is the easy part; reliably staging and
> driving an arbitrary desktop application is usually the expensive
> part.**"*

This is the point all three prior parties missed — including the operator
and this orchestrator. The whole argument was conducted about *capture*.
The real cost is the **driver**: for the browser, Playwright already drives;
for an arbitrary .NET/Java/native desktop app, nothing does. ffmpeg records
whatever is on screen; something still has to *make the app do things*.

### And it found the browser path is less complete than assumed

Browser-context recording *"generally omits browser chrome, native file
pickers, permission prompts, external applications, and some authentication
transitions."* So even a web workflow can cross the browser/OS boundary —
"web app" does not reliably mean "browser video is sufficient."

---

## (a) OS capture — refusal overturned, replaced by a bounded, measured pilot

> *"The unanimous refusal is not justified by the evidence presented. It is
> an artifact of treating 'OS capture' as synonymous with 'a cross-platform
> media-management product.' Those are different decisions."*

Training's higher bar does not uniquely indict OS capture: a Playwright
recording is *also* raw pixels, *also* needs captions and chapter alignment,
*also* goes stale, *also* needs publication. OS capture's extra hazards —
wrong-window capture, notifications or secrets in frame, unstable cropping,
display scaling, native dialogs, platform-specific install — are *"reasons
to bound and measure it, not reasons to declare it valueless without a
trial."*

**The recommendation, precisely:**

- Do **not** make OS capture mandatory, bundle `ffmpeg`, or put it in the portable core.
- Do **not** attempt a generic cross-platform desktop recorder in Set 113.
- **Do run one bounded Windows OS-capture pilot against the Work Explorer** — a real product whose UI driver already works, with the failed Playwright/Electron run as a concrete comparison.
- Hard one-session budget. Ship as an optional Windows capability **only if** it passes explicit criteria; otherwise defer **with measurements**, not speculation.

**Pass criteria named:** repeatedly select the intended window; exclude
unrelated desktop pixels; preserve usable resolution under the operator's
normal display scaling; align step events with captions; fail clearly when
the dependency is absent; clean up deterministically. Bar: **ten
consecutive clean captures from a fresh fixture, no wrong-window or privacy
leakage.** No audio.

On the operator's COBOL/mainframe argument: *"Hypothetical future COBOL work
alone is not enough to fund a general desktop subsystem, but it is enough to
**avoid designing non-web artifacts out of the model**."*

## (b) The non-web gap, sized

*"Material but highly uneven."* The consensus was wrong to collapse it to an
edge case; the operator would be wrong to treat it as one screen-capture
problem.

| Product shape | Video gap |
| :--- | :--- |
| Native desktop GUI | **High** for unfamiliar or multi-window workflows — spatial layout, window transitions, focus, modal sequencing, OS prompts, timing |
| Terminal / TUI | **Medium–high** for TUIs — mode changes, prompt timing, redraws, keyboard navigation, recovery |
| CLI | **Low–medium** — executable examples and searchable transcripts often beat video |
| Mainframe / 3270 | **Potentially high**, but strongly emulator- and protocol-dependent |

Sol confirms the operator's instinct that **non-web users may benefit *more*
from demonstration**, because there is less ambient familiarity than with
common web controls.

And it separates training from UAT correctly: they reinforce each other **at
the scenario and authoring level**, not at the final recording level. *"A
training run should be concise and curated. A UAT run should preserve
awkwardness, errors, and evidence from the exact build under review.
Reusing the scenario, step IDs, captions, fixture and driver is efficient;
declaring every UAT recording a durable training asset is not."*

**On the orchestrator's terminal-recording claim: valuable but overstated.**
Genuinely cheap for ANSI/PTY workflows — but *not* inherently diffable
(timing and ANSI control sequences are noise without a normalized
transcript); secret redaction, dimensions, colour/Unicode and
alternate-screen TUIs all still need policy; and **a 3270 emulator is not
necessarily a normal PTY** — a GUI emulator or proprietary transport puts
mainframe straight back into the desktop-capture category. So terminal
recording is *"a cheap, promising backend for a defined subset, not a
solution to 'non-web'"* — a later set, triggered by a real target.

## (c) Hedging — the orchestrator's seam claim rejected

> *"Manual-only is not a second recorder implementation. It never starts
> capture, chooses a target, handles timing, reports codec or dimensions, or
> cleans up a partial artifact."*

A browser recorder plus a no-op validates almost none of the decisions a
real second backend would challenge. The published-plugin-contract idea is
**premature abstraction**.

**The correct cheap hedge is to stabilize the data model, not a backend
API:** stable scenario and step IDs; model prerequisites, a known baseline,
reset/recovery instructions, action and expected observable result; keep
Playwright selectors in **platform-specific blocks** out of the portable
step semantics; have the driver emit a **timestamped step-event stream**
(`started` / `completed` / `failed`) keyed by stable step IDs; emit a small
**run manifest that can reference zero or more artifacts** — browser video,
OS video, terminal cast, captions, screenshots, transcript — *"without
assuming every artifact is an MP4."* Keep the first recorder interface
**internal and explicitly unstable**; extract a contract only after a second
real implementation reveals the genuine commonality.

Also: *"'Reach any point' should mean replaying a documented prefix from a
known baseline or checkpoint, not pretending every stateful step supports
random access."* That is the honest reading of the operator's §1.2
condition.

## (d) AI cheating in E2E — the operator strongly validated, and sharpened

> *"**Common-mode self-verification failure** is more precise than
> collusion… **No intent to deceive is required.** Shared context and shared
> blind spots are enough."*

The concrete failure list, which reads as a description of things this repo
has actually seen: asserting the implementation's own representation rather
than user-visible behaviour; mocking around the integration that needed
testing; checking an element exists rather than that the workflow succeeds;
**editing the test or fixture until the current output passes**; omitting
states the implementation did not handle; treating an unobserved manual path
as verified.

> **"The collusion reframe materially changes the verdict."**

But it justifies *"a measured pilot, not a confidence claim in advance"* —
the path-aware critique's 12-defect result does not automatically transfer
to a stateful UI with partial observability, flakiness and a far larger
action space.

**Minimum credible version** (separate set, web-only): isolated resettable
fixture with a strict action/data-safety boundary; reviewer gets
**acceptance criteria approved before implementation** and a persona, but
**not** the diff, tests, rationale or the authored Playwright path;
different effective provider; **it must choose its own interaction path** —
replaying the author's test preserves the common-mode failure; DOM,
accessibility tree, screenshots, focus order, console and network access;
**evidence required for every finding**; **no quota** — an explicit
no-finding result with paths attempted and limitations; and **calibration
with seeded defects or negative controls** — *"if it cannot detect
representative broken states, a clean run is not evidence."*

Output is a **separate UI-critique findings report**, advisory, linked from
the UAT record as ancillary evidence — it must **never** increase human
reviewer counts. Sol would **not** reserve `reviewerType: ai-agent` now,
*"because that bakes in the category error the operator has already
avoided."* (This contradicts GPT-5.5's round-2 suggestion.)

Honest confidence claim, verbatim: *"An independent black-box agent explored
these recorded paths and found no undispositioned high-confidence defects,
subject to the stated coverage and calibration limits."* Low-to-moderate on
exercised-path integrity, obvious usability failures, accessibility
semantics and common-mode E2E omissions; **essentially none** on whether the
product is useful, trustworthy or accepted.

**Cheap measures available before any such set exists:** freeze
operator-approved acceptance criteria **before** implementation; have the
verifier add or challenge black-box assertions; inspect whether tests
exercise user-visible outcomes; use negative/mutation checks where
practical; and **prevent an implementation agent from silently weakening
tests to obtain a pass.**

## (e) Recommended structure — four bounded sessions

1. **Truthful UAT accounting.** The record-completeness gate first. Factual
   fields only — component, method, human reviewer type and count, evidence
   links, findings, attested `none`. **No self-assessed confidence scores,
   no parallel debt ledger.** Critically: the gate must account for the
   **component inventory**, not merely validate whatever records exist —
   *"otherwise an omitted component is the new form of evaporation."*
2. **Portable scenario source and standalone rendering.** Smallest
   platform-neutral scenario model; stable step IDs; action and expected
   result per step; reset/recovery/checkpoint instructions; manual UAT
   document, training document, captions and chapter metadata from one
   source. The written artifact stands alone.
3. **Browser recording proof.** Dummy web app; Playwright recording with
   step-event timing, captions, chapter mapping, failure cleanup, run
   manifest; artifacts generated into ignored output. A **static generated
   index** linking video and steps — *"do not build a custom viewer
   application unless use demonstrates the static artifact is inadequate."*
4. **Bounded Windows OS-capture dogfood.** The strict pilot from (a) against
   the Work Explorer. Pass → ship as an optional Windows capability behind
   the internal interface. Fail → keep the measurements, keep manual-only
   degradation, defer. **No** expansion into cross-platform capture, native
   desktop automation, dependency bundling, audio, or publishing.

**Cut from Set 113:** state injection, voice synthesis, CI recording,
committed video binaries, a permanent video library, a custom rich viewer,
terminal recording, agent-driven UI exploration.

**Deferred to named sets:** *Independent Black-Box UI Critique*; *Terminal
Walkthroughs and Cast Artifacts*; *Training Publication and Retention*;
*Non-Web Walkthrough Backends*.

**Refused outright:** calling AI exploration UAT; counting it as a human
reviewer; forced finding quotas; a universal cross-platform desktop
abstraction here; the claim that on-demand generation makes content
inherently current; and **any gate that equates "agent found nothing" or
"video was watched" with user acceptance.**

---

## Net change across the three rounds

| Question | R1 | R2 | R3 (critical review) |
| :--- | :--- | :--- | :--- |
| Gate shape | record-completeness | same | same **+ component-inventory check** |
| Synced window | cut | cut | cut; "reach any point" = replay a prefix from a checkpoint |
| Step list first | yes | yes | yes, and it is the **durable training deliverable** |
| Videos committed? | no | regenerate on demand | regenerate, **but that is not durable training** |
| OS capture | **split** | refuse (unanimous) | **refusal overturned — bounded measured pilot** |
| Exemplar | split | dummy web app | dummy web app for browser proof, **Work Explorer for the OS pilot** |
| AI-agent UAT | n/a | refuse; maybe reserve a schema slot | refuse here, **worthwhile as a named follow-on set**; do **not** reserve the slot |
| Session count | 3 | 3 | **4** |
