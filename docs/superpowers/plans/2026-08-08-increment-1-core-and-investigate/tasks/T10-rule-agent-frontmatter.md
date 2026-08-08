# Task T10: Rule — agent frontmatter

## References
- Read: `../shared/interfaces.md` — **§3 agent frontmatter shape is authoritative**
- Read: `../shared/interfaces.md` — §1 rule contract
- Read: `../knowledge/run-tests.md`

## Dependencies
- Depends on: T03 (rule contract)
- Depended on by: T11, T12, T13, T14 — **this rule is the failing test for all four agents**

## Why this task comes before the agents

The four agent tasks in Wave 3 have no unit tests of their own — they produce markdown. This rule
is their test. Land it first, and each agent task's "verify it passes" step is a real lint run
against a real requirement rather than a self-assessment.

## Scope
**Files:**
- Create: `tools/rules/agent-frontmatter.mjs`
- Create: `test/agent-frontmatter.test.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- Require all four keys from `../shared/interfaces.md` §3: `name`, `description`, `tools`, `model`.
- Require `name` to equal the filename stem — a mismatch makes the agent unreachable under the
  name the workflow uses.
- Restrict `model` to `sonnet | opus | haiku | fable | inherit`.
- Use line `0` for whole-file findings (missing frontmatter, missing key) and the real 1-indexed
  line for a bad value.
- Parse the frontmatter with a small `key: value` scanner. There is no YAML dependency and this
  repo has none — agent frontmatter is flat by design.

## Negative Constraints (DO NOT)
- Do NOT add a YAML library. No dependencies.
- Do NOT validate the body of the agent file — only the frontmatter block.
- Do NOT validate that the listed tools exist. That needs the registry.
- Do NOT touch the filesystem.

## Implementation Steps

- [ ] **Step 1: Write the failing test**

```js
// test/agent-frontmatter.test.mjs — this rule is the test for the four agent files.
//
// Agent markdown cannot be imported or unit-tested, so its correctness is enforced here.
// The name/filename check is the one that matters most: a mismatch produces an agent that
// exists but is unreachable under the name every workflow uses to call it, and nothing
// fails until a run is already underway.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { id, applies, check } from '../tools/rules/agent-frontmatter.mjs'

const FILE = 'agents/scout.md'

const good = [
  '---',
  'name: scout',
  'description: Read-only code search across one or more repositories.',
  'tools: Read, Grep, Glob',
  'model: sonnet',
  '---',
  '',
  'You find code.',
].join('\n')

test('the rule id matches its filename stem', () => {
  assert.equal(id, 'agent-frontmatter')
})

test('it applies to agents/*.md only', () => {
  assert.ok(applies.test('agents/scout.md'))
  assert.ok(!applies.test('skills/investigate/SKILL.md'))
  assert.ok(!applies.test('workflows/vfa-survey.workflow.js'))
  assert.ok(!applies.test('CLAUDE.md'))
})

test('a well-formed agent produces no violations', () => {
  assert.deepEqual(check(good, FILE), [])
})

test('flags a missing frontmatter block at line 0', () => {
  const found = check('You find code.', FILE)
  assert.equal(found.length, 1)
  assert.equal(found[0].line, 0)
  assert.match(found[0].message, /frontmatter/)
})

test('flags each missing required key', () => {
  for (const key of ['name', 'description', 'tools', 'model']) {
    const src = good.split('\n').filter((l) => !l.startsWith(`${key}:`)).join('\n')
    const found = check(src, FILE)
    assert.ok(
      found.some((v) => v.message.includes(key)),
      `removing ${key} should be flagged`,
    )
  }
})

test('flags an empty required value', () => {
  const src = good.replace('tools: Read, Grep, Glob', 'tools:')
  const found = check(src, FILE)
  assert.ok(found.some((v) => v.message.includes('tools')))
})

test('flags a name that does not match the filename stem', () => {
  const src = good.replace('name: scout', 'name: searcher')
  const found = check(src, FILE)

  assert.equal(found.length, 1)
  assert.match(found[0].message, /searcher/)
  assert.match(found[0].message, /scout/)
})

