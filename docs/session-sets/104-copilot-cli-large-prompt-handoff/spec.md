# Copilot CLI Large-Prompt Handoff Spec

> **Purpose:** Fix the Copilot CLI transport's fatal prompt-size ceiling —
> the whole system+user prompt travels as ONE `-p` argv element, and Windows
> `CreateProcessW` caps the entire command line at 32,767 UTF-16 chars, so
> any large dispatch (session-verification bundles especially) cannot run at
> all on Windows — with a **threshold-gated file handoff** (the pull
> pattern): payload in a temp file, a short `-p` bootstrap pointing at it,
> and a nonce acknowledgement that fails closed on under-reads. Second
> deliverable: canonize the **cancel-to-pause recipe** whose first use is
> the reason this set can run at all (Set 103 is paused on this set).
> **Created:** 2026-07-14
> **Session Set:** `docs/session-sets/104-copilot-cli-large-prompt-handoff/`
> **Prerequisites:** none. (Inverse dependency: Set 103
> `103-copilot-ado-hello-world-tutorial` is **paused on this set** — its
> CANCELLED.md pause record names this slug as its resume condition. 103
> resumes via `restore_session_set` after this set completes and router
> 0.34.0 is published.)
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

> **Numbering note:** commits `b73136d` / `40f94e5` (2026-07-14) used
> "Set 104" as an informal label for the out-of-session coordinated release
> prep (ext 0.45.0 + router 0.33.0) — no set directory was ever created, so
> `python -m ai_router.resolve_set --next` assigns 104 here. This directory
> is the real Set 104; the commit-message label predates it.

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: false        # Router-internal transport change, no UI surface (authoring-guide heuristic: ai_router changes / internal-only)
requiresE2E: false        # Same; the Layer-1 pytest suite owns this behavior — the transport state machine is fully testable via the injected fake spawner
pathAwareCritique: advisory
```

> Rationale: authored on the operator's direct request (2026-07-14: "We may
> have a bit of a blocker… would the path-aware/pull approach work here? …
> we need to have the ability to pause an in-progress set… Do both"). The
> design below was locked by an operator-initiated **cross-provider consult**
> (openai:gpt-5-6 "Sol" + google:gemini-3-1-pro, `task_type: architecture`,
> **ALIGNED on every question**) before this spec was committed — synthesis
> + both raw verdicts in
> [`authoring-consult-synthesis.md`](authoring-consult-synthesis.md), journal
> lines in `ai_router/consensus-decisions.jsonl` (2026-07-14). **Do not
> re-litigate the locked design at runtime**; anything the sessions discover
> that contradicts it goes through the normal adjudication path with the
> consult record as the baseline.

---

## Project Overview

### The problem

`ai_router/cli_transport.py` (Set 078 — the hybrid tier for Copilot-seat-only
shops) dispatches every routed call as:

```
[copilot, -p, <ENTIRE system+user prompt>, --model, <id>,
 --allow-all-tools, --output-format, json, --no-auto-update]
