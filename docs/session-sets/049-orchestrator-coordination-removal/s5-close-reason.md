# Set 049 Session 5 — close-reason

S5 is the docs + version bumps + close-out session per spec §5 S5
and the final session of Set 049. It carries no new behavior;
it ships the documentation surface that pairs with the S2-S4 rip
and the dual version bumps that release the work.

## What S5 produced

### CLAUDE.md rewrite

- **"Hard-coordination enforcement (Sets 033 / 036) is OFF by
  default" section retired entirely.** The rip-out makes the section
  obsolete; there's no historical preservation need since the
  rationale is captured in the audit verdict and the version walk.
- **New "Orchestrator-block contract (post-Set-049)" section** in
  its place documents:
  - The 4-field omit-null shape (`engine`, `provider`, `model`,
    `effort`).
  - That the block is a historical record per `sessions[i]` entry,
    not a check-out flag.
  - That the Explorer doesn't surface orchestrator info (P4).
  - That `writer-bypass` (D3) survives in `ai_router/joiner/
    conflicts.py` as a general writer-discipline check.
  - Pointers to `docs/session-state-schema.md § Writer Contract`
    (S3) and `docs/cross-repo-checkout-notice.md` (S4 rewrite).
- **Extension versioning section** updated:
  - v0.24.0 description added (Set 049 — Orchestrator coordination
    removal), with the full feature manifest in the same long-form
    style as prior version entries.
  - v0.23.0 (Set 048) demoted to Previous; v0.22.0 (Set 047) to
    Pre-Previous; v0.21.0 (Set 045) to Pre-Pre-Previous; v0.18.1
    (Set 035) demoted to Pre-Pre-Pre-Previous with no content loss.

### docs/ai-led-session-workflow.md updates

- **"Orchestrator check-out / check-in (Set 033)" section (114
  lines) replaced** with "Orchestrator identity and concurrency
  (post-Set-049)" describing:
  - The block as a record, not a check-out.
  - Within-set sequential still enforced; no holder-identity check
    on top.
  - Across-set parallel supported.
  - T3 per-orchestrator declaration contract (omit what you can't
    declare authoritatively).
  - T2 accept-with-warning behavior with the exact stderr line.
  - `~/.dabbler/orchestrator-writer.log` retained as a generic
    audit appender.
  - Tier symmetry.
  - D3 writer-bypass detector survival.
  - Set 045 Explorer surface reverted (P4).
- **Step 8 cross-reference at ~line 1770 rewritten** to point at
  the new section.
- Spec §5 S5 directive to update Step 6 / Step 8 references is
  satisfied — the only coordination-layer reference in the doc was
  the dedicated section (now replaced) and the Step-8-area
  cross-reference (now rewritten); Step 6 itself did not cite the
  coordination layer.

### PyPI version bump → 0.11.0

- `pyproject.toml` `version` bumped 0.10.0 → 0.11.0.
- `ai_router/__init__.py` `__version__` bumped 0.9.0 → 0.11.0
  (caught and corrected a pre-existing skip — `__version__` was
  never bumped from 0.9.0 in Set 048's 0.10.0 release).
- `ai_router/CHANGELOG.md` `[0.11.0]` entry added with full
  Breaking / Changed / Removed / Kept sections detailing every
  retired surface and the T2 accept-with-warning compatibility
  guarantee.
- **Retroactive CHANGELOG backfill**: the entries for `[0.8.0]`
  (Set 045 — log-harvest), `[0.9.0]` (Set 047 — v4 schema),
  `[0.10.0]` (Set 048 — Lightweight parity) were missed during
  their respective sets. S5 backfills all three from the
  extension CHANGELOG and the project memory so the ai_router
  CHANGELOG matches the live PyPI version history.

Operator selected `minor` from a three-option pick (minor / major /
patch) for the bump magnitude. Rationale: pre-1.0 semver allows
breaking changes (`new_chat_id` retirement, orchestrator-block
field removal) within minor releases; T2 accept-with-warning
protects most CLI callers; major was reserved as a symbolic option
not yet warranted.

### Marketplace version bump → 0.24.0

- `tools/dabbler-ai-orchestration/package.json` bumped 0.23.0 →
  0.24.0.
- `tools/dabbler-ai-orchestration/CHANGELOG.md` `[0.24.0]` entry
  added with the same Breaking / Changed / Removed / Kept structure.
- `.vsix` packaged clean at 927.58 KB (22 files) after a
  `.vscodeignore` hygiene tweak: added `test-results/**` +
  `playwright-report/**` entries so Playwright run artifacts no
  longer bloat the published package (~5 files / 13 KB shaved off
  the 0.23.0 baseline's 940.42 KB).

### Set 049 change-log.md

Per-session narrative at
[`change-log.md`](change-log.md) covering S1-S5 with commit
references, deletion counts, test results, cumulative routed
cost ($0.0475 / $10 NTE = 0.48%; S2-S5 ran without invoking the
router mid-session per the memory-locked discipline).

### UAT checklist

[`049-orchestrator-coordination-removal-uat-checklist.json`](049-orchestrator-coordination-removal-uat-checklist.json):
17 items spanning orchestrator block shape (Full + Lightweight),
CLI backward compatibility, `new_chat_id` retirement, migrator
sweep+normalize (3 items + idempotency + rollback), Explorer
surface revert (2 items), Command Palette retirement, writer-bypass
detector (2 items), cancel/restore lifecycle, and consumer-repo
notice. 11 items verified programmatically in S5 (test references
named); 6 items flagged as manual operator UAT post-publish (live
VS Code interaction required).

## Test suite results

- **Python**: 967 passing + 1 skipped + 0 regressions in 207.73s.
- **TypeScript Layer-1 (Mocha)**: 553 passing + 2 pre-existing
  failures (`configEditor-foundation` vscode-stub gap on
  `ViewColumn.One`; `notificationsSection` regex stale since
  Set 026). Both failures confirmed unrelated to S5 via the same
  git-stash baseline established in S4 close-reason.

Layer-3 Playwright not re-run in S5 — the 4 pre-existing failures
(3 Windows temp-dir race in `blocked-by-prereqs.spec.ts`, 1
migration-cta-v4 badge text mismatch) are documented in S4
close-reason and S5 made no changes to the surfaces those tests
exercise. The S4 baseline of 14 passing + 4 pre-existing failing
holds for S5.

## Publish status (HELD)

Both registry publishes are operator-gated tag-pushes per
[[publish-via-github-actions]]:

- **PyPI** — push `v0.11.0` to trigger `release.yml` workflow.
- **Marketplace** — push `vsix-v0.24.0` to trigger
  `publish-vscode.yml` workflow.

The wheel + .vsix are built locally as smoke checks; the tag-push
is the operator's call. No `npx vsce publish` or `python -m twine
upload` invoked locally.

## Cost

S5 ran without invoking the router mid-session per the
memory-locked discipline. The only routed cost is `close_session`'s
Round-A cross-provider verification, which under default `tier:
full` + `requiresE2E: false` runs the routed call (the Set 048
`runtime_mode` short-circuit applies only to `--no-router` /
Lightweight). Round-B (final session per spec §5) is a separate
explicit route() call after close_session returns VERIFIED.

Cumulative across S1-S5 expected to land well under the $10 NTE.

## Why this S5 is documentation-dominant

Set 049 S5 is the close-out / release phase. By design, no new
code lands in S5 — S2-S4 retired the implementation surface; S5
retires the documentation that referenced it and brings the
version numbers + change logs along. The S5 net diff is text +
JSON manifests, plus a one-character `__version__` bump and two
`version` lines.
