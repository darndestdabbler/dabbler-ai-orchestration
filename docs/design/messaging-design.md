# How the framework and the AI talk to each other

**Established 2026-09-15**, by a proof of concept run against both engine CLIs
and a consult of Sol and Gemini (round 16). This is the record sessions 177–183
build from. The harness that produced every number below is in the
messaging-poc folder beside this page, and the consult files are round 16 in
the consults folder.

## The operator's principles

1. **Everything deterministic is the framework's**, including sequencing the
   work. Neither a person nor the AI does anything a rule could do. Calling
   `dabbler session next` again after a `wait` instruction is such an operation.
2. **The AI does the non-deterministic work:** code and tests, configuration,
   solution and work plans, remediation, critical evaluation, adjudication,
   troubleshooting (including workarounds for deterministic operations the
   framework does not handle yet), dialog with the operator where it has no
   clear recommendation, and interpreting what the operator supplies.
3. **The operator** (a) sees what the framework and the AI are doing, can
   interrupt and course-correct through the AI chat, and can override any rule
   or skip any framework process at any time, with every override recorded; and
   (b) has final authority on the solution plan, architecture, significant
   design decisions and acceptance.

In the operator's words: the operator hands the keys to the AI, the AI hands
them to the framework, the AI says where the stops are, the framework drives to
each stop, the AI raises anything that needs a person, the operator can tell the
AI to take the keys back for a leg, and the operator can cancel the drive.

## What was wrong with the pull

The AI drove the framework: it called `dabbler session next`, did what the
instruction said, reported, and called `next` again, including after every
`wait` while the framework ran its own review rounds, test runs and close. That
is deterministic work done by the AI, and it depends on the AI never missing a
call: in one unattended run a lost completion notice left the loop idle for
three hours.

## The design

**The framework and the AI wait on each other, and neither polls.**

- The framework posts an instruction (the existing instruction file) and waits
  for its report.
- The AI keeps a **background** waiter that blocks until there is an instruction
  with no accepted report, prints it and exits, and then ends its turn, so its
  chat stays free for the operator. The engine CLI's own background-task
  machinery wakes the AI when the waiter exits. The AI does the work, answers
  with the report command, and re-arms the waiter.
- An instruction stays pending until its report is accepted. The waiter consumes
  nothing, so a second waiter prints the same instruction, and an AI that dies
  mid-step loses nothing.
- **The framework never types into the AI's chat.** Every message in the chat is
  therefore the operator's, and both engines' own logs mark them as human.

## What the proof of concept measured

Claude Code CLI 2.1.271 and GitHub Copilot CLI 1.0.83 on Windows 11, each in a VS
Code terminal. Playwright played the operator (launching the CLI, typing
questions, killing the waiter); a stand-in framework posted tasks on a schedule;
every result was read from the engine's own session log, not the screen.

| test | Claude Code CLI | Copilot CLI |
| --- | --- | --- |
| woke from idle with nobody typing | 14 / 14 messages | 14 / 14 messages |
| waiter fired after a message was posted | 0.1–0.4 s | 0.0–0.5 s |
| reply after the message landed | 7–18 s, typically ~8 | 5.5–12.8 s |
| operator question while the waiter was armed | answered in 2.2–2.7 s, waiter kept | answered in 1.6–3.9 s, waiter kept |
| operator question typed mid-turn | absorbed into the running turn, answered in 2.7–4.1 s | answered in 2.5–2.8 s, task still correct |
| waiter process killed | failure notice at once; re-armed 7.3 s later with no nudge | notice in 0.1 s; re-armed 5.3 s later with no nudge |
| 16 minutes idle | waiter survived 974 s; 0 AI actions while idle | waiter survived 965 s; 0 actions and 0 model calls while idle |
| cost | subscription | about 6.5 AI credits per message handled (about 4 model calls each) |

One Copilot run is excluded from the counts: its opening prompt was dropped, so
no waiter existed when the first message arrived.

**A dead waiter wakes the AI by itself**, on both engines: its failure is a
completion like any other. A nudge is a safety net, not the mechanism.

### How each CLI's logs show it

| event | Claude Code | Copilot |
| --- | --- | --- |
| a background wait | a Bash `tool_use` with `run_in_background: true` in the project transcript | a `powershell` tool call with `mode: "async"` and a `shellId` in the session's events log |
| the wake-up | a `<task-notification>` queued into the conversation | a `system.notification` of kind `shell_completed` |
| a human message | a `user` entry, or a `queued_command` with `origin.kind: "human"` when typed mid-turn | a `user.message` event |
| cost per call | token counts on each assistant message | `assistant_usage_events` in its session store: input, cache read, cache write, AI credits |

## The prompt cache

**Claude Code caches the prompt for an hour.** Its first call after the
16-minute idle read 45,305 tokens from cache and wrote 378, like any other call.

