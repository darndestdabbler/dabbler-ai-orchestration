# Publication safety checklist

> **What this is for.** Every recording this framework had made before
> Set 113 Session 7 was for internal review. These two tutorials are
> destined for a public URL, and **a public video is unrecallable** — it is
> indexed, mirrored and downloaded within minutes, and taking it down later
> removes the link and not the copies. It is also a recording of a real
> machine: whatever was on that screen is now published, whether or not
> anyone meant to publish it.
>
> **Run this once per video, with a human looking at the video.** Not once
> per batch, and not from memory of what the recording was supposed to
> contain.
>
> **"Do not publish this one" is a valid outcome**, and it is a cheaper
> outcome than any of the alternatives. Re-recording a fifteen-minute
> session costs fifteen minutes. Publishing a token does not cost fifteen
> minutes.

**Nothing in this checklist uploads anything.** Publication is manual and
stays manual (spec decision 5, and the operator's 2026-08-10 note). This
document decides whether a file *may* be uploaded; a person still does the
uploading.

---

## Before you record — the cheap half

Most of what this checklist catches is easier to prevent than to find. Five
minutes here removes most of the list below.

- [ ] **Record in a purpose-built toy project**, never in a real
      repository. This is an operator ruling (2026-08-16), and it is the
      single control that removes the most risk: nothing of the operator's
      own work can leak from a project that contains none of it.
- [ ] **A separate Windows account, or at least a clean desktop.** No
      personal wallpaper, no pinned taskbar items that name a client, no
      desktop icons.
- [ ] **Close everything that is not part of the tutorial.** Mail, chat,
      browser windows, note-taking applications, other editors. A window
      capture is not a defence: an alert can raise a window over it, and a
      desktop capture has no defence at all.
- [ ] **Turn on Focus Assist / Do Not Disturb.** Toast notifications are
      the single most common leak in screen recordings, they are
      unpredictable, and they render on top of everything.
- [ ] **Sign out of anything that displays an account name** in a title
      bar or status bar, where the tutorial does not need it.
- [ ] **Check the terminal's scrollback is empty** before you start, and
      that its prompt does not print the full path of a real project.

---

## After you record — check the video, not your memory

Watch the whole video. Scrub it if it is long, but *look at every part of
the frame*, not only at the thing the tutorial is about — the leak is never
in the middle of the screen.

### Identity and place

- [ ] **Window titles.** Every title bar in frame, including any that
      appear only briefly. VS Code puts the folder name in the title.
- [ ] **Absolute paths.** In the title bar, the Explorer, the terminal
      prompt, error messages, and any file picker. `C:\Users\<name>\...`
      publishes the account name.
- [ ] **Repository and remote names.** `git remote -v`, the source control
      panel, the branch indicator, any URL in a browser tab.
- [ ] **The taskbar and the system tray.** Pinned applications, badge
      counts, the clock's date if the date matters.
- [ ] **Open browser tabs**, including favicons — a tab title is often
      enough to identify a client or a product that has not shipped.
- [ ] **Any second monitor** that made it into the frame.

### Secrets

- [ ] **Terminal output.** Anything that echoes an environment variable, a
      token, a connection string, or an API key — including the *names* of
      variables that reveal a vendor relationship.
- [ ] **Environment panels and `.env` files** opened in the editor, even
      for a moment, even scrolled past.
- [ ] **Anything a tool printed on failure.** Stack traces and HTTP error
      bodies are where credentials surface, and they surface at exactly the
      moment attention is elsewhere.
- [ ] **Autocomplete and history.** A shell history dropdown or an editor
      suggestion list can show a command you did not run in this recording.

### Cost, model and account gauges

- [ ] **The cost gauge and the model gauge.** These are a deliberate part
      of the product and are usually *fine* to show — but decide, per
      video, rather than by default. A spend figure is a fact about the
      operator's account.
- [ ] **Any seat, plan or quota indicator.**

### The tutorial itself

- [ ] **Does the video match its written walkthrough?** The written
      document is the durable deliverable and the video is the enhancement
      (spec decision 4). A video that shows different steps than the
      document teaches the viewer something the document then contradicts.
- [ ] **Is the compression stated?** If the recording was speed-ramped,
      the accompanying page says which stretches were compressed and by how
      much. A viewer watching a suite run in four seconds is owed the fact
      that it took forty minutes.
- [ ] **Is anything on screen wrong?** A published tutorial outlives the
      release it was recorded against.

---

## Recording the outcome

Write one entry per video, in the set's own directory, and keep it with the
set rather than with the video:

```json
{
  "video": "single-module-set-1-session-1.mp4",
  "reviewedBy": "<the human who watched it>",
  "reviewedAt": "<ISO-8601>",
  "decision": "publish | do-not-publish",
  "findings": ["what was seen, or an empty list"],
  "notes": "anything the next reviewer should know"
}
```

`"decision": "do-not-publish"` needs no justification beyond the finding
that produced it. `"publish"` with a non-empty `findings` list needs a
sentence saying why each finding was acceptable — that sentence is the
whole value of writing the record down.

---

## What this checklist does not do

- It does not scan the video automatically. Automated redaction was not
  built and is not proposed here: a checker that finds nothing is
  indistinguishable from a checker that looks for nothing, and a video that
  has passed an automatic scan invites less human attention than one that
  has not.
- It does not upload, host, or publish anything.
- It does not cover audio. These recordings have no audio track.
