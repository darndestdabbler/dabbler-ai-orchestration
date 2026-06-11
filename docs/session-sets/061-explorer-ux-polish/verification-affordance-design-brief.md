# Design question: a per-set "verification" affordance for Lightweight session sets in a VS Code tree view

You are advising on a UX decision for the **Dabbler AI Orchestration** VS Code extension. Give a concrete, opinionated recommendation — not a survey. Be specific about the affordance, its states, its placement, and its risks. Assume a senior audience; skip preamble.

## System context

- The extension shows a **Session Set Explorer** — a custom webview tree where each row is one "session set" (a unit of AI-led work decomposed into sequential sessions). Rows are deliberately **quiet**: a name, an `N/M` progress fraction, and small unobtrusive markers (the established pattern is a de-emphasized glyph/text marker + hover tooltip, e.g. a `*` for "needs migration", an `lw` marker for Lightweight tier, a `⛓︎` for "blocked by prerequisites").
- **Two adoption tiers, per session set:**
  - **Full** — work is routed through provider APIs (`ai_router`), and end-of-session **cross-provider verification is mandatory and automatic** (a different AI provider reviews each session). Nothing to decide; it just happens.
  - **Lightweight** — **router-off**: no API calls, no automatic cross-provider verification. Verification, if any, is governed by a per-set **`verificationMode`** field in the set's `spec.md`:
    - **Mode A — `out-of-band-or-none`** (the default): no verification sessions are created by the system. Verification is out-of-band (a human, or a manually-run agent) or skipped.
    - **Mode B — `dedicated-sessions`**: after the work sessions complete, **typed `verification` (and possibly `remediation`) sessions are appended** to the set's session ledger by a "blessed writer", growing the denominator. The Explorer renders the pending growth as an `N/M+` fraction (the `+` drops once the typed verification session is appended).
- **Important constraints / prior decisions:**
  - `verificationMode` is currently **only settable by hand-editing `spec.md`**. There is no UI for it.
  - A set's **tier** *is* now switchable from the UI via a `Switch Tier…` right-click action, but **only while the set is `not-started`** (a tier flip mid-set is disallowed because per-session verification semantics differ and the mode capture is immutable after first record).
  - Design ethos: rows stay **quiet/unobtrusive**; **no new persisted state fields** if a signal can be derived in-memory from existing artifacts (spec config + the session ledger); markers are derived, pure functions.
  - "Verified" for a Lightweight set is fuzzy: in Mode A it may be human-attested out-of-band (no machine record); in Mode B it means a completed `type: verification` session exists in the ledger.

## The operator's problem statement (verbatim intent)

"I don't want to make it difficult for users to tell AI agents to create verification and remediation sessions. It might almost be helpful to have an icon on each Lightweight session set that hasn't been verified, and have that icon tell the user what to do — maybe even serve as the toggle to turn on verification."

So the operator wants: (1) a per-row affordance on Lightweight sets that **haven't been verified**, that (2) **communicates what to do** about it, and (3) possibly **acts as a toggle to turn verification on** (i.e. move the set toward Mode B / getting verification + remediation sessions created — ideally making it one click to then instruct an AI agent to actually do the work).

## What to recommend

Give your best concrete design. Address each of these explicitly:

1. **The affordance**: what is it (icon/marker/badge/inline action?), where does it sit on the row, and what does its tooltip/label say? Keep it consistent with the quiet-marker ethos, or argue for breaking that ethos if warranted.
2. **States**: what distinct states should it distinguish for a Lightweight set (e.g. not-yet-verified / verification-pending / verified / mode-A-opted-out)? How is each derived from existing artifacts (spec `verificationMode` + the session ledger), given the "no new persisted fields" preference? Be honest about the Mode-A "verified out-of-band with no machine record" gap — can the system even know?
3. **The toggle**: should the affordance flip `verificationMode` A→B? If so, reconcile with the existing rules that mode capture is immutable after first record and tier flips are not-started-only. Does the toggle belong only on not-started sets, or can it apply to a set whose work sessions are already complete (the realistic "I finished the work, now I want it verified" case)? What exactly does flipping it do — rewrite the spec, and/or append a typed verification session via the blessed writer, and/or copy a ready-to-paste prompt that tells an AI agent to run the verification session?
4. **Helping the user instruct an AI agent**: the deeper goal is making it trivial to get verification + remediation sessions actually created and run. Should the affordance produce a copyable prompt / kick off a session / open the right doc? What's the lowest-friction path?
5. **Scope & risk**: is this one cohesive feature or does it split (render-the-state vs. the-toggle vs. the-agent-handoff)? Biggest risks (misleading "unverified" signal on a legitimately Mode-A set; implying automatic verification that Lightweight deliberately doesn't do; encouraging a mid-set mode flip that breaks immutability). Would you ship it, defer it, or reshape the operator's idea — and why?

End with a 2-4 sentence **bottom-line recommendation**.
