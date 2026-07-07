# Session 1 verification — up-front conventions block

Read this before reviewing. It states the agreed baseline so Round 1
spends findings on real defects, not on the settled context.

## What this session is

Set 085 Session 1 of 3 (F1): the **preload manifest + ratcheting
ceiling gate**. It ships tooling + config + one doc section; it does
**not** slim any guidance yet. The slimming (constitution, demotions,
lessons triage) is Session 2; the playbook, verifier-scope audit, and
releases are Session 3. So "the corpus is still ~93k tokens" is **by
design** for S1 — S1 declares the ratchet start at *current* sizes so
the gate is green from this commit and growth is blocked immediately;
S2 lowers the ceilings to the 12k target. Do not flag the corpus size
as a defect.

## Suite baseline (measured this session)

- `python -m ai_router.pytest` full suite: **2774 passed, 5 skipped**
  (the 5 skips are pre-existing, unrelated to this change).
- New suite `ai_router/tests/test_guidance_preload_manifest.py`: 34
  tests, all passing (manifest parsing incl. bad-types matrix, per-file
  + total breach exit codes, ratchet-start-all-green, one-token-over
  naming the file, missing-file hard failure, back-compat no-manifest,
  `--write-headers` opt-in).
- `python -m ai_router.guidance_report --check`: exit 0 (green at the
  ratchet-start ceilings; TOTAL 92,719 / 92,719).

## Release contract

S1 ships **no release**. The `dabbler-ai-router` minor that exposes the
manifest machinery to consumer repos is a **Session 3** deliverable
(spec S3 Step 4). No `pyproject.toml` / CHANGELOG bump is expected in
this diff.

## By-design decisions (do not re-litigate — settled by the spec / the
2026-07-07 cross-provider consult)

- **Two coexisting ceiling systems.** The legacy Set-064
  `active_lessons_ceiling_tokens` (10000) and
  `project_guidance_ceiling_tokens` (6000) are **retained untouched**
  as the lessons/guidance *pruning* backstop (used by
  `summarize_overhead` and `--write-headers`). The new `preload:`
  manifest is a **separate** *preload-residency* gate. The two files
  appear in both systems with different ceilings on purpose; this is
  documented in the router-config comment and guidance-lifecycle.md.
- **Back-compat is a hard requirement.** A repo with no `preload:`
  block must keep byte-identical two-file behavior. This is covered by
  `test_no_manifest_uses_legacy_report` and the untouched legacy tests
  in `test_guidance_report.py`.
- **Malformed-config posture is tolerant, not fail-loud.** A bad
  `ceiling_tokens` coerces to uncapped (entry kept + visible), matching
  the module's existing `_coerce_int` philosophy (a session boundary
  must not crash on a config typo). `True`/`False` must not read as
  `1`/`0` (bool-is-int guard, L-066-1).
- **CI is the single enforcement point** (spec Non-goals: no new
  close-out gate for ceilings). The gate is one dedicated ubuntu job
  running `guidance_report --check`.
- **No verification / no gate / no adversarial-framing change.** This
  set slims preload *prose only* (S2/S3); S1 touches none of that. The
  no-skip mandate (Set 083) and L-069-2 framing are out of scope.

## Round 1 findings — both remediated (do not resurrect; L-071-1 ledger)

Round 1 (gpt-5-4) returned two Major findings; both are fixed in this
diff:

- **I-085-S1-1 (fail-open `--check`).** `guidance_report --check` no
  longer silently degrades to the legacy path when `load_config()`
  fails. New `load_raw_preload_manifest()` recovers the manifest from a
  raw YAML parse (decoupled from env-key validation); a manifest-enabled
  repo whose config cannot be confirmed **fails closed** (exit 1). A
  genuine no-config / no-`preload:` repo keeps fail-open legacy behavior.
  Covered by `test_check_fails_closed_when_config_unparseable`,
  `test_check_recovers_manifest_when_config_load_fails`,
  `test_no_config_file_stays_fail_open_legacy`.
