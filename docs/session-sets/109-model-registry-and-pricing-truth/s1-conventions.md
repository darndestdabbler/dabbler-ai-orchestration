# Verification conventions — Set 109, Session 1

Read this before the diff. It states the agreed baseline so a round spends its
findings on real defects rather than on the baseline itself.

## What this session was authorised to build

Session 1 of 4 of `109-model-registry-and-pricing-truth`, titled
*"Enumeration, the drift gate, and served-model truth"*. Its authored plan:
build provider enumeration for openai / anthropic / google following the
existing `copilot_catalog.py` pattern; write a lockfile of the ids on offer
plus a probe timestamp; ship a drift gate that fails loud when a configured
`model_id` is not offered; record the model the provider says it **served**;
add tests. Its declared **Touches** for `ai_router/router-config.yaml` is
**metadata only — no price edits this session**.

**Ends with** (both halves proven, evidence in the session's activity log):

1. `python -m ai_router.model_inventory --check` fails loud on the live
   `gpt-5.6` entry — it exits 1 and names `gpt-5-6 / model_id='gpt-5.6'`.
2. A routed call records both the requested and the served model id — three
   live calls did, and `gpt-5.4-mini` was recorded as served by
   `gpt-5.4-mini-2026-03-17`.

## Suite baseline

- `python -m pytest -m "not e2e"`: **3207 passed, 6 skipped, 8 deselected, 0
  failed** (21m46s). No tracked failures; the baseline is fully green.
- Three fixes landed *after* that run — all found by the orchestrator's own
  re-read of the new module, all confined to `ai_router/model_inventory.py`
  and its own two test files, which nothing else in the package imports:
  (a) `is_enabled` defaulted to `False` where `models.py` / `utils.py` /
  `verification.py` all default it to `True`, which would have demoted a
  routable entry that omits the flag to a mere note; (b) a `--strict` run
  printed an "OK" summary while exiting 1; (c) a snapshot with no `probed_at`
  could never be judged stale and so would pass forever. Those files now run
  **66 passed**, and a confirming full-suite re-run is in flight.
- The two new test files add 66 tests, all passing, none opening a socket.
- `python ai_router/scripts/drift_guard.py` — OK.
- `python ai_router/scripts/tutorial_gate.py` — OK.
- `python -m ai_router.guidance_report --check` — OK (10,895 / 12,000 tokens).
- The `-m e2e` mark (git-fixture orchestrator harness) is excluded, matching
  the repo's pre-commit run. It is not affected by this session's changes.
- No TypeScript, extension, webview, state-writer, or fixture-harness surface
  was touched, so Layers 2 and 3 do not arm (`requiresE2E: false`, and
  L-064-12's trigger conditions are not met). pytest is the executable gate.

## Release contract

- Router-side only. `ai_router/CHANGELOG.md` gains **`[Unreleased]`** entries;
  **no version bump and no PyPI publish** — publishing is operator-gated and
  recorded at release time.
- The extension is untouched; no VSIX, no Marketplace action.

## By-design, and deliberately not defects

1. **The repository FAILS its own new gate, on purpose.** `router-config.yaml`
   still sends `model_id: gpt-5.6`, an id OpenAI does not list. That entry is
   the live specimen the gate's Ends-with line is proven against. **Session 4
   of this set** splits it into the three real variants and retires the bare
   alias, with the price work that has to accompany it. Reporting "the config
   is wrong" is re-reporting the spec.

2. **The gate is not wired into any automatic check, and that is the
   decision.** `ai_router/scripts/drift_guard.py` is not in the wheel, and
   `test_drift_guard.py` asserts the real repository passes every check —
   wiring a check the registry currently fails would turn the committed suite
   red for a defect S4 is scheduled to fix. The wiring is S4's, after the
   registry is correct. The reasoning is recorded in the module docstring, in
   `router-config.yaml`'s registry header, and in the changelog.

3. **`gemini-3-pro` is reported as a note, not a failure.** It is an
   identity-only entry (`is_enabled: false`, never routed to) recording what a
   Gemini Code Assist orchestrator *is*; the Gemini API lists
   `gemini-3-pro-preview`. There is deliberately **no exemption flag** — it is
   reported on every run so it cannot go quiet — and `--strict` promotes it to
   a failure for anyone who wants that reading.

4. **No prices were touched.** Every price in `router-config.yaml` is
   unchanged, including the `gpt-5-6` entry's known-understated
   `$2.50 / $15.00`. The pricing schema, the scraper, and the corrected
   registry are Sessions 3 and 4.

5. **The two-metrics-row anomaly was not investigated.** It is Session 2's
   entire subject, and its spec is explicit that the two hypotheses are
   distinguished only by counting HTTP requests at the call boundary. This
   session counted nothing. `ai-assignment.md` records a *lead* for S2
   (route()'s auto-verification branch) and labels it as a lead.

6. **`model-inventory.lock` is not in `pyproject.toml`'s `package-data`.**
   Same call as `copilot-catalog.lock`: which ids an account is offered is
   account-scoped, so shipping one operator's snapshot in the wheel would hand
   consumers stale data that looks authoritative.

7. **`CHANGELOG.md` is a small, deliberate widening** of the spec's declared
   Touches for this session (which names only `router-config.yaml`). A new
   public module and two new metrics columns are exactly what the release
   record exists for; omitting them would leave it wrong. Flagged here rather
   than done quietly.

## Severity rubric for this round (L-095-1)

Grade by **consequence**: probability the stated failure scenario materialises
for a real user × impact on this session's objectives. Low probability **or**
low impact is **Minor**, even when technically correct. A finding with no
plausible failure scenario is **Minor by definition**. Please state a concrete
failure scenario — inputs/state → wrong behaviour — for anything graded
Critical or Major.
