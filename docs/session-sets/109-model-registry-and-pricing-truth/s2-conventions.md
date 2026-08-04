# Verification conventions — Set 109, Session 2

Read this before the diff. It states the agreed baseline so a round spends its
findings on real defects rather than on the baseline itself.

## What this session was authorised to build

Session 2 of 4 of `109-model-registry-and-pricing-truth`, titled *"Routing
transparency — what actually gets called"*. Its authored plan: instrument the
provider-call boundary to count real HTTP requests per `route()`; reproduce the
two-metrics-row observation with `task_type="architecture"` and
`exclude_providers=["anthropic"]`, with and without `complexity_hint`, and
determine **which hypothesis holds** — a second real call, or a
duplicate/mis-attributed row; check whether `exclude_providers` is honoured on
every path, explicitly including `verify_session`, and **state the result
plainly either way**; fix what the evidence supports **and nothing more**; add a
regression test pinning the invariant that an excluded provider never appears
in the metrics rows for that call.

**Creates:** `s2-routing-transparency-findings.md`.
**Touches:** the router's call/metrics path plus its tests.
**Ends with:** the number of real HTTP calls per `route()` is known and
asserted, and `exclude_providers` is proven honoured (or fixed) on every path
including verification.

Both halves are met and the evidence is in the activity log and the findings
doc: a live trace showed **two** HTTPS POSTs for one `route()`, the second to
`api.anthropic.com` despite the exclusion; post-fix the same call issues
**one**, and 27 tests assert the invariant.

## Suite baseline

- `python -m pytest -m "not e2e"`: **3257 passed, 6 skipped, 8 deselected, 0
  failed** (23m32s), on the exact tree under review. No tracked failures; the
  baseline is fully green.
- Run twice: **3254** on the tree that went into round-1 verification, then
  **3257** after the round-1 nit fixes added three tests. Both green, both full
  runs; the second is the one that matches the diff being reviewed.
- The prior baseline entering this session was S1's **3230 passed, 6 skipped,
  8 deselected, 0 failed**. The delta is **+27**, exactly the new test file —
  no existing test was changed, removed, or newly skipped.
- The new test file adds **27** tests, all passing, none opening a socket.
- **Falsifier check performed:** with the three fix files (`__init__.py`,
  `models.py`, `utils.py`) reverted to HEAD and the instrumentation kept, **9**
  of the 27 fail; restored, all 27 pass. The regression tests are known to
  discriminate rather than merely to be green. (The tier-2 reproduction is
  deliberately *not* among the 9 — at tier 2 the verifier is on a permitted
  provider either way, so that shape never exhibited the defect. The tier-3
  test is the one that does.)
- `python ai_router/scripts/drift_guard.py` — OK.
- `python ai_router/scripts/tutorial_gate.py` — OK.
- `python -m ai_router.guidance_report --check` — OK (10,895 / 12,000 tokens).
- `python -m ai_router.model_inventory --check` — still exits **1** on the
  `gpt-5-6` specimen, unchanged by this session (see by-design item 3).
- The `-m e2e` mark (git-fixture orchestrator harness) is excluded, matching the
  repo's pre-commit run. It is not affected by this session's changes.
