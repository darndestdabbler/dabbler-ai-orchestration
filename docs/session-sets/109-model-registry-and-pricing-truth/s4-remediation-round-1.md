# Session 4 — remediation of rounds 1 and 2

Four blocking Majors across the two discovery passes. **All four accepted, none
disputed.** Two were correctness defects in code this session wrote; one was a
deferral whose stated justification had expired; one caught this session
violating its own spec's risk register.

| # | Round | Finding | Disposition |
| :--- | :--- | :--- | :--- |
| 1 | 1 | The provider model drift check remains unwired | **Fixed** — wired into `drift_guard.py` |
| 2 | 2 | `--fetch` exits 0 when configured models were not checked | **Fixed** — unchecked entries hold the exit code |
| 3 | 2 | Correction factors applied to newly, correctly priced rows | **Fixed** — scoped to pre-correction rows by timestamp |
| 4 | 2 | The discovery pin moved to Luna without the evidence the plan requires | **Fixed by withdrawal** — mechanism ships, pin does not |

---

## 1. The drift check was unwired (round 1, Major)

**Accepted in full.** The set's end-of-set deliverable is *"a drift gate that
fails loud on an id the provider does not offer"*, and nothing invoked it. A
gate nobody runs is exactly as invisible as the drift it was built to catch,
which is the failure this whole set exists to end.

**My recorded reason for deferring was factually wrong**, and that is the part
worth naming. Three files said arming it would turn a build that goes red on a
commit into one that "can go red on a provider's schedule". `--check` reads
only `router-config.yaml` and the committed `model-inventory.lock` and **never
probes a provider**. It is deterministic. The stated risk did not exist.

The *real* reason it was unwired — recorded by S1 — was that the repository's
own registry failed the check, so arming it would have turned the suite red on
the day it landed. This session corrected the registry. That reason expired,
and the deferral outlived its cause.

**Fix:** `check_model_registry_matches_providers` in
`ai_router/scripts/drift_guard.py`, registered in `ALL_CHECKS`. Absent inputs
report nothing (consumer checkouts may carry neither file); a lockfile that
cannot be read is a violation rather than a skip.

**Falsifier:** re-planting `model_id: gpt-5.6` — the original defect — turns
the guard red with the offending alias named. Restored; the guard passes.

Five tests, including `test_the_check_is_registered_so_it_actually_runs`
(the finding was not "the check is wrong", it was "nothing calls it") and
`test_the_real_repository_passes_the_model_registry_check`, an assertion that
could not have been written before this session.

Corrected the false rationale in all three places it appeared:
`model_inventory.py`'s docstring, `router-config.yaml`'s header, and
`ai_router/CHANGELOG.md`.

## 2. `--fetch` exited 0 over an unchecked rate (round 2, Major)

**Accepted in full, and it is a textbook L-069-1 miss.** Earlier in this same
session I noticed that a *held* entry (`not_comparable_entries`) let `--fetch`
exit 0 and print an all-clear, and I fixed it. I fixed the reported site and
left its sibling four lines away: `unmatched_config_entries` — the same "this
rate was not checked" fact, reached through a different branch — still exited
0 with `[x] NOT CHECKED` printed above it.

The failure scenario is ordinary, not hypothetical: a provider drops or renames
one pricing row, that model lands in `unmatched_config_entries`, and a CI or
cron wrapper records the registry as verified against the pages.

**Fix:** both buckets now hold the exit code non-zero and both deny the
all-clear line. Each unmatched entry carries a `blocking` flag: an entry that
is neither routable nor priced is **informational**, because it has no rate to
check — `gemini-3-pro-preview` is an id Google genuinely offers and genuinely
does not price, since published pricing pages list GA models. Blocking on it
would pin the exit code at 1 forever and teach an operator to ignore it. The
verifier proposed this distinction itself.

Four tests, covering both blocking classes and both all-clear outcomes.

## 3. The correction disclosure overstated (round 2, Major)

**Accepted in full.** `historical_correction_notes` multiplied a model's
**entire** aggregate by its factor while the note it printed said *"rows dated
before 2026-08-04"*. `gpt-5-5` and `gemini-3-1-pro` are still live aliases, so
a call made after the registry was corrected — priced from a confirmed rate —
would have been reported as understated 2×.

A cost disclosure that overstates is the same defect it discloses, pointing the
other way. That it appeared in the code written to *fix* silent miscounting is
the uncomfortable part.

**Fix:** the metrics loader now carries `uncorrected_cost` per model, summed
only over rows preceding that model's correction, and the note is scoped to
that portion (`"$2.0000 of the $10.0000"`), or omitted entirely when every row
is post-correction.

