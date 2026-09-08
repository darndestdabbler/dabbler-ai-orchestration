# The Copilot seat's `view` tool, measured

What the Copilot CLI transport (`packages/router/src/transports/copilot.ts`)
is handed when the verifier reads a file, measured against GitHub Copilot
CLI **1.0.83** on 2026-09-06 with **one** call on the seat's `gpt-5-mini`
(billed 0 premium requests, `usage.premiumRequests: 0`). This is the sibling
of `docs/acp-walkthrough.md`: that one measures the seat over the Agent
Client Protocol, this one measures it over the transport a verification
round actually uses, `copilot -p ... --output-format json`.

## Why it was measured

The operator's test repository (`csv-model`) ran five sessions on router
2.0.1 the same day, every one verified over this transport by `gpt-5.4`,
and the agency record of every round graded every real read `unverified:
the tool returned no line-numbered content` -- 30 reads across five
sessions, none verbatim. One read was graded `transformed`, with the detail
`line 1 was shown as 'Register. The plan step declares this session
releasable.'`: the file was the session plan, whose first line is `1.
Register. ...`, and the grader's `^\s*(\d+)\.` regex had read the markdown
list's own numbering as the tool's line numbers. The framing the grader
expected -- `N. text` lines in the tool result -- is evidently not what the
CLI returns any more, and nothing on the record said what it does return.

## The call

From a scratch script, with exactly the argv the transport builds
(`buildArgv`), in this repository's root, asking the model to view
`README.md` and reply with its first line:

```
copilot -p "<prompt>" --model gpt-5-mini --allow-all-tools
        --available-tools view,grep,glob --no-custom-instructions
        --output-format json --no-auto-update
```

with `COPILOT_AUTO_UPDATE=false` in the environment. It exited 0 after
8.6 s (`sessionDurationMs: 8620`, `totalApiDurationMs: 7130`) and printed
72,281 bytes of JSON lines. The model made one tool call and answered
`# dabbler-ai-router`, which is the file's first line.

## What the `view` tool returns

`tool.execution_start`, verbatim:

```json
{"toolCallId":"call_6NvDn5HFgQENcw1FBTJjVLso","toolName":"view",
 "arguments":{"path":"D:\\Projects\\dabbler-ai-orchestration\\README.md"},
 "turnId":"0","model":"gpt-5-mini"}
```

`tool.execution_complete` carries `toolCallId, model, interactionId,
turnId, rte, success, result, toolTelemetry`; `success: true`; and
`result` has exactly two members:

- **`content`** (12,396 characters): the file's text, byte for byte,
  CRLF line endings preserved, **with no line numbers**. It begins
  `# dabbler-ai-router\r\n\r\nA framework for AI-led coding sessions.`
- **`detailedContent`** (12,664 characters): a **unified diff of the file
  against itself**, every line a context line. Its head, verbatim:

  ```
  
  diff --git a/D:/Projects/dabbler-ai-orchestration/README.md b/D:/Projects/dabbler-ai-orchestration/README.md
  index 0000000..0000000 100644
  --- a/D:/Projects/dabbler-ai-orchestration/README.md
  +++ b/D:/Projects/dabbler-ai-orchestration/README.md
  @@ -1,260 +1,260 @@
   # dabbler-ai-router
   
   A framework for AI-led coding sessions. Work is numbered directly in the
  ```

  It has 267 lines: a blank first line, four header lines, one hunk
  header, 260 context lines (one per file line, a leading space each, a
  blank file line shown as a lone space) and a trailing newline. No `+` or
  `-` lines. The diff's line endings are LF; `content`'s are the file's.

So the tool frames the file with line numbers after all -- in the hunk
header of `detailedContent`, not as `N.` prefixes in `content`. The
transport used to keep `content` and drop `detailedContent` on the grounds
that the former is what the model saw; it was, and it is also the copy
with nothing to compare line for line.

## What changed because of it

- The transport keeps `detailedContent` on each recorded tool call beside
  `content`.
- `readFidelity` numbers the shown lines from the hunk headers: every
  context or added line of a hunk is the file line the header's new-file
  start counts up to, a removed line belongs to the old numbering and is
  skipped. A ranged read (`@@ -10,5 +10,5 @@`) numbers from 10. The `N.`
  regex is gone, and a markdown list is text again.
- A result with no hunk at all is graded `unverified` with the detail
  `the view tool returns no line numbers on this transport`, and the
  round's agency row says `fidelity_measurable: false` once, instead of
  one such reason per file: the transport is the fact, not the file.
- A read of the transport's own handoff payload (`dabbler-copilot-handoff-
  <16 hex>.txt` in the temp directory, which the bootstrap prompt tells the
  model to read first) is recorded as kind `handoff` -- in scope, no
  fidelity, not counted as a read -- and the bootstrap now says to read it
  once and not again after the footer. In csv-model's session 3, nine of
  the round's 22 tool calls were reads of that file.

## Not measured

One call, one model, one file. Whether a ranged `view` (a start and end
line) produces a hunk header starting at the range, and whether the
credential scrubber rewrites `detailedContent` the same way it rewrites
`content`, are inferred from the shape and not observed. The `grep` and
`glob` tools' result shapes were not exercised; the agency record does not
grade them.
