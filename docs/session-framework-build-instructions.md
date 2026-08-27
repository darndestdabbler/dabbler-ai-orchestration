# Building the session framework — instructions for each session

**Read this before your first command.** It is the operating manual for
`docs/session-sets/148-the-session-framework/`, written for an AI engine
running one session at a time on a GitHub Copilot seat. **The session set
spec says what to build; this file says how to run a session**, and the
close gate will refuse work that got the register step wrong.

**The one rule behind all the others: the machine owns the record.** State
files and everything under `.dabbler/runs/` are written by the router only.
Never hand-edit one, never "fix up" a verdict, and never write a verdict
token you did not receive from `ai_router.verify`. **This set exists to
build a framework whose entire claim is that the record is honest** — a
hand-edited record here would falsify the thing being built.

---

## Precondition: settled 2026-08-26

**Sets 145 and 146 are both `cancelled`, and no set is `in-progress`
besides 148.** Set 145 `step-execution` was in-progress and set 146
`measure-then-enable` had never been started, which would have selected 146
ahead of this set under the lowest-numbered-`not-started` rule.

Both dispositions already existed in machine-written form on another branch
and were carried over **by merge, never by editing a state file**.

**Confirm it still holds before the register step** by reading the `status`
field in each set's `session-state.json`. Two in-progress sets is a drift
error: stop and surface it, do not work around it, and do not edit a file to
make it go away.

---

## Before you start: three things to establish

1. **Which session is next.** Read the `status` field in
   `docs/session-sets/148-the-session-framework/session-state.json`. Never
   infer state from which files exist.
2. **Which branch. Settled: `master`.** The design documents were authored
   on `design/solution-decomposition` and both it and
   `experiment/verification-pipeline-v3` are merged in and finished. Commit
   and push `master`.
3. **Which model is driving your seat.** You need the exact model id for
   the register step. The seat's label is not trusted.


---

## The environment

```powershell
# Always run the router through the project venv.
.venv/Scripts/python -m ai_router.<module>

# Route through the seat.
$env:DABBLER_TRANSPORT = "copilot-cli"
```

**"No module named ai_router" is an interpreter problem, not a missing-keys
problem.** You have used the system Python instead of `.venv/Scripts/python`.

**API keys live in environment variables and never in files, logs, or
config**: `DABBLER_ANTHROPIC_API_KEY`, `DABBLER_OPENAI_API_KEY`,
`DABBLER_GEMINI_API_KEY`.

---

## The lifecycle every session repeats

**All seventeen sessions run these steps in this order.** Sessions 1 and 2
write no code, so their steps 4 and 6 are trivially satisfied — but they
still register, still verify, and still close through the gate.

### 1. Register — state first, work second

```powershell
.venv/Scripts/python -m ai_router.session start `
    --session-set-dir docs/session-sets/148-the-session-framework `
    --engine copilot --provider <anthropic|openai|google> --model <exact-model-id>
```

**A Copilot seat must pass `--model`.** Identity resolves through the model
registry because a seat can front any vendor, and the `--provider` label is
an explicit second choice, not the answer. **Without `--model` this fails
closed**, and that is the intended behaviour rather than a bug to work
around.

The command is idempotent. Re-run it safely after a context reset.

### 2. Do the work — and do not commit yet

Follow the numbered steps for your session in the set spec. **Verification
reviews the working tree, so an already-committed tree presents an empty
diff** and the round reviews nothing.

### 3. Run the tests this change makes necessary — only those

```powershell
.venv/Scripts/python -m ai_router.affected `
    --session-set-dir docs/session-sets/148-the-session-framework
```

It prints the selected tests, why each was selected, and the exact command
to run. **Pass `--session-set-dir`**: once a verification round exists,
selection is measured against that round's snapshot, so a remediation runs
what the fix touched instead of re-running what the session touched.

Run the printed command, then record it:

```powershell
.venv/Scripts/python -m ai_router.test_evidence record `
    --session-set-dir docs/session-sets/148-the-session-framework `
    --suite <name> --stage preverify-targeted `
    --command "<the command you actually ran>" --outcome passed `
    --duration-seconds <elapsed>
```

**The complete suite is neither required nor accepted at this stage.** A
command that does not name the selected tests is recorded as a
`policy_violation` and verification refuses to start. Two exceptions exist
and both are auditable: the selector proving every test affected (it says
so, and the bare suite command is then correct), or
`--allow-full-preverify "<reason>"`, whose reason is mandatory.

### 4. Cross-provider verification — mandatory, no skip

```powershell
.venv/Scripts/python -m ai_router.verify `
    --session-set-dir docs/session-sets/148-the-session-framework
```

**Run this in the background.** Discovery rounds take nine to ten minutes
and routinely exceed a foreground command timeout. A timeout is not a
failure — the round is still running, and re-invoking it wastes seat spend.

The verifier is a different provider than you, resolved with your effective
provider excluded as a hard constraint. Outcomes land in `.dabbler/runs/`,
machine-written.

**On blocking findings:** remediate, re-run step 3 for the fix, then re-run
the same verify command. Rounds two and later review only your fix delta.
The loop suspends at the round cap.

