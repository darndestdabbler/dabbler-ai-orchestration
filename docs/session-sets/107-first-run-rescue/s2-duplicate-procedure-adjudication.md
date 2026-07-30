# S2 step 6 — duplicate-procedure check: evidence and adjudication

The spec says "**grep** for duplicated procedure against the concept-ownership
table. Any second explanation is a finding, not a style note." A literal grep
finds repeated **strings**; the table is about repeated **procedures**, which
paraphrase. So step 6 was run as both — a mechanical overlap scan to gather
evidence, and a routed semantic review to read for paraphrase.

Raw routed output: [`s2-duplicate-procedure-review.json`](s2-duplicate-procedure-review.json)
(`analysis`, anthropic excluded → gemini-pro, $0.0232).

## The mechanical scan

Document sizes after the split: `hello-world.md` 144 lines, `adopt-dabbler.md`
458, `release-and-recovery.md` 154, `module-team-hello-world.md` 1 (tombstone).

Every string appearing in more than one tutorial is **shared vocabulary naming
the same UI surface**, not a repeated procedure: `Command Palette`,
`Work Explorer`, `Activity Bar`, `Terminal > New Terminal`, `Marketplace`,
`.venv`. Each appears at most twice, once per document. The sample-specific
strings (`Try a sample project`, `unittest`, `AGENTS.md`, `Copy Starter Prompt`,
`close_session`, `Python 3.10`) appear in `hello-world.md` **only**, which is
what sole ownership of the first run should look like.

## The routed review — two Majors, both adjudicated down to Minor

### Finding 1 — "the AI session loop is taught in both documents"

The reviewer holds that `adopt-dabbler.md` re-teaches the paste-a-starter-line
procedure that the table gives `hello-world.md` to show "once concretely", and
proposes rewriting `adopt-dabbler.md`'s Part 4 step 1 to build on assumed
knowledge.

**Adjudicated: Minor. No change.** Three reasons, in order of weight:

1. **The two passages do different work.** `hello-world.md` teaches *what a
   session is* — paste a line, watch an agent change code, see a test go green.
   `adopt-dabbler.md`'s Part 4 step 1 performs *the adoption walkthrough*, and
   what it actually adds is the **scope line** and the Copilot CLI as the paste
   target. Neither is in `hello-world.md`, and neither belongs there.
2. **The proposed fix makes a document worse.** Rewriting adoption to depend on
   the reader having done Hello World would strand anyone entering at adoption,
   which is a real entry point. The dependency is already stated where it costs
   nothing — `adopt-dabbler.md`'s header now opens with "Start here? No" and
   links to Hello World.
3. **It is out of this step's scope.** The spec's step 3 relocates
   `adopt-dabbler.md` "unchanged in substance". Rewriting its step 1 procedure is
   a substance change.

Residual drift risk, stated rather than hidden: if the starter-line format
changes, two documents need updating. `tutorial_gate.py` pins the line in
`hello-world.md` against `bundle.json`; `adopt-dabbler.md`'s copy is pinned only
by the command-title check. That is a real, small, named residual.

### Finding 2 — "custom hosts" has no owner

The reviewer found an **ownership gap**, and it is genuinely correct: the table
assigns "Recovery, raw git, custom hosts, failure states" to
`release-and-recovery.md`, and that document contains **no host content at all**.
The GitHub / Azure DevOps material lives in `adopt-dabbler.md`, which is where it
belongs and where a reader will look for it.

**Adjudicated: Minor here, and escalated as a spec-level correction.** No reader
is misled, because the ownership table is an internal authoring contract that is
published in no tutorial — the consequence is process-only, which is Minor by
the rubric. But the table itself is wrong, and it appears in two places this
session may not edit: the Set 107 spec's configuration section (immutable at
runtime) and proposal v3 §; so it is recorded in `disposition.json` and raised at
Step 9 for S3, whose correct form is:

> | Host-specific setup (GitHub, Azure DevOps) | `adopt-dabbler.md` | link |
> | Releases, hotfix, rollback, raw git recovery | `release-and-recovery.md` | link |

### The reviewer's direct answers

- **Stale first-contact framing in the relocated document: "none found."** This
  is the one the assignment block predicted would be botched (step 3 *looks*
  mechanical; L-064-8 in its mirror form). The header rewrite — retitling,
  adding the "Start here? No" line, repointing the video link — appears to have
  discharged it.
- **`hello-world.md` discharges its ownership of the session loop: yes** — a
  defined task, an AI executing it, a verifiable outcome, closed with an
  explicit naming of the loop.
- **Gap between the documents: none.**

## Outcome

Zero Critical, zero Major after adjudication, two Minors recorded (one with a
named residual, one escalated as a spec correction). No document changed as a
result of step 6.
