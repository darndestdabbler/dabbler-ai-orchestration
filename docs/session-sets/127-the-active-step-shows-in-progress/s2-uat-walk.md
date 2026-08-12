# Set 127 — the guided look

**Five minutes, two sections.** Look at one thing; decide two. There is
nothing to stage: `npm run walk` builds a throwaway workspace, launches a
real VS Code against it, and opens the Dabbler view for you.

```bash
cd tools/dabbler-ai-orchestration
npm run walk -- --walk-doc ../../docs/session-sets/127-the-active-step-shows-in-progress/s2-uat-walk.md
```

This set exists because of one question you asked while looking at the Work
Explorer: **why is there no In Progress icon?** Everything below is that
question and its follow-up.

The walk is one item on purpose. Everything a machine can check here has
already been checked: the icon, the timing, the both-directions rule and
the two languages agreeing are all asserted by the Layer 3 rendering suite
and the cross-language corpus, and they were green before this was written.
What is left is the only thing they cannot answer — whether it reads right
to you.

---

## Look

**1. The step the session is on says so, and says since when.**
In the Dabbler view, expand the session set marked **In Progress**, then
expand the session row that says `in flight`, and look at the step rows.
One of them carries the **in-progress** glyph — the same one the session
and set rows use — and shows a grey time like `12:06-` at the end of the
row; the steps below it are hollow and show no time at all.
*Can you tell where the session is, and how long it has been there, from
two feet away — without reading a single row?*



---

## Decide

**A. Start time only, and no date.**
Each started row shows when it **started** and nothing else. A finished
step's end is the next row's start, one line below it, and a session that
crosses midnight is left to the reader — the next row's hour being
*smaller* is the giveaway. You ruled both at authoring; this is the first
time you see them rendered.
- **Keep it** — one narrow grey field per started row.
- **Add an end time** — every row gets a second timestamp, duplicating the
  row below it.
- **Add a date** — every row gets wider so that the rare midnight case
  reads correctly.



**B. A step that has not started shows no time.**
Unstarted rows are blank in that column. They *do* have a timestamp on disk
— the moment the whole plan was written down at registration, identical
across every row — and showing it would put a plausible-looking start on a
step nobody has touched.
- **Keep it blank** — silence rather than a number that means something
  else.
- **Show the registration time** — every row gets a time; some of them are
  not starts.


