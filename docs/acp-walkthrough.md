# The engine interface, run against a real agent

What `dabbler agent` measured against the GitHub Copilot CLI **1.0.83** in
`--acp` mode on 2026-09-05, from a scratch directory outside this
repository, on the seat's `gpt-5-mini` (billed 0x). Everything quoted below
is what the seat answered, taken from the JSON lines the verb printed; the
constraints the client relies on are restated in the header of
`packages/router/src/acp.ts`. Nothing in the lifecycle calls any of this
yet.

The interface is four verbs: **open** a conversation (fresh, or resumed by
its id), **send** a message, **receive** structured events, **cancel**.
The five things the plan said the client had to prove are the five
sections.

## 1. The handshake

`initialize` was sent with `protocolVersion: 1` and client capabilities
that offer nothing: `fs: {readTextFile: false, writeTextFile: false}`,
`terminal: false`. The agent does its own IO, which is what an unattended
client can stand behind. The seat answered, verbatim:

```json
{"protocolVersion":1,
 "agentCapabilities":{"loadSession":true,
   "mcpCapabilities":{"http":true,"sse":true},
   "promptCapabilities":{"image":true,"audio":false,"embeddedContext":true},
   "sessionCapabilities":{"close":{},"list":{}}},
 "agentInfo":{"name":"Copilot","title":"Copilot","version":"1.0.83"},
 "authMethods":[{"id":"copilot-login","name":"Log in with Copilot CLI",
   "description":"Run `copilot login` in the terminal",
   "_meta":{"terminal-auth":{"command":"…\\copilot.EXE","args":["login"],"label":"Copilot Login"}}}]}
```

`loadSession: true` is the capability session 60 paid for on the seat: a
conversation can be continued by its id. `sessionCapabilities.list` and
`.close` are the seat's extensions; `list` was probed once and returned
every stored session with its `cwd`, `title` and `updatedAt`, which is
how a client could find a conversation it lost the id of. The client does
not use it: resuming by anything but a named id is the hazard the
interface exists to remove.

**`session/new` answers more than an id.** With `--model gpt-5-mini` on
the argv the seat opened the session on that model, and the reply
carried `models.availableModels` — every model the seat can dispatch with
a `_meta.copilotUsage` multiplier — plus `modes` (agent, plan, autopilot)
and `configOptions` (mode, model, reasoning effort, and an `allow_all`
permissions switch). The multipliers as the seat stated them:

| Model | copilotUsage | Model | copilotUsage |
|---|---|---|---|
| gpt-5-mini | 0x | claude-sonnet-5 | 1x |
| gpt-5.4-mini | 0.33x | claude-haiku-4.5 | 0.33x |
| gpt-5.4 | 1x | claude-opus-4.7 | 7.5x |
| gpt-5.3-codex | 1x | claude-opus-4.8 | 15x |
| gpt-5.5 | 7.5x | claude-opus-4.8-fast | 30x |
| gpt-5.6-luna / terra / sol | 1x | claude-opus-5 | 15x |
| gpt-6-astra | 1x | claude-fable-5 / 5.1 | 15x |
| gemini-3.5 / 3.6 / 3.7 / 3.8-flash | 14x | grok-4.5 / 4.6 | 1x |
| mai-code-1.1-flash, mai-code-1-flash-picker | 1x | kimi-k3, kimi-k2.7-code | 1x |

That is the price list `copilot-catalog.lock` earns today by making a
billed call per model (`dabbler copilot refresh --all` costs 39 premium
requests). The seat's metadata and the catalog do not agree everywhere —
the catalog's probe measured `gpt-5.4` at 0 and `claude-fable-5` at 1
where the seat says 1x and 15x — so this is a finding to weigh, not a
value to copy: one is what the seat claims, the other is what a call cost.
Nothing here acts on it.

## 2. A tool call arrives as events, not as screen paint

Prompt: *Create a file named hello.txt in the current directory containing
the single word hi, then reply with the word done.* Policy `allow`.

The turn's events, in order, as the verb printed their kinds:

```
other   available_commands_update      (the seat's slash commands; housekeeping)
other   session_info_update            (the session titled after the prompt)
other   config_option_update
usage   usage_update  used=14585 size=272000
tool    apply_patch  kind=edit  status=pending
permission  "Create file"  decision=allow      <- the client answered, see §5
tool-update  status=completed  diff …\walk-a\hello.txt
usage   usage_update  used=14720
text    "done"
turn    stopReason=end_turn  cancelled=false
        usage={inputTokens:27423,outputTokens:48,thoughtTokens:12,cachedReadTokens:20992}
```

The `tool_call` record, verbatim:

```json
{"sessionUpdate":"tool_call","toolCallId":"custom_call_1cgJ60J8esYtUB7LDQNcx2mW",
 "title":"apply_patch","kind":"edit","status":"pending",
 "rawInput":"*** Begin Patch\n*** Add File: hello.txt\n+hi\n*** End Patch\n"}
```

and its completion carried the diff as a content block —
`{"type":"diff","path":"…\\hello.txt","oldText":"","newText":"hi\n"}` —
beside a `rawOutput` saying `Added 1 file(s)`. `hello.txt` held `hi` on
disk before the completion event arrived. Nothing had to be parsed out of
a terminal: no spinner, no colour, no prompt echo. The 84% of bytes the
terminal capture trial measured as spinner do not exist on this channel.

