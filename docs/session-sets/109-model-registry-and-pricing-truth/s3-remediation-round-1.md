# Session 3 — remediation of round 1

Round 1 (discovery, fan-out 2, verifier `gpt-5-6`, anthropic excluded) returned
**7 blocking findings**. The round-2 supplementary completeness pass returned
**VERIFIED with nothing new**, so these seven are the complete set.

The seven are **five distinct defects** — findings 1 and 4 are the same defect
stated twice, as are 3 and 7. **Every one is accepted; none is disputed.** All
five are real, and three of them are the same failure mode this session's own
module docstring claims to prevent: a fail-open path that manufactures a
structurally valid, plausible-looking number.

All fixes are in `ai_router/pricing_proposal.py` and its tests. No fix touched
`ai_router/pricing.py`, the six wired consumers, or `router-config.yaml`'s
rates.

---

## F1 — findings 1 and 4: a matching rate had no route to a `confirmed_on` stamp

**Accepted.** `build_proposal` emitted a change only when the page disagreed
with the config, so a model whose rate was already correct never appeared in
`changes`, never had a decision to accept, and could never be stamped. The
consequence is worse than a missing feature: a registry whose prices are all
**correct** could never become one whose prices are all **confirmed**, and once
S4 stamped the handful it corrected, those stamps would age out at 30 days with
no sanctioned way to refresh them. The verifier was right that this is
guaranteed rather than an edge case — it is the *steady state* of a working
system.

**Fix.** An unchanged rate now appears as a change with
`"change_type": "confirm"`, going through the identical accept/reject
machinery. Accepting it writes **only** the stamp — `apply_changes` skips the
rate write entirely for a confirm entry, so even a hand-doctored `proposed`
cannot become a rate change through that path.

It is deliberately not noise: a confirm entry appears only while the model is
**unstamped or stale**, reusing `pricing.unconfirmed_and_stale`. A freshly
confirmed model stays out of the proposal until its stamp ages past
`review_frequency_days`.

Pinned by `test_a_matching_but_unstamped_rate_becomes_a_confirmation`,
`test_a_matching_and_freshly_stamped_rate_produces_no_change`,
`test_a_matching_rate_with_a_stale_stamp_comes_back`, and
`test_a_confirmation_stamps_without_touching_the_rate`.

**Verified live:** the re-run now offers *5 rate changes and 5 confirmations*,
where before it offered 5 changes and no path to stamp the other 5.

## F2 — finding 2: a failed refresh left a stale proposal available to apply

**Accepted.** `--fetch` correctly wrote nothing when a page failed, but an
edited proposal from an earlier run was still sitting at the default path. The
next `--apply` would read it, write its months-old numbers, and stamp them
`confirmed_on` **today** — a machine-authored rate wearing a human's
confirmation. Transient provider failures on a live-page tool make this a
probable lifecycle failure, not a theoretical one.

**Fix.** On a fatal fetch or parse failure, an existing proposal at the target
path is **moved aside** to `pricing-proposal.stale.json`, loudly, and the next
`--apply` finds nothing and says to re-run `--fetch`. Moved rather than
deleted: the operator's accept/reject work is theirs, and this command has no
business destroying it. A failure to move is itself reported rather than
swallowed.

Pinned by `test_a_failed_refresh_moves_the_previous_proposal_out_of_reach` and
`test_apply_after_a_failed_refresh_finds_nothing_to_apply`.

## F3 — findings 3 and 7: the Google parser had explicit fail-open paths

**Accepted, and this was the sharpest of the seven.** When a model's Standard
table yielded a different number of priced lines on the input and output sides,
the parser paired the first of each and returned a flat rate. I wrote that path
with a comment explaining why a modality split is not a tier — and then guessed
anyway. Pairing line 1 with line 1 across two cells split on *different axes*
is exactly the plausible-wrong-number manufacture the module docstring
promises never to do.

