# The operator onboarding deck

`dabbler-onboarding.pptx` introduces the framework to someone who has
never seen it: what the extension is, why it is in the room, how to set a
project up on a Copilot seat or on your own Claude Code / Codex, what the
two Explorers say, what driving a session looks like, and what happens
when the framework stops.

**The deck is built, not edited.** Change the slides in
`build-deck.mjs` — its exported `SLIDES` array is the one statement of
what the deck contains, in order — and rebuild. A `.pptx` edited by hand
is a `.pptx` nobody can diff, and the next screen change starts from
scratch.

## Rebuilding it

Screens first, but only when a screen has actually changed:

```
node docs/onboarding/capture-screens.mjs
node docs/onboarding/capture-walk.mjs
```

`capture-screens.mjs` photographs the two Explorers — this repository's
own Work Explorer, and the Solution Explorer over the four-repository CSV
solution it declares in a temporary workspace. `capture-walk.mjs` walks a
driven session on a scratch repository under `C:\temp` and photographs the
two terminals and a framework stop; it needs that repository staged, and
it says how in its own error message. Run the walk from PowerShell, not
Git Bash — see `walk-notes.md` for why, and for what the walk found.

Then the deck itself:

```
node docs/onboarding/build-deck.mjs
node docs/onboarding/verify-deck.mjs
```

`verify-deck.mjs` is the deck's test. It opens the built file and checks
that it has exactly the slides the manifest declares, that every
screenshot named in the manifest is really embedded (compared by content,
because the images are renamed on the way in), that no slide names a
decision by its id without saying what it is, and that every command on a
slide can be copied and run. `--min-slides <n>` adds an independent floor,
so the manifest cannot quietly shrink.

## What is here

| File | What it is |
| --- | --- |
| `dabbler-onboarding.pptx` | the deck, committed |
| `build-deck.mjs` | the slide manifest and the renderer |
| `verify-deck.mjs` | the deck's one test |
| `capture-screens.mjs` | the two Explorer screenshots |
| `capture-walk.mjs` | the two terminal screenshots |
| `walk-notes.md` | what the walk ran, saw and concluded |
| `media/` | the screenshots the slides embed |
