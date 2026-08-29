# STATUS — session 30 of 36 landed: the seat under TypeScript, and what it spent

**Branch: `master`.** Trunk-based; nothing lives anywhere else.
`experiment/verification-pipeline-v3` and `design/solution-decomposition`
are merged and finished. Earlier handoff text is in `docs/status-archive.md`.

> **Recorded, 2026-08-29.** Session 30's deliverables are decisions
> **D190–D196** in `docs/sessions/decisions-log.md`; session 29's are
> **D187–D189**; session 28's are
> **D180–D186**, session 27's **D173–D179**, session 26's **D170–D172**,
> session 25's **D163–D169**, session 24's **D150–D162** and session 23's
> **D138–D149**, plus the amendments inside
> `docs/ts-port-parity-control.md`. This file summarises them; the decisions
> are the record.

> **How to read a session number below this line.** Session 29 was inserted
> between 28 and what was then 29, so the port's remaining sessions each
> moved up one and the plan now runs to **36** (D188). Live guidance was
> renumbered; the append-only decisions log and the older sections of this
> file were **not**, because they were true when written. So "ported in
> session 29" in anything written before 2026-08-29 means what is now
> session 30, "session 31" means 32, and so on to the cutover, which was 35
> and is now 36. The ledger's dates carry the true order. The **Next**
> section at the foot of this file uses the new numbers.

## Where things are

- **Session 30 is closed `VERIFIED`** — 3 rounds (gpt-5-6-sol over the API).
  Round 1 raised one Major; it was **accepted and fixed**. Round 2 restated
  it on a narrower claim; that one was **disputed and withdrawn** in round 3.
  Claude Code / claude-opus-5[1m] orchestrator. All five gates passed at the
  first attempt; nothing was forced.
- **The seat's dispatch state machine is ported whole**, and `route`'s
  `copilot-cli` branch stops refusing itself by name — the refusal that
  `route.test.ts` asserted against session 30 is gone, replaced by five tests
  of the real branch. Spawn under a deadline, first-byte and total timeouts,
  the temp-file pull above 24,000 rendered units with its nonce footer and
  acknowledgement, the stderr taxonomy, and an unreadable catalog that stops
  dispatch instead of falling back to the API.
- **Two shape differences, both forced, neither in the record.** Python's two
  reader threads and their queue become one line pump feeding the same queue,
  because there is one thread; and `dispatch` is async, which is what `route`
  already expected. **The measurement is not allowed to differ**, so
  `subprocess.list2cmdline` is ported literally — trailing-backslash doubling
  included — because the inline-vs-handoff branch is chosen from its length,
  and a different number would send the two routers down different paths for
  the same prompt.
- **The catalog gained its writer, and a verb with it.** `dabbler copilot
  refresh` (D190): the absence of a refresh command IS the incident this
  record's design turns on, and a cutover that left the seat catalog
  unrefreshable from the router that dispatches off it would recreate it.
  `REFRESH_COMMAND` still names the **Python** invocation on purpose — both
  routers print that string and the control compares it — and re-pointing it
  is owed to the cutover.
- **Round 1's Major was a divergence, not just a bug.** `resolveProgram`
  walked PATH the way `cmd` and `where` do, so `copilot` resolved to the
  `.BAT` shim VS Code installs ahead of the WinGet `.EXE`. A shim can only be
  run by `cmd.exe`, whose command line stops at **8,191** where
  `CreateProcess` allows 32,767 — and the handoff only starts at 24,000, so
  every prompt in between would have failed before the CLI ran. Python found
  the executable; this router found the shim. Resolution now prefers an
  executable anywhere on PATH to a shim nearer the front, which is
  `CreateProcess`'s rule and the one `subprocess` follows (D195).
- **Round 2 asked for shim parsing and was refused (D196).** D174 had
  already measured and rejected it, and this shim has no executable target to
  find: `copilot.bat` is `@echo off` plus `powershell -ExecutionPolicy Bypass
  -File …\copilot.ps1 %*`. The residual — a machine with only a shim — is
  bounded identically on **both** routers, so fixing it on one side would be
  a capability divergence introduced by a port. **Every round ran with
  `agency: none`**, which is why the dispute cited file and line rather than
  asserting.
- **`seat_cost` is ported on `node:sqlite`**, `readOnly` (which is `mode=ro`);
  the WAL is read and `immutable` is not used, because `immutable` is what
  skips the WAL and undercounts a live store by ~7%. It is **fetched with
  `process.getBuiltinModule`, not imported** (D192): `node:sqlite` is absent
  from `module.builtinModules`, so resolvers strip the prefix and hunt for a
  package called `sqlite`. That answer needed no build config and no
  test-runner config; the `vitest.config.ts` written along the way was
  deleted.
- **The live seat probe reached the real CLI and the seat refused for quota
  (D193).** It spawned the actual `copilot`, measured 31,673 rendered units,
  took the **handoff** branch, wrote a 31 KB payload and dispatched — then
  got `You have exceeded your monthly quota`, which the taxonomy classified
  `quota-rate-class` from real stderr. **The ack-validated half of step 5 is
  therefore unproven** and is owed to a run after the quota resets; the test
  is committed behind `DABBLER_E2E=1`. A real failure is not nothing: no fake
  spawner could have produced it.
- **Seat cost is measured, and it is its own acceptance test.** The failed
  turn still cost credits, and both routers priced the same conversation
  against the CLI's live store identically — `measured`, **9.197 credits /
  $0.0920** over one event — agreeing with each other and with the CLI's own
  reported 9.2.
- **Parity: 18 cases, two of them new, all identical.** `seat-cost` enters
  with a **floor** case and an **unmeasured** case, over a canned
  `session-store.db` the corpus writes. The seat catalog's **write** does not
  enter and cannot: a refresh must probe, and a probe is a billed premium
  request per model. `copilot refresh --dry-run` spends nothing, was run both
  ways and is byte-identical — but Python's `python -m` path prints a runpy
  `RuntimeWarning` to stderr, which the control compares. It becomes
  comparable for free at the cutover (D194).


### Session 29, still current

- **Session 29 is closed `VERIFIED`** — 2 rounds (gpt-5-6-sol over the
  API). Round 1 raised one Major; it was **accepted and fixed**, not
  disputed, and round 2 was clean but for three nits describing one race.
  Claude Code / claude-opus-5[1m] orchestrator. All five gates passed at the
  first attempt; nothing was forced.
- **D173 and D185 are closed by one ruling (D187).** Both were the same
  complaint: the two routers wrote a different string into a record for the
  same event, because the string was the name of whichever library did the
  work. Both are now framework-owned vocabulary. This is a **record change,
  not a port session** — no module was translated, and both halves landed in
  Python first.
- **A failed enumeration has eight names and the list is CLOSED.** `timeout`,
  `network-error`, `http-error`, `parse-error` and `unknown-error` join the
  three the field already carried. An unmapped failure becomes
  `unknown-error` rather than contributing its class name: an open mapping
  breaks the byte comparison the first time either library raises something
  unanticipated — silently, in a committed file, on whichever machine hit it
  first. **The original class name is written nowhere**, because a second
  field would recreate the problem and excluding it from comparison would put
  a value in the record that nothing checks.
- **Timeout and unreachable stay apart**, against one advisor's suggestion to
  merge them into a single transport term. The remedies differ — raise the
  ceiling, or fix the URL — and a field whose whole job is to say why the
  entries are stale should not collapse "your ceiling is too low" into "your
  address is wrong".
