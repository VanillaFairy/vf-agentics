# Commands

## Run the tests
```
node --test
```
From the plugin root. Node's built-in runner — no `package.json`, no install step, no
dependencies, by design. **Do not pass `test/` as an argument** — see gotchas.md.

Single file while iterating:
```
node --test test/no-turn-caps.test.mjs
```

One named test:
```
node --test --test-name-pattern="flags maxTurns" test/no-turn-caps.test.mjs
```

A file with zero tests **passes**. If you expect tests and see `pass 0`, the filename is wrong —
it must end in `.test.mjs` and live under `test/`.

## Run the lint
```
node tools/lint.mjs
```
Prints `OK: no findings`, or one line per finding as `<file>:<line>  [<rule>] <message>`.
Exit `1` when there is at least one finding, `0` otherwise.

Line `0` means the finding is about the file as a whole (a missing block, a missing key) rather
than a specific line.

## Both, as one gate
```
node tools/lint.mjs && node --test
```

## What the lint does and does not read
The walk skips `.git`, `node_modules`, `docs`, and `test`. It checks the plugin's **runtime
artifacts**, not the plan or the lint's own fixtures — a rule file containing `maxTurns` as a test
fixture must not trip its own rule.

Note the skip list matches a directory's *basename at any depth*, so a nested directory named
`docs` or `test` anywhere in the tree is also skipped.
