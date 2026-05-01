# Two-CLI Workflow — Operating outsource-last

Operational guide for running session sets in **outsource-last** mode,
where a long-running **verifier daemon** processes verifications
through a queue instead of via synchronous API calls. This is the
"two-CLI" pattern: the orchestrator's CLI session typing trigger
phrases, plus one or more verifier-daemon CLI sessions running in the
background.

The setup is meaningfully different from outsource-first. New
operators should read this end-to-end before running their first
outsource-last session.

Contents:

- [Section 1 — When to use outsource-last](#section-1--when-to-use-outsource-last)
- [Section 2 — Initial setup](#section-2--initial-setup)
- [Section 3 — Day-to-day operation](#section-3--day-to-day-operation)
- [Section 4 — When the verifier daemon dies](#section-4--when-the-verifier-daemon-dies)
- [Section 5 — When the orchestrator's primary CLI session resets context](#section-5--when-the-orchestrators-primary-cli-session-resets-context)
- [Section 6 — Subscription-window fatigue](#section-6--subscription-window-fatigue)
- [Section 7 — Troubleshooting common pitfalls](#section-7--troubleshooting-common-pitfalls)

---

## Section 1 — When to use outsource-last

Outsource-last is the right mode when:

- **The verifier provider is on a subscription** (Claude Pro,
  ChatGPT Plus, Gemini Advanced) and the operator wants to spread
  per-session API spend across the subscription window instead of
  paying per-call API fees. The economic argument: a daemon CLI
  session against a subscription has near-zero marginal cost per
  message until the subscription's rate or daily ceiling is hit; an
  API call always incurs per-token cost.
- **Fixed-cost operation is preferred over latency.** Outsource-last
  trades synchronous verification (seconds) for queue-mediated
  verification (often minutes — bounded by the daemon poll interval
  plus model latency). For most session work this is invisible
  because verification is the last step and the orchestrator was
  going to wait anyway.
- **The session set's `outsourceMode: last` is justified by the spec.**
  Don't pick this mode at runtime to save money on a session set whose
  spec was written for outsource-first; the workflow assumptions
  differ.

Outsource-last is the wrong mode when:

- The session set runs short (verification queue overhead dominates
  total runtime).
- No subscription is in play (you're paying API fees either way and
  outsource-first is simpler).
- Reliability matters more than cost for this specific work and a
  daemon failure mid-session would be expensive — outsource-first has
  a smaller failure surface.

The ai-router enforces `outsourceMode: last` requires a `verifierRole`
declared in the session-set spec; outsource-last without an explicit
verifier role will refuse to enqueue rather than silently falling
through to outsource-first. See
`ai-router/__init__.py:_resolve_outsource_mode` for the resolution
order.

---

## Section 2 — Initial setup

You will be running **at least two terminals**: one for the
orchestrator's CLI session, one or more for verifier daemons. On
Windows, use bash (Git Bash / Windows Terminal); the daemons themselves
are pure Python.

**1. Confirm API keys are loaded.** The bootstrap snippets in
`CLAUDE.md` / `AGENTS.md` / `GEMINI.md` cover this. If keys are
missing, the daemons will start but fail their first message and
crash on retry — fix env first.

**2. Start the verifier daemon.** In a dedicated terminal:

```bash
cd <repo root>
.venv/Scripts/python.exe -m ai_router.verifier_role \
    --provider <name> \
    --base-dir provider-queues
```

`<name>` matches the directory under `provider-queues/` (e.g.,
`openai`, `gemini`, `claude`). The daemon writes a pid file so
`role_status` and `restart_role` can find it, then polls `queue.db`
on the configured interval. Leave the terminal open.

You can run multiple verifier daemons (one per provider) in parallel
terminals if the spec routes verifications across providers. Each
daemon polls its own provider directory only.

**3. Start the orchestrator daemon (only if outsource-last work is
arriving via queue, not via human trigger phrases).** In a separate
terminal:

```bash
.venv/Scripts/python.exe -m ai_router.orchestrator_role \
    --provider <name> \
    --base-dir provider-queues
```

Most operators **don't need this**: when a human is typing trigger
phrases into the primary CLI, that CLI *is* the orchestrator and the
daemon is unnecessary. Start the orchestrator daemon when sessions
are being enqueued by another orchestrator (cross-set hand-off) or
by automation, so an idle CLI isn't required to drain the queue.

**4. Confirm daemons are healthy.** From the same machine:

```bash
.venv/Scripts/python.exe -m ai_router.role_status
```

Expected output: one row per running daemon with `health: alive`,
recent `last_heartbeat`, and a `worker_id` matching the pid file.

**5. Configure the session set.** The spec must declare
`outsourceMode: last` and `verifierRole: <name>` in the Session Set
Configuration block. If `verifierRole` is missing, ai-router refuses
to enqueue. See an example outsource-last session set spec for the
exact yaml.

---

## Section 3 — Day-to-day operation

Once the daemons are running, the operator's flow is unchanged from
outsource-first:

1. Type the trigger phrase into the orchestrator's CLI session
   (`Start the next session of <slug>`).
2. The orchestrator works through the session plan as normal.
3. At Step 6, instead of calling a synchronous `verify()`, the
   orchestrator enqueues a verification message to the verifier
   provider's `queue.db`.
4. The verifier daemon (running in another terminal) claims the
   message, runs the verification, writes the result back to the
   queue, and emits a heartbeat.
5. The orchestrator's close-out script (`close_session`) waits on
   the queue's terminal state for that message before proceeding.
6. Close-out completes; session is marked complete; notification
   fires.

The operator typically sees nothing in the verifier terminal except
periodic heartbeat lines and an occasional "claimed message
<id>" / "completed message <id>" log pair. **Do not type into the
verifier terminal.** Daemons treat unexpected stdin as a no-op but
some subscription CLIs (notably Claude Code) interpret stray
keystrokes as session input — it can break things even when it
shouldn't.

The Session Set Explorer VS Code extension (Set 5) renders mode
badges (`[FIRST]` / `[LAST]`) on session-set rows and shows the
Provider Queues and Provider Heartbeats trees. For outsource-last
sessions, watch the Heartbeats view: a worker that goes silent for
more than the configured threshold (default 30 minutes) is a strong
signal something has stalled.

---

## Section 4 — When the verifier daemon dies

Daemons die. The common causes, in roughly the order they happen
in practice:

- **Subscription auth expired** — the daemon's CLI lost its session
  token. The daemon's first failed verification will surface this
  in stderr. Re-authenticate the underlying CLI (sign in to the
  subscription again) and restart the daemon.
- **Hard kill or terminal close** — the operator closed the terminal
  the daemon was running in, or the OS killed the process. The pid
  file is left behind; `is_pid_alive` will detect it as stale on
  the next `role_status` query.
- **Provider rate limit / outage** — repeated 5xx or rate-limit
  errors. The daemon retries with backoff; persistent failures
  surface in heartbeat data as long claim times or low completion
  counts.
- **Lease expiration with no recovery** — a claimed message whose
  worker died will have its lease reaped automatically and become
  re-claimable on the next poll.

To restart a verifier:

```bash
.venv/Scripts/python.exe -m ai_router.restart_role \
    --role verifier --provider <name> --start
```

`restart_role` reads the pid file, sends a graceful shutdown signal,
waits up to `--shutdown-timeout` seconds for clean exit, then
optionally spawns a replacement (`--start`). Without `--start` the
operator is responsible for spawning manually — the default fits
supervisor-managed deployments. With `--start`, the replacement
inherits the original daemon's `--poll-interval`, `--lease-seconds`,
and `--heartbeat-interval` unless overridden on the restart command.

Recovery is automatic from the queue's perspective: any in-flight
verification claimed by the dead worker will become re-claimable
when the lease expires. The orchestrator's close-out
`--timeout` is set generously enough (60 minutes default) to absorb
one daemon restart cycle without timing out the session.

---

## Section 5 — When the orchestrator's primary CLI session resets context

Long-running CLI subscriptions (especially Claude Code on a
multi-hour session set) will eventually compress, summarize, or
outright reset context. The orchestrator loses its in-memory state
of where the session is. The recovery pattern:

1. **Don't panic.** All durable session state lives on disk:
   `session-state.json`, `disposition.json`,
   `activity-log.json`, `session-events.jsonl`, the queue. The
   orchestrator's in-memory state is recoverable from these.
2. **Restart the CLI session** (or open a fresh tab in the same
   subscription). Do not start a new session set — the existing one
   is still in progress.
3. **Type the standard trigger phrase** (`Start the next session of
   <slug>`). The orchestrator reads `session-state.json`, sees
   the in-progress session, reads `activity-log.json` for prior
   step history, reads `disposition.json` if it exists, and resumes
   from wherever the previous CLI session left off.
4. **If a verification message was already enqueued and the
   verifier already wrote a result**, the orchestrator's resumed
   close-out will pick it up via the queue. No re-enqueue needed.
5. **If the previous CLI session crashed mid-step** with no
   `disposition.json` and partial activity-log entries, run
   `python -m ai_router.close_session --repair` to inspect what
   the on-disk state actually says, then decide whether to resume
   or `--repair --apply` to clean up before resuming.

The reconciler (registered as a sweeper hook at orchestrator
startup) also catches sessions stranded across a context reset.
Its first sweep on resume re-evaluates every in-progress session
and emits a diagnostic record for any that look stuck. See
`ai-router/docs/close-out.md` Section 6 for reconciler details.

---

## Section 6 — Subscription-window fatigue

Subscriptions enforce daily message ceilings, hourly burst limits,
and (for some providers) per-conversation token windows that throttle
long sessions. Heartbeat data tells the operator some of this — and
explicitly does not tell the operator other parts of it.

What the heartbeat data **does** tell you (from
`heartbeat_status` and the Provider Heartbeats VS Code view):

- Whether a daemon is alive at all (`last_heartbeat` recency).
- Approximate throughput (`completions` per heartbeat window).
- Whether a worker is silent past the configured threshold —
  the strongest signal of a subscription throttle or an
  auth-expired CLI.

What the heartbeat data **does not** tell you:

- The remaining message budget for the subscription window. The
  ai-router has no view into provider-side accounting; the operator
  sees the budget only by signing in to the provider's web UI.
- Whether silence means "throttled and will resume" vs. "auth
  expired and will not resume without intervention". Both look
  identical from the heartbeat view; `role_status` plus the
  daemon's stderr is the disambiguation.
- Cost accumulation in dollar terms. Subscriptions don't expose
  per-call cost; the dual-sourced cost report (Set 4) reports
  `subscription` for these instead of a dollar figure.

If a verifier goes silent during a session set, the operator's
inspection ladder is:

1. `role_status` — is the daemon process alive?
2. The verifier's terminal stderr — any auth errors, rate-limit
   errors, or unhandled exceptions?
3. The provider's web UI — is the subscription within its window?
4. `queue_status` — is there a stuck message claimed by a dead
   worker, or a backlog of unclaimed messages?

This ladder is what to do *before* restarting the daemon; restarting
without diagnosing throws away the signal that would have explained
why it died.

---

## Section 7 — Troubleshooting common pitfalls

**Auth expiry mid-session (subscription CLI).** The verifier daemon
will surface an auth error in stderr on the first failed claim and
will keep retrying with backoff. The daemon does not re-authenticate
on its own — the operator must sign back in to the subscription CLI.
Recovery: restart the daemon, re-run close-out (the pending
verification will be re-claimed).

**Interactive prompts in daemon CLIs.** Some subscription CLIs
prompt for confirmation on first use ("Do you want to allow this
agent to read files?"). A daemon never sees the prompt because it's
not running in an interactive shell — but if the operator started
the daemon from a terminal that *did* surface the prompt, the daemon
may be sitting blocked on stdin waiting for input. Symptom: daemon
is "alive" by pid but no heartbeat updates. Fix: kill the daemon,
clear the prompt by running the CLI interactively once, then restart
the daemon.

**Cross-platform line ending quirks.** Windows-default line endings
in `provider-queues/<name>/queue.db` adjacent files (lock files, pid
files) have caused parse errors when a Linux daemon tried to read
them after a Windows operator created them. The pid-file format is
small enough that this is rarely an issue, but if `role_status`
reports a pid file that "looks corrupted", check for stray `\r`
characters.

**Two daemons on the same provider.** Running two verifier daemons
against the same `provider-queues/<name>/` is allowed by design —
they share the queue and claim disjoint messages — but it confuses
`role_status` because two pid files share the same provider key.
The status output annotates this as `multiple workers detected`.
Intentional? Carry on. Accidental? `restart_role` only stops one
daemon at a time; kill the extra by hand.

**Orchestrator typed the trigger phrase before daemons were up.**
The first verification message lands in `queue.db` but no daemon
claims it. Symptoms: close-out times out at exit 4. Recovery:
start the daemon, re-run close-out — the message is still in the
queue and will be claimed on the next poll.

**Repair-mode confusion.** `python -m ai_router.close_session
--repair` is read-only and exits 5 if it finds drift. Operators
sometimes interpret exit 5 as a failure and add `--force`, which
is forbidden in combination with `--repair`. The correct fix is
`--repair --apply`, which actually resolves the drift. See
`ai-router/docs/close-out.md` Section 5 for the flag-combination
rules.

For close-out internals (gate checks, lock contention, idempotency,
event-log shape) see `ai-router/docs/close-out.md`. For the workflow
this mode is layered on top of, see `docs/ai-led-session-workflow.md`.
