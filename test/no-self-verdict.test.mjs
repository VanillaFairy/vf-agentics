// test/no-self-verdict.test.mjs — pins the ban on self-reported verdict booleans in workflow
// schemas (IRON LAW §2, extended to review by this increment).
//
// The line this rule draws is verdict names vs. fact names: `approved`/`passed`/`ok`/... are
// judgments a schema must never let a model set for itself, while `build_ok`/`suite_pass`/...
// describe an observed command exit status and stay legal. The clean case below is the real
// VERIFY schema from shared/interfaces.md §5, verbatim — if this rule ever flagged that
// schema, every increment-2 workflow would trip the lint on day one.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { id, applies, check } from '../tools/rules/no-self-verdict.mjs'

const FILE = 'workflows/vfa-develop.workflow.js'

test('the rule id matches its filename stem', () => {
  assert.equal(id, 'no-self-verdict')
})

test('it applies to workflow scripts and nothing else', () => {
  assert.ok(applies.test('workflows/vfa-develop.workflow.js'))
  assert.ok(!applies.test('agents/reviewer.md'))
  assert.ok(!applies.test('tools/lint.mjs'))
})

test('flags approved declared as a boolean schema property', () => {
  const src = [
    'const FINDINGS = {',
    '  type: "object",',
    "  properties: { approved: { type: 'boolean' } },",
    '}',
  ].join('\n')

  const found = check(src, FILE)
  assert.equal(found.length, 1)
  assert.equal(found[0].line, 3)
  assert.match(found[0].message, /approved/)
})

test('flags complete declared as a boolean schema property', () => {
  // The coverage block's `complete` is DERIVED in JS and never appears in a schema — a
  // schema declaring it is exactly the laundering IRON LAW §2 forbids.
  const src = "properties: { complete: { type: 'boolean' } }"

  const found = check(src, FILE)
  assert.equal(found.length, 1)
  assert.equal(found[0].line, 1)
  assert.match(found[0].message, /complete/)
})

test('flags two banned keys in one file as two findings', () => {
  const src = [
    'const SCHEMA = {',
    '  properties: {',
    "    passed: { type: 'boolean' },",
    "    lgtm: { type: 'boolean' },",
    '  },',
    '}',
  ].join('\n')

  const found = check(src, FILE)
  assert.equal(found.length, 2)
  assert.deepEqual(found.map((v) => v.line), [3, 4])
  assert.match(found[0].message, /passed/)
  assert.match(found[1].message, /lgtm/)
})

test('does not flag fact-named booleans build_ok or suite_pass', () => {
  const src = [
    "build_ok: { type: 'boolean' },",
    "suite_pass: { type: 'boolean' },",
  ].join('\n')

  assert.deepEqual(check(src, FILE), [])
})

test('does not flag a key that is not an exact match, or a non-boolean type', () => {
  const src = "passed_tests: { type: 'array', items: { type: 'string' } }"
  assert.deepEqual(check(src, FILE), [])
})

test('does not flag banned words in prose or prompt strings', () => {
  const src = [
    'const PROMPT = `',
    '  Report clearly say whether it passed the suite and whether the fix is complete.',
    '`',
  ].join('\n')

  assert.deepEqual(check(src, FILE), [])
})

test('the real VERIFY schema from shared/interfaces.md section 5 is clean', () => {
  // Copied verbatim from docs/superpowers/plans/2026-08-08-increment-2-develop-review-loop/
  // shared/interfaces.md §5.
  const src = `
const VERIFY = {
  type: 'object', additionalProperties: false,
  required: ['stop_reason', 'build_ok', 'suite_pass', 'suite_output_tail',
             'discriminator', 'series_findings', 'notes'],
  properties: {
    stop_reason: { type: 'string', enum: ['completed', 'environment_broken'] },
    build_ok: { type: 'boolean' },      // observed exit status — a fact, not a judgment
    suite_pass: { type: 'boolean' },
    suite_output_tail: { type: 'string' },  // last ~40 lines of real output, verbatim
    discriminator: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      required: ['test_id', 'failed_on_base', 'passes_now'],
      properties: {
        test_id: { type: 'string' },
        failed_on_base: { type: 'boolean' },   // observed at base_sha in THIS worktree
        passes_now: { type: 'boolean' },
      } } },
    series_findings: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      required: ['sha', 'check', 'message', 'blocking'],
      properties: { sha: { type: 'string' }, check: { type: 'string' },
                    message: { type: 'string' }, blocking: { type: 'boolean' } } } },
    notes: { type: 'string' },
  },
}
`

  assert.deepEqual(check(src, FILE), [])
})
