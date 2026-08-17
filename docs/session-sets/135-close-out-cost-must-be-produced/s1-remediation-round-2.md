# Session 1 — remediation, round 2 (supplementary)

One blocking finding, **accepted in full**.

---

## The finding

> The audit's primary corpus is broader than the spec allowed, but its headline
> totals and Session 2 conclusions treat that broader corpus as authoritative.
>
> **Acceptance criterion (judgment):** the primary `cost-audit.json` totals and
> `cost-audit.md` conclusions are recomputed over only the in-scope schema-v4
> sessions with actual session history, with any schema-v3 or not-started rows
> either excluded or reported in a clearly separate appendix that is not used
> to size Session 2.

## Why it was right

The spec's Step 2 says *"Walk the schema-v4 sets"*. The audit walked every
session directory it could find and reported a corpus of **431**, of which
**166** are either schema-v3 or were never started. A never-started session has
no cost history to audit at all; including it in the denominator makes the
"share of sessions affected" smaller than the truth, in the same fail-open
direction the whole set exists to correct.

## The fix

1. `cost_classify2.py` gained a per-session **`inScope`** flag:
   `schemaVersion == 4 and sessionStatus in ("complete", "in-progress")`.
2. **Every headline figure** — `byClass`, `sessionsAuthoringACostBlock`,
   `costBlockVersionsCommitted`, the priceable counts, the unrecoverable
   population — is now computed over the in-scope list only.
3. A new top-level **`scope`** block in `cost-audit.json` states the rule,
   the in/out counts, the out-of-scope breakdown by
   `schema-v<n>/<status>`, its class distribution, and
   `outOfScopePriceable`.
4. `cost-audit.md` gained a **Scope** section as its first section, before any
   number is quoted.

## What the rescoping changed, stated plainly

| | before | after |
| :--- | ---: | ---: |
| denominator | 431 | **265** |
| `honestly_unmeasurable` | 413 | **247** |
| out-of-scope rows that are priceable | — | **0** |

**No cost figure moved.** All 166 out-of-scope rows classify as
`honestly_unmeasurable` and **none is priceable today**, so the understatement
($133.86, +27.6%), the store totals, and the per-session table are identical.
The correction is to the denominator and therefore to the *share* of sessions
affected — which is exactly what the finding said was at stake, and it is now
stated rather than implied.

## A second defect found while fixing this one (G-008)

Re-reading the unrecoverable population for scope correctness exposed a
sibling of the same class: the store-less engine test was a **hand-kept list**
(`("claude", "gemini", "codex")`) while the corpus carries **both** `claude`
(125) and `claude-code` (66) labels. It under-counted the store-less population
by 69 sessions — 129 reported against 198 actual.

Fixed by calling the module's own predicate,
`ai_router.seat_cost.engine_has_usage_store(engine)`, instead of restating its
knowledge. The audit now also reports `closedSessionsOnSeatEnginesWithAStore`
(63), which yields the sharper unrecoverable statement in `cost-audit.md`:
**of 63 closed seat sessions with a store, only 16 are priceable; the other 47
ran before ids were recorded.**

That fix was not requested by either round. It is the same defect the audit
reports in Finding 2 — restating a producer's knowledge instead of asking the
producer — committed by the audit itself.

## Criterion satisfaction

The criterion is met by exclusion **and** by separate reporting: out-of-scope
rows are excluded from every headline figure and are reported in the `scope`
block and the Scope section, with an explicit statement that they are not used
to size Session 2.
