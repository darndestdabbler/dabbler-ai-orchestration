## 1. Verdict: **start with changes**

The diagnosis is substantially right. Do not add a plan-reset verb or change rollback transcript preservation on this evidence. Amend the sessions before starting in three places:

1. **334: specify the answer-file lifecycle precisely.** Test instruction reissue, timestamp equality/coarse precision, refusal without ledger writes, and failed submissions retaining their source. Delete scratch files only after successful ledger validation and writing, using a containment check that accounts for symlinked directories. Describe `mtime` as a stale-file guard, not proof that the answer belongs to this instruction.
2. **335: distinguish an amendment from an approved amendment.** Show both versions, but tell the reviewer which is authoritative and what establishes approval. Explicitly preserve the start-commit-only rule for contract changes unless that control is deliberately redesigned.
3. **335: make section extraction fail safely.** Test the actual plan’s heading conventions, fenced Markdown, missing sections and duplicate session headings. For a scheduled numbered session, a missing or ambiguous section should stop planning—or require an explicit operator choice—not silently authorize “plan from the repository.”

## 2. Each of the five calls

### 1. Defer replacing a declared work plan — **Agree**

An additional recovery verb can wait; preventing accidental reuse is the smaller first intervention. However, justify this as avoiding a new recovery mechanism, not as making rollback costless: the excerpt shows rollback discarding working-tree changes and cleaning untracked files.

### 2. Show mid-session edits rather than freezing them out — **Agree with the direction; the planned rule is incomplete**

Showing both versions is better than silently substituting the working-tree version or concealing an approved amendment. But “changed during the session” does not distinguish operator approval from author self-authorization. The supplied `approvedContractChange` implementation deliberately does make that distinction: only the start commit grants contract-change authority. After 335, a reviewer could accept a newly inserted contract-change paragraph while the mechanical control still refuses it. Keep the dual display, add explicit precedence and approval instructions, and state that displaying changed text does not grant contract approval. No general mid-session approval mechanism is shown in the excerpts, so I cannot assume one already resolves this.

### 3. Leave cancelled-transcript preservation unchanged — **Agree**

The excerpt preserves pages already cancelled at `headNow`; it does not turn a completed page into a cancelled one, and the investigation’s concrete sequence puts the cancelled version back through a manual revert. That does not establish the alleged rollback defect.

### 4. Keep both the session section and the declared work plan — **Agree**

They serve different purposes: requirements versus execution declaration. Their disagreement is useful evidence; removing either would hide the failure rather than fix it. The plan ask already explicitly says the session plan outranks work-plan non-goals.

### 5. Do not write `sessions.json` when committing the plan — **Agree**

A prose-plan commit should not need to mutate router-owned execution history. The claimed status-title overlay is not included in the source excerpts, so I accept it as the orchestrator’s finding, not as independently verified code behavior.

## 3. What the plan misses

### A newly written file can still contain the previous session’s plan

A concrete sequence after 334:

1. Session 334’s changes are installed.
2. The author receives session N’s instruction.
3. It copies an archived session N−1 plan into the suggested `plan-s<N>.json`, or rewrites the old JSON there.
4. The file now has a sufficiently recent modification time.
5. `report` accepts it, and `stampAnswer` supplies session N’s identity.
6. Work proceeds from the wrong steps until review discovers the mismatch.

The excerpts establish that `stampAnswer` checks supplied stamp fields but does not establish the content’s origin. Session-specific filenames, deletion and freshness checks address the observed **unchanged leftover file** failure; they cannot establish semantic correctness.

I would not add a heavyweight provenance protocol in this release. If stronger instruction binding is wanted, use a router-issued correlation value preserved across reissues, while recognizing that even this cannot prove the plan’s content is correct. At minimum, narrow the release’s claim: it prevents submission of files predating the instruction, not every stale plan.

### A missing section still produces an unsupported declaration

A second concrete sequence:

