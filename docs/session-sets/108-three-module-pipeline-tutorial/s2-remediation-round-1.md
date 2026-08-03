# S2 — Remediation of verification round 1

Round 1 (`s2-verification.md`) returned **ISSUES FOUND: six Majors and five nits**,
all against `docs/tutorials/three-module-pipeline.md`. **All six Majors are
accepted; none is disputed.** Four of the five nits are fixed; one is answered.

## A bookkeeping note on how this round was handled

Round 1's raw artifact (`s2-verification.md`) was written, but the process was
killed by a **10-minute harness timeout** immediately afterwards, before
`verify_session` could write `s2-issues.json` or patch `disposition.json`. The paid
verifier output survived — that is the artifact-first write order doing its job
(L-079-1) — but the **findings envelope did not**, and `--phase supplementary`
refuses to run without one:

```
verify_session: --phase supplementary is the completeness-critic pass over a prior
discovery round's findings, but no prior round of this session bears a findings
envelope.
```

`--phase remediation-review` depends on the same envelope, because the discovery
baseline tree is recorded in it. **The loop could not advance on round 1 at all.**

The envelope was **not** hand-authored. Writing a verification artifact by hand is
mixed-mode drift and is forbidden outright; the whole point of these files is that a
blessed writer produced them. So the sanctioned alternative was taken: **fix
everything round 1 found, once, then re-run `--phase discovery` on the corrected
document.** That is within the 2-discovery-pass bound, it regenerates the envelope
through the blessed writer, and it is a *stronger* check than the delta review it
replaces — a fix-delta reviewer cannot see what already sits in its baseline, which
is precisely how two of Session 1's twelve Majors escaped six rounds.

Recorded as a deviation from the prescribed harvest-then-fix order, with the reason,
rather than performed quietly.

## The six Majors

### 1. Part C never told the reader what to build — ACCEPTED

Parts A and B each open with a "What to build" specification. **Part C had none.**
It went straight from *"build `watcher`'s logic and test it with stubs"* to *"now
start everything"*, and the hosted service, the schedule, the folder polling, the
two HTTP calls, `POST /run-now` and the file movement all first appeared as
already-existing behaviour in the middle of Phase B.

A reader following Phase A literally would have had decision-table logic and no
service to run.

**Fix:** a full **What to build** section added to Part C, covering the logic and
the service around it — the `5103` binding, `GET /health`, the Quartz schedule, the
three configurable folders and two configurable service addresses, the multipart
call to `converter`, the **unchanged** forwarding of the returned bytes to
`persistence`, and `POST /run-now`.

The round also caught a genuine **ambiguity in the `/run-now` response shape**: the
tutorial showed a bare object in one place and an array in another. `POST /run-now`
returns **an array with one entry per file**; the bare objects quoted elsewhere are
individual entries. That is now stated explicitly where the endpoint is introduced.

### 2. Part D's proof command hard-coded the author's batch id — ACCEPTED

Step 5 read the batch back with the literal GUID
`019fc888-1092-7836-8e83-355d31b4d054`, captured from the run this tutorial was
written against. **Batch ids are generated per batch**, so every reader who
copy-pasted that command would have got a `404` — on the final proof step of the
tutorial's central payoff.

This is the sharpest instance of a real hazard in a document whose whole discipline
is quoting literal captured output: **a literal is evidence, and a literal is not a
command.** The captured body remains, now labelled as being from that run with the
reader's own id expected to differ; the *command* uses the reader's own:

```powershell
$result = curl.exe -s -X POST http://localhost:5103/run-now | ConvertFrom-Json
curl.exe -s "http://localhost:5202/batches/$($result[0].batchId)"
```

### 3. `dotnet run --project modules/priya/converter` was not copy-pasteable — ACCEPTED

Two separate defects in one command, both of which the tutorial had already told the
reader about **elsewhere** and then ignored:

1. `priya` is the example owner. Solo readers were explicitly told to use their own
   name, and then handed `priya` in every run command.
