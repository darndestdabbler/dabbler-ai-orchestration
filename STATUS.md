# STATUS — after Session 2 (lifecycle, gates, verification loop)

- Done: session.py (start/close, boundary triad at CLI *and* writer, lock,
  spec step parser, --dry-run), progress.py (+ `--json` projection),
  gates.py (exactly 5, each incident-cited), identity.py, ledger.py
  (`.dabbler/runs/<set>/s<N>/rounds.jsonl`, schema-validated, tamper =
  refusal), verify.py + verdict.py (full loop: round 1 full evidence,
  rounds ≥2 fix-delta via tree snapshots, provider exclusion + one retry,
  cap 3), evidence.py (transcripts + state-write hash ledger + git
  primitives), test_evidence.py (digest-based run of record, records under
  .dabbler/), bootstrap.py (managed AGENTS.md/CLAUDE.md + two prompts),
  route() auto-verify wired.
- Verified: 317 tests green (160 S1 + 157 new; ceiling 410). E2E sandbox
  script: start → work → 2 verification rounds → 5 gates → close →
  commit/push, all pass. Corpus acceptance: all 134 v1 sets read in place,
  zero crashes, totals match manifest (119 complete / 13 cancelled / 1
  in-progress / 1 not-started; 46 v3 normalized on read), corroborated by
  an independent census. Fixtures: 6 sets vendored (~360 KB).
- Deviations: LOC 4,228 vs ~3,200 (+32%, same ratio as S1). session.py is
  920 vs 450 (2x — it absorbs lock+resolve+spec-parser as planned, but
  flag it for a Session 3 look). Workflow order corrected: verify BEFORE
  commit (working-tree evidence); commit+push after loop, before close.
  Simplifications: no plan-less carve-out writes (readers still tolerate),
  no disposition.json (test gate requires all expensive suites; digest
  match subsumes "untouched"), step reconcile drops v1's ordinal pass,
  fewer tests than the ~250 sketch (one per behavior).
- Next (Session 3): extension fork+delete, tree on `progress --json`,
  command surface ~12, one-shot v3 migrator, docs, package. Note
  Copilot lock still pins CLI 1.0.69 vs installed 1.0.75 (re-probe with
  v1's copilot_catalog --refresh before any live seat run).
