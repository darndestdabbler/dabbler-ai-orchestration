# Consult round 16 — how the framework and the AI talk to each other

## What the framework is

Dabbler drives AI coding sessions. A developer works in an engine CLI (Claude
Code CLI or GitHub Copilot CLI) inside a VS Code terminal. The framework is a
local Node program (`dabbler`) that owns a session's lifecycle: registration,
the work plan, each step's checks, cross-provider verification rounds, the
full test run, the commit, the push, the release and the close.

Today the AI drives the framework with a PULL: it calls `dabbler session next`,
which returns one instruction as JSON — `step` (work to do), `rejection`,
`wait` (call `next` again after N seconds) or `done` — and the AI answers each
step with `dabbler session report`. Nothing runs between calls unless the AI
calls again, so the AI polls through every long framework job (a review round
takes 20 s–2 min; the full suite 30 s–3 min). In one earlier unattended run a
lost completion notice left the loop idle for three hours.

## The operator's principles (fixed)

1. Every deterministic, rule-governed operation is done by the framework —
   including sequencing the work. Neither a person nor the AI does anything a
   rule could do. Calling `next` after a `wait` is such an operation.
2. The AI does the non-deterministic work: code, tests, configuration, plans,
   work plans, remediation, critical evaluation, adjudication, troubleshooting
   (including workarounds for deterministic operations the framework does not
   handle yet), dialog with the operator, interpreting documents.
3. The operator (a) sees what the framework and the AI are doing, can interrupt
   and course-correct within a session through the AI chat, and can override
   any rule or skip any framework process at any time, fully documented; and
   (b) has final authority on the solution plan, architecture, significant
   design decisions and acceptance.

The operator's picture: the operator hands the keys to the AI; the AI hands
them to the framework; the AI tells the framework where the special stops are
(the work plan); the framework drives to each stop; the AI advises the operator
of anything needing a person; the operator can tell the AI to take the keys back
for a leg, and can cancel the whole drive. The AI chat must stay available to
the operator at all times.

## The design the POC tested: messaging

Both sides wait on each other through mailboxes; neither polls.

- The framework posts a message ("do X", with an ETA request) to the AI's inbox
  (a folder of JSON files) and waits on its own inbox.
- The AI keeps a **background** waiter process (`node wait-inbox.mjs`: blocks
  on the inbox, prints the next message, exits) and ends its turn, so the chat
  is free. The engine CLI's own background-task machinery wakes the AI when the
  waiter exits. The AI does the work, posts a reply file, re-arms the waiter.
- The framework never types into the chat. Operator messages in the chat are
  therefore the operator's by construction, and both engines' own logs mark
  them as human (Claude Code: `queued_command` with `origin.kind: "human"`;
  Copilot: `user.message`).

The POC ran this against both real CLIs in VS Code's terminal, with Playwright
typing as the operator and a stand-in framework posting tasks; evidence was
read from each engine's own session log.

## Measured results (Claude Code CLI 2.1.271, Copilot CLI 1.0.83, Windows 11)

| test | Claude Code CLI | Copilot CLI |
| --- | --- | --- |
| wakes from idle with nobody typing | 14/14 messages across runs | 14/14 (one earlier run excluded: its opening prompt was dropped, so no waiter existed) |
| waiter fired after a message was posted | 0.1–0.4 s | 0.0–0.5 s |
| AI reply after the message landed | 7–18 s (typically ~8) | 5.5–12.8 s |
| operator question while the waiter is armed | answered 2.2–2.7 s, waiter kept | answered 1.6–3.9 s, waiter kept |
| operator question typed mid-turn | absorbed into the running turn, answered 2.7–4.1 s | answered 2.5–2.8 s, task still correct |
| waiter process killed | failure notice at once; re-armed 7.3 s later, no nudge | notice in 0.1 s; re-armed 5.3 s later, no nudge |
| 16-minute idle wait | waiter survived 974 s; 0 AI actions while idle | survived 965 s; 0 actions, 0 model calls while idle |
| first model call after the 16-minute wait | no cache miss (1-hour prompt cache): 45,305 cached tokens read, 378 written | **cache miss: 8.65 AI credits vs ~0.8 per normal call** |
| cost | subscription | ~6.5 AI credits per message handled (~4 model calls each: read output, write, post, re-arm) |

Launch pitfalls found: Copilot silently drops a prompt given with `-i` in this
terminal (the first message must be typed into the chat); Claude Code's folder
trust prompt defaults to "No, exit"; Copilot draws on the terminal's alternate
screen, so the framework cannot read its screen text.

### Copilot cache lifetime and keep-alive (to be filled when measured)

What the cache miss was, from Copilot's per-call usage in the 16-minute run:

| call | context tokens | read from cache | written to cache | AI credits |
| --- | --- | --- | --- | --- |
| last call before the wait | 17,120 | 16,896 | 0 | 0.77 |
| first call after the wait | 17,124 | 0 | 17,121 | 8.65 |
| every other call | 17.3–18k | nearly all | ~50–130 | 0.75–0.85 |

