# Orchestration & Verification Effort Strategy

> **Purpose:** How to *allocate* orchestration and verification effort across a
> piece of work — when one orchestrator + one cross-provider verifier is right,
> and when a heavier **multi-orchestrator** process (several engines each
> producing their own work product, then cross-critiquing) earns its cost. The
> headline recommendation: the **planning / architecture / decomposition phase**
> is the prime — often the only — place a multi-orchestrator process pays off.
>
> **Status (read this first).** This document is a *reasoned* framework, not a
> uniformly *validated* one. The verification-surface claims it leans on
> (path-aware beats snippet-fed routed on cross-file defects; a second routed
> verifier of the same surface adds ~nothing; ~95% of defects are deterministically
> falsifiable; the cadence question) are grounded in the **Set 065–068
> verification-surface program** and will be summarized in its end-of-set synthesis
> (Set 068 S6). The **multi-orchestrator-planning** recommendation here is argued
> from those findings plus first principles; it has **not** itself been run as a
> controlled experiment and is a strong candidate to become one. Treat it as
> "consider this and apply judgment," not "proven law."
>
> **Portability:** repo-agnostic. Consumer repos inherit it with the rest of the
> planning docs.

---

## 1. The core principle

**Match the process to the work; spend redundancy where variance and
irreversibility are highest, not uniformly.**

Two properties of a piece of work decide how much independent-perspective machinery
it deserves:

- **Solution-variance** — would capable engines genuinely *diverge* on the answer?
  (Wide for "what architecture?"; narrow for "fix this off-by-one.")
