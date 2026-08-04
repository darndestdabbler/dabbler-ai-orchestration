# Change log — Set 108: three-module pipeline tutorial

**Outcome:** Dabbler had a tutorial for one person's first session and one for a
person shipping a module in a real repository, and nothing at all for the shape
the product was designed around — **several modules, built independently,
composed over agreed contracts**. This set wrote that tutorial:
`docs/tutorials/three-module-pipeline.md`, a four-part course in which every
reader builds all three .NET 10 services and then integrates with somebody
else's by **changing two configuration values**.

**Four sessions, all VERIFIED. Documents only — no extension or router feature
code, and therefore no release.**

The ladder is now one task → one module → three modules, with each rung naming
the next.

| Tutorial | Scope |
| --- | --- |
| `hello-world.md` | One AI session, one task, one folder |
| `adopt-dabbler.md` | One person, **one** module, in a real repository |
| `three-module-pipeline.md` | **Three** modules, built independently, composed by contract |

## The acceptance test is the deliverable, and it passed

S4 walked the tutorial end to end and **built all three services from the
contract sections alone**, without opening the published answer key until Part D.
The result is the strongest evidence this set could have produced:

- **All four documented response bodies came back byte-identical** to the strings
  the tutorial prints — the `200` envelope, the `400` envelope, the
  unknown-schema `400`, and `persistence`'s batch `400`. An independent
  implementation, built from prose, reproduced the documented bytes exactly.
- **84 tests green** across the three modules (29 / 29 / 26), against the answer
  key's 74 — close enough to reassure, different enough to prove nothing was
  copied, which is exactly what the tutorial says finished looks like.
- **The negative tests, measured rather than inspected.** Part D changed **zero**
  code files (`git diff` on `*.cs`/`*.csproj`); `watcher`'s suite ran in 54 ms
  with both services **confirmed down**. The third — can a reader stop cleanly
  after Parts A and B — is **split**: its machine half passes (both boundaries
  re-entered from cold, with Part B's stored batch and duplicate rule intact
  afterwards), while whether a *person* can resume from the document alone is
  **unverified** and is what the UAT checklist now exists to answer.
- **Real conformance, which the tutorial says a solo reader cannot demonstrate.**
  Beyond the documented solo Part D, the walk repointed its `watcher` at the
  **published answer key's** `converter` and `persistence` — a genuinely
  independent implementation it had never seen — and stored a batch through
  them, reading it back from their database. Their `4xx` bodies matched this
  build's on every field the contract pins.

## Session 1 — contracts, and the shape of the walk

- **The two service contracts written down first**, extracted from the reference
  solution rather than invented: `POST /convert` and `POST /batches`, with the
  status-code split (`4xx` the file's fault, `5xx` the service's) that drives
  `watcher`'s whole decision table.
- **Part D's mechanics settled on one machine** — a second version on the `52xx`
  band, `localhost` throughout, no firewall rule — with the cross-machine variant
  recorded as an appendix item whose firewall step is **unverified**.
- **Layout and naming fixed against the running product**, not taste. The POC's
  `converter-v1` recommendation was overturned in favour of `{owner}-{service}`,
  because slugs must be unique repo-wide and nothing hands out version numbers:
  three people alone at their desks each declare "v1" and six of nine
  declarations are rejected. Ownership lives in the slug; titles stay freely
  editable.
- Eight verification rounds; rulings R1–R9 closed VERIFIED.

## Session 2 — the tutorial

- **`docs/tutorials/three-module-pipeline.md`**, four parts with four finish
  lines, each independently stoppable and each opening with what must be running
  to resume.
- **Phase A re-motivated, not inherited.** In the old three-people model
  `watcher` stubbed because teammates were unfinished; here the reader has
  already built both, so the tutorial gives the durable reason instead — *your
  unit tests must not require other services to be running*.
- Every expected output a literal string from a real run; the answer key linked
  with the plain statement that an AI session landing somewhere different is
  normal.
- Appendix carries containers, real SFTP and IIS, with Rebex **linked rather
  than vendored** because its licence forbids redistribution.

## Session 3 — cutting the estate to the ladder

