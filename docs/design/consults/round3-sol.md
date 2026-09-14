model_name: gpt-5-6-sol
model_id: gpt-5.6-sol
provider: openai
tokens: 2075 in / 12833 out
elapsed: 169.65s  truncated: false
---

## 1. Critique of the sketch

### (a) Timer reset on instruction and intermittent activity — **FIX**

**Issue →** One resettable timer conflates responsiveness with progress. Repeated output deltas, spinner bytes, or CPU activity can prove that a process is alive while masking an infinite loop.

**Location →** “Timer that gets reset any time an instruction is sent … and any time AI responds intermittently.”

**Fix →** Use separate clocks:

- **Acknowledgment clock:** starts when an instruction is delivered; stops at the first engine activity.
- **Liveness clock:** resets on stream events, changing output, tool activity, or OS I/O.
- **Progress clock:** resets only on stronger evidence: tool transition, job milestone, tree movement, or accepted framework answer.
- **Job wake clock:** set from `retry_after_seconds`; ordinary engine activity does not reset it.
- **Absolute policy clock:** triggers diagnosis or escalation, never automatic scope reduction.

Raw bytes and CPU reset liveness, not progress. The brief establishes that streaming events and OS signals are free observables; use them before spending a seat request.

### (b) “Why are you waiting?” with numbered reasons — **FIX**

**Issue →** An unconstrained “why?” spends a premium request to solicit an unverifiable story. It is especially pointless when the host already knows that the process is dead, rate-limited, or blocked on a permission prompt.

**Location →** The numbered wait-reason probe.

**Fix →** Probe only when free signals leave an ambiguity and the engine is known to be receptive. Require a versioned, machine-readable claim with:

- One enumerated reason.
- Evidence handles such as tool name, child PID, question ID, or last completed action.
- A requested disposition, not an ETA.
- `"I don't know"` as a terminal diagnostic result.

Do not probe while byte flow proves active work, after process death, or while a host prompt is pending. An AI answer remains a CLAIM under the house rules.

### (c) Cancellation followed by self-diagnostic — **DROP as the primary recovery**

**Issue →** Cancelling can destroy evidence, interrupt legitimate work, or leave a child process running. Asking the same possibly-broken agent to diagnose itself then spends another premium request for another unverified claim.

**Location →** “Issue a cancellation command … then ask AI to perform a self-diagnostic with a recommended action.”

**Fix →**

1. Capture stream, process-tree, CPU/I/O, job-log, and lifecycle snapshots.
2. Classify any host-known block.
3. If the invocation is receptive, permit one structured diagnostic claim.
4. Interrupt only with positive evidence that interruption is appropriate.
5. Confirm quiescence before starting another attempt.
6. Recover from the machine-owned lifecycle record, not from the agent’s memory.

Claude’s `control_request` interruption is measured; equivalent Codex behavior is unmeasured according to the brief. Unsupported adapters must escalate rather than launch concurrent work.

### (d) AI time estimates and long-running alerts — **DROP ETAs; FIX alerts**

**Issue →** The operator explicitly directs that AI ETAs are unreliable. Paying for an ETA purchases a hallucination-shaped number.

**Location →** “Estimate how long it is going to take and alert the human.”

**Fix →**

- Never request or use an AI ETA.
- Display measured elapsed time, last verified progress, current tool/process state, and applicable policy threshold.
- Alert only when there is an actionable human decision: answer a question, approve a permission, restore auth, resolve conflicting side effects, increase the paid budget, or cancel.
- A factual “running for 12 minutes; output still changing; no action required” belongs in WATCH, not as an interruption.

---

## 2. Liveness protocol

### Fundamental constraint

**A passive framework with no engine handle, no paid continuation, and no human input cannot provide attention-free liveness.** At least one constraint must change. `START` should grant a bounded supervisor authority to observe the engine and issue paid continuations within a recorded budget. This is consistent with the brief’s START / WATCH-or-INTERACT / CANCEL vocabulary and avoids repeated confirmations.