- The cache is the **chat conversation's** prompt cache; the background waiter
  is a plain process that calls no model and costs nothing.
- A miss costs ~0.5 credits per thousand tokens of conversation; a cached call
  ~a tenth of that. The POC's conversation was 17k tokens; a real session
  carrying a plan, code and tool output is larger (ASSUMPTION: 100k+), so a miss
  late in a session costs proportionally more.
- A keep-alive call reads the same growing conversation, so its cost grows too:
  the miss-to-keep-alive ratio stays ~11:1 whatever the size.

**The cache has no fixed lifetime.** First call after each idle wait (conversation ~17k tokens):

| idle before the wake | read from cache | credits |
| --- | --- | --- |
| session start (cold) | 0 of 16,662 | 8.47 |
| 4.3 min | 16,756 of 16,826 | 0.79 (hit) |
| 7.8 min | 3,584 of 17,227 | 5.66 (partial miss) |
| 11.75 min | 17,408 of 17,659 | 0.86 (hit) |
| 16 min | 0 of 17,124 | 8.65 (full miss) |

A longer wait hit where a shorter one missed, and a miss can be partial (the
cache is held in 512-token blocks). A keep-alive can lower the chance of a miss,
not prevent it. Every session's first call is a full-price write regardless.

**Keep-alive, measured.** The same 16-minute wait with the waiter timing out
every 240 s: all four keep-alive wakes hit the cache, but each took 3 model
calls (read the output, re-arm, end the turn), ~2.7 credits at ~17k tokens. The
run cost **22.20 AI credits, against 19.73 without keep-alives** — the
keep-alives cost more than the miss they prevented. With K = 3·S·r the
break-even is T < τ·w/(3r) ≈ 15 minutes, and 16 minutes is just past it.

The operator's current direction: hold keep-alives until a real session shows
misses costing enough to matter; if ever built, a fixed rule set by the
framework through the waiter's timeout (Copilot only, τ = 4 min, only for
expected waits of 4–15 min), not a fitted decay model.

## Questions

Answer each in this shape:

- **Recommendation:** one sentence.
- **Design:** the concrete mechanism, in a few sentences.
- **The one risk:** the single most likely way it fails in practice.
- **Mitigation:** how to prevent or detect that failure.

1. **What replaces the pull.** Should the framework adopt this messaging design
   in place of `session next`/`wait`/`report`, and what exactly does the
   framework own (the drive loop, the sequencing, the inbox, the ETA watchdog)
   versus the AI (the work, the replies, re-arming)? Where does the framework's
   drive loop run — a long-lived process the extension starts, or something
   else — given that it must survive while the AI is idle?
2. **The backup for a lost wake-up.** Both engines woke on every test, and a
   killed waiter wakes the AI by itself, but a completion notice was once lost
   in production. What should the backstop be: a framework-side watchdog that
   types a nudge into the CLI's terminal when a message sits unread past the
   AI's ETA plus 25%; a second background agent that long-polls; or something
   else? The operator asked whether a long-polling background agent is worth
   a few cents a run.
3. **Copilot's cache miss.** Copilot's prompt cache can expire during a wait.
   The operator and I have drafted a cost model; critique it and say whether
   the framework should run it:
   - S = conversation tokens (logged on every call); h(t) = fraction of the
     cache still readable after t idle (measured from every wake: idle time,
     tokens read, tokens re-written); r = price per cached token read; w = price
     per token re-written (measured w/r ≈ 11).
   - One wake after idle t costs C(t) = S·[r·h(t) + w·(1 − h(t))].
   - A keep-alive (waiter times out every τ; the AI wakes, finds no message,
     re-arms) costs K ≈ 2·S·r while the cache holds.
   - For an expected wait T (known to the framework for its own timed jobs),
     keep-alives pay only while (T/τ)·K < C(T), i.e. T < τ·w/(2r) once the cache
     is gone — S cancels, so the decision is size-independent (size only sets
     the dollars). With w/r ≈ 11 and τ = 4 min, break-even T ≈ 22 min.
   - Policy: no keep-alive for waits shorter than the safe hold time or longer
     than ~5.5·τ; keep-alive every τ between; h(t) refitted per engine and model
     from recorded wakes. Claude's cache is documented at one hour, so there it
     is "none" under 60 minutes.
   Is the model right, what is it missing, and is it worth building now or only
   after real sessions show misses costing enough to matter?
4. **Operator overrides.** How should an operator override or skip be recorded
   so it is provably the operator's and not the AI deciding for itself, given
   that the framework never types into the chat and both engines log human
   messages as human?
5. **Where the protocol lives.** The AI needs to know the protocol (arm the
   waiter in the background, what to do on each message kind, never poll).
   Instruction file (AGENTS.md/CLAUDE.md), a tool the framework provides (an MCP
   server), or both? Which fails less often across two different CLIs?
6. **The one thing to prove next.** Before building, what single further
   measurement would most reduce the risk of this design?
