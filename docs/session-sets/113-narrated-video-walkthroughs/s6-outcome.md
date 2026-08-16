# Session 6 — why the pull critique could not reach two providers

**It reaches them now.** Two unrelated router-side defects had landed on the
same stage, which is why Session 4's three attempts looked like one
intermittent provider problem. Neither was a provider outage, and neither was
the servant-integrity guard catching a dishonest critic.

The reproduction, taken before anything was changed, is
[`s6-reproduction.md`](s6-reproduction.md) with raw numbers in
[`s6-reproduction-measurement.json`](s6-reproduction-measurement.json). The
live proof is in [`s6-critique-proof.json`](s6-critique-proof.json).

## The two defects, and a third and fourth found on the way

| # | Defect | Consequence in Session 4 |
| :--- | :--- | :--- |
| 1 | `pull_verifier._resolve_model` returned the pinned string verbatim and the bindings sent it as `body["model"]`. A router-registry **alias** is not a provider model id. | **HTTP 400** `model_not_found` on `gpt-5-6-sol` and `gpt-5-5` |
| 2 | The guard re-derived ground truth from a **live** tree and read any difference as servant dishonesty. | **`DeterministicServantViolation`** against the honest default servant |
| 3 | `resp.raise_for_status()` discarded the provider's error body. | three attempts, and the one sentence naming the cause never seen |
| 4 | No `record_call` anywhere in `pull_critique` / `pull_verifier`. | the critique's spend appeared in **no ledger at all** |

### 1. A registry alias is not a provider model id

`route()` resolves `_config["models"][alias]["model_id"]` at every call site.
This executor did not. OpenAI's ids carry dots (`gpt-5.6-sol`) where the
registry keys carry dashes (`gpt-5-6-sol`), so `openai` failed and `google` did
not — `gemini-2.5-pro` is simultaneously a valid alias and a valid API id,
which is exactly why the google critic succeeded three times for three and
nothing about the failure looked router-shaped.

Fixed at `_resolve_model`, which is the choke point for **both**
`pull_route` and `dual_surface_verify` (it imports the same function), so one
fix closes both sites (G-008). A string that is not a registry key passes
through untouched, so every pin that was already correct still is.

**The same missing resolution had a second consequence nobody had noticed.**
`_pricing_for` matches on `model_id`, so an alias missed the registry *and*
`_FALLBACK_PRICING` and resolved to `(0.0, 0.0)` — the per-run
`cost_ceiling_usd` silently stopped binding. A run that got past the 400 would
have had no cost cap at all.

### 2. The guard's premise was false on a live tree

`DeterministicServant.run` is literally `return _canonical_result(...)` — the
same call `_guard_raw_ground_truth` makes to derive its own truth. It cannot
summarize. The two derivations differ in exactly one respect, **when they
run**, so on the production path the comparison could only ever detect that
the filesystem moved — and `pull_critique` passes the **live git repo root**
as the sandbox.

Reproduced with the honest default servant: one append to one file between the
servant call and the guard fires the violation, with Session 4's error text
byte for byte.

**The guard is kept, not removed** — and *how* it is kept was itself corrected
by round-1 verification, which is the most useful thing that happened in this
session.

My first fix classified a mismatch by re-deriving a second time and comparing
the two *fresh* derivations with each other. The verifier's counterexample is
exact: a tree that changes **once and then settles** — one append, then quiet —
makes both fresh derivations see the same settled state, so they agree with
each other, disagree with the servant, and the honest servant was convicted
again. That is the production shape, not an exotic one. It also caught that the
falsifier I shipped mutated the file on *every* derivation and so never planted
the case it claimed to. Both were confirmed against the code before changing
anything.

**Timing cannot distinguish the two cases. Identity can, and provably.** The
guard now classifies on *which servant ran*: `servant_is_canonical` is true
only for exactly `DeterministicServant` (exact type — every bad servant in the
tests is a subclass and stays fully guarded), whose `run` is the very call the
guard makes for its own truth. A mismatch there is a proof the tree moved, and
raises `SandboxNotQuiescent`, which the loop records as `sandbox_drift` and
continues past. Any other servant still raises
`DeterministicServantViolation`, unchanged. The flag defaults to False, so a
caller who forgets it gets the strict guard. The second re-derivation is gone,
which also halves the guard's cost on the production path.

