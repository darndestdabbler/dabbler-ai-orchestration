# Session 3 — the walk, and the UAT attestation

> **Walked:** 2026-07-30/31, by the operator, on a second machine.
> **Result: the criterion is met on both halves.**

## The attestation

| | |
| :--- | :--- |
| **Machine** | A second machine — the operator's GHE-linked Windows account — not the machine that authored S1 or S2. |
| **Profile** | A fresh VS Code profile. |
| **Build** | The **published `0.47.0`** from the Marketplace, installed as a normal user would. Never this repo's editable install. |
| **Agent** | **GitHub Copilot**, chosen deliberately over Claude Code: it is what the staff who abandoned the previous tutorial actually use, so it is the representative walk. First session in the set to spend Copilot seat capacity. |
| **In-window time** | **Under 15 minutes** — Ctrl+Shift+P to `HELLO, WORLD!` on screen. |
| **Constraint** | **Four no's**: no git command typed, no YAML edited, no host configured, no Dabbler setting changed. |
| **Functional** | The command created the project, the test failed, one pasted line drove a Copilot session that turned it green, and the program printed both lines. |

Checklist: [`107-first-run-rescue-uat-checklist.json`](107-first-run-rescue-uat-checklist.json),
four items, all `Passes: true`.

## What this evidence is, and what it is not

Two limits are stated here rather than left to be discovered, because an
attestation that hides how it was collected is worth less than one that admits
it:

1. **The Results were transcribed by the orchestrator** from the operator's
   report in conversation, not filled in item by item during the walk. Every
   `Result` field says so.
2. **The time is the operator's estimate, not a stopwatch reading.** The walk
   was performed before the streamlined checklist existed, so the two clock
   marks were never written down. "Under 15 minutes" is recorded as an estimate
   deliberately — a precise-looking number nobody measured would be worse
   evidence than an honest approximate one.
3. **Install time was never recorded separately, and the spec required it.**
   `spec.md` step 2 says *"Record install time and interaction time
   separately"*, and the success criterion repeats it. **No install-time figure
   exists.** The first checklist carried a dedicated install-time pair; the
   operator-directed resize demoted it to *"if you can"*; the walk then preceded
   even that instrument. This is a **spec requirement quietly unmet** — surfaced
   by the post-close path-aware critique (F-PAC-1), accepted, and recorded here
   rather than re-walked. The requirement exists so a slow package index is not
   mistaken for tutorial complexity, and that purpose was served with unusual
   force below: the prerequisite cost dominated the sitting, sat entirely
   outside the measured window, and is documented. The full adjudication,
   including why re-walking was declined, is in
   [`s3-path-aware-critique-adjudication.md`](s3-path-aware-critique-adjudication.md).

What it **is**: a real first run, by a person who did not write the document, on
a clean profile, on a released build, with a real AI agent, from an empty folder
to a running program. That is the thing no suite in this repo can produce, and
it is what `requiresUAT: true` was set at authoring time to obtain.

## The finding: the prerequisite, not the tutorial

The operator's own summary is that the biggest time sink **"by far"** was not
the tutorial at all — it was getting VS Code running while logged into GitHub
Enterprise the right way.

Their organisation uses a **special Windows account linked to a GHE account**,
and there is more than one way to arrange it. What works today is a **PowerShell
script that launches VS Code under `runas`** with a dedicated profile carrying
GHE login settings. The operator's assessment: it works reliably, but it is not
seamless — **three separate logins remain** (the `runas`, the GHE sign-in, and
the Copilot CLI).

### Why this does not change the number

The spec excludes install and setup time from the criterion precisely so that
environment cost is not mistaken for tutorial complexity, and here that
exclusion earns its keep. **The sample is hostless and needs no GHE at all** —
`Dabbler: Try a sample project` runs `git init` locally, writes the
`.dabbler/local-only` marker and never contacts a host. The GHE login is what
makes **Copilot** work, not what makes **Dabbler** work.

### Why it is a real finding anyway

The tutorial's prerequisite 5 reads *"An AI coding agent you already use and are
already signed in to."* That sentence is true, and Session 2's verification
already hardened it once. But for an organisation shaped like the operator's,
**"already signed in" is itself a project** — and the tutorial's 15-minute clock
starts *after* it. The claim is honest; the silence about what that
prerequisite can cost is the gap.

### Triage

Per this session's scope rule (`ai-assignment.md`): a defect in the tutorial's
wording or in S1's command is fixed here; anything else is recorded and named.
This is **anything else** — it is host and identity onboarding, which
`hello-world.md` excludes **by design** (spec non-goals: no host configuration,
no git host account). Adding GHE/`runas` guidance to a document whose entire
premise is *no host, no account, no git* would rebuild the cognitive load this
set exists to remove, and `project-guidance.md`'s removal-over-addition rule
argues against it directly.

**No tutorial change. No command change.** Named as a follow-on set below.

## Follow-on: organisation onboarding for GHE-linked Windows accounts

The operator's own framing, which is the right one: **private instructions for
their staff first, then an adapted / genericised / sanitised version** that
works outside the organisation.

A candidate set would own:

- The `runas` + VS Code profile + GHE-settings launch script, hardened and
  documented (it already exists, authored with Claude, and is reported working
  reliably — this is documenting and generalising a working thing, not
  inventing one).
- An honest account of the **three logins** and which of them can be collapsed,
  if any — the operator explicitly flags the experience as not seamless.
- The **sanitisation boundary**: what is organisation-specific (account names,
  GHE host, policy) versus what any GHE-shaped organisation needs.
- Where it links from: **`adopt-dabbler.md`**, not `hello-world.md`. Adoption is
  where hosts, accounts and teammates already live per the concept-ownership
  table; the first run stays hostless.
- **Budget note:** this set touches Copilot seat capacity and GHE, so it is one
  of the few candidates that draws on the seat budget rather than only the
  `DABBLER_*` keys. Name that explicitly when it is authored.

It is **not** a prerequisite for anything currently queued, and it does not
block the Marketplace publish.
