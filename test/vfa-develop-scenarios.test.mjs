// test/vfa-develop-scenarios.test.mjs — executes vfa-develop's orchestration arithmetic
// through the harness with scripted agents. Until the self-audit, no test ever RAN a
// workflow: coverage derivation, escalation routing, the checkpoint gate and the review
// loop's exit conditions were enforced by prose and regex alone. Each scenario here pins
// one of those mechanisms by observing the returned result, never the internals.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { runWorkflow, scriptedAgents } from './harness/workflow-host.mjs'

const WF = fileURLToPath(new URL('../workflows/vfa-develop.workflow.js', import.meta.url))

const A40 = 'a'.repeat(40)
const B40 = 'b'.repeat(40)
const C40 = 'c'.repeat(40)
const D40 = 'd'.repeat(40)

const ARGS = { change: 'add the thing', roots: '.', plugin_root: 'C:/plugin' }

const surveyResult = (over = {}) => ({
  question: 'q', topics: [], verdicts: [], history: null, docs: null,
  coverage: {
    complete: true, dropped: [], incomplete: [], failed_channels: [], unreached: [],
    resumable: { runId: 'r', remaining: [] },
  },
  ...over,
})

const order = (id, over = {}) => ({
  id, title: 'do ' + id, locus: ['src/' + id + '.js'], acceptance: ['builds'],
  context: 'ctx', deps: [], contract: false, ...over,
})

const plan = (orders, over = {}) => ({
  work_orders: orders,
  shared_files: [],
  partition_raw: JSON.stringify({ waves: [orders.map((o) => o.id)], coupled: [] }),
  blocking_gaps: [],
  notes: '',
  ...over,
})

const coded = (over = {}) => ({
  status: 'done', worktree: 'C:/wt/w1', branch: 'wo-w1', base_sha: A40, head_sha: B40,
  commits: [{ sha: B40, subject: 'feat: w1' }], concerns: [], discovered: [], summary: 's',
  ...over,
})

const verified = (over = {}) => ({
  stop_reason: 'completed', build: 'passed', suite: 'passed', suite_output_tail: 'ok',
  discriminator: [{ test_id: 'test/w1.test.js', failed_on_base: true, passes_now: true }],
  series_findings: [], notes: 'ran node --test', ...over,
})

const reviewed = (over = {}) => ({ findings: [], fix_verdicts: [], ...over })

const happyAgents = () => scriptedAgents({
  plan: plan([order('W1')]),
  'code:': coded(),
  'verify:': verified(),
  'fix:': coded(),
  'review:': reviewed(),
})

// --- the baseline: one order, verified, reviewed clean --------------------------------------

test('a clean single-order run implements it with complete coverage', async () => {
  const { result } = await runWorkflow(WF, {
    args: ARGS, agent: happyAgents(), workflow: () => surveyResult(),
  })

  assert.equal(result.implemented.length, 1)
  assert.equal(result.implemented[0].id, 'W1')
  assert.deepEqual(result.implemented[0].review.measured, ['build', 'suite', 'discriminator:1'])
  assert.deepEqual(result.escalations, [])
  assert.equal(result.checkpoint, null)
  assert.equal(result.coverage.complete, true)
})

test('the generated prompts carry the load-bearing clauses', async () => {
  const { prompts } = await runWorkflow(WF, {
    args: ARGS, agent: happyAgents(), workflow: () => surveyResult(),
  })

  const byLabel = (l) => prompts.find((p) => p.opts.label === l).prompt
  assert.match(byLabel('plan'), /blocking_gaps/)
  assert.match(byLabel('plan'), /deps/)
  assert.match(byLabel('plan'), /contract/)
  assert.match(byLabel('verify:W1'), /absent/)
})

// --- vacuous verification is surfaced, not laundered (self-audit P0) ------------------------

test('verification that measured nothing keeps coverage incomplete and says so', async () => {
  // The field case: a docs-only order in a repo with no build, no suite, no tests. The
  // old booleans let this ship as verified; now emptiness is a carried fact.
  const { result } = await runWorkflow(WF, {
    args: ARGS,
    agent: scriptedAgents({
      plan: plan([order('W1')]),
      'code:': coded(),
      'verify:': verified({ build: 'absent', suite: 'absent', discriminator: [] }),
      'review:': reviewed(),
    }),
    workflow: () => surveyResult(),
  })

  assert.equal(result.implemented.length, 1)
  assert.deepEqual(result.implemented[0].review.measured, [])
  assert.equal(result.coverage.complete, false)
  assert.ok(result.coverage.unreached.some((u) => /mechanically measurable/.test(u)))
})