2. The `--project` path assumes where the AI put the `.csproj` — and the tutorial's
   own opening states that AI-generated layout varies. The only warning about this
   sat in **Part D**, after all three affected commands had already been used.

**Fix:** both substitutions are now called out at the **first** `dotnet run` in Part
A, with a `Get-ChildItem -Recurse -Filter *.csproj` command for locating the project,
and Part D's later note now refers back to that method instead of asserting a shape.

### 4. `curl ... > batch.json` corrupts the file on Windows PowerShell 5.1 — ACCEPTED, AND PROVED

**Probed on this machine rather than reasoned about**, because a finding about shell
behaviour is checkable:

```
PS 5.1  >  : first 8 bytes = ff fe 2d 00 65 00 6e 00
```

`ff fe` is a **UTF-16LE byte-order mark**. Windows PowerShell 5.1 — the shell built
into Windows 10 and 11 — re-encodes native program output on `>`. The reader would
have posted a UTF-16 file as `application/json`, got a framework-level malformed-JSON
`400`, and gone looking for the bug in their own perfectly correct `persistence`.

**Fix:** `curl.exe -s -o batch.json ...` — curl writes the bytes itself. A short
note explains why, because the failure is otherwise unattributable.

### 5. Part D assumed a teammate's code was already in the reader's working copy — ACCEPTED

The tutorial asserted *"a teammate's `converter` is already on your disk"*. Members
have been on **their own branches** for three parts. Same repository is not the same
working copy.

**Fix:** a prerequisite block before Part D's first command — the teammate's work
must be merged and pulled — with `git checkout main` / `git pull`, a
`Get-ChildItem modules/sam` confirmation, and an explicit statement that an empty
folder is a **scheduling** problem, not a tutorial fault, with the solo version
offered as the thing to do meanwhile.

### 6. The advertised solo path was internally inconsistent — ACCEPTED

The worst of the six, because it broke a promise made in the first screen
(*"Solo? Yes"*). The naming section told a solo reader to use their own name; Step 3
then said, unconditionally, to declare **nine** modules for Priya, Sam and Chen; and
Part D's only commands referenced `modules/sam/...`. A solo reader who sensibly
declared three modules had no way to run Part D, and one who followed Step 3
literally declared six modules for people who do not exist.

**Fix:** Step 3 now splits into a team path (nine, member-major) and a solo path
(three, own name) using the estate's existing `▸ do ONE of these` convention, and
**Part D's solo section now carries real commands** — a second copy of the reader's
own two services on `5201`/`5202` with a second database name — instead of a
conceptual note pointing at future work. The conformance-versus-mechanism limitation
(R6) is unchanged and still stated plainly.

## The nits

| Nit | Disposition |
| --- | --- |
| Part D had no explicit behavioural finish line, unlike A, B and C | **Fixed.** Three-point finish line added. The spec requires four parts each with its own finish line, so this was more than a nit. |
| Contract 2's `201` body and `Location` header carry different GUIDs, implying one response | **Fixed.** One sentence: the headers were a separate probe, and within any one response the two ids are the same batch. |
| "The answer key's shape" in Part D contradicted the earlier statement that the answer key has no owner tier | **Fixed** — removed as part of Major 3's fix; the passage now tells the reader how to *find* the project rather than asserting a layout. |
| The IIS appendix is too thin to publish from, and said "three base addresses" when `watcher` has two | **Fixed.** Corrected to two, and the section now names what it omits (Hosting Bundle, app pool, permissions, and that LocalDB is a per-user instance and a poor IIS target) and says plainly that it is a sketch. |
| The `modules.yaml` editing procedure is still substantially present despite the duplication review | **Answered, not changed.** The duplication reviewer's proposed fix was to delete the YAML block and link to `adopt-dabbler.md` Part 3. That block carries **this tutorial's own owned content** — member-major ordering, owner-derived code roots, and the deliberate absence of `touches:` — which Part 3 does not contain. The link was added so the reader knows where the *edit mechanic* is owned; the shape stays here because no other document teaches it. Recorded as a judgment call. |