### Instruction lease

Every issued instruction receives a durable lease:

```json
{
  "schema_version": 1,
  "session_id": "ses_123",
  "conversation_id": "engine-conversation-id",
  "instruction_id": "ins_045",
  "lease_id": "lease_045_2",
  "lease_epoch": 2,
  "attempt_id": "attempt_071",
  "issued_at": "2026-03-01T12:00:00Z",
  "state": "AWAITING_ACTIVITY",
  "paid_budget_remaining": {
    "continuations": 6,
    "probes": 2,
    "recoveries": 2
  }
}
```

Answers and heartbeats must carry `lease_id`, `lease_epoch`, and `attempt_id`. A stale attempt is recorded and rejected from advancing lifecycle state. This prevents a resumed old invocation from answering after recovery has begun.

An AI-issued heartbeat is only a claim. It may update claimed liveness but does not reset verified progress unless corroborated by stream, process, job, or tree evidence.

### State machine

| State | Meaning | Main transitions |
|---|---|---|
| `DORMANT` | Durable session exists; no outstanding instruction | Issue instruction → `AWAITING_ACTIVITY` |
| `AWAITING_ACTIVITY` | Instruction delivered, no uptake observed | Stream/tool event → `ACTIVE`; known prompt → `BLOCKED_HUMAN`; turn ends → `QUIESCENT`; timeout → classify |
| `ACTIVE` | Invocation is emitting free liveness evidence | Verified milestone → remain `ACTIVE`; silence → `AMBIGUOUS`; answer accepted → next state |
| `BLOCKED_HUMAN` | Host knows a real human decision is required | Human resolves → `ACTIVE`; cancel → `CANCELLED` |
| `WAITING_JOB` | Framework returned `wait` and a detached job is outstanding | Job output updates observations; durable wake time reached → continuation/recovery |
| `QUIESCENT` | Turn ended or CLI is idle while the lease remains outstanding | Automatic continuation in the same conversation; if unavailable, `RECOVERING` |
| `AMBIGUOUS` | No sufficient free evidence and no known host block | Paid probe → `PROBING`; confirmed death → `RECOVERING`; unresolved active process → `HUMAN_REQUIRED` |
| `PROBING` | One bounded structured probe is outstanding | Valid answer → classify; timeout/unknown → `RECOVERING` or `HUMAN_REQUIRED` |
| `RECOVERING` | Supervisor is interrupting or invoking `--continue` | New activity → `ACTIVE`; failure/budget exhaustion → `HUMAN_REQUIRED` |
| `HUMAN_REQUIRED` | Machine cannot safely or economically decide | Human interacts, raises budget, restores auth, or cancels |
| `DONE` / `CANCELLED` / `ABANDONED` | Terminal lifecycle states | No automatic recovery |

### Timers

**ASSUMPTION — bootstrap values requiring telemetry-based tuning:**

| Timer | Initial policy | Reset rules | Expiry action |
|---|---:|---|---|
| `T_ack` | 30 seconds | Not reset; satisfied by first meaningful engine event | Run free classification |
| `T_liveness` | 60 seconds | Stream delta, tool event, changing I/O, job-log append, or OS activity | Enter `AMBIGUOUS`; do not cancel |
| `T_progress` | 10 minutes | Tool transition, job milestone, tree movement, or accepted framework result | Record no-progress event; diagnose or show WATCH status |
| `T_probe` | 20 seconds | Never reset | Treat as no answer; do not probe recursively |
| `T_interrupt` | 10 seconds | Never reset | If quiescence is unconfirmed, escalate rather than duplicate |
| `T_job_wake` | `retry_after_seconds` | Replaced only by a new authoritative framework wait | Wake supervisor and continue the conversation |
| `T_budget_window` | Session lifetime | Never reset by activity | Enforce paid-request cap |

No timeout alone proves failure. Positive activity can defer interruption, but repetitive activity must not reset `T_progress`.

