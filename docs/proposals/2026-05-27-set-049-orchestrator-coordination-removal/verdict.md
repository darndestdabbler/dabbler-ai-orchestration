# Set 049 audit-S1 verdict (synthesis of Pass A + Pass B)

> Pass A: gemini-pro (primary author, $0.0175). Pass B: gpt-5-4-mini
> (devil's advocate, $0.0300 — gpt-5-4 timed out on first attempt, fell
> back to mini per [[gpt-5-4-pivot-to-gemini]] memory pattern).
> Cumulative routed spend: **$0.0475 of $10 NTE (0.48%)**.

## Topic dispositions (locked here; roll-call items surfaced inline below)

### T1 — Schema version: **v4-compatible** (Pass A wins)

Pass B argued for v5 bump on "dual-shape debt" grounds. The argument
is real but resolved by accepting Pass B's T4 sweep+normalize position
— if we normalize historical files in S3, the bloated old-shape
problem doesn't accumulate. v5 would force a hard reader cutover for
~zero benefit given the operator pre-signal and the 47+ historical
sets that would all need migration anyway. **v4-compatible.**

### T2 — CLI compatibility: **accept-with-warning** (Pass B wins)

Pass B's argument is strictly better than Pass A's accept-and-ignore.
Silent acceptance hides the contract change from operators and consumer
repos. Warning is one stderr line per invocation — cheap, honest,
actionable. **Accept-with-warning for `--chat-session-id` and any
other now-meaningless flag.**

### T3 — Orchestrator declaration: **subset-of-known + documented contract** (both agree)

Pass A: hook passes what it knows; omit-null handles the rest. Pass B:
that's fine but document the producer contract per orchestrator. Both
positions stand together. The Claude hook stays as the canonical
reference (engine + provider hard-coded; model/effort omitted unless
recoverable from the prior block). New orchestrator hooks ship with the
same contract documented. **Hook passes subset it knows; spec
documents the contract.**

### T4 — Historical migration: **sweep+normalize as part of S3** (Pass B wins)

Pass B's argument that "readers ignore extras" creates audit blur is
correct. The migrator already exists (Set 047 `migrate_v3_to_v4`); a
small extension to also strip the 3 dropped fields from existing
orchestrator blocks is cheap and prevents the bloated-shape problem
from being permanent. **Sweep+normalize in S3; reuse the v3→v4
migrator infrastructure.**

### T5 — `~/.dabbler/orchestrator-writer.log`: **keep provisionally** (Pass B wins)

Pass B's argument that this is the only post-rip diagnosis surface for
silent hook regressions is concrete. The log is small, append-only,
and has no enforcement coupling. Cost of keeping it: near-zero. Cost of
retiring it: lose the only audit trail if a hook starts misbehaving
after the rip-out lands. **Keep; revisit in a future stability-pass
set if it proves dead.**

### T6 — `holder_change` / `checkout_conflict` events: **retire from emit** (Pass A wins)

Pass B argued for a compat window. But the rip-out also removes all
downstream readers of these event types — the joiner conflict
detectors that consumed them are themselves retiring per D1/D2. There
is no downstream consumer to preserve compat for. **Retire emit-side
in the same session that retires the conflict detectors.**

### T7 — Cross-repo CLAUDE.md notice: **rewrite as "remove this content"** (both agree)

Both passes agree that retiring the file silently leaves consumer
repos with stale CLAUDE.md fragments. Rewrite
`docs/cross-repo-checkout-notice.md` as an explicit deprecation note
that consumer repos can use as a delete-the-following-block
instruction.

## Discovered-collision dispositions

### D1 bare-touch — **retire detector** (both agree)

Both passes agree the detector's predicate is incompatible with P2
(omit-null). Pass B notes there's no replacement for the "missing
engine" signal; the audit accepts that loss of signal as the cost of
the unreliable-data premise that drove the whole rip-out.

### D2 engine-mismatch + stale-checkout-touch — **retire** (both agree)

Both passes agree these can't run without `lastActivityAt`. Pass B's
loss-of-signal note is recorded: post-rip there is no time-ordered
evidence of staleness or engine drift. Acceptable.