A thinking model streams `agent_thought_chunk` updates before the tool
call (one earlier run on the same prompt produced 70 of them, one word
each); the verb prints them as `thought` events and the record keeps
them.

## 3. Resumed by id

The conversation `9140a69f-4c39-485b-8f41-70a34842a986` was created by
an earlier probe, given two prompts (create `hello.txt`; append `there`),
and closed with `session/close`. Opening the verb with `--resume` that id
sent `session/load` and nothing else:

```
text (user)   "Create a file named hello.txt … reply with the word done."   replayed
tool          apply_patch  edit                                             replayed
tool-update   completed  diff …\hello.txt                                   replayed
text (agent)  "done"                                                        replayed
text (user)   "Append the word there on a new line to hello.txt …"          replayed
tool          apply_patch  edit                                             replayed
tool-update   completed  diff …\hello.txt                                   replayed
text (agent)  "hi\nthere"                                                   replayed
```

Both turns came back as `session/update` notifications **before** the
load's own response, so the reply is what tells the client the history
has ended; the client hands them back as `history`, marked `replayed`,
and not as the new turn's events. The prompt that followed — *What is in
hello.txt? Reply with its contents only* — was answered `hi\nthere` after
a `read` tool call on the file, which is the context carrying: the agent
knew which file. A conversation that had been closed was loadable; close
is not delete.

## 4. Cancelled mid-turn

Prompt: *Write an essay of at least 1500 words about the history of the
semicolon, streamed as you go.* `--cancel-after 4`.

Four seconds in, 84 `agent_message_chunk` events (72 words) had arrived
and the client sent the `session/cancel` notification. The pending
`session/prompt` request was answered at once:

```json
{"stopReason":"end_turn"}
```

— no `usage`, and `end_turn` where the protocol names `cancelled` for
this case. The client therefore reports `cancelled: true` from its own
knowledge (it sent the cancel) rather than from the agent's word, and
the verb's final line was `stopReason=end_turn cancelled=true usage=null`.
The process was then closed cleanly with `session/close` and exited 0.

## 5. When the agent asks permission

The policy is stated when the connection opens and is the whole of the
answer; nobody is asked. Two runs of the §2 prompt, one per policy.

**`allow`.** The seat sent `session/request_permission` with the tool
call (`title: "Create file", kind: "edit"`, the `rawInput` carrying the
file name and a unified diff) and three options, verbatim:

```json
[{"optionId":"allow_once","kind":"allow_once","name":"Allow once"},
 {"optionId":"allow_always","kind":"allow_always","name":"Always allow"},
 {"optionId":"reject_once","kind":"reject_once","name":"Deny"}]
```

The client answered `{"outcome":{"outcome":"selected","optionId":"allow_once"}}`.
It never answers `allow_always`: the decision is the framework's per
request and is not handed to the agent's memory. The tool ran (§2).

**`deny`.** The same request, answered `reject_once`. The seat then sent

```json
{"sessionUpdate":"tool_call_update","toolCallId":"custom_call_UznDces2ouSOOTX93N1a4HSr",
 "status":"failed","rawOutput":{"message":"The user rejected this tool call.","code":"rejected"}}
```

and ended the turn (`stopReason: end_turn`, 43 output tokens) **with no
text at all** — `gpt-5-mini` did not explain, apologise or retry. The
directory stayed empty. A caller reading only the agent's text would see
nothing; the `tool-update` event with `status: failed` is where the fact
is.

**A read does not ask.** In §3 the `read` tool (`Viewing …\hello.txt`)
ran to completion under `deny` with no permission request: the seat asks
for edits and not for reads. What "permission" gates is the seat's
decision, and the policy only answers what it is asked.

**After a cancel.** A permission request that arrives after the client
has cancelled the turn is answered `{"outcome":{"outcome":"cancelled"}}`,
the protocol's own word. The seat did not produce that ordering in these
runs (its cancel was answered immediately); the case is held by the
scripted-peer test, not by this walkthrough.

## What was not measured

- **Claude Code over stream-json.** The second implementation of the
  interface was exercised only against the scripted peer in
  `acp.test.ts`. Its argv is the one `engines.ts` measured on Claude Code
  2.1 for the driver; the permission channel it uses under `deny`
  (`--permission-prompt-tool stdio`, a `can_use_tool` control request
  answered with a `control_response`) is written from the SDK's protocol
  and has not been run against the CLI.
- **`session/list`** beyond one probe call, **modes** and
  **`session/set_config_option`** (the seat offers an `allow_all`
  switch there, which would make the permission request never arrive;
  the client answers requests instead, so that the record shows each
  decision).
- **Embedded context** (`promptCapabilities.embeddedContext`): every
  prompt here was one text block.
- **A seat model other than `gpt-5-mini`**, and therefore whether a
  premium model's turn is billed per `session/prompt` as `-p` runs are.
  The `usage_update` events carry context size, not spend.
- **Codex**, out of scope by the operator's ruling.

## How to run it again

```
dabbler agent prompt "<text>" --model gpt-5-mini --cwd <scratch dir> --permissions allow
dabbler agent prompt "<text>" --resume <session id> --cwd <the same dir>
dabbler agent prompt "<text>" --cancel-after 4
```

One JSON line per event on stdout, the turn last; the conversation id is
on the turn line and on stderr. From a checkout without the extension's
shim: `node packages/router/src/cli/dabbler.ts agent …`.
