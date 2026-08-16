// test/vfa-develop-scenarios.test.mjs — executes vfa-develop's orchestration arithmetic
// through the harness with scripted agents. Until the self-audit, no test ever RAN a
// workflow: coverage derivation, escalation routing, the checkpoint gate and the review
// loop's exit conditions were enforced by prose and regex alone. Each scenario here pins
// one of those mechanisms by observing the returned result, never the internals.
//
// The wave loop added a second family: the integration worktree, the merge run, the
// post-merge verification, the dependency gate that produces `blocked`, and resume by
// reference with its content digest. Those are the parts a reader cannot check by reading —
// they are arithmetic over what agents returned, and only running them proves anything.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { runWorkflow, scriptedAgents } from './harness/workflow-host.mjs'
import { manifestOf } from '../lib/plan-digest.mjs'

const WF = fileURLToPath(new URL('../workflows/vfa-develop.workflow.js', import.meta.url))

const A40 = 'a'.repeat(40)
const B40 = 'b'.repeat(40)
const C40 = 'c'.repeat(40)
const D40 = 'd'.repeat(40)
const M40 = 'e'.repeat(40)   // a merge commit
const N40 = 'f'.repeat(40)   // the next merge commit

const RUN_DIR = 'C:/repo/.claude/vfa/runs/20260816-143005'

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

/** One wave holding every order, unless `waves` is overridden. */
const plan = (orders, over = {}) => ({
  work_orders: orders,
  shared_files: [],
  partition_raw: JSON.stringify({ waves: [orders.map((o) => o.id)], coupled: [] }),
  blocking_gaps: [],
  plan_path: RUN_DIR,
  notes: '',
  ...over,
})

/** A plan whose partition lays the orders out one per wave, in the order given. */
const wavedPlan = (orders, waves, over = {}) =>
  plan(orders, { partition_raw: JSON.stringify({ waves, coupled: [] }), ...over })

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

const setUp = (over = {}) => ({
  stop_reason: 'completed', worktree: 'C:/repo/.claude/worktrees/vfa-20260816-143005-integration',
  branch: 'vfa/20260816-143005-integration', head_sha: A40, notes: 'created', ...over,
})

const merged = (sha = M40, over = {}) => ({
  stop_reason: 'completed', merged_sha: sha, conflicts: [], notes: 'git merge --no-ff', ...over,
})

const recorded = (over = {}) => ({ stop_reason: 'recorded', path: RUN_DIR + '/state.jsonl',
                                   notes: 'appended', ...over })

// A merge counter, so a multi-wave scenario advances the head the way a real run does.
const mergeSequence = (shas) => {
  let i = 0
  return () => merged(shas[Math.min(i++, shas.length - 1)])
}

// The full integration cast. `review:integration` is listed BEFORE the `review:` prefix on
// purpose — scriptedAgents takes the first key that matches, and the prefix would otherwise
// swallow the integration review and feed it a per-order reviewer's answer.
const integrationCast = (over = {}) => ({
  'integration-setup': setUp(),
  'merge:': merged(),
  'wave-verify:': verified({ discriminator: [], notes: 'built and tested the merged head' }),
  'record:': recorded(),
  'review:integration': reviewed(),
  ...over,
})

const happyAgents = (over = {}) => scriptedAgents({
  plan: plan([order('W1')]),
  ...integrationCast(),
  'code:': coded(),
  'verify:': verified(),
  'fix:': coded(),
  'review:': reviewed(),
  ...over,
})

const run = (opts) => runWorkflow(WF, { args: ARGS, workflow: () => surveyResult(), ...opts })

/** Every incomplete result must name something to resume — IRON LAW §6's other half. */
const assertResumableWhenIncomplete = (result) => {
  if (result.coverage.complete) return
  assert.ok(result.coverage.resumable.remaining.length > 0,
    'coverage.complete is false but resumable.remaining is empty: a halt that names nothing ' +
    'to resume is a loud stop without the resumable half of IRON LAW §6')
}

// --- the baseline: one order, verified, reviewed, merged, integration-verified ------------

test('a clean single-order run implements it, merges it, and reports complete coverage', async () => {
  const { result } = await run({ agent: happyAgents() })

  assert.equal(result.implemented.length, 1)
  assert.equal(result.implemented[0].id, 'W1')
  assert.deepEqual(result.implemented[0].review.measured, ['build', 'suite', 'discriminator:1'])
  assert.deepEqual(result.escalations, [])
  assert.deepEqual(result.blocked, [])
  assert.equal(result.checkpoint, null)
  assert.deepEqual(result.integration.merged, ['W1'])
  assert.equal(result.integration.head_sha, M40)
  assert.equal(result.integration.merge_stopped_at, null)
  assert.deepEqual(result.integration.wave_verify, [{ wave: 1, build: 'passed', suite: 'passed' }])
  assert.equal(result.coverage.complete, true)
})