### D3 writer-bypass — **keep, decoupled** (both agree)

**Both passes agree to keep** the writer-bypass detector. Its
predicate (state-file mtime not bracketed by an events-ledger entry)
is engine-independent and catches out-of-band writes that the
coordination layer never covered. Keep it; remove its association with
the coordination subsystem; document it as a general writer-discipline
check.

## Session-arc lock

Pass A: 4. Pass B: 5-7. Synthesis: **5 sessions** total (S1 audit + 4
implementation), with the additions Pass B identified folded into
existing sessions:

- **S1** (this session) — Audit + locked spec
- **S2** — Core ai_router code removal: `start_session.py` H3/H4
  refusal paths, `new_chat_id.py`, `close_session.py` check-in branch.
  Retire `bare-touch`, `engine-mismatch`, `stale-checkout-touch` from
  `joiner/conflicts.py`. Decouple and keep `writer-bypass`. Retire
  `holder_change` and `checkout_conflict` event-type emission. Retire
  the chatSessionId-specific tests.
- **S3** — Writer-side cleanup + migration sweep: purge 3 fields from
  `session_state.py` writer paths, implement `accept-with-warning` for
  vestigial CLI flags, extend `migrate_v3_to_v4` to sweep+normalize
  existing orchestrator blocks (T4), update `claude-session-start-
  invoker.js` to drop chatSessionId forwarding and emit the subset it
  knows. Decision on `orchestrator-writer.log`: keep provisionally
  (T5) — confirm no writes remain from retired code paths.
- **S4** — Extension TS cleanup: retire `checkOutOrchestrator`,
  `releaseCheckOut`, `CheckoutPollService`, `chatSessionMismatchModal`,
  `newChatIdWorkflowToast`. Revert Explorer surface to pre-Set-045
  shape (no harvest badges, no conflict pills). Confirm `HarvestService`
  survives as a stub for non-conflict use. Update consumer-repo CLAUDE.md
  insertion text (T7).
- **S5** — Docs + version bumps + close-out: rewrite the CLAUDE.md
  "hard-coordination" section as historical, reshape
  `docs/session-state-schema.md` to 4-field omit-null orchestrator
  block, update `docs/ai-led-session-workflow.md` Step 6/8 references,
  produce UAT checklist for the rip-out, version-bump PyPI + Marketplace,
  build and stage releases for tag-push.

## Audit-discovered survey gap (Pass B finding)

Pass B identified the survey under-weights non-runtime consumers
(types files, JSON schemas, consumer-repo hook installers, harvest
readers). S2 should open with a focused re-survey of these surfaces
before deleting code, specifically:

- `tools/dabbler-ai-orchestration/src/types/sessionSetsWebviewProtocol.ts`
- any consumer-repo hooks in `dabbler-platform`,
  `dabbler-access-harvester`, `dabbler-homehealthcare-accessdb` that
  call `start_session --chat-session-id` directly
- `HarvestService.ts` consumers of the joiner output

If any non-trivial readers turn up, S2 surfaces them to the operator
before the rip-out proceeds.

## Feature roll-call (operator decides inline)

Pass A vs. Pass B positions for each:

| FR | What | Pass A | Pass B | Notes |
|----|------|--------|--------|-------|
| FR1 | Set 048 §3.5 external-verification soft gate | Keep | Defer | Independent value (gate quality of session artifacts); Pass B argues not load-bearing for rip |
| FR2 | Set 048 §3.7 `migrate_lightweight_to_canonical_v4` CLI | Defer | Keep | Pass B: more important post-rip if historical files need normalize |
| FR3 | Set 048 §3.8 `dabbler.openExternalVerificationDoc` command | Keep | Drop | Paired with FR1; Pass A keeps them together, Pass B treats as UI noise |
| FR4 | Set 048 §3.9 review-criteria templates | Keep | Drop/Defer | Pure documentation scaffolding; neither pass thinks it's load-bearing |
| FR5 | Set 047 §3.4 `migrate_v3_to_v4` + right-click action | Keep | Keep (consolidate with FR2) | Both keep; Pass B wants FR2+FR5 merged or coordinated |

**Surfacing inline next.**