### Observable hierarchy

Use all free observations before any paid action:

1. **Durable framework facts**
   - Outstanding instruction and lease epoch.
   - Accepted/rejected answer state.
   - Tree movement.
   - Detached-job state, logs, and `retry_after_seconds`.
2. **Structured engine events**
   - Turn start/end.
   - Model deltas.
   - Tool start/end.
   - Permission, auth, rate-limit, and context events where exposed.
   - The brief confirms streaming events generally; exact event coverage is adapter-specific.
3. **OS observations**
   - Process existence and exit code.
   - Child-process tree.
   - CPU and I/O deltas.
   - Open PTY or disconnected host.
4. **Repository and job observations**
   - File/tree changes.
   - Test or build logs.
   - Detached-job milestones.
5. **Paid structured probe**
   - Only if the process is receptive and free evidence is genuinely ambiguous.
6. **Paid recovery**
   - Continue the living conversation or invoke the proven `--continue` path.
7. **Human judgment**
   - Permission/security decision.
   - Answer to an AI question.
   - Auth restoration.
   - Conflicting or potentially destructive side effects.
   - Paid-budget increase.
   - Cancel or abandon.

### Probe wire shape

Request:

```json
{
  "type": "dabbler.liveness_probe",
  "version": 1,
  "session_id": "ses_123",
  "instruction_id": "ins_045",
  "lease_id": "lease_045_2",
  "lease_epoch": 2,
  "probe_id": "probe_009",
  "observed": {
    "last_stream_event": "tool_output",
    "seconds_since_stream": 74,
    "process_alive": true,
    "child_process_count": 1,
    "seconds_since_verified_progress": 311
  },
  "allowed_reason_codes": [
    "A01_THINKING",
    "A02_LONG_TOOL",
    "A03_WAITING_USER_ANSWER",
    "A04_WORK_COMPLETE_LOOP_NOT_ADVANCED",
    "A99_I_DONT_KNOW"
  ],
  "response_deadline_seconds": 20,
  "instruction": "Return exactly one dabbler.liveness_answer JSON object. Do not estimate duration."
}
```

Answer:

```json
{
  "type": "dabbler.liveness_answer",
  "version": 1,
  "session_id": "ses_123",
  "instruction_id": "ins_045",
  "lease_id": "lease_045_2",
  "lease_epoch": 2,
  "probe_id": "probe_009",
  "reason_code": "A02_LONG_TOOL",
  "claim": {
    "tool_name": "test runner",
    "child_pid": 4812,
    "last_observed_event": "integration suite started"
  },
  "requested_disposition": "WAIT"
}
```

The framework verifies `child_pid`, process activity, and logs before accepting `WAIT`. There is deliberately no ETA field.

### Trigger coverage

| Layer | X1: turn ends/idles | X2: compaction loses loop | X3: terminal closed/reboot | X4: wait callback missed |
|---|---|---|---|---|
| Durable watcher/lease | Detects outstanding lease | Detects lease still outstanding | Detects on supervisor restart | Detects overdue wake |
| Structured engine/host events | Detects turn end immediately | Detects compaction if emitted | Detects disconnect/process exit | Observes job events |
| OS signals | Distinguishes idle/dead/active tool | Usually only shows process health | Detects death; not possible while machine is off | Detects detached job health |
| Paid probe | Can classify a receptive idle agent, but continuation is usually better | May reveal loop loss; answer is only a claim | Cannot reach a dead or closed CLI | Unnecessary |
| Automatic same-conversation continuation | Recovers | Rehydrates lease and instruction | Works only if conversation host remains available | Wakes at retry time |
| `--continue` recovery | Recovers; mechanic is proven in the brief | Recovers with machine-owned state injected | Recovers after host restart if auth permits | Recovers callback processing |
| Human judgment | Not normally needed | Only after bounded failures | Needed for auth or unavailable host | Only after bounded failures |

