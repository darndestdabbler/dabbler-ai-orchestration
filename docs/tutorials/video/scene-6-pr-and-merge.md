# Scene 6 — Review, merge, and clean up

Covers [`hello-world.md`](../hello-world.md) **Part 6**, including the five-item final check.

**Finished length:** ~6 minutes.

## Scene goal

Sam's pull request is reviewed by the owner of the code it composes, merged, and cleaned up.
The composed program runs on `main`. The video ends on five checks the viewer can repeat.

## Starting state

- Scene 5 finished. `app`'s implementation session has committed to
  `session-set/<app-set-name>` in Sam's worktree window.
- `main` requires a pull request, one approval, and the `test` check.
- Both accounts signed in, in separate browser profiles.
- OBS scenes used: `Worktree`, `Browser`, `Editor`.

---

## Beat 1 — Sam opens the pull request *(Part 6 step 1)*

**Do.** As **Sam**, in his worktree window, confirm `gh` is still acting as Sam before anything
else — everything in this scene depends on it (see scene 5's staging note):

```bash
gh auth switch --user <sams-handle>
gh auth status
```

Then Command Palette → **`Dabbler: Open PR for this set`**. Accept the prefilled **PR title**,
read the dialog, click **Push + create PR**.

**Say.** "Sam opens the pull request from his worktree window — same command, same
approval dialog as every other time."

**See.** `PR created: …` and the pull request opens in Sam's browser profile, **authored by
Sam**. If the byline says Priya, stop — the next two beats cannot work, because CODEOWNERS
never requests a pull request's own author and GitHub never lets one approve it.

---

## Beat 2 — The review request is already there *(Part 6 step 1)*

**Do.** On the pull request page, point at the **Reviewers** box. Do not click anything.

**Say.** "And look — he didn't ask for anything. This change touches `services/app/`, the
CODEOWNERS rules we landed in the last scene are on `main`, so GitHub requested me by itself.
That's the difference from the previous pull request, which was all planning files and matched
no rule."

**See.** **Priya is already listed under Reviewers** with a pending-review marker, without
anyone adding her.

**If this fails on camera.** If nobody is requested, the CODEOWNERS handles are wrong — GitHub
silently declines to route to a handle that does not exist or has no write access. Open
`.github/CODEOWNERS` on camera, check the two handles against the real usernames, and say what
you found; then request Priya by hand and carry on. This is a genuinely useful failure to show,
because it is silent by design.

---

## Beat 3 — The check runs both modules *(Part 6 step 1)* — **WAIT**

**Do.** Stay on the pull request page.

**Say.** "And this is the payoff for one always-running job. The change is entirely inside
`app` — but the check runs `greeter` too. If Sam's composition had broken the module he's
composing, we'd find out here, on the change that caused it, instead of weeks later when
`greeter` next changes."

**See.** The **test** check runs and goes green. Open the log on camera: the
**Build and test every module** step prints `== services/app/` and `== services/greeter/`, each
followed by its own pytest summary line.

**WAIT:** 1–3 minutes. **CUT** if it runs long.

---

## Beat 4 — Priya reviews *(Part 6 step 1)*

**Do.** Switch to **Priya's** browser profile, open the pull request, and read the diff on
camera — specifically the line where `app` imports `greeter`'s `greet()`.

**Say.** "This is why the two keys exist. `touches: greeter` is what let `app`'s sessions reach
into my code in the first place. The CODEOWNERS rule is what put the result in front of me
before it landed. Not because Sam remembered to add me — because the manifest declared the
dependency and the ownership map followed it."

**See.** The **Files changed** tab showing `services/app/app.py` importing from the `greeter`
module.

---

## Beat 5 — Approve and merge *(Part 6 step 2)*

**Do.** As **Priya**: **Review changes** > **Approve** > **Submit review**. Switch to **Sam**
and click **Merge pull request** > **Confirm merge**.

**Say.** "Approve. And Sam merges — he couldn't have, a minute ago; the trunk needed somebody
else's yes and now it has one."

**See.** The pull request shows **Merged**, with one approval recorded.

**If this fails on camera.** If the merge button stays disabled after approval, check the
required checks list — GitHub will not merge on a check it is still waiting for even after an
approval. Wait for green and say so.

---

## Beat 6 — Sam finalizes *(Part 6 step 2)*

**Do.** As **Sam**, in his **main checkout** window (not the worktree): Command Palette →
**`Dabbler: Finalize merged set`**. Read the dialog, click **Finalize**.

**Say.** "Sam finalizes from his main checkout — pull, remove the worktree, delete the branch,
prune the remotes. It refuses to run from inside the worktree it's about to delete, which is
the kind of thing you only get wrong once by hand."

**See.** The confirmation modal listing the four commands; then `Merged set finalized.` with
one line per step; the worktree folder disappears; the set moves to **Complete**.

---

## Beat 7 — Run the composed program *(Part 6 step 3)*

**Do.** In **Priya's** main window, from the repository root:

```bash
git pull --ff-only
python -m services.app.app
```

**Say.** "Pull, and run the composed program."

**See.** One line, of exactly this shape, with the current time:

```text
Hello, world! It is 14:32.
```

---

## Beat 8 — The five checks *(Part 6, "The five things to check")*

**Do.** Walk the five checks on camera, one at a time.

**Say and See**, in order:

1. **Say.** "`docs/modules.yaml` declares both modules, and `app` declares `touches:
   [greeter]`." **Do.** Open `docs/modules.yaml`. **See.** Both entries, with `touches:` on
   `app`. Then open any set's `spec.md` and point at its `module:` line.
2. **Say.** "Both implementation sets are Complete, under their own modules." **Do.** Show the
   Work Explorer. **See.** Two module groups, each with its sets in the **Complete** bucket.
3. **Say.** "The program on `main` prints the composed line." **See.** The terminal output from
   beat 7, still on screen.
4. **Say.** "The check passed — and a direct push to `main` is rejected." **Do.** Run:
   ```bash
   git commit --allow-empty -m "test: prove main is protected"
   git push
   ```
   **See.** The push is **rejected**, with GitHub's message naming the protected branch. Then
   undo it: `git reset --hard HEAD~1`.
5. **Say.** "And no worktrees are left open." **Do.** Run:
   ```text
   .venv\Scripts\python.exe -m ai_router.worktree list
   ```
   **See.** Exactly one line — `[main]  .  (branch: main)`. The main checkout is always listed;
   what matters is that **no `[canonical]` session worktrees appear**.

**If this fails on camera.** Check 4 is the only one that deliberately provokes an error. If
the push *succeeds*, branch protection is not binding you — you are an admin and the
do-not-bypass option from scene 3 beat 11 is off. That is a genuine finding: say so, fix it,
and repeat the check.

---

## Beat 9 — Close the video *(Part 6, framing)* — **CUT**

**Say.** "That's the whole thing. Two modules, two owners, written by AI sessions, isolated in
worktrees, gated by a test, and reviewed by the person whose code was being composed. Nothing
here was a toy step you throw away afterwards — it's all on `main`. If you want the release
side of this — tagging, hotfixing from a tag, rolling back — that's in the release and
recovery doc linked below the tutorial."

**See.** VS Code with the Work Explorer showing two module groups, everything **Complete**.

---

## Traceability

| Beat | Tutorial step |
| --- | --- |
| 1–4 | Part 6 step 1 |
| 5–6 | Part 6 step 2 |
| 7 | Part 6 step 3 |
| 8 | Part 6's "The five things to check" — all five items |
| 9 | Part 6's "Next: Release and recovery operations" pointer |