test('the generated prompts carry the load-bearing clauses', async () => {
  const { prompts } = await run({ agent: happyAgents() })

  const byLabel = (l) => prompts.find((p) => p.opts.label === l).prompt
  assert.match(byLabel('plan'), /blocking_gaps/)
  assert.match(byLabel('plan'), /deps/)
  assert.match(byLabel('plan'), /contract/)
  assert.match(byLabel('plan'), /plan-digest\.mjs/)
  assert.match(byLabel('verify:W1'), /absent/)
  assert.match(byLabel('wave-verify:1'), /empty arrays/)
  assert.match(byLabel('merge:W1'), /NEVER resolve a conflict/)
  assert.match(byLabel('review:integration'), /only exists once they are together/)
})

test('the plan is persisted and its path travels in the result', async () => {
  const { result } = await run({ agent: happyAgents() })
  assert.equal(result.plan_path, RUN_DIR)
})

test('a planner that persisted nothing degrades the run-state channel, loudly', async () => {
  const { result } = await run({
    agent: happyAgents({ plan: plan([order('W1')], { plan_path: '' }) }),
  })

  assert.equal(result.plan_path, '')
  assert.ok(result.coverage.failed_channels.includes('run-state'))
  assert.ok(result.coverage.unreached.some((u) => /no plan_path/.test(u)))
  assert.equal(result.coverage.complete, false)
})

// --- vacuous verification is surfaced, not laundered (self-audit P0) ----------------------

test('verification that measured nothing keeps coverage incomplete and names the order', async () => {
  // The field case: a docs-only order in a repo with no build, no suite, no tests. The
  // old booleans let this ship as verified; now emptiness is a carried fact — and the
  // order's id reaches `remaining`, so the incomplete verdict points at something.
  const { result } = await run({
    agent: happyAgents({ 'verify:': verified({ build: 'absent', suite: 'absent', discriminator: [] }) }),
  })

  assert.equal(result.implemented.length, 1)
  assert.deepEqual(result.implemented[0].review.measured, [])
  assert.equal(result.coverage.complete, false)
  assert.ok(result.coverage.unreached.some((u) => /mechanically measurable/.test(u)))
  assert.ok(result.coverage.resumable.remaining.includes('W1'))
  assertResumableWhenIncomplete(result)
})

// --- the evidence checkpoint (F12), now by reference rather than by echo ------------------

test('blocking_gaps withholds dispatch and hands back the path, not the plan', async () => {
  const planned = plan([order('W1')], {
    blocking_gaps: ['latest-tooling-versions — WO-1 pins versions against it'],
  })
  const { result, prompts } = await run({
    agent: scriptedAgents({ plan: planned }),
    workflow: () => surveyResult({ coverage: {
      complete: false, dropped: [], incomplete: ['latest-tooling-versions'],
      failed_channels: [], unreached: [], resumable: { runId: 'r', remaining: [] },
    } }),
  })

  assert.ok(result.checkpoint)
  assert.equal(result.checkpoint.resume_path, RUN_DIR)
  assert.deepEqual(result.checkpoint.blocking_gaps, planned.blocking_gaps)
  assert.deepEqual(result.implemented, [])
  assert.equal(result.coverage.complete, false)
  assert.ok(!prompts.some((p) => (p.opts.label || '').startsWith('code:')),
    'no coder may be dispatched past the checkpoint')
  assert.ok(!prompts.some((p) => p.opts.label === 'integration-setup'),
    'no worktree is created for a run that was withheld')
  assertResumableWhenIncomplete(result)
})

test('a checkpoint with no persisted plan says a re-invocation must re-plan', async () => {
  const { result } = await run({
    agent: scriptedAgents({
      plan: plan([order('W1')], { blocking_gaps: ['a gap'], plan_path: '' }),
    }),
  })

  assert.equal(result.checkpoint.resume_path, '')
  assert.ok(result.coverage.unreached.some((u) => /re-plan from scratch/.test(u)))
})

test('confirmed_gaps is the confirmation: the same plan dispatches', async () => {
  const { result } = await runWorkflow(WF, {
    args: { ...ARGS, confirmed_gaps: true },
    workflow: () => surveyResult(),
    agent: happyAgents({ plan: plan([order('W1')], { blocking_gaps: ['a gap'] }) }),
  })

  assert.equal(result.checkpoint, null)
  assert.equal(result.implemented.length, 1)
  assert.deepEqual(result.integration.merged, ['W1'])
})

