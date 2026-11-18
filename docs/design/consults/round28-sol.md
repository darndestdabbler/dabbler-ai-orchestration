## 1. The goal, in two sentences

Dabbler turns a brief into reviewable, versioned work through small AI-led sessions, repeatable checks, independent review and explicit human decisions. Its boundary is work with authoritative text sources and inspectable changes: music scores, slide markup, diagram definitions and SVG can fit, provided someone inspects the rendered result; binary-only authoring and automatic judgments of truth, usefulness or artistic quality are outside it.

## 2. One Dabbler or two

**One Dabbler. No light mode and no separate product.**

The three working repositories settle something the earlier rounds still treated as uncertain: the session engine is already substantially language-independent. Another language walk is no longer evidence that the general mechanism works. It is useful only if it exercises a particular untested path, such as bootstrap misclassifying PowerShell.

But “ask the project type, then tailor the instructions” is **not sufficient**. Instructions cannot supply source material the reviewer never receives. Nor can they create a trustworthy record of human acceptance. Those are evidence and recording problems, not vocabulary problems.

If code branches on the kind of work anywhere, make that place **bootstrap’s selection of planning guidance**. Do not branch the session engine or weaken its gates for “creative” work. What checks run, what evidence review needs and whether human acceptance is required should follow the work’s declared requirements—not a software/document/creative label.

The useful distinction is not “rigorous versus light.” It is:

- What can a program establish?
- What can an independent model assess from supplied evidence?
- What must a person decide?

Round 26 was right to demand a document walk before permanent scaffold changes. Its proposed scratch procedure is now the wrong first experiment: the documentation repository answers a real need and exposes the harder problem of checking claims against external sources.

I have not inspected the implementation. I am relying on the source findings supplied here. Reviewer-context delivery and human-acceptance events below are proposals, not claims about existing capabilities.

## 3. A person’s review as the test

**Yes, record human acceptance. Keep it separate from mechanical checks and model review. Do not build checklist-editor integration yet.**

### Ask something small

At an agreed acceptance milestone, ask:

> At revision X, is this work usable for [the agreed purpose], subject to the listed limitations? What must change before you would accept it?

Support that with three to five concrete questions derived from the requirements. For the documentation pack:

- Can a developer follow the documented setup and run the relevant checks?
- Does the architecture account match how the solution actually works?
- Can a developer locate and plan a representative change without relying on undocumented maintainer knowledge?

The AI may draft these questions. The person should agree them before doing the work they will judge. Otherwise the AI can quietly lower the acceptance bar to match its output.

Start with questions in the plan, not generated JSON. The existing editor becomes useful when a real review needs grouped items, feedback and resumption across sittings. Do not require it merely because it exists.

### Review at milestones, not every close

An ordinary session may close with **no human acceptance recorded**. Say so plainly.

Require acceptance where the person intends to rely on, publish or hand over the work. For the documentation repository, that is the first usable documentation pack. A separate review session is appropriate if the review itself takes substantial work; a separate session is not a prerequisite for every approval.

### Make failure actionable

A failed item becomes one of:

- a concrete correction in the current session, if still open and small;
- a numbered remediation session;
- an explicitly accepted limitation, if the person changes the requirement.

A preference is not automatically a defect. A rejection must say what prevents the intended use.

### Let the router record the decision

Add a small, person-facing acceptance action. The router records:

- the artifact revision reviewed;
- the questions or criteria used;
- the person’s stated identity;
- accepted or changes requested;
- feedback and acknowledged limitations.

This is a **human decision event**, not a replacement for the framework’s verdict. It must not overwrite failed checks, reviewer findings or suite results. Local attribution is not proof of identity; do not imply otherwise.

If acceptance is required before proceeding, a waiver may permit proceeding after rejection or without review. The record must retain both facts: acceptance was not obtained, and a person authorised continuation. Later substantive edits invalidate acceptance for the changed work.

The authoring AI must not be able to establish human acceptance merely by writing “the user approved.” Use an explicit person-facing confirmation. A saved checklist could later supply responses, but importing it must not silently confer approval.

This keeps the ceremony small: one useful decision at a real handover, bound to an actual revision. Build that narrow record after rehearsing it in 339. Do not build a general human-testing subsystem.

## 4. The documentation repository for an existing .NET solution

### Refer to an immutable source baseline

Commit a short source-reference file containing:

- code repository URL or approved internal identifier;
- full commit hash;
- relevant solution and directory paths;
- the explicitly supplied local checkout path.

Use a **read-only sibling checkout at that commit** for the first walk. The sibling path is a convenience; the repository and commit are the provenance. Do not search neighbouring folders automatically.

A submodule adds little to this first trial. Use one only if the operator already wants its checkout and update behaviour. Never document against an unrecorded moving `main`.

Check the source pin before each session. Updating it is an explicit documentation change, with affected claims reconsidered.

### Make mechanical checks honest

Useful checks include:

- required files and sections exist;
- internal documentation links resolve;
- declared source paths exist at the pinned commit;
- explicitly recorded type or member references resolve;
- quoted source extracts match the pinned files;
- documented commands run under the stated prerequisites;
- diagrams or other generated outputs render successfully.

Do not promise “every type and member mentioned exists” using text search. Accurate symbol checks may need compiler-aware tooling. Start with explicit source references and add symbol checking only where it earns its cost.

A documentation suite can legitimately collect link, reference, rendering and example checks. Running the source solution’s build or tests can establish that a documented command works against the baseline. It does **not** establish that the prose accurately explains the design.