test('flags an unknown model', () => {
  const src = good.replace('model: sonnet', 'model: gpt-4')
  const found = check(src, FILE)

  assert.equal(found.length, 1)
  assert.match(found[0].message, /gpt-4/)
})

test('accepts every allowed model', () => {
  for (const model of ['sonnet', 'opus', 'haiku', 'fable', 'inherit']) {
    const src = good.replace('model: sonnet', `model: ${model}`)
    assert.deepEqual(check(src, FILE), [], `${model} should be allowed`)
  }
})

test('reports the real line for a bad value', () => {
  const src = good.replace('model: sonnet', 'model: nope')
  const found = check(src, FILE)
  assert.equal(found[0].line, 5)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/agent-frontmatter.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the rule**

```js
// tools/rules/agent-frontmatter.mjs — the only test the agent markdown files get.
//
// Agent definitions cannot be imported or unit-tested, so their required shape is
// enforced here. The name/filename check is the sharpest one: a mismatch produces an
// agent that exists but is unreachable under the name every workflow calls it by, and
// nothing fails until a run is already underway.
//
// Frontmatter is flat `key: value` by design, so this uses a small scanner rather than a
// YAML dependency. This repo has no dependencies.

export const id = 'agent-frontmatter'

export const applies = /^agents\/[^/]+\.md$/

const REQUIRED = ['name', 'description', 'tools', 'model']
const MODELS = new Set(['sonnet', 'opus', 'haiku', 'fable', 'inherit'])

/** @returns {{ values: Map<string, string>, lines: Map<string, number> } | null} */
function parseFrontmatter(source) {
  const lines = source.split('\n')
  if (lines[0]?.trim() !== '---') return null

  const end = lines.indexOf('---', 1)
  if (end === -1) return null

  const values = new Map()
  const lineOf = new Map()

  for (let i = 1; i < end; i++) {
    const match = lines[i].match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/)
    if (!match) continue
    values.set(match[1], match[2].trim())
    lineOf.set(match[1], i + 1)
  }

  return { values, lines: lineOf }
}

export function check(source, filePath) {
  const parsed = parseFrontmatter(source)

  if (!parsed) {
    return [{
      line: 0,
      message: 'missing or unterminated YAML frontmatter block (expected a leading `---` … `---`)',
    }]
  }

  const violations = []
  const { values, lines } = parsed

  for (const key of REQUIRED) {
    if (!values.has(key) || values.get(key) === '') {
      violations.push({
        line: lines.get(key) ?? 0,
        message: `missing or empty required frontmatter key: ${key}`,
      })
    }
  }

  const stem = filePath.split('/').pop().replace(/\.md$/, '')
  const name = values.get('name')
  if (name && name !== stem) {
    violations.push({
      line: lines.get('name'),
      message:
        `frontmatter name "${name}" does not match the filename stem "${stem}". The agent ` +
        `would be unreachable under the name workflows call it by.`,
    })
  }

  const model = values.get('model')
  if (model && !MODELS.has(model)) {
    violations.push({
      line: lines.get('model'),
      message: `unknown model "${model}" — expected one of: ${[...MODELS].join(', ')}`,
    })
  }

  return violations
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/agent-frontmatter.test.mjs`
Expected: PASS — 10 tests.

- [ ] **Step 5: Verify integration**

Run: `node tools/lint.mjs`
Expected: `OK: no findings` — `agents/` does not exist yet.

- [ ] **Step 6: Commit**

```bash
git add tools/rules/agent-frontmatter.mjs test/agent-frontmatter.test.mjs
git commit -m "$(cat <<'EOF'
feat(lint): validate agent frontmatter

Required keys, name/filename agreement, and the model enum. This rule is
the only test the agent markdown files get, so T11-T14 depend on it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Acceptance Criteria
- [ ] `node --test test/agent-frontmatter.test.mjs` passes with 10 tests
- [ ] No YAML dependency was added
- [ ] Whole-file findings use line 0; value findings use the real line
- [ ] `node tools/lint.mjs` still exits 0
- [ ] No files outside Scope were modified