1. A scheduled session’s heading is malformed, duplicated ambiguously, or omitted.
2. The new extractor returns nothing.
3. The planned author prompt explicitly says to “plan from the repository.”
4. The author chooses work that belongs to an adjacent or future session.
5. The reviewer receives “the plan has no section for this session” alongside the author’s declared work plan.

This removes the whole-file prompt explosion, which is good, but leaves an unauthorized-scope path open. With no session section, the reviewer cannot reliably establish what the numbered session was supposed to do. The plan should distinguish intentionally repository-derived work from failure to find an expected section.

### The author can still be given a different baseline from the reviewer

The supplied `planAsk` reads the working-tree plan; 335 changes the reviewer to read the start commit plus differences.

Sequence:

1. The session starts at commit A.
2. Before the plan instruction is issued, the working-tree section changes.
3. The author receives only that changed section and declares against it.
4. Review later receives A and the changed version, without a specified approval rule.

That behavior follows from the proposed reader choices; the scheduling opportunities between start and instruction issuance are not shown. Use the same baseline-and-amendment explanation in the initial plan ask, not necessarily in every step ask.

## 4. What the plan gets wrong or over-builds

### “One reader” does not automatically mean the right reading

Ending at the next heading of level three or above is sensible **if** session headings are level three and their internal headings are level four or deeper.

It changes existing behavior in consequential ways:

- A `### Acceptance criteria` heading currently included by `extractSpecExcerpt` would become outside the session.
- A `**Contract change.**` paragraph beneath that heading could cease to authorize a change.
- A heading-looking line inside a fenced Markdown example could truncate a regex-based reader even though it is not a document heading.

The heading regex definitions are not supplied, so I cannot verify supported opening-heading formats or fence handling. Inspect the existing plan corpus and test these cases. Do not require existing contract-control tests to remain unchanged if they encode the behavior being corrected; preserve their safety properties deliberately.

### Timestamp comparison needs boundary tests

The proposed tests cover “older” and “after,” but not equality or filesystem timestamp precision. A newly written file can have a rounded timestamp that compares as older than a millisecond-resolution instruction time. Conversely, equality is not proof of a fresh write.

Also test the reissue behavior the plan says it will investigate. An implementation assumption discovered during the session is not a substitute for a regression test. The driver’s reissue implementation is not supplied, so its current behavior remains unverified here.

### Consumption must follow successful acceptance

The excerpt shows `report` writing the ledger and saying “the driver reads it next.” That is not necessarily the same event as accepting the session’s declaration.

Define consumption as successful schema validation and durable ledger writing. A malformed, stale or otherwise refused answer must remain available for correction. Failure to delete a successfully consumed source must not turn an already-written answer into an apparent failed submission.

Per-session filenames and scratch cleanup are useful defenses in depth, not over-building. A new plan-reset verb would be a substantially larger addition and can remain deferred.

### Session 336 is reasonable, with two wording corrections

- The report should say the person **selected rollback**, not that rollback successfully followed: reporting happens first, and rollback can fail.
- “Nothing is sent” should explicitly mean **nothing is sent to maintainers or posted as an issue**. The same dialog says it makes a provider call.

Keep opening/copying the generated report available even if the subsequent rollback fails. The proposed tests do not currently cover that path.

## 5. The order

**334 → 335 → 336 is the right order.** Prevent the observed accidental submission first, repair the specification presented to models second, and improve evidence capture third.

**One release is reasonable, but do not make 336 a hard dependency of the fixes.** None of the supplied source indicates that stale-file prevention or section extraction depends on the rollback-report UI. If 336 slips, ship 334 and 335 rather than leaving the confirmed cause in staff installations.

The release gate should exercise the combined workflow:

- old answer refused without ledger mutation;
- fresh answer accepted and safely consumed;
- instruction reissue does not invalidate an otherwise valid answer;
- author and reviewer receive consistently explained plan versions;
- unsigned amendments do not acquire contract authority;
- reporting failure and rollback failure both leave the operator a clear, recoverable outcome.

That is a focused remediation release. It does not need declaration replacement, plan-commit ledger synchronization, or speculative transcript-preservation changes.
