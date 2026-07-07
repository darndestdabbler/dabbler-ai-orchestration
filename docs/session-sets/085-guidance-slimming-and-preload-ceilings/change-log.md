# Change Log — Set 085 (Guidance Slimming And Preload Ceilings)

> **What this set delivered:** the always-loaded session-start guidance
> corpus cut to a **~10.7k-token operating core under a CI-enforced 12k
> ceiling**. (Two baseline numbers, reconciled: the spec's measured
> ~65k covered the six core required docs; the S1 ratchet-start
> manifest declaration summed to 92,719 because it covered **every**
> required-reading file at its then-measured size, including
> quick-start and the engine bootstrap file.) The shrink is made
> permanent by ratcheting per-file token ceilings — executing the
> 2026-07-07 operator-initiated cross-provider consult (Gemini Pro +
> GPT-5.4, independent convergence; raw responses + synthesis in this
> directory). Four deliverables across three sessions.
>
> **F1 — preload manifest + ratcheting ceiling gate (S1).** The
> router-config `guidance:` block gains a declarative `preload:` manifest
> (`{path, ceiling_tokens, stamp}` entries + `total_ceiling_tokens`);
> `guidance_report` reports every entry per-file and total, `--check`
> exits non-zero on any breach (missing manifest files are a hard
> failure; malformed/misplaced manifests fail closed), and CI runs
> `--check` so a breach fails the build — at ceiling, adding prose
> requires removing prose. `--write-headers` became `stamp: true` opt-in.
> Ceilings ratchet **down only**; raising one is an operator-authorized
> config edit. Back-compat: no `preload:` block → byte-identical Set-064
> two-file behavior. Nine verification rounds (gpt-5-4) hardened the
> fail-closed/path-containment surface; three close-backstop rounds more
> (12 total) before the operator invoked the severity-gated stop.
>
> **F2 — the constitution and the demotions (S2).**
> `docs/session-constitution.md` (2,758 tokens against a 4,000 budget)
> became the per-session operating doc: happy path, source-of-truth and
> state-mutation rules, the irreversible-action list, definition of done,
> recovery/escalation, and a per-step pointer table. The workflow doc,
> schema doc, close-out doc, and authoring guide were demoted to
> authoritative **on-demand** references (uncapped by design); the
> required-reading contract (constitution + project-guidance + active
> lessons + one engine bootstrap file) was rewritten on every live
> surface and stale echoes grepped to zero. The manifest counts the
> largest engine file (AGENTS.md) as the sum-gate representative.
>
> **F3 — admission test + prose→gate→archive pipeline (S1/S2).**
> Documented canonically in `docs/guidance-lifecycle.md`: preload
> residency requires recent recurrence AND high miss cost AND weak
> automated detectability AND no executable-gate equivalent AND ≤150
> tokens. The operator-approved lessons triage rewrote the active tier
> from 9,797 to 2,385 tokens (8 condensed keeps, 4 gate-and-archive with
> `encoded-in` pointers, 5 archives; full texts preserved in
> `lessons-archive.md`).
>
> **F4 — portability + the release (S3).**
> `docs/guidance-slimming-playbook.md`: the engine-agnostic,
> repo-portable recipe (measure → admission-test classify → demote
> gate-duplicating prose → write the constitution → declare the manifest
> → ratchet), carrying the consensus "allow cheap mistakes" limits
> verbatim and the A/B signals to watch. Router `0.30.0` (the manifest
> machinery) and extension `0.40.0` (template bundle links the
> constitution) prepared; **publish pending operator authorization**.

## Session 3 (this session) — verifier scope, playbook, dogfood, release prep

- **Verifier-context audit: no tool change; the literal-list deviation
  is explicit and operator-adjudicated.** `verify_session` assembles
  the spec excerpt + `git status --short` + the complete diff + the
  up-front conventions block (test/gate outcomes ride there, mandated
  by promoted convention L-064-10) into the adversarial template — no
  process manual, matching the consensus-adopted scope list ("diff,
  test output, gate outcomes, spec"). The constitution is deliberately
  not fed — a recorded deviation from the spec sentence's literal
  five-item list, whose "and the constitution" was appended at
  authoring time; the routed second opinion
  (`s3-verifier-scope-audit.txt`) is internally split (top-line:
  add it; reasoned answer: omission is the better state) and the
  adjudication packet is in `disposition.json` for the operator.
  `verify_session.py` and the templates untouched pending that call.
- **Bundled-default manifest guard** (Major portability defect, found
  in release prep, fixed before it could ship): the packaged
  `router-config.yaml` declares *this repo's* manifest, and a
  pip-installed consumer with no workspace config would have inherited
  it via the loader's bundled-default fallback — `--check` hard-failing
  on foreign files. Bundled-default resolution is now "no config" for
  guidance purposes; workspace / `--repo-root` / `AI_ROUTER_CONFIG`
  keep enforcing. Four new tests; documented in
  `guidance-lifecycle.md`.
- **Live dogfood recorded** (first A/B datapoint, in
  `disposition.json`): the session ran from the slimmed ~10.7k preload
  alone; four on-demand docs opened at their trigger moments
  (guidance-lifecycle, CONTRIBUTING, the workflow doc's critique-stage
  section, the disposition schema); the workflow doc was never opened
  for the happy path.
- **Releases prepared, not published:** router `0.30.0` + extension
  `0.40.0` (version bumps, CHANGELOGs, repository-reference rows);
  rollback text names only registry-live `0.29.0` / `0.39.0`.

## Suite state at set close

`pytest` 2816 passed / 5 skipped; extension `tsc --noEmit` clean +
1270 unit tests passing; `guidance_report --check` green at
TOTAL 10,673 / 12,000 tokens; `validate_guidance_meta` OK (25 ids).
