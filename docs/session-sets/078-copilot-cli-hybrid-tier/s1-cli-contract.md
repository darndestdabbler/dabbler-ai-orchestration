# Session 1 — CLI Contract Discovery and Design Lock

> **Seat probed:** operator's personal GitHub Copilot CLI install (Windows).
> **NOT probed:** a representative target-team (corporate-policy-locked) seat —
> see **Open items** below. This document is therefore a **single-seat**
> evidence pin, not the two-seat pin the spec's S1 gate calls for.

## CLI identity

- `copilot --version` reported `1.0.62` at probe start.
- The CLI **silently auto-updated to `1.0.68` mid-session** during routine
  headless probing — no `CI`/`BUILD_NUMBER`/`RUN_ID`/`SYSTEM_COLLECTIONURI`
  env var was set, so the CLI's own "disable auto-update in CI" heuristic did
  not engage. `--no-auto-update` and `COPILOT_AUTO_UPDATE=false` both exist
  and must be passed on every invocation from the transport to keep the
  pinned-CLI-version half of the lockfile contract meaningful; without it, a
  long-running or scheduled routed session can silently drift to a newer CLI
  build between calls.

## Six-point gate

### 1. Noninteractive headless mode + auth-suppression flags + documented exit behavior — **PASS (partial)**

- `-p/--prompt "<text>"` runs one non-interactive turn and exits.
  `--allow-all-tools` (or `--allow-all`/`--yolo`) suppresses interactive tool
  permission prompts — required for unattended use (documented in `--help`
  and confirmed empirically: omitting it is what makes headless mode usable
  at all for a router that cannot answer a TTY prompt).
- Auth: an already-authenticated seat (credential resolved outside the
  process — env vars `COPILOT_GITHUB_TOKEN`/`GH_TOKEN`/`GITHUB_TOKEN` were
  all unset, yet calls succeeded, confirming the CLI falls back to a stored
  credential, likely the OS credential store on Windows) worked cleanly
  end-to-end in every headless invocation tried.
- **Gap:** two non-destructive attempts to *induce* an auth failure did not
  reproduce one — pointing `COPILOT_HOME` at an empty directory still
  succeeded (credential lookup is not confined to `COPILOT_HOME`), and
  supplying a syntactically-invalid `COPILOT_GITHUB_TOKEN` also still
  succeeded (either graceful fallback past a bad env token, or laxer
  validation than `copilot login --help`'s documented precedence implies).
  The genuine auth-failure error shape (exit code, stderr text) was **not**
  empirically observed — reproducing it for real would require
  deauthenticating the operator's actual working seat, which was out of
  scope for a non-destructive probe. Documented behavior exists
  (`copilot login --help`); empirical confirmation is deferred to S2's
  fake-spawner suite (construct the failure at the spawner-mock layer
  instead of against the real CLI) or a deliberately-isolated throwaway
  seat.

### 2. Stable structured output with deterministic content/metadata separation — **PASS**

`--output-format json` emits JSONL (one JSON object per line) on **stdout**.
Observed event types: `session.mcp_server_status_changed`,
`session.mcp_servers_loaded`, `session.skills_loaded`, `session.tools_updated`,
`user.message`, `assistant.turn_start`, `assistant.message_start`,
`assistant.message_delta` (streaming deltas, each marked `"ephemeral":true`),
`assistant.message` (the canonical final message — `content` is the clean
final text, `model` echoes which model actually served the call,
`outputTokens` present), `assistant.turn_end`, `assistant.idle`, and a
terminal `result` event carrying `exitCode`, `sessionId`, and a `usage`
object. Hard errors (e.g. an invalid `--model`) are **not** JSONL — they are
a plain `Error: ...` line on **stderr**, with process exit code **1**
(confirmed via explicit stdout/stderr redirect test). This is a clean,
parseable, deterministic split: JSONL-on-stdout for the happy path,
plain-text-on-stderr + non-zero exit for hard failures.

### 3. Model selection with machine-readable underlying-provider provenance per catalog entry — **PARTIAL / FAIL as literally stated**

- There is **no** dedicated list-models / catalog-dump subcommand and **no**
  `--json` flag that enumerates enabled models with a provider field.
  `copilot help config` documents a **static list of model ID strings** the
  CLI's `model` setting accepts (current build: `claude-sonnet-4.6`,
  `claude-sonnet-4.5`, `claude-haiku-4.5`, `claude-fable-5`,
  `claude-opus-4.8`, `claude-opus-4.7`, `claude-opus-4.6`,
  `claude-opus-4.6-fast`, `claude-opus-4.5`, `gpt-5.5`, `gpt-5.4`,
  `gpt-5.3-codex`, `gpt-5.2-codex`, `gpt-5.2`, `gpt-5.4-mini`, `gpt-5-mini`,
  `gemini-3.1-pro-preview`, `gemini-3.5-flash`) — this is the CLI's
  documented universe, **not** per-seat enablement, and it carries no
  explicit `provider` field.
- Passing a genuinely-unsupported model name and passing a
  policy-disabled-for-this-seat model name produce the **identical** generic
  error (`Error: Model "X" from --model flag is not available.`) — so
  **enablement is only discoverable empirically, per model, per seat**, by
  actually invoking it and checking for success. There is no dry-run/
  validate-only flag.
