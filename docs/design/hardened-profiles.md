# The hardened profiles — designed, not built

*Session 108 of the modules block. What a customer who needs sibling
source hidden from a **machine**, rather than from a model, is asking
for; the two profiles that would answer it; what each costs an ordinary
.NET team; the trigger for building one; and the seams in this tree each
would attach to. Nothing here is built, and nothing here is promised. The
check on this page is that every path it names exists in this
repository, so the seams it points at are the seams that are there.*

## What the block built, and what it is for

The wall this block built is **the disk**. A module session opens a
focused clone that holds one module's source and its siblings as
packages (`packages/router/src/checkout.ts`, the cone derived from the
manifest and cut with a blob-filtered sparse checkout); the verifier's
reads outside that scope are refused and recorded
(`packages/router/src/agency.ts`); a session that needs a sibling's
source asks for a grant, and the exposure manifest records what was on
the disk, under which grant, and what changed outside the scope
(`packages/router/src/exposure.ts`); the close refuses when the manifest
shows bytes nobody signed for (`packages/router/src/land.ts`, the
`exposure_within_ceiling` gate).

That wall is built against a **model**: an engine driving a session, and
the verifier reading behind it, can only read what the clone holds. It
is not built against the machine the clone sits on. The full checkout
sits beside the clone on the same disk; the developer who opened the
clone can open the full checkout; a process on the machine with the
developer's rights can read either. The design consult that chose this
layout said so and chose it anyway (`docs/design/consults/round8-synthesis.md`):
for the customer the block was designed against, a .NET team with modules
and a trunk, the thing to keep from the model was sibling source, and the
disk does that at the cost of a sparse clone.

## What the hardened customer is asking for

A different customer asks a different question. Their requirement reads
like one of these:

- *A contractor's machine must never hold the source of modules the
  contractor is not engaged on, at rest or in memory, whether or not an
  AI is involved.*
- *An audit must be able to show, for a given machine on a given day,
  exactly which module sources could have been read from it.*
- *A session's working set must be destroyed, not deleted, when the
  session ends.*

None of these is about a model. Each is about the machine, the person at
it, and what an auditor can later prove about both. The disk wall
answers none of them, because the full checkout is on the disk, and a
sparse clone is a convenience the developer can widen with one git
command. Telling such a customer that the framework "hides sibling
source" would be a claim the framework cannot keep.

What they are asking for is **custody**: sibling source that is not on
the machine in readable form except while a session is granted it, and a
record of every time it was.

## The two profiles

### Profile 1 — encrypted custody

