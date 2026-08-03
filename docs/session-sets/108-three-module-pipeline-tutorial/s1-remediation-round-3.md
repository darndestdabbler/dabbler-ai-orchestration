# S1 remediation — round 3

Fixes for the merged Critical/Major findings from **both** discovery passes:
round 1 (`--phase discovery`, fan-out 2/2, 5 findings) and round 2
(`--phase supplementary`, 3 findings). Eight findings, **seven distinct** — the
two fan-out calls raised the same test-count defect independently.

**Every finding was accepted. None was disputed.** Three were closed by
*running something* rather than by editing prose.

---

## D1 + D2 (Major, duplicate) — test counts were acceptance criteria

**The finding.** Part A required *"31 tests green"*, Part B *"24 tests green"*,
Part C *"74 tests green"* — while the same document told the reader their AI
session would not produce the answer key's code. A conforming implementation with
28 tests would have been declared unfinished.

**Accepted, and it was the most damaging finding in either round.** It
contradicted the tutorial's central premise from inside its own acceptance
criteria. The two fan-out calls found it independently, which is the fan-out
earning its cost.

**Fix.** A rule box at the top of §2 states that **finish lines are behavioural
and counts are observations**, and all four finish lines were rewritten:

| Part | Was | Now |
| --- | --- | --- |
| A | `31 tests green` | your converter's tests green **and** `POST /convert` answers a valid upload and `400`s a bad file naming the line *(answer key: 31)* |
| B | `24 tests green` | your tests green **and** rows read back **and** the duplicate rule returns the original `batchId` *(answer key: 24)* |
| C Phase A | *(none)* | your decision-table tests green covering all four outcomes *(answer key: 12 tests, 97 ms)* |
| C Phase B | `74 tests green` | your full suite green **and** rows in a database, file in `archive\`, bad file in `failed\` *(answer key: 74)* |

`s1-service-contracts.md`'s Phase A paragraph was reworded the same way, and a
line was added to its *What is NOT established here* section: nothing in that
document is a per-implementation acceptance test.

Added, because the inverse error is also worth naming: **a reader whose count
matches the answer key exactly should wonder whether they copied.**

---

## D3 (Major) — the happy path is Windows-only and did not say so

**The finding.** R8b corrected the spec's *"nothing but the .NET 10 SDK"* to
*"SDK + LocalDB"* but never said LocalDB is Windows-only. Everything else in the
stack is cross-platform, so a macOS or Linux reader would sail through Part A and
hit a wall in Part B — the same failure R8b exists to prevent, one platform over.

**Accepted.** The reference solution's own design notes already say it: *"Its
limits are honest ones: Windows only, and awkward to reach from Java."* The
routed step-3.5 analysis also said it, and this session used that analysis to
find the LocalDB problem and then failed to carry over the platform half of it.

**Fix.** R8b now leads with **Windows 10/11** as prerequisite 0, and requires
Session 2 to state the non-Windows fork (`DABBLER_PIPELINE_SQL=container`)
**before Part A**, not in the appendix. Recorded explicitly that this is the one
place a container is named outside the appendix, and why that does not violate
the single-happy-path rule: that rule exists so Windows readers are not made to
choose, not so other readers are left with no path.

The operator flag was updated: the success criterion should read *"on Windows,
having installed the .NET 10 SDK and LocalDB."*

---

## D4 (Major) — Part C's stated dependency contradicted its own finish line

**The finding.** Part C claimed it depended on *"both contracts — not on Parts A
and B being finished"* while requiring a real CSV's rows in a database. Both
cannot be true.

**Accepted, and the cause is worth recording** because it is a named lesson class
(L-064-8, a doc inheriting a retired model's claims). That sentence was true in
the **retired three-people-one-module model**, where the `watcher` author had no
teammates' services to run. In the current model the reader built those services
themselves, in Parts A and B. The claim survived a model change that falsified it.

**Fix.** Part C's single dependency row was replaced by a **per-phase table**:
Phase A depends on the contracts only; Phase B depends on runnable services.
Two clarifications were added rather than just splitting the row — Phase A is
*genuinely* reachable without A and B (which is what makes it a demonstration
rather than a ritual), and Session 2 must say where Phase B's services come from
for a reader whose own are not working (a teammate's — Part D's mechanism
arriving early).

---

## D5 (Major) — the POC did not reach the running product

**The finding.** `poc-nine-modules-ondisk.ts` stops at
`buildVisibleModulePayloads`. Claims phrased as *"renders as nine flat sibling
rows"* and *"grouping is exactly one level deep"* are claims about **rendered
rows**; the client could in principle sort, nest or filter the payload. The
spec's step 5 says *"against the running product, not just the model functions."*

**Accepted.** Reading `client.js` shows a straight in-order
`for (const mod of modules)` loop with no sort — but *"I read the renderer"* is
exactly the standard of evidence this session rejected everywhere else, so it was
not good enough here either.

**Fix — a new test, not a new argument.** `poc-nine-modules-dom.ts` loads the
shipping `media/session-sets-tree/client.js`, `gettingStartedHtml.js` and
`tree.css` **verbatim off disk** into headless Chromium, posts the real payload
over the real `rowsSnapshot` protocol, and asserts on the DOM the client builds.
The only stub is `acquireVsCodeApi`.

| Finding | Now asserted as |
| --- | --- |
| nine flat rows | 9 × `[role="treeitem"][aria-level="1"]`, all `data-module-kind="declared"`, zero `.module-warning` |
| one level deep | rendered `aria-level` values are exactly `{1,2,3}`, **and no level-1 row contains another level-1 row** |
| manifest order | rendered **document order** equals manifest order, with a guard that the fixture actually differs from alphabetical |
| day one | nine module rows, **zero** level-3 rows, zero warnings |

**4 passing.** The payload-level suite is kept — it covers the parser and
discovery half — so both now run.

> **Provenance correction (round 5).** This section originally read as though the
> DOM harness were authored *during round-3 remediation*. **It was not.** It was
> written immediately after the discovery round raised D5 and **before** the
> supplementary pass ran — so it is present in the round-2 baseline tree and is
> therefore **absent from the round-3+ fix delta** by construction.
>
> Round 5's verifier caught exactly this and refused to take the prose for it:
> *"the delta contains no addition for `poc-nine-modules-dom.ts` … the prose
> assertions and '4 passing' count alone do not resolve the contradiction."*
> **That is correct and the error was mine** — a mis-stated ordering in this
> sidecar, not a missing artifact.
>
> Verifiable provenance, since a fix-delta reader cannot see the file:
>
> ```
> $ git log --oneline --diff-filter=A -- tools/dabbler-ai-orchestration/src/test/poc-nine-modules-dom.ts
> d3da217 Set 108 S1: settle the contracts by running them, not by reading them
>
> $ git ls-files -s tools/dabbler-ai-orchestration/src/test/poc-nine-modules-dom.ts
> 100644 581e2bfa975dc09e40c11dc007a7cc9ecde64586 0  tools/.../poc-nine-modules-dom.ts
>
> $ git ls-tree -r <round-2 baseline tree> --name-only | grep -c poc-nine-modules-dom
> 1          # present at the baseline — hence not in the fix delta
> ```
>
> This is the L-064-9 class in a new place: **a diff-based evidence bundle omits
> what the diff's own baseline already contains.** The lesson generalises beyond
> untracked files — *anything already inside the baseline is invisible to a
> delta reviewer, and prose is not a substitute for it.*

**What this still is not:** Layer 3 (`@playwright/test` + Electron) remains the
fuller harness and does not launch on this machine (a standing residual, Set 107).
No VS Code, no extension host, no theming. Named in the test's own header so the
next reader is not misled about what it proves.

---

## S1 (Major) — "nobody waits" was false: `docs/modules.yaml` is shared

**The finding.** R2 claimed *"no path is shared."* One is: every member's modules
are declared in a single `docs/modules.yaml`. Three people appending three
entries each, on three branches, conflict — on the team's **first** shared
artefact, in a tutorial whose premise is that nobody waits.

**Accepted; the claim was simply wrong** and would have shipped a workflow that
fails on day one.

**Fix — new ruling R9.** All nine entries are declared in **one commit by
whoever created the repository**, before anybody branches. R2 now says *no
**code** path is shared* and points at R9.

The reason this costs almost nothing is a fact the POC had already established
and this session had not connected to it: **nine declared modules with zero
session sets render cleanly, no warnings.** The manifest is a declaration of
intent, not a record of work. Declaring all nine on day one produces exactly the
tree the POC's fourth finding shows.

R9 also fixes the imprecise slogan. *"Nobody waits on anybody"* becomes: **one
short bootstrap step is shared and sequential — agree the contracts, declare the
modules, push — and everything after it is parallel.** Unique `planPath` per
entry, no `touches:`, and a solo reader does the same thing in a minute.

---

## S2 (Major) — a framework exception dump was promoted to contract

**The finding.** `s1-service-contracts.md` said *"One `400` is NOT this envelope,
and Session 2 should say so"* and printed an ASP.NET
`BadHttpRequestException` dump as expected behaviour. A conforming
implementation returning Problem Details or an empty body would look
nonconforming — and a reader imitating the answer key would ship raw exception
details to a caller.

**Accepted.** The session captured that response accidentally (a `curl` missing
its `@`), found it interesting, and over-promoted it. Interesting is not
contractual.

**Fix.** The note now states: **contractual — the `400` status; not contractual —
the content type, the body, or anything in it.** Session 2 is explicitly
forbidden from printing the dump as expected output, and is given the one
sentence that *is* worth saying, phrased as reassurance rather than
specification. The pedagogical point survives — `watcher` only reads the status
class, which is precisely why the contract pins the class and not the body.

---

## S3 (Major) — Part D's persistence half was never actually repointed

**The finding.** R6's falsifier started converters on `5101`/`5201`, repointed the
watcher, and killed `5101`. It never started a second `persistence` on `5202`,
never proved the watcher reached it, and never removed `5102`. Half of Part D's
mandatory two-service mechanism was asserted, not shown.

**Accepted — and closed by running it, not by softening the claim.**

Run 2, executed during remediation:

1. `converter` on `5201` **and** `persistence` on `5202`. **`5101` and `5102`
   confirmed unreachable before the run** (`curl` timed out on both).
2. `watcher` repointed at both, by the two configuration values only.
3. `POST /run-now` →
   `{"fileName":"orders-both-repointed.csv","outcome":"Stored","detail":null,"batchId":"019fc888-1092-7836-8e83-355d31b4d054"}`
4. `GET http://localhost:5202/batches/019fc888-…` returned all three orders. The
   file was in `archive\`.

R6 now carries both runs and names Run 2 as the one Session 2 may cite.

**One limit found while doing it, and disclosed rather than buried:** both
`persistence` instances used the **same LocalDB database**, because the default
connection string is the same. That is also what a real reader on one machine
gets, so it is the honest configuration to teach — but it means the run proves
the watcher *reached* `5202`, not that `5202` owned a separate store. Session 2
must not imply per-member databases; nothing in this tutorial sets one up.

---

## Disclosure — `s1-conventions.md` was updated after round 2

The conventions file is orchestrator-authored context, not a saved verifier
artifact, so it is not covered by the never-edit rule. It was updated for the
remediation-review round: the suite table gains the DOM suite, and the
"facts established by execution" item on Part D now describes **both** runs.

Stated here because a reviewer comparing rounds will see the input change, and
the honest framing is that **the evidence changed** — new tests, a new run — not
that the claims were quietly relaxed.

---

---

## Round 3 review outcome — 6 accepted, 1 rejected, and the rejection was right

The remediation-review round accepted six of the seven fixes and rejected one.
Notably it rejected a bullet **introduced by the remediation itself**, not
anything in the original draft — which is the fix-delta review doing exactly its
job.

**Rejected: the S2 fix over-broadened.** Closing the malformed-JSON finding, a
summary bullet was added reading *"Only the `4xx`/`5xx` split and the documented
success envelopes are contractual."* That excludes the **service-defined
validation-error envelopes** — `converter`'s `{title, schema, sourceFile,
errors[]}` and `persistence`'s `{title, sourceFile, errors[]}` — which the same
document, two sections earlier, presents as contract terms and builds a whole
teaching point on (`line` is the physical file line; `row: 0` means the batch as
a whole). The document contradicted itself and Session 2 could not have told
which ruling to follow.

**Accepted and fixed.** The bullet now separates the two cleanly: **service-defined
success and validation envelopes are contractual; framework-generated
malformed-body responses are not.** Added, because it is the reason the
distinction matters: `watcher` needs only the status class, but it is not the
only consumer — **a human reading the error is the other one**, and the
validation envelopes exist for them.

This is the correct boundary and the original S2 finding never asked for more
than it: it objected to an *exception dump* being normative, not to the service's
own error format.

---

## Suites after remediation

| Suite | Result |
| --- | --- |
| `poc-nine-modules-dom.ts` (new) | **4 passing** |
| `poc-nine-modules-ondisk.ts` | **5 passing** |
| `poc-nine-modules.ts` (pre-existing) | **4 passing** |
| Extension unit (`npm run test:unit`) | **1821 passing** — unchanged; the POCs live outside `src/test/suite/**`, matching the existing POC's placement |
