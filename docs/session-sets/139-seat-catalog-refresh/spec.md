# Seat catalog refresh

> **Purpose:** The seat catalog lockfile is the load-bearing record of
> what a Copilot seat can dispatch, and v2 ships **no way to write it**.
> v1 had one — `python -m ai_router.copilot_catalog --refresh`, which the
> module docstring called "the lockfile's only writer" — and the v2
> rebuild kept the reader and dropped the writer. With no refresh command,
> the only remedy for a stale lockfile was hand-editing, which two people
> did, destroying the empirical signal the file exists to carry. This set
> restores the writer **and fixes the design flaw that made v1's version
> unrunnable**: it probed all 18 models every time, at 39+ premium
> requests, so nobody ran it.
> **Session Set:** `docs/session-sets/139-seat-catalog-refresh/`
> **Created:** 2026-08-18
> **Workflow:** Full
> **Prerequisite:** set 137 (the transport must dispatch before it can
> probe). Independent of set 138 — either may run first.

> **Note on rule 6:** operator-authorized exception, as sets 136–138.

---

## Session Set Configuration

```yaml
requiresUAT: false
requiresE2E: true
pathAwareCritique: none
module: default
totalSessions: 3
prerequisites: []
```

---

## The incident this set exists for

2026-08-18, the operator's seat. The chain, each link measured:

1. The v2 rebuild carried the catalog **reader** into
   `transports/copilot.py` (198 lines: load, validate, role resolution)
   and left the **writer** behind. v1's `copilot_catalog.py` had
   `discover_catalog()`, `dumps()`, `write_lockfile()` and a `--refresh`
   CLI; its docstring says outright that it "is the lockfile's only
   writer". v2 has no writer at all.
2. The seat CLI auto-updates. The lockfile pinned `cli_version` and
   `cli_version_pin_required` defaulted **on**, so a routine auto-update
   from 1.0.69 to 1.0.80 made `validate_catalog` refuse the entire seat.
3. With no refresh command, the only available remedy was editing the
   pin by hand. **Two people did.** The pin's whole purpose was to carry
   an empirical signal; hand-editing it destroyed exactly that.
4. Commit `2aa7287b` demoted drift to a warning and defaulted the pin
   off. That stopped the bleeding and left the wound: the file still
   cannot be refreshed, and set 137 could only correct its provenance by
   hand-editing again — re-committing the very sin, because there was no
   other verb.

The lockfile today still claims all but one entry was confirmed on CLI
1.0.68 while the live CLI is 1.0.80. That is not a data problem to be
tidied. It is the absence of a command.

## Why restoring v1 verbatim would fail

v1's `--refresh` was **all-or-nothing**: `discover_catalog()` walked the
entire `KNOWN_MODEL_UNIVERSE`, dispatched a real billed call per
candidate, and rewrote the whole file from that single run. Cost measured
from the samples in the current lockfile:

