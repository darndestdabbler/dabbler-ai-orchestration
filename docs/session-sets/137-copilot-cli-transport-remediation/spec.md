# Copilot CLI transport remediation

> **Purpose:** The `copilot-cli` transport does not work on this seat. The
> `api` transport is fine, so the whole seat-billed half of the product is
> dark. Two concrete defects, both regressions introduced by the v1 → v2
> rebuild: the v1 large-prompt file handoff (v1 Set 104) was not carried
> forward, so every dispatch above the Windows command-line ceiling fails;
> and the transport preference is persisted only at machine scope, which an
> unelevated operator cannot write, so `DABBLER_TRANSPORT` never lands.
> **Session Set:** `docs/session-sets/137-copilot-cli-transport-remediation/`
> **Created:** 2026-08-18
> **Workflow:** Full
> **Prerequisite:** an authenticated GitHub Copilot CLI seat on this
> machine (present: CLI 1.0.80).

> **Note on rule 6:** this repo's ground rules say v2 development uses
> plain commits, not its own session machinery. Like set 136, this set is
> an operator-authorized exception.

---

## Session Set Configuration

```yaml
requiresUAT: false
requiresE2E: true
pathAwareCritique: none
module: default
totalSessions: 3
prerequisites: []
```

---

## The incident this set exists for

2026-08-18, this repo, operator's own seat. Every attempt to route through
`DABBLER_TRANSPORT=copilot-cli` failed. Two independent causes, both
measured, not inferred:

**A. The prompt-size cliff.** `CopilotCliTransport.dispatch()` joins the
system and user prompts into one `-p` argv element. Windows
`CreateProcessW` caps the entire rendered command line at 32,767 UTF-16
code units, so any dispatch past that cannot spawn at all. Reproduced
here at 40,000 chars:

    FileNotFoundError: [WinError 206] The filename or extension is too long

`_run()` catches this in its blanket `except Exception` and reports
`error_class: "generic-unknown"` with the OS text buried in `stderr_tail`
— a size failure wearing an unnamed-failure mask. Session-verification
bundles routinely exceed the ceiling, which is why *verification* is the
surface where the operator hit it. Linux has the same cliff at
`MAX_ARG_STRLEN` (128 KiB); Windows just reaches it first.

v1 fixed exactly this in `ai_router/cli_transport.py` under Set 104
(`104-copilot-cli-large-prompt-handoff`), on a design locked by a
cross-provider consult. The v2 rebuild's `transports/copilot.py` is a
clean reimplementation that carried the timeouts, the breaker, the
JSONL parsing and the read-only tool grant — and dropped the handoff.
The v1 source is recoverable at `git show 96a2f17c^:ai_router/cli_transport.py`
and its spec at `git show 96a2f17c^:docs/session-sets/104-copilot-cli-large-prompt-handoff/spec.md`.

**B. The transport preference cannot be written.** Commit `2aa7287b`
(today) taught `bootstrap` to remember a detected seat in
`DABBLER_TRANSPORT`, but `_persist_env_var_windows` writes only HKLM
(machine scope) and `_persist_env_var_posix` writes only
`/etc/profile.d`. Both need elevation. Measured on this machine:
`IsUserAnAdmin() == False`, HKLM `Environment` has no `DABBLER_TRANSPORT`,
HKCU `Environment` has no `DABBLER_TRANSPORT`. The bootstrap refused
rather than writing a weaker scope, which is honest and useless: the
operator ends up with no persisted preference at all, and the durable
choice the commit promised is never made. A developer workstation is
single-account; the machine-scope requirement buys nothing there and
costs the whole feature.

## What this set does NOT change (do not reopen)

- **No new module** (ground rule 1). Everything lands in
  `ai_router/transports/copilot.py`, `ai_router/bootstrap.py`, their
  existing test files, and docs.
- **No retry of a billed dispatch.** `RETRYABLE_ERROR_CLASSES` stays
  empty; the new handoff error class joins it not at all. The CLI is
  premium-request-billed and quota-blind.
- **The honest non-accounting contract stands.** `input_tokens` stays 0;
  nothing from this transport becomes billing-authoritative.
- **The read-only tool grant stays.** `--available-tools view,grep,glob`
  plus `--allow-all-tools` is the existing posture; `view` is what makes
  the handoff pull possible, so the grant is load-bearing, not incidental.