- **`adopt-dabbler.md` trimmed to a single-module walk**, 459 → 333 lines. Part 5
  (the teammate and the composing module) and Part 6 (which existed only to
  review Part 5's module) both went; Part 4 already carries open-PR → merge for
  the reader's own module, so no procedure was lost.
- The consequential repairs mattered more than the deletion: the intro's
  two-module promise, branch protection renumbered *stage N of 3* → *of 2*,
  forward references to Part 5, and the closing check rewritten from
  greeter + app to greeter alone. The stated completion time was cut **and**
  labelled an estimate.
- **`docs/tutorials/adopt-dabbler-video/` retired** — nine files, one live
  inbound link. Set 107's activity and change logs mention it historically and
  were correctly left untouched.
- Six of the seven inbound linkers reconciled; **`hello-world.md` deliberately
  not edited**, because `tutorial_gate`'s banned-terms rule forbids "pipeline",
  "repository" and "teammate" in the first-run document and adding the new
  tutorial there would have turned CI red.
- **An unplanned, operator-approved fix:** CI was *already* red at S2's close.
  `tutorial_gate.py`'s command regex had no `.` in its character class, so it
  truncated `Dabbler: Open modules.yaml` and then correctly reported the
  truncation as a command that does not exist. The tutorial was right and the
  gate was wrong; fixed with two regression tests, kept as its own revertable
  commit.

## Session 4 — the walk, and the checklist cut from it

- **`s4-walk-evidence.md`** — the full record, captured against the fixed
  `{Part, Step, Action, Expected, Actual, Defect/Stall}` template rather than as
  freeform notes.
- **Five defects found and all five fixed**, two of them by *cutting* a claim
  rather than adding a rule:

  | id | What the walk hit |
  | --- | --- |
  | **D1** | The SDK is never pinned — `dotnet new web` produced **`net11.0`** on a machine satisfying the tutorial's own prerequisite check, because it prints an 11.0-preview line in its own example without remarking on it. Now pinned via `global.json`. |
  | **D2** | Day one's `modules.yaml` block opens at the `modules:` root key and omits the reader's existing module, so copying it whole silently deletes the module the same document said to leave alone. Two comment lines added **inside the fence**, where a copying reader will actually see them. |
  | **D3** | `dotnet ef` is an undocumented third prerequisite for the migrations path. Documented at the point of use in Part B, with the literal error text, and explicitly marked conditional. |
  | **D4** | The Deferred transcript promised the reader's `detail` "will name `5101`"; `detail` is not contractual and this build's carries no port. Promise removed. |
  | **D5** | The known `/run-now` race was described as returning "an empty array" when it can equally produce a `500`. Callout widened and its existing mitigation promoted from afterthought to recommendation. |

  **D1 and D3 were independently corroborated by the answer key** once opening it
  was allowed: it carries a `global.json` pinning `10.0.201` and a
  `dotnet-tools.json` declaring `dotnet-ef 10.0.10`. Both are things the
  reference solution needed and the tutorial had never passed on.
- **`108-three-module-pipeline-tutorial-uat-checklist.json`** — **4 items,
  9,871 chars**, marginally leaner than Set 107's for a tutorial four times the
  size. Derived from the acceptance criterion, one item per part, quality
  expectation stated once in the preamble. It deliberately does **not** ask the
  human to re-verify what the walk already proved; each item's
  `ProgrammaticVerification` states what Session 4 established *and* what it did
  not, so the human walk is aimed only at what a machine could not supply.

## The honest limits

Recorded here because they bound what the evidence above is worth.

- **Per-part human timings do not exist.** The spec asks for them; this walk
  cannot produce them. What a stopwatch measured was an AI writing three .NET
  services (~30 minutes total), which says nothing about a reader whose time goes
  on reading, deciding and prompting. Only the *mechanical* half of "a course, not
  a sitting" is settled — no part leaves state behind, so stopping costs nothing.
  Whether a person can **resume** cold from the document, and how long they take,
  is untested.
- **The prerequisites section cannot be falsified on this machine**, which is the
  machine the tutorial was written on. Both checks passing is a non-finding.
- **No human has seen the Work Explorer** with these modules in it. The day-one
  manifest was instead driven through the shipping reader and grouping functions:
  four `declared` rows, manifest order, zero warnings.
- **Nobody has walked this as a team.** The fourth negative test — that two
  members' work cannot collide — is not walkable solo and is recorded as
  unwalked. Ownership routing is likewise unexercised, because the tutorial
  correctly tells a solo reader to skip it.

## Follow-ons

1. **The Java track** — now unblocked by the spec's own condition, *"separate
   set, after this one is walked."* The walk suggests its shape: a Java
   `watcher` pointed at the published .NET answer key would be a stronger
   conformance demonstration than either language alone.
2. **The step-3.5 analyst keeps emitting engines and models that do not exist** —
   three sessions running (`bedrock`, then `claude-3-opus-20240229` / `gpt-4o`).
   The prompt asks for an identifier and supplies no catalogue, so it answers
   from training data older than the registry. Router-side fix.
3. **Four unstated error envelopes in the contract sections** — header
   mismatches, `min`/`maxLength`, non-integer `OrderId`, wrong field count.
   Deliberately not fixed: none is on the walk, and pinning them would enlarge
   what a reader must absorb before writing any code.
4. **The owed `adopt-dabbler.md` walk**, carried since Set 106, never performed,
   and now overdue by three sets — this set names it as a hard prerequisite four
   times and S3 removed a third of it.