**A second defect surfaced while fixing the first.** The initial fix compared
**dates**, and the registry was corrected mid-afternoon — so all 254 of that
morning's wrong-rate `gpt-5-6` rows were reclassified as already fixed and the
disclosure vanished from the live report. The cutoff is now an **instant**,
bounded by the ledger itself: the last `gpt-5-6` row is `19:28:41Z` and the
first `gpt-5-6-luna` row — an alias that could not exist before the fix — is
`20:17:23Z`, so `20:00:00Z` sits inside the gap and misclassifies nothing. A
row with an unreadable stamp counts as pre-correction: over-disclosing a cent
beats silently dropping a correction.

Verified against the live report: the caveat is back on the pre-fix rows and
absent from the new `gpt-5-6-luna` / `gpt-5-6-sol` rows, which are correctly
priced.

## 4. The Luna pin lacked the evidence the plan requires (round 2, Major)

**Accepted, and resolved by withdrawing the change rather than by adding
justification for it.**

The finding quotes the spec's risk register verbatim, and I confirmed the
quote against `spec.md` before accepting it:

> Moving the fan-out to a cheaper variant may change finding quality; that is
> an empirical question, and the pin should move only with evidence, not with
> the price list.

I moved it on the price list. Everything I offered as justification —
`$0.20/$1.20` against `$5.00/$30.00`, the Set 096 Jaccard overlap, the
downstream adjudication — argues that discovery is the right *place* for a
cheap model. None of it is evidence that *this* cheap model finds what the
expensive one finds. The spec anticipated exactly that substitution.

**What evidence exists points the other way**, and this session produced it:

| verifier | calls | cost | findings |
| :--- | ---: | ---: | ---: |
| `gpt-5-6-luna` (discovery) | 2 | $0.0457 | 1 Major |
| `gpt-5-6-sol` (supplementary) | 1 | $0.5203 | 3 further Majors |

Two of Sol's three are ordinary correctness bugs — items 2 and 3 above — that a
discovery pass ought to have caught. The framings differ (supplementary is a
completeness critic by design), so this is a **data point, not an experiment**,
and it is not evidence against Luna so much as an absence of evidence for it.
Either way it is not grounds for arming the pin.

**Fix:** `verification.discovery.model` is committed **commented out**, above a
note specifying what would arm it — both variants over several past sessions'
bundles with known findings, recall and material false negatives compared, and
an acceptance threshold written down *before* looking. `route(prefer_model=...)`
and the `verify_session` wiring ship complete and tested; the path is inert
until one line is uncommented.

`test_the_live_config_ships_the_mechanism_with_the_pin_UNSET` asserts the
withdrawal, so re-arming it fails a test first and requires a decision.

Propagated to every echo in one pass (L-065-1): the `gpt-5-6-luna` registry
notes, `ai_router/CHANGELOG.md`, `change-log.md`, and the summary table.

---

## What did not change

No rate in `router-config.yaml` moved during remediation. The registry
corrections, the `confirmed_on` stamps, and the cost reconciliation are all
untouched by these four fixes — every one of them landed in the tooling and
the gates around the registry, not in the registry itself.

## Suite

The remediation adds **14 tests** (5 drift-guard, 4 proposal exit-code/render,
4 cost-correction scoping, 1 pin-withdrawal) and changes three existing
assertions of this session's own, each because the contract behind it
deliberately changed. A full run on the post-remediation tree is the recorded
baseline.

---

# Addendum — the path-aware critique found a fifth Major, after VERIFIED

The set-terminal critique (`pathAwareCritique: advisory`) ran **after** the
verification loop closed VERIFIED, and `openai/gpt-5.6-sol` found a real Major
that three verification rounds had missed.

## 5. `pricing: null` walked straight through the fail-closed guard

**Accepted, reproduced, fixed.** The guard added earlier in this session claims
that a routable entry with no rates fails config load. It did not, if the entry
wrote `pricing:` with nothing after it:

```python
>>> entry = {"provider": "openai", "is_enabled": True, "pricing": None}
>>> validate_model_rates("sneaky", entry)      # no exception
>>> resolve_rates(entry)
(0.0, 0.0)
>>> worst_case_output_cost_per_1m(entry)
0.0
```

A routable, unknown-price model that loads clean and **wins every
cheapest-candidate tiebreak** — precisely the defect the guard exists to close,
reachable by typing one word.

**I introduced it while fixing something else.** The guard first tested
`not rows`; the round-1 suite showed that swallowed `pricing: []`'s sharper
"non-empty list" error, so I narrowed it to `PRICING_KEY not in entry`. That
narrowing is what let an explicit null through: the key *is* present, so the
guard skipped, and the `rows is None` branch below had nothing to check.

**Fix:** `declared = entry.get(PRICING_KEY) is not None`. Three cases now stay
distinct — `pricing: null` and an absent key are both *not declared* (guard
fires); `pricing: []` is *declared and malformed* (keeps its own error).

**Falsifier:** reverting to `PRICING_KEY in entry` fails two tests. Restored.

