# Repository reference

> **Audience:** the reader who has installed the extension, run their
> first session, and now wants depth — what the framework actually
> delivers feature-by-feature, how to opt in to UAT/E2E gating, what
> the end-of-session output looks like in practice, and a directory-
> level map of the codebase.
>
> **Companion to:** [README.md](../README.md) (the lean inviting on-ramp)
> and [docs/ai-led-session-workflow.md](docs/ai-led-session-workflow.md)
> (the runtime mechanics — trigger phrases, the 10-step procedure,
> rule list).

This doc is a single flat reference page rather than a hierarchy of
sub-files. The file map, the UAT/E2E flag matrix, the worked end-of-
session output, and the deep feature descriptions all live here so
internal cross-links stop at one anchor jump rather than cascading.
The README links to specific anchors below; if you came looking for
something the README's bullet list mentioned, the matching section
title here is what to scan for.

---

## Pointers (where things live now)

If you came looking for content that used to live in the README:

| Old README section | Now lives at |
|---|---|
| Highlighted features (sections 1–6 + "Other features worth knowing") | [Highlighted features (deep dive)](#highlighted-features-deep-dive) below |
| The Session Set Explorer in action | [Highlighted features (deep dive) → Session sets and sessions](#1-work-is-organized-into-session-sets-and-sessions) below |
| Repos that need UAT and/or E2E support | [UAT and E2E support: when to opt in](#uat-and-e2e-support-when-to-opt-in) below |
| End-of-session output (worked example) | [End-of-session output (worked example)](#end-of-session-output-worked-example) below |
| Repository file map | [Repository file map](#repository-file-map) below |

The README's lean shape leads with installation + the 3-step Quick
Start; the depth above is one click away rather than buried in a
700-line scroll.

---

## Documentation authority and release status

This section is the canonical home for shared repo facts a future
orchestrator, reviewer, or release operator may need. The root engine
instruction files are bootstrap entrypoints, not the sole archive for
shared operational history.

**Guiding principle.** If a fact matters to more than one orchestrator,
store it in an engine-agnostic doc or canonical package metadata. Do not
make one engine-specific instruction file the only place a future session
can learn it.

### Current consumer repos

| Repo | `ai_router` | Extension |
|---|---|---|
| `dabbler-access-harvester` | `pip install dabbler-ai-router` | VS Code Marketplace |
| `dabbler-platform` | `pip install dabbler-ai-router` | VS Code Marketplace |
| `dabbler-homehealthcare-accessdb` | not used (Lightweight tier) | VS Code Marketplace |

### Current release status

| Surface | Current version | State | Canonical details |
|---|---|---|---|
| `dabbler-ai-router` | `0.30.0` | **Published (Set 085).** `0.30.0` — the preload manifest + ratcheting ceiling gate (`guidance:` `preload:` config, `guidance_report` per-file/total `--check`, `stamp:` opt-in headers, the bundled-default manifest-source guard) — published 2026-07-07 on operator authorization (tag `v0.30.0`, tagged commit `15f4823`, release.yml run [28894990925](https://github.com/darndestdabbler/dabbler-ai-orchestration/actions/runs/28894990925), Test green on the tagged commit). Previous registry-live: `0.29.0`. `v0.29.0` — the combined Sets 083 + 084 release (verify_session CLI + verification-integrity gate + mandatory Full-tier verification; identity-is-the-underlying-model, dynamic verifier exclusion, stamped evidence, the close backstop; plus a Windows drive-letter path-case fix found by the Set 084 out-of-band Copilot UAT) — published 2026-07-07 (release.yml run [28872574166](https://github.com/darndestdabbler/dabbler-ai-orchestration/actions/runs/28872574166), tagged commit `477e625`, Test green on the tagged commit; confirmed live on PyPI). 0.29.0 is the number Set 083 never shipped in between (superseded by 084). Previous: `v0.28.0` (Set 078 — Copilot CLI hybrid tier) published 2026-07-04 (release.yml run [28718741271](https://github.com/darndestdabbler/dabbler-ai-orchestration/actions/runs/28718741271), tagged commit `a391f61`); `v0.27.0` (Set 077) published 2026-07-04 (release.yml run [28718682653](https://github.com/darndestdabbler/dabbler-ai-orchestration/actions/runs/28718682653), tagged commit `51fc437`). All confirmed live on PyPI. | `pyproject.toml`, `ai_router/CHANGELOG.md` |
| `dabbler-ai-orchestration` VS Code extension | `0.40.0` | **Published (Set 085).** `0.40.0` — template-bundle-only: the scaffolded consumer-bootstrap bundle links the session constitution as the happy-path operating doc and marks the workflow doc on-demand (no extension code changes) — published 2026-07-07 on operator authorization (tag `vsix-v0.40.0`, tagged commit `15f4823`, publish-vscode.yml run [28894990724](https://github.com/darndestdabbler/dabbler-ai-orchestration/actions/runs/28894990724), Test green on the tagged commit). Previous registry-live: `0.39.0`. `vsix-v0.39.0` — the combined Sets 083 + 084 release: the scaffolded consumer-bootstrap bundle now teaches mandatory Full-tier verification (no skip), the Copilot-seat `--model` requirement / identity-from-model, dynamic verifier exclusion + `verification_unavailable`, and the close backstop; cold-start goldens + bundled dist templates regenerated. Published 2026-07-07 (publish-vscode.yml run [28872587000](https://github.com/darndestdabbler/dabbler-ai-orchestration/actions/runs/28872587000), tagged commit `477e625`, Test green on the tagged commit). Previous: `0.38.0` Set 082 (omit `verificationMode` from Full-tier scaffolds; extension-only — `ai_router` untouched, router stays `0.28.0`). A Full-tier scaffold no longer renders a `verificationMode:` config line (whole-line `{{VERIFICATION_MODE_LINE}}` token; Lightweight renders the exact pre-082 line, comment included) and no longer writes the `.dabbler/verification-mode` marker (Lightweight-only; on Full the marker is neither written nor deleted, so a prior Lightweight pick survives a tier round-trip). `buildSessionGenPrompt` hard-requirements rescoped: `full` sets OMIT the field. Lightweight scaffold output byte-identical to 0.37.0 (golden-snapshot tripwire). Per-set UAT walked and attested 2026-07-06: all 5 functional items PASS across 3 walks incl. one REAL cold-start Build per tier from fresh empty folders (L-079-3) and a Full-over-Lightweight re-Build asserting marker preservation. Published 2026-07-06 (tag `vsix-v0.38.0`, tagged commit `e9bbfae`, publish-vscode.yml run [28806840851](https://github.com/darndestdabbler/dabbler-ai-orchestration/actions/runs/28806840851); Test run [28806467299](https://github.com/darndestdabbler/dabbler-ai-orchestration/actions/runs/28806467299) green on the tagged commit). Previous: `0.37.0` (Set 081) published 2026-07-05 (tag `vsix-v0.37.0`, tagged commit `bc3b43f`, publish-vscode.yml run [28764677942](https://github.com/darndestdabbler/dabbler-ai-orchestration/actions/runs/28764677942)). | `tools/dabbler-ai-orchestration/package.json`, `tools/dabbler-ai-orchestration/CHANGELOG.md` |

### Recent version walk

- **`dabbler-ai-router 0.30.0` + Extension `0.40.0`** — Set 085, the
  guidance-slimming release (**published 2026-07-07** on operator
  authorization: tags `v0.30.0` run
  [28894990925](https://github.com/darndestdabbler/dabbler-ai-orchestration/actions/runs/28894990925)
  and `vsix-v0.40.0` run
  [28894990724](https://github.com/darndestdabbler/dabbler-ai-orchestration/actions/runs/28894990724),
  tagged commit `15f4823`). The router ships the preload manifest +
  ratcheting ceiling gate (F1): a `guidance:` `preload:` block declaring
  every required-reading file with per-file ceilings plus a
  `total_ceiling_tokens`, gated per-file **and** total by
  `guidance_report --check` in CI (fail-closed on malformed/misplaced
  manifests and missing files; ceilings ratchet down only), with
  `--write-headers` stamping now `stamp: true` opt-in — plus the S3 fix
  that the **package-bundled default config is never a manifest source**
  (a pip-installed consumer with no workspace config stays on legacy
  two-file behavior instead of inheriting this repo's manifest). The
  repo itself now runs sessions from a slimmed ~10.7k-token preload
  (constitution + project-guidance + active lessons + one engine file)
  under a 12k ceiling, with `docs/guidance-slimming-playbook.md` as the
  repo-portable recipe for consumer repos. The extension `0.40.0` is
  template-bundle-only: the scaffolded bundle links the session
  constitution as the happy-path operating doc and marks the workflow
  doc on-demand. Rollback (both halves registry-live): pin
  `dabbler-ai-router==0.29.0`; install extension `0.39.0`
  (`code --install-extension DarndestDabbler.dabbler-ai-orchestration@0.39.0`).

- **`dabbler-ai-router 0.29.0` + Extension `0.39.0`** — Sets 083 + 084,
  the verification-identity release. 0.29.0 combines Set 083 (the
  `verify_session` CLI, the verification-integrity close gate, mandatory
  Full-tier verification with no engine-facing skip) and Set 084 (identity is
  the underlying model resolved through the registry, not the seat label;
  dynamic verifier exclusion of the orchestrator's effective provider with a
  fail-closed `verification_unavailable`; only `verify_session`- or
  backstop-stamped evidence corroborates a close; and the **close backstop** —
  `close_session` runs the verification itself in-process when a Full-tier close
  arrives unverified). Set 083 never shipped on its own (superseded by 084).
  Also fixes a **Windows drive-letter case-sensitivity** bug in the
  close/verify path, found by the Set 084 out-of-band Copilot UAT (a real seat
  passing `--session-set-dir c:\...` against git's `C:\...` spuriously failed
  the stamp/gate comparisons); every two-source path compare now
  `os.path.normcase`s both sides. The extension `0.39.0` ships the matching
  consumer-bootstrap bundle. **Published 2026-07-07** — router `v0.29.0`
  (release.yml run
  [28872574166](https://github.com/darndestdabbler/dabbler-ai-orchestration/actions/runs/28872574166),
  live on PyPI) and extension `vsix-v0.39.0` (publish-vscode.yml run
  [28872587000](https://github.com/darndestdabbler/dabbler-ai-orchestration/actions/runs/28872587000)),
  both tagged commit `477e625`, Test green on the tagged commit. Set 084's
  per-set UAT was walked partly via the Session Set Explorer cold-start Build
  (Walk 0/1 attested) and partly via a REAL GitHub Copilot orchestrator running
  a live session (the incident-3 reproduction), which confirmed the machinery
  end-to-end and surfaced the path-case fix; the close-out itself used the
  operator-attested `--manual-verify` because the backstop hall-of-mirrors on
  the session's own committed verification artifacts (a recorded framework
  follow-up). Consumer floor-bump (`dabbler-ai-router>=0.29.0` + L-075-1
  venv-upgrade-and-confirm) happens in each consumer repo's own session.

- **Extension `0.38.0`** — Set 082, omit `verificationMode` from
  Full-tier scaffolds. Extension-only (`ai_router` untouched; router
  stays `0.28.0`). A Full-tier scaffold omits the phantom
  Lightweight-only field at both sites: the spec template's fixed line
  became the whole-line `{{VERIFICATION_MODE_LINE}}` token (full line
  with comment on `lightweight`, empty string on `full`, no blank-line
  residue), and the `.dabbler/verification-mode` marker is written on
  Lightweight only (on Full neither written nor deleted — a prior
  Lightweight pick survives a tier round-trip; `.dabbler/tier` stays
  unconditional). `buildSessionGenPrompt` hard-requirements rescoped
  (`full` sets OMIT the field; Full worked example carries no line).
  Lightweight scaffold output byte-identical to 0.37.0 (golden-snapshot
  tripwire). Fix for a live operator-reported Copilot misreading of a
  fresh Full scaffold ("tier: full, verificationMode:
  out-of-band-or-none"). Per-set UAT walked 2026-07-06: one REAL
  cold-start Build per tier from fresh empty folders (L-079-3) plus a
  Full-over-Lightweight re-Build asserting marker preservation — all 5
  functional items PASS. **Published 2026-07-06** (tag `vsix-v0.38.0`,
  tagged commit `e9bbfae`, publish-vscode.yml run
  [28806840851](https://github.com/darndestdabbler/dabbler-ai-orchestration/actions/runs/28806840851);
  Test run [28806467299](https://github.com/darndestdabbler/dabbler-ai-orchestration/actions/runs/28806467299)
  green on the tagged commit).
- **Extension `0.37.0`** — Set 081, budget input scoped to the
  Direct-API sub-choice. Extension-only (`ai_router` untouched; router
  stays `0.28.0`). The Full-tier verification-budget block (label,
  input, help, $0 zero-rule pair, validation element) moves from below
  the provider-access group to an indented child of the "Direct
  provider API keys" option row, rendered only while Full + that
  sub-option are selected — omitted (not hidden) on the Copilot seat
  pick, matching the form's existing conditional pattern; a typed value
  survives sub-choice flips and window reloads. Build honesty: a
  Copilot-seat Build validates no budget and writes no
  `ai_router/budget.yaml` (absence has documented compat defaults;
  `verification_method` → `api` when absent), with the rider dropped at
  both the action handler and the scaffold caller (`writeBudgetYaml`
  unchanged); the Direct-API Build path is unchanged. UAT-walk feedback
  in this set added a closing bottom rule under both sub-choice groups
  so the "Build project structure" button no longer reads as part of
  the last option row. README `getting-started.png` refreshed
  (operator-captured). Operator-requested during the Set 080 UAT walk;
  per-set UAT walked 2026-07-05 with one REAL cold-start Build per
  sub-option asserting the `budget.yaml` write matrix (L-079-3).
  **Published 2026-07-05** (tag `vsix-v0.37.0`, tagged commit
  `bc3b43f`, publish-vscode.yml run
  [28764677942](https://github.com/darndestdabbler/dabbler-ai-orchestration/actions/runs/28764677942);
  Test run [28764463565](https://github.com/darndestdabbler/dabbler-ai-orchestration/actions/runs/28764463565)
  green on the tagged commit).

- **Extension `0.36.0`** — Set 080, Getting Started sub-choice
  legibility. Extension-only (`ai_router` untouched; router stays
  `0.28.0`). Presentation-only: both step-1 sub-choice groups (Full's
  "Provider access (how routed calls run)", Lightweight's "Verification
  (per session set)") render each option as a separated
  radio | bold name | description row via a shared `optionRowHtml`
  helper, columns aligned across rows, a light
  `--vscode-panel-border` rule between rows; copy constants split at
  their first em-dash for presentation only (wording, radio values,
  `data-gs-*` attributes, warning logic, and persistence all unchanged —
  no Layer-2 placement/persistence test needed a semantic edit). README
  `getting-started.png` refreshed (operator-captured; the old capture
  predated the provider-access group entirely). Deferred out of 0.35.0
  so already-attested Set 079 walks did not need re-walking;
  operator-requested during that set's UAT, and the same operator
  attested the legibility judgment in this set's per-set UAT walk
  (2026-07-05). **Published 2026-07-05** (tag `vsix-v0.36.0`, tagged
  commit `2efaa92`, publish-vscode.yml run
  [28760570916](https://github.com/darndestdabbler/dabbler-ai-orchestration/actions/runs/28760570916)).
  Follow-up queued: Set 081 (scope/condition the Full-tier verification-
  budget input to the "Direct provider API keys" sub-choice,
  operator-requested during this set's UAT walk — the budget is inert
  under the Copilot seat profile, whose cost-keyed guards are excluded
  by design).

- **Extension `0.35.0`** — Set 079, Copilot seat-profile onboarding and
  verification-mode copy. Extension-only (`ai_router` untouched; router
  stays `0.28.0` — the zero-`ai_router`-changes claim was verified by
  diff at set close). Feature 1 gives Set 078's `copilot-cli` seat
  profile a guided, discoverable path inside the Getting Started form:
  a Full-tier "Provider access" sub-choice (direct API keys default /
  Copilot CLI seat), a step-1 missing-CLI warning, scaffold-then-refresh
  sequencing on the scaffolded venv's own interpreter with auto-derived
  seat identity, a cancellable progress notification with
  host-teardown disposal, a parsed provider-count check (exit code
  never trusted), an anchored `transport.profile` render (never an
  append), and honest failure UX on every branch keyed on real
  `DABBLER_*` presence. Feature 2 simplifies the Lightweight
  verification-mode radio copy (plain language, same values/schema).
  Honesty carried forward: evidence remains a **single personal seat**
  (Set 079's dogfoods ran on the same seat as Set 078's); multi-seat /
  enterprise-seat availability is NOT validated; the POSIX cancel
  branch is unit-pinned only; the config write is process-crash-atomic,
  not power-loss-durable. Rollback (config/install-only): reinstall
  extension `0.34.0` from the Marketplace (published 2026-07-04,
  confirmed live) — workspaces that already wrote
  `transport.profile: copilot-cli` can hand-flip it back to `api` if
  needed; no data migration either way. The release also carries two
  fixes the UAT walk itself earned: the **cp1252 config-seed crash**
  (fresh Windows scaffolds silently got no `ai_router/router-config.yaml`
  because the seed one-liner printed the bundled config through the
  child Python's cp1252 text stdout; now a raw-bytes emit, with a failed
  seed named in the install message) and the class-wide **chunk-split
  UTF-8 decode fix** (shared `StringDecoder`-based decoder at every
  spawner sink). **Published 2026-07-05** (tag `vsix-v0.35.0`, tagged
  commit `c2ed2b4`, publish-vscode.yml run
  [28751504260](https://github.com/darndestdabbler/dabbler-ai-orchestration/actions/runs/28751504260)).
  Follow-up queued: Set 080 (sub-choice row-layout legibility +
  screenshot refresh, operator-requested during this set's UAT).

- **`dabbler-ai-router 0.28.0`** — Set 078, Copilot CLI hybrid tier. Gives
  the Full tier a subscription-billed **seat profile**: a new
  `transport.profile: copilot-cli` dispatches every routed call through the
  GitHub Copilot CLI's headless mode instead of a direct provider HTTPS
  API, so a Copilot-seat-only shop (no `DABBLER_*` key possible under
  corporate policy) gets an indirect Full tier — routed work under one
  underlying model provider, independently verified under another, inside
  one subscription. Presented as **Full-compatible with explicitly
  degraded guarantees**, never byte-equivalent Full: provider provenance is
  asserted from a seat-local catalog lockfile's name-prefix heuristic
  (`ai_router/copilot_catalog.py`, `python -m ai_router.copilot_catalog
  --refresh`), not a first-party API field; seat billing is not locally
  meterable (cost-keyed guards excluded, a hard non-cost-keyed invocation
  circuit breaker caps burn instead). Live dogfood against the real CLI
  (not the hermetic fake-spawner suite) surfaced and fixed three real
  defects invisible to that suite: a lockfile-breaking multi-line
  `--version` banner, a silently-empty-content bug from an unwrapped `data`
  envelope key, and a Windows `cp1252`-decode crash misclassified as a
  300s timeout. Operator walked and attested all 7 UAT items on their own
  seat. Evidence basis is a **single personal Copilot seat** — a second
  representative team seat and a GitHub Models enterprise-availability
  check were dropped as a gate by an explicit, recorded operator override
  rather than completed (see
  `docs/session-sets/078-copilot-cli-hybrid-tier/s1-cli-contract.md`). No
  extension version bump or new extension feature work — Session 5 did
  recompile the extension's `dist/templates/consumer-bootstrap` mirror to
  pick up a canonical-template doc-pointer edit, but that is a build-sync
  fix, not an extension feature or release. Rollback recipe (config-only,
  no data migration): `transport.profile: api`, discard
  `ai_router/copilot-catalog.lock`, or pin `dabbler-ai-router==0.27.0`.
  **Published 2026-07-04** (tag `v0.28.0`, release.yml run
  [28718741271](https://github.com/darndestdabbler/dabbler-ai-orchestration/actions/runs/28718741271),
  tagged commit `a391f61`), after `v0.27.0` per the release-ordering
  invariant.

- **`dabbler-ai-router 0.27.0` + extension `0.34.0`** — Set 077,
  lightweight-tier UX and Copilot hardening. The coordinated release for the
  Copilot-locked team's mission-critical adoption week (2026-07-06): the
  Getting Started tier leak is closed with webview state persistence plus
  durable `.dabbler/tier` / `.dabbler/verification-mode` markers read
  marker-first by every downstream surface; the form gains the three-way
  setup choice and the Python prerequisite warning with a
  no-artifacts-on-failure pre-flight; out-of-band verification completes
  itself (canonical `docs/dabbler/cross-provider-verification.md`
  ensure-written into workspaces, pointer-style Evaluate prompts whose
  reviewing engine writes `external-verification.md`, round-aware parser
  with the `WAIVED` opt-out, soft gate keyed to the resolved runtime mode);
  Mode B is Copilot-fit (close gate passes on engine **or provider**
  difference, start-time same-pair refusal, owed states surfaced as a
  `start_session` banner, Explorer `verification owed` / `remediation owed`
  wording, and kickoff/remediation auto-routing). Rollback pair if a
  hotfix-grade defect surfaces during the adoption week: extension `0.33.1`
  + router `0.26.2`. UAT re-walked against the Set 078 authoring bar
  (literal, live-dogfooded steps) after an initial suspension over
  instruction quality; the re-walk passed 14/14 with no feedback. **Both
  published 2026-07-04** — router `0.27.0` (tag `v0.27.0`, release.yml run
  [28718682653](https://github.com/darndestdabbler/dabbler-ai-orchestration/actions/runs/28718682653),
  tagged commit `51fc437`) and extension `0.34.0` (tag `vsix-v0.34.0`,
  publish-vscode.yml run
  [28718703898](https://github.com/darndestdabbler/dabbler-ai-orchestration/actions/runs/28718703898),
  tagged commit `a391f61`).

- **`dabbler-ai-router 0.26.2`** — Set 076, local-only close-out mode
  (`.dabbler/local-only` marker + `ai_router.local_only` CLI waive the
  close-out push gate for deliberately remote-less repos). PyPI-only;
  extension untouched. Published 2026-06-23 (tag `v0.26.2`, release.yml run
  28048321482, tagged commit `024ad34`).

- **`dabbler-ai-router 0.26.1` + extension `0.33.1`** — Set 074 emergency
  patch. Built-in provider API-key env-var defaults moved to
  `DABBLER_ANTHROPIC_API_KEY`, `DABBLER_GEMINI_API_KEY`, and
  `DABBLER_OPENAI_API_KEY` so Dabbler routing does not collide with
  provider-owned tools that auto-detect generic key names. The stored key values
  are still the normal keys issued by Anthropic, Google, and OpenAI. Router
  `0.26.1` was published to PyPI on 2026-06-20 via tag `v0.26.1` and release.yml
  run 27867506784. Extension `0.33.1` was published to the Marketplace and Open
  VSX on 2026-06-20 via tag `vsix-v0.33.1` and publish-vscode.yml run
  27867766323; it carries the updated installed-extension copy/templates and a
  forced PyPI refresh for `Dabbler: Update ai-router`.

- **`dabbler-ai-router 0.19.0` + extension `0.33.0`** — Set 064, guidance
  lifecycle & pruning. The router gains the steady-state lifecycle (cost
  reporter `guidance_report`; per-lesson metadata `guidance_meta` +
  `validate_guidance_meta`; citation-at-close via `cite_lessons` +
  `disposition.lessons_cited`; active/archive split + `guidance_search
  --archive`; `guidance_config` ceilings/disuse window) and the one-time
  over-budget backlog-triage helper `guidance_triage`. The extension's
  consumer-bootstrap bundle now scaffolds the three `docs/planning/`
  guidance starters (metadata-aware `lessons-learned` / `project-guidance`
  + empty `lessons-archive`). New canonical docs:
  `docs/guidance-lifecycle.md` and `docs/guidance-backlog-remediation.md`;
  cross-repo notice `docs/cross-repo-guidance-lifecycle-notice.md` points
  the over-budget consumers (harvester, platform) at the recipe. The
  extension `0.33.0` also carries Set 063. **Both published 2026-06-14
  through the green-Test gate** (tags `v0.19.0` release.yml run 27507297669
  and `vsix-v0.33.0` publish-vscode.yml run 27507297687, both on tagged
  commit `8cc4b3a`).
- **Extension `0.32.0`** — Set 063, Getting Started budget step +
  adoption-bootstrap retirement (Full-tier budget/NTE step writing
  `ai_router/budget.yaml` in the post-migration shape with fail-closed
  host boundary; conversational bootstrap path fully ripped;
  `docs/adoption-bootstrap.md` → URL-stable deprecation stub; new
  canonical `docs/budget-yaml-schema.md`). Marketplace-only — the PyPI
  surface is unchanged (budget.yaml lacks a runtime reader inside
  `ai_router`, so nothing packaged changed). Local operator UAT
  passed 2026-06-12; **publish pending the operator's `vsix-v0.32.0`
  tag push through the green-Test gate** (record the run id here
  post-publish).
- **Extension `0.31.0` + `dabbler-ai-router 0.18.0`** — ad-hoc curator pass (post-Set-062): Cost Dashboard `session_set` normalization (one slug-keyed row per set; no machine paths in the CSV export), README two-tier cost/attention framing, Layer-3 Playwright suite repair (first-ever green `Test` run), and the green-Test release prerequisite. Both published 2026-06-12 — the first releases through the gate (tags `vsix-v0.31.0` run 27424322879, `v0.18.0` run 27424323065).
- **Extension `0.30.0` + `dabbler-ai-router 0.17.0`** — Sets 061 + 062 combined (Explorer UX polish: `N/M+`, `lw` marker, blocked chain marker, `Switch Tier…`; Lightweight verification affordance: `v?`/`v+` markers, Verification Kickoff prompt, `Set Up Dedicated Verification…`, the `change_verification_mode` blessed writer, the UAT fixture workspace; migrator-CLI cp1252 fix). Local operator UAT passed 2026-06-12; both published 2026-06-12 (tags `vsix-v0.30.0` run 27417089796, `v0.17.0` run 27417089861).
- **Extension `0.29.0`** — Set 060, Getting Started redesign (dual-mode Session Set Explorer onboarding form, static editor instructions, inline Full-tier key warning, worktree disclosure, path-referenced tier-aware decomposition prompt, old wizard retired) and the held Set 059 activation fix. Marketplace-only; local operator UAT passed 2026-06-11; published 2026-06-11 (tag `vsix-v0.29.0`, run 27340063729).
- **Extension `0.28.0`** — Set 058, tier-model clarity & consumer-repo bootstrap (shared template writer; uniform tier-aware scaffolding; canonical `spec.md`/engine-file/`start-here.md` templates; CI drift guards). Marketplace-only; `ai_router` packaged surface unchanged. Published 2026-06-09 (tag `vsix-v0.28.0`, run 27228430570).
- **`dabbler-ai-router 0.16.0`** — Set 057, Lightweight dedicated verification/remediation sessions (`verificationMode`, hand-off close, Q6 close-out gate). PyPI-only; extension untouched. Published 2026-06-05 (tag `v0.16.0`).
- **`dabbler-ai-router 0.15.0`** — Set 054, verificationVerdict persistence. PyPI-only. Published 2026-06-02 (tag `v0.15.0`).
- **Extension `0.27.0`** — Set 052, cost-metrics icon redesign. Marketplace-only. Publish held for `vsix-v0.27.0` (superseded by `vsix-v0.28.0`).
- **`dabbler-ai-router 0.14.0` + extension `0.26.0`** — Set 051 plus Set 053, ai_router hygiene / hook retirement / lifecycle schema-drift coverage.
- **`dabbler-ai-router 0.12.0` + extension `0.25.0`** — Set 050, schema-drift guard and numeric session-set addressing.
- **Extension `0.24.1`** — patch release wiring `Copy Slug` into the row action registry.
- **`dabbler-ai-router 0.11.0` + extension `0.24.0`** — Set 049, orchestrator coordination removal.
- Older release history lives in the package CHANGELOGs and the closed session-set change-logs. Do not rebuild a second version walk inside an engine-specific root instruction file.

---

## Highlighted features (deep dive)

### 1. Work is organized into session sets and sessions

The unit-of-execution is a **session**: one bounded slice of work that
runs to completion in a single orchestrator conversation, ends with a
verification + commit, and stops. Sessions exist because that is how
AI-coding-agent work is naturally bounded — context windows, attention,
and rate limits all push toward "do one thing thoroughly, then stop."

The unit-of-planning is a **session set**: an ordered sequence of
sessions that together deliver one feature, refactor, or aspect of the
solution. Most non-trivial work needs more than one session, so a set
is the artifact a human and AI co-design **out of band** before any
session runs. The set's `spec.md` carries the per-session step lists,
the configuration block (`requiresUAT` / `requiresE2E`), and the
prerequisite chain. Each set lives in its own directory under
`docs/session-sets/<slug>/` and produces a small, predictable set of
artifacts (`spec.md`, `session-state.json`, `session-events.jsonl`,
`activity-log.json`, `ai-assignment.md`, `disposition.json`, per-session
root files such as `sN-verification.md` and `sN-close-reason.md`, an
end-of-set `change-log.md`, and — when opted in — `<slug>-uat-checklist.json`).
Legacy `session-reviews/` and `issue-logs/` directories may still appear
when older helpers or one-off scripts run, but they are not part of the
current required layout.

The Session Set Explorer renders the active inventory across all
session sets in the workspace. State is derived from file presence,
mirroring `ai_router.find_active_session_set()`:

| Files present | State |
|---|---|
| `change-log.md` | done |
| `activity-log.json` *or* `session-state.json` | in-progress |
| only `spec.md` | not-started |

`session-state.json` is the **earliest in-progress signal** — written at
Step 1 of every session (before any activity-log entry exists), so a
freshly-started set flips to In Progress immediately.

Authoring rules and slug conventions live in
[docs/planning/session-set-authoring-guide.md](planning/session-set-authoring-guide.md);
runtime mechanics live in
[docs/ai-led-session-workflow.md](ai-led-session-workflow.md).

### 2. Cost-minded orchestration

Inside each session, work is split between an **orchestrator** AI and
the **router**. The orchestrator is a coding-assistant agent running
inside VS Code with bounded read/write/execute access to the file
system; it owns mechanics (file edits, shell, git) and dispatch. Four
orchestrator agents are supported, each reading its own instruction
file at the repo root: Claude Code reads [CLAUDE.md](../CLAUDE.md),
Codex (OpenAI) and GitHub Copilot read [AGENTS.md](../AGENTS.md), and
Gemini Code Assistant reads [GEMINI.md](../GEMINI.md). All three files
point back to the same shared rules; agent-specific bootstrap (API key
export syntax, etc.) is the only reason they differ. Shared repo facts
such as current consumers and release/version status live in this doc,
not in one engine-specific file. The router (`ai_router/`) owns
reasoning: code review, security review, analysis, architecture,
documentation, test generation, and the mandatory end-of-session
verification all go to `route()`, which estimates complexity, picks the
cheapest capable tier, and applies per-task-type effort overrides from
[ai_router/router-config.yaml](../ai_router/router-config.yaml).

Assignment planning happens at **two cadences**:

- **Whole-set authoring at the start of Session 1** (Step 3.5 in the
  workflow doc). The orchestrator routes a full pass over the spec's
  per-session step lists and writes `ai-assignment.md` — a per-session
  ledger naming the cheapest capable model + effort for each step.
- **Per-session refresh at Step 8** of every non-final session. The
  orchestrator routes a fresh recommendation for the *next* session
  based on this session's actuals, and appends both to
  `ai-assignment.md`.

Both passes use `task_type="analysis"` — the orchestrator never
self-opines on which model is cheaper (Rule #17). A Claude orchestrator
asked freely will recommend Claude; routing the analysis through a
different provider removes that bias.

A model-tier and pricing reference (Gemini Flash → Gemini Pro / Sonnet /
GPT-5.4 Mini → Opus / GPT-5.4) lives in
[docs/ai-led-session-workflow.md → Model Tiers and Pricing](ai-led-session-workflow.md#model-tiers-and-pricing).

**What this looks like at scale** — see
[docs/sample-reports/](sample-reports/) for two real
`python -m ai_router.report` outputs from contrasting projects. A
CLI / library / parser project showed **73% savings vs the
Opus-only baseline** across 990 routed calls; a full-stack UI app
with UAT + E2E gates showed **32% savings** across 370 calls (lower
because UAT-driven verification routes to Opus by default). Both
reports surface auto-generated action items naming task types whose
unreliability suggests a prompt-template tightening — the manager
doesn't have to hunt for "where am I bleeding cost or quality."

### 3. Cross-provider verification

Every session ends with a **mandatory** independent verification by a
model from a **different provider** than the one that did the work
(Step 6). This catches provider-specific blind spots and biases — and
it is non-negotiable: `session-verification` always routes, even under
the `— maxout <engine>` suffix that lifts every other cost cap.

Verifier selection in [ai_router/verification.py](../ai_router/verification.py)
is rule-based and, since Set 084, **dynamically excludes the orchestrator's
effective provider** — derived by registry lookup on the session's `model`
(`ai_router/orchestrator_identity.py`), not the free-text `provider` seat
label. Among the remaining providers it picks an enabled verifier that matches
the generator's tier (or one tier higher), cheapest output price wins; the old
static `session-verification:` model pin is only a preference that cannot
override the exclusion. If the exclusion leaves no different-provider verifier,
the outcome is **`verification_unavailable`** — a hard blocked state (no verdict
written), resolvable only by the operator-attested `--manual-verify` path. The
verifier returns a structured JSON verdict
(`{"verdict": "VERIFIED" | "ISSUES_FOUND", "issues": [...]}`) so the
result is parseable rather than a free paragraph. Only a **`verify_session`- or
backstop-stamped** metrics row corroborates a close (Set 084 F3) — a bare
`route()` row does not — and on a Full-tier close that arrives unverified,
`close_session` **runs the verification itself in-process** (the close
backstop) rather than trusting the orchestrator's word.

When the orchestrator **disagrees** with a finding, it does not
unilaterally dismiss it and does not poll a second AI for a vote. The
authority model is *verifiers flag, humans adjudicate.* The
orchestrator surfaces the finding, the dismissal reason, the context
that went to the verifier, and a self-assessment of whether relevant
context was missing. The human then picks one of four resolutions:

- (a) accept the finding and fix it,
- (b) accept the dismissal and close it,
- (c) **re-verify with reshaped context** (same verifier, add missing
  files / trim irrelevant ones — resolves the most common case where
  the verifier just wasn't shown enough),
- (d) **second opinion from a different provider** (tiebreaker model
  from outside the original verifier's provider).

Each adjudication is logged via `record_adjudication()` so the
distribution of (a)/(b)/(c)/(d) across sessions becomes visible in the
manager report and informs router-config tuning.

### 4. Git integration and parallel session sets

Every session ends with `git add -A && git commit && git push`. There
is no manual step for the human between verification and the commit
landing on `main`. Session set status is then flipped to `complete` in
`session-state.json` so the Session Set Explorer (and any external
dashboard) updates immediately.

Two or more session sets can run **in parallel** when the human's
out-of-band plan establishes that they don't conflict on the same
files. The trigger phrase
`Start the next parallel session of <slug>.` runs the session in an
isolated git worktree at `../<repo>-<slug>` on a `session-set/<slug>`
branch. The set's last session merges `origin/main` back into the
session-set branch (resolving conflicts), then merges into main and
pushes — so parallel sets converge cleanly without the human shuffling
worktrees by hand. The Session Set Explorer's worktree auto-discovery
surfaces in-progress sessions running in sibling worktrees of the same
repo, so a parallel session shows up in the activity bar even when its
worktree isn't opened as a separate workspace folder.

### 5. Batching and robust fallbacks

Outsourced calls fail. The framework treats failure as expected
behavior, not an exception:

- **Tier escalation.** If a tier-1 response is empty, truncated, or
  refused, the router escalates to the next tier (up to two
  escalations). Detection includes the `detect_truncation()` helper in
  [ai_router/utils.py](../ai_router/utils.py) — a hard-won workaround for
  Gemini Pro returning `stop_reason: "end_turn"` on visibly cut-off
  responses (see [docs/planning/lessons-learned.md](planning/lessons-learned.md)).
- **Two-attempt verifier fallback.** If the first-choice verifier fails
  at the HTTPS layer (provider outage, timeout, garbled response), the
  router excludes that provider and re-picks once. The fallback is
  flagged in metrics with `verifier_fallback: true` so the audit trail
  reflects the verifier that actually ran.
- **Verifier-failure escalation ladder.** If both verifier attempts
  fail, the orchestrator follows a documented ladder:
  retry same provider once → fall back to remaining cross-provider
  verifier → **decompose the prompt into smaller requests** → verify
  against the description-of-work → log a Major issue and proceed to
  commit. The work is preserved in git for human review either way.
- **Cost guard on verification.** When a cheap tier-1 generator pulls
  an expensive tier-3 verifier, the savings collapse. The router skips
  verification (and records `verification_skipped: cost_guard`) when
  verifier cost would exceed `max_cost_multiplier × generator cost`.
  Session-verification is exempt — that one is non-negotiable.

### 6. UAT checklist editor integration with E2E pre-screening

For session sets that opt in with `requiresUAT: true`, the orchestrator
authors `<slug>-uat-checklist.json` during the set, matching the schema
at the [UAT checklist editor repo](https://github.com/darndestdabbler/uat-checklist-editor/blob/main/checklist-schema.json).
The human runs the checklist through the freely-available editor at
[darndestdabbler.github.io/uat-checklist-editor](https://darndestdabbler.github.io/uat-checklist-editor/),
which writes review results back inline into the same JSON file.
Pending human review **blocks downstream sessions** unless the human
explicitly overrides (Rule #9), so review feedback can't get lost in
the gap between sessions.

The crucial layer is what runs **before** the human ever sees the
checklist. When a set declares both `requiresUAT: true` AND
`requiresE2E: true`, every functional checklist item must have matching
Playwright coverage (same action, same parameters, same assertions),
and the `uat-coverage-review` task type returns `VERIFIED` only when
that parity holds. Items whose expectation is purely a judgment call
(layout feel, copy quality, aesthetics) are flagged
`IsJudgmentItem: true` with a one-sentence justification; they're
exempt from matching-test parity but still need a sequence-reachability
test so the human is rendering judgment on a verified-live UI rather
than debugging exceptions. **Human UAT is the second line of defense,
not the first** — most regressions never reach the human because the
E2E gate already caught them.

### Other features worth knowing

- **Append-only metrics log + manager report.** Every routed call,
  verifier call, tiebreaker call, and adjudication writes one JSON line
  to `ai_router/router-metrics.jsonl`, spanning every session set in
  the repo. `python -m ai_router.report` produces a markdown summary
  with total spend, the **Opus-only-baseline savings headline** (what
  the same token volume would have cost if every call had gone to
  Opus), per-task-type unreliability rates, top outliers, and
  auto-generated action items for any task type whose composite
  unreliability exceeds 20%.
- **Pushover end-of-session notifications.** When `PUSHOVER_API_KEY` /
  `PUSHOVER_USER_KEY` are set, the orchestrator sends a phone push at
  Step 8 with the session number, verification verdict, and one-line
  summary. The notify happens *before* the optional Step 9
  reorganization-proposals review so the human is never blocked on
  reviewing proposals to receive the "session complete" signal.
- **Self-improving guidance.** On the **last session** of every set,
  the orchestrator reviews [docs/planning/lessons-learned.md](planning/lessons-learned.md)
  and [docs/planning/project-guidance.md](planning/project-guidance.md)
  and proposes promotions: a lesson applied as the right call in two
  or more contexts can be promoted to a Convention; a Convention whose
  rationale has become strategic can be promoted to a Principle.
  Nothing is ever deleted — items only move, with rationale.
- **Provider-agnostic orchestrator handoff.** The
  `activity-log.json` + `spec.md` + `session-state.json` triple carries
  enough state that any of the four supported orchestrators can pick
  up where another left off. The human can run Session 1 with Claude
  Code, Session 2 with Codex or GitHub Copilot, and Session 3 with
  Gemini Code Assistant — switching mid-set requires no migration step.

For the full feature list of the extension itself (worktree auto-
discovery, UAT badges, Playwright reveal, the various copy-as-trigger-
phrase commands, the `Dabbler: Install ai-router` / `Dabbler: Update
ai-router` commands, the graceful "not configured" tree-item in the
Provider Queues / Heartbeats views, the `dabblerSessionSets.*`
settings), see
[tools/dabbler-ai-orchestration/README.md](../tools/dabbler-ai-orchestration/README.md).

---

## UAT and E2E support: when to opt in

> **Universal core, gated extensions, addendum specifics.** Anything in
> the core works unmodified when `requiresUAT: false` and
> `requiresE2E: false` are permanent defaults. UI/UAT/E2E behavior is
> gated on spec-level flags.

Two flags in each spec's `## Session Set Configuration` YAML block
control opt-in:

```yaml
requiresUAT: false
requiresE2E: false
uatScope: none      # per-session | per-set | none
```

The matrix:

| Repo type | Flags | What runs / what is gated |
|---|---|---|
| **Console / library / CLI / no-UI repo.** Examples: a pure refactor repo, a Python data tool, an internal SDK. | `requiresUAT: false`, `requiresE2E: false` (or block omitted entirely — same effect) | Universal core only: build, test, cross-provider verification, commit, notify. The router never invokes `uat-plan-generation` or `uat-coverage-review`. The Session Set Explorer renders each set as a minimal entry — no UAT badge, no UAT/E2E commands, no Playwright lookup. |
| **Repo with E2E coverage but no human UAT.** Examples: a service whose behavior is fully testable end-to-end without human judgment. | `requiresUAT: false`, `requiresE2E: true` | Behavioral changes must ship with matching Playwright coverage; the orchestrator confirms via test discovery before notifying. No UAT checklist is built. The *Reveal Playwright Tests for This Set* command appears in the extension's right-click menu. |
| **Repo with human UAT but no E2E framework.** Examples: legacy UIs not yet wired to Playwright. | `requiresUAT: true`, `requiresE2E: false` | The orchestrator authors `<slug>-uat-checklist.json` during the set, the human runs it via the [UAT checklist editor](https://darndestdabbler.github.io/uat-checklist-editor/), pending review blocks downstream sessions (Rule #9). The extension shows `[UAT n]` / `[UAT done]` badges. The E2E coverage gate is skipped. |
| **Full-stack UI repo.** Examples: any Blazor / React / Vue UI app. | `requiresUAT: true`, `requiresE2E: true` | Full gating: every functional checklist item must have matching Playwright coverage and pass `uat-coverage-review` before the checklist is committed and the human is notified. Judgment items (`IsJudgmentItem: true` in the checklist JSON) are exempt from matching-test parity but still need a sequence-reachability test. |

### Hard-disabling UAT/E2E surfaces in the extension

For a repo that should **never** see UAT/E2E commands in the palette
even if a stray spec accidentally turns the flag on, set the
extension's two enablement settings to `never`:

```jsonc
// .vscode/settings.json
{
  "dabblerSessionSets.uatSupport.enabled": "never",
  "dabblerSessionSets.e2eSupport.enabled": "never"
}
```

The defaults (`auto` for both) already keep these surfaces hidden until
at least one spec opts in — so most consumer repos need no settings at
all. The third setting, `dabblerSessionSets.e2e.testDirectory`, lets
E2E-bearing repos point the *Reveal Playwright Tests* command at a
specific subdirectory (e.g. `tests/MyApp.Playwright`) instead of
searching all of `tests/`.

### Deciding the flags for a *new* spec

The When-UAT-Is-Required and When-E2E-Is-Required heuristics live in
[docs/planning/session-set-authoring-guide.md](planning/session-set-authoring-guide.md).
Spec authors decide; the orchestrator obeys. If a flag turns out wrong
mid-set, correct the spec and revisit at the Step 9 reorganization
review — never override at runtime.

---

## End-of-session output (worked example)

The stop message at Step 10 is the human-readable summary the
orchestrator prints in the chat after committing and pushing. It rolls
up the verification verdict, deferred issues, the routed cost summary
for this session, the build/test result, what's left in the set, the
**routed** next-orchestrator recommendation, and the commit hash. Below
is a verbatim Step 10 message from a real Session 1 of 4:

> **Session 1 of 4 — `resolver-default-members-and-inference`**
>
> - **Verification verdict:** VERIFIED (Round 2; high confidence,
>   2 minor doc fixes applied)
> - **Deferred issues:** None — all 7 findings across 2 rounds were
>   fixed in-session
> - **Cost summary:** $0.278 routed (4 calls: gemini-pro × 2 = $0.014,
>   gpt-5-4 × 2 = $0.264). Synthesis itself was in-conversation
>   ($0 routed).
> - **Build/test:** dotnet build green; full test suite 995 passed,
>   2 skipped (Windows-only), 0 failed. Resolver tests: 247 passed
>   (+27 new in `DefaultMembers/`).
> - **Sessions remaining:** 3 (Session 2: Type Inference synthesis;
>   Session 3: Cross-Reference Index; Session 4: Cross-cut +
>   mechanical tightening).
> - **Recommended next orchestrator:** `claude-opus-4-7` @ effort=high
>   (routed via gemini-pro analysis — Session 2 has the same
>   architecture-synthesis complexity profile as this one).
> - **Commit:** `784e7d9` pushed to main.
>
> Wait for the human before starting Session 2.

A few things worth noticing in this real example:

- **Two verification rounds.** Round 1 turned up 7 findings; the
  orchestrator fixed each, then Round 2 returned VERIFIED. The
  `Deferred issues: None` line is the human-readable assertion that
  no Major or Critical finding is being carried forward — Rule #6
  forbids committing with unresolved Major/Critical issues.
- **Synthesis was in-conversation.** Most of the session's reasoning
  was done by the orchestrator directly because it met the Delegation
  Discipline criteria for direct work. Routed cost is only the four
  `route()` calls — two `gemini-pro` analysis calls and two `gpt-5-4`
  cross-provider verification calls.
- **Routed next-orchestrator recommendation.** The orchestrator did
  not pick `claude-opus-4-7` itself. It routed the analysis through
  `gemini-pro` (Rule #17) and reported what came back. The rationale
  ("same architecture-synthesis complexity profile") came from that
  routed analysis, not from self-opinion.
- **Commit already pushed.** The session's work is on `main` before
  the stop message renders. There is no manual git step between the
  human seeing this output and the change being shareable.

Three other artifacts are produced alongside this stop message:

- **Console cost-report banner** from `print_cost_report()`
  ([ai_router/__init__.py:767](../ai_router/__init__.py#L767)) — sessions
  completed/remaining, total calls, total cost, per-model breakdown.
- **Pushover notification** (if configured) — title
  `Session complete: <slug>`, body containing the session number,
  verdict, and one-line summary. Sent *before* the optional Step 9
  reorganization review so the human is never blocked on it.
- **Appended block in `ai-assignment.md`** — the actuals for this
  session and the routed next-orchestrator recommendation, persisted
  in the session-set folder for future sessions to read.

On the **last session** of a set, the stop message additionally points
at the new `change-log.md` and includes a routed **next-session-set**
recommendation — and if `requiresUAT: true`, it also names the
checklist path, links the editor URL, and states that work is waiting
on human review.

> Aggregate spend, the Opus-only-baseline savings headline, per-task-type
> unreliability, and outliers live in the **manager report**, not the
> per-session output: run `python -m ai_router.report` against
> `router-metrics.jsonl` to produce a markdown summary covering one or
> many sets.

---

## Repository file map

Auto-generated dependency files (`package.json`, `package-lock.json`,
`requirements.txt`, `.gitignore`, `LICENSE`, the rendered VSIX, and
icon assets) are intentionally omitted — they are either trivial or
covered elsewhere in this doc.

### Root

| Path | Purpose |
|---|---|
| [README.md](../README.md) | The lean inviting on-ramp. Hero, 3-paragraph elevator pitch, 4–6 feature bullets each linking into this reference doc, 3-step Quick Start, prerequisites, license. |
| [docs/repository-reference.md](repository-reference.md) | This file. Deep feature descriptions, UAT/E2E flag matrix, worked end-of-session output, file map. |
| [CLAUDE.md](../CLAUDE.md) | Bootstrap instructions **Claude Code** reads automatically. Shared repo facts, consumer tables, and release/version status live here in `docs/repository-reference.md` (§ *Documentation authority and release status*); workflow/rules live in `docs/ai-led-session-workflow.md` and `docs/planning/project-guidance.md`. |
| [AGENTS.md](../AGENTS.md) | Same bootstrap role for **Codex (OpenAI)** and **GitHub Copilot**. Shared repo facts live here in `docs/repository-reference.md`; agent-specific bootstrap is included so a session can start without consulting the other engine files. |
| [GEMINI.md](../GEMINI.md) | Same bootstrap role for **Gemini Code Assistant**. Shared repo facts live here in `docs/repository-reference.md`; only Gemini-specific bootstrap should differ. |

### `ai_router/` — multi-provider routing module

| Path | Purpose |
|---|---|
| [ai_router/__init__.py](../ai_router/__init__.py) | Public surface of the router. Exports `route()`, `register_session_start()`, `mark_session_complete()`, `print_cost_report()`, `print_metrics_report()`, `record_adjudication()`, `send_session_complete_notification()`, and the `find_active_session_set()` discovery helper. |
| [ai_router/config.py](../ai_router/config.py) | Loads and validates `router-config.yaml`, parses the prompt-template markdown files, and resolves effective generation parameters for any `(model, task_type)` pair. Walks up from `cwd` to find a workspace-relative `ai_router/router-config.yaml` before falling back to the package-bundled default (Set 012 Session 1 — no env-var setup needed for the common case). |
| [ai_router/models.py](../ai_router/models.py) | Complexity estimation (the 1-100 score) and the per-tier model-selection logic that drives routing decisions. |
| [ai_router/providers.py](../ai_router/providers.py) | HTTP callers for Anthropic, Google, and OpenAI. Accepts a per-call `generation_params` dict so each provider's reasoning knobs (effort, thinking, thinking_budget, thinking_level) can be tuned per task type. |
| [ai_router/prompting.py](../ai_router/prompting.py) | Builds the model-specific user message from `prompt-templates/task-prompts.md` for each routed task type. |
| [ai_router/verification.py](../ai_router/verification.py) | Rule-based cross-provider verifier selection: different provider, enabled as verifier, matches generator's tier (or one tier higher), cheapest output price wins. Also implements the two-attempt verifier fallback when the first-choice provider fails at the HTTPS layer. |
| [ai_router/metrics.py](../ai_router/metrics.py) | Append-only `router-metrics.jsonl` writer. One JSON line per routed call / verifier call / tiebreaker / adjudication, spanning every session set in the repo for cross-project trend analysis. |
| [ai_router/report.py](../ai_router/report.py) | Manager-oriented markdown report generator (`python -m ai_router.report`). Aggregates the metrics log into headline spend, per-task-type unreliability rates, top outliers, and auto-generated action items. |
| [ai_router/session_log.py](../ai_router/session_log.py) | Legacy compatibility helper for older scripts and cost-report fixtures. `SessionLog` still offers `log_step()`, `save_session_review()`, `save_issue_log()`, and `get_next_session_number()`, and it may create `activity-log.json`, `session-reviews/`, and `issue-logs/` on first use. The current orchestrator workflow does not require those directories. |
| [ai_router/session_state.py](../ai_router/session_state.py) | Reads and writes `session-state.json` (the earliest in-progress signal external tools see). Backs `register_session_start()` / `mark_session_complete()`. |
| [ai_router/close_session.py](../ai_router/close_session.py) | The close-out CLI (`python -m ai_router.close_session`). Sole synchronization barrier between session work and close-out — runs deterministic gate checks, emits `closeout_*` events to `session-events.jsonl`, flips the snapshot to `complete/closed` on success. See [ai_router/docs/close-out.md](../ai_router/docs/close-out.md) for flag matrix and failure modes. |
| [ai_router/notifications.py](../ai_router/notifications.py) | Pushover push-notification helper for end-of-session alerts. Falls back to Windows User/Machine environment if Pushover keys aren't already in the process environment. |
| [ai_router/utils.py](../ai_router/utils.py) | Cross-cutting helpers including `detect_truncation(content, stop_reason)` (catches the Gemini-Pro `end_turn`-but-actually-truncated failure mode — see [docs/planning/lessons-learned.md](planning/lessons-learned.md)). |
| [ai_router/router-config.yaml](../ai_router/router-config.yaml) | Single tuning surface for the router. Defines the model pool, tier mapping, per-task-type parameter overrides, verifier preferences, cost guard, delegation thresholds, metrics on/off, and the `always_route_task_types` list. Edit this file to retune. |
| [ai_router/prompt-templates/system-prompts.md](../ai_router/prompt-templates/system-prompts.md) | One H2 section per provider — the system prompt sent with every routed call to that provider. |
| [ai_router/prompt-templates/task-prompts.md](../ai_router/prompt-templates/task-prompts.md) | One H1 section per task type — the user-message template `prompting.py` applies for that task type. |
| [ai_router/prompt-templates/verification.md](../ai_router/prompt-templates/verification.md) | The independent-verifier prompt template, including the structured JSON response schema (`{verdict, issues}`) that closes the bare-paragraph-misclassified-as-VERIFIED hole. |

### `tools/dabbler-ai-orchestration/` — Session Set Explorer extension (TypeScript)

| Path | Purpose |
|---|---|
| [tools/dabbler-ai-orchestration/src/extension.ts](../tools/dabbler-ai-orchestration/src/extension.ts) | Extension entry point. Wires up the activity-bar tree views (Session Sets, Provider Queues, Provider Heartbeats), the file-watcher refresh, worktree auto-discovery, and registration of every command group below. Compiled to `dist/extension.js` via `npm run package`. |
| [tools/dabbler-ai-orchestration/src/providers/](../tools/dabbler-ai-orchestration/src/providers/) | TreeDataProvider implementations: `SessionSetsProvider` (the activity-bar inventory), `ProviderQueuesProvider`, `ProviderHeartbeatsProvider`. Both queue/heartbeat providers render a graceful "ai_router not installed → click to install" tree-item when `python -m ai_router.queue_status` / `heartbeat_status` exit with `ModuleNotFoundError`. |
| [tools/dabbler-ai-orchestration/src/commands/](../tools/dabbler-ai-orchestration/src/commands/) | Command implementations: `installAiRouterCommands` (`Dabbler: Install ai-router` / `Update ai-router` — pure-logic core in `src/utils/aiRouterInstall.ts`), `cancelLifecycleCommands` (cancel/restore session set), `copyCommand` (the trigger-phrase commands), `gitScaffold`, `openFile`, `queueActions`, `troubleshoot`. (The Set 013 `copyAdoptionBootstrapPrompt` command was retired in Set 063.) |
| [tools/dabbler-ai-orchestration/src/utils/aiRouterInstall.ts](../tools/dabbler-ai-orchestration/src/utils/aiRouterInstall.ts) | Pure-logic install core for the install command. Dependency-injected `ProcessSpawner` / `FileOps` / `InstallPrompts` so the test suite can exercise both PyPI and GitHub-sparse-checkout paths without spawning real subprocesses. Exports `isAiRouterNotInstalled()` (the detector both providers use), `resolveLatestReleaseTag()`, `deriveVenvFromPythonPath()`. |
| [tools/dabbler-ai-orchestration/src/wizard/](../tools/dabbler-ai-orchestration/src/wizard/) | `planImport.ts` (`Dabbler: Import Project Plan`) and `sessionGenPrompt.ts` (`Dabbler: Generate Session-Set Prompt`). The Set 021 `WizardPanel.ts` Get Started webview was retired in Set 060 S3 — `dabbler.getStarted` now focuses the Session Set Explorer's Getting Started form (`src/commands/gettingStartedDoc.ts` opens the static instructions; `src/commands/gettingStartedActions.ts` handles the form's actions), and `dabbler.setupNewProject` (`gitScaffold.ts`) drives the same no-prompt structure-only scaffold. |
| [tools/dabbler-ai-orchestration/src/dashboard/CostDashboard.ts](../tools/dabbler-ai-orchestration/src/dashboard/CostDashboard.ts) | The `Dabbler: Show Cost Dashboard` webview — reads `ai_router/router-metrics.jsonl` (filename resolved through [src/utils/routerConfig.ts](../tools/dabbler-ai-orchestration/src/utils/routerConfig.ts) from `metrics.log_filename`), plots cumulative spend, per-set breakdown, 30-day sparkline, model mix, CSV export. The icon/command is contributed only when the workspace actually routes (the `dabblerSessionSets.routesCost` context key — a resolvable `ai_router/router-config.yaml`), so it is absent on Lightweight. Renders three honest states (disabled when `metrics.enabled == false` / on-but-empty / on-with-data — never the fictional `config.py METRICS_ENABLED` flag) plus a non-blocking staleness banner when `metadata.pricing_reviewed` is older than `review_frequency_days` (default 30). Pure HTML builders live in [src/dashboard/dashboardHtml.ts](../tools/dabbler-ai-orchestration/src/dashboard/dashboardHtml.ts). |
| [tools/dabbler-ai-orchestration/src/configEditor/](../tools/dabbler-ai-orchestration/src/configEditor/) | The `Dabbler: Open Dabbler Config Editor` visual config editor. Reads and writes `ai_router/router-config.yaml`, `ai_router/budget.yaml`, and `ai_router/local-overrides.yaml` (gitignored). Key files: `ConfigEditorPanel.ts` (webview panel — load/save, drift-detect, Python subprocess dispatch); `yamlReadWrite.ts` (comment-preserving YAML round-trip via the `yaml` package); `schemaValidator.ts` (AJV validation of all three config files); `sections/` (one file per section — routing, budget, providers, significance, notifications, local-overrides-summary); `patch.ts` (`applyPatch()` translates the webview `SavePayload` into YAML mutations). |
| [tools/dabbler-ai-orchestration/src/test/suite/](../tools/dabbler-ai-orchestration/src/test/suite/) | Standalone-mocha test suite. ~140 tests covering install paths, router-config preservation, provider tree-item rendering, cancel/restore lifecycle, force-closed badge rendering, fileSystem discovery, etc. |
| `tools/dabbler-ai-orchestration/*.vsix` (local builds, gitignored) | Local `.vsix` builds from `npm run package`. NOT committed — `*.vsix` is gitignored repo-wide (the earlier "most recent committed VSIX" framing of this row was stale; no VSIX is tracked). The Marketplace install (`code --install-extension DarndestDabbler.dabbler-ai-orchestration`) is the recommended path; the offline / firewall-blocked fallback is building locally with `npm run package`. |
| [tools/dabbler-ai-orchestration/README.md](../tools/dabbler-ai-orchestration/README.md) | Extension-local README. Detailed feature reference: every command + setting + view, state derivation, worktree auto-discovery, the `Install ai-router` flow, the graceful not-installed tree-item, refresh triggers. |
| [tools/dabbler-ai-orchestration/CHANGELOG.md](../tools/dabbler-ai-orchestration/CHANGELOG.md) | Per-version release notes. |
| [tools/dabbler-ai-orchestration/media/](../tools/dabbler-ai-orchestration/media/) | Activity-bar and tree-item icons (`icon.svg`, `done.svg`, `in-progress.svg`, `not-started.svg`, `cancelled.svg`) plus the README screenshots (`session-set-explorer-and-spec.png`, `getting-started.png`). |

### `docs/`

| Path | Purpose |
|---|---|
| [docs/session-constitution.md](session-constitution.md) | The **per-session operating doc** (Set 085): the preload contract, the happy-path step sequence, source-of-truth and state-mutation rules, the irreversible-action list, definition of done, recovery/escalation, and the pointer table into the on-demand references. Read before every session. |
| [docs/ai-led-session-workflow.md](ai-led-session-workflow.md) | The single source of truth for **execution mechanics**, consulted on demand at its trigger moments (Set 085): trigger phrases, the 10-step procedure, cross-provider verification rules, the verifier-disagreement adjudication path, delegation discipline, the metrics log, and the authoritative rule list every orchestrator obeys. |
| [docs/adoption-bootstrap.md](adoption-bootstrap.md) | **Retired** (Set 063): a URL-stable deprecation stub redirecting to the extension's Getting Started form (VS Code) and the quick-start manual path (without VS Code). Kept at the same path because extension clients ≤ 0.31.0 fetch the raw URL at click time. |
| [docs/budget-yaml-schema.md](budget-yaml-schema.md) | Canonical contract for `ai_router/budget.yaml`: the post-migration shape (written by the Getting Started form's Full-tier budget step, Set 063), field semantics, writers/readers, and the legacy-compatibility rules for pre-migration files. |
| [docs/repository-reference.md](repository-reference.md) | This file. |
| [docs/planning/project-guidance.md](planning/project-guidance.md) | Durable Principles + Conventions for this repo. Read before every AI-led session. Items get promoted here from `lessons-learned.md` after proving themselves in two-or-more contexts. |
| [docs/planning/lessons-learned.md](planning/lessons-learned.md) | Append-only list of failure patterns and reusable tactics (truncation detection, the verification cost guard, ASCII-only terminal glyphs, the spec-declared-not-inferred UAT/E2E rule, etc.). Lessons graduate to `project-guidance.md` once they've applied in two-or-more contexts. |
| [docs/planning/session-set-authoring-guide.md](planning/session-set-authoring-guide.md) | The single source of truth for **authoring** specs: slug naming, sizing, the Session Set Configuration block schema, deliverables, anti-patterns, templates, and the When-UAT-Is-Required / When-E2E-Is-Required heuristics. Companion to the workflow doc, not a duplicate. |
| [docs/planning/release-process.md](planning/release-process.md) | PyPI release runbook for `dabbler-ai-router` (Set 010). |
| [docs/planning/marketplace-release-process.md](planning/marketplace-release-process.md) | VS Code Marketplace + Open VSX release runbook for the extension (Set 012 Session 2). |
| [docs/sample-reports/](sample-reports/) | Two real `python -m ai_router.report` outputs from contrasting projects, used as credibility anchors in the README's cost-orchestration feature bullet. |
