# Conventions

## Files and naming

| Thing | Convention | Example |
|---|---|---|
| Node source | `.mjs`, ESM, no `package.json` | `tools/lint.mjs` |
| Tests | `test/<module>.test.mjs`, `node:test` | `test/no-turn-caps.test.mjs` |
| Rule module | `tools/rules/<id>.mjs`, `id` === filename stem | `tools/rules/no-imports.mjs` |
| Agent | `agents/<name>.md`, `name` === filename stem | `agents/scout.md` |
| Workflow | `workflows/vfa-<name>.workflow.js` | `workflows/vfa-survey.workflow.js` |
| Skill | `skills/<name>/SKILL.md` | `skills/investigate/SKILL.md` |

Workflow names carry the `vfa-` prefix because the workflow namespace is **flat and global**
across all installed plugins.

## Test style

Node's built-in runner. No dependencies, no framework.

```js
// test/example.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { check } from '../tools/rules/example.mjs'

test('flags the thing it is supposed to flag', () => {
  const findings = check('offending source', 'workflows/x.workflow.js')
  assert.equal(findings.length, 1)
  assert.match(findings[0].message, /expected phrase/)
})
```

Rules:
- **One assertion subject per test.** Name it for the behaviour, not the function.
- **Always test the clean case.** A rule that flags everything passes every "it flags X" test.
- **Assert on `line` where the rule reports one.** A finding pointing at the wrong line is a bug
  that "length === 1" will never catch.
- Open each test file with a short comment saying what it pins and why, matching `reasonable`'s
  house style.

## JavaScript style

- ESM everywhere. Named exports; no default exports.
- No semicolon-free ambiguity: the existing plugins omit trailing semicolons in workflow scripts.
  Match the file you are in.
- No dependencies. Node 26 built-ins only.
- Rules are pure: no `fs`, no `process`, no module-level mutable state.

## Workflow script constraints

These are platform limits, not preferences. Violating any of them is a runtime failure:

- **No `import` or `require`.** Scripts run in a sandbox with no module loader.
- **No `Date.now()`, `new Date()` (argless), or `Math.random()`.** They break run resumption.
- **`export const meta` must be a pure literal** — no variables, calls, spreads, or template
  interpolation.
- Phase titles in `meta.phases` must match the `phase()` calls exactly.
- **Never cap an agent by tool calls or turns** (IRON LAW §1).
- **Never write `minItems`/`maxItems`/`minLength`/`maxLength` in a schema.** Put the bound in the
  prompt and enforce it in JS after the call.

## Agent prompt style

Carried from the existing `investigate` plugin, which got these right:

- State what the agent **is not** for, not just what it is for.
- Every search-shaped agent ends with a **Coverage line**, always, separating "searched, no
  match" from "did not search".
- "You are done when the search is exhausted, **not** when you have used some number of tool
  calls." Around 25 calls, self-check for convergence — continue if converging, change approach
  if wandering. Cost is not the agent's concern; waste is.

## Commits

One commit per task. Conventional-commit prefix, scope = the area touched.

```
feat(lint): add no-turn-caps rule
feat(agents): add scout
feat(workflows): add vfa-survey nested core
docs(plan): ...
```

End every commit message with:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

## Error handling

- **Side channels get `.catch`.** A failing `historian` or `doc-researcher` must not discard
  scout and analyst work already paid for. Log, flag, carry into synthesis.
- **Never swallow.** A caught failure is recorded in `coverage.failed_channels` and surfaced.
- **Never return bare `undefined` from a workflow.** Return the documented shape with the failure
  described inside it — a consumer cannot distinguish "nothing found" from "nothing ran".
