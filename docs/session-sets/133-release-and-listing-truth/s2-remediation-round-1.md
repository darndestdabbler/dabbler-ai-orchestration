# Remediation — Set 133 Session 2, round 1 (discovery)

Two Major findings, **both rejected as false positives on deterministic
evidence** — never on the orchestrator's own reasoning (C-003). Each rejection
names a command whose output settles it.

The full merged record for both discovery passes, including the two findings
this session **accepted** against itself in round 2, is in
[`s2-remediation-round-2.md`](s2-remediation-round-2.md).

---

## REJECTED — Issue 1: "unplanned work outside the session's declared scope"

Three sub-claims, each false.

### (a) `ai-assignment.md` is not in the spec's `Touches`

Appending to it is **Step 3.5 of the session constitution**, run by every
session: *"append this session's `ai-assignment.md` block and the
next-orchestrator / next-set recommendations via routed analysis."* A spec's
`Touches` names deliverables, not the framework bookkeeping every session
writes — `activity-log.json`, `session-state.json`, `session-events.jsonl`,
`checklist-posts.jsonl` and `test-runs.jsonl` are likewise absent from
`Touches` and likewise written every time.

**Precedent rather than argument:** Session 1's `Touches` (spec.md line 116)
omits `ai-assignment.md` identically, S1's `disposition.json` lists that path
in `files_changed`, and S1 passed four verification rounds and a close on
exactly this shape.

### (b) Three `decisions.jsonl` entries where the spec named one

`Creates` names the entry the session **must** produce; it does not cap the
journal. The constitution requires the opposite of a cap — *"Journal every
call to the per-set `decisions.jsonl`."* The two extra entries record the
verifier-fallback decisions forced by a provider outage, so writing them is
compliance.

The criterion's alternative branch — *remove the two unplanned records* —
would delete an audit trail to make a plan look accurate, on a set whose
subject is records telling the truth.

### (c) This session created `docs/session-sets/134-ceremony-cost-and-what-to-cut/`

**False, decisively.**

| File | mtime |
|---|---|
| `134-…/spec.md` | `2026-08-15 07:16:15` |
| `134-…/session-state.json` | `2026-08-15 07:16:21` |
| — Session 2 registered | `2026-08-15 13:15:46` |
| — Session **1** registered | `2026-08-15 07:21:41` |

Six hours older than this session, and five minutes older than Session 1. It
is untracked, was authored out-of-band, and **will not be committed here**. It
reached the evidence bundle because `git status --short` lists untracked paths
and the untracked-content collector inlined its `spec.md` — a reasonable
misreading, and the reason it is stated explicitly rather than left implicit.

---

## REJECTED — Issue 2: "`change-log.md` contents withheld from review"

**Factually false — the file was inlined in full.** Re-running the same
assembly the round used:

```
INCLUDED (content inlined):
    docs/session-sets/133-release-and-listing-truth/change-log.md   11217 chars
```

The verifier held all 11,217 characters of the file it reported as absent.

**What is real belongs to the tooling.** The pre-close framing at
`ai_router/verify_session.py:2823-2826` tells the verifier that
`change-log.md` and the other close-out artifacts *"do not exist yet"* — an
assertion about the tree, where the intent is only that their absence would
not be a defect. A terminal session is supposed to write `change-log.md`
*before* verification, because the spec lists it as a deliverable and it
should be reviewed. The bundle therefore asserted the file's absence while
inlining its contents; the verifier correctly spotted the contradiction and
drew the wrong conclusion from it.

Recorded as a residual against a follow-on router set. Not fixed here — this
set ships no product code.
