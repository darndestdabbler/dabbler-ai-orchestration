# Session 3 — remediation notes, round 1

Round 1 (discovery, 2-way fan-out, both calls `gpt-5.5`, `anthropic` excluded
as the orchestrator's effective provider) returned **VERIFIED with 0 blocking
findings**. Both calls recorded one Nit each. Under the constitution a
Minor-only round is effectively VERIFIED and the nits may simply be recorded —
both were nonetheless **fixed**, because one is an arithmetic overstatement
inside a paragraph headed *"Payback, stated honestly"* and the other weakens
the exact table the section exists to make un-re-derivable.

Both fixes are confined to `docs/ai-led-session-workflow.md` → *Rotation, and
the trade we declined*. No code, config, test or schema changed.

---

## Nit 1 (call 2, failure-scenario lens) — the payback figure was optimistic

**Finding.** The 150–300K payback was stated as "inside ~30". On the section's
own savings range that is 400 / ~12–13 ≈ **31–33** inferences, and if the
post-flush context is estimated from the 25–75K band average rather than the
measured 54K it is closer to **42**. Docs-only precision; does not undermine
the guidance.

**Accepted — the verifier's arithmetic is correct and mine was rounded the
wrong way.** The paragraph is the one place in the section that promises an
honest number, so an optimistic rounding there is worse than it would be
anywhere else.

**Fix.** The payback is now stated as a range with both endpoints named and
attributed:

> Charged the full 400 anyway, a rotation fired at the 150–300K band repays in
> roughly **30–40 inferences** — ~31 if the post-flush context lands near the
> measured 54K, ~42 if it settles at the 25–75K band average — and one fired
> above 300K repays in roughly **13–15**.

Arithmetic, both endpoints, from the section's own band table:

| case | credits/inference before | after | saving | 400 / saving |
| :--- | ---: | ---: | ---: | ---: |
| 150–300K, post-flush at measured 54K | 17.18 | ~4.3 | 12.88 | **31.1** |
| 150–300K, post-flush at 25–75K average | 17.18 | 7.65 | 9.53 | **42.0** |
| >300K, post-flush at measured 54K | 35.77 | ~4.3 | 31.47 | **12.7** |
| >300K, post-flush at 25–75K average | 35.77 | 7.65 | 28.12 | **14.2** |

The headline `a9f211a7` payback of ~14 inferences is unchanged: it is a
measured event, not an estimate, and it is stated separately.

## Nit 2 (call 1, spec-conformance lens) — the matched-context table was narrower than its source

**Finding.** The workflow doc's matched-context table showed only
`claude-opus-5` vs `gpt-5.5`, while `spec.md`'s source table also carries
`gemini-3.1-pro` and `sonnet-4.6`. The ~1.7–2x conclusion still stands, but
the section is less self-contained than the spec.

**Accepted, and the fix is worth more than the finding.** The section's stated
purpose is that a future reader who rediscovers the naive per-model table
recognises it rather than re-deriving the wrong conclusion. A two-column
matched table refutes the *`gpt-5.5`* version of that argument only; the naive
table's cheapest rows are `gemini-3.1-pro` (2.65) and `sonnet-4.6` (4.51), and
those were exactly the rows a reader would have reached for.

**Fix.** The table now reproduces all four models and all five bands from
`spec.md` verbatim, with the `n` for each cell, plus one paragraph naming what
the empty cells mean:

> **The blank cells are the confound, not a discount.** The two cheap-looking
> models have no usable data above 150K because nothing ever asked them to
> hold an orchestrator's context — so their headline averages are a
> measurement of the role they were given, not of what they would cost in the
> orchestrator's seat.

That is trap T1 stated where a reader meets the evidence, rather than only in
the spec. The `26.71 (n=6, ignore)` cell is carried across with its
`ignore` marker intact rather than dropped, because a six-sample cell that
contradicts the trend is itself part of the honest record.

---

## What was NOT changed

- **No number was re-derived.** Every figure still traces to `spec.md`, which
  is this set's source of record; the fixes add cells and widen a range, they
  do not restate a measurement.
- **The ~150K threshold stands.** Neither verifier challenged it, and the
  round-1 conventions block explicitly invited attack on it.
- **The survival contract stays unenforced prose**, as the conventions block
  declared and the Step 3.5 routed recommendation independently endorsed
  (a checkable survival contract belongs in the next set).
- **Nothing outside the one section moved.** `AGENTS.md`, `CLAUDE.md`,
  `GEMINI.md`, `orchestration-strategy.md`, the changelog fragment and
  `change-log.md` are untouched by this remediation, so the byte-identity of
  the three engine pointers is preserved.

`post_round_delta` classifies this delta as **shipped-code** (A4.2) — the
changed path sits outside every declared test surface — so it owes exactly one
delta-scoped `verify_session --phase remediation-review`, which is round 2.
Running it here rather than meeting it inside `close_session` costs the same
money and is the only version in which its findings can be acted on.
