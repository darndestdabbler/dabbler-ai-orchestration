# Session 1 — remediation, round 1

One blocking Major from the discovery round. **Accepted without argument.**
The supplementary completeness pass (round 2) ran *before* this remediation,
per the loop discipline, and returned VERIFIED with zero findings, so nothing
joined the merge.

---

## Finding 1 (Major, Correctness) — accepted and fixed

> *"The operative latency/reduction conclusions use an ignored machine-local
> metrics file, violating the session's committed-artifacts-only
> requirement."*

**Acceptance criterion (judgment):** *"The Session 1 attribution either
removes all operative conclusions derived from ignored local router metrics,
or replaces them with committed, reproducible evidence and clearly separates
any remaining machine-local observations as non-operative."*

### Why it is correct

Verified independently before fixing, rather than taken on the verifier's
word:

```
$ git check-ignore -v ai_router/router-metrics.jsonl
.gitignore:7:router-metrics.jsonl       ai_router/router-metrics.jsonl

$ git ls-files ai_router/router-metrics.jsonl
(empty — untracked)
```

The file is gitignored and untracked. The spec's Session 1 line is *"Analysis
over committed artifacts only"*, and the document nonetheless listed
`router-metrics.jsonl` as a peer source in **Method**, derived C1's latency
split from it, and — the part that made it blocking — placed *"model latency
24% of the loop"* in the §5 list headed **"the corrected values are what the
rest of the set uses."** That is the precise mechanism the verifier's failure
scenario describes: a Session 2 or 3 orchestrator inheriting a number no
fresh checkout can reproduce, and sizing a lever against it.

The document did disclose the file's machine-local status in §6. **Disclosure
in a footnote does not cancel promotion in the inheritance list** — the same
error shape Set 133 S1 recorded, where an honest disclosure sat beside a
decision the disclosure should have prevented.

### The fix — quarantine, not deletion

Deleting the observation was rejected: it is real evidence about one seat, and
the *absence* of any committed latency instrument is itself a finding worth
carrying. The fix separates it instead, in four places:

| # | location | change |
| :--- | :--- | :--- |
| 1 | **Method** | Sources split into a **committed** list ("every operative number below rests only on these") and a quarantine note stating the file is gitignored, that nothing derived from it is operative, and that the two places it appears are strikeable. |
| 2 | **§1** | *"The lever is rounds, not models"* re-derived from the committed `sN-rounds.jsonl` figure alone: a round costs +17.9 min, so removing one dominates any per-call speed-up **whatever** the latency share is. The latency corroboration is demoted to a parenthetical. |
| 3 | **§4 C1** | Row retitled **"Latency split — NON-OPERATIVE"**, italicised, scoped to "one seat's 56 sessions", and carrying the explicit clause: *"if false, C1's measured minutes are unchanged, because they come from `sN-rounds.jsonl` alone."* |
| 4 | **§5** | *"model latency 24% of the loop"* **removed** from the inherited-values list, replaced by an explicit prohibition: Sessions 2 and 3 inherit no latency figure and must not size a cut against one. |

§6's integrity note was expanded to cite `.gitignore:7`, state the exclusion,
and record that **the framework has no committed instrument for routed-call
latency at all**.

### Consistency propagation (G-012)

The claim echoed in three further places. All three were reconciled in the
same pass rather than point-fixed:

- `s1-conventions.md` — the verifier-facing source list no longer names
  `router-metrics.jsonl`, and now carries the round-1 correction so the
  remediation-review round sees the corrected framing and can test it.
- `decisions.jsonl` — the round-1 record's closing parenthetical still read
  *"(loop 35.8 min, tail 12.6 min, latency 24% of the loop)"*. Journals are
  append-only and written by a sanctioned writer, so a **correcting record**
  was appended via `ai_router.decision_journal` rather than the original
  edited.
- `activity-log.json` — the step-2 entry states the 24% figure. Append-only
  by the same rule; the correction is carried by this session's remediation
  step entry rather than by editing history.

### What did NOT change, and why

**No measured minutes moved.** C1's 17.9 min/round, its 2,332-minute corpus
total, C2's 18.6 min/session, and every disqualification (C3's 67 minutes,
C4's 1.1, C5's 4.6) derive from `sN-rounds.jsonl`, `test-runs.jsonl`,
`activity-log.json` and `session-state.json` — all committed, all
reproducible from a fresh checkout. The finding struck at how one number was
*framed*, not at the arithmetic, and the candidate list is unchanged.

### Acceptance evidence

The criterion is judgment-kind, so it is answered directly. After the fix:

- **Zero** operative conclusions derive from the ignored file. The §5
  inheritance list contains only committed-source values and now explicitly
  excludes latency.
- The one surviving mention is labelled non-operative, scoped to its seat, and
  states its own irrelevance to the candidate's minutes.
- A reader on a fresh checkout can reproduce every number the set acts on.