// --- survey failure classes stay distinguishable (F4 + self-audit relabel) ----------------

test('a survey that resolves under neither name stops the run before planning', async () => {
  const { result, prompts } = await run({
    agent: scriptedAgents({}),
    workflow: (name) => { throw new Error(`Workflow "${name}" not found. Available: x`) },
  })

  assert.deepEqual(result.work_orders, [])
  assert.deepEqual(result.coverage.failed_channels, ['survey'])
  assert.ok(/broken reference/.test(result.coverage.unreached[0]))
  assert.equal(prompts.length, 0, 'planning must not proceed on a broken survey reference')
})

test('a survey that throws mid-run degrades, labeled as a throw, and planning continues', async () => {
  const { result } = await run({
    agent: happyAgents(),
    workflow: () => { throw new Error('socket hang up') },
  })

  assert.ok(result.survey_coverage.failed_channels.includes('survey'))
  assert.match(result.survey_coverage.unreached[0], /threw before returning: socket hang up/)
  assert.equal(result.implemented.length, 1, 'IRON LAW §5: the run continues, degraded')
  assert.equal(result.coverage.complete, false)
})

// --- partition failure labels (self-audit relabel) ----------------------------------------

test('a partition that refused the plan is labeled a planning defect, with full coupled bodies', async () => {
  const { result } = await run({
    agent: scriptedAgents({
      plan: plan([order('W1')], {
        partition_raw: '{"error":"partition: dependency cycle involving W1"}',
      }),
    }),
  })

  assert.equal(result.coupled.length, 1)
  assert.equal(result.coupled[0].title, 'do W1', 'coupled carries the order body, not a bare id')
  assert.ok(result.coverage.failed_channels.includes('partition'))
  assert.ok(result.coverage.unreached.some((u) => /refused the plan/.test(u)))
  assert.ok(!result.coverage.unreached.some((u) => /not JSON/.test(u)))
})

test('an unparseable partition_raw is labeled a paraphrase, not a refusal', async () => {
  const { result } = await run({
    agent: scriptedAgents({
      plan: plan([order('W1')], { partition_raw: 'two waves, no coupling' }),
    }),
  })

  assert.ok(result.coverage.unreached.some((u) => /not JSON/.test(u)))
  assert.ok(!result.coverage.unreached.some((u) => /refused the plan/.test(u)))
})

// --- escalation routing --------------------------------------------------------------------

test('a stalled verify fix round escalates as verify_failed_repeatedly with a verify trail', async () => {
  const { result } = await run({
    agent: happyAgents({
      'verify:': verified({ build: 'failed' }),
      'fix:': coded({ status: 'blocked', commits: [], summary: 'cannot fix the build' }),
    }),
  })

  assert.equal(result.escalations.length, 1)
  assert.equal(result.escalations[0].reason, 'verify_failed_repeatedly')
  const verifyRounds = result.escalations[0].trail.filter((t) => t.kind === 'verify')
  assert.ok(verifyRounds.length >= 1, 'failed verify rounds must appear in the trail')
  assert.ok(verifyRounds[0].findings.some((f) => f.id === 'W1-build'))
  assert.equal(result.coverage.complete, false)
  assert.deepEqual(result.integration.merged, [], 'an escalated order is never merged')
})

test('a schema-whole but semantically impossible coder result escalates as incoherent_result', async () => {
  const { result } = await run({
    agent: happyAgents({ 'code:': coded({ status: 'done', commits: [] }) }),
  })

  assert.equal(result.escalations.length, 1)
  assert.equal(result.escalations[0].reason, 'incoherent_result')
  assert.match(result.escalations[0].unresolved[0].claim, /no commits/)
})

test('the same finding ruled unfixed in two consecutive rounds escalates as review_not_converging', async () => {
  const F1 = { id: 'F1', severity: 'critical', file: 'src/W1.js', line: 3,
               claim: 'off by one', evidence: 'the loop bound' }
  const { result } = await run({
    agent: happyAgents({
      'review:integration': reviewed(),
      'review:': (prompt, opts) =>
        opts.label.endsWith('#1')
          ? reviewed({ findings: [F1] })
          : reviewed({ fix_verdicts: [{ id: 'F1', status: 'not_fixed' }] }),
      'fix:': (prompt, opts) =>
        opts.label.endsWith('#1')
          ? coded({ commits: [{ sha: C40, subject: 'fix: f1' }], head_sha: C40 })
          : coded({ commits: [{ sha: D40, subject: 'fix: f1 again' }], head_sha: D40 }),
    }),
  })

  assert.equal(result.escalations.length, 1)
  assert.equal(result.escalations[0].reason, 'review_not_converging')
  assert.ok(result.escalations[0].unresolved.some((f) => f.id === 'F1'))
  assert.equal(result.escalations[0].trail.filter((t) => t.kind === 'review').length, 3)
})

