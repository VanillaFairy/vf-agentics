# Task T09: Rule — qualified agentTypes

## References
- Read: `../shared/interfaces.md` — §1 rule contract
- Read: `../shared/conventions.md`
- Read: `../knowledge/run-tests.md`

## Dependencies
- Depends on: T03 (rule contract)
- Depended on by: T15

## Why this rule exists

Agent types resolve from **one flat, global registry shared by every installed plugin**, and
entries are namespaced `plugin:agent`. A bare `agentType: 'scout'` resolves only by luck — it
breaks the moment any other installed plugin defines a `scout`, and it fails at agent-resolution
time, mid-run, with no signal pointing back at the workflow.

The existing `investigate` plugin uses bare names throughout. `reasonable` uses fully-qualified
names everywhere. This rule makes the correct choice mandatory.

## Scope
**Files:**
- Create: `tools/rules/qualified-agent-types.mjs`
- Create: `test/qualified-agent-types.test.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- Require the form `<plugin>:<agent>`, both segments kebab-case: `/^[a-z0-9]+(-[a-z0-9]+)*$/`
  on each side of a single colon.
- Handle single quotes, double quotes, and backticks — all three appear in workflow scripts.
- Report the offending value in the message so the fix is obvious.

## Negative Constraints (DO NOT)
- Do NOT validate that the named plugin or agent actually exists. That needs the registry, which
  a pure function cannot see. This rule checks *form* only; T18 checks existence by running.
- Do NOT flag `agentType` used as an object key in a schema definition (`agentType: { type:
  'string' }`) — that is a schema property, not an agent reference.
- Do NOT touch the filesystem.

## Implementation Steps

- [ ] **Step 1: Write the failing test**

```js
// test/qualified-agent-types.test.mjs — pins that every agent reference is namespaced.
//
// Agent types resolve from one flat global registry shared across installed plugins. A
// bare name resolves by luck and fails mid-run when another plugin defines the same name.
// The existing `investigate` plugin ships this exact bug; this rule is why it cannot
// happen here.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { id, applies, check } from '../tools/rules/qualified-agent-types.mjs'

const WF = 'workflows/vfa-survey.workflow.js'

test('the rule id matches its filename stem', () => {
  assert.equal(id, 'qualified-agent-types')
})

test('it applies only to workflow scripts', () => {
  assert.ok(applies.test(WF))
  assert.ok(!applies.test('agents/scout.md'))
})

test('flags a bare agent name and names the offending value', () => {
  const src = ["const r = await agent(p, { agentType: 'scout' })"].join('\n')

  const found = check(src, WF)
  assert.equal(found.length, 1)
  assert.equal(found[0].line, 1)
  assert.match(found[0].message, /scout/)
  assert.match(found[0].message, /vf-agentics:scout/)
})

test('accepts a fully-qualified name', () => {
  assert.deepEqual(check("{ agentType: 'vf-agentics:analyst' }", WF), [])
})

test('accepts all three quote styles', () => {
  assert.deepEqual(check('{ agentType: "vf-agentics:scout" }', WF), [])
  assert.deepEqual(check("{ agentType: 'vf-agentics:scout' }", WF), [])
  assert.deepEqual(check('{ agentType: `vf-agentics:scout` }', WF), [])
})

test('flags a malformed qualification', () => {
  assert.equal(check("{ agentType: 'vf-agentics:' }", WF).length, 1)
  assert.equal(check("{ agentType: ':scout' }", WF).length, 1)
  assert.equal(check("{ agentType: 'a:b:c' }", WF).length, 1)
  assert.equal(check("{ agentType: 'VF:Scout' }", WF).length, 1)
})

test('reports the correct line in a multi-line script', () => {
  const src = ['const a = 1', '', "await agent(p, { agentType: 'analyst' })"].join('\n')

  const found = check(src, WF)
  assert.equal(found.length, 1)
  assert.equal(found[0].line, 3)
})

test('does NOT flag agentType as a schema property', () => {
  const src = "const S = { properties: { agentType: { type: 'string' } } }"
  assert.deepEqual(check(src, WF), [])
})

test('a clean workflow produces no violations', () => {
  const src = [
    "await agent(p, { agentType: 'vf-agentics:scout', effort: 'low' })",
    "await agent(q, { agentType: 'vf-agentics:analyst', effort: 'high' })",
  ].join('\n')

  assert.deepEqual(check(src, WF), [])
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/qualified-agent-types.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the rule**

```js
// tools/rules/qualified-agent-types.mjs — agent references must be namespaced.
//
// Agent types resolve from one flat, global registry shared by every installed plugin.
// A bare `agentType: 'scout'` resolves only by luck and breaks the moment another plugin
// defines a `scout` — failing at agent-resolution time, mid-run, with nothing pointing
// back at the workflow that caused it.
//
// Form only. Whether the named plugin and agent actually exist needs the registry, which
// a pure function cannot see.

export const id = 'qualified-agent-types'

export const applies = /\.workflow\.js$/

/** `agentType:` followed by a quoted string. Backticks included — all three appear in the wild. */
const AGENT_TYPE = /agentType\s*:\s*(['"`])([^'"`]*)\1/g

const SEGMENT = '[a-z0-9]+(?:-[a-z0-9]+)*'
const QUALIFIED = new RegExp(`^${SEGMENT}:${SEGMENT}$`)

export function check(source) {
  const violations = []

  source.split('\n').forEach((text, index) => {
    for (const match of text.matchAll(AGENT_TYPE)) {
      const value = match[2]
      if (QUALIFIED.test(value)) continue

      violations.push({
        line: index + 1,
        message:
          `agentType "${value}" is not namespaced. Agent types resolve from one flat ` +
          `global registry, so a bare name collides with other installed plugins and ` +
          `fails mid-run. Use "<plugin>:<agent>", e.g. "vf-agentics:scout".`,
      })
    }
  })

  return violations
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/qualified-agent-types.test.mjs`
Expected: PASS — 9 tests.

Note on the schema-property case: `agentType: { type: 'string' }` has no quoted string
immediately after the colon, so `AGENT_TYPE` does not match it. No special casing needed.

- [ ] **Step 5: Verify integration**

Run: `node tools/lint.mjs`
Expected: `OK: no findings`, exit 0.

- [ ] **Step 6: Commit**

```bash
git add tools/rules/qualified-agent-types.mjs test/qualified-agent-types.test.mjs
git commit -m "$(cat <<'EOF'
feat(lint): require namespaced agentType references

Agent types resolve from one flat global registry; a bare name collides
across installed plugins and fails at resolution time, mid-run.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Acceptance Criteria
- [ ] `node --test test/qualified-agent-types.test.mjs` passes with 9 tests
- [ ] All three quote styles accepted; malformed qualifications flagged
- [ ] Schema properties named `agentType` are not flagged
- [ ] `check` is pure
- [ ] `node tools/lint.mjs` still exits 0
- [ ] No files outside Scope were modified