Four tests, including one that asserts the *stakes* rather than only the
behaviour (`resolve_rates` → `(0.0, 0.0)` and the sort scalar → `0.0`), so a
future reader can see why the guard matters without reconstructing it.

## What this says about the session

**Three of this session's own fixes each opened a defect that a later reviewer
found:** the exit-code fix missed its sibling branch (round 2), the correction
scoping introduced a date-vs-instant error (found while fixing it), and the
rate guard's `[]` refinement opened the `null` hole (found by the critique).
The pattern is consistent — each was a *narrowing* made to preserve a
neighbouring behaviour, and each narrowing was slightly too wide.

That is an argument for the layered surfaces, not against them. The routed
rounds, the self-review, and the path-aware critique each caught something the
others did not, and the critique earned its keep on the last one after the loop
had already returned VERIFIED.

## The critique took three runs to produce two real reviews

Recorded because the artifact does not show it:

1. **Run 1 reviewed the wrong session.** `pull_critique` builds its prompt from
   `disposition.json`, which still held Session 3's summary — so both critics
   checked S3's claims. The tell: one "confirmed" that no registry entry used
   the `pricing:` key, true of S3 and false of the tree it was reading. **The
   disposition must be authored before the critique**, and nothing says so.
2. **Runs 2 and 3 lost the OpenAI critic.** `openai/gpt-5.4` returned a verdict
   reading *"unable to complete a grounded review ... conflicting developer
   instructions"* — a non-review that nonetheless satisfies the artifact
   validator, because a finding with a description counts as content-non-trivial.
   The `>= 2 distinct providers` property is shape-checked, not
   substance-checked.
3. **Run 4 pinned `openai:gpt-5.6-sol`** and got a substantive review — the one
   that found the Major above.

Both are recorded as residuals in `ai_router/CHANGELOG.md`. The committed
artifact is run 4.

---

# Round 4 — the withdrawal was itself found blocking, and this is an operator decision

Round 4 (`gpt-5-6-sol`, remediation-review) **accepted all four prior fixes**
(4 accepted, 0 rejected, 0 with-modification) and raised **one new Major**:

> The L4 remediation withdraws an explicit end-of-set deliverable instead of
> completing it. [...] The risk control requires evidence before moving the
> pin; it does not authorize replacing the deliverable with an inert
> mechanism. [...] The session cannot legitimately close as complete.

**It is right, and it is not remediable by this session.** Round 2 said *do not
arm the pin without evidence*. Round 4 says *do not close without the
deliverable*. Both quote the same `spec.md`:

| clause | says |
| :--- | :--- |
| Session 4 step 3 + "Ends with" | *"the discovery fan-out runs on the cheap variant"* — an explicit deliverable |
| "Risks this set should expect" | *"the pin should move only with evidence, not with the price list"* |

With no evidence in hand, the two cannot both be satisfied. Producing the
evidence properly — both variants over several past sessions' bundles, recall
and false negatives compared against a threshold declared in advance — is a
work item, not a remediation step.

**This is not re-rounded.** The constitution forbids re-rounding a disputed
finding and prescribes the ladder: a third-provider opinion, or operator
adjudication.

## The third-provider opinion (operator pre-authorized)

Routed with **both anthropic and openai excluded** → `google / gemini-2.5-pro`,
$0.0059, truncation-clean. Full response:
`s4-third-provider-adjudication.json`. Its verdict:

> **(b) Ship the mechanism with the pin unset (current state), and close the
> session with the deliverable recorded as deliberately unmet pending
> evidence.**
>
> [...] Risk controls like Clause B exist specifically to qualify or gate other
> clauses, like the deliverable in Clause A. When a conflict arises, the risk
> control must prevail. [...] Forcing an n=1 comparison now is poor process; it
> attempts to satisfy a requirement for rigorous evidence with a statistically
> meaningless data point, which is precisely the kind of corner-cutting Clause
> B is designed to prevent.
>
> Round 4 is correct that a deliverable is unmet but wrong about the
> implication. [...] The session successfully delivered the *mechanism*. The
> *activation* is contingent on an evidence-gathering process that was not part
> of this session's scope.

And, asked directly whose decision the close is:

> The decision to close a session that cannot meet a deliverable due to a
> conflicting internal control belongs to the operator or the authority
> accountable for the spec.

It also confirmed the framing was not motivated reasoning: *"The orchestrator
is right that the clauses conflict; one mandates an unconditional action while
the other imposes a precondition the session was not scoped to meet."*

## What this session did about it

Deliberately **did not** rewrite the pin's `n=1` justification into something
that reads like evidence, and **did not** close over the finding on its own
authority. Both are the operator's call and both were declined here, which is
why round 4's finding stands unremediated in the record rather than
argued away.

`disposition.json` carries it as the single open blocker.
