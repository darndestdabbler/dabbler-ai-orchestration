## Session 1 verification — VERIFIED after 2 round(s)

- Verifier: gpt-5.5 (openai) over copilot-cli
- Orchestrator provider (excluded): anthropic
- Routed verification cost: unpriced (seat transport)
- Raw round output: `.dabbler/runs/139-seat-catalog-refresh/s1/`

## Session 1 verification — VERIFIED after 3 round(s)

- Verifier: gpt-5.5 (openai) over copilot-cli
- Orchestrator provider (excluded): anthropic
- Routed verification cost: unpriced (seat transport)
- Raw round output: `.dabbler/runs/139-seat-catalog-refresh/s1/`

## Session 2 verification — VERIFIED after 2 round(s)

- Verifier: gpt-5.5 (openai) over copilot-cli
- Orchestrator provider (excluded): anthropic
- Routed verification cost: unpriced (seat transport)
- Raw round output: `.dabbler/runs/139-seat-catalog-refresh/s2/`

## Session 3 verification — VERIFIED after 2 round(s)

- Verifier: gpt-5.5 (openai) over copilot-cli
- Orchestrator provider (excluded): anthropic
- Routed verification cost: unpriced (seat transport)
- Raw round output: `.dabbler/runs/139-seat-catalog-refresh/s3/`

## Set 139 — end of set

**The lockfile has a writer.** v2 shipped the seat catalog reader and
left v1's writer behind, so the only remedy for a stale file was
hand-editing, and two people took it. `ai_router.transports.copilot` now
carries the serializer, `discover_models()`, merge semantics, the
declared candidate universe, and a `refresh` CLI. Nothing in this set
required a human to open the lockfile in an editor.

**The common case costs 1.33 requests, not 39.** v1's refresh had one
mode -- the whole universe -- so nobody ran it, and a writer too
expensive to run is not a writer. `--quorum` probes the cheapest
confirmed model of each provider, which is exactly enough to
re-establish the >=2-provider invariant and re-date the CLI version.
`--models`, `--stale` and `--all` are named scopes; `--all` still costs
39+ and must be asked for. Every run prints its projected cost from the
samples in the file before spending anything, names unknown-cost entries
as unknown rather than zero, and fails closed unattended without
`--yes`. Merge, never clobber: an entry a run did not probe survives
byte for byte.

**Hand-editing is detectable.** The writer stamps `written_by`,
`written_at` and a `content_digest`; `load_catalog` reports
`machine-written`, `hand-edited` or `unstamped`, and the last two warn in
the same channel as version drift. Detection, not enforcement -- the seat
still loads, and the record says what happened. The digest covers
rendered content rather than mtime, because the lockfile is committed and
every checkout rewrites mtime. Every stale-catalog message now names the
exact refresh invocation that resolves it; the absence of that verb is
the whole incident.

**The project-local config tier is back.** `local-overrides.yaml` is
deep-merged over the packaged `router-config.yaml`, is never committed
and never packaged, carries only the keys it changes, and refuses a key
the schema does not declare rather than dropping it. It sits below
`--transport` and `DABBLER_TRANSPORT`, so nothing that worked before
changes its answer. This machine now reaches its seat with neither an env
var nor a per-command flag, while the published default still reads
`profile: api`.

**Live on the operator's seat at CLI 1.0.80.** Dry run projected 2, the
real run spent 2, re-dated the pin from 1.0.68 and left 15 entries
byte-identical. `claude-opus-4.7` failed with `invalid-model` and kept its
prior confirmation, visibly stale -- the merge rule demonstrated on the
seat rather than in a fake. Full record in `s3-refresh-evidence.md`.

**One Major, from session 3 round 1, and it was right.** The seat reports
`premiumRequests` as a *fraction* for sub-premium models (`0.33` for
`claude-haiku-4.5`). Session 1 read every float as malformed, so the
cheapest models on the seat recorded as unknown-cost and sorted after
every known sample -- the quorum was picking a 1.0 model over a 0.33 one.
The coercion now accepts any finite non-negative number; a bool, string,
list, negative or non-finite value is still not a count. The boundary
rule session 1 established is intact; what changed is which values are at
the boundary, and only the live seat could tell us that. The invariant
holds: the sample is a one-call observation, never a price, and it never
feeds model selection.

**Test fixtures were decoupled from the live seat record.** Four tests
asserted exact values of the shipped lockfile, so an honest refresh broke
the suite -- pressure to edit the record until the tests pass, which is
the pathology this set exists to remove. Behaviour tests now read a
frozen `tests/fixtures/seat-catalog.lock`; only the two contracts that
must hold for *any* lockfile still read the shipped file.

**Verified.** All three sessions VERIFIED by gpt-5.5/openai over
`copilot-cli` (rounds 3, 2, 2). Suite 430 -> 475; 5 slots free against the
480 ceiling, against a 41-55 estimate for the set.
