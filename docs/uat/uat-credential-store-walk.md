# The credential store, walked

**Session 159, 2026-09-12.** The store an operator uses to keep a provider
key on their machine instead of exporting it into every shell, driven end to
end before it shipped: the three verbs in a real terminal against the real
Windows store, and the pane's rows in a running editor.

It is the same argument as `docs/uat/uat-configuration-pane-walk.md`, which
found five defects in code that had already closed VERIFIED. This walk found
three, one of them in code written the same morning.

## What was walked

- `dabbler auth set`, `list` and `remove` on this host, against the real
  DPAPI store, with a key given on stdin and with a key taken from the
  environment.
- The resolution order — the environment, then this checkout's reference,
  then this person's default — through `dabbler configuration explain` and
  `dabbler configuration options`, which are the two verbs an operator has.
- The per-provider rows in a running VS Code, by
  `tools/dabbler-ai-orchestration/src/test/playwright/credential-rows.spec.ts`,
  which launches the same Code binary an operator runs, loads this extension
  into it, and clicks.
- What is left on disk afterwards, and whether any of it holds a key.

## What was NOT walked, and why

- **macOS and Linux.** This project has one machine and it runs Windows.
  `security` and `secret-tool` ship on their code and on their refusals, and
  the release notes say so rather than leaving it to be found.
- **A live vendor call on a stored key.** Reaching a vendor here means
  `dabbler discovery refresh`, which rewrites the model catalog — and a
  session that re-reads the pool its own review is drawn from has edited the
  conditions of that review. What is proved instead is that a stored key
  reaches the last function before the socket: with the environment variable
  gone, `configuration options` offers that vendor's models, and it offers
  them only when `providerSecret` returns a key.
- **The terminal's contents, from the editor.** An xterm renders to a canvas
  and Playwright cannot read a word of it, so the pane reading asserts that
  a terminal appears and that nothing in the window asks for a value. WHICH
  verb that terminal runs is asserted in the unit suite, where the argv is
  readable.

## This machine

Windows 11 Pro 10.0.26200 · Node 25.8.1 · VS Code 1.137.0 (the harness's own
install) · router 2.3.0 as built from this tree · PowerShell 7.6.5 and
Windows PowerShell 5.1.26100.9168.

## The readings

**1. A machine that has stored nothing says so, and names the store.**
`dabbler auth list` → *"this machine holds no credentials. The store is a
DPAPI-encrypted file this application owns (not Windows Credential
Manager)."* The parenthesis is the point: it is the sentence that stops a
reader believing their key is in the Windows control panel.

**2. A key on stdin is stored, and the answer says what to do next.**
`dabbler auth set openai --name walk-159-typed` with the key piped in →
stored, and the second line prints the `configure --credential` command that
names it. Storing and using are two acts, and the first one says so.

**3. The listing carries a name, a provider and a date, and nothing else.**
Not a prefix and not a length: six characters of an API key identify the
account it belongs to.

**4. The file on disk holds ciphertext and no plaintext.** The index gained a
`sealed` blob of 492 characters; `grep` for the key in it returns nothing.

**5. A key already in the environment is taken rather than retyped.**
`dabbler auth set openai --name walk-159 --from-env` → stored, with nothing
prompted for. On a machine that has been working, the key is already in a
variable this process can read, and making somebody dig it back out is how a
convenience becomes a reason not to bother.

**6. The environment outranks a reference, and the reading says so.** With
`DABBLER_OPENAI_API_KEY` set and `dabbler.credentials.openai` naming
`walk-159`, `configuration explain` reads: *"openai key:
DABBLER_OPENAI_API_KEY in this environment (it outranks the credential
'walk-159', which stays named)."* Nobody running on environment variables
today has to do anything, and the reading tells them that in one line.

**7. With the variable gone, the stored key is what resolves.**
`configuration explain` → *"the credential 'walk-159' (decided by
.vscode\settings.json (`dabbler.credentials.openai`)) — this machine holds
it"*, and `configuration options` offers that vendor's models again, which it
can only do if the DPAPI round trip returned the key.