- No TypeScript, extension, webview, state-writer, or fixture-harness surface
  was touched, so Layers 2 and 3 do not arm (`requiresE2E: false`, and
  L-064-12's trigger conditions are not met). pytest is the executable gate.

## Release contract

- Router-side only. `ai_router/CHANGELOG.md` gains **`[Unreleased]`** entries;
  **no version bump and no PyPI publish** — publishing is operator-gated and
  recorded at release time.
- The extension is untouched; no VSIX, no Marketplace action.

## By-design, and deliberately not defects

1. **A route() under an exclusion may now return unverified.** When the
   exclusion leaves no eligible verifier, `_run_verification` returns `None`
   and `route()` proceeds — the contract it already had for "no eligible
   verifier exists". On the current registry a tier-3 generator with
   `anthropic` excluded has **no** surviving verifier, because the verifier
   rules admit only tier 3–4 and every tier-3 non-OpenAI entry is Anthropic.
   This is the intended outcome, not a regression: the auto-verify pass is a
   courtesy on an ordinary routed call, and declining it is strictly safer than
   calling the one provider the caller barred. It is stated in the findings
   doc, the changelog, and the `_run_verification` docstring. **Session 4
   changes the registry shape** that produces it.

2. **Requests and metrics rows are deliberately NOT one-to-one.** An escalation
   issues a second request to a different provider and records **one** row, by
   design; a retry does the same. The suite pins the *directional* invariant —
   every provider a row names must be one the router actually called — and
   explicitly does not assert the converse. A finding that the counts "should"
   match is re-reporting a documented design choice. (This session tried
   writing the equality assertion; the harness falsified it immediately.)

3. **The repository still FAILS `model_inventory --check`, on purpose.**
   `router-config.yaml` still sends `model_id: gpt-5.6`. That entry is S1's
   live specimen and **Session 4** retires it. Reporting "the config is wrong"
   is re-reporting the spec. No prices were touched this session either — the
   pricing schema and scraper are Session 3.

4. **`verify()` was deliberately not given an `exclude_providers` parameter.**
   It is not the same defect: it never had an exclusion to drop, and
   `pick_verifier_model`'s first rule already bars the generator's own
   provider, so `verify()` is cross-provider by construction. Adding a caller
   exclusion would be a new feature, not a fix, and the spec says fix what the
   evidence supports and nothing more.

5. **The copilot-cli boundary is not HTTP-traced.** That transport spawns a CLI
   rather than issuing a POST, and it already counts its own dispatches
   (`_copilot_invocation_count`, surfaced as `local_invocations` on every
   seat-profile row). Its *exclusion* defect was fixed; instrumenting it a
   second way would add a surface to measure something already measured.

6. **The `is_enabled` bypass fix is a deliberate scope call, declared.** It is
   *not* the same defect class as the exclusion leak — a different rule was
   being bypassed. It is fixed here because S1's disposition handed it over
   explicitly, because it directly contradicts the identity-only contract S1
   established for `is_enabled: false`, because every fix is a **removal**, and
   because Session 4 rewrites exactly those routing tables. S1 named one site;
   a sweep for the pattern found two more, and **this session's own round-1
   verification found a fourth** (`_tiebreaker_reroute`, which never consulted
   the flag at all and so was invisible to a search for a defective check).
   All four are fixed. Fixing only the reported one would have left three live
   (L-069-1).

7. **`conftest.py` gained `call_trace` in its shared-module aliasing list.**
   Required, not incidental: `call_trace` holds module-level ContextVar state,
   so a test opening the trace on the bare module while `providers` announced
   on the package module would have seen an empty trace and read it as *no
   request was sent* — the exact false negative the module exists to prevent.
   This is the mechanism the conftest already documents for such modules.

8. **`CHANGELOG.md` and `model_inventory.py` edits beyond the declared
   Touches.** The changelog records a new public module plus a behaviour
   change, which is what a release record is for. `model_inventory.py` and one
   S1 changelog paragraph were edited **comment/docstring-only** under L-065-1:
   three surfaces justified S1's "treat a pinned entry as routable" rule by
   citing the very bypass this session removed, so all three were corrected in
   one pass. The gate's behaviour is unchanged and deliberately so. Flagged
   here rather than done quietly.

## Severity rubric for this round (L-095-1)

Grade by **consequence**: probability the stated failure scenario materialises
for a real user × impact on this session's objectives. Low probability **or**
low impact is **Minor**, even when technically correct. A finding with no
plausible failure scenario is **Minor by definition**. Please state a concrete
failure scenario — inputs/state → wrong behaviour — for anything graded
Critical or Major.
