# Conventions

Carried from increment 1. Differences for this increment are marked **(inc 2)**.

## Files and naming

| Thing | Convention | Example |
|---|---|---|
| Node source | `.mjs`, ESM, no `package.json` | `lib/independence.mjs` |
| Tests | `test/<module>.test.mjs`, `node:test` | `test/commit-series.test.mjs` |
| Rule module | `tools/rules/<id>.mjs`, `id` === filename stem | `tools/rules/no-self-verdict.mjs` |
| Agent | `agents/<name>.md`, `name` === filename stem | `agents/coder.md` |
| Workflow | `workflows/vfa-<name>.workflow.js` | `workflows/vfa-develop.workflow.js` |
| Skill | `skills/<name>/SKILL.md` | `skills/develop/SKILL.md` |

**(inc 2)** `lib/` modules follow the same pure-core + CLI-wrapper split as `tools/lint.mjs`:
pure functions exported for tests; a CLI guarded by `import.meta.main` that does the I/O.
Only the pure core is unit-tested.

## Test style

Node's built-in runner. No dependencies, no framework.

```js
// test/example.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { partition } from '../lib/independence.mjs'

test('two orders with disjoint loci land in one wave', () => {
  const out = partition([{ id: 'W1', locus: ['a.js'] }, { id: 'W2', locus: ['b.js'] }], [])
  assert.deepEqual(out.waves, [['W1', 'W2']])
  assert.deepEqual(out.coupled, [])
})
```

Rules:
- **One assertion subject per test.** Name it for the behaviour, not the function.
- **Always test the clean case.** A checker that flags everything passes every "it flags X" test.
- **Assert on identifying fields** (`sha`, `check`, `id`), not just array lengths.
- Open each test file with a short comment saying what it pins and why.

## JavaScript style

- ESM everywhere. Named exports; no default exports.
- No dependencies. Node 26 built-ins only (`node:child_process` is allowed in CLI wrappers).
- Pure functions take data, return data: no `fs`, no `process`, no module-level mutable state.

## Workflow script constraints

Platform limits, not preferences. Violating any is a runtime failure:

- **No `import` or `require`.** Schema literals are copied into the script.
- **No `Date.now()`, argless `new Date()`, or `Math.random()`.**
- **`export const meta` must be a pure literal.** Phase titles match `phase()` calls exactly.
- **Never cap an agent or a loop by tool calls, turns, or rounds** (IRON LAW §1). Loops
  terminate on a computed goal condition or escalate on a computed non-convergence condition.
- **Never write `minItems`/`maxItems`/`minLength`/`maxLength` in a schema.**
- **(inc 2) Never give a schema a self-reported verdict boolean** (`approved`, `passed`,
  `ok`, `accepted`, `lgtm`, `complete`). Name observed facts instead (`build_ok`,
  `suite_pass` describe command exit status, which is a fact, not a self-assessment).
  Enforced by `tools/rules/no-self-verdict.mjs`.

## Agent prompt style

- State what the agent **is not** for, not just what it is for.
- Every search-shaped agent ends with a Coverage line. Around 25 calls, self-check for
  convergence — continue if converging, change approach if wandering.
- **(inc 2)** Mutating agents (`coder`) end with a **self-review** pass and a typed status.
  Self-review informs; it never certifies — external verification and review always run.

## Commits — for tasks in THIS plan

One commit per task. Conventional-commit prefix, scope = the area touched.

```
feat(lib): add commit-series analyzer
feat(agents): add reviewer
feat(workflows): add vfa-develop
docs(spec): fold review loop and commit discipline into the design
```

End every commit message with:

```
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

## Error handling

- **Side channels get `.catch`.** Never swallow: record in `coverage.failed_channels`.
- **Never return bare `undefined` from a workflow.** Return the documented shape with the
  failure described inside it (IRON LAW §4).
- **(inc 2) Escalations are data.** A non-convergent review loop, a locus breach, a blocked
  coder — each returns a typed escalation object carried in the workflow result. Nothing
  throws its way out of the pipeline silently.
