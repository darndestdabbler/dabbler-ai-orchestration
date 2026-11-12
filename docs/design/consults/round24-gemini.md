### 1. The black-box row

The gap is real. The current cell uses passive voice ("shows the work... leaves a plan") and misses the two active jobs a sceptical lead cares about: watching live and auditing later.

**Proposed wording (41 words):**
> You can monitor the work live in the Work Explorer and terminals, and audit the session afterwards from the plan, log, decisions, and transcript committed to the repository. ([The record](https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/guide/the-record.md#under-the-sessions-root-committed-with-the-code))

**Is "audit" fair?** Yes, provided you say "audit the session" rather than "audit everything the AI did." Because the transcript omits the AI's terminal conversation and defaults to `outline` (omitting passing job outputs), you are not auditing the AI's keystrokes. However, in software engineering, auditing a change means verifying the requirements, the diff, the test results, the review findings, and the sign-offs. The committed record and outline transcript hold all of those.

---

### 2. The other six rows

* **Row 2 (Not adequately evaluated):** **Change.** *Leaves out:* What happens when the AI disagrees with a false positive, and what happens if all 7 rounds fail. *To:* "A model from a different provider reviews every session. The two work through findings, fixes, and evidence-backed disputes for up to seven rounds before stopping for a person. ([Two models](https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/guide/verification.md#findings-fixes-and-disputes))"
* **Row 3 (AI cheats):** **Keep.** It hits the exact mechanism a sceptic wants (independent execution + SHA-256 tree hashing) and carefully says "cannot *easily* cheat."
* **Row 4 (Does more than asked):** **Change.** *Overclaims:* "Blocked by the framework" implies a deterministic file-scope lock, whereas `discipline.md` shows the engine declares its own step files and the *reviewer* catches non-goal violations. *Leaves out:* That each step must declare its files upfront and the framework rejects undeclared edits. *To:* "The AI must declare which files each step will touch, and the framework rejects undeclared edits. Reviewers also flag work that violates the plan's non-goals. ([What the reviewer is sent](https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/guide/verification.md#what-the-reviewer-is-sent))"
* **Row 5 (Untested code):** **Change.** *Overclaims:* "Every changed file that has no test" is broader than the actual heuristic in the guide ("no test named after it"). *To:* "The framework runs the automated tests before any code is committed, and the reviewer is shown every changed source file that has no test file named after it. ([Tests](https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/guide/verification.md#what-the-reviewer-is-asked-about-tests))"
* **Row 6 (Gets stuck):** **Change.** *Leaves out:* That the Mechanic runs *unattended by default* before a human is even bothered (`consult-and-mechanic.md`). *To:* "By default, a fresh AI (the **Mechanic**) tries one small fix within strict limits. If it stays stuck, you can **Consult with AI** or decide yourself, and the decision is recorded. ([When it gets stuck](https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/guide/consult-and-mechanic.md))"
* **Row 7 (Only the AI that did the work can continue):** **Keep.** Plain, accurate, and answers the vendor/context lock-in fear directly.

---

### 3. Missing risks

The table is missing one major operational fear a sceptical developer has about giving an AI a terminal:

| Risk | What Dabbler does |
|---|---|
| AI runs destructive git or lifecycle commands | Checks run with no shell and no credentials. Commands that cancel, roll back, waive a stop, or force-close a plan are refused to the AI's terminal, and only the framework commits or pushes. ([The rules](https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/guide/discipline.md#the-verbs-that-are-a-persons)) |

---

### 4. The two front pages against each other

1. **Missing requirements on GitHub:** `README.md` says *"The listing says what else a session needs..."* instead of listing the 3 bullet points (Claude Code / Copilot CLI via winget, and 2 API keys or a multi-provider Copilot seat). A GitHub reader should not have to click over to the Marketplace just to learn the prerequisites.
2. **Unsupported claim on the listing:** Under *Get started*, `tools/dabbler-ai-orchestration/README.md` claims: *"An existing repository is recognised and kept as it is: the framework plans changes to its projects and leaves their layout alone."* Nothing else on the listing or in the five guide pages explains how brownfield recognition works.

---

### 5. The front pages against the guide

**Claims on the front pages that the guide contradicts or softens:**
* **Unreviewed code can land at the cap:** The Marketplace listing says *"commits only what passed"* and *"the review is not optional."* But `verification.md` (*At the cap*) reveals **`REMEDIATED_AT_CAP`**: if round 7 still has blocking findings and the author's final fix touches the flagged lines, *"The work may land, and the change log says in so many words that it lands unreviewed."* To a sceptic, discovering this in the guide feels like a hidden loophole.
* **Transcript contents:** `the-record.md` says the transcript carries *"every line the framework printed, each review round with its findings, the test runs, and the jobs."* By the brief's facts, the default (`outline`) only includes the output of jobs that *failed*, not passing ones, and omits the AI's own terminal conversation.

**Important mechanisms in the guide that the front pages never mention:**
* **No shell, no credentials during checks (`discipline.md`):** Step checks run *"with a time limit, in a built environment that holds no credentials"* and *"with no shell."*
* **Read-only checks (`discipline.md`):** If a check modifies the working tree while measuring it, the framework fails the check.
* **Three-strikes stop (`discipline.md`):** Three rejected reports on a single step halt the session for a human.
* **Auxiliary Reviewer adjudication (`verification.md`):** Deadlocked disputes at the 7-round cap can be sent to a *third* provider (`dabbler verify adjudicate`).

---

### 6. What a reader still cannot tell

1. **How the authoring AI is sandboxed while editing:** The framework runs *checks* with no shell or credentials, but the authoring AI runs in its own CLI terminal (`claude` or `copilot`). What stops the authoring AI from running `git commit`, editing `.dabbler/` files directly, or running arbitrary shell commands during its turn? (Suspect it is only prompted not to, and caught afterwards by tree-state checks, but a sceptic will look for this immediately.)
2. **What a session costs and how long it takes:** With up to 7 review rounds, step checks, test runs, and up to two 20-minute unattended Mechanic attempts, how many tokens or minutes does a typical session burn?
3. **Git workflow and branch safety:** Gate `pushed_to_remote` requires pushing before a session closes. Does Dabbler commit and push straight to `main`/`master`, or does it create feature branches and pull requests?
4. **Language and test-runner support:** The walkthroughs mention .NET and Java (Maven), and the repo is TypeScript. Which test runners can "declare how to run a selection" of tests named after changed files, and how is that configured?
5. **Privacy and data egress:** Since review requires *two* AI providers (and adjudication a third), a company's source diffs are sent to at least two external vendors. Can enterprise endpoints (Azure OpenAI, AWS Bedrock, Vertex) be configured?

---

### 7. The smallest change set

1. **EDIT — `README.md` & `tools/dabbler-ai-orchestration/README.md` (Risks table, Row 1):** Replace the right-hand cell with the 41-word monitor/audit wording from Section 1.
2. **EDIT — `docs/guide/the-record.md` (*The transcript*):** Clarify the `outline` default vs `full`, and state that the AI's own chat is not in the transcript: *"By default (`outline`), it carries the plan, the framework's log, the review rounds, the test runs, and the output of any job that failed (`full` adds passing job outputs; neither includes the AI's own terminal chat)."*
3. **EDIT — `README.md` & `tools/dabbler-ai-orchestration/README.md` (Risks table, Row 4):** Replace *"Out-of-scope work that AI does anyway is blocked by the framework"* with *"The AI must declare which files each step will touch, and the framework rejects undeclared edits. Reviewers also flag work that violates the plan's non-goals."*
4. **EDIT — `README.md` (*Install*):** Replace *"The listing says what else a session needs..."* with the actual two-bullet requirements from the Marketplace README (CLI tool + two provider keys/Copilot seat).
5. **EDIT — `tools/dabbler-ai-orchestration/README.md` (Intro paragraph):** Qualify *"commits only what passed"* or mention the cap in Row 2 so `REMEDIATED_AT_CAP` in `verification.md` does not read like a contradiction.
6. **EDIT — `README.md` & `tools/dabbler-ai-orchestration/README.md` (Risks table, Row 6):** Mention that the Mechanic tries one small fix unattended by default before stopping for a person.
7. **DO NOT MAKE — Adding the 8th risk row (destructive commands) to the front-page tables:** Seven rows is already at the limit of what a reader scans; fold "checks run with no shell or credentials" into Row 3 (*AI cheats*) only if you have room, otherwise leave it to `discipline.md`.
8. **DO NOT MAKE — Explaining git branching, cost, or test-runner setup on the front pages:** Address those in `driving-a-session.md` or `quick-start.md` so the landing pages stay tight.