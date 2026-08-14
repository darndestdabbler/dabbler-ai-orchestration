# Change log — Set 131: outsourcing policy restoration

**Set:** `131-outsourcing-policy-restoration` (3 sessions, all VERIFIED)
**Source of record:** the live Copilot seat store
`~/.copilot/session-store.db` (`assistant_usage_events`, 17,531 events,
335,062.2 credits) read on 2026-08-14 with `mode=ro` — never
`immutable=1`, which skips the WAL and undercounts (Set 130 spec, trap
T4). Credits are `SUM(total_nano_aiu)/1e9`; dollars are `/1e11`.
**Ships:** a delegation policy that is a precedence order rather than a
pin, a number that looked like a price and was not, and the largest
measured cost lever in this repo's history — which turned out not to be
delegation at all.

---

## The operator asked for one thing; the measurement produced another

The brief was straightforward. A Copilot Enterprise seat bills
interactive work with no upper limit, so an expensive chat model should
coordinate and outsource whatever it safely can to cheaper models.
Default posture: assume outsourcing is acceptable unless there is strong
justification otherwise.

The posture is defensible and it survives this set. The **mechanism** did
not, because the first fact base assembled to support it was wrong in a
way that would have bought an expensive mistake. Average credits per
inference, grouped by model, reads as an 8.5x argument for swapping the
orchestrator:

| model | credits / inference | avg input tokens |
| :--- | ---: | ---: |
| claude-opus-5 | 22.40 | 270,346 |
| claude-sonnet-4.6 | 4.51 | 33,047 |
| gemini-3.1-pro-preview | 2.65 | 43,622 |

That is **role/context confounding**, not a price comparison. `opus-5` is
measured at 270K input because it is the orchestrator; the others at
33–45K because they are children. Control for input band and the gap
collapses to ~1.7–2x — while the **context** lever, on the *same* model,
is 4.7x (7.65 credits/inference at 25–75K, 35.77 above 300K).

So the headline cost lever is not which model runs, it is **how much
transcript that model is re-billed for on every turn**. Three sessions,
one chain: **rule → number → narrative.**

---

## Session 1 — the pin comes out, and the rule that replaces it

`routing.outsourcing_mode` was pinned to `verification-only` on
2026-08-05 as a **temporary** measure whose own comment named Set 111 as
the owner of its removal. Set 111 shipped the decision-rights rubric and
never lifted it. Twenty sets later the pin was still in force and the
workflow doc still carried a heading describing a window that had closed.

The pin is gone, and what replaces it is a **precedence order** — the
order is the contract, not decoration:

1. **Authority veto.** The decision-rights rubric and the
   verification-reduction carve-out, evaluated first, with cost not an
   input. `decision_journal.py` already refuses to write a record that
   violates it.
2. **Independence requirement.** Work whose *value is* an independent
   perspective is always routed and must use a different effective
   provider. `load_config()` unions the three task types in as a
   **floor**, so an economic edit cannot delete a requirement this rule
   imposes; `route()` enforces the provider half by excluding the
   orchestrator's own effective provider on both transports.
3. **Risk gate.** Outsourceable when the failure mode is caught by an
   oracle *already independent of the producer*. Tests authored by the
   same delegate are not one. Two state-shaped carve-outs live here:
   stateful judgment stays with the orchestrator, and verifier-feedback
   synthesis may be routed but may only **recommend** — it can never
   erase a finding, change a verdict, or close a round.
4. **Context footprint.** This replaced a "~50 lines of reasoned output"
   threshold that measured the wrong end. Emitted output is not what gets
   re-billed; **retained input is, on every subsequent turn.**
5. **Model choice, last.** Never a bare multiplier ratio.

The old thresholds went with it — including two documented config keys,
`delegation.direct_work_max_lines` and `direct_work_max_files`, that
**never existed** in any shipped config. In their place:
`direct_work_reason_codes` (a closed enum; an unknown code is refused at
load, because inventing a code is inventing a new way to keep work),
`child_budget`, and transport-conditioned `thresholds`.

`child_budget` exists because of the finding that tempers the operator's
posture. Measured over true sub-agent children:

| child model | children | inferences | credits per child |
| :--- | ---: | ---: | ---: |
| gpt-5.5 | 3 | 266 | **721.77** |
| gpt-5.6-sol | 5 | 117 | 350.75 |
| gemini-3.1-pro-preview | 6 | 103 | 70.19 |
| claude-haiku-4.5 | 2 | 68 | 47.06 |

A child's cost is driven by its **unbounded inference count**, not its
rate. A `gpt-5.5` child at 721.77 credits costs more than twenty
orchestrator inferences at the >300K band — an unbounded agentic child
can cost more than the orchestrator doing the work, which inverts the
posture exactly where the posture is most confident. The fix is not to
abandon the posture but to **bound the child**: a child that would exceed
its budget is a task that should have been split. Advisory in this set,
derived from 11 conversations — a starting point, not a calibration.

**25 new tests**, weighted to precedence rather than to coverage: a rule
list that validates but reorders is the failure that looks like success.

## Session 2 — the number that is not a price

`ai_router/copilot-catalog.lock` carried a per-model integer called
`premium_request_weight`. The name asserted a rate. The value was the
premium-request count the CLI reported for the **one short probe call**
that confirmed the model existed. Against the store's authoritative
`request_multiplier`:

