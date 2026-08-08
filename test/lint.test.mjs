// test/lint.test.mjs — pins the orchestrator's contract with the rule modules.
//
// Seven rule tasks are written in parallel against this contract without seeing each
// other's code. The two things that can silently break all of them are: `applies` being
// tested against a non-POSIX path, and violations losing their file/rule attribution on
// the way to a finding. Both are pinned here with fake rules, so no rule module is needed.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lintSource, formatFindings } from '../tools/lint.mjs'

const workflowRule = {
  id: 'fake-workflow-rule',
  applies: /\.workflow\.js$/,
  check: () => [{ line: 7, message: 'bad thing' }],
}

const agentRule = {
  id: 'fake-agent-rule',
  applies: /^agents\/.*\.md$/,
  check: () => [{ line: 0, message: 'missing thing' }],
}

const cleanRule = {
  id: 'fake-clean-rule',
  applies: /.*/,
  check: () => [],
}

test('a violation becomes a finding carrying file and rule id', () => {
  const found = lintSource('src', 'workflows/vfa-survey.workflow.js', [workflowRule])

  assert.deepEqual(found, [{
    file: 'workflows/vfa-survey.workflow.js',
    rule: 'fake-workflow-rule',
    line: 7,
    message: 'bad thing',
  }])
})

test('a rule whose applies does not match is skipped', () => {
  const found = lintSource('src', 'agents/scout.md', [workflowRule])
  assert.deepEqual(found, [])
})

test('every matching rule runs, and results accumulate', () => {
  const found = lintSource('src', 'agents/scout.md', [workflowRule, agentRule, cleanRule])

  assert.equal(found.length, 1)
  assert.equal(found[0].rule, 'fake-agent-rule')
})

test('a rule that finds nothing contributes nothing', () => {
  const found = lintSource('src', 'workflows/x.workflow.js', [cleanRule])
  assert.deepEqual(found, [])
})

test('formatFindings reports the clean case explicitly', () => {
  assert.equal(formatFindings([]), 'OK: no findings')
})

test('formatFindings renders one line per finding, file first', () => {
  const rendered = formatFindings([
    { file: 'workflows/a.workflow.js', rule: 'r1', line: 3, message: 'first' },
    { file: 'agents/b.md', rule: 'r2', line: 0, message: 'second' },
  ])

  assert.equal(
    rendered,
    'workflows/a.workflow.js:3  [r1] first\n' +
    'agents/b.md:0  [r2] second',
  )
})
