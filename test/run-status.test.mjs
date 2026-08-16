// test/run-status.test.mjs — the derivation arithmetic of lib/run-status.mjs.
//
// Everything here exercises the pure core, which is why there is no repository fixture: the
// one fact that needs git — has the integration head reached the user's branch — is an
// argument, not a read. The cases that matter are the ones where a wrong answer is worse
// than no answer: an unreadable partition reported as `planned`, a `landed` run whose
// coupled orders nobody implemented, and git's "I cannot tell" collapsed into "no".

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { deriveRun, statusOf, partitionOf, labelOf, plannedAt } from '../lib/run-status.mjs'

const RAW = (waves, coupled = []) => JSON.stringify({ waves, coupled })

const plan = (over = {}) => ({
  runstamp: '20260816-143005',
  change: 'add the widget',
  base_branch: 'master',
  base_sha: 'aaaaaaa',
  work_orders: [{ id: 'W1' }, { id: 'W2' }, { id: 'W3' }],
  partition_raw: RAW([['W1', 'W2'], ['W3']]),
  ...over,
})

const wave = (over = {}) => ({
  wave: 1, merged: [], approved_unmerged: [], escalated: [],
  integration_base: 'aaaaaaa', integration_head: 'bbbbbbb',
  ...over,
})

test('a plan with no state is planned, whatever git says', () => {
  const run = deriveRun('20260816-143005', plan(), [], true)

  assert.equal(run.status, 'planned')
  assert.deepEqual(run.merged, [])
  assert.deepEqual(run.unreached, ['W1', 'W2', 'W3'])
  assert.equal(run.waves_total, 2)
  assert.equal(run.waves_recorded, 0)
})

test('a run with waved orders still outstanding is in-flight', () => {
  const run = deriveRun('20260816-143005', plan(), [wave({ merged: ['W1', 'W2'] })], null)

  assert.equal(run.status, 'in-flight')
  assert.deepEqual(run.unreached, ['W3'])
  assert.equal(run.integration_head, 'bbbbbbb')
})

test('every waved order merged is integrated, and ancestry promotes it to landed', () => {
  const state = [wave({ merged: ['W1', 'W2'] }), wave({ wave: 2, merged: ['W3'] })]

  assert.equal(deriveRun('20260816-143005', plan(), state, false).status, 'integrated')
  assert.equal(deriveRun('20260816-143005', plan(), state, true).status, 'landed')
})

test("git's unanswerable ancestry is not read as a no-but-known", () => {
  // Both land on `integrated`, which is the safe word. What must NOT happen is a crash or a
  // claim: null means the branch was deleted or the object is missing from this clone, and
  // the row's own fields have to stay usable so a human can go look.
  const state = [wave({ merged: ['W1', 'W2'] }), wave({ wave: 2, merged: ['W3'] })]
  const run = deriveRun('20260816-143005', plan(), state, null)

  assert.equal(run.status, 'integrated')
  assert.equal(run.integration_head, 'bbbbbbb')
})

test('an unreadable partition is unreadable, never planned', () => {
  // The dangerous misreport: `planned` invites re-planning work that may already have merged.
  const notJson = deriveRun('20260816-143005', plan({ partition_raw: 'waves: one and two' }), [])
  assert.equal(notJson.status, 'unreadable')
  assert.match(notJson.notes.join(' '), /not JSON/)

  const refused = deriveRun('20260816-143005',
    plan({ partition_raw: JSON.stringify({ error: 'dependency cycle involving W1, W2' }) }), [])
  assert.equal(refused.status, 'unreadable')
  assert.match(refused.notes.join(' '), /refused this plan/)
})

test('a run whose plan.json could not be read reports unreadable and still names itself', () => {
  const run = deriveRun('20260816-143005', null, [], null, ['plan.json could not be read: ENOENT'])

  assert.equal(run.status, 'unreadable')
  assert.equal(run.runstamp, '20260816-143005')
  assert.equal(run.planned_at, '2026-08-16T14:30:05')
  assert.match(run.notes.join(' '), /ENOENT/)
})

test('landed never prints bare while coupled orders or escalations are outstanding', () => {
  const state = [wave({ merged: ['W1', 'W2'] }), wave({ wave: 2, merged: ['W3'] })]
  const run = deriveRun('20260816-143005',
    plan({ partition_raw: RAW([['W1', 'W2'], ['W3']], ['W4', 'W5']) }), state, true)

  assert.equal(run.status, 'landed')
  assert.match(run.label, /^landed \(/)
  assert.match(run.label, /2 coupled/)
})

test('the label is the bare word only when nothing qualifies it', () => {
  assert.equal(labelOf('landed', [], []), 'landed')
  assert.match(labelOf('landed', ['W4'], []), /1 coupled/)
  assert.match(labelOf('in-flight', [], ['W2']), /1 escalated/)
  assert.match(labelOf('integrated', ['W4'], ['W2']), /coupled.*escalated/)
})

test('escalations union across waves; approved_unmerged is the last snapshot only', () => {
  const state = [
    wave({ merged: ['W1'], escalated: ['W2'], approved_unmerged: ['W3'] }),
    wave({ wave: 2, merged: ['W3'], escalated: [], approved_unmerged: [] }),
  ]
  const run = deriveRun('20260816-143005', plan(), state, null)

  assert.deepEqual(run.escalated, ['W2'])
  // W3 was approved-unmerged in wave 1 and merged in wave 2. Reporting it as still waiting
  // would send a human after work that has already landed.
  assert.deepEqual(run.approved_unmerged, [])
  assert.deepEqual(run.unreached, ['W2'])
})

test('statusOf reads its three facts and nothing else', () => {
  assert.equal(statusOf({ hasState: false, unreached: [], landedInTree: true }), 'planned')
  assert.equal(statusOf({ hasState: true, unreached: ['W1'], landedInTree: true }), 'in-flight')
  assert.equal(statusOf({ hasState: true, unreached: [], landedInTree: false }), 'integrated')
  assert.equal(statusOf({ hasState: true, unreached: [], landedInTree: null }), 'integrated')
  assert.equal(statusOf({ hasState: true, unreached: [], landedInTree: true }), 'landed')
})

test('partitionOf flattens waves and carries the coupled set', () => {
  const { waved, coupled, waves, note } = partitionOf(plan({
    partition_raw: RAW([['W1'], ['W2', 'W3']], ['W4']),
  }))

  assert.deepEqual(waved, ['W1', 'W2', 'W3'])
  assert.deepEqual(coupled, ['W4'])
  assert.equal(waves, 2)
  assert.equal(note, null)
})

test('a runstamp that is not a timestamp yields no planned_at rather than a wrong one', () => {
  assert.equal(plannedAt('20260816-143005'), '2026-08-16T14:30:05')
  assert.equal(plannedAt('my-feature'), '')
  assert.equal(plannedAt(''), '')
  assert.equal(plannedAt(undefined), '')
})
