---
description: Write comments only for what the code cannot say itself
alwaysApply: true
---

# Comments

A comment earns its place by explaining something a reader can't get from the code: why it is done this way, a constraint from outside (a PostgreSQL rule, a Tauri quirk, a race), an invariant, or what an empty or absent value means. Everything else is noise that drifts out of date.

## Don't write

- Comments that restate the name or the next line: `/** Stages the drop in Pending Changes. */` on `onStage`, `// Expression key.` above `CREATE INDEX … (lower(email))`, `/** The SQL a plan runs, as one script. */` on `planScript`.
- Doc comments on every field or prop by habit. Document a field only when its meaning or units aren't obvious from its name and type.
- Labels for each statement in SQL seeds or fixtures. Section headers are fine; say why an object exists only when it isn't evident (e.g. "used by the view below, so DROP is refused").
- Narration of the change ("added for X", "new:", "fixed bug where…"), TODOs without an owner and a reason, or commented-out code. Git history holds these.

## Do write

- Why a non-obvious approach was chosen, and what breaks if it is "simplified".
- Behaviour imposed from outside: database or OS rules, version requirements, protocol details.
- The meaning of sentinel values: `undefined` = create mode, empty string = database default.

Match the surrounding code's comment density. When reviewing a diff, delete comments that fail these tests before handing it over.
