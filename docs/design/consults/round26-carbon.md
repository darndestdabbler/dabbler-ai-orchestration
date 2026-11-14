### 1. Verdict, first

**Do part of it now and the rest later.** Ship session 330 now as its own release, then run the walks before writing session 331's templates.

The three changes that matter most:
1. **Do not ask non-technical drafters to run PowerShell checks.** Use the Node router already inside the extension (`dabbler check-file <path> <heading>`) so checks work on every OS and never trigger locked-down Windows execution policies.
2. **Walk prose and scripts *before* writing session 331.** Do not commit scaffolded text to `templates.ts` until you have seen how the cross-provider reviewer fails on prose.
3. **Require a stop after naming the AI providers, not a silent sentence.** On a government machine, reading a policy file into an external model before the user says "go ahead" is a data-spill trap.

---

### 2. The widening itself

**The case against:** A policy drafter or legislative counsel in a government shop lives in Word with Track Changes, legal numbering, and comments. Telling them Dabbler is for legislation invites them into git, Markdown, a terminal CLI, and a manual one-way copy-paste into Word with no round trip. Meanwhile, no human has ever closed a single prose session in Dabbler. On locked-down Windows machines, PowerShell checks may be blocked by Group Policy, and git diffs treat paragraphs as single lines unless wrapped. If a legislative drafter tries this on real work and hits a wall at review round seven or loses partner edits made in Word, trust with that office is burned permanently.

**Does it win?** It half wins. You should not advertise legislation, novels, or Word workflows in this release, because you have not tested real-world prose friction.

**The smallest version:** Keep the un-choking inside sessions 1 and 2 so a developer writing an SOP, design spec, or blog post in Markdown is not asked about database tiers. In the README and release notes, claim only what fits git natively: "programs in any language, and technical or plain-text documents kept in Markdown." Drop legislation, novels, and the manual Word copy-paste guidance until a real drafter has survived a whole document.

---

### 3. Is the evidence honest for prose?

**Verification or the look of it?** It is the look of it. Checking that headings exist proves nothing about substance, and a second LLM reading a diff checks plausibility and prompt compliance, not truth or legal validity. Calling that "verified" borrows false authority from compiler and test gates.

**What the reviewer must be told:** Without prose rules, a cross-provider reviewer will invent non-Minor findings on tone, word choice, and structure until it hits the seven-round cap. Suspicion to check: does the reviewer prompt define severity in code terms (bugs, broken contracts)? For prose, Major findings must be restricted strictly to:
- Missing a requirement stated in the session plan or brief.
- Contradicting the provided source material or an earlier section.
- Violating an explicit constraint (length, forbidden terms, format).
Style, pacing, and phrasing must be forced to Minor or excluded so the loop ends.

**What goes in the record:** Write plainly: `Suites: inapplicable (no executable tests). Step checks: file and heading presence only. Cross-provider review: checked against brief and source material; facts and external fitness not verified.`

---

### 4. What round 25 got wrong

**Reverse from "What was taken":**
- **Item 6 (PowerShell as the prose check).** `powershell -NoProfile -Command ...` is OS-specific, ugly in `session-plan.md`, brittle with quotes when spawned without a shell, and frequently restricted or audited by Group Policy on government Windows machines. Give the router a tiny built-in subcommand (`dabbler verify-prose` or similar) or `node -e`.
- **Item 8 (One sentence naming providers, blocking nothing).** Round 25 called a confirmation "ceremony." When an authoring AI reads a local file in the same turn it prints a warning, the data has already left the machine before the user can stop it. Printing the two providers and waiting for "yes" before reading external material is a boundary, not ceremony.

**Take from "What was not taken":**
- **Sol's closure experiment before session 331.** Reading `gates.ts` only proved the suite gate will not throw. It told you nothing about how the reviewer prompt behaves on prose, how `drive.ts` frames steps, or what the authoring model writes as checks. Running the walk *after* encoding the rules in 331 guarantees rework.

---

### 5. Session 1's text, read two ways

**As a newcomer at a terminal:**
Today's text loses them at: *"Offer the default -- an application tier that calls an API tier, and only the API tier talks to the database."* (In the new plan, they are lost if `session-plan.md` dumps the `.NET` IIS/Maven `{output}` wall of text right beneath their poetry prompt.)
Rewrite for the scaffolded instruction:
> Ask how the parts fit together. If they are building an application with a database, suggest keeping the user interface separate from the API that talks to the database. Otherwise, use the parts natural to their work, such as scripts, chapters, or sections.

