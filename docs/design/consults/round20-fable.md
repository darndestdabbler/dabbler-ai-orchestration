# Consult round 20 — Claude Fable 5.1 through Claude Code

Dispatched with `dabbler agent prompt`, model `claude-fable-5-1`, permissions
set to deny. The model nevertheless used Claude Code's repository read tools;
claims from those reads were checked against the tree before synthesis.

```
VERDICT: adopt with changes

1. Yes. Session 215 failed because a one-shot waiter was never re-armed,
   and the direct path has no waiter. From the source, three regressions
   to weigh. The direct path runs Claude with
   --dangerously-skip-permissions and Copilot with --allow-all-tools and
   --allow-all-paths, so staff lose the engine's own permission prompts.
   Copilot gets a fresh conversation for every instruction, so each step
   pays a re-read that counts against the three-times ceiling. The direct
   path is metered at a default of 24 engine invocations, and a spent
   budget stops the loop until a person re-runs it. None of these makes it
   unsafe for tomorrow, but the path has not been the extension default
   since the pull replaced it, so the soaks are its first real test.

2. The developer loses the chat: asking the AI a question mid-session,
   steering it, and watching it in its own interface. That loss is
   acceptable on the Start-to-done path, because requirement 3 says the
   person should not be needed there. The engine's output still streams
   into the loop terminal, so the work stays visible. The smallest
   intervention is what exists: session interrupt carries a person's
   message to the AI as an interrupt instruction, and cancel ends it.
   Add nothing, and name both verbs in the loop terminal's opening lines
   if they are not already there.

3. Yes, given the status re-reads before phases, add, commit and push,
   and given the tree is preserved. The risk is behavioural, not
   mechanical: cancel becomes the easy exit from a hard step, where a
   blocked report was the right answer. The one condition: an AI cancel
   requires a non-empty reason, and the loop prints that reason as its
   last line. Count any AI-initiated cancel during a soak as a soak
   failure.

4. 215: do not restore; the switch removes its premise. Its release
   preflight is the one piece worth a later session, if a soak shows a
   release failing late.
   216: defer; no run has reached a dispute dead end since 213, so wait
   for a real one.
   217: drop; the direct loop already owns the author process, which was
   most of what a governor would supervise.

5. Not quite. Blocker one: the Copilot soaks must record time and credits
   against the direct-AI baseline, because fresh conversations per step
   are the likeliest breach of requirement 5. Blocker two: one soak must
   finish with invocations to spare under the default budget, including a
   remediation round, or the budget stop becomes a routine human action.

6. In the extension's Start handler, drop --mailbox from the loop's
   arguments and delete the code that opens the AI terminal and types the
   waiter protocol. In session cancel, remove the AI-caller refusal for
   --force and require --reason. Update the extension tests that assert
   the mailbox arguments and the second terminal. Trim the waiter section
   of the managed AGENTS.md body to say mailbox is a CLI fallback. Leave
   close --force, the schemas, the mailbox code and session wait alone.

BIGGEST RISK: the direct path ships as the default on its first soak from
the extension, with one evening to find what two machines and two engines
have not yet shown.
```

The model added:

> Managed instructions must change with the patch. The managed body in
> `AGENTS.md` still tells every engine to run a background waiter. A directly
> driven engine that reads it may start a waiter nobody needs.

It did not run the direct path.

