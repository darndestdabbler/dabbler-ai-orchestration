# Walking the Mechanic: a stop it clears, one it hands back, funds, a cancel

For the operator, before 3.23.0 is published. It walks what sessions 272 to
277 put in front of a person: the unattended Mechanic clearing a stop with
nobody there, the Mechanic handing a stop back with a memo, the wait for
funds and its Continue Session, and a cancel whose transcript page says so.
It runs on the Java sample from `uat-java-json-solution.md` (`C:\temp\uat-java`),
which needs a JDK and Maven and nothing else.

## What you need

- The local VSIX, packed from the trunk after session 278 closed, installed
  with `--force`, and every VS Code window reloaded. From this repository:

  ```
  npm --prefix tools/dabbler-ai-orchestration run package
  code --install-extension tools/dabbler-ai-orchestration/dabbler-ai-orchestration-3.22.1.vsix --force
  ```

- `C:\temp\uat-java` built to the end of its own walk, with no session in
  flight: in a terminal there, `dabbler status` names no session in progress.

- Two sessions planned in its `docs/sessions/session-plan.md`. Ask the AI to
  add them with Consult with AI, or add them yourself:

  ```
  ### Session 4 of 5: Item names are trimmed
  Scope: modules/store. ItemStore.add trims the name before storing it.
  Tests: one, in ItemStoreTest.

  ### Session 5 of 5: Item names are upper-cased
  Scope: modules/store. ItemStore.add upper-cases the name before storing it.
  Tests: one, in ItemStoreTest.
  ```

## Check 1 -- the Configuration rows

**You --** open the Solution Explorer, expand **Configuration**, then
**Authoring AI**.

Expect, in this order: **Vehicle**, **Authoring Model**, **Mechanic Model**
reading `same as Authoring Model`, **Mechanic** reading `unattended`.

**You --** click **Mechanic**, pick `attended`; click it again and pick
`unattended`. Then, in a terminal:

```
git -C C:\temp\uat-java log -2 --format=%s
type C:\temp\uat-java\.vscode\settings.json
```

Expect: `"dabbler.mechanic": "unattended"` in the settings file, and the
choice committed as every Configuration choice is.

## Check 2 -- a stop the unattended Mechanic clears, with no person

**You --** plant a defect the session will meet in its run of record but
will not be asked to touch. In `modules/store/src/test/java/com/example/store/ItemStoreTest.java`,
add this test inside the class, then commit it:

```java
    @org.junit.jupiter.api.Test
    void arithmeticStillWorks() {
        org.junit.jupiter.api.Assertions.assertEquals(3, 1 + 1);
    }
```

```
git -C C:\temp\uat-java commit -am "A test with a typo in its expectation"
```

**You --** right-click session 4 in the Work Explorer, **Start Session**,
and leave it alone.

Expect: the run of record fails on `arithmeticStillWorks`; the Dabbler
terminal says the framework is calling in the Mechanic; a Mechanic engine
runs on its own, corrects the expectation to `2`, and the session carries
on and closes with no click from you. Nothing asks you anything. The
session's transcript page, `docs/transcripts/session-004.html`, shows the
stop and that the Mechanic cleared it.

## Check 3 -- a stop it hands back, with a memo

**You --** plant a defect that needs a decision rather than a fix: a test
that contradicts session 5's own plan. In `ItemStoreTest.java` add, and
commit:

```java
    @org.junit.jupiter.api.Test
    void namesKeepTheirCase() {
        var store = new ItemStore();
        store.add("abc");
        org.junit.jupiter.api.Assertions.assertEquals("abc", store.all().get(0).name());
    }
```

```
git -C C:\temp\uat-java commit -am "A test that says names keep their case"
```

Adjust the two calls to the sample's own `ItemStore` methods if they are
named differently.

**You --** **Start Session** on session 5, and leave it alone.

Expect: the run of record fails on `namesKeepTheirCase`; the Mechanic is
called in, edits nothing, and hands the stop back. The session row in the
Work Explorer says it is waiting on you, and its tooltip ends with
**The Mechanic's memo**: the cause (the new test contradicts session 5's
scope), its evidence, and what you must decide.

**You --** right-click session 5, **Open a Mechanic**.

Expect: a model pick titled `Open a Mechanic — model for <engine>` with the
Mechanic Model first, and, once picked, a NEW terminal named
`Mechanic — <engine> — uat-java` whose first instruction is
`dabbler consult --sessions-dir docs/sessions --mechanic`. The author's
terminal is untouched. Close the Mechanic's terminal without acting on it.

## Check 4 -- a cancel whose page says cancelled

**You --** right-click session 5, **Cancel Session**, and give the reason
`the test contradicts the plan`.

Expect: the session reads cancelled in the Work Explorer, and
`docs/transcripts/session-005.html` is committed and says, at the top, that
the session was cancelled, with your reason.

**You --** remove the planted test so the next session starts clean:

```
git -C C:\temp\uat-java revert --no-edit HEAD
```

## Check 5 -- a funds pause resumed by Continue Session

**You --** make the Primary Reviewer an API account with no balance (the
OpenAI key on this machine is out of credits): click **Reviewing AI →
Vehicle**, pick `api`, and set **Primary Model** to an OpenAI model. Plan a
small session 6 as in *What you need*, and **Start Session** on it.

Expect: at the first verification round the session pauses rather than
failing. The session row reads `Waiting for funds: openai`, the Dabbler
terminal says the same, and no Mechanic is called in -- a wait for funds is
yours, because nothing in the tree can pay for it.

**You --** add credit to that account (or point `DABBLER_OPENAI_API_KEY` at a
funded key and reload the window), then right-click the session,
**Continue Session**.

Expect: the round is made again with the same reviewer, nothing already
done is redone, and the session goes on to its close.

## Afterwards

Put **Mechanic** back to what you had, and **Primary Model** back to your
usual reviewer.
