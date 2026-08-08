# Task T08: Rule — no imports in workflow scripts

## References
- Read: `../shared/interfaces.md` — §1 rule contract
- Read: `../shared/conventions.md` — "Workflow script constraints"
- Read: `../knowledge/run-tests.md`

## Dependencies
- Depends on: T03 (rule contract)
- Depended on by: T15

## Why this rule exists

Workflow scripts run in a sandbox with **no module loader and no filesystem access**. An `import`
is not a lint preference — it is a runtime failure. This was verified empirically: all seven
workflow scripts in the `reasonable` plugin contain zero imports, because they cannot.

The consequence shapes the whole architecture: shared JS reaches a workflow only via an agent
running `node ${CLAUDE_PLUGIN_ROOT}/lib/x.mjs`. This rule stops someone rediscovering that at
runtime.

## Scope
**Files:**
- Create: `tools/rules/no-imports.mjs`
- Create: `test/no-imports.test.mjs`

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- Flag static `import … from '…'`, bare `import '…'`, dynamic `import(…)`, and `require(…)`.
- Anchor static imports at line start — a prompt string mentioning the word "import" must stay
  clean. Workflow scripts contain long prompt literals, and false positives here are likely.

## Negative Constraints (DO NOT)
- Do NOT flag `import.meta` — it is a property access, not a module load.
- Do NOT flag the word "import" in prose or inside a prompt string (e.g. `find every import of
  Foo`). Anchoring plus the quote requirement handles this.
- Do NOT touch the filesystem.

## Implementation Steps

- [ ] **Step 1: Write the failing test**

```js
// test/no-imports.test.mjs — pins the platform constraint that workflow scripts cannot
// load modules.
//
// This is not a style rule: the Workflow sandbox has no module loader, so an import is a
// runtime failure. The false-positive cases matter — workflow scripts are mostly long
// prompt literals, and those prompts routinely talk about imports in the code being
// searched.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { id, applies, check } from '../tools/rules/no-imports.mjs'

const WF = 'workflows/vfa-survey.workflow.js'

test('the rule id matches its filename stem', () => {
  assert.equal(id, 'no-imports')
})

test('it applies only to workflow scripts', () => {
  assert.ok(applies.test(WF))
  assert.ok(!applies.test('tools/lint.mjs'))
  assert.ok(!applies.test('agents/scout.md'))
})

test('flags a static named import and reports its line', () => {
  const src = ['// header', "import { readFile } from 'node:fs/promises'", 'const x = 1'].join('\n')

  const found = check(src, WF)
  assert.equal(found.length, 1)
  assert.equal(found[0].line, 2)
  assert.match(found[0].message, /no module loader/)
})

test('flags a default import, a bare import, and a namespace import', () => {
  assert.equal(check("import fs from 'node:fs'", WF).length, 1)
  assert.equal(check("import 'node:process'", WF).length, 1)
  assert.equal(check("import * as path from 'node:path'", WF).length, 1)
})

test('flags dynamic import and require', () => {
  assert.equal(check("const m = await import('./x.mjs')", WF).length, 1)
  assert.equal(check("const fs = require('node:fs')", WF).length, 1)
})

test('does NOT flag import.meta', () => {
  assert.deepEqual(check('if (import.meta.main) { run() }', WF), [])
})

test('does NOT flag the word import inside a prompt string', () => {
  const src = "const p = `Find every import of Foo and report the file.`"
  assert.deepEqual(check(src, WF), [])
})

test('does NOT flag an indented mention mid-line', () => {
  assert.deepEqual(check('  // we cannot import here', WF), [])
})

test('a clean workflow produces no violations', () => {
  const src = [
    "export const meta = { name: 'vfa-survey', description: 'x', phases: [] }",
    "const r = await agent('go', { agentType: 'vf-agentics:scout' })",
  ].join('\n')

  assert.deepEqual(check(src, WF), [])
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/no-imports.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the rule**

```js
// tools/rules/no-imports.mjs — platform constraint, not a style preference.
//
// Workflow scripts run in a sandbox with no module loader and no filesystem access, so an
// import is a runtime failure. Shared JS reaches a workflow only via an agent running
// `node ${CLAUDE_PLUGIN_ROOT}/lib/x.mjs`.
//
// Static imports are anchored at line start and must carry a quoted specifier: workflow
// scripts are mostly long prompt literals, and those prompts talk about imports in the
// code being searched.

export const id = 'no-imports'

export const applies = /\.workflow\.js$/

const STATIC_IMPORT = /^\s*import\s+(?:[\w${},*\s]+\s+from\s+)?['"][^'"]+['"]/
const BARE_IMPORT = /^\s*import\s*['"][^'"]+['"]/
const DYNAMIC_IMPORT = /(?<![.\w])import\s*\(\s*['"]/
const REQUIRE = /\brequire\s*\(\s*['"]/

const MESSAGE =
  'workflow scripts run in a sandbox with no module loader — this is a runtime failure, ' +
  'not a style issue. Put shared logic in lib/ and reach it from an agent via ' +
  '`node ${CLAUDE_PLUGIN_ROOT}/lib/x.mjs`.'

export function check(source) {
  const violations = []

  source.split('\n').forEach((text, index) => {
    const hit =
      STATIC_IMPORT.test(text) ||
      BARE_IMPORT.test(text) ||
      DYNAMIC_IMPORT.test(text) ||
      REQUIRE.test(text)

    if (hit) violations.push({ line: index + 1, message: MESSAGE })
  })

  return violations
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/no-imports.test.mjs`
Expected: PASS — 9 tests.

- [ ] **Step 5: Verify integration**

Run: `node tools/lint.mjs`
Expected: `OK: no findings`, exit 0.

- [ ] **Step 6: Commit**

```bash
git add tools/rules/no-imports.mjs test/no-imports.test.mjs
git commit -m "$(cat <<'EOF'
feat(lint): ban imports in workflow scripts

The Workflow sandbox has no module loader, so an import is a runtime
failure. Anchored to avoid flagging the word inside prompt literals.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Acceptance Criteria
- [ ] `node --test test/no-imports.test.mjs` passes with 9 tests
- [ ] `import.meta` and prompt-string mentions stay clean
- [ ] `check` is pure
- [ ] `node tools/lint.mjs` still exits 0
- [ ] No files outside Scope were modified
