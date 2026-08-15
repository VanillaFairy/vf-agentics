// test/vfa-survey-scenarios.test.mjs — the survey workflow's accounting arithmetic, executed.
//
// Lint judges form and cannot reach any of this: whether a channel nobody ran is recorded,
// whether a verdict is matched to its topic by position or by a string the model retyped,
// whether a half-finished channel still reports complete. Each test below pins a way a
// PARTIAL result could come back wearing the shape of a WHOLE one (IRON LAW §4).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { runWorkflow, scriptedAgents } from './harness/workflow-host.mjs'

const WF = fileURLToPath(new URL('../workflows/vfa-survey.workflow.js', import.meta.url))

const PLAN = (over = {}) => ({
  topics: [{ key: 'a', find: 'find a' }],
  docs_needed: false, docs_question: '',
  history_needed: false, history_question: '',
  ...over,
})

const HITS = (over = {}) => ({
  hits: [{ path: 'src/x.js', line: 1, note: 'the thing' }],
  searched: ['grep thing'], stop_reason: 'exhausted', uncovered: '',
  ...over,
})

const VERDICT = (topic) => ({ topic, conclusion: 'c', evidence: ['src/x.js:1'], risks: [] })

const run = (script, over = {}) => runWorkflow(WF, {
  args: { question: 'how does X work', ...over },
  agent: scriptedAgents(script),
})

// ------------------------------------------- a requested channel that produced nothing

test('a channel marked necessary with no question is a failure, not a silent skip', async () => {
  const { result, logs } = await run({
    plan: PLAN({ history_needed: true, history_question: '   ' }),
    'scout:': HITS(),
    'analyze:': VERDICT('a'),
  })

  // The planner asked for history and then named no question, so nothing was searched. If
  // that reads as "not requested", the run comes back complete with the history evidence
  // simply absent — which is the exact shape of a finished investigation.
  assert.deepEqual(result.coverage.failed_channels, ['history'])
  assert.equal(result.coverage.complete, false)
  assert.equal(result.history, null)
  assert.ok(logs.some((l) => /marked necessary but the planner produced no question/i.test(l)),
    'the vanished channel must be logged, not just recorded')
})

test('a channel that throws is recorded without discarding the work already paid for', async () => {
  const { result } = await run({
    plan: PLAN({ docs_needed: true, docs_question: 'what does the vendor say' }),
    'scout:': HITS(),
    'analyze:': VERDICT('a'),
    docs: () => { throw new Error('network is down') },
  })

  assert.deepEqual(result.coverage.failed_channels, ['docs'])
  assert.equal(result.docs, null)
  assert.equal(result.verdicts.length, 1, 'a failed channel must not empty the verdicts')
})

// ---------------------------------------------------------------- reconciliation

test('a verdict is matched to its topic by position, not by the key the analyst echoed', async () => {
  const { result } = await run({
    plan: PLAN({ topics: [{ key: 'a', find: 'find a' }, { key: 'b', find: 'find b' }] }),
    'scout:': HITS(),
    'analyze:a': VERDICT('typo-not-a'),
    'analyze:b': VERDICT('b'),
  })

  // Matching on the echoed string counted this verdict as evidence AND its topic as dropped,
  // at the same time: the answer was built on both topics while reporting one as missing.
  assert.equal(result.verdicts.length, 2)
  assert.deepEqual(result.coverage.dropped, [])
  assert.equal(result.coverage.complete, true)
})

test('a topic whose analysis fails is dropped exactly once and fails coverage', async () => {
  const { result } = await run({
    plan: PLAN({ topics: [{ key: 'a', find: 'find a' }, { key: 'b', find: 'find b' }] }),
    'scout:': HITS(),
    'analyze:a': () => { throw new Error('analyst died') },
    'analyze:b': VERDICT('b'),
  })

  assert.equal(result.verdicts.length, 1)
  assert.deepEqual(result.coverage.dropped, ['a'])
  assert.deepEqual(result.coverage.incomplete, [], 'a dropped topic must not also count as incomplete')
  assert.equal(result.coverage.complete, false)
})
