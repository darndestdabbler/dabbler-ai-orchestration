# Session 1 — remediation, round 1

Five Major findings from the discovery fan-out (`gpt-5.5`, lenses
`spec-conformance` and `failure-scenario`). All five accepted; none
disputed. Two of them are the same defect class this session exists to
close, left half-closed by the first implementation, which is exactly the
kind of thing a same-author review does not catch.

## F1 / F3 / F4 — the re-derivation was still incomplete

**Accepted.** The first pass derived pytest's input set empirically (a
full run under an audit hook) but derived Layer 2 and Layer 3 only from
their *commands*. Commands name the build inputs; they do not name what
the specs read at runtime. Re-derived both from the test sources, and
each addition below is anchored to a named test that reads it:

| suite | added | read by |
| :--- | :--- | :--- |
| mocha | `media/` | `statusIconAssets.test.ts` |
| mocha | `test-fixtures/` (extension) | `uatMatrixFixtures.test.ts` |
| mocha | `dist/templates/` | `consumerBootstrap.test.ts` — asserts the REAL packaged bundle |
| mocha | `docs/templates/` | `consumerBootstrap.test.ts`, `sampleProjectCore.test.ts` |
| mocha | `test-fixtures/` (repo root) | `coldStartSnapshot.test.ts` golden tree |
| mocha | `ai_router/` | `moduleCliFixture.ts` → `python -m ai_router.modules`; `sampleProjectSmoke.test.ts` → `start_session` / `close_session` |
| mocha | `scripts/` | `walkStager.test.ts` `require`s `vscode-launch.js`, `stage-walk.js`, `make-uat-workspace.js` directly |
| playwright | `dist/templates/`, `resources/` | the first-run walkthrough drives the real scaffold/installer, which read the BUNDLED copies |
| playwright | `docs/templates/` | `esbuild.js` copies it into `dist/` — same chain |
| playwright | `ai_router/`, `pyproject.toml` | `vsix-first-run-walkthrough.spec.ts:242` sets `DABBLER_ROUTER_INSTALL_SPEC` to the repo root |

The `ai_router/` → mocha edge is the one worth naming. It is a
cross-language dependency the declaration missed entirely, and it is not
hypothetical: Set 114 S3's own note records `sampleProjectSmoke` being
broken by that set's new **Python** gates. Under the old declaration the
session that caused it owed Layer 2 nothing.

Cost is real and accepted: a router-only session now owes Layer 2. That
is the correct direction — the alternative is a suite that cannot notice.

**Not widened, and named as a decision:** Playwright still declares three
`ai_router` writers file-by-file rather than `ai_router/`. Layer 2 shells
out to CLIs whose import graphs reach most of the package; Layer 3's
Python dependency is the `tests/e2e/` harness plus the state writers whose
shape the views render, and arming a 13-minute browser suite for every
router edit is the cost that gets a gate routed around rather than
satisfied. Recorded in the module docstring with the condition that would
prove it wrong.

**Superseded within this same round.** The paragraph above was written,
and then the acceptance harness ran the verifier's own criterion and
refused it. The condition that would prove it wrong was already true:
`vsix-first-run-walkthrough.spec.ts:242` sets
`DABBLER_ROUTER_INSTALL_SPEC` to the repo root, so the cold-start walk
`pip install -e`s **this** tree rather than the published wheel. Set
122 S2 is the incident — the walk went structurally red the moment the
extension depended on router code that was not yet released.

So Playwright now declares `ai_router/` and `pyproject.toml`, and the
narrowing is gone. The cost is real and named rather than denied: a
router-only session now owes Layer 3. The sanctioned relief is to make
the suite cheaper, not the declaration smaller — smoke/full E2E tiering
is deferred in `verdict.md` §7 behind exactly this trigger ("two
independently executable named commands with measured runtimes",
represented as separate `SuiteSpec` entries). A declaration narrower than
the truth is not a cost saving; it is a gate that cannot fire.

This is the finding of the session that a same-author review would not
have produced: the reasoning read well, and only its premise was false.

## F2 — malformed items inside a surviving `covers` list

**Accepted, and it is the sharper half of the defect this set was written
for.** The first fix reported entries the loader *dropped*. It still
filtered bad values out of entries it *kept*: `covers: ["src/", "", 3]`
loaded a suite whose declared input set had silently shrunk, with
`loaded.errors` empty, so `check_test_run_fresh()` had nothing to block
on. A silently narrowed input set is the same fail-open failure as a
silently dropped suite, one level down.

Every field is now checked and every unusable value reported, and an entry
carrying one does not load at all — it must not load *as if it were
understood*.

## F5 — malformed fields inside otherwise valid entries

**Accepted**, same fix, and `expensive: "true"` is the worst case in the
whole class: a quoted boolean is not `True`, so the suite loads as
**cheap**, stays visibly present in the config, and quietly stops being
governed by the close gate. Now reported with that consequence spelled out
in the message.

## Verification of the fixes

Seven new parametrized cases plant each malformed shape and assert both
that it is reported and that the entry does not load. Fifteen more assert
that each newly-declared real input is now matched by the suite that reads
it, and one asserts the widening did not become "every change pays" —
`README.md`, `CONTRIBUTING.md` and the planning docs still owe nothing.

One existing assertion had to move with the truth:
`test_unrelated_surfaces_do_not_require_layer_3` listed
`ai_router/notifications.py` as a surface Layer 3 does not care about.
That encoded the narrowing this round removed, so the case is now its own
test — `test_a_router_module_now_DOES_require_layer_3` — with the reason
recorded. The boundary it guarded still exists; the router moved to the
other side of it.

## A note on three acceptance criteria that report FAIL

Findings #2, #3 and #4 are **accepted and fixed**; nothing here disputes
them. Their machine criteria nevertheless still exit non-zero, and the
reason is in the criteria rather than in the fixes.

Finding #1's criterion begins:

```python
import sys; sys.path.insert(0, "ai_router"); import run_of_record as r
```

and runs clean (the harness auto-closed it on baseline discrimination).
Findings #2–#4 instead load the module by file path
(`importlib.util.spec_from_file_location`) **without** that `sys.path`
insert, so `run_of_record`'s direct-script fallback —
`from verification_stamp import sha256_hex` — has nowhere to resolve
from. They crash on import:

```
ImportError: attempted relative import with no known parent package
ModuleNotFoundError: No module named 'verification_stamp'
```

That happens before a single assertion is evaluated, so the criteria
cannot distinguish a fixed tree from a broken one — they would have
failed on any tree.

Running each criterion's own assertions against a properly imported
module gives:

| criterion path set | result |
| :--- | :--- |
| #2 all six mocha paths (`docs/templates/…`, `test-fixtures/cold-start/…`, `media/…`, `scripts/vscode-launch.js`, extension `test-fixtures/…`) | all matched |
| #3 all four playwright paths (`docs/templates/…` ×2, `ai_router/modules.py`, `pyproject.toml`) | all matched |
| #4 both loader cases (`expensive: "true"`, `covers: [..., 42]`) | both report errors |

`scripts/` and the `ai_router/` + `pyproject.toml` widening in the tables
above were added *because* of these criteria — they named real gaps that
the first remediation had missed. The criteria did their job; only their
harness lines are unrunnable.
