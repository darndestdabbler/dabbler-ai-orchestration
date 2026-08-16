# Session 6 — the reproduction, before anything was changed

Both Session 4 failures reproduce on this seat. Neither is a provider outage
and neither is the guard catching a dishonest critic. They are two unrelated
router-side defects that happened to land on the same stage.

Raw measurements: [`s6-reproduction-measurement.json`](s6-reproduction-measurement.json).

## (b) HTTP 400 — a registry alias was sent as a provider model id

Session 4 pinned `gpt-5-6-sol`, then `gpt-5-5`, and got HTTP 400 from
`https://api.openai.com/v1/responses` both times. The body the transport threw
away says exactly what was wrong:

```json
{"error": {"message": "The requested model 'gpt-5-6-sol' does not exist.",
           "type": "invalid_request_error", "param": "model",
           "code": "model_not_found"}}
```

Sending the **same body shape** with the same alias's `model_id` from the same
registry returns HTTP 200 and a `function_call`:

| `body["model"]` | what it is | result |
| :--- | :--- | :--- |
| `gpt-5-6-sol` | router-registry **alias** | **400** `model_not_found` |
| `gpt-5.6-sol` | that alias's `model_id` | **200**, `function_call` returned |
| `gpt-5-5` | router-registry **alias** | **400** `model_not_found` |

So the Responses-API body the binding builds — `store: true`,
`previous_response_id` chaining, flattened function tools, `reasoning.effort` —
is **correct**, and the transport was never the problem. `route()` resolves an
alias through `_config["models"][alias]["model_id"]` at every call site;
`pull_verifier._resolve_model` returns the pinned string verbatim and
`OpenAIBinding.request` puts it straight into `body["model"]`. That is the
whole difference between the two transports, and it is the difference
Session 6's step 3 predicted from the sharpest fact.

It bites `openai` first only because OpenAI's ids contain dots where the
registry keys use dashes. `google`'s pin `gemini-2.5-pro` is *both* a valid
alias and a valid API id, which is why the google critic succeeded all three
times and nothing looked provider-shaped.

**A second consequence of the same missing resolution.** `_pricing_for` matches
on `mcfg["model_id"]`, so an alias misses the registry, misses
`_FALLBACK_PRICING`, and resolves to `(0.0, 0.0)` — the per-run
`cost_ceiling_usd` silently stops binding. A run that got past the 400 would
have had no cost cap at all.

**And the 400 body was discarded.** `resp.raise_for_status()` raises an
`httpx.HTTPStatusError` whose text carries the status and URL but not the
provider's explanation. Session 4 spent three attempts and could not see the
one sentence that named the cause. All three bindings do this.

## (a) `DeterministicServantViolation` — the guard's premise is false on a live tree

Reproduced with the **honest default servant**, which is the only servant
production ever uses. Same error text as Session 4, byte for byte:

```
grep: tool result does not match raw ground truth - the servant summarized,
paraphrased, fabricated an error, or otherwise altered the bytes
```

The model never touched that result. `DeterministicServant.run` delegates to
`_canonical_result`; `_guard_raw_ground_truth` independently calls
`_canonical_result` with the same name, args and sandbox and demands the two
match field-for-field. For the canonical servant the two calls differ in
exactly one respect — **when they run** — so the only thing the comparison can
detect on the production path is that the filesystem moved underneath it.

`pull_critique` passes **the live git repo root** as the sandbox
(`_default_sandbox_for`). Reproduction M1: one append to one file between the
servant call and the guard's re-derivation fires the violation. That is the
shape of `activity-log.json`, `router-metrics.jsonl`, `.git/logs/HEAD`, or —
in Session 4's case — a capture run writing video under the repo root while
the critique read it.

Two supporting measurements:

- **Scoped greps are deterministic and already slow.** `ai_router` and `docs`
  match across the two derivations, at 1.4–2.1s each against a 5.0s hard
  timeout — and the guard makes the loop pay that cost **twice per tool call**.
- **An unscoped grep is not survivable.** `grep` defaults to `path: "."`. On
  this sandbox `_walk_files` returns **62,084 files / 5,594.7 MB**, every one
  of them `read_text()`'d into memory and JSON-encoded onto a subprocess's
  stdin, inside a 5.0s timeout — and then again for the guard. There are no
  exclusions: `.git`, `.venv`, and `tools/` (5.4 GB by itself) are all walked.

## What this does not say

`re2` is absent on this seat, so every grep takes the subprocess-worker path
rather than the inline linear-time one. That widens the window between the two
derivations; it is not the cause. The cause is that the window exists at all.
