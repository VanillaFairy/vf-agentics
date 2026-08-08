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
