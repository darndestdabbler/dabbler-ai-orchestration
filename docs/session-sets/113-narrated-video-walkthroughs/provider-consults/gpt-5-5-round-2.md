# Design consult, round 2 — gpt-5.5 (gpt-5.5)

> Requested pre-Session-1 on 2026-08-10. Prompt: `prompt-round-2.md`.
> Requested alias: `gpt-5-5`. Resolved: `gpt-5.5`. Carried its own round-1 answer plus the cross-read as context. Raw response follows verbatim.

---

**Agent-performed UAT is real only as “independent AI exploratory walkthrough,” not true UAT.** It is not a substitute for human fit-for-purpose judgment. Its honest value is between E2E tests and human UAT: it can catch unasserted UX defects, but it cannot validate business usefulness, trust, taste, or real user adoption.

## 1. Independent AI walkthroughs

I would not call this UAT without qualification. UAT’s defining property is that a human user judges whether the product serves their purpose. An agent driving the UI is closer to **AI-assisted exploratory QA / UX critique**.

It adds value beyond E2E when the E2E suite only proves “known paths still work.” A path-aware agent can notice things no assertion encoded:

- confusing or contradictory labels
- dead-end flows
- missing empty/error states
- visual regressions
- inaccessible or semantically broken UI
- “the app technically works, but a new user would not know what to do next”
- mismatches between acceptance criteria and the running product

But it remains structurally blind to:

- whether real users care about the feature
- whether domain terminology is correct in context
- whether the workflow fits real operational habits
- whether the product builds confidence or trust
- whether training burden is acceptable
- whether edge cases matter in practice

So its confidence contribution belongs at the **low to low-medium** end. It stacks with human UAT because it finds different defects, but it does not replace it. One independent agent walkthrough is more valuable than no walkthrough, less valuable than one real user watching and commenting, and far below repeated use by independent business users.

### Beating sycophancy

Some mitigations are real; some are theatre.

| Mitigation | Verdict |
|---|---|
| Different provider family from implementer | **Real.** Necessary, not sufficient. |
| No implementer rationale, no diff, no code | **Real.** Makes the agent behave more like a user/reviewer instead of a defense attorney. |
| Give acceptance criteria + running product only | **Real.** Best framing for UAT-like review. |
| Adversarial prompt: “find where a new user gets stuck” | **Real.** Better than “does this look right?” |
| Require concrete repro steps, screenshots, timestamps, DOM/ARIA evidence when available | **Real.** Forces specificity. |
| Require a fixed number of findings | **Mostly theatre.** It creates fake nitpicks. Prefer “up to N high-confidence findings; no finding is acceptable if justified.” |
| Score findings for specificity/reproducibility | **Real.** This is the useful gate, not sentiment. |

The key is to make the reviewer **blind, adversarial, evidence-bound, provider-diverse, and product-facing**.

### Platform dependence

Yes, it depends sharply on platform.

- **Web apps:** strongest case. Browser automation can inspect DOM, accessibility tree, text, screenshots, console/network errors, focus order, and real navigation. This is where I would build first.
- **VS Code / Electron:** possible but degraded. The agent may need Electron automation, accessibility APIs, or screen-level reasoning. More brittle, more setup, less semantic visibility.
- **Native desktop:** degraded further. Usually screen/image/accessibility driven; much harder to make portable.
- **CLI apps:** useful, but not UAT in the video sense. An agent can run commands and critique help text, errors, and workflows, but there is no visual walkthrough unless the product is terminal-centric.
- **Non-interactive libraries/services:** mostly not applicable; this becomes API/contract review, not UAT.

### What I would build

Not in Set 113 as a full feature.

For Set 113, I would only leave a **schema slot** for `reviewerType: ai-agent` and maybe define the confidence semantics. Do not build a running-product AI UAT agent now. It is a complexity trap if bundled with recorder, walkthrough rendering, UAT accounting, and training artifacts.

A later set could build **AI exploratory walkthrough** for web targets only:

1. browser-launched fixture
2. acceptance criteria + step script
3. independent provider
4. no diff/rationale/code
5. evidence-bound findings
6. record output as low/low-medium confidence UAT-adjacent evidence

## 2. Videos as UAT evidence and training material

**I am changing my round-1 position on OS-level capture.** I previously allowed it as a fallback adapter. With training material in scope, I would **not build OS-level capture in Set 113**. Training raises the bar: durability, polish, repeatability, captions, versioning, discoverability, and stale-content handling. OS capture is exactly where those costs explode.

UAT evidence and training material are related, but they are **not the same artifact**.

- UAT evidence is disposable, session-scoped, and defect-oriented.
- Training material is durable, user-facing, discoverable, accessible, and versioned.
- A raw UAT recording is usually too rough for training.
- A polished training video is usually too curated to be honest UAT evidence.

“One recording, two purposes” is tempting, but often a trap. The shared asset should be the **authored walkthrough script**, not necessarily the video file.

### Nearly-free dual-purpose design

The concrete artifact should be a **versioned walkthrough script** that stands alone:

- scenario title and audience
- prerequisites/setup
- numbered steps
- expected result per step
- optional narration text
- component tags
- chapter markers
- timestamps when rendered to video
- “jump to this point” instructions
- links to generated artifacts, if any

That same source can render:

1. manual UAT steps
2. captions/narration
3. a training document
4. video chapter metadata
5. UAT accounting references

Recordings should be **regenerable from the script**, not treated as permanent source of truth. If a product changes, the script is updated and the video can be regenerated. That avoids committed binary rot and avoids building a media-management subsystem.

Training-quality archived videos may eventually be useful, but that is a separate publishing problem: storage, retention, version compatibility, caption review, and discoverability. That is not Set 113.

### Operator condition

The synced window is still correctly cut. The replacement should be:

**Numbered step script with timestamps and chapter markers.**

Each video chapter maps to a step range. Each step contains enough written instruction to reach that point manually from a known baseline. The written walkthrough must be usable without the video; the video is an enhancement.

## 3. Revisited calls

- **OS-level capture:** change my position — **refuse for Set 113**, leave only as a future adapter possibility.
- **Exemplar platform:** **dummy web app**, not this repo’s VS Code extension.
- **Session structure:** keep three sessions: **UAT accounting model**, **portable walkthrough/script rendering**, **browser-first recording exemplar**; defer AI walkthrough agents and OS capture.