// --- the evidence checkpoint (F12) ----------------------------------------------------------

test('blocking_gaps withholds dispatch and returns the plan as a checkpoint', async () => {
  const planned = plan([order('W1')], {
    blocking_gaps: ['latest-tooling-versions — WO-1 pins versions against it'],
  })
  const { result, prompts } = await runWorkflow(WF, {
    args: ARGS,
    agent: scriptedAgents({ plan: planned }),
    workflow: () => surveyResult({ coverage: {
      complete: false, dropped: [], incomplete: ['latest-tooling-versions'],
      failed_channels: [], unreached: [], resumable: { runId: 'r', remaining: [] },
    } }),
  })

  assert.ok(result.checkpoint)
  assert.deepEqual(result.checkpoint.preplanned, planned)
  assert.deepEqual(result.implemented, [])
  assert.deepEqual(result.escalations, [])
  assert.equal(result.coverage.complete, false)
  assert.ok(!prompts.some((p) => (p.opts.label || '').startsWith('code:')),
    'no coder may be dispatched past the checkpoint')
})

// --- survey failure classes stay distinguishable (F4 + self-audit relabel) ------------------

test('a survey that resolves under neither name stops the run before planning', async () => {
  const { result, prompts } = await runWorkflow(WF, {
    args: ARGS,
    agent: scriptedAgents({}),
    workflow: (name) => { throw new Error(`Workflow "${name}" not found. Available: x`) },
  })

  assert.deepEqual(result.work_orders, [])
  assert.deepEqual(result.coverage.failed_channels, ['survey'])
  assert.ok(/broken reference/.test(result.coverage.unreached[0]))
  assert.equal(prompts.length, 0, 'planning must not proceed on a broken survey reference')
})

test('a survey that throws mid-run degrades, labeled as a throw, and planning continues', async () => {
  const { result } = await runWorkflow(WF, {
    args: ARGS,
    agent: happyAgents(),
    workflow: () => { throw new Error('socket hang up') },
  })

  assert.ok(result.survey_coverage.failed_channels.includes('survey'))
  assert.match(result.survey_coverage.unreached[0], /threw before returning: socket hang up/)
  assert.equal(result.implemented.length, 1, 'IRON LAW §5: the run continues, degraded')
  assert.equal(result.coverage.complete, false)
})

// --- partition failure labels (self-audit relabel) ------------------------------------------

test('a partition that refused the plan is labeled a planning defect, with full coupled bodies', async () => {
  const { result } = await runWorkflow(WF, {
    args: ARGS,
    agent: scriptedAgents({
      plan: plan([order('W1')], {
        partition_raw: '{"error":"partition: dependency cycle involving W1"}',
      }),
    }),
    workflow: () => surveyResult(),
  })

  assert.equal(result.coupled.length, 1)
  assert.equal(result.coupled[0].title, 'do W1', 'coupled carries the order body, not a bare id')
  assert.ok(result.coverage.failed_channels.includes('partition'))
  assert.ok(result.coverage.unreached.some((u) => /refused the plan/.test(u)))
  assert.ok(!result.coverage.unreached.some((u) => /not JSON/.test(u)))
})

test('an unparseable partition_raw is labeled a paraphrase, not a refusal', async () => {
  const { result } = await runWorkflow(WF, {
    args: ARGS,
    agent: scriptedAgents({
      plan: plan([order('W1')], { partition_raw: 'two waves, no coupling' }),
    }),
    workflow: () => surveyResult(),
  })

  assert.ok(result.coverage.unreached.some((u) => /not JSON/.test(u)))
  assert.ok(!result.coverage.unreached.some((u) => /refused the plan/.test(u)))
})

// --- escalation routing ---------------------------------------------------------------------

test('a stalled verify fix round escalates as verify_failed_repeatedly with a verify trail', async () => {
  const { result } = await runWorkflow(WF, {
    args: ARGS,
    agent: scriptedAgents({
      plan: plan([order('W1')]),
      'code:': coded(),
      'verify:': verified({ build: 'failed' }),
      'fix:': coded({ status: 'blocked', commits: [], summary: 'cannot fix the build' }),
    }),
    workflow: () => surveyResult(),
  })

  assert.equal(result.escalations.length, 1)
  assert.equal(result.escalations[0].reason, 'verify_failed_repeatedly')
  const verifyRounds = result.escalations[0].trail.filter((t) => t.kind === 'verify')
  assert.ok(verifyRounds.length >= 1, 'failed verify rounds must appear in the trail')
  assert.ok(verifyRounds[0].findings.some((f) => f.id === 'W1-build'))
  assert.equal(result.coverage.complete, false)
})