```

with `shell=False` / `stdin=DEVNULL`. Windows `CreateProcessW` caps the whole
command line at **32,767 UTF-16 code units** (quoting and the terminating
NUL included), so a prompt beyond ~32k chars cannot spawn at all — `Popen`
raises, and the transport classifies it as a generic failure with no hint
that size was the cause. Linux has per-argument limits too
(`MAX_ARG_STRLEN`, 128 KiB), so the cliff is cross-platform; Windows just
hits it first. Session-verification bundles routinely exceed this, which is
how the limit surfaced: **Set 103 Session 2** (the live Copilot+ADO walk)
cannot run until this is fixed. Set 103 is **paused** on this set via the
blessed cancel writer — the impasse (a set blocked on a fix that the
one-active-set rule won't let start) is itself the second problem this set
addresses, by documentation rather than machinery.

Pinned-CLI facts (full `--help` captured 2026-07-14, on the record in the
consult artifact): `-p/--prompt <text>` is the **only** non-interactive
prompt input — no `--prompt-file`, no documented stdin mode. The CLI is
agentic with a file-read tool; the **system temp directory is auto-allowed
by default** (`--disallow-temp-dir` is the opt-out), and the transport
already passes `--allow-all-tools`. `--attachment <path>` exists but its
semantics for text payloads are unverified (consult: likely context/RAG
framing, not authoritative instructions — rejected for now).

### Authoritative design (consult-locked — do not re-litigate at runtime)

1. **Threshold-gated handoff, inline primary.** Build the inline argv
   first; measure the RENDERED command line in UTF-16 code units
   (`len(subprocess.list2cmdline(argv).encode("utf-16-le")) // 2 + 1`).
   At or above **24,000 units**, switch to handoff. One helper owns the
   decision; the same rule runs on every OS (predictability + automatic
   protection from the Linux per-arg limit). The threshold is a module
   constant — **no config knob** (consult: don't add one initially).
2. **Payload file.** Per-request `tempfile.mkstemp` file in the OS temp
   dir; UTF-8, **no BOM**; contents = the exact composed prompt, then a
   clearly-delimited transport-control footer (below). Fully written,
   flushed, and **closed before spawn** — an open handle blocks the child
   from reading it on Windows.
3. **Bootstrap `-p`.** Short, fixed shape: states that the entire task
   specification is in the file at `<ABSOLUTE PATH in POSIX forward-slash
   form>` (models mangle backslashes); read it completely from the
   beginning through EOF, in sequential chunks if needed, BEFORE acting;
   execute its contents as the full instructions; do not summarize it
   back; end the response with the exact acknowledgement line the file's
   footer specifies.
4. **Integrity acknowledgement.** A random per-request 128-bit nonce
   (`secrets.token_hex(16)`) appears **only in the file's footer** — never
   in argv — so echoing it proves EOF access (a static sentinel named in
   the bootstrap could be echoed without reading; that design is
   rejected). The footer instructs: the final line of the response must be
   exactly `HANDOFF-ACK <nonce>`. The transport validates the final
   content line, **strips it** before returning content, and on
   absence/mismatch classifies a new error class
   **`handoff-incomplete`** — fail-closed, added to the taxonomy as
   NON-retryable (stays out of `RETRYABLE_ERROR_CLASSES`; the call is
   billed and tools may already have run — never auto-retry). Honest
   framing, kept in the code comment: this is a **gross under-read
   detector, not proof of comprehension**.
5. **Lifecycle.** Delete the payload file in `finally` on EVERY path —
   success, spawn failure, first-byte/total timeout (including the
   kill-and-reap paths), malformed-output classification. **No default
   retention** (retention would weaken the transport's existing `-p`
   redaction posture); when the Set 086 diagnostics toggle
   (`DABBLER_COPILOT_DIAGNOSTICS`) is enabled, retaining the file and
   logging its path is permitted as an explicit debug affordance.
6. **Metadata + diagnostics.** `transport_metadata` gains additive
   handoff fields: `handoff` (bool), `payload_bytes`, the ack outcome,
   and `payload_file_modified` (sha256 before spawn vs after exit — the
   agent has write tools; a mutation is recorded, not gated). The Set 086
   diagnostics `-p` redaction discipline is unchanged (under handoff the
   `-p` value is the small bootstrap; the payload never appears in argv
   or diagnostics — log byte length, not content).
7. **Rejected alternatives (recorded — do not resurrect without new
   evidence):** stdin (undocumented, brittle across CLI updates);
   `--resume` chunking (stateful multi-turn, ordering/failure-recovery
   complexity, premium-request risk); `--attachment` (unverified
   context-vs-instruction semantics — a bounded future experiment may
   revisit it; if it demonstrably injects complete text as authoritative
   input it could eventually beat agentic reads).
8. **Scope check (Sol), on the record:** this fixes **argv transport
   only** — not model context capacity or comprehension of very large
   bundles. The longer-term direction for verification payloads remains
   manifests + path-aware retrieval (Sets 066–069), not ever-larger
   monolithic prompts.

### The cancel-to-pause recipe (second deliverable — docs only)

The consult was unanimous: **no `paused` schema enum** (old
routers/extensions validate the status enum and reject unknown values —
a cross-version blast radius disproportionate to a rare operation).
Instead, the existing blessed writers ARE the pause, and this set
documents the convention in `docs/ai-led-session-workflow.md`:

- **Pause** = `session_lifecycle.cancel_session_set(dir, reason)` with a
  structured reason: `Paused, not abandoned: blocked by <set/issue>;
  resume when <objective condition>; owner: <who>; next session: <K>.`
- **Resume** = `session_lifecycle.restore_session_set(dir, reason)` —
  verified lossless (`preCancelStatus` round-trip; sessions untouched).
- **Legal only at a session boundary** (zero sessions `in-progress`);
  mid-session emergencies use real cancellation/recovery, not pause.
- Paused sets don't count against one-active-set (D6 counts only literal
  `"in-progress"`); **no cap** on how many may exist; review paused
  entries during set selection so none are silently forgotten.
