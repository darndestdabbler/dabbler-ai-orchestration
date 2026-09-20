<!-- The driver copies ONE section into the scratch folder as AGENTS.md: the
     one between the markers for its --mode. {{RUN}} becomes the run's name. -->

<!-- mode:exchange -->
# Next-instruction exchange test

You are the AI author in a test of a request-and-response exchange between an
AI and a framework. A person may also talk to you at any time. Follow these
rules exactly.

1. **Ask once.** Run `node framework.mjs request --exchange {{RUN}}-x0 --answers 0`
   in the foreground. It prints one JSON instruction and exits. Once an
   instruction has arrived you never run it again.
2. **Do what the instruction's `ask` says, and nothing else.** Do not build,
   test, review or commit: the framework does those.
3. **Answer by starting the instruction's `answer_command`, exactly as given,
   as a background command, and end your turn.** It stays alive while the
   framework builds, tests and reviews, which can take minutes. Never run it in
   the foreground, never poll it, never sleep, and never start anything else
   to wait with.
4. **When that background command exits, its output is one JSON instruction.**
   Act on it the same way. `step`: rule 2. `rejection`: fix what `reasons`
   says, then answer with the command it names. `done`: stop, and run nothing
   further. `stop`: tell the person what it says, and run nothing further.
5. **If a background answer command ends without printing a JSON instruction**
   (it was killed, or it crashed), start that exact command again in the
   background. That is safe: an answer is never accepted twice. If it printed
   a refusal instead, do what the refusal says.
6. **The person may interrupt you.** Answer them briefly. Do not stop or
   restart a running answer command because they spoke, and do not lose the
   instruction you owe an answer to.
7. Do nothing else: no other files, no commits, no git commands.
<!-- /mode -->

<!-- mode:mailbox -->
# Messaging protocol test

You are the AI half of a test of messaging between an AI and a framework
process. The framework sends you tasks through an inbox; a person may also talk
to you at any time. Follow these rules exactly.

1. **Wait in the background.** To wait for the framework, run
   `node wait-inbox.mjs` as a **background** command, so this chat stays free,
   and then end your turn. Never run it in the foreground, never poll, never
   sleep.
2. **When the waiter exits with `MESSAGE`,** do exactly the task in the message,
   send the reply it names with `node post.mjs`, then re-arm the waiter in the
   background and end your turn.
3. **When the waiter exits with `NO MESSAGE`,** re-arm it in the background and
   end your turn.
4. **The person may interrupt you.** Answer them briefly. Do not stop, kill or
   restart an armed waiter because they spoke. If they ask whether you are
   waiting, say whether your background waiter is still running.
5. **If your waiter is no longer running** and you have not been told to stop,
   re-arm it in the background.
6. Do nothing else: no other files, no commits.
<!-- /mode -->
