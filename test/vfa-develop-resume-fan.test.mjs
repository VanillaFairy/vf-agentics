// test/vfa-develop-resume-fan.test.mjs — the fanned resume load and its retry ladder.
//
// The single loader this fan replaced was asked, on 2026-08-19, to re-emit a 118KB plan
// byte-exact through a schema; it copied 1 of 14 orders and paraphrased the rest — an
// output-length cliff, not a comprehension failure — and the digest gate's halt cost a
// diagnosis and a relaunch. The fan bounds every dispatch by one order instead of the plan,
// verifies each slice against its manifest digest in-script, and retries a failed copy once,
// one tier up. What used to be a stop-the-world tripwire is now a ladder: the halt is
// reserved for a slice no tier could carry.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { runWorkflow, scriptedAgents } from './harness/workflow-host.mjs'
import { manifestOf } from '../lib/plan-digest.mjs'

const WF = fileURLToPath(new URL('../workflows/vfa-develop.workflow.js', import.meta.url))

const A40 = 'a'.repeat(40)
const B40 = 'b'.repeat(40)
const M40 = 'e'.repeat(40)
const N40 = 'f'.repeat(40)

const RUN_DIR = 'C:/repo/.claude/vfa/runs/20260819-062330'
const ARGS = { change: 'add the thing', roots: '.', plugin_root: 'C:/plugin' }

const order = (id, over = {}) => ({
  id, title: 'do ' + id, role: 'none', locus: ['src/' + id + '.js'], reads: [],
  acceptance: ['builds'], context: 'ctx', deps: [], contract: false, ...over,
})

const ORDERS = [order('W1'), order('W2', { deps: ['W1'] })]

const envelope = (over = {}) => ({
  change: 'add the thing', roots: '.', caller_notes: '', intelligence: 'normal',
  base_branch: 'master', base_sha: A40, programme: '', slice: '', ...over,
})

/** W1 already merged by an earlier invocation; a resume has only W2 left to build. */
const waveLine = () => ({
  kind: 'wave', wave: 1, merged: ['W1'], approved_unmerged: [], escalated: [], discovered: [],
  integration_base: A40, integration_head: M40, order: '', branch: '', worktree: '',
  head_sha: '',
})

const index = (over = {}) => ({
  stop_reason: 'loaded',
  order_ids: ORDERS.map((o) => o.id),
  shared_files: [],
  partition_raw: JSON.stringify({ waves: [['W1'], ['W2']], coupled: [] }),
  blocking_gaps: [],
  plan_path: RUN_DIR,
  plan_notes: '',
  envelope: envelope(),
  manifest: manifestOf(ORDERS),
  state: [waveLine()],
  notes: 'read plan.json and one state entry',
  ...over,
})

