# Three modules, one pipeline: build software the way a team builds it

A CSV file lands in a folder. Its rows end up in a SQL Server table. Three .NET 10
services do the work, and they only ever talk to each other over HTTP.

```
drop folder ──▶ watcher ──▶ converter ──▶ watcher ──▶ persistence ──▶ SQL Server
                  (C)         (A)                        (B)
```

You will build **all three**. Then you will change **two configuration values** and
watch your `watcher` drive somebody else's `converter` and `persistence` — no code
edited, nothing rebuilt. That last step is the point of the whole tutorial: it is
what proves your module was written against a *contract* and not against a
particular piece of somebody's code.

- **Start here?** No, and this one really does have prerequisites. See
  [Before you start](#before-you-start).
- **Audience:** you have already shipped one module with Dabbler and can commit and
  push with `git`.
- **Solo?** Yes — Parts A, B and C are a complete one-person walkthrough. Part D has
  an honest solo version, and the section says plainly what it does and does not
  prove.
- **Time:** this is a course, not a sitting. **Four parts, four finish lines.** Stop
  at the end of any of them, close the laptop, and come back next week — each part
  opens with what you need running to resume.

## Where this sits in the ladder

| Tutorial | Scope |
| --- | --- |
| [Hello World](hello-world.md) | One AI session, one task, one folder |
| [Adopt Dabbler](adopt-dabbler.md) | One person, **one** module, in a real repository |
| **this one** | **Three** modules, built independently, composed by contract |

## The answer key

A finished, working version of this pipeline is published here:

**https://github.com/darndestdabbler/dabbler-ai-orchestration-multimodule-demo**

It is an **answer key, not a starting point.** There is nothing to clone and no
starter repository — you build in your own team's repository, from scratch.

Use it the way you would use the answers at the back of a textbook: when you are
stuck, or when you want to see what "finished" looks like. Every expected output
quoted in this tutorial is a literal string copied from a real run of that solution.

**Your code will not match it, and that is normal.** You are going to describe each
module to an AI agent and let it write the code. AI sessions are not deterministic:
your class names will differ, your files will be split differently, and your test
suite will have a different number of tests in it. None of that means you got it
wrong. What has to match is the **behaviour** — the two contracts in this tutorial,
honoured exactly.

---

# Before you start

## Where you are standing

This tutorial does **not** start from an empty folder. It picks up at *"agree the
contracts, then declare your modules"*, and it assumes four things are already true.
None of them are explained here — each is somebody else's document, linked:

| Already done before you open this page | Where it is covered |
| --- | --- |
| One successful local AI session | [Hello World](hello-world.md) |
| VS Code, the Dabbler extension, Python, and an AI agent installed | [Adopt Dabbler](adopt-dabbler.md), Part 1 |
| A repository created and cloned, with Dabbler set up and `main` protected | [Adopt Dabbler](adopt-dabbler.md), Parts 2–3 |
| One module built and shipped through a pull request | [Adopt Dabbler](adopt-dabbler.md), Part 4 |

If any of those is not true, stop and go do it. This is not a formality: the very
first instruction below is *"declare your three modules"*, and without the extension
installed there is nothing to declare them with.

**Working as a team?** One member creates the repository by following
[Adopt Dabbler](adopt-dabbler.md). Everybody else clones it and does the one-time
install from that guide's Part 1. **A solo reader creates it and is the only member.**

> **The module you shipped in Adopt Dabbler stays where it is.** Your repository
> already has one module declared and merged. Leave it alone — it is a real module,
> nothing here touches it, and it will simply appear in the Work Explorer alongside
> the ones you are about to add.

## What must be installed

**This walk is written for Windows 10 or 11.**

The pipeline itself is cross-platform .NET. It is the zero-setup database that is
not: this tutorial uses SQL Server LocalDB, which only exists on Windows. If you are
on macOS or Linux, the [appendix](#appendix)'s container path runs the same code and
the same tests — but **it is not the walk**, nobody has walked it, and the timings
and copy-pasteable commands below assume Windows.

On top of everything in the table above, you need **two installs**:

**1. The .NET 10 SDK.** Check it:

```powershell
dotnet --list-sdks
```

You need a line beginning `10.0.`. On the machine this tutorial was written on:

```
7.0.410 [C:\Program Files\dotnet\sdk]
8.0.423 [C:\Program Files\dotnet\sdk]
10.0.201 [C:\Program Files\dotnet\sdk]
11.0.100-preview.2.26159.112 [C:\Program Files\dotnet\sdk]
```

Older SDKs alongside it are fine. Download:
https://dotnet.microsoft.com/download/dotnet/10.0

> **A *newer* SDK alongside it is not fine on its own, and this is the one setup
> step people miss.** Look at the last line of that example: a .NET 11 preview.
> `dotnet` picks the highest SDK it can find, so on a machine like that
> `dotnet new` gives you a .NET 11 project and every "10" in this tutorial
> quietly stops applying.
>
> Pin the repository once, in a `global.json` at its root, and the whole team
> builds the same thing:
>
> ```json
> {
>   "sdk": {
>     "version": "10.0.201",
>     "rollForward": "latestFeature"
>   }
> }
> ```
>
> Use whichever `10.0.` version your own `dotnet --list-sdks` printed. Then
> `dotnet --version` should report it. The answer key pins itself exactly this way.

**2. SQL Server LocalDB.** Check it:

```powershell
sqllocaldb info
```

You need `MSSQLLocalDB` in the output:

```
MSSQLLocalDB
```

> **If that command is not found, you do not have LocalDB, and the .NET SDK will not
> give it to you.** LocalDB is a separate Microsoft product that happens to arrive
> with Visual Studio. A machine with VS Code and the SDK alone does not have it, and
> you would not find out until the middle of Part B — with a green Part A behind you
> and a failure that looks like your own code.
>
> Install it from the **SQL Server Express** installer, choosing the **LocalDB**
> feature: https://www.microsoft.com/sql-server/sql-server-downloads. There is no
> `winget` package for LocalDB on its own.

**Visual Studio users, one extra note.** The answer key's solution file is `.slnx`,
the XML format that .NET 10's `dotnet new sln` now emits by default. `dotnet build`,
`dotnet test` and VS Code do not care. **Visual Studio needs 17.14 or newer to open
it** — on an older VS 2022 you will not be able to double-click the solution.

---

# The two contracts

Agree these before anybody writes a line of code. Everything else in this tutorial
is downstream of this section.

Three modules, and only one of them talks to the others. If `watcher` is written
against a `converter` that does not exist yet, then somebody has to reconcile the
two afterwards — and that reconciliation is exactly the coordination cost this whole
model exists to avoid. Pinning `POST /convert` and `POST /batches` first is what
makes three things possible at once:

- **Testing with nothing running** — `watcher`'s logic can be tested against stubs,
  because a stub has a contract to honour.
- **Parallel work** — nobody waits for anybody.
- **Part D** — a `watcher` that only ever knew a contract can be repointed at a
  different implementation of it.

## Contract 1 — `converter`: `POST /convert`

**In one sentence:** a CSV file goes up, schema-validated JSON comes back, or a list
of everything wrong with the file does.

### The schema

The service knows one schema, called `orders`:

```json
{
  "name": "orders",
  "columns": [
    { "name": "OrderId",      "type": "integer", "required": true,  "min": 1 },
    { "name": "CustomerName", "type": "string",  "required": true,  "maxLength": 100 },
    { "name": "OrderDate",    "type": "date",    "required": true },
    { "name": "Amount",       "type": "decimal", "required": true,  "min": 0 },
    { "name": "Expedited",    "type": "boolean", "required": false }
  ]
}
```

**The header must name exactly these columns — no missing ones and no extra ones.**
An extra column is rejected rather than ignored, because a column nobody asked for
usually means an upstream system changed and somebody should know.

### The request

`multipart/form-data` with exactly two parts:

| Part | Kind | Value |
| --- | --- | --- |
| `file` | file | the CSV bytes; the filename travels with it and comes back as `sourceFile` |
| `schema` | text | the name of a schema the service knows, e.g. `orders` |

```
POST /convert
Content-Type: multipart/form-data
  file:   orders.csv   (text/csv)
  schema: orders
```

### `200 OK` — the file was good

Sent this file:

```
OrderId,CustomerName,OrderDate,Amount,Expedited
1001,Acme Tools,2026-01-15,250.00,true
1002,Beta Supplies,2026-01-16,99.95,false
1003,Gamma Ltd,2026-01-17,1234.56,
```

Got this back:

```json
{"schema":"orders","sourceFile":"orders.csv","rowCount":3,"rows":[{"OrderId":1001,"CustomerName":"Acme Tools","OrderDate":"2026-01-15","Amount":250.00,"Expedited":true},{"OrderId":1002,"CustomerName":"Beta Supplies","OrderDate":"2026-01-16","Amount":99.95,"Expedited":false},{"OrderId":1003,"CustomerName":"Gamma Ltd","OrderDate":"2026-01-17","Amount":1234.56,"Expedited":null}]}
```

Formatted, with the four things you must not get wrong:

```json
{
  "schema": "orders",
  "sourceFile": "orders.csv",
  "rowCount": 3,
  "rows": [
    { "OrderId": 1001, "CustomerName": "Acme Tools",    "OrderDate": "2026-01-15", "Amount": 250.00,  "Expedited": true  },
    { "OrderId": 1002, "CustomerName": "Beta Supplies", "OrderDate": "2026-01-16", "Amount": 99.95,   "Expedited": false },
    { "OrderId": 1003, "CustomerName": "Gamma Ltd",     "OrderDate": "2026-01-17", "Amount": 1234.56, "Expedited": null  }
  ]
}
```

1. **The envelope is camelCase; the row keys are not.** `schema`, `sourceFile`,
   `rowCount` and `rows` are camelCase. The keys *inside* a row are the CSV column
   names carried through **verbatim** — `OrderId`, not `orderId`. This is
   deliberate, so the JSON stays readable against the file it came from. It is also
   the single most likely thing for an independently-built implementation to get
   wrong, which is why it is a contract term and not an implementation detail.
2. **An optional column left blank comes back as an explicit `null`**, not as a
   missing key. Row 3's `Expedited` is the case.
3. **Dates are strings in `yyyy-MM-dd`** and no other format.
4. **`rowCount` counts data rows**, excluding the header.

### `400 Bad Request` — the file was bad

Sent this file:

```
OrderId,CustomerName,OrderDate,Amount,Expedited
1001,Acme Tools,15/01/2026,250.00,true
1002,,2026-01-16,99.95,false
1003,Gamma Ltd,2026-01-17,not-a-number,maybe
```

Got this back:

```json
{"title":"The CSV file did not match the schema.","schema":"orders","sourceFile":"orders-invalid.csv","errors":[{"line":2,"column":"OrderDate","message":"'15/01/2026' is not a date in yyyy-MM-dd format."},{"line":3,"column":"CustomerName","message":"A value is required."},{"line":4,"column":"Amount","message":"'not-a-number' is not a number."},{"line":4,"column":"Expedited","message":"'maybe' is not true or false."}]}
```

- **`line` is the physical line in the file — line 1 is the header**, so the first
  data row is line 2. That is what somebody sees when they open the CSV in a text
  editor, and matching it is the whole point.
- **A file is all-or-nothing.** Four problems across three rows produced **no**
  batch, not a partial one. Importing the rows that happened to be fine would leave
  somebody reconciling a half-loaded file.
- **Every problem is reported, not just the first.**

An unknown schema name is also a `400`, in the same envelope:

```json
{"title":"There is no schema named 'invoices'.","schema":"invoices","sourceFile":"orders.csv","errors":[{"line":0,"column":null,"message":"Call GET /schemas to see the schemas this service knows about."}]}
```

`line: 0` with `column: null` means *the problem is with the request, not with a
particular cell*.

### The two supporting endpoints

| Endpoint | Response |
| --- | --- |
| `GET /schemas` | `["orders"]` |
| `GET /health` | `{"status":"ok"}` |

`GET /schemas` is not decoration — it is how somebody whose schema name was rejected
finds out what the service actually accepts, and the `400` above points at it.

## Contract 2 — `persistence`: `POST /batches`

**In one sentence:** the JSON `converter` produced goes in, rows land in SQL Server,
and re-posting the same file does not duplicate them.

### The request

`application/json`. **The body is `converter`'s `200` response, forwarded
unchanged.**

```
POST /batches
Content-Type: application/json
<the exact bytes converter returned>
```

That is the whole integration, and it is worth pausing on: `watcher` never
deserialises the batch, never reshapes it, and never introduces a shared DTO library
that both services depend on. It passes an opaque string from one service to the
other. **`sourceFile` is the identity of a delivery** — see the duplicate rule below.

### `201 Created` — stored

```json
{"batchId":"019fc859-f5cc-76b9-bb71-cb09247ae891","sourceFile":"orders-contract-probe.csv","rowCount":3,"duplicate":false}
```

The `201` also carries a **relative** `Location` header naming the batch it just
created:

```
HTTP/1.1 201 Created
Content-Type: application/json; charset=utf-8
Server: Kestrel
Location: /batches/019fc876-8aee-7880-8f3d-6314ffdcac5f
```

**That is a different GUID from the body above because it is a different request** —
the headers were captured from a separate probe. In any one response, the id in
`Location` and the `batchId` in the body are the same batch.

### `200 OK` — already stored

The **identical request**, sent a second time:

```json
{"batchId":"019fc859-f5cc-76b9-bb71-cb09247ae891","sourceFile":"orders-contract-probe.csv","rowCount":3,"duplicate":true}
```

Three things to take from that pair:

1. **`sourceFile` is unique.** A file is loaded once, ever.
2. **The second call returns the ORIGINAL `batchId`** — the same GUID, not a new
   one. That is what makes a retry safe.
3. **`201` versus `200` is the signal, and `duplicate` says the same thing in the
   body.** Both are success.

This looks like an edge case and it is the mechanism that makes the whole pipeline
safe to retry. `watcher` retries. A re-delivery is not an error, it is the
*expected* case, and a contract that made it an error would lose data on the first
network hiccup.

### `400 Bad Request` — the batch was bad

From a batch with a wrong schema name and a `rowCount` that disagrees with the array:

```json
{"title":"The batch could not be stored.","sourceFile":"nope.csv","errors":[{"row":0,"field":"Schema","message":"This service stores the 'orders' schema; got 'invoices'."},{"row":0,"field":"RowCount","message":"rowCount says 2 but the batch carries 1 rows."}]}
```

- **`row` is the 1-based position in the `rows` array; `row: 0` means the problem is
  with the batch as a whole.** Note this is a *different* coordinate from
  `converter`'s `line`, which counts physical file lines. Two services, two honest
  coordinate systems — do not "harmonise" them.
- **`persistence` re-validates everything `converter` already validated.** It is
  reachable on its own, so it does not get to assume its caller was `converter`.
  You are going to write the same date check twice, and it will feel redundant. It
  is not: this is where a service boundary stops being a diagram and starts costing
  something.

> **One thing that looks like this contract and is not.** If you send a body that
> is not valid JSON at all, you will get a `400` from the web framework before your
> own code ever runs, and it will look nothing like the envelope above — a different
> content type, a different shape, possibly a stack trace. **That is normal, and it
> is not part of this contract.**
>
> What the contract pins is: the **status code** `400`. The envelope above is what a
> *well-formed but invalid* batch gets, and **that envelope is contractual** — a
> conforming implementation must produce it. What a framework emits for a body it
> could not parse is a framework artefact, and a conforming implementation may
> return anything at all there.
>
> Do not copy your framework's parse-failure output into your own error format, and
> do not treat somebody else's as a bug. `watcher` is unaffected either way: both
> are `4xx`, so both mean *the file's fault*.

### The two supporting endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /batches/{id}` | read a stored batch back — this is how you prove the rows landed |
| `GET /health` | `{"status":"ok"}` |

`GET /batches/{id}`:

```json
{"id":"019fc859-f5cc-76b9-bb71-cb09247ae891","sourceFile":"orders-contract-probe.csv","schema":"orders","receivedAt":"2026-08-03T15:59:26.6674118+00:00","rowCount":3,"orders":[{"orderId":1001,"customerName":"Acme Tools","orderDate":"2026-01-15","amount":250.00,"expedited":true},{"orderId":1002,"customerName":"Beta Supplies","orderDate":"2026-01-16","amount":99.95,"expedited":false},{"orderId":1003,"customerName":"Gamma Ltd","orderDate":"2026-01-17","amount":1234.56,"expedited":null}]}
```

**Note the casing flip and do not trip on it.** On the way *in*, row keys are the
CSV's `OrderId`. On the way *back out* of `GET /batches/{id}`, they are `orderId` —
because these are now the service's own stored columns, not the file's. Different
endpoint, different thing, different contract.

## The one rule `watcher` is built on

This is the load-bearing sentence of the entire tutorial:

> **`4xx` means the file is at fault. `5xx`, or no answer at all, means the service
> is at fault.**

Everything `watcher` does follows from it:

| What the other service said | Whose fault | Outcome | What happens to the file |
| --- | --- | --- | --- |
| `200` / `201` | — | `Stored` | moved to `archive\` |
| `200` with `duplicate: true` | — | `AlreadyStored` | moved to `archive\` |
| `4xx` | the file's | `Rejected` | moved to `failed\` |
| `5xx`, or the call did not connect | the service's | `Deferred` | **left exactly where it is** |

A bad file moves out of the way, because retrying it forever would block the folder
and fill the log. **An unavailable service leaves the file untouched, because the
next poll is the retry** — and moving it would lose it.

Getting those two backwards is the classic way to lose data in a file pipeline.
That is why every row gets a test, and why this rule lives in the *contract* rather
than in a code comment.

---

# Day one — the one step everybody does together

Everything after this section is parallel and nobody waits on anybody. **This
section is the exception**, and pretending otherwise would be mis-selling it: one
short bootstrap is shared and sequential, because it agrees names and writes one
shared file.

For a solo reader it takes a minute. For a team it takes one short meeting and one
commit.

## Step 1 — Agree the two contracts

Read [The two contracts](#the-two-contracts) together. That is the step. If your
team wants to change something in them, change it *now*, before anybody builds
against it — that is the only moment it is cheap.

## Step 2 — Agree the names, the roots, the ports and the databases

Four conventions, and every one of them is **derived from the owner's name so that
nobody has to allocate anything**. There is no "who is version 2?" meeting.

### Names and code roots

| Field | Pattern | Example |
| --- | --- | --- |
| slug | `{owner}-{service}` | `priya-converter` |
| title | `{Service} ({Owner})` | `Converter (Priya)` |
| code root | `modules/{owner}/{service}` | `modules/priya/converter` |

The slug reads as its own code root with the separators swapped —
`priya-converter` ⇄ `modules/priya/converter` — so there is one rule to remember,
not two.

```
modules/
  priya/
    converter/
    persistence/
    watcher/
  sam/
    converter/
    persistence/
    watcher/
  chen/
    ...
```

**Two people cannot collide, because no code path is shared.** That is not a
convention anybody has to remember — it falls out of the directory tree.

> **Why the owner is in the slug rather than a version number.** `converter-v1` reads
> nicely, but slugs must be unique across the repository and nothing hands out the
> version numbers. Three people each alone at their desk on day one will each declare
> "v1", and six of the nine declarations get rejected. Avoiding that needs a central
> allocation step *before anybody can start*, which is precisely what this model is
> built to avoid.
>
> **A solo reader uses their own name** — `alex-converter`, `alex-persistence`,
> `alex-watcher` — not a placeholder like `solo` or `me`. A placeholder has to be
> renamed the moment a second person shows up, and slugs are stamped into every
> session set that references them, so renaming one orphans work. **Titles can be
> re-edited freely; slugs are durable identities.** When somebody leaves, retitle
> their modules and reassign their code root's reviewer — never rename the slug.

> **Do not copy the answer key's paths.** It lays its modules out as
> `modules/converter/src/…`, with no owner tier, because it has exactly one owner.
> Yours has a tier per member.

### Ports and databases

Everybody uses the same numbers on their own machine, so again there is nothing to
allocate:

| Band | Who | Ports | Database |
| --- | --- | --- | --- |
| `51xx` | **yours** | converter `5101`, persistence `5102`, watcher `5103` | `DabblerCsvPipeline_priya` |
| `52xx` | **the version you test against** in Part D | converter `5201`, persistence `5202` | `DabblerCsvPipeline_sam` |

Your `watcher` never moves — it stays on `5103`. Part D only changes where it
*looks*.

> **The database name per member is not optional, and it is the single thing most
> likely to break Part D.**
>
> A `persistence` service creates and migrates its database when it starts. If two
> members' services are pointed at the *same* database name on one machine, the
> second one to start meets migration history it did not write, and the unique index
> on `sourceFile` reports the other person's already-loaded files as duplicates.
>
> That is a database error in the middle of Part D, and it would completely bury the
> lesson Part D exists to teach. You would spend the afternoon debugging EF Core
> instead of learning about service boundaries. **Give each member their own
> database name and it cannot happen.**

The knob is the `Orders` connection string. In `appsettings.json`:

```json
"ConnectionStrings": {
  "Orders": "Server=(localdb)\\MSSQLLocalDB;Database=DabblerCsvPipeline_priya;Trusted_Connection=True;TrustServerCertificate=True"
}
```

Or as an environment variable, which is how you will run somebody *else's* service
in Part D without editing any of their files (`__` is .NET's nesting separator):

```powershell
$env:ConnectionStrings__Orders = "Server=(localdb)\MSSQLLocalDB;Database=DabblerCsvPipeline_sam;Trusted_Connection=True;TrustServerCertificate=True"
```

Nothing has to exist beforehand — the service creates and migrates the named
database on start-up.

## Step 3 — Declare every module, in one commit

**One person does this, once, before anybody branches.** The person who created the
repository — the same person [Adopt Dabbler](adopt-dabbler.md) already puts in that
seat.

Run **`Dabbler: New Module`** once per module. The command is covered in
[Adopt Dabbler](adopt-dabbler.md), Part 3; what is new here is only **how many times
you run it, and in what order**.

> **▸ Working alone, or in a team? Do ONE of these.**
>
> - **A team of three:** run it **nine times** — three per member — in
>   **member-major order**, so each person's three stay together:
>
>   | # | slug | title |
>   | --- | --- | --- |
>   | 1 | `priya-converter` | `Converter (Priya)` |
>   | 2 | `priya-persistence` | `Persistence (Priya)` |
>   | 3 | `priya-watcher` | `Watcher (Priya)` |
>   | 4 | `sam-converter` | `Converter (Sam)` |
>   | 5 | `sam-persistence` | `Persistence (Sam)` |
>   | 6 | `sam-watcher` | `Watcher (Sam)` |
>   | 7 | `chen-converter` | `Converter (Chen)` |
>   | 8 | `chen-persistence` | `Persistence (Chen)` |
>   | 9 | `chen-watcher` | `Watcher (Chen)` |
>
>   Same for four members or two — three per person, member-major.
>
> - **Alone:** run it **three times**, with your own name:
>
>   | # | slug | title |
>   | --- | --- | --- |
>   | 1 | `alex-converter` | `Converter (Alex)` |
>   | 2 | `alex-persistence` | `Persistence (Alex)` |
>   | 3 | `alex-watcher` | `Watcher (Alex)` |
>
>   **Do not declare modules for people who do not exist.** Part D has a solo
>   version that needs nothing extra declared — it is explained where you get there.
>
> **Everywhere below, `priya` is the example owner. Substitute your own name.**

**Order matters, and it is the only ordering mechanism you get.** The Work Explorer
renders modules in the order they appear in `docs/modules.yaml` — *not*
alphabetically. Declaring them member-major is what keeps each person's three
modules together in the tree, and it costs nothing.

> **There is no "member" row in the tree.** Module grouping is exactly one level
> deep: nine modules are nine flat sibling rows, and no per-member expansion tier
> exists or can be created. Contiguous rows in manifest order is the whole
> mechanism. It is enough.

Then open **`Dabbler: Open modules.yaml`** and add the code root to each entry by
hand — no command does that for you, and
[Adopt Dabbler](adopt-dabbler.md), Part 3 covers the edit itself. What is specific
to this tutorial is the **shape**: one code root per module, derived from the owner,
and the entries in member-major order.

```yaml
modules:
  # Your Adopt Dabbler module is already here. Leave its entry alone and add
  # the new ones after it -- this block shows the shape, not the whole file.
  - slug: priya-converter
    title: "Converter (Priya)"
    codeRoots:
      - modules/priya/converter
    planPath: docs/modules/priya-converter/project-plan.md
  - slug: priya-persistence
    title: "Persistence (Priya)"
    codeRoots:
      - modules/priya/persistence
    planPath: docs/modules/priya-persistence/project-plan.md
  - slug: priya-watcher
    title: "Watcher (Priya)"
    codeRoots:
      - modules/priya/watcher
    planPath: docs/modules/priya-watcher/project-plan.md
  # ...then Sam's three, then Chen's three
```

Commit all of it together and push — **one commit, before anybody branches**.

> **Why up front, rather than each member declaring their own?** Because
> `docs/modules.yaml` is the one path everybody shares. Three people each appending
> three entries to the same YAML list on three branches is a guaranteed three-way
> merge conflict, and it would be the *first* thing the team ever did together.
> Losing an afternoon to that on day one would teach the exact opposite of the
> lesson.
>
> This costs nothing: a declared module with no session sets yet renders perfectly
> happily. The manifest is a **declaration of intent**, not a record of work done,
> and a tree full of named rows waiting for work is a better first morning than an
> empty one that fills in raggedly.

### No module here declares `touches:`

You may have seen `touches:` used where one module imports another module's code.
**Every module in this tutorial deliberately leaves it out**, and the reason is the
whole architecture:

> These three modules talk over HTTP and **never read each other's source**. There is
> no code-level dependency to declare.

That is not a technicality. It is the same fact that makes Part D possible: modules
that share no code cannot break each other's build, and a module that never imported
anything can be repointed at a different implementation by configuration.

When a module *does* share code with another — when one reads or changes the
other's source — `touches:` is the right answer and you should use it, because it is
what sanctions those edits and what makes CI test both modules rather than one.
**Knowing which of the two situations you are in is the lesson.**

## Step 4 — Route reviews by ownership

Each member's code root routes its reviews to that member. One line per member, not
one per module, because the member tier in the path is what ownership actually
tracks.

> **▸ Your host — do ONE of these.**
>
> - **GitHub:** create or edit `.github/CODEOWNERS`:
>
>   ```text
>   /modules/priya/   @priya-handle
>   /modules/sam/     @sam-handle
>   /modules/chen/    @chen-handle
>   ```
>
>   Use **real** usernames — GitHub silently declines to route reviews to handles
>   that do not exist, and you will get no error telling you so. The rules take
>   effect once they are on `main`, and they only route pull requests opened
>   **after** they land, so the pull request that adds them still needs a reviewer
>   asked by hand.
>
> - **Azure DevOps:** `CODEOWNERS` is a GitHub feature and Azure DevOps ignores the
>   file entirely. The equivalent is **Project Settings** > **Repositories** > your
>   repo > **Policies** > **Automatically included reviewers**. Add one entry per
>   member: path filter `/modules/priya/*`, required reviewer Priya. Repeat for Sam
>   and Chen.

Both hosts do the same job. Everything else in this tutorial is identical on either
one — only the answer key is GitHub-specific, and you are linking to it, never
cloning it.

**A solo reader can skip this step** and come back to it when somebody joins.

## Now nobody waits

That was the shared part. From here everybody works at the same time, on their own
branches, in their own code roots. Nobody is blocked on anybody, and the only reason
that is true is that the contracts were agreed first.

Each of the four parts below opens **your** module and runs the ordinary Dabbler
lifecycle on it — a plan set, then a decomposition set, then implementation sessions
— which is covered in [Adopt Dabbler](adopt-dabbler.md), Part 4 and not repeated
here. What this tutorial adds is *what to tell the AI to build*, and how to know when
it is finished.

---

# Part A — `converter`

|  |  |
| --- | --- |
| **You build** | `converter` — CSV in, validated JSON out |
| **This proves** | a module with no dependencies is buildable, testable and finishable entirely on its own |
| **Depends on** | nothing but the prerequisites |
| **Can you stop here?** | **Yes.** Nothing later reaches back into Part A. |

**Coming back to this?** Nothing needs to be running. You need your repository
cloned and the day-one bootstrap already pushed.

## What to build

Open your `{owner}-converter` module in the Work Explorer. It is **already
declared** — day one did that — so you do not declare anything here. Run its plan
set, then its decomposition set, then implement.

What you are asking for is [Contract 1](#contract-1--converter-post-convert),
in full:

- `POST /convert` taking `multipart/form-data` with a `file` part and a `schema`
  part.
- The `orders` schema exactly as specified, with the header validated for missing
  **and extra** columns.
- `200` with the envelope in camelCase and the row keys carried through verbatim
  from the CSV header.
- `400` with **every** problem listed, `line` counting physical file lines with the
  header as line 1, and no partial batch ever produced.
- `GET /schemas` and `GET /health`.
- **Listening on `5101`** — the port you agreed on day one. Ask for it explicitly;
  a new ASP.NET Core project picks its own port otherwise, and every command in this
  tutorial assumes yours.

Give your AI agent the contract section itself. It is written to be handed over.

## The finish line

> **You are done with Part A when:**
>
> 1. **Every test your implementation has is green.**
> 2. `POST /convert` answers a real CSV upload with a schema-valid batch, and
> 3. `POST /convert` answers a bad file with a `400` that names the offending line.

**First, save the two sample files.** You will use them for the rest of the
tutorial. Create a `samples/` folder at the root of your repository and put these in
it, exactly as they appear in
[Contract 1](#contract-1--converter-post-convert) — `samples/orders.csv`:

```
OrderId,CustomerName,OrderDate,Amount,Expedited
1001,Acme Tools,2026-01-15,250.00,true
1002,Beta Supplies,2026-01-16,99.95,false
1003,Gamma Ltd,2026-01-17,1234.56,
```

...and `samples/orders-invalid.csv`:

```
OrderId,CustomerName,OrderDate,Amount,Expedited
1001,Acme Tools,15/01/2026,250.00,true
1002,,2026-01-16,99.95,false
1003,Gamma Ltd,2026-01-17,not-a-number,maybe
```

**Note the trailing comma on the last line of `orders.csv`.** That empty
`Expedited` is deliberate — it is the optional-column case, and it must come back as
an explicit `null`.

Then start the service and try it, from the root of your repository:

```powershell
dotnet run --project modules/priya/converter --urls http://localhost:5101
```

> **Two substitutions in that one command, and both matter for every `dotnet run`
> in this tutorial.**
>
> **`priya` is the example owner — use your own name**, the same one you used for
> your slugs and code roots.
>
> **`--project` must point at the folder holding the `.csproj`**, and your AI
> session decided where that is. It may have put it directly in your code root, or
> under a `src/` folder, or in a named project folder. If the command reports that
> it could not find a project, ask:
>
> ```powershell
> Get-ChildItem -Recurse -Filter *.csproj modules/priya/converter
> ```
>
> ...and point `--project` at the folder that comes back. This is the very first
> place "your code will not match the answer key" stops being an idea and becomes a
> command line.

```powershell
curl.exe -s -F "file=@samples/orders.csv;type=text/csv" -F "schema=orders" http://localhost:5101/convert
curl.exe -s -F "file=@samples/orders-invalid.csv;type=text/csv" -F "schema=orders" http://localhost:5101/convert
```

Compare what comes back with the two bodies in
[Contract 1](#contract-1--converter-post-convert). They should match.

> **A number is not a finish line.** For reference, the answer key's converter has
> 31 tests:
>
> ```
> Passed!  - Failed:     0, Passed:    31, Skipped:     0, Total:    31, Duration: 369 ms - Dabbler.CsvPipeline.Converter.Tests.dll (net10.0)
> ```
>
> **That is an observation, not a target.** Your AI session will decompose the tests
> differently. A conforming `POST /convert` with 28 tests is finished; one with 40 is
> finished. If your count matches exactly, wonder whether you copied.

---

# Part B — `persistence`

|  |  |
| --- | --- |
| **You build** | `persistence` — JSON in, rows in SQL Server |
| **This proves** | a second independent module; two modules that share no code cannot break each other's build |
| **Depends on** | **nothing — not on Part A** |
| **Can you stop here?** | **Yes.** |

**Coming back to this?** Nothing needs to be running, and you do not need Part A
finished — this module never calls it. You need LocalDB installed
(`sqllocaldb info` prints `MSSQLLocalDB`).

## What to build

Open your `{owner}-persistence` module — again, already declared. Ask for
[Contract 2](#contract-2--persistence-post-batches):

- `POST /batches` taking `converter`'s `200` body unchanged.
- Rows written to SQL Server through EF Core, with the database created and migrated
  on start-up.
- **The connection string named `Orders`, pointing at your own database name** from
  step 2 — `DabblerCsvPipeline_{owner}`. Do this now; Part D depends on it.
- `201` on a new `sourceFile`, with a relative `Location` header.
- `200` on a repeat, returning the **original** `batchId` with `duplicate: true`.
- `400` for a well-formed batch that fails validation, in the documented envelope.
- `GET /batches/{id}` and `GET /health`.
- **Listening on `5102`.** Same reason as Part A: ask for the port, or the project
  picks its own.

> **If your agent builds this with EF Core *migrations*, you need one more tool.**
> Generating a migration needs `dotnet-ef`, which the .NET SDK does not include:
>
> ```powershell
> dotnet tool install --global dotnet-ef
> ```
>
> You will know you need it when a command fails with *"Could not execute because
> the specified command or file was not found"*. Not every implementation takes
> that route — an agent that creates the schema directly on start-up needs nothing
> extra — which is why this is here rather than in the install list at the top.

## The beat that earns its place

**`persistence` re-validates everything `converter` already validated.** You will
write the same date check for the second time and it will feel like waste.

It is not. `persistence` is reachable on its own — anybody on the network can `POST`
to it — so it does not get to assume `converter` was its caller. A function call can
trust its caller. A service cannot. **That is the difference a service boundary
makes, and this is the moment it costs you something real.**

## The finish line

> **You are done with Part B when:**
>
> 1. **Every test your implementation has is green.**
> 2. A posted batch's rows read back out of SQL Server through `GET /batches/{id}`,
>    and
> 3. Re-posting the same `sourceFile` returns the **original** `batchId` with
>    `duplicate: true`.

Point three is the one to check carefully. **You need a batch to post.** If your
Part A `converter` is finished, have `curl` write its output to a file — otherwise
paste the `200` body from [Contract 1](#contract-1--converter-post-convert) into
`batch.json` by hand:

```powershell
curl.exe -s -o batch.json -F "file=@samples/orders.csv;type=text/csv" -F "schema=orders" http://localhost:5101/convert
```

> **Use `-o`, not `>`.** Windows PowerShell 5.1 — the one built into Windows, the
> blue one — does not pass a program's output through to a file unchanged. It
> re-encodes it as UTF-16, BOM and all, and `persistence` would then reject your
> perfectly good batch as malformed JSON while you went looking for the bug in your
> own code. `curl`'s `-o` writes the bytes itself and sidesteps the whole problem.

Then start `persistence` and post the same batch twice:

```powershell
dotnet run --project modules/priya/persistence --urls http://localhost:5102
```

```powershell
$first  = curl.exe -s -H "Content-Type: application/json" --data-binary "@batch.json" http://localhost:5102/batches | ConvertFrom-Json
$second = curl.exe -s -H "Content-Type: application/json" --data-binary "@batch.json" http://localhost:5102/batches | ConvertFrom-Json
$first; $second
```

The first should report `"duplicate":false`, the second `"duplicate":true` — **with
the same `batchId`**. If the second call returns a new GUID, your pipeline will
double-load every file it ever retries.

**Now read the rows back**, which is the other half of the finish line — posting a
batch is not the same as storing one:

```powershell
curl.exe -s "http://localhost:5102/batches/$($first.batchId)"
```

You should get all three orders, in the shape shown at
[`GET /batches/{id}`](#the-two-supporting-endpoints-1) — note the row keys come back
as `orderId`, not `OrderId`, because they are the service's stored columns now
rather than the file's.

> For reference, the answer key's persistence has 24 tests:
>
> ```
> Passed!  - Failed:     0, Passed:    24, Skipped:     0, Total:    24, Duration: 2 s - Dabbler.CsvPipeline.Persistence.Tests.dll (net10.0)
> ```
>
> An observation, not a target.

---

# Part C — `watcher`, in two phases

|  |  |
| --- | --- |
| **You build** | `watcher` — poll a folder, call the two services, file the CSV away |
| **This proves** | a module that *composes* two others without importing either; and a decision table tested with nothing running |
| **Can you stop here?** | **Yes**, and for most readers this is the natural end. |

This part has two phases with **different dependencies**, and keeping them apart is
the entire lesson.

|  | Phase A | Phase B |
| --- | --- | --- |
| **Depends on** | **the two contracts only** — nothing running, nothing built but `watcher` | **runnable `converter` and `persistence`** |
| **Finish line** | your decision-table tests green, covering all four outcomes | your full suite green, **and** a real CSV's rows in a database, the file in `archive\`, a bad file in `failed\` |

**Coming back to this?** Phase A needs nothing running. Phase B needs your
`converter` and `persistence` from Parts A and B.

## What to build

Open your `{owner}-watcher` module — already declared. This is the largest of the
three, so here is the whole thing in one list; you build the logic in Phase A and
the service around it in Phase B.

**The logic — the decision table.** Given one file and the two services' answers,
decide the outcome and what happens to the file. All four rows of
[the decision table](#the-one-rule-watcher-is-built-on): `Stored`, `AlreadyStored`,
`Rejected`, `Deferred`. **This part must be testable with nothing running** — see
Phase A.

**The service around it:**

- A web application on **`5103`**, with `GET /health` returning `{"status":"ok"}`.
- **A poll on a schedule.** The answer key uses Quartz.NET with the cron expression
  `0 * * * * ?` — every minute, on the minute.
- **A folder to watch, and two to file into**, all three configurable, plus the two
  service addresses. Configuration, never constants — Part D depends on that being
  true.
- **The call to `converter`:** post the file as `multipart/form-data` with a `file`
  part and a `schema` part, exactly as
  [Contract 1](#contract-1--converter-post-convert) specifies.
- **The call to `persistence`:** forward the bytes `converter` returned
  **unchanged**. Do not deserialise the batch, do not reshape it, and do not build a
  shared type that both services depend on. It is an opaque string in transit.
- **`POST /run-now`** — run one pass immediately instead of waiting for the next
  tick. You will use this constantly; a tutorial where every test costs you up to
  sixty seconds is a tutorial nobody finishes.

**What `POST /run-now` returns:** a JSON **array with one entry per file it found**,
each entry carrying `fileName`, `outcome`, `detail` (the other service's error body
when there was one, otherwise `null`) and `batchId` (`null` when nothing was
stored). An empty folder gives you an empty array.

Individual entries are quoted on their own throughout the rest of this part —
`{"fileName": ...}` — but the endpoint always returns them wrapped in an array.

## Phase A — the decision table, against stubs

Build `watcher`'s logic and test it with **stubs standing in for both services**.
Cover all four rows of [the decision table](#the-one-rule-watcher-is-built-on):
`Stored`, `AlreadyStored`, `Rejected`, `Deferred`.

> **Why stub, when you have already built both services?**
>
> **Because your unit tests must not require other services to be running.**
>
> That is the whole reason, and it is worth being blunt about it: a test suite that
> needs a database, a file server and two web services started is a suite people
> stop running. It fails on a colleague's laptop, it fails in CI on a Monday, and
> within a month nobody trusts it.
>
> `watcher`'s entire decision table — when to archive, when to move a file aside for
> good, when to leave it and retry — is logic. Logic does not need a network.

For reference, the answer key covers the table like this:

```
Passed!  - Failed:     0, Passed:    12, Skipped:     0, Total:    12, Duration: 81 ms - Dabbler.CsvPipeline.Watcher.Tests.dll (net10.0)
```

Twelve tests, well under a second, with **no database, no file server and no other
module started**. Your count will differ. What must be true is that **all four
outcomes are covered and the suite needs nothing running**.

> **Phase A is genuinely reachable without Parts A and B.** If you skipped ahead, or
> you are following along while a teammate is still building, you can finish Phase A
> and stop. That is not a ritual — it is a real demonstration that a module written
> against a contract does not need the contract's other end to exist.

## Phase B — wire it up

Now start everything and watch a file go through.

**1. Create the drop folder and its two subfolders.** In PowerShell, `mkdir` creates
intermediate folders for you, so two commands cover all three:

```powershell
mkdir C:\DabblerCsvPipeline\incoming\archive
mkdir C:\DabblerCsvPipeline\incoming\failed
```

That is the path the answer key uses. If your machine will not let you create a
folder at the root of `C:\` — some managed workstations are locked down that way —
use any folder you can write to and put that path in the settings below instead. The
pipeline does not care where the folder is.

**2. Point `watcher` at the folder and at your two services.** In `watcher`'s
`appsettings.json`:

```json
"Watcher": {
  "Schema": "orders",
  "Cron": "0 * * * * ?",
  "ScheduleEnabled": true,
  "Source": {
    "Kind": "LocalFolder",
    "IncomingPath": "C:\\DabblerCsvPipeline\\incoming",
    "ArchivePath": "C:\\DabblerCsvPipeline\\incoming\\archive",
    "FailedPath": "C:\\DabblerCsvPipeline\\incoming\\failed"
  },
  "Converter": {
    "BaseAddress": "http://localhost:5101"
  },
  "Persistence": {
    "BaseAddress": "http://localhost:5102"
  }
}
```

`"0 * * * * ?"` is a Quartz.NET cron expression meaning *every minute, on the
minute*.

**3. Start all three, in three terminals:**

```powershell
dotnet run --project modules/priya/converter --urls http://localhost:5101
```

```powershell
dotnet run --project modules/priya/persistence --urls http://localhost:5102
```

```powershell
dotnet run --project modules/priya/watcher --urls http://localhost:5103
```

**4. Drop a CSV in `C:\DabblerCsvPipeline\incoming` and trigger a run** rather than
waiting for the minute boundary:

```powershell
Copy-Item samples\orders.csv C:\DabblerCsvPipeline\incoming\orders-1.csv
$result = curl.exe -s -X POST http://localhost:5103/run-now | ConvertFrom-Json
$result
```

You get back one entry per file it found, each naming the outcome and the batch it
produced. **Then read the rows back out of the database**, which is what the finish
line actually asks for:

```powershell
curl.exe -s "http://localhost:5102/batches/$($result[0].batchId)"
```

> **Give every file you drop a different name**, as the `Copy-Item` above does —
> `orders-1.csv`, `orders-2.csv`, and so on. `sourceFile` is the identity of a
> delivery, so re-dropping `orders.csv` comes back `AlreadyStored` rather than
> storing anything, and you would also be moving a second `orders.csv` on top of the
> one already sitting in `archive\`.

> **Got an empty array back — or an error?** The scheduled poll almost certainly
> beat you to it — it runs every minute whether you asked or not, so a file dropped
> just before the minute boundary is already gone by the time you call `/run-now`.
> Usually that shows up as an empty array. If the two passes collide over the same
> file it can instead surface as an error, because one of them went to file away a
> file the other had already moved. Same cause, same fix, and neither means your
> pipeline is broken.
>
> **Set `"ScheduleEnabled": false` and drive everything with `/run-now` while you
> are experimenting.** It makes every run in this part reproducible, and you can
> turn the schedule back on when you want to watch it work unattended.

**5. Now try the failure paths.** They matter more than the happy one:

- **Drop a bad CSV.** Outcome `Rejected`, and the file moves to `failed\`. `detail`
  carries `converter`'s entire `400` body through verbatim, so whoever reads the log
  knows which line was wrong.
- **Stop your `converter` and drop a good CSV.** Outcome `Deferred`, and **the file
  stays exactly where it is**.
- **Start `converter` again and run once more.** The file that was left behind is
  picked up and stored — same file, later tick, nobody intervened.

Those last two are worth seeing as one transcript. Here is that sequence, captured
from a real run:

```json
{"fileName":"orders-partd-3.csv","outcome":"Deferred","detail":"No connection could be made because the target machine actively refused it. (localhost:5201)","batchId":null}
```

```json
[{"fileName":"orders-partd-2.csv","outcome":"AlreadyStored","detail":null,"batchId":"019fc85a-c637-7f68-867b-392aa204817a"},
 {"fileName":"orders-partd-3.csv","outcome":"Stored","detail":null,"batchId":"019fc85b-4e57-783e-9b9b-83aaefea6a2b"}]
```

That is the whole lesson in four lines. The deferred file was not lost, not
duplicated, and not touched by a human — and the file that had already been stored
came back `AlreadyStored` with its **original** `batchId`, which is the duplicate
rule from Part B doing its job.

> **Two details about that capture, so you are not confused when yours differs.**
> It was taken on a run where the converter was on **`5201`**, which is why the
> `Deferred` message names that port. The file names are from that run too. **The
> `outcome` values are the contract; everything else in these lines — `detail`,
> ports, names and GUIDs — is just what that machine happened to produce.** Your
> `detail` comes from whatever your HTTP client reported, so it may well read
> differently, or not name a port at all.

## The finish line

> **You are done with Part C when:**
>
> 1. **Every test your implementation has is green** — including a decision-table
>    suite that covers all four outcomes and **needs nothing running**.
> 2. A real CSV's rows are in your database,
> 3. that file is in `archive\`, and
> 4. a bad file is in `failed\`.

> For reference, the answer key's three suites together:
>
> ```
> Passed!  - Failed:     0, Passed:    31, Skipped:     0, Total:    31, Duration: 369 ms - Dabbler.CsvPipeline.Converter.Tests.dll (net10.0)
> Passed!  - Failed:     0, Passed:    24, Skipped:     0, Total:    24, Duration: 2 s - Dabbler.CsvPipeline.Persistence.Tests.dll (net10.0)
> Passed!  - Failed:     0, Passed:    19, Skipped:     0, Total:    19, Duration: 2 s - Dabbler.CsvPipeline.Watcher.Tests.dll (net10.0)
> ```
>
> 74 tests in about nine seconds. Observations, not targets.

> **Your own services not working yet?** Phase B needs *a* running `converter` and
> *a* running `persistence` — not necessarily yours. If a teammate's are up, point
> at theirs and carry on. That is Part D's mechanism arriving early, and it works
> for exactly the reason Part D works.

---

# Part D — drive somebody else's services

|  |  |
| --- | --- |
| **You build** | **nothing** |
| **This proves** | your `watcher` only ever knew a contract |
| **You change** | **two configuration values.** No code. No rebuild. |
| **Can you stop here?** | It is the end. |

**Coming back to this?** You need Part C finished and working against your own
services, and — if you are in a team — your teammate's modules actually present in
your working copy.

Because every member's modules live in the **same repository**, a teammate's
`converter` can be on your disk. You are going to start *their* two services on the
`52xx` band, point your `watcher` at them, and run.

Everything stays on `localhost`. **No binding change, no firewall rule, no second
machine.**

> **First, make sure their code is actually there.** "Same repository" is not the
> same as "same working copy" — you have each been on your own branch this whole
> time. Before you start, your teammate's `converter` and `persistence` must be
> **merged**, and you must have **pulled** the branch that has them:
>
> ```powershell
> git checkout main
> git pull
> ```
>
> Then confirm you can see them:
>
> ```powershell
> Get-ChildItem modules/sam
> ```
>
> If that folder is empty or missing, their work has not landed yet. That is a
> scheduling problem, not a tutorial problem — do the solo version below in the
> meantime, and come back.

## Do it

**1. Start their `converter` on `5201`:**

```powershell
dotnet run --project modules/sam/converter --urls http://localhost:5201
```

**2. Start their `persistence` on `5202`, with their own database:**

```powershell
$env:ConnectionStrings__Orders = "Server=(localdb)\MSSQLLocalDB;Database=DabblerCsvPipeline_sam;Trusted_Connection=True;TrustServerCertificate=True"
dotnet run --project modules/sam/persistence --urls http://localhost:5202
```

The environment variable is doing real work here: it gives their service its own
database **without editing a single file in their code root**. Set it in the terminal
you are about to run their service in, and nowhere else.

> **Find their project the same way you found your own.** Your teammate's AI session
> laid their code out however it laid it out. If `--project` cannot find a project,
> run `Get-ChildItem -Recurse -Filter *.csproj modules/sam` and point at the folder
> that comes back.

**3. Change two values in your `watcher`'s `appsettings.json`, and nothing else:**

```json
"Watcher": {
  "Converter":   { "BaseAddress": "http://localhost:5201" },
  "Persistence": { "BaseAddress": "http://localhost:5202" }
}
```

**4. Restart your `watcher`, drop a CSV in the incoming folder, and run —
keeping the result**, because you need the batch id it gives you:

```powershell
$result = curl.exe -s -X POST http://localhost:5103/run-now | ConvertFrom-Json
$result
```

From the run this tutorial was written against — **your `batchId` will be a
different GUID, because it is generated per batch**:

```json
{"fileName":"orders-both-repointed.csv","outcome":"Stored","detail":null,"batchId":"019fc888-1092-7836-8e83-355d31b4d054"}
```

> **Check `outcome` before going on.** If it says `Deferred`, one of their two
> services is not actually up — that is the decision table telling you the truth,
> and your file is still sitting in `incoming\` waiting for the next run. Start the
> missing service and run the command again.

**5. Prove it really went somewhere else.** Read that batch back through **their**
`persistence`, on `5202`, using the id you just captured:

```powershell
curl.exe -s "http://localhost:5202/batches/$($result[0].batchId)"
```

Your three orders come back, **out of a service you did not write, on a port your
`watcher` learned from a settings file.** And your `watcher` was never rebuilt.

> **Do not simply re-run `/run-now` to get the id back.** Your file has already been
> archived, so a second run finds nothing and hands you an empty array. If you lost
> the value, drop another CSV — under a **different name**, because `sourceFile` is
> the identity of a delivery and the same name comes back `AlreadyStored`.

## The finish line

> **You are done with Part D — and with this tutorial — when:**
>
> 1. Your `watcher` processed a file end to end **through somebody else's
>    `converter` and `persistence`**,
> 2. you can read the batch back out of **their** `persistence` on `5202`, and
> 3. **you changed two configuration values and nothing else.**

## What just happened, and what it proves

**You changed two strings.** Not a reference, not an import, not an interface, not a
shared package version. Two strings in a configuration file.

That was only possible because `watcher` never imported anything from either service.
It knew a URL and a contract, and both of those are data.

> **Part D fails this tutorial if you had to edit any code.** That is the acceptance
> test. If you found yourself changing a class, a `using`, or a project reference to
> make this work, something upstream is coupled that should not be — and finding that
> out is worth more than the exercise.

## If you are working alone

You can do Part D today, with nothing extra declared and nothing extra built. Run a
**second copy of your own two services** on the `52xx` band, with their own database:

**1. Start a second `converter` on `5201`** — the same project, a different port:

```powershell
dotnet run --project modules/alex/converter --urls http://localhost:5201
```

**2. Start a second `persistence` on `5202`, with its own database:**

```powershell
$env:ConnectionStrings__Orders = "Server=(localdb)\MSSQLLocalDB;Database=DabblerCsvPipeline_alex2;Trusted_Connection=True;TrustServerCertificate=True"
dotnet run --project modules/alex/persistence --urls http://localhost:5202
```

The separate database name is what makes this a real second instance rather than the
same store behind a different port — and it is why the batch you read back at step 5
proves the file genuinely went to the service on `5202`.

**3. Then follow steps 3, 4 and 5 above unchanged.** Your `watcher` is repointed by
the same two settings.

> **Be clear about what this shows you.** Two copies of *your own* build prove the
> **repoint mechanism** — that the wiring is configuration and nothing else. They
> cannot prove **conformance**, because a single implementation always agrees with
> itself. Only two independently written implementations can demonstrate that they
> honour the same contract, which is exactly why the team version has every member
> build their own.
>
> A solo Part D is real, worth doing, and a smaller claim. Building a genuinely
> second implementation later and coming back is how you upgrade it.

---

# Where to go next

- **Recovery, raw git, custom hosts and failure states:**
  [Release and recovery](release-and-recovery.md).
- **A refresher on the single-module lifecycle:** [Adopt Dabbler](adopt-dabbler.md).
- **Compare against the finished thing:**
  https://github.com/darndestdabbler/dabbler-ai-orchestration-multimodule-demo

---

# Appendix

Everything here is **optional** and none of it is on the walk. The happy path is
Windows, LocalDB, a drop folder, `dotnet run` in three terminals, and one machine.
Each item below swaps out one of those.

| Choice | The happy path | The alternative |
| --- | --- | --- |
| Platform | Windows 10/11 | *(none — LocalDB is Windows-only)* |
| Database | LocalDB | a container, or any SQL Server |
| File source | a drop folder | real SFTP |
| Hosting | `dotnet run`, three terminals | IIS |
| Machines | one | two, over the LAN |

## A container instead of LocalDB

The reference solution runs the **same tests** against a real SQL Server container
by setting one environment variable:

```powershell
$env:DABBLER_PIPELINE_SQL = "container"
```

...or against a SQL Server you already have:

```powershell
$env:DABBLER_PIPELINE_SQL = "Server=myserver;Trusted_Connection=True;TrustServerCertificate=True"
```

Measured on the answer key: the default LocalDB path runs the suite in **8.9
seconds**, the container path runs the identical tests in **113.7 seconds**. Both
pass. If switching changed a result, that would be the bug.

**A cold SQL Server container needs 3–5 minutes before it accepts a login.** That is
SQL Server's own start-up, not the test framework waiting badly. Expect it.

> **This is not a substitute walk.** It is what the answer key supports; it is not a
> path this tutorial has been followed on. If you are on macOS or Linux, this is
> where you would have to start, and you would be the first — see
> [What must be installed](#what-must-be-installed).

## Real SFTP instead of a drop folder

```powershell
$env:DABBLER_PIPELINE_SFTP = "container"
```

...or an SFTP server you are already running:

```powershell
$env:DABBLER_PIPELINE_SFTP = "host=localhost;port=22;username=tester;password=secret"
```

On Windows, **Rebex Tiny SFTP Server** is the easiest real SFTP server to stand up:
https://www.rebex.net/tiny-sftp-server/

**It is linked, not included** — its licence does not permit redistribution, so
download it yourself. **It is also GUI-only**: you start it by running the
executable and clicking, and there is no supported way to script it into an
automated run. Use it for hand testing; use the container for CI.

## Publishing to IIS

All three services publish as ordinary ASP.NET Core applications with a `web.config`
bound to `AspNetCoreModuleV2` running in-process. Publish each one to its own IIS
site with `dotnet publish`, and the only thing that changes in the pipeline is
`watcher`'s **two** base addresses — they stop being `localhost:5101` and
`localhost:5102` and become the two sites' URLs.

**This is a sketch, not a runbook.** Hosting under IIS also needs the **ASP.NET Core
Hosting Bundle** installed on the server, an application pool per site, file
permissions for the pool identity on the drop folder, and a database login that the
pool identity can actually use — LocalDB in particular is a per-user instance and is
not a sensible target for an IIS-hosted service. If you are deploying this for real,
treat the above as the one pipeline-specific fact and get the rest from Microsoft's
IIS hosting documentation.

## Part D across two machines

You can do Part D between two laptops instead of two ports. **Both** services have to
listen on something other than `localhost`, so both commands change — and the
database setting travels with `persistence` exactly as it does on one machine:

```powershell
dotnet run --project modules/sam/converter --urls http://0.0.0.0:5201
```

```powershell
$env:ConnectionStrings__Orders = "Server=(localdb)\MSSQLLocalDB;Database=DabblerCsvPipeline_sam;Trusted_Connection=True;TrustServerCertificate=True"
dotnet run --project modules/sam/persistence --urls http://0.0.0.0:5202
```

They will then answer on that machine's LAN address, and **both** of your `watcher`'s
base addresses become `http://192.168.x.x:5201` and `http://192.168.x.x:5202` instead
of `localhost`. Both ports need to be reachable, not just the converter's.

> **Read this before you try it.** The binding change above is verified. **Getting
> through Windows Firewall from a genuinely remote machine is not** — it could not be
> tested from a single machine, and it is the step most likely to fail in a real
> office, where the firewall rule you need may be one your workstation policy will
> not let you add.
>
> A **refused** connection means something answered and said no — usually the
> service is not running, or is still bound to `localhost`. A **timeout** means
> nothing answered at all, and a blocked firewall port is the most common cause, but
> not the only one: a wrong address, the two machines being on different networks or
> VLANs, or a network ACL will all look identical from your end. Check the address
> first, then the firewall.
>
> The firewall fix is an inbound rule for each port on the *hosting* machine. If you
> cannot add one, **use the one-machine version** — it teaches exactly the same
> lesson, which is why it is the walk and this is the appendix.
