# S2 remediation — round 1

Both discovery findings (Major, `spec-conformance` and `failure-scenario`
lenses, `gpt-5.5`) name the same real miss, from two angles. Both are
**accepted and fixed**. The supplementary completeness-critic pass found
nothing further.

## The finding

I collapsed the **repo root** `README.md` to the one-tier story and never
touched `tools/dabbler-ai-orchestration/README.md` — the file that ships
in the VSIX and renders on the **VS Code Marketplace listing**. That file
opened with "two tiers that let you trade API spend against your own
attention", carried a Full-vs-Lightweight comparison table, told the
reader to pick a tier in the Getting Started form, and advertised four row
actions this session deleted from `package.json` (`Switch Tier…`, `Set Up
Dedicated Verification…`, `Open External Verification Note`,
`Verification Kickoff`) plus the deleted
`ai_router.migrate_lightweight_to_canonical_v4` migrator.

**Why this was worth blocking on.** It is the highest-traffic
user-facing document the project has, and every path it described is now
dead: `tier: lightweight` is refused by the loader, and the four commands
do not exist to be invoked. A new user following it would have hit a
failure with no explanation. The session's own Ends-with is "one story
everywhere" — this was the loudest place the story was still two.

It also shows a real gap in how I worked: I drove the docs collapse from
a `git grep` scoped to `docs/` and the repo-root `README.md`, so a README
one directory down was never in the result set. The kill inventory's
bucket J ("other — root README, schemas") is what should have caught it;
I read "root README" as the repo root only.

## What changed

- `tools/dabbler-ai-orchestration/README.md`
  - The "Two tiers — pay with dollars or pay with attention" section is
    replaced by **"Verification you do not have to remember"**: mandatory
    routed cross-provider verification, and the two ways to give the
    router a provider (direct `DABBLER_*` keys or a Copilot CLI seat),
    with the two-provider-families requirement stated. It carries an
    explicit **upgrade note** for readers arriving from a pre-removal
    version, pointing at the migration notice.
  - "Cost-minded routing (Full tier)" → "Cost-minded routing"; the
    Lightweight `$0` column reference is gone.
  - "Cross-provider verification at session close" drops its Lightweight
    second half.
  - The Get-started walkthrough's step 1 now says pick your **provider
    access**, not your tier; the image alt text matches.
  - The row-interactions list drops the four deleted actions.
  - "Copyable review prompts that complete themselves" → **"Copyable
    review prompts for a second opinion"**, and stops claiming the
    reviewing engine must write `external-verification.md` "or it does
    not count" (the same false mandate this session fixed in the prompts
    themselves — see `decisions.jsonl`). They are described as advisory.
  - The "Lightweight tier (no API spend)" and "Lightweight verification
    at a glance" bullets are replaced by **`--no-router` for CI and
    hermetic tests** (stating explicitly that it buys no gate relief, and
    naming the zero-budget declaration as the sanctioned alternative) and
    **Owed verification is said out loud**.
  - The schema-v4 bullet drops the deleted migrator.
  - Cost Dashboard: "absent on Lightweight" → absent without a resolvable
    `ai_router/router-config.yaml`.

Finding 1 additionally named two live docs as weakening the collapse, and
both were fixed in the same pass:

- `docs/ai-led-session-workflow.md` — twelve remaining "Full tier" /
  "Full-tier" qualifiers on statements that are now unconditional
  (verification is mandatory on **every** session; the close gate refuses
  **a** close with no corroborated verdict; `disposition.json` is required
  before **every** `close_session`).
- `docs/adoption-bootstrap.md` — the Getting Started form walks through
  the **provider-access** choice, not a tier choice; the manual path is no
  longer conditioned on "(Full tier)".

Swept in the same pass, for the same reason (a qualifier that now implies
a second tier exists): `README.md`, `docs/budget-yaml-schema.md`,
`docs/clone-setup.md`, `docs/contract-gate.md`,
`docs/disposition-schema.md`, `docs/session-issues-schema.md`,
`docs/session-state-schema.md`, `docs/session-state-schema-example.md`.

## Deliberately NOT changed

- `docs/repository-reference.md`'s release-history rows and the frozen
  records under `docs/case-studies/`, `docs/planning/git-transparency-*`,
  `docs/migration-v3-dry-run.md`, `docs/ss4-*`,
  `docs/verification-*-2026-07.md`, `docs/verification-surface-strategy.md`.
  These are dated records of what was true when written; rewriting them
  would falsify the record. Same rule the changelogs get.
- `docs/concepts/tier-model.md` — the historical note. Naming the tier is
  its job.

## Verification of the fix

- `npm run test:unit` — 1,602 passing (the README is not code; this
  confirms nothing regressed).
- `drift_guard.py` and `tutorial_gate.py` — exit 0.
- `git grep -c "Full tier\|Full-tier"` across live docs now returns hits
  only in the frozen records listed above.
