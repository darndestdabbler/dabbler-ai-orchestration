# Set 115 — the guided look

**Ten minutes, two sections.** Look at five things; decide three. There is
nothing to stage: `npm run walk` builds a throwaway workspace, launches a
real VS Code against it, and opens the Dabbler view for you.

```bash
cd tools/dabbler-ai-orchestration
npm run walk -- --walk-doc ../../docs/session-sets/115-work-explorer-session-node-ux/s4-uat-walk.md
```

The whole set is about **one row in the Work Explorer** — the session row
— and whether it is now worth clicking. Everything below is on that row or
under it.

---

## Look

**1. The rows say what the sessions are about.**
In the Dabbler view, expand any session set (a bold row like
`115-work-explorer-session-node-ux`).
Read the session rows underneath it.
*Do they read as titles someone wrote, or as `Session 1 / Session 2`?*

Titles someone wrote


**2. Clicking a session lands you in its part of the plan.**
Left-click one of those session rows.
`spec.md` opens with that session's own `### Session N of M:` heading at the
top of the editor.
*Did you land on the right session's block, without scrolling?*

YES

**3. The row offers the two things you actually do with a session.**
Right-click a session row.
You should see **Copy Run Prompt** on exactly one row per set — the session
that phrase would really start — and **Open Session Artifacts** on every
row.
*Is the run prompt offered on the row you would have picked yourself?*

Yes, although we no longer need Open Session Artifacts.


**4. The step in flight is obvious at a glance.**
Expand the session marked `in flight` and look at the step rows' icons —
not their text.
The step being worked on carries the spinning-arrow **in-progress** glyph;
finished steps are ticks; unstarted ones are hollow.
*Can you tell where the session is from two feet away, without reading a
single row?*

Yes

**5. The close-out row says what still stands between here and close.**
Under those steps, expand **Close-out**.
Each row is one obligation `close_session` will check — hover any of them
for the remediation in its own words. Rows that come from git (`Working
tree clean`, `Pushed to remote`) are stamped `as of HH:MM`, because nothing
can re-check them without running git.
*If it says `not computed` or `stale`, run this and watch the row change —
that is the finish:*

```bash
python -m ai_router.close_preflight --session-set-dir docs/session-sets/115-work-explorer-session-node-ux --write
```

This is fine

---

## Decide

**A. The close-out list is one row, not fourteen.**
The obligations sit behind a single **Close-out** twisty with a summary
(`1 blocking, 3 advisory`) rather than being listed flat beside the steps.
- **Keep it grouped** — the session row you watch gains one line.
- **Flatten it** — every obligation always visible, the row gets ~14 lines
  taller.

Keep in grouped


**B. The projection is never committed.**
`close-obligations.json` is written into a git-ignored `.dabbler/` folder,
so it never appears in a diff or a review — and a fresh clone shows
`not computed` until someone runs the command.
- **Keep it ignored** — no churn, no risk of a mid-session write staling a
  paid verification round.
- **Commit it** — the file becomes part of the session record, at the cost
  of both of those.

Keep it ignored

**C. `<- here` is gone.**
The text marker that used to name the current step has been removed from
both the panel and the CLI; the in-progress icon carries it now.
- **Agreed** — the icon is enough.
- **Bring back a text marker** — say where, and what it should key on.

**Agreed** — the icon is enough