/** A slice responder serving verbatim copies — the clean world. */
const cleanSlices = (prompt, opts) => {
  const id = (opts.label || '').replace(/^load:/, '').replace(/#\d+$/, '')
  const wo = ORDERS.find((o) => o.id === id)
  return wo ? { stop_reason: 'loaded', orders: [wo], notes: '' }
            : { stop_reason: 'not_found', orders: [], notes: 'no order ' + id }
}

const cast = (over = {}) => scriptedAgents({
  'resume-index': index(),
  'load:': cleanSlices,
  drift: { stop_reason: 'completed', user_head: A40, moved_files: [], notes: 'unchanged' },
  scavenge: { stop_reason: 'completed', found: [], notes: 'no order branch exists' },
  'integration-setup': {
    stop_reason: 'completed',
    worktree: 'C:/repo/.claude/worktrees/vfa-20260819-062330-integration',
    branch: 'vfa/20260819-062330-integration', head_sha: M40, notes: 'attached',
  },
  'merge:': { stop_reason: 'completed', merged_sha: N40, conflicts: [], notes: 'merged' },
  'wave-verify:': {
    stop_reason: 'completed', build: 'passed', suite: 'passed', suite_output_tail: 'ok',
    failing_tests: [], discriminator: [], series_findings: [], notes: 'the merged head',
  },
  'record:': { stop_reason: 'recorded', path: RUN_DIR + '/state.jsonl', notes: 'appended' },
  'review:integration': { findings: [], fix_verdicts: [] },
  'code:': {
    status: 'done', worktree: 'C:/wt/w2', branch: 'wo-w2', base_sha: A40, head_sha: B40,
    commits: [{ sha: B40, subject: 'feat: w2' }], concerns: [], discovered: [], summary: 's',
  },
  'verify:': {
    stop_reason: 'completed', build: 'passed', suite: 'passed', suite_output_tail: 'ok',
    failing_tests: [],
    discriminator: [{ test_id: 'test/w2.test.js', failed_on_base: true, passes_now: true }],
    series_findings: [], notes: 'ran node --test',
  },
  'fix:': {
    status: 'done', worktree: 'C:/wt/w2', branch: 'wo-w2', base_sha: A40, head_sha: B40,
    commits: [{ sha: B40, subject: 'fix: w2' }], concerns: [], discovered: [], summary: 's',
  },
  'review:': { findings: [], fix_verdicts: [] },
  ...over,
})

const resumed = (over) => runWorkflow(WF, {
  args: { ...ARGS, resume_path: RUN_DIR },
  workflow: () => { throw new Error('a resume never surveys') },
  agent: cast(over),
})

// A W2 whose context was reworded in transit — same shape, same counts, different digest.
const paraphrasedW2 = order('W2', { deps: ['W1'], context: 'ctx, roughly' })

test('a paraphrased slice is healed by the sonnet retry, and the run continues', async () => {
  const { result, prompts, logs } = await resumed({
    'load:': (prompt, opts) => {
      const retry = /#2$/.test(opts.label || '')
      const id = (opts.label || '').replace(/^load:/, '').replace(/#\d+$/, '')
      if (id === 'W2' && !retry) return { stop_reason: 'loaded', orders: [paraphrasedW2], notes: '' }
      return cleanSlices(prompt, opts)
    },
  })

  const retry = prompts.find((p) => p.opts.label === 'load:W2#2')
  assert.ok(retry, 'a failed copy is re-fetched under a round-numbered label')
  assert.equal(retry.opts.model, 'sonnet', 'the retry is the tier raise, not the default')
  assert.ok(!prompts.some((p) => p.opts.label === 'load:W1#2'),
    'a slice that verified clean is never re-fetched')
  assert.ok(logs.some((l) => /needed the second-tier courier: W2/.test(l)),
    'a healed slice is reported, not silent')
  assert.deepEqual(result.implemented.map((e) => e.id), ['W2'],
    'the healed plan carries on exactly as a clean one would')
  assert.equal(result.coverage.complete, true)
})

test('a slice that defeats both tiers halts the run, naming the order', async () => {
  const { result, prompts } = await resumed({
    'load:': (prompt, opts) => {
      const id = (opts.label || '').replace(/^load:/, '').replace(/#\d+$/, '')
      if (id === 'W2') return { stop_reason: 'loaded', orders: [paraphrasedW2], notes: '' }
      return cleanSlices(prompt, opts)
    },
  })

  assert.ok(result.coverage.failed_channels.includes('run-state'))
  assert.ok(result.coverage.unreached.some((u) => /plan integrity: W2: content digest/.test(u)),
    'the halt names the order and the defect, exactly as the single loader\'s halt did')
  assert.equal(result.coverage.complete, false)
  assert.ok(!prompts.some((p) => (p.opts.label || '').startsWith('code:')),
    'nothing is dispatched against a plan that is not the plan that was written')
  assert.ok(!prompts.some((p) => p.opts.label === 'integration-setup'))
})

test('an order in the file but not in the manifest halts before any slice is fetched', async () => {
  const { result, prompts } = await resumed({
    'resume-index': index({ order_ids: ['W1', 'W2', 'W3'] }),
  })

  assert.ok(result.coverage.unreached.some((u) =>
    /W3: the loaded plan carries an order the manifest never covered/.test(u)))
  assert.ok(!prompts.some((p) => (p.opts.label || '').startsWith('load:')),
    'the id sets disagree, so no courier is paid for — the fan never opens')
})

test('a wrong change halts on the index alone — the fan never opens for feature B', async () => {
  const { result, prompts } = await resumed({
    'resume-index': index({ envelope: envelope({ change: 'a different change entirely' }) }),
  })

  assert.match(result.coverage.unreached.join(' '), /written for a different change/)
  assert.ok(!prompts.some((p) => (p.opts.label || '').startsWith('load:')),
    'fetching every order of the wrong plan is the spend the early comparison withholds')
})

test('a slice missing from the file survives one retry, then halts as not carried', async () => {
  // The index's id list said W2 exists; the courier cannot find it. Both facts travel: the
  // retry gives a flaky read its second chance, and the halt carries the courier's own note.
  const { result, prompts } = await resumed({
    'load:': (prompt, opts) => {
      const id = (opts.label || '').replace(/^load:/, '').replace(/#\d+$/, '')
      if (id === 'W2') return { stop_reason: 'not_found', orders: [], notes: 'no order W2 in plan.json' }
      return cleanSlices(prompt, opts)
    },
  })

  assert.ok(prompts.some((p) => p.opts.label === 'load:W2#2'))
  assert.ok(result.coverage.unreached.some((u) => /W2: no order W2 in plan\.json/.test(u)))
  assert.equal(result.coverage.complete, false)
})


// ── the index's own ladder ──────────────────────────────────────────────────────────────
//
// The fan bounded every ORDER by its own size, but the index that opens the fan was still
// dispatched once at the frontmatter tier with nothing checking what came back. Seen three
// times running on one repo in 2026-08: the courier damaged the escaping in `partition_raw`,
// which carries no digest, so it parsed as "no waves" and the run degraded to "every order is
// coupled" — handing four orders that were already built, reviewed and merged back to the
// session to be reimplemented. The third attempt lost the index outright. The index now gets
// the same ladder its slices have, and `partition_raw` gets the one check it can be given
// without a stored digest: the waves plus the coupled list must name every order, once each.

const firstTierFails = (broken) => (prompt, opts) =>
  /#2$/.test(opts.label || '') ? index() : index(broken)

test('a partition mangled in transit is healed by the retry, not treated as no waves', async () => {
  // `{\"waves\":[[\"W1\"]` — escaping damage, the exact shape observed in the field.
  const { result, prompts, logs } = await resumed({
    'resume-index': firstTierFails({ partition_raw: '{\\"waves\\":[[\\"W1\\"]' }),
  })

  assert.ok(prompts.some((p) => p.opts.label === 'resume-index#2'),
    'the damaged copy must buy a second tier rather than a degraded run')
  assert.ok(!result.coverage.failed_channels.includes('partition'),
    'a healed partition is not a failed channel')
  assert.match(logs.join(' '), /did not survive the trip/)
})

test('a partition the CLI refused is carried intact, never retried as if it were damage', async () => {
  // A refusal is the partition working: a dependency cycle, a dep naming no order. Retrying
  // it one tier up buys the same honest answer at a higher price.
  const { prompts } = await resumed({
    'resume-index': index({ partition_raw: JSON.stringify({ error: 'dependency cycle W1 -> W2 -> W1' }) }),
  })

  assert.ok(!prompts.some((p) => p.opts.label === 'resume-index#2'),
    'a planning defect is not a transcription defect')
})

test('an index no tier can carry halts, and never reports the plan as all-coupled', async () => {
  const { result } = await resumed({
    'resume-index': (prompt, opts) => index({ partition_raw: 'not json at all' }),
  })

  assert.ok(result.coverage.failed_channels.includes('run-state'))
  assert.equal(result.coupled.length, 0,
    'handing every order to the session is the damage this halt exists to prevent')
  assert.ok(!result.coverage.complete)
})