- **Each side reads its own library's bases, not a list of leaf classes.**
  `httpx.TimeoutException` / `HTTPStatusError` / `TransportError` in Python;
  in TypeScript the two classes `transports/api` raises, plus an unwrap of
  Node's `cause` chain — because Node reports a refused connection as a
  `TypeError` whose cause carries `ECONNREFUSED`. A new leaf class in either
  library keeps working.
- **`run_absence_search` stamps `dabbler-absence-search/1` in both routers.**
  The field's job is not to name a regex engine but to overwrite what the
  reviewer claimed: a worker can say it searched and report a number, and
  this function re-runs the search and stamps its own answer. Naming an
  engine never did that job. It also ends an instability nobody had noticed —
  the Python value embedded the interpreter's PATCH version, so it moved on a
  `3.11.9` → `3.11.10` upgrade, inside one router, with no engine change.
- **Round 1's Major caught a green control that proved nothing, and it is
  the session's most useful output.** The parity case built to prove the new
  vocabulary pointed at `http://127.0.0.1:1`. Port 1 is on the WHATWG
  bad-port list: Node's `fetch` rejects it with `bad port` **before opening a
  socket**, while httpx dialled it and was refused. So the case compared a
  refused connection against a rejected URL and passed — the TypeScript
  classifier reached `network-error` through its `fetch failed` fallback
  rather than through a real transport failure. **A control that agrees for
  different reasons is worse than no control, because it reads as proof.**
  No test in either router would have caught it.
- **The corpus now allocates the port rather than picking one.** It binds
  port 0, reads back what the OS assigned, releases it and uses that —
  never a bad-port number, and never a port something might be listening on.
  `discovery.test.ts` asserts `ECONNREFUSED` in the failure chain **before**
  asserting the vocabulary term, and a second test pins `fetch`'s bad-port
  refusal from the other side, so the substitution cannot recur unnoticed.
- **The `enumerate` parity case now covers both halves of the field.** One
  vendor keeps a fake key and the closed-port base URL; the other two still
  fail at `no-api-key`. Both routers must write the same word for each, and
  the two records differ only in their timestamps and the digest over them —
  which is what normalization already handles. Still 16 cases over 85 paths.
- **Session 29 was inserted, and it cost a renumber (D188).** The lifecycle
  derives the next session from the completed ones, so it refuses an
  out-of-order number; inserting one meant moving Transport II to 30, the
  cutover to 36, and 38 lines of live guidance across 15 files. The
  append-only log and this file's older sections were deliberately left
  alone — see the note above. **Worth knowing for the next insertion:
  register, declare, *then* renumber** — `declare` refused the first attempt
  because the tree already carried 15 changes, and it was right to.
- **A future enhancement is recorded rather than built**, in
  `docs/operator-decisions.md`: session numbers should become insertable, so
  a session between 28 and 29 costs nothing. Two caveats went with it —
  **store it as a string or scaled integer, never a language float** (neither
  TypeScript nor Python has a native decimal type, and Python already writes
  `29.0` where JavaScript writes `29`, which is why `PythonFloat` exists);
  and **wait until the port leaves one implementation**, because a behaviour
  change made on both sides at once is the one thing parity cannot see.
- **Seat cost: 18,839 in / 6,570 out to gpt-5-6-sol over two rounds
  (D189).** The cheapest session of the port by a factor of two — the running
  total across seven is 537,282 verifier tokens, and the next cheapest is
  session 24 at 61,855. That is not a better process; it is a 200-line diff
  instead of a 2,276-line port, and the round-1 prompt is sized by the diff.
  Round 2 is 55% of round 1, the highest ratio recorded, which also means
  nothing: it is a fraction of a small denominator. In absolute terms round 2
  cost 6,666 tokens, the smallest verification round of the port.
- **One measurement the series has never covered.** The advisory consult
  that precedes a ruling — `gpt-5-6-sol` and `gemini-3-1-pro`, per the
  operator's standing directive — leaves no row in `router-metrics.jsonl`.
  Every seat-cost decision in this port measures verification only, so the
  series is comparable but incomplete.
- **Suite: 944 Python (5:45) / 391 router vitest (51 s, plus 3 live tests
  skipped) / 153 extension mocha / 14 Playwright; all four declared controls
  green.** Python test counts unchanged; vitest gained two.
- **Left deliberately.** Round 2's surviving nit is a time-of-check/
  time-of-use race: between releasing the allocated port and the routers
  connecting, another process could bind it, and both routers would then
  agree about whatever they found. The window is microseconds against an
  ephemeral range, the failure is loud (a 200 where a refusal was expected,
  in a control that diffs bytes), and the alternative is retry machinery in
  a corpus builder.

- **Session 28 is closed `VERIFIED`** — 2 rounds (gpt-5-6-sol over the
  API). Round 1 raised one Major and three nits; the Major was **disputed
  and withdrawn**, and round 2 was clean. Claude Code / claude-opus-5[1m]
  orchestrator. All five gates passed at the first attempt; nothing was
  forced.
- **Six modules are ported.** `transports/base` (49), `transports/offline`
  (140), `transports/api` (292), `selection` (146), `route` (592) and
  `discovery` (1,057) — 2,276 Python lines becoming **2,879 TypeScript
  across seven files**, plus the `discovery` verb, with **90 vitest tests**
  answering for the 82 Python ones. `transports/copilot.ts` grew by 171
  lines: the seat catalog's READER.
- **`fetch` replaces `httpx`, which makes `route` async (D180)** — and that
  is the whole of the shape difference. Neither a promise nor a child
  process has a blocking form under Node, and a synchronous facade over
  either would stall the only thread there is; `checks.execute` took the
  same shape in session 27 (D174), and these are the last two. **The rate
  limiter's `threading.Lock` survives as a promise chain rather than being
  dropped as a Python artefact**: Node has one thread and the same hazard,
  and two awaited `wait()` calls would otherwise both pass the ceiling.
- **Two branches of `route` are refused BY NAME (D181), not skipped.** The
  `copilot-cli` transport names session 29; the auto-verification tail — a
  live branch, since the bundled config auto-verifies `code-review` — names
  session 31. A silent fallback to the API would put a cross-provider
  verification on the provider the operator was routing away from, and a
  dropped auto-verify would return an unverified result that reads as
  verified. Everything up to those two branches is real: prompt rendering
  and the over-budget refusal, the escalation triggers, the truncation
  heuristic, the exclusion assertion at the call site, the metrics row, and
  the whole API and offline paths. **The seat's half of selection is real
  too**, so session 29 inherits a transport to write rather than a rule to
  restate.
- **The parity control compares a lock-file WRITE, on 16 cases over 85
  paths (D182).** Four `discovery` cases on `fresh`: `status`, `drift`,
  `enumerate --dry-run` and `enumerate`. The specification excluded
  `enumerate` as needing the network — true on a machine with keys, so
  **the corpus takes the keys away**. Every vendor then fails `no-api-key`
  before a socket opens and both routers fold that identical failure into
  the same record, byte for byte including the writer stamp and the digest.
  The scrub is load-bearing on its own: without it every parity run on the
  operator's machine would spend three vendor calls per shape.
  `.dabbler/api-models.lock` joins the compared paths and **names itself as
  the second digest-over-a-timestamp**, as the specification requires.
- **One compared line is wall-clock-derived and no normalization reaches
  it.** Three of the four cases print a record's age as `f"{h:.0f}h old"`
  from each router's own `now`, about a second apart. They disagree only
  when that second straddles a rounding boundary — roughly one run in two
  thousand — and the diff then reads `5713h old` against `5714h old`, which
  re-running settles. Recorded rather than fixed: a third normalization is
  forbidden, and a `--now` flag would be a CLI knob invented for the
  control's convenience.
