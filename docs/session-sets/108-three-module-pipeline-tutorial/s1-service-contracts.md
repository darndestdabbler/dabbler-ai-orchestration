# S1 — The two service contracts

> **What this is.** The two HTTP contracts the tutorial settles *before* any
> reader writes code, plus the status-code split that drives `watcher`'s decision
> table. Session 2 presents these to the reader; Session 4 walks them.
>
> **Provenance.** Every request, status code and response body below was captured
> from a **real run of the reference solution on this machine on 2026-08-03**, not
> read out of the source and not invented. The capture method is recorded in
> [Appendix — how these were captured](#appendix--how-these-were-captured) so a
> later session can reproduce it. Where a claim is *not* backed by a run, it says
> so.

---

## Why the contracts come first

Three modules, and only one of them talks to the others. If `watcher` is written
against a `converter` that has not been built yet, the two are reconciled by
whoever writes second — which is the coordination cost the whole model exists to
avoid. Pinning `POST /convert` and `POST /batches` first is what makes three
things possible at once:

- **Phase A** — `watcher`'s decision table is testable against stubs, because the
  stub has a contract to honour.
- **Parallel work** — nobody waits.
- **Part D** — a `watcher` that only ever knew a contract can be repointed at
  another implementation of it.

Everything downstream in this tutorial is a consequence of this section.

---

## Contract 1 — `converter`: `POST /convert`

**One sentence:** a CSV file goes up, schema-validated JSON comes back, or a list
of everything wrong with the file does.

### Request

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

### Response — `200 OK`

Captured verbatim from a run against `samples/orders.csv`:

```json
{"schema":"orders","sourceFile":"orders.csv","rowCount":3,"rows":[{"OrderId":1001,"CustomerName":"Acme Tools","OrderDate":"2026-01-15","Amount":250.00,"Expedited":true},{"OrderId":1002,"CustomerName":"Beta Supplies","OrderDate":"2026-01-16","Amount":99.95,"Expedited":false},{"OrderId":1003,"CustomerName":"Gamma Ltd","OrderDate":"2026-01-17","Amount":1234.56,"Expedited":null}]}
```

Formatted, and with the four things a reader must notice called out:

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
   names, carried through **verbatim** — `OrderId`, not `orderId`. This is
   deliberate: the JSON must still be readable against the file it came from. It
   is also the single most likely thing for an independently-built implementation
   to get wrong, so it is a contract term, not an implementation detail.
2. **An optional column left blank comes back as an explicit `null`**, not as a
   missing key. Row 3's `Expedited` above is the case.
3. **Dates are strings in `yyyy-MM-dd`** and no other format.
4. **`rowCount` counts data rows**, excluding the header.

### Response — `400 Bad Request`

The file is bad. Captured verbatim from a run against `samples/orders-invalid.csv`:

```json
{"title":"The CSV file did not match the schema.","schema":"orders","sourceFile":"orders-invalid.csv","errors":[{"line":2,"column":"OrderDate","message":"'15/01/2026' is not a date in yyyy-MM-dd format."},{"line":3,"column":"CustomerName","message":"A value is required."},{"line":4,"column":"Amount","message":"'not-a-number' is not a number."},{"line":4,"column":"Expedited","message":"'maybe' is not true or false."}]}
```

- **`line` is the physical line in the file — line 1 is the header.** So the first
  data row is line 2. This is what an operator sees when they open the CSV in a
  text editor, and matching that is the point.
- **A file is all-or-nothing.** Four problems across three rows produced **no**
  batch, not a partial one. Importing the rows that happened to be fine would
  leave somebody reconciling a half-loaded file.
- **Every problem is reported, not just the first.**

An unknown schema name is also a `400`, with the same envelope:

```json
{"title":"There is no schema named 'invoices'.","schema":"invoices","sourceFile":"orders.csv","errors":[{"line":0,"column":null,"message":"Call GET /schemas to see the schemas this service knows about."}]}
```

`line: 0` and `column: null` mean *the problem is with the request, not with a
particular cell*.

### The supporting endpoints

| Endpoint | Captured response |
| --- | --- |
| `GET /schemas` | `["orders"]` |
| `GET /health` | `{"status":"ok"}` |

`GET /schemas` is not decoration — it is how a reader whose schema name was
rejected finds out what the service actually accepts, and the `400` above points
at it.

### The `orders` schema

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

**The header must name exactly these columns — no missing ones and no extra
ones.** An extra column is rejected rather than ignored, because a column nobody
asked for usually means an upstream system changed and somebody should know.

---

## Contract 2 — `persistence`: `POST /batches`

**One sentence:** the JSON `converter` produced goes in, rows land in SQL Server,
and re-posting the same file does not duplicate them.

### Request

`application/json`. **The body is `converter`'s 200 response, forwarded
unchanged.** That is the whole integration: `watcher` never deserialises the
batch, never reshapes it, and never introduces a shared DTO library. It passes an
opaque string from one service to the other.

```
POST /batches
Content-Type: application/json
<the exact bytes converter returned>
```

`sourceFile` is the identity of a delivery — see the duplicate rule below.

### Response — `201 Created` (stored)

Captured verbatim:

```json
{"batchId":"019fc859-f5cc-76b9-bb71-cb09247ae891","sourceFile":"orders-contract-probe.csv","rowCount":3,"duplicate":false}
```

The `201` also carries a **relative** `Location` header. Captured from a separate
probe, headers and all:

```
HTTP/1.1 201 Created
Content-Type: application/json; charset=utf-8
Server: Kestrel
Location: /batches/019fc876-8aee-7880-8f3d-6314ffdcac5f
```

### Response — `200 OK` (already stored)

The **identical request**, sent a second time, captured verbatim:

```json
{"batchId":"019fc859-f5cc-76b9-bb71-cb09247ae891","sourceFile":"orders-contract-probe.csv","rowCount":3,"duplicate":true}
```

Three things a reader must take from this pair:

1. **`sourceFile` is unique.** A file is loaded once, ever.
2. **The second call returns the ORIGINAL `batchId`** — the same GUID, not a new
   one. That is what makes a retry safe.
3. **`201` vs `200` is the signal, and `duplicate` says the same thing in the
   body.** Both are success. `watcher` treats them as two different outcomes
   (`Stored` vs `AlreadyStored`) but archives the file either way.

This matters because `watcher` retries. A re-delivery is not an error case, it is
the *expected* case, and a contract that made it an error would make the pipeline
lose data on its first network hiccup.

### Response — `400 Bad Request`

Captured verbatim from a batch with a wrong schema name and a `rowCount` that
disagrees with the array:

```json
{"title":"The batch could not be stored.","sourceFile":"nope.csv","errors":[{"row":0,"field":"Schema","message":"This service stores the 'orders' schema; got 'invoices'."},{"row":0,"field":"RowCount","message":"rowCount says 2 but the batch carries 1 rows."}]}
```

- **`row` is the 1-based position in the `rows` array; `row: 0` means the problem
  is with the batch as a whole.** Note this is a *different* coordinate from
  `converter`'s `line`, which counts physical file lines. Two services, two
  honest coordinate systems — do not "harmonise" them.
- **`persistence` re-validates everything `converter` already validated.** It is
  reachable on its own, so it does not assume its caller was `converter`. A
  reader who thinks this is redundant has mistaken a service boundary for a
  function call.

> **A malformed body gets a `400` too — but its SHAPE is not part of this
> contract.** The structured envelope above is what a *well-formed* batch that
> fails validation gets. A body that is not valid JSON at all never reaches the
> handler; the web framework rejects it first, and what it returns is a framework
> artefact, not a service-defined response. On the answer key that happens to be
> `Content-Type: text/plain` carrying an ASP.NET exception dump — captured
> accidentally this session by a `curl` invocation that omitted the `@` and posted
> a filename instead of a file.
>
> **Contractual: the `400` status. Not contractual: the content type, the body,
> or anything in it.** An independently built `persistence` may return Problem
> Details, an empty body, or something else entirely and still conform. Session 2
> **must not** print that exception dump as expected output — a reader would
> either think their conforming service is broken, or copy the answer key and ship
> raw exception details to a caller.
>
> Worth one sentence in the tutorial, phrased as reassurance rather than as a
> specification: *if you send something that is not JSON at all you will get a
> `400` from the framework before your code runs, and it will look nothing like
> your own error format — that is normal.* `watcher` is unaffected either way:
> both are `4xx`, so both mean *the file's fault* and both produce `Rejected`.
> That is the decision table doing its job on a case nobody designed for, and it
> is the reason the status class — not the body — is what the contract pins.

### The supporting endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /batches/{id}` | read a stored batch back — this is how the end-to-end test proves the rows landed |
| `GET /health` | `{"status":"ok"}` |

`GET /batches/{id}` captured verbatim:

```json
{"id":"019fc859-f5cc-76b9-bb71-cb09247ae891","sourceFile":"orders-contract-probe.csv","schema":"orders","receivedAt":"2026-08-03T15:59:26.6674118+00:00","rowCount":3,"orders":[{"orderId":1001,"customerName":"Acme Tools","orderDate":"2026-01-15","amount":250.00,"expedited":true},{"orderId":1002,"customerName":"Beta Supplies","orderDate":"2026-01-16","amount":99.95,"expedited":false},{"orderId":1003,"customerName":"Gamma Ltd","orderDate":"2026-01-17","amount":1234.56,"expedited":null}]}
```

**Note the casing flip, and do not let a reader trip on it.** On the way *in*,
row keys are the CSV's `OrderId`. On the way *back out* of `GET /batches/{id}`,
they are `orderId` — because these are now the service's own stored columns, not
the file's. Different endpoint, different thing, different contract.

---

## The status-code split — the one rule `watcher` is built on

This is the load-bearing sentence of the whole tutorial:

> **`4xx` means the file is at fault. `5xx`, or no answer at all, means the
> service is at fault.**

Everything `watcher` does follows from it:

| What the other service said | Whose fault | Outcome | What happens to the file |
| --- | --- | --- | --- |
| `200` / `201` | — | `Stored` | moved to `archive\` |
| `200` with `duplicate: true` | — | `AlreadyStored` | moved to `archive\` |
| `4xx` | the file's | `Rejected` | moved to `failed\` |
| `5xx`, or the call did not connect | the service's | `Deferred` | **left exactly where it is** |

A bad file moves out of the way, because retrying it forever would block the
folder and fill the log. **An unavailable service leaves the file untouched,
because the next poll is the retry** — and moving it would lose it.

Getting these two backwards is the classic way to lose data in a file pipeline.
That is why each row has a test, and why the split lives in the *contract* rather
than in `watcher`'s code comments.

### All four rows were reproduced live

Not asserted — run, on 2026-08-03, against real services:

| Outcome | How it was forced | Captured result |
| --- | --- | --- |
| `Stored` | a valid CSV, both services up | `{"fileName":"orders-partd-2.csv","outcome":"Stored","detail":null,"batchId":"019fc85a-c637-7f68-867b-392aa204817a"}` |
| `Rejected` | `samples/orders-invalid.csv` → `converter` answered `400` | `outcome":"Rejected"`, and `detail` carried `converter`'s entire 400 body through verbatim |
| `Deferred` | **every `converter` killed**, then a valid CSV dropped | `{"fileName":"orders-partd-3.csv","outcome":"Deferred","detail":"No connection could be made because the target machine actively refused it. (localhost:5201)","batchId":null}` |
| `AlreadyStored` | an already-stored file re-delivered under the same name | `{"fileName":"orders-partd-2.csv","outcome":"AlreadyStored","detail":null,"batchId":"019fc85a-c637-7f68-867b-392aa204817a"}` — the **original** batch id |

**And the retry actually worked.** The file deferred above (`orders-partd-3.csv`)
was left sitting in `incoming\`. A converter was restarted and the next
`POST /run-now` stored it — same file, later tick, no human intervention:

```json
[{"fileName":"orders-partd-2.csv","outcome":"AlreadyStored","detail":null,"batchId":"019fc85a-c637-7f68-867b-392aa204817a"},
 {"fileName":"orders-partd-3.csv","outcome":"Stored","detail":null,"batchId":"019fc85b-4e57-783e-9b9b-83aaefea6a2b"}]
```

That transcript is the whole lesson in four lines, and Session 2 should use it.

### Phase A's motivation, stated correctly

In the answer key the table is covered by **12 tests running in 97 ms with no
database, no file server and no other module started**
(`CsvDeliveryProcessorTests`). Quote that as an observation, never as a target —
the reader's own decision-table suite will have a different number of tests and
is no less complete for it. **What must be true is that all four outcomes are
covered and that the suite needs nothing running.**

Session 2 must give Phase A **this** reason and never the stale one. In an
earlier model, the reader stubbed the other two services because their teammates
had not finished them yet. **In this model the reader builds all three
themselves, so by the time they reach `watcher` the other two already exist and
that motivation is simply false.** The surviving reason is better anyway:

> Your unit tests must not require other services to be running.

---

## Appendix — how these were captured

Reproducible; a later session that doubts a string above can re-run this.

```powershell
cd D:\Projects\dabbler-csv-pipeline
dotnet build

# terminal 1 / 2
dotnet run --project modules/converter/src/Dabbler.CsvPipeline.Converter     # :5101
dotnet run --project modules/persistence/src/Dabbler.CsvPipeline.Persistence # :5102

curl.exe -s -F "file=@samples/orders.csv;type=text/csv" -F "schema=orders" http://localhost:5101/convert
curl.exe -s -F "file=@samples/orders-invalid.csv;type=text/csv" -F "schema=orders" http://localhost:5101/convert
curl.exe -s -H "Content-Type: application/json" --data-binary "@batch.json" http://localhost:5102/batches
```

The decision-table rows were forced by starting and stopping `converter`
instances between `POST http://localhost:5103/run-now` calls, with the watcher's
folders redirected to a scratch directory via
`Watcher__Source__IncomingPath` / `__ArchivePath` / `__FailedPath`.

**Environment as run:** .NET SDK **10.0.201** (pinned by the solution's
`global.json`, `rollForward: latestFeature` — a machine also carrying an 11.x
preview still resolves 10.0.201 inside this repository), SQL Server LocalDB
`MSSQLLocalDB`, Windows 11. No container engine was running.

---

## What is NOT established here

Stated explicitly so Session 2 does not overclaim:

- **Cross-implementation conformance was not tested.** The Part D proof in
  [`s1-walk-outline.md`](s1-walk-outline.md) R6 replaced **both** services and
  confirmed the originals were unreachable — but both instances were **the same
  build**. That proves the *repoint mechanism*: configuration only, no code
  change. It does **not** prove that two independently written implementations
  honour this contract identically. Only two genuinely different implementations
  can show that, which is exactly why the tutorial's team model has every member
  build their own.
- **Nothing here is a per-implementation acceptance test.** Every count and
  timing in this document describes the answer key. A reader's conforming
  implementation will differ, and the contract is the behaviour above, not the
  numbers.
- **What is contractual, precisely.** The documented **success** envelopes *and*
  the documented **service-defined validation-error** envelopes — `converter`'s
  `{title, schema, sourceFile, errors[]}` with its `line`/`column`, and
  `persistence`'s `{title, sourceFile, errors[]}` with its `row`/`field` — are
  all part of the contract. **Framework-generated** responses are not: the
  content type and body returned for a body that is not valid JSON at all vary by
  framework, environment and settings (see the malformed-JSON note above).
  `watcher` itself depends only on the `4xx`/`5xx` status-class split, but it is
  not the only consumer — a human reading an error is the other one, and that is
  who the validation envelopes are for.
- **No contract test exists.** There is no executable conformance suite a reader
  could run against someone else's `converter` to check it honours this document.
  Recorded as a follow-on candidate in `disposition.json`, not built here.
