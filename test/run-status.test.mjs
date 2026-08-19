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

test('order-approved lines alone make a run in-flight, never planned', () => {
  // The 2026-08-19 shape: a run died mid-wave-1, so state.jsonl holds order lines and no
  // wave line. `planned` here invites re-planning work that sits reviewed on its branches —
  // the exact wrong invitation for the one run most worth resuming.
  const state = [{ kind: 'order-approved', wave: 1, order: 'W1', branch: 'vfa/x-W1' }]
  const run = deriveRun('20260816-143005', plan(), state, null)

  assert.equal(run.status, 'in-flight')
  assert.deepEqual(run.approved_unmerged, ['W1'])
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

// --- attribution: which programme, which slice --------------------------------------------
//
// Two columns, and without them a programme cannot tell its own runs from every other
// timestamped directory in the repository — which forces its progress to be STORED as a claim
// rather than derived from the runs that exist. That is exactly the failure this file's whole
// design refuses, reproduced one level up.

test('a run carries the programme and slice its plan recorded', () => {
  const run = deriveRun('20260816-143005',
    plan({ programme: '2026-08-15-eva-plays-2', slice: 'walk' }), [], null)

  assert.equal(run.programme, '2026-08-15-eva-plays-2')
  assert.equal(run.slice, 'walk')
})

test('an ordinary run reports empty tags, which is an answer and not a gap', () => {
  const run = deriveRun('20260816-143005', plan(), [], null)

  assert.equal(run.programme, '')
  assert.equal(run.slice, '')
})

test('an unreadable run still carries the two columns, so a reader can group it', () => {
  const run = deriveRun('20260816-143005', null, [], null, ['plan.json could not be read'])

  assert.equal(run.status, 'unreadable')
  assert.equal(run.programme, '')
  assert.equal(run.slice, '')
})

// --- two line types in one log (§9.3) ------------------------------------------------------
//
// `order-approved` lines are written the instant an order's review closes, long before the
// wave they belong to ends. Every count here has to keep asking the question it means to ask:
// before this, `state.length` was the wave count, and order lines would have inflated it.

const approvedLine = (order, over = {}) => ({
  kind: 'order-approved', wave: 1, merged: [], approved_unmerged: [], escalated: [],
  discovered: [], integration_base: '', integration_head: '',
  order, branch: 'vfa/20260816-143005-' + order, worktree: 'C:/wt/' + order,
  head_sha: 'ccccccc', ...over,
})

test('order-approved lines are not waves', () => {
  const state = [approvedLine('W1'), approvedLine('W2'),
    { ...wave({ merged: ['W1', 'W2'] }), kind: 'wave' }]

  const run = deriveRun('20260816-143005', plan(), state, null)

  assert.equal(run.waves_recorded, 1, 'three lines, one wave')
  assert.equal(run.integration_head, 'bbbbbbb', 'the head comes from the wave line')
})

test('an order approved but never merged is reported as approved_unmerged', () => {
  // The signature of an interruption mid-wave: W1 and W2 finished review, the run died before
  // either was merged, and nothing in a wave-grained log would have mentioned them at all.
  const run = deriveRun('20260816-143005', plan(),
    [approvedLine('W1'), approvedLine('W2')], null)

  assert.deepEqual(run.approved_unmerged.sort(), ['W1', 'W2'])
  assert.equal(run.status, 'in-flight',
    'reviewed orders are progress: `planned` here invited re-planning work that sat ' +
    'finished on its branches, which is how the 2026-08-19 duplicate run read as fresh work')
})

test('an order that later merged stops being approved_unmerged', () => {
  const state = [approvedLine('W1'), { ...wave({ merged: ['W1'] }), kind: 'wave' },
    approvedLine('W2')]

  assert.deepEqual(deriveRun('20260816-143005', plan(), state, null).approved_unmerged, ['W2'])
})

test('a wave snapshot and an order line naming the same order report it once', () => {
  const state = [approvedLine('W3'),
    { ...wave({ merged: ['W1', 'W2'], approved_unmerged: ['W3'] }), kind: 'wave' }]

  assert.deepEqual(deriveRun('20260816-143005', plan(), state, null).approved_unmerged, ['W3'])
})

test('a line written before kind existed is still a wave line', () => {
  // Every line written before the second type existed was a wave line, so reading it as one is
  // the file's history rather than a guess. A run parked under the old format must resume with
  // exactly the arithmetic it had.
  const run = deriveRun('20260816-143005', plan(), [wave({ merged: ['W1', 'W2', 'W3'] })], true)

  assert.equal(run.status, 'landed')
  assert.equal(run.waves_recorded, 1)
  assert.deepEqual(run.merged, ['W1', 'W2', 'W3'])
})