**As the authoring model following one text with four branches:**
A single giant Session 1 prompt containing word-for-word questions, refinement loops, binary file rules, provider warnings, *plus* all the `.csproj`, `pom.xml`, `-Dhandoff.dir={output}`, and Word conversion rules will suffer attention bleed. Models regularly leak rules across branches in long conditional prompts (for example, asking a Python script author about handoff artifacts, or forgetting `brief.md`'s first-line rule after three sittings of conversation).

**How to build the text instead:** Keep `session-plan.md` short. Put the universal intake and refinement loop in Session 1. Move the heavy `.NET`/Java/Maven packaging and module rules out of `session-plan.md` into a reference file scaffolded alongside it (or printed by a `dabbler guide <kind>` command) that Session 1 and Session 2 read *only* after the brief says the work is `.NET` or Java.

---

### 6. The button

**Set Up New Project.** "Project" fits software, a policy, and a book, matches every existing doc, and spares session 330 a noisy twenty-file rename.

**The three-button arrangement:** Keep it. Two buttons with no folder (**Set Up New Project**, **Open Existing Folder or Repository**) and one button with an unconfigured folder open (**Set Up Dabbler in This Folder**) match the three states a user actually has.

---

### 7. What is hard to undo

1. **Scaffolded `session-plan.md` text (Highest cost).** Baked into every repository at set-up and kept forever. *Cheapest way to keep it changeable:* Keep `session-plan.md` minimal and delegate framework mechanics (check syntax, `.NET`/Java specifics, prose rules) to `dabbler` CLI help or runtime prompts provided by `drive.ts`, which upgrade automatically with the extension.
2. **Public promises about supported work.** Once policy drafters are invited in, pulling back looks like failure. *Cheapest way:* Under-claim in READMEs ("plain-text documents") while letting the session 1 prompt accept anything.
3. **`SOURCE_FILE` extensions in `detect.ts`.** Changing `.rmd` and `.qmd` (R Markdown and Quarto, which are mostly prose with code chunks) to `maintenance` means a repo of research papers starts in code-maintenance posture. Suspicion to check: does `maintenance` skip asking about audience, voice, and structure? *Cheapest way:* Leave `.rmd` and `.qmd` out of `SOURCE_FILE` for now, or let the build-file confirmation rule apply to `maintenance` too.
4. **`docs/planning/solution-plan.md` filename.** Minor technical debt, though harmless if left alone.

---

### 8. Order and release

**Ship 330 alone first?** Yes, as 3.34.0. It fixes an active field failure ("Copilot needs a model" before opening a folder), has zero dependency on prose support, and keeps the twenty-file UI/doc touch isolated if Keep-"Project" is overruled.

**Walk a document before rewriting session 1?** Yes. Discover what the reviewer prompt, step checks, and CLI output get wrong on prose *before* freezing the instructions in `templates.ts`.

**Order to run:**
1. **330** -> Release **3.34.0** (Configuration with no folder, button labels settled).
2. **332 (Walk prose manually)** -> Hand-edit a scratch `session-plan.md`, walk an SOP including a rejected review, record every stop, and build a cross-platform prose check helper + reviewer prompt adjustments.
3. **333a (Source list + walk scripts)** -> Add `.ps1`/`.sh`/`.r` (not `.rmd`/`.qmd`), walk the PowerShell repo, record stops.
4. **331 (Templates and docs)** -> Write the battle-tested Session 1 and 2 prompts and honest README claims.
5. **Release 3.35.0.**

---

### 9. The thing nobody has thought of

**Git diffs on unwrapped prose break line-by-line review and session resumption.** People and LLMs naturally write Markdown paragraphs as single long lines. When an authoring model edits three words in a 150-word paragraph, `git diff` shows the entire paragraph deleted and replaced. Cross-provider reviewers misread tiny edits as wholesale rewrites, raise false findings on untouched sentences in the same paragraph, and burn through the seven-round review cap. Worse, if a session spans sittings or commits, git history becomes unreadable for prose. If Dabbler supports documents, its prose guidance (or `.editorconfig`) needs semantic line breaks (one sentence per line) from draft one.