test('a schema-whole but semantically impossible coder result escalates as incoherent_result', async () => {
  const { result } = await runWorkflow(WF, {
    args: ARGS,
    agent: scriptedAgents({
      plan: plan([order('W1')]),
      'code:': coded({ status: 'done', commits: [] }),
    }),
    workflow: () => surveyResult(),
  })

  assert.equal(result.escalations.length, 1)
  assert.equal(result.escalations[0].reason, 'incoherent_result')
  assert.match(result.escalations[0].unresolved[0].claim, /no commits/)
})

test('the same finding ruled unfixed in two consecutive rounds escalates as review_not_converging', async () => {
  const F1 = { id: 'F1', severity: 'critical', file: 'src/W1.js', line: 3,
               claim: 'off by one', evidence: 'the loop bound' }
  const { result } = await runWorkflow(WF, {
    args: ARGS,
    agent: scriptedAgents({
      plan: plan([order('W1')]),
      'code:': coded(),
      'verify:': verified(),
      'review:': (prompt, opts) =>
        opts.label.endsWith('#1')
          ? reviewed({ findings: [F1] })
          : reviewed({ fix_verdicts: [{ id: 'F1', status: 'not_fixed' }] }),
      'fix:': (prompt, opts) =>
        opts.label.endsWith('#1')
          ? coded({ commits: [{ sha: C40, subject: 'fix: f1' }], head_sha: C40 })
          : coded({ commits: [{ sha: D40, subject: 'fix: f1 again' }], head_sha: D40 }),
    }),
    workflow: () => surveyResult(),
  })

  assert.equal(result.escalations.length, 1)
  assert.equal(result.escalations[0].reason, 'review_not_converging')
  assert.ok(result.escalations[0].unresolved.some((f) => f.id === 'F1'))
  assert.equal(result.escalations[0].trail.filter((t) => t.kind === 'review').length, 3)
})

// --- contract orders: majors block (F7) -----------------------------------------------------

test('a major blocks a contract order and is driven through a fix round', async () => {
  const M1 = { id: 'M1', severity: 'major', file: 'src/W1.js', line: 1,
               claim: 'TapTarget defined twice', evidence: 'sections disagree' }
  const { result, prompts } = await runWorkflow(WF, {
    args: ARGS,
    agent: scriptedAgents({
      plan: plan([order('W1', { contract: true })]),
      'code:': coded(),
      'verify:': verified(),
      'review:': (prompt, opts) =>
        opts.label.endsWith('#1')
          ? reviewed({ findings: [M1] })
          : reviewed({ fix_verdicts: [{ id: 'M1', status: 'fixed' }] }),
      'fix:': coded({ commits: [{ sha: C40, subject: 'fix: unify' }], head_sha: C40 }),
    }),
    workflow: () => surveyResult(),
  })

  assert.equal(result.implemented.length, 1)
  assert.equal(result.coverage.complete, true)
  const round1 = prompts.find((p) => p.opts.label === 'review:W1#1')
  assert.match(round1.prompt, /This order is a CONTRACT/)
  assert.ok(prompts.some((p) => p.opts.label === 'fix:W1#1'),
    'the major must have triggered a fix round')
})

test('a major does not loop a non-contract order — it ships to the gate as an open major', async () => {
  const M1 = { id: 'M1', severity: 'major', file: 'src/W1.js', line: 1,
               claim: 'edge case', evidence: 'x' }
  const { result, prompts } = await runWorkflow(WF, {
    args: ARGS,
    agent: scriptedAgents({
      plan: plan([order('W1')]),
      'code:': coded(),
      'verify:': verified(),
      'review:': reviewed({ findings: [M1] }),
    }),
    workflow: () => surveyResult(),
  })

  assert.equal(result.implemented.length, 1)
  assert.equal(result.implemented[0].review.open_majors.length, 1)
  assert.ok(!prompts.some((p) => (p.opts.label || '').startsWith('fix:')))
  const round1 = prompts.find((p) => p.opts.label === 'review:W1#1')
  assert.ok(!/This order is a CONTRACT/.test(round1.prompt))
})
