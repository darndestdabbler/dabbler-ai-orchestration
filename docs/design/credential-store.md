# The credential store: what is stored, and where

**Decided 2026-09-12, session 159.** This page exists because the mechanism
is easy to describe wrongly, and a reader who is wrong about it is wrong
about who can read an API key. Everything below that says *measured* was run
on the operator's machine on 2026-09-12 and the reading is quoted; everything
that says *documented* is the mechanism's own definition and was not measured
here, because it cannot be measured from one account on one machine.

## What it is on Windows

An API key is encrypted with **DPAPI** and written into **a file this
application owns**, in the same per-user data directory as the model catalog
and the preferences: `%LOCALAPPDATA%\dabbler\` on Windows, which is the
directory `catalogDir` in `packages/router/src/catalog.ts` returns, holding
`ai-model-catalog.json` and `preferences.json` today and credentials.json
from this session.

The encryption and decryption are PowerShell's `ConvertFrom-SecureString` and
`ConvertTo-SecureString`, called with no `-Key`, which is the form that uses
DPAPI. There is no native dependency and nothing to install: the host is
already on every Windows machine.

**This is NOT Windows Credential Manager.** It looks similar from the
outside — a secret goes in, a secret comes out, and the operating system
holds the key — and it is not the same thing. The difference a reader must
not get wrong:

- A credential in Credential Manager appears in the Windows control panel,
  under *Credential Manager → Windows Credentials*. One of these does not.
  Nothing outside this framework will list it, audit it, or offer to remove
  it.
- Credential Manager entries are managed by the operating system's own
  lifecycle. This file is managed by `dabbler auth remove` and by deleting
  it.
- The *protection* is the same primitive underneath — both are ultimately
  user-scoped DPAPI — so the security claim below is about DPAPI and holds
  for either. The visibility claim is not the same, and that is the whole of
  what was traded away.

### What protects it

**Documented, not measured here.** DPAPI with no additional entropy and no
machine-scope flag encrypts under the **current user's** master key. The
consequences that matter to an operator:

- Another account on this machine cannot decrypt it, and neither can an
  administrator without taking over the account.
- The same file copied to another machine cannot be decrypted there. It is
  therefore **not a backup and not portable**: a reinstall, a new profile, or
  a rebuilt machine means storing the keys again. That is a feature of the
  choice and not an oversight.
- A process already running as this user can decrypt it. This store protects
  a key at rest from other people on the machine; it does not protect it from
  anything this account is running, and nothing available on a developer
  workstation does.

### What was measured

Run on the operator's machine, 2026-09-12, on Windows 11 Pro 10.0.26200:

| reading | result |
| --- | --- |
| round trip, PowerShell 7.6.5 | plaintext recovered exactly; blob 492 characters |
| round trip, Windows PowerShell 5.1.26100.9168 | identical, same 492 characters |
| cost of one spawned round trip, `powershell.exe` | 307 ms, 287 ms, 315 ms |
| cost of one spawned round trip, `pwsh` | 379 ms, 378 ms, 383 ms |

Two findings came out of that measurement and both are constraints on the
implementation rather than notes:

1. **`powershell.exe` must not inherit this machine's `PSModulePath`.** With
   the environment as a session inherits it — PowerShell 7's module
   directories ahead of 5.1's — Windows PowerShell 5.1 fails to load
   `Microsoft.PowerShell.Security` at all, with
   `CouldNotAutoloadMatchingModule`, and `ConvertFrom-SecureString` is simply
   not a command. Every reading above under 5.1 required `PSModulePath` to be
   set to the system module directory for the spawn. A helper that inherited
   the operator's environment would work on a machine with no PowerShell 7
   and fail on one that has it, which is the worse of the two failure
   shapes.
2. **The store is decrypted once per process, not once per read.** Three
   hundred milliseconds is nothing for one `auth set`, and
   `providerReachable` is called in loops over every provider and every
   candidate model. One spawn reads the whole file, and the plaintext lives
   in memory for that process only.

## The alternative that was declined

Real Windows Credential Manager was offered and the operator declined it on
2026-09-12. Its cost is not the writing but the reading: `cmdkey /list` shows
entries and never returns a password, so retrieval needs `CredRead` and
`CredWrite` P/Invoked through an embedded C# type compiled by `Add-Type`
inside a spawned `powershell.exe`, on every read, with no native npm
dependency but with a real failure surface — `Add-Type` needs a compiler
host, and a locked-down machine is exactly where it stops working. What that
buys is one thing: the credential appears in a control panel. Against the
standing rule to prefer the simpler and more reliable option for this
repository, it did not buy enough.

## The other platforms

- **macOS**: the `security` command, which is the system keychain and is
  present on every macOS install. A credential stored this way *is* in
  Keychain Access and is visible there.
- **Linux**: `secret-tool`, which is the Secret Service API and is what a
  desktop session's keyring answers. It is not installed everywhere.
- **Anywhere with none of them**: there is **no store**, and `dabbler auth
  set` refuses and names the provider's environment variable
  (`DABBLER_ANTHROPIC_API_KEY`, `DABBLER_OPENAI_API_KEY`,
  `DABBLER_GEMINI_API_KEY`) as the way to supply a key. It does not write a
  plain file. A store that silently degrades to plaintext is worse than no
  store, because the operator believes something is protecting them.

Neither the macOS nor the Linux path was measured: this project has one
machine and it runs Windows. They ship on their code and on their refusals,
and the release notes say so rather than leaving it to be found.

## What is in the settings, and what is in the store

The store holds values. **Nothing else ever does.** A checkout's
`.vscode/settings.json` holds a *reference* — a name — under
`dabbler.credentials.<provider>`, and the user-level `preferences.json` holds
this person's own default reference. Both are names of credentials, both are
safe in a commit, and a value found where a name belongs is refused rather
than stored.

Resolution, in order: the **process environment** named by the provider's
`api_key_env`, then the **solution's reference**, then **this person's
default**. The environment is first because that is how CI injects a key and
because a precedence that can be explained is the only kind worth having. A
reference naming a credential this machine does not hold is a **stop** that
names the layer that chose it and the command that repairs it — never a fall
through to the next layer, because falling through would change which key is
billed without saying so.

## Tests, and where they run

The credential store's own test file, under `packages/router/test`, runs in
the container with the rest of the suite. **Two tests in it skip there**, and
say so: the round trip through a real store, and the one that asserts a real
stored value is absent from every rendering — both need a store, and the
image has neither PowerShell nor `secret-tool`. Everything else — what a listing carries, what
a refusal says, whether a removal is a removal, and the resolution order — is
arranged from a seeded index and is not a platform fact, and one of those
tests is *a platform with no store refuses*, which is exactly what the
container is. CI on `windows-latest` runs the round trip;
`docs/design/suite-runners.md` carries the same list.
