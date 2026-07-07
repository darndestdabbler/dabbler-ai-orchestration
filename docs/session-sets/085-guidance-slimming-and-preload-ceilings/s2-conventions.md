# Session 2 verification — up-front conventions block

Read this before reviewing. It states the agreed baseline so Round 1
spends findings on real defects, not on the settled context.

## What this session is

Set 085 Session 2 of 3 (F2+F3): **the constitution and the demotions.**
It authors `docs/session-constitution.md` (the new per-session operating
doc), rewrites the required-reading contract on every live surface,
applies the operator-approved lessons triage, and lowers the preload
manifest ceilings to the 12k target. It ships **no code changes to
`ai_router/` Python modules** — the only `ai_router/` change is the
`router-config.yaml` manifest block. The playbook, verifier-scope audit,
live dogfood, and both releases are **Session 3**.

## Suite baseline (measured this session)

- `pytest ai_router/tests`: **2812 passed, 5 skipped** — byte-identical
  to the S1 close baseline (the 5 skips are pre-existing).
- Extension TS unit suite: **1270 passing**, including the regenerated
  cold-start golden snapshots (`UPDATE_GOLDEN=1 npm run test:unit`, then
  a clean re-run).
- `python -m ai_router.guidance_report --check`: **exit 0** at the new
  ceilings — TOTAL 10,549 / 12,000 tokens (ratchet start was
  92,719 / 92,719).
- `python -m ai_router.validate_guidance_meta`: OK, 25 ids across the
  two lessons files (cross-file uniqueness holds).

## Release contract

S2 ships **no release**. The router minor + extension minor are Session
3 deliverables (spec S3 Step 4), authorized by the operator then. No
`pyproject.toml` / `package.json` / CHANGELOG bump is expected in this
diff. `dist/templates/**` changes are the esbuild copy of the canonical
template bundle (mechanically regenerated, reviewed via the canonical
sources).

## By-design decisions (settled by the spec / operator — do not re-litigate)

- **Demotion, not deletion.** The workflow doc, schema doc, close-out
  doc, and authoring guide remain authoritative for their domains and
  left the preload manifest **uncapped on purpose** (on-demand docs pay
  no per-session tax; capping them would only invite ceiling churn).
  `quick-start.md` also left the manifest: it is first-time orientation,
  not per-session required reading — manifest membership follows the
  required-reading contract (documented in `guidance-lifecycle.md`).