Journaled in `decisions.jsonl` with the tension named rather than buried — a
reviewer may read the continue-past as a verification reduction, and it was put
in front of cross-provider verification for exactly that reason. That was the
right call: verification did not dispute the judgment, it found the
implementation did not deliver it.

### 3. The provider's explanation was thrown away

`httpx`'s `HTTPStatusError` carries the status and the URL but not the body.
All three bindings had it (G-008); all three now raise `BindingHTTPError`,
which carries the body truncated to 800 characters. That one sentence —
*"The requested model 'gpt-5-6-sol' does not exist."* — is the difference
between this diagnosis and three more attempts.

### 4. The critique's spend reached no ledger

Confirmed before fixing: neither module imported `metrics`. Session 4 had to
disclose the hole in prose because it could not measure it. `pull_critique`
now writes one `record_call` row per finished arm (`call_type: critique`),
including arms that ran but produced no verdict — they ran, so they spent.
Bookkeeping never breaks the run: a failing ledger write cannot cost the caller
a paid artifact.

## What the fix is worth, measured

| | before | after |
| :--- | :--- | :--- |
| openai critic, default pin | `DeterministicServantViolation`, 0 for 3 | schema-valid verdict |
| openai critic, pinned `gpt-5-6-sol` | HTTP 400, 0 for 2 | see `s6-critique-proof.json` |
| providers reached | 1 | 2 |
| artifact | none, three times | valid (dry-run; the artifact itself is owed at the set-terminal close) |

Both runs were `--dry-run` deliberately. The `path-aware-critique.json`
artifact is gated at the **set-terminal** close, which is now Session 8; this
session's job was to make the producer work, not to bank the set's artifact
five sessions early against code that will keep changing.

## What cross-provider verification found, and why it was worth it

Five Major findings across two discovery passes, **all real, all mine, all in
code this session added**. Nothing waived, nothing disputed. Full detail in
[`s6-remediation-round-1.md`](s6-remediation-round-1.md).

| | finding | verdict |
| :--- | :--- | :--- |
| F1/F3 | the guard still convicted the honest servant on one-change-and-settle, and the falsifier did not plant that shape | fixed by classifying on servant identity |
| F2 | arms that had already been billed vanished from the ledger when they raised | fixed with a trace sink |
| F4 | **`BindingHTTPError` could print a live Gemini API key** | fixed by redacting every query value |
| F5 | the ledger fabricated `served_model_id`, asserting a match nobody observed | fixed to `route()`'s own convention |

F4 is the one worth dwelling on: it is a credential leak in code this session
added, whose docstring asserted the opposite — *"nothing here can leak a
key"* — reasoning correctly about the `Authorization` header and forgetting
that google carries its credential in the query string. A routine 429 would
have printed a live key into the terminal, the logs and the session evidence.

## Falsifiers

38 new tests, and **every fix and every remediation was mutation-tested** —
reverted in turn, the matching falsifiers confirmed to fail, the source
restored byte-for-byte. Per L-112-1 each rule gets a pair: the planted defect,
and the legitimate look-alike that must NOT trip it.

The ones that matter most are the counterweights — the tests that would catch
the guard fix having bought quiet by weakening the guard:
`test_dishonest_servant_on_a_STABLE_tree_still_raises`,
`test_a_lying_servant_still_aborts_the_whole_run`,
`test_the_lenient_reading_is_never_the_default`, and
`test_a_subclass_is_not_the_canonical_servant`.

## A hazard this session created and closed

Adding the ledger row made **the test suite** write to the shipped
`ai_router/router-metrics.jsonl`. Three ordinary test runs put **105 fake rows**
— fixture set names, `$0.00` costs, a provider model literally called `m` —
into the developer's own ledger, where every later cost report would have read
them as real routed history.

