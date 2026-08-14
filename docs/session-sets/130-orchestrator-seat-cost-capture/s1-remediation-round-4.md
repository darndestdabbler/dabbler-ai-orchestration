# Session 1 — remediation of Round 4

One Major finding, from the fix-delta review of the guidance/ceiling
change. Accepted; not disputed.

---

## The finding

> The recorded full-suite runs are stale after the fix-delta
> guidance/config change.

Correct at the moment it was raised. The three runs of record were taken
at 03:16 (pytest), 03:17 (mocha) and 03:57 (playwright); the ceiling
change to `ai_router/router-config.yaml` landed at ~04:01. That file sits
under `ai_router/`, which all three suites cover, so the digest gate
stales all three.

The verifier also picked the right kind of acceptance criterion —
**executable**, not judgment:

```
python ai_router/run_of_record.py check \
    --session-set-dir docs/session-sets/130-orchestrator-seat-cost-capture \
    --files-changed ai_router/router-config.yaml docs/planning/project-guidance.md \
    --check      # expect exit 0
```

## The fix

Re-run and re-record, which was already the sequenced plan — the delta
review was deliberately taken *before* the re-runs so that the re-runs
would not themselves be staled by remediation.

| suite | outcome | note |
| :--- | :--- | :--- |
| pytest | **4,398 passed / 9 skipped**, 600s | Re-run in full. This is the suite that actually asserts the guidance ceilings against the real files, so the change is genuinely in its blast radius. |
| mocha | **1,455 passing / 2 pending**, 43s | Re-run in full; it costs 43 seconds. |
| playwright | **31/31**, 514s | **Not re-run.** Re-recorded on the 03:57 evidence, with the composition disclosed. |

## Why Playwright was re-recorded rather than re-run

Stated plainly because it is the part a reviewer should check hardest.

The **entire** delta between the recorded Playwright run and this record
is two integers under `guidance.preload`
(`total_ceiling_tokens` 12200 → 12600, `project-guidance.md` 3499 → 3930)
plus their explanatory comments, and a new principle in
`docs/planning/project-guidance.md` — a file **no suite declares as an
input**.

Non-reachability is **shown, not asserted**:

- `grep -i 'preload|ceiling_tokens|ceilingTokens'` over
  `tools/dabbler-ai-orchestration/src` → **zero** occurrences. (The
  `guidance` hits in `consumerBootstrap.ts` concern scaffolding the
  guidance *files* into a consumer repo, not the ceiling config.)
- `grep -i 'router-config|routerConfig'` over
  `src/test/playwright` → **zero** occurrences.

Operator-attested and journaled in `decisions.jsonl`. This is the line
the session's own new principle draws: *a different route to the same
evidence, never less evidence.* Every Playwright spec executed and
passed; what was declined was re-deriving that identical result against a
delta that provably cannot reach it.

## The residual this exposes

Recorded here rather than fixed, because it is not this set's scope.

`covers` is a **path prefix**, so any edit to a large shared config
stales every suite covering its directory — including a comment-only
edit, or an edit to a key no consumer of that suite reads. Set 129 made
suites declare their inputs; the next refinement is per-key or per-file
granularity for shared configuration. **No set owns this.** Carried to
Step 9.