No AI probe can diagnose a permission prompt that prevents delivery of the probe, a dead process, a closed terminal, or a host-visible rate-limit/auth screen. If an adapter cannot recognize such prompts, the state is cheaply unknowable; show the terminal to the human rather than asking the blocked AI.

A reboot cannot be handled while the machine is off. Recovery after reboot requires a durable auto-starting supervisor. **ASSUMPTION:** supported transports can resume under the user’s existing auth without a new interactive login; capability testing at `START` must determine this.

---

## 3. B vs C vs hybrid

| Design | Wins | Loses |
|---|---|---|
| **B: per-step supervisor** | Deterministic ownership, simple retries, strong fencing, uniform lifecycle, and direct elimination of X1–X4 while the supervisor is running | Every step can spend a premium request; interrupts and questions are awkward; the user’s living terminal conversation ceases to be the primary interaction surface |
| **C: supervised conversation** | Preserves interruption, guidance, questions, auth visibility, and the user’s conversation | The sketch lacks durable recovery, separates neither liveness from progress nor free from paid evidence, and can cancel legitimate work based on silence |
| **Recommended hybrid: conversation-first guardian** | Keeps the current conversation while healthy; uses turn-end events to continue automatically; uses the proven `--continue` only after death, detach, or context loss; handles `wait` with a durable wake | Requires engine-specific adapters and bounded authority over the conversation; cannot guarantee recovery where the CLI exposes neither a control channel nor a resumable noninteractive invocation |

The hybrid operates as follows:

1. `START` registers the lifecycle, conversation ID, supervision budget, and adapter capabilities.
2. The user continues interacting in the same engine conversation.
3. Structured turn-end plus an outstanding lease causes an automatic continuation in that conversation. This is paid but requires no meaningless confirmation.
4. Active byte flow suppresses probing; verified progress updates the lease.
5. A host-known permission or user-question block enters `BLOCKED_HUMAN`.
6. An ambiguous silent process gets at most one probe.
7. A dead, compacted, or detached conversation is resumed with `--continue`, which the brief says was proven.
8. Recovery injects the outstanding instruction and lease identity from disk rather than relying on conversational memory.
9. The supervisor survives extension/terminal closure as a durable local service. **ASSUMPTION:** implementing such a service is acceptable despite the prior child-process problems; it should avoid killing process trees except during explicit fenced recovery.

### Different alternative: **event-driven Stop Gate**

Instead of polling silence, install an engine-specific turn-completion gate:

- Before the CLI may settle at its prompt or exit, the gate checks the durable instruction lease.
- If the lease is answered, it permits the stop.
- If it remains outstanding, it injects the next protocol envelope into the same conversation.
- If the framework says `wait`, it permits the engine to stop and registers a durable wake.
- Progress markers can be emitted as local `dabbler session heartbeat` calls, but remain claims until corroborated.

This is neither B’s fresh process per step nor C’s timer-driven interrogation. It turns X1 into a deterministic host event rather than a timeout. It preserves the living conversation and spends no diagnostic probe at normal turn boundaries.

Its weakness is portability. Claude’s control channel is measured, but native stop hooks or equivalent injectable turn-end controls for Codex, Gemini, and Copilot are not established in the brief. **ASSUMPTION:** at least some CLIs expose a stop hook or parseable turn-end event. Engines without it fall back to the hybrid’s durable guardian and `--continue`.

---

## 4. Numbered wait-reason taxonomy

### AI-answerable claims

| Code | Meaning | Required claim evidence |
|---|---|---|
| `A01_THINKING` | The agent claims it was internally working | Last completed action and intended next action; never an ETA |
| `A02_LONG_TOOL` | Waiting on a tool or process it started | Tool name plus PID, job ID, or log reference |
| `A03_WAITING_USER_ANSWER` | Waiting for an answer to a question it asked | Question ID or exact referenced question |
| `A04_WORK_COMPLETE_LOOP_NOT_ADVANCED` | Work is complete, but the agent failed to call `dabbler session next` | Claimed completion artifact and expected next protocol action |
| `A05_RECOVERABLE_APPROACH_FAILURE` | The attempted approach failed, but another bounded approach exists | Failed action and proposed next action |
| `A99_I_DONT_KNOW` | The agent cannot classify its state | No invented explanation permitted |

