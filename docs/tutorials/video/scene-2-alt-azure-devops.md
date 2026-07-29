# Alternate take — Scene 2 on Azure DevOps

**Replaces:** [`scene-2-create-and-clone.md`](scene-2-create-and-clone.md) **entirely**.
**Rejoin at:** [`scene-3-dabbler-setup.md`](scene-3-dabbler-setup.md) beat 1, unchanged.

Covers the Azure DevOps equivalents named inline throughout
[`hello-world.md`](../hello-world.md) **Part 2** and after.

**Finished length:** ~4 minutes.

## What this take changes downstream

Recording this take instead of scene 2 changes five later beats. Each is already written into
the main scripts as a narration-only Azure DevOps aside — on this take you **perform** it
instead of describing it. Say so as you go.

| Where | On Azure DevOps |
| --- | --- |
| [Scene 3](scene-3-dabbler-setup.md) beats 11–12 | Instead of GitHub branch protection: **Project Settings > Repositories > your repo > Policies > Branch Policies** on `main` > **Require a minimum number of reviewers**. Its minimum is **1**, not 0, so also tick **Allow requestors to approve their own changes** — and cast your own **Approve** vote on each solo pull request. |
| [Scene 4](scene-4-first-module.md) beat 14 | Azure DevOps ignores GitHub Actions. **Before** opening the pull request, create a pipeline that runs the same test command and add it under **Branch Policies > Build validation**, marked **Required**. This tutorial deliberately ships no `azure-pipelines.yml` — the YAML belongs to your organisation's pipeline standards. |
| Scene 4 beat 19 | **Nothing to do.** The Build validation policy you added *is* the required check. Say that out loud; a viewer who has been following along will be waiting for a second settings trip. |
| [Scene 5](scene-5-second-module.md) beat 6 | CODEOWNERS is GitHub-only. The equivalent is **Automatically included reviewers** — one entry per module with a path filter, each marked **Required**. |
| Scene 5 beat 7 | Instead of raising approvals 0 → 1: keep the minimum at **1** and **untick** *Allow requestors to approve their own changes*, so your own vote stops counting. |

Every **Dabbler** command is identical on both hosts — `Open PR for this set`, `Finalize
merged set`, the worktree CLI, the Work Explorer. Only the host's guardrails differ.

## Scene goal

An empty Azure DevOps Git repository named `hello-modules` exists in a scratch project, and it
is cloned and open in VS Code, with the Azure CLI able to open pull requests against it.

## Starting state

- Scene 1 (either take) finished.
- Signed in to Azure DevOps in the browser, on an organisation you are willing to have on
  camera — see the warning below.
- VS Code shows the welcome screen; nothing cloned.
- OBS scenes used: `Browser`, then `Editor`.

