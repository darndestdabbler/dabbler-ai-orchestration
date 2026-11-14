## 1. **Configuration with no folder.**

Sound. It addresses a real failure at the point where the person can prevent it. Label the group **“Defaults for this machine”**, and show when a choice is still missing.

The likely misunderstanding is that changing a machine default changes every repository.

Use this sentence:

> “These defaults apply when a repository has no choice of its own; they do not replace choices already saved there.”

Use that in the confirmation too, rather than promising that every solution “starts with” the choice. That promise needs qualification for existing repository settings.

Test both cases: a repository with its own choice and one without.

## 2. **The buttons.**

Ship these labels:

- No folder open, creating somewhere new: **Set Up a New Workspace**
- No folder open, using something existing: **Open a Folder or Repository**
- Folder open, Dabbler not set up: **Set Up Dabbler in This Folder**

“Solution” is no longer the right general word. It has a specific meaning for some developers and little meaning for someone writing legislation. Use **workspace** for the working container, and **work** for what the person is making. Keep “solution” where it names an actual .NET solution.

Putting the buttons in the Work Explorer follows from the welcome-view constraint. Make sure the Configuration view also tells a newcomer where to go next.

## 3. **Session 1’s two questions.**

I would shorten the first:

> “What are you making? Describe it in your own words. It might be a program, a document, a creative work, or something else.”

The four categories are useful examples, not a useful boundary. A research report can contain code; a blog post can be either professional or creative. Do not require one exclusive answer.

For the second:

> “Who is it for, what should it achieve, and what would make a first draft useful?
>
> What material should we start from? Tell me where it is.
>
> What is already decided or required, such as a deadline, format, length, style, language or architecture?
>
> Would you like to work through the idea together before we plan? This is usually helpful.”

What is missing from the proposed questions is an explicit audience, purpose and useful stopping point. Those appear later as plan requirements but should come from the person.

The question too many is the compulsory category choice before the description.

Also, a build file does not answer what the person wants to make. Offer an inference for confirmation: “This folder contains a Java application. Is that what we are working on?” They might be writing its operating procedure.

## 4. **One text or four.**

Use one scaffolded text, with conditional instructions after the answers.

Four texts create four maintenance paths and force an early classification that may be wrong. They also move a substantive planning question into set-up, where the person may only be choosing a folder.

A terminal user should get the same questions and the same opportunity to supply a brief. A VS Code pick list must not become the only route to the right plan.

One text need not mean asking every question mechanically. Read the supplied brief, summarize what is understood, and ask only about gaps or conflicts. Apply .NET or Java instructions because the agreed plan calls for them, not merely because a build file exists.

## 5. **Refinement.**

Keep initial refinement inside session 1. A session can span several sittings, so “one or more interactive sessions” need not mean several numbered framework sessions.

Say:

> “We can stop here and continue this session later. I will keep the agreed points and open questions in the brief.”

Do not require the person to declare the whole idea “settled”. Ask whether it is clear enough to plan the next useful draft.

If refinement itself needs research, experiments or separate decisions, session 2 can schedule those as sessions 3 onward, before drafting, followed by a planning session. Nothing needs insertion or renumbering.

The distinction should be clear: a conversation can continue within session 1; separately scoped work gets its own numbered session.

## 6. **Work that is not code.**

Ranked by what I would investigate first:

1. **Required controls.** I suspect a compile requirement or another code-only gate may stop closure despite an empty suite list. Check this first. No suite must not mean no evidence, but neither should it require a dummy test suite.

2. **Step checks.** Use commands with honest, limited claims: required files exist, the outline contains agreed sections, links resolve, or a document export succeeds. These establish structure and usability, not truth or literary quality. Record substantive acceptance in the review rather than disguising it as an automated test.

3. **Reviewer instructions.** Judge the diff against the brief, named sources, scope and stated draft standard. For documents, check unsupported claims, omissions and contradictions. For creative work, check continuity, voice and intended effect. Distinguish errors from preferences. Flag uncertainty rather than inventing supporting evidence.

4. **A meaningful end-to-end walk.** An outline-only first session proves little about drafting. Make the document walk produce and review actual prose. Exercise correction after a rejected review as well as successful closure.

## 7. **Text, not binary.**

Text as the reviewable source is sensible. “Word only at the end” is not enough for a policy office whose approval process happens in Word.

The smallest useful addition is an **early Word export**, using an approved template, followed by exports at review milestones. Check headings, numbering, tables and accessibility in the exported file.

State plainly which file is authoritative. If colleagues comment or make tracked changes in Word, provide a deliberate step to bring accepted changes back into the text source. Do not imply automatic round-tripping.

If that manual handoff is unacceptable, this workflow is not yet suitable for that office.

## 8. **Size and order.**

**330 is crowded**, chiefly because of the documentation sweep. Keep the behavior change, essential onboarding and tests together. Defer regeneration of the tutorial and deck unless they would otherwise give wrong instructions.

**331 is manageable** as a template change, but its behavior deserves more than string assertions. Check representative generated plans, including mixed work and a document inside a code repository.

**332 is too uncertain** for a bounded sitting. Two complete walks plus unknown fixes and release preparation are not five predictable steps.

Before finalizing 331, run a small no-code closure experiment. Then separate 332’s acceptance walks from any substantial fixes they discover. Do not publish broad support claims while a required path works only by bypassing a failed gate. Update the release scope if necessary.

## 9. **What you would cut, and the one thing the plan has not thought of.**

Cut the long genre lists, compulsory outline-only first session, and automatic final planning session for every deferred item. Record deferred work, but schedule more planning only when it serves an agreed next step.

The missing issue is **permission to send the material to the configured providers**.

A policy draft or source document may have different handling rules from ordinary development material. The cross-provider review sends material to a second provider too. Before importing it, tell the person which providers will receive it and require confirmation that those providers are permitted for that material. A Copilot seat alone does not establish that permission.
