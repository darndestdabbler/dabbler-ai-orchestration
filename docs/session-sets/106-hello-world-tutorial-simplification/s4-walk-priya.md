# S4 walk — your card (you are **Priya**)

You own the module `greeter`. Your teammate is **Sam**, on his own machine, and he owns
`app` — which imports your greeting. Send him
[`s4-walk-sam.md`](s4-walk-sam.md); it is the only document he needs.

**The tutorial:**
[docs/tutorials/hello-world.md](https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/tutorials/hello-world.md)

---

## What you hold that Sam does not

| Document | Why |
| --- | --- |
| [`hello-world.md`](https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/tutorials/hello-world.md) | The walkthrough. **You do Parts 1–4 alone**, then Parts 5–6 with Sam. |
| `106-hello-world-tutorial-simplification-uat-checklist.json` | The 13 walks. Open it in the [checklist editor](https://darndestdabbler.github.io/uat-checklist-editor/). **You fill in every Result / Feedback / Passes.** Sam never touches it. |
| [`../../tutorials/video/`](../../tutorials/video/) | The nine scene scripts. The walk doubles as their dry run — follow the scene each walk names, **as written**. |

**This is a test of the instructions, not of you.** A step that cannot be performed as
written is a defect in the document. Record it and move on; do not improvise a fix and then
mark the item passed.

## Before you start

1. **Extension 0.46.0 or newer must be live on the Marketplace.** Confirm on the extension
   page. If it still reads 0.45.0 the publish did not land — **stop**, because Walk 5 tests
   scaffolded templates that only exist in 0.46.0.
2. **Do not pre-install the extension or pre-authenticate the Copilot CLI on your machine.**
   Walk 1 exists to install and authenticate them, and a pre-provisioned machine cannot walk it.
3. A throwaway **public** GitHub repo you can create, and Sam's handle to invite.
4. **Sam's Copilot smoke test, in writing, before the walk day.** He has a seat; his card asks
   him to send you what `copilot -p "Write PI to 10 decimal places" --model claude-sonnet-4.6`
   prints on *his* machine. Having a seat and having a working seat on that machine are
   different claims — Session 1 of this set found your own seat six CLI versions past the
   pinned one. Two minutes of his time now, or an hour lost at handoff 3.
5. About two hours.

## Two machines — three things in the checklist do not apply to you

The checklist was written for one person playing both roles on one machine. You are not doing
that, so **skip these and record in Walk 13 that you skipped them, and why**:

| In the checklist | On two machines |
| --- | --- |
| `THE ONE-MACHINE STAGING TRAP` in `Notes`, and every `gh auth switch --user …` in Walks 7, 8, 9 | **Does not apply.** You and Sam each have your own `gh` login on your own machine. Where a walk says to switch, just run `gh auth status` once and confirm it is you. |
| "a SECOND GitHub account … in a separate browser profile" | Sam is a real second person in his own browser. |
| "clone the repository into a SECOND folder" (Walk 7 step 2) | Sam clones normally, on his machine. |

Everything else in the checklist stands.

## Your run, in order

**Walks 1–6 — you are alone.** Parts 1–4 of the tutorial. Sam is not involved and does not
need to be waiting. Walk 6 ends on the tutorial's line **"Solo repositories can stop here."** —
stop there and answer Walk 6's question honestly before going on.

**Then the two-person half. Four points where you wait on Sam or he waits on you:**

| # | You do | Then |
| --- | --- | --- |
| 1 | Invite Sam (Part 5 step 1). | **Ping Sam.** He accepts, clones, and sets his machine up. He tells you when he is ready. |
| 2 | Declare `app`, edit `docs/modules.yaml`, uncomment the two CODEOWNERS lines with **real** handles, raise **Require approvals** to 1, and open the PR (Part 5 steps 2–5). | **Ping Sam to approve it.** You raised approvals to 1 one step earlier, so you cannot approve your own PR. Merge after he approves. |
| 3 | Nothing — Sam runs `app`'s plan and decomposition sets. | **He pings you to approve his PR.** It is all planning files, so no CODEOWNERS rule matches and nobody is requested automatically. Approve it by hand. |
| 4 | Nothing — Sam runs the implementation session in a worktree and opens the PR. | **You are requested automatically.** Read the diff, approve. He merges and finalizes. Then you pull and run the composed program (Part 6 step 3). |

Handoff 4 is the one to watch: **Priya should already be listed under Reviewers without anyone
adding her.** If nobody is requested, the handles in `.github/CODEOWNERS` are wrong — GitHub
declines silently to route to a handle that does not exist or lacks write access. That is a
real finding; record it.

Finish with Walk 10's five checks, then Walks 11–13.

## One budget note

Sam runs three of the walk's AI sessions — `app`'s plan, decomposition, and implementation —
and they run on **his** Copilot seat, not your capacity. The only spend on your side is
whatever S4's own verification costs.