- **No configurable threshold, no new transport config surface.** The
  handoff threshold is a module constant, per the v1 consult verdict.
- **No `--attachment` or stdin experiment.** v1 recorded both as
  rejected-without-new-evidence; `-p/--prompt <text>` remains the only
  documented non-interactive prompt input on CLI 1.0.80 (help captured
  2026-08-18).
- **No catalog-refresh command.** The lockfile's stale `cli_version`
  provenance (1.0.69 vs live 1.0.80) is already a warning, not a gate,
  after `2aa7287b`. Session 3 may correct the provenance line from real
  probe evidence; it does not build a probe command to do it.
- **No change to the `api` transport path.**

## Design rationale

The handoff is a *pull*: the payload goes to a file, and a short `-p`
bootstrap points the agentic CLI at it. That works because the CLI is
agentic (it has a file-read tool) and because the system temp directory
is auto-allowed by default (`--disallow-temp-dir` is the opt-out, and we
do not pass it). The nonce lives only in the file's footer so that
echoing it is evidence of an EOF read — a gross under-read detector, not
proof of comprehension, and the code comment must say so.

Scope honesty, carried forward from the v1 consult: this fixes **argv
transport only**. It does not fix model context capacity, and it does not
make a monolithic 200 KB verification bundle a good idea.

---

## Sessions

### Session 1 of 3: Restore the threshold-gated large-prompt handoff

1. Register. Read this spec, then read the v1 implementation and its spec
   out of git history (`96a2f17c^`) — the design is locked; the task is a
   faithful port into v2's structure, not a redesign.
2. Add the size measurement and the threshold to
   `ai_router/transports/copilot.py`: a helper returning UTF-16 code units
   in the *rendered* command line (`subprocess.list2cmdline`), and the
   module constant `HANDOFF_THRESHOLD_UTF16_UNITS = 24000`. Build the
   inline argv first and measure it; the same rule runs on every OS.
3. Add the handoff branch to `dispatch()`: a per-request `tempfile.mkstemp`
   payload file, UTF-8 with no BOM, containing the exact composed prompt
   followed by a delimited transport-control footer; written, flushed and
   **closed before spawn**; a short `-p` bootstrap that names the payload's
   absolute path in POSIX forward-slash form, tells the model to read the
   whole file from first byte to EOF before acting, to execute its
   contents as the full instructions, not to summarize it back, and to end
   its response with the exact acknowledgement line the footer specifies.
4. Add the integrity acknowledgement: a per-request 128-bit nonce
   (`secrets.token_hex(16)`) that appears **only in the footer, never in
   argv**; the footer requires a final line of exactly
   `HANDOFF-ACK <nonce>`; the transport validates the final content line
   and strips it before returning content. Absence or mismatch is the new
   non-retryable error class `handoff-incomplete` with the content
   discarded.
5. Add the lifecycle and metadata: delete the payload file in `finally` on
   every path — success, spawn failure, first-byte timeout, total timeout,
   the kill-and-reap paths, and malformed-JSONL classification. Additive
   `metadata` fields on both result shapes: `handoff` (bool),
   `payload_bytes`, the ack outcome, and `payload_file_modified` (sha256
   before spawn vs after exit — recorded, never gated). Payload content
   never appears in argv, metadata or logs; log byte length only.
6. Name the ceiling failure. A spawn that still fails the OS argv limit
   must classify as its own error class rather than `generic-unknown`, so
   this defect can never again present as an unnamed failure. Detect it
   from the OS error (`WinError 206` / `E2BIG`-class `OSError`), not from
   the message text alone.
7. Extend `tests/test_transport_copilot.py` against the existing fake
   spawner — no test invokes a real CLI. One test per behavior: threshold
   selection below / at / above the boundary; payload file present with
   the exact bytes and no open handle at spawn time; bootstrap carries the
   POSIX path and no nonce; ack valid / missing / mismatched; ack stripped
   from returned content; cleanup on success, spawn failure, both timeout
   classes and malformed output; UTF-16 measurement with quotes,
   backslashes, spaces and non-BMP characters; `payload_file_modified`;
   and a regression asserting the inline path is unchanged below
   threshold.
8. Cross-provider verification on the `api` transport.
9. Required portion of the full test suite.
10. Close-out.

