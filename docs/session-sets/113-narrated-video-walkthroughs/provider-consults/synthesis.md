# Consult synthesis — Set 113 (pre-Session-1)

> Two independent design consults, dispatched 2026-08-10 through `route()`
> on the `copilot-cli` transport, `task_type: architecture`, from the shared
> prompt in [`prompt.md`](prompt.md). Neither model saw the other's answer.
>
> - [`gpt-5-5.md`](gpt-5-5.md) — OpenAI `gpt-5.5` (Anthropic + Google excluded)
> - [`gemini-3-1-pro.md`](gemini-3-1-pro.md) — Google `gemini-3.1-pro-preview` (Anthropic + OpenAI excluded)
>
> Anthropic was excluded from both so neither answer came from the same
> provider family as the orchestrator that wrote the prompt.
>
> **Status: input, not decision.** Nothing here amends the spec. The
> reframing of `requiresUAT` is a verification-reduction question and stays
> operator-held.

---

## Where they agree (independently, and against the spec as written)

**1. Keep a gate — change what it gates on.** Both refused the operator's
framing at its strongest point. Neither would remove the gate; both would
convert it from a **verification-success gate** ("you must have walked
this") into a **record-completeness gate** ("you must have accounted for
this"). GPT's phrasing: *"The gate should block only when the UAT record is
missing or internally inconsistent."* Gemini's: *"If UAT is not a required
gate, it will silently evaporate again."*

Crucially, **both make "no UAT" a passing value.** GPT proposes
`covered | thin | none | waived`; Gemini proposes `method: "none"` as a
valid payload. That is the reconciliation of the operator's impasse
objection with Set 111's evaporation evidence: the flag stops being a
requirement, and the *record* becomes the requirement. Nothing blocks; every
outcome is attributable.

**2. Component-level records with method and actor count.** Both land
exactly on the operator's proposal — per component, carrying method, actor
type (developer vs. business user), and count. GPT adds risk, confidence,
residual concerns and a **paydown trigger**; Gemini keeps it minimal
(`component`, `method`, `users`).

**3. Document the debt — machine-readable, component-granular, no parallel
tracker.** Both answered (d) yes with the same guardrail. GPT: *"Do not
create a parallel issue tracker."* Gemini: *"Do not create a separate 'Tech
Debt' markdown file that requires human maintenance"* — the debt should be
**intrinsic** to the UAT record, and queryable later, e.g. *"you are
modifying the Auth component; it shipped in Session X with zero UAT."*

**4. Browser-first, and the `recordVideo` finding is narrower than the spec
reads it.** Both independently confirmed the orchestrator's reading in the
operator notes. GPT: *"The VS Code/Electron `recordVideo` failure should not
drive the whole architecture. It is a platform-specific failure, not
evidence that all in-process recording is bad."* Gemini: standardize on
Playwright `recordVideo` for web, which is *"the 95% use case."*

**5. Do not put VS Code at the centre.** GPT: *"Do not make the VS Code
workbench the center of the design. That would overfit Set 113 to
orchestrator maintenance."* Gemini goes further — build and test against a
dummy web app, not this extension.

**6. Reorder the sessions: manual rendering first, recording last.** Both
restructured the set the same way. The step format and the manual
walkthrough deliver value **with no video at all**; the recorder is the
replaceable, platform-specific part. GPT: *"Render manual walkthroughs
first. This gives immediate value even with no video."*

**7. Kill the synced window (path b).** Both. GPT defers it: *"attractive
UX, but likely high complexity and fragile across app types."* Gemini
refuses it outright: *"a fatal complexity trap — you cannot generically
inject state into arbitrary .NET/Java/Python web apps or desktop apps based
on a video timestamp."* Both endorse path (a) instead, which is what the
operator ranked higher anyway.

---

## Where they disagree — the two calls the operator actually has to make

### D1. OS-level ffmpeg capture: fallback adapter, or refuse outright?

This is the sharpest split, and it **is Session 1's capture-dependency
decision**.

| | Position |
| :--- | :--- |
| **GPT-5.5** | Keep it as a third adapter. Browser adapter first, **OS capture fallback for Electron and non-web**, manual-only always available. |
| **Gemini 3.1 Pro** | **Refuse it.** *"Incredibly brittle, platform-specific, and ruins the complexity budget."* For VS Code extensions and non-web desktop apps, **do not record video at all** — degrade to the manual walkthrough. |

The consequence is concrete and uncomfortable: under Gemini's answer, **this
repo's own product gets no video**, because this repo's product is a VS Code
extension. The framework would ship a video capability its own maintainers
cannot use on themselves — and the set could not dogfood a narrated video
of the Work Explorer. Whether that is acceptable is a judgment about who
this set is for. Both consults say plainly: mostly not for the orchestrator.

Note also that non-web category (e) — desktop and CLI products — is
served *only* by the OS-level path. Refusing it is refusing category (e).

### D2. What to build the exemplar against

GPT keeps this repo's extension as the exemplar. Gemini says build against a
**dummy web app** and treat this repo as the degradation case. That decides
whether Set 113's own UAT is a narrated video (as the spec's dogfood step
assumes) or a manual walk.

---

## Two cautions on the consults themselves

- **Gemini puts the UAT record in `session-state.json`.** That conflicts
  with this repo's writer contract — `session-state.json` has blessed
  writers and a `writer-bypass` check, and `disposition.uat` is the existing,
  already-gated home for exactly this data. GPT's placement (the disposition
  record) matches the repo. Take Gemini's *queryability* point, not its
  file choice.
- **"Playwright `recordVideo` is reliable for web" is asserted, not measured
  here.** It is the standard, well-trodden path for browser contexts, and
  the failure this repo measured was against an Electron workbench window —
  but this repo has measured only the failing case. If the set pivots to
  browser-first, the *cheap* first act is to reproduce a browser recording
  once, the same way Set 111 S4 measured the failure with a control.

---

## What this implies for the spec, if the operator accepts it

Not applied. Listed so the decision is concrete:

1. **Session order inverts.** Current S2 (one source, two outputs) becomes
   the first session and ships the manual walkthrough with no video.
2. **Session 1's "capture dependency" decision becomes an adapter-boundary
   decision**, and ffmpeg's fate is D1 above rather than a
   bundled/prerequisite/optional question.
3. **Session 3's brief changes question.** Not *"does watching satisfy
   `requiresUAT`?"* but *"what shape must the UAT record take, and what does
   the gate check?"* — with `none` as a passing, attested value.
4. **Path (b), the synced window, leaves the set.** Both consults would cut
   it; the operator already ranked it below path (a).
5. **This set's own config block** (`requiresUAT: true`, `requiresE2E: true`)
   may no longer describe what it is doing, especially under D2.