- **The lessons triage was operator-reviewed and approved** ("Apply as
  proposed", this session): 8 condensed keeps, 4 gate-and-archive with
  `encoded-in` pointers, 5 archives, L-064-3 merged into L-079-1.
  Full pre-condensation texts are preserved verbatim in
  `lessons-archive.md`; condensed active copies keep the live ids (the
  D2 one-id-one-trailer lock forbids duplicate trailers across files,
  which is why the archived full texts of *active* ids carry no
  trailers).
- **Active lessons landed at 2,385 tokens** against the spec's "~2k"
  target — the tilde is the spec's own tolerance; the ceiling ratchets
  at the measured size and only ever moves down.
- **Ceilings are exact measured sizes** (100% of ceiling for the three
  non-constitution files) — that is the ratchet design, not slack
  mis-measurement: at ceiling, adding prose requires removing prose.
  The constitution's 4,000 is the spec-declared budget (measured 2,683).
- **Stale-echo scope.** The old required-reading list was grepped out of
  every **live** surface. Historical artifacts (session-set folders,
  `docs/proposals/`, archived lesson full texts, and verification
  artifacts) are immutable records and retain the old wording by
  verification-artifact discipline — those are not defects.
- **The stale auto-generated `guidance-overhead` header** was removed
  from `project-guidance.md` (and not re-added to the rewritten
  `lessons-learned.md`): in manifest mode nothing opts into stamping
  (`stamp:` defaults false), so the headers would never refresh and a
  permanently-stale header is worse than none. The legacy Set-064
  pruning ceilings in `guidance:` remain untouched as the backstop.
- **No verification / gate / adversarial-framing change.** This set
  slims preload prose only; the no-skip mandate (Set 083) and the
  L-069-2 framing are out of scope. The constitution states gate
  behavior at principle level and points at the enforcing machinery —
  it does not weaken or re-specify it.

## Round 1 findings — both remediated (do not resurrect; L-071-1 ledger)

Round 1 (gpt-5-4) returned two Major findings; both are fixed in this
diff:

- **I-085-S2-1 (manifest vs contract mismatch).** The manifest counted
  only `CLAUDE.md` while the contract preloads *your* engine bootstrap
  file, and the lifecycle doc overclaimed "exactly the files". Fixed per
  the verifier's option: a session reads exactly **one** engine file, so
  the sum-based manifest now counts the **largest** of the three
  (`AGENTS.md`, 2,099 tokens) as the representative entry — the total
  then bounds every engine's session without over-counting the
  alternatives (counting all three would overstate the per-session load
  by ~4k and cannot fit a 12k sum gate). The "exactly the files" claim
  is corrected in `guidance-lifecycle.md` and the router-config comment,
  which also document the review-time discipline: the three engine files
  share one body by policy, and an edit that makes an uncounted sibling
  the largest must repoint the manifest entry in the same change. Gate
  re-run green: TOTAL 10,774 / 12,000.
- **I-085-S2-2 (constitution shape).** The generic trigger table is
  replaced by a **per-step pointer table** (Step 0–10 rows → on-demand
  reference → trigger), and gate-enforced mechanics are trimmed to
  principle level: the close-backstop restatement is now one sentence
  ("verification is machine-enforced at close; `verify_session` is the
  sanctioned way to iterate first"), `--repair` and flag detail dropped
  in favor of the close-out-doc pointer, and the bounded-round rule is
  stated once (under *Recovery and escalation* — it is spec-required
  content there: "when to stop retrying") instead of twice. CLI
  entrypoint names (start/verify/close) remain — they are the operating
  commands of the happy path, not duplicated gate enforcement; argument
  detail beyond the set dir is dropped.

### Round 2 finding — remediated (I-085-S2-3, the four-part contract echo)

Round 2 confirmed I-085-S2-1/2 fixed and found one genuine new gap (not
a resurrection): `project-guidance.md`, `docs/quick-start.md` (both
walk-throughs), and the workflow doc's Step 0 stated a **three-file**
preload, omitting the engine bootstrap file the contract includes.
Fixed on every echo in one pass (L-065-1): all three surfaces now state
the four-part contract (constitution + project-guidance + active
lessons + engine bootstrap file). Because the growth landed on files at
exact ceilings, the token-neutral remedy was **removal, not
ceiling-raising** (exactly the ratchet's designed behavior): the three
engine files' curator paragraph — which restated the whole contract, a
standing drift risk — collapsed to a constitution pointer ("the
constitution names the whole preload; this bootstrap file is its
engine-file item"), and the project-guidance bullet dropped its
restatement of the on-demand list the constitution owns.
Post-remediation: project-guidance 3,499 tokens (**below** its S1
ratchet-start ceiling of 3,528), engine files CLAUDE 1,880 / AGENTS
2,031 / GEMINI 2,027, gate green at TOTAL 10,673 / 12,000.

**Engine-file ceiling accounting (state it before it is asked):** S1's
manifest capped `CLAUDE.md` at 1,867; S2 *removes* that entry and *adds*
`AGENTS.md` at its measured 2,031 as the largest-sibling representative
(per I-085-S2-1). That is a spec-mandated **membership change**, not a
raise of an existing ceiling — no entry's number was increased — and
the engine files' net growth (~+150 tokens each) is the price of the
constitution-pointer paragraphs that eliminated the duplicated contract,
while the counted total fell 92,719 → 10,673 (−89%).

## What to scrutinize

Whether the constitution's happy path contradicts the workflow doc
anywhere (a contradiction would mislead every future session); whether
any live surface still states the pre-085 required-reading contract;
whether the manifest ceilings match the measured file sizes; whether the
condensed lessons preserve the load-bearing content of their full texts;
and whether the regenerated goldens/dist bundle are exact re-renders of
the canonical templates.