**Creates:** the handoff implementation and its fake-spawner coverage.
No behavior change below the threshold. Est. 14–16 new Python tests,
within the 480 ceiling (380 collected today).

### Session 2 of 3: The seat's transport preference must land unelevated

1. Register.
2. Make `persist_transport_preference` scope-aware in
   `ai_router/bootstrap.py`. Try machine scope first when the process is
   elevated; otherwise write **user scope** — HKCU `Environment` on
   Windows, a marked block in the user's shell profile on POSIX — and
   broadcast `WM_SETTINGCHANGE` as the machine path already does. Return
   which scope actually landed rather than a bare bool, and set the value
   in `os.environ` so the current run sees it either way.
3. Make the bootstrap output say what happened: which variable, which
   value, which scope, and that a new shell is needed to inherit it. A
   machine-scope write that was refused for lack of elevation is reported
   as a *downgrade to user scope that succeeded*, not as a failure — and
   only a failure at both scopes prints the manual fallback command.
4. Stop routed dispatches inheriting the workspace's orchestrator
   instructions. The CLI loads `AGENTS.md` / `CLAUDE.md` as custom
   instructions by default; a routed verifier call is not an orchestrator
   session, and on this repo those files are large and actively
   mis-framing. Pass `--no-custom-instructions` on every routed dispatch
   and say why in the module docstring.
5. Tests in `tests/test_bootstrap.py` and
   `tests/test_transport_copilot.py`: elevated writes machine scope;
   unelevated falls back to user scope and reports it; both-scopes failure
   reports failure; an existing preference is still never overridden;
   `--transport` still forces; `--no-transport-detect` still opts out; and
   the routed argv carries `--no-custom-instructions`.
6. Cross-provider verification on the `api` transport.
7. Required portion of the full test suite.
8. Close-out.

**Creates:** scope-aware persistence, honest bootstrap reporting, the
custom-instructions opt-out. Est. 7–9 new Python tests.

### Session 3 of 3: Live seat probe, end to end

1. Register. Confirm the seat with the existing CLI preflight; if it does
   not authenticate, stop and reschedule rather than running a session
   whose only purpose is unrunnable.
2. Run the bootstrap for real on this unelevated account and confirm
   `DABBLER_TRANSPORT=copilot-cli` is readable from a **newly opened**
   shell. Record the scope it landed in.
3. Live probe through the real CLI, operator-sanctioned premium requests:
   (a) one dispatch whose composed prompt is comfortably past the cliff
   (≥ 40,000 chars) with three distinct retrieval facts placed at the
   beginning, the middle, and immediately before the footer, and a task
   whose answer needs all three — assert the answer uses all three, the
   ack validated and was stripped, and the metadata shows `handoff: true`
   with a plausible `payload_bytes`; (b) one control dispatch below the
   threshold asserting `handoff: false`.
4. Run one real cross-provider verification round for this session with
   `--transport copilot-cli`, which is the actual acceptance evidence:
   the surface that failed is the surface that must now pass.
5. Fix whatever the live probe surfaces, and re-probe the failed case.
   Every fix lands with a fake-spawner regression test — live dogfood
   finds wire-shape realities fakes cannot, and the fake suite stays the
   CI gate.
6. Record the raw results and metadata as `s3-live-probe.md` in this set
   directory; correct the catalog lock's `cli_version` provenance line
   from what the probe actually observed; bump the version and update
   `STATUS.md` to say the seat transport is exercised, not merely
   implemented.
7. Required portion of the full test suite.
8. Close-out, and the end-of-set `change-log.md`.

**Creates:** `s3-live-probe.md`, probe-driven fixes, the version bump and
STATUS update. Est. 0–4 new Python tests (regressions only).

---

## Acceptance criterion for the set

On the operator's unelevated account, with no `DABBLER_TRANSPORT` set
beforehand: `python -m ai_router.bootstrap` detects the seat, persists the
preference at a scope the account can actually write, and a newly opened
shell inherits it. A verification round whose composed prompt exceeds
32,767 UTF-16 units then completes through the Copilot CLI, returns a
verdict, and lands a ledger row — where today it dies at
`generic-unknown / WinError 206`. The below-threshold inline path is
byte-identical to its behavior before this set, proven by a regression
test, and no test in CI invokes a real CLI.
