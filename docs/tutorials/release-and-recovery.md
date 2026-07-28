# Release and recovery operations

Reference for after the [Hello World tutorial](hello-world.md): cutting a release
tag, hotfixing from one, and rolling back. **What to release, when, and whether to
roll back are human decisions** — these commands only remove the typing. Every one
of them shows the exact shell commands it will run and waits for your click.

---

## Cut a release tag

Run **`Dabbler: Cut release tag`** from your main checkout, on an up-to-date trunk.
It asks for three things:

| Prompt | What to give it |
| --- | --- |
| **Release tag name** | `v0.1.0` — or `greeter-v0.1.0` for a per-module tag, if your modules ship independently. |
| **Commit to tag** | Accept the default `HEAD`. |
| **Tag annotation message** | Defaults to the tag name; anything descriptive is fine. |

The confirm dialog — *Cut and push release tag 'v0.1.0'?* — lists the `git tag -a`
and `git push origin` lines, plus the **resolved commit sha and subject** the tag
will land on. The tag is pinned to that sha, so a branch that moves while the
dialog is open cannot change what gets tagged. Review it, then click **Create +
push tag**.

Re-running with a name that already exists is refused: pushed release tags are
immutable by convention. If the tag was never pushed you can remove it locally
with `git tag -d <tag>` and cut it again.

## What "deploy" means here

In this toy project, deploying is running the tagged snapshot:

```bash
git checkout v0.1.0
python services/app/app.py
git switch main
```

A real deployment is whatever your environment does with a tag — a pipeline
triggered by the tag, a container build, an artifact upload. The framework's
contribution is that **the thing you deploy is a reviewed, immutable, named
commit**, not "whatever `main` happened to be."

## Hotfix an already-released version

A bug turns up in what you shipped, and `main` has moved on. Fix it **from the
deployed tag**, never from the trunk — `main` may hold unreleased work you do not
want to ship.

1. Run **`Dabbler: Start hotfix from tag`**.
   - *Which release tag is the hotfix based on?* → pick `v0.1.0`.
   - *Hotfix branch name* → accept the default, `hotfix/v0.1.0`.

   The confirm dialog shows `git switch -c hotfix/v0.1.0 v0.1.0`; click **Create
   hotfix branch**. The command refuses to start from a dirty working tree, so the
   branch is exactly the tagged snapshot.

2. Make the fix and commit it locally, then run **`Dabbler: Open PR for this set`**
   and get an approval. The `test` check runs on the pull request.

3. **Validate before you tag.** The PR's check ran against your host's *preview
   merge* of the branch with `main` — good for compatibility, but not literally
   the snapshot you are about to tag. Run the suite locally on the exact hotfix
   commit first:

   ```bash
   for module in services/*/; do python -m pytest -q "$module" || exit 1; done
   python services/app/app.py
   ```

4. Still on `hotfix/v0.1.0`, run **`Dabbler: Cut release tag`** with name `v0.1.1`
   and **Commit to tag** left at `HEAD` — the hotfix commit. The tag lands on the
   hotfix commit itself: `v0.1.0` plus the reviewed fix, nothing else. Do *not*
   merge first and tag `main`; if `main` holds unreleased work, a tag there would
   ship it.

5. Deploy `v0.1.1`, then merge the pull request so the fix is not lost from the
   trunk. Clean up the branch — it is not a `session-set/*` branch, so
   **`Dabbler: Finalize merged set`** does not handle it:

   ```bash
   git switch main && git pull --ff-only
   git branch -d hotfix/v0.1.0
   git fetch --prune
   ```

   The tag keeps the release commit reachable forever, so deleting the merged
   branch loses nothing.

## Roll back

Rolling back is not git surgery — it is deploying the previous tag again.

Run **`Dabbler: Roll back to tag`**, pick the tag at *Which release tag do you want
to roll back to?*, and confirm with **Check out tag**. The dialog warns you that
`git checkout <tag>` leaves you on a **detached HEAD** and tells you how to get
back. Run or redeploy from there, then return with `git switch main`.

Like the hotfix command, it refuses a dirty working tree — a rollback redeploys the
*exact* snapshot.

---

## Git under the hood

The commands remove keystrokes, not oversight. Here is exactly what each one runs.

**`Dabbler: Open PR for this set`** — pushes the current branch and opens a PR.
Host detection is automatic from the `origin` remote URL.

1. `git push -u origin <current-branch>`
2. Then one of:
   - **GitHub** (with `gh`): `gh pr create --head <branch> --base main --title "…" --body "…"`
   - **Azure DevOps** (with `az`): `az repos pr create --organization … --project … --repository … --source-branch <branch> --target-branch main --title "…" --description … --output json`
   - **No CLI found:** the push still happens, then your host's create-a-PR page
     opens in the browser.

**`Dabbler: Finalize merged set`** — run from the main checkout after the PR
merges. Every step is idempotent, so it is safe to re-run.

1. `git pull --ff-only`
2. `git worktree remove <path>` (if the set has a worktree)
3. `git branch -d session-set/<slug>` — `-d`, never `-D`, so an unmerged branch
   refuses rather than losing work
4. `git fetch --prune`

**`Dabbler: Cut release tag`**

1. `git tag -a <tag> <resolved-sha> -m "<message>"`
2. `git push origin <tag>`

**`Dabbler: Start hotfix from tag`** — `git switch -c hotfix/<tag> <tag>`

**`Dabbler: Roll back to tag`** — `git checkout <tag>`

### What the automation deliberately does not cover

- **Authoring and hotfix branches.** `Finalize merged set` is tailored to the
  `session-set/*` worktree lifecycle; other branches get the four-line manual
  cleanup shown above.
- **The one-time bootstrap** — creating the repository, branch protection or
  branch policies, CODEOWNERS, CI. That is policy you should set consciously.
- **Reviewing, approving, merging, and releasing.** Those happen on your git host,
  by a human. An AI agent can invoke these commands, but the confirmation dialog
  still goes to you — the agent never pushes, merges, tags, or releases on its own
  authority.

> **Squash and rebase merges.** These steps assume your host's default *create a
> merge commit* strategy. If you merge by squash or rebase, the merged commit gets
> a new identity and `git branch -d` refuses with "not fully merged" — including
> inside `Finalize merged set`. That is git protecting you. Confirm the change is
> on your pulled `main`, then delete with `git branch -D`.
