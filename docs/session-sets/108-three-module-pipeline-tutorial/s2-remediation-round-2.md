# S2 — Remediation of verification round 2

Round 2 was a **discovery** round re-run on the corrected document (see
`s2-remediation-round-1.md` for why round 1's envelope was lost and why a full
re-read was chosen over a fix-delta review). Its merged envelope
(`s2-issues-round-2.json`, fan-out 2/2) carries **four Majors and five nits**.

**All four Majors are accepted; none is disputed. All five nits are fixed.**

Majors 1 and 3 are the same defect, found independently by both fan-out arms.

## The Majors

### 1 & 3. Part D ran `/run-now` twice and lost the batch id — ACCEPTED, ALREADY FIXED

Both arms caught this, and it is worth being precise about the provenance: **this
defect was introduced by round 1's own remediation, and it had already been found
and fixed before round 2 returned.**

Round 1's Major 2 was that Part D read the batch back using the author's hard-coded
GUID. The fix captured the reader's own id — but put the capture in Step 5, which
meant Step 5 called `POST /run-now` a *second* time. By then Step 4 had already
archived the only file, so the second call returns `[]`, `$result[0].batchId` is
null, and the final proof of the whole tutorial fails on the main path.

It was spotted during a coherence read of the edited region while round 2 was still
running, and fixed there: **Step 4 captures `$result`, Step 5 reuses it, and there is
only one `/run-now` call.** Round 2 reviewed the pre-fix text.

The verifier's proposed fix and the applied fix agree. Two things were added beyond
it: a check of `outcome` before proceeding (a `Deferred` result means a service is
down, and the decision table is telling the truth), and an explicit warning **not**
to re-run `/run-now` to recover a lost id, because the file is already archived and
a same-named replacement returns `AlreadyStored`.

**This is the third time in this set that remediation introduced a fresh defect** —
S1 recorded four such. It is the strongest argument for the full re-read used here
over a fix-delta review.

### 2. Parts A and B assumed ports their build instructions never required — ACCEPTED

The day-one convention allocates `5101` / `5102` / `5103`, and every probe in the
tutorial targets those ports — but neither Part A's nor Part B's *"What to build"*
list asked for them, and the launch commands passed no `--urls`. A new ASP.NET Core
project picks its own port. So a reader whose `converter` is entirely correct would
have watched `curl http://localhost:5101/convert` fail, with nothing in the tutorial
to suggest the port was the problem.

Note the asymmetry that made this visible: **Part D always used `--urls`**, because
running a second instance forces the question. Parts A–C never did, because the
happy path silently assumed the answer key's `appsettings.json`.

**Fixed twice over, deliberately:**

1. `Listening on 5101` / `5102` added to the *"What to build"* lists, so the reader
   asks their AI for it.
2. `--urls http://localhost:510x` added to **all five** main-path `dotnet run`
   commands (converter and persistence appear twice each, watcher once), so the
   command is deterministic even if the implementation did not honour the request.

### 4. Reusing `orders.csv` collides instead of demonstrating fresh processing — ACCEPTED

Part C repeatedly said *"drop a CSV"* with no filename discipline. Two distinct
failures follow, and both look like bugs to a reader:

- `sourceFile` is the identity of a delivery, so a second `orders.csv` returns
  `AlreadyStored` and stores nothing — the reader sees the duplicate rule fire when
  they were trying to see a fresh store.
- Moving a second `orders.csv` into `archive\` collides with the one already there,
  and what happens then is implementation-defined — the tutorial should not depend
  on unspecified behaviour.

**Fix:** Phase B's first drop is now a concrete
`Copy-Item samples\orders.csv C:\DabblerCsvPipeline\incoming\orders-1.csv`, with a
note to give every dropped file a new name and *why* — both consequences named.

## The nits — all five fixed

| Nit | Fix |
| --- | --- |
| Part B's finish line requires reading rows back through `GET /batches/{id}`, but the procedure only did the two POSTs. Part C likewise. | Both now capture the response and issue the readback. Part B's also points at the `orderId`-versus-`OrderId` casing flip at exactly the moment the reader would trip on it. |
| With `"ScheduleEnabled": true`, the scheduled poll can consume a file before the manual `/run-now`, returning a confusing `[]`. | Documented where it bites, with the recovery (drop another file under a new name) and the option of setting `"ScheduleEnabled": false` while experimenting. |
| The two-machine appendix bound only `converter`, leaving `persistence` on `localhost`. | Both services now shown bound to `0.0.0.0`, the per-member database setting carried across with `persistence`, and both base addresses and both ports called out. |
| *"If the remote call times out, that is the firewall"* is too categorical. | Rewritten: refused means something answered and said no; a timeout means nothing answered, for which a blocked port is the most common but not the only cause — wrong address, different network or VLAN, network ACL. Check the address first. |
| — | *(fifth nit is the Part C readback, folded into the first row above)* |

## What this round did not change

Nothing was reverted, and no finding was dismissed. Round 2 raised no issue against
the ten rules the routed documentation review had already checked, the literal
provenance, or any of R1–R9 — those held across both fan-out arms.