| Refresh shape | Premium requests |
| --- | --- |
| Full universe (v1's only mode) | **39** known + 5 of unknown cost |
| `claude-opus-4.8` alone | 15 |
| `gemini-3.5-flash` alone | 14 |
| Those two together | 29 — **74% of the total** |
| One cheapest model per provider | **2** |

A command that costs 39+ premium requests to answer "did my seat survive
an auto-update?" is a command an operator runs once and then never again.
That is not a discipline failure; it is the design selecting for
hand-editing. The bound on this set is therefore not "restore the
writer" but **make the common case cost 2 instead of 39**.

## What this set does NOT change (do not reopen)

- **No field in the lockfile becomes a price.** `probe_premium_requests`
  is a one-call sample, `None` means **unknown and never free**, and it
  must never feed selection. Real spend stays with `seat_cost.py`.
- **Enablement stays strictly empirical.** A genuinely-invalid model name
  and a policy-blocked one produce the identical CLI error shape (v1's
  S1 finding); nothing may infer enablement from a name.
- **Provider inference stays a declared heuristic.** Prefix-based, with
  `provider_source` recorded, never presented as first-party truth.
- **The fail-closed rules stay fail-closed.** Provenance on every
  confirmed entry, and ≥2 distinct providers, still refuse the seat.
  Only *version drift* is a warning, as `2aa7287b` established.
- **No new module** (ground rule 1). The writer joins the reader inside
  `transports/copilot.py`, which is where v2 put the catalog and where
  v1's principle — one module owns the lockfile — still points.
- **No `list-models` fiction.** The CLI has no enumeration command; the
  candidate universe is a maintained list, and the file must say so.

---

## Sessions

### Session 1 of 3: The writer, and the lockfile gets a single owner

1. Register.
2. Add the serializer to the catalog section of
   `transports/copilot.py`: render a `Catalog` back to the restricted
   TOML subset the reader already accepts — one flat `[meta]` table plus
   repeated flat `[[models]]` tables, scalar values only. Round-trip is
   the contract: `load(dump(catalog))` must equal the catalog, asserted
   on the shipped lockfile itself. Values that the serializer cannot
   render are coerced at the boundary, not trusted through it — a
   malformed `premiumRequests` off the wire (a float, a list) must not
   reach the writer, per v1's round-4 finding.
3. Add `discover_models()`: probe named candidates through the existing
   transport with a trivial prompt, recording per entry — on success,
   `confirmed` with `confirmed_at`, `confirmed_on_cli_version`,
   `echoed_model`, and `probe_premium_requests` read from the dispatch
   metadata; on failure, the failure's own error class. It takes the
   models to probe as an argument and has no opinion about which; the
   selection policy is Session 2's job.
4. Make it **merge, never clobber**. A refresh that probed three models
   rewrites those three and preserves every other entry byte-for-byte
   including its provenance. A previously-confirmed entry whose probe
   fails today is **not** silently demoted: a transient CLI failure is
   not a withdrawn model, so record the failed attempt and keep the prior
   confirmation, visibly stale, until an operator says otherwise.
5. Declare the candidate universe explicitly, in the lockfile rather than
   in code, so adding a model is a data edit and the file remains the
   whole truth about the seat. Seed it from the 18 ids already present.
6. Cross-provider verification through `copilot-cli`.
7. Required portion of the full test suite.
8. Close-out.

**Creates:** the serializer, `discover_models()`, merge semantics, the
declared universe. Every test uses the fake spawner; none invokes a real
CLI. Est. 16–20 new Python tests.

### Session 2 of 3: The refresh command, and the 2-request common case

1. Register.
2. Add `python -m ai_router.transports.copilot refresh` with explicit
   scopes, no default that spends 39 requests:
   - `--quorum` (the default): probe the cheapest confirmed model of each
     provider — 2 premium requests today — which is exactly enough to
     re-establish the ≥2-provider invariant and re-date the CLI version.
   - `--models a,b,c`: probe named candidates only.
   - `--stale`: probe entries whose `confirmed_on_cli_version` differs
     from the live CLI, cheapest first.
   - `--all`: the full universe, which must be asked for by name.
3. Price the run **before** spending it. Print the projected premium-request
   cost from the recorded samples, name the entries with unknown cost as
   unknown rather than assuming zero, and require confirmation above a
   threshold. `--dry-run` prints the plan and probes nothing.
   The samples in the lockfile exist for exactly this; a refresh that
   cannot estimate its own cost has not read its own file.
4. Report what changed as a diff, not a success message: entries
   confirmed, entries newly failing, samples that moved, and the CLI
   version re-dated. An unchanged refresh says so.
5. Cross-provider verification through `copilot-cli`.
6. Required portion of the full test suite.
7. Close-out.

**Creates:** the refresh CLI, scope selection, cost preview, the change
report. Est. 12–16 new Python tests.

### Session 3 of 3: Close the hand-edit hole, and prove it on the live seat

1. Register.
2. Make hand-editing detectable rather than merely discouraged. The
   writer stamps the lockfile with what wrote it and when; `load_catalog`
   surfaces a file whose contents postdate its own stamp as
   **hand-edited provenance**, reported in the same channel as version
   drift. The rule the repo already holds for `.dabbler/runs/` —
   machine-written, never hand-repaired — becomes checkable here instead
   of aspirational. Detection, not enforcement: an operator may still
   edit, but the record will say they did.
3. Point every stale-catalog message at the command that fixes it. The
   drift warning, the missing-provenance refusal and the
   fewer-than-two-providers refusal each name the exact `refresh`
   invocation that resolves them. The absence of that verb is what caused
   this incident; no message may report a stale catalog without naming
   it.
4. Live seat run: `--dry-run` first, then a real `--quorum` refresh on
   the operator's seat at CLI 1.0.80. Record the projected cost, the
   actual cost, the resulting diff, and the file before and after in
   `s3-refresh-evidence.md`. Then a `--models` run over the two entries
   set 137 could not confirm (`claude-haiku-4.5`, `claude-opus-4.7`), so
   the unknown-cost entries stop being unknown.
5. Documentation: `docs/quick-start.md` gains the refresh flow and the
   cost table; `docs/schema-reference.md` documents the lockfile schema,
   the declared universe, and the writer stamp.
6. Cross-provider verification through `copilot-cli`.
7. Required portion of the full test suite.
8. Close-out, and the end-of-set `change-log.md`.

**Creates:** the writer stamp and hand-edit detection, exit-naming
messages, `s3-refresh-evidence.md`, docs. Est. 8–12 new Python tests.

---

## Acceptance criterion for the set

On the operator's seat at CLI 1.0.80, `refresh --quorum --dry-run` prints
a plan costing **2** premium requests; the real run spends what it
projected, re-dates the CLI version, leaves every unprobed entry
byte-identical, and prints the diff it made. `--all` still exists and
still costs 39+, and must be asked for by name. A lockfile edited by hand
afterwards is reported as hand-edited on the next load. No stale-catalog
message anywhere fails to name the refresh command that resolves it — and
nothing in this set required a human to open the lockfile in an editor,
which is the outcome its absence made impossible.
