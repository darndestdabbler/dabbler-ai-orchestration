# Set 047 S1 Audit — Verdict (post two-pass consensus)

**Status:** SCOPE-LOCKED 2026-05-26 after Pass A + Pass B + cross-provider verify across both.

**Cumulative routed cost for Session 1 audit:** $0.10851 of $10 NTE.

| Phase | Model | Cost |
|---|---|---|
| Pass A route | gemini-2.5-pro (tier 2) | $0.023 |
| Pass A verify | gpt-5-4-mini (verifier) | $0.0315 |
| Pass B route (devil's-advocate) | gemini-2.5-pro (tier 2) | $0.0263 |
| Pass B verify | gpt-5-4-mini (verifier) | $0.0277 |

---

## Bias dispositions (final, with pushback weighed)

| Bias | Proposal stance | Pass A primary | Pass A verify | Pass B primary | Pass B verify | **NET VERDICT** |
|---|---|---|---|---|---|---|
| **1 — package split** | Path 1 (separate `dabbler-session-state` PyPI) | ENDORSE | "endorsed too uncritically; consider single-package + modularization" | **FLIP to Path 2** (single package + `--no-router` mode) | no pushback on flip | **FLIP — Path 2 wins.** Single `dabbler-ai-router` package gains a `--no-router` mode for Lightweight. Internal modules separate state-mechanics from routing; no PyPI split. Two independent reads landed on this position. |
| **2 — derive over denormalize** | Derive top-level from `sessions[]` | ENDORSE | no pushback | STAND BY | no pushback | **STAND BY proposal.** v4 derives top-level state from `sessions[]`. Performance benchmark added to Session 2 per Pass A primary. |
| **3 — copyable-prompt surface** | Right-click context menu only | "sound; add Command Palette in implementation set" | no pushback | **FLIP to Command Palette primary** | no pushback | **FLIP — add both surfaces.** Command Palette commands (universal access) AND right-click context menu (in-place discoverability). Both ship in Set 048. |
| **4 — reader-first migration** | Reader-shim → migrator → writer-flip | ENDORSE | no pushback | STAND BY | no pushback | **STAND BY proposal.** Phased migration as drafted. |
| **5 — split vs bundle** | Shape 2 (047 v4, 048 Lightweight) | ENDORSE | "missed cross-cutting v4↔package-split interface" | STAND BY | no pushback | **STAND BY Shape 2.** Cross-cutting interface concern dissolves under Bias 1's flip — single-package architecture means v4 normalization layer lives in `ai_router/` without boundary risk. |
| **6 — migrator drops Lightweight shape recognition** | Canonical-only (this repo) | ENDORSE | no pushback | **FLIP — must recognize** | **PUSHBACK on flip: those shapes are OUTSIDE this repo** | **STAND BY proposal (Pass B verify wins).** Migrator handles canonical v3 in `docs/session-sets/*/session-state.json` only. Consumer-repo migration is a per-repo concern under Set 048+. |

---

## Open-question resolutions

| Q | Resolution | Source |
|---|---|---|
| **Q1 — verificationVerdict per-session content** | **Token-only** (`VERIFIED` / `ISSUES_FOUND`). Full output stays in events ledger. | Both Pass A and Pass B concur. |
| **Q2 — package-split CLI re-export** | **Moot under Bias 1 flip** — single package, no split, no re-export needed. But CLI **backward compatibility** is now a **firm requirement**: any future internal refactor must preserve existing `python -m ai_router.start_session` etc. invocations. | Pass A primary issue #3 converted Q2 to a firm requirement. |
| **Q3 — migrator backup vs git-only** | **Backup file** (`session-state.v3.bak.json` written alongside). Removed in a follow-on cleanup set after one full release cycle on v4. | Both passes concur. |
| **Q4 — does Set 048 need its own audit** | **YES — Set 048 will have its own S1 audit pass.** This proposal's Group B scope-locks Set 047's *treatment* of the Lightweight directive in Set 047 deliverables; it does NOT scope-lock Set 048's implementation plan. | Pass B verify pushback wins over Pass B primary's "no". |

---

## Pass A Verify's missing-topic additions (incorporated into Set 047 scope)

| # | Concern | Disposition |
|---|---|---|
| Pass A verify #1 | Cross-cutting v4 ↔ package-split interface | **Dissolved** by Bias 1 flip (single package). |
| Pass A verify #2 | Session 6 over-scoped (bundled schema-doc + bootstrap + close-out + publish) | **Accepted.** `adoption-bootstrap.md` revision deferred to Set 048 (it has substantive Lightweight rewrite there anyway). Session 6 now: schema-doc + session-set-authoring-guide + close-out + publish. |
| Pass A verify #3 | Package-split endorsed too uncritically | **Resolved** by Bias 1 flip. |
| Pass A primary #1 | Rollback procedure underspecified | **Accepted.** Session 3 gains an explicit rollback-procedure deliverable: failure conditions, restore-from-`.bak` steps, validation. |
| Pass A primary #2 | Performance impact of derivation unverified | **Accepted.** Session 2 gains a `readSessionSets()` benchmark task against all historical state files. Establishes baseline. |
| Pass A primary #3 | Q2 ambiguous CLI back-compat | **Accepted.** Converted to firm requirement (see Q2 above). |
| Pass A primary #4 | `prerequisites` field schema underspecified | **Accepted.** Session 5 gains an explicit `prerequisites` field schema deliverable: `prerequisites: [{slug: string, condition: "complete"}]` (initial enum is just `"complete"`; future conditions added on need). |

---

## Final session breakdown (Set 047)

6 sessions. Session 1 is this audit (complete after this verdict). Sessions 2-6 are the implementation arc.

| # | Title | Scope additions over the original proposal |
|---|---|---|
| 1 | Audit pass + scope-lock | **This session.** |
| 2 | Reader-first phase: normalize-to-v4 shim + reader updates | **+ `readSessionSets()` performance benchmark** establishing baseline against 47+ historical state files. |
| 3 | Migrator phase: `migrate_v3_to_v4.py` CLI + `MigrateV3ToV4` TS command | **+ formal rollback procedure**: trigger conditions, restore-from-`.bak` steps, validation. |
| 4 | Writer-flip phase part 1 — Python writers emit v4 | Same as proposal. |
| 5 | Writer-flip phase part 2 — TS writers emit v4 + Explorer renders v4 + `prerequisites` field | **+ `prerequisites` field schema**: `[{slug, condition: "complete"}]` initial form. Explorer's `blockedByPrereqs` derived property. |
| 6 | Schema-doc + session-set-authoring-guide + close-out + publish | **Adoption-bootstrap.md revision DEFERRED to Set 048** (substantive Lightweight rewrite belongs there). Session 6 = `session-state-schema.md` rewrite + `session-set-authoring-guide.md` (prerequisites field doc) + change-log + close-out + dual PyPI/Marketplace publish. |

---

## Scope decisions deferred to Set 048

Set 048 (`048-lightweight-tier-parity`, to-be-stubbed) absorbs:

1. **`--no-router` mode** on `dabbler-ai-router`: env var or CLI flag suppresses LLM imports and verification calls.
2. **Copyable-review-prompt surface (B2)**: BOTH Command Palette commands AND right-click context-menu commands. Three commands: copy-spec-review-prompt, copy-session-accomplishments-prompt, copy-set-accomplishments-prompt.
3. **Suggested-not-required UAT/E2E (B3)**: tri-state `requiresUAT: true | false | "suggested"` (and same for `requiresE2E`). Runtime: `true` blocks close-out; `false` skips; `"suggested"` logs a reminder but doesn't block.
4. **Doc revisions for Lightweight (B4)**: `adoption-bootstrap.md` Step 4.5 rewrite (hand-edit recipe deleted; "install dabbler-ai-router + run `--no-router`" added); `docs/ai-led-session-workflow.md` Step 6 (Lightweight-substitute via copyable prompts, not skip).
5. **Set 048 will run its own S1 audit pass** under audit-then-spec discipline (Q4 resolution). The audit will inherit the operator-locked premises P1-P4 from this proposal's §2 and build the implementation plan against them.

---

## Locked premises carried forward

The four operator-locked premises (P1-P4 in proposal §2) carry forward unchanged into Set 047 implementation and Set 048 audit. They are not open to re-litigation.

---

**Audit-verdict file written 2026-05-26. spec.md will be rewritten next from this verdict.**