Removed, precisely and verifiably: only rows with `call_type == "critique"` and
a fixture session-set name, all asserted `$0.00` before deletion, 1465 → 1360
rows, with a copy of the pre-cleanup file kept outside the repo. No critique
row had ever legitimately existed, because that is the defect this session
fixed.

The cause is closed at the source. `ai_router/tests/conftest.py` now carries an
autouse guard redirecting `AI_ROUTER_METRICS_PATH` to a scratch file, in the
same genre as the two guards already there. Every metrics-aware test already
set that variable for itself and still wins, so no existing behaviour changed —
it only closes the default. Its own falsifier is in `test_metrics.py`.

## The advisory path-aware critique — run for real, on the final code

The producer this session repaired was then used, without `--dry-run`, against
the finished tree: **two providers, artifact written**
([`path-aware-critique.json`](path-aware-critique.json)). google returned
VERIFIED; openai returned one Major — and it is in **Session 5's** container
isolation verdict script, not this session's code, because the producer's
instruction is built from the set.

**The finding is real.** `s5-isolation-criteria.json` declares
`bar.consecutive: true` and its `honestFail` clause says *"fewer than three
consecutive clean runs is a FAIL"*, but
`tools/dabbler-ai-orchestration/scripts/container-isolation-verdict.js` filters
interrupted runs out of the array and then merely **counts** what is left. It
is precisely the unasserted-predeclared-requirement class Session 5 was itself
policing when its round 3 rejected a shape that counted an error-marked run.

**It changes nothing about what Session 5 recorded**, and that was checked
rather than assumed. The measurement's three clean target runs are indices 1, 2
and 3 — genuinely contiguous — with the interrupted run at index 4, after them.
Re-scoring returns the same PASS.

**Not fixed here, deliberately** (journaled, `prefer-reversible`). It is a
closed session's deliverable whose verdict is under an open operator ruling;
this session's remediation bound is spent, so a late change would ship with no
cross-provider review at all; and the verdict it would produce is identical.
Adjudicated **deferred-residual with a named owner** per G-019, with the run
indices recorded here so whoever picks it up does not have to re-derive the
impact analysis.

## Residuals

1. **The review sandbox has no exclusions, and it is enormous.** `_walk_files`
   over the default sandbox returns **62,084 files / 5,594.7 MB** — `tools/`
   alone is 5.4 GB, and `.git` and `.venv` are walked and read as text. An
   unscoped `grep` (the default is `path: "."`) reads all of it into memory and
   JSON-encodes it onto a subprocess's stdin inside a **5-second** hard timeout,
   and the guard makes the loop pay it twice. Scoped greps measured 1.4–2.1s
   against that same 5s budget. It has not bitten yet because critics scope
   their probes, but the margin is thin and undeclared. **Owner: a follow-on;
   not fixed here because it is a capability change, not a transport fix.**
2. **`re2` is absent on this seat**, so every grep takes the subprocess path
   rather than the inline linear-time one. It widens the window; it is not the
   cause. Unowned.
3. **The first live critique run predates the accounting fix** and therefore
   wrote no ledger row of its own. Its cost is reported from the run itself,
   not from the ledger, and is named as such in `disposition.cost`.
4. **`SandboxNotQuiescent` continues the run.** Named for the operator as an
   auditor: if they judge that a moving tree should abort a critique rather
   than annotate it, the classification is already there and only the loop's
   handling would change.
5. **`bar.consecutive: true` is declared and never asserted** in
   `container-isolation-verdict.js` (Session 5's scorer). Found by this
   session's own path-aware critique; verified not to change Session 5's
   recorded PASS, because its three clean target runs were in fact
   consecutive. **Owner: the operator's open ruling on Session 5, or Session
   8.**
6. **The pull bindings do not capture the provider's echoed model**, so
   critique ledger rows carry `served_model_id: null` — the schema's honest
   "not captured" rather than an assumed match. Wiring the served id through
   `BindingResponse` and all three `_from_response` methods is a real change to
   the response path and was deliberately not made under remediation. **Owner:
   a follow-on.**
