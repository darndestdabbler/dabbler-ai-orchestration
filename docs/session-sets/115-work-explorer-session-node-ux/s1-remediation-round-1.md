# Remediation — Set 115 Session 1, Round 1 (discovery, both lenses)

**Round 1 findings (raised independently by call 1 / spec-conformance and
call 2 / failure-scenario):** the absent-state path in the extension adds
and repeats synchronous `spec.md` reads on the tree scan, against this
session's own "**No new file read** — if the change adds one, it is the
wrong change" (spec step 2) and the measured startup constraint Set 110
S1 recorded.

**Verdict: ACCEPTED. One defect, found twice, correctly graded Major,
fixed.**

Both lenses landed on the same code and they were right. I removed the
write from `readStatus` and replaced it with an in-memory derivation, but
I never counted what that derivation costs. It cost four `spec.md` reads
per spec-only set per scan:

| # | Where | Why |
| :--- | :--- | :--- |
| 1-2 | `readStatus(dir)` → `inferStateInMemory` → `notStartedPayload` | `specTitleMap()` read the file, then `readTotalSessionsFromSpec()` read it **again** |
| 3-4 | `readSessionSets`'s absent-file branch → `inferStateInMemory` **a second time** | the same two reads, for the same set, in the same scan |

The irony is exact: the old code wrote a file so that every later read
was cheap, and I removed the write without noticing I had made the read
expensive. The finding is the difference between "no file is created"
(which I verified) and "no additional disk read" (which I asserted and
did not).

## The fix

**One read per synthesis, one synthesis per set.**

1. `readSpecOnce(dir)` in `utils/sessionState.ts` reads `spec.md` **once**
   and derives both the title map and `totalSessions` from that text.
   `readTotalSessionsFromSpec(dir, titles)` became
   `totalSessionsFromSpecText(text, titles)` — a pure function that
   cannot read anything. `progress.ts` grew
   `extractSessionTitlesFromText` / `specTitleMapFromText` so the
   path-taking versions are thin wrappers over a text-taking core.
2. `readSessionSets` computes `inferStateInMemory(dir)` **once**, in the
   absent-file branch, and reuses that object for both the bucketing
   status and the ledger — instead of calling `readStatus` (which would
   derive it) and then deriving it again.
3. `normalizeToV4Shape` and `readProgress` take an **optional
   `specTitles`** map. A caller that already read the spec passes it in;
   `readSessionSets` passes an empty map on both post-synthesis calls,
   because a synthesized ledger's titles are already resolved. Python's
   `normalize_to_v4_shape` takes the same optional argument, so the two
   readers keep the same signature.

Net reads per set on the scan, measured by the new falsifier:

| Case | Before this session | After the defect | After the fix |
| :--- | ---: | ---: | ---: |
| spec-only set | 2 (config + prereqs) + 1 write | 6 | **3** (config + prereqs + one synthesis) |
| set with a healthy state file | 2 | 2 | **2** (the heal reads nothing) |
| set with a drifted (generic-titled) state file | 2 | 3 | **3** (the one conditional heal read — journaled) |

## The falsifier

`sessionTitleParity.test.ts` → *"the scan reads each `spec.md` at most
once per set"* patches the live `fs.readFileSync` and **counts** reads
across a real `readSessionSets` call, with bounds tight enough to fail on
a single regression (`<= 3` for a spec-only set, `<= 2` for a healthy
one). A read-count claim asserted in prose is exactly the kind that goes
stale silently; this one fails a test instead (L-112-1 — a gate that only
ever passes proves nothing, so the bound is set where the pre-fix code
would trip it).