> ## Use a scratch organisation, not your employer's — and turn on public projects first
>
> The Azure DevOps UI puts the organisation name in the URL, the breadcrumb, and the project
> picker, and the project picker lists **every project you can see**. On a real work
> organisation that is a leak in three places at once, and cropping will not save you because
> the URL moves.
>
> Create a **new, empty organisation** for this recording. Then, before beat 1, go to
> **Organization Settings** > **Policies** and turn on **Allow public projects** — the
> [README's privacy rule](README.md) forbids a private repository on screen, including this
> one, so the scratch project must be public.
>
> If you cannot create a fresh organisation, or your tenant will not allow public projects,
> **do not record this take.** Both are hard stops; relaxing the privacy rule is the
> operator's call, not this script's.

---

## Beat 1 — Create the project and repository *(Part 2 step 2, ADO equivalent)*

**Do.** In the scratch Azure DevOps organisation: **New project**, name it `hello-modules`,
visibility **Public**, **Advanced > Version control = Git**, **Create**. Then **Repos** —
the project's default repository is already named `hello-modules`.

**Say.** "On Azure DevOps you create a project first, and the project comes with a Git
repository of the same name. I'm making it public purely so it's safe to have on camera —
unlike GitHub's free plan, Azure DevOps branch policies work perfectly well on a private
project, so on your own machine choose whichever you actually want."

**See.** The **Repos > Files** view for `hello-modules`, showing an empty repository with Azure
DevOps' "clone to your computer" panel, and a **Public** badge beside the project name.

**If this fails on camera.** If **Public** is greyed out or absent on the New project form,
the organisation policy was not turned on — go back to **Organization Settings** > **Policies**
> **Allow public projects**. Do not fall back to Private and keep recording.

---

## Beat 2 — Give it a first commit *(Part 2 step 1, ADO equivalent)*

**Do.** In the empty-repo panel, choose to add a **README**, and initialise the repository.

**Say.** "Give it a README so there's something to clone — the GitHub version ticked the same
box."

**See.** **Repos > Files** shows `main` with one file, `README.md`.

**If this fails on camera.** If the branch is called `master`, change it in **Project Settings
> Repositories > your repo > Branches**, or say the real name out loud and use it everywhere
the tutorial says `main`.

---

## Beat 3 — Copy the clone URL *(Part 2 step 2, ADO equivalent)*

**Do.** Click **Clone** and copy the HTTPS URL.

**Say.** "Copy the clone URL. It has a shape worth recognising — `dev.azure.com`, slash your
organisation, slash the project, `_git`, slash the repository."

**See.** A URL of the form
`https://dev.azure.com/{org}/{project}/_git/hello-modules`.

---

## Beat 4 — Clone it from inside VS Code *(Part 2 step 2)*

**Do.** In VS Code: `Ctrl+Shift+P` → **`Git: Clone`** → paste the URL → `Enter` → pick a
folder. Click **Open** on the notification.

**Say.** "Same clone as anywhere else — Command Palette, `Git: Clone`, paste, pick a folder."

**See.** The Explorer shows `hello-modules` containing `README.md`; the status bar reads
`main`.

---

## Beat 5 — Install and set up the Azure CLI for pull requests *(Part 2, ADO equivalent of Part 1 step 5)*

**Neither scene-1 take installs the Azure CLI** — both install `gh`, which Azure DevOps does
not use. That install belongs here.

**Do.** In the VS Code terminal, one at a time. First install and prove it resolves:

```bash
winget install Microsoft.AzureCLI
az --version
```

*(macOS: `brew install azure-cli`. Linux: follow the distro instructions at
[learn.microsoft.com/cli/azure/install-azure-cli](https://learn.microsoft.com/cli/azure/install-azure-cli).)*

Then, with **OBS on a scene that hides the sign-in code**:

```bash
az login
az extension add --name azure-devops
```

**Say.** "Where the GitHub version installed the GitHub CLI, you want the Azure CLI with its
`azure-devops` extension. That's what Dabbler drives when it opens a pull request for you.
Same as on GitHub, it's optional — without it, Dabbler pushes the branch and opens the
create-pull-request page in your browser instead."

**See.** `az --version` prints a block beginning `azure-cli` with a version number. `az login`
completes without error, and `az extension add` reports success (or that the extension is
already installed — also a pass).

**If this fails on camera.** `az` not found immediately after `winget install` usually means
the terminal has a stale `PATH` — open a new terminal and re-run `az --version` before
concluding anything.

**If this fails on camera.** If you cannot use `az login` — a policy-restricted tenant, for
instance — set a Code Read & Write personal access token in `AZURE_DEVOPS_EXT_PAT` **off
camera** and say that you did. Never show the token.

---

## Beat 6 — Close the scene *(Part 2, framing)* — **CUT**

**Say.** "An empty Azure DevOps repository, cloned and open, and a CLI that can open pull
requests against it. From here the Dabbler side is identical to the GitHub walkthrough — I'll
call out the policy differences as they come."

**See.** VS Code with `hello-modules` open and `README.md` the only file.

---

## Traceability

| Beat | Tutorial step |
| --- | --- |
| 1–3 | Part 2 step 1 and step 2's Azure DevOps parenthetical |
| 4 | Part 2 step 2 |
| 5 | Part 1 step 5, in its Azure DevOps form (`az` rather than `gh`) |
| 6 | Part 2's Azure DevOps callout — *"a GitHub walkthrough with ADO equivalents named"* |

The downstream substitutions in the table at the top of this file cover the tutorial's
remaining Azure DevOps parentheticals: Part 3 step 5, Part 4 steps 6 and 9, and Part 5 steps
1, 3, and 4.
