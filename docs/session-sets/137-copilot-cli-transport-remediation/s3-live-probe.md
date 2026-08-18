# Session 3 live probe — the seat transport, exercised

Operator seat, GitHub Copilot CLI **1.0.80**, Windows 11, unelevated
account. Every dispatch below is a real CLI invocation, not a fake
spawner. Zero premium requests were consumed (`gpt-5.5` is weight 0 on
this seat), so the probes cost nothing beyond wall-clock.

## The negative control — what the defect actually looked like

Before this set, the composed prompt travelled as one `-p` argv element.
Measured on this machine:

```
subprocess.Popen(["cmd", "/c", "echo", "x" * 40000])
-> FileNotFoundError: [WinError 206] The filename or extension is too long
```

`_run()` caught that in its blanket handler and returned
`error_class: "generic-unknown"`. The size cause was visible only as OS
text buried in `stderr_tail`. That failure now has its own class,
`argv-too-large`, and the handoff means it should be unreachable.

## The persistence proof — defect B, on the operator's own account

Run cold on the unelevated working account, admin being a different user:

```
1. cleared the variable            HKCU DABBLER_TRANSPORT -> (empty)
2. elevation check                 IsUserAnAdmin -> False
3. python -m ai_router.bootstrap
   "detected a Copilot seat (GitHub Copilot CLI 1.0.80.); persisted
    DABBLER_TRANSPORT=copilot-cli at user scope (open a new terminal
    to pick it up)"
4. a NEWLY STARTED shell           new-shell DABBLER_TRANSPORT=copilot-cli
5. this session's stale shell      inherited: []
6. HKCU\Environment                DABBLER_TRANSPORT -> copilot-cli
7. HKLM ...\Session Manager\Env    DABBLER_TRANSPORT -> (absent)
```

**Scope that landed: user.** Line 4 is the acceptance evidence and it is a
real shell, not a registry read: the process was started with a fresh
environment block — what Windows hands any terminal opened after the write
— and it printed the value. Line 5 is the control that makes line 4 mean
something: the shell this session has been running in was created *before*
the write, inherited its parent's block, and still sees nothing. That
contrast is the whole point of the "open a new terminal" instruction the
bootstrap prints.

Line 7 confirms the machine hive was deliberately not touched: this account
cannot write it, and writing it would have served an admin account that
never runs the router.

Before this set, the same sequence left the variable in **no** hive at all
— the HKLM-only write was refused for lack of elevation and nothing was
persisted anywhere.

## Probe A — over the cliff

A 49,645-character prompt with three facts planted at the head, the
middle, and immediately before the footer, and a task whose answer needs
all three. The rendered inline command line would have been **49,794
UTF-16 units against a 32,767 ceiling** — 1.5× over, and hard-refused by
the OS before this set.

```
prompt chars: 49645
rendered inline argv utf16 units: 49794   (windows ceiling 32767)
elapsed s: 23.3
content: 'Ordelia Vance | 1893 | 47'
stop: end_turn
metadata: {
  "error_class": null,
  "exit_code": 0,
  "session_id": "390f9ee5-dc66-4afb-a569-671334277285",
  "premium_requests": 0,
  "handoff": true,
  "payload_bytes": 50063,
  "handoff_ack": "validated",
  "payload_file_modified": false
}
```

All three planted facts were returned — `Ordelia Vance` from the head,
`1893` from the middle, `47` from immediately before the footer. This is
the distinction that matters: the ack proves the model reached EOF, and
only the three-fact retrieval shows the payload was *used*. Both held.

An earlier run during Session 1 pushed the same shape to **115,465
characters** (3.5× the ceiling) and returned all three facts with the ack
validated and `payload_file_modified: false`.

## Probe B — the inline control

```
content: 'CONTROL-OK'
metadata: { "error_class": null, "premium_requests": 0, "handoff": false }
```

Below the threshold the dispatch is still inline and carries `handoff:
false` with no payload fields. The pull is taken only when it is needed.

## The acceptance evidence proper

The surface that failed is the surface that now verifies. Sessions 1 and 2
were verified cross-provider **through `copilot-cli`** — orchestrator
`claude-opus-5`/anthropic, verifier `gpt-5.5`/openai:

| Session | Rounds | Verdict | Verifier |
| --- | --- | --- | --- |
| 1 | 1 | VERIFIED | gpt-5.5 / openai |
| 2 | 2 | VERIFIED | gpt-5.5 / openai |
| 3 | in progress | not yet verified | gpt-5.5 / openai |

Session 3's own verdict is not recorded here: this file is written before
that round runs, and the authoritative record is `session-state.json` plus
`.dabbler/runs/.../s3/rounds.jsonl`. Session 3 round 1 returned
ISSUES_FOUND with two Majors — that this artifact omitted the persistence
proof above, and that `STATUS.md` claimed all three sessions verified
while session 3's verdict was still null. Both were remediated rather than
argued.

Session 2's round 1 likewise returned a Major (the `--machine-scope` path
refused rather than falling back to user scope), remediated and cleared in
round 2. That is worth recording: the repaired transport did not merely
transmit, it carried real adverse findings back three times.

## What the probe did not surface

No fixes were required. No wire-shape surprises appeared: `-p`,
`--model`, `--available-tools`, `--no-custom-instructions`,
`--output-format json` and `--no-auto-update` all behave on 1.0.80 as the
transport assumes, and the system temp directory remained readable to the
agent without `--add-dir`.

## Catalog provenance

`ai_router/copilot-catalog.lock` claimed `cli_version = "GitHub Copilot
CLI 1.0.69."` while every entry in it recorded
`confirmed_on_cli_version = "GitHub Copilot CLI 1.0.68."` — the meta line
disagreed with its own entries. It is corrected to 1.0.68, which is what
the entries were actually probed on. `gpt-5.5` is re-confirmed at 1.0.80
because this session dispatched it repeatedly and observed the echoed
model. No other entry is re-confirmed, because no other entry was
exercised: provenance records what happened, not what is likely.