- **Two debts session 26 left by name are closed (D183).** `session start`
  emits its discovery warnings through the same fail-silent wrapper Python
  uses — a staleness check that could fail a registration would be a
  maintenance signal capable of causing an outage. And the seat lock file
  now has **one parser**: `identity`'s lenient reader collapsed into a
  wrapper over the real `loadCatalog`, which closed a latent divergence
  nobody had noticed — the old reader used the good entries of a malformed
  lock where Python resolves nothing.
- **The ported transport reaches all three vendors live (D184).**
  anthropic 1.3 s, openai 2.0 s, google 0.7 s, in `test/live.test.ts`,
  gated on `DABBLER_E2E=1` and skipped by the default run — an explicit
  opt-in rather than "are there keys here", because a developer with keys
  set must not discover that `npm test` spends money. OpenAI served
  `gpt-5.4-2026-03-05` for `gpt-5.4`, so the served-model notice fired
  against a real body rather than a canned one.
- **The disputed Major was wrong about which module writes what, and the
  rebuttal cost 3,400 tokens.** It read the plan's "`discovery` reads and
  writes `copilot-catalog.lock`" literally; but `ai_router.discovery` never
  writes that file (all four of its seat references are reads), its writer
  is in `transports/copilot.py`, and a refresh is *defined* as an empirical
  probe — so porting it would have pulled session 29's dispatch state
  machine into session 28. A writer without the probe could only mark a
  model `confirmed` with no evidence, which that file's own design forbids.
  The verifier withdrew on the first reading of the cited lines.
- **One nit was a real defect and is fixed with a test.** A Gemini 200 with
  no candidate — what a safety block returns — became the literal string
  `"undefined"` and would have passed every escalation trigger as an
  answer. Python indexes and raises, so the port now raises: an empty
  string would have been just as wrong, converting a blocked response into
  an escalation the record cannot tell from a model that answered with
  nothing. The same coercion in the Anthropic caller was fixed with it. Two
  other nits described Python's behaviour faithfully ported and were
  answered with a docstring rather than a change — `DispatchError`'s claim
  to cover exhausted API retries overstates what *either* router does.
- **A second D173-shaped question is owed a ruling (D185).** A failed
  vendor's recorded `last_error` is the failing library's own class name,
  so the routers write `TimeoutException` and `HttpTimeoutError` into
  `.dabbler/api-models.lock` for the same failure. Every byte difference
  before these two was settled in Python's favour (D165) because each was
  *formatting*; both of these are content. The parity corpus cannot see it
  — with no keys every vendor fails as the shared `no-api-key` constant.
  **Session 35 is the deadline for both**: after it one router remains and
  whichever string it writes becomes the answer by default rather than by
  decision.
- **Seat cost: 60,448 in / 10,443 out to gpt-5-6-sol over two rounds
  (D186).** Round 2 is **18%** of round 1's input, against 26% at session
  26 and 8% at 27. Six ported sessions have now spent 511,873 verifier
  tokens; session 28 is the third cheapest of them while being the second
  largest by Python lines ported.
- **Suite: 944 Python (5:58) / 389 router vitest (47 s, plus 3 live tests
  skipped) / 153 extension mocha / 14 Playwright; all four declared
  controls green.** Python test counts unchanged. `packages/router` is
  ~14,500 lines of source (1,572 generated) and ~5,500 of tests.
- **Left for whoever needs it, deliberately.** Round 2's surviving nit says
  the Gemini reader takes `parts[0]` only — which is exactly what Python
  does, so a multipart response truncates in both routers identically. It
  is Python's behaviour, not the port's. Separately, `pytest.ini` declares
  the `e2e` marker as excluded from the default run but `addopts` carries
  no `-m "not e2e"`; nothing is wrong today because no Python e2e test
  exists, and adding one without that flag would put live vendor calls into
  the run of record.

- **Session 27 is closed `VERIFIED`** — 3 rounds (gpt-5-6-sol over the API).
  Round 1 raised four Major findings; **three were disputed and all three
  withdrawn**, and the fourth was accepted and fixed by *deleting* the
  function rather than repairing it. Round 2 raised one Major against that
  deletion; **disputed and withdrawn**. Round 3 was clean. Claude Code /
  claude-opus-5[1m] orchestrator. All five gates passed at the first attempt;
  nothing was forced.
- **Four modules are ported.** `evidence` (902), `checks` (1,001),
  `test_evidence` (815) and `affected` (575) — 3,293 Python lines becoming
  **4,159 TypeScript across six files**, plus two verb handlers, with **93
  vitest tests**. `evidence.ts` grew from session 26's 208-line slice to
  1,137; `checks.ts` is 1,306, the largest file in the package.
- **`affected` and `test-evidence` are real verbs, and both entered the
  parity control in the session that ported them** — the first time since 25
  that a session needed no forward dependency and no new fixture. Both
  already had a Python command line and both were already in the `in-flight`
  corpus builder, so the three new cases run against a shape the control was
  already building.
- **Twelve cases, and the control got FASTER: 90.7 s against ~150 s at nine
  (D176).** A new *case* on an existing shape is nearly free — the corpus
  build dominates and the new cases share it. A new *shape* is not, and
  sessions 28 and 32 add three. That is the amendment to D169's warning: the
  thing to watch is shapes, not cases.
- **Both digests are byte-identical across the routers.** The
  `preverify-targeted` case compares the covered-surface fold — sorted
  (path, content-hash) pairs, with the session's own bookkeeping and the run
  ledger left out; the `final-full` case compares the whole-tree fold the run
  of record binds to. `--duration-seconds 42` had to be written `42.0` by
  both, which is `PythonFloat` earning its keep in the first row either
  router appends.
- **Both routers snapshot this repository's live worktree to the same git
  tree id (D177).** `b6d8e262…` from each, over ~2,000 tracked and untracked
  files through a throwaway index. The plan asked for `completion_tree`
  parity; the control cannot compare one until a verb writes a round, which
  is `verify` in session 32 — so this is **evidence, not a control**, taken
  the way session 25 took `verdict`'s (D163).
