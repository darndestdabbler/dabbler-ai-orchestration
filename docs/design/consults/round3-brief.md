# Design consult, ROUND 3 (Sol only): the liveness protocol between framework and engine

You are GPT-5.6 Sol, consulted as an out-of-the-box design thinker — the
operator asked for you by name for this one. Third round on
`dabbler-ai-orchestration`; self-contained brief, no tool access, no
memory of prior rounds. Cite facts from this brief; mark anything
ungrounded as ASSUMPTION. The subject is a PROTOCOL, so bold alternatives
are welcome — but they must be buildable against the facts below.

## The system in one paragraph

A TypeScript framework (`dabbler` CLI + VS Code extension) drives AI
coding sessions. The AI engine is the person's own AI CLI (Claude Code,
Codex, Gemini, or Copilot CLI seat) running in their own terminal with
their own auth. The framework owns lifecycle state on disk and is passive:
the engine calls `dabbler session next`; one call judges the outstanding
answer, advances one move, and prints the next instruction (a step, a
rejection with reasons, a `wait` with `retry_after_seconds` while a
detached job runs, or `done`). The engine does the work and calls again.

## The problem, measured this morning

The loop lives inside the AI's attention span. When the engine's turn
ends, its context compacts, or the terminal closes, an instruction sits
outstanding and NOTHING can re-summon the engine — the framework
deliberately holds no handle to it. Four stall triggers observed/known:
(X1) the AI finishes a reply mid-lifecycle and idles — fires on
essentially every session; (X2) context compaction loses the loop; (X3)
terminal/VS Code closed or reboot; (X4) a `wait`'s callback time passes
with nobody calling. Today a human notices and types "continue". The
operator's verdict: a human as the retry mechanism is "ridiculously bad
design," and a notify-the-human-to-click-Continue proposal was REJECTED —
a confirmation always answered yes is friction, not a decision.

A watcher exists but only DETECTS: instruction-outstanding (issued,
unanswered, tree unmoved past threshold) and job-outstanding (job running,
writing nothing). It renders to a terminal panel. It restarts nothing.

## History you must respect

- A fully headless push (framework spawns and drives the engine as a
  child) was BUILT and then deliberately replaced by the pull, for: the
  person's seat economics (engine invocations bill per USER prompt — a
  framework re-prompting on its own spends the person's paid seat), the
  person's auth, visibility, and to escape child-process wrangling (a
  10-second kill-the-tree fallback fired constantly).
- A driver spike PROVED the resume mechanic: re-invoking the person's CLI
  per step with `--continue` re-enters the same conversation. So the
  framework CAN re-summon an engine cheaply in mechanism — the cost is a
  premium request per invocation on seat transports.
- An interrupt control channel on Claude Code (`control_request`) was
  measured working. Codex's JSONL streaming is unmeasured live. Engine
  CLIs emit STREAMING events while working (tool calls, output deltas), so
  "the engine is mid-work" is observable from byte flow without spending
  any prompt. OS-level signals (child process existence, CPU, I/O) are
  also free observables when the framework launched the invocation.
- House rules: the machine owns the record (every supervision act must be
  recorded); an AI's self-report is a CLAIM to verify, never a fact; AI
  time estimates are known-unreliable here (operator directive: never cut
  scope on AI timeline pessimism — the mirror rule is don't trust AI ETAs).
- DX bar (operator, on adoption): a developer's vocabulary must be
  START / WATCH-or-INTERACT / CANCEL. Nothing else. Their developers
  otherwise do no automated testing at all; if this is cumbersome they
  will just ask a bare AI instead and ship untested.

## Two designs on the table

**(B) Per-step supervisor loop** (orchestrator's proposal): a process (the
extension host, or a `dabbler session run` command) owns the loop; each
instruction is a fresh short-lived engine invocation that answers and
exits; a dead/silent invocation is retried, capped, recorded; only
cancel/abandon stays human. Deletes stalls as a class. Weakness the
operator implicitly flagged: the long-lived conversation is the feature —
the person interrupts, guides, and answers the AI's questions mid-session;
per-step invocations (even with `--continue`) make the conversation the
framework's artifact rather than the person's session.

**(C) Supervised conversation** — the operator's sketch, verbatim:

> 1. AI triggers the framework to start a new session. Why? This allows
>    the user to interact with AI to interrupt or add additional human
>    guidance or to answer questions that AI has.
> 2. The framework issues instructions to AI, including asking for a set
>    of work steps. Let's say that the framework has a timer that gets
>    reset any time an instruction is sent to AI and any time AI responds
>    intermittently. When AI doesn't respond, the framework can ask it why
>    it is waiting and give AI a set of well-defined, numbered reasons —
>    one of which might be "I don't know". Based upon the response or lack
>    of response in a fixed timeframe, the framework may have to issue a
>    cancellation command to AI and then ask AI to perform a
>    self-diagnostic with a recommended action and prompt the user for
>    assistance. For most other problems, the framework can simply say
>    something like run a diagnostic and figure out another approach if
>    this one is taking too long; otherwise, estimate how long it is going
>    to take and alert the human user that there is a long running process
>    that may take a while and let the human know that they can interact
>    with AI during this time.

## Questions

1. **Critique the sketch element by element** — keep / fix / drop, with
   reasons: (a) timer reset on instruction AND on intermittent activity;
   (b) the "why are you waiting?" probe with numbered reasons including
   "I don't know"; (c) cancellation followed by a SELF-diagnostic by the
   same possibly-broken agent; (d) AI-produced time estimates and
   long-running alerts. Be blunt where an element spends money to receive
   a hallucination.
2. **Design the liveness protocol properly.** States, timers, what resets
   them, and — critically — the observable hierarchy: free signals first
   (stream events, process existence, CPU/I-O, tree movement, job logs),
   paid probes only when free signals are ambiguous, human judgment only
   where it carries real judgment. Give the state machine and the wire
   shape of a probe and its answer. Which stall triggers (X1–X4) does
   each layer catch, and which can NO probe catch (e.g., the CLI is
   waiting on a permission prompt the human must answer — probing the AI
   is useless; only the host knows)?
3. **B vs C vs a hybrid.** Where does each win? Is there a design that
   keeps the person's living conversation AND makes the loop attention-
   free — e.g., conversation-first with per-step re-invocation as the
   fallback rung of the ladder (`--continue` re-enters the same
   conversation, which the spike proved)? Or something neither of us has
   proposed — liveness leases on instructions, heartbeats as part of the
   answer contract, the engine required to emit progress markers the
   framework parses from the stream, OS-supervised invocations? You were
   asked for out-of-the-box; provide at least one genuinely different
   alternative and judge it against B and C.
4. **The numbered wait-reason taxonomy.** Enumerate it honestly, split by
   who can actually know: AI-answerable (thinking; waiting on a long tool
   it started; waiting for the user's answer to a question it asked) vs
   host-only (permission prompt pending; rate-limited; process dead;
   context exhausted) vs unknowable-by-anyone-cheaply. "I don't know" is
   in the set by operator order — what should the framework DO with it?
5. **The cost budget.** Probes and re-invocations spend premium requests
   on seat transports; free observables don't. Give a per-session
   supervision budget shape (e.g., N probes, M re-invocations, then
   recorded human escalation) and the recording schema for every
   supervision act, consistent with "the machine owns the record."
6. **What breaks.** The strongest failure mode of YOUR recommended design,
   and the cheapest instrumentation that would reveal it within two
   sessions of real use.

Format: answers 1–6, then RECOMMENDATION (one paragraph) and TOP RISKS
(three bullets with mitigations).