- **Falsifiability / oracle** — can a cheap deterministic check *settle* it? (A
  unit test settles most execution defects; nothing settles "is this the right
  decomposition.")

Variance and irreversibility are **front-loaded** in the lifecycle: a planning or
architecture mistake is paid back across *every* session built on it and is
expensive to unwind; an execution defect is usually local, falsifiable, and a
cheap re-roll. Therefore the redundancy budget should be front-loaded too — the
inverse of where naive cost-cutting points it ("skip planning, get to work").

Supporting datum from the verification-surface program: a **second routed verifier
of the same context surface added essentially nothing** — value came from an
*orthogonal* perspective (full-repo context), not from another *vote*. Generalize:
**value comes from orthogonal perspectives, not from count.** More engines only
help to the degree each brings a genuinely different *approach* or *access*.

---

## 2. Cost has three currencies

A process can be cheap in one currency and ruinous in another. Always evaluate
**total cost across all three**, not per-call dollars:

1. **Dollars** (metered tokens). Per-run, snippet-fed routed verification is the
   *cheapest*; path-aware is 1.4–6.6× pricier per call.
2. **Wall-clock / latency.** The generate and cross-critique steps of a
   multi-orchestrator process are **embarrassingly parallel** — the heavy tier
   costs dollars but little wall-clock. If you are latency-sensitive and
   dollar-tolerant on a one-off decision, that is a good trade.
3. **Human attention / rework / trust.** A check that is cheap to run but misses
   the bugs that matter (or cries wolf) is a false economy — it bills you in
   triage time and eroded confidence, and a *high-cadence* cheap check multiplies
   whatever it costs.

> **"Cheap per run" ≠ "cheap total."** The right frame is
> `total = verification spend + escaped-defect (rework) cost`. A weak check run
> every session, that misses compounding cross-file bugs, can be the *most*
> expensive option despite the lowest per-call price. (Quantifying that rework
> term is exactly what the Set 068 Experiment B cost model exists to do.)

---

## 3. Falsifiability is the router — a tiered model

Reserve expensive reasoning for the work that genuinely needs it. Route each check
by the two levers of §1:

- **Tier 0 — deterministic floor (contract / falsifier tests).** Use whenever the
  defect class is falsifiable (empirically ~95% of seeded defects). Milliseconds,
  ~zero dollars, no provider, perfectly reproducible. Carries the bulk.
- **Tier 1 — a single AI reviewer with the *right context surface*** (path-aware
  for cross-file work). For defects that need understanding but where one good look
  suffices. This is the default for per-session execution review.
- **Tier 2 — a multi-orchestrator panel** (generate-diverse → adversarial
  cross-critique → synthesize). Reserved for work that is **not falsifiable *and*
  high-variance** (§5).

Falsifiability is the triage function: **if a disagreement can be settled by a
test, settle it with a test, not a panel of models voting.** That collapses most
of the apparent decision space before any costly machinery engages — including
disagreements *between* orchestrators in a Tier-2 process.

> Honest caveat on the ~95%: it was measured by authoring falsifiers *knowing the
> defect*. Whether a **blind** author can cheaply pre-author the falsifiers before
> knowing the bugs is the open question the Set 068 contract-test-gate work probes;
> until then, treat 95% as an upper bound on the deterministic floor.

---

## 4. Multi-orchestrator planning (the headline)

**The plan → decompose boundary is the prime insertion point for a
multi-orchestrator process.** It is maximal on every trigger: widest solution
space, no oracle, most-expensive-and-least-reversible mistake — and it is the
*cheapest phase per unit* (one plan amortizes over dozens of execution calls), so
tripling it is rounding error against the whole effort.

**Two things you can multiply — pick the high-variance bottleneck:**

- **Multiple architectures** (how to build it) — highest variance, purely
  oracle-free. The **default** target.
- **Multiple decompositions** (how to slice the effort into sessions/sets) —
  partly *derivative* of the architecture, and it has a **partial oracle** (you
  can mechanically check: is each session independently completable? does it fit a
  context window? are there clean synthesis points? does a later session depend on
  something an earlier one does not produce?). So it usually needs *less* panel.
  The **exception**: when the architecture is obvious but **sequencing** is the
  hard, risky act (migrations with ordering constraints), decomposition *is* the
  bottleneck and deserves the panel.

**The shape of the process:**

1. **Generate-diverse** — N engines (ideally different providers) each produce an
   independent plan/architecture, blind to each other. Prompt for genuinely
   different angles (e.g. risk-first, simplicity-first, capability-first).
2. **Adversarial cross-critique** — each engine *attacks* the others' plans for
   concrete failure modes (hidden coupling, underestimated sessions, an unstated
   dependency), grounded in checkable sub-claims wherever possible. **Not** a
   round of mutual agreement.
3. **Synthesize, don't select** — produce the winner while *grafting the best
   ideas from the runners-up*. Plans are modular; picking one whole plan throws
   away the good parts of the others.
4. **Operator confirms** — the human chooses or blends from the developed,
   cross-critiqued options. Planning is where human judgment is most valuable and
   least replaceable; the panel's job is to *give the operator strong options*,
   not to auto-select.

This is **not a new paradigm** — it is the repo's existing *decision-time
consensus → operator confirms* mechanism (see
[`ai-led-session-workflow.md`](../ai-led-session-workflow.md) → *Decision-time
consensus*) aimed at the biggest decision of all, the one every session inherits.

---

## 5. Cautions (sharper at the planning stage than anywhere else)

- **Adversarial, not consensus.** LLMs are sycophantic — they drift toward
  agreement whether or not they are right. A process that *rewards* convergence
  manufactures false agreement, and this is worst at the planning stage *because
  there is no oracle to anchor against*. **Surviving disagreement resolved by
  evidence is the signal; smooth consensus is the thing to distrust.** Consensus
  ≠ correctness.
- **Synthesize, not select** (see §4.3).
- **The human is the right adjudicator for oracle-free artifacts.** Do not let the
  models auto-decide a plan; there is nothing to check them against but more model
  judgment until execution.

---

## 6. When NOT to convene the panel

Gate on **variance/novelty**, not on importance. A high-stakes but *determinate*
task (a security-critical but well-specified change) wants Tier 0 + a rigorous
Tier 1, not a panel. Skip the panel for routine, low-variance efforts: another
CRUD screen, another consumer-repo bootstrap, a contained bugfix-set, a pure
refactor. **The tell:** if "six months from now we'll wish we'd structured this
differently" is a live risk, convene the panel; if it is not, one plan is right.

Adaptively, you can also **escalate on detected disagreement**: run a single cheap
planning pass first, and convene the panel only if it comes back split or
low-confidence — triage, not a universal MRI. That bounds the cost while still
catching the genuinely ambiguous cases.

---

## 7. Summary

- Spend independent-perspective effort where **variance** and **irreversibility**
  are highest — front-loaded, at planning — not uniformly.
- Route every check by **falsifiability** (Tier 0 if a test settles it) and
  **solution-variance** (Tier 2 panel only if oracle-free *and* divergent).
- Evaluate **total** cost across dollars, latency, and human-attention; exploit
  parallelism so the heavy tier is wall-clock-cheap.
- For the panel: **generate-diverse → adversarial cross-critique → synthesize →
  operator-confirm**, targeting the architecture (or the decomposition when
  sequencing is the risk).
- **Validate this.** The multi-orchestrator-planning recommendation is reasoned,
  not yet measured; a controlled study (does a 3-architecture panel produce
  materially better plans / fewer downstream reworks than one good plan, and for
  which classes of effort?) is the natural next experiment in the lineage of
  Sets 065–068.