**8. A reference naming nothing is named as a stop, not a fallback.**
`configure --credential openai=not-on-this-machine` writes the setting and
says in the same breath that this machine holds no such credential and what
to run. `configuration explain` then reads *"THIS MACHINE DOES NOT HOLD
IT"*. It does not quietly fall back to the environment, because which key
answers decides which account is billed.

**9. The operator's own text survives the write.** The committed settings
file in this repository carries a five-line comment above `dabbler.transport`.
Writing a credential reference into it and clearing the reference again left
the file byte-identical to `HEAD`.

**10. Removing a credential is a removal.** Both names removed, the index
file deleted with the last of them, and a second removal answers *"this
machine holds no credential called 'walk-159'"* at exit 1 rather than
pretending.

**11. The pane draws one row per provider and none of them carries a value.**
Three rows — *Anthropic key*, *Google key*, *OpenAI key* — each saying what
is in force: the variable where one is set, the credential's name where the
setting names one, and *"not on this machine"* where it names one that is
not here. Nothing in any row is the value, a prefix of it, or its length.

**12. Clicking a key row opens a terminal and asks nothing in the window.**
No modal, no input box. What a person types into an input box lives in the
editor's own buffers and its undo history, and none of that is somewhere
this framework can reach in to clear.

**13. Right-clicking offers the one thing to do about it** — *Store a Key on
This Machine* — so the row is not a control that has to be discovered by
guessing.

## What the walk found

**A. A credential setting was invisible in a checkout that is not a git
repository.** Reading 11, first attempt: the pane drew *OpenAI key* as
*"nothing resolves"* over a `.vscode/settings.json` it was rendering the
vehicle from two rows above. `loadConfig` stamped each provider with its
reference using `projectRoot(projectDir)` — the GIT TOPLEVEL — which answers
null outside a repository, and the walk's workspace is a temp directory.
Reading a settings file has nothing to do with whether git knows about the
directory it is in. Fixed here: the checkout the caller named is the checkout
that is read.

**B. A modal confirmation in front of a terminal that asks anyway.** The row
opened a modal first — and the modal blocked the window it was drawn over,
which is how the reading found it. Both halves point the same way: every
other control in this section confirms because it WRITES something the
moment it is answered, and this one writes nothing until a person types into
the terminal it opens. Closing that terminal is the no. Fixed here by
deleting the confirmation.

**C. A provider whose key does not resolve dropped out of the model list
with nothing saying so.** With a dangling reference, every one of that
vendor's models vanished from both reviewing lists and only the *Provider
keys* section at the bottom explained it — which is the same defect the
vehicle rows carry `withheld` for, and the one this project has already paid
for twice. Fixed here: the list names the provider it is not offering and
why, in the stop's own words.

## Raised, not fixed here

**A run log from session 60 holds all three provider keys in plaintext.**
`.dabbler/runs/s60/driver/engine-07.log`, written 2026-08-31, contains a
block headed `== keys present` that prints each variable's VALUE rather than
whether it is set. The exposure is bounded and was measured rather than
assumed:

- It is one file. Every other file under `.dabbler/` was scanned and none
  holds a key.
- It is not committed and never has been: `.dabbler/` is gitignored whole,
  and searching the entire history for each of the three key literals
  returns no commit.
- The code that wrote it is gone. Nothing in `packages/` or `tools/` prints
  that block today, and no run after session 60 produced one.

What it is, then, is a plaintext credential sitting in the working tree of a
repository that AI engines are given read access to. It is not session 159's
to delete — the machine owns that record, and deleting a session's log to
tidy up a finding is the wrong instinct — so it is put to the operator with
two things they can do: remove or redact that one file, and rotate the keys,
which is the only action that makes the exposure stop mattering. Reproduced
by searching `.dabbler/` for the value of each `DABBLER_*_API_KEY`.