`A01_THINKING` is weak: delivering the probe has already interrupted the claimed thinking. It must not justify indefinite waiting.

### Host-only facts

| Code | Meaning | Host evidence |
|---|---|---|
| `H01_PERMISSION_PENDING` | CLI or tool is waiting for permission | Structured prompt or terminal parser |
| `H02_RATE_LIMITED` | Transport rejected or delayed a request | Transport event, status, or CLI output |
| `H03_PROCESS_DEAD` | Engine process exited or disappeared | OS process state and exit code |
| `H04_CONTEXT_COMPACTED_OR_EXHAUSTED` | CLI reported compaction or context exhaustion | Structured engine event or explicit CLI output |
| `H05_AUTH_REQUIRED` | Login, token, or seat authorization is required | CLI/auth prompt |
| `H06_TURN_ENDED` | Model turn completed while the lease remained outstanding | Turn-end event plus durable lease |
| `H07_DETACHED_JOB_RUNNING` | Framework job is still active | Job record, PID, or log heartbeat |
| `H08_JOB_WAKE_DUE` | `retry_after_seconds` has elapsed | Durable monotonic timer |
| `H09_TERMINAL_OR_HOST_LOST` | PTY, terminal, extension host, or supervisor disconnected | Host lifecycle event |
| `H10_STALE_ATTEMPT` | An older invocation emitted an answer after lease replacement | Lease epoch mismatch |

Do not offer these codes to the AI as explanations it is expected to know.

### Unknowable cheaply

| Code | Meaning |
|---|---|
| `U01_NATIVE_CLI_DEADLOCK` | Process exists but its internal state is opaque |
| `U02_OPAQUE_EXTERNAL_BLOCK` | A tool is blocked on an external service without structured status |
| `U03_SEMANTIC_SPIN` | Output changes, but no useful progress is occurring |
| `U04_BLIND_PROMPT_STATE` | Adapter sees bytes but cannot identify whether the CLI is asking for permission, input, or auth |
| `U05_SIDE_EFFECT_UNCERTAINTY` | It is unclear whether an interrupted tool partially modified external state |

### Action for `A99_I_DONT_KNOW`

1. Record the answer as an unverified AI claim.
2. Take one free diagnostic snapshot.
3. Do not ask the AI to explain its ignorance.
4. If the old attempt can be confirmed quiescent, perform one fenced recovery using the machine-owned instruction.
5. If quiescence cannot be confirmed, escalate rather than run concurrent attempts.
6. Charge the probe and any recovery against the session budget.

---

## 5. Cost budget and recording

### Budget shape

Free observations are unlimited. Paid actions are bounded at `START`, with no per-action confirmation.

**ASSUMPTION — initial profile for measurement:**

```text
C = 8 automatic continuation prompts
N = 2 diagnostic probes
M = 2 fault-recovery --continue invocations
R = 1 retry for a transport failure that produced no model turn
```

- `C` covers normal attention-free continuation at turn boundaries and job wakeups.
- `N` is session-wide, with at most one probe per lease.
- `M` covers dead, detached, or context-lost recovery, not ordinary lifecycle movement.
- `R` is allowed only where transport evidence proves that no paid model turn was accepted; otherwise it counts against `M`.

For planned workflows, set `C` from expected remaining moves plus a rejection reserve rather than silently using an unbounded default. Dynamic sessions retain a hard profile ceiling. Budget exhaustion enters `HUMAN_REQUIRED`; increasing a premium-spend ceiling is a real decision, unlike clicking Continue.

### Append-only supervision record

Every observation-driven decision and action should append an event:

