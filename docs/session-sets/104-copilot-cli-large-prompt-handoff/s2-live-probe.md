# Session 2 — Live >32 KiB Copilot-CLI probe evidence

> Raw machine record: [`s2-live-probe-raw.json`](s2-live-probe-raw.json).
> Real dispatches through the installed GitHub Copilot CLI on Windows via
> `ai_router.cli_transport.CopilotCliTransport.dispatch` — never a fake
> spawner. Model `claude-sonnet-4.6` (catalog-confirmed, premium-request
> weight 1). Run 2026-07-14, Set 104 Session 2.

> ⚠️ **VERSION-PIN DRIFT (verification finding, Round 1 — MATERIAL).** The
> probes below ran on **`GitHub Copilot CLI 1.0.69`** (the installed seat), but
> `ai_router/copilot-catalog.lock` pins **`1.0.68`** with
> `cli_version_pin_required = true`. This is **not** cosmetic:
> `ai_router.copilot_catalog.validate_catalog` is fail-closed on version drift,
> and `ai_router/__init__.py` runs it during `route()` setup for the
> `copilot-cli` profile — so a real `copilot-cli`-profile `route()` on this
> 1.0.69 seat **raises `RuntimeError: CLI version drift` before any handoff
> dispatch**. The probes here bypassed that gate by calling
> `CopilotCliTransport` directly. Consequences: (a) the evidence below proves
> the handoff works live on **1.0.69**, NOT on the pinned 1.0.68 the spec's
> end-state names; (b) **Set 103's Copilot+ADO walk** (the reason this fix
> exists) is blocked by the stale pin until it is reconciled. **Operator
> decision (Set 104 S2): ship 0.34.0 now** — the transport code is proven and
> version-agnostic — **and reconcile the catalog pin as part of Set 103's seat
> prep**, alongside Set 103's other unmet preconditions. This drift is
> pre-existing (lock probed 2026-07-04) and affects only the `copilot-cli`
> profile, not the default `api` profile or the router-package publish.
> Remediation recorded in [`s2-remediation-round-2.md`](s2-remediation-round-2.md).

## Preconditions (Step 1)

- **Copilot auth-preflight (Set 086):** PASS.
  - Free checks: `copilot` resolves at
    `C:\Users\denmi\AppData\Local\Microsoft\WinGet\Links\copilot.EXE`;
    credential dir `C:\Users\denmi\.copilot` present.
  - Live probe: authenticated OK, model `claude-sonnet-4.6`, session
    `c2bf12af-6db7-4f0c-a60e-bd4144a460df`, 1 premium request.
- **CLI version:** installed CLI reports **`GitHub Copilot CLI 1.0.69.`**
  while `ai_router/copilot-catalog.lock` pins **1.0.68**. See the version-pin
  drift banner at the top of this file — a **material** finding that gates the
  `copilot-cli` profile (hence Set 103), reconciled in Set-103 seat prep per
  the operator decision; not a footnote.

## Probe (a) — large prompt takes the file-handoff pull path

- **Composed prompt:** 81,829 chars → rendered inline command line
  **81,925 UTF-16 code units** (threshold 24,000) → handoff selected.
- **Three retrieval facts, distributed** (character offset in composed prompt):
  - `A @ 559` — codename `BLUE-HERON-42` (near the top)
  - `B @ 41,194` — deploy window `03:17 UTC` (the dead middle)
  - `C @ 81,820` — rollback token `QX-7791` (9 chars before EOF, immediately
    before the transport-control footer)
- **Task:** emit a single `DEPLOY-AUTH:` line whose values require **all
  three** facts — so a gross under-read that skipped the middle or the tail
  cannot produce a correct answer.

**Result — every assertion green:**

| Assertion | Value |
|---|---|
| `transport_metadata.handoff` | `true` |
| `handoff_ack` outcome | `validated` |
| `.ok` / `error_class` | `true` / `null` (exit 0) |
| Response contains fact A (`BLUE-HERON-42`) | ✅ |
| Response contains fact B (`03:17`) | ✅ (proves read past the middle) |
| Response contains fact C (`QX-7791`) | ✅ (proves read to the tail) |
| Ack line stripped from returned content | ✅ (`HANDOFF-ACK` absent) |
| `payload_bytes` | `82231` |
| `payload_file_modified` | `false` (agent read-only; not mutated) |
| bootstrap `-p` argv element | 616 chars (payload never in argv) |
| `echoed_model` | `claude-sonnet-4.6` |
| `premium_requests` | 1 |
| `total_api_duration_ms` / `session_duration_ms` | 28955 / 35627 |
| session id | `e432508d-23bf-4e78-8662-3e793cfb7106` |

**Returned content (verbatim, after ack strip):**

```
DEPLOY-AUTH: BLUE-HERON-42 may deploy at 03:17 UTC using rollback token QX-7791.
```

All three scattered facts are fused into the single required line, so the
agentic CLI demonstrably read the whole 82 KB payload file from the temp path
end-to-end — the exact behavior the file-handoff design promised, on a prompt
that could never have dispatched inline (81,925 » Windows' 32,767 ceiling).

## Probe (b) — below-threshold control keeps the inline path

- **Prompt:** `Reply with exactly this line and nothing else: INLINE-CONTROL-OK-9F3A`

| Assertion | Value |
|---|---|
| `transport_metadata.handoff` | `false` (inline path, no handoff fields) |
| `.ok` / `error_class` | `true` / `null` (exit 0) |
| Response contains sentinel `INLINE-CONTROL-OK-9F3A` | ✅ |
| `echoed_model` | `claude-sonnet-4.6` |
| `premium_requests` | 1 |
| `total_api_duration_ms` / `session_duration_ms` | 1858 / 4270 |
| session id | `1ab2dca2-d5ca-4b77-b955-90045f0cc7dc` |

**Returned content (verbatim):** `INLINE-CONTROL-OK-9F3A`

The inline dispatch is byte-identical in behavior below the threshold — the
handoff machinery is inert until the size gate fires.

## Outcome

- **Live >32 KiB dispatch works on CLI 1.0.69:** the pull path fires, the
  81,829-char prompt could never dispatch inline (81,925 » 32,767), the
  82,231-byte payload is read whole (all three scattered facts recovered), the
  nonce EOF ack validates and is stripped, and the inline control confirms the
  below-threshold path is untouched. The **transport handoff behavior is
  demonstrably correct**.
- **The transport code surfaced no defects** — Step 3's probe-driven fix loop
  was a no-op. (Contrast Set 078 S4, which found real wire-shape bugs live;
  this session's fakes-vs-wire fidelity held because S1 built on those S4
  findings — the `assistant.message` `data`-wrapping and UTF-8 decode fixes
  were already baked into the transport being probed.)
- **Version-pin caveat (operator-adjudicated ship + defer):** verification
  round 1 correctly flagged that the probe ran on 1.0.69 while the catalog pins
  1.0.68, and the pin is runtime-fail-closed (banner above). The spec's
  end-state ("VERIFIED working through the **pinned** CLI") is met in *intent*
  (handoff proven live) but not in *letter* (wrong version). The operator
  reviewed this and chose to **ship 0.34.0 now** and **reconcile the pin in Set
  103's seat prep** (the pin drift is pre-existing and only blocks the
  `copilot-cli` profile that Set 103 first exercises; Set 103 is already
  multi-blocked on other seat preconditions). See the disposition and
  `s2-remediation-round-2.md`.
- **Premium requests spent:** 3 total (1 preflight + 2 probes), all
  operator-sanctioned.
