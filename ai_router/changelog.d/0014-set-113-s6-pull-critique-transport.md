## [Unreleased] — the path-aware critique reaches two providers again

### Fixed

- **(Set 113 S6) The pull verifier sent router-registry *aliases* where
  providers expect their own model ids.** `route()` resolves
  `models[<alias>].model_id` at every call site; `pull_verifier._resolve_model`
  returned the pinned string verbatim and each binding put it straight into the
  request body. Pinning `gpt-5-6-sol` therefore produced **HTTP 400
  `model_not_found`** — *"The requested model 'gpt-5-6-sol' does not exist."* —
  while the same body shape with `gpt-5.6-sol` returned 200.

  It struck `openai` alone because OpenAI's ids carry dots where the registry
  keys carry dashes; `gemini-2.5-pro` is simultaneously a valid alias and a
  valid API id, so the google arm succeeded every time and nothing about the
  failure looked router-shaped. Fixed at `_resolve_model`, the choke point
  `pull_route` and `dual_surface_verify` share, so both are closed at once. A
  string that is not a registry key still passes through untouched.

  **The same gap had unbound the cost ceiling.** `_pricing_for` matches on
  `model_id`, so an alias missed the registry *and* the fallback table and read
  `(0.0, 0.0)` — `pull_verifier.caps.cost_ceiling_usd` silently stopped
  applying. Resolution restores it.

- **(Set 113 S6) The servant-integrity guard accused the honest servant when
  the sandbox moved.** `DeterministicServant.run` delegates to
  `_canonical_result`, the same function `_guard_raw_ground_truth` calls to
  derive its own truth, so it cannot summarize anything. The two derivations
  differ only in *when* they run, and `pull_critique` reviews the live git repo
  root — so a single concurrent write between them raised
  `DeterministicServantViolation` and destroyed a paid run.

  The guard is narrowed, not weakened, and it classifies on servant **identity**
  rather than on the tree's timing — timing cannot tell the two apart, because
  a tree that changes once and then settles looks stable to any later check.
  A mismatch under the canonical servant (exact type; every other servant stays
  fully guarded) is a *proof* the tree moved, since that servant returns
  precisely what the guard re-derives. It raises the new `SandboxNotQuiescent`,
  which the loop records as `sandbox_drift` on the trace and continues past,
  keeping the servant's raw bytes. Every other servant still raises
  `DeterministicServantViolation`, and the lenient reading is never the
  default, so a caller who omits the flag gets the strict guard.

- **(Set 113 S6) Provider error bodies are no longer discarded.**
  `resp.raise_for_status()` raises an `httpx` error carrying the status and URL
  but not the body, so the one sentence naming the cause was thrown away at the
  moment it was needed — three critique attempts were spent without ever seeing
  it. All three bindings now raise `BindingHTTPError`, which carries the
  response body (truncated).

### Added

- **(Set 113 S6) The path-aware critique's spend reaches the ledger.**
  `pull_critique` wrote no `router-metrics.jsonl` row at all, so a set could
  spend on critiques and report zero. It now records one row per finished arm
  (`call_type: "critique"`), including arms that ran but produced no verdict —
  they ran, so they spent. Bookkeeping never breaks the run: a failing ledger
  write cannot cost the caller a paid artifact.

- **(Set 113 S6) `PullTrace.sandbox_drift_count`** and a per-call
  `sandbox_drift` flag, so a reader of the trace can see that a critique's
  evidence was gathered from a tree that was being written.

- **(Set 113 S6) `BindingHTTPError` redacts credential-bearing query
  parameters.** Google carries its API key in the request URL, so interpolating
  the URL into an error message would have printed a live key into terminals,
  logs and session evidence on any routine non-2xx. Every query VALUE is
  redacted, not a denylist of parameter names.

- **(Set 113 S6) A critique arm that billed and then RAISED is ledgered too.**
  `pull_route` takes an optional `trace_sink` and publishes its live `PullTrace`
  the instant it exists, so the producer can record real usage from an arm that
  died mid-loop. An arm that billed nothing still writes nothing — an
  unmeasured failure must not become a measured $0.00.

### Internal

- **(Set 113 S6) The test suite can no longer append to the shipped
  `router-metrics.jsonl`.** `record_call` is enabled by default and resolves
  the package-bundled path when nothing redirects it, so any test reaching a
  metrics writer polluted the developer's own ledger with fixture data — found
  when the critique accounting above put 105 fake rows there across three
  ordinary test runs. An autouse `conftest.py` fixture now redirects
  `AI_ROUTER_METRICS_PATH` to a scratch file, joining the two guards already
  there. Every metrics-aware test already set that variable for itself and
  still wins, so no existing behaviour changes.