**Stop the loop when only Minor findings remain.** Grinding rounds against
wording is the failure mode the severity vocabulary exists to prevent.

**If a finding is wrong, dispute it — do not argue in prose.**
`verify dispute` records an evidence-backed rebuttal and the next round
presents it beside the finding for UPHOLD or WITHDRAW. When the cap is
reached with every blocking finding disputed, `verify adjudicate` routes
them to a third provider, excluded harder than any verifier. One
adjudication per session, ever.

### 5. Run the complete suite once, against the final verified tree

```powershell
.venv/Scripts/python -m ai_router.test_evidence record `
    --session-set-dir docs/session-sets/148-the-session-framework `
    --suite <name> --stage final-full --outcome passed `
    --duration-seconds <elapsed>
```

The command is the one the suite declares under `testing.suites` in
`router-config.yaml`. **This is the only stage the close accepts, and it
binds to the tree it ran against.** A failed run of record is not reusable
proof: fix, re-run the affected tests, re-verify, then run the suite again.

**Pytest parallelism is pinned at `-n 2` in `pytest.ini`. Never use
`-n auto`.**

### 6. Commit, then push — exactly once

Commit as often as the work wants. **Push once, here, immediately before
the close.** CI runs on push, so a mid-session push buys a full matrix run
of work that is not finished.

### 7. Close through the gate

```powershell
.venv/Scripts/python -m ai_router.session close `
    --session-set-dir docs/session-sets/148-the-session-framework
```

Five gates run: verification clean, tree clean, pushed, tests fresh,
verdict vocabulary. **Use `--dry-run` at any time to preview the rows.**
The close flips the state, then commits and pushes its own bookkeeping.

---

## What "full dogfood" obliges you to do

**Every session records its decisions as it makes them, not afterward.**
That is the behaviour session 5 automates; until then, keep the set's
decisions log by hand and session 5 backfills it through the real writer.

**Every session records its seat cost from session 3 onward.** Session 3 is
the first ordinary code session and its cost is the unit that says whether
seventeen sessions fit the seat. **`costUsd: null` on a seat call is a
metrics gap, not a free call** — the call was billed; the CLI simply
reports nothing billing-authoritative.

**No session may reduce its own verification.** If the round count is
painful, the answer is fewer and larger sessions, never fewer rounds. The
set is a proof that the lifecycle holds, and a session that shortcuts it
proves the opposite.

---

## Traps that have cost this project sessions before

- **Verification exceeds a foreground timeout.** Always background it.
  Nine to ten minutes is normal for a discovery round.
- **The full suite is slow, not hung.** Background it and let it finish.
- **A verifier cannot reach its own fallback when a provider is down.**
  Setting `enabled: false` does nothing; clear that provider's API key for
  the process instead.
- **`working_tree_clean` never blocks on modified tracked files** — it is a
  known gap, filed. Do not treat a clean gate as proof of a clean tree.
- **Do not hand-author a journal timestamp.** `decision_journal` stamps its
  own.
- **Do not re-raise a settled design decision as a finding.** The set spec
  lists what is closed; a finding that reopens one is out of scope, and
  disputing it is the correct response.

---

## When a session ends at the cap

**That is a permitted outcome and not a failure to hide.** The record
carries what stopped it: at which round, the findings with vendor and
severity, and what the verifier looked at.

**Never ask the operator to approve over it — there is no approval anywhere
in this framework, including sessions 1 and 2.** Prose review has no bottom,
which is why the round cap and the Minor-only stop exist; a person adds no
bound those two do not already supply and costs a blocked engine.

**Two of the three terminal states end a session at the cap, and they are
not the same thing. Session 3 built both, so the loop reaches them by
itself — re-run `python -m ai_router.verify` at the cap and it records
whichever one the tree says it is:**

- **Unresolved** — blocking findings are still outstanding and the tree
  has not moved since the round that raised them. Nothing lands.
- **Remediated at the cap** — every blocking finding from the last round was
  fixed, and the cap left the fix unreviewed. The work lands, labelled
  unreviewed. The fix must have passed its own targeted tests first: that
  is the one thing an unreviewed landing still proves.

**Remediated-at-the-cap is not a waiver and must never be recorded as one.**
A waiver accepts work over a finding that still stands; here nothing stands,
and what is unproved is the repair rather than the complaint.

**There is no `verify waive`, and asking for one is not a route to
anything.** The command refuses and names the two terminal states instead.

**A failed code session is cheap** — the code did not land, and the next
session tries again with better instructions.

**Do not dispute a finding you believe is correct.** Dispute is for a
finding that is wrong, and it must be evidence-backed. A dispute also
diverts the cap to adjudication rather than to a terminal state, so filing
one against a finding you intend to fix costs the session its exit and
puts a false statement on the record of a set whose entire claim is that
the record is honest.


---

## The one ordering change to know about

**The plan puts "collapse session sets" at A3; this set runs it at session
14.** A3 removes the machinery this sequence runs on, so collapsing it
early would strand every session after it. Session 14 must migrate this
set's own state forward — if sessions 15 through 17 cannot register, verify
and close under what session 14 builds, **session 14 is not done.**
