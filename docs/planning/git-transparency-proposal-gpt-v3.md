# Review — proposal v3

> **Reviewed:** [`git-transparency-proposal-v3.md`](git-transparency-proposal-v3.md)
> **Date:** 2026-07-30
> **Reviewer:** GitHub Copilot, without the AI router or another model

## Verdict

**Approve the direction.** v3 resolves the major v2 issues and is close enough
to author increment A. It needs three targeted corrections in the resulting
spec; it does not need another architecture round.

## Required corrections

### 1. Increment A depends on an action it defers

The sample command ends by putting **Start work** in view, but increment A
explicitly defers **Start work** to B. The extension currently has **Start Next
Session**, which copies the prompt; it does not have the proposed Start work
behavior.

Choose one:

- include a minimal local-only **Start work** action in A; or
- have A expose the existing **Start Next Session** action and reserve the full
  branch/worktree automation for B.

For the smallest increment, use the existing action in A.

### 2. Sample creation is not yet resumable

The contract says a non-empty target folder is refused, but a failed pip install
happens after Git initialization and sample rendering. Retrying would therefore
find a non-empty folder and refuse the project it just partially created.

The command must either:

- build in a temporary directory and move it into place only after success; or
- recognize its own incomplete sample marker and resume safely.

Also handle a missing Git identity for the baseline commit without changing the
developer's global Git configuration. A command-scoped or repository-local
sample identity is sufficient.

### 3. There is a third commit/push flow

Section 3 is mostly right: no new Ready for review lifecycle state is needed for
increment A. AI session work already commits and pushes; human-only authoring
does not.

However, the current tutorial also has **post-session human edits on a session
branch**. Examples include enabling CI after the implementation session and
adding a prerequisite after decomposition. The session has already closed and
pushed, then the developer adds more files before opening the PR.

Therefore **Send for review** in B must inspect state rather than select one of
only two fixed flows:

- clean session branch: create or update the PR;
- dirty session branch after close: show, scan, commit, and push the remainder,
  then create or update the PR;
- human authoring branch: show, scan, commit, push, and create or update the PR.

This does not require changing `close_session`, but post-session edits are not
covered by the completed session's verification. Prefer moving such edits into
the session scope; otherwise the review action must state that they are
additional unverified changes.

## Other checks

- The corrected prerequisites and network claims are now honest.
- The local-only marker is the correct mechanism for the hostless sample.
- Read-only reconciliation on activation is the correct safety boundary.
- Moving the current video scripts with `adopt-dabbler.md` belongs in A.
- The document split is safe because procedures have named owners.
- The 15-minute acceptance definition is executable and measures the right
  outcome. Test it with a clean profile, released VSIX, fresh venv, and an
  authenticated AI agent.

## Recommendation

Author increment A after incorporating corrections 1 and 2 into its spec.
Record correction 3 as a binding requirement for increment B. Keep A focused
on one result:

> A developer creates the local sample, runs one Lightweight session, sees the
> code change, and gets green tests and working output without typing Git, YAML,
> host configuration, or governance settings.