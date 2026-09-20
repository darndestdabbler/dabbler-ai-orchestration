# Consult round 20 — synthesis

2026-09-20. Brief: `round20-brief.md`. Answers:
`round20-fable.md` (`claude-fable-5-1` through Claude Code) and
`round20-gemini.md` (`gemini-3.8-flash` through the Copilot seat).

## Decision

Adopt the recommendation with four additions to the acceptance gate. Do not
restore 215, do not implement 216 before the handoff, and drop 217. Plan one
corrective patch that makes the existing direct `session run` path the
extension default and permits cancellation of the current in-flight session
by its author.

## Where both advisors agree

1. The direct path removes the failure that stranded 215. Dabbler invokes the
   author for each instruction instead of relying on the author to restart a
   one-shot waiter.
2. Losing the separate interactive AI terminal is acceptable on the normal
   autonomous path. Existing `session interrupt` is the exceptional steering
   mechanism; mailbox mode remains an explicit CLI fallback.
3. Author cancellation is safe when it is scoped to the current in-flight
   session, requires a reason, preserves the working tree, and the loop checks
   status before later add, commit, and push.
4. Session 215 should not be restored, 216 should be deferred until a real
   dispute reaches its dead end, and 217's generic governor should be dropped.
5. The patch should add no new lifecycle concept or recovery UI.

## Claims checked against the tree

Claude Fable correctly identified three properties that the brief did not
fully distinguish:

- `engineShape` launches direct Claude Code with
  `--dangerously-skip-permissions`, direct Copilot with
  `--allow-all-tools --allow-all-paths --no-ask-user`, and Codex with
  `--dangerously-bypass-approvals-and-sandbox`.
- Claude Code and Codex resume a named conversation. Copilot's direct CLI
  output supplies no conversation id, so each instruction starts a fresh
  Copilot conversation. The driver preserves a conversation id when an engine
  supplies one; that statement is not true of Copilot.
- `DEFAULT_DRIVER_INVOCATIONS` is 24. Exhausting it stops the session and
  requires another run with a larger budget.

Fable also correctly noted that the managed body still instructs every
authoring AI to use the waiter. Updating `bootstrap/templates.ts`, regenerating
`AGENTS.md`, and updating the shipped pages are required parts of the patch,
not optional documentation cleanup.

Gemini's environment risk is also concrete. The direct engine is spawned by
the extension's framework terminal rather than from the separately opened
interactive terminal. PATH, authentication, and inherited environment must be
proved on both packaged installations.

## Corrections to the advice

Neither advisor's phrase "only the current Authoring AI" should create another
caller-authentication mechanism. Session 213 demonstrated that environment
markers and terminal heuristics are not authentication. The safe boundary is
the operation: `cancel --force` without another session target means the
current in-flight session, records a required reason, preserves files, and
causes the loop to stand down. No other forced operation changes.

An AI-initiated cancellation is a failure in each normal completion soak. It
is the expected result only in the separate cancellation check.

## Amended acceptance gate

The four original soaks remain mandatory. Add:

1. **Direct-launch environment.** Both engines must launch from the packaged
   extension on both machines without a PATH, authentication, model, or
   credential discrepancy.
2. **Copilot cost and time.** Record Copilot wall time and AI credits against
   the direct-AI baseline. Its fresh conversation per instruction is the
   highest identified risk of crossing the two-times target or three-times
   blocker.
3. **Invocation headroom.** At least one soak must include one real
   remediation round and still close below the default limit of 24 author
   invocations. Any ordinary soak reaching the budget stop blocks release.
4. **Permission posture.** Confirm that unattended permission bypass is an
   accepted property of the direct authoring path on the packaged artifact.
   Do not accidentally present it as sandboxed or approval-gated.

The existing release blockers remain: no human action after Start, unexplained
stop, duplicate loop, orphan process, false success, dirty completion, missing
verdict, cancellation followed by a commit or push, or three-times direct-AI
time or spend.

## Exact patch to plan

1. In the extension, Start launches `session run` without `--mailbox`.
2. Start does not open the separate interactive author terminal.
3. Direct author output remains visible in the framework terminal.
4. Existing `session interrupt` remains the way to steer a running author.
5. Mailbox mode and `session wait` remain an explicit CLI fallback.
6. Cancellation of the current in-flight session is allowed from the author,
   with the existing required non-empty reason. `close --force` is unchanged.
7. Managed instructions and shipped pages describe direct run as the normal
   extension path and mailbox as the fallback.
8. No schema, state, role, record, command, setting, button, environment
   marker, governor, Retry Now, Reconnect, or new UAT harness is added.