- **Windows spawning is where Node and Python actually differ, and it is
  measured (D174).** `spawn("x.cmd", …)` is `EINVAL` on Node where Python
  appears to run the batch file directly — it does not: `CreateProcess`
  wraps a batch file in `cmd.exe /c`, so **both routers pay cmd's parsing on
  exactly these programs**. The port hands the shim to `%COMSPEC% /d /s
  /v:off /c` with each argument quoted itself, never `shell: true`, which
  would let a shell re-split a line the module built. An over-long command
  line is `ENAMETOOLONG` (libuv's mapping of Windows error 206, the same one
  Python's Copilot classifier reads), it is **thrown rather than emitted**,
  and `checks.isArgvTooLarge` is the one reader of it for session 29 to
  import. `execute` is async and takes no run id: the heartbeat it wrote is
  a run-core file (D130).
- **`checks.plan` is deliberately NOT ported (D178).** Round 1 found that it
  appends the whole selection to every suite's command where `forSuite`
  exists to prevent exactly that. Its only callers are `runcli.py:400` and
  `runcli.py:814` — measured — and the run core is deleted in session 34, so
  the repair is deletion: fixing it would have put a narrowing rule in the
  TypeScript router that Python lacks, in a function neither router calls.
  `CheckPlan`, `changedPathsFor`, `targetedSuiteCommand`, the four
  `FULL_ALLOWED_*` constants and `selectionUnknownPaths` went with it. This
  is the same cut D129 made for `journal` and `verifyjob`. **The per-suite
  guarantee still exists where it is reachable**, in
  `affected.runnableCommands` and `preverifyGate`, and is tested against a
  two-suite repository.
- **One deliberate record difference, owed a ruling (D173).**
  `run_absence_search` stamps the regex engine that produced the count;
  Python writes `python-re/<version>`, the port writes `node-regexp/<node>`.
  Every other cross-language byte difference was settled in Python's favour
  (D165) because each was a *formatting* choice; this one is content, on the
  one row whose purpose is provenance, and the engines genuinely differ.
  Nothing reaches it today.
- **Three of round 1's four findings described Python's behaviour faithfully
  ported, and two named functions with NO CALLER in either router.**
  `validate_transcript`, `validate_finding_evidence`, `authoritative_tier`,
  `verify_worker_result` and `record_worker_result` are library surface the
  critique pipeline would drive, and it defaults to `off`. The verifier
  withdrew all three on that basis. What the commits added instead is the
  limit stated in each docstring, so no later reader assumes a guarantee
  that is not there.
- **Where Python states a rule twice, the port states it once (D175).**
  `pythonRepr` was about to have six copies; it now lives in `pythonJson.ts`
  beside `dumps`, `progress.ts` re-exports it and `critique.ts`'s private
  copy is deleted. `normaliseRel`/`matchingPrefixes` are stated once where
  Python carries byte-identical copies in `checks` and `test_evidence`.
  `gates`'s glob matcher is deliberately not shared: it is case-insensitive
  and `checks`'s is not.
- **Seat cost: 82,021 in / 16,256 out to gpt-5-6-sol over three rounds
  (D179).** Round 2 is 26% of round 1's input and round 3 is 8% — **a third
  round spent on a dispute is close to free**, which is the argument for
  writing the rebuttal out rather than remediating on reflex.
- **Suite: 944 Python (7:09) / 299 router vitest (50 s) / 153 extension
  mocha / 14 Playwright; all four declared controls green.** Test counts
  unchanged on the Python side. `packages/router` is ~11,600 lines of source
  (1,572 generated) and ~3,900 of tests.

- **Session 26 is closed `VERIFIED`** — 2 rounds (gpt-5.6-sol over the API).
  Round 1 raised two Major findings; **both were disputed and both were
  withdrawn**, and round 2 was clean. Claude Code / claude-opus-5[1m]
  orchestrator. All five gates passed at the first attempt; nothing was
  forced.
- **The record is ported.** `ledger` (901), `writers` (881) and `journal`'s
  surviving slice (~150) became **~4,000 TypeScript lines across ten
  files**, with **74 vitest tests**. Everything under `.dabbler/runs/` and
  `docs/sessions/` is written there and nowhere else.
- **D129 sized this session at three modules; it is nine (D171).**
  `writers` cannot be ported alone. It imports `progress` (session 30) for
  the status vocabulary, the derived view and the invariants it folds a
  state through before writing it; `evidence` (session 27) for the
  filenames at the sessions root and the digest ledger every sanctioned
  write appends to; and `gates` (session 30) for the working-tree question
  the declaration refuses on. Each is ported as a named slice in a file
  named for its Python module — 302 Python lines in all — the way session
  25 ported `transports/copilot`'s timeout slice. Porting the writer
  without the reader would put a second statement of what a legal record is
  inside the module that produces them.
- **`session start` / `declare` / `log` / `decision` are real; the rest of
  the verb is refused by name.** Nothing `writers` writes is reachable
  except through those four, so without them ~4,000 ported lines would have
  entered no comparison at all. `contracts/verbs.ts` moves `session` to
  `portedInSession: 26`; `cli/session.ts` refuses `close`, `cancel`,
  `restore`, `plan` and `migrate` and names session 30. **Session 30 keeps
  the lifecycle's judgment half** — the five gates, the boundary reversals,
  the legacy migration — and its scope is unchanged by this.
- **The parity control compares nine verb cases over 45 paths**, up from
  one: `metrics`, `session start` (fresh + in-flight), `declare` (fresh),
  the already-declared **refusal** (in-flight), `log` (in-flight) and
  `decision` (both shapes). The refusal case is deliberate — a refusal's
  wording is what the operator reads, and it exercises a branch no passing
  case reaches.
- **It found a real defect on its first run, in the one row it had just
  appended.** Python's `open(path, "a", encoding="utf-8")` takes the
  platform default newline, so on Windows every `.dabbler/runs/` JSONL row,
  `sessions.json` and the activity log carry CRLF — while the files opened
  with `newline=""` or `newline="\n"` carry LF. Node writes the bytes it is
  given. The rule is **per file**, and getting it wrong in either direction
  is drift: `journal.platformNewlines` is the one seam, and every writer
  whose Python twin takes the default goes through it.
- **Two seams earned their existence by making other files smaller.**
  `pythonJson.ts` is `json.dumps`: the `", "` separator, `ensure_ascii`
  (including DEL, which is ASCII and which CPython still escapes), the
  astral surrogate pair, and CPython's float `repr` — which moved here out
  of `lockfile.ts`, so the seat catalog's TOML, the metrics ledger and every
  record row now get one answer. It was **checked against CPython over 13
  shapes × 3 modes: all 39 identical**. `schema/validate.ts` is the ajv
  wrapper `config.ts` had privately; the error *location* matches Python's
  `jsonschema`, the error *wording* is explicitly not claimed (D165).
- **D160 is discharged (D170).** `test_evidence.surface_digest` omits an
  unreadable path instead of hashing the literal word `"deleted"`, so a
  deletion moves the freshness digest once — when the file goes — and the
  commit that records it moves nothing. It is its own commit, as the
  control's sequencing rules require, and it rode in the working tree
  rather than landing before the session, so the verifier saw a change to a
  gate. **The trap in `AGENTS.md` is now history rather than a warning.**
- **The corpus declares both discovery records fresh.** `session start`
  warns for every discovery record that is absent, undated or overdue, and
  an absent one is stale whatever the threshold says — so a corpus without
  them would make every registration comparison a comparison of
  `discovery`, which lands in session 28. `.dabbler/api-models.lock` is
  written with a fixed date and the overlay puts both thresholds past any
  age they can reach. That second half matters on its own: the checked-in
  seat catalog is dated 2026-08-19 against a 720 h threshold, so **without
  it the control would have turned red around 2026-09-18** for a reason no
  diff of the change would explain.
- **Round 1's two findings were both real questions and both correctly
  disputed.** The first said malformed `sessions.json` is silently replaced
  rather than refused — true, and it is *Python's* behaviour
  (`progress.py:441-452`, `writers.py:398-414`); making TypeScript refuse
  would have turned the control red, and the specification forbids that
  repair in as many words. The second asked for a round-append parity case
  — unreachable, because `ledger` has no Python command line and the only
  verb that appends a round is `verify`, at session 32 on shapes with no
  builder until 28. Both halves that *were* actionable were fixed: an
  `existsSync` probe that turned a deleted-file race into a throw where
  Python returns null, and six direct tests over `appendRound` including
  the anchor. **The disputes cost 11,590 tokens and settled both.**
- **Suite: 944 Python (5:28) / 207 router vitest (18 s) / 153 extension
  mocha / 14 Playwright; all four declared controls green.** The Python
  suite gained one test (D170's). `packages/router` is now ~7,400 lines of
  source (1,400 generated) and ~2,100 of tests.

- **Session 25 is closed `VERIFIED`** — 2 rounds (gpt-5-6-sol over the
  API), round 1 blocking and correct, round 2 clean on the fix delta. Claude
  Code / claude-opus-5[1m] orchestrator. All five gates passed at the first
  attempt; nothing was forced.
- **Seven modules are ported.** `config`, `secret_resolver`, `identity`,
  `verdict`, `lockfile`, `runtime_mode`, `metrics` — 1,841 Python lines
  becoming **2,790 TypeScript across fourteen files**, with **122 vitest
  tests** answering for the 98 Python tests. The extra files are the seams:
  `paths`, `textfile`, `version`, `cli/output`, and the two forward
  dependencies (below).
- **Both routers read ONE copy of the bundled data.** `router-config.yaml`,
  the schemas and the prompt templates are read from `ai_router/` by both,
  resolved through `src/paths.ts`, which finds the package by walking up for
  its own `package.json` — the same code runs from `src/` under ts-node and
  from `dist/` after esbuild, and a fixed number of `..` would be silently
  wrong in one. A second copy of that data would drift, and the control
  compares two routers reading the same input. Session 33/35 decides what
  the package ships with when Python leaves.
- **`metrics` is the first verb the port makes real**, and the parity
  control's **first cross-router case** — a session earlier than D159
  assumed, because `contracts/verbs.ts` has said `metrics` lands in session
  25 since it was written. Both routers produce byte-identical stdout,
  stderr and exit code on `fresh` and `in-flight` (**D163**).
- **Landing one verb found two defects six more library ports would not
  have (D166).** `python -m ai_router.metrics` printed a runpy
  `RuntimeWarning` on *every* invocation, because `__init__` imports
  `route` and `route` imported `metrics` at module scope; `route` now
  imports `record_call` inside the one function that calls it, which is how
  `verifyjob` already reached it. And **session 23's bundled `dabbler.cjs`
  died on its first line**: esbuild's CommonJS output has no
  `import.meta`, so any module locating itself by it resolved `undefined`.
  Nothing had noticed because no verb was implemented, so nothing in the
  bundle had ever read a file. `build.mjs` now defines it from `__filename`.
- **`config` load enters the control through `metrics`; `verdict` parse
  could not.** `verdict` has no command line and is reached only through
  `verify` (session 32), so its case lands there. It was proved instead
  against **every verifier output this repository holds — 71 files, three
  vendors — parsed by both implementations and compared structurally:
  identical on all 71** (**D163**). That is evidence, not a control.
- **Four cross-language byte differences are settled in Python's favour
  (D165):** line endings in both directions (`cli/output.ts` writes the
  platform's ending because Python's `print` does; `textfile.ts` reads
  universal newlines because Python's text mode does, and the TOML reader
  deliberately does not, because `tomllib` takes bytes); `int` versus
  `float` via a `tomlFloat` marker; CPython's float `repr`; and
  `json.dumps`'s separators and non-ASCII escaping. **Schema error
  *wording* is explicitly not claimed** — `ajv` and `jsonschema` word and
  order errors differently, and matching them would be a second
  implementation of a rule.
- **Both owed rulings with a deadline here are discharged.** **D159**: session
  23's step 5 is reworded. **D161**: `facts.run_control` now keeps a passing
  control's own output in the record, and a silent control records that it
  was silent — with each parity case declaring, in the type system, what a
  green row for it proves (**D167**).
- **Round 1's finding was real and is the reason to keep the loop.** The
  control claimed a "three-layer config load" the corpus never exercised:
  there was no `local-overrides.yaml` in it. That is D161's own failure mode
  arriving in the session that implemented D161. The corpus now carries one,
  written per repository and **load-bearing rather than scenery** — it is
  what points `metrics` at the canned telemetry, so with it the report reads
  4 calls and without it 110. The corpus also scrubs `AI_ROUTER_CONFIG`,
  `AI_ROUTER_METRICS_PATH`, `DABBLER_TRANSPORT` and `DABBLER_NO_ROUTER` from
  the child environment: an operator with the first one set would have made
  both routers read their config and skip both layers, wrong together, which
  is the one failure a comparison cannot see.
- **Suite: 943 Python (5:12 at `-n 2`) / 133 router vitest (6 s) / 153
  extension mocha / 14 Playwright; all four declared controls green.** The
  Python suite gained one test (D167's). `packages/router` is now ~4,700
  lines of source (1,400 generated) and ~1,300 of tests.

- **Session 24 is closed `VERIFIED`** — 3 rounds (gpt-5-6-sol over the
  API), the round-3 finding **disputed and OVERRULED** by a third provider
  (gemini-flash/google). Claude Code / claude-opus-5[1m] orchestrator.
  **Closed through all five gates, at the second attempt.** The first
  close used `--force` to get past the freshness gate and marked sessions
  25–35 of the port plan `complete`, because `forced` promotes every open
  session — a forensic marker for abandoning a set, not a way past one
  gate. The ledger was restored from the pre-force commit, the full suite
  re-run, and the session closed normally with no `forceClosed` stamp.
  **D158** carries the whole of it, including the three framework defects
  it exposed; the traps are written into `AGENTS.md` so the next engine
  meets them before the tool.
- **The seam is in, and `src/router/` IS the Python implementation.**
  `pythonSpawnRouter` builds the argv and satisfies `Router`; `routerCli`
  runs it, echoes it and classifies the exit code; `pythonInterpreter`
  finds the interpreter; `projectionPayload` narrows what comes back;
  `host.ts` is the composition root and the only file callers import.
  Nothing outside the directory imports any of them. The one declared
  exception is `commands/bootstrapProject`, which creates a venv and
  pip-installs the router — it runs before there is a router to ask
  (**D154**). Session 35 changes one line in `host.ts`.
- **`types.ts` is deleted (D139's purpose served).** Its 209 hand-kept
  lines are the generated `ProgressProjection`, imported under the
  extension's own names by alias, so a schema change is a compile error at
  every call site. `SessionsRepository` — the extension's own row shape,
  never part of the projection — moved to `utils/fileSystem.ts`, where it
  is built.
- **The extension no longer emits TypeScript (D150).** Reading the
  router's types from source needs `allowImportingTsExtensions`, which
  TypeScript permits only under `noEmit`. Nothing consumed the emit:
  `dist/extension.js` is esbuild's, the unit suite runs the sources
  through ts-node, Playwright transpiles its own specs, CI typechecks with
  `--noEmit`. The one consumer was the `@vscode/test-electron` harness the
  extension's CHANGELOG records as broken and CI has never run;
  `src/test/runTests.ts` and `src/test/suite/index.ts` went with it.
- **The router package is importable at last (D151).** `main:
  src/index.ts` gave it no importable form — ts-node refuses to `require`
  any `.ts` under a `"type": "module"` package. `build.mjs` now emits
  `dist/index.cjs` beside `dist/dabbler.cjs`; `main` points at the bundle
  and `types` at `src/index.ts`, so a consumer type-checks against the
  source and links against the bundle with no declaration in between to go
  stale. `prepare` builds it, so `npm ci` produces it and neither CI nor a
  fresh clone needs a new step.
- **Two live defects surfaced and fixed.** `ai_router.modules create
  --title` is `required=True`, and the extension omitted it whenever an
  operator accepted the default title — New Module's likeliest path was
  sending an argparse usage error (**D153**). `troubleshoot` printed
  `python -m ai_router.report`, a module set 109 removed, beside
  per-session dollar figures the router has had no rate table to produce
  since then.
- **`PythonSpawnRouter` builds argv only for verbs read off the Python
  parser (D152).** A first pass implemented all 32 `Router` methods from
  the contract's option names, and three were wrong: `ai_router.modules`
  has exactly one subcommand (`create` — there is no `list` or `retire`),
  and `verify dispute` takes `--finding`, not `--finding-index`. The other
  twenty refuse by name. **Owed:** sessions 30/32/34 port those modules
  and should reconcile the contract rather than inherit a shape nothing
  ever ran.
- **Suite: 942 Python (5:03 at `-n 2`) / 11 router vitest / 153 extension
  mocha / 14 Playwright; all four declared controls green.** Test counts
  unchanged — no new tests, as the plan estimated. Net TypeScript in the
  extension is **+178 lines**, not the net-negative the plan estimated:
  `implements Router` requires all 32 methods, and the twenty that refuse
  still cost their signatures.

- **Sessions 22–35 are landed** in `docs/sessions/session-plan.md` (commit
  `d77a075a`, `totalSessions: 35`): the port of `ai_router` to TypeScript so
  the framework ships as one Marketplace artifact and a project holds only
  its own record — **D128**, operator. **Session 22 is closed
  `VERIFIED`** (3 rounds, gpt-5-6-sol over the API; every finding
  Minor). A prose session: Claude Code / claude-fable-5 orchestrator, no code,
  no test.
- **The inventory is decided (D129):** 38 modules ported, 4 merged, 3
  retired; 832 tests ported, 109 deleted. Three departures from the plan's
  default table, each from the import graph: `facts` is verification's
  deterministic-controls module (ported, session 31); `fixloop` and
  `testphase` are imported by the six-step `workflow` (ported, session 34);
  `journal` and `verifyjob` split — the git seam and the prompt/auto-verify
  functions are kept, their run-core halves retired. Only `runcli`,
  `runcore` and `runproject` retire outright.
- **D88 is resolved by the plan's default (D130):** the run core is retired
  and deleted in session 34. It is an orchestrator's application of an
  operator-set default; **the operator can override until session 34
  starts**, and nothing is deleted before then.
- **Runtime floor measured, not remembered (D131):** VS Code 1.135.0's
  extension host is Electron 42.8.1 / Node 24.18.1 and `node:sqlite` loads
  unflagged (`ELECTRON_RUN_AS_NODE=1 Code.exe -e …`); system Node 25.8.1
  likewise. Layout: `packages/router` (npm `dabbler-ai-router`, `bin:
  dabbler`) under root npm workspaces, esbuild bundling both into the VSIX.
  **Dependency ceiling (D132):** `yaml`, `ajv`, `smol-toml`; nothing native;
  a fourth is a decision in the log.
- **The parity control is designed (D133) and built (D141, D146):**
  `docs/ts-port-parity-control.md`, amended in three places by building it.
  It runs **two** comparisons and is red if either drifts: every corpus
  shape built twice through the Python router and compared byte for byte
  (from session 23), and every ported verb through both routers (from
  session 26). `npm run parity`, plus `--build`, `--self-check` and
  `--shapes` by hand.
- **Session 23 is closed `VERIFIED`** — 3 rounds, gpt-5-6-sol over the API,
  the third round's single finding **disputed and OVERRULED** by a third
  provider (gemini-flash/google). Claude Code / claude-opus-5 orchestrator.
  Its deliverables:
  - `packages/router` (npm `dabbler-ai-router`, `bin: dabbler`) under a
    root npm workspace with the extension; `tsc --strict`, ESLint, vitest.
    The CLI bundles to **`dist/dabbler.cjs`** — CommonJS as D131 says, but
    `.cjs`, because a `.js` under `"type": "module"` is an ES module
    whatever is inside it (**D138**).
  - **Types generated from every schema** into `packages/router/src/
    generated/`, checked in, with a `compile` control that fails when they
    are stale. A **twenty-first schema** was written — `progress --json`
    had none, and its only statement was the hand-kept `types.ts` this
    session exists to replace; it validates a real 35-session projection
    with zero errors and nothing reads it yet, so no behaviour moved
    (**D139**).
  - **The `Router` interface** — one method per verb, refusals as values
    over the published exit codes (0/3/4/other), and the schema-backed
    answers returning their generated types (`progress`,
    `approvedPlan.read`, `ledger.latestRound`). The `dabbler` verb list is
    one table; a verb is available when a handler is registered, so there
    is no session number to bump (**D140**).
  - **This repository's first declared controls**, all four kinds and all
    `required: true`: `compile` (type staleness), `typecheck`, `lint`,
    `analyzer` (parity). Green in ~16 s through `facts`. Each command is
    argv for `node`, because `facts` runs controls with no shell and
    `npm`/`npx` are shims argv cannot reach (**D142**).
  - **The `typescript` suite** declared beside `python`, with selection
    rules for every new path, so `affected` selects across both. CI
    installs at the workspace root on Node 24 and gains a `router` job.
- **The run ledger is no longer tracked (D135, operator):** `.gitignore`
  ignores `.dabbler/` whole, which is the rule `bootstrap` writes for every
  project. Rounds no longer travel between machines — a session finishes
  where it started — and the record of each session's rounds lives on the
  machine that ran it. As a side effect the selector's 208 false
  `selection_unknown` rows (D134, a latent defect kept owed at low priority)
  and the close's uncommitted-residue habit are gone from this repository.
- **Session 22's seat cost is measured (D136)** in the two currencies it
  had: the orchestrator's Claude Code context and the verifier's API tokens.
  No dollar figure — set 109 removed the rate table, and the router prices
  nothing.
- **Set 148 is complete: 21 of 21 sessions closed**, 2026-08-26 → 2026-08-28;
  19 `VERIFIED`, 2 `REMEDIATED_AT_CAP` (sessions 12 and 17, whose final fixes
  are unreviewed by construction — the D122 gap). Its acceptance is **D127**.
- **Router `dabbler-ai-router` 1.1.0** (tag `v1.1.0`); **extension 1.0.4**
  (tag `vsix-v1.0.4`). Both become 2.0.0 at cutover (session 35).
- **Suite: 942 Python (4:43 at `-n 2`) / 11 router vitest (0.8 s) / 153
  extension mocha (0.3 s); all four declared controls green.** The Python
  suite gained one test (the gate fix, D143) and about a minute, because a
  second expensive suite doubles the `git ls-files` spawns in every
  pre-verification gate call. `packages/router` is ~1,900 lines of source
  (1,400 of them generated) and ~200 of tests. `verify.py` is 2,537 lines
  and is ported as five files in session 32.

## Acceptance evaluation for set 148 — recorded as D127

Criterion met (session 20 ran end to end on the framework the set built);
check 1 (every plan item exactly once) met; check 2 (no skipped step, no
foreign verdict) met; **check 3 (seat cost measured from session 3 onward)
not met** — measured for sessions 1, 3, 4 and 5 only, and **not
back-filled** by operator decision. The step carries forward: every session
of the port plan carries "measure this session's seat cost" as a numbered
step, and session 22 executed it (D136). The full evaluation with its table
is D127; the previous version of this file carried it in full.

## Owed, from the record

| Source | What is owed |
| --- | --- |
| **D196 — the shim-only ceiling, owed to the CUTOVER** | On a machine where `copilot` resolves only to a batch shim, `cmd.exe` runs it and the command line stops at 8,191 while the handoff waits until 24,000. **Both routers are bounded identically today** — `CreateProcess` wraps a batch file in `cmd /c` — so the fix is to lower the handoff threshold on the shim path, and `HANDOFF_THRESHOLD_UTF16_UNITS` is a constant both routers must agree on or they take different branches for the same prompt. Needs a session that may touch Python; session 36 is where there stops being a second side. Named in `defaultSpawner`. |
| **D190 — `REFRESH_COMMAND`, owed to the CUTOVER** | Every message about a stale, hand-edited or same-provider catalog names `python -m ai_router.transports.copilot refresh`, and **both** routers print it, which is why it was not changed. It is true today and becomes false the moment Python is deleted. Re-point it to `dabbler copilot refresh` in session 36, in the same commit that removes the Python module it names. |
| **D193 — the seat probe's second half** | The live handoff test reached the real CLI and took the handoff branch; the seat then refused for quota, so **no model read the payload and no acknowledgement was earned**. Run `DABBLER_E2E=1 npx vitest run test/live.test.ts -t handoff` once the operator's premium-request allowance resets. One billed turn. The failure message now dumps the whole metadata, so whichever way it goes the run is readable. |
| **D194 — one int/float approximation, four readings** | JavaScript has one number type, so the port stands `Number.isInteger` in for Python's `type(x) is int`. Consequences: a wire `outputTokens: 42.0` fails closed in Python and is accepted here; a seat reporting `premiumRequests: 1.0` would be written `1` here and `1.0` there; and `toFixed` rounds half away from zero where Python's `format` rounds half to even (`seat-cost`'s credits, and `metrics`' escalation percentage since session 25). One fix covers all four — a JSON reader that keeps the lexical int/float distinction, and a shared fixed-point formatter — which is why it is one row and was not half-done in a port session. |
| **D194 — `copilot refresh --dry-run` as a parity case** | Built, run both ways, stdout byte-identical, and **not** a case: `python -m ai_router.transports.copilot` makes runpy print a `RuntimeWarning` to stderr, which the control compares. Free to add at the cutover, and worth it — it is the only reading of the scope selection and the cost projection that costs nothing. |
| ~~**D173 — the port's one record difference**~~ **CLOSED in session 29 by D187**, together with D185, which was the same shape. Both routers now stamp `dabbler-absence-search/1`, and a failed enumeration is recorded in a closed eight-term vocabulary rather than under the failing library's class name. The route taken is the one this row called sanctioned: Python changed first, and the field names the rule rather than the engine. | *Nothing further owed.* |
| **D173 / round 1 — the evidence protocol has no callers** | `validate_transcript`, `validate_finding_evidence`, `authoritative_tier`, `verify_worker_result` and `record_worker_result` are ported and **nothing in either router calls them**. Two real gaps sit inside them, both shared with Python and both recorded rather than repaired on one side: `outputHash` is not re-derived from `rawOutput`, and a check's `evidence.pass.requires` contract is not enforced when its result is recorded. The session that first drives the critique loop owns both, and the second one may belong at dispatch rather than at record — the loop's shape decides. |
| **D174 — consumer repositories** | A repository declaring `argv: ["npm", "test"]` for a check works under Python and would not have under the port without the shim resolution this session added. This repository declares every control as argv for `node` (D142), so nothing here exercises it. Session 33's `bootstrap` should say so where it writes a first `dabbler.yaml`. |
| **Round 1 nit — an argv suite is unrecordable** | `checks.load_checks` accepts a suite declaring `argv` and no `command`; `test_evidence.load_suites_checked` refuses it. Such a suite would run and be unrecordable, so it could never close. Latent — `argv` is used for controls, which that reader never sees — and **it may be the permissiveness rather than the refusal that is wrong**: a suite's command lands in the record as evidence, a control's does not. A session, not a patch, and adjacent to D116. |
| **Round 3 nits, both non-blocking and both carried** | (1) The Windows batch path still goes through `cmd.exe`, so `%VAR%` expansion remains — as it does on the Python side, for the same reason: a batch file is a cmd script. (2) `classifyPreverifyCommand` accepts a command that names every selected test *and* a broader directory. Both are Python's behaviour; changing either is a cross-router decision. |
| **D176 — amends D169** | The parity cost to watch is a new SHAPE, not a new case: twelve cases run in less time than nine did. Three shapes are still unbuilt (`disputed`, `at-cap`, `moved-machine`) and each needs the offline transport plus canned verifier text. |
| **D164 — the port** | `identity.resolve_session_orchestrator_identity` is **not ported**. It is the one function in `identity` that reads a repository rather than a block, and it reads state through `progress` — session 30. Writing a second reader of `sessions.json` to reach it early is the drift the port exists to remove, so it lands in session 30 as a wrapper over `resolveOrchestratorIdentity`. No test covers it today on either side; the Python suite's eleven identity tests are all against the block-level core. |
| **D168 — shared design** | `parseVerificationResponse` tests the head with `startsWith("VERIFIED")`, so a look-alike (`VERIFIED_NOT_REALLY`) classifies as VERIFIED. **Faithful to Python, and deliberately not fixed in the port** — an improvement on one side only is exactly the drift parity exists to catch. Blast radius is small (the token chooses a parse branch, not an outcome: `classifyBlocking` is severity-derived, and `validateSessionVerdict` refuses the token exactly). If a boundary is wanted it goes into Python first and crosses with a parity case that feeds a look-alike to both — session 32. |
| **D169 — cost to watch** | The parity control takes **~150 s** per run, because it builds four corpus repositories by driving the Python router, and it runs inside every `verify`. That is already comparable to a verifier round's wall time, and the case table only grows. Sessions 26–34 should watch it; caching a built shape across cases is the obvious lever if it becomes the bottleneck. |
| **D122 gap** | No path by which a verifier reviews a remediated-at-the-cap fix. Sessions 12 and 17 ended that way, so their last fixes are unreviewed today. |
| **D116** | A targeted-run form for filter-style runners (Maven `-Dtest=`, `dotnet test --filter`) plus the audit rule that checks one. "A session, not a patch." The port's vitest path-list form does not need it. |
| **D124** | Record the round cap on the round row as `verify.py` writes it; the unresolved-session view reads the live cap for a historical session. |
| **D126 nit 1** | `append_round` must refuse when the tree resolves and the anchor fails (`ledger.py`). Carried across the port unchanged (session 26). |
| **D114 nit 2** | `build_task_rows` renders a leaf, not a refusal, when `approved-plan.json` is missing while `step-execution.jsonl` carries an open step. |
| **D130 (was D88)** | Not owed — decided. The operator's override window on retiring the run core is open until session 34 starts. |
| **D134** | Round-1 change sets measure HEAD's raw tree against a snapshot that drops `.dabbler/`, so a repository that tracks its ledger reports it as deleted. Moot here since D135 and **confirmed moot** — session 23's first selection reported zero `selection_unknown` rows against 208 in each of 19–22 (D144). Latent elsewhere. If fixed on the Python side, do it before session 27 ports `affected`. |
| **D147 — RULED (D159), DONE in 25** | Session 23's step 5 is reworded: the control is declared and required from session 23, running the comparison that needs one router; the cross-router comparison joins it with the first ported verb. That verb turned out to be `metrics`, in session **25** rather than 26 — earlier than the ruling assumed, and costing nothing, because what the ruling protected was that no session be handed an instruction it cannot follow. Closed. |
| **D149 — CLOSED (D170), session 26** | Deleting a tracked file moved the whole-tree digest across the commit, because `git ls-files` still lists a tracked-but-deleted path and `surface_digest` wrote it a literal `"deleted"` hash. It cost session 23 a re-run and session 24 a forced close. **Fixed at the git seam as D160 ruled**: an unreadable path is omitted rather than marked, so a deletion moves the digest once and the commit that records it moves nothing. The marker string no longer appears anywhere in the router. Landed in its own commit before session 26's port, so the parity control compared two routers with the same intended behaviour, and it rode in the working tree so the verifier saw a change to a gate. |
| **D158 — framework** | `session close --force` promotes EVERY open session to complete, and its help says only "bypass bookkeeping gates". It cost session 24 a damaged ledger and a restore. Three fixes owed: say what the flag does; refuse (or require a second flag) when it would promote sessions that are not in flight; and stamp `forceClosed` on the session's row rather than the repository, so the ledger can say which session forced a close. Until they land, the trap lives in `AGENTS.md`'s preamble. |
| **D152 — RULED (D162)** | `ModuleVerbs.list`/`retire`, and several `VerifyVerbs`/`WorkflowVerbs` option names, describe a Python surface that does not exist in those shapes (`ai_router.modules` has only `create`; `verify dispute` takes `--finding`). Sessions 30/32/34 port those modules — reconcile the contract against what is ported rather than inheriting a shape nothing ever ran. |
| **D155 / D116** | The extension's mocha suite is still not a declared suite, so `affected` selects nothing for `tools/dabbler-ai-orchestration/` and session 24's largest change set had no recordable pre-verification evidence. Measured why it is not a one-line declaration: `targeted_command` appends the selected paths, and mocha MERGES a path list with its `spec` (both from the flag and from `.mocharc.json`) rather than being narrowed by it, so the bare command cannot mean "everything" while the appended form means "these". `runs_whole` would be false. It needs a runner entry point — D116's shape. |
| **Session 24 estimate** | "Net negative TS lines" was not met (+178 in the extension). `implements Router` requires all 32 methods and twenty of them refuse, which still costs their signatures. Not a defect; a fact about the contract's width, worth knowing when sizing sessions 30–34. |
| **D145/D146 — RULED (D161), DONE in 25** | Implemented as **D167**: `facts.run_control` keeps a passing control's own output in the record (capped at the same 1,500 characters a failure is), and a control that prints nothing on success records that it printed nothing — so "had nothing to say" and "said something the record dropped" are no longer the same row. Each parity case declares a `proves` string beside it, so a case added without saying what it proves does not typecheck. Closed. |
| **D119** | The solution level (one repository per library or service, plus an integrator) is not formalized. |
| Suite cost, the remainder | What is left is the loop's own git traffic (134 spawns in the slowest test). A fake git is still refused. The port's `journal.run_git` twin is where fewer round-trips per round would live. |

## Carried from the archived handoff, status not re-verified

Three items from the pre-148 *Next* list were not touched and were not
checked when this file was rewritten. Confirm or drop them:

- a round cap on `workflow review` (an unattended run keeps calling vendors);
- the Solution Explorer has not been screenshotted from a real VS Code;
- the CSV walkthrough is the wrong shape for a supervisor audience.

`.dabbler/runs/` is **not** tracked (D135, 2026-08-28), which is the
framework's own default; the archived "`.dabbler/` is git-ignored" item is
resolved by being true again.

## Next

1. **Session 31 of 36 — the session lifecycle.** `session` (1,386), `gates`
   (421), `progress` (1,050), `modules` (246): 3,103 lines, 138 tests, and
   the largest single session left. Its own plan says **port `gates` first**
   and run the parity control on `close --dry-run` rows for every corpus
   shape before anything else — a gate that differs by one row is the set's
   worst outcome, and that is the cheapest place to see it.
   **Three things are owed specifically to this session**, all renumbered
   from decisions that say 30: `identity.resolve_session_orchestrator_identity`
   lands here as a wrapper over `resolveOrchestratorIdentity` (D164) — it is
   the one function in `identity` that reads a repository rather than a
   block, and it reads state through `progress`, which is why it waited;
   the `Router` contract is reconciled against what is actually ported,
   defaulting to trimming (D162/D152 — `modules retire` plausibly earns
   building, `modules list` probably does not); and `cli/session.ts`'s
   refusals of `close`, `cancel`, `restore`, `plan` and `migrate` all come
   out at once.
2. **The two seat items in the Owed table are both addressed to the cutover,
   and both are one-line changes that must not be made early.**
   `REFRESH_COMMAND` still names the Python invocation, and the handoff
   threshold still waits until 24,000 on a shim-only machine. Each is
   correct today *because* there are two routers, and wrong the moment there
   is one. They are the clearest example of the shape this port keeps
   producing: a difference that is only safe to remove last.
3. **Read `docs/ts-port-parity-control.md` before planning any session from
   here.** Its verb table is the growth order, and it now carries three
   amendments from this session: what the two `seat-cost` cases prove, why
   the seat catalog's **write** is not comparable (a probe is billed), and
   why `copilot refresh --dry-run` is byte-identical and still not a case
   (Python's `python -m` prints a runpy warning to stderr, which the control
   compares). Session 26 proved the plan's line counts are a floor; session
   27 proved the other direction is also possible. Read an inventory line as
   "the module", not "every function of the module", and check the import
   graph before assuming either way.
4. **A Python design question is still owed to the operator, from D171's
   round-1 dispute.** A malformed or hand-edited `sessions.json` or
   `activity-log.json` is *silently replaced* rather than refused, in both
   routers: `read_raw_session_state` returns `None` for unparseable JSON and
   `_read_or_create_activity_log` builds a fresh log from any read failure. A
   verifier called that Major and it is a fair call. **It is a redesign and
   it needs a ruling**: refuse and fail closed, or keep replacing and say so.
   If it is to be fixed, the cheapest moment is *after* session 35, when
   there is one implementation again. **Session 31 is the session that ports
   both readers**, so it is the last comfortable moment to ask.
5. **What sessions 25–27 leave for their successors**, renumbered here.
   `verdict`'s parity case and the `VERIFIED` look-alike question are owed to
   **session 33** (D163, D168); the round-append parity case is owed to
   **session 33** for the same reason, and **so is the `completion_tree`
   comparison** — session 27 proved the two snapshots agree on this
   repository (D177) but no verb writes a round yet. The evidence protocol's
   two gaps are owed to whichever of **32/33** first drives the critique
   loop.
6. **D130 override window** — the operator can still override retiring the
   run core, until **session 35** starts. Session 27 leaned on it once:
   `checks.plan` is not ported because `runcli` is its only caller (D178). An
   override would mean porting it, with the per-suite defect fixed on
   **both** sides, in Python's own commit first.
7. **The verifier has run with `agency: none` for three sessions now**, and
   this session is the sharpest illustration of what that costs. Round 2's
   Major was reasoning from the session plan's step 3 — a sentence written
   before D174 measured Windows spawning and superseded it. The verifier
   could not read D174, so it could not know. **Cite file and line in a
   dispute**; an assertion about what the repository says is worth nothing to
   a reviewer that cannot open it, and both of this session's disputes and
   acceptances turned on being able to quote.
8. **Check the cited lines before answering — in both directions.** Session
   27 recorded four disputes and all four were withdrawn; session 29's Major
   was right and was fixed on first reading. This session did both, on the
   same finding: round 1's half was accepted because `resolveProgram` really
   did reach a different program than Python, and round 2's half was refused
   because `copilot.bat` really is two lines of PowerShell invocation with no
   executable to resolve. Neither answer was available without opening the
   file.
