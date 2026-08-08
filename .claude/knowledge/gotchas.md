# Gotchas

## `node --test test/` does not work on Node 26.5.1
```
node --test          # correct
node --test test/    # WRONG: MODULE_NOT_FOUND, exit 1, nothing runs
```
Both `node --test test/` and `node --test test` fail with:
```
Error: Cannot find module 'C:\...\vf-agentics\test'
  code: 'MODULE_NOT_FOUND'
```
Node resolves the bare positional argument as a module to load rather than a directory to scan,
and exits `1` **without running a single test**. Bare `node --test` uses default discovery and
finds everything under `test/`.

This is the single most expensive gotcha in this repo — three agents hit it independently in one
session, and the broken form had been copied into `CLAUDE.md` as the documented check command.
Anything that chains `&& node --test test/` silently passes by never running.

## The working tree is CRLF, every test fixture is LF
`core.autocrlf` is `true`, so files on disk after a checkout end in `\r\n`, while every fixture
written as a JS string in a test is LF-joined. **A rule can pass its whole suite and still be
broken on a real file.** This has already caused two shipped bugs:

- Matching a delimiter with exact equality — `lines.indexOf('---')` never finds `"---\r"`.
- `(.*)$` in a line regex. **JS treats `\r` as a line terminator, so `.` refuses to consume it**
  and the match fails outright on `"name: scout\r"`.

Normalize once at the input boundary rather than defending at each use site:
```js
const lines = source.split('\n').map((line) => line.replace(/\r$/, ''))
```
Or compare with `.trim()` — never `line === '---'`.

## Worktrees must be siblings of the plugin root
```
git worktree add ../vf-agentics-wt-<TASK> -b task/<TASK> <branch>
```
Not `.worktrees/` inside the repo. `test/plugin-manifest.test.mjs` reads
`../../.claude-plugin/marketplace.json` — two hops up from `test/`, i.e. the *parent of the plugin
root*. Only a sibling worktree makes that resolve to the real `vanillafairy/` marketplace.

## Two tests read a file outside the repository
`test/plugin-manifest.test.mjs` asserts on `../../.claude-plugin/marketplace.json`, which this
repo does not contain or version. The suite is therefore **not hermetic**: a clone in a different
layout fails two tests with `ENOENT`, and editing an unrelated plugin's marketplace entry turns
this suite red.

## `ERROR: Failed to parse repository information` on every commit
Harmless. It comes from the user's *global* hooks directory (`core.hooksPath`), not from anything
in this repo, and the commit lands correctly — check `git log` and `git status` rather than
believing the message. Every agent that commits here will see it twice.

## Workflow scripts run in a sandbox with no module loader
No `import`, no `require` — an import is a runtime failure, not a style issue. Also no
`Date.now()`, argless `new Date()`, or `Math.random()`: they break run resumption. And never
`minItems`/`maxItems`/`minLength`/`maxLength` in a schema — structured outputs drop them, so the
author believes a bound is enforced when nothing enforces it. Put the bound in the prompt and
enforce it in JS after the call. All of these are enforced by `tools/rules/`.
