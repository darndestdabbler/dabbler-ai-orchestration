# Video walkthrough — scene scripts

Six scenes, 1:1 with the six parts of [`hello-world.md`](../hello-world.md), plus two
alternate takes. Each script is written to be **followed live while recording**: every beat
carries the literal action, the words to say, and the literal result to wait for.

## Scene order

| # | Script | Tutorial part | Finished length |
| --- | --- | --- | --- |
| 1 | [`scene-1-install-and-verify.md`](scene-1-install-and-verify.md) | Part 1 | ~6 min |
| 2 | [`scene-2-create-and-clone.md`](scene-2-create-and-clone.md) | Part 2 | ~3 min |
| 3 | [`scene-3-dabbler-setup.md`](scene-3-dabbler-setup.md) | Part 3 | ~8 min |
| 4 | [`scene-4-first-module.md`](scene-4-first-module.md) | Part 4 | ~18 min |
| 5 | [`scene-5-second-module.md`](scene-5-second-module.md) | Part 5 | ~12 min |
| 6 | [`scene-6-pr-and-merge.md`](scene-6-pr-and-merge.md) | Part 6 | ~6 min |

**Finished runtime ≈ 53 minutes.** Recording takes far longer — the AI sessions in scenes 4
and 5 run for several minutes each in real time, and every script marks where to cut.

Scenes 1–4 are a complete solo video. If you only publish those four, end on scene 4's
closing line — the tutorial's own **"Solo repositories can stop here."**

## Variant matrix

| Alternate take | Replaces | Also changes | Rejoin point |
| --- | --- | --- | --- |
| [`scene-1-alt-direct-api.md`](scene-1-alt-direct-api.md) | Scene 1 entirely | Scene 3 beats 3–5; the "paste into `copilot`" mechanic in scenes 4–6 | Scene 2 beat 1, unchanged |
| [`scene-2-alt-azure-devops.md`](scene-2-alt-azure-devops.md) | Scene 2 entirely | Scene 3 beats 11–12; scene 4 beats 14 and 19; scene 5 beats 6–7 | Scene 3 beat 1, unchanged |

Each alternate take names its replaced beats and its rejoin point again at the top of its
own file — you do not have to hold this table in your head while recording.

The two takes are independent: a viewer on Azure DevOps with direct API keys watches
`scene-1-alt-direct-api`, then `scene-2-alt-azure-devops`, then the main scenes 3–6 with the
substitutions each take lists.

## What must be on screen

- **VS Code, maximised, one window at a time.** When a beat happens in a second window
  (scene 4 uses a worktree window), the script says so and you switch on camera.
- **The Work Explorer**, open in the Activity Bar, whenever a Dabbler action runs.
- **The integrated terminal** (**Terminal > New Terminal**), not an external one — every
  terminal beat in these scripts assumes it is docked inside VS Code.
- **The browser**, full screen, for GitHub beats. One tab.
- **Toasts and modal dialogs long enough to read.** Several beats expect a specific toast;
  if it auto-dismisses before you finish the sentence, re-record the beat rather than
  narrating over an empty screen.

## What must never be on screen

Treat this as a hard checklist before you hit record, and again before you publish.

- **Any credential.** No `gh auth token`, no personal access tokens, no `DABBLER_*` values,
  no `.env` file, no `~/.copilot/` contents. The direct-API take sets keys **off camera**
  and only ever shows that a key is *present*, never what it says.
- **Real organisation or employer names.** Use a personal account and a repo named
  `hello-modules`. Check the GitHub avatar menu, the repo breadcrumb, and the clone URL.
- **Anything but the throwaway repository you created for this recording.** GitHub's own UI
  lists your other repos in the "New repository" owner dropdown and on the dashboard — start
  the scene from the repo page, not the dashboard. Azure DevOps' project picker lists every
  project you can see, which is why the ADO take insists on a brand-new organisation.
- **Private repositories — including the throwaway one.** Both takes create it **public**: on
  GitHub because branch protection needs a public repo on the free plan, and on Azure DevOps
  because of this rule. If your Azure DevOps organisation cannot allow public projects, **do
  not record that take** — relaxing this rule is the operator's call, not a script's.
- **Your real email address**, which `git config user.email` and commit hovers will show.
- **Browser bookmarks bar, open tabs, history dropdowns, and profile pictures.**
- **OS notifications.** Turn on Focus Assist / Do Not Disturb before recording.
- **Editor tabs from other projects**, and the VS Code **Recent** list on the welcome page.

## OBS setup

**Scenes** (OBS scenes, not tutorial scenes — one each, so you can switch on camera without
re-cropping):

| OBS scene | Sources |
| --- | --- |
| `Editor` | Window Capture → the main VS Code window |
| `Worktree` | Window Capture → the second VS Code window (scene 4 onward) |
| `Browser` | Window Capture → the browser, single tab |
| `Full screen` | Display Capture — only for the Command Palette, which can render outside the window capture on some setups |
| `Privacy` | **No capture at all.** One Colour Source (or a title card image) and nothing else. Set this up *first* — several beats switch to it while a device code, a sign-in page, or a token is on your real screen, and a scene that captures anything defeats the point. |

**Sources and settings:**

- Capture at **1920×1080**, 30 fps. Everything in these scripts is legible at that size with
  the VS Code font at 14 pt or larger — set the font *before* recording, not after.
- **Microphone with a noise gate.** The AI-session beats have long quiet stretches.
- **No webcam overlay in the bottom-right** — that is where VS Code shows its toasts, and
  several beats expect you to read one.
- Use **Window Capture, never Display Capture**, for the editor and browser, so a stray
  notification on another monitor cannot land in the recording.

**Every beat that touches a credential names the `Privacy` scene by name** — the Copilot CLI
sign-in, `gh auth login`, `az login`, and the direct-API take's agent sign-in. Switch to it
*before* the credential appears, not after you notice it.

**Before the first take:** do a 30-second test recording, play it back, and confirm the
terminal text is readable, the toast in the bottom-right is not covered, and switching to
`Privacy` shows a blank slate rather than your desktop.

## The beat format

Every beat in every script has the same four parts:

- **Do.** The literal action, and the window it happens in. Commands are copy-pasteable.
- **Say.** Speakable narration. Written to be read aloud at the pace of the action, not
  recited before it.
- **See.** The literal expected on-screen result. If you do not see it, stop — do not
  narrate past it.
- **If this fails on camera.** Present only on beats with a known failure mode. It tells you
  what to do without leaving the scene.

Beats that wait on something asynchronous are marked **WAIT** and say what you are waiting
for and roughly how long. Beats that end a recordable take are marked **CUT**.

Every beat cites the tutorial step it performs, like *(Part 4 step 3)*. A beat with no
tutorial step behind it does not belong in the video.

## Rehearsal

These scripts were dry-run end to end by a human against a real GitHub repository and a real
Copilot seat before they were published — that walk is what
`106-hello-world-tutorial-simplification-uat-checklist.json` records. Re-run that checklist
if you change the tutorial, because a script beat that no longer matches the product is a
defect in the script, not operator error.

**Next after the video:** [Release and recovery operations](../release-and-recovery.md) is
not scripted here. It is a reference doc, not a walkthrough.