// --- contract orders: majors block (F7) ----------------------------------------------------

test('a major blocks a contract order and is driven through a fix round', async () => {
  const M1 = { id: 'M1', severity: 'major', file: 'src/W1.js', line: 1,
               claim: 'TapTarget defined twice', evidence: 'sections disagree' }
  const { result, prompts } = await run({
    agent: happyAgents({
      plan: plan([order('W1', { contract: true })]),
      'review:integration': reviewed(),
      'review:': (prompt, opts) =>
        opts.label.endsWith('#1')
          ? reviewed({ findings: [M1] })
          : reviewed({ fix_verdicts: [{ id: 'M1', status: 'fixed' }] }),
      'fix:': coded({ commits: [{ sha: C40, subject: 'fix: unify' }], head_sha: C40 }),
    }),
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
  const { result, prompts } = await run({
    agent: happyAgents({ 'review:integration': reviewed(), 'review:': reviewed({ findings: [M1] }) }),
  })

  assert.equal(result.implemented.length, 1)
  assert.equal(result.implemented[0].review.open_majors.length, 1)
  assert.ok(!prompts.some((p) => (p.opts.label || '').startsWith('fix:')))
  const round1 = prompts.find((p) => p.opts.label === 'review:W1#1')
  assert.ok(!/This order is a CONTRACT/.test(round1.prompt))
})

// --- the wave loop: all waves in one invocation ---------------------------------------------

test('every wave runs in one invocation and nothing is deferred', async () => {
  const orders = [order('W1'), order('W2', { deps: ['W1'] })]
  const { result } = await run({
    agent: happyAgents({
      plan: wavedPlan(orders, [['W1'], ['W2']]),
      'merge:': mergeSequence([M40, N40]),
    }),
  })

  assert.deepEqual(result.implemented.map((e) => e.id), ['W1', 'W2'])
  assert.deepEqual(result.implemented.map((e) => e.wave), [1, 2])
  assert.deepEqual(result.integration.merged, ['W1', 'W2'])
  assert.deepEqual(result.deferred, [], 'the whole partition runs in one invocation')
  assert.equal(result.integration.wave_verify.length, 2)
  assert.equal(result.coverage.complete, true)
})

test('a wave-2 coder is re-anchored onto the head wave 1 merged', async () => {
  const orders = [order('W1'), order('W2', { deps: ['W1'] })]
  const { prompts } = await run({
    agent: happyAgents({
      plan: wavedPlan(orders, [['W1'], ['W2']]),
      'merge:': mergeSequence([M40, N40]),
    }),
  })

  const w2 = prompts.find((p) => p.opts.label === 'code:W2').prompt
  assert.match(w2, /RE-ANCHOR FIRST/)
  assert.ok(w2.includes(M40), 'wave 2 must branch from the head wave 1 produced')
  assert.ok(w2.includes('vfa/20260816-143005-integration-W2'),
    'the order branch is derived from the integration branch with a dash, never a slash')
})

test('the wave-1 coder is re-anchored onto the integration base', async () => {
  const { prompts } = await run({ agent: happyAgents() })
  const w1 = prompts.find((p) => p.opts.label === 'code:W1').prompt

  assert.match(w1, /RE-ANCHOR FIRST/)
  assert.ok(w1.includes(A40), 'wave 1 branches from the integration worktree base')
})

test('each wave is recorded to the run state as it completes', async () => {
  const orders = [order('W1'), order('W2', { deps: ['W1'] })]
  const { prompts } = await run({
    agent: happyAgents({
      plan: wavedPlan(orders, [['W1'], ['W2']]),
      'merge:': mergeSequence([M40, N40]),
    }),
  })

  const records = prompts.filter((p) => (p.opts.label || '').startsWith('record:'))
  assert.equal(records.length, 2)
  assert.ok(records[1].prompt.includes('"merged":["W1","W2"]'))
  assert.ok(records[1].prompt.includes('"integration_head":"' + N40 + '"'))
  assert.ok(records[1].prompt.includes('"integration_base":"' + A40 + '"'))
})

test('nothing is recorded when there is no run directory to record into', async () => {
  const { prompts } = await run({
    agent: happyAgents({ plan: plan([order('W1')], { plan_path: '' }) }),
  })

  assert.ok(!prompts.some((p) => (p.opts.label || '').startsWith('record:')),
    'a recorder dispatched at no path would report a write nobody can find')
})

// --- the dependency gate: `blocked`, not `deferred` (AF-5) ----------------------------------

test('an order whose provider escalated is blocked, naming the provider', async () => {
  const orders = [order('W1'), order('W2', { deps: ['W1'] })]
  const { result, prompts } = await run({
    agent: happyAgents({
      plan: wavedPlan(orders, [['W1'], ['W2']]),
      'verify:': verified({ build: 'failed' }),
      'fix:': coded({ status: 'blocked', commits: [], summary: 'cannot fix' }),
    }),
  })

  assert.equal(result.escalations.length, 1)
  assert.deepEqual(result.blocked, [{ id: 'W2', blocked_by: 'W1' }])
  assert.deepEqual(result.deferred, [],
    'a blocked order must never wear the deferred label — deferred means "re-invoke and implement me"')
  assert.ok(!prompts.some((p) => p.opts.label === 'code:W2'),
    'a blocked order is not dispatched at all')
  assert.ok(result.coverage.unreached.some((u) => /W2: blocked — W1 did not land/.test(u)))
  assert.ok(result.coverage.resumable.remaining.includes('W2'))
  assert.equal(result.coverage.complete, false)
  assertResumableWhenIncomplete(result)
})

test('a blocked chain names the escalated root, not the nearest link', async () => {
  const orders = [order('W1'), order('W2', { deps: ['W1'] }), order('W3', { deps: ['W2'] })]
  const { result } = await run({
    agent: happyAgents({
      plan: wavedPlan(orders, [['W1'], ['W2'], ['W3']]),
      'verify:': verified({ build: 'failed' }),
      'fix:': coded({ status: 'blocked', commits: [], summary: 'cannot fix' }),
    }),
  })

  assert.deepEqual(result.blocked, [
    { id: 'W2', blocked_by: 'W1' },
    { id: 'W3', blocked_by: 'W1' },
  ])
})

test('an independent order in a later wave still runs while another is blocked', async () => {
  // IRON LAW §7 is "escalate, never abandon". Abandoning work that depends on nothing
  // broken, because something else broke, is exactly that.
  const orders = [order('W1'), order('W2', { deps: ['W1'] }), order('W3')]
  const { result } = await run({
    agent: happyAgents({
      plan: wavedPlan(orders, [['W1'], ['W2', 'W3']]),
      'verify:': (prompt) => prompt.includes('WORK ORDER W1')
        ? verified({ build: 'failed' })
        : verified(),
      'fix:': coded({ status: 'blocked', commits: [], summary: 'cannot fix' }),
    }),
  })

  assert.deepEqual(result.blocked, [{ id: 'W2', blocked_by: 'W1' }])
  assert.deepEqual(result.implemented.map((e) => e.id), ['W3'])
  assert.deepEqual(result.integration.merged, ['W3'])
})

// --- stop-the-line: merges and post-merge verification (AF-1) --------------------------------

test('a merge conflict stops the line and defers what has not run', async () => {
  const orders = [order('W1'), order('W2', { deps: ['W1'] })]
  const { result, prompts } = await run({
    agent: happyAgents({
      plan: wavedPlan(orders, [['W1'], ['W2']]),
      'merge:': merged('', { conflicts: ['src/W1.js'] }),
    }),
  })

  assert.deepEqual(result.integration.merged, [])
  assert.deepEqual(result.integration.merge_stopped_at, { order: 'W1', conflicts: ['src/W1.js'] })
  assert.deepEqual(result.integration.approved_unmerged, ['W1'])
  assert.deepEqual(result.deferred, ['W2'])
  assert.ok(!prompts.some((p) => p.opts.label === 'code:W2'))
  assert.ok(result.coverage.unreached.some((u) => /planner defect/.test(u)))
  assert.ok(result.coverage.resumable.remaining.includes('W1'))
  assert.equal(result.coverage.complete, false)
  assertResumableWhenIncomplete(result)
})

test('an environment_broken merge with no conflicts is still not a merge', async () => {
  // mergeOk reads all three fields. Reading `conflicts` alone would wave this through — an
  // environment_broken merge has an empty conflict list too.
  const { result } = await run({
    agent: happyAgents({
      'merge:': { stop_reason: 'environment_broken', merged_sha: '', conflicts: [],
                  notes: 'git refused: index.lock exists' },
    }),
  })

  assert.deepEqual(result.integration.merged, [])
  assert.equal(result.integration.merge_stopped_at.order, 'W1')
  assert.equal(result.coverage.complete, false)
})

test('a merged head that fails its own verification stops the line', async () => {
  // Nothing in wave 1 failed; the COMBINATION did. Without this check wave 2 inherits the
  // breakage and reports it as its own orders' defects.
  const orders = [order('W1'), order('W2', { deps: ['W1'] })]
  const { result, prompts } = await run({
    agent: happyAgents({
      plan: wavedPlan(orders, [['W1'], ['W2']]),
      'wave-verify:': verified({ suite: 'failed', discriminator: [], notes: 'suite failed at the merged head' }),
    }),
  })

  assert.deepEqual(result.integration.merged, ['W1'], 'the merge itself completed')
  assert.deepEqual(result.integration.wave_verify, [{ wave: 1, build: 'passed', suite: 'failed' }])
  assert.deepEqual(result.deferred, ['W2'])
  assert.ok(!prompts.some((p) => p.opts.label === 'code:W2'))
  assert.ok(result.coverage.unreached.some((u) => /defect in the combination/.test(u)))
  assert.equal(result.coverage.complete, false)
  assertResumableWhenIncomplete(result)
})

test('the integration worktree failing to appear dispatches nothing at all', async () => {
  const { result, prompts } = await run({
    agent: happyAgents({
      'integration-setup': setUp({ stop_reason: 'environment_broken', worktree: '', branch: '',
                                   head_sha: '', notes: 'path exists as a file' }),
    }),
  })

  assert.deepEqual(result.implemented, [])
  assert.deepEqual(result.deferred, ['W1'])
  assert.ok(!prompts.some((p) => (p.opts.label || '').startsWith('code:')),
    'implementing with nowhere to merge would strand every branch')
  assert.ok(result.coverage.failed_channels.includes('integration'))
  assert.equal(result.coverage.complete, false)
  assertResumableWhenIncomplete(result)
})

// --- the optional per-wave gate --------------------------------------------------------------

test('pause_between_waves returns after a wave with the rest deferred', async () => {
  const orders = [order('W1'), order('W2', { deps: ['W1'] })]
  const { result, prompts } = await runWorkflow(WF, {
    args: { ...ARGS, pause_between_waves: true },
    workflow: () => surveyResult(),
    agent: happyAgents({ plan: wavedPlan(orders, [['W1'], ['W2']]) }),
  })

  assert.deepEqual(result.integration.merged, ['W1'])
  assert.deepEqual(result.deferred, ['W2'])
  assert.ok(!prompts.some((p) => p.opts.label === 'code:W2'))
  assert.equal(result.coverage.complete, false)
  assertResumableWhenIncomplete(result)
})

test('pausing is opt-in: the default runs every wave', async () => {
  const orders = [order('W1'), order('W2', { deps: ['W1'] })]
  const { result } = await run({
    agent: happyAgents({
      plan: wavedPlan(orders, [['W1'], ['W2']]),
      'merge:': mergeSequence([M40, N40]),
    }),
  })

  assert.deepEqual(result.deferred, [])
  assert.deepEqual(result.integration.merged, ['W1', 'W2'])
})

// --- the integration review ------------------------------------------------------------------

test('an integration critical keeps coverage incomplete and names something to resume', async () => {
  const F9 = { id: 'F9', severity: 'critical', file: 'src/W1.js', line: 4,
               claim: 'W1 and W2 define the same symbol differently', evidence: 'both diffs' }
  const { result } = await run({
    agent: happyAgents({ 'review:integration': reviewed({ findings: [F9] }) }),
  })

  assert.equal(result.integration.review.findings.length, 1)
  assert.equal(result.coverage.complete, false)
  assert.ok(result.coverage.unreached.some((u) => /integration review \[F9\]/.test(u)))
  assert.ok(result.coverage.resumable.remaining.includes('integration'))
  assertResumableWhenIncomplete(result)
})

test('an integration review that did not run is an unsupported claim, not a pass', async () => {
  const { result } = await run({
    agent: happyAgents({ 'review:integration': () => { throw new Error('budget') } }),
  })

  assert.equal(result.integration.review, null)
  assert.ok(result.coverage.failed_channels.includes('integration-review'))
  assert.ok(result.coverage.unreached.some((u) => /unsupported/.test(u)))
  assert.equal(result.coverage.complete, false)
  assertResumableWhenIncomplete(result)
})

test('nothing merged means no integration review is dispatched', async () => {
  const { prompts } = await run({
    agent: happyAgents({
      'verify:': verified({ build: 'failed' }),
      'fix:': coded({ status: 'blocked', commits: [], summary: 'cannot fix' }),
    }),
  })

  assert.ok(!prompts.some((p) => p.opts.label === 'review:integration'))
})

// --- resume by reference (B2) -----------------------------------------------------------------

const loadedPlan = (orders, over = {}) => ({
  work_orders: orders,
  shared_files: [],
  partition_raw: JSON.stringify({ waves: [['W1'], ['W2']], coupled: [] }),
  blocking_gaps: [],
  plan_path: RUN_DIR,
  notes: '',
  ...over,
})

const loaded = (orders, over = {}) => ({
  stop_reason: 'loaded',
  plan: loadedPlan(orders),
  manifest: manifestOf(orders),
  state: [{ wave: 1, merged: ['W1'], approved_unmerged: [], escalated: [],
            integration_base: A40, integration_head: M40 }],
  notes: 'read plan.json and one state entry',
  ...over,
})

test('a resumed run skips the survey and the planner entirely', async () => {
  const orders = [order('W1'), order('W2', { deps: ['W1'] })]
  let surveyCalls = 0

  const { result, prompts } = await runWorkflow(WF, {
    args: { ...ARGS, resume_path: RUN_DIR },
    workflow: () => { surveyCalls += 1; return surveyResult() },
    agent: happyAgents({
      'resume-load': loaded(orders),
      'integration-setup': setUp({ head_sha: M40 }),
      'merge:': merged(N40),
    }),
  })

  assert.equal(surveyCalls, 0, 'the survey is the expensive half a resume exists to skip')
  assert.ok(!prompts.some((p) => p.opts.label === 'plan'))
  assert.equal(result.plan_path, RUN_DIR)
  assert.deepEqual(result.implemented.map((e) => e.id), ['W2'],
    'an order the run state records as merged is not implemented again')
  assert.deepEqual(result.integration.merged, ['W2'])
  assert.equal(result.coverage.complete, true)
})

test('a resumed run reviews the whole change, not only the waves it ran', async () => {
  const orders = [order('W1'), order('W2', { deps: ['W1'] })]
  const { prompts } = await runWorkflow(WF, {
    args: { ...ARGS, resume_path: RUN_DIR },
    workflow: () => surveyResult(),
    agent: happyAgents({
      'resume-load': loaded(orders),
      'integration-setup': setUp({ head_sha: M40 }),
      'merge:': merged(N40),
    }),
  })

  const review = prompts.find((p) => p.opts.label === 'review:integration').prompt
  assert.ok(review.includes(A40 + '..' + N40),
    'the diff under review runs from the run\'s original base, carried in the run state')
})

test('a branch that moved between invocations is reported, and the tree wins', async () => {
  const orders = [order('W1'), order('W2', { deps: ['W1'] })]
  const { result } = await runWorkflow(WF, {
    args: { ...ARGS, resume_path: RUN_DIR },
    workflow: () => surveyResult(),
    agent: happyAgents({
      'resume-load': loaded(orders),
      'integration-setup': setUp({ head_sha: C40 }),   // the state recorded M40
      'merge:': merged(N40),
    }),
  })

  assert.ok(result.coverage.unreached.some((u) => /moved between invocations/.test(u)))
  assert.ok(result.coverage.failed_channels.includes('run-state'))
  assert.equal(result.coverage.complete, false)
})

test('an unreadable run directory dispatches nothing and says to re-plan', async () => {
  const { result, prompts } = await runWorkflow(WF, {
    args: { ...ARGS, resume_path: RUN_DIR },
    workflow: () => surveyResult(),
    agent: scriptedAgents({
      'resume-load': { stop_reason: 'unreadable', plan: null, manifest: [], state: [],
                       notes: 'plan.json is not there' },
    }),
  })

  assert.deepEqual(result.implemented, [])
  assert.ok(result.coverage.failed_channels.includes('run-state'))
  assert.ok(result.coverage.unreached.some((u) => /plan afresh/.test(u)))
  assert.ok(!prompts.some((p) => p.opts.label === 'integration-setup'))
})

// --- the content digest tripwire (B3 / AF-8) ---------------------------------------------------

test('a manifest computed by lib/plan-digest.mjs is accepted by the in-script digest', async () => {
  // This is the test that pins the two implementations together. The library computes the
  // manifest; the workflow recomputes it from its own copy of the algorithm. If they ever
  // diverge, every resume halts on a mismatch that is not there — so the pin is behavioural
  // rather than a comment asking two files to stay in step.
  const orders = [order('W1'), order('W2', { deps: ['W1'], context: 'a much longer context, with punctuation: commas, colons — and a dash' })]
  const { result } = await runWorkflow(WF, {
    args: { ...ARGS, resume_path: RUN_DIR },
    workflow: () => surveyResult(),
    agent: happyAgents({
      'resume-load': loaded(orders),
      'integration-setup': setUp({ head_sha: M40 }),
      'merge:': merged(N40),
    }),
  })

  assert.equal(result.coverage.complete, true)
  assert.ok(!result.coverage.unreached.some((u) => /plan integrity/.test(u)))
})

test('a paraphrased context halts the resume, naming the order', async () => {
  // The exact corruption a count-and-ids manifest cannot see: same order count, same locus
  // count, same acceptance count, one sentence reworded.
  const orders = [order('W1'), order('W2', { deps: ['W1'] })]
  const asWritten = manifestOf(orders)
  const asRead = [order('W1'), order('W2', { deps: ['W1'], context: 'ctx, roughly' })]

  const { result, prompts } = await runWorkflow(WF, {
    args: { ...ARGS, resume_path: RUN_DIR },
    workflow: () => surveyResult(),
    agent: scriptedAgents({
      'resume-load': loaded(asRead, { manifest: asWritten }),
    }),
  })

  assert.deepEqual(result.implemented, [])
  assert.ok(result.coverage.unreached.some((u) => /plan integrity: W2: content digest/.test(u)))
  assert.ok(!prompts.some((p) => (p.opts.label || '').startsWith('code:')),
    'nothing is dispatched against a plan that is not the plan that was written')
  assert.ok(result.coverage.failed_channels.includes('run-state'))
})

test('a dropped acceptance criterion halts the resume with the shape of the damage', async () => {
  const orders = [order('W1', { acceptance: ['builds', 'tests pass'] })]
  const asRead = [order('W1', { acceptance: ['builds'] })]

  const { result } = await runWorkflow(WF, {
    args: { ...ARGS, resume_path: RUN_DIR },
    workflow: () => surveyResult(),
    agent: scriptedAgents({ 'resume-load': loaded(asRead, { manifest: manifestOf(orders) }) }),
  })

  assert.ok(result.coverage.unreached.some((u) =>
    /W1: acceptance has 1 criteria, the manifest recorded 2/.test(u)))
})

test('an order that vanished in transit halts the resume', async () => {
  const orders = [order('W1'), order('W2', { deps: ['W1'] })]

  const { result } = await runWorkflow(WF, {
    args: { ...ARGS, resume_path: RUN_DIR },
    workflow: () => surveyResult(),
    agent: scriptedAgents({
      'resume-load': loaded([order('W1')], { manifest: manifestOf(orders) }),
    }),
  })

  assert.ok(result.coverage.unreached.some((u) =>
    /W2: the manifest covers an order the loaded plan does not carry/.test(u)))
})

// --- the integration handle survives every exit path (AF-6) -------------------------------------

test('a throw mid-run still hands back the branch that holds the finished work', async () => {
  const orders = [order('W1'), order('W2', { deps: ['W1'] })]
  let merges = 0

  const { result } = await run({
    agent: happyAgents({
      plan: wavedPlan(orders, [['W1'], ['W2']]),
      // The second merge answers with a shape no schema would pass — the point is that when
      // something DOES throw, the caller still learns which branch already holds wave 1.
      'merge:': () => (merges++ === 0 ? merged(M40) : { stop_reason: 'completed', merged_sha: N40 }),
    }),
  })

  assert.ok(result.coverage.failed_channels.includes('pipeline'))
  assert.equal(result.integration.branch, 'vfa/20260816-143005-integration')
  assert.deepEqual(result.integration.merged, ['W1'])
  assert.equal(result.integration.head_sha, M40)
  assert.ok(result.coverage.resumable.remaining.includes('integration'))
  assert.equal(result.coverage.complete, false)
  assertResumableWhenIncomplete(result)
})

test('every exit path returns the integration handle, even the ones that dispatch nothing', async () => {
  const { result } = await runWorkflow(WF, {
    args: { roots: '.', plugin_root: 'C:/plugin' },   // no change at all
    agent: scriptedAgents({}),
  })

  assert.ok(result.integration, 'the handle is part of the documented shape on every path')
  assert.deepEqual(result.integration.merged, [])
  assert.equal(result.coverage.complete, false)
})
