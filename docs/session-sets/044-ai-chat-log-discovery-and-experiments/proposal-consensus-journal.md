# Proposal Consensus Journal — Set 044 / Session 5

> **Purpose:** audit trail for the cross-provider consensus call
> that validated (and revised) `proposal.md`. Records both Pass A
> (initial framing) and Pass B (devil's-advocate). Both passes used
> the canonical bias-cautions preamble per
> `docs/ai-led-session-workflow.md` §Prompt-framing discipline.
> **Date:** 2026-05-23.
> **Companion docs:**
> [`proposal.md`](proposal.md) v1 (post-consensus revision),
> raw verdict JSONs under
> [`verification-output/pass-{a,b}-*.json`](verification-output/),
> consensus drivers at
> [`consensus_pass_a.py`](consensus_pass_a.py) +
> [`consensus_pass_b.py`](consensus_pass_b.py).

---

## 1. Providers and methodology

Three providers at max effort (router tier 2-3), routed via
`ai_router.query()`:

| Provider | Model ID | Tier |
|---|---|---|
| `gpt-5-4` | `gpt-5.4` | 3 |
| `gemini-pro` | `gemini-2.5-pro` | 2 |
| `opus` | `claude-opus-4-6` | 3 |

**Why Opus 4.6 and not Opus 4.7:** the proposal was authored by
Opus 4.7 (the S5 orchestrator). Including the same model version
in the consensus would compromise independence; Opus 4.6 gives a
within-Anthropic check that's distinct from the authoring agent.

Calls were **sequential** (not parallel) to isolate failures —
the first run hit cp1252 encoding errors in the Python driver
output that didn't block routing but would have masked
provider-specific issues if parallel.

Pre-flight router-config drift warning: pricing last reviewed
33 days ago (threshold 30). Pricing-accuracy risk on the
recorded `cost_usd` values is bounded by that drift; the
relative cost shape across providers is unaffected.

---

## 2. Pass A — initial framing

### 2.1 Prompt structure

- **Bias-cautions preamble** (always-on per workflow.md): the
  canonical "this prompt was authored by an AI agent that may
  have an opinion on the answer" text.
- **System summary** (`SYSTEM_SUMMARY` in consensus_pass_a.py):
  Set 044 context, S1-S5 work record, cumulative spend
  ($0.292 going in).
- **Bundle** (~68k chars): full `proposal.md` v0,
  `cross-backend-synthesis.md`, `copilot-effort-sidebar-results.md`,
  selected sections of `spec.md` (project overview, S5, S6).
- **Focus prompt**: 5-part structured response — top-level
  assessment, per-question engagement on the 8 open questions,
  added/removed risks, S6 go/no-go, "right question check."

### 2.2 Per-provider verdicts

| Provider | Tokens (in/out) | Cost | Position |
|---|---|---|---|
| gpt-5-4 | 18522 / 7444 | $0.158 | ENDORSE-WITH-REVISIONS · NO-GO S6 |
| gemini-pro | 19968 / 1945 | $0.044 | ENDORSE-WITH-REVISIONS · GO S6 (with wrapper-as-S6 scope) |
| opus-4-6 | 21351 / 3761 | $0.602 | ENDORSE-WITH-REVISIONS · GO S6 |
| **Pass A total** | | **$0.804** | |

### 2.3 Pass A convergence (3/3 agreement)

1. **Strategic direction**: build harvest, retire Sets 037-041 as
   currently scoped.
2. **Promote wrapper (§8.7) from open question to primary
   architecture**; narration reframed as fallback.
3. **Drop per-turn narration permanently** (§8.2 of the proposal).
4. **Wrapper lives in `ai_router/`** as a sibling to
   `start_session.py`.
5. **Headless-mode first**, defer interactive TTY.
6. **Ungated default** for Dabbler-launched sessions.
7. **Forward-compatible with Sets 042-043** (chat interface) —
   wrapper is a natural building block.
8. **Independent new risks raised by all three**: log-format
   schema drift, sensitive-content retention, workspace-identity
   ambiguity (paths, symlinks, WSL), wrapper-bypass.

### 2.4 Pass A material disagreements

**S6 GO/NO-GO** — 2 GO vs 1 NO-GO:

| Provider | Position | Argument |
|---|---|---|
| gpt-5-4 | **NO-GO** | "The current S6 is small enough but not important enough; the architecture-correct S6 is too big for one session." |
| gemini-pro | **GO** with revised scope | "Ship the wrapper itself as the central S6 deliverable instead of (or alongside) a Copilot parser." |
| opus-4-6 | **GO** | "None of the §9 flip conditions are met. Wrapper refinement *strengthens* the framing, doesn't reveal a flaw." |

**Joiner location** — 2-1 Python/TypeScript split:

| Provider | Location |
|---|---|
| gpt-5-4 | Python (sibling to ai_router) |
| gemini-pro | Python |
| opus-4-6 | TypeScript inside the extension |

---

## 3. Pass B — devil's-advocate

### 3.1 Why Pass B was run

Per workflow.md §Prompt-framing discipline, the devil's-advocate
two-pass pattern applies when:
- First-pass returns material disagreement, AND/OR
- Decision binds a long-lived contract, AND/OR
- Reviewing a roadmap or session-set sequence.

All three criteria applied here. The first-pass S6 disagreement
alone would have justified Pass B; the roadmap-reshape and
architecture-commitment shape made it unambiguous.

### 3.2 The steelman

Pass B asked each provider to steelman a SPECIFIC contrarian
hypothesis (not "be contrarian generally" — which produces
theatrical negativity that wastes budget per workflow.md). The
hypothesis:

> "The Pass A wrapper-first convergence is premature and possibly
> incorrect. Specifically: (A) the wrapper is launch-adapters-
> in-disguise; (B) the 'narration as fallback' framing
> trivializes the real adoption story; (C) S6 should defer ALL
> implementation to Set 045 where the wrapper can be designed
> alongside the conflict-detection joiner."

Each provider was asked to: (1) steelman each sub-claim; (2)
specify what evidence would make each claim obviously true; (3)
reconcile their Pass B steelman against their Pass A position;
(4) re-answer S6 GO/NO-GO under Pass B framing.

### 3.3 Per-provider verdicts

| Provider | Tokens (in/out) | Cost | Pass A → Pass B |
|---|---|---|---|
| gpt-5-4 | 15860 / 5146 | $0.117 | NO-GO → NO-GO (strengthened); wrapper-primary dropped |
| gemini-pro | 16827 / 1916 | $0.040 | GO → **NO-GO** (flipped) |
| opus-4-6 | 18086 / 2923 | $0.491 | GO → GO (with revised scope; wrapper-primary dropped) |
| **Pass B total** | | **$0.647** | |

### 3.4 Pass B convergence (3/3 agreement)

**Framing-bias correction**: All three providers, in their Part 3
position-reconciliation responses, explicitly acknowledged that
proposal v0 §8.7's positive framing of the wrapper biased their
Pass A response. The corrected framing is **dual-primary, two
co-equal channels** — wrapper for Dabbler-launched sessions,
narration + native-log parsing for free-running sessions, with
**equal engineering investment** in both.

Specific quotes from Part 3:

- **gpt-5-4**: "Yes, §8.7's framing likely biased Pass A. It
  foregrounded the wrapper's benefits and under-foregrounded
  three drawbacks: it is still launch interception, it is still
  bypassable, and its correctness depends on a join that was
  deferred. Once that framing is corrected, I still reject the
  old heavyweight adapters, but I no longer endorse unqualified
  'wrapper-primary, narration-fallback' phrasing or S6 shipping."

- **gemini-pro**: "The framing of proposal.md Section 8.7 did
  bias my Pass A response. [...] The steelman exercise corrected
  this by forcing me to confront the operational reality that a
  tool that can be bypassed will be bypassed. My revised position
  acknowledges that the wrapper, while valuable, only solves
  part of the problem."

- **opus-4-6**: "Yes, §8.7's framing biased Pass A. The wrapper
  was presented with four paragraphs of benefits, specific
  decision points that assumed adoption, and a list of 'what it
  does NOT replace' that functioned as reassurance. The drawbacks
  (bypass risk, TTY fragility) were mentioned but not
  foregrounded. Pass A reviewers — myself included — picked up
  the wrapper's strengths from the framing and insufficiently
  interrogated the bypass-rate question."

### 3.5 S6 vote flip

| Provider | Pass A | Pass B | Net |
|---|---|---|---|
| gpt-5-4 | NO-GO | NO-GO | Held; strengthened |
| gemini-pro | GO | NO-GO | **FLIPPED** |
| opus-4-6 | GO | GO with revised scope | Held with caveats |

**Pass B vote: 2 NO-GO / 1 conditional-GO.** The load-bearing
argument across both NO-GOs: shipping a launch wrapper without
its consumer (the Set 045 joiner) hardens a record schema before
the conflict-detection semantics that validate it are known.
"Ship producer without consumer is an anti-pattern."

The Opus minority GO defended an end-to-end smoke-test value
(catching practical issues — file locking, path normalization,
OTel surprises — that documents alone can't reveal) and argued
the wrapper's record schema is simple enough that schema
commitment risk is low.

### 3.6 What Pass B did NOT relitigate

Pass B did not revisit:
- The harvest direction (3/3 Pass A endorsement held)
- The dropping of per-turn narration (3/3 Pass A held)
- Wrapper location in `ai_router/` (3/3 Pass A held)
- Headless-first sequencing (3/3 Pass A held)
- The Pass A 2-1 joiner-location split (Python vs TypeScript)

The joiner-location question was left as an empirical decision
for Set 045's first session per the unrevisited Pass A split.

---

## 4. Synthesized close-out position

Drawing on Pass A + Pass B together:

**LOCKED (strong cross-provider agreement, both passes):**
1. Build log-harvest direction; retire Sets 038-041 outright;
   shrink/retire Set 037.
2. Drop per-turn narration permanently.
3. Both wrapper channel and native-log/narration channel are
   needed; they are **dual-primary**, not primary-and-fallback.
4. Wrapper (when built) lives in `ai_router/`, headless-first,
   ungated-default-for-Dabbler-launched sessions.
5. Forward-compatible with Sets 042-043.

**DECIDED (Pass B 2/3 NO-GO; Opus dissenting):**
6. NO-GO on in-set S6 implementation. Close Set 044 with locked
   architectural direction + roadmap reshape + this consensus
   journal. Set 045 owns the joint design and implementation of
   wrapper + parsers + joiner as a single cohesive deliverable.

**OPEN (carried into Set 045):**
7. What fraction of real-world AI sessions are Dabbler-launched
   vs. free-running? (Determines actual coverage split between
   channels.)
8. Can wrapper records deterministically join to provider-native
   logs? (The `conv_id` is AI-generated, not wrapper-generated;
   binding strategy unproven.)
9. What's the actual phrasing-trigger boundary on Claude's
   injection classifier? (S4b distinguished v1 from v2 by
   changing multiple framings at once.)
10. Should the joiner live in Python or TypeScript? (Pass A 2-1
    Python; not relitigated in Pass B.)
11. Can per-turn narration ever be made reliable on Claude via
    a hook channel? (Dropped from v1.1 instruction-driven path;
    revisit only if per-turn fidelity becomes operationally
    important.)

---

## 5. Spend record

| Pass | Provider | Input tokens | Output tokens | Cost |
|---|---|---|---|---|
| A | gpt-5-4 | 18522 | 7444 | $0.158 |
| A | gemini-pro | 19968 | 1945 | $0.044 |
| A | opus-4-6 | 21351 | 3761 | $0.602 |
| | **Pass A total** | | | **$0.804** |
| B | gpt-5-4 | 15860 | 5146 | $0.117 |
| B | gemini-pro | 16827 | 1916 | $0.040 |
| B | opus-4-6 | 18086 | 2923 | $0.491 |
| | **Pass B total** | | | **$0.647** |
| | **Consensus total** | | | **$1.452** |

Cumulative Set 044 routed spend (S1-S4 verifiers + S5 consensus):
**$1.74 of $15.00 NTE**.

Notable empirical observation about cost: Opus 4.6 max-effort was
~14× the cost of Gemini Pro per call ($0.60 vs $0.04 in Pass A).
GPT-5.4's output was ~3× Gemini Pro's at ~4× the cost. For future
consensus calls where cost matters: gemini-pro provides
substantial value-per-dollar, while opus-4-6's premium pays for
markedly longer, more-structured responses. The cost-quality
trade-off is real but not currently constraining at this set's
NTE.

---

## 6. Framing-bias finding — recommendation back to workflow.md

The bias-cautions preamble was on for Pass A but was insufficient
on its own to prevent the §8.7 framing in proposal v0 from
pulling Pass A reviewers toward "wrapper-primary, narration-
fallback" language. Pass B's devil's-advocate steelman surfaced
the bias; without Pass B, the proposal would have shipped a
materially weaker recommendation.

**Recommendation back to `docs/ai-led-session-workflow.md`
§Prompt-framing discipline §"When to use which":** for
high-leverage decisions where the proposal author has a clear
architectural preference (a roadmap reshape; a long-lived
contract; a session-set sequence review), the devil's-advocate
two-pass pattern should be **default**, not conditional on
first-pass divergence. The empirical evidence from this call
supports promoting the relevant rows in the workflow-doc
decision table from "Yes if budget allows" to "Yes, always."

This finding is in-scope for a future workflow-doc update; it
should not be applied retroactively to this set, which already
ran the devil's-advocate pass.

---

## 7. Position recorded for posterity

The proposal v1 architectural commitment is:

> **Build log-harvest observability using two co-equal channels
> — passive native-log parsing + active Python launch wrapper —
> and retire the per-provider launch-adapter sets (037-041).
> Set 044 closes here with documents only; all implementation
> defers to Set 045 where wrapper + parsers + joiner are designed
> and shipped together as a single cohesive deliverable.**

The minority Opus 4.6 Pass B GO position is preserved as a noted
alternative: if Set 045 starts with a non-committing spike
measurement (actual wrapper-bypass rate; deterministic
correlation prototype on one backend), the "smoke test" value
Opus argued for can be captured without the schema-commitment
risk that drove the 2/3 NO-GO majority.
