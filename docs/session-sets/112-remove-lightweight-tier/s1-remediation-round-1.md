# S1 remediation — round 1 and round 2 findings

All four merged blocking findings (3 from the discovery fan-out, 1 from the
supplementary pass) were **accepted as real defects and fixed**. None were
disputed. Two of them share a root cause.

---

## Findings 1 and 3 (round 1) — the fail-loud loader was true but unreachable

**The defect, stated plainly:** the loader raised, but nothing a stranded
consumer would actually run ever called it.

- `start_session` never parsed the Session Set Configuration block on its
  happy path, so a legacy `tier: lightweight` spec was **registered and
  written to disk** under one-tier semantics. The user's first command
  succeeded. They would meet an unrelated error several steps later.
- `close_session` likewise reached the gate chain without ever consulting
  the tier.
- The **one** live production caller left after `runtime_mode` stopped
  reading the spec — `gate_checks._uat_policy` — caught the new
  `LightweightTierRemovedError` in a broad `except Exception` and returned
  `(False, "none")`. That both hid the migration message and, worse,
  **evaporated an armed UAT policy**: a spec with `requiresUAT: true` and
  the removed tier would have closed with no walk and no complaint.

This is the removal's entire migration safety net, so the finding is
correctly graded Major. The verifier is right that the population most
affected by Set 112 is precisely the population that would have hit it.

**Fix:**

1. New `spec_config.refuse_if_lightweight(session_set_dir)` — the boundary
   helper. Raises `LightweightTierRemovedError` for a declaring set; silent
   for a missing, unreadable, or ordinary spec (an unparseable spec is not
   this check's business, and every other failure mode has its own gate).
2. `start_session._run_under_lock` calls it **before the first read and
   every write**, returning `EXIT_BOUNDARY` with the migration one-liner on
   stderr. `test_start_session_refusal_writes_nothing` pins that no
   `session-state.json` and no `session-events.jsonl` are created — a
   refusal that still half-registered the set would hand the consumer a
   cleanup job on top of the migration.
3. `close_session.run` calls it below the repair/idempotency
   short-circuits (a set that is already closed, or being repaired, must
   not be blocked by a legacy line) and above the gate chain, returning
   `invalid_invocation` with the message.
4. `gate_checks._uat_policy` now **re-raises** `LightweightTierRemovedError`
   ahead of its broad handler. The fail-inert behaviour survives for the
   case it was written for — `test_uat_policy_still_inert_for_an_unparseable_spec`.

**Also fixed, from finding 3's acceptance criterion:** the criterion named
the quoted form `tier: "lightweight"`. It was right to. `_string_re` matched
only `([\w-]+)`, so a quoted value — legal YAML, visually identical to a
human — slipped past the refusal entirely. The pattern now accepts an
optional `"` or `'`, and `test_tier_lightweight_quoted_value_is_refused`
covers both quote styles. **This was a genuine hole the fix would have
shipped with had the verifier not specified the criterion that precisely.**

New test module: `ai_router/tests/test_lightweight_removal_boundary.py`
(9 tests), plus 3 in `test_spec_config.py`.

---

## Finding 2 (round 1) — `ai_router/docs/close-out.md` documented deleted paths

**Accepted without reservation**, and the verifier correctly noted this was
not an S2 deferral: my own `s1-kill-inventory.md` listed the close-out
doc's forward-looking instructions as S1 cleanup. It is the router's
authoritative close-out reference, cited by the session constitution as the
Step 8 on-demand doc, and it was telling a blocked operator to take
remediation paths that no longer exist.

**Fix** (`ai_router/docs/close-out.md`):

- *"Tier symmetry"* → *"One protocol, one tier"*: every project uses the
  two CLIs; the hand-written close path is gone; a declaring spec is
  refused at the boundary.
- Deleted the **External-verification soft gate** and
  **Dedicated-verification gate** bullets from the content-aware gate list
  (§7b). Both gates no longer exist.
- Dropped "Lightweight closes keep their own per-set gates" from the
  backstop-scope paragraph, and the "tier-orthogonal" framing from the
  path-aware-critique and contract gates — with one tier there is nothing
  to be orthogonal to.
- Rewrote the **mixed-mode drift** prevention advice. It previously said to
  "commit the set to Lightweight tier … or Full tier"; that is now
  impossible advice. It says: never hand-edit `session-state.json` to
  declare progress; use the sanctioned `--repair --apply` path.

---

## Finding 4 (round 2, supplementary) — the extension's bulk upgrade invoked the deleted migrator

**Accepted.** A genuine cross-language break I caused: deleting
`migrate_lightweight_to_canonical_v4.py` left
`upgradeOlderSets.ts::BULK_UPGRADE_MODULES` hardcoding
`"ai_router.migrate_lightweight_to_canonical_v4"` as step 2 of 3. The
**Upgrade Older Session Sets** title-bar command is gated on
`hasSubCurrentSets`, so every user who could click it would have hit
`No module named …` on the second subprocess and had the upgrade reported
as failed.

This is why it belongs in S1 rather than S2: S2 owns *tier* edits to the
extension, but this is the direct consequence of an S1 deletion, and
leaving it would ship a broken user-visible command across a session
boundary.

**Fix:** `BULK_UPGRADE_MODULES` is now
`["ai_router.migrate_session_state", "ai_router.migrate_v3_to_v4"]`,
matching the Python `BULK_UPGRADE_MIGRATOR_IDS` (which a unit test pins),
`docs/schema-current.json`, and `ai_router/MIGRATIONS.md`. The module
docstring's three-step chain narrative was rewritten to two steps and
records why the third is gone.

---

## Verification of the fixes

- `test_lightweight_removal_boundary.py` + `test_spec_config.py`: **33
  passed**.
- Acceptance harness run for rounds 1 and 2.
- Full pytest and full Layer 3 re-run after this remediation (the runs of
  record are re-recorded post-fix; the pre-fix runs are stale by
  construction).
