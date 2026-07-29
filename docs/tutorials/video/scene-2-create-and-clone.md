# Scene 2 — Create and clone the GitHub repository

Covers [`hello-world.md`](../hello-world.md) **Part 2**.
Alternate take: [`scene-2-alt-azure-devops.md`](scene-2-alt-azure-devops.md) replaces this
whole scene for viewers on Azure DevOps.

**Finished length:** ~3 minutes.

## Scene goal

An empty public GitHub repository named `hello-modules` exists, and it is cloned and open in
VS Code. This is the shortest scene in the video and the one with the most on-screen privacy
risk — read the checklist below before you record it.

## Starting state

- Scene 1 finished: the four tools installed and proven.
- Signed in to GitHub in the browser, on the **personal account you want on camera**.
- No repository cloned yet. VS Code shows the welcome screen.
- OBS scenes used: `Browser`, then `Editor`.

## Before you record this scene

Everything in this scene is on a real GitHub account, so:

- **Start from `https://github.com/new`, not the dashboard.** The dashboard lists your other
  repositories down the left-hand side.
- **Check the owner dropdown** on the New repository form — it lists every organisation you
  belong to. If it shows an employer, either change accounts or crop the capture.
- **Hide the bookmarks bar** (`Ctrl+Shift+B`) and close every tab but one.
- **Check the avatar menu is closed** before you start.

---

## Beat 1 — Create the repository *(Part 2 step 1)*

**Do.** In the browser at `https://github.com/new`: type `hello-modules` into
**Repository name**, select **Public**, tick **Add a README file**, and click **Create
repository**.

**Say.** "A new repository — `hello-modules`. Public, and that matters: on GitHub's free
plan, branch protection only works on public repositories, and we're going to depend on
branch protection from part three onward. On a paid plan, private is fine."

**See.** The repository page for `hello-modules` with one file, `README.md`, and a green
**Code** button.

**If this fails on camera.** If the name is taken on your account, use `hello-modules-1` and
say the new name out loud — every later scene refers to the folder, not the name, so nothing
downstream breaks.

---

## Beat 2 — Copy the clone URL *(Part 2 step 2)*

**Do.** Click **Code**, stay on the **HTTPS** tab, and click the copy button.

**Say.** "Copy the HTTPS URL."

**See.** The URL field reads `https://github.com/<your-handle>/hello-modules.git` and the
copy button switches to a tick.

---

## Beat 3 — Clone it from inside VS Code *(Part 2 step 2)*

**Do.** Switch to VS Code. Open the Command Palette with `Ctrl+Shift+P`, type `Git: Clone`,
press `Enter`, paste the URL, press `Enter`, and pick a folder for the clone.

**Say.** "Clone it from inside VS Code — Command Palette, `Git: Clone`, paste the URL, pick
where it goes."

**See.** A notification asks whether to open the cloned repository.

---

## Beat 4 — Open the clone *(Part 2 step 2)*

**Do.** Click **Open** on that notification.

**Say.** "And open it."

**See.** The Explorer shows a folder named `hello-modules` containing exactly one file,
`README.md`. The status bar bottom-left reads `main`.

**If this fails on camera.** If the status bar reads anything but `main`, GitHub created the
repo with a different default branch name. Say so on camera and use that name wherever the
tutorial says `main` — or change it in **Settings > General > Default branch** and re-clone.

---

## Beat 5 — Name the Azure DevOps difference once *(Part 2, ADO callout)*

**Do.** Stay on the same screen. No action.

**Say.** "If your team is on Azure DevOps rather than GitHub, everything Dabbler does is
identical — the commands don't care which host you're on. What differs is the guardrails, and
I'll name the Azure DevOps equivalent each time we set one. There's also a separate take of
this scene that creates the repo in an Azure DevOps project instead."

**See.** No change on screen — this is a narration-only beat.

---

## Beat 6 — Close the scene *(Part 2, framing)* — **CUT**

**Say.** "An empty public repository, cloned and open. Now we bring in Dabbler."

**See.** VS Code with `hello-modules` open and `README.md` the only file.

---

## Traceability

| Beat | Tutorial step |
| --- | --- |
| 1 | Part 2 step 1, including the public-repo-on-GitHub-Free reason |
| 2–4 | Part 2 step 2 |
| 5 | Part 2's Azure DevOps callout |
| 6 | Part 2 close |