- Provider provenance is inferable **only** from the model-name prefix
  convention (`claude-*` → Anthropic, `gpt-*` → OpenAI, `gemini-*` →
  Google) — a naming convention, never a field the API returns. The
  Session-2 catalog lockfile must therefore be built by **probing each
  candidate model name from the static universe list, recording
  success/failure per seat, and deriving provider from the prefix
  convention** — there is no better mechanical source. This is weaker than
  the gate's "machine-readable provenance per catalog entry" as originally
  envisioned (no first-party provenance field exists), but it is a workable,
  falsifiable substitute: the prefix convention is consistent across every
  model observed, and each entry's dispatchability is independently
  confirmed by successfully invoking it (see point 4 below), so the
  lockfile's provenance claim is *empirically probed*, not *assumed from
  the string alone*.

### 4. At least two enabled, dispatchable models resolving to different underlying providers — **PASS**

Confirmed dispatchable on the operator's seat, each echoing its `model` in
the final `assistant.message` event:

| model | family / inferred provider | result |
| :--- | :--- | :--- |
| `claude-sonnet-4.6` | Anthropic | success, `content:"OK"` |
| `gpt-5.4` | OpenAI | success, `content:"OK"` |
| `gemini-3.1-pro-preview` | Google | success, `content:"OK"` |

Three distinct provider families all dispatchable on one seat — exceeds the
gate's floor of two.

### 5. Usage/quota visibility characterized — **PASS (characterized as: none, beyond per-call invocation count)**

Every `result` event carries `usage: {premiumRequests, totalApiDurationMs,
sessionDurationMs, codeChanges:{linesAdded,linesRemoved,filesModified}}`.
`premiumRequests` was `1` for the Claude and Gemini calls, `0` for one
`gpt-5.4` call in this probe (plan/model-weighting dependent, not
characterized further here). **No token counts, no dollar cost, and no
remaining-quota/balance figure are ever surfaced** by the CLI in any
invocation observed. This is the ceiling of local visibility — confirms the
spec's "honest non-accounting" premise directly: `local_invocations` /
`attempts` counting is the only thing the transport can assert; cost must
be treated as `billed_usage_unavailable: true`, never estimated.

### 6. Rate/concurrency behavior for back-to-back generate+verify calls — **PARTIAL**

Five sequential back-to-back headless calls in this probe all completed
cleanly with no throttling or rate-limit response observed. **Concurrent**
(parallel) invocations were **not** tested, to avoid burning further
premium-request quota on the operator's real seat during an exploratory
probe. Per the spec's conservative default, the transport ships with
**serialized execution** (no concurrent CLI calls) — this default requires
no further proof to adopt, since it is the safe starting posture; proving
concurrency *safe* (to lift the restriction later) is explicitly out of
scope for S1.

## GitHub Models API enterprise availability (pivot check)

The operator's available GitHub account for this probe is a **personal
account with no organizations** (`gh api user -q .type` → `User`;
`gh api user/orgs` → empty). No `gh models` extension is installed by
default (it is a separate `github/gh-models` extension). There is
consequently **no enterprise-policy surface to probe from this seat** —
GitHub Models enterprise availability remains **unchecked**, deferred to
the operator's own account/org context (or the target team's).

## Open items (not gate failures, but unresolved by this single-seat probe)

1. **Auth-failure error shape is unconfirmed.** Two non-destructive attempts
   did not reproduce a failure. Recommend pinning this at the S2
   fake-spawner layer (construct the failure synthetically) rather than
   against a real seat, and treating any *unclassifiable* non-zero exit as
   auth-class-or-worse (never silently retryable) until real stderr samples
   are captured.
2. **Quota-exhaustion error shape is unconfirmed** (never triggered in this
   probe). Same fake-spawner deferral.
3. **The representative target-team seat has not been checked.** This is
   the operator's to arrange (per the spec's own note: "operator arranges").
   The design lock below proceeds on the operator's single-seat evidence;
   the go/no-go is recorded as **GO-WITH-OPEN-ITEMS**, not a clean GO,
   until the second seat confirms the same >=2-provider-family
   dispatchability and provenance-probing approach holds there too.
4. **GitHub Models enterprise availability is unchecked** (no org context
   available from this seat).

## Design adjudication

See `s1-design-adjudication.md` (routed, `task_type: architecture`) for the
lockfile schema, role/alias mapping shape, timeout defaults, retryable-error
taxonomy, breaker default, and guard-exclusion list, reasoned from the
evidence above.

## Go/no-go verdict

**GO-WITH-OPEN-ITEMS.** Four of six gate points are cleanly satisfied
(headless mode exists and works; structured output is deterministic;
>=2 provider-distinct models dispatchable — exceeded, 3 found; usage
visibility characterized as none-beyond-invocation-count, which is itself
the expected honest-non-accounting answer). Point 3 (provenance) is
satisfied by a weaker mechanism than originally envisioned (prefix
convention + empirical per-seat probing, not a first-party provider field)
but is workable and falsifiable, not absent. Point 6 (rate/concurrency) is
satisfied by adopting the spec's own conservative default rather than by
proof. The two **genuinely open** items — auth-failure shape and the
second-seat attestation — are deferred to S2 (fake-spawner-constructed
failure paths) and to the operator (arranging target-team-seat access)
respectively, consistent with the spec's own S1 step 2 instruction ("operator
arranges" the team-seat check). **No pivot to GitHub Models is warranted**
on this evidence — the CLI contract is fundamentally workable. Sessions
2-5 proceed as scoped; Session 2 should additionally scope in
`--no-auto-update` on every transport invocation (a design-lock addition
this probe surfaced, not in the original spec text).
