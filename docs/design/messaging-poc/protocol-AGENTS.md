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
