## [Unreleased] — finding provenance and the doc-only severity cap (Set 119 S1)

### Added

- **Every finding now carries `evidencePaths` — the repo-relative paths
  the verifier actually read.** It is contract on **both** verification
  surfaces: the markdown parse (`verification._parse_issue_blocks` reads a
  tolerant `Evidence paths:` line) and the structured `submit_verdict`
  tool (`pull_verifier` gains an ungated `evidencePaths` array offered on
  every configuration, parsed into `Finding.evidence_paths` and serialized
  as `evidencePaths`). Both reviewer templates make it **mandatory on a
  Critical/Major finding**; `verification.normalize_evidence_path` strips
  the decoration reviewers add (backticks, emphasis, `./`, `\`,
  `:<line>`, `#anchor`) so the same file compares equal across rounds.
  Declared optional in `docs/session-issues.schema.json` and
  `docs/path-aware-critique.schema.json` — optional **by design**, because
  its absence must not launder a blocking finding.

  `TEMPLATE_ID` is bumped to `session-verification-v8` with its pinned
  hash, per the verification-integrity protocol.

### Changed

- **A finding whose cited evidence is entirely documentation prose is
  capped at Minor and opens no verification round.** Applied in
  `verification.is_blocking_issue` — the one predicate both surfaces
  already consult — so the push and pull surfaces inherit it identically.
  `classify_blocking` reports the demoted findings in a new
  `doc_capped_issues` list and names the count in its `reason`, so the cap
  is auditable rather than silent.

  This is an **operator-attested verification reduction** (Set 119 S1
  `decisions.jsonl`: `authority=human`,
  `rubric_line=verification-reduction`, `verification_effect=reduces`),
  authorized on measurement: 520 of 572 findings in this repo's history
  are Major (91% — a scale on which almost everything blocks is not a
  scale), and Set 116 S3 spent 13 routed calls and $4.75 on a session
  whose code was clean at round 1, where every Critical/Major after round 1
  concerned the wording of one markdown document and two of the three were
  *created by fixing the previous one*.

  Three properties keep it from being the anti-laundering rule in reverse:

  - **Doc-ness is derived from paths, never self-declared.** The only
    input is `evidencePaths`. A verifier asserting "this is only a doc
    issue" in its description or free-text `category` changes nothing.
  - **Absence is not doc-ness.** A finding citing no paths is unchanged:
    Critical, Major and unknown severity all still block, so an uncited
    blocking finding is never the cheaper option.
  - **Behaviour-bearing markdown is not documentation.**
    `ai_router/prompt-templates/**` are the verifier's own instructions —
    a defect there changes what every routed call does, so it keeps its
    declared severity. Doc-ness is extension-based (`.md`, `.markdown`,
    `.rst`, `.txt`) and never directory-based, so a machine contract that
    lives under `docs/` (a JSON schema) is not prose either.

  Shipped with the falsifier pairs `L-112-1` requires (30 test functions
  in `ai_router/tests/test_doc_only_cap.py`): each rule is planted both
  ways — the defect the cap must fire on, and the legitimate look-alike it
  must not touch.

