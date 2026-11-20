## 1. **The black-box row.**

The gap is real. “Shows the work” does not tell readers where to watch or what survives afterwards. Publish:

> Watch the session in the Work Explorer, the Dabbler terminal and the AI’s terminal. Audit its plan, log and decisions afterwards, plus a transcript unless disabled. The default transcript records the framework’s actions, tests and reviews, not the AI’s conversation.

“Audit” is fair for examining the session’s process and recorded evidence, not reconstructing everything the author did. Even `full` omits the engine’s conversation. The operator’s proposed wording needs that boundary and the transcript’s off switch.

## 2. **The other six rows.**

- **Not adequately evaluated: change.** “A model from another provider reviews findings and fixes for up to seven rounds by default. At the cap, a final fix may land without another review, with that exception recorded.” The missing thing is the stopping outcome, not another description of the loop.
- **Cheats: change.** “The framework runs the checks, tests, reviews and commits itself. It ties test results to a hash of the files each suite covers, so later changes to those files invalidate the result.” “Cannot easily cheat” and closing every discovered workaround are unsupported assurances; check them against source rather than treating this as a security boundary.
- **Does more than asked: change.** “Reviewers compare the work with the plan and its non-goals. Blocking findings normally stop the work from landing; the guide explains the exceptions.” “Out-of-scope work … is blocked” overclaims: detection depends on review, and the guide permits exceptions.
- **Untested code: change.** “The framework runs declared tests before committing code in the normal session path. Reviewers see changed source files with no test named after them; missing tests promised by the plan block approval, while other missing cases are advice.” The current cell hides both the filename-based check and the limited blocking policy.
- **Gets stuck: change.** “The framework can call a fresh AI, the Mechanic, automatically within set limits. A person can also use Consult with AI or decide how to proceed, with the decision recorded.” The missing thing is that automatic intervention is on by default.
- **Only the original AI can continue: keep.** The guide supports the common instructions, fresh conversations, durable record and reading order. This promises continuity, not that another model needs no investigation.

## 3. **Missing risks.**

No additional row is needed. The seven cover the distinct concerns these documents show Dabbler addressing. Human control belongs in the stuck-session row and supporting text; bounded retries belong in evaluation and recovery. Neither needs another row.

## 4. **The two front pages against each other.**

They agree with each other, including where both overstate things.

The listing adds claims needing qualification:

- “Every session, a cancelled one included” leaves a transcript is too absolute when transcripts can be disabled. Cancelled-session generation is not established by the supplied guide; check it.
- “Committed with the code” conflicts with the checked sequence: the transcript is committed and pushed **after close**.
- “The AI never reports that the tests pass” should say the framework does not **rely on** the AI’s report.
- “Change one file” is broader than the guide’s digest of files covered by the suite.
- “Your costs are … API spend or your Copilot seat” leaves out the authoring tool’s possible subscription and the guide’s token-based Copilot charges.

The existing-repository layout promise has no supporting mechanism in the supplied guide. Its linked operational references might establish it; they were not supplied.

“Nothing else to install” is misleading beside the required coding CLI. Say the framework needs no separate Node installation.

## 5. **The front pages against the guide.**

The largest mismatch is **“commits only what passed.”** The guide explicitly permits a final fix to land unreviewed at the cap and describes authorised exceptions. Both introductions need to acknowledge that boundary.

Other important gaps:

- **Transcript contents:** the guide names `outline` as the default but never explains what it excludes. Add that outline includes failed-job output; `full` adds every job’s output; neither includes the engine’s conversation. The listing’s “work done” risks implying that conversation is preserved.
- **Human authority:** the guide describes cancel, rollback, release holds and recorded waivers. The front pages mention decisions without explaining that a person can authorise passage past a stop without changing its verdict.
- **Automatic recovery:** the default unattended Mechanic, its attempt limits and its undo-on-failure behaviour are material to consent and cost. The table should at least disclose the default.
- **Security language:** “keeps everything else out of its hands” and “none … depends on the engine choosing to follow them” sound like isolation guarantees. The guide describes terminal environment markers and, for some Mechanic limits, instructions in a brief. Whether those provide stronger enforcement is a source-check question, not an established defect.

The guide supports repeatable procedure, not identical outcomes or infallible review.

## 6. **What a reader still cannot tell**

1. **Data exposure:** Exactly what code, records and job output reach each reviewer, Mechanic and adviser? What retention, regional and provider-policy choices apply? Reviewer inputs are described, but the overall privacy boundary is not.
2. **Authority and containment:** What filesystem, network, credentials and command access does each AI actually have? Which limits are enforced rather than instructions?
3. **Wrong reviews and exceptions:** What should a person do about a false approval or disputed rejection? How do cap landing, `verification_clean` and `session waive` interact? Auxiliary review appears to require a third provider, unlike ordinary two-provider review.
4. **Real cost:** What does a typical session cost, including authoring, seven review rounds and automatic Mechanic attempts? Are there spend limits, estimates or confirmation points?
5. **Practical adoption:** What must the person prepare and maintain by hand: plan, test commands, build tools, Git remote and permissions? What operating systems and repository types are supported?

## 7. **The smallest change set.**

Ranked below. Each entry is one file and one cell or sentence; paired entries deliberately keep the front pages aligned.

1. `README.md`: replace the black-box cell with section 1.
2. `tools/dabbler-ai-orchestration/README.md`: make the same replacement.
3. `README.md`: replace the evaluation cell with section 2’s cap disclosure.
4. `tools/dabbler-ai-orchestration/README.md`: make the same replacement.
5. `README.md`: replace “commits only what passed” with “normally requires passing checks, tests and review before committing, with exceptions recorded.”
6. `tools/dabbler-ai-orchestration/README.md`: make the same sentence edit.
7. `docs/guide/the-record.md`: add one sentence defining outline, full and the omitted engine conversation.
8. `tools/dabbler-ai-orchestration/README.md`: replace the transcript timing sentence with “Unless disabled, the transcript is committed and pushed after the session closes.”
9. `README.md`: replace the scope cell with section 2’s qualified wording.
10. `tools/dabbler-ai-orchestration/README.md`: make the same replacement.
11. `README.md`: replace the tests cell with section 2’s wording.
12. `tools/dabbler-ai-orchestration/README.md`: make the same replacement.
13. `README.md`: replace the cheating cell with section 2’s evidence-based wording.
14. `tools/dabbler-ai-orchestration/README.md`: make the same replacement.
15. `README.md`: replace the stuck-session cell with the automatic-Mechanic disclosure.
16. `tools/dabbler-ai-orchestration/README.md`: make the same replacement.

**Would NOT add:** a separate human-control row to either front page, or transcript file inventories to `README.md`. Those facts belong in the linked guide; the front pages are better short.