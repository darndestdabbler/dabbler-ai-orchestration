# Session 1 verification conventions

> Up-front conventions block for the S1 verification prompt (repo rule,
> promoted from L-064-10). State the baseline, the release contract, and the
> by-design exclusions **before** the work, so Round 1 spends its findings on
> real defects rather than re-deriving the agreed baseline.

## What this session is

A **decide-and-measure session**. It ships **no product behaviour**. The spec's
own *Touches* line reads "nothing shipping — this session changes no product
behaviour", and that is literally true: no file under
`tools/dabbler-ai-orchestration/src/` and no file under `ai_router/` is
modified.

Deliverables are one measurement harness, five evidence artifacts, three
decision/assignment documents, and a throwaway spike extension retained as
evidence.

## Suite baseline

- **Extension typecheck:** `npx tsc --noEmit -p tsconfig.json` — **clean**.
- **Extension unit suite:** **1821 passing, 0 failing, 0 pending (32 s)** via
  the vscode-stub mocha path
  (`mocha --require ts-node/register --require ./src/test/vscode-stub.js --ui
  tdd 'src/**/*.test.ts'`). The `@vscode/test-electron` harness (`npm test`) is
  a **known-broken layer on this host** — it fails to launch on current VS Code
  with `bad option: --no-sandbox`, and the ~27 electron-only failures it
  produces are an `out/` artifact, not a regression. The stub path is the
  sanctioned local gate.
- **Python suite:** **not run, deliberately.** This session modifies no Python.
  The `ai_router` suite takes ~49 minutes and running it would prove nothing
  about a session whose only executable artifact is a TypeScript measurement
  script.

## Release contract

**Nothing is bumped and nothing is published.** No `package.json` version
change, no `CHANGELOG.md` entry, no vsix, no tag. The set's release boundary is
S4, and it is operator-gated there. A finding that this session "should have
bumped the version" is out of contract.

## By-design exclusions — please do not report these as defects

1. **`scripts/perf-harness.ts` is outside `tsconfig.json`'s `include`
   (`["src"]`).** It is run explicitly through `ts-node`, is not part of the
   extension bundle (esbuild's entry is `src/extension.ts`), and is therefore
   not covered by the repo typecheck. This is deliberate — a measurement tool
   is not shipping code — and it is **named here rather than left implicit**.
2. **The harness measures two of the spec's four buckets.**
   `resolveWebviewView` and webview-cold-start-to-first-paint require a running
   extension host and are not measurable from Node. The decision document says
   so explicitly and assigns them to Layer 3 in S4. This is a stated limitation,
   not an omission.
3. **No Layer 3 / Playwright run.** L-064-12 arms on sessions that change
   Explorer-rendering surfaces, state writers, or the fixture harness. This
   session changes none of them. The obligation lands on S2–S4.
4. **The spike extension under `s1-spike-evidence/spike-extension/` is
   throwaway code retained as evidence.** It is not linted, not typechecked,
   not tested, and not shipped. Judging it as production code is a category
   error; its only job was to make four API questions answerable by running
   rather than by reading documentation.
5. **Screenshots are committed as PNG evidence.** They are the only honest way
   to record a visual finding (a fraction that disappears, an icon that is
   invisible on a light theme). Full-screen captures were deliberately **not**
   committed — only window-scoped captures and crops — because the full frames
   included unrelated windows.
6. **The Opus 5 panel seat was not routed.** The operator ruled at S1 that the
   orchestrator *is* Opus 5 and need not be paid for twice. Its opinion was
   written and saved **before** either routed opinion was read, and the file
   states its own independence caveat. Treat it as a panel input with a
   declared bias, not as a routed artifact.
7. **The prior panel's prompt could not be recovered verbatim.** The metrics
   ledger records the two 2026-08-04 calls but not their prompts; the re-run
   question was reconstructed from the spec, which is the authored record of
   what that panel was told. The decision document states this.

## What IS fair game, and where to look hardest

- **The measurement's attribution.** `PIPELINE` is the product entrypoint and
  the total; `discovery` and `scan` are component probes *already inside* it and
  must not be summed. An earlier cut of the harness did sum them and reported
  inflated totals; that bug was found and fixed before any number was recorded,
  but the reasoning deserves scrutiny.
- **The claim that the migration does not fix startup.** It is the session's
  most consequential conclusion and it contradicts the set's original pitch. If
  it is wrong, the set is being sold on a false premise in the opposite
  direction.
- **The `description`-truncation finding**, which overturned an operator ask.
  It was observed at two widths, not bisected to a threshold.
- **Whether the confirmed mapping table is complete** for what S2 must build,
  now that the fraction is removed and a fourth level is added.
- **Whether the recorded residuals are the right ones**, especially the
  light-theme icon defect, which is a real bug in an asset the set will ship.

## Severity rubric (carry until it ships in the template — L-095-1)

Grade by **consequence**: probability the stated failure scenario materialises
for a real user × impact on the deliverable's objectives. Low-probability **or**
low-impact is **Minor** even when technically correct. No plausible failure
scenario ⇒ **Minor** by definition. For a session that ships no product
behaviour, a defect must plausibly cause S2–S4 to build the wrong thing, or
cause the operator to have decided wrongly, to rate Major or above.