If no document suite exists yet, retain the existing “inapplicable” result. Do not invent a dummy suite to make the record look stronger.

### Give the reviewer evidence, not just pointers

For each bounded review, supply:

1. The diff and applicable requirements.
2. Relevant brief material.
3. The source baseline identity.
4. The actual relevant source and configuration.
5. Relevant unchanged documentation that the changes must agree with.
6. Known uncertainties and deliberate omissions.

A repository URL, commit hash or sibling path alone gives the reviewer no usable evidence unless it can actually retrieve and read the material.

For the first walk, use the already-known plan input: put a small evidence appendix in the session’s plan section, with verbatim source extracts and their pinned locations. Mechanically check that the extracts match. This is a trial arrangement, not a recommendation to turn every plan into a source archive.

Do not substitute the authoring AI’s summary of the code for the code itself. If broader context is needed, let the reviewer request it or report that the claim was not assessed. Missing evidence is not successful accuracy review.

A later context-delivery change should be narrow: named review inputs, resolved at recorded revisions, supplied to the reviewer and listed in the record. No general retrieval platform is needed.

### First six documentation sessions

Each should remain three to six steps.

| Session | Useful output |
|---|---|
| **1. Baseline and orientation** | Purpose, source pin, solution/project map, entry points, major responsibilities, glossary and an explicit unknowns list. Include one small, source-backed runtime path to test the documentation method early. |
| **2. Build, run and diagnose** | Prerequisites, restore/build/test commands, local configuration, secret handling, startup and debugging. Record which commands were actually exercised and what remains blocked. |
| **3. Architecture through real paths** | One or two representative flows through UI, application logic, persistence and external systems. Explain boundaries and dependencies with concrete source references. |
| **4. Database access** | Actual libraries and patterns, connection ownership, query placement, transaction boundaries, migrations and relevant test arrangements. Distinguish observed conventions from recommendations. |
| **5. UI and integration conventions** | UI frameworks and tools, component/page structure, navigation, state, validation and service calls. Trace a representative UI change to its implementation and checks. |
| **6. AI development handover** | A concise change guide: where to start, constraints, commands, test selection, dangerous areas and unresolved questions. Have a maintainer or second AI use it to locate and plan a bounded change in a disposable checkout. Review the resulting pack for acceptance. |

The sixth session is the practical test of the stated purpose. A large collection of accurate pages can still fail to help an AI make a safe change.

### Keep the seeded error

**Keep it, but make it a fair source-accuracy test.**

Seed one consequential false claim in the documentation diff. For example, describe two operations as atomic when the supplied implementation clearly commits them independently. Supply the source needed to disprove it, without labelling the error.

Record whether it was found and what evidence the finding cited. Correct it before accepting the documentation. One successful detection proves that this case worked, not that the reviewer reliably catches factual errors.

The old plan’s interest in unchanged sections remains valid, but do not expect a diff-only review to discover an arbitrary error outside its supplied context.

## 5. Sessions 339 and 340 rewritten

### 339 — Walk a real documentation session against pinned code

1. Establish the separate repository, source pin, authorised source access and six-session documentation plan.
2. Run one bounded session to close, producing an orientation page with one high-level and one lower-level source-backed explanation.
3. Exercise the seeded false claim during review, recording exactly what evidence the reviewer received.
4. Rehearse the small human-acceptance review without claiming the router already records it.
5. Write findings, including operator effort and barriers for staff; fix only small, obvious framework defects.

Do not make 339 produce the whole documentation pack. Its purpose is one real, complete cycle.

### 340 — Repair the demonstrated review gap and repeat the case

Use 339’s evidence to make the smallest necessary reviewer-context change, if the plan appendix was insufficient. Test that the intended material actually reaches the reviewer, then repeat the bounded review and record the result.

Keep the PowerShell/R/shell extension correction as a small maintenance patch with bootstrap regression tests. **Drop the full PowerShell closure walk.** The three working repositories already establish language-independent execution; the remaining PowerShell question is primarily classification and onboarding.

One correction to rounds 25 and 26: “mostly prose” is not a sound reason to treat `.rmd` or `.qmd` as evidence of no executable work. Both can contain executable code. They can remain outside this patch, but their omission must not become a claim that a repository needs no code checks.

Give the human-acceptance event its own short implementation session rather than hiding another design inside 340. If necessary, move the later session numbers and release. A four-session release envelope is not a reason to combine unrelated changes.

### Should 341 wait?

**Not for a second genre.** One successful documentation walk is enough to remove code-only assumptions and ask a short, general opening question.

It should wait for a credible source-backed review path. Its document guidance must also stop implying that documents have no useful suites: suites may be absent, but links, references, examples and rendering can warrant them.

Do not add genre-specific scaffolding or claim support for creative work from this trial. Documentation about code is still close to Dabbler’s established users and working methods. A blog post or other trial would test a different question, not complete a compulsory checklist of genres.

## 6. What would make this fail

**False assurance.** Structural checks pass, another model reads the prose without adequate sources, and the resulting record looks like factual verification. Calling human acceptance a test does not repair this if the person merely trusts the green result. Keep the evidence, actual results and human decision separate.

**The process costs more than the work.** Every short draft acquires compulsory checklists, invented commands, remediation rounds about taste and a git ceremony staff do not understand. This is where a “general Dabbler” would lose adoption. Start with developers and technical writers already comfortable in VS Code and git. If a useful session still needs continual operator rescue, remove obligations before building another interface.