| model | lock said | store bills at |
| :--- | ---: | ---: |
| gpt-5.5 | **0** | **7.5** |
| gpt-5.4 | 0 | 1.0 |
| gpt-5.4-mini | 0 | 0.33 |
| claude-sonnet-4.6 / opus-4.8 / gemini-3.1-pro | 1 / 15 / 1 | 1.0 / 15.0 / 1.0 |

Wrong for the entire OpenAI family; correct for Anthropic and Google,
which is exactly what made it look trustworthy. **A cost-aware selector
trusting this file would pick `gpt-5.5` believing it free and pay the
second-highest multiplier on the seat.** The defect was latent because
nothing read the field for selection — and Session 1, by widening
delegation, is precisely what would have created that reader.

The session deviated from the reference implementation here and journaled
it: the reference wrapped the field in a NOT-A-PRICE comment, and the
spec's own note said *the field's name was the defect*. Renamed to
`probe_premium_requests`, lockfile schema v1 → v2, with a legacy read so
no existing seat lockfile loses a real measurement. Absent reads as
**unknown**, never free.

The subtler half is the one a reader would otherwise get wrong: the field
is unusable **even where it agrees**. At matched context `claude-opus-5`
(multiplier 15.0) and `gpt-5.5` (7.5) cost the *same* per inference — the
credit axis and the premium-request axis are decoupled — so correcting
the OpenAI numbers would still not make the field a cost signal.

Held down by planting, not by reading (L-112-1): **8 falsifiers, 10
plants, 10 fired**, including the prohibition firing on a new reader in
both spellings and *not* firing on the legitimate look-alike
(`premium_requests` in the transport metadata), plus an assertion that
the scan's own corpus is non-empty so it cannot pass having examined
nothing.

## Session 3 — rotation, the lever that was never written down

Conversation `a9f211a7` — 1,148 inferences, **$367.18**, the most
expensive in the store — compacted at turn 75. The store records it as a
single event, `initiator='compaction'`, costing 400.01 credits.
Immediately across it:

| | input tokens | credits / inference |
| :--- | ---: | ---: |
| before | 631,304 | ~33–35 |
| after | 54,119 | **~3.6–5.0** |

**~7–8x for a one-time 400 credits; payback in ~14 inferences.** It is the
single largest cost effect anywhere in the data, it has been native to
the Copilot CLI the whole time, and the repo's workflow said nothing
about it.

It now says this: rotate at **~150K retained input tokens**, at the first
step boundary after the threshold is crossed. 150K is where the cost
curve leaves its plateau (7.65–9.76 credits/inference up to it, 17.18
above, 35.77 above 300K), and a step boundary is where rotation is
cheapest, because what a boundary already produces *is* most of what a
flush has to preserve.

A flush is lossy by design, so the section ships a **survival contract**:
the engine bootstrap file, the spec and the active step,
`session-state.json`, the activity log, open findings with their
severities, and a dense record of what was tried and rejected and why —
and, explicitly, that anything living only in the transcript must not be
assumed to survive. The failure mode is a session that **repeats a path
it already abandoned**, which no oracle catches, because there is nothing
wrong with the code — only with having paid for it twice.

That is the same premise as the risk gate's statefulness carve-out: a
post-rotation orchestrator is a delegate to its own earlier self. The two
sections cite each other.

Rotation stays **manual**. Wiring a writer that flushes an orchestrator's
transcript on its behalf, in the same set that first measured the effect,
is how a cost win becomes a data-loss incident.

### The trade we declined

The naive table above is reproduced in the workflow doc on purpose, so
the next reader who finds it recognizes what it is. The trade it argues
for was: collect ~2x, and hand the **only actor holding write, shell and
network rights** to a weaker model. Routed children hold a read-only
allowlist (`view`, `grep`, `glob`) on `copilot-cli` and no tools at all
on `api`, which makes the orchestrator the privileged end of
`repository content → child output → privileged orchestrator →
destructive or governance action`. A weaker deputy at that end is a
**confused deputy**, and the children's sandbox does not close that path.

Declined. Keep the capable orchestrator and rotate its transcript
instead: it returns more than substitution ever would and costs no
security.

Finally, the three engine bootstrap files — which are supposed to differ
*only* in their engine-specific bootstrap — were disagreeing with each
other and with the config. `CLAUDE.md` and `GEMINI.md` still named "Set
110 Session 4 and Sets 111-112" as a live window; `AGENTS.md` had drifted
to a compressed variant of the same stale claim; all three pointed at
"human-tunable thresholds" Session 1 had just deleted as phantom. The
section is now byte-identical across all three (L-064-8, three-surface
drift by construction).

---

## What this set deliberately did not do

- **No cost gating or budget enforcement.** Set 130 established the
  measurement, Set 131 writes policy against it. A set that *refuses*
  work on cost grounds needs an operator attestation behind it.
- **No orchestrator model change**, for the reasons above, and recorded
  so a future set does not relitigate it from the naive table.
- **No automatic compaction trigger.** Documented, thresholded,
  contracted — not automated.
- **No change to the verifier-exclusion rule.** Nothing here moves a
  decision from human authority to AI authority, and nothing widens what
  may be skipped. The set widened what may be *routed*, and every
  widening it authorizes fails closed to "the orchestrator does it".

## Reference implementation

The set was executed against a complete reference implementation authored
ad-hoc, applied, tested, and reverted before the set began
(`C:\Users\adm.dennis.mitchell\source\set-131-reference\`). It was a
starting point, never a patch to trust: nothing in it had been through
cross-provider verification or any workflow gate. Its four embedded
design decisions were **re-decided and journaled** rather than inherited,
and Session 2 departed from it outright on the rename.
