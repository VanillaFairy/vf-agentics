# Task T04: Rule — no schema bounds

## References
- Read: `../shared/interfaces.md` — §1 rule contract
- Read: `../shared/conventions.md`
- Read: `../knowledge/run-tests.md`

## Dependencies
- Depends on: T03 (rule contract)
- Depended on by: T15

## Why this rule exists

Structured outputs do not support `minItems`, `maxItems`, `minLength`, or `maxLength`. They are
stripped before the request or validated client-side, so they either do nothing silently or turn
a good result into a dropped one. Either way the author believes a bound is in force when it is
not. Bounds belong in the prompt as behaviour, enforced in JS after the call.

This was learned the expensive way in the existing `investigate` plugin. The rule is what stops
it being re-learned.

## Scope
**Files:**
- Create: `tools/rules/no-schema-bounds.mjs`
- Create: `test/no-schema-bounds.test.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- Export exactly `id`, `applies`, `check` per `../shared/interfaces.md` §1.
- `id` must be `'no-schema-bounds'` — it must equal the filename stem.
- Report **1-indexed** line numbers.
- Report one violation per occurrence, so two banned keys on one line produce two violations.

## Negative Constraints (DO NOT)
- Do NOT touch the filesystem. `check` is pure: source text in, violations out.
- Do NOT import `tools/lint.mjs` or any other rule.
- Do NOT flag `minimum`/`maximum` — those are numeric JSON Schema constraints and are fine.
- Do NOT flag the words inside a prose sentence with no colon (e.g. "do not use maxItems" in a
  comment). Match only key positions: the identifier followed by optional space and `:`.

## Implementation Steps

- [ ] **Step 1: Write the failing test**

```js
// test/no-schema-bounds.test.mjs — pins the ban on unsupported schema length constraints.
//
// minItems/maxItems/minLength/maxLength are silently dropped by structured outputs. An
// author who writes one believes a bound is enforced when nothing is enforcing it. The
// clean cases below matter as much as the flagged ones: a rule that fires on `minimum`
// or on prose would make the whole lint untrustworthy and get switched off.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { id, applies, check } from '../tools/rules/no-schema-bounds.mjs'

const FILE = 'workflows/vfa-survey.workflow.js'

test('the rule id matches its filename stem', () => {
  assert.equal(id, 'no-schema-bounds')
})

test('it applies to workflow scripts and nothing else', () => {
  assert.ok(applies.test('workflows/vfa-survey.workflow.js'))
  assert.ok(!applies.test('agents/scout.md'))
  assert.ok(!applies.test('tools/lint.mjs'))
})

test('flags maxItems and reports its line', () => {
  const src = [
    'const S = {',
    '  type: "array",',
    '  maxItems: 40,',
    '}',
  ].join('\n')

  const found = check(src, FILE)
  assert.equal(found.length, 1)
  assert.equal(found[0].line, 3)
  assert.match(found[0].message, /maxItems/)
})

test('flags all four banned keys', () => {
  for (const key of ['minItems', 'maxItems', 'minLength', 'maxLength']) {
    const found = check(`  ${key}: 3,`, FILE)
    assert.equal(found.length, 1, `${key} should be flagged`)
    assert.match(found[0].message, new RegExp(key))
  }
})

test('reports one violation per occurrence, not per line', () => {
  const found = check('{ minItems: 1, maxItems: 9 }', FILE)
  assert.equal(found.length, 2)
  assert.deepEqual(found.map((v) => v.line), [1, 1])
})

test('tolerates whitespace before the colon', () => {
  assert.equal(check('  maxItems : 4,', FILE).length, 1)
})

test('does not flag minimum or maximum', () => {
  assert.deepEqual(check('{ minimum: 1, maximum: 9 }', FILE), [])
})

test('does not flag prose that merely names the keys', () => {
  const src = '// never write maxItems or minLength in a schema'
  assert.deepEqual(check(src, FILE), [])
})

test('a clean schema produces no violations', () => {
  const src = [
    'const HITS = {',
    '  type: "object",',
    '  required: ["hits", "stop_reason"],',
    '  properties: { stop_reason: { type: "string", enum: ["exhausted"] } },',
    '}',
  ].join('\n')

  assert.deepEqual(check(src, FILE), [])
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/no-schema-bounds.test.mjs`
Expected: FAIL — `Cannot find module '../tools/rules/no-schema-bounds.mjs'`.

- [ ] **Step 3: Write the rule**

```js
// tools/rules/no-schema-bounds.mjs — IRON LAW support rule.
//
// Structured outputs do not support minItems/maxItems/minLength/maxLength: they are
// stripped before the request or validated client-side, so they silently do nothing or
// turn a good result into a dropped one. Put every bound in the prompt as behaviour and
// enforce it in JS after the call.

export const id = 'no-schema-bounds'

export const applies = /\.workflow\.js$/

const BANNED = /\b(minItems|maxItems|minLength|maxLength)\s*:/g

export function check(source) {
  const violations = []

  source.split('\n').forEach((text, index) => {
    for (const match of text.matchAll(BANNED)) {
      violations.push({
        line: index + 1,
        message:
          `"${match[1]}" is not supported by structured outputs — it is stripped or ` +
          `validated client-side, so it silently does nothing or drops a good result. ` +
          `Put the bound in the prompt and enforce it in JS after the call.`,
      })
    }
  })

  return violations
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/no-schema-bounds.test.mjs`
Expected: PASS — 8 tests.

- [ ] **Step 5: Verify it integrates with the orchestrator**

Run: `node tools/lint.mjs`
Expected: `OK: no findings` — no workflow scripts exist yet, so there is nothing to flag.

- [ ] **Step 6: Commit**

```bash
git add tools/rules/no-schema-bounds.mjs test/no-schema-bounds.test.mjs
git commit -m "$(cat <<'EOF'
feat(lint): ban unsupported schema length constraints

minItems/maxItems/minLength/maxLength are silently dropped by structured
outputs, so an author believes a bound is enforced when it is not.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Acceptance Criteria
- [ ] `node --test test/no-schema-bounds.test.mjs` passes with 8 tests
- [ ] `check` is pure — no I/O, no imports beyond none
- [ ] `id === 'no-schema-bounds'` and equals the filename stem
- [ ] `minimum`/`maximum` and bare prose are not flagged
- [ ] `node tools/lint.mjs` still exits 0
- [ ] No files outside Scope were modified