**How bad it actually was, measured rather than assumed.** Removing the
fail-open showed that `gemini-2.5-flash` — a live, routed, tier-1 model — was
going through it on the **unmodified page today**. Its input cell reads
`$0.30 (text / image / video)` and `$1.00 (audio)` against a single output
price. The fail-open returned `$0.30/$2.50`, which is *correct*. It was correct
by luck: had Google listed audio first, the tool would have proposed a rate
3.3× too high with no signal at all.

**Fix, in two parts** rather than one, because a blanket refusal would have
been wrong too:

1. A multi-rate cell where **no** line carries a prompt-size bound is a
   **modality split**, and the router buys text. `_priced_lines` selects the
   line whose qualifier names text (`(text / image / video)`). That is a
   *read* — labelled and unambiguous — where first-wins was a guess. If zero or
   more than one line names text, it is unreadable.
2. Anything else the parser cannot pair — differing line counts, disagreeing
   tier bounds, tiers with no unbounded row — is **unreadable**.

An unreadable section is neither fatal nor silent. It is fatal only if the
whole page structure changed (unchanged behaviour); it is per-model here, and
`build_proposal` reports a **configured** model whose section was unreadable as
`NOT CHECKED`, with the reason. A model nobody configured — most of the ~100
sections price video, images, TTS, robotics — is simply ignored, so one
unreadable section cannot fail a run that never cared about it.

Pinned by `test_a_modality_split_reads_the_labelled_text_rate`,
`test_an_unlabelled_multi_rate_cell_is_unreadable`,
`test_two_text_lines_are_unreadable_rather_than_first_wins`,
`test_mismatched_google_line_counts_do_not_become_a_flat_price`,
`test_disagreeing_tier_bounds_do_not_become_a_price`,
`test_an_unreadable_section_is_reported_as_not_checked_not_proposed`, and
`test_an_unreadable_model_nobody_configured_is_simply_ignored`.

## F4 — finding 5: the global rollup could read falsely fresh

**Accepted.** `apply_changes` set `metadata.pricing_reviewed` to the oldest
**existing** stamp. With two of twelve models stamped, the oldest existing
stamp is today — so the extension's Cost Dashboard would declare the whole file
freshly reviewed while ten rates sat unconfirmed. My own session note claimed
this field "cannot drift from the stamps it summarises"; it could, in the one
direction that matters.

**Fix.** `_refresh_rollup` advances the field only when **every priced model**
carries a stamp. Otherwise it stays exactly where it was. A rollup that
summarises a subset is worse than a stale one, because it is confidently wrong
rather than visibly old. F1's fix is what makes the all-stamped state reachable
at all.

Pinned by `test_the_rollup_does_NOT_advance_while_a_priced_model_is_unstamped`
and `test_the_rollup_advances_once_every_priced_model_is_stamped`.

## F5 — finding 6: a stale proposal could be applied to a repointed alias

**Accepted.** The proposal records the `model_id` it was built against, but
`apply_changes` never checked it. Session 4's explicit work is **repointing
aliases** (`opus` → Opus 5, `sonnet` → Sonnet 5, splitting `gpt-5-6`), so a
proposal fetched before a repoint would write the *old* model's rates into the
*new* model's entry and stamp them confirmed. The verifier correctly noted that
model-id curation and price confirmation are the next session's explicitly
coupled work, which makes this probable rather than hypothetical.

**Fix.** `apply_changes` refuses when the entry's current `model_id` differs
from the one the change was built against, naming both and leaving the file
untouched.

Pinned by `test_apply_refuses_when_the_alias_now_points_at_a_different_model`.

---

## State after remediation

- Targeted suites: **129 passed** across `test_pricing_schema.py` and
  `test_pricing_proposal.py` (+18 over the 111 that entered round 1). Full
  suite re-run recorded in the activity log.
- Live `--fetch` re-run against all three pages: **5 rate changes, 5
  confirmations, 2 not-checked, exit 1**, config untouched.
- No fix required a change to `ai_router/pricing.py`, to any of the six wired
  consumers, or to a single rate in `router-config.yaml`.
