<!-- routed: model=gpt-5.5 provider=openai task_type=architecture
     exclude_providers=['anthropic'] (the orchestrator's own effective
     provider, so the advice cannot be self-interested); router's own verify
     pass: gemini-3.1-pro-preview -> VERIFIED, 0 issues. Provenance read from
     ai_router/router-metrics.jsonl (2026-08-14T15:52:25Z and 15:54:32Z).
     Set-terminal session: no next-orchestrator question is live, so this
     round asked only for the next SESSION SET. Raw, unedited. -->

## Next session set

**Run the already-authored Set 132 — `session-length-and-explorer-captions` — next; do not author a competing fresh set first.** It fixes an active workflow instrument defect before more policy is built on bad counts: `spec_admission` currently miscounts nested ordered lists and misclassifies work steps that merely mention ceremony words, which can both pollute session plans and corrupt the step-count evidence behind the N/compaction decision. It would ship the small Explorer caption fixes, repair and falsify the step-counting gate, rebuild the session-length table on corrected data, produce the compaction-threshold/N recommendation brief, and design the causal experiment without yet changing the cap or implementing automatic compaction. This should precede telemetry and cost-surface work because it protects the session-set admission machinery itself and resolves an operator-directed coupled question while the Set 131 rotation evidence is fresh.

## Runners-up

1. **Delegation telemetry and audit trail.** Author this immediately after 132: record each direct-vs-routed decision, the `direct_work_reason_code` when work is kept, task type, effective provider constraints, child-budget warnings, and aggregate reporting. Set 131’s policy now claims auditable reason codes, but no data source exists; every session without it loses evidence.

2. **Close-session seat conversation ID backstop.** Make `close_session` a second sanctioned writer of the per-session `orchestrator` block so a context reset that never re-registers can still be priced retrospectively. This is narrower than a cost surface and should land before relying on complete cost history.

3. **Cost report / Work Explorer cost surface restoration.** Restore a user-facing surface for `disposition.cost`, preserving `unknown` versus zero and separating `routed_api`, `routed_seat`, and `orchestrator_seat`. Valuable, but it should wait until the capture backstop and terminology are stable.

## What NOT to do next

**Do not implement automatic compaction yet.** Set 131 proved rotation is the largest cost lever, but Set 132 still needs to settle the threshold, boundary coupling to N, and checkable survival contract; a writer that flushes the orchestrator transcript before that is too risky.

**Do not add cost gates or enforce `delegation.child_budget` yet.** The numbers are advisory, based on only 11 child conversations, and the repo lacks both telemetry and operator-attested calibration.
