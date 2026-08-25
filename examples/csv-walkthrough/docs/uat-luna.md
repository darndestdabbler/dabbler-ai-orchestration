# Usability test: GPT-5.6 Luna following this walkthrough

A deliberately weaker model was given this document and a terminal, told to
follow it as the operator would, and told to report anything that confused it.
It could read and run commands; it could not write.

**First run: it never finished.** Confused on 22 of 28 turns, then hit the turn
cap still stuck. What broke:

| What it hit | Why |
| --- | --- |
| `python: command not found` | The commands were written from a shell that already had the venv active. None of the three ran as printed. |
| `No module named ai_router` | Nothing said the walkthrough lives inside a larger repo, or that the environment had to be set up first. |
| `solution check` said step 1, `workflow status` said step 6 | Two look-alike lines with nothing to say which meant progress. It spent twelve turns reading source code trying to find out which was lying. |
| `approved: false` on every component | Read as an unfinished project. Nothing explained that approval is solution-wide and exists only on steps 1 and 2. |
| `simulated` reviewers | Read as a defect rather than as the documented caveat. |

**Second run, after the fixes: finished in 12 turns.** One confusion, and that
one was the test harness swallowing a command rather than anything in the
document. It ended able to say what staff do at each step and where to look
for progress.

The document was not made simpler. It was made *runnable*, and the three
things that look wrong were written down instead of left to be discovered.

The first run also produced a change to the tool itself: `solution check`
printed the manifest's declared step in the same shape `workflow status`
prints live progress. Two commands, one screen, contradicting each other.
`check` now says the manifest is valid and names the declared starting step
as such.

---

## The second run, turn by turn

**1.** I am reading the walkthrough entry point to learn the project setup and the first step staff are expected to follow.
    - `READ README.md`

**2.** I am activating the project's Python environment, entering the walkthrough directory, and checking the initial workflow status as instructed.
    - `RUN cd /home/dennis-mitchell/dabbler-ai-orchestration && source .venv/bin/activate && cd examples/csv-walkthrough && python -m ai_router.workflow stat`

**3.** The status command produced no output, so I cannot verify the required three components or their progress. I am checking the current directory, Python executable, and command exit status before continuing.
    - *confused:* The walkthrough says the status command should display three components at 6/6, but the terminal returned nothing.
    - `RUN pwd; command -v python; python -m ai_router.workflow status --workspace-root .; echo STATUS:$?`

**4.** I verified the environment and confirmed the workflow status shows all three components at step 6/6, with one parser send-back. I am reading the rest of the walkthrough to identify the remaining checks and required progress views.
    - `READ README.md`

**5.** The first full README output was truncated, so I am reading the remaining lines to verify the documented progress views and any final checks.
    - `RUN sed -n '100,260p' README.md`

**6.** The walkthrough output is still truncated before its final progress-view details, so I am reading the next section of README.md.
    - `RUN sed -n '260,420p' README.md`

**7.** I am opening the model contract as instructed to verify how contract clauses are tied to tests and whether any are marked unproved.
    - `READ components/csv_model/contract.md`

**8.** I am reading the omitted middle section of README.md to verify the documented approval gates, review evidence, and progress details before running the finished example.
    - `RUN sed -n '180,280p' README.md`

**9.** I am running the documented finished example to verify the real implementation’s output and exit behavior.
    - `RUN python components/csv_app/src/real_run.py fixtures/leading-blank.csv; echo STATUS:$?`

**10.** I am running the two additional documented examples to verify the clean-input and rejected-header outcomes.
    - `RUN python components/csv_app/src/real_run.py fixtures/clean.csv; echo CLEAN_STATUS:$?; python components/csv_app/src/real_run.py fixtures/wrong-heade`

**11.** I am running the documented manifest check to confirm how it differs from the workflow status command.
    - `RUN python -m ai_router.solution check --workspace-root .`

**12.** I completed the walkthrough checks and verified the status, contract, finished outputs, and manifest behavior.
    - `DONE The walkthrough passes: staff plan and obtain human approval at step 1, choose and approve the decomposition at step 2, formalize contracts at st`
