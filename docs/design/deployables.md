# Deployables: what a solution ships, and when it is declared

*The design, not the implementation. It answers one question — when a
developer wants to package a solution into one or more deployable
artefacts, what do they declare, and when — by naming what the manifest
already does, the three things it cannot yet say, the block that would
say them, and the four rules the block would hold to. Nothing here is
built: `deployables:` is not a key the manifest reader accepts, and this
page does not ask it to become one. It is the record a later session
builds against.*

## What exists today, and it is less than it looks

A module declares `kind: application` — one of the three kinds the
manifest reader knows (`KINDS` in `packages/router/src/modules.ts`,
alongside `shared-types` and `library`) — and a releasable session
writes a bundle record naming every package that application ships,
each at the version the central pin holds and with the source digest
its own correspondence record carries (`bundleRecord` and
`writeBundleRecord` in `packages/router/src/land.ts`). `dabbler module
pack` produces the packages the bundle names
(`packModule` in `packages/router/src/packages.ts`).

That is a genuine provenance record. Given a deployed thing, you can
name the exact source that produced every package inside it, because
the digest chain runs unbroken from the bundle back through the pin to
the correspondence record `dabbler module pack` wrote when the package
was built. Nothing proposed here replaces that chain; the gaps below are
about what a bundle is allowed to describe, not about whether it can be
trusted.

## What is missing

Three things, and each is a fact the manifest has no word for today.

**Shape and destination are unsaid.** `packaging.pack` and
`packaging.push` (`packages/router/src/packaging.ts`) are argv for
producing and pushing *a package* — a NuGet or Maven artefact, restored
by a sibling module. Nothing in the manifest says that this deployable
is a container image bound for a registry while that one is an archive
copied to a share. A bundle today names packages; it is silent on the
one fact a release engineer actually needs, which is what kind of thing
comes out the other end and where it goes.

**Deployables cannot be planned before the modules exist.** A bundle is
computed from a module that already has `kind: application` and a
project file `dabbler module pack` can build. There is no way to write
down "this solution will ship a REST service and a command-line tool"
during decomposition, while the modules that will feed them are still
being argued over, the way `depends_on` can be declared before a
sibling's source exists. A deployable is not planned; it is discovered,
after the fact, by a module having the right `kind`.

**One application module is exactly one deployable.** `bundleRecord`
refuses a module whose `kind` is not `application`, and the record it
returns is keyed by that module's own slug — a bundle *is* an
application module, one to one, by construction. A REST service and a
command-line tool built from the same code therefore force two
application modules, which cuts the code by how it ships rather than by
who owns it. Ownership and shipping are different questions, and the
manifest currently answers both with the same field.

## The proposal

A `deployables:` block, declared during decomposition and allowed to be
incomplete:

```yaml
deployables:
  - slug: api
    title: Ingest REST service
    kind: service          # service | job | cli
    from: [app]            # the application modules it ships; may be empty
    runtime: container     # container | archive | installer
    publish: acr           # names a target; never holds a credential
```

A deployable is a named thing a solution ships, separate from the
modules that own the code inside it. `kind` says what shape it runs in
once shipped — a service, a scheduled job, a command-line tool — which
is a different axis from a module's `kind: application`, which says
only that the module has an entry point at all. `runtime` says what the
artefact physically is; `publish` names where it goes, the way
`packaging.push` names a feed today.

## The four rules

Each follows a principle the manifest already holds elsewhere; none of
the four is new to this framework, only to this block.

1. **`from` is the only direction written by hand.** Which deployables a
   module ends up feeding is derived, never declared on the module —
   exactly as `usedBy` is computed from `dependsOn` and never accepted
   as a key of its own (`packages/router/src/modules.ts`, the manifest
   reader's unknown-key refusal, and `consumersOf` behind `dabbler
   modules show`). Two directions kept by hand agree on the day they are
   written and disagree the day one of them is edited alone; deriving
   one from the other makes that disagreement impossible rather than
   catching it later.

2. **`from: []` is legal.** A deployable can be named while the shape of
   the solution is still being decided, with no application module
   feeding it yet. That is the delayed planning decomposition already
   needs for everything else a solution declares before the code behind
   it exists — a dependency can be named before the sibling that
   satisfies it is written, and a deployable can be named before the
   module that ships it is. The impact plan says plainly that no module
   ships this deployable yet, which is a true statement about the
   solution's current shape, not an error in it.

3. **The credential is named, never held.** `publish: acr` names a
   target the way `packaging.push.secret` names a credential
   (`packages/router/src/packaging.ts`): a string the deploying tool
   resolves against its own configuration, never a value this
   framework reads, stores, or places in an environment. A deployable
   declaration is a fact about the solution's shape; the credential
   that pushes to it is a fact about the machine doing the pushing, and
   the two must never live in the same file for the same reason
   `packaging.push` already keeps them apart.

4. **The bundle record becomes per deployable, not per application
   module.** This generalises what exists rather than replacing it.
   Today `bundleRecord` is keyed by an application module's slug because
   an application module *is* the only thing a bundle can name; once a
   deployable can name zero, one, or several application modules
   through `from`, the bundle is keyed by the deployable's slug instead,
   and its dependency list is the union of what every module in `from`
   ships. A solution with exactly one application module and no
   `deployables:` block declared reduces to exactly today's bundle —
   one deployable, implied by the one application module, named after
   it — so a solution that ships what it already ships today is asked
   to declare nothing new.

## What this is not

It is not build orchestration and not artefact hosting.
`docs/solution-decomposition-direction.md` already rules both out as
non-goals of the whole manifest, and a `deployables:` block does not
reopen either question: it does not decide build order, it does not
propagate a version bump across modules, and it does not stand up a
package feed or a container registry of its own. A deployable
declaration says what ships and where it goes; producing it and pushing
it stay exactly where they are today, in the argv a repository already
writes for `packaging.pack` and `packaging.push`, and in the tools NuGet,
Maven and a container registry already are.

## Not built here

The manifest reader refuses an unknown key on load, which is the same
rule that keeps a misspelled `codeRoot` from being silently ignored
rather than caught. `deployables:` is an unknown key until a session
teaches the reader to accept it, writes the deriver that computes which
modules feed which deployable, and moves the bundle writer from a
per-module to a per-deployable key. None of that happens on this page.
What is here is the shape of the block, the reasoning behind each of its
four rules, and the gaps in today's manifest that make the case for
building it — the record a later session builds against, rather than a
preview of behaviour that runs today.