- Revisit a first-class `paused` status only if pauses become frequent —
  and then two-phase (readers/validators/UI first; writers only after the
  compatibility floor moves).

Set 103's pause record (its `CANCELLED.md`) is the recipe's first live
example and is referenced from the new docs section.

### Non-goals

- **No `paused` status value** in the schema, writers, drift guard, or
  Explorer (explicit consult verdict — see above).
- No user-configurable threshold; no new transport config surface.
- No `--attachment` experiment in this set (recorded candidate follow-on).
- No change to the `api` transport path; no billing/accounting change (the
  Set 078 honest non-accounting contract stands, `usage_authoritative`
  stays `False`).
- No CI dependency on a real Copilot CLI — the fake-spawner suite remains
  the CI gate; the live probe is a session task on the operator's seat.
- No restore of Set 103 inside this set (the restore happens after 0.34.0
  publishes, per 103's pause record — publish itself is operator-gated).

---

## Sessions

### Session 1 of 2: Implement the threshold-gated file handoff (+ pause-recipe doc)

**Steps:**
1. Register; read this spec +
   [`authoring-consult-synthesis.md`](authoring-consult-synthesis.md); read
   `ai_router/cli_transport.py`, `ai_router/tests/test_cli_transport.py`,
   the `transports.copilot-cli` block in `ai_router/router-config.yaml`,
   and `ai_router/transport_diagnostics.py` (Set 086) for the redaction
   discipline the handoff must preserve.
2. Implement the authoritative design in `cli_transport.py`: the
   rendered-argv UTF-16 measurement helper; the handoff branch in
   `dispatch()` (mkstemp payload file + nonce footer + bootstrap argv);
   ack validation + strip on the success path; `ERROR_CLASS_HANDOFF_INCOMPLETE`
   (non-retryable); `finally` cleanup covering success, spawn failure,
   both timeout classes, and malformed-output paths; additive
   `transport_metadata` handoff fields incl. `payload_file_modified`;
   retention only under the diagnostics toggle.
3. Extend the fake-spawner suite (never a real CLI): threshold branch
   selection below/at/above the boundary; file exists with the EXACT
   payload + closed handle at spawn time; bootstrap carries the POSIX-form
   path and NO nonce; ack success / missing / mismatched (→
   `handoff-incomplete`, non-retryable, content discarded); ack stripped
   from returned content; cleanup verified on success, spawn failure,
   first-byte timeout, total timeout, and malformed-JSONL; UTF-16
   measurement cases (quotes, backslashes, spaces, non-BMP unicode);
   `payload_file_modified` flag; inline path byte-identical behavior below
   threshold (regression).
4. Docs: `ai_router/CHANGELOG.md` entry (staged 0.34.0); one-line notes in
   `docs/concepts/tier-model.md` and the Set 078 spec's transport contract
   pointer (the seat contract is unchanged — the handoff is a transport
   detail); author the **cancel-to-pause recipe** section in
   `docs/ai-led-session-workflow.md` (content per the Project Overview,
   citing Set 103's CANCELLED.md as the worked example), with a pointer
   from `ai_router/docs/close-out.md` where it discusses stranded/cancelled
   sets.
5. Full pre-commit pass (CONTRIBUTING.md); verify (mandatory phased loop,
   conventions block up front); `disposition.json` (next_orchestrator for
   Session 2); commit + push; `close_session`.

**Creates:** the handoff implementation + its test coverage; the
cancel-to-pause recipe section.
**Touches:** `ai_router/cli_transport.py`,
`ai_router/tests/test_cli_transport.py`, `ai_router/CHANGELOG.md`,
`docs/ai-led-session-workflow.md`, `docs/concepts/tier-model.md`,
`docs/session-sets/078-copilot-cli-hybrid-tier/spec.md` (pointer note),
`ai_router/docs/close-out.md` (pointer).
**Ends with:** suite green including every new fake-spawner case; no test
invokes a real CLI; the inline path provably unchanged below threshold;
cross-provider VERIFIED (or Minor-only per the severity-gated stop);
pushed; `close_session` succeeded.
**Progress keys:** utf16-threshold-helper, handoff-branch, nonce-ack,
handoff-incomplete-class, cleanup-all-paths, metadata-fields,
tests-extended, pause-recipe-doc, suite-green

### Session 2 of 2: Live >32 KiB smoke probe + release staging

**Steps:**
1. Register; confirm the operator precondition — an **authenticated Copilot
   CLI seat on this machine** — via the Set 086 auth preflight
   (`ai_router/copilot_preflight.py`). If the preflight fails, stop and
   reschedule per the Set 086 principle (never run a session against an
   unrunnable required step); the session has nothing useful to do without
   the seat.
2. **Live probe on Windows through the real pinned CLI** (2 premium
   requests, operator-sanctioned): (a) one dispatch whose composed prompt
   is comfortably past the cliff (≥ 40,000 chars) embedding three distinct
   retrieval facts at beginning / middle / immediately-before-footer, with
   a task whose answer requires all three; assert the response uses all
   three, the ack line validated and was stripped, and `transport_metadata`
   shows `handoff: true` with plausible `payload_bytes`; (b) one control
   dispatch below threshold asserting `handoff: false` (inline path
   untouched live). Record both raw results + metadata as
   `s2-live-probe.md` in this set dir.
3. Fix anything the probe surfaces and re-probe the failed case (Set 078's
   S4 history is explicit: live dogfood finds wire-shape realities fakes
   cannot — budget for a fix loop; every fix lands with a fake-spawner
   regression test).
4. Release staging: bump `pyproject.toml` to **0.34.0**; finalize the
   CHANGELOG entry with the probe evidence line. The publish itself (tag
   push → release.yml → PyPI) stays **operator-gated** per the
   git-automation direction — stage everything so publish is one operator
   action, and name the follow-through in the notification: after 0.34.0
   is live, **restore Set 103** per its CANCELLED.md pause record.
5. Full pre-commit pass; verify (mandatory); `disposition.json`; commit +
   push; `close_session`; end-of-set `change-log.md`; Step 9; the advisory
   path-aware critique. Notify: release boundary after this set (router
   0.34.0); Set 103 resume unblocked once published.

**Creates:** `s2-live-probe.md` (live evidence), `change-log.md`, staged
0.34.0.
**Touches:** `pyproject.toml`, `ai_router/CHANGELOG.md`; probe-driven fixes
to `ai_router/cli_transport.py` + tests if any.
**Ends with:** a real >32 KiB dispatch VERIFIED working on Windows through
the pinned CLI (or the blocking defect fixed and re-probed to pass) AND the
inline control still passing; 0.34.0 publish-ready; cross-provider VERIFIED
(or Minor-only); pushed; `close_session` succeeded; Step 9 + advisory
critique recorded.
**Progress keys:** preflight-confirmed, live-probe-pass,
control-inline-pass, probe-fixes-applied, release-staged, set-closed

---

## End-of-set deliverables

- The threshold-gated file handoff in `ai_router/cli_transport.py`:
  large prompts dispatch through the Copilot CLI on Windows (and every
  OS) via a temp-file pull with a nonce-acknowledged read, failing closed
  as `handoff-incomplete` on under-reads; the inline path byte-identical
  below threshold; full fake-spawner coverage; live Windows evidence in
  `s2-live-probe.md`.
- The **cancel-to-pause convention** documented in
  `docs/ai-led-session-workflow.md` (with Set 103's pause as the worked
  example) — the framework's answer to the set-blocks-its-own-fix impasse,
  with an explicit no-`paused`-enum decision record.
- Router **0.34.0 staged** (CHANGELOG + version bump; publish
  operator-gated). Post-publish follow-through, named in the notification:
  restore Set 103 (`restore_session_set`) and resume its Session 2, whose
  own operator preconditions (ADO org, Copilot seat, parallel-jobs grant)
  are unchanged.