Sibling source is committed **encrypted at rest**, under a key the
machine does not hold. A focused clone decrypts nothing; a grant
decrypts the granted sibling into the clone and only there, and the
revoke destroys the plaintext. The encryption is authenticated (AES-GCM
or XChaCha20-Poly1305 over each object, a per-object nonce, the module
slug and the object path bound as associated data), keyed from an
external key service (a cloud KMS, an HSM, or a key held by the
customer's own service) that issues a per-grant data key and logs the
issue. It is **never a one-time pad**: a pad is only ever as secret as
its distribution, is unauthenticated, and is broken outright by the
second use of any byte of it; the round-8 consult rejected the
pad-shaped variant for that reason, and this page keeps the rejection.

What it would mean in this tree:

- The clone's cone stays as it is. Encrypted objects are ordinary
  committed files under the sibling's roots, so the sparse checkout
  excludes them the same way, and a widened cone brings ciphertext.
- The grant (`applyGrant` in `packages/router/src/exposure.ts`) gains a
  step between widening the cone and laying the debugging overlay: ask
  the key service for the grant's data key, naming the session, the
  sibling and the decision that answered it, and decrypt into the
  working tree. The key service's log is the audit; the exposure
  manifest records the grant beside it as it does today.
- The revoke (`revokeGrant`, same file) overwrites the plaintext before
  it narrows the cone, and the ecosystem seam's Maven side, which
  rebuilds a granted sibling into the file repository, does the same for
  the build output it made.
- The land refuses a plaintext sibling file the way it refuses a moved
  tree today: the correspondence record's source digest is the digest of
  the plaintext, taken inside the grant, and a plaintext file outside a
  grant is a path outside the scope.
- The full checkout is the developer's problem and the customer's rule:
  under this profile the developer never has one, only focused clones.
  `prepareModuleStart` in `packages/router/src/session.ts`, which today
  opens the clone from a full checkout, would open it from a bare
  mirror instead.

### Profile 2 — a container per session

The clone is made **inside a container** that holds nothing else: no
full checkout, no other module's clone, no credentials but the session's
own, torn down at the close. The packages a session consumes are copied
in; the packages and the landed commit are the only things that come
out. The machine holds an image and a record, never a working tree.

What it would mean in this tree:

- `openModule` in `packages/router/src/checkout.ts` runs its clone
  inside the container rather than beside the full checkout; the clone
  marker it writes (`checkout.json` under the clone's `.dabbler` folder)
  gains the container's identity, so a `session start --module` inside
  it registers there and a `next` outside it is refused as it is today
  for the full checkout.
- The convenience file the ecosystem seam writes
  (`convenienceFile` in `packages/router/src/ecosystem.ts`) is what the
  developer's editor attaches to; the editor runs on the host and reads
  through the container boundary, which is the one place plaintext
  crosses it, and the one place an audit has to look.
- The land pushes from inside the container, and the close tears the
  container down; the run of record's evidence and the exposure
  manifest are written to the session's run directory on the host
  before the teardown, because the record outlives the session.
- Grants widen the cone inside the container; nothing about the grant
  mechanism changes, because the container is the machine as far as the
  framework can see.

The two compose: encrypted custody inside a per-session container is the
profile for the customer whose requirement covers both the disk and the
memory.

## What each costs an ordinary .NET team

The block's customer is a team of a few developers, three to five
sessions a day, on Windows with Visual Studio and `dotnet`. Against that
team:

**Encrypted custody**

- *Key custody.* Someone owns the key service, its access policy and its
  log; a lost key is a lost module. This is a role the team does not
  have today.
- *Build time.* A grant decrypts a sibling's tree before the build can
  see it; a large sibling is minutes, every grant.
- *Tooling that stops working.* Git sees ciphertext: `git diff`, `git
  blame`, the editor's history views and every code-search tool read
  nothing across the seam. Source Link, already off under
  `DABBLER_DRIVEN`, is off for good. GitHub and Azure DevOps code review
  of a sibling's change is review of ciphertext unless the reviewer's
  machine is granted too.
- *Debugging that stops being possible.* A debugging grant works, but a
  stack trace into an ungranted sibling shows no source; the developer
  cannot step into what they cannot read, which is the point and also
  the cost.

**A container per session**

- *Environment.* Docker or Podman on every developer machine, an image
  with the .NET SDK and the customer's build tooling maintained by
  someone, and a per-session startup of tens of seconds to minutes.
- *The editor.* Visual Studio does not attach to a container the way VS
  Code does; the team either moves to VS Code with Dev Containers or
  works through a remote editor, and either is a change to how every
  developer works every day.
- *Windows-only build steps.* A build that needs the Windows desktop
  SDK or a signing tool that lives on the host does not run in a Linux
  container; a Windows container is possible and slower.
- *Debugging that changes.* Debugging is inside the container; a
  process on the host cannot be attached to from it.

Both profiles roughly double the framework's per-session overhead for a
team that today pays a sparse clone. The block's own preflight measured
that clone on this machine (`docs/design/module-checkout-preflight.md`)
and the proof of concept that chose it (`docs/design/module-checkout-poc.md`)
found the disk wall sufficient for the customer in hand.

## The trigger, and until then

**A profile is built when a named customer puts the requirement in
writing**: which of the three questions above they are asking, which
profile answers it, and who on their side owns the key service or the
image. Until then nothing is built, because each profile is a standing
cost on every session of every team that does not need it, and because a
profile built against an imagined requirement is the framework's own
guess about what a customer will accept, which is the kind of guess the
ecosystem seam was made to refuse.

Until then the framework says what it does: the wall is the disk, the
grants and the manifest are the record, and the close refuses what
nobody signed for. A customer who reads that and asks for more is the
trigger.

## The seams, by path

| what a profile attaches to | where it is |
| --- | --- |
| the focused clone and its marker | `openModule` in `packages/router/src/checkout.ts` |
| opening the clone from a full checkout | `prepareModuleStart` in `packages/router/src/session.ts` |
| the verifier's scope and the refused reads | `moduleScope` in `packages/router/src/agency.ts` |
| the grant, the revoke and the exposure manifest | `applyGrant`, `revokeGrant` in `packages/router/src/exposure.ts` |
| the ecosystem seam's convenience file and debugging grant | `convenienceFile`, `layDebugGrants` in `packages/router/src/ecosystem.ts` |
| the land's refusal and the exposure gate | `judgeLandReadiness`, `judgeExposure` in `packages/router/src/land.ts` |

Each is a function that exists today and is named here so a profile is
designed against the tree rather than beside it.
