# S1 remediation — round 6 (operator-authorised targeted round)

Two fixes since the round-5 baseline. One closes round 5's blocking finding; one
closes a Major raised by the **operator-authorised third-provider opinion**
([`s1-third-opinion.json`](s1-third-opinion.json), gemini-2.5-pro, with
**anthropic and openai both excluded** — anthropic orchestrated, openai ran all
five verification rounds).

Both were accepted. Neither was disputed.

---

## 1. Round 5's Major — the DOM harness was missing from the fix delta

**The finding.** The handover credits `poc-nine-modules-dom.ts` as the sole
rendered-DOM proof of four Work Explorer claims, but the file appears nowhere in
the fix delta — contradicting the sidecar's claim that it was "added during
remediation."

**Accepted. The verifier was right and the error was mine.** Not a missing
artifact — a **mis-stated ordering**. The harness was written immediately after
the discovery round raised D5 and **before** the supplementary pass ran, so it
is inside the round-2 baseline tree and is invisible to a baseline→current delta
*by construction*. My sidecar said "round-3 remediation," which is simply wrong.

**Fix.** The provenance claim was corrected in three places
(`s1-remediation-round-3.md`, `s1-conventions.md`, `ai-assignment.md`), and the
round-3 sidecar now carries the verifiable history a delta reader cannot
otherwise see:

```
$ git log --oneline --diff-filter=A -- .../poc-nine-modules-dom.ts
d3da217 Set 108 S1: settle the contracts by running them, not by reading them

$ git ls-files -s .../poc-nine-modules-dom.ts
100644 581e2bfa975dc09e40c11dc007a7cc9ecde64586 0

$ git ls-tree -r <round-2 baseline tree> --name-only | grep -c poc-nine-modules-dom
1          # present at the baseline — hence absent from the fix delta

$ npx mocha ... src/test/poc-nine-modules-dom.ts
4 passing (4s)     # re-run at round 6
```

**The generalisable point, and why it is worth recording.** This is L-064-9's
class in a new place. That lesson says a `git diff` bundle omits *untracked*
files. The wider truth is: **anything already inside the delta's baseline is
invisible to a delta reviewer, and prose is not a substitute for it.** A reviewer
refusing to accept "trust me, it's there" is behaving correctly.

The third-provider opinion adjudicated this **"both partly right"** and confirmed
the claim is now adequately evidenced.

---

## 2. Third-opinion Major — two members' `persistence` would share one database

**The finding.** Part D has each member run their own `persistence`. The shipped
connection string hardcodes `Database=DabblerCsvPipeline`, and `persistence`
applies **its own EF Core migrations at start-up**
(`Persistence:MigrateOnStartup`, default `true`). Two independently-built
implementations on one machine therefore both migrate the same database; the
second to start meets a `__EFMigrationsHistory` it did not write.
`OrderBatches.SourceFile` is uniquely indexed and shared too, so a teammate's
service reports the reader's already-loaded files as duplicates.

**Verified against the reference solution before accepting** — the hardcoded name,
the start-up migration and the unique index are all real:

```
appsettings.json:12  "Orders": "...;Database=DabblerCsvPipeline;..."
appsettings.json:15  "MigrateOnStartup": true
Program.cs:18-21     if (...MigrateOnStartup, true)) await ...MigrateAsync();
OrdersDbContext.cs:57 batch.HasIndex(b => b.SourceFile).IsUnique();
```

**Consequence, and why it is a Major:** a database error lands in the middle of
Part D and buries the HTTP-contract lesson Part D exists to teach. The reader
spends the payoff debugging EF Core.

**Fix — R5 gains a database name per member**, alongside the port bands:

| Member | Ports | Database |
| --- | --- | --- |
| yours | `5101` / `5102` / `5103` | `DabblerCsvPipeline_priya` |
| the version you test against | `5201` / `5202` | `DabblerCsvPipeline_sam` |

Deliberately the **smallest** thing that works, and the same shape as every other
identity in this tutorial: **derived from the owner, allocated by nobody.** One
word in a connection string. No separate SQL instances, no per-member servers, no
provisioning. A solo reader needs one and leaves the default alone. The operator
made the same call independently and in the same terms — *"this is a tutorial, not
production."*

The Session 2 handover carries it as a hard requirement.

### Why five rounds missed it, which is the more useful finding

**This session did disclose the shared database.** R6's note said the run proves
*"the watcher reached the service on `5202`, not that service owned a separate
store"* — accurate, and it went on to instruct Session 2 that *"nothing in this
tutorial sets one up."*

That is a defect described and then shipped. It survived five rounds because it
**reads** like careful disclosure, and every reviewer accepted the framing rather
than asking the next question: **the reader inherits this configuration.** The
observation was aimed at the wrong audience — it reasoned about the *proof run*
(two instances of the same build, where sharing a database is harmless) instead
of about the *reader* (two different builds, where it is not).

**An honest disclosure pointed at the wrong audience hid a defect as effectively
as no disclosure would have.** R6's note now says so explicitly rather than being
quietly deleted, so the failure mode stays visible.

---

## Also carried into the Session 2 handover

The third opinion named the **biggest remaining risk to Session 2**: collapsing
the two `400`s. A *well-formed but invalid* batch gets the service's own
validation envelope, and that envelope **is** contractual; a body that is not
JSON at all gets whatever the framework emits, and that is **not**. This
distinction already had to be found and fixed once during this session (round 3's
S2 finding, then over-corrected and repaired at round 4), which is exactly why it
is flagged as easy to lose again.

Added as an explicit handover instruction rather than left implicit in the
contracts document.

---

## Suites at round 6

| Suite | Result |
| --- | --- |
| `poc-nine-modules-dom.ts` | **4 passing** (re-run this round) |
| `poc-nine-modules-ondisk.ts` | **5 passing** |
| `poc-nine-modules.ts` | **4 passing** |
| Extension unit (`npm run test:unit`) | **1821 passing** |

pytest: **not run — operator decision.** The session adds no Python to the
package; the suite crawls on this machine for reasons unrelated to this work
(~240 tests in 20 minutes against a 626-second recorded baseline), and the
operator ruled it out of scope rather than spend further time on it.