```json
{
  "schema_version": 1,
  "event_id": "evt_000981",
  "wall_time": "2026-03-01T12:05:14.381Z",
  "monotonic_ms": 91827364,
  "session_id": "ses_123",
  "conversation_id": "conv_456",
  "instruction_id": "ins_045",
  "lease_id": "lease_045_2",
  "lease_epoch": 2,
  "attempt_id": "attempt_071",
  "supervisor_id": "guardian_01",
  "event_type": "SUPERVISION_ACTION",
  "trigger": {
    "type": "LIVENESS_TIMER_EXPIRED",
    "timer_id": "T_liveness",
    "threshold_seconds": 60
  },
  "observations": {
    "process_alive": true,
    "process_id": 4812,
    "seconds_since_stream": 74,
    "seconds_since_verified_progress": 311,
    "child_process_count": 1,
    "tree_revision": "tree_88",
    "job_log_offset": 19041
  },
  "decision": {
    "rule_id": "liveness-policy-v1/ambiguous-probe",
    "from_state": "ACTIVE",
    "to_state": "PROBING",
    "reason": "No host-known block and process remains receptive"
  },
  "action": {
    "type": "SEND_LIVENESS_PROBE",
    "probe_id": "probe_009",
    "payload_ref": "blob:sha256:...",
    "result": "SENT"
  },
  "cost": {
    "class": "PAID_PROBE",
    "budget_before": 2,
    "budget_after": 1
  },
  "claim": null,
  "evidence_refs": [
    "stream:attempt_071:offset_8831",
    "process-snapshot:sha256:..."
  ]
}
```

Record at least:

- Timer scheduled, reset, expired, and cancelled.
- State transition and policy rule.
- Probe request, answer, timeout, and cost.
- AI claims separately from verified facts.
- Interrupt request and acknowledgment.
- Process exit and process-tree snapshot.
- Continuation or `--continue` invocation.
- Lease replacement and stale-attempt rejection.
- Human escalation and human disposition.
- Budget grant, consumption, exhaustion, and override.
- Payload references or hashes where raw prompts contain sensitive data.

---

## 6. What breaks

The strongest failure mode is a false quiescence classification: the supervisor decides that an invocation is idle, resumes with `--continue`, and creates two agents acting on the same workspace. That can duplicate tool execution, spend multiple premium requests, corrupt the conversation, and produce conflicting answers. The historical 10-second kill-the-tree failures make “interrupt probably worked” insufficient evidence.

The cheapest instrumentation is an append-only invocation-overlap timeline keyed by session, lease epoch, PID, and stream sequence. Emit an immediate invariant violation if:

```text
new_attempt_started
AND prior_attempt_not_confirmed_quiescent
```

Also record any event or `dabbler session next` call from an old attempt after a new lease epoch begins. Within two sessions, either the overlap count remains zero or the exact adapter transition causing false recovery becomes visible. Enforce single-writer lease fencing at the framework boundary even while investigating; stale attempts must not advance lifecycle state.

## RECOMMENDATION

Adopt the conversation-first guardian with instruction leases, separate liveness and progress clocks, free-observable classification, deterministic turn-end continuation where adapters support it, and the proven `--continue` path as a bounded fallback. `START` grants a recorded paid-action budget; WATCH exposes facts; INTERACT is reserved for genuine questions, permissions, auth, budget, or side-effect decisions; CANCEL remains explicit. Do not ask for ETAs, do not use generic self-diagnosis, and do not recover concurrently unless the prior attempt is confirmed quiescent.

## TOP RISKS

- **Duplicate active agents:** Mitigate with lease epochs, confirmed-quiescence requirements, stale-answer rejection, and overlap alarms.
- **Adapter blindness or inconsistent CLI controls:** Mitigate with a capability test at `START`, engine-specific tiers, and explicit watcher-only degradation rather than pretending liveness is guaranteed.
- **Unexpected premium-seat spend:** Mitigate with separate continuation/probe/recovery budgets, append-only cost records, no recursive probes, and human escalation only when increasing the spend ceiling is an actual decision.