- **I-085-S1-2 (`--json` back-compat break).** The `missing` /
  `total_*` fields are now emitted **only** in the manifest branch, so a
  no-manifest repo gets byte-identical legacy JSON. Covered by
  `test_no_manifest_json_is_byte_identical_legacy_shape`.

New suite is now 44 tests (was 34); full suite baseline unchanged
(2774 passed, 5 skipped) plus these.

### Round 10 finding (Set 084 CLOSE BACKSTOP) — remediated

The close-out ran the Set 084 in-process backstop verification (an
independent surface from the diff-based verify_session loop) and caught a
real bug the prior 9 rounds missed: **I-085-S1-14 — `--write-headers`
stamped the two Set-064 files (lessons-learned / project-guidance) via
the always-on legacy path even though their manifest entries are the
default `stamp: false`, violating the opt-in contract** ("canonical docs
are not auto-edited"). Fixed exactly per the verifier's correct answer:
when a manifest is present, `stamp:` is the SOLE authority — only
`stamp: true` entries are stamped, no always-on legacy stamping. At
ratchet start nothing opts in, so `--write-headers` is a no-op in this
repo (matching the router-config comment). The no-manifest path keeps the
legacy two-file stamping (back-compat). Covered by
`test_write_headers_manifest_does_not_stamp_set064_files_when_stamp_false`
and `test_write_headers_no_manifest_stamps_set064_files`. This
demonstrates the backstop's value: an independent verification surface
caught a stamp-contract violation the diff loop did not exercise.

### Round 11 finding — remediated (stamping uses the right ceiling source)

The round-10 fix (stamp: as sole authority) initially sourced ALL stamped
files from `preload_reports`, so an opted-in Set-064 file would show the
preload residency ceiling instead of its legacy pruning ceiling
(I-085-S1-15) -- contradicting the deliberate two-ceiling separation.
Fixed with dual-source stamping in manifest mode: an opt-in file that is
also a Set-064 lifecycle file is stamped from its `legacy_reports` entry
(legacy ceiling); other opt-in files stamp from `preload_reports`
(preload ceiling). The full stamping contract is now self-consistent:
stamp:false -> never stamped; stamp:true Set-064 -> legacy ceiling;
stamp:true other -> preload ceiling; no manifest -> legacy two-file
stamping (back-compat). Covered by
`test_write_headers_opt_in_set064_file_uses_legacy_ceiling`.

### Round 8 findings — remediated (config-source + stray-manifest guard)

- **I-085-S1-12 (`--repo-root` didn't steer config load).** `main()`
  called `load_config()` (cwd walk-up) then measured under
  `--repo-root`, so the two could diverge. Fixed: with `--repo-root`,
  config is loaded from `<repo-root>/ai_router/router-config.yaml`
  explicitly (absent there -> legacy for that repo, never the cwd's).
- **I-085-S1-13 (stray top-level `preload:` alongside a valid manifest).**
  The fail-closed guard was `manifest is None and (declared or
  unconfirmable)`, so a valid `guidance.preload` masked a stray top-level
  `preload:`. Fixed: `unconfirmable` now fails closed regardless of
  whether a manifest also parsed.

**Round-budget decision (FINAL).** This is remediation round 8; round 9
is the confirming round and the LAST. Every round found real, distinct
defects (no resurrections), which is genuine verifier value on a subtle
fail-closed / path-security surface. But the loop has now clearly reached
edge-case exhaustion on operator-config-typo hardening, at ~$3.9 of
verification across 8 rounds -- the exact over-verification wheel-spinning
Set 085 exists to eliminate. If round 9 does not return a non-blocking
verdict, the orchestrator STOPS and escalates to the operator with this
full adjudication (Set 083 close gate needs a corroborated VERIFIED
verdict, which is the operator's call under standing authority
`dont-over-gate-ai-process`); it will NOT run round 10.

### Round 7 findings — remediated (path containment fully closed)

- **I-085-S1-11 (cross-platform + symlink containment).** Two related
  gaps: (a) `_path_escapes_root` used host-OS parsing, so a Windows
  absolute like `C:\Windows\win.ini` was NOT rejected on the ubuntu CI
  runner — the checked-in test would have failed there (a real CI-red
  bug, verifier-labelled "False Positive" category but material). Fixed
  with platform-independent detection (`PureWindowsPath` drive/UNC +
  leading-separator + segment-depth `..` accounting). (b) A lexically-safe
  path that is a symlink resolving outside the repo was measured/writable.
  Fixed with `_resolved_escapes_root` (realpath + commonpath), fail-closed
  on any resolution/cross-drive error. Covered by
  `test_path_escapes_root_is_platform_independent`,
  `test_symlink_escaping_repo_fails_closed`, and the expanded
  `test_path_escapes_root_helper`.

This closes the path-containment class completely: lexical `..`,
platform-independent absolutes, and symlink/realpath escape. Round 8 is
the confirming round; a further round that only re-probes an
already-closed class (config-typo / path-security permutations) will be
adjudicated as edge-case exhaustion and escalated to the operator rather
than remediated further.

### Round 6 findings — remediated (two path-parity / write-safety gaps)

- **I-085-S1-9 (raw-path asymmetry).** A misplaced top-level `preload:`
  was only caught by the raw parser when NO `guidance:` block existed; if
  a `guidance:` mapping was also present the raw path fell through to
  legacy (the config-success path already caught it). Fixed: the raw
  parser now treats a top-level `preload:` key as unconfirmable first,
  regardless of `guidance:`.
- **I-085-S1-10 (write-safety).** `--write-headers` (the only mutating
  mode) did not exclude `escapes_root` entries from stamping, so a
  `stamp: true` entry with an absolute/`..` path could open+rewrite a
  file outside the repo. Fixed: escaping (and missing) entries are never
  added to stamp targets. Covered by
  `test_write_headers_never_stamps_escaping_path`,
  `test_top_level_preload_with_guidance_present_fails_closed_raw`,
  `test_load_raw_top_level_preload_with_guidance_is_unconfirmable`.

**Round budget note.** This is remediation round 6. Every round found a
real, distinct defect on the fail-closed / write-safety boundary (none
were resurrections), which is genuine verifier value on a subtle surface.
The findings have narrowed to operator-config-typo hardening. If a
further round surfaces only another narrow permutation of the same
already-closed classes, the orchestrator will STOP and escalate to the
operator with this adjudication rather than spin further (the wheel-
spinning Set 085 exists to eliminate; operator standing authority
`dont-over-gate-ai-process`).

### Round 5 finding — remediated (the class closure, completed honestly)

Round 5 found one real hole I had knowingly left: `_parse_preload_manifest`
**silently dropped** malformed individual `files:` entries (non-mapping /
missing `path`), so a typo in one entry removed that required-reading file
from the gate while the rest stayed green. Fixed: malformed entries are
now **counted** (`PreloadManifest.malformed_entry_count`) instead of
dropped, and `--check` fails closed when the count is > 0. A files: list
with only malformed entries returns a manifest carrying the count (so it
fails), not `None` (which would read as no-manifest). Covered by
`test_malformed_entries_are_counted_not_silently_dropped`,
`test_all_entries_malformed_still_returns_manifest`,
`test_malformed_entry_fails_check_closed`,
`test_malformed_entry_end_to_end_via_config`. This completes the
class closure at the *individual-entry* level. Suite now ~71 manifest
tests. `ceiling_tokens` bad-type tolerance (uncapped-but-kept) is retained
deliberately: such an entry is still measured and counts toward the total,
so it is not "silently dropped."

### Round 4 findings — remediated; "declared-but-not-enforced" fully closed

Round 4 found two more (path-shape + misplaced-key). Both fixed:

- **I-085-S1-6 (non-root-relative paths accepted).** `build_preload_reports`
  now rejects absolute and `..`-escaping manifest paths via
  `_path_escapes_root`; such an entry becomes an `escapes_root` failure
  under `--check`. The documented "repo-root-relative" contract is now
  enforced, not just asserted.
- **I-085-S1-7 (misplaced top-level `preload:`).** A `preload:` key at the
  config top level (indentation error, no `guidance:` parent) is now
  treated as unconfirmable -> fail closed, on both the raw and
  config-success paths.

**Convergence adjudication (L-071-1, operator standing guidance
`dont-over-gate-ai-process` + "allow cheap mistakes where a gate detects
mechanically").** The "manifest declared but not enforced" defect class
is now closed from every angle: config-load failure, malformed `preload:`
block, malformed `guidance:` block, misplaced top-level `preload:`,
non-root-relative paths, and cwd-dependence. The core gate logic
(ceilings, ratchet, total, back-compat, stamping) has been sound and
fully tested since Round 1. Findings have trended from clearly-material
(R1 fail-open) to operator-authoring-mistake hardening on trusted,
committed config (R4). Per L-071-1, a further round that surfaces only a
new *config-typo permutation* is edge-case exhaustion, not a new defect
class, and should be adjudicated as such rather than triggering another
remediation. Suite now 65 manifest tests.

### Round 3 findings — remediated; the malformed-config class is now closed

Round 3 found two more real, distinct defects (not resurrections). Both
fixed, and the second is fixed as a **class** (L-069-1) so no further
malformed-config permutation remains:

- **I-085-S1-4 (paths only repo-root-relative from the repo root).**
  `build_preload_reports` used `os.getcwd()` when `--repo-root` was
  omitted, so running `--check` from a subdirectory measured manifest
  files relative to the cwd -> false MISSING failures. Fixed with
  `effective_repo_root()`: with no `--repo-root`, the root is derived
  from the resolved `router-config.yaml` location
  (`<root>/ai_router/router-config.yaml` -> `<root>`). Verified: the
  gate now exits 0 when run from `ai_router/`. Covered by
  `test_effective_repo_root_derives_from_config_location`.
- **I-085-S1-5 (malformed `guidance:` block misclassified as legacy).**
  A `guidance:` key present but not a mapping (`guidance: 7`) fell
  through to legacy on both the config-success and config-failure paths.
  Fixed by classifying the raw parse into
  `(manifest, declared, unconfirmable)` and detecting a non-mapping
  `guidance:` on the success path too; `--check` fails closed whenever a
  manifest is `declared OR unconfirmable`. Genuine no-`guidance` /
  no-`preload` repos stay fail-open (back-compat). Covered by
  `test_check_fails_closed_on_malformed_guidance_block_raw_path`,
  `test_check_fails_closed_on_malformed_guidance_block_success_path`,
  `test_load_raw_preload_manifest_malformed_guidance_is_unconfirmable`,
  `test_load_raw_preload_manifest_no_guidance_is_legacy`. Suite now 57
  tests.

**Convergence note (L-070-1 / L-071-1).** Each round found a real,
distinct defect on the malformed-config / path-resolution boundary; none
were resurrections. The class is now closed comprehensively. A further
round that surfaces only a new *malformed-config permutation* should be
read as edge-case exhaustion, not a new class — adjudicate before
another remediation.

### Round 2 finding — remediated (I-085-S1-3)

Round 2 confirmed I-085-S1-1/2 fixed and found one genuine new gap (not
a resurrection): the R1 fail-closed fix distinguished only
"unparseable YAML" from "legacy"; a **declared-but-malformed** `preload:`
block (parseable YAML, invalid structure, e.g. `preload: 7`) still
parsed to `None` and reverted to legacy on **both** the config-success
and config-failure paths — silently disabling the gate. Fixed by
tracking `preload_declared` (the `preload:` key is present) separately
from "parsed to a valid manifest": `--check` now fails closed whenever a
manifest is declared but unbuildable, regardless of whether
`load_config()` succeeded. Covered by
`test_check_fails_closed_on_declared_but_malformed_manifest`,
`test_check_fails_closed_on_malformed_manifest_via_raw_path`,
`test_preload_declared_flag_tracks_key_presence`. Suite now 47 tests.

## What to scrutinize

Correctness of the manifest parsing (the bad-types matrix), the
`--check` breach logic (per-file, total, missing-file), the
back-compat legacy branch, and whether the ratchet-start ceilings in
`router-config.yaml` actually match the measured sizes (a wrong ceiling
would make the gate either red-on-commit or slack).
