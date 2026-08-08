# Task T06a: Coverage-block rule — TESTS

**Role:** `red` — you write failing tests. **You do not implement.**

## References
- Read: `../shared/interfaces.md` — **§5 the coverage block**
- Read: `../shared/interfaces.md` — §1 rule contract
- Read: `../knowledge/iron-law.md` — §4 is what this enforces
- Read: `../shared/conventions.md` — test style
- Read: `../knowledge/run-tests.md`

## Dependencies
- Depends on: T03 (rule contract)
- Depended on by: T06b (implements against your locked tests)

## Scope
**Files:**
- Create: `test/coverage-block.test.mjs` — **you own this file**

**BOUNDARY — you MUST NOT modify any files outside this list.**
**You MUST NOT create `tools/rules/coverage-block.mjs`.** That is T06b's job.

## What the rule must do — authoritative specification

This is the contract. Write tests against it. Do not invent behaviour beyond it; if something
here is genuinely ambiguous, **escalate rather than guessing** — a test that guesses becomes the
de-facto spec.

```
id       = 'coverage-block'
applies  = /\.workflow\.js$/

Violations, in priority order:

V1. The file contains no `return` followed by an object literal.
    -> line 0. A workflow that returns nothing hands its caller `undefined`, which cannot
       be distinguished from a crash. IRON LAW §4.

V2. No `return { … }` object literal in the file contains a `coverage` key.
    -> line 0. Every vfa-* workflow returns the coverage block (interfaces.md §5).

V3. A bare `return` with no value (`return`, `return;`) appears anywhere.
    -> that line. Silently yields undefined.
```

**Known limitation, deliberately accepted:** the rule checks that *at least one* return carries
`coverage`, not that *every* result-path return does. Distinguishing a script-level return from
one inside a helper function needs a real parser, and this repo has no dependencies. Early-error
paths are covered by human review at T18. **Do not write a test asserting the stronger
behaviour** — it is not the spec and T06b cannot satisfy it.

## The hard part your tests must cover

The implementation has to scan for object literals **while skipping string and template
literals**. Workflow scripts are mostly enormous prompt strings, and those strings contain
braces, the word `return`, and `${...}` interpolations. A naive brace scan gets this wrong.

Your tests are what force the implementation to handle it. Cover at minimum:
- a `coverage` key that only *appears* inside a prompt string must NOT satisfy V2
- a template literal containing `${...}` before the real return must not break brace matching
- `//` and `/* */` comments mentioning `return` or `coverage` must not count

## Positive Constraints (DO)
- Assert on `id` and `applies` as well as `check`.
- Test the **clean case** — a realistic minimal workflow that satisfies all three rules.
- Where a violation carries a line, assert the line.
- Open the file with a short comment saying what it pins and why, per `../shared/conventions.md`.

## Negative Constraints (DO NOT)
- Do NOT implement the rule. Do NOT create anything under `tools/`.
- Do NOT pin the exact wording of a message. Assert with `assert.match` on a stable fragment
  (e.g. `/coverage/`), so T06b can phrase it well.
- Do NOT assert a violation *count* for the clean case beyond `deepEqual(…, [])`.
- Do NOT weaken a test to make it easier to pass. If you believe the spec is wrong, escalate.

## Implementation Steps

- [ ] **Step 1: Write the failing tests**

Create `test/coverage-block.test.mjs`. Structure:

```js
// test/coverage-block.test.mjs — pins IRON LAW §4 at the workflow boundary: a partial
// result must never be indistinguishable from a whole one.
//
// The subtle half of this rule is not "find the word coverage". It is finding it in a
// real returned object literal and NOT in the enormous prompt strings that make up most
// of a workflow script — strings which contain braces, the word return, and ${}
// interpolations. Those cases are the reason this rule exists as its own module.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { id, applies, check } from '../tools/rules/coverage-block.mjs'

const WF = 'workflows/vfa-survey.workflow.js'

const clean = [
  "export const meta = { name: 'vfa-survey', description: 'x', phases: [] }",
  'const verdicts = []',
  'return {',
  '  question,',
  '  verdicts,',
  '  coverage: { complete: true, dropped: [], incomplete: [] },',
  '}',
].join('\n')

// … your tests here
```

Write tests covering, at minimum:

1. `id === 'coverage-block'`
2. `applies` matches `*.workflow.js` and not `agents/*.md`
3. the `clean` fixture produces `[]`
4. **V1** — a script with no return at all → one violation at line 0
5. **V2** — a script that returns an object without `coverage` → one violation at line 0
6. **V3** — a bare `return` → a violation at that line
7. **string-skipping** — `coverage` appearing only inside a prompt string does NOT satisfy V2:
   ```js
   const src = [
     'const p = `Report the coverage: { complete: true }`',
     'return { question }',
   ].join('\n')
   // expect a V2 violation — the only `coverage` is inside a template literal
   ```
8. **interpolation** — a template literal containing `${JSON.stringify({ a: 1 })}` before the
   real return does not break brace matching, and the clean return is still recognised
9. **comments** — `// return { coverage: 1 }` does not satisfy V2
10. a helper function returning an object without `coverage` is fine, provided the script's own
    return has it (this is the accepted limitation — pin it so T06b does not over-implement):
    ```js
    const src = [
      'async function scoutUntilComplete(t) {',
      '  return { hits: [], searched: [], complete: false }',
      '}',
      'return { question, coverage: { complete: false } }',
    ].join('\n')
    // expect []
    ```

- [ ] **Step 2: Run the tests to verify they fail for the RIGHT reason**

Run: `node --test test/coverage-block.test.mjs`
Expected: FAIL with `Cannot find module '../tools/rules/coverage-block.mjs'`.

That is the correct failure — the module does not exist. If you see any *other* failure, your
test file has a bug; fix it before committing.

- [ ] **Step 3: Commit**

```bash
git add test/coverage-block.test.mjs
git commit -m "$(cat <<'EOF'
test(lint): author failing tests for the coverage-block rule

Pins IRON LAW §4 at the workflow boundary, including the string- and
comment-skipping cases that distinguish a real returned object literal
from the prompt text that surrounds it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Acceptance Criteria
- [ ] `test/coverage-block.test.mjs` exists and covers all ten cases above
- [ ] `node --test test/coverage-block.test.mjs` fails with "Cannot find module", nothing else
- [ ] No file under `tools/` was created or modified
- [ ] No message wording is pinned exactly — only stable fragments via `assert.match`
- [ ] No test asserts the stronger "every return" behaviour
