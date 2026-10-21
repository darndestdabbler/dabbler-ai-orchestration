# UAT: the stale configuration walk

Session 190 replayed the incident that stopped session 2 of
`test-dabbler-orchestration-terminals` on 3.3.6: a step wrote the `dotnet`
suite into `dabbler.yaml`, and the long-lived `session run --mailbox` loop,
which had read the configuration once when it started, asked the run of
record for a suite *"no suite is declared"* while the file on disk declared
it. The walk ran twice on the shipped artifact: once with the installed 3.3.6
bundle, to prove the walk reproduces the incident, and once with the bundle
this tree builds, to prove the fix.

## The summary

| run | bundle | loop pid | stopped on / closed with |
| --- | --- | --- | --- |
| control | installed 3.3.6 | 41320 | **fix-run-of-record** at 09:39:34, seq 6, with `dabbler.yaml` declaring `dotnet` on disk -- the incident, reproduced |
| fixed, attempt 1 | built 3.3.6 + session 190 | 31812 | verification unavailable: the one reviewer, `gpt-5.6-sol`, failed its dispatch and was excluded; no verdict, the loop exited. A vendor-side failure before the run of record, unrelated to the fix -- discarded and rerun from a fresh clone |
| fixed, attempt 2 | built 3.3.6 + session 190 | 22848 | **closed**: VERIFIED round 1, run of record ran `dotnet` final-full and passed, landed `4478c9f`, closed `90c7f4a`; no fix-run-of-record |

Both runs report `dabbler-ai-router 3.3.6`, because the version moves in this
session's release step, after the walk. They are told apart by content:

```
c22c737fb71e9e2efcaf5f88e3bfeca1d98f06f1b2db8544aef0a5dd0a6de33a  installed 3.3.6 extension dist/dabbler.cjs
a7d0e32b2a895f689fe5ab686216f4ce10d9a5c8af7a739e785ee542af116d2f  tools/dabbler-ai-orchestration/dist/dabbler.cjs, built by this session
```

The built bundle is `tools/dabbler-ai-orchestration/dist/dabbler.cjs`, the file
the VSIX ships, built with `npm run build -w dabbler-ai-router` and the
extension's `compile`. It carries the `configuration-malformed` event the fix
added; the installed 3.3.6 bundle does not.

## The setup, the same for every run

Each run is its own clone of `D:\Projects\test-dabbler-orchestration-terminals`
at `2e21359` ("Reset to the close of session 1") under `C:\temp\s190-walk`,
with a bare origin of its own so the land pushed nowhere real:

```
git clone --bare D:\Projects\test-dabbler-orchestration-terminals <run>-origin.git
git -C <run>-origin.git update-ref refs/heads/master 2e21359
git clone <run>-origin.git <run>
```

The AI answering was this session's own, through `session wait`, with the work
the operator's session 2 produced: the plan it was accepted with (four steps,
`challenge-plan`, `number-sessions`, `create-project`,
`declare-suite-and-pack`, its release held) and the files each of those steps
wrote. The last step is the one that matters -- it writes the `dotnet` suite
and `packaging.pack` into `dabbler.yaml` while the loop is running. Reviewers
were this machine's real ones.

```
node <bundle> session start --sessions-dir docs/sessions --engine claude-code --provider anthropic
node <bundle> session run --mailbox --sessions-dir docs/sessions      (one background process)
node <bundle> session wait --sessions-dir docs/sessions               (per instruction)
node <bundle> session report --sessions-dir docs/sessions --seq <n> ...
```

## The control, on 3.3.6

The loop started at 09:37:55 with pid 41320. All four steps were accepted by
09:38:55, `declare-suite-and-pack`'s own `dotnet test HelloWorld.slnx` check
among them. Verification passed in round 1 (`gpt-5.6-sol`, openai) at 09:39:34,
and in the same second the loop said:

```
dabbler [09:39:34] phase phase=run-of-record
dabbler [09:39:34] run-of-record-undeclared reason=no suite is declared, and this repository builds dotnet code: declare one in dabbler.yaml under testing.suites, or nothing measures the work
dabbler [09:39:34] instruction-issued seq=6 kind=step step=fix-run-of-record
```

The clone's `dabbler.yaml` held `- name: dotnet` under `testing.suites` at that
moment. The walk stopped there, as planned: the loop was ended by hand, nothing
had landed, and the bare origin still stood at `2e21359`. The incident is
reproduced, so the walk can say something about the fix.

## The fix, on the built bundle

**Attempt 1** (pid 31812) accepted the same four steps and then met a failure
that has nothing to do with configuration: the verification job exited 7,
*"VERIFICATION UNAVAILABLE -- ... you chose 'gpt-5.6-sol' for the 'reviewer'
role, and this call cannot dispatch to it ... this call excludes its provider
(['anthropic', 'openai'])"*. The first dispatch to openai failed, the round
excluded that provider and retried, and nothing was left to retry with. The
control's round had reached the same reviewer forty seconds earlier. The loop
stopped in `verify` and exited, which is not one loop from start to close, so
the attempt does not count either way; it was discarded and the walk rerun
from a fresh clone.

**Attempt 2** (pid 22848) is the acceptance run. The loop started at 09:42:23;
`loop.json` read pid 22848 at 13:42:23Z and again at 13:42:39Z, mid-work. The
loop removes `loop.json` when it exits, so the reading at the close is the
process itself: one background process, launched once, whose log runs
unbroken from the plan to `session-complete` and which exited 0.

```
dabbler [09:42:45] report-accepted seq=5 step=declare-suite-and-pack files=[]
dabbler [09:42:45] phase phase=verify
dabbler [09:43:26] verification-passed
dabbler [09:43:26] phase phase=run-of-record
dabbler [09:43:26] run-of-record suite=dotnet stage=final-full why=dotnet declares no select command=dotnet test HelloWorld.slnx
dabbler [09:43:28] job-finished name=run of record: dotnet exit=0
dabbler [09:43:30] landed commit=4478c9f
dabbler [09:43:30] publish-skipped reason=held by its declaration
dabbler [09:43:33] job-finished name=close exit=0
dabbler [09:43:33] instruction-issued seq=6 kind=done
dabbler: session 002 complete after 0 engine invocation(s).
```

What the acceptance asked for, each read off the clone:

- **One loop process**: pid 22848 from start to exit, exit code 0.
- **No fix-run-of-record**: the loop log and every file under the run's
  driver directory hold zero occurrences.
- **A passed final-full row for dotnet** in the clone's test-runs record:
  `suite dotnet, command dotnet test HelloWorld.slnx, outcome passed, stage
  final-full, sessionNumber 2`, recorded 09:43:28.
- **The session closed**: `sessions.json` has session 2 `complete`, verdict
  VERIFIED, completed 09:43:31; the bare origin's master is `90c7f4a` ("Close
  session 2 of sessions") over `4478c9f` ("Session 2: Challenge the plan, then
  break it into numbered sessions").

The fix is in `packages/router/src/drive.ts`: the driver reads the
configuration through `config()` where it acts on it, rather than once when
the process starts.