**Copilot's cache is best-effort, not a fixed lifetime.** The first call after
each idle wait, with the conversation at about 17,000 tokens:

| idle before the wake | read from cache | AI credits |
| --- | --- | --- |
| session start | 0 of 16,662 | 8.47 |
| 4.3 minutes | 16,756 of 16,826 | 0.79 |
| 7.8 minutes | 3,584 of 17,227 | 5.66 |
| 11.75 minutes | 17,408 of 17,659 | 0.86 |
| 16 minutes | 0 of 17,124 | 8.65 |

- The cache belongs to the **chat conversation**; the waiter is a plain process
  that calls no model and costs nothing.
- A longer wait can hit where a shorter one missed, and a miss can be partial:
  the cache is held in 512-token blocks.
- A miss costs about 0.5 credits per thousand tokens of conversation; a cached
  call about a tenth of that. A real session's conversation is larger than the
  POC's, so a late miss costs proportionally more.

## Keep-alives: measured, and not built

A keep-alive is the waiter timing out on purpose so the AI wakes, finds nothing,
re-arms, and refreshes the cache. On Copilot, the same 16-minute wait:

- with no keep-alive: **19.73 AI credits**, including one full miss;
- with the waiter timing out every 240 s: **22.20 AI credits**. All four
  keep-alives hit the cache, but each took **three** model calls (read the
  output, re-arm, end the turn), about 2.7 credits apiece.

**The cost model.** With S the conversation's tokens, r the price of a cached
token and w the price of a re-written one (measured w/r ≈ 11), a keep-alive
costs about 3·S·r and a full miss S·w. Keep-alives every τ minutes pay only for
an expected wait T < τ·w/(3r), about 15 minutes at τ = 4. The conversation's size
cancels out of the decision and only sets the dollars; the 16-minute test sits
just past the break-even, which is what it measured.

**Why it is not built.** The saving is small and narrow — one miss avoided, only
for waits of roughly 4 to 15 minutes, only on Copilot — and Copilot's cache hits
and misses do not follow a predictable curve. Worse, any fitted model would rest
on Copilot's internal caching, which can change without notice and leave the
framework spending more on keep-alives than they save. The operator's direction:
do nothing until a real session shows misses costing enough to matter; if one
ever does, a fixed rule set by the framework through the waiter's timeout
(Copilot only, every 4 minutes, only for expected waits of 4 to 15 minutes), never
a fitted decay model.

## Launch pitfalls

- **Copilot drops a prompt given with `-i`** when launched in this terminal: the
  first message has to be typed into its chat.
- **Claude Code's folder-trust prompt defaults to "No, exit"**, and Escape
  cancels it. Copilot's defaults to "Yes"; its "remember this folder" option adds
  the folder to `trustedFolders` in its config file.
- **Copilot draws on the terminal's alternate screen**, so its screen text cannot
  be read; its events log is the only reliable view.
- A VS Code profile reused between runs restores the previous run's terminals.

## Consult round 16

Sol and Gemini answered the same brief.

**They agreed** on replacing the pull with messaging driven by a long-lived
framework process, no second long-polling AI agent as a backup, no keep-alives
or cost model now, and the protocol in the instruction files rather than an MCP
server.

**Where they split, and what was taken:**

| question | Sol | Gemini | taken |
| --- | --- | --- | --- |
| backstop for a lost wake-up | mark the message overdue and alert the operator outside the chat; never type a nudge | type a nudge into the terminal | **Sol**: a typed nudge is logged as a human message, which destroys the proof that an override came from the operator |
| durability | an instruction stays pending until acknowledged | not addressed | **Sol** |
| override provenance | the AI proposes with an ID; the operator approves in chat; the framework verifies the human-origin log entry before applying | the AI quotes the operator; audited later | **Sol**: verified when applied, not afterwards |
| staying on protocol | a handshake proving the waiter is armed before driving | a one-line reminder in every instruction | both |
| cost telemetry | keep it | none | session 181 records each round's cost anyway |
| what to prove next | a long soak of both engines | typing a nudge into Copilot | **Sol**: with no typed nudges the injection test is moot |

## What is built from this

| session | builds |
| --- | --- |
| 177 | `dabbler session wait`; the drive loop waits on reports and runs everything deterministic between them; an overdue record; a report's files taken from the diff when it names none |
| 178 | Start Session registers and starts the drive loop; the opening sentence; the overdue alert; the managed instructions and the docs teach one loop |
| 179 | the walk on both CLIs through the built VSIX |
| 180 | the two-hour soak of both engines, recorded, and the 3.3.0 release |
| 181 | each verification round records its conversation and cost |
| 182 | overrides the operator provably made |
| 183 | Gemini CLI retired as an engine; Google stays a reviewer provider |
